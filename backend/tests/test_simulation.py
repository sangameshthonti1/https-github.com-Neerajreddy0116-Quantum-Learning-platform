import json
import math

import pytest


SIMULATE_URL = "/api/simulate"


def _gate(gate_type, target=0, *, control=None, gate_id="g0"):
    return {
        "id": gate_id,
        "type": gate_type,
        "targets": [target],
        "controls": [] if control is None else [control],
    }


def _payload(*, num_qubits=1, gates=None, shots=128, seed=23):
    return {
        "numQubits": num_qubits,
        "gates": [] if gates is None else gates,
        "shots": shots,
        "backend": "qiskit",
        "seedSimulator": seed,
    }


def _reject_nonfinite_json(value):
    pytest.fail(f"Response contains non-JSON numeric constant: {value}")


def _assert_result(response, payload):
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("application/json")
    data = json.loads(response.text, parse_constant=_reject_nonfinite_json)
    assert set(data) == {
        "backend", "numQubits", "probabilities", "counts", "statevector",
        "shots", "metadata",
    }
    assert data["backend"] == "qiskit"
    assert type(data["numQubits"]) is int
    assert data["numQubits"] == payload["numQubits"]
    assert type(data["shots"]) is int
    assert data["shots"] == payload["shots"]

    num_qubits = payload["numQubits"]
    labels = {format(index, f"0{num_qubits}b") for index in range(2**num_qubits)}
    assert set(data["probabilities"]) == labels
    assert set(data["counts"]) == labels
    for probability in data["probabilities"].values():
        assert type(probability) is float
        assert math.isfinite(probability)
        assert -1e-12 <= probability <= 1 + 1e-12
    assert sum(data["probabilities"].values()) == pytest.approx(1, abs=1e-12)
    for count in data["counts"].values():
        assert type(count) is int
        assert 0 <= count <= payload["shots"]
    assert sum(data["counts"].values()) == payload["shots"]

    statevector = data["statevector"]
    assert isinstance(statevector, list)
    assert len(statevector) == 2**num_qubits
    for index, amplitude in enumerate(statevector):
        assert set(amplitude) == {"real", "imag"}
        for component in amplitude.values():
            assert type(component) in (int, float)
            assert math.isfinite(component)
        probability = amplitude["real"] ** 2 + amplitude["imag"] ** 2
        label = format(index, f"0{num_qubits}b")
        assert data["probabilities"][label] == pytest.approx(probability, abs=1e-12)
    assert sum(
        amplitude["real"] ** 2 + amplitude["imag"] ** 2
        for amplitude in statevector
    ) == pytest.approx(1, abs=1e-12)

    metadata = data["metadata"]
    assert {
        "method", "measurement", "statevectorStage", "bitOrder",
        "seedSimulator", "gateCount", "circuitDepth", "executionTimeMs",
        "qiskitVersion", "aerVersion",
    } <= set(metadata)
    assert metadata["method"] == "statevector"
    assert metadata["measurement"] == "terminal-all"
    assert metadata["statevectorStage"] == "before-measurement"
    assert metadata["bitOrder"] == "q[n-1]...q[0]"
    assert type(metadata["seedSimulator"]) is int
    assert 0 <= metadata["seedSimulator"] <= 4294967295
    if payload.get("seedSimulator") is not None:
        assert metadata["seedSimulator"] == payload["seedSimulator"]
    assert type(metadata["gateCount"]) is int
    assert metadata["gateCount"] == len(payload["gates"])
    assert type(metadata["circuitDepth"]) is int
    assert metadata["circuitDepth"] >= 0
    assert type(metadata["executionTimeMs"]) in (int, float)
    assert math.isfinite(metadata["executionTimeMs"])
    assert metadata["executionTimeMs"] >= 0
    for key in ("qiskitVersion", "aerVersion"):
        assert isinstance(metadata[key], str)
        assert metadata[key].strip()
    return data


def _assert_state(data, expected):
    actual = [complex(item["real"], item["imag"]) for item in data["statevector"]]
    assert actual == pytest.approx(expected, abs=1e-12)
    for index, amplitude in enumerate(expected):
        label = format(index, f"0{data['numQubits']}b")
        assert data["probabilities"][label] == pytest.approx(abs(amplitude) ** 2, abs=1e-12)
        if amplitude == 0:
            assert data["counts"][label] == 0
        elif abs(amplitude) == 1:
            assert data["counts"][label] == data["shots"]


def _assert_validation_error(response):
    assert response.status_code == 422, response.text
    data = response.json()
    assert set(data) == {"detail"}
    assert isinstance(data["detail"], list)
    assert data["detail"]
    for error in data["detail"]:
        assert {"loc", "msg", "type"} <= set(error)
        assert "input" not in error
        assert isinstance(error["loc"], list)
        assert error["loc"] and error["loc"][0] == "body"
        assert all(type(part) in (str, int) for part in error["loc"])
        assert isinstance(error["msg"], str) and error["msg"]
        assert isinstance(error["type"], str) and error["type"]
    return data


@pytest.mark.parametrize("num_qubits", [1, 2, 3])
def test_empty_circuit_measures_all_qubits_with_dense_results(client, num_qubits):
    payload = _payload(num_qubits=num_qubits)
    data = _assert_result(client.post(SIMULATE_URL, json=payload), payload)
    _assert_state(data, [1] + [0] * (2**num_qubits - 1))
    assert data["metadata"]["circuitDepth"] == 0


@pytest.mark.parametrize(
    ("gates", "expected"),
    [
        ([_gate("x")], [0, 1]),
        ([_gate("z")], [1, 0]),
        ([_gate("h")], [math.sqrt(0.5), math.sqrt(0.5)]),
        ([_gate("h"), _gate("h", gate_id="g1")], [1, 0]),
        (
            [_gate("h"), _gate("z", gate_id="g1"), _gate("h", gate_id="g2")],
            [0, 1],
        ),
        (
            [_gate("h"), _gate("z", gate_id="g1")],
            [math.sqrt(0.5), -math.sqrt(0.5)],
        ),
    ],
    ids=["x", "z", "h", "h-h", "h-z-h", "h-z-negative-phase"],
)
def test_real_single_qubit_evolution(client, gates, expected):
    payload = _payload(gates=gates)
    data = _assert_result(client.post(SIMULATE_URL, json=payload), payload)
    _assert_state(data, expected)
    assert data["metadata"]["circuitDepth"] == len(gates)


@pytest.mark.parametrize(("num_qubits", "target"), [(2, 0), (2, 1), (3, 0), (3, 1), (3, 2)])
def test_binary_labels_and_statevector_use_little_endian_qubit_order(client, num_qubits, target):
    payload = _payload(num_qubits=num_qubits, gates=[_gate("x", target)])
    data = _assert_result(client.post(SIMULATE_URL, json=payload), payload)
    expected = [0] * (2**num_qubits)
    expected[1 << target] = 1
    _assert_state(data, expected)


@pytest.mark.parametrize(("num_qubits", "control", "target"), [(2, 0, 1), (2, 1, 0), (3, 0, 2), (3, 2, 0)])
def test_bell_state_with_both_cx_directions(client, num_qubits, control, target):
    payload = _payload(
        num_qubits=num_qubits,
        gates=[_gate("h", control), _gate("cx", target, control=control, gate_id="g1")],
    )
    data = _assert_result(client.post(SIMULATE_URL, json=payload), payload)
    expected = [0] * (2**num_qubits)
    expected[0] = math.sqrt(0.5)
    expected[(1 << control) | (1 << target)] = math.sqrt(0.5)
    _assert_state(data, expected)
    assert data["metadata"]["circuitDepth"] == 2


@pytest.mark.parametrize(("control", "target"), [(0, 1), (1, 0)])
@pytest.mark.parametrize("excite_control", [False, True])
def test_cx_only_flips_target_when_control_is_one(client, control, target, excite_control):
    excited = control if excite_control else target
    payload = _payload(
        num_qubits=2,
        gates=[_gate("x", excited), _gate("cx", target, control=control, gate_id="g1")],
    )
    data = _assert_result(client.post(SIMULATE_URL, json=payload), payload)
    expected = [0] * 4
    expected[3 if excite_control else 1 << target] = 1
    _assert_state(data, expected)


def test_circuit_depth_counts_parallel_layers_not_gate_count(client):
    payload = _payload(
        num_qubits=3,
        gates=[_gate("x", target, gate_id=f"g{target}") for target in range(3)],
    )
    data = _assert_result(client.post(SIMULATE_URL, json=payload), payload)
    _assert_state(data, [0] * 7 + [1])
    assert data["metadata"]["gateCount"] == 3
    assert data["metadata"]["circuitDepth"] == 1


def test_one_shot_hadamard_returns_premeasurement_probabilities_and_state(client):
    payload = _payload(gates=[_gate("h")], shots=1)
    data = _assert_result(client.post(SIMULATE_URL, json=payload), payload)
    _assert_state(data, [math.sqrt(0.5), math.sqrt(0.5)])
    assert data["probabilities"] == pytest.approx({"0": 0.5, "1": 0.5}, abs=1e-12)
    assert sorted(data["counts"].values()) == [0, 1]


def test_explicit_seed_reproduces_counts_without_requiring_specific_samples(client):
    payload = _payload(
        num_qubits=3,
        gates=[_gate("h", target, gate_id=f"g{target}") for target in range(3)],
        shots=257,
        seed=123456,
    )
    first = _assert_result(client.post(SIMULATE_URL, json=payload), payload)
    second = _assert_result(client.post(SIMULATE_URL, json=payload), payload)
    _assert_state(first, [math.sqrt(1 / 8)] * 8)
    _assert_state(second, [math.sqrt(1 / 8)] * 8)
    assert first["counts"] == second["counts"]
    assert first["probabilities"] == second["probabilities"]
    assert first["statevector"] == second["statevector"]


@pytest.mark.parametrize("explicit_null", [False, True], ids=["omitted", "null"])
def test_server_chosen_seed_is_valid_and_can_replay_counts(client, explicit_null):
    payload = _payload(gates=[_gate("h")], seed=None)
    if not explicit_null:
        del payload["seedSimulator"]
    first = _assert_result(client.post(SIMULATE_URL, json=payload), payload)
    _assert_state(first, [math.sqrt(0.5), math.sqrt(0.5)])
    payload["seedSimulator"] = first["metadata"]["seedSimulator"]
    replay = _assert_result(client.post(SIMULATE_URL, json=payload), payload)
    assert replay["counts"] == first["counts"]


@pytest.mark.parametrize("shots", [1, 8192])
@pytest.mark.parametrize("seed", [0, 4294967295])
def test_shot_and_seed_inclusive_boundaries(client, shots, seed):
    payload = _payload(gates=[_gate("x")], shots=shots, seed=seed)
    data = _assert_result(client.post(SIMULATE_URL, json=payload), payload)
    _assert_state(data, [0, 1])


def test_256_gates_are_accepted(client):
    payload = _payload(gates=[_gate("x", gate_id=f"g{index}") for index in range(256)])
    data = _assert_result(client.post(SIMULATE_URL, json=payload), payload)
    _assert_state(data, [1, 0])
    assert data["metadata"]["circuitDepth"] == 256


def test_64_character_gate_id_is_accepted(client):
    payload = _payload(gates=[_gate("x", gate_id="g" * 64)])
    data = _assert_result(client.post(SIMULATE_URL, json=payload), payload)
    _assert_state(data, [0, 1])


@pytest.mark.parametrize("field", ["numQubits", "gates", "shots", "backend"])
def test_required_request_fields(client, field):
    payload = _payload()
    del payload[field]
    _assert_validation_error(client.post(SIMULATE_URL, json=payload))


@pytest.mark.parametrize(
    ("field", "value"),
    [
        (field, value)
        for field in ("numQubits", "shots", "seedSimulator")
        for value in (True, False, 1.0, 1.5, "1", [], {})
    ]
    + [
        ("numQubits", None), ("numQubits", 0), ("numQubits", -1), ("numQubits", 4),
        ("shots", None), ("shots", 0), ("shots", -1), ("shots", 8193),
        ("seedSimulator", -1), ("seedSimulator", 4294967296),
    ],
)
def test_numeric_fields_reject_coercion_and_out_of_range_values(client, field, value):
    payload = _payload()
    payload[field] = value
    _assert_validation_error(client.post(SIMULATE_URL, json=payload))


@pytest.mark.parametrize("value", [None, "Qiskit", "aer", "", True, 1, [], {}])
def test_backend_must_be_qiskit_literal(client, value):
    payload = _payload()
    payload["backend"] = value
    _assert_validation_error(client.post(SIMULATE_URL, json=payload))


@pytest.mark.parametrize("value", [None, {}, "[]", 0, True])
def test_gates_must_be_an_array(client, value):
    payload = _payload()
    payload["gates"] = value
    _assert_validation_error(client.post(SIMULATE_URL, json=payload))


def test_more_than_256_gates_is_rejected(client):
    payload = _payload(gates=[_gate("x", gate_id=f"g{index}") for index in range(257)])
    _assert_validation_error(client.post(SIMULATE_URL, json=payload))


@pytest.mark.parametrize("value", [None, [], "h", 1, True])
def test_each_gate_must_be_an_object(client, value):
    _assert_validation_error(client.post(SIMULATE_URL, json=_payload(gates=[value])))


@pytest.mark.parametrize("field", ["id", "type", "targets", "controls"])
def test_required_gate_fields(client, field):
    gate = _gate("h")
    del gate[field]
    _assert_validation_error(client.post(SIMULATE_URL, json=_payload(gates=[gate])))


@pytest.mark.parametrize("value", ["", " ", "\t\n", "g" * 65, None, 1, True, [], {}])
def test_gate_id_must_be_nonblank_string_of_at_most_64_characters(client, value):
    payload = _payload(gates=[_gate("h", gate_id=value)])
    _assert_validation_error(client.post(SIMULATE_URL, json=payload))


def test_gate_ids_must_be_unique_even_for_different_gate_types(client):
    payload = _payload(gates=[_gate("h", gate_id="same"), _gate("x", gate_id="same")])
    _assert_validation_error(client.post(SIMULATE_URL, json=payload))


@pytest.mark.parametrize(
    "value",
    ["measure", "measurement", "reset", "rx", "ry", "rz", "u", "p", "s", "t", "y",
     "swap", "ccx", "H", "X", "Z", "CX", "", None, 1, True, [], {}],
)
def test_unsupported_gates_and_nonlowercase_types_are_rejected(client, value):
    gate = _gate(value, control=1 if value == "CX" else None)
    payload = _payload(num_qubits=2, gates=[gate])
    _assert_validation_error(client.post(SIMULATE_URL, json=payload))


@pytest.mark.parametrize("gate_type", ["h", "x", "z", "cx"])
@pytest.mark.parametrize("targets", [[], [0, 1], [0, 0], None, 0, "0", {}])
def test_gate_requires_exactly_one_target(client, gate_type, targets):
    gate = _gate(gate_type, control=1 if gate_type == "cx" else None)
    gate["targets"] = targets
    _assert_validation_error(client.post(SIMULATE_URL, json=_payload(num_qubits=2, gates=[gate])))


@pytest.mark.parametrize("gate_type", ["h", "x", "z"])
@pytest.mark.parametrize("controls", [[1], [0], [0, 1], None, 0, "[]", {}])
def test_single_qubit_gates_require_empty_controls(client, gate_type, controls):
    gate = _gate(gate_type)
    gate["controls"] = controls
    _assert_validation_error(client.post(SIMULATE_URL, json=_payload(num_qubits=2, gates=[gate])))


@pytest.mark.parametrize("controls", [[], [0, 1], [0, 0], None, 0, "0", {}])
def test_cx_requires_exactly_one_control(client, controls):
    gate = _gate("cx", target=2, control=0)
    gate["controls"] = controls
    _assert_validation_error(client.post(SIMULATE_URL, json=_payload(num_qubits=3, gates=[gate])))


@pytest.mark.parametrize("field", ["targets", "controls"])
@pytest.mark.parametrize("value", [True, False, 0.0, 0.5, "0", None, [], {}, -1])
def test_qubit_indices_are_strict_nonnegative_integers(client, field, value):
    gate = _gate("cx", target=2, control=0) if field == "controls" else _gate("h")
    gate[field] = [value]
    _assert_validation_error(client.post(SIMULATE_URL, json=_payload(num_qubits=3, gates=[gate])))


@pytest.mark.parametrize("num_qubits", [1, 2, 3])
@pytest.mark.parametrize("field", ["targets", "controls"])
def test_qubit_indices_must_be_less_than_num_qubits(client, num_qubits, field):
    gate = _gate("cx", target=0, control=num_qubits) if field == "controls" else _gate("h", num_qubits)
    _assert_validation_error(client.post(SIMULATE_URL, json=_payload(num_qubits=num_qubits, gates=[gate])))


@pytest.mark.parametrize("qubit", [0, 1, 2])
def test_cx_control_and_target_cannot_overlap(client, qubit):
    payload = _payload(num_qubits=3, gates=[_gate("cx", qubit, control=qubit)])
    _assert_validation_error(client.post(SIMULATE_URL, json=payload))


@pytest.mark.parametrize("field", ["unexpected", "measurement", "metadata"])
def test_extra_request_fields_are_forbidden(client, field):
    payload = _payload()
    payload[field] = "unexpected-value"
    _assert_validation_error(client.post(SIMULATE_URL, json=payload))


@pytest.mark.parametrize("field", ["unexpected", "angle", "params", "classicalTargets"])
def test_extra_gate_fields_are_forbidden(client, field):
    gate = _gate("h")
    gate[field] = "unexpected-value"
    _assert_validation_error(client.post(SIMULATE_URL, json=_payload(gates=[gate])))


def test_validation_does_not_echo_raw_request_input(client):
    sentinel = "private-invalid-input-must-not-be-echoed"
    payload = _payload()
    payload["numQubits"] = sentinel
    payload["gates"] = [_gate("h", gate_id="")]
    response = client.post(SIMULATE_URL, json=payload)
    _assert_validation_error(response)
    assert sentinel not in response.text


@pytest.mark.parametrize("body", ["", "{", '{"numQubits": 1,}', "not-json"])
def test_malformed_json_returns_structured_422(client, body):
    response = client.post(SIMULATE_URL, content=body, headers={"Content-Type": "application/json"})
    _assert_validation_error(response)


@pytest.mark.parametrize("body", ["null", "[]", '"not-an-object"', "1", "true"])
def test_request_body_must_be_an_object(client, body):
    response = client.post(SIMULATE_URL, content=body, headers={"Content-Type": "application/json"})
    _assert_validation_error(response)
