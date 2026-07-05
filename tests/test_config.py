from yapzee_common.config import MODELS, settings


def test_models_shape():
    assert MODELS, "MODELS must not be empty"
    for m in MODELS:
        assert {"label", "provider", "value"} <= m.keys()


def test_settings_importable_without_jwt_env():
    # config must NOT raise at import when YAPZEE_JWT_SECRET is unset
    assert hasattr(settings, "OPENAI_API_KEY")
