from orderbook.book import OrderBook
from models.api_schemas import StrategyStatus

def check_data_quality(book: OrderBook) -> dict:
    """Evaluates if the current order book state is safe for trading."""

    if not book.is_valid:
        return {
            "safe": False,
            "reason": "Book is invalid or resyncing.",
            "quality": "POOR"
        }

    if not book.check_freshness():
        return {
            "safe": False,
            "reason": "Data is stale.",
            "quality": "STALE"
        }

    bids = book.get_top_bids(1)
    asks = book.get_top_asks(1)

    if not bids or not asks:
        return {
            "safe": False,
            "reason": "Missing bids or asks.",
            "quality": "INCOMPLETE"
        }

    if bids[0][0] >= asks[0][0]:
        return {
            "safe": False,
            "reason": "Crossed book.",
            "quality": "INVALID"
        }

    return {
        "safe": True,
        "reason": "Data is fresh and valid.",
        "quality": "GOOD"
    }

def coordinate_risk(strategy_results: list) -> dict:
    """
    Acts as a final risk gate. If any strategy has contradictory strong evidence
    or poor data quality is reported, returns NO_TRADE.
    """
    # For now, just ensures no conflicting decisions if multiple were actionable
    actionable_decisions = [res for res in strategy_results if res.decision == StrategyStatus.ACTIONABLE]

    if len(actionable_decisions) > 1:
        # Check if they disagree on direction (buy vs sell)
        directions = set(res.selected_candidate for res in actionable_decisions if res.selected_candidate)
        if len(directions) > 1:
            return {
                "decision": StrategyStatus.NO_TRADE,
                "reason": "Conflicting evidence from multiple strategies."
            }

    # Hardcoded live trading disable as per user request
    return {
        "decision": StrategyStatus.NO_TRADE,
        "reason": "Live execution is disabled by user directive. Paper/simulation only."
    }
