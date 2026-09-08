"""Real subprocess lifecycle tests, including hung native work and shutdown cleanup."""

import asyncio
from contextlib import contextmanager
import sys
from time import monotonic, sleep
from uuid import uuid4

from fastapi.testclient import TestClient
import psutil
import pytest

from app.core.config import Settings
from app.main import create_app
from app.schemas.variational import VQERequest
from app.services.variational_jobs import VariationalJobs


def terminal(client, path, seconds=10):
    deadline = monotonic() + seconds
    while monotonic() < deadline:
        response = client.get(path)
        assert response.status_code == 200, response.text
        if response.json()['status'] != 'running':
            return response.json()
        sleep(.02)
    pytest.fail('Local worker did not finish within the test deadline')


@contextmanager
def worker_client(command=None):
    app = create_app(Settings(_env_file=None))
    app.state.variational_jobs = VariationalJobs(worker_command=command)
    with TestClient(app) as client:
        yield client


@pytest.mark.parametrize('backend',['qiskit','pennylane'])
@pytest.mark.parametrize('algorithm',['vqe','qaoa'])
def test_preview_and_real_http_job_stream_history_and_reap_worker(backend,algorithm):
    with worker_client() as client:
        body = {'algorithm':algorithm,'backend':backend,'maxEvaluations':4}
        preview = client.post('/api/variational/build',json=body)
        assert preview.status_code == 200, preview.text
        assert preview.json()['reference']['value'] < -2 if algorithm == 'vqe' else preview.json()['reference']['value'] == 1
        assert preview.json()['circuit']['backend'] == backend
        assert not client.app.state.variational_jobs.jobs
        id = uuid4(); path = f'/api/variational/jobs/{id}'
        started = client.post(path,json=body)
        assert started.status_code == 202 and started.json()['status'] == 'running'
        job = terminal(client,path)
        assert job['status'] == 'completed', job
        result = job['result']
        assert len(job['history']) == 4 and result['optimization']['history'] == job['history']
        assert result['optimization']['stoppingReason'] == 'evaluation_limit'
        assert result['definition']['request'] == job['request']
        assert result['simulation']['backend'] == result['trace']['backend'] == backend
        child = client.app.state.variational_jobs.jobs[id].process
        assert child.returncode == 0 and not psutil.pid_exists(child.pid)
        assert client.post(path,json=body).json()['result'] == result  # idempotent retry
        assert client.delete(path).json()['status'] == 'completed'


def test_admission_deduplication_real_cancellation_and_retry():
    with worker_client((sys.executable,'-c','import time; time.sleep(60)')) as client:
        body = {'algorithm':'vqe'}
        id = uuid4(); path = f'/api/variational/jobs/{id}'
        assert client.post(path,json=body).status_code == 202
        assert client.post(path,json=body).status_code == 202
        assert client.post(path,json=body|{'initializationSeed':7}).status_code == 409
        busy = client.post(f'/api/variational/jobs/{uuid4()}',json=body)
        assert busy.status_code == 429 and busy.json()['error']['code'] == 'optimization_busy'
        ended = client.delete(path)
        assert ended.status_code == 200 and ended.json()['status'] == 'cancelled'
        assert ended.json()['result'] is None
        child = client.app.state.variational_jobs.jobs[id].process
        assert child is None or (child.returncode is not None and not psutil.pid_exists(child.pid))
        assert client.delete(path).json()['status'] == 'cancelled'
        client.app.state.variational_jobs.command = (sys.executable,'-m','app.services.variational_worker')
        next_path = f'/api/variational/jobs/{uuid4()}'
        assert client.post(next_path,json=body|{'maxEvaluations':4}).status_code == 202
        assert terminal(client,next_path)['status'] == 'completed'


@pytest.mark.parametrize('ignore_term',[False,True])
def test_hard_wall_deadline_kills_and_reaps_a_hung_worker(ignore_term):
    source = ('import signal; signal.signal(signal.SIGTERM,signal.SIG_IGN); ' if ignore_term else '') + 'import time; time.sleep(60)'
    with worker_client((sys.executable,'-c',source)) as client:
        id = uuid4(); path = f'/api/variational/jobs/{id}'
        assert client.post(path,json={'algorithm':'vqe','timeLimitSeconds':1}).status_code == 202
        ended = terminal(client,path,seconds=5)
        assert ended['status'] == 'timed_out' and ended['result'] is None
        assert 1000 <= ended['elapsedMs'] < 4000
        child = client.app.state.variational_jobs.jobs[id].process
        assert child.returncode is not None and not psutil.pid_exists(child.pid)
        if ignore_term:
            assert child.returncode == -9


@pytest.mark.parametrize('source', [
    'raise RuntimeError("private-secret-path")',
    'print("not json")',
    'print("x" * (1024*1024+1))',
    'print(\'{"type":"result","data":{}}\')',
])
def test_worker_crash_or_corrupt_output_is_sanitized_and_releases_slot(source):
    with worker_client((sys.executable,'-c',source)) as client:
        id = uuid4(); path = f'/api/variational/jobs/{id}'
        assert client.post(path,json={'algorithm':'vqe'}).status_code == 202
        ended = terminal(client,path)
        assert ended['status'] == 'failed' and ended['result'] is None
        assert 'private-secret' not in str(ended)
        assert client.app.state.variational_jobs.jobs[id].process.returncode is not None


def test_application_shutdown_stops_active_process():
    with worker_client((sys.executable,'-c','import time; time.sleep(60)')) as client:
        id = uuid4(); path = f'/api/variational/jobs/{id}'
        client.post(path,json={'algorithm':'vqe'})
        manager = client.app.state.variational_jobs
        deadline = monotonic() + 3
        while manager.jobs[id].process is None and monotonic() < deadline:
            sleep(.01)
        child = manager.jobs[id].process
        assert child is not None
    assert manager.closed and child.returncode is not None and not psutil.pid_exists(child.pid)
    assert manager.jobs[id].status == 'cancelled'


@pytest.mark.parametrize('reason',['timed_out','cancelled'])
def test_cooperative_worker_stop_is_not_misreported_as_failure(reason):
    source = f'import json; print(json.dumps({{"type":"stopped","data":"{reason}"}}))'
    with worker_client((sys.executable,'-c',source)) as client:
        id = uuid4(); path = f'/api/variational/jobs/{id}'
        client.post(path,json={'algorithm':'vqe'})
        ended = terminal(client,path)
        assert ended['status'] == reason and ended['result'] is None
        assert client.app.state.variational_jobs.jobs[id].process.returncode is not None


def test_cancel_before_spawn_and_retention_are_bounded():
    async def scenario():
        manager = VariationalJobs(worker_command=(sys.executable,'-c','import time; time.sleep(60)'))
        ids = []
        for _ in range(10):
            id = uuid4(); ids.append(id)
            manager.start(id,VQERequest(algorithm='vqe'))
            assert (await manager.cancel(id)).status == 'cancelled'
        assert len(manager.jobs) == 8 and ids[0] not in manager.jobs
        manager.jobs[ids[-1]].finished -= 601
        manager.prune()
        assert ids[-1] not in manager.jobs
        await manager.close()
    asyncio.run(scenario())


@pytest.mark.parametrize('body',[{'algorithm':'fake'},{'algorithm':'vqe','backend':'fake'},
    {'algorithm':'vqe','maxEvaluations':257},{'algorithm':'vqe','initialParameters':[0]*5},
    {'algorithm':'vqe','timeLimitSeconds':31},{'algorithm':'vqe','hamiltonian':[]},
    {'algorithm':'vqe','python':'print(1)'},{'algorithm':'vqe','maxIterations':True}])
@pytest.mark.parametrize('operation',['build','jobs'])
def test_invalid_inputs_never_start_expensive_work(client,monkeypatch,body,operation):
    monkeypatch.setattr(client.app.state.variational_jobs,'start',lambda *a:pytest.fail('invalid request started'))
    path = '/api/variational/build' if operation == 'build' else f'/api/variational/jobs/{uuid4()}'
    response = client.post(path,json=body)
    assert response.status_code == 422
    assert all(set(e)=={'loc','msg','type'} for e in response.json()['detail'])


def test_catalog_and_unknown_jobs_and_uuid_validation(client):
    catalog = client.get('/api/variational').json()
    assert catalog['limits']['activeJobsPerProcess'] == 1
    assert catalog['backends'] == ['qiskit','pennylane']
    for method in (client.get,client.delete):
        assert method(f'/api/variational/jobs/{uuid4()}').status_code == 404
        assert method('/api/variational/jobs/not-a-uuid').status_code == 422


def test_variational_cors_does_not_broaden_health_permissions():
    with TestClient(create_app(Settings(_env_file=None,cors_origins=['http://localhost:5173']))) as client:
        headers = {'Origin':'http://localhost:5173','Access-Control-Request-Method':'DELETE'}
        assert client.options(f'/api/variational/jobs/{uuid4()}',headers=headers).status_code == 200
        assert client.options('/api/health',headers=headers).status_code == 400
