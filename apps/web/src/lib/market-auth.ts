import { createHmac } from "node:crypto";

export function issueMarketAccessToken(): { token: string; expiresAt: number } {
  const secret = process.env.MARKET_API_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("MARKET_API_SIGNING_SECRET must contain at least 32 characters");
  }

  const expiresAt = Math.floor(Date.now() / 1000) + 60;
  const signature = createHmac("sha256", secret)
    .update(String(expiresAt))
    .digest("base64url");
  return { token: `${expiresAt}.${signature}`, expiresAt };
}
