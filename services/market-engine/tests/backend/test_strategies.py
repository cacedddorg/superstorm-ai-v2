import pytest
import time
from orderbook.book import OrderBook
from models.market_events import NormalizedEvent, Exchange, MarketType, EventType
from models.api_schemas import StrategyStatus
from strategies.strategy_a import evaluate_strategy_a, _prev_book_state
from strategies.strategy_b import evaluate_strategy_b
from strategies.strategy_d import evaluate_strategy_d
from models.api_schemas import StrategyExplanation


def test_strategy_b_reports_unimplemented_sweep_history_as_incomplete():
    book = OrderBook("BTCUSDT")
    now = int(time.time() * 1000)
    book.apply_event(NormalizedEvent(
        exchange=Exchange.BYBIT,
        market_type=MarketType.LINEAR,
        symbol="BTCUSDT",
        event_type=EventType.SNAPSHOT,
        exchange_timestamp=now,
        local_receipt_timestamp=now,
        bids=[(30000.0, 1.0)],
        asks=[(30010.0, 1.0)],
    ))

    result = evaluate_strategy_b(book, [])

    assert result.decision == StrategyStatus.NO_TRADE
    assert result.data_quality == "INCOMPLETE"
    assert result.missing_inputs == ["historical_sweeps"]

def test_strategy_a_rejects_stale_data():
    book = OrderBook("BTCUSDT")
    # Simulate old data
    old_ts = int(time.time() * 1000) - 10000 
    snap = NormalizedEvent(
        exchange=Exchange.BYBIT, market_type=MarketType.LINEAR, symbol="BTCUSDT",
        event_type=EventType.SNAPSHOT, exchange_timestamp=old_ts, local_receipt_timestamp=old_ts,
        bids=[(30000.0, 1.0)],
        asks=[(30010.0, 2.0)]
    )
    book.apply_event(snap)
    
    result = evaluate_strategy_a(book, [])
    assert result.decision == StrategyStatus.NO_TRADE
    assert result.data_quality == "STALE"

def test_strategy_a_rejects_missing_inputs():
    book = OrderBook("BTCUSDT")
    # Simulate fresh but incomplete data (e.g. no bids)
    now = int(time.time() * 1000)
    snap = NormalizedEvent(
        exchange=Exchange.BYBIT, market_type=MarketType.LINEAR, symbol="BTCUSDT",
        event_type=EventType.SNAPSHOT, exchange_timestamp=now, local_receipt_timestamp=now,
        bids=[],
        asks=[(30010.0, 2.0)]
    )
    book.apply_event(snap)
    
    result = evaluate_strategy_a(book, [])
    assert result.decision == StrategyStatus.NO_TRADE
    assert result.data_quality == "INCOMPLETE"

def test_strategy_a_valid_buy_signal():
    book = OrderBook("BTCUSDT")
    now = int(time.time() * 1000)
    
    # Needs 3+ levels for structure. Give a huge bid support at 29980 to trigger structure.
    snap = NormalizedEvent(
        exchange=Exchange.BYBIT, market_type=MarketType.LINEAR, symbol="BTCUSDT",
        event_type=EventType.SNAPSHOT, exchange_timestamp=now, local_receipt_timestamp=now,
        bids=[(30000.0, 1.0), (29990.0, 1.0), (29980.0, 10.0), (29970.0, 1.0)],
        asks=[(30010.0, 2.0), (30020.0, 1.0), (30030.0, 1.0)]
    )
    book.apply_event(snap)
    
    # Prime previous state so OFI > 0
    _prev_book_state[("bybit", "linear", "BTCUSDT")] = {
        "best_bid": 29990.0,
        "best_bid_qty": 1.0,
        "best_ask": 30010.0,
        "best_ask_qty": 2.0,
    }
    
    # Trades that give CVD > 10.0
    trades = [
        NormalizedEvent(
            exchange=Exchange.BYBIT, market_type=MarketType.LINEAR, symbol="BTCUSDT",
            event_type=EventType.TRADE, exchange_timestamp=now, local_receipt_timestamp=now,
            side="buy", size=15.0, price=30010.0
        )
    ]
    
    result = evaluate_strategy_a(book, trades)
    assert result.decision == StrategyStatus.ACTIONABLE
    assert result.selected_candidate == "buy"
    assert "CVD" in result.evidence
    assert "OFI" in result.evidence
    assert "visible bid walls" in result.evidence

def test_strategy_d_requires_two_unexpired_agreeing_candidates():
    now = int(time.time() * 1000)
    buy = StrategyExplanation(
        strategy_name="test", evidence="test", contrary_evidence="", data_quality="GOOD",
        missing_inputs=[], timestamps={"eval_time": now}, expiry=now + 5000,
        decision=StrategyStatus.ACTIONABLE, selected_candidate="buy", reason="test"
    )
    result = evaluate_strategy_d([buy])
    assert result.decision == StrategyStatus.NO_TRADE
    assert result.selected_candidate is None
    consensus = evaluate_strategy_d([buy, buy])
    assert consensus.decision == StrategyStatus.ACTIONABLE
    assert consensus.selected_candidate == "buy"
