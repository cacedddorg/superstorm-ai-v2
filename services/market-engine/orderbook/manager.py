from typing import Dict, Optional, List
from orderbook.book import OrderBook
from models.market_events import NormalizedEvent, EventType
import asyncio

class OrderBookManager:
    def __init__(self):
        self.books: Dict[str, OrderBook] = {}
        self.trades: Dict[str, List[NormalizedEvent]] = {}
        self._lock = asyncio.Lock()
        
    def get_book(self, symbol: str) -> OrderBook:
        if symbol not in self.books:
            self.books[symbol] = OrderBook(symbol)
        return self.books[symbol]
        
    async def process_event(self, event: NormalizedEvent):
        async with self._lock:
            if event.event_type in [EventType.SNAPSHOT, EventType.DELTA]:
                book = self.get_book(event.symbol)
                book.apply_event(event)
            elif event.event_type == EventType.TRADE:
                if event.symbol not in self.trades:
                    self.trades[event.symbol] = []
                self.trades[event.symbol].append(event)
                # Keep buffer bounded
                if len(self.trades[event.symbol]) > 1000:
                    self.trades[event.symbol] = self.trades[event.symbol][-1000:]
                    
    def get_recent_trades(self, symbol: str, limit: int = 100) -> List[NormalizedEvent]:
        if symbol not in self.trades:
            return []
        return self.trades[symbol][-limit:]

manager = OrderBookManager()
