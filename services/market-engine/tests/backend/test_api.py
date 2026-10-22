from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app)

def test_health_live():
    response = client.get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_health_ready():
    response = client.get("/health/ready")
    assert response.status_code == 200
    # Before connection establishes, it should be 'error'
    data = response.json()
    assert "status" in data
    assert "connection_state" in data

def test_market_status():
    response = client.get("/market/status?symbol=BTCUSDT")
    assert response.status_code == 200
    data = response.json()
    assert data["symbol"] == "BTCUSDT"
    assert "quality" in data
    assert "decision" in data
    assert data["book_valid"] is False # initially invalid
