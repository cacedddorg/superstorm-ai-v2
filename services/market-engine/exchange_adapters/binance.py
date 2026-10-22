import json
import time
from typing import Dict, Any

from exchange_adapters.base import BaseExchangeAdapter
from models.market_events import NormalizedEvent, Exchange, MarketType, EventType
from config.settings import settings

class BinanceAdapter(BaseExchangeAdapter):
    def __init__(self, symbol: str):
        # Binance expects lowercase symbols for stream names
        self.binance_symbol = symbol.lower()
        super().__init__(settings.binance_ws_url, symbol)

    def get_subscription_messages(self) -> list:
        # Binance requires subscribing to @depth for deltas (or @depth@100ms)
        # Note: In a full production system, we must fetch the REST snapshot first.
        # For this milestone and to keep it running smoothly purely off WS,
        # we can subscribe to the 50 level snapshot stream (which pushes full books every 100ms)
        # OR we use depth deltas and simulate the REST fetch.
        # Let's use @depth50@100ms which gives valid top 50 books directly.
        # We will also subscribe to @aggTrade for trades.

        return [
            {
                "method": "SUBSCRIBE",
                "params": [
                    f"{self.binance_symbol}@depth50@100ms",
                    f"{self.binance_symbol}@aggTrade"
                ],
                "id": 1
            }
        ]

    async def parse_message(self, message: str) -> None:
        data = json.loads(message)

        if "id" in data or "result" in data:
            return # Subscription response

        local_ts = int(time.time() * 1000)

        # Depth 50 stream returns snapshot-like events continuously
        if "lastUpdateId" in data and "bids" in data:
            await self._parse_orderbook(data, local_ts)
        elif data.get("e") == "aggTrade":
            await self._parse_trade(data, local_ts)

    async def _parse_orderbook(self, data: Dict[str, Any], local_ts: int):
        # For the depth50 stream, these are full snapshots up to 50 levels
        event_type = EventType.SNAPSHOT

        ts = data.get("E", local_ts) # Event time, might not be in depth50, fallback
        if "E" not in data:
             ts = local_ts # Partial book streams often lack 'E'

        last_update_id = data.get("lastUpdateId")

        bids = [(float(price), float(size)) for price, size in data.get("bids", [])]
        asks = [(float(price), float(size)) for price, size in data.get("asks", [])]

        event = NormalizedEvent(
            exchange=Exchange.BINANCE,
            market_type=MarketType.LINEAR,
            symbol=self.symbol,
            event_type=event_type,
            exchange_timestamp=ts,
            local_receipt_timestamp=local_ts,
            bids=bids,
            asks=asks,
            last_update_id=last_update_id
        )
        await self.publish_event(event)

    async def _parse_trade(self, data: Dict[str, Any], local_ts: int):
        ts = data.get("E", local_ts)
        price = float(data.get("p", 0))
        size = float(data.get("q", 0))
        # m = True if buyer is market maker (meaning sell was the aggressor)
        side = "sell" if data.get("m", False) else "buy"

        event = NormalizedEvent(
            exchange=Exchange.BINANCE,
            market_type=MarketType.LINEAR,
            symbol=self.symbol,
            event_type=EventType.TRADE,
            exchange_timestamp=ts,
            local_receipt_timestamp=local_ts,
            price=price,
            size=size,
            side=side,
            raw_data={"trade_id": data.get("a")}
        )
        await self.publish_event(event)
