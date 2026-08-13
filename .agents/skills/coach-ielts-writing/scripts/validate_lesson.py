#!/usr/bin/env python3
"""Validate the canonical lesson-plan teaching invariants with Python 3.11."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from _common import SUPPORTED_SKILL_IDS, CoachStateError, require_uuid7

ITEM_TYPES = frozenset(
    {
        "MINIMAL_PAIR",
        "SKELETON_COMPLETION",
        "CONSTRAINED_REWRITE",
        "ERROR_LOCATION",
        "GAP_FILL",
        "SENTENCE_GENERATION",
        "SENTENCE_REPAIR",
        "PARAGRAPH_SELF_CHECK",
        "MEANING_FORK",
        "EXPRESSION_MAP",
        "MULTIPLE_REALIZATION",
        "MATCHING",
        "TASK_TYPE_IDENTIFICATION",
        "THESIS_COMPARISON",
        "OUTLINE",
        "ROLE_CARD",
        "CAUSAL_CHAIN",
        "BRIDGE_SENTENCE",
        "RELEVANCE_FILTER",
        "DELETION",
        "MICRO_PARAGRAPH",
        "WEIGHING_CHOICE",
        "QUALIFICATION",
        "PARAGRAPH_WRITING",
        "FUNCTION_LABELING",
        "ORDERING",
        "REVERSE_OUTLINE",
        "REFERENCE_REPAIR",
        "LINK_RELATION",
        "RECONSTRUCTION",
        "INTEGRATED_APPLICATION",
        "EXIT_TEST",
        "SELF_CHECK",
    }
)

RECOGNITION_TYPES = frozenset(
    {
        "MINIMAL_PAIR",
        "ERROR_LOCATION",
        "MATCHING",
        "TASK_TYPE_IDENTIFICATION",
        "RELEVANCE_FILTER",
        "WEIGHING_CHOICE",
        "FUNCTION_LABELING",
        "ORDERING",
        "LINK_RELATION",
    }
)

STAGES = frozenset(
    {"notice", "understand", "control", "produce", "near_transfer", "self_check"}
)
PATHS = frozenset({"CORE", "FLEX", "OPTIONAL"})
BLOCK_KINDS = frozenset({"CORE", "SECONDARY", "REVIEW", "INTEGRATED", "BREAK"})


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _error(errors: list[str], code: str, detail: str) -> None:
    errors.append(f"{code}: {detail}")


def _require_uuid(errors: list[str], value: Any, field: str) -> bool:
    try:
        require_uuid7(value, field)
    except CoachStateError as exc:
        _error(errors, "UUIDV7", str(exc))
        return False
    return True


def validate(plan: dict[str, Any]) -> list[str]:
    """Return deterministic validation errors for one canonical LessonPlan."""

    errors: list[str] = []
    plan_fields = {
        "schemaVersion",
        "id",
        "trainingCycleId",
        "status",
        "plannedUserSeconds",
        "corePathSeconds",
        "flexiblePathSeconds",
        "objectives",
        "blocks",
        "plannerVersion",
        "generatorVersion",
    }
    if set(plan) != plan_fields:
        _error(
            errors,
            "SCHEMA",
            f"lesson-plan fields mismatch; missing={sorted(plan_fields - set(plan))}, unknown={sorted(set(plan) - plan_fields)}",
        )
    if plan.get("schemaVersion") != "1.0.0":
        _error(errors, "SCHEMA", "unsupported schemaVersion")
    if plan.get("status") not in {
        "PLANNING",
        "READY",
        "ACTIVE",
        "CORE_COMPLETED",
        "TIMEBOX_EXPIRED",
        "USER_SKIPPED",
        "ABANDONED",
    }:
        _error(errors, "SCHEMA", "unsupported lesson status")
    for field in ("plannerVersion", "generatorVersion"):
        if not isinstance(plan.get(field), str) or not plan.get(field):
            _error(errors, "SCHEMA", f"{field} is required")
    _require_uuid(errors, plan.get("id"), "plan.id")
    _require_uuid(errors, plan.get("trainingCycleId"), "plan.trainingCycleId")
    objectives = plan.get("objectives")
    blocks = plan.get("blocks")
    if not isinstance(objectives, list):
        return ["SCHEMA: objectives must be an array"]
    if not isinstance(blocks, list):
        return ["SCHEMA: blocks must be an array"]

    core_objectives = [
        item
        for item in objectives
        if isinstance(item, dict) and item.get("role") == "CORE"
    ]
    secondary_objectives = [
        item
        for item in objectives
        if isinstance(item, dict) and item.get("role") == "SECONDARY"
    ]
    review_objectives = [
        item
        for item in objectives
        if isinstance(item, dict) and item.get("role") == "REVIEW"
    ]
    if len(core_objectives) != 1:
        _error(errors, "CORE_OBJECTIVE_COUNT", "exactly one CORE objective is required")
    if len(secondary_objectives) > 1:
        _error(
            errors,
            "SECONDARY_OBJECTIVE_COUNT",
            "at most one SECONDARY objective is allowed",
        )
    if len(review_objectives) > 1:
        _error(
            errors, "REVIEW_OBJECTIVE_COUNT", "at most one REVIEW objective is allowed"
        )

    objective_map: dict[str, dict[str, Any]] = {}
    for index, objective in enumerate(objectives):
        if not isinstance(objective, dict):
            _error(errors, "SCHEMA", f"objectives[{index}] must be an object")
            continue
        objective_id = objective.get("id")
        skill_id = objective.get("skillId")
        objective_fields = {
            "id",
            "trainingCycleId",
            "skillId",
            "role",
            "sourceEvidenceIds",
            "priority",
            "successCriterion",
        }
        if set(objective) != objective_fields:
            _error(
                errors,
                "SCHEMA",
                f"objective {objective_id} has missing or unknown fields",
            )
        if not _require_uuid(errors, objective_id, f"objectives[{index}].id"):
            pass
        elif objective_id in objective_map:
            _error(errors, "DUPLICATE_OBJECTIVE", str(objective_id))
        else:
            objective_map[objective_id] = objective
        if skill_id not in SUPPORTED_SKILL_IDS:
            _error(errors, "UNSUPPORTED_SKILL", str(skill_id))
        if objective.get("role") not in {"CORE", "SECONDARY", "REVIEW"}:
            _error(errors, "SCHEMA", f"objective {objective_id} has unsupported role")
        if not _is_int(objective.get("priority")) or objective.get("priority", 0) < 1:
            _error(errors, "SCHEMA", f"objective {objective_id} has invalid priority")
        if not isinstance(objective.get("successCriterion"), str) or not objective.get(
            "successCriterion"
        ):
            _error(errors, "SCHEMA", f"objective {objective_id} needs successCriterion")
        if objective.get("trainingCycleId") != plan.get("trainingCycleId"):
            _error(
                errors,
                "CYCLE_REFERENCE",
                f"objective {objective_id} points to another cycle",
            )
        source_ids = objective.get("sourceEvidenceIds")
        if not isinstance(source_ids, list) or not source_ids:
            _error(
                errors, "SCHEMA", f"objective {objective_id} needs sourceEvidenceIds"
            )
        else:
            for source_index, source_id in enumerate(source_ids):
                _require_uuid(
                    errors,
                    source_id,
                    f"objectives[{index}].sourceEvidenceIds[{source_index}]",
                )

    planned = plan.get("plannedUserSeconds")
    core_budget = plan.get("corePathSeconds")
    flex_budget = plan.get("flexiblePathSeconds")
    if not _is_int(planned) or not 2700 <= planned <= 3600:
        _error(errors, "TIMEBOX", "plannedUserSeconds must be 2700–3600")
    if not _is_int(core_budget) or not 2100 <= core_budget <= 2700:
        _error(errors, "CORE_TIMEBOX", "corePathSeconds must be 2100–2700")
    if not _is_int(flex_budget) or not 0 <= flex_budget <= 900:
        _error(errors, "FLEX_TIMEBOX", "flexiblePathSeconds must be 0–900")
    if (
        all(_is_int(value) for value in (planned, core_budget, flex_budget))
        and planned != core_budget + flex_budget
    ):
        _error(
            errors, "TIME_BUDGET_SUM", "planned time must equal core plus flexible time"
        )

    block_ids: set[str] = set()
    item_ids: set[str] = set()
    core_blocks_seconds = 0
    flex_blocks_seconds = 0
    optional_blocks_seconds = 0
    break_blocks: list[dict[str, Any]] = []
    required_items: list[dict[str, Any]] = []
    all_items: list[dict[str, Any]] = []
    core_objective_id = str(core_objectives[0].get("id")) if core_objectives else ""
    core_skill_id = str(core_objectives[0].get("skillId")) if core_objectives else ""
    tr_cc_skills = {
        "task_instruction_coverage",
        "mechanism_chain",
        "development_relevance",
        "weighing_qualification",
        "paragraph_function_order",
        "reference_linking",
    }
    if core_skill_id in tr_cc_skills and secondary_objectives:
        _error(
            errors,
            "SECONDARY_SCOPE",
            "TR and CC core lessons cannot introduce a new SECONDARY objective",
        )

    for block_index, block in enumerate(blocks):
        if not isinstance(block, dict):
            _error(errors, "SCHEMA", f"blocks[{block_index}] must be an object")
            continue
        block_id = block.get("id")
        kind = block.get("kind")
        path = block.get("path")
        seconds = block.get("timeBudgetSeconds")
        items = block.get("items")
        required_block_fields = {
            "id",
            "kind",
            "path",
            "order",
            "timeBudgetSeconds",
            "items",
        }
        allowed_block_fields = required_block_fields | {"objectiveId"}
        if (
            not required_block_fields <= set(block)
            or not set(block) <= allowed_block_fields
        ):
            _error(errors, "SCHEMA", f"block {block_id} has missing or unknown fields")
        if not _require_uuid(errors, block_id, f"blocks[{block_index}].id"):
            pass
        elif block_id in block_ids:
            _error(errors, "DUPLICATE_BLOCK", block_id)
        else:
            block_ids.add(block_id)
        if kind not in BLOCK_KINDS:
            _error(errors, "BLOCK_KIND", f"blocks[{block_index}] has unsupported kind")
        if kind != "BREAK":
            objective_id = block.get("objectiveId")
            if not _require_uuid(
                errors, objective_id, f"blocks[{block_index}].objectiveId"
            ):
                pass
            elif objective_id not in objective_map:
                _error(
                    errors,
                    "UNKNOWN_OBJECTIVE",
                    f"block {block_id} has no valid objective",
                )
        if path not in PATHS:
            _error(errors, "BLOCK_PATH", f"blocks[{block_index}] has unsupported path")
        if not _is_int(block.get("order")) or block.get("order", -1) < 0:
            _error(errors, "BLOCK_ORDER", f"blocks[{block_index}] has invalid order")
        if not _is_int(seconds) or seconds < 1:
            _error(
                errors,
                "BLOCK_TIME",
                f"blocks[{block_index}] requires a positive timeBudgetSeconds",
            )
            seconds = 0
        if not isinstance(items, list):
            _error(errors, "SCHEMA", f"blocks[{block_index}].items must be an array")
            items = []
        if path == "CORE":
            core_blocks_seconds += int(seconds)
        elif path == "FLEX":
            flex_blocks_seconds += int(seconds)
        elif path == "OPTIONAL":
            optional_blocks_seconds += int(seconds)
        if kind == "BREAK":
            break_blocks.append(block)
            if path != "CORE" or seconds != 180 or items:
                _error(
                    errors,
                    "MICRO_BREAK",
                    "BREAK must be CORE, exactly 180 seconds and item-free",
                )
        elif not items:
            _error(
                errors, "EMPTY_LEARNING_BLOCK", f"block {block_id!r} contains no items"
            )
        for item_index, item in enumerate(items):
            if not isinstance(item, dict):
                _error(
                    errors,
                    "SCHEMA",
                    f"blocks[{block_index}].items[{item_index}] must be an object",
                )
                continue
            all_items.append(item)
            required_item_fields = {
                "id",
                "blockId",
                "learningObjectiveId",
                "primarySkillId",
                "stage",
                "itemType",
                "prompt",
                "grading",
                "expectedActiveSeconds",
                "expectedTotalSeconds",
                "isReserve",
                "generationMode",
                "qualityStatus",
                "evidenceOpportunity",
                "contextId",
                "firstAttemptRequired",
                "hintPolicy",
                "feedbackPolicy",
            }
            optional_item_fields = {
                "sourceIssueId",
                "independentGroupId",
                "unseenSurfaceForm",
                "criteria",
            }
            if (
                not required_item_fields <= set(item)
                or not set(item) <= required_item_fields | optional_item_fields
            ):
                _error(
                    errors,
                    "SCHEMA",
                    f"item {item.get('id')} has missing or unknown fields",
                )
            if path == "CORE" and not bool(item.get("isReserve", False)):
                required_items.append(item)
            item_id = item.get("id")
            if not _require_uuid(
                errors, item_id, f"blocks[{block_index}].items[{item_index}].id"
            ):
                pass
            elif item_id in item_ids:
                _error(errors, "DUPLICATE_ITEM", item_id)
            else:
                item_ids.add(item_id)
            if item.get("blockId") != block_id:
                _error(
                    errors, "BLOCK_REFERENCE", f"item {item_id} points to another block"
                )
            objective = objective_map.get(str(item.get("learningObjectiveId")))
            if objective is None:
                _error(
                    errors,
                    "UNKNOWN_OBJECTIVE",
                    f"item {item_id} has no valid objective",
                )
            elif item.get("primarySkillId") != objective.get("skillId"):
                _error(errors, "SKILL_OBJECTIVE_MISMATCH", str(item_id))
            if item.get("sourceIssueId") is not None:
                _require_uuid(
                    errors, item.get("sourceIssueId"), f"item {item_id}.sourceIssueId"
                )
            grading = item.get("grading")
            if not isinstance(grading, dict):
                _error(errors, "SCHEMA", f"item {item_id}.grading must be an object")
            elif grading.get("mode") == "DETERMINISTIC":
                answers = grading.get("acceptedAnswers")
                if (
                    not isinstance(answers, list)
                    or not answers
                    or len(answers) != len(set(answers))
                ):
                    _error(
                        errors,
                        "GRADING",
                        f"item {item_id} needs unique accepted answers",
                    )
                elif item.get("evidenceOpportunity") in {
                    "PRETEST",
                    "INDEPENDENT_GENERATION",
                    "INTEGRATED_APPLICATION",
                    "EXIT_TEST",
                } and any(
                    isinstance(answer, str)
                    and answer.strip()
                    and answer.strip().casefold()
                    in str(item.get("prompt", "")).casefold()
                    for answer in answers
                ):
                    _error(
                        errors,
                        "ANSWER_LEAKAGE",
                        f"item {item_id} embeds an accepted answer in its prompt",
                    )
                if grading.get("normalization") not in {
                    "TRIM_CASE_FOLD",
                    "ORDER_INSENSITIVE",
                    "EXACT",
                }:
                    _error(
                        errors, "GRADING", f"item {item_id} has invalid normalization"
                    )
            elif grading.get("mode") == "RUBRIC":
                confidence = grading.get("minimumConfidence")
                criteria = grading.get("criteria")
                if (
                    not isinstance(confidence, (int, float))
                    or isinstance(confidence, bool)
                    or not 0 <= confidence <= 1
                ):
                    _error(
                        errors,
                        "GRADING",
                        f"item {item_id} has invalid minimumConfidence",
                    )
                if not isinstance(criteria, list) or not criteria:
                    _error(errors, "GRADING", f"item {item_id} needs rubric criteria")
                else:
                    for criterion in criteria:
                        if not isinstance(criterion, dict) or not all(
                            isinstance(criterion.get(field), str)
                            and criterion.get(field)
                            for field in ("id", "description")
                        ):
                            _error(
                                errors,
                                "GRADING",
                                f"item {item_id} has an invalid rubric criterion",
                            )
            elif grading.get("mode") == "UNSCORED_BRANCH":
                branches = grading.get("branchIds")
                if (
                    not isinstance(branches, list)
                    or len(branches) < 2
                    or len(branches) != len(set(branches))
                ):
                    _error(
                        errors, "GRADING", f"item {item_id} needs two unique branches"
                    )
            else:
                _error(
                    errors, "GRADING", f"item {item_id} has an unsupported grading mode"
                )
            if item.get("itemType") not in ITEM_TYPES:
                _error(errors, "ITEM_TYPE", f"item {item_id} has an unsupported type")
            if item.get("stage") not in STAGES:
                _error(errors, "ITEM_STAGE", f"item {item_id} has an unsupported stage")
            if not isinstance(item.get("prompt"), str) or not item.get("prompt"):
                _error(errors, "SCHEMA", f"item {item_id} prompt is required")
            if item.get("generationMode") not in {"TEMPLATE", "AI"}:
                _error(
                    errors, "SCHEMA", f"item {item_id} has unsupported generationMode"
                )
            if item.get("qualityStatus") not in {
                "DRAFT",
                "VALIDATING",
                "VALIDATED",
                "PUBLISHED",
                "REJECTED",
            }:
                _error(
                    errors, "SCHEMA", f"item {item_id} has unsupported qualityStatus"
                )
            if item.get("evidenceOpportunity") not in {
                "PRETEST",
                "CONTROLLED_REPAIR",
                "INDEPENDENT_GENERATION",
                "INTEGRATED_APPLICATION",
                "EXIT_TEST",
                "SELF_CHECK",
                "OTHER",
            }:
                _error(
                    errors,
                    "SCHEMA",
                    f"item {item_id} has unsupported evidenceOpportunity",
                )
            if not isinstance(item.get("contextId"), str) or not item.get("contextId"):
                _error(errors, "SCHEMA", f"item {item_id} contextId is required")
            if not isinstance(item.get("isReserve"), bool) or not isinstance(
                item.get("firstAttemptRequired"), bool
            ):
                _error(errors, "SCHEMA", f"item {item_id} boolean flags are invalid")
            if item.get("hintPolicy") not in {"NONE", "ON_REQUEST", "SCAFFOLD_LADDER"}:
                _error(errors, "SCHEMA", f"item {item_id} has unsupported hintPolicy")
            if item.get("feedbackPolicy") not in {
                "IMMEDIATE",
                "BATCH_AFTER_GROUP",
                "AFTER_SUBMISSION",
            }:
                _error(
                    errors, "SCHEMA", f"item {item_id} has unsupported feedbackPolicy"
                )
            total = item.get("expectedTotalSeconds")
            active = item.get("expectedActiveSeconds")
            if not _is_int(total) or total < 1:
                _error(
                    errors,
                    "ITEM_TIME",
                    f"item {item_id} has invalid expectedTotalSeconds",
                )
            if (
                not _is_int(active)
                or active < 0
                or not _is_int(total)
                or active > total
            ):
                _error(
                    errors,
                    "ACTIVE_TIME",
                    f"item {item_id} has invalid expectedActiveSeconds",
                )
            if plan.get("status") in {"READY", "ACTIVE", "CORE_COMPLETED"} and item.get(
                "qualityStatus"
            ) not in {
                "VALIDATED",
                "PUBLISHED",
            }:
                _error(errors, "UNVALIDATED_ITEM", str(item_id))
            if item.get("evidenceOpportunity") == "INDEPENDENT_GENERATION":
                if (
                    item.get("firstAttemptRequired") is not True
                    or item.get("hintPolicy") != "NONE"
                ):
                    _error(errors, "INDEPENDENT_NOT_BLIND", str(item_id))
                if item.get("feedbackPolicy") != "BATCH_AFTER_GROUP" or not item.get(
                    "independentGroupId"
                ):
                    _error(errors, "INDEPENDENT_FEEDBACK_LEAK", str(item_id))

    if len(break_blocks) != 1:
        _error(errors, "MICRO_BREAK", "exactly one BREAK block is required")
    if _is_int(core_budget) and core_blocks_seconds != core_budget:
        _error(
            errors, "CORE_BLOCK_BUDGET", "CORE block budgets must equal corePathSeconds"
        )
    if (
        _is_int(flex_budget)
        and max(flex_blocks_seconds, optional_blocks_seconds) != flex_budget
    ):
        _error(
            errors,
            "TAIL_BLOCK_BUDGET",
            "the longer FLEX/OPTIONAL branch must equal flexiblePathSeconds",
        )
    if (
        _is_int(planned)
        and core_blocks_seconds + max(flex_blocks_seconds, optional_blocks_seconds)
        > planned
    ):
        _error(
            errors,
            "BLOCK_TIME_OVERFLOW",
            "longest executable path exceeds plannedUserSeconds",
        )

    meaningful_count = len(required_items)
    recognition_count = sum(
        item.get("itemType") in RECOGNITION_TYPES for item in required_items
    )
    if meaningful_count and (
        recognition_count > 4 or recognition_count / meaningful_count > 0.25
    ):
        _error(
            errors,
            "RECOGNITION_CAP",
            "recognition items must be at most four and at most 25%",
        )
    total_item_seconds = sum(
        int(item.get("expectedTotalSeconds", 0))
        for item in required_items
        if _is_int(item.get("expectedTotalSeconds"))
    )
    active_item_seconds = sum(
        int(item.get("expectedActiveSeconds", 0))
        for item in required_items
        if _is_int(item.get("expectedActiveSeconds"))
    )
    core_break_seconds = sum(
        int(block.get("timeBudgetSeconds", 0))
        for block in break_blocks
        if _is_int(block.get("timeBudgetSeconds"))
    )
    if (
        _is_int(core_budget)
        and total_item_seconds != int(core_budget) - core_break_seconds
    ):
        _error(
            errors,
            "CORE_ITEM_TIME_BUDGET",
            "required CORE item time must fill corePathSeconds after excluding BREAK",
        )
    if total_item_seconds and active_item_seconds / total_item_seconds < 0.65:
        _error(
            errors,
            "ACTIVE_OUTPUT_RATIO",
            "required CORE active-output ratio must be at least 65%",
        )

    core_items = [
        item
        for item in required_items
        if item.get("learningObjectiveId") == core_objective_id
    ]
    opportunities = lambda name: [
        item for item in core_items if item.get("evidenceOpportunity") == name
    ]
    if not opportunities("PRETEST"):
        _error(errors, "MISSING_PRETEST", "core objective needs a pretest")
    if not opportunities("CONTROLLED_REPAIR"):
        _error(
            errors,
            "MISSING_CONTROLLED_REPAIR",
            "core objective needs controlled repair",
        )
    independent = opportunities("INDEPENDENT_GENERATION")
    if (
        len(independent) < 2
        or len({str(item.get("contextId")) for item in independent}) < 2
    ):
        _error(
            errors,
            "MISSING_DISTINCT_GENERATION",
            "core needs two no-hint generations across two contexts",
        )
    grouped: dict[str, int] = {}
    for item in independent:
        group = item.get("independentGroupId")
        if isinstance(group, str):
            grouped[group] = grouped.get(group, 0) + 1
    if not any(2 <= count <= 3 for count in grouped.values()):
        _error(
            errors,
            "INVALID_INDEPENDENT_GROUP",
            "batch at least two independent generations before feedback",
        )
    integrated = [
        item
        for item in opportunities("INTEGRATED_APPLICATION")
        if item.get("stage") == "near_transfer"
        and item.get("firstAttemptRequired") is True
        and item.get("hintPolicy") == "NONE"
        and any(
            isinstance(criterion, dict)
            and criterion.get("objectiveId") == core_objective_id
            and criterion.get("skillId") == core_skill_id
            for criterion in item.get("criteria", [])
        )
    ]
    if not integrated:
        _error(
            errors,
            "MISSING_INTEGRATED_APPLICATION",
            "core needs a separately scored near-transfer application",
        )
    exits = [
        item
        for item in opportunities("EXIT_TEST")
        if item.get("firstAttemptRequired") is True
        and item.get("hintPolicy") == "NONE"
        and item.get("unseenSurfaceForm") is True
    ]
    if not exits:
        _error(
            errors, "MISSING_UNSEEN_EXIT", "core needs a blind unseen-surface exit item"
        )
    if not opportunities("SELF_CHECK"):
        _error(
            errors, "MISSING_SELF_CHECK", "core needs targeted self-check and revision"
        )
    return errors


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("lesson_plan", type=Path)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        raw = json.loads(args.lesson_plan.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise TypeError("Lesson plan root must be an object")
        errors = validate(raw)
    except (OSError, TypeError, ValueError, json.JSONDecodeError) as exc:
        errors = [f"PARSE: {exc}"]
    result = {"ok": not errors, "errors": errors}
    print(
        json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True),
        file=sys.stdout if not errors else sys.stderr,
    )
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
