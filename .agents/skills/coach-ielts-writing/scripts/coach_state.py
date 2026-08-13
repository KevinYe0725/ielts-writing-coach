#!/usr/bin/env python3
"""Manage local IELTS Writing Coach state and CycleBundle exchange."""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import re
import secrets
import shutil
import sys
import tempfile
import zipfile
from datetime import timedelta
from pathlib import Path
from typing import Any

from _common import (
    ALLOWED_TRANSITIONS,
    CYCLE_STATES,
    EXCHANGE_VERSION,
    SCHEMA_VERSION,
    SUPPORTED_SKILL_IDS,
    CoachStateError,
    append_jsonl,
    atomic_write_json,
    atomic_write_text,
    canonical_json,
    create_revisioned_json,
    file_lock,
    find_secret_paths,
    format_utc_iso,
    new_uuid7,
    normalize_iso,
    parse_iso,
    read_json,
    read_jsonl,
    require_uuid7,
    sha256_jcs,
    state_root,
    update_exchange_metadata_json,
    update_revisioned_json,
    utc_now_iso,
)

TERMINAL_STATES = frozenset({"CORE_CYCLE_COMPLETED"})

MAX_ARCHIVE_BYTES = 20 * 1024 * 1024
MAX_ARCHIVE_ENTRY_BYTES = 10 * 1024 * 1024
MAX_ARCHIVE_UNCOMPRESSED_BYTES = 50 * 1024 * 1024
MAX_ARCHIVE_ENTRIES = 50
ARCHIVE_BUNDLE_FILE = "cycle-bundle.json"
ARCHIVE_MANIFEST_FILE = "manifest.json"
ARCHIVE_REPORT_FILE = "report.md"


def _append_entity_ids(cycle: dict[str, Any], *entity_ids: str) -> list[str]:
    known = {
        require_uuid7(value, "append_only_entity_id")
        for value in cycle.get("append_only_entity_ids", [])
    }
    known.update(require_uuid7(value, "entity_id") for value in entity_ids)
    return sorted(known)


def initialise(workspace: str | Path, timezone_name: str) -> dict[str, Any]:
    root = state_root(workspace)
    root.mkdir(parents=True, exist_ok=True)
    (root / "cycles").mkdir(exist_ok=True)
    manifest_path = root / "manifest.json"
    if manifest_path.exists():
        return read_json(manifest_path)
    manifest = create_revisioned_json(
        manifest_path,
        {
            "exchange_version": EXCHANGE_VERSION,
            "timezone": timezone_name,
            "active_cycle_id": None,
        },
    )
    create_revisioned_json(
        root / "profile.json", {"feedback_language": "zh-CN", "target_band": None}
    )
    create_revisioned_json(root / "queue.json", {"tasks": []})
    create_revisioned_json(root / "ability-profile.json", {"skills": {}})
    atomic_write_text(root / "evidence.jsonl", "")
    return manifest


def create_cycle(
    workspace: str | Path,
    question_text: str,
    *,
    question_id: str | None = None,
    cycle_id: str | None = None,
    allow_parallel: bool = False,
) -> dict[str, Any]:
    root = state_root(workspace)
    manifest_path = root / "manifest.json"
    manifest = read_json(manifest_path)
    active_id = manifest.get("active_cycle_id")
    if active_id and not allow_parallel:
        active_path = root / "cycles" / str(active_id) / "cycle.json"
        if (
            active_path.exists()
            and read_json(active_path).get("state") not in TERMINAL_STATES
        ):
            raise CoachStateError(f"Active cycle {active_id} is not complete")
    clean_question = question_text.strip()
    if not clean_question:
        raise CoachStateError("Question text cannot be empty")
    selected_id = require_uuid7(cycle_id, "cycle_id") if cycle_id else new_uuid7()
    selected_question_id = (
        require_uuid7(question_id, "question_id") if question_id else new_uuid7()
    )
    rewrite_task_id = new_uuid7()
    mixed_review_id = new_uuid7()
    cycle_root = root / "cycles" / selected_id
    cycle_root.mkdir(parents=True, exist_ok=False)
    (cycle_root / "transfer").mkdir()
    created_at = utc_now_iso()
    target_rewrite_at = format_utc_iso(parse_iso(created_at) + timedelta(days=1))
    mixed_review_at = format_utc_iso(parse_iso(created_at) + timedelta(days=14))
    cycle = create_revisioned_json(
        cycle_root / "cycle.json",
        {
            "cycle_id": selected_id,
            "state": "QUESTION_READY",
            "question_id": selected_question_id,
            "abstract_targets": [],
            "assistance": "independent",
            "active_block_id": None,
            "active_item_id": None,
            "lesson_elapsed_seconds": 0,
            "lesson_status": "PLANNING",
            "rewrite_status": "PLANNED",
            "transfer_statuses": [],
            "rewrite_task": {
                "id": rewrite_task_id,
                "status": "PLANNED",
                "targetRewriteAt": target_rewrite_at,
                "dueAt": None,
                "lastInstructionExposureAt": None,
                "assisted": False,
                "prerequisiteSkipped": False,
            },
            "transfer_tasks": [],
            "mixed_review_task": {
                "id": mixed_review_id,
                "dueAt": mixed_review_at,
                "status": "PLANNED",
            },
            "conflicts": [],
            "source": "SKILL",
            "bundle_revision": 1,
            "bundle_parent_revision": None,
            "bundle_content_hash": None,
            "imported_bundle_checksums": {},
            "append_only_entity_ids": [
                selected_id,
                selected_question_id,
                rewrite_task_id,
                mixed_review_id,
            ],
        },
    )
    atomic_write_text(cycle_root / "question.md", clean_question + "\n")
    update_revisioned_json(
        manifest_path,
        {"active_cycle_id": selected_id},
        expected_revision=int(manifest["revision"]),
    )
    return cycle


def transition_cycle(
    workspace: str | Path,
    cycle_id: str,
    target_state: str,
    *,
    expected_revision: int | None = None,
) -> dict[str, Any]:
    require_uuid7(cycle_id, "cycle_id")
    cycle_path = state_root(workspace) / "cycles" / cycle_id / "cycle.json"
    current = read_json(cycle_path)
    current_state = str(current.get("state"))
    if target_state not in ALLOWED_TRANSITIONS.get(current_state, frozenset()):
        raise CoachStateError(
            f"Illegal cycle transition: {current_state} -> {target_state}"
        )
    updates: dict[str, Any] = {"state": target_state}
    if target_state == "CORE_CYCLE_COMPLETED":
        updates["core_completed_at"] = utc_now_iso()
    return update_revisioned_json(
        cycle_path, updates, expected_revision=expected_revision
    )


def update_task_status(
    workspace: str | Path,
    cycle_id: str,
    machine: str,
    target_status: str,
    *,
    index: int = 0,
    expected_revision: int | None = None,
) -> dict[str, Any]:
    require_uuid7(cycle_id, "cycle_id")
    tables: dict[str, tuple[str, dict[str, frozenset[str]]]] = {
        "lesson": (
            "lesson_status",
            {
                "PLANNING": frozenset(),
                "READY": frozenset({"ACTIVE"}),
                "ACTIVE": frozenset(
                    {"CORE_COMPLETED", "TIMEBOX_EXPIRED", "USER_SKIPPED", "ABANDONED"}
                ),
                "CORE_COMPLETED": frozenset(),
                "TIMEBOX_EXPIRED": frozenset(),
                "USER_SKIPPED": frozenset(),
                "ABANDONED": frozenset(),
            },
        ),
        "rewrite": (
            "rewrite_status",
            {
                "PLANNED": frozenset({"LOCKED", "SKIPPED_PREREQUISITE"}),
                "LOCKED": frozenset({"READY", "RESCHEDULED", "SKIPPED_PREREQUISITE"}),
                "READY": frozenset({"ACTIVE", "RESCHEDULED"}),
                "ACTIVE": frozenset({"COMPLETED"}),
                "COMPLETED": frozenset(),
                "SKIPPED_PREREQUISITE": frozenset({"READY"}),
                "RESCHEDULED": frozenset({"LOCKED", "READY", "SKIPPED_PREREQUISITE"}),
            },
        ),
        "transfer": (
            "transfer_statuses",
            {
                "PLANNED": frozenset({"READY", "RESCHEDULED"}),
                "READY": frozenset({"COMPLETED", "NO_OPPORTUNITY", "RESCHEDULED"}),
                "COMPLETED": frozenset(),
                "NO_OPPORTUNITY": frozenset({"RESCHEDULED"}),
                "RESCHEDULED": frozenset({"READY"}),
            },
        ),
        "mixed_review": (
            "mixed_review_task",
            {
                "PLANNED": frozenset({"READY", "RESCHEDULED"}),
                "READY": frozenset({"COMPLETED", "RESCHEDULED"}),
                "COMPLETED": frozenset(),
                "RESCHEDULED": frozenset({"READY"}),
            },
        ),
    }
    if machine not in tables:
        raise CoachStateError(
            "machine must be lesson, rewrite, transfer, or mixed_review"
        )
    field, transitions = tables[machine]
    cycle_path = state_root(workspace) / "cycles" / cycle_id / "cycle.json"
    cycle = read_json(cycle_path)
    if machine == "transfer":
        statuses = list(cycle.get(field, []))
        if index < 0 or index >= len(statuses):
            raise CoachStateError(f"transfer status index {index} is out of range")
        current = str(statuses[index])
        if target_status not in transitions.get(current, frozenset()):
            raise CoachStateError(
                f"Illegal {machine} transition: {current} -> {target_status}"
            )
        statuses[index] = target_status
        transfer_tasks = list(cycle.get("transfer_tasks", []))
        if index < len(transfer_tasks) and isinstance(transfer_tasks[index], dict):
            updated_task = dict(transfer_tasks[index])
            updated_task["status"] = target_status
            transfer_tasks[index] = updated_task
        updates: dict[str, Any] = {field: statuses, "transfer_tasks": transfer_tasks}
    else:
        current_value = cycle.get(field)
        current = str(
            current_value.get("status")
            if machine == "mixed_review" and isinstance(current_value, dict)
            else current_value
        )
        if target_status not in transitions.get(current, frozenset()):
            raise CoachStateError(
                f"Illegal {machine} transition: {current} -> {target_status}"
            )
        if machine == "mixed_review":
            mixed_review_task = (
                dict(current_value) if isinstance(current_value, dict) else {}
            )
            mixed_review_task["status"] = target_status
            updates = {field: mixed_review_task}
        else:
            updates = {field: target_status}
        if machine == "lesson":
            paired_states = {
                ("READY", "ACTIVE"): ("LESSON_READY", "LESSON_ACTIVE"),
                ("ACTIVE", "CORE_COMPLETED"): ("LESSON_ACTIVE", "LESSON_RESOLVED"),
                ("ACTIVE", "TIMEBOX_EXPIRED"): ("LESSON_ACTIVE", "LESSON_RESOLVED"),
                ("ACTIVE", "USER_SKIPPED"): ("LESSON_ACTIVE", "LESSON_RESOLVED"),
                ("ACTIVE", "ABANDONED"): ("LESSON_ACTIVE", "LESSON_RESOLVED"),
            }
            required_cycle_state, target_cycle_state = paired_states[
                (current, target_status)
            ]
            if cycle.get("state") != required_cycle_state:
                raise CoachStateError(
                    f"Lesson transition {current} -> {target_status} requires cycle state {required_cycle_state}"
                )
            updates["state"] = target_cycle_state
        if machine == "rewrite":
            rewrite_task = dict(cycle.get("rewrite_task", {}))
            rewrite_task["status"] = target_status
            updates["rewrite_task"] = rewrite_task
            paired_states = {
                ("LOCKED", "READY"): ("REWRITE_LOCKED", "REWRITE_READY"),
                ("RESCHEDULED", "READY"): ("REWRITE_LOCKED", "REWRITE_READY"),
                ("SKIPPED_PREREQUISITE", "READY"): ("REWRITE_LOCKED", "REWRITE_READY"),
                ("READY", "ACTIVE"): ("REWRITE_READY", "ATTEMPT_2_ACTIVE"),
                ("ACTIVE", "COMPLETED"): ("ATTEMPT_2_ACTIVE", "COMPARING"),
            }
            if (current, target_status) in paired_states:
                required_cycle_state, target_cycle_state = paired_states[
                    (current, target_status)
                ]
                if cycle.get("state") != required_cycle_state:
                    raise CoachStateError(
                        f"Rewrite transition {current} -> {target_status} requires cycle state {required_cycle_state}"
                    )
                updates["state"] = target_cycle_state
    lesson_plan_path: Path | None = None
    lesson_plan: dict[str, Any] | None = None
    if machine == "lesson":
        lesson_plan_path = cycle_path.with_name("lesson-plan.json")
        if not lesson_plan_path.exists():
            raise CoachStateError(
                "A saved lesson plan is required for lesson status transitions"
            )
        lesson_plan = read_json(lesson_plan_path)
        if target_status == "ACTIVE" and current == "READY":
            first_pair = next(
                (
                    (str(block["id"]), str(item["id"]))
                    for block in sorted(
                        lesson_plan.get("blocks", []),
                        key=lambda value: int(value.get("order", 0)),
                    )
                    if block.get("path") == "CORE" and block.get("kind") != "BREAK"
                    for item in block.get("items", [])
                    if not item.get("isReserve", False)
                ),
                None,
            )
            if first_pair is None:
                raise CoachStateError("Lesson plan has no required CORE item")
            updates["active_block_id"], updates["active_item_id"] = first_pair
        elif target_status in {
            "CORE_COMPLETED",
            "TIMEBOX_EXPIRED",
            "USER_SKIPPED",
            "ABANDONED",
        }:
            updates["active_block_id"] = None
            updates["active_item_id"] = None
    updated = update_revisioned_json(
        cycle_path, updates, expected_revision=expected_revision
    )
    if machine in {"rewrite", "transfer", "mixed_review"}:
        task = (
            updated.get("rewrite_task")
            if machine == "rewrite"
            else updated.get("mixed_review_task")
            if machine == "mixed_review"
            else updated.get("transfer_tasks", [])[index]
        )
        task_id = str(task.get("id")) if isinstance(task, dict) else ""
        queue_path = state_root(workspace) / "queue.json"
        queue = read_json(queue_path)
        queue_tasks = list(queue.get("tasks", []))
        changed = False
        for task_index, queued in enumerate(queue_tasks):
            if isinstance(queued, dict) and queued.get("task_id") == task_id:
                queued_update = dict(queued)
                queued_update["canonical_status"] = target_status
                queued_update["status"] = (
                    "DONE"
                    if target_status in {"COMPLETED", "NO_OPPORTUNITY"}
                    else "PENDING"
                )
                queue_tasks[task_index] = queued_update
                changed = True
        if changed:
            update_revisioned_json(
                queue_path,
                {"tasks": queue_tasks},
                expected_revision=int(queue["revision"]),
            )
    if lesson_plan_path is not None and lesson_plan is not None:
        lesson_plan["status"] = target_status
        atomic_write_json(lesson_plan_path, lesson_plan)
    return updated


def set_abstract_targets(
    workspace: str | Path,
    cycle_id: str,
    targets: list[dict[str, str]],
    *,
    expected_revision: int | None = None,
) -> dict[str, Any]:
    require_uuid7(cycle_id, "cycle_id")
    cleaned: list[dict[str, str]] = []
    for target in targets:
        label = str(target.get("label", "")).strip()
        check = str(target.get("check", "")).strip()
        if not label or not check:
            raise CoachStateError(
                "Every abstract target requires non-empty label and check fields"
            )
        cleaned.append({"label": label, "check": check})
    if len(cleaned) > 3:
        raise CoachStateError(
            "A rewrite packet may contain at most three abstract targets"
        )
    cycle_path = state_root(workspace) / "cycles" / cycle_id / "cycle.json"
    return update_revisioned_json(
        cycle_path,
        {"abstract_targets": cleaned},
        expected_revision=expected_revision,
    )


def save_attempt(
    workspace: str | Path,
    cycle_id: str,
    version: int,
    source: Path,
    *,
    started_at: str | None = None,
    submitted_at: str | None = None,
    assisted: bool = False,
    interrupted: bool = False,
    draft_before_self_check: Path | None = None,
    draft_after_self_check: Path | None = None,
) -> Path:
    require_uuid7(cycle_id, "cycle_id")
    if version not in {1, 2}:
        raise CoachStateError("Attempt version must be 1 or 2")
    content = source.read_text(encoding="utf-8")
    if not content.strip():
        raise CoachStateError("Attempt text cannot be empty")
    destination = state_root(workspace) / "cycles" / cycle_id / f"attempt-v{version}.md"
    metadata_path = destination.with_suffix(".meta.json")
    if destination.exists() or metadata_path.exists():
        raise CoachStateError(f"Attempt V{version} is locked and cannot be overwritten")
    submitted = normalize_iso(submitted_at or utc_now_iso())
    started = normalize_iso(started_at or submitted)
    cycle_path = state_root(workspace) / "cycles" / cycle_id / "cycle.json"
    cycle = read_json(cycle_path)
    required_state = "ATTEMPT_1_ACTIVE" if version == 1 else "ATTEMPT_2_ACTIVE"
    if cycle.get("state") != required_state:
        raise CoachStateError(
            f"Attempt V{version} can be saved only in {required_state}"
        )
    if parse_iso(started) > parse_iso(submitted):
        raise CoachStateError("Attempt startedAt cannot be after submittedAt")
    attempt_id = new_uuid7()
    metadata: dict[str, Any] = {
        "id": attempt_id,
        "version": f"V{version}",
        "startedAt": started,
        "submittedAt": submitted,
        "wordCount": len(re.findall(r"[A-Za-z]+(?:['’-][A-Za-z]+)?", content)),
        "assisted": assisted,
        "interrupted": interrupted,
    }
    for key, path in (
        ("draftBeforeSelfCheck", draft_before_self_check),
        ("draftAfterSelfCheck", draft_after_self_check),
    ):
        if path is not None:
            draft = path.read_text(encoding="utf-8")
            if not draft.strip():
                raise CoachStateError(f"{key} cannot be empty")
            metadata[key] = draft.rstrip()
    update_revisioned_json(
        cycle_path,
        {
            "append_only_entity_ids": _append_entity_ids(cycle, attempt_id),
            "assistance": (
                "external_assistance"
                if assisted
                else "interrupted"
                if interrupted
                else cycle.get("assistance", "independent")
            ),
        },
        expected_revision=int(cycle["revision"]),
    )
    create_revisioned_json(metadata_path, metadata)
    atomic_write_text(destination, content.rstrip() + "\n")
    return destination


def record_response(
    workspace: str | Path, cycle_id: str, response: dict[str, Any]
) -> None:
    require_uuid7(cycle_id, "cycle_id")
    required = {
        "schemaVersion",
        "id",
        "exerciseItemId",
        "firstAttemptId",
        "finalAttemptId",
        "attempts",
        "evaluations",
    }
    missing = sorted(required - response.keys())
    if missing:
        raise CoachStateError(f"Exercise response missing fields: {', '.join(missing)}")
    if not isinstance(response.get("attempts"), list) or not isinstance(
        response.get("evaluations"), list
    ):
        raise CoachStateError(
            "Exercise response attempts and evaluations must be arrays"
        )
    if response.get("schemaVersion") != SCHEMA_VERSION:
        raise CoachStateError("Exercise response uses an unsupported schemaVersion")
    if not response["attempts"]:
        raise CoachStateError("Exercise response requires at least one attempt")
    response_ids = [require_uuid7(response.get("id"), "response.id")]
    exercise_item_id = require_uuid7(
        response.get("exerciseItemId"), "response.exerciseItemId"
    )
    canonical_response = dict(response)
    canonical_attempts: list[dict[str, Any]] = []
    attempt_ids: set[str] = set()
    for index, attempt in enumerate(response["attempts"]):
        if not isinstance(attempt, dict):
            raise CoachStateError(f"response.attempts[{index}] must be an object")
        attempt_id = require_uuid7(attempt.get("id"), f"response.attempts[{index}].id")
        attempt_ids.add(attempt_id)
        response_ids.append(attempt_id)
        if not isinstance(attempt.get("answer"), str):
            raise CoachStateError(f"response.attempts[{index}].answer must be a string")
        if attempt.get("hintLevel") not in {
            "NONE",
            "KEYWORD",
            "PARTIAL_FRAME",
            "FULL_FRAME",
            "ANSWER_SHOWN",
        }:
            raise CoachStateError(
                f"response.attempts[{index}] has an unsupported hintLevel"
            )
        if not isinstance(attempt.get("referenceAnswerSeen"), bool):
            raise CoachStateError(
                f"response.attempts[{index}].referenceAnswerSeen must be boolean"
            )
        elapsed = attempt.get("elapsedSeconds")
        if not isinstance(elapsed, int) or isinstance(elapsed, bool) or elapsed < 0:
            raise CoachStateError(
                f"response.attempts[{index}].elapsedSeconds must be non-negative"
            )
        canonical_attempt = dict(attempt)
        canonical_attempt["submittedAt"] = normalize_iso(
            str(attempt.get("submittedAt", ""))
        )
        canonical_attempts.append(canonical_attempt)
    canonical_response["attempts"] = canonical_attempts
    canonical_evaluations: list[dict[str, Any]] = []
    evaluation_ids: set[str] = set()
    for index, evaluation in enumerate(response["evaluations"]):
        if not isinstance(evaluation, dict):
            raise CoachStateError(f"response.evaluations[{index}] must be an object")
        evaluation_id = require_uuid7(
            evaluation.get("id"), f"response.evaluations[{index}].id"
        )
        evaluation_ids.add(evaluation_id)
        response_ids.append(evaluation_id)
        if evaluation.get("attemptId") not in attempt_ids:
            raise CoachStateError(
                f"response.evaluations[{index}] references an unknown attempt"
            )
        if evaluation.get("outcome") not in {"PASS", "FAIL", "NO_OPPORTUNITY"}:
            raise CoachStateError(
                f"response.evaluations[{index}] has an unsupported outcome"
            )
        confidence = evaluation.get("confidence")
        if (
            not isinstance(confidence, (int, float))
            or isinstance(confidence, bool)
            or not 0 <= confidence <= 1
        ):
            raise CoachStateError(
                f"response.evaluations[{index}].confidence must be 0–1"
            )
        dimension_scores = evaluation.get("dimensionScores")
        if not isinstance(dimension_scores, dict) or any(
            not isinstance(score, (int, float))
            or isinstance(score, bool)
            or not 0 <= score <= 1
            for score in dimension_scores.values()
        ):
            raise CoachStateError(
                f"response.evaluations[{index}].dimensionScores must contain 0–1 scores"
            )
        answer_evidence = evaluation.get("userAnswerEvidence")
        if not isinstance(answer_evidence, list) or any(
            not isinstance(value, str) or not value for value in answer_evidence
        ):
            raise CoachStateError(
                f"response.evaluations[{index}].userAnswerEvidence must be a string array"
            )
        if not isinstance(evaluation.get("mostImportantSuggestion"), str):
            raise CoachStateError(
                f"response.evaluations[{index}].mostImportantSuggestion must be a string"
            )
        for field in ("evaluatorVersion", "promptVersion", "rubricVersion"):
            if not isinstance(evaluation.get(field), str) or not evaluation.get(field):
                raise CoachStateError(
                    f"response.evaluations[{index}].{field} is required"
                )
        if evaluation.get("adjudicationStatus") not in {
            "ACCEPTED",
            "DISPUTED",
            "SUPERSEDED",
            "PENDING",
        }:
            raise CoachStateError(
                f"response.evaluations[{index}] has an unsupported adjudicationStatus"
            )
        if evaluation.get("supersedesEvaluationId") is not None:
            require_uuid7(
                evaluation.get("supersedesEvaluationId"),
                f"response.evaluations[{index}].supersedesEvaluationId",
            )
        canonical_evaluations.append(dict(evaluation))
    canonical_response["evaluations"] = canonical_evaluations
    first_attempt_id = require_uuid7(
        response.get("firstAttemptId"), "response.firstAttemptId"
    )
    final_attempt_id = require_uuid7(
        response.get("finalAttemptId"), "response.finalAttemptId"
    )
    if first_attempt_id not in attempt_ids or final_attempt_id not in attempt_ids:
        raise CoachStateError(
            "firstAttemptId and finalAttemptId must reference stored attempts"
        )
    if (
        response.get("currentEvaluationId") is not None
        and response.get("currentEvaluationId") not in evaluation_ids
    ):
        raise CoachStateError(
            "response.currentEvaluationId references an unknown evaluation"
        )
    cycle_root = state_root(workspace) / "cycles" / cycle_id
    cycle_path = cycle_root / "cycle.json"
    cycle = read_json(cycle_path)
    if cycle.get("state") != "LESSON_ACTIVE" or cycle.get("lesson_status") != "ACTIVE":
        raise CoachStateError(
            "Exercise responses can be recorded only while the lesson is ACTIVE"
        )
    plan_path = cycle_root / "lesson-plan.json"
    if not plan_path.exists():
        raise CoachStateError("A lesson plan must be saved before exercise responses")
    plan_item_ids = {
        str(item["id"])
        for block in read_json(plan_path).get("blocks", [])
        for item in block.get("items", [])
    }
    if exercise_item_id not in plan_item_ids:
        raise CoachStateError("response.exerciseItemId is outside this lesson plan")
    _validate_response_contract(canonical_response, plan_item_ids, "response")
    secret_paths = find_secret_paths(canonical_response)
    if secret_paths:
        raise CoachStateError(
            f"Response contains secret-like fields: {', '.join(secret_paths)}"
        )
    path = cycle_root / "responses.jsonl"
    for existing in read_jsonl(path):
        if existing.get("id") == response.get("id"):
            if existing == canonical_response:
                return
            raise CoachStateError(
                f"Exercise response ID already exists: {response.get('id')}"
            )
    update_revisioned_json(
        cycle_path,
        {"append_only_entity_ids": _append_entity_ids(cycle, *response_ids)},
        expected_revision=int(cycle["revision"]),
    )
    append_jsonl(path, canonical_response)


def set_lesson_cursor(
    workspace: str | Path,
    cycle_id: str,
    block_id: str,
    item_id: str,
    elapsed_seconds: int,
    *,
    expected_revision: int | None = None,
) -> dict[str, Any]:
    """Persist the current lesson position as a safe pause/resume point."""

    require_uuid7(cycle_id, "cycle_id")
    require_uuid7(block_id, "block_id")
    require_uuid7(item_id, "item_id")
    if (
        not isinstance(elapsed_seconds, int)
        or isinstance(elapsed_seconds, bool)
        or not 0 <= elapsed_seconds <= 3600
    ):
        raise CoachStateError("elapsed_seconds must be an integer from 0 to 3600")
    cycle_root = state_root(workspace) / "cycles" / cycle_id
    cycle_path = cycle_root / "cycle.json"
    cycle = read_json(cycle_path)
    if cycle.get("state") != "LESSON_ACTIVE" or cycle.get("lesson_status") != "ACTIVE":
        raise CoachStateError(
            "The lesson cursor can be updated only while the lesson is ACTIVE"
        )
    prior_elapsed = cycle.get("lesson_elapsed_seconds", 0)
    if isinstance(prior_elapsed, int) and elapsed_seconds < prior_elapsed:
        raise CoachStateError("The lesson cursor elapsed time cannot move backwards")
    plan = read_json(cycle_root / "lesson-plan.json")
    block = next(
        (value for value in plan.get("blocks", []) if value.get("id") == block_id), None
    )
    if not isinstance(block, dict) or not any(
        value.get("id") == item_id for value in block.get("items", [])
    ):
        raise CoachStateError(
            "The lesson cursor does not reference a matching block and item"
        )
    return update_revisioned_json(
        cycle_path,
        {
            "active_block_id": block_id,
            "active_item_id": item_id,
            "lesson_elapsed_seconds": elapsed_seconds,
        },
        expected_revision=expected_revision,
    )


def save_contract_artifact(
    workspace: str | Path,
    cycle_id: str,
    kind: str,
    source: Path,
    *,
    expected_revision: int | None = None,
) -> Path:
    """Validate and atomically persist an AI-produced canonical contract artifact."""

    require_uuid7(cycle_id, "cycle_id")
    raw = json.loads(source.read_text(encoding="utf-8"))
    cycle_root = state_root(workspace) / "cycles" / cycle_id
    cycle_path = cycle_root / "cycle.json"
    cycle = read_json(cycle_path)
    if expected_revision is not None and int(cycle["revision"]) != expected_revision:
        raise CoachStateError(
            f"Expected cycle revision {expected_revision}, found {cycle['revision']}"
        )
    entity_ids: list[str] = []

    if kind == "assessment":
        if not isinstance(raw, dict):
            raise CoachStateError("Assessment input must be an object")
        _exact_keys(
            raw,
            {
                "schemaVersion",
                "id",
                "attemptId",
                "rubricVersion",
                "modelId",
                "overallBand",
                "criteria",
                "issueEvidenceIds",
            },
            set(),
            "assessment",
        )
        if raw.get("schemaVersion") != SCHEMA_VERSION:
            raise CoachStateError("Assessment uses an unsupported schemaVersion")
        entity_ids.append(require_uuid7(raw.get("id"), "assessment.id"))
        attempt_id = require_uuid7(raw.get("attemptId"), "assessment.attemptId")
        local_attempt_ids = {
            str(read_json(path)["id"])
            for path in cycle_root.glob("attempt-v*.meta.json")
        }
        if attempt_id not in local_attempt_ids:
            raise CoachStateError("Assessment references an attempt outside this cycle")
        for field in ("rubricVersion", "modelId"):
            if not isinstance(raw.get(field), str) or not raw[field]:
                raise CoachStateError(f"assessment.{field} is required")
        overall_band = raw.get("overallBand")
        if (
            not isinstance(overall_band, (int, float))
            or isinstance(overall_band, bool)
            or not 0 <= overall_band <= 9
            or overall_band * 2 != int(overall_band * 2)
        ):
            raise CoachStateError(
                "assessment.overallBand must be a half-band from 0 to 9"
            )
        issue_ids = raw.get("issueEvidenceIds")
        if not isinstance(issue_ids, list):
            raise CoachStateError("assessment.issueEvidenceIds must be an array")
        stored_issue_ids = {
            str(issue["id"])
            for issue in _read_wrapped_array(
                cycle_root / "issue-evidence.json", "issueEvidence"
            )
        }
        issue_references = {
            require_uuid7(value, f"assessment.issueEvidenceIds[{index}]")
            for index, value in enumerate(issue_ids)
        }
        if not issue_references <= stored_issue_ids:
            raise CoachStateError(
                "assessment.issueEvidenceIds references missing issue evidence"
            )
        entity_ids.extend(issue_references)
        if not isinstance(raw.get("criteria"), dict) or set(raw["criteria"]) != {
            "TR",
            "CC",
            "LR",
            "GRA",
        }:
            raise CoachStateError("Assessment requires TR, CC, LR and GRA criteria")
        for dimension, criterion in raw["criteria"].items():
            if not isinstance(criterion, dict):
                raise CoachStateError(
                    f"assessment.criteria.{dimension} must be an object"
                )
            _exact_keys(
                criterion,
                {"band", "confidence", "rationale", "evidenceIds"},
                set(),
                f"assessment.criteria.{dimension}",
            )
            band = criterion.get("band")
            confidence = criterion.get("confidence")
            if (
                not isinstance(band, (int, float))
                or isinstance(band, bool)
                or not 0 <= band <= 9
                or band * 2 != int(band * 2)
            ):
                raise CoachStateError(
                    f"assessment.criteria.{dimension}.band is invalid"
                )
            if (
                not isinstance(confidence, (int, float))
                or isinstance(confidence, bool)
                or not 0 <= confidence <= 1
            ):
                raise CoachStateError(
                    f"assessment.criteria.{dimension}.confidence is invalid"
                )
            if (
                not isinstance(criterion.get("rationale"), str)
                or not criterion["rationale"]
            ):
                raise CoachStateError(
                    f"assessment.criteria.{dimension}.rationale is required"
                )
            evidence_ids = criterion.get("evidenceIds")
            if not isinstance(evidence_ids, list) or any(
                require_uuid7(value, f"assessment.criteria.{dimension}.evidenceId")
                not in stored_issue_ids
                for value in evidence_ids
            ):
                raise CoachStateError(
                    f"assessment.criteria.{dimension}.evidenceIds references missing issue evidence"
                )
        document = raw
        destination = cycle_root / "assessment.json"
    elif kind == "issue-evidence":
        values = raw.get("issueEvidence") if isinstance(raw, dict) else raw
        if isinstance(raw, dict) and set(raw) != {"issueEvidence"}:
            raise CoachStateError(
                "Issue evidence wrapper may contain only issueEvidence"
            )
        if not isinstance(values, list) or not all(
            isinstance(item, dict) for item in values
        ):
            raise CoachStateError(
                "Issue evidence input must be an array or an issueEvidence wrapper"
            )
        attempt_contents: dict[str, str] = {}
        for metadata_path in cycle_root.glob("attempt-v*.meta.json"):
            attempt_id = str(read_json(metadata_path)["id"])
            text_path = cycle_root / metadata_path.name.replace(".meta.json", ".md")
            if not text_path.exists():
                raise CoachStateError(
                    f"Missing immutable attempt text for {attempt_id}"
                )
            attempt_contents[attempt_id] = text_path.read_text(
                encoding="utf-8"
            ).rstrip()
        seen_issue_ids: set[str] = set()
        for index, issue in enumerate(values):
            path = f"issueEvidence[{index}]"
            _exact_keys(
                issue,
                {
                    "schemaVersion",
                    "id",
                    "essayAttemptId",
                    "skillId",
                    "startOffset",
                    "endOffset",
                    "excerpt",
                    "diagnosis",
                    "categories",
                    "hardGrammarError",
                    "severity",
                    "confidence",
                    "adjudicationStatus",
                },
                set(),
                path,
            )
            if issue.get("schemaVersion") != SCHEMA_VERSION:
                raise CoachStateError(f"{path} uses an unsupported schemaVersion")
            issue_id = require_uuid7(issue.get("id"), f"{path}.id")
            if issue_id in seen_issue_ids:
                raise CoachStateError(f"{path} reuses issue ID {issue_id}")
            seen_issue_ids.add(issue_id)
            entity_ids.append(issue_id)
            attempt_id = require_uuid7(
                issue.get("essayAttemptId"), f"{path}.essayAttemptId"
            )
            if attempt_id not in attempt_contents:
                raise CoachStateError(
                    f"{path} references an attempt outside this cycle"
                )
            if issue.get("skillId") not in SUPPORTED_SKILL_IDS:
                raise CoachStateError(f"{path} uses an unsupported skillId")
            start, end = issue.get("startOffset"), issue.get("endOffset")
            if (
                not isinstance(start, int)
                or isinstance(start, bool)
                or not isinstance(end, int)
                or isinstance(end, bool)
            ):
                raise CoachStateError(f"{path} offsets must be integers")
            if _utf16_excerpt(attempt_contents[attempt_id], start, end) != issue.get(
                "excerpt"
            ):
                raise CoachStateError(
                    f"{path}.excerpt does not match the immutable attempt"
                )
            if not isinstance(issue.get("diagnosis"), str) or not issue["diagnosis"]:
                raise CoachStateError(f"{path}.diagnosis is required")
            categories = issue.get("categories")
            allowed_categories = {
                "HARD_GRAMMAR_ERROR",
                "COLLOCATION_NATURALNESS",
                "CHINESE_INFORMATION_ORGANIZATION",
                "OPTIONAL_OPTIMIZATION",
            }
            if (
                not isinstance(categories, list)
                or not categories
                or len(categories) != len(set(categories))
                or any(value not in allowed_categories for value in categories)
            ):
                raise CoachStateError(f"{path}.categories is invalid")
            confidence = issue.get("confidence")
            if not isinstance(issue.get("hardGrammarError"), bool) or issue.get(
                "severity"
            ) not in {
                "LOW",
                "MEDIUM",
                "HIGH",
            }:
                raise CoachStateError(f"{path} grammar/severity fields are invalid")
            if (
                not isinstance(confidence, (int, float))
                or isinstance(confidence, bool)
                or not 0 <= confidence <= 1
            ):
                raise CoachStateError(f"{path}.confidence must be 0–1")
            if issue.get("adjudicationStatus") not in {
                "ACCEPTED",
                "DISPUTED",
                "CORRECTED",
            }:
                raise CoachStateError(f"{path}.adjudicationStatus is unsupported")
        document = {"issueEvidence": values}
        destination = cycle_root / "issue-evidence.json"
    elif kind == "lesson-plan":
        if not isinstance(raw, dict):
            raise CoachStateError("Lesson plan input must be an object")
        import validate_lesson

        errors = validate_lesson.validate(raw)
        if errors:
            raise CoachStateError("Invalid lesson plan: " + "; ".join(errors))
        if raw.get("trainingCycleId") != cycle_id:
            raise CoachStateError("Lesson plan references another training cycle")
        if raw.get("status") != "READY":
            raise CoachStateError(
                "A newly generated lesson plan must have status READY"
            )
        if cycle.get("lesson_status") != "PLANNING":
            raise CoachStateError(
                "A lesson plan can be installed only while lesson status is PLANNING"
            )
        if cycle.get("state") != "LESSON_GENERATING":
            raise CoachStateError(
                "A lesson plan can be installed only in LESSON_GENERATING"
            )
        entity_ids.append(require_uuid7(raw.get("id"), "lessonPlan.id"))
        for objective in raw.get("objectives", []):
            entity_ids.append(require_uuid7(objective.get("id"), "lesson objective.id"))
            entity_ids.extend(
                require_uuid7(value, "lesson objective.sourceEvidenceId")
                for value in objective.get("sourceEvidenceIds", [])
            )
        for block in raw.get("blocks", []):
            entity_ids.append(require_uuid7(block.get("id"), "lesson block.id"))
            entity_ids.extend(
                require_uuid7(item.get("id"), "exercise item.id")
                for item in block.get("items", [])
            )
        document = raw
        destination = cycle_root / "lesson-plan.json"
    else:
        raise CoachStateError("kind must be assessment, issue-evidence, or lesson-plan")

    secret_paths = find_secret_paths(document)
    if secret_paths:
        raise CoachStateError(
            f"Artifact contains secret-like fields: {', '.join(secret_paths)}"
        )
    if destination.exists():
        existing = read_json(destination)
        if existing != document:
            raise CoachStateError(
                f"Refusing to overwrite a different locked artifact: {destination}"
            )
        return destination
    cycle_updates: dict[str, Any] = {
        "append_only_entity_ids": _append_entity_ids(cycle, *entity_ids)
    }
    if kind == "lesson-plan":
        cycle_updates["lesson_status"] = "READY"
        cycle_updates["state"] = "LESSON_READY"
    update_revisioned_json(
        cycle_path,
        cycle_updates,
        expected_revision=int(cycle["revision"]),
    )
    atomic_write_json(destination, document)
    return destination


def record_evidence(
    workspace: str | Path, cycle_id: str, event: dict[str, Any]
) -> None:
    """Append one canonical SkillEvidenceEvent and advance the owning cycle revision."""

    require_uuid7(cycle_id, "cycle_id")
    required = {
        "schemaVersion",
        "id",
        "userId",
        "skillId",
        "kind",
        "outcome",
        "independent",
        "firstAttempt",
        "hintLevel",
        "confidence",
        "validForStateTransition",
        "adjudicationStatus",
        "contextId",
        "topicId",
        "sourceEntityType",
        "sourceEntityId",
        "occurredAt",
    }
    missing = sorted(required - event.keys())
    if missing:
        raise CoachStateError(f"Evidence event missing fields: {', '.join(missing)}")
    optional = {
        "objectiveId",
        "naturalOpportunity",
        "targetPrompted",
        "unseenSurfaceForm",
        "coreErrorRecurred",
        "instructionExposureAt",
        "prerequisiteSkipped",
        "assisted",
    }
    _exact_keys(event, required, optional, "evidence")
    if event.get("schemaVersion") != SCHEMA_VERSION:
        raise CoachStateError("Evidence event uses an unsupported schemaVersion")
    event_id = require_uuid7(event.get("id"), "evidence.id")
    require_uuid7(event.get("userId"), "evidence.userId")
    source_id = require_uuid7(event.get("sourceEntityId"), "evidence.sourceEntityId")
    objective_id: str | None = None
    if event.get("objectiveId") is not None:
        objective_id = require_uuid7(event.get("objectiveId"), "evidence.objectiveId")
    if event.get("skillId") not in SUPPORTED_SKILL_IDS:
        raise CoachStateError("Evidence event uses an unsupported skillId")
    if event.get("kind") not in {
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
    }:
        raise CoachStateError("Evidence event uses an unsupported kind")
    if event.get("sourceEntityType") not in {
        "ESSAY",
        "EXERCISE",
        "REWRITE",
        "TRANSFER",
    }:
        raise CoachStateError("Evidence event uses an unsupported sourceEntityType")
    if event.get("outcome") not in {"PASS", "FAIL", "NO_OPPORTUNITY"}:
        raise CoachStateError("Evidence event uses an unsupported outcome")
    for field in ("independent", "firstAttempt", "validForStateTransition"):
        if not isinstance(event.get(field), bool):
            raise CoachStateError(f"evidence.{field} must be boolean")
    for field in (
        "naturalOpportunity",
        "targetPrompted",
        "unseenSurfaceForm",
        "coreErrorRecurred",
        "prerequisiteSkipped",
        "assisted",
    ):
        if field in event and not isinstance(event[field], bool):
            raise CoachStateError(f"evidence.{field} must be boolean")
    if event.get("hintLevel") not in {
        "NONE",
        "KEYWORD",
        "PARTIAL_FRAME",
        "FULL_FRAME",
        "ANSWER_SHOWN",
    }:
        raise CoachStateError("Evidence event uses an unsupported hintLevel")
    confidence = event.get("confidence")
    if (
        not isinstance(confidence, (int, float))
        or isinstance(confidence, bool)
        or not 0 <= confidence <= 1
    ):
        raise CoachStateError("Evidence event confidence must be from 0 to 1")
    if event.get("adjudicationStatus") not in {
        "ACCEPTED",
        "DISPUTED",
        "SUPERSEDED",
        "PENDING",
    }:
        raise CoachStateError("Evidence event uses an unsupported adjudicationStatus")
    for field in ("contextId", "topicId"):
        if not isinstance(event.get(field), str) or not event[field]:
            raise CoachStateError(f"evidence.{field} is required")
    if (
        event.get("kind") == "DELAYED_REWRITE"
        and event.get("sourceEntityType") != "REWRITE"
    ):
        raise CoachStateError("DELAYED_REWRITE evidence must come from a REWRITE")
    if (
        event.get("kind") == "CROSS_TOPIC_TRANSFER"
        and event.get("sourceEntityType") != "TRANSFER"
    ):
        raise CoachStateError("CROSS_TOPIC_TRANSFER evidence must come from a TRANSFER")
    if (
        event.get("outcome") == "NO_OPPORTUNITY"
        and event.get("validForStateTransition") is True
    ):
        raise CoachStateError("NO_OPPORTUNITY evidence cannot change ability state")
    if event.get("assisted") is True and event.get("validForStateTransition") is True:
        raise CoachStateError("Assisted evidence cannot change ability state")
    canonical_event = dict(event)
    canonical_event["occurredAt"] = normalize_iso(str(event["occurredAt"]))
    if event.get("instructionExposureAt") is not None:
        canonical_event["instructionExposureAt"] = normalize_iso(
            str(event["instructionExposureAt"])
        )
    cycle_root = state_root(workspace) / "cycles" / cycle_id
    cycle_path = cycle_root / "cycle.json"
    cycle = read_json(cycle_path)
    known_ids = _known_local_entity_ids(state_root(workspace), cycle_root, cycle)
    if source_id not in known_ids:
        raise CoachStateError("Evidence sourceEntityId is outside this cycle")
    if objective_id is not None and objective_id not in known_ids:
        raise CoachStateError("Evidence objectiveId is outside this cycle")
    secret_paths = find_secret_paths(canonical_event)
    if secret_paths:
        raise CoachStateError(
            f"Evidence contains secret-like fields: {', '.join(secret_paths)}"
        )
    evidence_path = state_root(workspace) / "evidence.jsonl"
    existing = read_jsonl(evidence_path)
    source_tuple = (
        canonical_event["skillId"],
        canonical_event["kind"],
        canonical_event["sourceEntityType"],
        canonical_event["sourceEntityId"],
    )
    for prior in existing:
        if prior.get("id") == event_id:
            if prior == canonical_event:
                return
            raise CoachStateError(
                f"Evidence ID already exists with different content: {event_id}"
            )
        if (
            prior.get("skillId"),
            prior.get("kind"),
            prior.get("sourceEntityType"),
            prior.get("sourceEntityId"),
        ) == source_tuple:
            raise CoachStateError(
                "Evidence source tuple already exists with a different ID"
            )
    update_revisioned_json(
        cycle_path,
        {"append_only_entity_ids": _append_entity_ids(cycle, event_id)},
        expected_revision=int(cycle["revision"]),
    )
    append_jsonl(evidence_path, canonical_event)


def schedule_after_lesson(
    workspace: str | Path,
    cycle_id: str,
    exposure_at: str,
    *,
    expected_revision: int | None = None,
) -> dict[str, Any]:
    require_uuid7(cycle_id, "cycle_id")
    exposure = parse_iso(exposure_at)
    cycle_path = state_root(workspace) / "cycles" / cycle_id / "cycle.json"
    current_cycle = read_json(cycle_path)
    if current_cycle.get("state") != "LESSON_RESOLVED" or current_cycle.get(
        "lesson_status"
    ) not in {
        "CORE_COMPLETED",
        "USER_SKIPPED",
    }:
        raise CoachStateError(
            "Scheduling requires a resolved lesson with CORE_COMPLETED or USER_SKIPPED status"
        )
    lesson_path = cycle_path.with_name("lesson-plan.json")
    objectives: list[dict[str, Any]] = []
    if lesson_path.exists():
        raw_objectives = read_json(lesson_path).get("objectives", [])
        if isinstance(raw_objectives, list):
            objectives = [item for item in raw_objectives if isinstance(item, dict)]
    transfer_tasks = [
        {
            "id": new_uuid7(),
            "objectiveId": str(objective["id"]),
            "status": "PLANNED",
            "windowStartsAt": format_utc_iso(exposure + timedelta(days=5)),
            "windowEndsAt": format_utc_iso(exposure + timedelta(days=7)),
            "dueAt": format_utc_iso(exposure + timedelta(days=6)),
            "naturalOpportunityDefinition": (
                "Use the target ability naturally in a different IELTS topic and surface form without a hint."
            ),
            "noHintRequired": True,
        }
        for index, objective in enumerate(objectives)
        if isinstance(objective.get("id"), str) and objective.get("id")
    ]
    rewrite_task = dict(current_cycle.get("rewrite_task", {}))
    rewrite_status = (
        "SKIPPED_PREREQUISITE"
        if current_cycle.get("lesson_status") == "USER_SKIPPED"
        else "LOCKED"
    )
    rewrite_task.update(
        {
            "status": rewrite_status,
            "targetRewriteAt": format_utc_iso(exposure + timedelta(days=1)),
            "dueAt": format_utc_iso(exposure + timedelta(days=1)),
            "lastInstructionExposureAt": format_utc_iso(exposure),
            "prerequisiteSkipped": rewrite_status == "SKIPPED_PREREQUISITE",
        }
    )
    schedule = [
        (
            str(current_cycle["rewrite_task"]["id"]),
            "rewrite",
            exposure + timedelta(days=1),
        ),
        *[
            (str(task["id"]), "transfer", parse_iso(str(task["dueAt"])))
            for task in transfer_tasks
        ],
        (
            str(current_cycle["mixed_review_task"]["id"]),
            "mixed_review",
            exposure + timedelta(days=14),
        ),
    ]
    queue_path = state_root(workspace) / "queue.json"
    queue = read_json(queue_path)
    existing_tasks = [
        task for task in queue.get("tasks", []) if task.get("cycle_id") != cycle_id
    ]
    tasks = existing_tasks + [
        {
            "task_id": task_id,
            "cycle_id": cycle_id,
            "kind": kind,
            "target_at": format_utc_iso(due),
            "due_at": format_utc_iso(due),
            "status": "PENDING",
            "canonical_status": (rewrite_status if kind == "rewrite" else "PLANNED"),
        }
        for task_id, kind, due in schedule
    ]
    updated = update_revisioned_json(
        queue_path,
        {"tasks": tasks},
        expected_revision=expected_revision,
    )
    mixed_review_task = dict(current_cycle.get("mixed_review_task", {}))
    mixed_review_task.update(
        {"dueAt": format_utc_iso(exposure + timedelta(days=14)), "status": "PLANNED"}
    )
    update_revisioned_json(
        cycle_path,
        {
            "last_teaching_exposure_at": format_utc_iso(exposure),
            "target_rewrite_at": format_utc_iso(exposure + timedelta(days=1)),
            "state": "REWRITE_LOCKED",
            "rewrite_task": rewrite_task,
            "rewrite_status": rewrite_status,
            "transfer_tasks": transfer_tasks,
            "transfer_statuses": ["PLANNED" for _ in transfer_tasks],
            "mixed_review_task": mixed_review_task,
            "append_only_entity_ids": _append_entity_ids(
                current_cycle, *(str(task["id"]) for task in transfer_tasks)
            ),
        },
    )
    return updated


def _state_action(state: str) -> str:
    return {
        "QUESTION_READY": "start_version_1",
        "ATTEMPT_1_ACTIVE": "continue_version_1",
        "SUBMITTED": "assess_version_1",
        "ANALYZING": "finish_assessment",
        "FEEDBACK_READY": "start_lesson",
        "LESSON_GENERATING": "finish_lesson_plan",
        "LESSON_READY": "start_lesson",
        "LESSON_ACTIVE": "continue_lesson",
        "LESSON_RESOLVED": "schedule_rewrite",
        "REWRITE_LOCKED": "wait_for_rewrite",
        "REWRITE_READY": "start_version_2",
        "ATTEMPT_2_ACTIVE": "continue_version_2",
        "COMPARING": "finish_comparison",
        "CORE_CYCLE_COMPLETED": "check_due_transfer",
    }.get(state, "inspect_state")


def status(workspace: str | Path, now: str | None = None) -> dict[str, Any]:
    root = state_root(workspace)
    manifest_path = root / "manifest.json"
    if not manifest_path.exists():
        return {"initialized": False, "next_action": "initialize_workspace"}
    manifest = read_json(manifest_path)
    queue = read_json(root / "queue.json")
    moment = parse_iso(now) if now else parse_iso(utc_now_iso())
    due_tasks = sorted(
        [
            task
            for task in queue.get("tasks", [])
            if task.get("status") == "PENDING"
            and task.get("due_at")
            and parse_iso(str(task["due_at"])) <= moment
        ],
        key=lambda item: str(item["due_at"]),
    )
    active_id = manifest.get("active_cycle_id")
    if active_id:
        cycle_path = root / "cycles" / str(active_id) / "cycle.json"
        if cycle_path.exists():
            cycle = read_json(cycle_path)
            state = str(cycle.get("state"))
            if state not in TERMINAL_STATES:
                due_for_cycle = next(
                    (task for task in due_tasks if task.get("cycle_id") == active_id),
                    None,
                )
                result = {
                    "initialized": True,
                    "active_cycle_id": active_id,
                    "cycle_state": state,
                    "next_action": _state_action(state),
                    "due_task_count": len(due_tasks),
                }
                if state == "LESSON_ACTIVE":
                    result["lesson_cursor"] = {
                        "block_id": cycle.get("active_block_id"),
                        "item_id": cycle.get("active_item_id"),
                        "elapsed_seconds": cycle.get("lesson_elapsed_seconds", 0),
                    }
                elif (
                    state == "REWRITE_LOCKED"
                    and isinstance(due_for_cycle, dict)
                    and due_for_cycle.get("kind") == "rewrite"
                ):
                    result["next_action"] = "unlock_rewrite"
                    result["due_task"] = due_for_cycle
                return result
    if due_tasks:
        first = due_tasks[0]
        return {
            "initialized": True,
            "active_cycle_id": active_id,
            "next_action": f"start_due_{first['kind']}",
            "due_task": first,
            "due_task_count": len(due_tasks),
        }
    return {
        "initialized": True,
        "active_cycle_id": active_id,
        "next_action": "start_new_cycle",
        "due_task_count": 0,
    }


def _read_wrapped_array(path: Path, field: str) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    raw = read_json(path).get(field, [])
    if not isinstance(raw, list) or not all(isinstance(item, dict) for item in raw):
        raise CoachStateError(f"{path.name} must contain an object array in {field}")
    return [dict(item) for item in raw]


def _canonical_attempts(
    cycle_root: Path, cycle: dict[str, Any]
) -> list[dict[str, Any]]:
    attempts: list[dict[str, Any]] = []
    for version in (1, 2):
        text_path = cycle_root / f"attempt-v{version}.md"
        if not text_path.exists():
            continue
        content = text_path.read_text(encoding="utf-8").rstrip()
        if not content:
            raise CoachStateError(f"Attempt V{version} is empty")
        meta_path = text_path.with_suffix(".meta.json")
        meta = read_json(meta_path) if meta_path.exists() else {}
        submitted = normalize_iso(
            str(meta.get("submittedAt") or cycle.get("updated_at"))
        )
        started = normalize_iso(str(meta.get("startedAt") or submitted))
        attempt: dict[str, Any] = {
            "id": str(meta.get("id") or f"{cycle['cycle_id']}:attempt-v{version}"),
            "version": f"V{version}",
            "content": content,
            "startedAt": started,
            "submittedAt": submitted,
            "wordCount": int(
                meta.get(
                    "wordCount",
                    len(re.findall(r"[A-Za-z]+(?:['’-][A-Za-z]+)?", content)),
                )
            ),
            "assisted": bool(meta.get("assisted", False)),
            "interrupted": bool(meta.get("interrupted", False)),
        }
        for optional in ("draftBeforeSelfCheck", "draftAfterSelfCheck"):
            if isinstance(meta.get(optional), str):
                attempt[optional] = meta[optional]
        attempts.append(attempt)
    return attempts


def _concrete_entity_pairs(bundle: dict[str, Any]) -> list[tuple[str, str]]:
    pairs = [
        (str(bundle["cycle"]["id"]), "CYCLE"),
        (str(bundle["cycle"]["question"]["id"]), "QUESTION"),
    ]
    for attempt in bundle["attempts"]:
        pairs.append((str(attempt["id"]), "ESSAY_ATTEMPT"))
    assessment = bundle["assessment"]
    if isinstance(assessment, dict):
        pairs.append((str(assessment["id"]), "ASSESSMENT"))
    pairs.extend(
        (str(issue["id"]), "ISSUE_EVIDENCE") for issue in bundle["issueEvidence"]
    )
    pairs.extend(
        (str(objective["id"]), "OBJECTIVE") for objective in bundle["objectives"]
    )
    plan = bundle["lesson"]["plan"]
    if isinstance(plan, dict):
        pairs.append((str(plan["id"]), "LESSON_PLAN"))
        for block in plan.get("blocks", []):
            pairs.append((str(block["id"]), "LESSON_BLOCK"))
            pairs.extend(
                (str(item["id"]), "EXERCISE_ITEM") for item in block.get("items", [])
            )
    for response in bundle["lesson"]["responses"]:
        pairs.append((str(response["id"]), "EXERCISE_RESPONSE"))
        pairs.extend(
            (str(attempt["id"]), "EXERCISE_ATTEMPT")
            for attempt in response.get("attempts", [])
        )
        pairs.extend(
            (str(evaluation["id"]), "EXERCISE_EVALUATION")
            for evaluation in response.get("evaluations", [])
        )
    pairs.extend((str(event["id"]), "SKILL_EVIDENCE") for event in bundle["evidence"])
    pairs.append((str(bundle["dueTasks"]["rewrite"]["id"]), "REWRITE_TASK"))
    pairs.extend(
        (str(task["id"]), "TRANSFER_TASK") for task in bundle["dueTasks"]["transfers"]
    )
    pairs.append((str(bundle["dueTasks"]["mixedReview"]["id"]), "MIXED_REVIEW_TASK"))
    pairs.extend((str(conflict["id"]), "CONFLICT") for conflict in bundle["conflicts"])
    return pairs


def _concrete_entity_ids(bundle: dict[str, Any]) -> set[str]:
    return {entity_id for entity_id, _kind in _concrete_entity_pairs(bundle)}


def _known_local_entity_ids(
    root: Path, cycle_root: Path, cycle: dict[str, Any]
) -> set[str]:
    """Collect persisted entity IDs even when a redacted export omits their records."""

    ids = {
        str(cycle["cycle_id"]),
        str(cycle["question_id"]),
        str(cycle["rewrite_task"]["id"]),
        str(cycle["mixed_review_task"]["id"]),
    }
    ids.update(
        str(value)
        for value in cycle.get("append_only_entity_ids", [])
        if isinstance(value, str)
    )
    ids.update(
        str(task["id"])
        for task in cycle.get("transfer_tasks", [])
        if isinstance(task, dict) and task.get("id")
    )
    for version in (1, 2):
        path = cycle_root / f"attempt-v{version}.meta.json"
        if path.exists():
            ids.add(str(read_json(path)["id"]))
    for file_name, array_field in (
        ("issue-evidence.json", "issueEvidence"),
        ("objectives.json", "objectives"),
    ):
        for value in _read_wrapped_array(cycle_root / file_name, array_field):
            ids.add(str(value["id"]))
    assessment_path = cycle_root / "assessment.json"
    if assessment_path.exists():
        ids.add(str(read_json(assessment_path)["id"]))
    plan_path = cycle_root / "lesson-plan.json"
    if plan_path.exists():
        plan = read_json(plan_path)
        ids.add(str(plan["id"]))
        ids.update(str(objective["id"]) for objective in plan.get("objectives", []))
        for block in plan.get("blocks", []):
            ids.add(str(block["id"]))
            ids.update(str(item["id"]) for item in block.get("items", []))
    for response in read_jsonl(cycle_root / "responses.jsonl"):
        ids.add(str(response["id"]))
        ids.update(str(value["id"]) for value in response.get("attempts", []))
        ids.update(str(value["id"]) for value in response.get("evaluations", []))
    ids.update(
        str(conflict["id"])
        for conflict in cycle.get("conflicts", [])
        if isinstance(conflict, dict) and conflict.get("id")
    )
    known_sources = set(ids)
    for event in read_jsonl(root / "evidence.jsonl"):
        if str(event.get("sourceEntityId")) in known_sources:
            ids.add(str(event["id"]))
    return ids


def _bundle_checksum(bundle: dict[str, Any]) -> str:
    material = {key: value for key, value in bundle.items() if key != "checksum"}
    return sha256_jcs(material)


def _bundle_content_hash(bundle: dict[str, Any]) -> str:
    """Match Web's content hash while excluding transport-only metadata."""

    return sha256_jcs(
        {
            "contractVersion": bundle["contractVersion"],
            "appendOnlyEntityIds": sorted(
                bundle["manifest"]["appendOnlyEntityIds"]
            ),
            "cycle": bundle["cycle"],
            "attempts": bundle["attempts"],
            "assessment": bundle["assessment"],
            "issueEvidence": bundle["issueEvidence"],
            "objectives": bundle["objectives"],
            "lesson": bundle["lesson"],
            "evidence": bundle["evidence"],
            "dueTasks": bundle["dueTasks"],
            "conflicts": bundle["conflicts"],
        }
    )


def _build_bundle(root: Path, cycle_id: str, include_content: bool) -> dict[str, Any]:
    require_uuid7(cycle_id, "cycle_id")
    cycle_root = root / "cycles" / cycle_id
    if not cycle_root.exists():
        raise CoachStateError(f"Cycle does not exist: {cycle_id}")
    cycle = read_json(cycle_root / "cycle.json")
    question = (cycle_root / "question.md").read_text(encoding="utf-8").strip()
    instruction_path = cycle_root / "question-instructions.md"
    instructions = (
        instruction_path.read_text(encoding="utf-8").strip()
        if instruction_path.exists()
        else "Write at least 250 words in 40 minutes."
    )
    if not question or not instructions:
        raise CoachStateError("Cycle question and instructions must be non-empty")

    attempts = _canonical_attempts(cycle_root, cycle) if include_content else []
    assessment_path = cycle_root / "assessment.json"
    assessment = (
        read_json(assessment_path)
        if include_content and assessment_path.exists()
        else None
    )
    issue_evidence = (
        _read_wrapped_array(cycle_root / "issue-evidence.json", "issueEvidence")
        if include_content
        else []
    )
    issue_evidence.sort(
        key=lambda item: (int(item.get("startOffset", 0)), str(item.get("id", "")))
    )
    lesson_path = cycle_root / "lesson-plan.json"
    plan = read_json(lesson_path) if include_content and lesson_path.exists() else None
    objectives = (
        [dict(item) for item in plan.get("objectives", [])]
        if isinstance(plan, dict)
        else []
    )
    stored_objectives = (
        _read_wrapped_array(cycle_root / "objectives.json", "objectives")
        if include_content
        else []
    )
    if stored_objectives:
        if objectives and objectives != stored_objectives:
            raise CoachStateError(
                "objectives.json and lesson-plan.json contain different objectives"
            )
        objectives = stored_objectives
    objectives.sort(
        key=lambda item: (int(item.get("priority", 0)), str(item.get("id", "")))
    )
    responses = read_jsonl(cycle_root / "responses.jsonl") if include_content else []
    item_order = {
        str(item["id"]): (int(block.get("order", 0)), int(item.get("order", 0)))
        for block in (plan.get("blocks", []) if isinstance(plan, dict) else [])
        for item in block.get("items", [])
    }
    responses.sort(
        key=lambda item: (*item_order.get(str(item.get("exerciseItemId")), (0, 0)), str(item.get("id", "")))
    )
    for response in responses:
        response["attempts"] = sorted(
            response.get("attempts", []),
            key=lambda item: (str(item.get("submittedAt", "")), str(item.get("id", ""))),
        )
        response["evaluations"] = sorted(
            response.get("evaluations", []), key=lambda item: str(item.get("id", ""))
        )

    rewrite_task = dict(cycle.get("rewrite_task", {}))
    transfers = sorted(
        list(cycle.get("transfer_tasks", [])),
        key=lambda item: (str(item.get("windowStartsAt", "")), str(item.get("id", ""))),
    )
    mixed_review = dict(cycle.get("mixed_review_task", {}))
    if not rewrite_task or not mixed_review:
        raise CoachStateError("Cycle is missing canonical due-task state")
    source_ids = {str(item["id"]) for item in attempts}
    source_ids.update(str(response["id"]) for response in responses)
    source_ids.update(str(response["exerciseItemId"]) for response in responses)
    for response in responses:
        source_ids.update(str(item["id"]) for item in response.get("attempts", []))
        source_ids.update(str(item["id"]) for item in response.get("evaluations", []))
    if isinstance(plan, dict):
        source_ids.add(str(plan["id"]))
        source_ids.update(
            str(objective["id"]) for objective in plan.get("objectives", [])
        )
        for block in plan.get("blocks", []):
            source_ids.add(str(block["id"]))
            source_ids.update(str(item["id"]) for item in block.get("items", []))
    source_ids.add(str(rewrite_task["id"]))
    source_ids.update(
        str(task["id"])
        for task in transfers
        if isinstance(task, dict) and task.get("id")
    )
    objective_ids = {str(item["id"]) for item in objectives}
    evidence = [
        event
        for event in read_jsonl(root / "evidence.jsonl")
        if str(event.get("sourceEntityId")) in source_ids
        or str(event.get("objectiveId")) in objective_ids
    ]
    evidence.sort(
        key=lambda item: (str(item.get("occurredAt", "")), str(item.get("id", "")))
    )

    revision = int(cycle.get("bundle_revision", 1))
    parent_revision = cycle.get("bundle_parent_revision")
    bundle: dict[str, Any] = {
        "contractVersion": EXCHANGE_VERSION,
        "manifest": {
            "bundleId": new_uuid7(),
            "cycleId": cycle_id,
            "source": "SKILL",
            "exportedAt": utc_now_iso(),
            "revision": revision,
            "parentRevision": parent_revision,
            "appendOnlyEntityIds": [],
        },
        "cycle": {
            "id": cycle_id,
            "state": str(cycle["state"]),
            "question": {
                "id": str(cycle["question_id"]),
                "prompt": question,
                "instructions": instructions,
            },
            "createdAt": normalize_iso(str(cycle["created_at"])),
            "updatedAt": normalize_iso(str(cycle["updated_at"])),
        },
        "attempts": attempts,
        "assessment": assessment,
        "issueEvidence": issue_evidence,
        "objectives": objectives,
        "lesson": {"plan": plan, "responses": responses},
        "evidence": evidence,
        "dueTasks": {
            "rewrite": rewrite_task,
            "transfers": transfers,
            "mixedReview": mixed_review,
        },
        "conflicts": sorted(
            list(cycle.get("conflicts", [])),
            key=lambda item: (str(item.get("detectedAt", "")), str(item.get("id", ""))),
        ),
    }
    if cycle.get("core_completed_at"):
        bundle["cycle"]["coreCompletedAt"] = normalize_iso(
            str(cycle["core_completed_at"])
        )
    historical_ids = _known_local_entity_ids(root, cycle_root, cycle)
    bundle["manifest"]["appendOnlyEntityIds"] = sorted(
        _concrete_entity_ids(bundle) | historical_ids
    )
    content_hash = _bundle_content_hash(bundle)
    stored_content_hash = cycle.get("bundle_content_hash")
    if stored_content_hash is not None and stored_content_hash != content_hash:
        parent_revision = revision
        revision += 1
        bundle["manifest"]["revision"] = revision
        bundle["manifest"]["parentRevision"] = parent_revision
    if (
        stored_content_hash != content_hash
        or cycle.get("bundle_revision") != revision
        or cycle.get("bundle_parent_revision") != parent_revision
    ):
        cycle = update_exchange_metadata_json(
            cycle_root / "cycle.json",
            {
                "bundle_revision": revision,
                "bundle_parent_revision": parent_revision,
                "bundle_content_hash": content_hash,
            },
            expected_revision=int(cycle["revision"]),
        )
    bundle["checksum"] = {
        "algorithm": "SHA-256",
        "canonicalization": "JCS",
        "value": _bundle_checksum(bundle),
    }
    secret_paths = find_secret_paths(bundle)
    if secret_paths:
        raise CoachStateError(
            f"Export refused because secret-like fields were found: {', '.join(secret_paths)}"
        )
    return bundle


def _bundle_markdown(bundle: dict[str, Any]) -> str:
    """Render the same concise, human-readable report shipped by the Web app."""

    lines = [
        f"# IELTS Writing Coach cycle {bundle['cycle']['id']}",
        "",
        f"- Exported: {bundle['manifest']['exportedAt']}",
        f"- Source: {bundle['manifest']['source']}",
        f"- Contract: {bundle['contractVersion']}",
        f"- State: {bundle['cycle']['state']}",
        "",
        "## Question",
        "",
        str(bundle["cycle"]["question"]["prompt"]),
        "",
        str(bundle["cycle"]["question"]["instructions"]),
    ]
    for attempt in bundle["attempts"]:
        lines.extend(("", f"## {attempt['version']}", "", str(attempt["content"])))
    assessment = bundle["assessment"]
    if assessment is not None:
        lines.extend(
            (
                "",
                "## AI-estimated assessment",
                "",
                "> This is an AI estimate, not an official IELTS score or teacher certification.",
                "",
                f"Overall: {assessment['overallBand']}",
            )
        )
        for criterion, result in assessment["criteria"].items():
            lines.append(f"- {criterion}: {result['band']} — {result['rationale']}")
    if bundle["issueEvidence"]:
        lines.extend(("", "## Evidence-backed issues", ""))
        for issue in bundle["issueEvidence"]:
            lines.append(
                f"- {issue['skillId']}: “{issue['excerpt']}” — {issue['diagnosis']}"
            )
    return "\n".join(lines) + "\n"


def _archive_manifest(bundle: dict[str, Any]) -> dict[str, Any]:
    return {
        "bundle_id": bundle["manifest"]["bundleId"],
        "cycle_id": bundle["manifest"]["cycleId"],
        "contract_version": bundle["contractVersion"],
        "checksum": bundle["checksum"],
        "files": [ARCHIVE_BUNDLE_FILE, ARCHIVE_REPORT_FILE],
    }


def _atomic_write_bundle_archive(output: Path, bundle: dict[str, Any]) -> None:
    _validate_bundle(bundle)
    entries = {
        ARCHIVE_MANIFEST_FILE: (
            json.dumps(
                _archive_manifest(bundle), ensure_ascii=False, indent=2, sort_keys=True
            )
            + "\n"
        ).encode("utf-8"),
        ARCHIVE_BUNDLE_FILE: (
            json.dumps(bundle, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
        ).encode("utf-8"),
        ARCHIVE_REPORT_FILE: _bundle_markdown(bundle).encode("utf-8"),
    }
    total_size = sum(len(content) for content in entries.values())
    if any(len(content) > MAX_ARCHIVE_ENTRY_BYTES for content in entries.values()):
        raise CoachStateError("Archive export contains an entry larger than 10 MiB")
    if total_size > MAX_ARCHIVE_UNCOMPRESSED_BYTES:
        raise CoachStateError("Archive export expands beyond 50 MiB")

    output.parent.mkdir(parents=True, exist_ok=True)
    with file_lock(output):
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{output.name}.", suffix=".tmp", dir=output.parent
        )
        os.close(descriptor)
        temporary = Path(temporary_name)
        try:
            with zipfile.ZipFile(
                temporary,
                mode="w",
                compression=zipfile.ZIP_DEFLATED,
                compresslevel=6,
                allowZip64=False,
            ) as archive:
                for name, content in entries.items():
                    archive.writestr(name, content)
            if temporary.stat().st_size > MAX_ARCHIVE_BYTES:
                raise CoachStateError("The compressed bundle exceeds 20 MiB")
            with temporary.open("rb") as handle:
                os.fsync(handle.fileno())
            os.replace(temporary, output)
            directory_descriptor = os.open(output.parent, os.O_RDONLY)
            try:
                os.fsync(directory_descriptor)
            finally:
                os.close(directory_descriptor)
        finally:
            with contextlib.suppress(FileNotFoundError):
                temporary.unlink()


def _unsafe_archive_name(name: str) -> bool:
    return (
        not name
        or name.startswith(("/", "\\"))
        or "\\" in name
        or ".." in name
        or "\x00" in name
    )


def _read_archive_member(
    archive: zipfile.ZipFile, info: zipfile.ZipInfo
) -> bytes:
    try:
        with archive.open(info, mode="r") as handle:
            content = handle.read(MAX_ARCHIVE_ENTRY_BYTES + 1)
    except (NotImplementedError, RuntimeError, zipfile.BadZipFile) as exc:
        raise CoachStateError(
            f"The ZIP archive member {info.filename!r} cannot be read: {exc}"
        ) from exc
    if len(content) > MAX_ARCHIVE_ENTRY_BYTES:
        raise CoachStateError(
            f"Archive entry {info.filename!r} expands beyond 10 MiB"
        )
    if len(content) != info.file_size:
        raise CoachStateError(
            f"Archive entry {info.filename!r} size does not match its directory record"
        )
    return content


def _validate_archive_manifest(
    archive_manifest: dict[str, Any], bundle: dict[str, Any]
) -> None:
    _exact_keys(
        archive_manifest,
        {"bundle_id", "cycle_id", "contract_version", "checksum", "files"},
        set(),
        "archive manifest",
    )
    expected = _archive_manifest(bundle)
    if archive_manifest != expected:
        raise CoachStateError(
            "Archive manifest does not match the canonical CycleBundle"
        )


def _read_bundle_archive(source: Path) -> dict[str, Any]:
    if source.stat().st_size > MAX_ARCHIVE_BYTES:
        raise CoachStateError("The compressed bundle exceeds 20 MiB")
    try:
        with zipfile.ZipFile(source, mode="r", allowZip64=False) as archive:
            infos = archive.infolist()
            if len(infos) > MAX_ARCHIVE_ENTRIES:
                raise CoachStateError("The ZIP archive contains more than 50 entries")
            names: set[str] = set()
            total_size = 0
            members: dict[str, zipfile.ZipInfo] = {}
            for info in infos:
                name = info.filename
                if _unsafe_archive_name(name):
                    raise CoachStateError(
                        f"The archive contains an unsafe entry path: {name!r}"
                    )
                if name in names:
                    raise CoachStateError(
                        f"The archive contains a duplicate entry: {name!r}"
                    )
                names.add(name)
                if info.flag_bits & 0x1:
                    raise CoachStateError("Encrypted ZIP entries are not supported")
                if info.file_size > MAX_ARCHIVE_ENTRY_BYTES:
                    raise CoachStateError(
                        f"Archive entry {name!r} exceeds 10 MiB"
                    )
                total_size += info.file_size
                if total_size > MAX_ARCHIVE_UNCOMPRESSED_BYTES:
                    raise CoachStateError("The ZIP archive expands beyond 50 MiB")
                members[name] = info

            bundle_info = members.get(ARCHIVE_BUNDLE_FILE)
            if bundle_info is None or bundle_info.is_dir():
                raise CoachStateError("cycle-bundle.json is missing from the archive")
            bundle_content = _read_archive_member(archive, bundle_info)
            try:
                bundle = json.loads(bundle_content.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise CoachStateError(
                    "cycle-bundle.json is not valid UTF-8 JSON"
                ) from exc
            if not isinstance(bundle, dict):
                raise CoachStateError("cycle-bundle.json must contain a JSON object")
            _validate_bundle(bundle)

            manifest_info = members.get(ARCHIVE_MANIFEST_FILE)
            if manifest_info is not None and not manifest_info.is_dir():
                manifest_content = _read_archive_member(archive, manifest_info)
                try:
                    archive_manifest = json.loads(manifest_content.decode("utf-8"))
                except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                    raise CoachStateError(
                        "Archive manifest.json is not valid UTF-8 JSON"
                    ) from exc
                if not isinstance(archive_manifest, dict):
                    raise CoachStateError("Archive manifest.json must be a JSON object")
                _validate_archive_manifest(archive_manifest, bundle)
            return bundle
    except (zipfile.BadZipFile, zipfile.LargeZipFile) as exc:
        raise CoachStateError(f"The ZIP archive cannot be read: {exc}") from exc


def _read_bundle_source(source: Path) -> dict[str, Any]:
    archive_suffix = source.name.casefold().endswith(".zip")
    try:
        with source.open("rb") as handle:
            signature = handle.read(4)
    except FileNotFoundError as exc:
        raise CoachStateError(f"CycleBundle does not exist: {source}") from exc
    zip_signature = signature in {b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08"}
    if archive_suffix or zip_signature:
        return _read_bundle_archive(source)
    return read_json(source)


def export_bundle(
    workspace: str | Path,
    output: Path,
    *,
    cycle_id: str | None = None,
    include_content: bool = False,
) -> dict[str, Any]:
    root = state_root(workspace)
    manifest = read_json(root / "manifest.json")
    selected_id = cycle_id or manifest.get("active_cycle_id")
    if not isinstance(selected_id, str) or not selected_id:
        raise CoachStateError("Export requires a cycle ID or an active cycle")
    bundle = _build_bundle(root, selected_id, include_content)
    if output.name.casefold().endswith(".zip"):
        _atomic_write_bundle_archive(output, bundle)
    else:
        atomic_write_json(output, bundle)
    return bundle


def _exact_keys(
    value: dict[str, Any],
    required: set[str],
    optional: set[str],
    path: str,
) -> None:
    missing = sorted(required - set(value))
    unknown = sorted(set(value) - required - optional)
    if missing or unknown:
        raise CoachStateError(
            f"{path} fields mismatch; missing={missing}, unknown={unknown}"
        )


def _utf16_excerpt(content: str, start: int, end: int) -> str:
    encoded = content.encode("utf-16-le")
    if start < 0 or end <= start or end * 2 > len(encoded):
        raise CoachStateError("Issue evidence UTF-16 offsets are out of range")
    try:
        return encoded[start * 2 : end * 2].decode("utf-16-le")
    except UnicodeDecodeError as exc:
        raise CoachStateError(
            "Issue evidence offset splits a Unicode surrogate pair"
        ) from exc


def _validate_response_contract(
    response: dict[str, Any], item_ids: set[str], path: str
) -> None:
    _exact_keys(
        response,
        {
            "schemaVersion",
            "id",
            "exerciseItemId",
            "firstAttemptId",
            "finalAttemptId",
            "attempts",
            "evaluations",
        },
        {"currentEvaluationId"},
        path,
    )
    if response["schemaVersion"] != SCHEMA_VERSION:
        raise CoachStateError(f"{path}.schemaVersion is unsupported")
    require_uuid7(response["id"], f"{path}.id")
    exercise_item_id = require_uuid7(
        response["exerciseItemId"], f"{path}.exerciseItemId"
    )
    if exercise_item_id not in item_ids:
        raise CoachStateError(f"{path}.exerciseItemId is outside the bundled lesson")
    attempts = response["attempts"]
    evaluations = response["evaluations"]
    if (
        not isinstance(attempts, list)
        or not attempts
        or not all(isinstance(item, dict) for item in attempts)
    ):
        raise CoachStateError(f"{path}.attempts must be a non-empty object array")
    if not isinstance(evaluations, list) or not all(
        isinstance(item, dict) for item in evaluations
    ):
        raise CoachStateError(f"{path}.evaluations must be an object array")
    attempt_ids: set[str] = set()
    for index, attempt in enumerate(attempts):
        attempt_path = f"{path}.attempts[{index}]"
        _exact_keys(
            attempt,
            {
                "id",
                "answer",
                "submittedAt",
                "elapsedSeconds",
                "hintLevel",
                "referenceAnswerSeen",
            },
            set(),
            attempt_path,
        )
        attempt_id = require_uuid7(attempt["id"], f"{attempt_path}.id")
        if attempt_id in attempt_ids:
            raise CoachStateError(f"{path} reuses exercise attempt ID {attempt_id}")
        attempt_ids.add(attempt_id)
        if not isinstance(attempt["answer"], str):
            raise CoachStateError(f"{attempt_path}.answer must be a string")
        if (
            not isinstance(attempt["elapsedSeconds"], int)
            or isinstance(attempt["elapsedSeconds"], bool)
            or attempt["elapsedSeconds"] < 0
        ):
            raise CoachStateError(f"{attempt_path}.elapsedSeconds must be non-negative")
        if attempt["hintLevel"] not in {
            "NONE",
            "KEYWORD",
            "PARTIAL_FRAME",
            "FULL_FRAME",
            "ANSWER_SHOWN",
        }:
            raise CoachStateError(f"{attempt_path}.hintLevel is unsupported")
        if not isinstance(attempt["referenceAnswerSeen"], bool):
            raise CoachStateError(f"{attempt_path}.referenceAnswerSeen must be boolean")
    for field in ("firstAttemptId", "finalAttemptId"):
        reference = require_uuid7(response[field], f"{path}.{field}")
        if reference not in attempt_ids:
            raise CoachStateError(f"{path}.{field} references a missing attempt")
    evaluation_ids: set[str] = set()
    for index, evaluation in enumerate(evaluations):
        evaluation_path = f"{path}.evaluations[{index}]"
        _exact_keys(
            evaluation,
            {
                "id",
                "attemptId",
                "outcome",
                "confidence",
                "dimensionScores",
                "userAnswerEvidence",
                "mostImportantSuggestion",
                "evaluatorVersion",
                "promptVersion",
                "rubricVersion",
                "adjudicationStatus",
            },
            {"supersedesEvaluationId"},
            evaluation_path,
        )
        evaluation_id = require_uuid7(evaluation["id"], f"{evaluation_path}.id")
        evaluation_ids.add(evaluation_id)
        if (
            require_uuid7(evaluation["attemptId"], f"{evaluation_path}.attemptId")
            not in attempt_ids
        ):
            raise CoachStateError(
                f"{evaluation_path}.attemptId references a missing attempt"
            )
        if evaluation["outcome"] not in {"PASS", "FAIL", "NO_OPPORTUNITY"}:
            raise CoachStateError(f"{evaluation_path}.outcome is unsupported")
        confidence = evaluation["confidence"]
        if (
            not isinstance(confidence, (int, float))
            or isinstance(confidence, bool)
            or not 0 <= confidence <= 1
        ):
            raise CoachStateError(f"{evaluation_path}.confidence must be 0–1")
        scores = evaluation["dimensionScores"]
        if not isinstance(scores, dict) or any(
            not isinstance(score, (int, float))
            or isinstance(score, bool)
            or not 0 <= score <= 1
            for score in scores.values()
        ):
            raise CoachStateError(f"{evaluation_path}.dimensionScores is invalid")
        evidence = evaluation["userAnswerEvidence"]
        if not isinstance(evidence, list) or any(
            not isinstance(item, str) or not item for item in evidence
        ):
            raise CoachStateError(f"{evaluation_path}.userAnswerEvidence is invalid")
        for field in (
            "mostImportantSuggestion",
            "evaluatorVersion",
            "promptVersion",
            "rubricVersion",
        ):
            if not isinstance(evaluation[field], str) or (
                field != "mostImportantSuggestion" and not evaluation[field]
            ):
                raise CoachStateError(f"{evaluation_path}.{field} is invalid")
        if evaluation["adjudicationStatus"] not in {
            "ACCEPTED",
            "DISPUTED",
            "SUPERSEDED",
            "PENDING",
        }:
            raise CoachStateError(
                f"{evaluation_path}.adjudicationStatus is unsupported"
            )
        if evaluation.get("supersedesEvaluationId") is not None:
            require_uuid7(
                evaluation["supersedesEvaluationId"],
                f"{evaluation_path}.supersedesEvaluationId",
            )
    if response.get("currentEvaluationId") is not None:
        current_id = require_uuid7(
            response["currentEvaluationId"], f"{path}.currentEvaluationId"
        )
        if current_id not in evaluation_ids:
            raise CoachStateError(
                f"{path}.currentEvaluationId references a missing evaluation"
            )


def _validate_bundle(bundle: dict[str, Any]) -> dict[str, Any]:
    required_root = {
        "contractVersion",
        "manifest",
        "checksum",
        "cycle",
        "attempts",
        "assessment",
        "issueEvidence",
        "objectives",
        "lesson",
        "evidence",
        "dueTasks",
        "conflicts",
    }
    if set(bundle) != required_root:
        missing = sorted(required_root - set(bundle))
        unknown = sorted(set(bundle) - required_root)
        raise CoachStateError(
            f"CycleBundle root mismatch; missing={missing}, unknown={unknown}"
        )
    if bundle.get("contractVersion") != EXCHANGE_VERSION:
        raise CoachStateError(
            f"Unsupported contract version: {bundle.get('contractVersion')!r}; expected {EXCHANGE_VERSION}"
        )
    checksum = bundle.get("checksum")
    if (
        not isinstance(checksum, dict)
        or checksum.get("algorithm") != "SHA-256"
        or checksum.get("canonicalization") != "JCS"
    ):
        raise CoachStateError("CycleBundle checksum must use SHA-256 with JCS")
    _exact_keys(checksum, {"algorithm", "canonicalization", "value"}, set(), "checksum")
    if (
        not isinstance(checksum.get("value"), str)
        or re.fullmatch(r"[a-f0-9]{64}", checksum["value"]) is None
    ):
        raise CoachStateError(
            "CycleBundle checksum value must be 64 lowercase hexadecimal characters"
        )
    if checksum.get("value") != _bundle_checksum(bundle):
        raise CoachStateError(
            "CycleBundle checksum does not match the canonical bundle"
        )
    secret_paths = find_secret_paths(bundle)
    if secret_paths:
        raise CoachStateError(
            f"Import refused because secret-like fields were found: {', '.join(secret_paths)}"
        )
    contract_timestamp = re.compile(
        r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{3})?Z$"
    )

    def check_timestamps(value: Any, path: str = "$") -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                child_path = f"{path}.{key}"
                if key.endswith("At") and child is not None:
                    if (
                        not isinstance(child, str)
                        or contract_timestamp.fullmatch(child) is None
                    ):
                        raise CoachStateError(
                            f"{child_path} must be a canonical UTC contract timestamp"
                        )
                    parse_iso(child)
                check_timestamps(child, child_path)
        elif isinstance(value, list):
            for index, child in enumerate(value):
                check_timestamps(child, f"{path}[{index}]")

    check_timestamps(bundle)
    manifest = bundle.get("manifest")
    cycle = bundle.get("cycle")
    due_tasks = bundle.get("dueTasks")
    lesson = bundle.get("lesson")
    if not all(
        isinstance(value, dict) for value in (manifest, cycle, due_tasks, lesson)
    ):
        raise CoachStateError(
            "CycleBundle manifest, cycle, lesson and dueTasks must be objects"
        )
    _exact_keys(
        manifest,
        {
            "bundleId",
            "cycleId",
            "source",
            "exportedAt",
            "revision",
            "parentRevision",
            "appendOnlyEntityIds",
        },
        set(),
        "manifest",
    )
    _exact_keys(
        cycle,
        {"id", "state", "question", "createdAt", "updatedAt"},
        {"coreCompletedAt"},
        "cycle",
    )
    _exact_keys(lesson, {"plan", "responses"}, set(), "lesson")
    _exact_keys(due_tasks, {"rewrite", "transfers", "mixedReview"}, set(), "dueTasks")
    cycle_id = require_uuid7(cycle.get("id"), "cycle.id")
    require_uuid7(manifest.get("bundleId"), "manifest.bundleId")
    require_uuid7(manifest.get("cycleId"), "manifest.cycleId")
    if manifest.get("source") not in {"WEB", "SKILL"}:
        raise CoachStateError("CycleBundle manifest.source must be WEB or SKILL")
    if manifest.get("cycleId") != cycle_id:
        raise CoachStateError("CycleBundle manifest.cycleId must equal cycle.id")
    revision = manifest.get("revision")
    parent = manifest.get("parentRevision")
    if not isinstance(revision, int) or isinstance(revision, bool) or revision < 1:
        raise CoachStateError("CycleBundle revision must be a positive integer")
    if (revision == 1 and parent is not None) or (
        parent is not None
        and (
            not isinstance(parent, int)
            or isinstance(parent, bool)
            or parent >= revision
        )
    ):
        raise CoachStateError("CycleBundle parentRevision is inconsistent")
    append_ids = manifest.get("appendOnlyEntityIds")
    if (
        not isinstance(append_ids, list)
        or not append_ids
        or len(append_ids) != len(set(append_ids))
    ):
        raise CoachStateError(
            "CycleBundle appendOnlyEntityIds must be a non-empty unique array"
        )
    for index, entity_id in enumerate(append_ids):
        require_uuid7(entity_id, f"manifest.appendOnlyEntityIds[{index}]")
    append_set = {str(value) for value in append_ids}
    for timestamp in (
        manifest.get("exportedAt"),
        cycle.get("createdAt"),
        cycle.get("updatedAt"),
    ):
        parse_iso(str(timestamp or ""))
    question = cycle.get("question")
    if not isinstance(question, dict) or not all(
        isinstance(question.get(field), str) and question.get(field)
        for field in ("id", "prompt", "instructions")
    ):
        raise CoachStateError("CycleBundle question is incomplete")
    _exact_keys(question, {"id", "prompt", "instructions"}, set(), "cycle.question")
    require_uuid7(question["id"], "cycle.question.id")
    if cycle.get("state") not in CYCLE_STATES:
        raise CoachStateError("CycleBundle cycle.state is unsupported")
    for field in ("attempts", "issueEvidence", "objectives", "evidence", "conflicts"):
        if not isinstance(bundle.get(field), list) or not all(
            isinstance(item, dict) for item in bundle[field]
        ):
            raise CoachStateError(f"CycleBundle {field} must be an object array")
    if not isinstance(lesson.get("responses"), list) or not all(
        isinstance(item, dict) for item in lesson.get("responses", [])
    ):
        raise CoachStateError("CycleBundle lesson.responses must be an object array")
    if lesson.get("plan") is not None and not isinstance(lesson.get("plan"), dict):
        raise CoachStateError("CycleBundle lesson.plan must be an object or null")
    if not isinstance(due_tasks.get("rewrite"), dict) or not isinstance(
        due_tasks.get("mixedReview"), dict
    ):
        raise CoachStateError("CycleBundle is missing rewrite or mixed-review task")
    if not isinstance(due_tasks.get("transfers"), list) or not all(
        isinstance(item, dict) for item in due_tasks.get("transfers", [])
    ):
        raise CoachStateError("CycleBundle dueTasks.transfers must be an object array")

    attempt_ids: set[str] = set()
    versions: set[str] = set()
    if len(bundle["attempts"]) > 2:
        raise CoachStateError("CycleBundle contains more than two essay attempts")
    for index, attempt in enumerate(bundle["attempts"]):
        path = f"attempts[{index}]"
        _exact_keys(
            attempt,
            {
                "id",
                "version",
                "content",
                "startedAt",
                "submittedAt",
                "wordCount",
                "assisted",
                "interrupted",
            },
            {"draftBeforeSelfCheck", "draftAfterSelfCheck"},
            path,
        )
        attempt_id = require_uuid7(attempt["id"], f"{path}.id")
        if attempt_id in attempt_ids:
            raise CoachStateError(f"CycleBundle reuses essay attempt ID {attempt_id}")
        attempt_ids.add(attempt_id)
        if attempt["version"] not in {"V1", "V2"} or attempt["version"] in versions:
            raise CoachStateError(f"{path}.version is invalid or duplicated")
        versions.add(str(attempt["version"]))
        if not isinstance(attempt["content"], str) or not attempt["content"]:
            raise CoachStateError(f"{path}.content must be non-empty")
        if (
            not isinstance(attempt["wordCount"], int)
            or isinstance(attempt["wordCount"], bool)
            or attempt["wordCount"] < 0
        ):
            raise CoachStateError(f"{path}.wordCount must be non-negative")
        if not isinstance(attempt["assisted"], bool) or not isinstance(
            attempt["interrupted"], bool
        ):
            raise CoachStateError(f"{path} assistance flags must be boolean")
        for field in ("draftBeforeSelfCheck", "draftAfterSelfCheck"):
            if field in attempt and not isinstance(attempt[field], str):
                raise CoachStateError(f"{path}.{field} must be a string")

    issue_ids: set[str] = set()
    for index, issue in enumerate(bundle["issueEvidence"]):
        path = f"issueEvidence[{index}]"
        _exact_keys(
            issue,
            {
                "schemaVersion",
                "id",
                "essayAttemptId",
                "skillId",
                "startOffset",
                "endOffset",
                "excerpt",
                "diagnosis",
                "categories",
                "hardGrammarError",
                "severity",
                "confidence",
                "adjudicationStatus",
            },
            set(),
            path,
        )
        if issue["schemaVersion"] != SCHEMA_VERSION:
            raise CoachStateError(f"{path}.schemaVersion is unsupported")
        issue_id = require_uuid7(issue["id"], f"{path}.id")
        issue_ids.add(issue_id)
        essay_attempt_id = require_uuid7(
            issue["essayAttemptId"], f"{path}.essayAttemptId"
        )
        if essay_attempt_id not in attempt_ids:
            raise CoachStateError(f"{path} references an attempt outside the bundle")
        if issue["skillId"] not in SUPPORTED_SKILL_IDS:
            raise CoachStateError(f"{path}.skillId is unsupported")
        start, end = issue["startOffset"], issue["endOffset"]
        if (
            not isinstance(start, int)
            or isinstance(start, bool)
            or not isinstance(end, int)
            or isinstance(end, bool)
        ):
            raise CoachStateError(f"{path} offsets must be integers")
        attempt_content = next(
            item["content"]
            for item in bundle["attempts"]
            if item["id"] == essay_attempt_id
        )
        if _utf16_excerpt(attempt_content, start, end) != issue["excerpt"]:
            raise CoachStateError(
                f"{path}.excerpt does not match the immutable attempt snapshot"
            )
        if not isinstance(issue["diagnosis"], str) or not issue["diagnosis"]:
            raise CoachStateError(f"{path}.diagnosis is required")
        categories = issue["categories"]
        allowed_categories = {
            "HARD_GRAMMAR_ERROR",
            "COLLOCATION_NATURALNESS",
            "CHINESE_INFORMATION_ORGANIZATION",
            "OPTIONAL_OPTIMIZATION",
        }
        if (
            not isinstance(categories, list)
            or not categories
            or len(categories) != len(set(categories))
            or any(value not in allowed_categories for value in categories)
        ):
            raise CoachStateError(f"{path}.categories is invalid")
        if not isinstance(issue["hardGrammarError"], bool) or issue["severity"] not in {
            "LOW",
            "MEDIUM",
            "HIGH",
        }:
            raise CoachStateError(f"{path} grammar/severity fields are invalid")
        issue_confidence = issue["confidence"]
        if (
            not isinstance(issue_confidence, (int, float))
            or isinstance(issue_confidence, bool)
            or not 0 <= issue_confidence <= 1
        ):
            raise CoachStateError(f"{path}.confidence must be 0–1")
        if issue["adjudicationStatus"] not in {"ACCEPTED", "DISPUTED", "CORRECTED"}:
            raise CoachStateError(f"{path}.adjudicationStatus is unsupported")

    assessment = bundle["assessment"]
    if assessment is not None:
        if not isinstance(assessment, dict):
            raise CoachStateError("CycleBundle assessment must be an object or null")
        _exact_keys(
            assessment,
            {
                "schemaVersion",
                "id",
                "attemptId",
                "rubricVersion",
                "modelId",
                "overallBand",
                "criteria",
                "issueEvidenceIds",
            },
            set(),
            "assessment",
        )
        if assessment["schemaVersion"] != SCHEMA_VERSION:
            raise CoachStateError("assessment.schemaVersion is unsupported")
        require_uuid7(assessment["id"], "assessment.id")
        if (
            require_uuid7(assessment["attemptId"], "assessment.attemptId")
            not in attempt_ids
        ):
            raise CoachStateError("assessment.attemptId is outside the bundle")
        if (
            not isinstance(assessment["rubricVersion"], str)
            or not assessment["rubricVersion"]
            or not isinstance(assessment["modelId"], str)
            or not assessment["modelId"]
        ):
            raise CoachStateError("assessment rubricVersion and modelId are required")
        band = assessment["overallBand"]
        if (
            not isinstance(band, (int, float))
            or isinstance(band, bool)
            or not 0 <= band <= 9
            or band * 2 != int(band * 2)
        ):
            raise CoachStateError(
                "assessment.overallBand must be a half-band from 0 to 9"
            )
        criteria = assessment["criteria"]
        if not isinstance(criteria, dict) or set(criteria) != {"TR", "CC", "LR", "GRA"}:
            raise CoachStateError("assessment.criteria must contain TR, CC, LR and GRA")
        for dimension, criterion in criteria.items():
            if not isinstance(criterion, dict):
                raise CoachStateError(
                    f"assessment.criteria.{dimension} must be an object"
                )
            _exact_keys(
                criterion,
                {"band", "confidence", "rationale", "evidenceIds"},
                set(),
                f"assessment.criteria.{dimension}",
            )
            criterion_band = criterion["band"]
            criterion_confidence = criterion["confidence"]
            if (
                not isinstance(criterion_band, (int, float))
                or isinstance(criterion_band, bool)
                or not 0 <= criterion_band <= 9
                or criterion_band * 2 != int(criterion_band * 2)
            ):
                raise CoachStateError(
                    f"assessment.criteria.{dimension}.band is invalid"
                )
            if (
                not isinstance(criterion_confidence, (int, float))
                or isinstance(criterion_confidence, bool)
                or not 0 <= criterion_confidence <= 1
            ):
                raise CoachStateError(
                    f"assessment.criteria.{dimension}.confidence is invalid"
                )
            if (
                not isinstance(criterion["rationale"], str)
                or not criterion["rationale"]
            ):
                raise CoachStateError(
                    f"assessment.criteria.{dimension}.rationale is required"
                )
            if not isinstance(criterion["evidenceIds"], list):
                raise CoachStateError(
                    f"assessment.criteria.{dimension}.evidenceIds must be an array"
                )
        references = assessment["issueEvidenceIds"]
        if not isinstance(references, list) or any(
            require_uuid7(value, "assessment.issueEvidenceId") not in issue_ids
            for value in references
        ):
            raise CoachStateError(
                "assessment.issueEvidenceIds references missing evidence"
            )

    objective_ids: set[str] = set()
    for index, objective in enumerate(bundle["objectives"]):
        path = f"objectives[{index}]"
        _exact_keys(
            objective,
            {
                "id",
                "trainingCycleId",
                "skillId",
                "role",
                "sourceEvidenceIds",
                "priority",
                "successCriterion",
            },
            set(),
            path,
        )
        objective_id = require_uuid7(objective["id"], f"{path}.id")
        objective_ids.add(objective_id)
        if (
            require_uuid7(objective["trainingCycleId"], f"{path}.trainingCycleId")
            != cycle_id
        ):
            raise CoachStateError(f"{path} references another cycle")
        if objective["skillId"] not in SUPPORTED_SKILL_IDS or objective["role"] not in {
            "CORE",
            "SECONDARY",
            "REVIEW",
        }:
            raise CoachStateError(f"{path} skill or role is unsupported")
        if (
            not isinstance(objective["priority"], int)
            or isinstance(objective["priority"], bool)
            or objective["priority"] < 1
        ):
            raise CoachStateError(f"{path}.priority must be positive")
        if (
            not isinstance(objective["successCriterion"], str)
            or not objective["successCriterion"]
        ):
            raise CoachStateError(f"{path}.successCriterion is required")
        sources = objective["sourceEvidenceIds"]
        if not isinstance(sources, list) or any(
            require_uuid7(value, f"{path}.sourceEvidenceId") not in issue_ids
            for value in sources
        ):
            raise CoachStateError(
                f"{path}.sourceEvidenceIds references missing issue evidence"
            )

    plan = lesson.get("plan")
    item_ids: set[str] = set()
    if isinstance(plan, dict):
        import validate_lesson

        errors = validate_lesson.validate(plan)
        if errors:
            raise CoachStateError(
                "CycleBundle has an invalid lesson plan: " + "; ".join(errors)
            )
        if plan.get("trainingCycleId") != cycle_id:
            raise CoachStateError("CycleBundle lesson plan references another cycle")
        if plan.get("objectives") != bundle["objectives"]:
            raise CoachStateError(
                "CycleBundle top-level and lesson-plan objectives differ"
            )
        item_ids = {
            str(item["id"])
            for block in plan.get("blocks", [])
            for item in block.get("items", [])
        }
    elif bundle["objectives"]:
        raise CoachStateError(
            "CycleBundle cannot contain lesson objectives without a lesson plan"
        )
    for index, response in enumerate(lesson["responses"]):
        _validate_response_contract(response, item_ids, f"lesson.responses[{index}]")

    evidence_allowed = {
        "schemaVersion",
        "id",
        "userId",
        "skillId",
        "objectiveId",
        "kind",
        "outcome",
        "independent",
        "firstAttempt",
        "hintLevel",
        "confidence",
        "validForStateTransition",
        "adjudicationStatus",
        "contextId",
        "topicId",
        "sourceEntityType",
        "sourceEntityId",
        "occurredAt",
        "naturalOpportunity",
        "targetPrompted",
        "unseenSurfaceForm",
        "coreErrorRecurred",
        "instructionExposureAt",
        "prerequisiteSkipped",
        "assisted",
    }
    evidence_required = {
        "schemaVersion",
        "id",
        "userId",
        "skillId",
        "kind",
        "outcome",
        "independent",
        "firstAttempt",
        "hintLevel",
        "confidence",
        "validForStateTransition",
        "adjudicationStatus",
        "contextId",
        "topicId",
        "sourceEntityType",
        "sourceEntityId",
        "occurredAt",
    }
    evidence_kinds = {
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
    known_source_ids = attempt_ids | issue_ids | objective_ids | item_ids
    known_source_ids.update(
        str(value["id"])
        for response in lesson["responses"]
        for value in [response, *response["attempts"], *response["evaluations"]]
    )
    for index, event in enumerate(bundle["evidence"]):
        path = f"evidence[{index}]"
        _exact_keys(
            event, evidence_required, evidence_allowed - evidence_required, path
        )
        if event["schemaVersion"] != SCHEMA_VERSION:
            raise CoachStateError(f"{path}.schemaVersion is unsupported")
        require_uuid7(event["id"], f"{path}.id")
        require_uuid7(event["userId"], f"{path}.userId")
        if (
            event["skillId"] not in SUPPORTED_SKILL_IDS
            or event["kind"] not in evidence_kinds
        ):
            raise CoachStateError(f"{path} skill or kind is unsupported")
        if (
            event.get("objectiveId") is not None
            and require_uuid7(event["objectiveId"], f"{path}.objectiveId")
            not in objective_ids
        ):
            raise CoachStateError(f"{path}.objectiveId references a missing objective")
        if event["outcome"] not in {"PASS", "FAIL", "NO_OPPORTUNITY"}:
            raise CoachStateError(f"{path}.outcome is unsupported")
        for field in ("independent", "firstAttempt", "validForStateTransition"):
            if not isinstance(event[field], bool):
                raise CoachStateError(f"{path}.{field} must be boolean")
        for field in (
            "naturalOpportunity",
            "targetPrompted",
            "unseenSurfaceForm",
            "coreErrorRecurred",
            "prerequisiteSkipped",
            "assisted",
        ):
            if field in event and not isinstance(event[field], bool):
                raise CoachStateError(f"{path}.{field} must be boolean")
        for field in ("contextId", "topicId"):
            if not isinstance(event[field], str) or not event[field]:
                raise CoachStateError(f"{path}.{field} is required")
        if event["hintLevel"] not in {
            "NONE",
            "KEYWORD",
            "PARTIAL_FRAME",
            "FULL_FRAME",
            "ANSWER_SHOWN",
        }:
            raise CoachStateError(f"{path}.hintLevel is unsupported")
        confidence = event["confidence"]
        if (
            not isinstance(confidence, (int, float))
            or isinstance(confidence, bool)
            or not 0 <= confidence <= 1
        ):
            raise CoachStateError(f"{path}.confidence must be 0–1")
        if event["adjudicationStatus"] not in {
            "ACCEPTED",
            "DISPUTED",
            "SUPERSEDED",
            "PENDING",
        }:
            raise CoachStateError(f"{path}.adjudicationStatus is unsupported")
        if event["sourceEntityType"] not in {
            "ESSAY",
            "EXERCISE",
            "REWRITE",
            "TRANSFER",
        }:
            raise CoachStateError(f"{path}.sourceEntityType is unsupported")
        source_id = require_uuid7(event["sourceEntityId"], f"{path}.sourceEntityId")
        if (
            event["sourceEntityType"] in {"ESSAY", "EXERCISE"}
            and source_id not in known_source_ids
        ):
            raise CoachStateError(f"{path}.sourceEntityId is outside the bundle")
        if (
            event["kind"] == "DELAYED_REWRITE"
            and event["sourceEntityType"] != "REWRITE"
        ):
            raise CoachStateError(f"{path} delayed evidence must come from REWRITE")
        if (
            event["kind"] == "CROSS_TOPIC_TRANSFER"
            and event["sourceEntityType"] != "TRANSFER"
        ):
            raise CoachStateError(f"{path} transfer evidence must come from TRANSFER")
        if (
            event["outcome"] == "NO_OPPORTUNITY" or event.get("assisted") is True
        ) and event["validForStateTransition"]:
            raise CoachStateError(f"{path} cannot change ability state")

    rewrite_task = due_tasks["rewrite"]
    mixed_review = due_tasks["mixedReview"]
    _exact_keys(
        rewrite_task,
        {
            "id",
            "status",
            "targetRewriteAt",
            "dueAt",
            "lastInstructionExposureAt",
            "assisted",
            "prerequisiteSkipped",
        },
        set(),
        "dueTasks.rewrite",
    )
    require_uuid7(rewrite_task["id"], "dueTasks.rewrite.id")
    if rewrite_task["status"] not in {
        "PLANNED",
        "LOCKED",
        "READY",
        "ACTIVE",
        "COMPLETED",
        "SKIPPED_PREREQUISITE",
        "RESCHEDULED",
    }:
        raise CoachStateError("dueTasks.rewrite.status is unsupported")
    if not isinstance(rewrite_task["assisted"], bool) or not isinstance(
        rewrite_task["prerequisiteSkipped"], bool
    ):
        raise CoachStateError("dueTasks.rewrite assistance flags must be boolean")
    transfer_ids: set[str] = set()
    for index, task in enumerate(due_tasks["transfers"]):
        path = f"dueTasks.transfers[{index}]"
        _exact_keys(
            task,
            {
                "id",
                "objectiveId",
                "status",
                "windowStartsAt",
                "windowEndsAt",
                "dueAt",
                "naturalOpportunityDefinition",
                "noHintRequired",
            },
            set(),
            path,
        )
        transfer_ids.add(require_uuid7(task["id"], f"{path}.id"))
        task_objective_id = require_uuid7(task["objectiveId"], f"{path}.objectiveId")
        if (
            task_objective_id not in objective_ids
            and task_objective_id not in append_set
        ):
            raise CoachStateError(
                f"{path}.objectiveId is absent from the bundle history"
            )
        if task["status"] not in {
            "PLANNED",
            "READY",
            "COMPLETED",
            "NO_OPPORTUNITY",
            "RESCHEDULED",
        }:
            raise CoachStateError(f"{path}.status is unsupported")
        if (
            not isinstance(task["naturalOpportunityDefinition"], str)
            or not task["naturalOpportunityDefinition"]
            or task["noHintRequired"] is not True
        ):
            raise CoachStateError(
                f"{path} opportunity definition or no-hint gate is invalid"
            )
    _exact_keys(mixed_review, {"id", "dueAt", "status"}, set(), "dueTasks.mixedReview")
    require_uuid7(mixed_review["id"], "dueTasks.mixedReview.id")
    if mixed_review["status"] not in {"PLANNED", "READY", "COMPLETED", "RESCHEDULED"}:
        raise CoachStateError("dueTasks.mixedReview.status is unsupported")
    for event in bundle["evidence"]:
        source_id = str(event["sourceEntityId"])
        if event["sourceEntityType"] == "REWRITE" and source_id != rewrite_task["id"]:
            raise CoachStateError(
                "Rewrite evidence references a different rewrite task"
            )
        if event["sourceEntityType"] == "TRANSFER" and source_id not in transfer_ids:
            raise CoachStateError(
                "Transfer evidence references a missing transfer task"
            )

    append_set_for_conflicts = append_set
    for index, conflict in enumerate(bundle["conflicts"]):
        path = f"conflicts[{index}]"
        _exact_keys(
            conflict,
            {
                "id",
                "entityType",
                "entityId",
                "fieldPaths",
                "localValueHash",
                "incomingValueHash",
                "status",
                "detectedAt",
            },
            {"resolutionNote"},
            path,
        )
        require_uuid7(conflict["id"], f"{path}.id")
        entity_id = require_uuid7(conflict["entityId"], f"{path}.entityId")
        if entity_id not in append_set_for_conflicts:
            raise CoachStateError(f"{path}.entityId is absent from append-only history")
        if conflict["entityType"] not in {
            "ATTEMPT",
            "ASSESSMENT",
            "OBJECTIVE",
            "LESSON_RESPONSE",
            "EVIDENCE",
            "DUE_TASK",
        }:
            raise CoachStateError(f"{path}.entityType is unsupported")
        paths = conflict["fieldPaths"]
        if (
            not isinstance(paths, list)
            or not paths
            or len(paths) != len(set(paths))
            or any(
                not isinstance(value, str) or not value.startswith("/")
                for value in paths
            )
        ):
            raise CoachStateError(f"{path}.fieldPaths is invalid")
        for field in ("localValueHash", "incomingValueHash"):
            if (
                not isinstance(conflict[field], str)
                or re.fullmatch(r"[a-f0-9]{64}", conflict[field]) is None
            ):
                raise CoachStateError(f"{path}.{field} is invalid")
        if conflict["status"] not in {
            "UNRESOLVED",
            "KEEP_LOCAL",
            "KEEP_INCOMING",
            "MERGED",
        }:
            raise CoachStateError(f"{path}.status is unsupported")
    skill_values: list[Any] = []
    skill_values.extend(issue.get("skillId") for issue in bundle["issueEvidence"])
    skill_values.extend(objective.get("skillId") for objective in bundle["objectives"])
    skill_values.extend(event.get("skillId") for event in bundle["evidence"])
    plan = lesson.get("plan")
    if isinstance(plan, dict):
        for objective in plan.get("objectives", []):
            if isinstance(objective, dict):
                skill_values.append(objective.get("skillId"))
        for block in plan.get("blocks", []):
            if isinstance(block, dict):
                skill_values.extend(
                    item.get("primarySkillId")
                    for item in block.get("items", [])
                    if isinstance(item, dict)
                )
    unsupported = sorted(
        {str(value) for value in skill_values if value not in SUPPORTED_SKILL_IDS}
    )
    if unsupported:
        raise CoachStateError(
            f"CycleBundle uses unsupported skill IDs: {', '.join(unsupported)}"
        )
    concrete_kinds: dict[str, str] = {}
    for entity_id, kind in _concrete_entity_pairs(bundle):
        require_uuid7(entity_id, "concrete entity ID")
        prior_kind = concrete_kinds.get(entity_id)
        if prior_kind is not None:
            raise CoachStateError(
                f"Concrete entity ID {entity_id} is reused as {prior_kind} and {kind}"
            )
        concrete_kinds[entity_id] = kind
    missing_ids = sorted(
        _concrete_entity_ids(bundle) - {str(value) for value in append_ids}
    )
    if missing_ids:
        raise CoachStateError(
            f"CycleBundle append-only manifest is missing IDs: {', '.join(missing_ids)}"
        )
    return bundle


def _json_text(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def _local_cycle_files(bundle: dict[str, Any]) -> dict[str, str]:
    manifest = bundle["manifest"]
    cycle = bundle["cycle"]
    due = bundle["dueTasks"]
    plan = bundle["lesson"]["plan"]
    attempts = bundle["attempts"]
    assistance = (
        "external_assistance"
        if any(item.get("assisted") for item in attempts)
        else "independent"
    )
    lesson_status = str(plan.get("status")) if isinstance(plan, dict) else "PLANNING"
    active_pair: tuple[str, str] | None = None
    if lesson_status == "ACTIVE" and isinstance(plan, dict):
        active_pair = next(
            (
                (str(block["id"]), str(item["id"]))
                for block in sorted(
                    plan.get("blocks", []), key=lambda value: int(value.get("order", 0))
                )
                if block.get("path") == "CORE" and block.get("kind") != "BREAK"
                for item in block.get("items", [])
                if not item.get("isReserve", False)
            ),
            None,
        )
    local_cycle: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "revision": 1,
        "created_at": str(cycle["createdAt"]),
        "updated_at": str(cycle["updatedAt"]),
        "cycle_id": str(cycle["id"]),
        "state": str(cycle["state"]),
        "question_id": str(cycle["question"]["id"]),
        "abstract_targets": [],
        "assistance": assistance,
        "active_block_id": active_pair[0] if active_pair else None,
        "active_item_id": active_pair[1] if active_pair else None,
        "lesson_elapsed_seconds": 0,
        "lesson_status": lesson_status,
        "rewrite_status": str(due["rewrite"]["status"]),
        "transfer_statuses": [str(task["status"]) for task in due["transfers"]],
        "rewrite_task": due["rewrite"],
        "transfer_tasks": due["transfers"],
        "mixed_review_task": due["mixedReview"],
        "conflicts": bundle["conflicts"],
        "source": str(manifest["source"]),
        "bundle_revision": int(manifest["revision"]),
        "bundle_parent_revision": manifest["parentRevision"],
        "bundle_content_hash": _bundle_content_hash(bundle),
        "imported_bundle_checksums": {
            str(manifest["bundleId"]): str(bundle["checksum"]["value"])
        },
        "append_only_entity_ids": list(manifest["appendOnlyEntityIds"]),
    }
    if cycle.get("coreCompletedAt"):
        local_cycle["core_completed_at"] = cycle["coreCompletedAt"]
    files = {
        "cycle.json": _json_text(local_cycle),
        "question.md": str(cycle["question"]["prompt"]).rstrip() + "\n",
        "question-instructions.md": str(cycle["question"]["instructions"]).rstrip()
        + "\n",
    }
    for attempt in attempts:
        version = 1 if attempt["version"] == "V1" else 2
        files[f"attempt-v{version}.md"] = str(attempt["content"]).rstrip() + "\n"
        meta = {key: value for key, value in attempt.items() if key != "content"}
        meta.update(
            {
                "schema_version": SCHEMA_VERSION,
                "revision": 1,
                "created_at": str(attempt["startedAt"]),
                "updated_at": str(attempt["submittedAt"]),
            }
        )
        files[f"attempt-v{version}.meta.json"] = _json_text(meta)
    if bundle["assessment"] is not None:
        files["assessment.json"] = _json_text(bundle["assessment"])
    if bundle["issueEvidence"]:
        files["issue-evidence.json"] = _json_text(
            {"issueEvidence": bundle["issueEvidence"]}
        )
    if bundle["objectives"]:
        files["objectives.json"] = _json_text({"objectives": bundle["objectives"]})
    if plan is not None:
        files["lesson-plan.json"] = _json_text(plan)
    if bundle["lesson"]["responses"]:
        files["responses.jsonl"] = "".join(
            canonical_json(response) + "\n"
            for response in bundle["lesson"]["responses"]
        )
    return files


def _semantic_bundle_view(bundle: dict[str, Any]) -> dict[str, Any]:
    return {
        key: bundle[key]
        for key in (
            "contractVersion",
            "cycle",
            "attempts",
            "assessment",
            "issueEvidence",
            "objectives",
            "lesson",
            "evidence",
            "dueTasks",
            "conflicts",
        )
    }


def _indexed(values: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {str(value["id"]): value for value in values}


def _require_append_only_values(
    local_values: list[dict[str, Any]],
    incoming_values: list[dict[str, Any]],
    path: str,
    conflicts: list[str],
) -> None:
    incoming = _indexed(incoming_values)
    for local in local_values:
        entity_id = str(local["id"])
        if entity_id not in incoming or incoming[entity_id] != local:
            conflicts.append(f"{path}/{entity_id}")


def _plan_bundle_merge(
    local: dict[str, Any], incoming: dict[str, Any]
) -> tuple[str, list[str]]:
    if (
        local["manifest"]["revision"] == incoming["manifest"]["revision"]
        and _bundle_content_hash(local) == _bundle_content_hash(incoming)
    ):
        return "IDEMPOTENT", []

    conflicts: list[str] = []
    local_revision = int(local["manifest"]["revision"])
    if (
        incoming["manifest"]["revision"] != local_revision + 1
        or incoming["manifest"]["parentRevision"] != local_revision
    ):
        conflicts.extend(("/manifest/revision", "/manifest/parentRevision"))
    if local["cycle"]["id"] != incoming["cycle"]["id"]:
        conflicts.append("/cycle/id")
    if local["cycle"]["question"] != incoming["cycle"]["question"]:
        conflicts.append("/cycle/question")
    if parse_iso(local["cycle"]["createdAt"]) != parse_iso(
        incoming["cycle"]["createdAt"]
    ):
        conflicts.append("/cycle/createdAt")
    if local["cycle"].get("coreCompletedAt") is not None and local["cycle"].get(
        "coreCompletedAt"
    ) != incoming["cycle"].get("coreCompletedAt"):
        conflicts.append("/cycle/coreCompletedAt")
    incoming_history = set(incoming["manifest"]["appendOnlyEntityIds"])
    for entity_id in local["manifest"]["appendOnlyEntityIds"]:
        if entity_id not in incoming_history:
            conflicts.append(f"/manifest/appendOnlyEntityIds/{entity_id}")

    for field in ("attempts", "issueEvidence", "objectives", "evidence", "conflicts"):
        _require_append_only_values(
            local[field], incoming[field], f"/{field}", conflicts
        )
    if local["assessment"] is not None and local["assessment"] != incoming["assessment"]:
        conflicts.append("/assessment")
    if local["lesson"]["plan"] is not None and local["lesson"]["plan"] != incoming[
        "lesson"
    ]["plan"]:
        conflicts.append("/lesson/plan")
    incoming_responses = _indexed(incoming["lesson"]["responses"])
    for local_response in local["lesson"]["responses"]:
        response_id = str(local_response["id"])
        candidate = incoming_responses.get(response_id)
        if candidate is None:
            conflicts.append(f"/lesson/responses/{response_id}")
            continue
        if any(
            local_response[field] != candidate[field]
            for field in ("schemaVersion", "exerciseItemId", "firstAttemptId")
        ):
            conflicts.append(f"/lesson/responses/{response_id}/identity")
        _require_append_only_values(
            local_response["attempts"],
            candidate["attempts"],
            f"/lesson/responses/{response_id}/attempts",
            conflicts,
        )
        _require_append_only_values(
            local_response["evaluations"],
            candidate["evaluations"],
            f"/lesson/responses/{response_id}/evaluations",
            conflicts,
        )
    if local["dueTasks"]["rewrite"]["id"] != incoming["dueTasks"]["rewrite"]["id"]:
        conflicts.append("/dueTasks/rewrite/id")
    incoming_transfers = _indexed(incoming["dueTasks"]["transfers"])
    for local_task in local["dueTasks"]["transfers"]:
        task_id = str(local_task["id"])
        candidate = incoming_transfers.get(task_id)
        if candidate is None or candidate["objectiveId"] != local_task["objectiveId"]:
            conflicts.append(f"/dueTasks/transfers/{task_id}")
    if local["dueTasks"]["mixedReview"]["id"] != incoming["dueTasks"][
        "mixedReview"
    ]["id"]:
        conflicts.append("/dueTasks/mixedReview/id")
    return ("CONFLICT", sorted(set(conflicts))) if conflicts else ("APPEND", [])


def _queue_tasks_from_bundle(bundle: dict[str, Any]) -> list[dict[str, Any]]:
    cycle_id = str(bundle["cycle"]["id"])
    due = bundle["dueTasks"]
    canonical_tasks = [due["rewrite"], *due["transfers"], due["mixedReview"]]
    tasks: list[dict[str, Any]] = []
    for task in canonical_tasks:
        task_id = str(task["id"])
        if task is due["rewrite"]:
            kind = "rewrite"
            target = str(task["targetRewriteAt"])
            due_at = str(task["dueAt"] or task["targetRewriteAt"])
        elif task is due["mixedReview"]:
            kind = "mixed_review"
            target = due_at = str(task["dueAt"])
        else:
            kind = "transfer"
            target = str(task["windowStartsAt"])
            due_at = str(task["dueAt"])
        tasks.append(
            {
                "task_id": task_id,
                "cycle_id": cycle_id,
                "kind": kind,
                "target_at": target,
                "due_at": due_at,
                "status": "DONE"
                if task["status"] in {"COMPLETED", "NO_OPPORTUNITY"}
                else "PENDING",
                "canonical_status": task["status"],
            }
        )
    return tasks


def import_bundle(
    workspace: str | Path, source: Path, *, timezone_name: str = "UTC"
) -> dict[str, Any]:
    bundle = _read_bundle_source(source)
    _validate_bundle(bundle)
    state = str(bundle["cycle"]["state"])
    states_requiring_v1 = set(CYCLE_STATES[CYCLE_STATES.index("SUBMITTED") :])
    states_requiring_plan = set(CYCLE_STATES[CYCLE_STATES.index("LESSON_READY") :])
    states_requiring_v2 = {"COMPARING", "CORE_CYCLE_COMPLETED"}
    attempt_versions = {attempt["version"] for attempt in bundle["attempts"]}
    if state in states_requiring_v1 and "V1" not in attempt_versions:
        raise CoachStateError(
            "This redacted bundle cannot resume its current state because Version 1 is omitted; export again with --include-content"
        )
    if state in states_requiring_plan and bundle["lesson"]["plan"] is None:
        raise CoachStateError(
            "This redacted bundle cannot resume its current state because the lesson plan is omitted; export again with --include-content"
        )
    if state in states_requiring_v2 and "V2" not in attempt_versions:
        raise CoachStateError(
            "This redacted bundle cannot resume its current state because Version 2 is omitted; export again with --include-content"
        )
    initialise(workspace, timezone_name)
    root = state_root(workspace)
    cycle_id = str(bundle["cycle"]["id"])
    destination = root / "cycles" / cycle_id
    with file_lock(root / "bundle-import"):
        existing = destination.exists()
        local_cycle: dict[str, Any] | None = None
        if existing:
            local_cycle = read_json(destination / "cycle.json")
            receipts = local_cycle.get("imported_bundle_checksums", {})
            if not isinstance(receipts, dict):
                raise CoachStateError("cycle imported_bundle_checksums must be an object")
            bundle_id = str(bundle["manifest"]["bundleId"])
            known_checksum = receipts.get(bundle_id)
            if known_checksum is not None:
                if known_checksum != bundle["checksum"]["value"]:
                    raise CoachStateError(
                        f"Bundle ID collision for {bundle_id}; no data was overwritten"
                    )
                return {"imported_cycle_ids": [], "idempotent": True}
            local_bundle = _build_bundle(root, cycle_id, include_content=True)
            merge_kind, conflict_paths = _plan_bundle_merge(local_bundle, bundle)
            if merge_kind == "CONFLICT":
                raise CoachStateError(
                    f"Import conflict for existing cycle {cycle_id} at "
                    f"{', '.join(conflict_paths)}; no data was overwritten"
                )
            if merge_kind == "IDEMPOTENT":
                current = read_json(destination / "cycle.json")
                next_receipts = dict(current.get("imported_bundle_checksums", {}))
                next_receipts[bundle_id] = str(bundle["checksum"]["value"])
                update_exchange_metadata_json(
                    destination / "cycle.json",
                    {"imported_bundle_checksums": next_receipts},
                    expected_revision=int(current["revision"]),
                )
                return {"imported_cycle_ids": [], "idempotent": True}

        local_files = _local_cycle_files(bundle)
        if existing and local_cycle is not None:
            incoming_cycle = json.loads(local_files["cycle.json"])
            receipts = dict(local_cycle.get("imported_bundle_checksums", {}))
            receipts[str(bundle["manifest"]["bundleId"])] = str(
                bundle["checksum"]["value"]
            )
            incoming_cycle.update(
                {
                    "revision": int(local_cycle["revision"]) + 1,
                    "created_at": str(local_cycle["created_at"]),
                    "bundle_revision": int(bundle["manifest"]["revision"]),
                    "bundle_parent_revision": bundle["manifest"]["parentRevision"],
                    "bundle_content_hash": _bundle_content_hash(bundle),
                    "imported_bundle_checksums": receipts,
                }
            )
            local_files["cycle.json"] = _json_text(incoming_cycle)

        source_tasks = _queue_tasks_from_bundle(bundle)
        local_queue = read_json(root / "queue.json")
        incoming_task_ids = {str(task["task_id"]) for task in source_tasks}
        merged_tasks = [
            task
            for task in local_queue.get("tasks", [])
            if str(task.get("task_id")) not in incoming_task_ids
        ] + source_tasks

        source_evidence = bundle["evidence"]
        local_evidence = read_jsonl(root / "evidence.jsonl")
        local_events = {
            str(event.get("id")): event for event in local_evidence if event.get("id")
        }
        new_events: list[dict[str, Any]] = []
        for event in source_evidence:
            event_id = str(event.get("id", ""))
            if not event_id:
                raise CoachStateError("CycleBundle evidence event is missing id")
            if event_id in local_events:
                if local_events[event_id] != event:
                    raise CoachStateError(
                        f"Import conflict for evidence event {event_id}"
                    )
            else:
                new_events.append(event)

        if existing:
            for name, content in local_files.items():
                atomic_write_text(destination / name, content)
        else:
            temporary = destination.with_name(
                f".{destination.name}.import-{secrets.token_hex(4)}"
            )
            temporary.mkdir(parents=True)
            try:
                (temporary / "transfer").mkdir()
                for name, content in local_files.items():
                    (temporary / name).write_text(content, encoding="utf-8")
                temporary.replace(destination)
            finally:
                if temporary.exists():
                    shutil.rmtree(temporary)
        if merged_tasks != local_queue.get("tasks", []):
            update_revisioned_json(root / "queue.json", {"tasks": merged_tasks})
        for event in new_events:
            append_jsonl(root / "evidence.jsonl", event)

        manifest = read_json(root / "manifest.json")
        if manifest.get("active_cycle_id") is None:
            update_revisioned_json(
                root / "manifest.json", {"active_cycle_id": cycle_id}
            )
        return {"imported_cycle_ids": [cycle_id], "idempotent": False}


def _load_json_argument(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    initialise_parser = subparsers.add_parser("init")
    initialise_parser.add_argument("--workspace", required=True)
    initialise_parser.add_argument("--timezone", default="UTC")

    status_parser = subparsers.add_parser("status")
    status_parser.add_argument("--workspace", required=True)
    status_parser.add_argument("--now")

    ids_parser = subparsers.add_parser("new-ids")
    ids_parser.add_argument("--count", type=int, default=1)

    cycle_parser = subparsers.add_parser("new-cycle")
    cycle_parser.add_argument("--workspace", required=True)
    question_group = cycle_parser.add_mutually_exclusive_group(required=True)
    question_group.add_argument("--question")
    question_group.add_argument("--question-file", type=Path)
    cycle_parser.add_argument("--question-id")
    cycle_parser.add_argument("--cycle-id")
    cycle_parser.add_argument("--allow-parallel", action="store_true")

    transition_parser = subparsers.add_parser("transition")
    transition_parser.add_argument("--workspace", required=True)
    transition_parser.add_argument("--cycle-id", required=True)
    transition_parser.add_argument("--to", required=True)
    transition_parser.add_argument("--expected-revision", type=int)

    task_parser = subparsers.add_parser("task-transition")
    task_parser.add_argument("--workspace", required=True)
    task_parser.add_argument("--cycle-id", required=True)
    task_parser.add_argument(
        "--machine",
        choices=("lesson", "rewrite", "transfer", "mixed_review"),
        required=True,
    )
    task_parser.add_argument("--to", required=True)
    task_parser.add_argument("--index", type=int, default=0)
    task_parser.add_argument("--expected-revision", type=int)

    cursor_parser = subparsers.add_parser("lesson-cursor")
    cursor_parser.add_argument("--workspace", required=True)
    cursor_parser.add_argument("--cycle-id", required=True)
    cursor_parser.add_argument("--block-id", required=True)
    cursor_parser.add_argument("--item-id", required=True)
    cursor_parser.add_argument("--elapsed-seconds", type=int, required=True)
    cursor_parser.add_argument("--expected-revision", type=int)

    target_parser = subparsers.add_parser("set-targets")
    target_parser.add_argument("--workspace", required=True)
    target_parser.add_argument("--cycle-id", required=True)
    target_parser.add_argument("--input", type=Path, required=True)
    target_parser.add_argument("--expected-revision", type=int)

    attempt_parser = subparsers.add_parser("save-attempt")
    attempt_parser.add_argument("--workspace", required=True)
    attempt_parser.add_argument("--cycle-id", required=True)
    attempt_parser.add_argument("--version", type=int, required=True)
    attempt_parser.add_argument("--input", type=Path, required=True)
    attempt_parser.add_argument("--started-at")
    attempt_parser.add_argument("--submitted-at")
    attempt_parser.add_argument("--assisted", action="store_true")
    attempt_parser.add_argument("--interrupted", action="store_true")
    attempt_parser.add_argument("--draft-before-self-check", type=Path)
    attempt_parser.add_argument("--draft-after-self-check", type=Path)

    response_parser = subparsers.add_parser("record-response")
    response_parser.add_argument("--workspace", required=True)
    response_parser.add_argument("--cycle-id", required=True)
    response_parser.add_argument("--input", type=Path, required=True)

    evidence_parser = subparsers.add_parser("record-evidence")
    evidence_parser.add_argument("--workspace", required=True)
    evidence_parser.add_argument("--cycle-id", required=True)
    evidence_parser.add_argument("--input", type=Path, required=True)

    artifact_parser = subparsers.add_parser("save-contract")
    artifact_parser.add_argument("--workspace", required=True)
    artifact_parser.add_argument("--cycle-id", required=True)
    artifact_parser.add_argument(
        "--kind", choices=("assessment", "issue-evidence", "lesson-plan"), required=True
    )
    artifact_parser.add_argument("--input", type=Path, required=True)
    artifact_parser.add_argument("--expected-revision", type=int)

    schedule_parser = subparsers.add_parser("schedule")
    schedule_parser.add_argument("--workspace", required=True)
    schedule_parser.add_argument("--cycle-id", required=True)
    schedule_parser.add_argument("--exposure-at", required=True)
    schedule_parser.add_argument("--expected-revision", type=int)

    export_parser = subparsers.add_parser("export-bundle")
    export_parser.add_argument("--workspace", required=True)
    export_parser.add_argument("--output", type=Path, required=True)
    export_parser.add_argument("--cycle-id")
    export_parser.add_argument("--include-content", action="store_true")

    import_parser = subparsers.add_parser("import-bundle")
    import_parser.add_argument("--workspace", required=True)
    import_parser.add_argument("--input", type=Path, required=True)
    import_parser.add_argument("--timezone", default="UTC")

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "init":
            result = initialise(args.workspace, args.timezone)
        elif args.command == "status":
            result = status(args.workspace, args.now)
        elif args.command == "new-ids":
            if not 1 <= args.count <= 100:
                raise CoachStateError("new-ids count must be between 1 and 100")
            result = {"ids": [new_uuid7() for _ in range(args.count)]}
        elif args.command == "new-cycle":
            question = (
                args.question
                if args.question is not None
                else args.question_file.read_text(encoding="utf-8")
            )
            result = create_cycle(
                args.workspace,
                question,
                question_id=args.question_id,
                cycle_id=args.cycle_id,
                allow_parallel=args.allow_parallel,
            )
        elif args.command == "transition":
            result = transition_cycle(
                args.workspace,
                args.cycle_id,
                args.to,
                expected_revision=args.expected_revision,
            )
        elif args.command == "task-transition":
            result = update_task_status(
                args.workspace,
                args.cycle_id,
                args.machine,
                args.to,
                index=args.index,
                expected_revision=args.expected_revision,
            )
        elif args.command == "lesson-cursor":
            result = set_lesson_cursor(
                args.workspace,
                args.cycle_id,
                args.block_id,
                args.item_id,
                args.elapsed_seconds,
                expected_revision=args.expected_revision,
            )
        elif args.command == "set-targets":
            raw_targets = _load_json_argument(args.input)
            if not isinstance(raw_targets, list) or not all(
                isinstance(item, dict) for item in raw_targets
            ):
                raise CoachStateError("Targets input must be an array of objects")
            result = set_abstract_targets(
                args.workspace,
                args.cycle_id,
                raw_targets,
                expected_revision=args.expected_revision,
            )
        elif args.command == "save-attempt":
            result = {
                "saved": str(
                    save_attempt(
                        args.workspace,
                        args.cycle_id,
                        args.version,
                        args.input,
                        started_at=args.started_at,
                        submitted_at=args.submitted_at,
                        assisted=args.assisted,
                        interrupted=args.interrupted,
                        draft_before_self_check=args.draft_before_self_check,
                        draft_after_self_check=args.draft_after_self_check,
                    )
                )
            }
        elif args.command == "record-response":
            raw_response = _load_json_argument(args.input)
            if not isinstance(raw_response, dict):
                raise CoachStateError("Response input must be an object")
            record_response(args.workspace, args.cycle_id, raw_response)
            result = {"recorded": True}
        elif args.command == "record-evidence":
            raw_event = _load_json_argument(args.input)
            if not isinstance(raw_event, dict):
                raise CoachStateError("Evidence input must be an object")
            record_evidence(args.workspace, args.cycle_id, raw_event)
            result = {"recorded": True}
        elif args.command == "save-contract":
            result = {
                "saved": str(
                    save_contract_artifact(
                        args.workspace,
                        args.cycle_id,
                        args.kind,
                        args.input,
                        expected_revision=args.expected_revision,
                    )
                )
            }
        elif args.command == "schedule":
            result = schedule_after_lesson(
                args.workspace,
                args.cycle_id,
                args.exposure_at,
                expected_revision=args.expected_revision,
            )
        elif args.command == "export-bundle":
            exported_bundle = export_bundle(
                args.workspace,
                args.output,
                cycle_id=args.cycle_id,
                include_content=args.include_content,
            )
            result = {
                "output": str(args.output),
                "format": "ZIP"
                if args.output.name.casefold().endswith(".zip")
                else "JSON",
                "cycle_id": exported_bundle["manifest"]["cycleId"],
                "bundle_id": exported_bundle["manifest"]["bundleId"],
                "checksum": exported_bundle["checksum"],
                "content_included": args.include_content,
            }
        elif args.command == "import-bundle":
            result = import_bundle(
                args.workspace, args.input, timezone_name=args.timezone
            )
        else:
            raise CoachStateError(f"Unsupported command: {args.command}")
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
