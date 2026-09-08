"""Shared failure type; engine details never enter the public error envelope."""


class SimulationExecutionError(RuntimeError):
    """The local engine failed; no simulation result should be returned."""
