import time
from orderbook.book import OrderBook
from models.api_schemas import StrategyStatus, StrategyExplanation
from risk.gates import check_data_quality

def evaluate_strategy_b(book: OrderBook, trades: list) -> StrategyExplanation:
    """Strategy B: Sweep/reclaim proxy (absorption evidence)."""
    quality = check_data_quality(book)
    now = int(time.time() * 1000)
    
    if not quality["safe"]:
        return StrategyExplanation(
            strategy_name="Strategy B (Absorption Proxy)",
            evidence="None",
            contrary_evidence="Poor data quality",
            data_quality=quality["quality"],
            missing_inputs=[],
            timestamps={"eval_time": now},
            expiry=now,
            decision=StrategyStatus.NO_TRADE,
            reason=quality["reason"]
        )
        
    return StrategyExplanation(
        strategy_name="Strategy B (Absorption Proxy)",
        evidence="No sweep/reclaim observation has been calculated",
        contrary_evidence="",
        # A healthy order book is not enough for this strategy: its required
        # sweep/reclaim history is not implemented, so the strategy is incomplete.
        data_quality="INCOMPLETE",
        missing_inputs=["historical_sweeps"],
        timestamps={"eval_time": now},
        expiry=now + 5000,
        decision=StrategyStatus.NO_TRADE,
        reason="Strategy B is unavailable until timestamped sweep/reclaim history is implemented"
    )
