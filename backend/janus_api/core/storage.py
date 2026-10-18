import warnings
from io import BytesIO

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from PIL import Image, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

from janus_api.core.config import get_settings
from janus_api.core.errors import ApiError
from janus_api.core.security import random_token

MAX_AVATAR_BYTES = 2 * 1024 * 1024


def normalize_image(data: bytes) -> bytes:
    if not data or len(data) > MAX_AVATAR_BYTES:
        raise ApiError("invalid_avatar", "Upload an image no larger than 2 MB.", 413)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as image:
                if (
                    image.format not in {"JPEG", "PNG", "WEBP"}
                    or image.width * image.height > 16_000_000
                ):
                    raise ValueError
                image.load()
                clean = image.convert("RGB")
                clean.thumbnail((1024, 1024))
                output = BytesIO()
                clean.save(output, format="JPEG", quality=85)
                return output.getvalue()
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as error:
        raise ApiError("invalid_avatar", "Use a valid JPEG, PNG or WebP image.", 422) from error


async def upload_avatar(user_id: int, data: bytes) -> str:
    clean = await run_in_threadpool(normalize_image, data)
    settings = get_settings()
    if not settings.s3_bucket or not settings.s3_public_base_url:
        raise ApiError("storage_unavailable", "Avatar storage is not configured.", 503)
    key = f"avatars/{user_id}/{random_token()}.jpg"

    def upload() -> None:
        client = boto3.client(
            "s3",
            config=Config(connect_timeout=5, read_timeout=15, retries={"max_attempts": 2}),
            endpoint_url=settings.s3_endpoint_url,
            region_name=settings.s3_region,
            aws_access_key_id=settings.s3_access_key_id.get_secret_value() or None,
            aws_secret_access_key=settings.s3_secret_access_key.get_secret_value() or None,
        )
        client.put_object(Bucket=settings.s3_bucket, Key=key, Body=clean, ContentType="image/jpeg")

    try:
        await run_in_threadpool(upload)
    except (BotoCoreError, ClientError) as error:
        raise ApiError("storage_unavailable", "Avatar upload failed. Try again.", 503) from error
    return f"{settings.s3_public_base_url.rstrip('/')}/{key}"
