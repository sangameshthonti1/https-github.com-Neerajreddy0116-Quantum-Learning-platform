"""Small classical observables, never state preparation or a third simulator."""

import numpy as np
from scipy.linalg import eigh

from app.schemas.variational import ClassicalReference, Hamiltonian
from app.services.simulation_errors import SimulationExecutionError

TOLERANCE = 1e-10
PAULIS = {
    "I": np.eye(2, dtype=complex), "X": np.array([[0, 1], [1, 0]], dtype=complex),
    "Y": np.array([[0, -1j], [1j, 0]], dtype=complex),
    "Z": np.diag([1, -1]).astype(complex),
}


def hamiltonian_matrix(hamiltonian: Hamiltonian) -> np.ndarray:
    # Leftmost character acts on q[n-1], matching the public statevector index.
    h = np.zeros((2**hamiltonian.num_qubits,) * 2, dtype=complex)
    for term in hamiltonian.terms:
        tensor = np.array([[1]], dtype=complex)
        for symbol in term.pauli:
            tensor = np.kron(tensor, PAULIS[symbol])
        h += term.coefficient * tensor
    if not np.isfinite(h).all() or not np.allclose(h, h.conj().T, atol=TOLERANCE, rtol=0):
        raise SimulationExecutionError("Invalid Hermitian operator")
    return h


def expectation(state, hamiltonian: np.ndarray) -> float:
    psi = np.asarray(state, dtype=complex)
    h = np.asarray(hamiltonian, dtype=complex)
    if (psi.ndim != 1 or len(psi) not in (2, 4, 8) or h.shape != (len(psi), len(psi))
            or not np.isfinite(psi).all() or not np.isfinite(h).all()
            or abs(np.vdot(psi, psi) - 1) > TOLERANCE
            or not np.allclose(h, h.conj().T, atol=TOLERANCE, rtol=0)):
        raise SimulationExecutionError("Expectation requires a normalized finite state and matching Hermitian matrix")
    value = np.vdot(psi, h @ psi)
    if not np.isfinite(value) or abs(value.imag) > TOLERANCE:
        raise SimulationExecutionError("Non-real or nonfinite Hermitian expectation")
    return float(value.real)


def ground_reference(hamiltonian: Hamiltonian) -> ClassicalReference:
    eigenvalues = eigh(hamiltonian_matrix(hamiltonian), eigvals_only=True)
    return ClassicalReference(method="diagonalization", value=float(eigenvalues[0]),
                              eigenvalues=[float(x) for x in eigenvalues])
