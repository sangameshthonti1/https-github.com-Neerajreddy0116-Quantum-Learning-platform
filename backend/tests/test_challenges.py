"""Independent physical and security checks for every trusted challenge."""

from math import pi, sqrt

import numpy as np
import pytest

from app.schemas.challenges import GradeRequest
from app.services.challenge_catalog import CATALOG, circuit
from app.services import challenges
from app.services.qiskit_simulator import SimulationExecutionError

URL = "/api/challenges/grade"


def payload(id, submitted=None):
    return {"challengeId": id, "submissionId": "test-submission",
            "circuit": (submitted or CATALOG[id].reference).model_dump(by_alias=True)}


@pytest.mark.parametrize("id", CATALOG)
def test_reference_solutions_are_verified_by_real_aer(client, id):
    body = payload(id)
    response = client.post(URL, json=body)
    assert response.status_code == 200, response.text
    grade = response.json()
    assert grade["valid"] and grade["targetAchieved"]
    assert grade["score"] == 100
    assert grade["circuit"] == body["circuit"]
    assert grade["submissionId"] == body["submissionId"]
    assert grade["challengeId"] == id
    assert grade["metrics"]["similarity"] == pytest.approx(1, abs=1e-12)
    assert grade["samplingUsedForGrading"] is False
    assert grade["violatedConstraints"] == []
    # Cross-check real existing simulation and tracing APIs, including every
    # preparation step; no challenge-specific simulator or alternate initial state.
    simulation = client.post("/api/simulate", json=body["circuit"]).json()
    trace = client.post("/api/simulate/trace", json=body["circuit"]).json()
    actual = np.array([complex(a["real"], a["imag"]) for a in grade["statevector"]])
    for other in (simulation["statevector"], trace["steps"][-1]["statevector"]):
        expected = np.array([complex(a["real"], a["imag"]) for a in other])
        assert abs(np.vdot(actual, expected))**2 == pytest.approx(1, abs=1e-12)


@pytest.mark.parametrize("id", CATALOG)
def test_starting_circuits_do_not_already_solve_the_challenges(client, id):
    response = client.post(URL, json=payload(id, CATALOG[id].public.starting_circuit))
    assert response.status_code == 200
    grade = response.json()
    assert grade["valid"]
    assert not grade["targetAchieved"]
    assert grade["score"] < 100
    assert grade["feedback"] and grade["nextHint"]


@pytest.mark.parametrize("id", ["flip", "superposition", "phase", "bell", "ghz"])
def test_equivalent_negative_global_phase_passes(client, id):
    reference = CATALOG[id].reference
    negative = circuit(reference.num_qubits, (("x", 0), ("z", 0), ("x", 0), ("z", 0)))
    negative.gates.extend(g.model_copy(update={"id": f"ref-{g.id}"}) for g in reference.gates)
    grade = client.post(URL, json=payload(id, negative)).json()
    assert grade["score"] == 100
    assert grade["metrics"]["fidelity"] == pytest.approx(1, abs=1e-12)


@pytest.mark.parametrize("phase", [0, pi / 7, pi / 2, pi, -2.4])
def test_arbitrary_complex_global_phase_is_invariant(phase):
    target = np.array([sqrt(.5), -sqrt(.5)], dtype=complex)
    metrics = challenges.compare(target * np.exp(1j * phase), target, [.5, .5], 1e-10)
    assert metrics.fidelity == pytest.approx(1, abs=1e-12)


@pytest.mark.parametrize(("id", "n", "ops"), [
    ("superposition", 1, (("h", 0), ("z", 0))),
    ("phase", 1, (("h", 0),)),
    ("bell", 2, (("h", 0), ("cx", 1, 0), ("z", 1))),
    ("ghz", 3, (("h", 0), ("cx", 1, 0), ("cx", 2, 0), ("z", 2))),
])
def test_same_probabilities_wrong_relative_phase_fails(client, id, n, ops):
    grade = client.post(URL, json=payload(id, circuit(n, ops))).json()
    assert grade["valid"] and not grade["targetAchieved"]
    assert grade["metrics"]["fidelity"] == pytest.approx(0, abs=1e-12)
    assert grade["metrics"]["totalVariationDistance"] == pytest.approx(0, abs=1e-12)
    assert grade["score"] == 0
    assert "relative phase" in grade["feedback"]


@pytest.mark.parametrize("phase_gate", [(), (("z", 0),)])
def test_distribution_accepts_both_relative_phases(client, phase_gate):
    c = circuit(2, (("h", 0), ("cx", 1, 0), ("x", 1)) + phase_gate)
    grade = client.post(URL, json=payload("opposites", c)).json()
    assert grade["score"] == 100
    assert grade["metrics"]["fidelity"] is None
    assert "unrestricted" in grade["feedback"]


def test_distribution_uses_joint_not_marginal_probabilities(client):
    c = circuit(2, (("h", 0), ("h", 1)))
    grade = client.post(URL, json=payload("opposites", c)).json()
    assert not grade["targetAchieved"]
    assert grade["score"] == 50
    assert grade["metrics"]["totalVariationDistance"] == pytest.approx(.5)


@pytest.mark.parametrize("id", ["interference", "unwind"])
def test_correct_final_state_does_not_bypass_required_preparation(client, id):
    grade = client.post(URL, json=payload(id, circuit(CATALOG[id].public.starting_circuit.num_qubits))).json()
    assert grade["targetAchieved"]
    assert not grade["valid"] and grade["score"] == 0
    assert "Restore the provided preparation" in grade["violatedConstraints"][0]


def test_preparation_matches_operations_and_wires_not_user_gate_ids(client):
    body = payload("unwind")
    body["circuit"]["gates"][0]["id"] = "student-id"
    assert client.post(URL, json=body).json()["score"] == 100
    body["circuit"]["gates"][0]["targets"] = [1]
    assert not client.post(URL, json=body).json()["valid"]


def test_qubit_and_gate_constraints(client):
    body = payload("flip", circuit(2, (("cx", 1, 0),)))
    grade = client.post(URL, json=body).json()
    assert not grade["valid"] and grade["score"] == 0
    assert len(grade["violatedConstraints"]) == 2
    assert grade["metrics"] is None


@pytest.mark.parametrize("mutation", [
    lambda b: b["circuit"].update(numQubits=4),
    lambda b: b["circuit"].update(numQubits=True),
    lambda b: b["circuit"].update(shots=0),
    lambda b: b["circuit"]["gates"][0].update(type="measure"),
    lambda b: b["circuit"]["gates"][0].update(targets=[1]),
    lambda b: b["circuit"]["gates"].append(b["circuit"]["gates"][0]),
    lambda b: b["circuit"].update(gates=[{"id": str(i), "type": "x", "targets": [0], "controls": []} for i in range(257)]),
    lambda b: b["circuit"]["gates"][0].update(type="cx", controls=[0]),
])
def test_existing_schema_limits_are_enforced(client, mutation):
    body = payload("flip")
    mutation(body)
    response = client.post(URL, json=body)
    assert response.status_code == 422
    assert all("input" not in issue for issue in response.json()["detail"])


@pytest.mark.parametrize("field", ["score", "completed", "targetState", "probabilities", "counts", "fidelity", "reference", "python", "valid"])
@pytest.mark.parametrize("nested", [False, True])
def test_client_grading_claims_are_rejected(client, field, nested):
    body = payload("flip")
    (body["circuit"] if nested else body)[field] = "untrusted-client-claim"
    response = client.post(URL, json=body)
    assert response.status_code == 422
    assert "untrusted-client-claim" not in response.text


def test_unknown_challenge_and_catalog_excludes_references(client):
    body = payload("flip")
    body["challengeId"] = "unknown"
    assert client.post(URL, json=body).status_code == 404
    response = client.get("/api/challenges")
    assert response.status_code == 200
    catalog = response.json()
    assert len(catalog) == 8
    assert {c["id"] for c in catalog} == set(CATALOG)
    assert "reference" not in response.text and "solution" not in catalog[0]
    assert all(c["version"] == 1 and c["hints"] and c["scoring"] for c in catalog)


@pytest.mark.parametrize("invalid", [[0, 0], [1, 1], [np.nan, 0], [np.inf, 0], [1], [[1, 0]]])
def test_invalid_normalization_or_layout_never_grades(invalid):
    with pytest.raises(SimulationExecutionError):
        challenges.compare(invalid, [1, 0], [1, 0], 1e-10)


def test_norm_drift_and_pass_tolerance():
    m = challenges.compare([sqrt(1 + 1e-12), 0], [1, 0], [1, 0], 1e-10)
    assert m.fidelity == pytest.approx(1)
    for error, achieved in [(0.5e-10, True), (2e-10, False)]:
        m = challenges.compare([sqrt(1 - error), sqrt(error)], [1, 0], [1, 0], 1e-10)
        assert (1 - m.similarity <= m.tolerance) is achieved


def test_invalid_trusted_target_fails_closed():
    with pytest.raises(SimulationExecutionError):
        challenges.compare([1, 0], [2, 0], [1, 0], 1e-10)
    with pytest.raises(SimulationExecutionError):
        challenges.compare([1, 0], None, [.7, .7], 1e-10)


def test_grade_independent_of_seed_shots_and_sampled_counts(client, monkeypatch):
    original = challenges.simulate_circuit
    calls = []
    def misleading_counts(request):
        calls.append(request)
        result = original(request)
        result.counts = {"0": 1, "1": 0}
        return result
    monkeypatch.setattr(challenges, "simulate_circuit", misleading_counts)
    for shots, seed in [(1, 0), (8192, 4294967295)]:
        body = payload("flip")
        body["circuit"].update(shots=shots, seedSimulator=seed)
        grade = client.post(URL, json=body).json()
        assert grade["score"] == 100
        assert grade["circuit"]["shots"] == shots
    assert all(c.shots == 1 and c.seed_simulator == 0 for c in calls)


def test_simulator_failure_and_malformed_evidence_never_award_scores(client, monkeypatch):
    def fail(_):
        raise SimulationExecutionError("private-internal-error")
    monkeypatch.setattr(challenges, "simulate_circuit", fail)
    response = client.post(URL, json=payload("flip"))
    assert response.status_code == 503
    assert "score" not in response.text and "private-internal-error" not in response.text


def test_incorrect_state_has_deterministic_partial_score(client):
    body = payload("flip", circuit(1, (("h", 0),)))
    first = client.post(URL, json=body).json()
    second = client.post(URL, json=body).json()
    assert first == second
    assert first["score"] == 50 and first["valid"] and not first["targetAchieved"]


def test_invalid_simulator_state_rejected_before_score(monkeypatch):
    original = challenges.simulate_circuit
    def invalid(request):
        result = original(request)
        result.statevector[0].real = 10
        return result
    monkeypatch.setattr(challenges, "simulate_circuit", invalid)
    with pytest.raises(SimulationExecutionError):
        challenges.grade_submission(GradeRequest.model_validate(payload("flip")))
