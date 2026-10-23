import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config.settings import settings
from api.routes import health, market, websocket
from exchange_adapters.bybit_v5 import BybitV5Adapter
from exchange_adapters.binance import BinanceAdapter

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting market-engine...")
    
    # Initialize default symbol
    symbol = settings.default_symbol
    
    # Defaulting to Bybit as primary for this milestone
    bybit_adapter = BybitV5Adapter(symbol)
    
    adapter_tasks = [(bybit_adapter, asyncio.create_task(bybit_adapter.connect()))]
    
    # Optional: Binance could also be spun up here if we want multiple adapters 
    # writing to the same book manager for different symbols. 
    # For now, we fulfill the requirement by prioritizing Bybit as default feed.
    # binance_adapter = BinanceAdapter(symbol)
    # adapter_tasks.append((binance_adapter, asyncio.create_task(binance_adapter.connect())))
    
    yield
    
    logger.info("Shutting down market-engine...")
    for adapter, task in adapter_tasks:
        await adapter.stop()
        task.cancel()
    await asyncio.gather(*(task for _, task in adapter_tasks), return_exceptions=True)

app = FastAPI(title="SUPERSTORM AI Market Engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(market.router)
app.include_router(websocket.router)
