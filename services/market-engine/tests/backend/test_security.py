import base64
import hashlib
import hmac
import time

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from api.main import app
from config.settings import settings
from security.access_tokens import verify_market_token

client = TestClient(app)

def _signed_token(secret: str, expiry: int) -> str:
    expiry_text = str(expiry)
    digest = hmac.new(secret.encode(), expiry_text.encode(), hashlib.sha256).digest()
    signature = base64.urlsafe_b64encode(digest).decode().rstrip("=")
    return f"{expiry_text}.{signature}"


def test_market_token_accepts_valid_signature(monkeypatch):
    secret = "test-signing-secret-that-is-at-least-32-bytes"
    monkeypatch.setattr(settings, "market_api_signing_secret", secret)
    assert verify_market_token(_signed_token(secret, int(time.time()) + 60))


def test_market_token_rejects_expired_and_tampered_tokens(monkeypatch):
    secret = "test-signing-secret-that-is-at-least-32-bytes"
    monkeypatch.setattr(settings, "market_api_signing_secret", secret)
    assert not verify_market_token(_signed_token(secret, int(time.time()) - 1))
    assert not verify_market_token(_signed_token(secret, int(time.time()) + 60) + "x")


def test_market_token_fails_closed_without_secret(monkeypatch):
    monkeypatch.setattr(settings, "market_api_signing_secret", "")
    assert not verify_market_token(_signed_token("irrelevant", int(time.time()) + 60))


def test_orderbook_websocket_requires_a_signed_token():
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/orderbook"):
            pass


def test_orderbook_websocket_accepts_signed_subprotocol(monkeypatch):
    secret = "test-signing-secret-that-is-at-least-32-bytes"
    monkeypatch.setattr(settings, "market_api_signing_secret", secret)
    token = _signed_token(secret, int(time.time()) + 60)

    with client.websocket_connect(
        "/ws/orderbook", subprotocols=["superstorm-market", token]
    ) as websocket:
        assert websocket.accepted_subprotocol == "superstorm-market"
        message = websocket.receive_json()
        assert message["is_valid"] is False
