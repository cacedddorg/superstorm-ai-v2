from typing import Dict, List, Tuple, Optional
import time
from models.market_events import NormalizedEvent, EventType, ConnectionState
from config.settings import settings

class OrderBook:
    def __init__(self, symbol: str):
        self.symbol = symbol
        self.bids: Dict[float, float] = {}
        self.asks: Dict[float, float] = {}
        self.last_update_id: Optional[int] = None

        self.is_valid: bool = False
        self.connection_state: ConnectionState = ConnectionState.DISCONNECTED
        self.exchange_event_time: int = 0
        self.local_receipt_time: int = 0
        self.exchange: str = "unknown"
        self.market_type: str = "unknown"

    def apply_event(self, event: NormalizedEvent):
        """Applies a normalized event to the order book."""

        if event.event_type == EventType.SNAPSHOT:
            self._apply_snapshot(event)
        elif event.event_type == EventType.DELTA:
            self._apply_delta(event)

    def _apply_snapshot(self, event: NormalizedEvent):
        """Rebuilds the entire book from a snapshot."""
        self.bids.clear()
        self.asks.clear()

        for price, size in event.bids:
            if size > 0:
                self.bids[price] = size

        for price, size in event.asks:
            if size > 0:
                self.asks[price] = size

        self.last_update_id = event.update_id or event.last_update_id
        self.is_valid = True
        self._update_metadata(event)

    def _apply_delta(self, event: NormalizedEvent):
        """Updates the book with a delta, tracking sequence if provided."""
        if not self.is_valid:
            # We must wait for a snapshot if the book is invalid
            return

        # Optional: strict sequence checking depending on exchange
        # Bybit v5 sends sequential update_id
        # Binance sends U and u
        if self.last_update_id is not None and event.update_id is not None:
            if event.exchange.value == "bybit":
                if event.update_id <= self.last_update_id:
                    # Out of order or duplicate, ignore or invalidate
                    return
                # if event.update_id != self.last_update_id + 1 (could be gap if strict)

            if event.exchange.value == "binance":
                if event.last_update_id is not None and event.last_update_id <= self.last_update_id:
                    return # Out of date
                if event.first_update_id is not None and event.first_update_id > self.last_update_id + 1:
                    # Gap detected
                    self.invalidate("Sequence gap detected")
                    return

        for price, size in event.bids:
            if size == 0:
                self.bids.pop(price, None)
            else:
                self.bids[price] = size

        for price, size in event.asks:
            if size == 0:
                self.asks.pop(price, None)
            else:
                self.asks[price] = size

        # Check for crossed book
        if self.bids and self.asks:
            best_bid = max(self.bids.keys())
            best_ask = min(self.asks.keys())
            if best_bid >= best_ask:
                self.invalidate("Crossed book")
                return

        if event.update_id is not None:
            self.last_update_id = event.update_id
        elif event.last_update_id is not None:
            self.last_update_id = event.last_update_id

        self._update_metadata(event)

    def _update_metadata(self, event: NormalizedEvent):
        self.exchange = event.exchange.value
        self.market_type = event.market_type.value
        self.exchange_event_time = event.exchange_timestamp
        self.local_receipt_time = event.local_receipt_timestamp
        self.connection_state = ConnectionState.CONNECTED

    def invalidate(self, reason: str = "Unknown"):
        """Marks the book as invalid (e.g. sequence gap, reconnect)."""
        self.is_valid = False
        self.bids.clear()
        self.asks.clear()
        self.last_update_id = None
        self.connection_state = ConnectionState.RESYNCING
        print(f"Book invalidated: {reason}")

    def get_top_bids(self, depth: int = 50) -> List[Tuple[float, float]]:
        sorted_bids = sorted(self.bids.items(), key=lambda x: x[0], reverse=True)
        return sorted_bids[:depth]

    def get_top_asks(self, depth: int = 50) -> List[Tuple[float, float]]:
        sorted_asks = sorted(self.asks.items(), key=lambda x: x[0])
        return sorted_asks[:depth]

    def check_freshness(self) -> bool:
        """Returns False if data is too old."""
        now = int(time.time() * 1000)
        age = now - self.local_receipt_time
        if age > settings.stale_data_timeout_ms:
            return False
        return True
