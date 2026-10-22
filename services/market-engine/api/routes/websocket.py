import asyncio
import json
import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import logging
from orderbook.manager import manager
from config.settings import settings
from risk.gates import check_data_quality
from models.api_schemas import WsOrderBookMessage

logger = logging.getLogger(__name__)
router = APIRouter()

@router.websocket("/ws/orderbook")
async def websocket_orderbook(websocket: WebSocket):
    await websocket.accept()
    symbol = settings.default_symbol
    book = manager.get_book(symbol)

    try:
        while True:
            # We will stream updates every 100ms
            await asyncio.sleep(0.1)

            # If book isn't valid yet, we can either wait or send a status message.
            # Frontend currently expects the structure: symbol, bids, asks, timestamp
            # If it's empty, frontend will just show empty list or '...'

            # Prepare backward compatible book lists (stringified)
            bids = [[str(price), str(size)] for price, size in book.get_top_bids(20)]
            asks = [[str(price), str(size)] for price, size in book.get_top_asks(20)]

            now = int(time.time() * 1000)
            data_age = now - book.local_receipt_time if book.local_receipt_time else 0

            quality_info = check_data_quality(book)

            msg = WsOrderBookMessage(
                symbol=symbol,
                bids=bids,
                asks=asks,
                timestamp=now,
                exchange=book.exchange,
                market_type=book.market_type,
                exchange_event_time=book.exchange_event_time,
                local_receipt_time=book.local_receipt_time,
                data_age_ms=data_age,
                connection_state=book.connection_state,
                data_quality=quality_info["quality"],
                is_valid=book.is_valid
            )

            # Only publish validated states or clear error states.
            # We'll push empty arrays if invalid so frontend doesn't show stale prices.
            if not book.is_valid or not quality_info["safe"]:
                msg.bids = []
                msg.asks = []

            await websocket.send_text(msg.model_dump_json())

    except WebSocketDisconnect:
        logger.info("Client disconnected from /ws/orderbook")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
