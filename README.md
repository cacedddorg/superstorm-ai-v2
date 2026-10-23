# SUPERSTORM AI

SUPERSTORM AI is a private, single-user cryptocurrency market-research prototype. It consumes free public exchange market data and exposes exploratory strategy heuristics. It is not a verified profitable trading system and does not place orders or implement paper-trade execution.

## Overview
The dashboard fetches a fresh public market snapshot only when you press **Fetch snapshot** or **Refresh snapshot**. Its Next.js server route tries Bybit first, then Binance USDⓈ-M Futures, then Coinbase Exchange public market-data endpoints. If it falls back to Coinbase, a request such as `BTCUSDT` maps to the Coinbase `BTC-USD` spot product. The returned product and `spot` category are shown explicitly: this is a different venue and market from the requested USDT perpetual contract. The route never presents it as equivalent perpetual data. The Python FastAPI/WebSocket engine remains a separate optional continuous-feed implementation and is not required by the refresh-based dashboard.

## Project Structure
- `apps/web`: Next.js frontend with Tailwind CSS and TradingView charts.
- `services/market-engine`: FastAPI backend to ingest exchange order-book data, calculate features, and evaluate exploratory strategies.
- `tests`: Unit and integration testing suites.

## Vercel and private-use restrictions
Vercel Hobby is intended for personal, non-commercial use. This application is trading-related; do not assume it qualifies. Confirm eligibility against Vercel's current terms before connecting GitHub or deploying. This repository does not deploy automatically or enable paid services.

If approved later, set the Vercel root directory to `apps/web` and configure `AUTH_USER` and `AUTH_PASSWORD`. The single-user Basic Auth proxy also protects the on-demand market API route. Refresh requests use public exchange REST endpoints from the server; no exchange API key or separate always-on service is needed for this mode. Confirm Vercel Hobby eligibility before any deployment, especially for trading-related use. This repository does not deploy automatically or enable paid services.

Refresh mode is deliberately snapshot-based: order-book flow between refreshes is only approximated from two snapshots in the current browser session; Strategy B remains unavailable because it requires sweep/reclaim history. Trade history is limited by the exchange response, and truncated samples suppress affected candidates. This mode does not claim continuous-feed quality.

## Getting Started Locally
See `AGENTS.md` for setup commands and conventions. To run the frontend locally, create `apps/web/.env.local` with `AUTH_USER` and `AUTH_PASSWORD`, then run `npm run dev` from `apps/web`. The market snapshot route does not require the Python process.
