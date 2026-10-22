"use client";

import { useEffect, useState, useRef } from "react";

type OrderBookEntry = [string, string];

interface OrderBookData {
  symbol: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  timestamp: number;
}

export default function OrderBook() {
  const [data, setData] = useState<OrderBookData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/orderbook";
    
    const connect = () => {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        setError(null);
        console.log("Connected to orderbook stream");
      };

      wsRef.current.onmessage = (event) => {
        try {
          const parsed: OrderBookData = JSON.parse(event.data);
          setData(parsed);
        } catch (err) {
          console.error("Failed to parse orderbook data", err);
        }
      };

      wsRef.current.onerror = () => {
        setError("WebSocket Connection Error");
      };

      wsRef.current.onclose = () => {
        console.log("Orderbook stream closed, reconnecting...");
        setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  if (error) {
    return <div className="text-red-500 font-mono p-4 border border-red-800 bg-red-950/30 rounded">{error}</div>;
  }

  if (!data) {
    return <div className="text-gray-400 font-mono p-4 animate-pulse">Waiting for market data...</div>;
  }

  const { symbol, bids, asks } = data;

  const displayAsks = [...asks].reverse();

  return (
    <div className="font-mono text-sm bg-gray-900 border border-gray-800 rounded-lg overflow-hidden w-full max-w-sm">
      <div className="bg-gray-800 px-4 py-2 text-white font-bold flex justify-between">
        <span>{symbol}</span>
        <span className="text-xs text-gray-400">Live Orderbook</span>
      </div>

      <div className="flex flex-col p-2 space-y-1">
        <div className="flex flex-col">
          {displayAsks.map(([price, qty], i) => (
            <div key={`ask-${price}-${i}`} className="flex justify-between text-red-500 hover:bg-red-950/50 px-2 py-0.5 rounded cursor-default">
              <span>{parseFloat(price).toFixed(2)}</span>
              <span>{parseFloat(qty).toFixed(4)}</span>
            </div>
          ))}
        </div>

        <div className="py-2 flex justify-center items-center border-y border-gray-800 my-1">
          {asks.length > 0 && bids.length > 0 ? (
            <span className="text-white font-bold text-lg">
              {((parseFloat(asks[0][0]) + parseFloat(bids[0][0])) / 2).toFixed(2)}
            </span>
          ) : (
            <span className="text-gray-500">...</span>
          )}
        </div>

        <div className="flex flex-col">
          {bids.map(([price, qty], i) => (
            <div key={`bid-${price}-${i}`} className="flex justify-between text-green-500 hover:bg-green-950/50 px-2 py-0.5 rounded cursor-default">
              <span>{parseFloat(price).toFixed(2)}</span>
              <span>{parseFloat(qty).toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}