from typing import List, Tuple, Optional
from orderbook.book import OrderBook

def extract_local_structure(book: OrderBook, depth: int = 10) -> dict:
    """
    Identifies causal local structure levels based on order book depth.
    A simple proxy for structure: finding local maxima in order book size
    within the visible depth.
    """
    bids = book.get_top_bids(depth)
    asks = book.get_top_asks(depth)

    structure = {
        "support_levels": [],
        "resistance_levels": []
    }

    if len(bids) >= 3:
        # Find local peaks in bid sizes
        for i in range(1, len(bids) - 1):
            if bids[i][1] > bids[i-1][1] and bids[i][1] > bids[i+1][1]:
                # If size is significantly larger than average
                avg_size = sum(b[1] for b in bids) / len(bids)
                if bids[i][1] > avg_size * 1.5:
                    structure["support_levels"].append(bids[i][0])

    if len(asks) >= 3:
        # Find local peaks in ask sizes
        for i in range(1, len(asks) - 1):
            if asks[i][1] > asks[i-1][1] and asks[i][1] > asks[i+1][1]:
                avg_size = sum(a[1] for a in asks) / len(asks)
                if asks[i][1] > avg_size * 1.5:
                    structure["resistance_levels"].append(asks[i][0])

    return structure
