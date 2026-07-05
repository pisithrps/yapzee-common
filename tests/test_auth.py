import pytest


def test_token_round_trip(monkeypatch):
    monkeypatch.setenv("YAPZEE_JWT_SECRET", "test-secret")
    import importlib
    import yapzee_common.config, yapzee_common.auth
    importlib.reload(yapzee_common.config)
    importlib.reload(yapzee_common.auth)
    from yapzee_common.auth import create_token, decode_token
    assert decode_token(create_token("user-123")) == "user-123"


def test_decode_garbage_returns_none(monkeypatch):
    monkeypatch.setenv("YAPZEE_JWT_SECRET", "test-secret")
    import importlib
    import yapzee_common.config, yapzee_common.auth
    importlib.reload(yapzee_common.config)
    importlib.reload(yapzee_common.auth)
    from yapzee_common.auth import decode_token
    assert decode_token("not-a-jwt") is None


def test_missing_secret_fails_loudly(monkeypatch):
    monkeypatch.delenv("YAPZEE_JWT_SECRET", raising=False)
    import importlib
    import yapzee_common.config, yapzee_common.auth
    importlib.reload(yapzee_common.config)
    importlib.reload(yapzee_common.auth)
    from yapzee_common.auth import create_token
    with pytest.raises(RuntimeError, match="YAPZEE_JWT_SECRET"):
        create_token("user-123")
