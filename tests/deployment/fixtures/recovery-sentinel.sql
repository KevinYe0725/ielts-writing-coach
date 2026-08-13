\set ON_ERROR_STOP on

BEGIN;

INSERT INTO "user" (
  "id",
  "name",
  "email",
  "email_verified",
  "role",
  "locale",
  "timezone"
) VALUES (
  'recovery-gate-owner',
  'Recovery Gate Owner',
  'recovery-gate@example.invalid',
  true,
  'owner',
  'zh-CN',
  'Asia/Shanghai'
);

INSERT INTO "question" (
  "id",
  "external_id",
  "owner_id",
  "source",
  "visibility",
  "ielts_track",
  "question_type",
  "topic",
  "prompt",
  "prompt_zh",
  "bank_version"
) VALUES
  (
    '70000000-0000-7000-8000-000000000001',
    'recovery-gate-question-primary',
    'recovery-gate-owner',
    'private_user',
    'private',
    'academic',
    'opinion',
    'education',
    'Some people believe that schools should teach every child a foreign language from primary school. To what extent do you agree or disagree?',
    '有人认为学校应从小学起教授每个孩子一门外语。你在多大程度上同意或不同意？',
    'recovery-gate-v1'
  ),
  (
    '70000000-0000-7000-8000-000000000002',
    'recovery-gate-question-transfer',
    'recovery-gate-owner',
    'private_user',
    'private',
    'academic',
    'discussion',
    'work_economy',
    'Some people think employers should provide regular training, while others believe employees should manage their own development. Discuss both views and give your opinion.',
    '有人认为雇主应提供定期培训，另一些人认为员工应自行管理职业发展。讨论双方观点并给出你的看法。',
    'recovery-gate-v1'
  );

INSERT INTO "learning_preference" (
  "user_id",
  "target_band",
  "ielts_track",
  "feedback_locale",
  "reminder_in_app",
  "reminder_email",
  "quiet_hours"
) VALUES (
  'recovery-gate-owner',
  7.0,
  'academic',
  'zh-CN',
  true,
  false,
  '{"start":"22:30","end":"07:00"}'::jsonb
);

INSERT INTO "learning_slot" (
  "id",
  "user_id",
  "weekday",
  "local_time",
  "timezone",
  "enabled"
) VALUES (
  '70000000-0000-7000-8000-00000000000c',
  'recovery-gate-owner',
  4,
  '20:00',
  'Asia/Shanghai',
  true
);

INSERT INTO "training_cycle" (
  "id",
  "user_id",
  "question_id",
  "status",
  "schema_version",
  "timezone",
  "core_skill_id",
  "started_at",
  "completed_at"
) VALUES (
  '70000000-0000-7000-8000-000000000003',
  'recovery-gate-owner',
  '70000000-0000-7000-8000-000000000001',
  'CORE_CYCLE_COMPLETED',
  '1.0.0',
  'Asia/Shanghai',
  'collocation_perspective',
  '2099-01-02T12:00:00Z',
  '2099-01-02T14:00:00Z'
);

INSERT INTO "writing_attempt" (
  "id",
  "cycle_id",
  "user_id",
  "kind",
  "revision",
  "content",
  "word_count",
  "duration_seconds",
  "locked_at",
  "submitted_at",
  "abnormal_conditions",
  "assisted",
  "interrupted"
) VALUES (
  '70000000-0000-7000-8000-000000000004',
  '70000000-0000-7000-8000-000000000003',
  'recovery-gate-owner',
  'version_1',
  3,
  'Primary-school pupils face less academic pressure, so short language lessons can remain manageable while regular exposure makes basic patterns familiar.',
  21,
  2340,
  '2099-01-02T12:40:00Z',
  '2099-01-02T12:40:00Z',
  '["recovery-gate-synthetic"]'::jsonb,
  false,
  false
);

INSERT INTO "learning_objective" (
  "id",
  "cycle_id",
  "skill_id",
  "role",
  "source_evidence_ids",
  "priority",
  "success_criterion"
) VALUES (
  '70000000-0000-7000-8000-000000000005',
  '70000000-0000-7000-8000-000000000003',
  'collocation_perspective',
  'CORE',
  '["70000000-0000-7000-8000-000000000006"]'::jsonb,
  1,
  'Express academic pressure with a natural comparison in a new context.'
);

INSERT INTO "skill_evidence_event" (
  "id",
  "user_id",
  "cycle_id",
  "skill_id",
  "evidence_stage",
  "source_type",
  "source_id",
  "valid",
  "confidence",
  "occurred_at",
  "payload"
) VALUES (
  '70000000-0000-7000-8000-000000000006',
  'recovery-gate-owner',
  '70000000-0000-7000-8000-000000000003',
  'collocation_perspective',
  'APPLIED',
  'LESSON_RESPONSE',
  '70000000-0000-7000-8000-000000000007',
  true,
  0.93,
  '2099-01-02T13:42:00Z',
  '{"schemaVersion":"1.0.0","synthetic":true,"criterion":"natural comparison"}'::jsonb
);

INSERT INTO "user_skill_state" (
  "user_id",
  "skill_id",
  "applied_at",
  "retained_at",
  "transferred_at",
  "stability",
  "evidence_count"
) VALUES (
  'recovery-gate-owner',
  'collocation_perspective',
  '2099-01-02T13:42:00Z',
  NULL,
  NULL,
  0.72,
  1
);

INSERT INTO "rewrite_task" (
  "id",
  "cycle_id",
  "user_id",
  "status",
  "available_at",
  "expires_at",
  "abstract_checklist",
  "last_instruction_exposure_at",
  "assisted",
  "prerequisite_skipped"
) VALUES (
  '70000000-0000-7000-8000-000000000008',
  '70000000-0000-7000-8000-000000000003',
  'recovery-gate-owner',
  'LOCKED',
  '2099-01-04T12:00:00Z',
  '2099-01-05T12:00:00Z',
  '["Check that every comparison names both sides.","Use a natural academic-pressure collocation."]'::jsonb,
  '2099-01-02T14:00:00Z',
  false,
  false
);

INSERT INTO "transfer_task" (
  "id",
  "source_cycle_id",
  "user_id",
  "question_id",
  "skill_id",
  "objective_id",
  "status",
  "available_at",
  "expires_at"
) VALUES (
  '70000000-0000-7000-8000-000000000009',
  '70000000-0000-7000-8000-000000000003',
  'recovery-gate-owner',
  '70000000-0000-7000-8000-000000000002',
  'collocation_perspective',
  '70000000-0000-7000-8000-000000000005',
  'PLANNED',
  '2099-01-08T12:00:00Z',
  '2099-01-10T12:00:00Z'
);

INSERT INTO "mixed_review_task" (
  "id",
  "source_cycle_id",
  "user_id",
  "target_cycle_id",
  "status",
  "due_at",
  "result"
) VALUES (
  '70000000-0000-7000-8000-00000000000a',
  '70000000-0000-7000-8000-000000000003',
  'recovery-gate-owner',
  NULL,
  'PLANNED',
  '2099-01-16T12:00:00Z',
  '{"synthetic":true,"gate":"pending"}'::jsonb
);

INSERT INTO "notification" (
  "id",
  "user_id",
  "channel",
  "kind",
  "dedupe_key",
  "payload",
  "scheduled_at"
) VALUES (
  '70000000-0000-7000-8000-00000000000b',
  'recovery-gate-owner',
  'in_app',
  'REWRITE_UNLOCKED',
  'recovery-gate-rewrite-reminder',
  '{"href":"/rewrite","synthetic":true}'::jsonb,
  '2099-01-04T12:00:00Z'
);

COMMIT;
