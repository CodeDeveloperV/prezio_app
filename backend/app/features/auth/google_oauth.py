import httpx
from authlib.jose import JsonWebKey
from authlib.jose import jwt as authlib_jwt
from authlib.jose.errors import JoseError

GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"]


class InvalidGoogleToken(Exception):
    pass


async def verify_google_id_token(id_token: str, client_id: str) -> dict:
    """Verifies a Google id_token's signature against Google's live JWKS via Authlib,
    then checks issuer/audience/expiry."""
    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.get(GOOGLE_CERTS_URL)
        response.raise_for_status()
        jwks = response.json()

    key_set = JsonWebKey.import_key_set(jwks)
    claims_options = {
        "iss": {"essential": True, "values": GOOGLE_ISSUERS},
        "aud": {"essential": True, "values": [client_id]},
    }

    try:
        claims = authlib_jwt.decode(id_token, key_set, claims_options=claims_options)
        claims.validate()
    except JoseError as exc:
        raise InvalidGoogleToken(str(exc)) from exc

    return dict(claims)
