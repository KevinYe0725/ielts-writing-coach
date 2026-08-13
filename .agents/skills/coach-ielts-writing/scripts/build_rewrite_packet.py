#!/usr/bin/env python3
"""Build a minimal rewrite packet and reject likely answer leakage."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections.abc import Iterable
from pathlib import Path

from _common import (
    CoachStateError,
    atomic_write_text,
    read_json,
    require_uuid7,
    state_root,
)

PROTECTED_NAMES = (
    "attempt-v1.md",
    "assessment.json",
    "feedback.md",
    "lesson-plan.json",
    "responses.jsonl",
)


def _tokens(text: str) -> list[str]:
    return re.findall(r"[a-z]+(?:['’-][a-z]+)?", text.casefold())


def _ngrams(tokens: list[str], size: int) -> set[tuple[str, ...]]:
    if len(tokens) < size:
        return set()
    return {
        tuple(tokens[index : index + size]) for index in range(len(tokens) - size + 1)
    }


def detect_leaks(
    candidate: str,
    protected_texts: Iterable[str],
    *,
    allowed_question: str,
    ngram_size: int = 6,
) -> list[str]:
    candidate_ngrams = _ngrams(_tokens(candidate), ngram_size)
    allowed_ngrams = _ngrams(_tokens(allowed_question), ngram_size)
    suspicious: set[tuple[str, ...]] = set()
    for protected in protected_texts:
        overlaps = candidate_ngrams & _ngrams(_tokens(protected), ngram_size)
        suspicious.update(overlaps - allowed_ngrams)
    return [" ".join(words) for words in sorted(suspicious)]


def build_packet(workspace: str | Path, cycle_id: str) -> tuple[str, list[str]]:
    require_uuid7(cycle_id, "cycle_id")
    cycle_root = state_root(workspace) / "cycles" / cycle_id
    question = (cycle_root / "question.md").read_text(encoding="utf-8").strip()
    cycle = read_json(cycle_root / "cycle.json")
    targets = cycle.get("abstract_targets", [])
    if not isinstance(targets, list) or len(targets) > 3:
        raise CoachStateError(
            "cycle.json abstract_targets must be an array with at most three entries"
        )

    lines = [
        "# IELTS Writing Task 2 — Delayed rewrite",
        "",
        "## Question",
        "",
        question,
        "",
        "## Abstract checkpoints",
        "",
    ]
    if not targets:
        lines.append(
            "- Re-check task coverage, paragraph development, and language accuracy independently."
        )
    for target in targets:
        if not isinstance(target, dict):
            raise CoachStateError("Every abstract target must be an object")
        label = str(target.get("label", "")).strip()
        check = str(target.get("check", "")).strip()
        if not label or not check:
            raise CoachStateError("Every abstract target requires label and check")
        lines.append(f"- **{label}:** {check}")
    lines.extend(
        [
            "",
            "Write a fresh response without opening Version 1, detailed feedback, lesson answers, or a model essay.",
            "Record any assistance you use so that the comparison remains honest.",
            "",
        ]
    )
    packet = "\n".join(lines)

    protected_texts: list[str] = []
    for name in PROTECTED_NAMES:
        path = cycle_root / name
        if path.exists():
            protected_texts.append(path.read_text(encoding="utf-8"))
    leaks = detect_leaks(packet, protected_texts, allowed_question=question)
    return packet, leaks


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", required=True)
    parser.add_argument("--cycle-id", required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--check-only", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        packet, leaks = build_packet(args.workspace, args.cycle_id)
        if leaks:
            raise CoachStateError(
                "Rewrite packet may contain protected answer language: "
                + "; ".join(leaks[:3])
            )
        destination = args.output or (
            state_root(args.workspace) / "cycles" / args.cycle_id / "rewrite-packet.md"
        )
        if not args.check_only:
            if (
                destination.exists()
                and destination.read_text(encoding="utf-8") != packet
            ):
                raise CoachStateError(
                    f"Refusing to overwrite a different rewrite packet: {destination}"
                )
            if not destination.exists():
                atomic_write_text(destination, packet)
        result = {"ok": True, "output": str(destination), "leak_count": 0}
    except (CoachStateError, OSError, ValueError) as exc:
        print(
            json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False),
            file=sys.stderr,
        )
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
