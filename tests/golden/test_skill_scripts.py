from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / ".agents" / "skills" / "coach-ielts-writing" / "scripts"
sys.path.insert(0, str(SCRIPTS))

import build_rewrite_packet
import coach_state
import compare_attempts
import validate_lesson
import validate_state
from _common import (
    CoachStateError,
    RevisionConflict,
    append_jsonl,
    new_uuid7,
    read_json,
    require_uuid7,
    state_root,
)

TEST_CYCLE_ID = "01989a00-0000-7001-8000-000000000001"


def web_canonical_lesson() -> dict[str, object]:
    """Project the golden content into the Web planner's canonical 7+BREAK+2 shape."""

    plan = json.loads((ROOT / "tests" / "golden" / "valid-lesson.json").read_text())
    items = {item["id"]: item for block in plan["blocks"] for item in block["items"]}

    foundation_items = [
        items["01989a00-0000-7001-8000-000000000010"],
        items["01989a00-0000-7001-8000-000000000013"],
        items["01989a00-0000-7001-8000-000000000014"],
        items["01989a00-0000-7001-8000-000000000015"],
    ]
    for exercise, active, total in zip(
        foundation_items,
        (240, 300, 330, 330),
        (300, 360, 360, 360),
        strict=True,
    ):
        exercise["expectedActiveSeconds"] = active
        exercise["expectedTotalSeconds"] = total

    application_items = [
        items["01989a00-0000-7001-8000-000000000018"],
        items["01989a00-0000-7001-8000-000000000020"],
        items["01989a00-0000-7001-8000-000000000021"],
    ]
    for exercise, active, total in zip(
        application_items,
        (660, 210, 160),
        (720, 240, 180),
        strict=True,
    ):
        exercise["expectedActiveSeconds"] = active
        exercise["expectedTotalSeconds"] = total

    flex_block_id = "01989a00-0000-7001-8000-000000000008"
    flex_repair = json.loads(json.dumps(foundation_items[1]))
    flex_repair.update(
        {
            "id": "01989a00-0000-7001-8000-000000000022",
            "blockId": flex_block_id,
            "prompt": "Use the scaffold only if core evidence is incomplete, then repair a fresh example.",
            "expectedActiveSeconds": 330,
            "expectedTotalSeconds": 420,
            "isReserve": True,
            "evidenceOpportunity": "OTHER",
            "firstAttemptRequired": False,
        }
    )
    flex_repair["grading"]["criteria"][0]["id"] = "01989a00-0000-7001-8000-000000000041"
    flex_generation = json.loads(json.dumps(foundation_items[2]))
    flex_generation.update(
        {
            "id": "01989a00-0000-7001-8000-000000000023",
            "blockId": flex_block_id,
            "prompt": "After support, produce one fresh response without copying demonstrated wording.",
            "expectedActiveSeconds": 420,
            "expectedTotalSeconds": 480,
            "isReserve": True,
            "evidenceOpportunity": "OTHER",
            "firstAttemptRequired": False,
            "hintPolicy": "ON_REQUEST",
            "feedbackPolicy": "AFTER_SUBMISSION",
        }
    )
    flex_generation.pop("independentGroupId", None)
    flex_generation["grading"]["criteria"][0]["id"] = (
        "01989a00-0000-7001-8000-000000000042"
    )

    foundation = plan["blocks"][0]
    foundation.update({"timeBudgetSeconds": 1380, "items": foundation_items})
    break_block = plan["blocks"][1]
    application = plan["blocks"][2]
    application.update({"timeBudgetSeconds": 1140, "items": application_items})
    flex = {
        "id": flex_block_id,
        "objectiveId": "01989a00-0000-7001-8000-000000000003",
        "kind": "CORE",
        "path": "FLEX",
        "order": 3,
        "timeBudgetSeconds": 900,
        "items": [flex_repair, flex_generation],
    }
    plan.update(
        {
            "plannedUserSeconds": 3600,
            "corePathSeconds": 2700,
            "flexiblePathSeconds": 900,
            "blocks": [foundation, break_block, application, flex],
            "plannerVersion": "worker-canonical-planner@1.0.0",
            "generatorVersion": "web-golden@1.0.0",
        }
    )
    return plan


class SkillScriptTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.workspace = Path(self.temporary.name) / "study"
        self.workspace.mkdir()
        coach_state.initialise(self.workspace, "Asia/Shanghai")

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def new_cycle(self, cycle_id: str = TEST_CYCLE_ID) -> dict[str, object]:
        return coach_state.create_cycle(
            self.workspace,
            "Some cities are changing how public space is used. To what extent do you agree or disagree?",
            cycle_id=cycle_id,
        )

    def prepare_lesson(self) -> str:
        cycle = self.new_cycle()
        active = coach_state.transition_cycle(
            self.workspace,
            TEST_CYCLE_ID,
            "ATTEMPT_1_ACTIVE",
            expected_revision=int(cycle["revision"]),
        )
        attempt_source = Path(self.temporary.name) / "lesson-attempt.md"
        attempt_source.write_text("A complete independent attempt.", encoding="utf-8")
        coach_state.save_attempt(self.workspace, TEST_CYCLE_ID, 1, attempt_source)
        current = read_json(
            state_root(self.workspace) / "cycles" / TEST_CYCLE_ID / "cycle.json"
        )
        self.assertGreater(int(current["revision"]), int(active["revision"]))
        for target in ("SUBMITTED", "ANALYZING", "FEEDBACK_READY", "LESSON_GENERATING"):
            current = coach_state.transition_cycle(
                self.workspace,
                TEST_CYCLE_ID,
                target,
                expected_revision=int(current["revision"]),
            )
        return str(
            read_json(
                state_root(self.workspace)
                / "cycles"
                / TEST_CYCLE_ID
                / "attempt-v1.meta.json"
            )["id"]
        )

    def test_state_transition_revision_and_locked_attempt(self) -> None:
        cycle = self.new_cycle()
        self.assertEqual(
            coach_state.status(self.workspace)["next_action"], "start_version_1"
        )
        coach_state.transition_cycle(
            self.workspace,
            TEST_CYCLE_ID,
            "ATTEMPT_1_ACTIVE",
            expected_revision=int(cycle["revision"]),
        )
        with self.assertRaises(RevisionConflict):
            coach_state.transition_cycle(
                self.workspace,
                TEST_CYCLE_ID,
                "SUBMITTED",
                expected_revision=int(cycle["revision"]),
            )

        attempt = Path(self.temporary.name) / "attempt.md"
        attempt.write_text("A complete independent attempt.", encoding="utf-8")
        coach_state.save_attempt(self.workspace, TEST_CYCLE_ID, 1, attempt)
        with self.assertRaises(CoachStateError):
            coach_state.save_attempt(self.workspace, TEST_CYCLE_ID, 1, attempt)
        after_attempt = read_json(
            state_root(self.workspace) / "cycles" / TEST_CYCLE_ID / "cycle.json"
        )
        coach_state.transition_cycle(
            self.workspace,
            TEST_CYCLE_ID,
            "SUBMITTED",
            expected_revision=int(after_attempt["revision"]),
        )
        self.assertEqual(validate_state.validate_workspace(self.workspace), [])

    def test_illegal_transition_is_rejected(self) -> None:
        self.new_cycle()
        with self.assertRaises(CoachStateError):
            coach_state.transition_cycle(self.workspace, TEST_CYCLE_ID, "REWRITE_READY")
        early_v2 = Path(self.temporary.name) / "early-v2.md"
        early_v2.write_text(
            "A rewrite submitted before its delayed window.", encoding="utf-8"
        )
        with self.assertRaises(CoachStateError):
            coach_state.save_attempt(self.workspace, TEST_CYCLE_ID, 2, early_v2)

    def test_independent_task_state_machines_are_enforced(self) -> None:
        self.prepare_lesson()
        coach_state.save_contract_artifact(
            self.workspace,
            TEST_CYCLE_ID,
            "lesson-plan",
            ROOT / "tests" / "golden" / "valid-lesson.json",
        )
        lesson_ready = read_json(
            state_root(self.workspace) / "cycles" / TEST_CYCLE_ID / "cycle.json"
        )
        self.assertEqual(lesson_ready["lesson_status"], "READY")
        with self.assertRaises(CoachStateError):
            coach_state.update_task_status(
                self.workspace, TEST_CYCLE_ID, "lesson", "CORE_COMPLETED"
            )
        active = coach_state.update_task_status(
            self.workspace,
            TEST_CYCLE_ID,
            "lesson",
            "ACTIVE",
            expected_revision=int(lesson_ready["revision"]),
        )
        self.assertEqual(active["lesson_status"], "ACTIVE")
        plan = read_json(
            state_root(self.workspace) / "cycles" / TEST_CYCLE_ID / "lesson-plan.json"
        )
        self.assertEqual(plan["status"], "ACTIVE")

        next_block = next(block for block in plan["blocks"][1:] if block["items"])
        next_item = next_block["items"][0]
        resumed = coach_state.set_lesson_cursor(
            self.workspace,
            TEST_CYCLE_ID,
            next_block["id"],
            next_item["id"],
            925,
            expected_revision=int(active["revision"]),
        )
        self.assertEqual(resumed["active_block_id"], next_block["id"])
        self.assertEqual(resumed["active_item_id"], next_item["id"])
        self.assertEqual(resumed["lesson_elapsed_seconds"], 925)
        status = coach_state.status(self.workspace)
        self.assertEqual(status["lesson_cursor"]["elapsed_seconds"], 925)
        self.assertEqual(validate_state.validate_workspace(self.workspace), [])

        with self.assertRaises(CoachStateError):
            coach_state.set_lesson_cursor(
                self.workspace,
                TEST_CYCLE_ID,
                plan["blocks"][0]["id"],
                next_item["id"],
                926,
            )

    def test_schedule_uses_last_teaching_exposure(self) -> None:
        self.prepare_lesson()
        coach_state.save_contract_artifact(
            self.workspace,
            TEST_CYCLE_ID,
            "lesson-plan",
            ROOT / "tests" / "golden" / "valid-lesson.json",
        )
        ready = read_json(
            state_root(self.workspace) / "cycles" / TEST_CYCLE_ID / "cycle.json"
        )
        active = coach_state.update_task_status(
            self.workspace,
            TEST_CYCLE_ID,
            "lesson",
            "ACTIVE",
            expected_revision=int(ready["revision"]),
        )
        coach_state.update_task_status(
            self.workspace,
            TEST_CYCLE_ID,
            "lesson",
            "CORE_COMPLETED",
            expected_revision=int(active["revision"]),
        )
        queue = coach_state.schedule_after_lesson(
            self.workspace,
            TEST_CYCLE_ID,
            "2026-08-13T20:00:00+08:00",
            expected_revision=1,
        )
        due_dates = {task["kind"]: task["due_at"] for task in queue["tasks"]}
        self.assertEqual(due_dates["rewrite"], "2026-08-14T12:00:00Z")
        self.assertEqual(due_dates["transfer"], "2026-08-19T12:00:00Z")
        self.assertEqual(due_dates["mixed_review"], "2026-08-27T12:00:00Z")
        locked = read_json(
            state_root(self.workspace) / "cycles" / TEST_CYCLE_ID / "cycle.json"
        )
        self.assertEqual(locked["state"], "REWRITE_LOCKED")
        self.assertEqual(locked["rewrite_status"], "LOCKED")
        self.assertEqual(
            coach_state.status(self.workspace, "2026-08-14T11:59:59Z")["next_action"],
            "wait_for_rewrite",
        )
        self.assertEqual(
            coach_state.status(self.workspace, "2026-08-14T12:00:00Z")["next_action"],
            "unlock_rewrite",
        )

        ready = coach_state.update_task_status(
            self.workspace,
            TEST_CYCLE_ID,
            "rewrite",
            "READY",
            expected_revision=int(locked["revision"]),
        )
        self.assertEqual(ready["state"], "REWRITE_READY")
        rewrite_active = coach_state.update_task_status(
            self.workspace,
            TEST_CYCLE_ID,
            "rewrite",
            "ACTIVE",
            expected_revision=int(ready["revision"]),
        )
        self.assertEqual(rewrite_active["state"], "ATTEMPT_2_ACTIVE")
        version_2 = Path(self.temporary.name) / "version-2.md"
        version_2.write_text("A complete delayed rewrite.", encoding="utf-8")
        coach_state.save_attempt(self.workspace, TEST_CYCLE_ID, 2, version_2)
        current = read_json(
            state_root(self.workspace) / "cycles" / TEST_CYCLE_ID / "cycle.json"
        )
        comparing = coach_state.update_task_status(
            self.workspace,
            TEST_CYCLE_ID,
            "rewrite",
            "COMPLETED",
            expected_revision=int(current["revision"]),
        )
        self.assertEqual(comparing["state"], "COMPARING")
        rewrite_queue = next(
            task
            for task in read_json(state_root(self.workspace) / "queue.json")["tasks"]
            if task["kind"] == "rewrite"
        )
        self.assertEqual(rewrite_queue["status"], "DONE")
        completed = coach_state.transition_cycle(
            self.workspace,
            TEST_CYCLE_ID,
            "CORE_CYCLE_COMPLETED",
            expected_revision=int(comparing["revision"]),
        )
        transfer_ready = coach_state.update_task_status(
            self.workspace,
            TEST_CYCLE_ID,
            "transfer",
            "READY",
            expected_revision=int(completed["revision"]),
        )
        transfer_done = coach_state.update_task_status(
            self.workspace,
            TEST_CYCLE_ID,
            "transfer",
            "COMPLETED",
            expected_revision=int(transfer_ready["revision"]),
        )
        self.assertEqual(
            coach_state.status(self.workspace, "2026-08-27T12:00:00Z")["next_action"],
            "start_due_mixed_review",
        )
        mixed_ready = coach_state.update_task_status(
            self.workspace,
            TEST_CYCLE_ID,
            "mixed_review",
            "READY",
            expected_revision=int(transfer_done["revision"]),
        )
        mixed_done = coach_state.update_task_status(
            self.workspace,
            TEST_CYCLE_ID,
            "mixed_review",
            "COMPLETED",
            expected_revision=int(mixed_ready["revision"]),
        )
        self.assertEqual(mixed_done["mixed_review_task"]["status"], "COMPLETED")
        self.assertEqual(validate_state.validate_workspace(self.workspace), [])

    def test_rewrite_packet_whitelist_and_leak_detection(self) -> None:
        cycle = self.new_cycle()
        coach_state.set_abstract_targets(
            self.workspace,
            TEST_CYCLE_ID,
            [
                {
                    "label": "Natural phrasing",
                    "check": "Check that the relationship and collocation fit your intended meaning.",
                }
            ],
            expected_revision=int(cycle["revision"]),
        )
        cycle_root = state_root(self.workspace) / "cycles" / TEST_CYCLE_ID
        protected_sentence = "Primary school pupils generally face much less academic pressure than secondary school students."
        (cycle_root / "feedback.md").write_text(protected_sentence, encoding="utf-8")
        packet, leaks = build_rewrite_packet.build_packet(self.workspace, TEST_CYCLE_ID)
        self.assertEqual(leaks, [])
        self.assertNotIn(protected_sentence, packet)

        current = read_json(cycle_root / "cycle.json")
        coach_state.set_abstract_targets(
            self.workspace,
            TEST_CYCLE_ID,
            [{"label": "Use this", "check": protected_sentence}],
            expected_revision=int(current["revision"]),
        )
        _, leaks = build_rewrite_packet.build_packet(self.workspace, TEST_CYCLE_ID)
        self.assertTrue(leaks)

    def test_lesson_validator_accepts_gold_and_rejects_leakage(self) -> None:
        valid_path = ROOT / "tests" / "golden" / "valid-lesson.json"
        lesson = json.loads(valid_path.read_text(encoding="utf-8"))
        self.assertEqual(validate_lesson.validate(lesson), [])

        web_lesson = web_canonical_lesson()
        self.assertEqual(validate_lesson.validate(web_lesson), [])
        self.assertEqual(
            sum(
                len(block["items"])
                for block in web_lesson["blocks"]
                if block["path"] == "CORE" and block["kind"] != "BREAK"
            ),
            7,
        )
        self.assertEqual(
            sum(
                len(block["items"])
                for block in web_lesson["blocks"]
                if block["path"] == "FLEX"
            ),
            2,
        )

        underfilled = json.loads(json.dumps(web_lesson))
        underfilled["blocks"][0]["items"][0]["expectedTotalSeconds"] -= 60
        self.assertTrue(
            any(
                "CORE_ITEM_TIME_BUDGET" in error
                for error in validate_lesson.validate(underfilled)
            )
        )
        low_output = json.loads(json.dumps(web_lesson))
        for block in low_output["blocks"]:
            if block["path"] == "CORE":
                for item in block["items"]:
                    item["expectedActiveSeconds"] = 0
        self.assertTrue(
            any(
                "ACTIVE_OUTPUT_RATIO" in error
                for error in validate_lesson.validate(low_output)
            )
        )

        lesson["blocks"][0]["items"][4]["hintPolicy"] = "FULL_FRAME"
        errors = validate_lesson.validate(lesson)
        self.assertTrue(any("INDEPENDENT_NOT_BLIND" in error for error in errors))

        lesson = json.loads(valid_path.read_text(encoding="utf-8"))
        leaked = lesson["blocks"][0]["items"][0]
        leaked["grading"] = {
            "mode": "DETERMINISTIC",
            "acceptedAnswers": ["Rewrite the source sentence naturally"],
            "normalization": "TRIM_CASE_FOLD",
        }
        errors = validate_lesson.validate(lesson)
        self.assertTrue(any("ANSWER_LEAKAGE" in error for error in errors))

    def test_comparison_uses_per_100_word_rates_and_versions(self) -> None:
        result = compare_attempts.compare(
            "One two three four five six seven eight nine ten.",
            "One two three four five six seven eight nine ten eleven twelve.",
            version_1_issues={"collocation_perspective": 2},
            version_2_issues={"collocation_perspective": 1},
            v1_prompt_version="assessment-1",
            v2_prompt_version="assessment-1",
            v1_rubric_version="rubric-1",
            v2_rubric_version="rubric-1",
            v1_model="model-a",
            v2_model="model-a",
        )
        self.assertEqual(result["comparability"], "directly_comparable")
        metric = result["issue_metrics"]["collocation_perspective"]
        self.assertEqual(metric["v1_per_100_words"], 20.0)
        self.assertAlmostEqual(metric["v2_per_100_words"], 8.333, places=3)
        unknown_model = compare_attempts.compare(
            "A complete sentence.",
            "Another complete sentence.",
            v1_prompt_version="assessment-1",
            v2_prompt_version="assessment-1",
            v1_rubric_version="rubric-1",
            v2_rubric_version="rubric-1",
        )
        self.assertEqual(
            unknown_model["comparability"], "rubric_comparable_model_unknown"
        )

    def test_cycle_bundle_cli_imports_and_exports_json_and_zip(self) -> None:
        self.new_cycle()
        script = SCRIPTS / "coach_state.py"
        json_path = Path(self.temporary.name) / "cli-bundle.json"
        zip_path = Path(self.temporary.name) / "cli-bundle.iwc-bundle.zip"
        for output in (json_path, zip_path):
            exported = subprocess.run(
                [
                    sys.executable,
                    str(script),
                    "export-bundle",
                    "--workspace",
                    str(self.workspace),
                    "--output",
                    str(output),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(exported.returncode, 0, exported.stderr)
            export_result = json.loads(exported.stdout)
            self.assertTrue(export_result["ok"])
            self.assertNotIn("Some cities are changing", exported.stdout)
            self.assertEqual(
                export_result["result"]["format"],
                "ZIP" if output.suffix == ".zip" else "JSON",
            )
            coach_state._validate_bundle(coach_state._read_bundle_source(output))

        self.assertEqual(json_path.read_bytes()[:1], b"{")
        self.assertEqual(zip_path.read_bytes()[:4], b"PK\x03\x04")
        for source_name, source in (("json", json_path), ("zip", zip_path)):
            destination = Path(self.temporary.name) / f"cli-import-{source_name}"
            destination.mkdir()
            imported = subprocess.run(
                [
                    sys.executable,
                    str(script),
                    "import-bundle",
                    "--workspace",
                    str(destination),
                    "--input",
                    str(source),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(imported.returncode, 0, imported.stderr)
            result = json.loads(imported.stdout)
            self.assertEqual(result["result"]["imported_cycle_ids"], [TEST_CYCLE_ID])
            self.assertEqual(validate_state.validate_workspace(destination), [])

    def test_web_canonical_cycle_bundle_round_trip_and_secret_rejection(self) -> None:
        attempt_id = self.prepare_lesson()
        cycle_root = state_root(self.workspace) / "cycles" / TEST_CYCLE_ID

        issue_id = "01989a00-0000-7001-8000-000000000004"
        issue_input = Path(self.temporary.name) / "issues.json"
        issue_input.write_text(
            json.dumps(
                {
                    "issueEvidence": [
                        {
                            "schemaVersion": "1.0.0",
                            "id": issue_id,
                            "essayAttemptId": attempt_id,
                            "skillId": "collocation_perspective",
                            "startOffset": 0,
                            "endOffset": 10,
                            "excerpt": "A complete",
                            "diagnosis": "The expression is understandable but uses an unnatural perspective.",
                            "categories": ["COLLOCATION_NATURALNESS"],
                            "hardGrammarError": False,
                            "severity": "MEDIUM",
                            "confidence": 0.9,
                            "adjudicationStatus": "ACCEPTED",
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )
        coach_state.save_contract_artifact(
            self.workspace, TEST_CYCLE_ID, "issue-evidence", issue_input
        )

        criterion = {
            "band": 6.0,
            "confidence": 0.85,
            "rationale": "The estimate is supported by the accepted issue evidence.",
            "evidenceIds": [issue_id],
        }
        assessment_input = Path(self.temporary.name) / "assessment.json"
        assessment_input.write_text(
            json.dumps(
                {
                    "schemaVersion": "1.0.0",
                    "id": new_uuid7(),
                    "attemptId": attempt_id,
                    "rubricVersion": "ielts-task2-rubric-1.0.0",
                    "modelId": "golden-model",
                    "overallBand": 6.0,
                    "criteria": {
                        name: dict(criterion) for name in ("TR", "CC", "LR", "GRA")
                    },
                    "issueEvidenceIds": [issue_id],
                }
            ),
            encoding="utf-8",
        )
        coach_state.save_contract_artifact(
            self.workspace, TEST_CYCLE_ID, "assessment", assessment_input
        )

        lesson_input = Path(self.temporary.name) / "web-canonical-lesson.json"
        lesson_input.write_text(json.dumps(web_canonical_lesson()), encoding="utf-8")
        coach_state.save_contract_artifact(
            self.workspace, TEST_CYCLE_ID, "lesson-plan", lesson_input
        )
        ready = read_json(cycle_root / "cycle.json")
        coach_state.update_task_status(
            self.workspace,
            TEST_CYCLE_ID,
            "lesson",
            "ACTIVE",
            expected_revision=int(ready["revision"]),
        )
        response_id = new_uuid7()
        exercise_attempt_id = new_uuid7()
        evaluation_id = new_uuid7()
        coach_state.record_response(
            self.workspace,
            TEST_CYCLE_ID,
            {
                "schemaVersion": "1.0.0",
                "id": response_id,
                "exerciseItemId": "01989a00-0000-7001-8000-000000000010",
                "firstAttemptId": exercise_attempt_id,
                "finalAttemptId": exercise_attempt_id,
                "attempts": [
                    {
                        "id": exercise_attempt_id,
                        "answer": "Primary pupils face less academic pressure.",
                        "submittedAt": "2026-08-13T20:00:00+08:00",
                        "elapsedSeconds": 75,
                        "hintLevel": "NONE",
                        "referenceAnswerSeen": False,
                    }
                ],
                "evaluations": [
                    {
                        "id": evaluation_id,
                        "attemptId": exercise_attempt_id,
                        "outcome": "PASS",
                        "confidence": 0.9,
                        "dimensionScores": {
                            "targetUse": 0.9,
                            "meaningPreservation": 1.0,
                        },
                        "userAnswerEvidence": ["face less academic pressure"],
                        "mostImportantSuggestion": "Keep the comparison context explicit.",
                        "evaluatorVersion": "golden-evaluator-1",
                        "promptVersion": "exercise-grading-1",
                        "rubricVersion": "collocation-rubric-1",
                        "adjudicationStatus": "ACCEPTED",
                    }
                ],
                "currentEvaluationId": evaluation_id,
            },
        )
        coach_state.record_evidence(
            self.workspace,
            TEST_CYCLE_ID,
            {
                "schemaVersion": "1.0.0",
                "id": new_uuid7(),
                "userId": new_uuid7(),
                "skillId": "collocation_perspective",
                "objectiveId": "01989a00-0000-7001-8000-000000000003",
                "kind": "INDEPENDENT_GENERATION",
                "outcome": "PASS",
                "independent": True,
                "firstAttempt": True,
                "hintLevel": "NONE",
                "confidence": 0.9,
                "validForStateTransition": True,
                "adjudicationStatus": "ACCEPTED",
                "contextId": "golden-education-context",
                "topicId": "education",
                "sourceEntityType": "EXERCISE",
                "sourceEntityId": "01989a00-0000-7001-8000-000000000010",
                "occurredAt": "2026-08-13T20:00:00+08:00",
            },
        )
        active = read_json(cycle_root / "cycle.json")
        coach_state.update_task_status(
            self.workspace,
            TEST_CYCLE_ID,
            "lesson",
            "CORE_COMPLETED",
            expected_revision=int(active["revision"]),
        )
        coach_state.schedule_after_lesson(
            self.workspace,
            TEST_CYCLE_ID,
            "2026-08-13T20:00:00+08:00",
        )
        self.assertEqual(validate_state.validate_workspace(self.workspace), [])
        redacted_path = Path(self.temporary.name) / "bundle-redacted.json"
        redacted = coach_state.export_bundle(self.workspace, redacted_path)
        self.assertEqual(redacted["attempts"], [])
        self.assertIsNone(redacted["lesson"]["plan"])
        coach_state._validate_bundle(redacted)
        redacted_destination = Path(self.temporary.name) / "redacted-import"
        redacted_destination.mkdir()
        with self.assertRaisesRegex(CoachStateError, "--include-content"):
            coach_state.import_bundle(redacted_destination, redacted_path)
        self.assertFalse((redacted_destination / ".coach-ielts-writing").exists())

        bundle_path = Path(self.temporary.name) / "bundle.json"
        coach_state.export_bundle(self.workspace, bundle_path, include_content=True)
        contract_check = subprocess.run(
            [
                str(ROOT / "node_modules" / ".bin" / "tsx"),
                "-e",
                (
                    "import fs from 'node:fs';"
                    "import crypto from 'node:crypto';"
                    "import {validateCycleBundle} from './packages/learning-contracts/src/index.ts';"
                    "import {validateLessonPlan} from './packages/learning-core/src/index.ts';"
                    "const bundle=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));"
                    "const result=validateCycleBundle(bundle);"
                    "if(!result.valid){console.error(JSON.stringify(result));process.exit(1)}"
                    "const lessonResult=validateLessonPlan(bundle.lesson.plan);"
                    "if(!lessonResult.valid){console.error(JSON.stringify(lessonResult));process.exit(1)}"
                    "const canon=(v)=>v===null||typeof v!=='object'?JSON.stringify(v):"
                    "Array.isArray(v)?'['+v.map(canon).join(',')+']':"
                    "'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}';"
                    "const {checksum,...material}=bundle;"
                    "const actual=crypto.createHash('sha256').update(canon(material),'utf8').digest('hex');"
                    "if(actual!==checksum.value){console.error('JCS checksum mismatch');process.exit(1)}"
                ),
                str(bundle_path),
            ],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(contract_check.returncode, 0, contract_check.stderr)

        web_bundle = json.loads(bundle_path.read_text(encoding="utf-8"))
        web_bundle["manifest"]["source"] = "WEB"
        web_bundle["manifest"]["bundleId"] = new_uuid7()
        web_bundle["checksum"]["value"] = coach_state._bundle_checksum(web_bundle)
        bundle_path.write_text(json.dumps(web_bundle), encoding="utf-8")

        web_archive = Path(self.temporary.name) / "web-export.iwc-bundle.zip"
        archive_build = subprocess.run(
            [
                str(ROOT / "node_modules" / ".bin" / "tsx"),
                "-e",
                (
                    "import fs from 'node:fs';"
                    "import {createCycleBundleArchive} from './packages/exchange/src/index.ts';"
                    "const bundle=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));"
                    "fs.writeFileSync(process.argv[2],createCycleBundleArchive(bundle));"
                ),
                str(bundle_path),
                str(web_archive),
            ],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(archive_build.returncode, 0, archive_build.stderr)
        archive_bundle = coach_state._read_bundle_source(web_archive)
        self.assertEqual(
            archive_bundle["manifest"]["bundleId"],
            web_bundle["manifest"]["bundleId"],
        )
        self.assertEqual(archive_bundle["checksum"], web_bundle["checksum"])

        destination = Path(self.temporary.name) / "imported"
        destination.mkdir()
        first = coach_state.import_bundle(destination, bundle_path)
        self.assertEqual(first["imported_cycle_ids"], [TEST_CYCLE_ID])
        self.assertEqual(validate_state.validate_workspace(destination), [])
        round_tripped = coach_state._build_bundle(
            state_root(destination), TEST_CYCLE_ID, include_content=True
        )
        self.assertEqual(
            round_tripped["manifest"]["appendOnlyEntityIds"],
            web_bundle["manifest"]["appendOnlyEntityIds"],
        )
        second = coach_state.import_bundle(destination, bundle_path)
        self.assertTrue(second["idempotent"])

        imported_cycle_path = (
            state_root(destination) / "cycles" / TEST_CYCLE_ID / "cycle.json"
        )
        imported_cycle = read_json(imported_cycle_path)
        coach_state.update_task_status(
            destination,
            TEST_CYCLE_ID,
            "mixed_review",
            "READY",
            expected_revision=int(imported_cycle["revision"]),
        )
        successor_path = Path(self.temporary.name) / "bundle-successor.json"
        successor = coach_state.export_bundle(
            destination,
            successor_path,
            cycle_id=TEST_CYCLE_ID,
            include_content=True,
        )
        self.assertEqual(
            successor["manifest"]["revision"],
            web_bundle["manifest"]["revision"] + 1,
        )
        self.assertEqual(
            successor["manifest"]["parentRevision"],
            web_bundle["manifest"]["revision"],
        )
        merged = coach_state.import_bundle(self.workspace, successor_path)
        self.assertEqual(merged["imported_cycle_ids"], [TEST_CYCLE_ID])
        self.assertEqual(
            read_json(cycle_root / "cycle.json")["mixed_review_task"]["status"],
            "READY",
        )
        self.assertTrue(
            coach_state.import_bundle(self.workspace, successor_path)["idempotent"]
        )

        conflicting = json.loads(successor_path.read_text(encoding="utf-8"))
        conflicting["manifest"].update(
            {
                "bundleId": new_uuid7(),
                "revision": successor["manifest"]["revision"] + 1,
                "parentRevision": successor["manifest"]["revision"],
            }
        )
        conflicting["cycle"]["question"]["prompt"] = "Immutable conflict"
        conflicting["checksum"]["value"] = coach_state._bundle_checksum(conflicting)
        conflict_path = Path(self.temporary.name) / "bundle-conflict.json"
        conflict_path.write_text(json.dumps(conflicting), encoding="utf-8")
        with self.assertRaisesRegex(CoachStateError, "/cycle/question"):
            coach_state.import_bundle(self.workspace, conflict_path)
        self.assertNotEqual(
            (cycle_root / "question.md").read_text(encoding="utf-8").strip(),
            "Immutable conflict",
        )

        archive_destination = Path(self.temporary.name) / "imported-archive"
        archive_destination.mkdir()
        archive_first = coach_state.import_bundle(archive_destination, web_archive)
        self.assertEqual(archive_first["imported_cycle_ids"], [TEST_CYCLE_ID])
        self.assertEqual(validate_state.validate_workspace(archive_destination), [])
        archive_second = coach_state.import_bundle(archive_destination, web_archive)
        self.assertTrue(archive_second["idempotent"])

        skill_archive = Path(self.temporary.name) / "skill-export.iwc-bundle.zip"
        exported_bundle = coach_state.export_bundle(
            archive_destination,
            skill_archive,
            cycle_id=TEST_CYCLE_ID,
            include_content=True,
        )
        embedded_bundle = coach_state._read_bundle_source(skill_archive)
        self.assertEqual(embedded_bundle, exported_bundle)
        self.assertEqual(
            embedded_bundle["manifest"]["appendOnlyEntityIds"],
            web_bundle["manifest"]["appendOnlyEntityIds"],
        )
        self.assertEqual(
            embedded_bundle["checksum"]["value"],
            coach_state._bundle_checksum(embedded_bundle),
        )
        with zipfile.ZipFile(skill_archive) as archive:
            self.assertEqual(
                sorted(archive.namelist()),
                ["cycle-bundle.json", "manifest.json", "report.md"],
            )
            manifest = json.loads(archive.read("manifest.json"))
            report = archive.read("report.md").decode("utf-8")
        self.assertEqual(
            manifest["bundle_id"], embedded_bundle["manifest"]["bundleId"]
        )
        self.assertEqual(manifest["checksum"], embedded_bundle["checksum"])
        self.assertIn("AI estimate, not an official IELTS score", report)

        traversal_archive = Path(self.temporary.name) / "traversal.iwc-bundle.zip"
        with zipfile.ZipFile(
            traversal_archive, "w", compression=zipfile.ZIP_DEFLATED
        ) as archive:
            archive.writestr("cycle-bundle.json", json.dumps(web_bundle))
            archive.writestr("../outside.txt", "unsafe")
        with self.assertRaisesRegex(CoachStateError, "unsafe entry path"):
            coach_state.import_bundle(archive_destination, traversal_archive)

        expansion_archive = Path(self.temporary.name) / "expansion.iwc-bundle.zip"
        with zipfile.ZipFile(
            expansion_archive, "w", compression=zipfile.ZIP_DEFLATED
        ) as archive:
            archive.writestr("cycle-bundle.json", json.dumps(web_bundle))
            archive.writestr(
                "compressed-bomb.bin",
                b"0" * (coach_state.MAX_ARCHIVE_ENTRY_BYTES + 1),
            )
        self.assertLess(
            expansion_archive.stat().st_size, coach_state.MAX_ARCHIVE_BYTES
        )
        with self.assertRaisesRegex(CoachStateError, "exceeds 10 MiB"):
            coach_state.import_bundle(archive_destination, expansion_archive)

        crowded_archive = Path(self.temporary.name) / "crowded.iwc-bundle.zip"
        with zipfile.ZipFile(crowded_archive, "w") as archive:
            archive.writestr("cycle-bundle.json", json.dumps(web_bundle))
            for index in range(coach_state.MAX_ARCHIVE_ENTRIES):
                archive.writestr(f"extra-{index}.txt", "safe but excessive")
        with self.assertRaisesRegex(CoachStateError, "more than 50 entries"):
            coach_state.import_bundle(archive_destination, crowded_archive)

        missing_bundle_archive = Path(self.temporary.name) / "missing.iwc-bundle.zip"
        with zipfile.ZipFile(missing_bundle_archive, "w") as archive:
            archive.writestr("report.md", "No canonical bundle here.")
        with self.assertRaisesRegex(CoachStateError, "cycle-bundle.json is missing"):
            coach_state.import_bundle(archive_destination, missing_bundle_archive)

        bundle = json.loads(bundle_path.read_text(encoding="utf-8"))
        bundle["cycle"]["api_key"] = "not-a-real-key"
        bundle["checksum"]["value"] = coach_state._bundle_checksum(bundle)
        unsafe_path = Path(self.temporary.name) / "unsafe.json"
        unsafe_path.write_text(json.dumps(bundle), encoding="utf-8")
        with self.assertRaises(CoachStateError):
            coach_state.import_bundle(destination, unsafe_path)

    def test_state_validator_blocks_false_mastery_from_lesson(self) -> None:
        self.new_cycle()
        append_jsonl(
            state_root(self.workspace) / "evidence.jsonl",
            {
                "schemaVersion": "1.0.0",
                "id": new_uuid7(),
                "userId": new_uuid7(),
                "skillId": "collocation_perspective",
                "kind": "CROSS_TOPIC_TRANSFER",
                "outcome": "PASS",
                "independent": True,
                "firstAttempt": True,
                "hintLevel": "NONE",
                "confidence": 0.9,
                "validForStateTransition": True,
                "adjudicationStatus": "ACCEPTED",
                "contextId": "lesson-context",
                "topicId": "education",
                "sourceEntityType": "EXERCISE",
                "sourceEntityId": new_uuid7(),
                "occurredAt": "2026-08-13T20:00:00+08:00",
            },
        )
        errors = validate_state.validate_workspace(self.workspace)
        self.assertTrue(
            any("cannot claim retained or transferred" in error for error in errors)
        )

    def test_uuid7_generator_and_supplied_web_ids(self) -> None:
        generated = new_uuid7(timestamp_ms=1_786_646_400_000)
        self.assertEqual(require_uuid7(generated), generated)
        with self.assertRaises(CoachStateError):
            require_uuid7("cycle-test")
        imported = self.new_cycle()
        self.assertEqual(imported["cycle_id"], TEST_CYCLE_ID)


if __name__ == "__main__":
    unittest.main()
