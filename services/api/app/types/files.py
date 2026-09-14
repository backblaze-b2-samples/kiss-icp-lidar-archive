from datetime import datetime

from pydantic import BaseModel


class FileMetadata(BaseModel):
    key: str
    filename: str
    folder: str
    size_bytes: int
    size_human: str
    content_type: str
    uploaded_at: datetime
    url: str | None = None


class FileMetadataDetail(BaseModel):
    """Format-agnostic object detail recomputed on demand for the File Explorer.

    Point-cloud archives don't need EXIF/PDF/media extraction, so the detail is
    just the exact size, checksums, and extension for any stored object.
    """

    filename: str
    size_bytes: int
    size_human: str
    mime_type: str
    extension: str
    md5: str
    sha256: str
    uploaded_at: datetime
