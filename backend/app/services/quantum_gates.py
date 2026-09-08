"""The one explicit operation allowlist shared by Aer and state tracing."""

from qiskit.circuit.library import (
    CCXGate, CXGate, CZGate, HGate, PhaseGate, RXGate, RYGate, RZGate,
    SGate, SdgGate, SwapGate, TGate, TdgGate, XGate, YGate, ZGate,
)

from app.schemas.simulation import Gate, RotationGate

OPERATIONS = {
    "h": HGate, "x": XGate, "y": YGate, "z": ZGate,
    "s": SGate, "sdg": SdgGate, "t": TGate, "tdg": TdgGate,
    "rx": RXGate, "ry": RYGate, "rz": RZGate, "p": PhaseGate,
    "cx": CXGate, "cz": CZGate, "swap": SwapGate, "ccx": CCXGate,
}


def operation(gate: Gate):
    """Only canonical, validated gates enter here; never resolve user methods."""
    return OPERATIONS[gate.type](*(gate.params if isinstance(gate, RotationGate) else []))
