import time
from orderbook.book import OrderBook
from models.api_schemas import StrategyStatus, StrategyExplanation
from risk.gates import check_data_quality
from features.order_flow import calculate_cvd, calculate_ofi
from features.structure import extract_local_structure

# Temporary state for OFI calculation across evaluations
# In a robust implementation, this would be managed by a feature manager
_prev_book_state = {}

def evaluate_strategy_a(book: OrderBook, trades: list) -> StrategyExplanation:
    """Strategy A: Order-flow momentum using CVD, OFI, and causal structure."""
    global _prev_book_state

    quality = check_data_quality(book)
    now = int(time.time() * 1000)

    # 1. Reject invalid/stale/missing inputs
    if not quality["safe"]:
        return StrategyExplanation(
            strategy_name="Strategy A (Momentum)",
            evidence="None",
            contrary_evidence="Poor data quality",
            data_quality=quality["quality"],
            missing_inputs=[],
            timestamps={"eval_time": now},
            expiry=now,
            decision=StrategyStatus.NO_TRADE,
            reason=quality["reason"]
        )

    bids = book.get_top_bids(1)
    asks = book.get_top_asks(1)
    if not bids or not asks:
        return StrategyExplanation(
            strategy_name="Strategy A (Momentum)",
            evidence="None",
            contrary_evidence="Missing top of book data",
            data_quality="INCOMPLETE",
            missing_inputs=["best_bid", "best_ask"],
            timestamps={"eval_time": now},
            expiry=now,
            decision=StrategyStatus.NO_TRADE,
            reason="Cannot calculate OFI without top of book data"
        )

    # 2. Calculate features
    cvd = calculate_cvd(trades)

    # Calculate OFI using previous valid state
    ofi = calculate_ofi(book, _prev_book_state)

    # Update previous state for next evaluation using CURRENT causally available data
    _prev_book_state["best_bid"] = bids[0][0]
    _prev_book_state["best_bid_qty"] = bids[0][1]
    _prev_book_state["best_ask"] = asks[0][0]
    _prev_book_state["best_ask_qty"] = asks[0][1]

    # Calculate local structure
    structure = extract_local_structure(book, depth=10)
    support_levels = structure.get("support_levels", [])
    resistance_levels = structure.get("resistance_levels", [])

    # 3. Evaluate Momentum Logic
    decision = StrategyStatus.NO_TRADE
    candidate = None
    reason = "Insufficient momentum"

    # Simple momentum proxy: positive CVD, positive OFI, and strong support structure below best bid
    if cvd > 10.0 and ofi > 0 and len(support_levels) > 0 and max(support_levels) < bids[0][0]:
        decision = StrategyStatus.ACTIONABLE
        candidate = "buy"
        reason = "Strong positive CVD, positive OFI, and structural support"
    elif cvd < -10.0 and ofi < 0 and len(resistance_levels) > 0 and min(resistance_levels) > asks[0][0]:
        decision = StrategyStatus.ACTIONABLE
        candidate = "sell"
        reason = "Strong negative CVD, negative OFI, and structural resistance"

    return StrategyExplanation(
        strategy_name="Strategy A (Momentum)",
        evidence=f"CVD: {cvd:.2f}, OFI: {ofi:.2f}, Supports: {len(support_levels)}, Resistances: {len(resistance_levels)}",
        contrary_evidence="None identified",
        data_quality=quality["quality"],
        missing_inputs=[],
        timestamps={"eval_time": now},
        expiry=now + 5000, # 5s expiry
        decision=decision,
        selected_candidate=candidate,
        reason=reason
    )
