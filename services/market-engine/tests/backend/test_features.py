import pytest
from orderbook.book import OrderBook
from models.market_events import NormalizedEvent, Exchange, MarketType, EventType
from features.microstructure import calculate_imbalance, get_midpoint, get_spread
from features.order_flow import calculate_cvd

def test_calculate_cvd():
    trades = [
        NormalizedEvent(
            exchange=Exchange.BYBIT, market_type=MarketType.LINEAR, symbol="BTCUSDT",
            event_type=EventType.TRADE, exchange_timestamp=1, local_receipt_timestamp=1,
            side="buy", size=2.5, price=30000.0
        ),
        NormalizedEvent(
            exchange=Exchange.BYBIT, market_type=MarketType.LINEAR, symbol="BTCUSDT",
            event_type=EventType.TRADE, exchange_timestamp=2, local_receipt_timestamp=2,
            side="sell", size=1.0, price=30000.0
        )
    ]
    cvd = calculate_cvd(trades)
    assert cvd == 1.5

def test_imbalance_and_midpoint():
    book = OrderBook("BTCUSDT")
    snap = NormalizedEvent(
        exchange=Exchange.BYBIT, market_type=MarketType.LINEAR, symbol="BTCUSDT",
        event_type=EventType.SNAPSHOT, exchange_timestamp=1, local_receipt_timestamp=1,
        bids=[(30000.0, 10.0), (29990.0, 5.0)],
        asks=[(30010.0, 5.0)]
    )
    book.apply_event(snap)
    
    midpoint = get_midpoint(book)
    assert midpoint == 30005.0
    
    spread = get_spread(book)
    assert spread == 10.0
    
    imb = calculate_imbalance(book, levels=5)
    # bid_vol = 15.0, ask_vol = 5.0
    # (15 - 5) / 20 = 10 / 20 = 0.5
    assert imb == 0.5
