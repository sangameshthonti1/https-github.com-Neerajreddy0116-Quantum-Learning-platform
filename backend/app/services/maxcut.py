"""Trusted small MaxCut problems. Vertex i is bit i (q0 is rightmost)."""

from app.schemas.variational import ClassicalReference, Graph, Hamiltonian, Problem


def cost_hamiltonian(graph: Graph) -> Hamiltonian:
    n = graph.num_vertices
    terms = [{"pauli": "I" * n, "coefficient": sum(e.weight for e in graph.edges) / 2}]
    for edge in graph.edges:
        word = ["I"] * n
        word[n - 1 - edge.source] = word[n - 1 - edge.target] = "Z"
        terms.append({"pauli": "".join(word), "coefficient": -edge.weight / 2})
    return Hamiltonian(num_qubits=n, terms=terms)


def enumerate_cuts(graph: Graph) -> ClassicalReference:
    values = {format(i, f"0{graph.num_vertices}b"): sum(
        edge.weight * (((i >> edge.source) & 1) != ((i >> edge.target) & 1))
        for edge in graph.edges) for i in range(2 ** graph.num_vertices)}
    best = max(values.values())
    return ClassicalReference(method="enumeration", value=best, cut_values=values,
                              optimal_bitstrings=[label for label, value in values.items() if value == best])


def problem(id, title, n, edges):
    graph = Graph(num_vertices=n, edges=[{"source": i, "target": j, "weight": w} for i, j, w in edges])
    return Problem(id=id, title=title, units="weighted cut value", graph=graph, hamiltonian=cost_hamiltonian(graph))


GRAPHS = {
    p.id: p for p in [
        problem("edge", "One edge · two vertices", 2, [(0, 1, 1.0)]),
        problem("path", "Three-vertex path", 3, [(0, 1, 1.0), (1, 2, 1.0)]),
        problem("triangle", "Three-vertex triangle", 3, [(0, 1, 1.0), (0, 2, 1.0), (1, 2, 1.0)]),
        problem("weighted-path", "Weighted path · weights 1 and 2", 3, [(0, 1, 1.0), (1, 2, 2.0)]),
    ]
}
