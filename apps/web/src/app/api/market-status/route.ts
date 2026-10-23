import { NextResponse } from "next/server";
import { issueMarketAccessToken } from "../../../lib/market-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const backendUrl = process.env.MARKET_ENGINE_URL;
  if (!backendUrl) {
    return NextResponse.json({ error: "Market engine URL is not configured" }, { status: 503 });
  }

  const symbol = new URL(request.url).searchParams.get("symbol") || "BTCUSDT";
  try {
    const { token } = issueMarketAccessToken();
    const upstream = await fetch(
      `${backendUrl.replace(/\/$/, "")}/market/status?symbol=${encodeURIComponent(symbol)}`,
      {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    const body = await upstream.json();
    return NextResponse.json(body, {
      status: upstream.status,
      headers: { "Cache-Control": "no-store, private" },
    });
  } catch {
    return NextResponse.json({ error: "Market engine is unavailable" }, { status: 503 });
  }
}
