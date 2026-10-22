from pydantic import BaseModel, Field
from typing import List, Tuple, Dict, Any, Optional
from enum import Enum

class Exchange(str, Enum):
    BYBIT = "bybit"
    BINANCE = "binance"
    UNKNOWN = "unknown"

class MarketType(str, Enum):
    LINEAR = "linear"
    SPOT = "spot"
    UNKNOWN = "unknown"

class EventType(str, Enum):
    SNAPSHOT = "snapshot"
    DELTA = "delta"
    TRADE = "trade"
    UNKNOWN = "unknown"

class NormalizedEvent(BaseModel):
    exchange: Exchange
    market_type: MarketType
    symbol: str
    event_type: EventType
    exchange_timestamp: int
    local_receipt_timestamp: int

    # Orderbook specific
    bids: List[Tuple[float, float]] = Field(default_factory=list) # [price, size]
    asks: List[Tuple[float, float]] = Field(default_factory=list) # [price, size]

    # Trade specific
    price: Optional[float] = None
    size: Optional[float] = None
    side: Optional[str] = None # "buy" or "sell" (aggressor side)

    # Sequence tracking
    update_id: Optional[int] = None
    first_update_id: Optional[int] = None
    last_update_id: Optional[int] = None

    # Debug/raw info
    raw_data: Optional[Dict[str, Any]] = None

class ConnectionState(str, Enum):
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    RESYNCING = "resyncing"
    ERROR = "error"
