import pytest
from fastapi import HTTPException

from yapzee_common.internal_auth import require_internal_key


def test_missing_env_raises_500(monkeypatch):
    monkeypatch.delenv("INTERNAL_API_KEY", raising=False)
    with pytest.raises(HTTPException) as exc:
        require_internal_key("anything")
    assert exc.value.status_code == 500


def test_mismatched_header_raises_403(monkeypatch):
    monkeypatch.setenv("INTERNAL_API_KEY", "secret")
    with pytest.raises(HTTPException) as exc:
        require_internal_key("wrong")
    assert exc.value.status_code == 403


def test_missing_header_raises_403(monkeypatch):
    monkeypatch.setenv("INTERNAL_API_KEY", "secret")
    with pytest.raises(HTTPException) as exc:
        require_internal_key(None)
    assert exc.value.status_code == 403


def test_matching_header_passes(monkeypatch):
    monkeypatch.setenv("INTERNAL_API_KEY", "secret")
    assert require_internal_key("secret") is None
