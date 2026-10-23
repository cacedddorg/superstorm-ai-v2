from typing import List, Optional
from orderbook.book import OrderBook
from models.market_events import NormalizedEvent

def calculate_cvd(trades: List[NormalizedEvent]) -> float:
    """Calculates Cumulative Volume Delta from a list of recent trades."""
    cvd = 0.0
    for trade in trades:
        if trade.side == "buy":
            cvd += trade.size or 0.0
        elif trade.side == "sell":
            cvd -= trade.size or 0.0
    return cvd

def calculate_realized_volatility(trades: List[NormalizedEvent]) -> float:
    """Calculates simple realized volatility proxy from trades."""
    if len(trades) < 2:
        return 0.0
    
    returns = []
    for i in range(1, len(trades)):
        prev_price = trades[i-1].price or 0.0
        curr_price = trades[i].price or 0.0
        if prev_price > 0:
            returns.append(abs((curr_price - prev_price) / prev_price))
            
    if not returns:
        return 0.0
    return sum(returns) / len(returns)

def calculate_trade_intensity(trades: List[NormalizedEvent], time_window_ms: int = 1000) -> float:
    """Count locally received trades in a wall-clock window, in trades/second."""
    if not trades:
        return 0.0

    import time
    cutoff_ts = int(time.time() * 1000) - time_window_ms
    count = sum(1 for trade in trades if trade.local_receipt_timestamp >= cutoff_ts)
    return count / (time_window_ms / 1000.0)

def calculate_ofi(book: OrderBook, prev_book_state: dict) -> Optional[float]:
    """
    Order Flow Imbalance (OFI) requires previous best bid/ask.
    For this milestone, a simplified level-1 OFI approximation.
    """
    bids = book.get_top_bids(1)
    asks = book.get_top_asks(1)
    
    if not bids or not asks:
        return None

    required = ("best_bid", "best_bid_qty", "best_ask", "best_ask_qty")
    if any(key not in prev_book_state for key in required):
        return None
        
    curr_bid, curr_bid_qty = bids[0]
    curr_ask, curr_ask_qty = asks[0]
    
    prev_bid = prev_book_state["best_bid"]
    prev_bid_qty = prev_book_state["best_bid_qty"]
    prev_ask = prev_book_state["best_ask"]
    prev_ask_qty = prev_book_state["best_ask_qty"]
    
    e_bid = 0
    if curr_bid > prev_bid: e_bid = curr_bid_qty
    elif curr_bid == prev_bid: e_bid = curr_bid_qty - prev_bid_qty
    else: e_bid = -prev_bid_qty
        
    e_ask = 0
    if curr_ask < prev_ask: e_ask = curr_ask_qty
    elif curr_ask == prev_ask: e_ask = curr_ask_qty - prev_ask_qty
    else: e_ask = -prev_ask_qty
        
    return e_bid - e_ask
