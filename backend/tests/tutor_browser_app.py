"""EXPLICIT E2E ENTRYPOINT ONLY. Never imported by app.main or enabled by env.

Real FastAPI + real Qiskit; the model is a deterministic test double. This module
is launched only by tutor.spec.ts on its owned test port, never by the product.
"""

from app.core.config import Settings
from app.core.tutor_config import TutorSettings
from app.main import create_app
from app.schemas.tutor import TutorAnswer
from app.services.tutor_provider import TutorFailure


class BrowserProviderDouble:
    async def answer(self, request, context):
        if request.question == "Test provider unavailable":
            raise TutorFailure("tutor_not_configured", "AI Tutor is not configured on this server. Your circuit and lessons still work.", 503)
        return TutorAnswer(
            answer="Provider test double: an amplitude helps calculate a chance. Probability is its squared magnitude. The circuit facts below come from real Qiskit.",
            deeper="Provider test double: H combines amplitudes; a second H allows contributions to reinforce or cancel.",
            follow_up="Which step would you like to explore next?",
            suggestion={
                "title": "Bell state (provider test double)", "rationale": "Prepare a superposition on q0, then apply controlled-X.", "num_qubits": 2,
                "gates": [{"type": "h", "target": 0, "control": None}, {"type": "cx", "target": 1, "control": 0}],
            } if "build" in request.question.lower() else None,
        )


def create_test_app():
    config = TutorSettings(_env_file=None, enabled=True, model="browser-test-double", OPENAI_API_KEY="not-a-real-credential", requests_per_minute=120)
    app = create_app(Settings(_env_file=None, cors_origins=[]), tutor_settings=config)
    app.state.tutor_service.provider = BrowserProviderDouble()
    return app
