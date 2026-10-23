import type { MarketStatusPayload } from "../lib/market-types";

export default function OrderBook({ data }: { data: MarketStatusPayload | null }) {
  if (!data) {
    return (
      <div className="w-full rounded-lg border border-gray-800 p-4 font-mono text-sm text-gray-400">
        The order book will load with your next manual snapshot request.
      </div>
    );
  }

  const validBook = data.book_valid;
  const bids = validBook ? data.orderbook.bids.slice(0, 10) : [];
  const asks = validBook ? data.orderbook.asks.slice(0, 10) : [];
  const midpoint = bids[0] && asks[0] ? (bids[0].price + asks[0].price) / 2 : null;

  return (
    <div className="w-full max-w-sm overflow-hidden rounded-lg border border-gray-800 bg-gray-900 font-mono text-sm">
      <div className="flex justify-between bg-gray-800 px-4 py-2 font-bold text-white">
        <span>{data.symbol}</span>
        <span className={`text-xs ${validBook ? "text-emerald-400" : "text-amber-400"}`}>
          {validBook ? "REST snapshot" : data.quality.quality}
        </span>
      </div>
      <div className="flex justify-between px-4 pt-2 text-xs text-gray-400">
        <span>{data.exchange.toUpperCase()} · linear</span>
        <span>captured {new Date(data.fetched_at).toLocaleTimeString()}</span>
      </div>
      {!validBook && (
        <p className="px-4 pt-3 text-xs text-amber-300">
          This snapshot failed the freshness or book-integrity check; its prices are hidden.
        </p>
      )}
      <div className="flex flex-col space-y-1 p-2">
        <div className="flex flex-col">
          {[...asks].reverse().map((level, index) => (
            <div key={`ask-${level.price}-${index}`} className="flex justify-between rounded px-2 py-0.5 text-red-400">
              <span>{level.price.toFixed(2)}</span><span>{level.quantity.toFixed(4)}</span>
            </div>
          ))}
        </div>
        <div className="my-1 flex items-center justify-center border-y border-gray-800 py-2">
          {midpoint === null ? <span className="text-gray-500">—</span> : <span className="text-lg font-bold text-white">{midpoint.toFixed(2)}</span>}
        </div>
        <div className="flex flex-col">
          {bids.map((level, index) => (
            <div key={`bid-${level.price}-${index}`} className="flex justify-between rounded px-2 py-0.5 text-green-400">
              <span>{level.price.toFixed(2)}</span><span>{level.quantity.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="px-4 pb-3 text-xs text-gray-500">Top 10 visible levels from a Bybit REST snapshot; not full market depth.</p>
    </div>
  );
}
