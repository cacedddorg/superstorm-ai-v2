import { NextResponse } from "next/server";
import type {
  MarketStatusPayload,
  OrderBookLevel,
  PreviousBookSample,
  StrategyExplanation,
} from "../../../lib/market-types";
import { hasBasicAuthConfig, isAuthorizedBasicRequest } from "../../../lib/basic-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BYBIT_API = "https://api.bybit.com";
const BINANCE_API = "https://fapi.binance.com";
const COINBASE_API = "https://api.exchange.coinbase.com";
const BOOK_LIMIT = 50;
const TRADE_LIMIT = 100;
const MAX_BOOK_AGE_MS = 15_000;
const MAX_PREVIOUS_SAMPLE_AGE_MS = 60_000;

type BybitEnvelope<T> = {
  retCode?: number;
  retMsg?: string;
  time?: number;
  result?: T;
};

type BybitBook = {
  s?: string;
  b?: [string, string][];
  a?: [string, string][];
  ts?: number;
  u?: number;
};

type BybitTrade = {
  price?: string;
  size?: string;
  side?: string;
  time?: string;
};

type BinanceBook = {
  bids?: [string, string][];
  asks?: [string, string][];
  T?: number;
};

type BinanceTrade = {
  price?: string;
  qty?: string;
  time?: number;
  isBuyerMaker?: boolean;
};

type CoinbaseBook = { bids?: [string, string, number][]; asks?: [string, string, number][]; time?: string };
type CoinbaseTrade = { price?: string; size?: string; time?: string; side?: "buy" | "sell" };

function coinbaseSpotProduct(symbol: string): string | null {
  const match = /^([A-Z0-9]+)(?:USDT|USD)$/.exec(symbol);
  return match ? `${match[1]}-USD` : null;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

function parseLevels(raw: unknown): OrderBookLevel[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): OrderBookLevel[] => {
    if (!Array.isArray(entry) || entry.length < 2) return [];
    const price = Number(entry[0]);
    const quantity = Number(entry[1]);
    return Number.isFinite(price) && Number.isFinite(quantity) && price > 0 && quantity > 0
      ? [{ price, quantity }]
      : [];
  });
}

function validPreviousSample(value: unknown, now: number, exchange: "bybit" | "binance" | "coinbase"): PreviousBookSample | null {
  if (!value || typeof value !== "object") return null;
  const sample = value as Partial<PreviousBookSample>;
  if (sample.exchange !== exchange) return null;
  const fields = [sample.fetched_at, sample.best_bid, sample.best_bid_qty, sample.best_ask, sample.best_ask_qty];
  if (!fields.every((field) => typeof field === "number" && Number.isFinite(field))) return null;
  if (
    !sample.fetched_at || !sample.best_bid || !sample.best_bid_qty || !sample.best_ask || !sample.best_ask_qty ||
    sample.best_bid >= sample.best_ask || sample.fetched_at >= now || now - sample.fetched_at > MAX_PREVIOUS_SAMPLE_AGE_MS
  ) return null;
  return sample as PreviousBookSample;
}

function makeStrategy(
  now: number,
  strategy_name: string,
  evidence: string,
  contrary_evidence: string,
  data_quality: string,
  missing_inputs: string[],
  reason: string,
  candidate: "buy" | "sell" | null = null,
  ttlMs = 5_000,
): StrategyExplanation {
  return {
    strategy_name,
    evidence,
    contrary_evidence,
    data_quality,
    missing_inputs,
    timestamps: { eval_time: now },
    expiry: now + ttlMs,
    decision: candidate ? "actionable" : "no_trade",
    selected_candidate: candidate,
    reason,
  };
}

export async function POST(request: Request) {
  if (!hasBasicAuthConfig()) return jsonError("Authentication is not configured", 503);
  if (!isAuthorizedBasicRequest(request.headers.get("authorization"))) return jsonError("Authentication required", 401);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 2_048) return jsonError("Refresh request is too large", 413);
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return jsonError("Refresh request must use application/json", 415);
  }

  let input: { symbol?: unknown; previous_sample?: unknown };
  try {
    input = await request.json();
  } catch {
    return jsonError("A JSON refresh request is required", 400);
  }

  const symbol = typeof input.symbol === "string" ? input.symbol.trim().toUpperCase() : "BTCUSDT";
  if (!/^[A-Z0-9]{3,20}$/.test(symbol)) return jsonError("Invalid market symbol", 400);

  try {
    type NormalizedTrade = { price?: string; size?: string; timestamp?: string | number; side?: string };
    let exchange: "bybit" | "binance" | "coinbase" = "bybit";
    let category: "linear" | "spot" = "linear";
    let marketSymbol = symbol;
    let rawBids: unknown;
    let rawAsks: unknown;
    let rawTrades: NormalizedTrade[] = [];
    let exchangeTimestamp = 0;
    let tradeServerTime = 0;
    let bybitFailure = "Bybit market data is unavailable";

    try {
      const query = new URLSearchParams({ category: "linear", symbol, limit: String(BOOK_LIMIT) });
      const tradesQuery = new URLSearchParams({ category: "linear", symbol, limit: String(TRADE_LIMIT) });
      const [bookResponse, tradesResponse] = await Promise.all([
        fetch(`${BYBIT_API}/v5/market/orderbook?${query}`, { cache: "no-store", signal: AbortSignal.timeout(8_000) }),
        fetch(`${BYBIT_API}/v5/market/recent-trade?${tradesQuery}`, { cache: "no-store", signal: AbortSignal.timeout(8_000) }),
      ]);
      if (!bookResponse.ok || !tradesResponse.ok) {
        throw new Error(`Bybit HTTP ${!bookResponse.ok ? bookResponse.status : tradesResponse.status}`);
      }
      const [bookEnvelope, tradesEnvelope] = await Promise.all([
        bookResponse.json() as Promise<BybitEnvelope<BybitBook>>,
        tradesResponse.json() as Promise<BybitEnvelope<{ list?: BybitTrade[] }>>,
      ]);
      if (bookEnvelope.retCode !== 0 || tradesEnvelope.retCode !== 0 || !bookEnvelope.result || !tradesEnvelope.result) {
        throw new Error("Bybit returned an incomplete market snapshot");
      }
      rawBids = bookEnvelope.result.b;
      rawAsks = bookEnvelope.result.a;
      rawTrades = (tradesEnvelope.result.list ?? []).map((trade) => ({
        price: trade.price, size: trade.size, timestamp: trade.time, side: trade.side,
      }));
      exchangeTimestamp = Number(bookEnvelope.result.ts);
      tradeServerTime = Number(tradesEnvelope.time);
    } catch (cause) {
      bybitFailure = cause instanceof Error ? cause.message : bybitFailure;
      exchange = "binance";
      const query = new URLSearchParams({ symbol, limit: String(BOOK_LIMIT) });
      const tradesQuery = new URLSearchParams({ symbol, limit: String(TRADE_LIMIT) });
      const [bookResponse, tradesResponse] = await Promise.all([
        fetch(`${BINANCE_API}/fapi/v1/depth?${query}`, { cache: "no-store", signal: AbortSignal.timeout(8_000) }),
        fetch(`${BINANCE_API}/fapi/v1/trades?${tradesQuery}`, { cache: "no-store", signal: AbortSignal.timeout(8_000) }),
      ]);
      if (!bookResponse.ok || !tradesResponse.ok) {
        const binanceFailure = `Binance fallback returned HTTP ${!bookResponse.ok ? bookResponse.status : tradesResponse.status}`;
        const product = coinbaseSpotProduct(symbol);
        if (!product) return jsonError(`Bybit failed (${bybitFailure}); ${binanceFailure}; no Coinbase spot mapping exists for ${symbol}`, 502);
        exchange = "coinbase";
        category = "spot";
        marketSymbol = product;
        const productPath = `/products/${encodeURIComponent(product)}`;
        const [coinbaseBookResponse, coinbaseTradesResponse] = await Promise.all([
          fetch(`${COINBASE_API}${productPath}/book?level=2`, { cache: "no-store", signal: AbortSignal.timeout(8_000) }),
          fetch(`${COINBASE_API}${productPath}/trades?limit=${TRADE_LIMIT}`, { cache: "no-store", signal: AbortSignal.timeout(8_000) }),
        ]);
        if (!coinbaseBookResponse.ok || !coinbaseTradesResponse.ok) {
          return jsonError(`Bybit failed (${bybitFailure}); ${binanceFailure}; Coinbase spot fallback for ${product} returned HTTP ${!coinbaseBookResponse.ok ? coinbaseBookResponse.status : coinbaseTradesResponse.status}`, 502);
        }
        const [book, trades] = await Promise.all([
          coinbaseBookResponse.json() as Promise<CoinbaseBook>,
          coinbaseTradesResponse.json() as Promise<CoinbaseTrade[]>,
        ]);
        if (!book || !Array.isArray(book.bids) || !Array.isArray(book.asks) || !Array.isArray(trades)) {
          return jsonError(`Coinbase returned an incomplete spot snapshot for ${product}`, 502);
        }
        rawBids = book.bids;
        rawAsks = book.asks;
        // Coinbase trade side is the maker side; reverse it to estimate taker aggression.
        rawTrades = trades.map((trade) => ({
          price: trade.price, size: trade.size, timestamp: trade.time ? Date.parse(trade.time) : undefined,
          side: trade.side === "buy" ? "sell" : trade.side === "sell" ? "buy" : undefined,
        }));
        exchangeTimestamp = book.time ? Date.parse(book.time) : 0;
        tradeServerTime = Date.now();
      } else {
        const [book, trades] = await Promise.all([
          bookResponse.json() as Promise<BinanceBook>,
          tradesResponse.json() as Promise<BinanceTrade[]>,
        ]);
        if (!book || !Array.isArray(book.bids) || !Array.isArray(book.asks) || !Array.isArray(trades)) {
          return jsonError("Binance returned an incomplete market snapshot", 502);
        }
        rawBids = book.bids;
        rawAsks = book.asks;
        rawTrades = trades.map((trade) => ({
          price: trade.price, size: trade.qty, timestamp: trade.time,
          side: trade.isBuyerMaker === true ? "sell" : trade.isBuyerMaker === false ? "buy" : undefined,
        }));
        // Binance USDⓈ-M depth transaction time is measured in milliseconds.
        exchangeTimestamp = Number(book.T);
        tradeServerTime = Date.now();
      }
    }

    const bids = parseLevels(rawBids).sort((left, right) => right.price - left.price);
    const asks = parseLevels(rawAsks).sort((left, right) => left.price - right.price);
    const fetchedAt = Date.now();
    if (!Number.isFinite(exchangeTimestamp) || exchangeTimestamp <= 0) {
      return jsonError(`${exchange === "bybit" ? "Bybit" : exchange === "binance" ? "Binance" : "Coinbase spot"} order-book timestamp is missing or invalid`, 502);
    }
    const dataAgeMs = fetchedAt - exchangeTimestamp;
    const bestBid = bids[0];
    const bestAsk = asks[0];
    const bookValid = Boolean(
      bestBid && bestAsk && bestBid.price < bestAsk.price &&
      Number.isFinite(dataAgeMs) && dataAgeMs >= 0 && dataAgeMs <= MAX_BOOK_AGE_MS
    );

    if (!bestBid || !bestAsk) return jsonError(`${exchange === "bybit" ? "Bybit" : exchange === "binance" ? "Binance" : "Coinbase spot"} returned an empty or malformed order book`, 502);
    const timeForTradeWindow = Number.isFinite(tradeServerTime) ? tradeServerTime : fetchedAt;
    const validTrades = rawTrades.flatMap((trade) => {
      const price = Number(trade.price);
      const size = Number(trade.size);
      const timestamp = Number(trade.timestamp);
      const side = trade.side?.toLowerCase();
      return Number.isFinite(price) && price > 0 && Number.isFinite(size) && size > 0 &&
        Number.isFinite(timestamp) && (side === "buy" || side === "sell")
        ? [{ price, size, timestamp, side }]
        : [];
    });
    const tradesInLastSecond = validTrades.filter(
      (trade) => trade.timestamp <= timeForTradeWindow && trade.timestamp >= timeForTradeWindow - 1_000,
    ).length;
    const tradeSampleQuality = rawTrades.length >= TRADE_LIMIT ? "SAMPLED_LIMIT_REACHED" : "SAMPLED";
    const prior = validPreviousSample(input.previous_sample, fetchedAt, exchange);

    const cvd = validTrades.reduce(
      (sum, trade) => sum + (trade.side === "buy" ? trade.size : -trade.size),
      0,
    );
    const ofi = prior
      ? (bestBid.price > prior.best_bid ? bestBid.quantity : bestBid.price === prior.best_bid ? bestBid.quantity - prior.best_bid_qty : -prior.best_bid_qty) -
        (bestAsk.price < prior.best_ask ? bestAsk.quantity : bestAsk.price === prior.best_ask ? bestAsk.quantity - prior.best_ask_qty : -prior.best_ask_qty)
      : null;

    const bidLevels = bids.slice(0, 10);
    const askLevels = asks.slice(0, 10);
    const supportLevels = bidLevels.filter((level, index) =>
      index > 0 && index < bidLevels.length - 1 &&
      level.quantity > bidLevels[index - 1].quantity && level.quantity > bidLevels[index + 1].quantity &&
      level.quantity > bidLevels.reduce((sum, item) => sum + item.quantity, 0) / bidLevels.length * 1.5,
    );
    const resistanceLevels = askLevels.filter((level, index) =>
      index > 0 && index < askLevels.length - 1 &&
      level.quantity > askLevels[index - 1].quantity && level.quantity > askLevels[index + 1].quantity &&
      level.quantity > askLevels.reduce((sum, item) => sum + item.quantity, 0) / askLevels.length * 1.5,
    );

    let strategyA: StrategyExplanation;
    if (!bookValid) {
      strategyA = makeStrategy(fetchedAt, "Strategy A (Momentum)", "None", "Order book is crossed, stale, or has a clock inconsistency", "POOR", ["fresh_valid_orderbook"], "Snapshot failed the market-data quality gate");
    } else if (!prior) {
      strategyA = makeStrategy(fetchedAt, "Strategy A (Momentum)", `CVD sample: ${cvd.toFixed(4)}; OFI unavailable`, "Single snapshots cannot establish order-flow change", "INCOMPLETE", ["prior_orderbook_sample_within_60_seconds"], "Refresh once more within 60 seconds to compare order-book samples");
    } else {
      let candidate: "buy" | "sell" | null = null;
      let reason = "Momentum conditions were not met";
      if (tradeSampleQuality !== "SAMPLED_LIMIT_REACHED" && ofi !== null && cvd > 10 && ofi > 0 && supportLevels.some((level) => level.price < bestBid.price)) {
        candidate = "buy";
        reason = "Positive sampled CVD and OFI with a visible bid-liquidity peak";
      } else if (tradeSampleQuality !== "SAMPLED_LIMIT_REACHED" && ofi !== null && cvd < -10 && ofi < 0 && resistanceLevels.some((level) => level.price > bestAsk.price)) {
        candidate = "sell";
        reason = "Negative sampled CVD and OFI with a visible ask-liquidity peak";
      }
      strategyA = makeStrategy(
        fetchedAt,
        "Strategy A (Momentum)",
        `Sampled CVD: ${cvd.toFixed(4)}, OFI between refreshes: ${ofi?.toFixed(4) ?? "unavailable"}; visible bid/ask liquidity peaks: ${supportLevels.length}/${resistanceLevels.length}`,
        "Visible depth is cancellable liquidity, not confirmed historical price structure; the CVD sample is limited to recent public trades",
        tradeSampleQuality === "SAMPLED_LIMIT_REACHED" ? "INCOMPLETE" : bookValid ? "GOOD" : "INCOMPLETE",
        tradeSampleQuality === "SAMPLED_LIMIT_REACHED" ? ["recent_trade_sample_may_be_truncated"] : [],
        tradeSampleQuality === "SAMPLED_LIMIT_REACHED" ? "Recent trade sample reached its limit; momentum candidate withheld" : reason,
        candidate,
      );
    }

    const strategyB = makeStrategy(
      fetchedAt,
      "Strategy B (Absorption Proxy)",
      "No sweep/reclaim history is collected in refresh-only mode",
      "A single order-book snapshot cannot prove absorption",
      "UNAVAILABLE",
      ["historical_sweeps", "continuous_trade_sequence"],
      "Unavailable until timestamped sweep/reclaim observations are implemented",
    );

    const bidVolume = bids.slice(0, 5).reduce((sum, level) => sum + level.quantity, 0);
    const askVolume = asks.slice(0, 5).reduce((sum, level) => sum + level.quantity, 0);
    const totalVolume = bidVolume + askVolume;
    const imbalance = totalVolume > 0 ? (bidVolume - askVolume) / totalVolume : 0;
    const midpoint = (bestBid.price + bestAsk.price) / 2;
    const topSize = bestBid.quantity + bestAsk.quantity;
    const microprice = topSize > 0
      ? (bestBid.price * bestAsk.quantity + bestAsk.price * bestBid.quantity) / topSize
      : midpoint;
    let strategyCDecision: "buy" | "sell" | null = null;
    let strategyCReason = "Imbalance neutral or there is no recent trade confirmation";
    if (bookValid && tradeSampleQuality !== "SAMPLED_LIMIT_REACHED" && tradesInLastSecond >= 1 && imbalance > 0.4 && microprice > midpoint) {
      strategyCDecision = "buy";
      strategyCReason = "Bid-heavy sampled depth and microprice with recent public-trade confirmation";
    } else if (bookValid && tradeSampleQuality !== "SAMPLED_LIMIT_REACHED" && tradesInLastSecond >= 1 && imbalance < -0.4 && microprice < midpoint) {
      strategyCDecision = "sell";
      strategyCReason = "Ask-heavy sampled depth and microprice with recent public-trade confirmation";
    }
    const strategyC = makeStrategy(
      fetchedAt,
      "Strategy C (Imbalance)",
      `Top-five-level imbalance: ${imbalance.toFixed(4)}; microprice: ${microprice.toFixed(2)}; sampled trades in prior second: ${tradesInLastSecond}`,
      "Snapshot depth can be cancelled; exchange REST samples do not provide continuous order-flow confirmation",
      tradeSampleQuality === "SAMPLED_LIMIT_REACHED" ? "INCOMPLETE" : bookValid ? "GOOD" : "POOR",
      tradesInLastSecond > 0 ? (tradeSampleQuality === "SAMPLED_LIMIT_REACHED" ? ["trade_sample_may_be_truncated"] : []) : ["recent_trade_confirmation"],
      strategyCReason,
      strategyCDecision,
      2_000,
    );

    const candidates = [strategyA, strategyC].filter(
      (strategy) => strategy.decision === "actionable" && strategy.expiry >= fetchedAt,
    );
    const buys = candidates.filter((strategy) => strategy.selected_candidate === "buy").length;
    const sells = candidates.filter((strategy) => strategy.selected_candidate === "sell").length;
    const conflict = buys > 0 && sells > 0;
    const winner = buys > sells ? "buy" : sells > buys ? "sell" : null;
    const agreed = winner === "buy" ? buys : winner === "sell" ? sells : 0;
    const consensus = agreed >= 2 && !conflict ? winner : null;
    const decision = makeStrategy(
      fetchedAt,
      "Strategy D (Consensus)",
      `Candidates from eligible strategy rules: buy=${buys}, sell=${sells}; Strategy B is unavailable in refresh-only mode`,
      conflict ? "Candidate strategies disagree" : "Fewer than two independent strategies agree",
      consensus ? "GOOD" : "INCOMPLETE",
      consensus ? [] : ["two_agreeing_eligible_strategy_candidates"],
      consensus ? "Two separate heuristic rules agree; research signal only, no order placed" : "Consensus requires two eligible strategy rules to agree",
      consensus,
    );

    const quality = !bookValid
      ? { safe: false, quality: dataAgeMs > MAX_BOOK_AGE_MS ? "STALE" : "POOR", reason: "Snapshot is crossed, stale, malformed, or has a clock inconsistency", data_age_ms: dataAgeMs }
      : { safe: true, quality: "GOOD", reason: `Fresh valid ${exchange === "bybit" ? "Bybit" : exchange === "binance" ? "Binance USDⓈ-M" : "Coinbase spot"} order-book snapshot`, data_age_ms: dataAgeMs };
    const payload: MarketStatusPayload = {
      symbol: marketSymbol,
      exchange,
      category,
      fetched_at: fetchedAt,
      exchange_timestamp: exchangeTimestamp,
      data_age_ms: dataAgeMs,
      quality,
      orderbook: { bids, asks },
      book_valid: bookValid,
      trade_sample: {
        returned: validTrades.length,
        limit: TRADE_LIMIT,
        trades_in_last_second: tradesInLastSecond,
        quality: tradeSampleQuality,
      },
      strategies: [strategyA, strategyB, strategyC],
      decision,
    };
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
      console.error("On-demand market refresh failed", error);
    return jsonError("Could not fetch a complete snapshot from Bybit, Binance, or Coinbase. Try refreshing again later.", 502);
  }
}
