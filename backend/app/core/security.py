"""Security utilities for password hashing and token generation."""

import base64
import hashlib
import hmac
import secrets
from datetime import datetime


def hash_password(password: str, rounds: int = 200_000) -> str:
    """Hash a password using PBKDF2-HMAC-SHA256.

    The output format is easy to store in config JSON and can be verified later
    without extra dependencies.
    """

    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), rounds)
    return f"pbkdf2_sha256${rounds}${salt}${base64.b64encode(digest).decode('ascii')}"


def verify_password(password: str, password_hash: str) -> bool:
    """Verify the plain password against the stored PBKDF2 hash."""

    try:
        algorithm, rounds_raw, salt, encoded_hash = password_hash.split("$", 3)
    except ValueError:
        return False

    if algorithm != "pbkdf2_sha256":
        return False

    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        int(rounds_raw),
    )
    expected = base64.b64decode(encoded_hash.encode("ascii"))
    return hmac.compare_digest(digest, expected)


def generate_token() -> str:
    """Generate a random API token."""

    return secrets.token_urlsafe(32)


def generate_order_no() -> str:
    """Generate an order number with time and randomness combined."""

    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    random_suffix = secrets.randbelow(900000) + 100000
    return f"FK{timestamp}{random_suffix}"
