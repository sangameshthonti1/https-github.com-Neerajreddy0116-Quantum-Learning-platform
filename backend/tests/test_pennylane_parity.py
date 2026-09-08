"""Real, independent engine parity and analytic checks in the public bit order."""

from concurrent.futures import ThreadPoolExecutor
from importlib.metadata import version
from itertools import permutations
import json
import math
from random import Random

import numpy as np
import pennylane as qml
import pytest

from app.schemas.algorithms import DeutschJozsaRequest, GroverRequest
from app.schemas.simulation import SimulationRequest
from app.services import pennylane_simulator as pl
from app.services import qiskit_simulator, qiskit_trace, simulators
from app.services.algorithms import build_algorithm, run_algorithm

TOL = 1e-12
ARITY = {**dict.fromkeys(('h', 'x', 'y', 'z', 's', 'sdg', 't', 'tdg', 'rx', 'ry', 'rz', 'p'), 1),
         'cx': 2, 'cz': 2, 'swap': 2, 'ccx': 3}


def gate(kind, wires=(0,), angle=0.713):
    return {'type': kind, 'targets': list(wires if kind == 'swap' else wires[-1:]),
            'controls': list(wires[:-1] if kind in ('cx', 'cz', 'ccx') else ()),
            **({'params': [angle]} if kind in ('rx', 'ry', 'rz', 'p') else {})}


def request(gates=(), n=3, backend='pennylane', **changes):
    return SimulationRequest.model_validate({
        'numQubits': n, 'gates': [dict(g, id=f'g{i}') for i, g in enumerate(gates)],
        'backend': backend, 'shots': 128, 'seedSimulator': 42, **changes,
    })


def vector(values):
    return np.array([complex(a.real, a.imag) for a in values])


def matrix(values):
    return np.array([vector(row) for row in values])


def equivalent(a, b):
    # Projectors are global-phase invariant and still detect relative-phase errors.
    np.testing.assert_allclose(np.outer(a, a.conj()), np.outer(b, b.conj()), atol=TOL, rtol=0)


def physical(step, n):
    state = vector(step.statevector)
    assert state.shape == (2**n,)
    assert np.isfinite(state).all()
    assert np.vdot(state, state).real == pytest.approx(1, abs=TOL, rel=0)
    assert list(step.probabilities) == [format(i, f'0{n}b') for i in range(2**n)]
    np.testing.assert_allclose(list(step.probabilities.values()), abs(state)**2, atol=TOL, rtol=0)
    for q, reduced in enumerate(step.qubits):
        assert reduced.qubit == q
        rho = matrix(reduced.density_matrix)
        # Independent basis-index contraction, not PennyLane or Qiskit reduction.
        expected = np.zeros((2, 2), dtype=complex)
        for a in range(2**n):
            for b in range(2**n):
                if a & ~(1 << q) == b & ~(1 << q):
                    expected[(a >> q) & 1, (b >> q) & 1] += state[a] * state[b].conjugate()
        np.testing.assert_allclose(rho, expected, atol=TOL, rtol=0)
        np.testing.assert_allclose(rho, rho.conj().T, atol=TOL, rtol=0)
        assert np.trace(rho) == pytest.approx(1, abs=TOL, rel=0)
        assert np.linalg.eigvalsh(rho).min() >= -TOL
        bloch = np.array([getattr(reduced.bloch_vector, axis) for axis in 'xyz'])
        paulis = [np.array([[0, 1], [1, 0]]), np.array([[0, -1j], [1j, 0]]), np.diag([1, -1])]
        np.testing.assert_allclose(bloch, [np.trace(rho @ p).real for p in paulis], atol=TOL, rtol=0)
        purity = np.trace(rho @ rho).real
        assert .5 - TOL <= purity <= 1 + TOL
        assert purity == pytest.approx((1 + np.dot(bloch, bloch)) / 2, abs=TOL, rel=0)


def parity(req, *, check_physical=True):
    qreq = req.model_copy(update={'backend': 'qiskit'})
    qsim, psim = simulators.simulate_circuit(qreq), simulators.simulate_circuit(req)
    qtrace, ptrace = simulators.trace_circuit(qreq), simulators.trace_circuit(req)
    equivalent(vector(qsim.statevector), vector(psim.statevector))
    assert psim.probabilities == pytest.approx(qsim.probabilities, abs=TOL, rel=0)
    assert psim.metadata.circuit_depth == qsim.metadata.circuit_depth
    assert psim.backend == ptrace.backend == 'pennylane'
    assert psim.metadata.pennylane_version == ptrace.metadata.pennylane_version == version('pennylane')
    assert len(ptrace.steps) == len(qtrace.steps) == len(req.gates) + 1
    assert ptrace.basis_order == qtrace.basis_order
    for a, b in zip(qtrace.steps, ptrace.steps, strict=True):
        assert a.index == b.index and a.gate == b.gate
        equivalent(vector(a.statevector), vector(b.statevector))
        assert a.probabilities == pytest.approx(b.probabilities, abs=TOL, rel=0)
        for qa, qb in zip(a.qubits, b.qubits, strict=True):
            np.testing.assert_allclose(matrix(qa.density_matrix), matrix(qb.density_matrix), atol=TOL, rtol=0)
            assert qa.bloch_vector.model_dump() == pytest.approx(qb.bloch_vector.model_dump(), abs=TOL, rel=0)
        if check_physical:
            physical(b, req.num_qubits)
    equivalent(vector(psim.statevector), vector(ptrace.steps[-1].statevector))
    return qsim, psim, qtrace, ptrace


GATE_CASES = [(n, kind, wires, preparation) for n in (1, 2, 3) for kind, arity in ARITY.items()
              for wires in permutations(range(n), arity) for preparation in ('zero', 'ones', 'coherent')]


@pytest.mark.parametrize('n', [1, 2, 3])
def test_empty_identity_circuit_has_one_real_initial_snapshot(n):
    _, result, _, traced = parity(request(n=n, shots=777))
    expected = np.zeros(2**n, dtype=complex)
    expected[0] = 1
    np.testing.assert_allclose(vector(result.statevector), expected, atol=TOL, rtol=0)
    assert result.counts['0' * n] == 777 and sum(result.counts.values()) == 777
    assert result.metadata.gate_count == result.metadata.circuit_depth == 0
    assert len(traced.steps) == 1 and traced.steps[0].gate is None


@pytest.mark.parametrize('n,kind,wires,preparation', GATE_CASES)
def test_every_gate_every_operand_order_and_coherent_input(n, kind, wires, preparation):
    prefix = [] if preparation == 'zero' else [gate('x', (q,)) for q in range(n)] if preparation == 'ones' else [
        g for q in range(n) for g in (gate('ry', (q,), .47 + q * .31), gate('rz', (q,), -.29 - q * .43))]
    parity(request([*prefix, gate(kind, wires)], n))


@pytest.mark.parametrize('kind', ['cx', 'cz', 'swap', 'ccx'])
@pytest.mark.parametrize('bits', range(8))
@pytest.mark.parametrize('layout', list(permutations(range(3))))
def test_multiqubit_truth_tables_and_measurement_bit_order(kind, bits, layout):
    wires = layout[:ARITY[kind]]
    prefix = [gate('x', (q,)) for q in range(3) if bits & (1 << q)]
    req = request([*prefix, gate(kind, wires)])
    result = simulators.simulate_circuit(req)
    expected = bits
    if kind in ('cx', 'ccx') and all(bits & (1 << c) for c in wires[:-1]):
        expected ^= 1 << wires[-1]
    if kind == 'swap' and bool(bits & (1 << wires[0])) != bool(bits & (1 << wires[1])):
        expected ^= (1 << wires[0]) | (1 << wires[1])
    label = format(expected, '03b')
    assert result.probabilities[label] == pytest.approx(1, abs=TOL, rel=0)
    assert result.counts[label] == req.shots
    assert sum(result.counts.values()) == req.shots
    expected_state = np.zeros(8, dtype=complex)
    expected_state[expected] = -1 if kind == 'cz' and all(bits & (1 << q) for q in wires) else 1
    np.testing.assert_allclose(vector(result.statevector), expected_state, atol=TOL, rtol=0)


@pytest.mark.parametrize('kind', ['rx', 'ry', 'rz', 'p'])
@pytest.mark.parametrize('angle', [0, -math.pi/2, math.pi/2, math.pi, -math.pi, 2*math.pi, -4*math.pi, 19.37])
def test_rotation_radians_and_unreduced_spinor_phases(kind, angle):
    parity(request([gate('h'), gate(kind, angle=angle)], n=1))


@pytest.mark.parametrize('backend', ['qiskit', 'pennylane'])
def test_global_phase_is_retained_but_physical_comparison_ignores_it(backend):
    theta = 1.173
    p = simulators.simulate_circuit(request([gate('h'), gate('p', angle=theta)], n=1, backend=backend))
    rz = simulators.simulate_circuit(request([gate('h'), gate('rz', angle=theta)], n=1, backend=backend))
    a, b = vector(p.statevector), vector(rz.statevector)
    assert not np.allclose(a, b, atol=TOL, rtol=0)
    np.testing.assert_allclose(a, np.exp(1j * theta / 2) * b, atol=TOL, rtol=0)
    equivalent(a, b)
    spun = simulators.simulate_circuit(request([gate('rx', angle=2*math.pi)], n=1, backend=backend))
    np.testing.assert_allclose(vector(spun.statevector), [-1, 0], atol=TOL, rtol=0)


@pytest.mark.parametrize('n', [2, 3])
def test_bell_and_ghz_have_mixed_reduced_qubits(n):
    _, _, _, traced = parity(request([gate('h'), *[gate('cx', (0, q)) for q in range(1, n)]], n))
    for reduced in traced.steps[-1].qubits:
        rho = matrix(reduced.density_matrix)
        np.testing.assert_allclose(rho, np.eye(2)/2, atol=TOL, rtol=0)
        assert np.trace(rho @ rho).real == pytest.approx(.5, abs=TOL, rel=0)
        assert reduced.bloch_vector.model_dump() == pytest.approx(dict(x=0, y=0, z=0), abs=TOL, rel=0)


def test_partly_entangled_reduction_and_bloch_y_sign():
    theta = .79
    _, _, _, traced = parity(request([gate('ry', angle=theta), gate('cx', (0, 2)), gate('h', (1,)), gate('s', (1,))]))
    reduced = traced.steps[-1].qubits
    assert reduced[1].bloch_vector.y == pytest.approx(1, abs=TOL, rel=0)
    for q in (0, 2):
        rho = matrix(reduced[q].density_matrix)
        assert np.trace(rho @ rho).real == pytest.approx((1 + math.cos(theta)**2)/2, abs=TOL, rel=0)
        assert reduced[q].bloch_vector.z == pytest.approx(math.cos(theta), abs=TOL, rel=0)


def mixed_circuit(seed, length=64):
    rng = Random(seed)
    n = seed % 3 + 1
    kinds = [k for k, arity in ARITY.items() if arity <= n]
    gates = []
    for _ in range(length):
        kind = rng.choice(kinds)
        gates.append(gate(kind, tuple(rng.sample(range(n), ARITY[kind])), rng.uniform(-5*math.pi, 5*math.pi)))
    return request(gates, n)


def test_seeded_mixed_circuit_parity():
    maxima = dict(projector=0., probability=0., reducedMatrix=0., bloch=0., nativeAmplitude=0.)
    for seed in range(24):
        qs, ps, qt, pt = parity(mixed_circuit(seed))
        maxima['nativeAmplitude'] = max(maxima['nativeAmplitude'], float(abs(vector(qs.statevector)-vector(ps.statevector)).max()))
        for a, b in zip(qt.steps, pt.steps, strict=True):
            x, y = vector(a.statevector), vector(b.statevector)
            maxima['projector'] = max(maxima['projector'], float(abs(np.outer(x, x.conj())-np.outer(y, y.conj())).max()))
            maxima['probability'] = max(maxima['probability'], max(abs(a.probabilities[k]-b.probabilities[k]) for k in a.probabilities))
            for qa, qb in zip(a.qubits, b.qubits, strict=True):
                maxima['reducedMatrix'] = max(maxima['reducedMatrix'], float(abs(matrix(qa.density_matrix)-matrix(qb.density_matrix)).max()))
                maxima['bloch'] = max(maxima['bloch'], max(abs(getattr(qa.bloch_vector,k)-getattr(qb.bloch_vector,k)) for k in 'xyz'))
    print('24 circuits / 1536 gates / 1560 snapshots; maximum absolute differences:', json.dumps(maxima))


@pytest.mark.parametrize('n', [1, 2, 3])
@pytest.mark.parametrize('shots', [1, 8192])
def test_resource_boundaries(n, shots):
    req = mixed_circuit(n - 1, 256).model_copy(update={'shots': shots})
    _, sampled, _, traced = parity(req)
    assert len(traced.steps) == 257
    assert len(sampled.counts) == 2**n and sum(sampled.counts.values()) == shots


@pytest.mark.parametrize('backend', ['qiskit', 'pennylane'])
@pytest.mark.parametrize('seed', [0, 42, 4294967295, None])
def test_real_sampling_seed_replay_and_dense_counts(backend, seed):
    req = request([gate('h')], n=1, backend=backend, shots=8192, seedSimulator=seed)
    a = simulators.simulate_circuit(req)
    b = simulators.simulate_circuit(req.model_copy(update={'seed_simulator': a.metadata.seed_simulator}))
    assert a.counts == b.counts
    assert sum(a.counts.values()) == 8192 and set(a.counts) == {'0', '1'}
    assert abs(a.counts['0']/8192 - .5) < .035
    assert a.probabilities == pytest.approx({'0': .5, '1': .5}, abs=TOL, rel=0)
    assert a.metadata.seed_simulator == (seed if seed is not None else b.metadata.seed_simulator)


def test_trace_ignores_sampling_settings_and_requests_are_isolated():
    req = request([gate('h'), gate('cx', (0, 2))])
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: simulators.simulate_circuit(req), range(8)))
    assert all(r.counts == results[0].counts for r in results)
    a = simulators.trace_circuit(req)
    b = simulators.trace_circuit(req.model_copy(update={'shots': 8192, 'seed_simulator': 123}))
    assert a.steps == b.steps
    assert 'counts' not in a.model_dump() and a.metadata.sampling_performed is False


def test_pennylane_executes_real_device_without_any_qiskit_execution(monkeypatch):
    def forbidden(*args, **kwargs):
        pytest.fail('PennyLane must not execute Qiskit')
    monkeypatch.setattr(qiskit_simulator.AerSimulator, 'run', forbidden)
    monkeypatch.setattr(qiskit_trace.Statevector, 'evolve', forbidden)
    req = request([gate('h'), gate('cx', (0, 2))])
    device = pl.build_circuit(req, snapshots=True).device
    assert isinstance(device, qml.devices.DefaultQubit)
    with qml.Tracker(device) as tracker:
        # Use this device to prove all gate snapshots take one actual simulation.
        circuit = pl.build_circuit(req, snapshots=True)
        circuit = qml.QNode(circuit.func, device, interface=None, diff_method=None)
        captured = qml.snapshots(circuit)()
    assert tracker.totals['simulations'] == 1
    assert len(captured) == 4
    assert simulators.simulate_circuit(req).probabilities['101'] == pytest.approx(.5, abs=TOL, rel=0)
    assert len(simulators.trace_circuit(req).steps) == 3


@pytest.mark.parametrize('n,oracle', [(n, o) for n in (1, 2) for o in ('zero', 'one', 'q0', 'not-q0', 'q1', 'not-q1', 'xor', 'xnor') if n == 2 or o in ('zero', 'one', 'q0', 'not-q0')])
def test_deutsch_jozsa_all_promised_oracles_use_unchanged_builders(n, oracle):
    p = DeutschJozsaRequest(algorithm='deutsch-jozsa', inputQubits=n, oracleId=oracle, backend='pennylane', seedSimulator=42)
    a, b = run_algorithm(p), run_algorithm(p.model_copy(update={'backend':'qiskit'}))
    assert a.definition.circuit.gates == b.definition.circuit.gates
    assert a.definition.stages == b.definition.stages
    assert a.interpretation.classification == b.interpretation.classification
    assert a.interpretation.input_probabilities == pytest.approx(b.interpretation.input_probabilities, abs=TOL, rel=0)
    equivalent(vector(a.simulation.statevector), vector(b.simulation.statevector))


@pytest.mark.parametrize('n,marked', [(n, format(m, f'0{n}b')) for n in (1, 2) for m in range(2**n)])
@pytest.mark.parametrize('iterations', range(5))
def test_grover_all_marks_and_iteration_limits(n, marked, iterations):
    p = GroverRequest(algorithm='grover', numQubits=n, markedItem=marked, iterations=iterations, backend='pennylane', seedSimulator=42)
    a, b = run_algorithm(p), run_algorithm(p.model_copy(update={'backend':'qiskit'}))
    assert a.definition.circuit.gates == b.definition.circuit.gates
    assert a.definition.stages == b.definition.stages
    for observation in a.interpretation.iterations:
        expected = math.sin((2*observation.iteration + 1)*math.asin(1/math.sqrt(2**n)))**2
        assert observation.success_probability == pytest.approx(expected, abs=TOL, rel=0)
    equivalent(vector(a.simulation.statevector), vector(b.simulation.statevector))
    assert build_algorithm(p).circuit.backend == 'pennylane'
