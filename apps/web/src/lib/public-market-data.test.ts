import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublicMarketSnapshot } from "./public-market-data";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function bybitKlines(now: number) {
  const latestMinute = Math.floor(now / 60_000) * 60_000;
  return Array.from({ length: 60 }, (_, index) => [
    String(latestMinute - 60 * 60_000 + index * 60_000), "100", "102", "99", "101", "10", "1000",
  ]);
}

describe("fetchPublicMarketSnapshot", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches spot book, trades, and candles from the selected Bybit spot market", async () => {
    const now = Date.now();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("orderbook")) return response({ retCode: 0, result: { ts: now, b: [["100", "2"]], a: [["101", "3"]] } });
      if (url.includes("recent-trade")) return response({ retCode: 0, time: now, result: { list: [{ price: "100", size: "1", side: "Buy", time: String(now) }] } });
      if (url.includes("/market/kline")) return response({ retCode: 0, result: { list: bybitKlines(now) } });
      throw new Error(`Unexpected endpoint ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await fetchPublicMarketSnapshot("BTCUSDT", "spot", ["bybit"]);

    expect(snapshot.exchange).toBe("bybit");
    expect(snapshot.category).toBe("spot");
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes("category=spot"))).toBe(true);
  });

  it("uses Bybit public data first", async () => {
    const now = Date.now();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("orderbook")) return response({ retCode: 0, result: { ts: now, b: [["100", "2"]], a: [["101", "3"]] } });
      if (url.includes("recent-trade")) return response({ retCode: 0, time: now, result: { list: [{ price: "100", size: "1", side: "Buy", time: String(now) }] } });
      if (url.includes("/market/kline")) return response({ retCode: 0, result: { list: bybitKlines(now) } });
      throw new Error(`Unexpected endpoint ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await fetchPublicMarketSnapshot("BTCUSDT");

    expect(snapshot.exchange).toBe("bybit");
    expect(snapshot.category).toBe("linear");
    expect(snapshot.exchange_timestamp).toBe(now);
    expect(snapshot.recent_trade_count).toBe(1);
    expect(snapshot.trade_limit).toBe(1_000);
    expect(snapshot.candles).toHaveLength(60);
    expect(snapshot.candles[0].open_time).toBeLessThan(snapshot.candles[59].open_time);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("drops malformed individual trades without discarding a valid Bybit book", async () => {
    const now = Date.now();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("orderbook")) return response({ retCode: 0, result: { ts: now, b: [["100", "2"]], a: [["101", "3"]] } });
      if (url.includes("recent-trade")) return response({
        retCode: 0,
        time: now,
        result: { list: [
          { price: "100", size: "1", side: "Buy", time: String(now) },
          { price: "100", size: "1", side: "Buy" },
        ] },
      });
      if (url.includes("/market/kline")) return response({ retCode: 0, result: { list: bybitKlines(now) } });
      throw new Error(`Unexpected endpoint ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await fetchPublicMarketSnapshot("BTCUSDT");

    expect(snapshot.exchange).toBe("bybit");
    expect(snapshot.trades).toHaveLength(1);
    expect(snapshot.trades[0].timestamp).toBe(now);
  });

  it("falls back to Binance from the browser and preserves provider error detail", async () => {
    const now = Date.now();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://api.bybit.com/")) return response({ message: "Unavailable in this region" }, 403);
      if (url.includes("/fapi/v1/depth")) return response({ T: now, bids: [["100", "2"]], asks: [["101", "3"]] });
      if (url.includes("/fapi/v1/trades")) return response([{ price: "100", qty: "1", time: now, isBuyerMaker: false }]);
      if (url.includes("/fapi/v1/time")) return response({ serverTime: now });
      if (url.includes("/fapi/v1/klines")) return response([]);
      throw new Error(`Unexpected endpoint ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await fetchPublicMarketSnapshot("BTCUSDT");

    expect(snapshot.exchange).toBe("binance");
    expect(snapshot.category).toBe("linear");
    expect(fetchMock.mock.calls.length).toBe(7);
  });

  it("falls back to the explicitly labeled Coinbase USD spot market when selected spot venues fail", async () => {
    const now = Date.now();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://api.bybit.com/")) return response({ message: "Blocked" }, 403);
      if (url.startsWith("https://data-api.binance.vision/")) return response({ msg: "Restricted" }, 451);
      if (url.endsWith("/products/BTC-USD/book?level=2")) {
        return response({ bids: [["50000", "2", 1]], asks: [["50001", "3", 1]] });
      }
      if (url.endsWith("/products/BTC-USD/trades?limit=100")) {
        return response([{ price: "50000", size: "1", time: new Date(now).toISOString(), side: "sell" }]);
      }
      if (url.endsWith("/time")) return response({ epoch: Math.floor(now / 1_000) });
      if (url.includes("/products/BTC-USD/candles?")) return response([]);
      throw new Error(`Unexpected endpoint ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await fetchPublicMarketSnapshot("BTCUSDT", "spot");

    expect(snapshot.exchange).toBe("coinbase");
    expect(snapshot.category).toBe("spot");
    expect(snapshot.symbol).toBe("BTC-USD");
    expect(fetchMock).toHaveBeenCalledTimes(11);
  });

  it("returns sanitized provider errors if no mapped market can be fetched", async () => {
    const fetchMock = vi.fn(async () => response({ msg: "Jurisdiction blocked" }, 451));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPublicMarketSnapshot("BTCUSDT")).rejects.toThrow(/Binance USDⓈ-M HTTP 451: Jurisdiction blocked/);
  });
});

