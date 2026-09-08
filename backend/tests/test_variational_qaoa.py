"""Independent analytical cut, dense-unitary and cross-framework references."""

from itertools import product
from math import pi

import numpy as np
from numpy.testing import assert_allclose
from pydantic import TypeAdapter, ValidationError
import pytest
from scipy.linalg import expm

from app.schemas.simulation import SimulationRequest
from app.schemas.variational import Graph, QAOARequest, VariationalRequest
from app.services.maxcut import GRAPHS, cost_hamiltonian, enumerate_cuts
from app.services.pauli_math import hamiltonian_matrix
from app.services.simulators import get_simulator
from app.services.variational import bind_circuit, build_variational, optimize, parameter_order


def vector(step):
    return np.array([complex(a.real, a.imag) for a in step.statevector])


def classical_values(id):
    # Explicit independent references: q2q1q0 order, no production enumeration.
    return np.array({
        'edge': [0, 1, 1, 0], 'path': [0, 1, 2, 1, 1, 2, 1, 0],
        'triangle': [0, 2, 2, 2, 2, 2, 2, 0], 'weighted-path': [0, 1, 3, 2, 2, 3, 1, 0],
    }[id], dtype=float)


@pytest.mark.parametrize('id',GRAPHS)
def test_cost_and_exact_enumeration_against_hand_enumerated_values(id):
    graph = GRAPHS[id].graph
    ref = enumerate_cuts(graph)
    values = classical_values(id)
    assert_allclose(list(ref.cut_values.values()), values, atol=0,rtol=0)
    assert_allclose(hamiltonian_matrix(cost_hamiltonian(graph)), np.diag(values), atol=0,rtol=0)
    assert ref.value == max(values)
    assert ref.optimal_bitstrings == [format(i,f'0{graph.num_vertices}b') for i,v in enumerate(values) if v==max(values)]


@pytest.mark.parametrize('backend',['qiskit','pennylane'])
@pytest.mark.parametrize('id',GRAPHS)
@pytest.mark.parametrize('depth',[1,2])
def test_full_qaoa_state_against_dense_cost_and_mixer_exponentials(backend,id,depth):
    angles = [.73,-.28,-.51,.19][:2*depth]
    req = QAOARequest(algorithm='qaoa',problemId=id,depth=depth,backend=backend,initialParameters=angles)
    circuit,stages = bind_circuit(req,angles)
    n = circuit.num_qubits; dim = 2**n
    # X_i flips integer bit i, independent of Kronecker/Pauli helper conventions.
    mixer = np.zeros((dim,dim))
    for i,q in product(range(dim),range(n)):
        mixer[i ^ (1<<q),i] += 1
    expected = np.ones(dim,dtype=complex) / np.sqrt(dim)
    trace = get_simulator(backend).trace(circuit)
    assert_allclose(vector(trace.steps[n]),expected,atol=1e-12,rtol=0)
    for layer in range(depth):
        expected *= np.exp(-1j * angles[2*layer] * classical_values(id))
        assert_allclose(vector(trace.steps[stages[1+2*layer].end_step]),expected,atol=1e-12,rtol=0)
        expected = expm(-1j * angles[2*layer+1] * mixer) @ expected
        assert_allclose(vector(trace.steps[stages[2+2*layer].end_step]),expected,atol=1e-12,rtol=0)
    assert len(circuit.gates) <= 27
    assert parameter_order(req)[2*depth-1].startswith(f'beta{depth-1}')


@pytest.mark.parametrize('backend',['qiskit','pennylane'])
@pytest.mark.parametrize('id',GRAPHS)
def test_cost_decomposition_on_every_basis_state_including_global_phase(backend,id):
    req = QAOARequest(algorithm='qaoa',problemId=id,backend=backend)
    circuit,stages = bind_circuit(req,[.67,.1]); n = circuit.num_qubits
    cost_gates = circuit.gates[stages[1].start_step:stages[1].end_step]
    for i in range(2**n):
        prep = [{'id':f'x{q}','type':'x','targets':[q],'controls':[]} for q in range(n) if i & (1<<q)]
        actual = SimulationRequest(numQubits=n,backend=backend,gates=[*prep,*cost_gates],shots=1)
        expected = np.zeros(2**n,dtype=complex); expected[i] = np.exp(-1j*.67*classical_values(id)[i])
        assert_allclose(vector(get_simulator(backend).trace(actual).steps[-1]),expected,atol=1e-12,rtol=0)


@pytest.mark.parametrize('backend',['qiskit','pennylane'])
def test_edge_analytic_optimum_direction_and_sampled_cut(backend):
    # With exp(-i gamma C), <C> = (1 + sin(gamma) sin(4 beta))/2.
    result = optimize(QAOARequest(algorithm='qaoa',backend=backend,initialParameters=[pi/2,pi/8],maxEvaluations=4,shots=128))
    assert result.optimization.best_expectation == pytest.approx(1,abs=1e-12)
    assert result.optimization.history[0].objective == pytest.approx(-1)
    assert result.cut.expected_cut == pytest.approx(1)
    assert result.cut.optimal_cut_probability == pytest.approx(1)
    assert result.cut.best_sampled_bitstring in ('01','10')
    assert result.cut.best_sampled_cut == 1
    assert result.simulation.counts['00'] == result.simulation.counts['11'] == 0
    assert sum(result.simulation.counts.values()) == 128


@pytest.mark.parametrize('id',GRAPHS)
@pytest.mark.parametrize('depth',[1,2])
def test_fixed_parameter_trace_and_state_parity_including_reduced_states(id,depth):
    traces=[]
    for backend in ['qiskit','pennylane']:
        req = QAOARequest(algorithm='qaoa',problemId=id,depth=depth,backend=backend)
        traces.append(get_simulator(backend).trace(build_variational(req).circuit))
    for a,b in zip(traces[0].steps,traces[1].steps,strict=True):
        va,vb=vector(a),vector(b)
        assert_allclose(np.outer(va,va.conj()),np.outer(vb,vb.conj()),atol=1e-12,rtol=0)
        assert_allclose(list(a.probabilities.values()),list(b.probabilities.values()),atol=1e-12,rtol=0)
        for qa,qb in zip(a.qubits,b.qubits,strict=True):
            ma=np.array([[complex(c.real,c.imag) for c in row] for row in qa.density_matrix])
            mb=np.array([[complex(c.real,c.imag) for c in row] for row in qb.density_matrix])
            assert_allclose(ma,mb,atol=1e-12,rtol=0)
            assert_allclose(np.trace(ma@ma),np.trace(mb@mb),atol=1e-12,rtol=0)
            assert_allclose(list(qa.bloch_vector.model_dump().values()),list(qb.bloch_vector.model_dump().values()),atol=1e-12,rtol=0)


@pytest.mark.parametrize('backend',['qiskit','pennylane'])
@pytest.mark.parametrize('id',GRAPHS)
def test_real_bounded_qaoa_optimizer_improves_expected_cut(backend,id):
    req = QAOARequest(algorithm='qaoa',problemId=id,backend=backend,maxEvaluations=256)
    result = optimize(req)
    o = result.optimization; c = result.cut
    assert o.evaluations > 10 and o.evaluations <= 256
    assert o.best_expectation > o.initial_expectation + .01
    assert 0 <= c.expected_cut <= max(classical_values(id)) + 1e-10
    assert c.expected_cut == pytest.approx(sum(p*v for p,v in zip(result.simulation.probabilities.values(),classical_values(id))))
    assert c.best_sampled_count == result.simulation.counts[c.best_sampled_bitstring]
    assert c.best_sampled_cut == max(v for v,n in zip(classical_values(id),result.simulation.counts.values()) if n>0)
    assert result.reference_gap >= -1e-10
    assert all(point.objective == -point.expectation for point in o.history)


@pytest.mark.parametrize('extra',[{'depth':0},{'depth':3},{'depth':True},{'depth':1.5},
    {'problemId':'arbitrary'},{'initialParameters':[0]},{'initialParameters':[0]*4},
    {'depth':2,'initialParameters':[0]*2},{'initialParameters':[4,0]},
    {'graph':{'edges':[]}},{'maxEvaluations':True},{'initialParameters':[float('nan'),0]}])
def test_qaoa_rejects_invalid_parameters(extra):
    with pytest.raises(ValidationError):
        TypeAdapter(VariationalRequest).validate_python({'algorithm':'qaoa',**extra})


@pytest.mark.parametrize('edges',[[{'source':0,'target':0,'weight':1.0}],
    [{'source':1,'target':0,'weight':1.0}], [{'source':0,'target':2,'weight':1.0}],
    [{'source':0,'target':1,'weight':-1.0}], [{'source':0,'target':1,'weight':float('inf')}],
    [{'source':0,'target':1,'weight':1.0}]*2, []])
def test_internal_graph_definitions_are_validated(edges):
    with pytest.raises(ValidationError):
        Graph(num_vertices=2,edges=edges)
