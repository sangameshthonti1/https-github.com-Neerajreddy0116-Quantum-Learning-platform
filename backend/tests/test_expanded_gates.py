"""Independent matrices / basis permutations, tested against real Aer and traces."""

import cmath
import itertools
import json
import math

import numpy as np
import pytest

from app.services.challenges import compare
from app.services.quantum_gates import OPERATIONS
from app.services.tutor_context import build_context
from app.schemas.tutor import TutorRequest

NAMES = ["h", "x", "y", "z", "s", "sdg", "t", "tdg", "rx", "ry", "rz", "p", "cx", "cz", "swap", "ccx"]
ROTATIONS = ["rx", "ry", "rz", "p"]


def gate(kind, qubits=(0,), theta=math.pi / 2):
    controls = 2 if kind == "ccx" else 1 if kind in ("cx", "cz") else 0
    return {"id": "temporary", "type": kind, "targets": list(qubits[controls:]), "controls": list(qubits[:controls]),
            **({"params": [theta]} if kind in ROTATIONS else {})}


def payload(gates, n=1):
    return {"numQubits": n, "gates": [{**g, "id": f"g{i}"} for i, g in enumerate(gates)],
            "shots": 128, "backend": "qiskit", "seedSimulator": 19}


def matrix(kind, theta=math.pi / 2):
    c, s = math.cos(theta / 2), math.sin(theta / 2)
    fixed = {
        "h": np.array([[1, 1], [1, -1]]) / math.sqrt(2),
        "x": [[0, 1], [1, 0]], "y": [[0, -1j], [1j, 0]], "z": [[1, 0], [0, -1]],
        "s": np.diag([1, 1j]), "sdg": np.diag([1, -1j]),
        "t": np.diag([1, cmath.exp(1j * math.pi / 4)]), "tdg": np.diag([1, cmath.exp(-1j * math.pi / 4)]),
        "rx": [[c, -1j * s], [-1j * s, c]], "ry": [[c, -s], [s, c]],
        "rz": np.diag([cmath.exp(-1j * theta / 2), cmath.exp(1j * theta / 2)]),
        "p": np.diag([1, cmath.exp(1j * theta)]),
    }
    if kind in fixed:
        return np.asarray(fixed[kind], dtype=complex)
    size = 8 if kind == "ccx" else 4
    result = np.zeros((size, size), dtype=complex)
    for basis in range(size):
        output = basis
        phase = 1
        if kind == "cx" and basis & 1:
            output ^= 2
        elif kind == "ccx" and basis & 3 == 3:
            output ^= 4
        elif kind == "cz" and basis == 3:
            phase = -1
        elif kind == "swap":
            output = ((basis & 1) << 1) | ((basis & 2) >> 1)
        result[output, basis] = phase
    return result


def evolve(state, operation):
    """Embed an independently written matrix using explicit basis-index bits."""
    operands = operation["controls"] + operation["targets"]
    unitary = matrix(operation["type"], operation.get("params", [math.pi / 2])[0])
    result = np.zeros_like(state)
    mask = sum(1 << q for q in operands)
    for source, amplitude in enumerate(state):
        column = sum(((source >> q) & 1) << i for i, q in enumerate(operands))
        for row in range(len(unitary)):
            destination = (source & ~mask) | sum(((row >> i) & 1) << q for i, q in enumerate(operands))
            result[destination] += unitary[row, column] * amplitude
    return result


def vector(values):
    return np.array([complex(a["real"], a["imag"]) for a in values])


def verify(client, request):
    simulated = client.post("/api/simulate", json=request)
    traced = client.post("/api/simulate/trace", json=request)
    assert simulated.status_code == traced.status_code == 200, (simulated.text, traced.text)
    result, trace = simulated.json(), traced.json()
    assert sum(result["counts"].values()) == request["shots"]
    expected = np.zeros(2 ** request["numQubits"], dtype=complex)
    expected[0] = 1
    for index, step in enumerate(trace["steps"]):
        if index:
            expected = evolve(expected, request["gates"][index - 1])
            assert step["gate"] == request["gates"][index - 1]
        np.testing.assert_allclose(vector(step["statevector"]), expected, atol=1e-12, rtol=0)
        assert np.vdot(vector(step["statevector"]), vector(step["statevector"])).real == pytest.approx(1, abs=1e-12)
        assert sum(step["probabilities"].values()) == pytest.approx(1, abs=1e-12)
        for basis, amplitude in enumerate(expected):
            assert step["probabilities"][format(basis, f'0{request["numQubits"]}b')] == pytest.approx(abs(amplitude) ** 2, abs=1e-12)
        for q, reduced in enumerate(step["qubits"]):
            rho = np.zeros((2, 2), dtype=complex)
            for a in range(len(expected)):
                for b in range(len(expected)):
                    if (a & ~(1 << q)) == (b & ~(1 << q)):
                        rho[(a >> q) & 1, (b >> q) & 1] += expected[a] * expected[b].conjugate()
            actual = np.array([vector(row) for row in reduced["densityMatrix"]])
            np.testing.assert_allclose(actual, rho, atol=1e-12, rtol=0)
            assert reduced["blochVector"] == pytest.approx({"x": 2 * rho[0, 1].real, "y": -2 * rho[0, 1].imag, "z": (rho[0, 0] - rho[1, 1]).real}, abs=1e-12)
    np.testing.assert_allclose(vector(result["statevector"]), expected, atol=1e-12, rtol=0)
    assert sum(result["probabilities"].values()) == pytest.approx(1, abs=1e-12)
    return result, trace


@pytest.mark.parametrize("kind", NAMES)
def test_all_native_gates_on_complex_entangled_input(client, kind):
    operands = (2, 0, 1) if kind == "ccx" else (2, 0) if kind in ("cx", "cz", "swap") else (1,)
    preparation = [gate("ry", (0,), .73), gate("rx", (2,), -.21), gate("h", (1,)), gate("cx", (0, 1)), gate("rz", (1,), .19)]
    verify(client, payload([*preparation, gate(kind, operands)], 3))
    assert set(OPERATIONS) == set(NAMES)


@pytest.mark.parametrize("kind", ROTATIONS)
@pytest.mark.parametrize("theta", [0, math.pi / 2, math.pi, -math.pi, 2 * math.pi, -.37])
@pytest.mark.parametrize("excited", [False, True])
def test_rotation_meaningful_angles_and_signs(client, kind, theta, excited):
    verify(client, payload([*([gate("x")] if excited else []), gate(kind, theta=theta)]))


@pytest.mark.parametrize("kind", ["y", "s", "sdg", "t", "tdg"])
def test_relative_phase_on_plus_state(client, kind):
    verify(client, payload([gate("h"), gate(kind)]))


@pytest.mark.parametrize("kind", NAMES)
def test_inverse_relationship_on_nontrivial_input(client, kind):
    operands = (1, 2, 0) if kind == "ccx" else (1, 0) if kind in ("cx", "cz", "swap") else (0,)
    inverse = {"s": "sdg", "sdg": "s", "t": "tdg", "tdg": "t"}.get(kind, kind)
    preparation = [gate("h", (0,)), gate("ry", (2,), .41), gate("cx", (0, 1)), gate("p", (0,), -.73)]
    result, trace = verify(client, payload([*preparation, gate(kind, operands, .31), gate(inverse, operands, -.31)], 3))
    np.testing.assert_allclose(vector(result["statevector"]), vector(trace["steps"][len(preparation)]["statevector"]), atol=1e-12, rtol=0)


@pytest.mark.parametrize("operands", list(itertools.permutations(range(3))))
@pytest.mark.parametrize("basis", range(8))
def test_ccx_every_control_order_target_and_basis(client, operands, basis):
    prep = [gate("x", (q,)) for q in range(3) if basis & (1 << q)]
    result, _ = verify(client, payload([*prep, gate("ccx", operands)], 3))
    expected = basis ^ (1 << operands[2]) if all(basis & (1 << q) for q in operands[:2]) else basis
    assert result["counts"][format(expected, "03b")] == 128


@pytest.mark.parametrize("kind", ["cz", "swap"])
@pytest.mark.parametrize("operands", list(itertools.permutations(range(3), 2)))
@pytest.mark.parametrize("basis", range(8))
def test_two_qubit_gates_all_wires_and_basis(client, kind, operands, basis):
    verify(client, payload([*[gate("x", (q,)) for q in range(3) if basis & (1 << q)], gate(kind, operands)], 3))


def test_global_phase_is_preserved_but_not_confused_with_relative_phase(client):
    rz, _ = verify(client, payload([gate("h"), gate("rz", theta=math.pi / 2)]))
    p, _ = verify(client, payload([gate("h"), gate("p", theta=math.pi / 2)]))
    np.testing.assert_allclose(vector(p["statevector"]), cmath.exp(1j * math.pi / 4) * vector(rz["statevector"]), atol=1e-12)
    assert compare(vector(rz["statevector"]), vector(p["statevector"]), [.5, .5], 1e-10).fidelity == pytest.approx(1)
    result, _ = verify(client, payload([gate("rx", theta=2 * math.pi)]))
    np.testing.assert_allclose(vector(result["statevector"]), [-1, 0], atol=1e-12)


@pytest.mark.parametrize("kind", ROTATIONS)
@pytest.mark.parametrize("parameters", [None, [], [0, 1], [True], ["1"], ["pi"], {}, 1, [float("nan")], [float("inf")], [-float("inf")]])
def test_invalid_angles_rejected_on_both_endpoints(client, kind, parameters):
    request = payload([{**gate(kind), "params": parameters}])
    for path in ("/api/simulate", "/api/simulate/trace"):
        response = client.post(path, content=json.dumps(request), headers={"Content-Type": "application/json"})
        assert response.status_code == 422
        assert "input" not in response.json()["detail"][0]


@pytest.mark.parametrize("kind", NAMES)
def test_parameter_count_and_duplicate_qubits_are_enforced(client, kind):
    operands = (0, 0, 1) if kind == "ccx" else (0, 0) if kind in ("cx", "cz", "swap") else (0,)
    bad = gate(kind, operands)
    if kind in ROTATIONS:
        del bad["params"]
    elif kind not in ("cx", "cz", "swap", "ccx"):
        bad["params"] = []
    for path in ("/api/simulate", "/api/simulate/trace"):
        assert client.post(path, json=payload([bad], 3)).status_code == 422


@pytest.mark.parametrize("kind", [name for name in NAMES if name not in ("h", "x", "z", "cx")])
def test_new_gates_cannot_bypass_challenge_allowlists(client, kind):
    challenge = client.get("/api/challenges").json()[0]
    circuit = challenge["startingCircuit"]
    # Gate constraints apply independently of target achievement and qubit constraints.
    operands = (0, 1, 2) if kind == "ccx" else (0, 1) if kind in ("cz", "swap") else (0,)
    circuit = payload([gate(kind, operands)], max(circuit["numQubits"], len(operands)))
    response = client.post('/api/challenges/grade', json={"challengeId": challenge["id"], "submissionId": "expanded", "circuit": circuit})
    assert response.status_code == 200, response.text
    data = response.json()
    assert not data["valid"] and data["score"] == 0
    assert any("allowed gates" in message for message in data["violatedConstraints"])


def test_tutor_context_includes_angles_and_real_complex_states():
    request = TutorRequest.model_validate({"question": "Explain this rotation", "mode": "circuit", "circuit": payload([gate("rx")])})
    context, facts = build_context(request)
    assert context["circuit"]["orderedGates"][0]["params"] == [math.pi / 2]
    assert context["limits"]["suggestionGates"] == ["h", "x", "z", "cx"]
    assert facts.snapshots[-1].statevector[1].imag == pytest.approx(-math.sqrt(.5))
