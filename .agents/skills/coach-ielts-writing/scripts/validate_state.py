#!/usr/bin/env python3
"""Validate local IELTS Writing Coach state without modifying it."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

from _common import (
    CYCLE_STATES,
    EXCHANGE_VERSION,
    SCHEMA_VERSION,
    SUPPORTED_SKILL_IDS,
    CoachStateError,
    parse_iso,
    read_json,
    read_jsonl,
    require_uuid7,
    state_root,
)

ASSISTANCE_VALUES = frozenset(
    {
        "independent",
        "abstract_target_seen",
        "hinted",
        "answer_seen",
        "external_assistance",
        "interrupted",
    }
)

LESSON_STATUSES = frozenset(
    {
        "PLANNING",
        "READY",
        "ACTIVE",
        "CORE_COMPLETED",
        "TIMEBOX_EXPIRED",
        "USER_SKIPPED",
        "ABANDONED",
    }
)
REWRITE_STATUSES = frozenset(
    {
        "PLANNED",
        "LOCKED",
        "READY",
        "ACTIVE",
        "COMPLETED",
        "SKIPPED_PREREQUISITE",
        "RESCHEDULED",
    }
)
TRANSFER_STATUSES = frozenset(
    {"PLANNED", "READY", "COMPLETED", "NO_OPPORTUNITY", "RESCHEDULED"}
)
EVIDENCE_KINDS = frozenset(
    {
        "DIAGNOSED_ISSUE",
        "RECOGNITION",
        "CONTROLLED_REPAIR",
        "INDEPENDENT_GENERATION",
        "NEAR_TRANSFER",
        "INTEGRATED_APPLICATION",
        "EXIT_TEST",
        "DELAYED_REWRITE",
        "CROSS_TOPIC_TRANSFER",
        "RECURRENCE",
        "REVIEW",
    }
)
EVIDENCE_OUTCOMES = frozenset({"PASS", "FAIL", "NO_OPPORTUNITY"})
HINT_LEVELS = frozenset(
    {"NONE", "KEYWORD", "PARTIAL_FRAME", "FULL_FRAME", "ANSWER_SHOWN"}
)
ADJUDICATION_STATUSES = frozenset({"ACCEPTED", "DISPUTED", "SUPERSEDED", "PENDING"})
SOURCE_ENTITY_TYPES = frozenset({"ESSAY", "EXERCISE", "REWRITE", "TRANSFER"})


def _validate_revisioned(
    document: dict[str, Any], name: str, errors: list[str]
) -> None:
    if document.get("schema_version") != SCHEMA_VERSION:
        errors.append(
            f"{name}: unsupported schema_version {document.get('schema_version')!r}"
        )
    if (
        not isinstance(document.get("revision"), int)
        or int(document.get("revision", 0)) < 1
    ):
        errors.append(f"{name}: revision must be a positive integer")
    for field in ("created_at", "updated_at"):
        try:
            parse_iso(str(document.get(field, "")))
        except ValueError:
            errors.append(f"{name}: {field} must be a timezone-aware ISO timestamp")


def _validate_uuid(value: Any, field: str, errors: list[str]) -> None:
    try:
        require_uuid7(value, field)
    except CoachStateError as exc:
        errors.append(str(exc))


def validate_workspace(workspace: str | Path) -> list[str]:
    root = state_root(workspace)
    errors: list[str] = []
    required = (
        "manifest.json",
        "profile.json",
        "queue.json",
        "ability-profile.json",
        "evidence.jsonl",
        "cycles",
    )
    for name in required:
        if not (root / name).exists():
            errors.append(f"missing required state path: {name}")
    if errors:
        return errors

    documents: dict[str, dict[str, Any]] = {}
    for name in ("manifest.json", "profile.json", "queue.json", "ability-profile.json"):
        try:
            document = read_json(root / name)
            documents[name] = document
            _validate_revisioned(document, name, errors)
        except CoachStateError as exc:
            errors.append(str(exc))
    manifest = documents.get("manifest.json", {})
    if manifest.get("exchange_version") != EXCHANGE_VERSION:
        errors.append("manifest.json: unsupported exchange_version")

    queue = documents.get("queue.json", {})
    tasks = queue.get("tasks")
    if not isinstance(tasks, list):
        errors.append("queue.json: tasks must be an array")
        tasks = []
    task_ids: set[str] = set()
    for index, task in enumerate(tasks):
        if not isinstance(task, dict):
            errors.append(f"queue.json: task {index} must be an object")
            continue
        task_id = task.get("task_id")
        if not isinstance(task_id, str) or not task_id:
            errors.append(f"queue.json: task {index} has no task_id")
        elif task_id in task_ids:
            errors.append(f"queue.json: duplicate task_id {task_id}")
        else:
            task_ids.add(task_id)
            _validate_uuid(task_id, f"queue.json task {index} task_id", errors)
        _validate_uuid(
            task.get("cycle_id"), f"queue.json task {index} cycle_id", errors
        )
        for field in ("target_at", "due_at"):
            if task.get(field) is not None:
                try:
                    parse_iso(str(task[field]))
                except ValueError:
                    errors.append(f"queue.json: {task_id} has invalid {field}")

    cycles_root = root / "cycles"
    cycle_ids: set[str] = set()
    for cycle_root in sorted(path for path in cycles_root.iterdir() if path.is_dir()):
        cycle_id = cycle_root.name
        _validate_uuid(cycle_id, f"cycle directory {cycle_id}", errors)
        cycle_ids.add(cycle_id)
        cycle_path = cycle_root / "cycle.json"
        question_path = cycle_root / "question.md"
        if not cycle_path.exists() or not question_path.exists():
            errors.append(f"cycle {cycle_id}: cycle.json and question.md are required")
            continue
        try:
            cycle = read_json(cycle_path)
        except CoachStateError as exc:
            errors.append(str(exc))
            continue
        _validate_revisioned(cycle, f"cycle {cycle_id}", errors)
        if cycle.get("cycle_id") != cycle_id:
            errors.append(f"cycle {cycle_id}: cycle_id does not match directory")
        _validate_uuid(
            cycle.get("question_id"), f"cycle {cycle_id} question_id", errors
        )
        append_only = cycle.get("append_only_entity_ids")
        if not isinstance(append_only, list) or len(append_only) != len(
            set(append_only or [])
        ):
            errors.append(
                f"cycle {cycle_id}: append_only_entity_ids must be a unique array"
            )
        else:
            for entity_index, entity_id in enumerate(append_only):
                _validate_uuid(
                    entity_id,
                    f"cycle {cycle_id} append_only_entity_ids[{entity_index}]",
                    errors,
                )
        # Missing exchange-only fields are accepted for pre-v1 local state and
        # are materialized on the next export/import without changing learning revision.
        bundle_revision = cycle.get("bundle_revision", 1)
        bundle_parent = cycle.get("bundle_parent_revision")
        if (
            not isinstance(bundle_revision, int)
            or isinstance(bundle_revision, bool)
            or bundle_revision < 1
        ):
            errors.append(f"cycle {cycle_id}: bundle_revision must be positive")
        if bundle_parent is not None and (
            not isinstance(bundle_parent, int)
            or isinstance(bundle_parent, bool)
            or bundle_parent < 1
            or not isinstance(bundle_revision, int)
            or bundle_parent >= bundle_revision
        ):
            errors.append(f"cycle {cycle_id}: bundle_parent_revision is invalid")
        content_hash = cycle.get("bundle_content_hash")
        if content_hash is not None and (
            not isinstance(content_hash, str)
            or re.fullmatch(r"[a-f0-9]{64}", content_hash) is None
        ):
            errors.append(f"cycle {cycle_id}: bundle_content_hash is invalid")
        receipts = cycle.get("imported_bundle_checksums", {})
        if not isinstance(receipts, dict) or any(
            not isinstance(bundle_id, str)
            or not isinstance(checksum, str)
            or re.fullmatch(r"[a-f0-9]{64}", checksum) is None
            for bundle_id, checksum in (receipts.items() if isinstance(receipts, dict) else [])
        ):
            errors.append(
                f"cycle {cycle_id}: imported_bundle_checksums must map IDs to SHA-256 values"
            )
        state = cycle.get("state")
        if state not in CYCLE_STATES:
            errors.append(f"cycle {cycle_id}: unsupported state {state!r}")
        assistance = cycle.get("assistance")
        if assistance not in ASSISTANCE_VALUES:
            errors.append(f"cycle {cycle_id}: unsupported assistance {assistance!r}")
        if cycle.get("lesson_status") not in LESSON_STATUSES:
            errors.append(
                f"cycle {cycle_id}: unsupported lesson_status {cycle.get('lesson_status')!r}"
            )
        if cycle.get("rewrite_status") not in REWRITE_STATUSES:
            errors.append(
                f"cycle {cycle_id}: unsupported rewrite_status {cycle.get('rewrite_status')!r}"
            )
        transfer_statuses = cycle.get("transfer_statuses")
        if not isinstance(transfer_statuses, list) or any(
            item not in TRANSFER_STATUSES for item in transfer_statuses
        ):
            errors.append(
                f"cycle {cycle_id}: transfer_statuses contains an unsupported status"
            )
        rewrite_task = cycle.get("rewrite_task")
        if not isinstance(rewrite_task, dict) or rewrite_task.get(
            "status"
        ) != cycle.get("rewrite_status"):
            errors.append(
                f"cycle {cycle_id}: rewrite_task status must match rewrite_status"
            )
        elif rewrite_task:
            _validate_uuid(
                rewrite_task.get("id"), f"cycle {cycle_id} rewrite_task.id", errors
            )
        transfer_tasks = cycle.get("transfer_tasks")
        if (
            not isinstance(transfer_tasks, list)
            or [item.get("status") for item in transfer_tasks if isinstance(item, dict)]
            != transfer_statuses
            or any(not isinstance(item, dict) for item in (transfer_tasks or []))
        ):
            errors.append(
                f"cycle {cycle_id}: transfer task states must match transfer_statuses"
            )
        else:
            for task_index, task in enumerate(transfer_tasks):
                _validate_uuid(
                    task.get("id"),
                    f"cycle {cycle_id} transfer_tasks[{task_index}].id",
                    errors,
                )
                _validate_uuid(
                    task.get("objectiveId"),
                    f"cycle {cycle_id} transfer_tasks[{task_index}].objectiveId",
                    errors,
                )
        mixed_review = cycle.get("mixed_review_task")
        if not isinstance(mixed_review, dict) or not mixed_review.get("id"):
            errors.append(f"cycle {cycle_id}: mixed_review_task is required")
        else:
            _validate_uuid(
                mixed_review.get("id"), f"cycle {cycle_id} mixed_review_task.id", errors
            )
            if mixed_review.get("status") not in {
                "PLANNED",
                "READY",
                "COMPLETED",
                "RESCHEDULED",
            }:
                errors.append(
                    f"cycle {cycle_id}: mixed_review_task has an unsupported status"
                )
        lesson_status = cycle.get("lesson_status")
        rewrite_status = cycle.get("rewrite_status")
        active_block_id = cycle.get("active_block_id")
        active_item_id = cycle.get("active_item_id")
        lesson_elapsed = cycle.get("lesson_elapsed_seconds")
        if (
            not isinstance(lesson_elapsed, int)
            or isinstance(lesson_elapsed, bool)
            or not 0 <= lesson_elapsed <= 3600
        ):
            errors.append(
                f"cycle {cycle_id}: lesson_elapsed_seconds must be an integer from 0 to 3600"
            )
        if state == "LESSON_ACTIVE":
            _validate_uuid(active_block_id, f"cycle {cycle_id} active_block_id", errors)
            _validate_uuid(active_item_id, f"cycle {cycle_id} active_item_id", errors)
        elif active_block_id is not None or active_item_id is not None:
            errors.append(
                f"cycle {cycle_id}: lesson cursor must be empty outside LESSON_ACTIVE"
            )
        resolved_lessons = {
            "CORE_COMPLETED",
            "TIMEBOX_EXPIRED",
            "USER_SKIPPED",
            "ABANDONED",
        }
        if state == "LESSON_READY" and lesson_status != "READY":
            errors.append(
                f"cycle {cycle_id}: LESSON_READY requires lesson_status READY"
            )
        if state == "LESSON_ACTIVE" and lesson_status != "ACTIVE":
            errors.append(
                f"cycle {cycle_id}: LESSON_ACTIVE requires lesson_status ACTIVE"
            )
        if (
            state
            in {
                "LESSON_RESOLVED",
                "REWRITE_LOCKED",
                "REWRITE_READY",
                "ATTEMPT_2_ACTIVE",
                "COMPARING",
                "CORE_CYCLE_COMPLETED",
            }
            and lesson_status not in resolved_lessons
        ):
            errors.append(f"cycle {cycle_id}: cycle advanced past an unresolved lesson")
        if state == "REWRITE_LOCKED" and rewrite_status not in {
            "LOCKED",
            "RESCHEDULED",
            "SKIPPED_PREREQUISITE",
        }:
            errors.append(
                f"cycle {cycle_id}: REWRITE_LOCKED has inconsistent rewrite_status"
            )
        if state == "REWRITE_READY" and rewrite_status != "READY":
            errors.append(
                f"cycle {cycle_id}: REWRITE_READY requires rewrite_status READY"
            )
        if state == "ATTEMPT_2_ACTIVE" and rewrite_status not in {
            "ACTIVE",
            "SKIPPED_PREREQUISITE",
        }:
            errors.append(
                f"cycle {cycle_id}: ATTEMPT_2_ACTIVE requires an active rewrite"
            )
        if (
            state in {"COMPARING", "CORE_CYCLE_COMPLETED"}
            and rewrite_status != "COMPLETED"
        ):
            errors.append(f"cycle {cycle_id}: comparison requires a completed rewrite")
        targets = cycle.get("abstract_targets")
        if not isinstance(targets, list) or len(targets) > 3:
            errors.append(
                f"cycle {cycle_id}: abstract_targets must contain at most three items"
            )
        if (
            state
            in {
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
            }
            and not (cycle_root / "attempt-v1.md").exists()
        ):
            errors.append(f"cycle {cycle_id}: state {state} requires attempt-v1.md")
        if (
            state in {"COMPARING", "CORE_CYCLE_COMPLETED"}
            and not (cycle_root / "attempt-v2.md").exists()
        ):
            errors.append(f"cycle {cycle_id}: state {state} requires attempt-v2.md")
        for version in (1, 2):
            meta_path = cycle_root / f"attempt-v{version}.meta.json"
            text_path = cycle_root / f"attempt-v{version}.md"
            if text_path.exists() and not meta_path.exists():
                errors.append(
                    f"cycle {cycle_id}: attempt-v{version}.meta.json is required"
                )
            if meta_path.exists() and not text_path.exists():
                errors.append(f"cycle {cycle_id}: attempt-v{version}.md is required")
            elif meta_path.exists():
                try:
                    metadata = read_json(meta_path)
                    _validate_revisioned(
                        metadata,
                        f"cycle {cycle_id} attempt V{version} metadata",
                        errors,
                    )
                    _validate_uuid(
                        metadata.get("id"),
                        f"cycle {cycle_id} attempt V{version} id",
                        errors,
                    )
                except CoachStateError as exc:
                    errors.append(str(exc))
        plan_path = cycle_root / "lesson-plan.json"
        if plan_path.exists():
            try:
                import validate_lesson

                plan = read_json(plan_path)
                plan_errors = validate_lesson.validate(plan)
                errors.extend(
                    f"cycle {cycle_id} lesson plan: {error}" for error in plan_errors
                )
                if plan.get("trainingCycleId") != cycle_id:
                    errors.append(
                        f"cycle {cycle_id}: lesson plan references another cycle"
                    )
                if plan.get("status") != cycle.get("lesson_status"):
                    errors.append(
                        f"cycle {cycle_id}: lesson plan status must match lesson_status"
                    )
                item_ids = {
                    str(item["id"])
                    for block in plan.get("blocks", [])
                    if isinstance(block, dict)
                    for item in block.get("items", [])
                    if isinstance(item, dict) and item.get("id")
                }
                block_item_pairs = {
                    (str(block["id"]), str(item["id"]))
                    for block in plan.get("blocks", [])
                    if isinstance(block, dict) and block.get("id")
                    for item in block.get("items", [])
                    if isinstance(item, dict) and item.get("id")
                }
                if (
                    state == "LESSON_ACTIVE"
                    and (str(active_block_id), str(active_item_id))
                    not in block_item_pairs
                ):
                    errors.append(
                        f"cycle {cycle_id}: lesson cursor must reference an item in its active block"
                    )
                from coach_state import _validate_response_contract

                for response_index, response in enumerate(
                    read_jsonl(cycle_root / "responses.jsonl")
                ):
                    _validate_response_contract(
                        response,
                        item_ids,
                        f"cycle {cycle_id} responses[{response_index}]",
                    )
            except CoachStateError as exc:
                errors.append(str(exc))
        elif (cycle_root / "responses.jsonl").exists():
            errors.append(f"cycle {cycle_id}: responses require a lesson plan")

    active_cycle = manifest.get("active_cycle_id")
    if active_cycle is not None and str(active_cycle) not in cycle_ids:
        errors.append(
            "manifest.json: active_cycle_id does not reference an existing cycle"
        )
    if active_cycle is not None:
        _validate_uuid(active_cycle, "manifest.json active_cycle_id", errors)
    for task in tasks:
        if isinstance(task, dict) and str(task.get("cycle_id")) not in cycle_ids:
            errors.append(
                f"queue.json: task {task.get('task_id')} references a missing cycle"
            )

    try:
        evidence = read_jsonl(root / "evidence.jsonl")
    except CoachStateError as exc:
        errors.append(str(exc))
        evidence = []
    event_ids: set[str] = set()
    event_sources: set[tuple[str, str, str, str]] = set()
    for index, event in enumerate(evidence):
        event_id = event.get("id")
        if not isinstance(event_id, str) or not event_id:
            errors.append(f"evidence line {index + 1}: id is required")
        elif event_id in event_ids:
            errors.append(f"evidence line {index + 1}: duplicate id {event_id}")
        else:
            event_ids.add(event_id)
            _validate_uuid(event_id, f"evidence line {index + 1} id", errors)
        if event.get("schemaVersion") != SCHEMA_VERSION:
            errors.append(f"evidence line {index + 1}: unsupported schemaVersion")
        if event.get("skillId") not in SUPPORTED_SKILL_IDS:
            errors.append(f"evidence line {index + 1}: unsupported skillId")
        if not isinstance(event.get("userId"), str) or not event.get("userId"):
            errors.append(f"evidence line {index + 1}: userId is required")
        else:
            _validate_uuid(
                event.get("userId"), f"evidence line {index + 1} userId", errors
            )
        kind = event.get("kind")
        source_type = event.get("sourceEntityType")
        if kind not in EVIDENCE_KINDS:
            errors.append(f"evidence line {index + 1}: unsupported kind")
        if event.get("outcome") not in EVIDENCE_OUTCOMES:
            errors.append(f"evidence line {index + 1}: unsupported outcome")
        if event.get("hintLevel") not in HINT_LEVELS:
            errors.append(f"evidence line {index + 1}: unsupported hintLevel")
        if event.get("adjudicationStatus") not in ADJUDICATION_STATUSES:
            errors.append(f"evidence line {index + 1}: unsupported adjudicationStatus")
        if source_type not in SOURCE_ENTITY_TYPES:
            errors.append(f"evidence line {index + 1}: unsupported sourceEntityType")
        for field in ("independent", "firstAttempt", "validForStateTransition"):
            if not isinstance(event.get(field), bool):
                errors.append(f"evidence line {index + 1}: {field} must be boolean")
        confidence = event.get("confidence")
        if (
            not isinstance(confidence, (int, float))
            or isinstance(confidence, bool)
            or not 0 <= confidence <= 1
        ):
            errors.append(
                f"evidence line {index + 1}: confidence must be between 0 and 1"
            )
        for field in ("contextId", "topicId", "sourceEntityId"):
            if not isinstance(event.get(field), str) or not event.get(field):
                errors.append(f"evidence line {index + 1}: {field} is required")
        if event.get("sourceEntityId"):
            _validate_uuid(
                event.get("sourceEntityId"),
                f"evidence line {index + 1} sourceEntityId",
                errors,
            )
        if event.get("objectiveId") is not None:
            _validate_uuid(
                event.get("objectiveId"),
                f"evidence line {index + 1} objectiveId",
                errors,
            )
        source_key = (
            str(source_type),
            str(event.get("sourceEntityId")),
            str(event.get("skillId")),
            str(kind),
        )
        if source_key in event_sources:
            errors.append(f"evidence line {index + 1}: duplicate source evidence tuple")
        else:
            event_sources.add(source_key)
        if kind == "DELAYED_REWRITE" and source_type != "REWRITE":
            errors.append(
                f"evidence line {index + 1}: delayed rewrite evidence must come from REWRITE"
            )
        if kind == "CROSS_TOPIC_TRANSFER" and source_type != "TRANSFER":
            errors.append(
                f"evidence line {index + 1}: cross-topic evidence must come from TRANSFER"
            )
        if source_type == "EXERCISE" and kind in {
            "DELAYED_REWRITE",
            "CROSS_TOPIC_TRANSFER",
        }:
            errors.append(
                f"evidence line {index + 1}: lesson exercise cannot claim retained or transferred evidence"
            )
        if (
            event.get("outcome") == "NO_OPPORTUNITY"
            and event.get("validForStateTransition") is True
        ):
            errors.append(
                f"evidence line {index + 1}: no-opportunity evidence cannot change state"
            )
        if (
            event.get("assisted") is True
            and event.get("validForStateTransition") is True
        ):
            errors.append(
                f"evidence line {index + 1}: assisted evidence cannot change state"
            )
        try:
            parse_iso(str(event.get("occurredAt", "")))
        except ValueError:
            errors.append(f"evidence line {index + 1}: invalid occurredAt")
        if event.get("instructionExposureAt") is not None:
            try:
                parse_iso(str(event.get("instructionExposureAt")))
            except ValueError:
                errors.append(
                    f"evidence line {index + 1}: invalid instructionExposureAt"
                )
    return errors


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        errors = validate_workspace(args.workspace)
    except (CoachStateError, OSError, ValueError) as exc:
        errors = [str(exc)]
    result = {"ok": not errors, "errors": errors}
    stream = sys.stdout if not errors else sys.stderr
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True), file=stream)
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
