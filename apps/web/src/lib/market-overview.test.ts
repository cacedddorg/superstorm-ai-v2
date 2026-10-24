import { describe, expect, it } from "vitest";
import { assessTurnover } from "./market-overview";

describe("assessTurnover", () => {
  it("labels turnover high or low only against a sufficient completed daily baseline", () => {
    const baseline = Array(30).fill(1_000_000);
    expect(assessTurnover("bybit", "linear", 1_600_000, baseline).classification).toBe("HIGH");
    expect(assessTurnover("binance", "spot", 400_000, baseline).classification).toBe("LOW");
    expect(assessTurnover("bybit", "spot", 1_100_000, baseline).classification).toBe("NORMAL");
  });

  it("does not infer a high or low classification with missing or thin history", () => {
    expect(assessTurnover("bybit", "linear", 500_000, [1, 2, 3]).classification).toBe("UNAVAILABLE");
    expect(assessTurnover("binance", "linear", null, Array(30).fill(1_000_000)).classification).toBe("UNAVAILABLE");
  });
});

