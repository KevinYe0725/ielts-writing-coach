#!/usr/bin/env python3
"""Shared standard-library helpers for the IELTS Writing Coach skill."""

from __future__ import annotations

import contextlib
import hashlib
import json
import math
import os
import re
import tempfile
import time
import uuid
from collections.abc import Iterator
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

SCHEMA_VERSION = "1.0.0"
EXCHANGE_VERSION = "1.0.0"

SUPPORTED_SKILL_IDS = frozenset(
    {
        "complete_comparison",
        "verb_form_trigger",
        "sentence_boundary",
        "subject_verb_agreement",
        "article_control",
        "collocation_perspective",
        "word_form_precision",
        "task_instruction_coverage",
        "mechanism_chain",
        "development_relevance",
        "weighing_qualification",
        "paragraph_function_order",
        "reference_linking",
    }
)

CYCLE_STATES = (
    "QUESTION_READY",
    "ATTEMPT_1_ACTIVE",
    "SUBMITTED",
    "ANALYZING",
    "FEEDBACK_READY",
    "LESSON_GENERATING",
    "LESSON_READY",
    "LESSON_ACTIVE",
    "LESSON_RESOLVED",
    "REWRITE_LOCKED",
    "REWRITE_READY",
    "ATTEMPT_2_ACTIVE",
    "COMPARING",
    "CORE_CYCLE_COMPLETED",
)

ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
    "QUESTION_READY": frozenset({"ATTEMPT_1_ACTIVE"}),
    "ATTEMPT_1_ACTIVE": frozenset({"SUBMITTED"}),
    "SUBMITTED": frozenset({"ANALYZING"}),
    "ANALYZING": frozenset({"FEEDBACK_READY"}),
    "FEEDBACK_READY": frozenset({"LESSON_GENERATING"}),
    "LESSON_GENERATING": frozenset({"LESSON_READY"}),
    "LESSON_READY": frozenset({"LESSON_ACTIVE"}),
    "LESSON_ACTIVE": frozenset({"LESSON_RESOLVED"}),
    "LESSON_RESOLVED": frozenset({"REWRITE_LOCKED"}),
    "REWRITE_LOCKED": frozenset({"REWRITE_READY"}),
    "REWRITE_READY": frozenset({"ATTEMPT_2_ACTIVE"}),
    "ATTEMPT_2_ACTIVE": frozenset({"COMPARING"}),
    "COMPARING": frozenset({"CORE_CYCLE_COMPLETED"}),
    "CORE_CYCLE_COMPLETED": frozenset(),
}

SECRET_KEY_FRAGMENTS = (
    "api_key",
    "apikey",
    "authorization",
    "access_token",
    "refresh_token",
    "password",
    "provider_secret",
    "client_secret",
    "secret",
)


class CoachStateError(RuntimeError):
    """Base error for deterministic skill state operations."""


class RevisionConflict(CoachStateError):
    """Raised when optimistic concurrency detects a stale writer."""


class LockTimeout(CoachStateError):
    """Raised when a state file remains locked beyond the timeout."""


def utc_now_iso() -> str:
    return format_utc_iso(datetime.now(timezone.utc))


def format_utc_iso(value: datetime) -> str:
    if value.tzinfo is None:
        raise ValueError("Timestamp must include a timezone")
    utc_value = value.astimezone(timezone.utc)
    if utc_value.microsecond:
        return utc_value.isoformat(timespec="milliseconds").replace("+00:00", "Z")
    return utc_value.isoformat(timespec="seconds").replace("+00:00", "Z")


def normalize_iso(value: str) -> str:
    # Preserve already-canonical Web timestamps, including the meaningful
    # `.000Z` representation emitted by Date.toISOString().
    if re.fullmatch(
        r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{3})?Z",
        value,
    ):
        parse_iso(value)
        return value
    return format_utc_iso(parse_iso(value))


def new_uuid7(*, timestamp_ms: int | None = None) -> str:
    """Create an RFC 9562 UUIDv7 using Python 3.11 and cryptographic randomness."""

    unix_ms = int(time.time_ns() // 1_000_000) if timestamp_ms is None else timestamp_ms
    if not 0 <= unix_ms < 1 << 48:
        raise CoachStateError("UUIDv7 timestamp must fit in 48 bits")
    random_bits = int.from_bytes(os.urandom(10), "big")
    random_a = (random_bits >> 68) & 0xFFF
    random_b = random_bits & ((1 << 62) - 1)
    encoded = (unix_ms << 80) | (0x7 << 76) | (random_a << 64) | (0b10 << 62) | random_b
    return str(uuid.UUID(int=encoded))


def require_uuid7(value: Any, field: str = "ID") -> str:
    if not isinstance(value, str) or not value:
        raise CoachStateError(f"{field} must be a UUIDv7 string")
    try:
        parsed = uuid.UUID(value)
    except (ValueError, AttributeError) as exc:
        raise CoachStateError(f"{field} must be a valid UUIDv7") from exc
    if (
        parsed.version != 7
        or parsed.variant != uuid.RFC_4122
        or str(parsed) != value.lower()
    ):
        raise CoachStateError(f"{field} must be a canonical lowercase UUIDv7")
    return value


def parse_iso(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError(f"Timestamp must include a timezone: {value}")
    return parsed


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_payload(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def _jcs_number(value: float) -> str:
    """Serialize the finite JSON-number subset used by the contracts as ECMAScript does."""

    if isinstance(value, int):
        return str(value)
    if not math.isfinite(value):
        raise CoachStateError("JCS does not permit NaN or infinite numbers")
    if value == 0:
        return "0"
    magnitude = abs(value)
    decimal = Decimal(repr(value))
    if 1e-6 <= magnitude < 1e21:
        rendered = format(decimal, "f")
        if "." in rendered:
            rendered = rendered.rstrip("0").rstrip(".")
        return rendered
    rendered = format(decimal.normalize(), "e")
    coefficient, exponent = rendered.split("e", 1)
    coefficient = coefficient.rstrip("0").rstrip(".")
    exponent_value = int(exponent)
    sign = "+" if exponent_value >= 0 else ""
    return f"{coefficient}e{sign}{exponent_value}"


def jcs_canonical_json(value: Any) -> str:
    """Return RFC 8785-style canonical JSON using only the Python 3.11 stdlib.

    Contract values use finite IEEE-754-sized numbers and valid Unicode. Object
    keys are ordered as UTF-16 code units, matching ECMAScript/JCS ordering.
    """

    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, (int, float)):
        return _jcs_number(value)
    if isinstance(value, str):
        try:
            value.encode("utf-8")
        except UnicodeEncodeError as exc:
            raise CoachStateError(
                "JCS does not permit unpaired Unicode surrogates"
            ) from exc
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(jcs_canonical_json(item) for item in value) + "]"
    if isinstance(value, dict):
        if not all(isinstance(key, str) for key in value):
            raise CoachStateError("JCS object keys must be strings")
        ordered = sorted(value, key=lambda key: key.encode("utf-16-be"))
        return (
            "{"
            + ",".join(
                f"{jcs_canonical_json(key)}:{jcs_canonical_json(value[key])}"
                for key in ordered
            )
            + "}"
        )
    raise CoachStateError(f"Unsupported JCS value type: {type(value).__name__}")


def sha256_jcs(value: Any) -> str:
    return hashlib.sha256(jcs_canonical_json(value).encode("utf-8")).hexdigest()


def state_root(workspace: str | Path) -> Path:
    root = Path(workspace).expanduser().resolve()
    if root == Path(root.anchor):
        raise CoachStateError(
            "The filesystem root cannot be used as a learning workspace"
        )
    return root / ".coach-ielts-writing"


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise CoachStateError(f"Required state file does not exist: {path}") from exc
    except json.JSONDecodeError as exc:
        raise CoachStateError(f"Invalid JSON in {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise CoachStateError(f"Expected a JSON object in {path}")
    return value


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    records: list[dict[str, Any]] = []
    for line_number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        if not line.strip():
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError as exc:
            raise CoachStateError(
                f"Invalid JSONL in {path} at line {line_number}: {exc}"
            ) from exc
        if not isinstance(record, dict):
            raise CoachStateError(f"Expected an object in {path} at line {line_number}")
        records.append(record)
    return records


@contextlib.contextmanager
def file_lock(path: Path, timeout_seconds: float = 5.0) -> Iterator[None]:
    lock_path = path.with_name(f"{path.name}.lock")
    deadline = time.monotonic() + timeout_seconds
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    descriptor: int | None = None
    while descriptor is None:
        try:
            descriptor = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.write(descriptor, str(os.getpid()).encode("ascii"))
        except FileExistsError:
            if time.monotonic() >= deadline:
                raise LockTimeout(f"Timed out waiting for state lock: {lock_path}")
            time.sleep(0.05)
    try:
        yield
    finally:
        if descriptor is not None:
            os.close(descriptor)
        with contextlib.suppress(FileNotFoundError):
            lock_path.unlink()


def _atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        directory_descriptor = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
    finally:
        with contextlib.suppress(FileNotFoundError):
            temporary.unlink()


def atomic_write_text(path: Path, content: str) -> None:
    with file_lock(path):
        _atomic_write(path, content)


def atomic_write_json(path: Path, value: dict[str, Any]) -> None:
    with file_lock(path):
        _atomic_write(
            path, json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
        )


def create_revisioned_json(path: Path, value: dict[str, Any]) -> dict[str, Any]:
    with file_lock(path):
        if path.exists():
            raise CoachStateError(f"State file already exists: {path}")
        timestamp = utc_now_iso()
        document = dict(value)
        document.setdefault("schema_version", SCHEMA_VERSION)
        document["revision"] = 1
        document.setdefault("created_at", timestamp)
        document["updated_at"] = timestamp
        _atomic_write(
            path,
            json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        )
        return document


def update_revisioned_json(
    path: Path,
    updates: dict[str, Any],
    *,
    expected_revision: int | None = None,
) -> dict[str, Any]:
    with file_lock(path):
        current = read_json(path)
        current_revision = current.get("revision")
        if not isinstance(current_revision, int) or current_revision < 1:
            raise CoachStateError(f"Missing or invalid revision in {path}")
        if expected_revision is not None and current_revision != expected_revision:
            raise RevisionConflict(
                f"Expected revision {expected_revision}, found {current_revision} in {path}"
            )
        document = dict(current)
        document.update(updates)
        document["revision"] = current_revision + 1
        document["updated_at"] = utc_now_iso()
        _atomic_write(
            path,
            json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        )
        return document


def update_exchange_metadata_json(
    path: Path,
    updates: dict[str, Any],
    *,
    expected_revision: int,
) -> dict[str, Any]:
    """Persist transport metadata without manufacturing a learning mutation."""

    with file_lock(path):
        current = read_json(path)
        if current.get("revision") != expected_revision:
            raise RevisionConflict(
                f"Expected revision {expected_revision}, found {current.get('revision')} in {path}"
            )
        forbidden = {"revision", "created_at", "updated_at", "schema_version"}
        if forbidden.intersection(updates):
            raise CoachStateError("Exchange metadata cannot replace learning revision fields")
        document = dict(current)
        document.update(updates)
        _atomic_write(
            path,
            json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        )
        return document


def append_jsonl(path: Path, record: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    line = canonical_json(record) + "\n"
    with file_lock(path):
        existing = path.read_text(encoding="utf-8") if path.exists() else ""
        if existing and not existing.endswith("\n"):
            existing += "\n"
        _atomic_write(path, existing + line)


def find_secret_paths(value: Any, prefix: str = "$") -> list[str]:
    findings: list[str] = []
    if isinstance(value, dict):
        for raw_key, child in value.items():
            key = str(raw_key)
            lowered = key.casefold()
            child_path = f"{prefix}.{key}"
            if any(fragment in lowered for fragment in SECRET_KEY_FRAGMENTS):
                findings.append(child_path)
            findings.extend(find_secret_paths(child, child_path))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            findings.extend(find_secret_paths(child, f"{prefix}[{index}]"))
    return findings
