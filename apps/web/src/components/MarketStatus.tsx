"use client";

import { useEffect, useState } from "react";

type Strategy = {
  strategy_name: string;
  evidence: string;
  contrary_evidence: string;
  data_quality: string;
  missing_inputs: string[];
  decision: "actionable" | "no_trade";
  selected_candidate?: "buy" | "sell" | null;
  reason: string;
};

type MarketStatusPayload = {
  symbol: string;
  quality: { safe: boolean; quality: string; reason: string; data_age_ms?: number };
  decision: Strategy;
  strategies: Strategy[];
  book_valid: boolean;
};

export default function MarketStatus() {
  const [status, setStatus] = useState<MarketStatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    const refresh = async () => {
      controller = new AbortController();
      try {
        const response = await fetch("/api/market-status", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Market API returned HTTP ${response.status}`);
        const payload = (await response.json()) as MarketStatusPayload;
        if (!cancelled) {
          setStatus(payload);
          setError(null);
        }
      } catch (cause) {
        if (!cancelled && !(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(cause instanceof Error ? cause.message : "Market API is unavailable");
        }
      } finally {
        if (!cancelled) timer = setTimeout(refresh, 2500);
      }
    };

    void refresh();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
    };
  }, []);

  return (
    <section className="min-h-[400px] rounded-lg border border-gray-800 bg-gray-900 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-mono text-xl font-bold text-gray-200">Market engine</h2>
        <span className="rounded border border-amber-800 px-2 py-1 text-xs text-amber-300">
          Research signals only · no orders placed
        </span>
      </div>

      {error && (
        <p className="mb-4 rounded border border-red-900 bg-red-950/30 p-3 font-mono text-sm text-red-300">
          Backend unavailable: {error}
        </p>
      )}

      {!status ? (
        <p className="font-mono text-sm text-gray-400">Waiting for backend status…</p>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 text-sm">
            <Metric label="Symbol" value={status.symbol} />
            <Metric label="Order book" value={status.book_valid ? "Valid" : "Unavailable"} />
            <Metric label="Data quality" value={status.quality.quality} />
            <Metric label="Age" value={status.quality.data_age_ms == null ? "Unknown" : `${status.quality.data_age_ms} ms`} />
          </div>

          <div className="mb-5 rounded border border-gray-700 bg-black/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-mono font-semibold text-white">Consensus</h3>
              <span className="font-mono text-sm uppercase text-amber-300">
                {status.decision.selected_candidate
                  ? `${status.decision.selected_candidate} candidate`
                  : "No trade"}
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-300">{status.decision.reason}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {status.strategies.map((strategy) => {
              const unavailable = strategy.missing_inputs.includes("historical_sweeps");
              return (
                <article key={strategy.strategy_name} className="rounded border border-gray-800 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-mono text-sm font-semibold text-gray-200">
                      {strategy.strategy_name}
                    </h3>
                    <span className="shrink-0 text-xs uppercase text-gray-400">
                      {unavailable ? "Unavailable" : strategy.decision.replace("_", " ")}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-400">{strategy.reason}</p>
                  {strategy.missing_inputs.length > 0 && (
                    <p className="mt-2 text-xs text-amber-300">
                      Missing: {strategy.missing_inputs.join(", ")}
                    </p>
                  )}
                </article>
              );
            })}
          </div>

          <p className="mt-5 text-xs leading-relaxed text-gray-500">
            These are unvalidated heuristics. A candidate is not a recommendation or an execution instruction.
            Market data and signals may be incomplete or delayed.
          </p>
        </>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-800 bg-black/20 p-3">
      <p className="text-xs uppercase text-gray-500">{label}</p>
      <p className="mt-1 font-mono text-gray-200">{value}</p>
    </div>
  );
}
