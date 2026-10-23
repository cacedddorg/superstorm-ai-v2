export type StrategyDecision = "actionable" | "no_trade";

export type StrategyExplanation = {
  strategy_name: string;
  evidence: string;
  contrary_evidence: string;
  data_quality: string;
  missing_inputs: string[];
  timestamps: { eval_time: number };
  expiry: number;
  decision: StrategyDecision;
  selected_candidate?: "buy" | "sell" | null;
  reason: string;
};

export type OrderBookLevel = { price: number; quantity: number };

export type PreviousBookSample = {
  exchange: "bybit" | "binance" | "coinbase";
  fetched_at: number;
  best_bid: number;
  best_bid_qty: number;
  best_ask: number;
  best_ask_qty: number;
};

export type MarketSnapshotInput = {
  exchange: "bybit" | "binance" | "coinbase";
  category: "linear" | "spot";
  symbol: string;
  bids: [string, string][];
  asks: [string, string][];
  trades: { price?: string; size?: string; timestamp?: number; side?: string }[];
  exchange_timestamp: number;
  trade_server_time: number;
};

export type MarketStatusPayload = {
  symbol: string;
  exchange: "bybit" | "binance" | "coinbase";
  category: "linear" | "spot";
  fetched_at: number;
  exchange_timestamp: number;
  data_age_ms: number;
  quality: { safe: boolean; quality: string; reason: string; data_age_ms: number };
  orderbook: { bids: OrderBookLevel[]; asks: OrderBookLevel[] };
  book_valid: boolean;
  trade_sample: { returned: number; limit: number; trades_in_last_second: number; quality: string };
  strategies: StrategyExplanation[];
  decision: StrategyExplanation;
};
