import { NextResponse } from "next/server";
import { issueMarketAccessToken } from "../../../lib/market-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(issueMarketAccessToken(), {
      headers: { "Cache-Control": "no-store, private" },
    });
  } catch {
    return NextResponse.json({ error: "Market authentication is not configured" }, { status: 503 });
  }
}
