import type { ComparisonPrice, MarketCategory, MarketOverview, TurnoverAssessment } from "./market-types";

type Json = Record<string, unknown>;
const timeout = 7_000;

async function json(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

function record(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
}
function first(value: unknown): Json | null { return Array.isArray(value) ? record(value[0]) : null; }
function number(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
function normalizedSymbol(input: string): { base: string; quote: string; compact: string; underscored: string } {
  const symbol = input.trim().toUpperCase();
  const match = /^([A-Z0-9]+?)(USDT|USDC|USD)$/.exec(symbol);
  if (!match) throw new Error("Use a symbol ending in USDT, USDC, or USD (for example BTCUSDT)");
  return { base: match[1], quote: match[2], compact: symbol, underscored: `${match[1]}_${match[2]}` };
}

async function getPrice(exchange: string, symbol: ReturnType<typeof normalizedSymbol>, category: MarketCategory): Promise<ComparisonPrice> {
  let instrument = symbol.compact;
  const quote = symbol.quote;
  let displayQuote = quote;
  try {
    let body: unknown;
    let value: number | null = null;
    if (category === "spot") {
      switch (exchange) {
        case "Binance":
          body = await json(`https://data-api.binance.vision/api/v3/ticker/price?symbol=${symbol.compact}`); value = number(record(body)?.price); break;
        case "Bybit":
          body = await json(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol.compact}`); value = number(first(record(record(body)?.result)?.list)?.lastPrice); break;
        case "Coinbase Exchange":
          instrument = `${symbol.base}-USD`;
          displayQuote = "USD";
          body = await json(`https://api.exchange.coinbase.com/products/${instrument}/ticker`); value = number(record(body)?.price); break;
        case "Kraken": {
          const pair = `${symbol.base === "BTC" ? "XBT" : symbol.base}${quote === "USDT" ? "USD" : quote}`;
          displayQuote = quote === "USDT" ? "USD" : quote;
          instrument = pair;
          body = await json(`https://api.kraken.com/0/public/Ticker?pair=${pair}`);
          const result = record(record(body)?.result);
          value = number(record(Object.values(result ?? {})[0])?.c instanceof Array ? (record(Object.values(result ?? {})[0])?.c as unknown[])[0] : null); break;
        }
        case "OKX":
          instrument = `${symbol.base}-${quote}`;
          body = await json(`https://www.okx.com/api/v5/market/ticker?instId=${instrument}`); value = number(first(record(body)?.data)?.last); break;
        case "KuCoin":
          instrument = `${symbol.base}-${quote}`;
          body = await json(`https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${instrument}`); value = number(record(record(body)?.data)?.price); break;
        case "Gate.io":
          instrument = symbol.underscored;
          body = await json(`https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${instrument}`); value = number(first(body)?.last); break;
        case "Bitget":
          body = await json(`https://api.bitget.com/api/v2/spot/market/tickers?symbol=${symbol.compact}`); value = number(first(record(body)?.data)?.lastPr); break;
        case "MEXC":
          body = await json(`https://api.mexc.com/api/v3/ticker/price?symbol=${symbol.compact}`); value = number(record(body)?.price); break;
        case "Bitstamp":
          instrument = `${symbol.base.toLowerCase()}${quote === "USDT" ? "usd" : quote.toLowerCase()}`;
          displayQuote = quote === "USDT" ? "USD" : quote;
          body = await json(`https://www.bitstamp.net/api/v2/ticker/${instrument}`); value = number(record(body)?.last); break;
        case "Crypto.com":
          instrument = `${symbol.base}_${quote}`;
          body = await json(`https://api.crypto.com/exchange/v1/public/get-ticker?instrument_name=${instrument}`); value = number(first(record(record(body)?.result)?.data)?.a); break;
      }
    } else {
      switch (exchange) {
        case "Binance USDⓈ-M":
          body = await json(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol.compact}`); value = number(record(body)?.price); break;
        case "Bybit":
          body = await json(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol.compact}`); value = number(first(record(record(body)?.result)?.list)?.lastPrice); break;
        case "OKX":
          instrument = `${symbol.base}-${quote}-SWAP`;
          body = await json(`https://www.okx.com/api/v5/market/ticker?instId=${instrument}`); value = number(first(record(body)?.data)?.last); break;
        case "Gate.io":
          instrument = `${symbol.base}_${quote}`;
          body = await json(`https://api.gateio.ws/api/v4/futures/${quote.toLowerCase()}/tickers?contract=${instrument}`); value = number(first(body)?.last); break;
        case "KuCoin Futures":
          instrument = `${symbol.base === "BTC" ? "XBT" : symbol.base}${quote}M`;
          body = await json(`https://api-futures.kucoin.com/api/v1/ticker?symbol=${instrument}`); value = number(record(record(body)?.data)?.price); break;
        case "Bitget":
          body = await json(`https://api.bitget.com/api/v2/mix/market/ticker?productType=${quote}-FUTURES&symbol=${symbol.compact}`); value = number(first(record(body)?.data)?.lastPr); break;
        case "MEXC":
          instrument = `${symbol.base}_${quote}`;
          body = await json(`https://contract.mexc.com/api/v1/contract/ticker?symbol=${instrument}`); value = number(record(record(body)?.data)?.lastPrice); break;
        case "Kraken Futures": {
          instrument = `PI_${symbol.base === "BTC" ? "XBT" : symbol.base}USD`;
          displayQuote = "USD";
          body = await json("https://futures.kraken.com/derivatives/api/v3/tickers");
          const tickers = record(body)?.tickers;
          const row = Array.isArray(tickers) ? tickers.map(record).find((item) => item?.symbol === instrument) : null;
          value = number(row?.last); break;
        }
        case "Deribit":
          instrument = `${symbol.base}-PERPETUAL`;
          displayQuote = "USD";
          body = await json(`https://www.deribit.com/api/v2/public/ticker?instrument_name=${instrument}`); value = number(record(record(body)?.result)?.last_price); break;
        case "BitMEX":
          instrument = symbol.base === "BTC" ? "XBTUSD" : `${symbol.base}${quote}`;
          displayQuote = "USD";
          body = await json(`https://www.bitmex.com/api/v1/instrument?symbol=${instrument}&count=1`); value = number(first(body)?.lastPrice); break;
      }
    }
    if (!value) throw new Error("No valid last price in public response");
    return { exchange, instrument, category, price: value, quote_asset: displayQuote, status: "available" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Public market endpoint unavailable";
    return { exchange, instrument, category, price: null, quote_asset: displayQuote, status: "unavailable", detail };
  }
}

const SPOT_VENUES = ["Binance", "Bybit", "Coinbase Exchange", "Kraken", "OKX", "KuCoin", "Gate.io", "Bitget", "MEXC", "Bitstamp"];
const PERPETUAL_VENUES = ["Binance USDⓈ-M", "Bybit", "OKX", "Gate.io", "KuCoin Futures", "Bitget", "MEXC", "Kraken Futures", "Deribit", "BitMEX"];

export function assessTurnover(exchange: "bybit" | "binance", category: MarketCategory, turnover24h: number | null, completedDailyTurnovers: number[], quote = "USDT"): TurnoverAssessment {
  const valid = completedDailyTurnovers.filter((item) => Number.isFinite(item) && item > 0).slice(-30);
  const average = valid.length >= 7 ? valid.reduce((sum, item) => sum + item, 0) / valid.length : null;
  const difference = turnover24h !== null && average !== null ? (turnover24h / average - 1) * 100 : null;
  const classification = difference === null ? "UNAVAILABLE" : difference >= 50 ? "HIGH" : difference <= -50 ? "LOW" : "NORMAL";
  return {
    exchange, category, turnover_24h: turnover24h, quote_asset: quote, average_daily_turnover_30d: average,
    difference_from_average_pct: difference, classification, completed_baseline_days: valid.length,
    note: average === null ? "30-day comparison needs at least seven valid completed daily candles." : "HIGH is at least 50% above the completed 30-day daily-candle average; LOW is at least 50% below; otherwise NORMAL.",
  };
}

async function getTurnover(exchange: "bybit" | "binance", symbol: ReturnType<typeof normalizedSymbol>, category: MarketCategory): Promise<TurnoverAssessment> {
  try {
    if (exchange === "bybit") {
      const categoryName = category === "spot" ? "spot" : "linear";
      const [ticker, candles] = await Promise.all([
        json(`https://api.bybit.com/v5/market/tickers?category=${categoryName}&symbol=${symbol.compact}`),
        json(`https://api.bybit.com/v5/market/kline?category=${categoryName}&symbol=${symbol.compact}&interval=D&limit=31`),
      ]);
      const tickerRow = first(record(record(ticker)?.result)?.list);
      const rows = record(record(candles)?.result)?.list;
      const now = Date.now();
      const turnover = Array.isArray(rows) ? rows
        .flatMap((row) => Array.isArray(row) && Number(row[0]) + 86_400_000 <= now ? [number(row[6])] : [])
        .filter((item): item is number => item !== null)
        .slice(-30) : [];
      return assessTurnover(exchange, category, number(tickerRow?.turnover24h), turnover, symbol.quote);
    }
    const product = category === "spot" ? "spot" : "fapi";
    const base = category === "spot" ? "https://data-api.binance.vision/api/v3" : "https://fapi.binance.com/fapi/v1";
    const [ticker, candles] = await Promise.all([
      json(`${base}/ticker/24hr?symbol=${symbol.compact}`),
      json(`${base}/klines?symbol=${symbol.compact}&interval=1d&limit=31`),
    ]);
    const tickerRow = record(ticker);
    const daily = Array.isArray(candles) ? candles : [];
    const turnoverIndex = product === "spot" ? 7 : 7;
    const now = Date.now();
    const turnovers = daily.flatMap((row) => Array.isArray(row) && Number(row[0]) + 86_400_000 <= now ? [number(row[turnoverIndex])] : []).filter((item): item is number => item !== null).slice(-30);
    return assessTurnover(exchange, category, number(tickerRow?.quoteVolume), turnovers, symbol.quote);
  } catch {
    return assessTurnover(exchange, category, null, [], symbol.quote);
  }
}

export async function fetchMarketOverview(requestedSymbol: string, category: MarketCategory): Promise<MarketOverview> {
  const symbol = normalizedSymbol(requestedSymbol);
  const venues = category === "spot" ? SPOT_VENUES : PERPETUAL_VENUES;
  const [prices, turnover] = await Promise.all([
    Promise.all(venues.map((venue) => getPrice(venue, symbol, category))),
    Promise.all(((["bybit", "binance"] as const).map((exchange) => getTurnover(exchange, symbol, category)))),
  ]);
  return { captured_at: Date.now(), symbol: symbol.compact, prices, turnover };
}

