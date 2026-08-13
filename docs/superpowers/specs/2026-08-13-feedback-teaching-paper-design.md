# Feedback → Teaching → Practice Design

## Goal

Turn one IELTS Writing Task 2 attempt into a coherent three-stage learning path:

1. a detailed correction report grounded in the learner's original text;
2. a focused teaching module that builds the highest-priority ability;
3. a complete timed paper that tests that same ability in changed contexts.

## Learner flow

### 1. Detailed correction report

The report opens with the task and the learner's complete immutable Version 1. It keeps the four IELTS estimates, then provides:

- paragraph-level purpose and development commentary;
- sentence-level comparison cards with the original wording, issue type, corrected version, explanation, knowledge point, and transfer rule;
- a compact “small leaks” section for grammar, spelling, word form, punctuation, article, agreement, and countability errors;
- a clear distinction between must-fix errors, naturalness improvements, and optional polish.

Every claim must point back to exact learner wording. The report never invents a correction solely to appear detailed.

### 2. Focused teaching module

The report's primary target opens a separate teaching page before the paper. The teaching module contains:

- what the learner currently does and why it limits the writing;
- the decision rule to learn;
- three to five knowledge cards;
- a reusable expression bank with usage notes, not decorative “advanced vocabulary”;
- one worked example broken into thinking steps;
- two short, untimed checks with answers/explanations available immediately;
- a “ready for the paper” checklist.

The module teaches one core target. Related language is included only when it supports the same decision rule.

### 3. Timed practice paper

The existing eight-question, 60-minute paper remains the assessment stage. The timer starts only after the learner explicitly enters the paper. Questions reuse the teaching target but change wording and context. No answer, hint, or item judgment appears before whole-paper submission. After submission, only below-standard items expand into detailed analysis.

## Data design

One AI generation creates a `FocusedLearningPackage` containing both `teachingModule` and `paper`. The package is stored in the existing lesson plan JSONB payload, so no database migration is needed. Both halves carry the same target title and success description. Deterministic validation rejects packages whose teaching target and paper objective diverge.

The assessment pipeline stores richer structured diagnosis in the existing issue-evidence JSONB field. It preserves exact offsets and adds learner-facing correction, explanation, knowledge point, issue level, and transfer action. Existing records remain readable through client fallbacks.

## Navigation

- `/feedback?cycle=…` — detailed report
- `/lesson?cycle=…&lesson=…` — focused teaching
- `/lesson/paper?cycle=…&lesson=…` — timed paper

The sidebar label becomes “专项提升”. Feedback links to teaching; teaching links to the paper. The paper links back to both the report and teaching, preserving its draft.

## Failure behavior

- Existing legacy paper packages without teaching content receive a safe deterministic teaching fallback derived from the primary issue.
- AI generation failure leaves the completed report usable and offers regeneration.
- Missing or low-confidence detail is labelled as uncertain and does not become a hard error.
- Opening teaching never starts the paper timer.

## Acceptance criteria

- The report visibly contains the original task and essay.
- A learner can identify exact grammar/spelling/collocation/logic evidence and see a corrected alternative.
- Teaching and paper share one target.
- Teaching is available before the timed paper and does not start its timer.
- The paper has eight questions totalling 60 minutes and hides answers until submission.
- Browser navigation preserves cycle and lesson identity throughout the three stages.
