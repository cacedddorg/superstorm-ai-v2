from pydantic import BaseModel, Field
from typing import List, Tuple, Dict, Any, Optional
from models.market_events import ConnectionState
from enum import Enum

class OrderBookEntry(BaseModel):
    price: str
    quantity: str

class StrategyStatus(str, Enum):
    ACTIONABLE = "actionable"
    NO_TRADE = "no_trade"

class StrategyExplanation(BaseModel):
    strategy_name: str
    evidence: str
    contrary_evidence: str
    data_quality: str
    missing_inputs: List[str]
    timestamps: Dict[str, int]
    expiry: int
    decision: StrategyStatus
    selected_candidate: Optional[str] = None
    reason: str

class WsOrderBookMessage(BaseModel):
    symbol: str
    bids: List[Tuple[str, str]]
    asks: List[Tuple[str, str]]
    timestamp: int
    
    # Metadata
    exchange: str
    market_type: str
    exchange_event_time: int
    local_receipt_time: int
    data_age_ms: int
    connection_state: ConnectionState
    data_quality: str
    is_valid: bool

class HealthResponse(BaseModel):
    status: str
    
class ReadinessResponse(BaseModel):
    status: str
    connection_state: str
    data_freshness: str
    details: Dict[str, Any]
