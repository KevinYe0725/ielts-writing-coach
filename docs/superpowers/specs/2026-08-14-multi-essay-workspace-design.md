# Multi-Essay Workspace Design

## Goal

Let a learner keep up to eight IELTS Writing Task 2 essays in progress at
once, switch between them at any time, and keep every essay's draft,
assessment, focused teaching, timed paper, rewrite, comparison, and transfer
work isolated from the others.

## Decisions

- The product uses a dedicated **My essays** workspace rather than a selector
  hidden inside Today.
- A learner may have **eight non-completed, non-archived training cycles**.
  Completed cycles remain in history and do not consume a workspace slot.
- No learning record is deleted. This feature does not introduce a learner
  deletion control or an automatic archival job.
- Today remains a single, calm recommendation. It must also expose the active
  essay list so a learner can deliberately continue another essay.
- Every destination keeps explicit `cycle` and entity identifiers in its URL.
  No page may infer its essay from Today or from a globally "current" cycle.

## Learner Experience

### My essays

`/essays` is the home for concurrent work. It has:

1. A clear count, such as “3 of 8 essays in progress”.
2. A primary “Start a new essay” action when fewer than eight slots are in
   use. It reuses the existing question picker and private-question flow.
3. One compact, keyboard-accessible card per active essay. Each card shows the
   question topic and prompt excerpt, its current phase, the most useful next
   action, and when it was last changed.
4. A “Continue” action that navigates to that card's exact writing, feedback,
   teaching, paper, rewrite, comparison, or transfer destination.
5. A calm, explanatory full state at eight active essays. It preserves all
   work and directs the learner to continue an existing essay rather than
   presenting a destructive action.

There is no separate mutable “current essay”. The URL is the source of truth
when a learner opens or refreshes a page.

### Today

Today continues to choose one recommended next step by the existing learning
priority rules. Below that recommendation it gains a concise “Your essays”
list. Selecting a card opens that essay directly; it does not change the
priority of other essays or overwrite their drafts.

### Failure and recovery behavior

- Loading a workspace card that is temporarily unavailable shows a per-card
  retry affordance without hiding the other essays.
- A missing assessment, focused lesson, or practice paper remains scoped to
  its own cycle. Existing automatic focused-content recovery runs for that
  cycle only.
- Repeated taps on “Start a new essay” use the existing idempotency protection.
- Server-side locking is retained so concurrent tabs cannot create a ninth
  active cycle.
- A stale tab that tries to start an essay after the eighth slot was used gets
  a friendly `ACTIVE_CYCLE_LIMIT` response and refreshes the workspace list;
  it never corrupts or replaces an existing essay.

## Server and Data Design

`training_cycle` is already the correct aggregate boundary and already has
question, state, timestamps, and user ownership. No schema migration is
needed.

### Active-workspace read model

Add an authenticated active-cycle workspace endpoint. It reads only the
actor's non-archived, non-completed cycles and returns no more than eight
entries. For each entry it loads the same cycle-owned resources used by Today,
derives a `NextAction` with `getUniqueNextAction`, and projects a safe
learner-facing record:

```ts
interface EssayWorkspaceItem {
  id: string;
  prompt: string;
  topic: string;
  status: string;
  updatedAt: string;
  nextAction: NextAction;
  resources: {
    writingAvailable: boolean;
    feedbackAvailable: boolean;
    lessonId: string | null;
    rewriteTaskId: string | null;
    comparisonAvailable: boolean;
    transferTaskId: string | null;
  };
}

interface EssayWorkspaceData {
  activeCount: number;
  activeLimit: 8;
  essays: EssayWorkspaceItem[];
}
```

The endpoint uses `getUniqueNextAction` per cycle but does not apply Today’s
cross-cycle prioritisation; every card carries its own action. Resource IDs
make the client construct explicit destination URLs through
`learningRouteHref`.

### Create guard

The existing learner-row lock stays in the create-cycle transaction. Its active
count changes from two to eight, and its learner error says that eight essays
are already in progress. This is the sole authoritative limit check; the
client only uses the workspace count to guide its presentation.

## Client Design

Add `getEssayWorkspace()` to `LearningClient` with HTTP and Mock
implementations. Keep the new wire mapping alongside existing Today mappings
and validate every item before displaying it.

Create a focused workspace page and components:

- `EssayWorkspacePage` owns load/retry/new-question state.
- `EssayCard` receives an immutable workspace item and maps its `nextAction`
  plus resources to `learningRouteHref`.
- The question picker is shared with Today rather than duplicated. Its create
  callback navigates straight to `/write?cycle=<new-id>`.

Today receives only a small `ActiveEssayList` composition: it reads the same
workspace resource and never chooses destinations by array position or a
latest-cycle heuristic.

## Testing

1. PostgreSQL route tests prove eight cycles can be created concurrently and a
   ninth receives a stable conflict without changing the existing eight.
2. Workspace route tests prove actor ownership, exclusion of completed and
   archived cycles, cycle-specific next action projection, and resource IDs.
3. HTTP-client tests prove malformed workspace responses are rejected and
   every destination includes its originating cycle ID.
4. Browser tests create/select two active essays, save distinct drafts,
   refresh, switch back, and prove each draft and feedback route remains
   attached to the right cycle.
5. Browser tests prove the ninth-slot state keeps existing cards usable and
   does not offer deletion.
6. Existing focused-teaching recovery tests remain green for a non-selected
   active essay, proving automatic recovery is cycle scoped.

## Out of Scope

- Deleting learning data.
- A generic folder/tag system.
- Changing the learning-quality rubric or the focused-teaching generation
  contract.
- Changing how a completed cycle enters delayed rewrite or transfer work.
