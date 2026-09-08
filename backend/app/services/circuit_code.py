"""Small, fail-closed OpenQASM 3 reader. See docs/CIRCUIT_CODE.md for grammar.

No generic language parser, eval, import resolution, symbolic evaluation, or
execution. Each token is consumed explicitly. Parsing yields canonical data.
"""

from dataclasses import dataclass
import math
import re

from pydantic import ValidationError

from app.schemas.circuit_code import CodeDiagnostic
from app.schemas.simulation import SimulationRequest

MAX_SOURCE = 32768
MAX_TOKENS = 16384
MAX_STATEMENTS = 259  # version, fixed library marker, declaration, 256 gates
MAX_EXPRESSION_TOKENS = 64
MAX_EXPRESSION_DEPTH = 16
SINGLE = frozenset(("h", "x", "y", "z", "s", "sdg", "t", "tdg"))
PARAMETERIZED = frozenset(("rx", "ry", "rz", "p"))
CONTROLS = {"cx": 1, "cz": 1, "ccx": 2, "swap": 0}
SUPPORTED = SINGLE | PARAMETERIZED | CONTROLS.keys()
TOKEN = re.compile(r'//[^\r\n]*|[ \t\r\n]+|(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?|[A-Za-z_][A-Za-z_0-9]*|"[^"\r\n]*"|[;\[\](),+*/-]')
NUMBER = re.compile(r'(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?\Z')
INTEGER = re.compile(r'(?:0|[1-9][0-9]*)\Z')


@dataclass(frozen=True)
class Token:
    text: str
    line: int
    column: int


class CodeError(ValueError):
    def __init__(self, token: Token, message: str, code: str = "syntax_error"):
        self.diagnostic = CodeDiagnostic(line=token.line, column=token.column, message=message, code=code)
        super().__init__(message)


def tokenize(source: str) -> list[Token]:
    if len(source) > MAX_SOURCE:
        raise CodeError(Token("", 1, 1), f"Code is limited to {MAX_SOURCE:,} characters, including comments.", "source_limit")
    tokens = []
    offset, line, column = 0, 1, 1
    while offset < len(source):
        match = TOKEN.match(source, offset)
        if not match:
            raise CodeError(Token("", line, column), "Unsupported character. Use gate statements, numbers, pi, and + - * / only.")
        value = match.group()
        if not value.isspace() and not value.startswith("//"):
            tokens.append(Token(value, line, column))
            if len(tokens) > MAX_TOKENS:
                raise CodeError(tokens[-1], "Code contains too many tokens.", "token_limit")
        newlines = value.count("\n")
        column = len(value.rsplit("\n", 1)[-1]) + 1 if newlines else column + len(value)
        line += newlines
        offset = match.end()
    tokens.append(Token("", line, column))
    return tokens


class Parser:
    def __init__(self, source: str):
        self.tokens = tokenize(source)
        self.index = 0
        self.statements = 0
        self.expression_start = 0

    @property
    def current(self) -> Token:
        return self.tokens[self.index]

    def take(self) -> Token:
        token = self.current
        if token.text:
            self.index += 1
        return token

    def expect(self, text: str, message: str | None = None):
        if self.current.text != text:
            raise CodeError(self.current, message or f"Expected '{text}'.")
        return self.take()

    def end_statement(self):
        token = self.expect(";", "End each statement with a semicolon (;).")
        self.statements += 1
        if self.statements > MAX_STATEMENTS:
            raise CodeError(token, "Use at most 256 gate statements.", "statement_limit")

    def integer(self) -> int:
        token = self.take()
        if not INTEGER.fullmatch(token.text) or len(token.text) > 3:
            raise CodeError(token, "Use a small nonnegative integer for the qubit count or index.")
        return int(token.text)

    def expression(self, minimum: int = 0, depth: int = 0) -> float:
        token = self.current
        if depth > MAX_EXPRESSION_DEPTH:
            raise CodeError(token, "Angle expressions may nest at most 16 levels.", "expression_limit")
        if self.index - self.expression_start >= MAX_EXPRESSION_TOKENS:
            raise CodeError(token, "Use at most 64 tokens in an angle expression.", "expression_limit")
        self.take()
        if token.text in ("+", "-"):
            value = self.expression(3, depth + 1)
            if token.text == "-":
                value = -value
        elif token.text == "(":
            value = self.expression(0, depth + 1)
            self.expect(")", "Close this angle expression with ')'.")
        elif token.text == "pi":
            value = math.pi
        elif NUMBER.fullmatch(token.text):
            value = float(token.text)
        else:
            raise CodeError(token, "Expected a numeric angle or pi. Functions, variables, and code execution are not supported.")
        while self.current.text in ("+", "-", "*", "/"):
            operator = self.current
            precedence = 1 if operator.text in ("+", "-") else 2
            if precedence < minimum:
                break
            self.take()
            right = self.expression(precedence + 1, depth + 1)
            if operator.text == "+":
                value += right
            elif operator.text == "-":
                value -= right
            elif operator.text == "*":
                value *= right
            else:
                if right == 0:
                    raise CodeError(operator, "An angle cannot contain division by zero.", "invalid_angle")
                value /= right
            if not math.isfinite(value):
                raise CodeError(operator, "Angles and intermediate values must be finite numbers.", "invalid_angle")
        if self.index - self.expression_start > MAX_EXPRESSION_TOKENS:
            raise CodeError(token, "Use at most 64 tokens in an angle expression.", "expression_limit")
        if not math.isfinite(value):
            raise CodeError(token, "Angles must be finite numbers.", "invalid_angle")
        return value

    def parse(self, shots: int, seed: int | None) -> SimulationRequest:
        self.expect("OPENQASM", "Start with OPENQASM 3.0;")
        if self.take().text not in ("3", "3.0"):
            raise CodeError(self.tokens[self.index - 1], "Only the documented OpenQASM 3 subset is supported.")
        self.end_statement()
        self.expect("include", 'Add the fixed declaration: include "stdgates.inc";')
        self.expect('"stdgates.inc"', 'Only "stdgates.inc" is recognized as a built-in gate declaration. External includes are forbidden.')
        self.end_statement()
        self.expect("qubit", "Declare one register: qubit[1], qubit[2], or qubit[3], followed by q;")
        self.expect("[")
        declaration = self.current
        count = self.integer()
        if not 1 <= count <= 3:
            raise CodeError(declaration, "Use between 1 and 3 qubits.", "circuit_validation")
        self.expect("]")
        self.expect("q", "This subset uses one qubit register named q, for example qubit[2] q;")
        self.end_statement()
        gates, locations = [], []
        while self.current.text:
            start = self.take()
            kind = start.text
            if kind not in SUPPORTED:
                raise CodeError(start, "Unsupported statement. Use only H/X/Y/Z, S/SDG/T/TDG, RX/RY/RZ/P, CX/CZ/SWAP/CCX in lowercase. No measurements, loops, definitions, or imports.", "unsupported_operation")
            parameters = {}
            if kind in PARAMETERIZED:
                self.expect("(", f"{kind} needs one angle in radians, for example {kind}(pi/2) q[0];")
                self.expression_start = self.index
                parameters["params"] = [self.expression()]
                self.expect(")", "Provide exactly one angle and close it with ')'.")
            elif self.current.text == "(":
                raise CodeError(self.current, f"{kind} does not take angle parameters.")
            controls = CONTROLS.get(kind, 0)
            arity = 2 if kind == "swap" else controls + 1
            qubits = []
            for position in range(arity):
                if position:
                    self.expect(",", f"{kind} needs {arity} distinct qubits separated by commas, with controls first.")
                self.expect("q", "Address a qubit as q[0], q[1], or q[2]. Whole-register operations are unsupported.")
                self.expect("[")
                qubit_token = self.current
                qubit = self.integer()
                self.expect("]")
                if qubit >= count:
                    raise CodeError(qubit_token, f"q[{qubit}] does not exist. This circuit has q[0] through q[{count - 1}].", "circuit_validation")
                if qubit in qubits:
                    raise CodeError(qubit_token, "Every control and target in an operation must be a different qubit.", "circuit_validation")
                qubits.append(qubit)
            self.end_statement()
            gates.append({"id": f"code-{len(gates) + 1}", "type": kind,
                          "controls": qubits[:controls], "targets": qubits[controls:], **parameters})
            locations.append(start)
        # The same schema as /simulate, /simulate/trace, grading and editor data.
        try:
            return SimulationRequest.model_validate({"numQubits": count, "gates": gates, "shots": shots,
                                                     "backend": "qiskit", "seedSimulator": seed})
        except ValidationError as error:
            issue = error.errors()[0]
            loc = issue["loc"]
            token = locations[loc[1]] if len(loc) > 1 and loc[0] == "gates" and isinstance(loc[1], int) else declaration
            raise CodeError(token, issue["msg"], "circuit_validation") from None


def parse_code(source: str, shots: int = 1024, seed: int | None = None) -> SimulationRequest:
    return Parser(source).parse(shots, seed)
