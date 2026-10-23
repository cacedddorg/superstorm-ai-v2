import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/market-status", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("falls back to Binance after Bybit is denied and reports Binance as the source", async () => {
    const now = Date.now();
    vi.stubEnv("AUTH_USER", "researcher");
    vi.stubEnv("AUTH_PASSWORD", "test-password");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://api.bybit.com/")) return response({ error: "Forbidden" }, 403);
      if (url.includes("/fapi/v1/depth")) {
        return response({
          T: now - 100,
          bids: [["100", "2"], ["99", "1"]],
          asks: [["101", "3"], ["102", "1"]],
        });
      }
      if (url.includes("/fapi/v1/trades")) {
        return response([{ price: "100", qty: "1", time: now - 50, isBuyerMaker: false }]);
      }
      throw new Error(`Unexpected market endpoint: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const authorization = `Basic ${Buffer.from("researcher:test-password").toString("base64")}`;
    const result = await POST(new Request("http://localhost/api/market-status", {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: "BTCUSDT" }),
    }));

    expect(result.status).toBe(200);
    const payload = await result.json();
    expect(payload.exchange).toBe("binance");
    expect(payload.exchange_timestamp).toBe(now - 100);
    expect(payload.orderbook.bids[0]).toEqual({ price: 100, quantity: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
