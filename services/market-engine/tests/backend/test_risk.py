import pytest
import time
from orderbook.book import OrderBook
from risk.gates import check_data_quality
from models.market_events import NormalizedEvent, Exchange, MarketType, EventType
from config.settings import settings

def test_data_quality_stale():
    book = OrderBook("BTCUSDT")
    old_ts = int(time.time() * 1000) - settings.stale_data_timeout_ms - 1000
    
    snap = NormalizedEvent(
        exchange=Exchange.BYBIT, market_type=MarketType.LINEAR, symbol="BTCUSDT",
        event_type=EventType.SNAPSHOT, exchange_timestamp=old_ts, local_receipt_timestamp=old_ts,
        bids=[(30000.0, 1.0)],
        asks=[(30010.0, 2.0)]
    )
    book.apply_event(snap)
    
    quality = check_data_quality(book)
    assert quality["safe"] is False
    assert quality["quality"] == "STALE"
    
def test_data_quality_invalid():
    book = OrderBook("BTCUSDT")
    quality = check_data_quality(book)
    assert quality["safe"] is False
    assert quality["quality"] == "POOR"
