import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublicMarketSnapshot } from "./public-market-data";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchPublicMarketSnapshot", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses Bybit public data first", async () => {
    const now = Date.now();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("orderbook")) return response({ retCode: 0, result: { ts: now, b: [["100", "2"]], a: [["101", "3"]] } });
      if (url.includes("recent-trade")) return response({ retCode: 0, time: now, result: { list: [{ price: "100", size: "1", side: "Buy", time: String(now) }] } });
      throw new Error(`Unexpected endpoint ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await fetchPublicMarketSnapshot("BTCUSDT");

    expect(snapshot.exchange).toBe("bybit");
    expect(snapshot.category).toBe("linear");
    expect(snapshot.exchange_timestamp).toBe(now);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to Binance from the browser and preserves provider error detail", async () => {
    const now = Date.now();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://api.bybit.com/")) return response({ message: "Unavailable in this region" }, 403);
      if (url.includes("/fapi/v1/depth")) return response({ T: now, bids: [["100", "2"]], asks: [["101", "3"]] });
      if (url.includes("/fapi/v1/trades")) return response([{ price: "100", qty: "1", time: now, isBuyerMaker: false }]);
      throw new Error(`Unexpected endpoint ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await fetchPublicMarketSnapshot("BTCUSDT");

    expect(snapshot.exchange).toBe("binance");
    expect(snapshot.category).toBe("linear");
    expect(fetchMock.mock.calls.length).toBe(4);
  });

  it("falls back to the explicitly labeled Coinbase USD spot market when both futures sources fail", async () => {
    const now = Date.now();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://api.bybit.com/")) return response({ message: "Blocked" }, 403);
      if (url.startsWith("https://fapi.binance.com/")) return response({ msg: "Restricted" }, 451);
      if (url.endsWith("/products/BTC-USD/book?level=2")) {
        return response({ time: new Date(now).toISOString(), bids: [["50000", "2", 1]], asks: [["50001", "3", 1]] });
      }
      if (url.endsWith("/products/BTC-USD/trades?limit=100")) {
        return response([{ price: "50000", size: "1", time: new Date(now).toISOString(), side: "sell" }]);
      }
      throw new Error(`Unexpected endpoint ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await fetchPublicMarketSnapshot("BTCUSDT");

    expect(snapshot.exchange).toBe("coinbase");
    expect(snapshot.category).toBe("spot");
    expect(snapshot.symbol).toBe("BTC-USD");
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("returns sanitized provider errors if no mapped market can be fetched", async () => {
    const fetchMock = vi.fn(async () => response({ msg: "Jurisdiction blocked" }, 451));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPublicMarketSnapshot("BTCUSDT")).rejects.toThrow(/Binance USDⓈ-M HTTP 451: Jurisdiction blocked/);
  });
});
