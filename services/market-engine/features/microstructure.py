from typing import Optional, Tuple
from orderbook.book import OrderBook

def get_spread(book: OrderBook) -> Optional[float]:
    bids = book.get_top_bids(1)
    asks = book.get_top_asks(1)
    if not bids or not asks:
        return None
    return asks[0][0] - bids[0][0]

def get_midpoint(book: OrderBook) -> Optional[float]:
    bids = book.get_top_bids(1)
    asks = book.get_top_asks(1)
    if not bids or not asks:
        return None
    return (asks[0][0] + bids[0][0]) / 2.0

def calculate_imbalance(book: OrderBook, levels: int = 5) -> Optional[float]:
    """Calculates multi-level orderbook imbalance: (bid_v - ask_v) / (bid_v + ask_v)"""
    bids = book.get_top_bids(levels)
    asks = book.get_top_asks(levels)

    if not bids or not asks:
        return None

    bid_vol = sum(size for price, size in bids)
    ask_vol = sum(size for price, size in asks)

    total_vol = bid_vol + ask_vol
    if total_vol == 0:
        return 0.0

    return (bid_vol - ask_vol) / total_vol

def calculate_microprice(book: OrderBook) -> Optional[float]:
    """Microprice: weighted average of best bid/ask by inverse quantities."""
    bids = book.get_top_bids(1)
    asks = book.get_top_asks(1)

    if not bids or not asks:
        return None

    bid_price, bid_size = bids[0]
    ask_price, ask_size = asks[0]

    total_size = bid_size + ask_size
    if total_size == 0:
        return get_midpoint(book)

    # Standard microprice: weights are typically inverse to volume or proportional to opposite volume
    # P_micro = (Bid * AskSize + Ask * BidSize) / (BidSize + AskSize)
    return (bid_price * ask_size + ask_price * bid_size) / total_size
