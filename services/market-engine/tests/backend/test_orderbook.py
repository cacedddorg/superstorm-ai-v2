import pytest
from orderbook.book import OrderBook
from models.market_events import NormalizedEvent, Exchange, MarketType, EventType
import time

def test_orderbook_snapshot():
    book = OrderBook("BTCUSDT")
    
    event = NormalizedEvent(
        exchange=Exchange.BYBIT,
        market_type=MarketType.LINEAR,
        symbol="BTCUSDT",
        event_type=EventType.SNAPSHOT,
        exchange_timestamp=1000,
        local_receipt_timestamp=1001,
        bids=[(30000.0, 1.0)],
        asks=[(30010.0, 2.0)],
        update_id=1
    )
    
    book.apply_event(event)
    
    assert book.is_valid is True
    assert book.get_top_bids(1)[0] == (30000.0, 1.0)
    assert book.get_top_asks(1)[0] == (30010.0, 2.0)
    assert book.last_update_id == 1

def test_orderbook_delta_update():
    book = OrderBook("BTCUSDT")
    
    # 1. Snapshot
    snap = NormalizedEvent(
        exchange=Exchange.BYBIT,
        market_type=MarketType.LINEAR,
        symbol="BTCUSDT",
        event_type=EventType.SNAPSHOT,
        exchange_timestamp=1000,
        local_receipt_timestamp=1001,
        bids=[(30000.0, 1.0)],
        asks=[(30010.0, 2.0)],
        update_id=1
    )
    book.apply_event(snap)
    
    # 2. Delta to update bid size and remove ask
    delta = NormalizedEvent(
        exchange=Exchange.BYBIT,
        market_type=MarketType.LINEAR,
        symbol="BTCUSDT",
        event_type=EventType.DELTA,
        exchange_timestamp=1002,
        local_receipt_timestamp=1003,
        bids=[(30000.0, 1.5)], # Update size
        asks=[(30010.0, 0.0)], # Remove ask
        update_id=2
    )
    book.apply_event(delta)
    
    assert book.is_valid is True
    assert book.get_top_bids(1)[0] == (30000.0, 1.5)
    assert len(book.asks) == 0
    assert book.last_update_id == 2

def test_crossed_book_invalidation():
    book = OrderBook("BTCUSDT")
    
    snap = NormalizedEvent(
        exchange=Exchange.BYBIT,
        market_type=MarketType.LINEAR,
        symbol="BTCUSDT",
        event_type=EventType.SNAPSHOT,
        exchange_timestamp=1000,
        local_receipt_timestamp=1001,
        bids=[(30000.0, 1.0)],
        asks=[(30010.0, 2.0)],
        update_id=1
    )
    book.apply_event(snap)
    
    # Send a delta that crosses the book
    delta = NormalizedEvent(
        exchange=Exchange.BYBIT,
        market_type=MarketType.LINEAR,
        symbol="BTCUSDT",
        event_type=EventType.DELTA,
        exchange_timestamp=1002,
        local_receipt_timestamp=1003,
        bids=[(30020.0, 1.0)], # Bid higher than ask
        asks=[],
        update_id=2
    )
    
    book.apply_event(delta)
    
    assert book.is_valid is False
    assert len(book.bids) == 0
    assert len(book.asks) == 0

def test_empty_snapshot_is_not_marked_valid():
    book = OrderBook("BTCUSDT")
    snap = NormalizedEvent(
        exchange=Exchange.BYBIT, market_type=MarketType.LINEAR, symbol="BTCUSDT",
        event_type=EventType.SNAPSHOT, exchange_timestamp=1000,
        local_receipt_timestamp=int(time.time() * 1000), bids=[], asks=[]
    )
    book.apply_event(snap)
    assert book.is_valid is False
