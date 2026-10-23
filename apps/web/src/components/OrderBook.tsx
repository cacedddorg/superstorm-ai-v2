"use client";

import { useEffect, useState, useRef } from "react";

type OrderBookEntry = [string, string];

interface OrderBookData {
  symbol: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  timestamp: number;
  exchange: string;
  data_age_ms: number;
  connection_state: string;
  data_quality: string;
  is_valid: boolean;
}

export default function OrderBook() {
  const [data, setData] = useState<OrderBookData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/orderbook";
    
    let closedByCleanup = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let connect: () => Promise<void>;
    const scheduleReconnect = () => {
      if (!closedByCleanup && !reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = undefined;
          void connect();
        }, 3000);
      }
    };

    connect = async () => {
      if (closedByCleanup) return;
      let socket: WebSocket;
      try {
        const tokenResponse = await fetch("/api/market-token", { cache: "no-store" });
        if (!tokenResponse.ok) throw new Error("Could not authenticate market-data connection");
        const { token } = (await tokenResponse.json()) as { token: string };
        if (closedByCleanup) return;
        socket = new WebSocket(wsUrl, ["superstorm-market", token]);
      } catch {
        setConnected(false);
        setError("Could not authenticate market-data connection; retrying");
        scheduleReconnect();
        return;
      }
      wsRef.current = socket;

      socket.onopen = () => {
        setConnected(true);
        setError(null);
      };

      socket.onmessage = (event) => {
        try {
          const parsed: OrderBookData = JSON.parse(event.data);
          setData(parsed);
          setError(null);
        } catch {
          setError("Received an unreadable market-data message");
        }
      };

      socket.onerror = () => {
        setConnected(false);
        setError("Market-data connection failed; retrying");
      };

      socket.onclose = () => {
        setConnected(false);
        if (!closedByCleanup) {
          setError("Market-data connection lost; retrying");
          scheduleReconnect();
        }
      };
    };

    connect();

    return () => {
      closedByCleanup = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, []);

  if (!data) {
    return <div className="text-gray-400 font-mono p-4 border border-gray-800 rounded-lg">{error ?? "Waiting for market data connection…"}</div>;
  }

  const validBook = connected && data.is_valid && data.data_quality === "GOOD";
  const bids = validBook ? data.bids : [];
  const asks = validBook ? data.asks : [];
  const { symbol } = data;

  const displayAsks = [...asks].reverse();

  return (
    <div className="font-mono text-sm bg-gray-900 border border-gray-800 rounded-lg overflow-hidden w-full max-w-sm">
      <div className="bg-gray-800 px-4 py-2 text-white font-bold flex justify-between">
        <span>{symbol}</span>
        <span className={`text-xs ${validBook && connected ? "text-emerald-400" : "text-amber-400"}`}>
          {validBook && connected ? "Live · verified feed" : data.data_quality}
        </span>
      </div>
      <div className="px-4 pt-2 text-xs text-gray-400 flex justify-between">
        <span>{data.exchange.toUpperCase()} · {data.connection_state}</span>
        <span>{data.data_age_ms > 0 ? `${data.data_age_ms} ms old` : "awaiting feed"}</span>
      </div>
      {error && <p className="px-4 pt-2 text-xs text-amber-400">{error}</p>}
      {!validBook && <p className="px-4 pt-3 text-xs text-amber-300">No safe current book is available. Prices are hidden until fresh valid data arrives.</p>}

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
