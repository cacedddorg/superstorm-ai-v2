import time
from typing import Dict, List, Any
from models.api_schemas import StrategyStatus, StrategyExplanation
from risk.gates import coordinate_risk

def evaluate_strategy_d(strategy_results: List[StrategyExplanation]) -> Dict[str, Any]:
    """
    Strategy D: Coordinator. Compares candidates from A, B, and C,
    identifies conflicts, assesses data quality via risk gates, and
    makes the final NO TRADE or Actionable decision.
    """
    now = int(time.time() * 1000)

    # 1. Coordinate Risk
    risk_assessment = coordinate_risk(strategy_results)

    if risk_assessment["decision"] == StrategyStatus.NO_TRADE:
        return {
            "strategy_name": "Strategy D (Coordinator)",
            "decision": StrategyStatus.NO_TRADE,
            "reason": risk_assessment["reason"],
            "timestamps": {"eval_time": now},
            "sub_strategies": [res.model_dump() for res in strategy_results]
        }

    # 2. Check for actionable candidates that aren't expired
    actionable_results = []
    for res in strategy_results:
        if res.decision == StrategyStatus.ACTIONABLE and res.expiry > now:
            actionable_results.append(res)

    if not actionable_results:
        return {
            "strategy_name": "Strategy D (Coordinator)",
            "decision": StrategyStatus.NO_TRADE,
            "reason": "No valid, unexpired candidates from sub-strategies.",
            "timestamps": {"eval_time": now},
            "sub_strategies": [res.model_dump() for res in strategy_results]
        }

    # If we made it here, risk is coordinated and we have at least one valid candidate.
    # Note: Live trading is disabled by the risk gate so this block should not execute in production
    # unless paper trading logic is implemented. The risk gate hardcodes NO_TRADE.

    selected = actionable_results[0].selected_candidate

    return {
        "strategy_name": "Strategy D (Coordinator)",
        "decision": StrategyStatus.ACTIONABLE,
        "selected_candidate": selected,
        "reason": f"Aligned actionable signal: {selected}",
        "timestamps": {"eval_time": now},
        "sub_strategies": [res.model_dump() for res in strategy_results]
    }
