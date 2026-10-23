import type { MarketSnapshotInput } from "./market-types";

const BYBIT_API = "https://api.bybit.com";
const BINANCE_API = "https://fapi.binance.com";
const COINBASE_API = "https://api.exchange.coinbase.com";
const BOOK_LIMIT = 50;
const TRADE_LIMIT = 100;

type BybitResponse<T> = { retCode?: number; retMsg?: string; time?: number; result?: T };
type BybitBook = { b?: [string, string][]; a?: [string, string][]; ts?: number };
type BybitTrade = { price?: string; size?: string; side?: string; time?: string };
type BinanceBook = { bids?: [string, string][]; asks?: [string, string][]; T?: number };
type BinanceTrade = { price?: string; qty?: string; time?: number; isBuyerMaker?: boolean };
type CoinbaseBook = { bids?: [string, string, number][]; asks?: [string, string, number][]; time?: string };
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

export async function fetchPublicMarketSnapshot(requestedSymbol: string): Promise<MarketSnapshotInput> {
  const symbol = requestedSymbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,20}$/.test(symbol)) throw new Error("Invalid market symbol");
  const failures: string[] = [];

  try {
    const query = new URLSearchParams({ category: "linear", symbol, limit: String(BOOK_LIMIT) });
    const tradesQuery = new URLSearchParams({ category: "linear", symbol, limit: String(TRADE_LIMIT) });
    const [bookResponse, tradeResponse] = await Promise.all([
      checkedJson<BybitResponse<BybitBook>>(`${BYBIT_API}/v5/market/orderbook?${query}`, "Bybit"),
      checkedJson<BybitResponse<{ list?: BybitTrade[] }>>(`${BYBIT_API}/v5/market/recent-trade?${tradesQuery}`, "Bybit"),
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
      exchange_timestamp: Number(book.ts), trade_server_time: Number(tradeResponse.time ?? Date.now()),
    };
  } catch (error) {
    failures.push(error instanceof Error ? error.message : "Bybit request failed");
  }

  try {
    const query = new URLSearchParams({ symbol, limit: String(BOOK_LIMIT) });
    const tradesQuery = new URLSearchParams({ symbol, limit: String(TRADE_LIMIT) });
    const [book, trades] = await Promise.all([
      checkedJson<BinanceBook>(`${BINANCE_API}/fapi/v1/depth?${query}`, "Binance USDⓈ-M"),
      checkedJson<BinanceTrade[]>(`${BINANCE_API}/fapi/v1/trades?${tradesQuery}`, "Binance USDⓈ-M"),
    ]);
    if (!Array.isArray(book.bids) || !Array.isArray(book.asks) || !Array.isArray(trades) || !book.T) {
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
      exchange_timestamp: Number(book.T), trade_server_time: Date.now(),
    };
  } catch (error) {
    failures.push(error instanceof Error ? error.message : "Binance request failed");
  }

  const product = coinbaseSpotProduct(symbol);
  if (!product) throw new Error(`${failures.join("; ")}; Coinbase has no safe USD spot mapping for ${symbol}`);
  try {
    const productPath = `/products/${encodeURIComponent(product)}`;
    const [book, trades] = await Promise.all([
      checkedJson<CoinbaseBook>(`${COINBASE_API}${productPath}/book?level=2`, "Coinbase Exchange"),
      checkedJson<CoinbaseTrade[]>(`${COINBASE_API}${productPath}/trades?limit=${TRADE_LIMIT}`, "Coinbase Exchange"),
    ]);
    if (!Array.isArray(book.bids) || !Array.isArray(book.asks) || !Array.isArray(trades) || !book.time) {
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
      exchange_timestamp: Date.parse(book.time), trade_server_time: Date.now(),
    };
  } catch (error) {
    const failure = error instanceof Error ? error.message : "Coinbase request failed";
    throw new Error(`${failures.join("; ")}; ${failure}`);
  }
}

