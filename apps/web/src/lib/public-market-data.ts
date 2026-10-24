import type { MarketCandle, MarketSnapshotInput } from "./market-types";

const BYBIT_API = "https://api.bybit.com";
const BINANCE_API = "https://fapi.binance.com";
const COINBASE_API = "https://api.exchange.coinbase.com";
const BOOK_LIMIT = 50;
const TRADE_LIMIT = 1_000;
const COINBASE_TRADE_LIMIT = 100;
const CANDLE_LIMIT = 60;

type BybitResponse<T> = { retCode?: number; retMsg?: string; time?: number; result?: T };
type BybitBook = { b?: [string, string][]; a?: [string, string][]; ts?: number };
type BybitTrade = { price?: string; size?: string; side?: string; time?: string };
type BybitKline = [string, string, string, string, string, string, string];
type BinanceBook = { bids?: [string, string][]; asks?: [string, string][]; lastUpdateId?: number };
type BinanceCandle = [number, string, string, string, string, string, number, string, number, string, string, string];
type BinanceTrade = { price?: string; qty?: string; time?: number; isBuyerMaker?: boolean };
type BinanceTime = { serverTime?: number };
type CoinbaseBook = { bids?: [string, string, number][]; asks?: [string, string, number][] };
type CoinbaseTime = { epoch?: number };
type CoinbaseCandle = [number, string, string, string, string, string];
type CoinbaseTrade = { price?: string; size?: string; time?: string; side?: "buy" | "sell" };

function normalizeTrade(
  price: string | undefined,
  size: string | undefined,
  timestamp: number | undefined,
  side: string | undefined,
): NonNullable<MarketSnapshotInput["trades"][number]> | null {
  const numericPrice = Number(price);
  const numericSize = Number(size);
  if (!Number.isFinite(numericPrice) || numericPrice <= 0 ||
      !Number.isFinite(numericSize) || numericSize <= 0 ||
      typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp <= 0 ||
      (side?.toLowerCase() !== "buy" && side?.toLowerCase() !== "sell")) {
    return null;
  }
  return { price, size, timestamp, side: side.toLowerCase() };
}

async function checkedJson<T>(url: string, provider: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6_000) });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    let detail = body;
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      detail = String(parsed.retMsg ?? parsed.msg ?? parsed.message ?? parsed.error ?? body);
    } catch {
      detail = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    }
    detail = detail.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
    throw new Error(`${provider} HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  return response.json() as Promise<T>;
}

function coinbaseSpotProduct(symbol: string): string | null {
  const match = /^([A-Z0-9]+)(?:USDT|USD)$/.exec(symbol);
  return match ? `${match[1]}-USD` : null;
}

function requireBybitSuccess<T>(response: BybitResponse<T>, provider: string): T {
  if (response.retCode !== 0 || !response.result) {
    throw new Error(`${provider} ${response.retCode ?? "error"}: ${(response.retMsg ?? "incomplete response").slice(0, 180)}`);
  }
  return response.result;
}

function bybitCandles(response: BybitResponse<{ list?: BybitKline[] }> | null): MarketCandle[] {
  if (!response || response.retCode !== 0 || !Array.isArray(response.result?.list)) return [];
  return response.result.list.flatMap((row): MarketCandle[] => {
    const candle: MarketCandle = {
      open_time: Number(row[0]), open: Number(row[1]), high: Number(row[2]),
      low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]),
    };
    return Number.isFinite(candle.open_time) && candle.open_time > 0 &&
      [candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite) &&
      candle.open > 0 && candle.high >= candle.low && candle.low > 0 && candle.volume >= 0
      ? [candle]
      : [];
  }).sort((left, right) => left.open_time - right.open_time);
}

export async function fetchPublicMarketSnapshot(requestedSymbol: string): Promise<MarketSnapshotInput> {
  const symbol = requestedSymbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,20}$/.test(symbol)) throw new Error("Invalid market symbol");
  const failures: string[] = [];

  try {
    const query = new URLSearchParams({ category: "linear", symbol, limit: String(BOOK_LIMIT) });
    const tradesQuery = new URLSearchParams({ category: "linear", symbol, limit: String(TRADE_LIMIT) });
    const candlesQuery = new URLSearchParams({ category: "linear", symbol, interval: "1", limit: String(CANDLE_LIMIT) });
    const [bookResponse, tradeResponse, candleResponse] = await Promise.all([
      checkedJson<BybitResponse<BybitBook>>(`${BYBIT_API}/v5/market/orderbook?${query}`, "Bybit"),
      checkedJson<BybitResponse<{ list?: BybitTrade[] }>>(`${BYBIT_API}/v5/market/recent-trade?${tradesQuery}`, "Bybit"),
      checkedJson<BybitResponse<{ list?: BybitKline[] }>>(`${BYBIT_API}/v5/market/kline?${candlesQuery}`, "Bybit candles").catch(() => null),
    ]);
    const book = requireBybitSuccess(bookResponse, "Bybit order book");
    const tradeData = requireBybitSuccess(tradeResponse, "Bybit recent trades");
    if (!Array.isArray(book.b) || !Array.isArray(book.a) || !book.ts) throw new Error("Bybit returned an incomplete order book");
    return {
      exchange: "bybit", category: "linear", symbol,
      bids: book.b.slice(0, BOOK_LIMIT), asks: book.a.slice(0, BOOK_LIMIT),
      // A malformed trade row must not invalidate an otherwise good book.
      // Keep only fully usable rows so NaN cannot serialize to null and fail
      // the authenticated snapshot validator.
      trades: (tradeData.list ?? []).slice(0, TRADE_LIMIT).flatMap((trade) => {
        const normalized = normalizeTrade(trade.price, trade.size, Number(trade.time), trade.side);
        return normalized ? [normalized] : [];
      }),
      recent_trade_count: (tradeData.list ?? []).length,
      trade_limit: TRADE_LIMIT,
      candles: bybitCandles(candleResponse),
      timestamp_source: "orderbook",
      exchange_timestamp: Number(book.ts), trade_server_time: Number(tradeResponse.time ?? Date.now()),
    };
  } catch (error) {
    failures.push(error instanceof Error ? error.message : "Bybit request failed");
  }

  try {
    const query = new URLSearchParams({ symbol, limit: String(BOOK_LIMIT) });
    const tradesQuery = new URLSearchParams({ symbol, limit: String(TRADE_LIMIT) });
    const candlesQuery = new URLSearchParams({ symbol, interval: "1m", limit: String(CANDLE_LIMIT) });
    const [book, trades, exchangeTime, rawCandles] = await Promise.all([
      checkedJson<BinanceBook>(`${BINANCE_API}/fapi/v1/depth?${query}`, "Binance USDⓈ-M"),
      checkedJson<BinanceTrade[]>(`${BINANCE_API}/fapi/v1/trades?${tradesQuery}`, "Binance USDⓈ-M"),
      checkedJson<BinanceTime>(`${BINANCE_API}/fapi/v1/time`, "Binance USDⓈ-M time"),
      checkedJson<BinanceCandle[]>(`${BINANCE_API}/fapi/v1/klines?${candlesQuery}`, "Binance USDⓈ-M candles").catch(() => []),
    ]);
    if (!Array.isArray(book.bids) || !Array.isArray(book.asks) || !Array.isArray(trades) || !exchangeTime.serverTime) {
      throw new Error("Binance returned an incomplete market snapshot");
    }
    return {
      exchange: "binance", category: "linear", symbol,
      bids: book.bids.slice(0, BOOK_LIMIT), asks: book.asks.slice(0, BOOK_LIMIT),
      trades: trades.slice(0, TRADE_LIMIT).flatMap((trade) => {
        const side = trade.isBuyerMaker === true ? "sell" : trade.isBuyerMaker === false ? "buy" : undefined;
        const normalized = normalizeTrade(trade.price, trade.qty, trade.time, side);
        return normalized ? [normalized] : [];
      }),
      recent_trade_count: trades.length,
      trade_limit: TRADE_LIMIT,
      candles: rawCandles.flatMap((row): MarketCandle[] => {
        const candle: MarketCandle = { open_time: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]) };
        return Number.isFinite(candle.open_time) && [candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite) && candle.open > 0 && candle.high >= candle.low && candle.low > 0 && candle.volume >= 0 ? [candle] : [];
      }).sort((left, right) => left.open_time - right.open_time),
      timestamp_source: "exchange_clock_estimate",
      exchange_timestamp: Number(exchangeTime.serverTime), trade_server_time: Number(exchangeTime.serverTime),
    };
  } catch (error) {
    failures.push(error instanceof Error ? error.message : "Binance request failed");
  }

  const product = coinbaseSpotProduct(symbol);
  if (!product) throw new Error(`${failures.join("; ")}; Coinbase has no safe USD spot mapping for ${symbol}`);
  try {
    const productPath = `/products/${encodeURIComponent(product)}`;
    const end = Date.now();
    const candlesQuery = new URLSearchParams({ granularity: "60", start: new Date(end - CANDLE_LIMIT * 60_000).toISOString(), end: new Date(end).toISOString() });
    const [book, trades, exchangeTime, rawCandles] = await Promise.all([
      checkedJson<CoinbaseBook>(`${COINBASE_API}${productPath}/book?level=2`, "Coinbase Exchange"),
      checkedJson<CoinbaseTrade[]>(`${COINBASE_API}${productPath}/trades?limit=${COINBASE_TRADE_LIMIT}`, "Coinbase Exchange"),
      checkedJson<CoinbaseTime>(`${COINBASE_API}/time`, "Coinbase Exchange time"),
      checkedJson<CoinbaseCandle[]>(`${COINBASE_API}${productPath}/candles?${candlesQuery}`, "Coinbase Exchange candles").catch(() => []),
    ]);
    if (!Array.isArray(book.bids) || !Array.isArray(book.asks) || !Array.isArray(trades) || !exchangeTime.epoch) {
      throw new Error(`Coinbase returned an incomplete market snapshot for ${product}`);
    }
    return {
      exchange: "coinbase", category: "spot", symbol: product,
      bids: book.bids.slice(0, BOOK_LIMIT).map(([price, size]) => [price, size]),
      asks: book.asks.slice(0, BOOK_LIMIT).map(([price, size]) => [price, size]),
      // Coinbase reports the maker side; reverse it to estimate the aggressing side.
      trades: trades.slice(0, TRADE_LIMIT).flatMap((trade) => {
        const timestamp = trade.time ? Date.parse(trade.time) : undefined;
        // Coinbase reports the maker side; reverse it to estimate the aggressing side.
        const side = trade.side === "buy" ? "sell" : trade.side === "sell" ? "buy" : undefined;
        const normalized = normalizeTrade(trade.price, trade.size, timestamp, side);
        return normalized ? [normalized] : [];
      }),
      recent_trade_count: trades.length,
      trade_limit: COINBASE_TRADE_LIMIT,
      candles: rawCandles.flatMap((row): MarketCandle[] => {
        const candle: MarketCandle = { open_time: Number(row[0]) * 1_000, low: Number(row[1]), high: Number(row[2]), open: Number(row[3]), close: Number(row[4]), volume: Number(row[5]) };
        return Number.isFinite(candle.open_time) && [candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite) && candle.open > 0 && candle.high >= candle.low && candle.low > 0 && candle.volume >= 0 ? [candle] : [];
      }).sort((left, right) => left.open_time - right.open_time),
      timestamp_source: "exchange_clock_estimate",
      exchange_timestamp: Number(exchangeTime.epoch) * 1_000, trade_server_time: Number(exchangeTime.epoch) * 1_000,
    };
  } catch (error) {
    const failure = error instanceof Error ? error.message : "Coinbase request failed";
    throw new Error(`${failures.join("; ")}; ${failure}`);
  }
}

