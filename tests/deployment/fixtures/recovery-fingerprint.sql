\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

SELECT jsonb_build_object(
  'schema', jsonb_build_object(
    'drizzleMigrations', (SELECT count(*) FROM drizzle.__drizzle_migrations),
    'graphileMigrations', (SELECT count(*) FROM graphile_worker.migrations)
  ),
  'training', jsonb_build_object(
    'cycle', (
      SELECT jsonb_build_object(
        'id', id,
        'questionId', question_id,
        'status', status,
        'schemaVersion', schema_version,
        'timezone', timezone,
        'coreSkillId', core_skill_id,
        'startedAt', started_at,
        'completedAt', completed_at
      )
      FROM training_cycle
      WHERE id = '70000000-0000-7000-8000-000000000003'
    ),
    'attempt', (
      SELECT jsonb_build_object(
        'id', id,
        'kind', kind,
        'revision', revision,
        'content', content,
        'wordCount', word_count,
        'durationSeconds', duration_seconds,
        'submittedAt', submitted_at,
        'abnormalConditions', abnormal_conditions,
        'assisted', assisted,
        'interrupted', interrupted
      )
      FROM writing_attempt
      WHERE id = '70000000-0000-7000-8000-000000000004'
    ),
    'objective', (
      SELECT jsonb_build_object(
        'id', id,
        'skillId', skill_id,
        'role', role,
        'sourceEvidenceIds', source_evidence_ids,
        'priority', priority,
        'successCriterion', success_criterion
      )
      FROM learning_objective
      WHERE id = '70000000-0000-7000-8000-000000000005'
    )
  ),
  'skill', jsonb_build_object(
    'event', (
      SELECT jsonb_build_object(
        'id', id,
        'skillId', skill_id,
        'stage', evidence_stage,
        'sourceType', source_type,
        'sourceId', source_id,
        'valid', valid,
        'confidence', confidence,
        'occurredAt', occurred_at,
        'payload', payload
      )
      FROM skill_evidence_event
      WHERE id = '70000000-0000-7000-8000-000000000006'
    ),
    'state', (
      SELECT jsonb_build_object(
        'skillId', skill_id,
        'appliedAt', applied_at,
        'retainedAt', retained_at,
        'transferredAt', transferred_at,
        'stability', stability,
        'evidenceCount', evidence_count
      )
      FROM user_skill_state
      WHERE user_id = 'recovery-gate-owner'
        AND skill_id = 'collocation_perspective'
    )
  ),
  'scheduling', jsonb_build_object(
    'preference', (
      SELECT jsonb_build_object(
        'targetBand', target_band,
        'track', ielts_track,
        'feedbackLocale', feedback_locale,
        'reminderInApp', reminder_in_app,
        'reminderEmail', reminder_email,
        'quietHours', quiet_hours
      )
      FROM learning_preference
      WHERE user_id = 'recovery-gate-owner'
    ),
    'slot', (
      SELECT jsonb_build_object(
        'weekday', weekday,
        'localTime', local_time,
        'timezone', timezone,
        'enabled', enabled
      )
      FROM learning_slot
      WHERE id = '70000000-0000-7000-8000-00000000000c'
    ),
    'rewrite', (
      SELECT jsonb_build_object(
        'id', id,
        'status', status,
        'availableAt', available_at,
        'expiresAt', expires_at,
        'checklist', abstract_checklist,
        'lastInstructionExposureAt', last_instruction_exposure_at,
        'assisted', assisted,
        'prerequisiteSkipped', prerequisite_skipped
      )
      FROM rewrite_task
      WHERE id = '70000000-0000-7000-8000-000000000008'
    ),
    'transfer', (
      SELECT jsonb_build_object(
        'id', id,
        'questionId', question_id,
        'skillId', skill_id,
        'objectiveId', objective_id,
        'status', status,
        'availableAt', available_at,
        'expiresAt', expires_at
      )
      FROM transfer_task
      WHERE id = '70000000-0000-7000-8000-000000000009'
    ),
    'mixedReview', (
      SELECT jsonb_build_object(
        'id', id,
        'targetCycleId', target_cycle_id,
        'status', status,
        'dueAt', due_at,
        'result', result
      )
      FROM mixed_review_task
      WHERE id = '70000000-0000-7000-8000-00000000000a'
    ),
    'notification', (
      SELECT jsonb_build_object(
        'id', id,
        'channel', channel,
        'kind', kind,
        'dedupeKey', dedupe_key,
        'payload', payload,
        'scheduledAt', scheduled_at,
        'sentAt', sent_at
      )
      FROM notification
      WHERE id = '70000000-0000-7000-8000-00000000000b'
    )
  )
)::text;
