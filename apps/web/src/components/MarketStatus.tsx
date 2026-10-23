"use client";

import { useRef, useState } from "react";
import type { MarketStatusPayload, PreviousBookSample } from "../lib/market-types";

export default function MarketStatus({ onSnapshot }: { onSnapshot: (payload: MarketStatusPayload) => void }) {
  const [status, setStatus] = useState<MarketStatusPayload | null>(null);
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const previousSample = useRef<{ symbol: string; sample: PreviousBookSample } | null>(null);

  async function refresh(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedSymbol = symbol.trim().toUpperCase();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/market-status", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: requestedSymbol,
          previous_sample: previousSample.current?.symbol === requestedSymbol ? previousSample.current.sample : null,
        }),
      });
      const body = (await response.json()) as MarketStatusPayload | { error?: string };
      if (!response.ok) {
        throw new Error("error" in body ? body.error || `Market API returned HTTP ${response.status}` : `Market API returned HTTP ${response.status}`);
      }
      const payload = body as MarketStatusPayload;
      setStatus(payload);
      onSnapshot(payload);
      if (payload.book_valid && payload.orderbook.bids[0] && payload.orderbook.asks[0]) {
        const bid = payload.orderbook.bids[0];
        const ask = payload.orderbook.asks[0];
        previousSample.current = {
          symbol: payload.symbol,
          sample: {
            exchange: payload.exchange,
            fetched_at: payload.fetched_at,
            best_bid: bid.price,
            best_bid_qty: bid.quantity,
            best_ask: ask.price,
            best_ask_qty: ask.quantity,
          },
        };
      } else {
        previousSample.current = null;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Market API is unavailable");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="min-h-[400px] rounded-lg border border-gray-800 bg-gray-900 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-mono text-xl font-bold text-gray-200">Market snapshot</h2>
        <span className="rounded border border-amber-800 px-2 py-1 text-xs text-amber-300">
          Research only · no orders placed
        </span>
      </div>

      <form onSubmit={refresh} className="mb-4 flex flex-wrap gap-2">
        <label htmlFor="market-symbol" className="sr-only">Linear perpetual symbol</label>
        <input
          id="market-symbol"
          value={symbol}
          onChange={(event) => setSymbol(event.target.value.toUpperCase())}
          maxLength={20}
          pattern="[A-Z0-9]{3,20}"
          title="Use an exchange symbol such as BTCUSDT"
          className="min-w-0 flex-1 rounded border border-gray-700 bg-black px-3 py-2 font-mono text-sm text-white"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-emerald-700 px-4 py-2 font-mono text-sm font-semibold text-white hover:bg-emerald-600 disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? "Fetching…" : status ? "Refresh snapshot" : "Fetch snapshot"}
        </button>
      </form>

      {error && (
        <p className="mb-4 rounded border border-red-900 bg-red-950/30 p-3 font-mono text-sm text-red-300">
          Refresh failed: {error}{status ? " · showing the last successful snapshot" : ""}
        </p>
      )}

      {!status ? (
        <p className="font-mono text-sm text-gray-400">No market request is made until you fetch a snapshot.</p>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 text-sm">
            <Metric label="Market" value={`${status.exchange} · ${status.symbol}`} />
            <Metric label="Book quality" value={status.quality.quality} />
            <Metric label="Snapshot age" value={status.data_age_ms >= 0 ? `${status.data_age_ms} ms` : "Clock skew detected"} />
            <Metric label="Trade sample" value={`${status.trade_sample.returned}/${status.trade_sample.limit} recent trades`} />
            <Metric label="Updated locally" value={new Date(status.fetched_at).toLocaleTimeString()} />
            <Metric label="Trades in prior second" value={String(status.trade_sample.trades_in_last_second)} />
          </div>

          <div className="mb-5 rounded border border-gray-700 bg-black/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-mono font-semibold text-white">Consensus</h3>
              <span className="font-mono text-sm uppercase text-amber-300">
                {status.decision.selected_candidate ? `${status.decision.selected_candidate} candidate` : "No trade"}
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-300">{status.decision.reason}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {status.strategies.map((strategy) => (
              <article key={strategy.strategy_name} className="rounded border border-gray-800 p-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-mono text-sm font-semibold text-gray-200">{strategy.strategy_name}</h3>
                  <span className={`shrink-0 text-xs uppercase ${strategy.data_quality === "UNAVAILABLE" ? "text-red-300" : "text-gray-400"}`}>
                    {strategy.data_quality === "UNAVAILABLE" ? "Unavailable" : strategy.selected_candidate ? `${strategy.selected_candidate} candidate` : strategy.data_quality === "INCOMPLETE" ? "Incomplete" : "No trade"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-gray-400">{strategy.reason}</p>
                <p className="mt-2 text-xs text-gray-500">{strategy.evidence}</p>
                {strategy.missing_inputs.length > 0 && (
                  <p className="mt-2 text-xs text-amber-300">Missing: {strategy.missing_inputs.join(", ")}</p>
                )}
              </article>
            ))}
          </div>

          <p className="mt-5 text-xs leading-relaxed text-gray-500">
            Data is requested from Bybit only when you press Refresh. These are unvalidated research heuristics, not recommendations or execution instructions. REST snapshots do not reproduce a continuous feed; missing or limited measurements are labelled above.
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
