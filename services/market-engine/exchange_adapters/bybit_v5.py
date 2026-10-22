import json
import time
from typing import Dict, Any

from exchange_adapters.base import BaseExchangeAdapter
from models.market_events import NormalizedEvent, Exchange, MarketType, EventType
from config.settings import settings

class BybitV5Adapter(BaseExchangeAdapter):
    def __init__(self, symbol: str):
        super().__init__(settings.bybit_ws_url, symbol)

    def get_subscription_messages(self) -> list:
        # 50 levels for orderbook, plus public trade stream
        return [
            {
                "op": "subscribe",
                "args": [
                    f"orderbook.50.{self.symbol}",
                    f"publicTrade.{self.symbol}"
                ]
            }
        ]

    async def parse_message(self, message: str) -> None:
        data = json.loads(message)

        # Handle ping/pong or connection responses
        if "op" in data or "success" in data:
            return

        if "topic" not in data:
            return

        topic = data["topic"]
        local_ts = int(time.time() * 1000)

        if topic.startswith("orderbook"):
            await self._parse_orderbook(data, local_ts)
        elif topic.startswith("publicTrade"):
            await self._parse_trades(data, local_ts)

    async def _parse_orderbook(self, data: Dict[str, Any], local_ts: int):
        event_type = EventType.SNAPSHOT if data.get("type") == "snapshot" else EventType.DELTA

        payload = data.get("data", {})
        ts = data.get("ts", local_ts)

        update_id = payload.get("u") # Update ID
        seq = payload.get("seq")     # Cross sequence

        bids = [(float(price), float(size)) for price, size in payload.get("b", [])]
        asks = [(float(price), float(size)) for price, size in payload.get("a", [])]

        event = NormalizedEvent(
            exchange=Exchange.BYBIT,
            market_type=MarketType.LINEAR,
            symbol=self.symbol,
            event_type=event_type,
            exchange_timestamp=ts,
            local_receipt_timestamp=local_ts,
            bids=bids,
            asks=asks,
            update_id=update_id,
            raw_data={"seq": seq} if seq else None
        )
        await self.publish_event(event)

    async def _parse_trades(self, data: Dict[str, Any], local_ts: int):
        payload = data.get("data", [])

        for trade in payload:
            ts = trade.get("T", local_ts) # Trade timestamp
            price = float(trade.get("p", 0))
            size = float(trade.get("v", 0))
            side = "buy" if trade.get("S") == "Buy" else "sell"

            event = NormalizedEvent(
                exchange=Exchange.BYBIT,
                market_type=MarketType.LINEAR,
                symbol=self.symbol,
                event_type=EventType.TRADE,
                exchange_timestamp=ts,
                local_receipt_timestamp=local_ts,
                price=price,
                size=size,
                side=side,
                raw_data={"trade_id": trade.get("i")}
            )
            await self.publish_event(event)
