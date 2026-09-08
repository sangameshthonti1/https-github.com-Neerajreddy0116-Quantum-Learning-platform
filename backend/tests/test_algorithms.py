"""Algorithm verification against independent matrix/truth-table expectations."""

import itertools
import math

import numpy as np
import pytest
from pydantic import TypeAdapter
from qiskit import QuantumCircuit
from qiskit.quantum_info import Operator, Statevector

from app.schemas.algorithms import AlgorithmRequest
from app.services.algorithm_catalog import CATALOG
from app.services.algorithms import build_algorithm, run_algorithm
from app.services.quantum_gates import operation
from app.services.qiskit_simulator import SimulationExecutionError

adapter = TypeAdapter(AlgorithmRequest)
# Independent expected tables, indexed by q[n-1]...q[0].
TABLES = {
    1: {"zero": [0, 0], "one": [1, 1], "q0": [0, 1], "not-q0": [1, 0]},
    2: {"zero": [0, 0, 0, 0], "one": [1, 1, 1, 1], "q0": [0, 1, 0, 1],
        "not-q0": [1, 0, 1, 0], "q1": [0, 0, 1, 1], "not-q1": [1, 1, 0, 0],
        "xor": [0, 1, 1, 0], "xnor": [1, 0, 0, 1]},
}
DJ_CASES = [(n, oracle) for n, tables in TABLES.items() for oracle in tables]
GROVER_CASES = [(n, format(m, f"0{n}b"), k) for n in (1, 2) for m in range(2**n) for k in range(5)]


def dj(n=2, oracle="zero", **extra):
    return adapter.validate_python({"algorithm": "deutsch-jozsa", "inputQubits": n, "oracleId": oracle,
                                    "shots": 1024, "seedSimulator": 42, **extra})


def grover(n=2, marked="10", k=1, **extra):
    return adapter.validate_python({"algorithm": "grover", "numQubits": n, "markedItem": marked,
                                    "iterations": k, "shots": 1024, "seedSimulator": 42, **extra})


def matrix(definition, stage):
    qc = QuantumCircuit(definition.circuit.num_qubits)
    for gate in definition.circuit.gates[stage.start_step:stage.end_step]:
        qc.append(operation(gate), gate.controls + gate.targets)
    return Operator(qc).data


def state(step):
    return np.array([complex(a.real, a.imag) for a in step.statevector])


def test_catalog_covers_exactly_all_small_promised_functions(client):
    response = client.get("/api/algorithms")
    assert response.status_code == 200
    assert [a["id"] for a in response.json()] == ["deutsch-jozsa", "grover"]
    assert len(CATALOG[0].oracles) == 12
    for n in (1, 2):
        promised = {bits for bits in itertools.product((0, 1), repeat=2**n) if sum(bits) in (0, 2**(n - 1), 2**n)}
        assert {tuple(o.output for o in item.truth_table) for item in CATALOG[0].oracles if item.input_qubits == n} == promised


@pytest.mark.parametrize("n,oracle", DJ_CASES)
def test_every_dj_reversible_oracle_on_every_input_and_helper(n, oracle):
    definition = build_algorithm(dj(n, oracle))
    stage = next(s for s in definition.stages if s.id == "oracle")
    actual = matrix(definition, stage)
    expected = np.zeros_like(actual)
    table = TABLES[n][oracle]
    for helper in (0, 1):
        for x, output in enumerate(table):
            expected[x + ((helper ^ output) << n), x + (helper << n)] = 1
    np.testing.assert_allclose(actual, expected, atol=1e-12, rtol=0)
    assert [r.output for r in definition.oracle.truth_table] == table
    assert {g.type for g in definition.circuit.gates[stage.start_step:stage.end_step]} <= {"x", "cx"}
    if oracle == "zero":
        assert stage.start_step == stage.end_step  # A genuine identity oracle.


@pytest.mark.parametrize("n,oracle", DJ_CASES)
def test_every_dj_runs_through_http_with_correct_register_classification(client, n, oracle):
    response = client.post("/api/algorithms/run", json=dj(n, oracle).model_dump(by_alias=True))
    assert response.status_code == 200, response.text
    result = response.json()
    table = TABLES[n][oracle]
    expected = "constant" if len(set(table)) == 1 else "balanced"
    interpretation = result["interpretation"]
    assert interpretation["classification"] == expected
    assert interpretation["zeroInputProbability"] == pytest.approx(int(expected == "constant"), abs=1e-12)
    assert sum(interpretation["inputCounts"].values()) == 1024
    assert sum(interpretation["inputProbabilities"].values()) == pytest.approx(1, abs=1e-12)
    assert interpretation["classicalWorstCaseQueries"] == 2**(n - 1) + 1
    assert result["definition"]["ancillaQubit"] == n
    assert result["definition"]["inputRegister"] == list(range(n))
    assert result["definition"]["bitOrder"] == "q[n-1]...q[0]"
    # Both helper values occur, including nonzero full strings for constant f.
    assert sum(c for label, c in result["simulation"]["counts"].items() if label[0] == "1") > 0
    for label, p in interpretation["inputProbabilities"].items():
        assert p == pytest.approx(sum(result["simulation"]["probabilities"][a + label] for a in "01"), abs=1e-12)
    for step in result["trace"]["steps"]:
        assert sum(step["probabilities"].values()) == pytest.approx(1, abs=1e-12)


@pytest.mark.parametrize("oracle,output", [("q0", "01"), ("q1", "10"), ("xor", "11")])
def test_dj_rightmost_input_bit_order(oracle, output):
    result = run_algorithm(dj(2, oracle))
    assert result.interpretation.input_probabilities[output] == pytest.approx(1, abs=1e-12)


@pytest.mark.parametrize("n,oracle", DJ_CASES)
def test_phase_kickback_preserves_helper_minus_state(n, oracle):
    result = run_algorithm(dj(n, oracle))
    stage = next(s for s in result.definition.stages if s.id == "oracle")
    signs = np.array([(-1)**f for f in TABLES[n][oracle]]) / math.sqrt(2**n)
    expected = np.kron([1 / math.sqrt(2), -1 / math.sqrt(2)], signs)
    np.testing.assert_allclose(state(result.trace.steps[stage.end_step]), expected, atol=1e-12, rtol=0)


@pytest.mark.parametrize("n,marked,k", GROVER_CASES)
def test_grover_actual_success_and_trace_follow_rotation_formula(n, marked, k):
    result = run_algorithm(grover(n, marked, k))
    theta = math.asin(1 / math.sqrt(2**n))
    expected = math.sin((2 * k + 1) * theta)**2
    assert result.interpretation.success_probability == pytest.approx(expected, abs=1e-12)
    assert result.interpretation.sampled_success_count == result.simulation.counts[marked]
    assert result.interpretation.sampled_success_rate == result.simulation.counts[marked] / 1024
    assert len(result.interpretation.iterations) == k + 1
    if n == 2 and k == 1:
        assert result.simulation.counts[marked] == 1024
    for observation in result.interpretation.iterations:
        assert observation.success_probability == pytest.approx(math.sin((2 * observation.iteration + 1) * theta)**2, abs=1e-12)
        assert observation.success_probability == result.trace.steps[observation.step].probabilities[marked]
    for step in result.trace.steps:
        assert np.vdot(state(step), state(step)).real == pytest.approx(1, abs=1e-12)
    np.testing.assert_allclose(state(result.simulation), state(result.trace.steps[-1]), atol=1e-12, rtol=0)
    assert len(result.definition.circuit.gates) <= 58 < 256


@pytest.mark.parametrize("n,marked", [(n, format(m, f"0{n}b")) for n in (1, 2) for m in range(2**n)])
def test_grover_phase_oracle_and_diffuser_full_operators(n, marked):
    definition = build_algorithm(grover(n, marked))
    oracle = next(s for s in definition.stages if s.id == "oracle-1")
    diffuser = next(s for s in definition.stages if s.id == "diffuser-1")
    expected_oracle = np.eye(2**n)
    expected_oracle[int(marked, 2), int(marked, 2)] = -1
    np.testing.assert_allclose(matrix(definition, oracle), expected_oracle, atol=1e-12, rtol=0)
    uniform = np.ones(2**n) / math.sqrt(2**n)
    expected_diffuser = 2 * np.outer(uniform, uniform) - np.eye(2**n)
    # Our gate decomposition is -D, not D. Preserve and verify native global phase.
    np.testing.assert_allclose(matrix(definition, diffuser), -expected_diffuser, atol=1e-12, rtol=0)
    result = run_algorithm(grover(n, marked))
    before, after = result.trace.steps[oracle.start_step], result.trace.steps[oracle.end_step]
    assert before.probabilities == pytest.approx(after.probabilities, abs=1e-12)
    assert state(after)[int(marked, 2)] == pytest.approx(-state(before)[int(marked, 2)], abs=1e-12)


def test_complement_oracles_differ_by_only_global_phase():
    a, b = run_algorithm(dj(2, "xor")), run_algorithm(dj(2, "xnor"))
    np.testing.assert_allclose(state(a.simulation), -state(b.simulation), atol=1e-12, rtol=0)
    assert a.simulation.probabilities == pytest.approx(b.simulation.probabilities, abs=1e-12)
    assert Statevector(state(a.simulation)).equiv(Statevector(state(b.simulation)))


@pytest.mark.parametrize("changes", [
    {"numQubits": 3}, {"numQubits": True}, {"numQubits": "2"}, {"markedItem": "1"},
    {"markedItem": "2x"}, {"markedItem": "101"}, {"iterations": -1}, {"iterations": 5},
    {"iterations": True}, {"iterations": 1.5}, {"shots": 0}, {"shots": 8193}, {"shots": True},
    {"seedSimulator": -1}, {"seedSimulator": 4294967296}, {"algorithm": "qaoa"},
    {"probabilities": {"10": 1}}, {"successProbability": 1}, {"circuit": {}}, {"gates": []},
])
@pytest.mark.parametrize("endpoint", ["build", "run"])
def test_invalid_grover_and_untrusted_result_fields_rejected(client, changes, endpoint):
    body = grover().model_dump(by_alias=True) | changes
    response = client.post(f"/api/algorithms/{endpoint}", json=body)
    assert response.status_code == 422
    assert response.json()["detail"]


@pytest.mark.parametrize("changes", [
    {"inputQubits": 0}, {"inputQubits": 3}, {"inputQubits": True}, {"oracleId": "and"},
    {"inputQubits": 1, "oracleId": "q1"}, {"inputQubits": 1, "oracleId": "xor"},
    {"classification": "constant"}, {"oracleId": "__import__('os')"},
])
def test_invalid_dj_rejected(client, changes):
    response = client.post("/api/algorithms/run", json=dj().model_dump(by_alias=True) | changes)
    assert response.status_code == 422


def test_build_does_not_simulate_and_execution_failure_is_honest(client, monkeypatch):
    def fail(*_):
        raise SimulationExecutionError("private implementation detail")
    monkeypatch.setattr("app.services.algorithms.simulate_circuit", fail)
    body = grover().model_dump(by_alias=True)
    assert client.post("/api/algorithms/build", json=body).status_code == 200
    response = client.post("/api/algorithms/run", json=body)
    assert response.status_code == 503
    assert "private" not in response.text
    assert "simulation" not in response.json()


def test_classification_is_derived_from_execution_not_catalog(monkeypatch):
    # If trusted circuit construction regresses, interpreting the oracle label would hide it.
    original = build_algorithm(dj())
    monkeypatch.setattr("app.services.algorithms.build_algorithm", lambda _: original)
    assert run_algorithm(dj(2, "xor")).interpretation.classification == "constant"


def test_trace_failure_and_disagreement_cannot_return_partial_results(client, monkeypatch):
    real = run_algorithm(grover())
    wrong = real.trace.model_copy(deep=True)
    wrong.steps[-1].statevector[0].real = 0.3
    monkeypatch.setattr("app.services.algorithms.trace_circuit", lambda _: wrong)
    assert client.post("/api/algorithms/run", json=grover().model_dump(by_alias=True)).status_code == 503


def test_build_run_snapshots_and_core_contracts_match(client):
    parameters = grover(k=4, shots=8192, seedSimulator=4294967295).model_dump(by_alias=True)
    built = client.post("/api/algorithms/build", json=parameters).json()
    run = client.post("/api/algorithms/run", json=parameters).json()
    assert built == run["definition"]
    assert len(built["circuitDigest"]) == 64
    assert run["simulation"]["metadata"]["seedSimulator"] == 4294967295
    core = client.post("/api/simulate", json=built["circuit"]).json()
    assert core["probabilities"] == run["simulation"]["probabilities"]
    assert core["counts"] == run["simulation"]["counts"]
    trace = client.post("/api/simulate/trace", json=built["circuit"]).json()
    assert trace["steps"] == run["trace"]["steps"]
    changed = client.post("/api/algorithms/build", json=parameters | {"markedItem": "01"}).json()
    assert changed["circuitDigest"] != built["circuitDigest"]
