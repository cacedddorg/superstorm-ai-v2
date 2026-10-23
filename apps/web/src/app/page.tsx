"use client";

import { useState } from "react";
import OrderBook from "../components/OrderBook";
import MarketStatus from "../components/MarketStatus";
import type { MarketStatusPayload } from "../lib/market-types";

export default function Home() {
  const [snapshot, setSnapshot] = useState<MarketStatusPayload | null>(null);

  return (
    <main className="flex min-h-screen flex-col items-center bg-black p-4 text-white md:p-8">
      <header className="mb-8 text-center">
        <h1 className="mb-2 bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-4xl font-black tracking-tighter text-transparent">
          SUPERSTORM AI
        </h1>
        <p className="font-mono text-sm text-gray-400">On-demand cryptocurrency market research</p>
      </header>

      <div className="grid w-full max-w-6xl grid-cols-1 gap-6 md:grid-cols-3">
        <section className="flex flex-col items-center md:items-start">
          <OrderBook data={snapshot} />
        </section>
        <section className="md:col-span-2">
          <MarketStatus onSnapshot={setSnapshot} />
        </section>
      </div>
    </main>
  );
}
