from fastapi import APIRouter, Depends
from orderbook.manager import manager
from config.settings import settings
from models.api_schemas import HealthResponse, ReadinessResponse
from security.dependencies import require_market_token

router = APIRouter()

@router.get("/health/live", response_model=HealthResponse)
async def get_liveness():
    """Liveness probe for process execution."""
    return HealthResponse(status="ok")

@router.get("/health/ready", response_model=ReadinessResponse, dependencies=[Depends(require_market_token)])
async def get_readiness():
    """Readiness probe checking exchange connection and data freshness."""
    book = manager.get_book(settings.default_symbol)
    
    connection_state = book.connection_state.value
    is_fresh = book.check_freshness()
    
    status = "ok" if connection_state == "connected" and is_fresh else "error"
    
    return ReadinessResponse(
        status=status,
        connection_state=connection_state,
        data_freshness="fresh" if is_fresh else "stale",
        details={
            "symbol": settings.default_symbol,
            "is_valid": book.is_valid,
            "exchange": book.exchange
        }
    )
