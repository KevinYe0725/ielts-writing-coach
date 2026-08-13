#!/usr/bin/env python3
"""Compute deterministic Version 1 / Version 2 comparison metrics."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

from _common import (
    SCHEMA_VERSION,
    CoachStateError,
    atomic_write_json,
    new_uuid7,
    utc_now_iso,
)

WORD_PATTERN = re.compile(r"[A-Za-z]+(?:['’-][A-Za-z]+)?")


def word_count(text: str) -> int:
    return len(WORD_PATTERN.findall(text))


def _normalise_counts(value: Any) -> dict[str, int]:
    if value is None:
        return {}
    if isinstance(value, dict) and "counts" in value:
        value = value["counts"]
    if not isinstance(value, dict):
        raise CoachStateError(
            "Issue counts must be an object or contain an object under 'counts'"
        )
    result: dict[str, int] = {}
    for key, raw_count in value.items():
        if (
            not isinstance(raw_count, int)
            or isinstance(raw_count, bool)
            or raw_count < 0
        ):
            raise CoachStateError(
                f"Issue count for {key} must be a non-negative integer"
            )
        result[str(key)] = raw_count
    return result


def _per_100(count: int, words: int) -> float | None:
    if words == 0:
        return None
    return round(count * 100.0 / words, 3)


def compare(
    version_1: str,
    version_2: str,
    *,
    version_1_issues: dict[str, int] | None = None,
    version_2_issues: dict[str, int] | None = None,
    v1_seconds: int | None = None,
    v2_seconds: int | None = None,
    v1_prompt_version: str | None = None,
    v2_prompt_version: str | None = None,
    v1_rubric_version: str | None = None,
    v2_rubric_version: str | None = None,
    v1_model: str | None = None,
    v2_model: str | None = None,
) -> dict[str, Any]:
    for label, seconds in (("v1_seconds", v1_seconds), ("v2_seconds", v2_seconds)):
        if seconds is not None and (
            not isinstance(seconds, int) or isinstance(seconds, bool) or seconds < 0
        ):
            raise CoachStateError(f"{label} must be a non-negative integer")
    words_1 = word_count(version_1)
    words_2 = word_count(version_2)
    counts_1 = _normalise_counts(version_1_issues)
    counts_2 = _normalise_counts(version_2_issues)
    issue_ids = sorted(set(counts_1) | set(counts_2))

    versioning_complete = all(
        value is not None
        for value in (
            v1_prompt_version,
            v2_prompt_version,
            v1_rubric_version,
            v2_rubric_version,
        )
    )
    rubric_comparable = (
        versioning_complete
        and v1_prompt_version == v2_prompt_version
        and v1_rubric_version == v2_rubric_version
    )
    if not versioning_complete:
        comparability = "unknown_versions"
    elif not rubric_comparable:
        comparability = "not_directly_comparable"
    elif v1_model is None or v2_model is None:
        comparability = "rubric_comparable_model_unknown"
    elif v1_model != v2_model:
        comparability = "rubric_comparable_model_changed"
    else:
        comparability = "directly_comparable"

    issues: dict[str, Any] = {}
    for issue_id in issue_ids:
        count_1 = counts_1.get(issue_id, 0)
        count_2 = counts_2.get(issue_id, 0)
        rate_1 = _per_100(count_1, words_1)
        rate_2 = _per_100(count_2, words_2)
        issues[issue_id] = {
            "v1_count": count_1,
            "v2_count": count_2,
            "v1_per_100_words": rate_1,
            "v2_per_100_words": rate_2,
            "per_100_word_change": None
            if rate_1 is None or rate_2 is None
            else round(rate_2 - rate_1, 3),
            "recurred": count_2 > 0,
        }

    return {
        "schema_version": SCHEMA_VERSION,
        "id": new_uuid7(),
        "created_at": utc_now_iso(),
        "comparability": comparability,
        "version_1": {"word_count": words_1, "elapsed_seconds": v1_seconds},
        "version_2": {"word_count": words_2, "elapsed_seconds": v2_seconds},
        "word_count_change": words_2 - words_1,
        "elapsed_seconds_change": None
        if v1_seconds is None or v2_seconds is None
        else v2_seconds - v1_seconds,
        "issue_metrics": issues,
        "evaluator_versions": {
            "v1": {
                "prompt": v1_prompt_version,
                "rubric": v1_rubric_version,
                "model": v1_model,
            },
            "v2": {
                "prompt": v2_prompt_version,
                "rubric": v2_rubric_version,
                "model": v2_model,
            },
        },
    }


def _optional_json(path: Path | None) -> dict[str, int] | None:
    if path is None:
        return None
    return _normalise_counts(json.loads(path.read_text(encoding="utf-8")))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version-1", type=Path, required=True)
    parser.add_argument("--version-2", type=Path, required=True)
    parser.add_argument("--v1-issues", type=Path)
    parser.add_argument("--v2-issues", type=Path)
    parser.add_argument("--v1-seconds", type=int)
    parser.add_argument("--v2-seconds", type=int)
    parser.add_argument("--v1-prompt-version")
    parser.add_argument("--v2-prompt-version")
    parser.add_argument("--v1-rubric-version")
    parser.add_argument("--v2-rubric-version")
    parser.add_argument("--v1-model")
    parser.add_argument("--v2-model")
    parser.add_argument("--output", type=Path)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        result = compare(
            args.version_1.read_text(encoding="utf-8"),
            args.version_2.read_text(encoding="utf-8"),
            version_1_issues=_optional_json(args.v1_issues),
            version_2_issues=_optional_json(args.v2_issues),
            v1_seconds=args.v1_seconds,
            v2_seconds=args.v2_seconds,
            v1_prompt_version=args.v1_prompt_version,
            v2_prompt_version=args.v2_prompt_version,
            v1_rubric_version=args.v1_rubric_version,
            v2_rubric_version=args.v2_rubric_version,
            v1_model=args.v1_model,
            v2_model=args.v2_model,
        )
        if args.output:
            atomic_write_json(args.output, result)
    except (CoachStateError, OSError, ValueError, json.JSONDecodeError) as exc:
        print(
            json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False),
            file=sys.stderr,
        )
        return 1
    print(
        json.dumps(
            {"ok": True, "result": result}, ensure_ascii=False, indent=2, sort_keys=True
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
