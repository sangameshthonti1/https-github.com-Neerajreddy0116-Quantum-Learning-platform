"""The restricted grammar, resource limits, diagnostics and canonical boundary."""

import math

import pytest

from app.services.circuit_code import CodeError, MAX_SOURCE, parse_code
from app.services.qiskit_simulator import simulate_circuit
from app.services.qiskit_trace import trace_circuit

HEADER = 'OPENQASM 3.0;\ninclude "stdgates.inc";\nqubit[3] q;\n'


@pytest.mark.parametrize("source,kind,controls,targets,params", [
    *[(f'{kind} q[2];', kind, [], [2], None) for kind in ("h", "x", "y", "z", "s", "sdg", "t", "tdg")],
    *[(f'{kind}(-pi/2) q[1];', kind, [], [1], [-math.pi / 2]) for kind in ("rx", "ry", "rz", "p")],
    ('cx q[2], q[0];', 'cx', [2], [0], None), ('cz q[1], q[2];', 'cz', [1], [2], None),
    ('swap q[2], q[0];', 'swap', [], [2, 0], None), ('ccx q[2], q[0], q[1];', 'ccx', [2, 0], [1], None),
])
def test_all_gates_parse_to_the_canonical_schema(source, kind, controls, targets, params):
    circuit = parse_code(HEADER + source, 2048, 41)
    operation = circuit.gates[0]
    assert circuit.shots == 2048 and circuit.seed_simulator == 41
    assert operation.type == kind and operation.controls == controls and operation.targets == targets
    assert getattr(operation, "params", None) == params


@pytest.mark.parametrize("expression,expected", [
    ('pi/2', math.pi / 2), ('-pi / 2', -math.pi / 2), ('2*pi', 2 * math.pi), ('(pi+pi)/4', math.pi / 2),
    ('1e-3', .001), ('.5', .5), ('2.', 2), ('1+2*3', 7), ('8/2/2', 2), ('-(-pi)', math.pi),
    ('1-2-3', -4), ('1/(2+3)', .2), ('+1', 1), ('5e-324', 5e-324), ('1.7976931348623157e308', float.fromhex('0x1.fffffffffffffp+1023')),
])
def test_safe_numeric_expression_precedence(expression, expected):
    assert parse_code(HEADER + f'ry({expression}) q[0];').gates[0].params[0] == expected


@pytest.mark.parametrize("body", [
    'import os;', 'exec("print(1)");', '__import__("os");', 'eval("1");', 'open("secrets");',
    'include "other.inc";', 'include "https://example.com";', 'include "../../file";',
    'for int i in [0:3] { h q[0]; }', 'while(true) { x q[0]; }', 'gate mine a { x a; }',
    'def f() {}', 'defcal h $0 {}', 'extern f();', 'let a=q[0];', 'if (true) x q[0];',
    'measure q[0];', 'reset q[0];', 'barrier q[0];', 'bit[3] c;', 'qubit[1] r;',
    'ctrl @ x q[0],q[1];', 'inv @ s q[0];', 'h q;', 'h q[0:1];', 'h q[0],q[1];',
    'rzz(pi) q[0],q[1];', 'ry(sin(pi)) q[0];', 'ry(theta) q[0];', 'ry(pi**2) q[0];',
    'ry(pi^2) q[0];', 'ry(1/0) q[0];', 'ry(1e309) q[0];', 'ry(1e308*2) q[0];',
    'ry(NaN) q[0];', 'ry(Infinity) q[0];', 'ry() q[0];', 'ry(pi,2) q[0];', 'h(pi) q[0];',
    'cx q[0],q[0];', 'ccx q[0],q[0],q[2];', 'swap q[1],q[1];', 'cx q[0];', 'ccx q[0],q[1];',
    'h q[3];', 'h q[-1];', 'h q[1.0];', 'h q[1+1];', 'h q[00];', 'H q[0];',
    'h q[0]', 'h q[0]; garbage', ';', '/* block comment */', 'x $0;', 'h q[0];\x00',
])
def test_unsupported_or_malicious_constructs_fail_closed(client, body):
    response = client.post('/api/circuits/parse', json={'source': HEADER + body})
    assert response.status_code == 422, response.text
    diagnostics = response.json()['diagnostics']
    assert len(diagnostics) == 1
    assert diagnostics[0]['line'] >= 4 and diagnostics[0]['column'] >= 1
    assert diagnostics[0]['message'] and diagnostics[0]['code']
    assert 'circuit' not in response.json()


@pytest.mark.parametrize("source", [
    '', 'OPENQASM 2.0;', 'OPENQASM 3.1;', 'h q[0];',
    'OPENQASM 3; include "../../secret"; qubit[1] q;',
    'OPENQASM 3; qubit[1] q;', 'OPENQASM 3; include "stdgates.inc"; qubit[4] q;',
    'OPENQASM 3; include "stdgates.inc"; qubit[0] q;',
    'OPENQASM 3; include "stdgates.inc"; qubit[1] other;',
])
def test_required_headers_register_and_qubit_limits(source):
    with pytest.raises(CodeError):
        parse_code(source)


def test_errors_have_precise_locations_and_comments_preserve_them():
    with pytest.raises(CodeError) as error:
        parse_code(HEADER + '// comment\n  rx(pi/0) q[0];')
    assert error.value.diagnostic.line == 5
    assert error.value.diagnostic.column == 8
    assert error.value.diagnostic.code == 'invalid_angle'


def test_comments_are_only_text_and_empty_circuit_is_valid():
    parsed = parse_code('// import os;\n' + HEADER + '// exec("danger")\n')
    assert parsed.gates == []
    assert parse_code(HEADER.replace('3.0', '3') + 'h\nq[0]\n;').gates[0].type == 'h'


def test_source_statement_expression_and_token_limits():
    assert len(parse_code(HEADER + 'h q[0];' * 256).gates) == 256
    for text, code in [
        (HEADER + 'h q[0];' * 257, 'statement_limit'),
        (HEADER + ' ' * MAX_SOURCE, 'source_limit'),
        (HEADER + 'ry(' + '1+' * 40 + '1) q[0];', 'expression_limit'),
        (HEADER + 'ry(' + '(' * 20 + '1' + ')' * 20 + ') q[0];', 'expression_limit'),
        (HEADER + 'ry(' + '-' * 20 + '1) q[0];', 'expression_limit'),
        (';' * 16385, 'token_limit'),
    ]:
        with pytest.raises(CodeError) as error:
            parse_code(text)
        assert error.value.diagnostic.code == code


def test_parser_endpoint_validates_settings_without_running_quantum_engine(client, monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError('Parsing must not run a circuit')
    monkeypatch.setattr('app.services.qiskit_simulator.AerSimulator.run', forbidden)
    result = client.post('/api/circuits/parse', json={'source': HEADER + 'ry(pi/2) q[0];', 'shots': 512, 'seedSimulator': 42})
    assert result.status_code == 200
    assert result.json()['circuit']['gates'][0]['params'] == [math.pi / 2]
    for change in ({'shots': 0}, {'shots': True}, {'shots': '512'}, {'seedSimulator': -1}, {'backend': 'python'}, {'source': 1}):
        assert client.post('/api/circuits/parse', json={'source': HEADER, **change}).status_code == 422


def test_code_bell_and_ccx_run_real_simulation_and_trace():
    bell = parse_code(HEADER + 'h q[0]; cx q[0], q[2];')
    simulated = simulate_circuit(bell)
    assert simulated.probabilities['000'] == pytest.approx(.5)
    assert simulated.probabilities['101'] == pytest.approx(.5)
    assert [complex(a.real, a.imag) for a in trace_circuit(bell).steps[-1].statevector] == pytest.approx(
        [complex(a.real, a.imag) for a in simulated.statevector], abs=1e-12)
    toffoli = parse_code(HEADER + 'x q[2]; x q[1]; ccx q[2],q[1],q[0];')
    assert simulate_circuit(toffoli).counts['111'] == 1024


def test_raw_body_limit_even_without_content_length(client):
    for content in ('x' * 200001, iter([b'x' * 100000, b'x' * 100001])):
        response = client.post('/api/circuits/parse', content=content, headers={'Content-Type': 'application/json'})
        assert response.status_code == 413
        assert response.json()['diagnostics'][0]['code'] == 'body_limit'


def test_correct_target_with_new_gate_still_earns_no_challenge_credit(client):
    circuit = parse_code('OPENQASM 3; include "stdgates.inc"; qubit[1] q; ry(pi) q[0];')
    response = client.post('/api/challenges/grade', json={'challengeId': 'flip', 'submissionId': 'angle', 'circuit': circuit.model_dump(by_alias=True)})
    assert response.status_code == 200
    data = response.json()
    assert data['targetAchieved'] and not data['valid'] and data['score'] == 0
