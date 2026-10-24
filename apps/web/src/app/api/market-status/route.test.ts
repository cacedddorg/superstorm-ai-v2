import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const authorization = `Basic ${Buffer.from("researcher:test-password").toString("base64")}`;

function request(body: unknown): Request {
  return new Request("http://localhost/api/market-status", {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function linearSnapshot(exchange: "bybit" | "binance" = "bybit", now = Date.now()) {
  return {
    exchange,
    category: "linear",
    symbol: "BTCUSDT",
    bids: [["100", "2"], ["99", "1"]],
    asks: [["101", "3"], ["102", "1"]],
    trades: [{ price: "100", size: "1", timestamp: now - 50, side: "buy" }],
    recent_trade_count: 1,
    trade_limit: 1_000,
    candles: [],
    timestamp_source: "orderbook" as const,
    exchange_timestamp: now - 100,
    trade_server_time: now,
  };
}

describe("POST /api/market-status", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("evaluates an authenticated Bybit snapshot without making server-side exchange calls", async () => {
    const now = Date.now();
    vi.stubEnv("AUTH_USER", "researcher");
    vi.stubEnv("AUTH_PASSWORD", "test-password");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await POST(request({ symbol: "BTCUSDT", snapshot: linearSnapshot("bybit", now) }));

    expect(result.status).toBe(200);
    const payload = await result.json();
    expect(payload.exchange).toBe("bybit");
    expect(payload.category).toBe("linear");
    expect(payload.exchange_timestamp).toBe(now - 100);
    expect(payload.orderbook.bids[0]).toEqual({ price: 100, quantity: 2 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts and explicitly labels Coinbase USD spot data", async () => {
    const now = Date.now();
    vi.stubEnv("AUTH_USER", "researcher");
    vi.stubEnv("AUTH_PASSWORD", "test-password");
    const snapshot = {
      ...linearSnapshot("bybit", now),
      exchange: "coinbase",
      category: "spot",
      symbol: "BTC-USD",
      bids: [["50000", "2"]],
      asks: [["50001", "3"]],
      exchange_timestamp: now - 100,
    };

    const result = await POST(request({ symbol: "BTCUSDT", snapshot }));

    expect(result.status).toBe(200);
    const payload = await result.json();
    expect(payload.exchange).toBe("coinbase");
    expect(payload.category).toBe("spot");
    expect(payload.symbol).toBe("BTC-USD");
  });

  it("rejects snapshots that mislabel the market or symbol", async () => {
    vi.stubEnv("AUTH_USER", "researcher");
    vi.stubEnv("AUTH_PASSWORD", "test-password");

    const wrongSymbol = await POST(request({
      symbol: "BTCUSDT",
      snapshot: { ...linearSnapshot(), symbol: "ETHUSDT" },
    }));
    const wrongCategory = await POST(request({
      symbol: "BTCUSDT",
      snapshot: { ...linearSnapshot(), exchange: "coinbase", category: "linear", symbol: "BTC-USD" },
    }));

    expect(wrongSymbol.status).toBe(400);
    expect(wrongCategory.status).toBe(400);
  });

  it("uses historical candles and trade samples so first-refresh A and B are evaluable", async () => {
    const now = Date.now();
    vi.stubEnv("AUTH_USER", "researcher");
    vi.stubEnv("AUTH_PASSWORD", "test-password");
    const candleStart = Math.floor(now / 60_000) * 60_000 - 60 * 60_000;
    const snapshot = {
      ...linearSnapshot("bybit", now),
      recent_trade_count: 40,
      candles: Array.from({ length: 60 }, (_, index) => ({
        open_time: candleStart + index * 60_000,
        open: 100 + index * 0.02,
        high: 101 + index * 0.02,
        low: 99 + index * 0.02,
        close: 100.2 + index * 0.02,
        volume: 10,
      })),
    };

    const result = await POST(request({ symbol: "BTCUSDT", snapshot }));
    const payload = await result.json();
    const strategyA = payload.strategies.find((strategy: { strategy_name: string }) => strategy.strategy_name.includes("Strategy A"));
    const strategyB = payload.strategies.find((strategy: { strategy_name: string }) => strategy.strategy_name.includes("Strategy B"));

    expect(result.status).toBe(200);
    expect(strategyA.data_quality).toBe("GOOD");
    expect(strategyA.missing_inputs).not.toContain("prior_orderbook_sample_within_60_seconds");
    expect(strategyB.strategy_name).toContain("Sweep/Reclaim Proxy");
    expect(strategyB.data_quality).toBe("GOOD");
  });

  it("marks a saturated public trade batch incomplete instead of treating it as complete", async () => {
    const now = Date.now();
    vi.stubEnv("AUTH_USER", "researcher");
    vi.stubEnv("AUTH_PASSWORD", "test-password");

    const result = await POST(request({
      symbol: "BTCUSDT",
      snapshot: { ...linearSnapshot("bybit", now), recent_trade_count: 1_000, trade_limit: 1_000 },
    }));
    const payload = await result.json();

    expect(result.status).toBe(200);
    expect(payload.trade_sample.quality).toBe("SAMPLED_LIMIT_REACHED");
    expect(payload.strategies[0].data_quality).toBe("INCOMPLETE");
  });
});

