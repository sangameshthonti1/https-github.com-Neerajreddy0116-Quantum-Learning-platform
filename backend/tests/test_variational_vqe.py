"""Independent small analytical references, real adapters and real Powell runs."""

from itertools import product
from math import pi, sqrt

import numpy as np
from pydantic import ValidationError
import pytest

from app.schemas.variational import Hamiltonian, VQERequest
from app.services.pauli_math import expectation, ground_reference, hamiltonian_matrix
from app.services.simulation_errors import SimulationExecutionError
from app.services.simulators import get_simulator
from app.services.variational import ISING_PAIR, OptimizationInterrupted, bind_circuit, build_variational, optimize

TOL = 1e-10


def state(amplitudes):
    return np.array([complex(a.real, a.imag) for a in amplitudes])


@pytest.mark.parametrize('symbols', [s for n in (1, 2, 3) for s in product('IXYZ', repeat=n)])
def test_every_pauli_string_against_basis_bit_flip_and_phase_rule(symbols):
    word = ''.join(symbols)
    matrix = hamiltonian_matrix(Hamiltonian(num_qubits=len(word), terms=[{'pauli': word, 'coefficient': 1}]))
    for column in range(2**len(word)):
        output, phase = column, 1 + 0j
        for q, symbol in enumerate(reversed(word)):
            bit = (column >> q) & 1
            if symbol in 'XY':
                output ^= 1 << q
            if symbol == 'Y':
                phase *= -1j if bit else 1j
            if symbol == 'Z':
                phase *= -1 if bit else 1
        expected = np.zeros(2**len(word), dtype=complex)
        expected[output] = phase
        np.testing.assert_allclose(matrix[:, column], expected, atol=TOL, rtol=0)
    np.testing.assert_allclose(matrix, matrix.conj().T, atol=TOL, rtol=0)


@pytest.mark.parametrize('word,psi,expected', [
    ('X', [1/sqrt(2), 1/sqrt(2)], 1), ('X', [1/sqrt(2), -1/sqrt(2)], -1),
    ('Y', [1/sqrt(2), 1j/sqrt(2)], 1), ('Y', [1/sqrt(2), -1j/sqrt(2)], -1),
    ('IX', [1/sqrt(2), 1/sqrt(2), 0, 0], 1), ('XI', [1/sqrt(2), 1/sqrt(2), 0, 0], 0),
    ('IY', [1/sqrt(2), 1j/sqrt(2), 0, 0], 1), ('YI', [1/sqrt(2), 0, 1j/sqrt(2), 0], 1),
])
def test_complex_expectations_distinguish_states_with_identical_probabilities(word, psi, expected):
    h = Hamiltonian(num_qubits=len(word), terms=[{'pauli':word,'coefficient':1}])
    assert expectation(psi, hamiltonian_matrix(h)) == pytest.approx(expected, abs=TOL, rel=0)


@pytest.mark.parametrize('definition', [
    {'numQubits':0,'terms':[{'pauli':'I','coefficient':1}]},
    {'numQubits':4,'terms':[{'pauli':'IIII','coefficient':1}]},
    {'numQubits':2,'terms':[{'pauli':'X','coefficient':1}]},
    {'numQubits':1,'terms':[]},
    {'numQubits':1,'terms':[{'pauli':'X','coefficient':1}]*9},
    *[{'numQubits':1,'terms':[{'pauli':p,'coefficient':1}]} for p in ('i','A','-X','iX','')],
    *[{'numQubits':1,'terms':[{'pauli':'X','coefficient':c}]} for c in (True, '1', None, float('inf'), float('nan'), 5, 1j)],
    {'numQubits':1,'terms':[{'pauli':'X','coefficient':1},{'pauli':'X','coefficient':-1}]},
])
def test_hamiltonian_rejects_untrusted_dimensions_terms_and_nonreal_coefficients(definition):
    with pytest.raises(ValidationError):
        Hamiltonian.model_validate(definition)


@pytest.mark.parametrize('psi,h', [([2,0],np.eye(2)), ([1,0],np.eye(4)),
    ([1,0],[[1,1],[0,1]]), ([float('nan'),0],np.eye(2)), ([1,0],[[1,0],[0,float('inf')]]),
    ([[1,0]],np.eye(2)), ([1,0,0],np.eye(3))])
def test_invalid_state_or_nonhermitian_matrix_cannot_produce_an_energy(psi, h):
    with pytest.raises(SimulationExecutionError):
        expectation(psi, h)


def test_exact_two_spin_spectrum_and_independent_variational_bound():
    reference = ground_reference(ISING_PAIR.hamiltonian)
    np.testing.assert_allclose(reference.eigenvalues, [-sqrt(17)/2, -.5, .5, sqrt(17)/2], atol=TOL, rtol=0)
    # Independent explicit matrix in 00,01,10,11; transverse X terms are off diagonal.
    explicit = np.array([[.5,-1,-1,0],[-1,-.5,0,-1],[-1,0,-.5,-1],[0,-1,-1,.5]])
    np.testing.assert_allclose(hamiltonian_matrix(ISING_PAIR.hamiltonian), explicit, atol=TOL, rtol=0)
    rng = np.random.default_rng(47)
    for _ in range(100):
        psi = rng.normal(size=4) + 1j * rng.normal(size=4)
        psi /= np.linalg.norm(psi)
        assert expectation(psi, explicit) >= -sqrt(17)/2 - TOL


@pytest.mark.parametrize('backend', ['qiskit','pennylane'])
@pytest.mark.parametrize('angles', [[0,0,0,0], [pi/2,0,0,0], [.31,-.73,1.19,-2.17], [pi,-pi,pi,-pi]])
def test_ansatz_binding_matches_independent_matrix_sequence(backend, angles):
    request = VQERequest(algorithm='vqe',backend=backend,initialParameters=angles)
    built = build_variational(request)
    def ry(t):
        return np.array([[np.cos(t/2),-np.sin(t/2)],[np.sin(t/2),np.cos(t/2)]])
    cx = np.array([[1,0,0,0],[0,0,0,1],[0,0,1,0],[0,1,0,0]])
    expected = np.kron(ry(angles[3]),ry(angles[2])) @ cx @ np.kron(ry(angles[1]),ry(angles[0])) @ [1,0,0,0]
    trace = get_simulator(backend).trace(built.circuit)
    actual = state(trace.steps[-1].statevector)
    np.testing.assert_allclose(actual, expected, atol=TOL, rtol=0)
    assert [g.type for g in built.circuit.gates] == ['ry','ry','cx','ry','ry']
    assert [(s.start_step,s.end_step) for s in built.stages] == [(0,2),(2,3),(3,5)]
    assert built.bound_parameters == angles and len(built.parameter_order) == 4
    assert len(trace.steps) == 6


@pytest.mark.parametrize('changes', [{'backend':'fake'}, {'problemId':'molecule'}, {'hamiltonian':{}},
    {'maxIterations':0}, {'maxIterations':21}, {'maxIterations':True}, {'maxEvaluations':3}, {'maxEvaluations':257},
    {'timeLimitSeconds':0}, {'timeLimitSeconds':31}, {'initializationSeed':-1}, {'initializationSeed':2**32},
    *[{'initialParameters':p} for p in ([],[0],[0]*5,[pi+.001]*4,[float('nan')]*4,[True]*4,['0']*4)]])
def test_invalid_variational_parameters_are_rejected(changes):
    with pytest.raises(ValidationError):
        VQERequest.model_validate({'algorithm':'vqe',**changes})


@pytest.mark.parametrize('backend',['qiskit','pennylane'])
def test_real_optimizer_records_all_observed_evaluations_and_best_state(backend):
    points = []
    result = optimize(VQERequest(algorithm='vqe', backend=backend, maxEvaluations=256), on_evaluation=points.append)
    o = result.optimization
    assert o.history == points and 4 < o.evaluations <= 256
    assert o.evaluations == len(points) and o.iterations <= 12
    assert o.best_expectation < o.initial_expectation - .1
    assert -sqrt(17)/2 - TOL <= o.best_expectation < -2.05
    best = min(points, key=lambda p:p.objective)
    assert best.parameters == o.best_parameters == result.definition.bound_parameters
    assert best.expectation == o.best_expectation
    assert [p.evaluation for p in points] == list(range(1,len(points)+1))
    assert all(b.best_objective <= a.best_objective for a,b in zip(points,points[1:]))
    assert all(-pi <= angle <= pi for p in points for angle in p.parameters)
    assert result.reference_gap == pytest.approx(o.best_expectation + sqrt(17)/2, abs=TOL, rel=0)
    assert sum(result.simulation.counts.values()) == 1024
    assert result.simulation.backend == result.trace.backend == backend
    # Rebuild each observed objective independently from its recorded state preparation.
    for p in points[::13]:
        circuit, _ = bind_circuit(result.definition.request,p.parameters)
        psi = state(get_simulator(backend).trace(circuit).steps[-1].statevector)
        explicit = np.array([[.5,-1,-1,0],[-1,-.5,0,-1],[-1,0,-.5,-1],[0,-1,-1,.5]])
        assert np.vdot(psi, explicit @ psi).real == pytest.approx(p.expectation,abs=TOL,rel=0)


@pytest.mark.parametrize('backend',['qiskit','pennylane'])
def test_seeded_initialization_and_evaluation_budget_are_repeatable(backend):
    req = VQERequest(algorithm='vqe',backend=backend,maxEvaluations=4)
    a, b = optimize(req), optimize(req)
    assert a.optimization.stopping_reason == 'evaluation_limit'
    assert not a.optimization.converged and a.optimization.evaluations == 4
    assert a.optimization.best_parameters == b.optimization.best_parameters
    assert [p.objective for p in a.optimization.history] == [p.objective for p in b.optimization.history]
    assert a.simulation.counts == b.simulation.counts
    assert build_variational(req).bound_parameters != build_variational(req.model_copy(update={'initialization_seed':7})).bound_parameters


def test_iteration_limit_is_distinct_from_function_evaluation_limit():
    r = optimize(VQERequest(algorithm='vqe',maxIterations=1,maxEvaluations=256))
    assert r.optimization.stopping_reason == 'iteration_limit'
    assert r.optimization.iterations == 1 and r.optimization.evaluations < 256


def test_unrecognized_optimizer_stop_preserves_real_best_observed_state(monkeypatch):
    from app.services import variational
    real_minimize = variational.minimize
    def stopped(*args, **kwargs):
        result = real_minimize(*args, **kwargs)
        result.status, result.success = 99, False
        return result
    monkeypatch.setattr(variational,'minimize',stopped)
    result = optimize(VQERequest(algorithm='vqe',maxEvaluations=4))
    assert result.optimization.stopping_reason == 'optimizer_stopped'
    assert not result.optimization.converged
    assert result.optimization.best_expectation == min(p.expectation for p in result.optimization.history)


def test_cooperative_cancel_and_deadline_check_real_loop_boundaries():
    points = []
    with pytest.raises(OptimizationInterrupted, match='cancelled'):
        optimize(VQERequest(algorithm='vqe'), on_evaluation=points.append, cancelled=lambda:len(points)>=3)
    assert len(points) == 3
    now = [0.]
    def advance(_):
        now[0] += 2
    with pytest.raises(OptimizationInterrupted, match='timed_out'):
        optimize(VQERequest(algorithm='vqe',timeLimitSeconds=1), on_evaluation=advance, clock=lambda:now[0])
