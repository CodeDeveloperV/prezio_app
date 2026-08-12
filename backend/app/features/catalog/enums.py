import enum


class RecognitionType(str, enum.Enum):
    """How a Product's identity was established -- drives how much trust/review it needs."""

    MANUAL = "manual"
    BARCODE = "barcode"
    ALIAS = "alias"
    IMAGE = "image"


class BarcodeType(str, enum.Enum):
    EAN13 = "ean13"
    EAN8 = "ean8"
    UPC_A = "upc_a"
    UPC_E = "upc_e"
    INTERNAL_PLU = "internal_plu"
    STORE_SKU = "store_sku"
    OTHER = "other"


class BarcodeSource(str, enum.Enum):
    USER_SCAN = "user_scan"
    STORE_IMPORT = "store_import"
    ADMIN = "admin"
    SCRAPED = "scraped"
