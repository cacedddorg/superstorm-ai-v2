"use client";

import { useRef, useState } from "react";
import type { MarketCategory, MarketExchange, MarketOverview, MarketStatusPayload, PreviousBookSample } from "../lib/market-types";
import { fetchPublicMarketSnapshot } from "../lib/public-market-data";
import { fetchMarketOverview } from "../lib/market-overview";

export default function MarketStatus({ onSnapshot }: { onSnapshot: (payload: MarketStatusPayload) => void }) {
  const [status, setStatus] = useState<MarketStatusPayload | null>(null);
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [category, setCategory] = useState<MarketCategory>("linear");
  const [selectedExchanges, setSelectedExchanges] = useState<MarketExchange[]>(["bybit", "binance"]);
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const previousSample = useRef<{ symbol: string; sample: PreviousBookSample } | null>(null);

  async function refresh(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedSymbol = symbol.trim().toUpperCase();
    setLoading(true);
    setError(null);
    try {
      const [snapshot, nextOverview] = await Promise.all([
        fetchPublicMarketSnapshot(requestedSymbol, category, selectedExchanges),
        fetchMarketOverview(requestedSymbol, category),
      ]);
      const response = await fetch("/api/market-status", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: requestedSymbol,
          previous_sample: previousSample.current?.symbol === `${category}:${requestedSymbol}` ? previousSample.current.sample : null,
          snapshot,
        }),
      });
      const body = (await response.json()) as MarketStatusPayload | { error?: string };
      if (!response.ok) {
        throw new Error("error" in body ? body.error || `Market API returned HTTP ${response.status}` : `Market API returned HTTP ${response.status}`);
      }
      const payload = body as MarketStatusPayload;
      setStatus(payload);
      setOverview(nextOverview);
      onSnapshot(payload);
      if (payload.book_valid && payload.orderbook.bids[0] && payload.orderbook.asks[0]) {
        const bid = payload.orderbook.bids[0];
        const ask = payload.orderbook.asks[0];
        previousSample.current = {
          symbol: `${category}:${requestedSymbol}`,
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
        <label htmlFor="market-symbol" className="sr-only">Market symbol</label>
        <input
          id="market-symbol"
          value={symbol}
          onChange={(event) => setSymbol(event.target.value.toUpperCase())}
          maxLength={20}
          pattern="[A-Z0-9]{3,20}"
          title="Use a symbol such as BTCUSDT; Coinbase fallback uses the matching USD spot product"
          className="min-w-0 flex-1 rounded border border-gray-700 bg-black px-3 py-2 font-mono text-sm text-white"
        />
        <label htmlFor="market-category" className="sr-only">Market type</label>
        <select id="market-category" value={category} onChange={(event) => {
          const next = event.target.value as MarketCategory;
          setCategory(next);
          if (next !== "spot") setSelectedExchanges((current) => current.filter((exchange) => exchange !== "coinbase"));
          else setSelectedExchanges((current) => current.includes("coinbase") ? current : [...current, "coinbase"]);
        }} className="rounded border border-gray-700 bg-black px-3 py-2 font-mono text-sm text-white">
          <option value="spot">Spot</option>
          <option value="linear">Perpetual (linear)</option>
        </select>
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-emerald-700 px-4 py-2 font-mono text-sm font-semibold text-white hover:bg-emerald-600 disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? "Fetching…" : status ? "Refresh snapshot" : "Fetch snapshot"}
        </button>
      </form>

      <fieldset className="mb-4 rounded border border-gray-800 p-3">
        <legend className="px-1 text-xs uppercase text-gray-500">Preferred strategy-data exchanges</legend>
        <div className="flex flex-wrap gap-4 text-sm text-gray-300">
          {(["bybit", "binance", "coinbase"] as const).map((exchange) => (
            <label key={exchange} className="flex items-center gap-2">
              <input type="checkbox" checked={selectedExchanges.includes(exchange)} disabled={exchange === "coinbase" && category !== "spot"}
                onChange={(event) => setSelectedExchanges((current) => event.target.checked
                  ? [...current, exchange]
                  : current.filter((item) => item !== exchange))} />
              {exchange === "coinbase" ? "Coinbase (spot only)" : exchange}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-500">Selected providers are tried in this order until one returns a valid snapshot. The comparison panel below queries its own venue list in parallel.</p>
      </fieldset>

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
            <Metric label="Market" value={`${status.exchange} · ${status.symbol} · ${status.category}`} />
            <Metric label="Book quality" value={status.quality.quality} />
            <Metric label="Snapshot age" value={status.data_age_ms >= 0
              ? `${status.data_age_ms} ms · ${status.quality.timestamp_source === "orderbook" ? "book timestamp" : "exchange-clock estimate"}`
              : "Clock skew detected"} />
            <Metric label="Trade sample" value={`${status.trade_sample.returned}/${status.trade_sample.limit} recent trades${status.trade_sample.quality === "SAMPLED_LIMIT_REACHED" ? " · request cap reached" : ""}`} />
            <Metric label="Updated locally" value={new Date(status.fetched_at).toLocaleTimeString()} />
            <Metric label="Trades in prior second" value={String(status.trade_sample.trades_in_last_second)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {status.strategies.map((strategy) => (
              <article key={strategy.strategy_name} className="rounded border border-gray-800 p-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-mono text-sm font-semibold text-gray-200">{strategy.strategy_name}</h3>
                  <span className={`shrink-0 text-xs uppercase ${strategy.data_quality === "UNAVAILABLE" ? "text-red-300" : strategy.data_quality === "LIMITED" ? "text-amber-300" : strategy.selected_candidate ? "text-emerald-300" : "text-gray-400"}`}>
                    {strategy.data_quality === "UNAVAILABLE" ? "Unavailable" : strategy.data_quality === "LIMITED" ? `Limited${strategy.selected_candidate ? ` · ${strategy.selected_candidate} candidate` : ""}` : strategy.selected_candidate ? `${strategy.selected_candidate} candidate` : strategy.data_quality === "INCOMPLETE" ? "Incomplete" : "No trade"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-gray-400">{strategy.reason}</p>
                <p className="mt-2 text-xs text-gray-500">{strategy.evidence}</p>
                {strategy.trade_plan && (
                  <div className="mt-3 rounded border border-gray-800 bg-black/20 p-2 text-xs">
                    <p className="mb-2 font-semibold text-gray-300">{strategy.trade_plan.direction ? `${strategy.trade_plan.direction.toUpperCase()} research levels` : "Directional scenarios · no strategy candidate"}</p>
                    <p className="text-gray-400">Entry reference (mid): <Price value={strategy.trade_plan.entry_price} /></p>
                    {strategy.trade_plan.direction ? (
                      <>
                        <p className="text-gray-400">Stop loss: <Price value={strategy.trade_plan.stop_loss_price} /></p>
                        <p className="text-gray-400">Exit target: <Price value={strategy.trade_plan.exit_price} /> · {strategy.trade_plan.risk_reward}:1 R</p>
                      </>
                    ) : (
                      <div className="mt-1 grid grid-cols-2 gap-2">
                        <div><p className="text-emerald-300">Long scenario</p><p className="text-gray-400">Stop <Price value={strategy.trade_plan.scenarios.long.stop_loss_price} /></p><p className="text-gray-400">Exit <Price value={strategy.trade_plan.scenarios.long.exit_price} /></p></div>
                        <div><p className="text-red-300">Short scenario</p><p className="text-gray-400">Stop <Price value={strategy.trade_plan.scenarios.short.stop_loss_price} /></p><p className="text-gray-400">Exit <Price value={strategy.trade_plan.scenarios.short.exit_price} /></p></div>
                      </div>
                    )}
                    <p className="mt-1 text-[11px] text-gray-500">{strategy.trade_plan.method}</p>
                  </div>
                )}
                {!strategy.trade_plan && <p className="mt-2 text-xs text-gray-500">Entry, stop, and exit scenarios unavailable: at least 15 valid candles are required.</p>}
                {strategy.missing_inputs.length > 0 && (
                  <p className="mt-2 text-xs text-amber-300">Missing: {strategy.missing_inputs.join(", ")}</p>
                )}
              </article>
            ))}
          </div>

          {overview && (
            <div className="mt-5 space-y-4">
              <section className="rounded border border-gray-700 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-mono font-semibold text-gray-100">24-hour market turnover</h3>
                  <span className="text-xs text-gray-500">{overview.turnover[0]?.category === "spot" ? "Spot" : "Linear perpetual"} · rolling 24h vs completed daily candles</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {overview.turnover.map((item) => (
                    <article key={item.exchange} className="rounded border border-gray-800 bg-black/20 p-3">
                      <div className="flex justify-between gap-2"><strong className="font-mono text-sm">{item.exchange}</strong><strong className={`font-mono text-xs ${item.classification === "HIGH" ? "text-emerald-300" : item.classification === "LOW" ? "text-amber-300" : "text-gray-300"}`}>{item.classification}</strong></div>
                      <p className="mt-2 text-sm text-gray-300">24h turnover: {item.turnover_24h === null ? "unavailable" : `${formatCompact(item.turnover_24h)} ${item.quote_asset}`}</p>
                      <p className="mt-1 text-xs text-gray-500">vs 30-day average: {item.difference_from_average_pct === null ? "unavailable" : `${item.difference_from_average_pct >= 0 ? "+" : ""}${item.difference_from_average_pct.toFixed(1)}%`} · {item.completed_baseline_days} completed days</p>
                    </article>
                  ))}
                </div>
                <p className="mt-3 text-xs text-gray-500">HIGH ≥ 50% above average; LOW ≤ 50% below; otherwise NORMAL. Turnover is quote-currency notional as reported by the exchange; spot and perpetual values are separate markets. The 30-day mean uses completed daily candles.</p>
              </section>

              <section className="rounded border border-gray-700 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-mono font-semibold text-gray-100">Exchange price comparison</h3>
                  <span className="text-xs text-gray-500">{overview.symbol} · {overview.prices.filter((row) => row.status === "available").length}/{overview.prices.length} prices · {overview.prices[0]?.category === "spot" ? "spot" : "perpetual"} · {new Date(overview.captured_at).toLocaleTimeString()}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[500px] text-left text-xs">
                    <thead className="text-gray-500"><tr><th className="p-2">Exchange</th><th className="p-2">Instrument</th><th className="p-2">Last price</th><th className="p-2">Status</th></tr></thead>
                    <tbody>{overview.prices.map((row) => <tr key={row.exchange} className="border-t border-gray-800">
                      <td className="p-2 font-mono text-gray-200">{row.exchange}</td><td className="p-2 text-gray-400">{row.instrument}</td>
                      <td className="p-2 font-mono text-gray-200">{row.price === null ? "—" : `${formatPrice(row.price)} ${row.quote_asset}`}</td>
                      <td className={`p-2 ${row.status === "available" ? "text-emerald-300" : "text-amber-300"}`}>{row.status === "available" ? "Available" : `Unavailable${row.detail ? ` · ${row.detail}` : ""}`}</td>
                    </tr>)}</tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-gray-500">Requests go to each exchange’s public endpoint in parallel on Refresh. Prices are last trades, not synchronized executable quotes; quote currencies and contract types can differ. Failed endpoints remain explicitly unavailable.</p>
              </section>
            </div>
          )}

          <div className="mt-5 rounded border border-gray-700 bg-black/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-mono font-semibold text-white">Overall decision</h3>
              <span className="font-mono text-sm uppercase text-amber-300">
                {status.decision.selected_candidate ? `${status.decision.selected_candidate} consensus` : "No trade"}
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-300">{status.decision.reason}</p>
          </div>

          <p className="mt-5 text-xs leading-relaxed text-gray-500">
            Data is requested only when you press Refresh. A full trade-sample response is checked against each strategy's required time window; limited inputs are shown on the affected strategy. Entry, stop, and exit numbers are ATR/swing based research scenarios; they are not validated trading advice or execution instructions. Strategy B is a sampled sweep/reclaim proxy and cannot confirm resting-liquidity absorption. Coinbase is a spot venue and is disabled for the perpetual strategy snapshot. Cross-exchange comparisons can use different quote currencies or contract designs. REST snapshots do not reproduce a continuous feed.
          </p>
        </>
      )}
    </section>
  );
}

function Price({ value }: { value: number | null }) {
  return <span className="font-mono text-gray-200">{value === null ? "unavailable" : formatPrice(value)}</span>;
}
function formatPrice(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: value >= 1 ? 6 : 10 });
}
function formatCompact(value: number): string {
  return value.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 2 });
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-800 bg-black/20 p-3">
      <p className="text-xs uppercase text-gray-500">{label}</p>
      <p className="mt-1 font-mono text-gray-200">{value}</p>
    </div>
  );
}

