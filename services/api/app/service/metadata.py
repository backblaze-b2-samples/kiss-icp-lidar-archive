"""Generic object detail: checksums, size, and extension.

The starter kit shipped image (Pillow) and PDF (PyPDF2) extractors here. A LiDAR
point-cloud archive has no use for EXIF/PDF parsing, so those extractors — and
their dependencies — were trimmed. What remains is the format-agnostic detail the
File Explorer's detail panel needs for any object: exact byte size, MD5 + SHA-256
checksums, and the file extension.
"""

import hashlib
import logging
from datetime import UTC, datetime

from app.types import FileMetadataDetail
from app.types.formatting import humanize_bytes

logger = logging.getLogger(__name__)


def extract_metadata(
    file_data: bytes,
    filename: str,
    content_type: str,
    uploaded_at: datetime | None = None,
) -> FileMetadataDetail:
    """Compute format-agnostic detail from raw object bytes.

    `uploaded_at` is the object's real upload time; callers recomputing detail
    for an already-stored object MUST pass it (from head_object's LastModified)
    so the panel shows the true upload time rather than the recompute time. It
    defaults to now only for the fresh-upload path, where the two coincide.
    """
    md5 = hashlib.md5(file_data, usedforsecurity=False).hexdigest()
    sha256 = hashlib.sha256(file_data).hexdigest()
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    return FileMetadataDetail(
        filename=filename,
        size_bytes=len(file_data),
        size_human=humanize_bytes(len(file_data)),
        mime_type=content_type,
        extension=extension,
        md5=md5,
        sha256=sha256,
        uploaded_at=uploaded_at if uploaded_at is not None else datetime.now(UTC),
    )
