"""
Python mirror of src/lib/social/crypto.ts.
Same SALT + same scrypt params + same byte layout, so blobs encrypted by
Node.encryptToken can be decrypted here, and vice versa.
"""
import os
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
from cryptography.hazmat.backends import default_backend

SALT = b"pennylime-social-v1"
IV_LEN = 12
TAG_LEN = 16

_cached_key: bytes | None = None


def _key() -> bytes:
    """Derive AES-256 key from NEXTAUTH_SECRET via scrypt. Cached for process lifetime."""
    global _cached_key
    if _cached_key is not None:
        return _cached_key
    secret = os.environ["NEXTAUTH_SECRET"].encode("utf-8")
    # n=16384, r=8, p=1 are Node's scrypt defaults — must match crypto.ts exactly
    kdf = Scrypt(salt=SALT, length=32, n=16384, r=8, p=1, backend=default_backend())
    _cached_key = kdf.derive(secret)
    return _cached_key


def decrypt_token(payload: str) -> str:
    """Decrypt a base64 blob produced by Node's encryptToken."""
    raw = base64.b64decode(payload)
    if len(raw) < IV_LEN + TAG_LEN + 1:
        raise ValueError("crypto: payload too short")
    iv = raw[:IV_LEN]
    tag = raw[IV_LEN : IV_LEN + TAG_LEN]
    ct = raw[IV_LEN + TAG_LEN :]
    aesgcm = AESGCM(_key())
    # AESGCM.decrypt expects ct concatenated with the tag at the end
    plaintext = aesgcm.decrypt(iv, ct + tag, None)
    return plaintext.decode("utf-8")
