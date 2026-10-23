import asyncio
import json
import logging
import time
from abc import ABC, abstractmethod
import websockets
from typing import Callable, Awaitable, Optional

from models.market_events import NormalizedEvent, Exchange, MarketType, ConnectionState
from orderbook.manager import manager

logger = logging.getLogger(__name__)

class BaseExchangeAdapter(ABC):
    def __init__(self, ws_url: str, symbol: str):
        self.ws_url = ws_url
        self.symbol = symbol
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.running = False
        self.reconnect_delay = 1.0
        self.max_reconnect_delay = 60.0
        
    @abstractmethod
    def get_subscription_messages(self) -> list:
        pass
        
    @abstractmethod
    async def parse_message(self, message: str) -> None:
        pass

    async def connect(self):
        self.running = True
        while self.running:
            try:
                logger.info(f"Connecting to {self.ws_url}")
                async with websockets.connect(self.ws_url, ping_interval=20, ping_timeout=20) as ws:
                    self.ws = ws
                    self.reconnect_delay = 1.0
                    logger.info(f"Connected to {self.ws_url}")
                    
                    # Send subscriptions
                    for sub_msg in self.get_subscription_messages():
                        await self.ws.send(json.dumps(sub_msg))
                    
                    async for message in self.ws:
                        if not self.running:
                            break
                        await self.parse_message(message)
                        
            except Exception as e:
                logger.error(f"WebSocket error for {self.symbol}: {e}")
                
            finally:
                if self.running:
                    # Invalidate book on disconnect
                    book = manager.get_book(self.symbol)
                    book.invalidate("WebSocket disconnected")
                    
                    # Exponential backoff with jitter
                    import random
                    delay = min(self.reconnect_delay * (1.5 + random.random() * 0.5), self.max_reconnect_delay)
                    logger.info(f"Reconnecting in {delay:.2f} seconds...")
                    await asyncio.sleep(delay)
                    self.reconnect_delay = delay

    async def stop(self):
        self.running = False
        if self.ws:
            await self.ws.close()
            
    async def publish_event(self, event: NormalizedEvent):
        await manager.process_event(event)
