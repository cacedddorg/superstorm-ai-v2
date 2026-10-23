import time
from orderbook.book import OrderBook
from models.api_schemas import StrategyStatus, StrategyExplanation
from risk.gates import check_data_quality
from features.microstructure import calculate_imbalance, calculate_microprice, get_midpoint
from features.order_flow import calculate_trade_intensity

def evaluate_strategy_c(book: OrderBook, trades: list) -> StrategyExplanation:
    """Strategy C: Imbalance and microprice."""
    quality = check_data_quality(book)
    now = int(time.time() * 1000)
    
    if not quality["safe"]:
        return StrategyExplanation(
            strategy_name="Strategy C (Imbalance)",
            evidence="None",
            contrary_evidence="Poor data quality",
            data_quality=quality["quality"],
            missing_inputs=[],
            timestamps={"eval_time": now},
            expiry=now,
            decision=StrategyStatus.NO_TRADE,
            reason=quality["reason"]
        )
        
    imbalance = calculate_imbalance(book, levels=5) or 0.0
    microprice = calculate_microprice(book) or 0.0
    midpoint = get_midpoint(book) or 0.0
    intensity = calculate_trade_intensity(trades, time_window_ms=1000)
    
    decision = StrategyStatus.NO_TRADE
    candidate = None
    reason = "Imbalance neutral"
    
    # If microprice is significantly higher than midpoint and bid-heavy imbalance
    if intensity >= 1.0 and imbalance > 0.4 and microprice > midpoint:
        decision = StrategyStatus.ACTIONABLE
        candidate = "buy"
        reason = "Strong bid-side imbalance pulling microprice up"
    elif intensity >= 1.0 and imbalance < -0.4 and microprice < midpoint:
        decision = StrategyStatus.ACTIONABLE
        candidate = "sell"
        reason = "Strong ask-side imbalance pulling microprice down"

    return StrategyExplanation(
        strategy_name="Strategy C (Imbalance)",
        evidence=f"Imbalance: {imbalance:.2f}, Microprice: {microprice:.2f}, recent trade intensity: {intensity:.2f}/s",
        contrary_evidence="Heuristic thresholds are unvalidated and omit fees and slippage",
        data_quality=quality["quality"],
        missing_inputs=[] if intensity >= 1.0 else ["recent_trade_confirmation"],
        timestamps={"eval_time": now},
        expiry=now + 2000, # Expires quickly
        decision=decision,
        selected_candidate=candidate,
        reason=reason if intensity >= 1.0 else "No recent trade confirmation; no candidate generated"
    )
