from __future__ import annotations

import base64
import hashlib
import hmac
import time

from config.settings import settings


def verify_market_token(token: str | None) -> bool:
    """Verify an expiring HMAC token issued by the authenticated frontend."""
    secret = settings.market_api_signing_secret
    if not secret or not token:
        return False

    try:
        expiry_text, signature = token.split(".", maxsplit=1)
        expiry = int(expiry_text)
        now = int(time.time())
        if expiry <= now or expiry > now + 120:
            return False
        expected = hmac.new(secret.encode(), expiry_text.encode(), hashlib.sha256).digest()
        supplied = base64.urlsafe_b64decode(signature + "=" * (-len(signature) % 4))
        return hmac.compare_digest(expected, supplied)
    except (ValueError, TypeError):
        return False
