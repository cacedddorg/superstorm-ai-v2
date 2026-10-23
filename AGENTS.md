# AGENTS.md

## Development Conventions

- Use TypeScript for all frontend code in `apps/web`.
- Use Python 3.12+ with type hints for all backend code in `services/market-engine`.
- Always write explicit unit tests for core logical components.
- Do not bypass structural tests.
- Commits should be detailed and properly formatted.

## Architecture

- The frontend is built on Next.js app router.
- The backend relies on an asynchronous event loop via FastAPI.
- Market data flows: Exchange WS -> Bybit Adapter -> Orderbook Manager -> Feature Engines -> Strategy Fusion -> FastAPI WS -> Frontend.

## Setup Commands

**Frontend**
```bash
cd apps/web
npm install
npm run dev
```

**Backend**
```bash
cd services/market-engine
pip install -r requirements.txt
uvicorn api.main:app --reload --port 8000
```

## Testing Procedures
Run `python -m pytest` from `services/market-engine` for backend logic.
Run `npm run build` in `apps/web` to verify the frontend (there is no `npm test` script).
