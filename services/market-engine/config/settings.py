from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
import os

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

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
