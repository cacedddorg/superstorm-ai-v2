# Market engine

## Current scope

This service is retained as an optional continuous WebSocket market-data engine. The dashboard's current refresh-only mode does not call this service; it fetches public Bybit REST snapshots through the Next.js API route in `apps/web`.

- Connects to Bybit V5 public linear market data by default. No API key or paid data service is used.
- Includes an optional Binance USDⓈ-M adapter using its partial top-20 depth stream and aggregate trades. It is not started by default; the manager currently holds one order book per symbol, so running two exchanges for the same symbol would mix unrelated books.
- The Binance partial-depth feed is only the displayed top 20 levels. Neither exchange adapter claims full-depth coverage.
- Strategies A and C are exploratory heuristics; Strategy B is explicitly unavailable until sweep/reclaim history is implemented. Strategy D requires two unexpired agreeing candidates. Signals are research output only; there is no order placement or implemented paper-trading simulator.
- Order-book OFI is unavailable until a prior sample exists. Strategy A samples the book when evaluated, so its OFI interval is evaluation-to-evaluation, not a continuous per-message feature stream.
- The visible size peaks called support/resistance in compatibility fields are cancellable displayed liquidity, not historical price structure. No edge, profitability, fees, slippage, or execution quality has been demonstrated.

## Local run

Use Python 3.12 or newer. From this directory:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn api.main:app --reload --port 8000
```

Run the backend checks from this directory with `python -m pytest`.

## Security and deployment

The optional FastAPI service requires `MARKET_API_SIGNING_SECRET` for its REST and WebSocket routes. This setting is unrelated to the refresh-based dashboard. The dashboard itself uses a single-user Basic Auth gate configured with `AUTH_USER` and `AUTH_PASSWORD`; Basic Auth is not a multi-user identity/session system.

The frontend and continuous Python process are separate services. The frontend can be built for Vercel, but a Vercel Hobby deployment is not approved by this repository setup; verify current non-commercial eligibility before any deployment, especially for trading-related use. No hosting or paid services are activated automatically.
