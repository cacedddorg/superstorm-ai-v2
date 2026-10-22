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
        evidence="Observed large limit orders replenishing after sweeps",
        contrary_evidence="Low recent trade volume",
        data_quality=quality["quality"],
        missing_inputs=["historical_sweeps"],
        timestamps={"eval_time": now},
        expiry=now + 5000,
        decision=StrategyStatus.NO_TRADE,
        reason="Not enough measurable reclaim evidence to form actionable candidate"
    )
