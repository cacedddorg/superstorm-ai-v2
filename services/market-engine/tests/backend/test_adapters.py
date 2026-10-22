import pytest
import json
from unittest.mock import AsyncMock, patch

from exchange_adapters.bybit_v5 import BybitV5Adapter
from exchange_adapters.binance import BinanceAdapter
from models.market_events import EventType

@pytest.mark.asyncio
async def test_bybit_subscription_messages():
    adapter = BybitV5Adapter("BTCUSDT")
    subs = adapter.get_subscription_messages()
    assert len(subs) == 1
    assert subs[0]["op"] == "subscribe"
    assert "orderbook.50.BTCUSDT" in subs[0]["args"]

@pytest.mark.asyncio
async def test_bybit_parse_snapshot():
    adapter = BybitV5Adapter("BTCUSDT")
    adapter.publish_event = AsyncMock()

    msg = json.dumps({
        "topic": "orderbook.50.BTCUSDT",
        "type": "snapshot",
        "ts": 1690000000000,
        "data": {
            "s": "BTCUSDT",
            "b": [["30000", "1.5"], ["29990", "0.5"]],
            "a": [["30010", "2.0"]],
            "u": 12345,
            "seq": 98765
        }
    })

    await adapter.parse_message(msg)

    adapter.publish_event.assert_called_once()
    event = adapter.publish_event.call_args[0][0]

    assert event.event_type == EventType.SNAPSHOT
    assert len(event.bids) == 2
    assert event.bids[0] == (30000.0, 1.5)
    assert event.update_id == 12345

@pytest.mark.asyncio
async def test_binance_parse_depth50():
    adapter = BinanceAdapter("BTCUSDT")
    adapter.publish_event = AsyncMock()

    msg = json.dumps({
        "lastUpdateId": 160,
        "bids": [
            [
                "4.00000000",
                "431.00000000"
            ]
        ],
        "asks": [
            [
                "4.00000200",
                "12.00000000"
            ]
        ]
    })

    await adapter.parse_message(msg)

    adapter.publish_event.assert_called_once()
    event = adapter.publish_event.call_args[0][0]

    assert event.event_type == EventType.SNAPSHOT
    assert event.last_update_id == 160
    assert len(event.bids) == 1
    assert event.bids[0] == (4.0, 431.0)
