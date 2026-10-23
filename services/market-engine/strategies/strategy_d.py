from __future__ import annotations

import time
from collections import Counter
from typing import Iterable

from models.api_schemas import StrategyExplanation, StrategyStatus


def evaluate_strategy_d(
    strategies: Iterable[StrategyExplanation], minimum_agreement: int = 2
) -> StrategyExplanation:
    """Fuse research candidates; this never authorizes or places an order."""
    now = int(time.time() * 1000)
    valid = [
        result for result in strategies
        if result.decision == StrategyStatus.ACTIONABLE
        and result.selected_candidate in {"buy", "sell"}
        and result.expiry >= now
    ]
    votes = Counter(result.selected_candidate for result in valid)
    winner, count = votes.most_common(1)[0] if votes else (None, 0)
    conflict = bool(votes.get("buy") and votes.get("sell"))
    actionable = bool(winner and count >= minimum_agreement and not conflict)

    return StrategyExplanation(
        strategy_name="Strategy D (Consensus)",
        evidence=f"Votes: buy={votes.get('buy', 0)}, sell={votes.get('sell', 0)}",
        contrary_evidence=("Conflicting candidates" if conflict else "No conflicting candidate"),
        data_quality=("GOOD" if valid else "INCOMPLETE"),
        missing_inputs=[] if valid else ["unexpired_strategy_candidates"],
        timestamps={"eval_time": now},
        expiry=min((result.expiry for result in valid), default=now),
        decision=StrategyStatus.ACTIONABLE if actionable else StrategyStatus.NO_TRADE,
        selected_candidate=winner if actionable else None,
        reason=(
            f"{count} independent strategies agree; research signal only, no order placed"
            if actionable else
            f"Need {minimum_agreement} agreeing unexpired strategy candidates; research only"
        ),
    )
