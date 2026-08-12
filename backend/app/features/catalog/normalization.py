"""Text normalization for catalog matching.

Normalization only ever produces comparison keys -- callers must keep using the original
`canonical_name` / `presentation` strings for display and storage. This intentionally stays a
light unit-equivalence table (L/ML/KG/G/UNIDADES) rather than a general unit-conversion engine.
"""

import re

_WHITESPACE_RE = re.compile(r"\s+")
_QUANTITY_UNIT_RE = re.compile(r"^(\d+(?:[.,]\d+)?)([a-zA-Z]+)$")

# Maps a unit token to (canonical unit, multiplier to that canonical unit).
_UNIT_ALIASES: dict[str, tuple[str, float]] = {
    "l": ("ml", 1000.0),
    "lt": ("ml", 1000.0),
    "lts": ("ml", 1000.0),
    "litro": ("ml", 1000.0),
    "litros": ("ml", 1000.0),
    "ml": ("ml", 1.0),
    "kg": ("g", 1000.0),
    "kgs": ("g", 1000.0),
    "g": ("g", 1.0),
    "gr": ("g", 1.0),
    "grs": ("g", 1.0),
    "u": ("u", 1.0),
    "un": ("u", 1.0),
    "und": ("u", 1.0),
    "unid": ("u", 1.0),
    "unidad": ("u", 1.0),
    "unidades": ("u", 1.0),
}


def normalize_name(text: str | None) -> str:
    """Lowercase + collapse whitespace -- never touches the stored `canonical_name`."""
    if not text:
        return ""
    return _WHITESPACE_RE.sub(" ", text.strip().lower())


def normalize_presentation(text: str | None) -> str | None:
    """Reduces a presentation string to a canonical `<amount><unit>` comparison key so that
    "1L", "1 L" and "1000ml" all normalize to the same value ("1000ml"). Falls back to the
    lowercased/collapsed string when the format isn't a recognized `<quantity><unit>` pair.
    """
    if not text:
        return None

    collapsed = normalize_name(text)
    compact = collapsed.replace(" ", "")  # "1 L" and "1L" must normalize identically
    match = _QUANTITY_UNIT_RE.match(compact)
    if match is None:
        return collapsed

    raw_amount, raw_unit = match.groups()
    unit_info = _UNIT_ALIASES.get(raw_unit.lower())
    if unit_info is None:
        return collapsed

    canonical_unit, multiplier = unit_info
    amount = float(raw_amount.replace(",", ".")) * multiplier
    # drop a trailing ".0" so "1000.0ml" reads as "1000ml"
    amount_str = f"{amount:g}"
    return f"{amount_str}{canonical_unit}"


def presentations_match(a: str | None, b: str | None) -> bool:
    normalized_a = normalize_presentation(a)
    normalized_b = normalize_presentation(b)
    return normalized_a is not None and normalized_a == normalized_b
