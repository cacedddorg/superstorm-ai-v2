import OrderBook from "../components/OrderBook";

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

        {/* Strategy / charts stay inactive until the backend produces verified data. */}
        <section className="md:col-span-2 border border-gray-800 rounded-lg p-6 bg-gray-900 flex flex-col items-center justify-center min-h-[400px]">
          <h2 className="text-xl font-bold text-gray-300 mb-4 font-mono">Market engine status</h2>
          <div className="text-center text-gray-400 font-mono space-y-2">
            <p>Backend market-data ingestion is not configured yet.</p>
            <p>No verified live prices or strategy signals are available.</p>
          </div>
        </section>
        
      </div>
    </main>
  );
}
