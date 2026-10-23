from __future__ import annotations

import time
from typing import Any

from orderbook.book import OrderBook


def check_data_quality(book: OrderBook) -> dict[str, Any]:
    """Fail closed when the book is absent, stale, empty, or crossed."""
    if book.local_receipt_time <= 0:
        return {"safe": False, "quality": "POOR", "reason": "No exchange snapshot has been received"}
    if not book.check_freshness():
        return {"safe": False, "quality": "STALE", "reason": "Exchange data is stale"}
    if not book.bids or not book.asks:
        return {"safe": False, "quality": "INCOMPLETE", "reason": "One side of the order book is missing"}
    if not book.is_valid:
        return {"safe": False, "quality": "POOR", "reason": "No valid exchange snapshot"}

    best_bid = max(book.bids)
    best_ask = min(book.asks)
    if best_bid >= best_ask:
        return {"safe": False, "quality": "POOR", "reason": "Order book is crossed or locked"}

    return {
        "safe": True,
        "quality": "GOOD",
        "reason": "Fresh valid exchange order book",
        "data_age_ms": max(0, int(time.time() * 1000) - book.local_receipt_time),
    }
