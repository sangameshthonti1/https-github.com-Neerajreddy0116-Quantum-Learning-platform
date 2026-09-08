"""One owned local worker. Input is validated JSON, not arbitrary Python or pickle."""

import json
import sys

from pydantic import TypeAdapter

from app.schemas.variational import VariationalRequest
from app.services.variational import OptimizationInterrupted, optimize


def emit(kind, data):
    print(json.dumps({"type": kind, "data": data}, allow_nan=False), flush=True)


def main():
    try:
        request = TypeAdapter(VariationalRequest).validate_json(sys.stdin.buffer.read(4097))
        result = optimize(request, on_evaluation=lambda point: emit("evaluation", point.model_dump(mode="json", by_alias=True)))
        emit("result", result.model_dump(mode="json", by_alias=True))
    except OptimizationInterrupted as error:
        emit("stopped", error.reason)
    except Exception:
        # No private paths, request bodies or exception messages cross the job boundary.
        emit("error", "The local optimization worker could not complete this experiment.")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
