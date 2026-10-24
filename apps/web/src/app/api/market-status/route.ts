import { NextResponse } from "next/server";
import type {
  MarketStatusPayload,
  OrderBookLevel,
  PreviousBookSample,
  MarketSnapshotInput,
  StrategyExplanation,
} from "../../../lib/market-types";
import { hasBasicAuthConfig, isAuthorizedBasicRequest } from "../../../lib/basic-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOOK_LIMIT = 50;
const TRADE_LIMIT = 1_000;
const CANDLE_LIMIT = 60;
const MAX_BOOK_AGE_MS = 15_000;
const MAX_PREVIOUS_SAMPLE_AGE_MS = 60_000;

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
  if (contentLength > 256_000) return jsonError("Refresh request is too large", 413);
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return jsonError("Refresh request must use application/json", 415);
  }

  let input: { symbol?: unknown; previous_sample?: unknown; snapshot?: unknown };
  try {
    input = await request.json();
  } catch {
    return jsonError("A JSON refresh request is required", 400);
  }

  const symbol = typeof input.symbol === "string" ? input.symbol.trim().toUpperCase() : "BTCUSDT";
  if (!/^[A-Z0-9]{3,20}$/.test(symbol)) return jsonError("Invalid market symbol", 400);

  const snapshot = input.snapshot as Partial<MarketSnapshotInput> | undefined;
  if (!snapshot || !["bybit", "binance", "coinbase"].includes(snapshot.exchange ?? "") ||
      !["linear", "spot"].includes(snapshot.category ?? "") ||
      (snapshot.exchange === "coinbase") !== (snapshot.category === "spot") ||
      !["orderbook", "exchange_clock_estimate"].includes(snapshot.timestamp_source ?? "") ||
      typeof snapshot.symbol !== "string" || !/^[A-Z0-9]{3,20}(?:-USD)?$/.test(snapshot.symbol) ||
      !Array.isArray(snapshot.bids) || snapshot.bids.length > BOOK_LIMIT ||
      !Array.isArray(snapshot.asks) || snapshot.asks.length > BOOK_LIMIT ||
      !Array.isArray(snapshot.trades) || snapshot.trades.length > TRADE_LIMIT ||
      !Number.isInteger(snapshot.recent_trade_count) || (snapshot.recent_trade_count ?? -1) < 0 ||
      !Number.isInteger(snapshot.trade_limit) || (snapshot.trade_limit ?? 0) < 1 || (snapshot.trade_limit ?? 0) > TRADE_LIMIT ||
      !Array.isArray(snapshot.candles) || snapshot.candles.length > CANDLE_LIMIT ||
      typeof snapshot.exchange_timestamp !== "number" || !Number.isFinite(snapshot.exchange_timestamp) ||
      typeof snapshot.trade_server_time !== "number" || !Number.isFinite(snapshot.trade_server_time)) {
    return jsonError("A valid public market snapshot is required", 400);
  }
  const expectedCoinbaseProduct = symbol.match(/^([A-Z0-9]+)(?:USDT|USD)$/)?.[1];
  const expectedMarketSymbol = snapshot.exchange === "coinbase" ? `${expectedCoinbaseProduct}-USD` : symbol;
  if (snapshot.symbol !== expectedMarketSymbol) return jsonError("Snapshot market does not match the requested symbol", 400);
  const isStringPair = (entry: unknown): entry is [string, string] =>
    Array.isArray(entry) && entry.length >= 2 && typeof entry[0] === "string" && typeof entry[1] === "string";
  if (!snapshot.bids.every(isStringPair) || !snapshot.asks.every(isStringPair)) {
    return jsonError("Market snapshot contains malformed order-book levels", 400);
  }
  const isTrade = (trade: unknown): trade is MarketSnapshotInput["trades"][number] => {
    if (!trade || typeof trade !== "object") return false;
    const item = trade as MarketSnapshotInput["trades"][number];
    return (item.price === undefined || typeof item.price === "string") &&
      (item.size === undefined || typeof item.size === "string") &&
      (item.timestamp === undefined || (typeof item.timestamp === "number" && Number.isFinite(item.timestamp))) &&
      (item.side === undefined || typeof item.side === "string");
  };
  if (!snapshot.trades.every(isTrade)) return jsonError("Market snapshot contains malformed trades", 400);
  const isCandle = (candle: unknown): boolean => {
    if (!candle || typeof candle !== "object") return false;
    const item = candle as Record<string, unknown>;
    return ["open_time", "open", "high", "low", "close", "volume"].every(
      (key) => typeof item[key] === "number" && Number.isFinite(item[key]),
    );
  };
  if (!snapshot.candles.every(isCandle)) return jsonError("Market snapshot contains malformed historical candles", 400);

  try {
    type NormalizedTrade = { price?: string; size?: string; timestamp?: string | number; side?: string };
    const exchange = snapshot.exchange as "bybit" | "binance" | "coinbase";
    const category = snapshot.category as "linear" | "spot";
    const marketSymbol = snapshot.symbol as string;
    const rawBids: unknown = snapshot.bids;
    const rawAsks: unknown = snapshot.asks;
    const rawTrades = snapshot.trades as NormalizedTrade[];
    const recentTradeCount = snapshot.recent_trade_count as number;
    const tradeLimit = snapshot.trade_limit as number;
    const rawCandles = snapshot.candles as MarketSnapshotInput["candles"];
    const timestampSource = snapshot.timestamp_source as MarketSnapshotInput["timestamp_source"];
    const exchangeTimestamp = snapshot.exchange_timestamp as number;
    const tradeServerTime = snapshot.trade_server_time as number;
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
    const orderedTrades = [...validTrades].sort((left, right) => left.timestamp - right.timestamp);
    const oldestTradeAt = orderedTrades[0]?.timestamp ?? null;
    const newestTradeAt = orderedTrades.at(-1)?.timestamp ?? null;
    const tradeRowsValid = validTrades.length === rawTrades.length;
    const tradesInLastSecond = validTrades.filter(
      (trade) => trade.timestamp <= timeForTradeWindow && trade.timestamp >= timeForTradeWindow - 1_000,
    ).length;
    const tradeSampleQuality = recentTradeCount >= tradeLimit ? "SAMPLED_LIMIT_REACHED" : "SAMPLED";
    const sampleTruncated = tradeSampleQuality === "SAMPLED_LIMIT_REACHED";
    const coversTradeWindow = (startAt: number, endAt: number) =>
      tradeRowsValid && validTrades.length > 0 &&
      (!sampleTruncated || (oldestTradeAt !== null && oldestTradeAt <= startAt)) &&
      newestTradeAt !== null && newestTradeAt >= endAt - 10_000;
    const prior = validPreviousSample(input.previous_sample, fetchedAt, exchange);
    const completedCandles = rawCandles
      .filter((candle) => candle.open_time + 60_000 <= exchangeTimestamp)
      .sort((left, right) => left.open_time - right.open_time);

    const cvd = validTrades.reduce(
      (sum, trade) => sum + (trade.side === "buy" ? trade.size : -trade.size),
      0,
    );
    const ofi = prior
      ? (bestBid.price > prior.best_bid ? bestBid.quantity : bestBid.price === prior.best_bid ? bestBid.quantity - prior.best_bid_qty : -prior.best_bid_qty) -
        (bestAsk.price < prior.best_ask ? bestAsk.quantity : bestAsk.price === prior.best_ask ? bestAsk.quantity - prior.best_ask_qty : -prior.best_ask_qty)
      : null;

    const strategyContext = completedCandles.length >= 26;
    const historyForStructure = completedCandles.slice(-21, -1);
    const swingLow = historyForStructure.length ? Math.min(...historyForStructure.map((candle) => candle.low)) : null;
    const swingHigh = historyForStructure.length ? Math.max(...historyForStructure.map((candle) => candle.high)) : null;
    const structureStart = historyForStructure[0]?.open_time ?? null;
    const structureTrades = structureStart === null
      ? []
      : orderedTrades.filter((trade) => trade.timestamp >= structureStart && trade.timestamp <= timeForTradeWindow);
    const fiveMinuteReturn = completedCandles.length >= 6
      ? completedCandles.at(-1)!.close / completedCandles.at(-6)!.close - 1
      : null;
    const fiveMinuteStart = completedCandles.length >= 6
      ? completedCandles.at(-6)!.open_time
      : null;
    const cvdWindowCovered = fiveMinuteStart !== null && coversTradeWindow(fiveMinuteStart, timeForTradeWindow);
    const cvdFiveMinute = cvdWindowCovered && fiveMinuteStart !== null
      ? validTrades
        .filter((trade) => trade.timestamp >= fiveMinuteStart && trade.timestamp <= timeForTradeWindow)
        .reduce((sum, trade) => sum + (trade.side === "buy" ? trade.size : -trade.size), 0)
      : null;
    const strategyAReady = bookValid && strategyContext && fiveMinuteReturn !== null;
    let strategyADecision: "buy" | "sell" | null = null;
    let strategyAReason = strategyAReady ? "Five-minute candle momentum threshold was not met" : "Historical candles are required for this evaluation";
    if (strategyAReady && Math.abs(fiveMinuteReturn!) >= 0.001) {
      if (cvdFiveMinute === null) {
        strategyADecision = fiveMinuteReturn! > 0 ? "buy" : "sell";
        strategyAReason = "Five-minute candle momentum candidate; CVD confirmation is limited because the trade sample does not cover the full window";
      } else if (fiveMinuteReturn! >= 0.001 && cvdFiveMinute > 0) {
        strategyADecision = "buy";
        strategyAReason = "Positive five-minute candle momentum aligns with complete sampled taker-buy flow for that window";
      } else if (fiveMinuteReturn! <= -0.001 && cvdFiveMinute < 0) {
        strategyADecision = "sell";
        strategyAReason = "Negative five-minute candle momentum aligns with complete sampled taker-sell flow for that window";
      } else if (cvdFiveMinute !== null) {
        strategyAReason = "Five-minute candle momentum and complete sampled CVD do not align";
      }
    }
    const strategyAQuality = !strategyAReady ? "INCOMPLETE" : cvdFiveMinute === null ? "LIMITED" : "GOOD";
    const strategyA = makeStrategy(
      fetchedAt,
      "Strategy A (Momentum)",
      `Five-minute return: ${fiveMinuteReturn === null ? "unavailable" : `${(fiveMinuteReturn * 100).toFixed(3)}%`}; five-minute CVD: ${cvdFiveMinute?.toFixed(4) ?? "window not fully covered"}; all-sample CVD: ${cvd.toFixed(4)}; local swing low/high: ${swingLow?.toFixed(2) ?? "unavailable"}/${swingHigh?.toFixed(2) ?? "unavailable"}; OFI between refreshes: ${ofi?.toFixed(4) ?? "not sampled"}`,
      "One-minute candles cannot show intrabar path; sampled CVD is recent public trade history and is not full-session flow",
      strategyAQuality,
      strategyAQuality === "GOOD" ? [] : [
        ...(!bookValid ? ["fresh_valid_orderbook"] : []),
        ...(completedCandles.length < 26 ? ["at_least_26_completed_one_minute_candles"] : []),
        ...(cvdFiveMinute === null ? [
          validTrades.length === 0 ? "valid_taker_side_trade_sample" :
            !tradeRowsValid ? "all_trade_rows_must_have_valid_price_size_time_and_side" :
              sampleTruncated ? "trade_sample_limit_does_not_cover_cvd_window" : "complete_five_minute_trade_window",
        ] : []),
      ],
      strategyAReason,
      strategyADecision,
    );

    let sweptSupport = false;
    let sweptResistance = false;
    let reclaimedSupport = false;
    let rejectedResistance = false;
    if (swingLow !== null && swingHigh !== null) {
      for (const trade of structureTrades) {
        if (trade.price < swingLow) sweptSupport = true;
        else if (sweptSupport && trade.price >= swingLow) reclaimedSupport = true;
        if (trade.price > swingHigh) sweptResistance = true;
        else if (sweptResistance && trade.price <= swingHigh) rejectedResistance = true;
      }
    }
    const midpointNow = (bestBid.price + bestAsk.price) / 2;
    let strategyBDecision: "buy" | "sell" | null = null;
    if (reclaimedSupport && midpointNow >= (swingLow ?? Infinity)) strategyBDecision = "buy";
    else if (rejectedResistance && midpointNow <= (swingHigh ?? -Infinity)) strategyBDecision = "sell";
    const strategyBReady = bookValid && strategyContext && structureStart !== null &&
      coversTradeWindow(structureStart, timeForTradeWindow) && swingLow !== null && swingHigh !== null;
    const strategyB = makeStrategy(
      fetchedAt,
      "Strategy B (Sweep/Reclaim Proxy)",
      `Scanned ${structureTrades.length} timestamped trades in the structure window against prior 20-minute swing low/high ${swingLow?.toFixed(2) ?? "unavailable"}/${swingHigh?.toFixed(2) ?? "unavailable"}; sampled price-path proxy, not proof of resting-liquidity absorption`,
      "REST trades do not show queue depletion or cancellations at the swept price",
      strategyBReady ? "GOOD" : "INCOMPLETE",
      strategyBReady ? [] : [
        ...(!bookValid ? ["fresh_valid_orderbook"] : []),
        ...(completedCandles.length < 26 ? ["at_least_26_completed_one_minute_candles"] : []),
        ...(validTrades.length === 0 ? ["timestamped_trade_sequence"] : []),
        ...(structureStart !== null && !coversTradeWindow(structureStart, timeForTradeWindow)
          ? [sampleTruncated ? "trade_sample_limit_does_not_cover_20_minute_structure_window" : "complete_20_minute_trade_window"] : []),
        ...(!tradeRowsValid ? ["all_trade_rows_must_have_valid_price_size_time_and_side"] : []),
      ],
      !strategyBReady ? "Historical candles and a complete recent trade sample are required" :
        strategyBDecision ? "Sampled trades crossed a prior swing and reclaimed/rejected it; absorption remains unconfirmed" :
          "No sweep-and-reclaim pattern was found in the sampled trades",
      strategyBReady ? strategyBDecision : null,
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
    const lastSecondCovered = coversTradeWindow(timeForTradeWindow - 1_000, timeForTradeWindow);
    const strategyCReady = bookValid && tradesInLastSecond >= 1 && lastSecondCovered;
    if (strategyCReady && imbalance > 0.4 && microprice > midpoint) {
      strategyCDecision = "buy";
      strategyCReason = "Bid-heavy sampled depth and microprice with recent public-trade confirmation";
    } else if (strategyCReady && imbalance < -0.4 && microprice < midpoint) {
      strategyCDecision = "sell";
      strategyCReason = "Ask-heavy sampled depth and microprice with recent public-trade confirmation";
    }
    const strategyC = makeStrategy(
      fetchedAt,
      "Strategy C (Imbalance)",
      `Top-five-level imbalance: ${imbalance.toFixed(4)}; microprice: ${microprice.toFixed(2)}; sampled trades in prior second: ${tradesInLastSecond}`,
      "Snapshot depth can be cancelled; exchange REST samples do not provide continuous order-flow confirmation",
      strategyCReady ? "GOOD" : "INCOMPLETE",
      strategyCReady ? [] : [
        ...(!bookValid ? ["fresh_valid_orderbook"] : []),
        ...(tradesInLastSecond === 0 ? ["recent_trade_confirmation"] : []),
        ...(tradesInLastSecond > 0 && !lastSecondCovered ? ["complete_last_second_trade_window"] : []),
      ],
      strategyCReady ? strategyCReason : tradesInLastSecond > 0
        ? "Last-second trade sample is not fully covered by the capped response"
        : strategyCReason,
      strategyCDecision,
      2_000,
    );

    const strategies = [strategyA, strategyB, strategyC];
    const eligibleStrategies = strategies.filter((strategy) => strategy.data_quality === "GOOD");
    const candidates = eligibleStrategies.filter(
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
      `Candidates from eligible strategy rules: buy=${buys}, sell=${sells}; Strategy A and B share sampled candle/trade inputs`,
      conflict ? "Eligible strategy candidates disagree" : "Fewer than two eligible strategy candidates agree",
      eligibleStrategies.length >= 2 ? "GOOD" : "INCOMPLETE",
      consensus ? [] : ["two_agreeing_eligible_strategy_candidates"],
      consensus
        ? "Two eligible heuristic rules agree; research signal only, no order placed"
        : conflict
          ? "No trade: eligible strategy candidates disagree"
          : eligibleStrategies.length >= 2
            ? "No trade: fewer than two complete strategies produced agreeing candidates"
            : `No trade: only ${eligibleStrategies.length} of 3 strategies have complete required data; two eligible agreeing candidates are required`,
      consensus,
    );

    const quality = !bookValid
      ? { safe: false, quality: dataAgeMs > MAX_BOOK_AGE_MS ? "STALE" : "POOR", reason: "Snapshot is crossed, stale, malformed, or has a clock inconsistency", data_age_ms: dataAgeMs, timestamp_source: timestampSource }
      : { safe: true, quality: "GOOD", reason: `Fresh valid ${exchange === "bybit" ? "Bybit" : exchange === "binance" ? "Binance USDⓈ-M" : "Coinbase spot"} order-book snapshot`, data_age_ms: dataAgeMs, timestamp_source: timestampSource };
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
        limit: tradeLimit,
        trades_in_last_second: tradesInLastSecond,
        quality: tradeSampleQuality,
      },
      strategies,
      decision,
    };
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
      console.error("On-demand market refresh failed", error);
    return jsonError("Could not evaluate the public market snapshot. Refresh and try again.", 502);
  }
}
