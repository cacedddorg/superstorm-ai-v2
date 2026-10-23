from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
from pathlib import Path

_env_file = next(
    (parent / ".env" for parent in Path(__file__).resolve().parents if (parent / ".env").is_file()),
    None,
)

class Settings(BaseSettings):
    env: str = "development"
    port: int = 8000
    allowed_origins: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    
    # Bybit config
    bybit_ws_url: str = "wss://stream.bybit.com/v5/public/linear"
    
    # Binance config
    binance_ws_url: str = "wss://fstream.binance.com/ws"
    
    # Orderbook default settings
    default_symbol: str = "BTCUSDT"
    book_depth: int = 50
    stale_data_timeout_ms: int = 5000  # 5 seconds

    # Shared only between the authenticated Next.js server and this service.
    market_api_signing_secret: str = ""
    
    model_config = SettingsConfigDict(
        env_file=_env_file,
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
