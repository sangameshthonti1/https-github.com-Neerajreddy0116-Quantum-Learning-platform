"""Shared validation, bounded execution, failure envelopes and grading preservation."""

import builtins
from copy import deepcopy

import numpy as np
import pytest

from app.services import pennylane_simulator as pl, simulators
from app.services.challenge_catalog import CATALOG

BODY = {'numQubits': 2, 'gates': [
    {'id': 'h', 'type': 'h', 'targets': [0], 'controls': []},
    {'id': 'cx', 'type': 'cx', 'targets': [1], 'controls': [0]},
], 'shots': 1024, 'backend': 'pennylane', 'seedSimulator': 42}
ENDPOINTS = ['/api/simulate', '/api/simulate/trace']


@pytest.mark.parametrize('endpoint', ENDPOINTS)
def test_real_http_contract_and_metadata(client, endpoint):
    response = client.post(endpoint, json=BODY)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['backend'] == 'pennylane'
    assert result['metadata']['pennylaneVersion'] == pl.qml.__version__
    assert result['metadata']['engine'] == 'pennylane.default.qubit'
    assert 'qiskitVersion' not in result['metadata'] and 'aerVersion' not in result['metadata']
    assert result['metadata']['bitOrder'] == 'q[n-1]...q[0]'
    if endpoint.endswith('trace'):
        assert result['metadata']['globalPhase'] == 'pennylane-native'
        assert result['metadata']['samplingPerformed'] is False
        assert len(result['steps']) == 3 and result['steps'][0]['gate'] is None
    else:
        assert sum(result['counts'].values()) == BODY['shots']
        assert result['probabilities'] == pytest.approx({'00':.5,'01':0,'10':0,'11':.5}, abs=1e-12, rel=0)


@pytest.mark.parametrize('endpoint', ENDPOINTS)
def test_omitted_backend_defaults_to_qiskit_and_remains_lazy(client, monkeypatch, endpoint):
    original_import = builtins.__import__
    def guarded(name, globals=None, locals=None, fromlist=(), level=0):
        if name == 'pennylane' or name.startswith('pennylane.') or 'pennylane_simulator' in (fromlist or ()):
            raise ImportError('PennyLane not installed in this failure test')
        return original_import(name, globals, locals, fromlist, level)
    monkeypatch.setattr(builtins, '__import__', guarded)
    body = deepcopy(BODY)
    del body['backend']
    response = client.post(endpoint, json=body)
    assert response.status_code == 200
    assert response.json()['backend'] == 'qiskit'
    missing = client.post(endpoint, json=BODY)
    assert missing.status_code == 500
    assert missing.json()['error']['code'] == 'simulation_failed'
    assert 'not installed' not in missing.text


INVALID = [
    {'backend': value} for value in ('', 'PennyLane', 'pennylane.default.qubit', 'default.qubit', 'aer', None, 1, True, [], {})
] + [
    {'numQubits': 0}, {'numQubits': 4}, {'numQubits': True}, {'numQubits': 2.0},
    {'shots': 0}, {'shots': 8193}, {'shots': 1.0}, {'shots': True},
    {'seedSimulator': -1}, {'seedSimulator': 2**32}, {'seedSimulator': True},
    {'gates': [dict(BODY['gates'][0], id=str(i)) for i in range(257)]},
    {'gates': [BODY['gates'][0], BODY['gates'][0]]}, {'initialState': [1, 0]},
    {'gates': [{'id':'bad','type':'x','targets':[2],'controls':[]}]},
    {'gates': [{'id':'bad','type':'cx','targets':[0],'controls':[0]}]},
    {'gates': [{'id':'bad','type':'swap','targets':[0],'controls':[]}]},
    {'gates': [{'id':'bad','type':'swap','targets':[0,0],'controls':[]}]},
    {'gates': [{'id':'bad','type':'ccx','targets':[0],'controls':[1]}]},
    {'gates': [{'id':'bad','type':'ccx','targets':[0],'controls':[1,1]}]},
    {'gates': [{'id':'bad','type':'measure','targets':[0],'controls':[]}]},
    {'gates': [{'id':'bad','type':'rzz','targets':[0,1],'controls':[],'params':[.5]}]},
    {'gates': [{'id':'bad','type':'x','targets':[0],'controls':[],'params':[.5]}]},
] + [{'gates':[{'id':'bad','type':kind,'targets':[0],'controls':[],**params}]}
     for kind in ('rx','ry','rz','p') for params in ({}, {'params':[]}, {'params':[1,2]}, {'params':['pi']}, {'params':[True]}, {'params':[None]})]


@pytest.mark.parametrize('endpoint', ENDPOINTS)
@pytest.mark.parametrize('changes', INVALID)
def test_invalid_requests_never_select_or_execute_an_adapter(client, monkeypatch, endpoint, changes):
    def forbidden(*args, **kwargs):
        pytest.fail('Validation must precede simulator selection')
    monkeypatch.setattr(simulators, 'get_simulator', forbidden)
    response = client.post(endpoint, json=BODY | changes)
    assert response.status_code == 422
    for issue in response.json()['detail']:
        assert set(issue) == {'loc','msg','type'}


@pytest.mark.parametrize('endpoint', ENDPOINTS)
@pytest.mark.parametrize('value', ['NaN', 'Infinity', '-Infinity'])
def test_nonfinite_angles_rejected_without_invalid_json_error_responses(client, endpoint, value):
    body = '{"numQubits":1,"shots":1,"backend":"pennylane","gates":[{"id":"r","type":"rx","targets":[0],"controls":[],"params":['+value+']}]}'
    response = client.post(endpoint, content=body, headers={'Content-Type':'application/json'})
    assert response.status_code == 422
    assert response.json()['detail']


@pytest.mark.parametrize('endpoint', ENDPOINTS)
def test_device_failure_returns_no_result_or_private_details(client, monkeypatch, endpoint):
    def fail(*args, **kwargs):
        raise RuntimeError('private-engine-path')
    monkeypatch.setattr(pl.qml, 'device', fail)
    response = client.post(endpoint, json=BODY)
    assert response.status_code == 500
    assert response.json() == {'error':{'code':'simulation_failed','message':'The simulator could not complete this circuit. Please retry.'}}
    assert 'private-engine-path' not in response.text


@pytest.mark.parametrize('bad_state', [np.array([np.nan,0,0,0]), np.array([2,0,0,0]), np.array([1,0]), np.array([[1,0],[0,0]])])
@pytest.mark.parametrize('endpoint', ENDPOINTS)
def test_invalid_engine_states_never_escape(client, monkeypatch, endpoint, bad_state):
    if endpoint.endswith('trace'):
        monkeypatch.setattr(pl.qml, 'snapshots', lambda circuit: lambda: {'step-0':bad_state})
    else:
        monkeypatch.setattr(pl, 'build_circuit', lambda *args, **kwargs: lambda: bad_state)
    response = client.post(endpoint, json=BODY)
    assert response.status_code == 500 and set(response.json()) == {'error'}


@pytest.mark.parametrize('bad_rho', [np.array([[2,0],[0,-1]]), np.array([[1,1j],[0,0]]), np.eye(2), np.full((2,2), np.nan)])
def test_invalid_reduced_matrix_returns_no_partial_trace(client, monkeypatch, bad_rho):
    monkeypatch.setattr(pl.qml.math, 'reduce_statevector', lambda *args, **kwargs: bad_rho)
    response = client.post('/api/simulate/trace', json=BODY)
    assert response.status_code == 500 and set(response.json()) == {'error'}


@pytest.mark.parametrize('bad_counts', [None, {'00':1024}, {'00':1024,'01':0,'10':0,'11':1},
    {'00':1025,'01':-1,'10':0,'11':0}, {'00':1024.,'01':0,'10':0,'11':0},
    {'00':True,'01':0,'10':0,'11':1023}, {'00':1024,'01':0,'10':0,'12':0}])
def test_invalid_sample_shapes_types_and_shot_totals_fail(client, monkeypatch, bad_counts):
    build = pl.build_circuit
    monkeypatch.setattr(pl, 'build_circuit', lambda *args, **kwargs: (lambda: bad_counts) if kwargs.get('sample') else build(*args, **kwargs))
    response = client.post('/api/simulate', json=BODY)
    assert response.status_code == 500 and set(response.json()) == {'error'}


@pytest.mark.parametrize('id', CATALOG)
@pytest.mark.parametrize('reference', [True, False])
def test_challenge_grading_remains_authoritative_qiskit_for_both_lab_choices(client, monkeypatch, id, reference):
    def forbidden(*args, **kwargs):
        pytest.fail('Lab backend choice must not change the authoritative grading engine')
    monkeypatch.setattr(pl, 'simulate_circuit', forbidden)
    circuit = (CATALOG[id].reference if reference else CATALOG[id].public.starting_circuit).model_dump(by_alias=True)
    body = {'challengeId':id, 'submissionId':'same-submission', 'circuit':circuit}
    first = client.post('/api/challenges/grade', json=body)
    circuit['backend'] = 'pennylane'
    second = client.post('/api/challenges/grade', json=body)
    assert first.status_code == second.status_code == 200
    a, b = first.json(), second.json()
    for key in ('engine','criterion','targetAchieved','score','valid','violatedConstraints','metrics','feedback'):
        assert a[key] == b[key]
    assert b['engine'] == 'qiskit-aer-statevector'


@pytest.mark.parametrize('endpoint', ['build', 'run'])
@pytest.mark.parametrize('algorithm', ['grover', 'deutsch-jozsa'])
def test_algorithm_backend_selection_and_invalid_names(client, endpoint, algorithm):
    body = {'algorithm':algorithm,'backend':'pennylane'} | ({'numQubits':2,'markedItem':'01','iterations':1} if algorithm == 'grover' else {'inputQubits':2,'oracleId':'xor'})
    response = client.post(f'/api/algorithms/{endpoint}', json=body)
    assert response.status_code == 200, response.text
    result = response.json()
    definition = result if endpoint == 'build' else result['definition']
    assert definition['circuit']['backend'] == 'pennylane'
    if endpoint == 'run':
        assert result['simulation']['backend'] == result['trace']['backend'] == 'pennylane'
    assert client.post(f'/api/algorithms/{endpoint}', json=body | {'backend':'fake'}).status_code == 422
