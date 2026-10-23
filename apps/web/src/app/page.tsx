import OrderBook from "../components/OrderBook";
import MarketStatus from "../components/MarketStatus";

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-8 flex flex-col items-center">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 mb-2">
          SUPERSTORM AI
        </h1>
        <p className="text-gray-400 font-mono text-sm">Real-Time Cryptocurrency Intelligence</p>
      </header>

      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left Column: Orderbook */}
        <section className="flex flex-col items-center md:items-start">
          <OrderBook />
        </section>

        <section className="md:col-span-2">
          <MarketStatus />
        </section>
        
      </div>
    </main>
  );
}
