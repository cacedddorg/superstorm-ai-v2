# SUPERSTORM AI

SUPERSTORM AI is a sophisticated real-time trading-analysis platform designed to identify potentially favorable market entries and exits using live market microstructure, liquidity, executed order flow, price structure, volatility, and a coordinated four-strategy architecture.

## Overview
This repository contains a full-stack Next.js and FastAPI application to deliver live cryptocurrency trading intelligence. 

## Project Structure
- `apps/web`: Next.js frontend with Tailwind CSS and TradingView charts.
- `services/market-engine`: FastAPI backend to ingest live order book data, process market features, and execute strategies.
- `tests`: Unit and integration testing suites.

## Deployment on Vercel Hobby
**WARNING: Vercel Hobby tier is strictly for non-commercial and personal projects.** Please verify that your usage complies with Vercel's fair use and non-commercial restrictions before deploying this crypto intelligence dashboard.

1. Connect your GitHub repository to Vercel.
2. Set the Framework Preset to Next.js.
3. Configure the Root Directory to `apps/web`.
4. Ensure the following environment variables are set in Vercel:
   - `NEXT_PUBLIC_WS_URL`: The WebSocket URL of your backend.
   - `AUTH_USER`: Username for Basic Auth to protect the private dashboard.
   - `AUTH_PASSWORD`: Password for Basic Auth.

**Important Security Note for Production:** The basic frontend authentication set up in this repository only protects the frontend web server (Next.js) rendering the UI. It **does not** protect the backend API or WebSocket endpoints if they are exposed publicly. If you deploy the backend, you must configure a reverse proxy, WAF, or backend authentication (e.g. JWT tokens or VPN access) to prevent unauthorized access to your market data feeds. Ensure you use HTTPS/WSS.

## Supported Features
- Connects to official Bybit and Binance public WebSockets for live market data (BTCUSDT by default).
- Calculates real-time order-flow and microstructure metrics (CVD, spread, midpoint, microprice, imbalance, simple OFI proxy).
- Paper-trading simulation with a coordinated 4-strategy architecture prioritizing risk gates.
- Real-money live execution is currently disabled for safety (paper-trading/simulation only).

## Getting Started Locally
See `AGENTS.md` for architecture details, setup commands, and conventions.
