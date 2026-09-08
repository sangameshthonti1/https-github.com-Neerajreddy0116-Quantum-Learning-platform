"""Single-slot, memory-only jobs with supervised process termination and bounded retention.

Use one ASGI worker for this local milestone. No distributed queue or persistence.
The event-loop-owned manager never performs quantum work in the HTTP event loop.
"""

import asyncio
from dataclasses import dataclass, field
import json
import logging
import os
from pathlib import Path
import sys
from time import monotonic
from uuid import UUID

from app.schemas.variational import Evaluation, JobSnapshot, VariationalRequest, VariationalResult

logger = logging.getLogger(__name__)


class WorkerStopped(RuntimeError):
    pass


class JobError(RuntimeError):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message
        super().__init__(message)


@dataclass
class Job:
    id: UUID
    request: VariationalRequest
    created: float = field(default_factory=monotonic)
    finished: float | None = None
    status: str = "running"
    history: list[Evaluation] = field(default_factory=list)
    result: VariationalResult | None = None
    message: str | None = None
    cancel_event: asyncio.Event = field(default_factory=asyncio.Event)
    task: asyncio.Task | None = None
    process: asyncio.subprocess.Process | None = None


class VariationalJobs:
    def __init__(self, *, worker_command: tuple[str, ...] | None = None):
        # Alternate command is a server-side test seam, never accepted from HTTP.
        self.command = worker_command or (sys.executable, "-m", "app.services.variational_worker")
        self.jobs: dict[UUID, Job] = {}
        self.closed = False

    def prune(self):
        now = monotonic()
        for id, job in list(self.jobs.items()):
            if job.finished is not None and now - job.finished >= 600:
                del self.jobs[id]

    def start(self, id: UUID, request: VariationalRequest) -> JobSnapshot:
        self.prune()
        if self.closed:
            raise JobError(503, "optimization_unavailable", "The optimization service is shutting down.")
        if id in self.jobs:
            if self.jobs[id].request != request:
                raise JobError(409, "job_id_conflict", "This job ID belongs to a different experiment.")
            return self.snapshot(id)  # Idempotent retries never start a second worker.
        if any(job.task is not None and not job.task.done() for job in self.jobs.values()):
            raise JobError(429, "optimization_busy", "One optimization is already running. Cancel it or wait, then retry.")
        while len(self.jobs) >= 8:
            del self.jobs[next(iter(self.jobs))]
        job = Job(id=id, request=request.model_copy(deep=True))
        self.jobs[id] = job
        job.task = asyncio.create_task(self._supervise(job))
        return self.snapshot(id)

    def snapshot(self, id: UUID) -> JobSnapshot:
        self.prune()
        job = self.jobs.get(id)
        if job is None:
            raise JobError(404, "job_not_found", "This local job is unavailable or expired. Run the experiment again.")
        return JobSnapshot(job_id=id, status=job.status, request=job.request,
                           history=list(job.history), result=job.result, message=job.message,
                           elapsed_ms=((job.finished or monotonic()) - job.created) * 1000)

    async def cancel(self, id: UUID) -> JobSnapshot:
        self.snapshot(id)
        job = self.jobs[id]
        if job.task is not None and not job.task.done():
            job.cancel_event.set()
            # A disconnected HTTP caller must not interrupt process reaping.
            await asyncio.shield(job.task)
        return self.snapshot(id)

    async def close(self):
        self.closed = True
        for job in self.jobs.values():
            job.cancel_event.set()
        await asyncio.gather(*(job.task for job in self.jobs.values() if job.task is not None), return_exceptions=True)

    async def _execute(self, job: Job) -> VariationalResult:
        env = {**os.environ, "OMP_NUM_THREADS": "1", "OPENBLAS_NUM_THREADS": "1", "MKL_NUM_THREADS": "1"}
        spawning = asyncio.create_task(asyncio.create_subprocess_exec(
            *self.command, cwd=Path(__file__).resolve().parents[2], env=env,
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL, limit=1024 * 1024))
        try:
            job.process = await asyncio.shield(spawning)
        except asyncio.CancelledError:
            # Cancellation during spawn must still obtain the handle for cleanup.
            job.process = await spawning
            raise
        process = job.process
        process.stdin.write(job.request.model_dump_json(by_alias=True).encode())
        await process.stdin.drain()
        process.stdin.close()
        result = None
        messages = 0
        while line := await process.stdout.readline():
            messages += 1
            if messages > job.request.max_evaluations + 1:
                raise ValueError("Unexpected worker output budget")
            frame = json.loads(line)
            if frame.get("type") == "evaluation" and result is None:
                point = Evaluation.model_validate(frame["data"])
                if (point.evaluation != len(job.history) + 1 or point.evaluation > job.request.max_evaluations
                        or point.iteration > job.request.max_iterations):
                    raise ValueError("Invalid evaluation sequence")
                job.history.append(point)
            elif frame.get("type") == "result" and result is None:
                result = VariationalResult.model_validate(frame["data"])
                if (result.definition.request != job.request or result.optimization.history != job.history
                        or result.simulation.backend != job.request.backend or result.trace.backend != job.request.backend):
                    raise ValueError("Worker returned a different experiment")
            elif frame.get("type") == "stopped" and frame.get("data") in ("cancelled", "timed_out"):
                raise WorkerStopped(frame["data"])
            else:
                raise ValueError("Worker failed or returned invalid output")
        if await process.wait() != 0 or result is None:
            raise ValueError(f"Worker exited with code {process.returncode}; complete result: {result is not None}")
        return result

    async def _stop(self, process):
        if process is None or process.returncode is not None:
            return
        try:
            process.terminate()
        except ProcessLookupError:
            pass
        try:
            await asyncio.wait_for(process.communicate(), timeout=.5)
        except TimeoutError:
            try:
                process.kill()
            except ProcessLookupError:
                pass
            await process.communicate()

    async def _supervise(self, job: Job):
        execution = asyncio.create_task(self._execute(job))
        cancellation = asyncio.create_task(job.cancel_event.wait())
        status, message, result = "failed", None, None
        try:
            done, _ = await asyncio.wait(
                (execution, cancellation), return_when=asyncio.FIRST_COMPLETED,
                timeout=max(0, job.request.time_limit_seconds - (monotonic() - job.created)))
            if job.cancel_event.is_set():
                status, message = "cancelled", "Optimization cancelled; no final result was published."
            elif execution not in done:
                status, message = "timed_out", "The wall-clock limit was reached; no final result was published."
            else:
                result = execution.result()
                status = "completed"
        except asyncio.CancelledError:
            status, message = "cancelled", "The local service stopped this optimization."
        except WorkerStopped as error:
            status, message = str(error), "The optimization stopped within its execution budget; no final result was published."
        except Exception:
            logger.exception("Local variational job failed")
            status, message = "failed", "Optimization failed. Your circuit selections are unchanged; please retry."
        finally:
            execution.cancel()
            cancellation.cancel()
            await asyncio.gather(execution, cancellation, return_exceptions=True)
            await self._stop(job.process)
            job.finished = monotonic()
            job.status, job.message, job.result = status, message, result
