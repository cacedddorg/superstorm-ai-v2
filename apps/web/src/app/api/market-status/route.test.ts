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
});
