"""Presigned S3 upload URLs for product images.

The mobile app never receives AWS credentials: it asks this service for a short-lived presigned
PUT URL, uploads the image bytes directly to S3, then sends the resulting public `image_url` when
creating the product (see CreateProductRequest.image_url).
"""

import uuid
from dataclasses import dataclass

import boto3
from botocore.config import Config as BotoConfig

from app.core.config import Settings
from app.features.catalog.exceptions import ImageStorageNotConfigured

EXTENSION_BY_CONTENT_TYPE = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


@dataclass
class PresignedUpload:
    upload_url: str
    image_url: str


class ImageStorageService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def _require_configured(self) -> None:
        s = self._settings
        if not (s.aws_region and s.aws_s3_bucket and s.aws_access_key_id and s.aws_secret_access_key):
            raise ImageStorageNotConfigured(
                "AWS S3 is not configured yet -- set AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID "
                "and AWS_SECRET_ACCESS_KEY in backend/.env"
            )

    def create_presigned_upload(self, *, content_type: str) -> PresignedUpload:
        self._require_configured()
        s = self._settings

        client = boto3.client(
            "s3",
            region_name=s.aws_region,
            aws_access_key_id=s.aws_access_key_id,
            aws_secret_access_key=s.aws_secret_access_key,
            config=BotoConfig(signature_version="s3v4"),
        )
        key = f"products/{uuid.uuid4()}.{EXTENSION_BY_CONTENT_TYPE[content_type]}"
        upload_url = client.generate_presigned_url(
            "put_object",
            Params={"Bucket": s.aws_s3_bucket, "Key": key, "ContentType": content_type},
            ExpiresIn=s.s3_presigned_url_expire_seconds,
        )
        image_url = f"https://{s.aws_s3_bucket}.s3.{s.aws_region}.amazonaws.com/{key}"
        return PresignedUpload(upload_url=upload_url, image_url=image_url)
