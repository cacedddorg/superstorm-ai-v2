from fastapi import APIRouter, Depends
from orderbook.manager import manager
from config.settings import settings
from risk.gates import check_data_quality
from strategies.strategy_a import evaluate_strategy_a
from strategies.strategy_b import evaluate_strategy_b
from strategies.strategy_c import evaluate_strategy_c
from strategies.strategy_d import evaluate_strategy_d
from security.dependencies import require_market_token

router = APIRouter(dependencies=[Depends(require_market_token)])

@router.get("/market/status")
async def get_market_status(symbol: str | None = None):
    """Returns REST snapshot of current book status and strategies."""
    symbol = symbol or settings.default_symbol
    book = manager.get_book(symbol)
    trades = manager.get_recent_trades(symbol, 100)
    
    quality = check_data_quality(book)
    
    # Evaluate strategies if book is valid enough to test logic
    res_a = evaluate_strategy_a(book, trades)
    res_b = evaluate_strategy_b(book, trades)
    res_c = evaluate_strategy_c(book, trades)
    
    decision = evaluate_strategy_d([res_a, res_b, res_c])
    
    return {
        "symbol": symbol,
        "quality": quality,
        "decision": decision,
        "strategies": [res_a, res_b, res_c],
        "book_valid": book.is_valid,
        "bids_count": len(book.bids),
        "asks_count": len(book.asks)
    }
