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
        # This partial-depth stream replaces the visible top 20 levels; it is
        # not a full-depth book.
        return [
            {
                "method": "SUBSCRIBE",
                "params": [
                    f"{self.binance_symbol}@depth20@100ms",
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
        
        # Partial-depth events are full views of the selected top levels.
        if "lastUpdateId" in data and "bids" in data and "asks" in data:
            await self._parse_orderbook(data, local_ts)
        elif data.get("e") == "aggTrade":
            await self._parse_trade(data, local_ts)

    async def _parse_orderbook(self, data: Dict[str, Any], local_ts: int):
        # For this stream, these are partial snapshots of up to 20 levels.
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
