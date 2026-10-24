# SUPERSTORM AI

SUPERSTORM AI is a private, single-user cryptocurrency market-research prototype. It consumes free public exchange market data and exposes exploratory strategy heuristics. It is not a verified profitable trading system and does not place orders or implement paper-trade execution.

## Overview
The dashboard requests public market data only when you press **Fetch snapshot** or **Refresh snapshot**. Choose Spot or linear Perpetual and select preferred strategy-data exchanges. The selected providers are tried in order until one returns a valid bounded snapshot; Coinbase is available for Spot only. The request comes from the user's browser, so exchanges see the user's actual connection and their regional restrictions still apply. A Coinbase USD spot market is never presented as a USDT perpetual market. The Python FastAPI/WebSocket engine remains separate and is not required by refresh mode.

Each A/B/C strategy card can show a research entry reference and long/short stop and exit scenarios when at least 15 completed one-minute candles exist. Candidate direction selects the corresponding levels; otherwise both are explicitly marked as scenarios with no strategy candidate. Levels use a 14-candle ATR and prior 20-minute swing, with a 1.5R target. They are heuristic calculations, not validated forecasts, personalized advice, or order instructions.

The market overview also compares last-trade prices from ten public venues for the selected market type and requests Bybit/Binance rolling 24-hour quote turnover. HIGH/LOW is a comparison with the mean of available completed daily candles over up to 30 days (minimum seven); it is not an absolute liquidity grade. Each venue's native instrument, quote currency, and request failure are shown. Spot, linear perpetual, inverse perpetual, and quote-currency prices are not interchangeable, and the price list is not a synchronized executable quote.

## Project Structure
- `apps/web`: Next.js frontend with Tailwind CSS and TradingView charts.
- `services/market-engine`: FastAPI backend to ingest exchange order-book data, calculate features, and evaluate exploratory strategies.
- `tests`: Unit and integration testing suites.

## Vercel and private-use restrictions
Vercel Hobby is intended for personal, non-commercial use. This application is trading-related; do not assume it qualifies. Confirm eligibility against Vercel's current terms before connecting GitHub or deploying. This repository does not deploy automatically or enable paid services.

If approved later, set the Vercel root directory to `apps/web` and configure `AUTH_USER` and `AUTH_PASSWORD`. The single-user Basic Auth proxy also protects the on-demand market calculation API route. The browser calls public exchange REST endpoints only after a refresh click; no exchange API key or separate always-on service is needed for this mode. Confirm Vercel Hobby eligibility before any deployment, especially for trading-related use. This repository does not deploy automatically or enable paid services.

Refresh mode is deliberately snapshot-based: order-book flow between refreshes is only approximated from two snapshots in the current browser session; Strategy B remains unavailable because it requires sweep/reclaim history. Trade history is limited by the exchange response, and truncated samples suppress affected candidates. This mode does not claim continuous-feed quality.

## Getting Started Locally
See `AGENTS.md` for setup commands and conventions. To run the frontend locally, create `apps/web/.env.local` with `AUTH_USER` and `AUTH_PASSWORD`, then run `npm run dev` from `apps/web`. The market snapshot route does not require the Python process.

