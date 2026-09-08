"""Admission control, real grounding, provider boundary, validated proposals."""

import asyncio
from collections import deque
from time import monotonic

from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from app.core.tutor_config import TutorSettings
from app.schemas.simulation import SimulationRequest
from app.schemas.tutor import TutorAnswer, TutorRequest, TutorResponse, ValidatedSuggestion
from app.services.qiskit_simulator import SimulationExecutionError
from app.services.tutor_context import build_context, circuit_facts
from app.services.tutor_provider import OpenAIProvider, TutorFailure, TutorProvider


class TutorService:
    def __init__(self, settings: TutorSettings, provider: TutorProvider | None = None):
        self.settings = settings
        self.provider = provider if provider is not None else OpenAIProvider(settings)
        self.active = 0
        self.admitted: deque[float] = deque()

    def admit(self):
        # Synchronous admission in the async route: no unbounded wait queue.
        if not self.settings.ready:
            raise TutorFailure("tutor_not_configured", "AI Tutor is not configured on this server. Your circuit and lessons still work. Ask the operator to configure and enable the provider.", 503)
        now = monotonic()
        while self.admitted and self.admitted[0] <= now - 60:
            self.admitted.popleft()
        if len(self.admitted) >= self.settings.requests_per_minute:
            raise TutorFailure("tutor_rate_limited", "This server's tutor request limit was reached. Please wait a minute.", 429)
        if self.active >= self.settings.max_concurrency:
            raise TutorFailure("tutor_busy", "The tutor is helping other learners. Please retry shortly.", 429)
        self.admitted.append(now)
        self.active += 1

    async def respond(self, request: TutorRequest) -> TutorResponse:
        self.admit()
        try:
            async with asyncio.timeout(self.settings.timeout_seconds):
                # Real Qiskit calculations run off the event loop, under admission.
                context, facts = await run_in_threadpool(build_context, request)
                raw = await self.provider.answer(request, context)
                answer = TutorAnswer.model_validate(raw.model_dump())
                suggestion = None
                if answer.suggestion:
                    proposal = answer.suggestion
                    source = request.circuit
                    circuit = SimulationRequest.model_validate({
                        "numQubits": proposal.num_qubits, "backend": "qiskit",
                        "shots": source.shots if source else 1024,
                        "seedSimulator": source.seed_simulator if source else 42,
                        "gates": [{"id": f"tutor-{i}", "type": gate.type, "targets": [gate.target], "controls": [] if gate.control is None else [gate.control]} for i, gate in enumerate(proposal.gates, 1)],
                    })
                    suggestion = ValidatedSuggestion(title=proposal.title, rationale=proposal.rationale, circuit=circuit, facts=await run_in_threadpool(circuit_facts, circuit, None))
                return TutorResponse(answer=answer.answer, deeper=answer.deeper, follow_up=answer.follow_up, lesson_id=request.lesson_id, facts=facts, suggestion=suggestion)
        except TimeoutError:
            raise TutorFailure("tutor_timeout", "The tutor took too long. Please retry.", 504) from None
        except ValidationError:
            raise TutorFailure("invalid_provider_response", "The tutor's answer or circuit suggestion failed validation. No changes were made. Please retry.") from None
        except SimulationExecutionError:
            raise TutorFailure("grounding_failed", "The simulator could not verify this circuit. Try tracing it again in the Lab.", 503) from None
        except TutorFailure:
            raise
        except Exception:
            raise TutorFailure("tutor_failed", "The tutor could not complete this request. Please retry.") from None
        finally:
            self.active -= 1
