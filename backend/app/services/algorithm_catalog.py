"""Small explicit catalog. All promised functions for n <= 2 are affine Boolean functions."""

from app.schemas.algorithms import CatalogEntry, OracleDefinition, TruthRow

# (input parity mask, constant offset). Bit j of mask addresses physical qj.
ORACLES = {
    "zero": (0, 0, "Always 0"),
    "one": (0, 1, "Always 1"),
    "q0": (1, 0, "Return q0 (rightmost input bit)"),
    "not-q0": (1, 1, "Flip q0"),
    "q1": (2, 0, "Return q1 (leftmost input bit)"),
    "not-q1": (2, 1, "Flip q1"),
    "xor": (3, 0, "Different bits → 1 (XOR)"),
    "xnor": (3, 1, "Equal bits → 1 (XNOR)"),
}


def oracle_definition(oracle_id: str, n: int) -> OracleDefinition:
    mask, offset, label = ORACLES[oracle_id]
    return OracleDefinition(
        id=oracle_id, label=label, input_qubits=n,
        category="constant" if mask == 0 else "balanced",
        truth_table=[TruthRow(input=format(x, f"0{n}b"), output=((x & mask).bit_count() % 2) ^ offset)
                     for x in range(2**n)],
    )


CATALOG = [
    CatalogEntry(id="deutsch-jozsa", title="Deutsch–Jozsa",
                 summary="Learn a global property of a promised function with one oracle query.",
                 register_sizes=[1, 2], oracles=[oracle_definition(key, n)
                     for n in (1, 2) for key, (mask, _, _) in ORACLES.items() if mask < 2**n]),
    CatalogEntry(id="grover", title="Grover’s search",
                 summary="Turn a phase mark into a greater chance of finding one item.",
                 register_sizes=[1, 2], max_iterations=4),
]
