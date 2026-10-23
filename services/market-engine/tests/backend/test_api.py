from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)

def test_health_live():
    response = client.get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_health_ready():
    response = client.get("/health/ready")
    assert response.status_code == 401

def test_market_status_requires_authentication():
    response = client.get("/market/status?symbol=BTCUSDT")
    assert response.status_code == 401
    
def test_market_status():
    from config.settings import settings
    import base64
    import hashlib
    import hmac
    import time

    secret = "test-signing-secret-that-is-at-least-32-bytes"
    settings.market_api_signing_secret = secret
    expiry = str(int(time.time()) + 60)
    signature = base64.urlsafe_b64encode(
        hmac.new(secret.encode(), expiry.encode(), hashlib.sha256).digest()
    ).decode().rstrip("=")
    response = client.get(
        "/market/status?symbol=BTCUSDT",
        headers={"Authorization": f"Bearer {expiry}.{signature}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["symbol"] == "BTCUSDT"
    assert "quality" in data
    assert "decision" in data
    assert len(data["strategies"]) == 3
    assert data["book_valid"] is False # initially invalid
