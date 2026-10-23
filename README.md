# SUPERSTORM AI

SUPERSTORM AI is a private, single-user cryptocurrency market-research prototype. It consumes free public exchange market data and exposes exploratory strategy heuristics. It is not a verified profitable trading system and does not place orders or implement paper-trade execution.

## Overview
This repository contains a Next.js frontend and a separate FastAPI market-data service. Current backend coverage, missing measurements, and run instructions are documented in `services/market-engine/README.md`.

## Project Structure
- `apps/web`: Next.js frontend with Tailwind CSS and TradingView charts.
- `services/market-engine`: FastAPI backend to ingest exchange order-book data, calculate features, and evaluate exploratory strategies.
- `tests`: Unit and integration testing suites.

## Vercel and private-use restrictions
Vercel Hobby is intended for personal, non-commercial use. This application is trading-related; do not assume it qualifies. Confirm eligibility against Vercel's current terms before connecting GitHub or deploying. This repository does not deploy automatically or enable paid services.

If approved later, set the Vercel root directory to `apps/web`, configure `NEXT_PUBLIC_WS_URL`, `MARKET_ENGINE_URL`, `AUTH_USER`, `AUTH_PASSWORD`, and the same private `MARKET_API_SIGNING_SECRET` on both services. The frontend Basic Auth proxy protects the private frontend; short-lived HMAC tokens protect the backend REST and WebSocket routes. Production still requires HTTPS/WSS. Confirm Hobby eligibility before deployment.

## Getting Started Locally
See `AGENTS.md` for architecture details, setup commands, and conventions.
