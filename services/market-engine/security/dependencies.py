from fastapi import Header, HTTPException

from security.access_tokens import verify_market_token


def require_market_token(authorization: str | None = Header(default=None)) -> None:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not verify_market_token(token):
        raise HTTPException(status_code=401, detail="Valid market access token required")
