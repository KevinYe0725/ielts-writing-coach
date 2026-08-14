# Multi-Essay Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a learner keep up to eight concurrent essays, open each through
an explicit URL, and see every in-progress essay in a dedicated workspace.

**Architecture:** `training_cycle` remains the sole essay aggregate. A new
authenticated workspace read model derives one `NextAction` per active cycle
and projects only the identifiers the client needs to construct explicit
destinations. The client exposes that read model through both HTTP and Demo
services; `/essays` renders it, while Today embeds a compact switcher without
changing Today’s cross-cycle recommendation.

**Tech Stack:** Next.js App Router, React, TypeScript, Drizzle/PostgreSQL,
Vitest, Playwright, existing `@iwc/learning-core` next-action reducer.

## Global Constraints

- An active essay is a non-archived `training_cycle` whose status is not
  `CORE_CYCLE_COMPLETED`.
- The maximum is exactly eight active essays; completed history remains
  untouched and there is no deletion control.
- The server-side learner row lock remains the only authoritative active-limit
  enforcement.
- Every learner-facing destination includes its cycle ID using
  `learningRouteHref`; no page discovers an essay by Today’s selected cycle.
- A lesson, paper, or assessment recovery remains scoped to its own cycle.
- All request bodies remain bounded and all routes require the authenticated
  actor.

---

### Task 1: Extend the server’s active-cycle boundary

**Files:**

- Modify: `apps/web/src/app/api/v1/training-cycles/route.ts:23-101`
- Modify: `apps/web/src/lib/client/http-route-contract.test.ts:210-285`

**Interfaces:**

- Consumes: the existing `POST /api/v1/training-cycles` request shape and
  transaction-level learner-row lock.
- Produces: an eight-cycle limit and `ACTIVE_CYCLE_LIMIT` whose detail says
  that eight essays are already in progress.

- [ ] **Step 1: Write the failing concurrent eight-cycle test**

  Replace the current two-cycle test with a real PostgreSQL test that creates
  seven active cycles, issues two distinct concurrent creation requests, and
  proves one is `201`, one is `409`, and exactly eight cycles remain:

  ```ts
  expect(responses.map((response) => response.status).sort()).toEqual([
    201, 409,
  ]);
  await expect(
    database.db.query.trainingCycle.findMany({
      where: eq(trainingCycle.userId, userId),
    }),
  ).resolves.toHaveLength(8);
  await expect(conflict.json()).resolves.toMatchObject({
    code: "ACTIVE_CYCLE_LIMIT",
    detail: expect.stringMatching(/eight essays/i),
  });
  ```

- [ ] **Step 2: Run the route-contract test and verify RED**

  Run:

  ```bash
  IWC_TEST_DATABASE_URL="$IWC_TEST_DATABASE_URL" pnpm --filter @iwc/web test -- http-route-contract.test.ts
  ```

  Expected: the concurrent ninth-slot assertion fails because the existing
  route limits active cycles at two.

- [ ] **Step 3: Change only the authoritative limit and learner copy**

  In the existing locked transaction, change `if (active.length >= 2)` to
  `if (active.length >= 8)`. Preserve every existing `where` predicate and
  idempotency behavior. Change the problem title/detail to learner-facing
  wording that says eight essays are already in progress and suggests
  continuing one.

- [ ] **Step 4: Run the focused test and verify GREEN**

  Run the command from Step 2. Expected: the new concurrency test and all
  existing training-cycle route tests pass.

- [ ] **Step 5: Commit the server limit change**

  ```bash
  git add apps/web/src/app/api/v1/training-cycles/route.ts apps/web/src/lib/client/http-route-contract.test.ts
  git commit -m "feat: allow eight active essays"
  ```

### Task 2: Create the authenticated workspace read model

**Files:**

- Create: `apps/web/src/app/api/v1/essays/route.ts`
- Create: `apps/web/src/app/api/v1/essays/route.test.ts`
- Create: `apps/web/src/lib/server/essay-workspace.ts`
- Create: `apps/web/src/lib/server/essay-workspace.test.ts`

**Interfaces:**

- Consumes: `trainingCycle`, `lessonPlan`, `rewriteTask`, `transferTask`,
  `mixedReviewTask`, `writingAttempt`, `getUniqueNextAction`, and the
  `deriveLessonStatus` rules currently in `today/route.ts`.
- Produces:

  ```ts
  export interface EssayWorkspaceItem {
    id: string;
    prompt: string;
    topic: string;
    updatedAt: string;
    status: string;
    nextAction: NextAction;
    resources: LearningNavigationResources;
  }

  export interface EssayWorkspaceData {
    activeCount: number;
    activeLimit: 8;
    essays: EssayWorkspaceItem[];
  }

  export async function loadEssayWorkspace(
    db: Database,
    userId: string,
    now: string,
  ): Promise<EssayWorkspaceData>;
  ```

- [ ] **Step 1: Write server helper RED tests**

  In `essay-workspace.test.ts`, create two cycles for one user: an active
  `ATTEMPT_1_ACTIVE` cycle with a draft and a `QUESTION_READY` cycle. Also add
  archived and `CORE_CYCLE_COMPLETED` cycles. Assert that only the two active
  cycles are projected, that each has its own action, and that resource IDs
  belong to the matching cycle:

  ```ts
  expect(workspace).toMatchObject({ activeCount: 2, activeLimit: 8 });
  expect(workspace.essays.map((essay) => essay.id)).toEqual([
    activeCycleId,
    readyCycleId,
  ]);
  expect(workspace.essays[0]?.nextAction.kind).toBe("CONTINUE_ATTEMPT_1");
  expect(workspace.essays[1]?.nextAction.kind).toBe("START_ATTEMPT_1");
  ```

- [ ] **Step 2: Run helper tests and verify RED**

  Run:

  ```bash
  IWC_TEST_DATABASE_URL="$IWC_TEST_DATABASE_URL" pnpm --filter @iwc/web test -- essay-workspace.test.ts
  ```

  Expected: test collection fails because `loadEssayWorkspace` does not yet
  exist.

- [ ] **Step 3: Implement the pure server projection**

  Extract `deriveLessonStatus` from Today into `essay-workspace.ts`, query
  only the authenticated user’s non-archived/non-completed cycles with the
  existing owned relations, and derive one `getUniqueNextAction` per cycle.
  Sort cards by `updatedAt` descending and then cycle ID. Project resource IDs
  with the same semantics as Today but use camelCase learner wire values.

- [ ] **Step 4: Add the route and route ownership RED/GREEN test**

  Implement `GET /api/v1/essays` using `requireSession`,
  `getServerContext`, and `apiRoute`. Its test creates a second user’s active
  cycle and asserts it never appears:

  ```ts
  const response = await GET(new Request("https://coach.test/api/v1/essays"));
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    active_count: 2,
    active_limit: 8,
  });
  ```

  Verify the test first fails with a missing route, then passes after adding
  the route. The route serializes dates and resource keys deliberately; it
  never returns owner IDs, job IDs, or assessment internals.

- [ ] **Step 5: Run focused server tests and commit**

  ```bash
  IWC_TEST_DATABASE_URL="$IWC_TEST_DATABASE_URL" pnpm --filter @iwc/web test -- essay-workspace.test.ts apps/web/src/app/api/v1/essays/route.test.ts
  git add apps/web/src/lib/server/essay-workspace.ts apps/web/src/lib/server/essay-workspace.test.ts apps/web/src/app/api/v1/essays/route.ts apps/web/src/app/api/v1/essays/route.test.ts
  git commit -m "feat: expose active essay workspace"
  ```

### Task 3: Add typed client and demo access

**Files:**

- Modify: `apps/web/src/lib/client/types.ts`
- Modify: `apps/web/src/lib/client/http-service.ts`
- Modify: `apps/web/src/lib/client/http-service.test.ts`
- Modify: `apps/web/src/lib/client/mock-service.ts`
- Modify: `apps/web/src/lib/client/http-route-contract.test.ts`

**Interfaces:**

- Consumes: the `EssayWorkspaceData` JSON envelope from Task 2.
- Produces: `LearningClient.getEssayWorkspace(): Promise<EssayWorkspaceData>`
  in the HTTP and Demo client implementations.

- [ ] **Step 1: Write HTTP mapping RED tests**

  Add a client test that serves a valid two-essay response and asserts the
  mapped values and action IDs are preserved. Add a malformed item with a
  missing cycle ID and assert `LearningClientError` with `INVALID_RESPONSE`:

  ```ts
  await expect(client.getEssayWorkspace()).resolves.toMatchObject({
    activeCount: 2,
    activeLimit: 8,
    essays: [{ id: firstCycleId }, { id: secondCycleId }],
  });
  await expect(malformedClient.getEssayWorkspace()).rejects.toMatchObject({
    code: "INVALID_RESPONSE",
  });
  ```

- [ ] **Step 2: Run the client test and verify RED**

  Run:

  ```bash
  pnpm --filter @iwc/web test -- http-service.test.ts
  ```

  Expected: TypeScript/test failure because `getEssayWorkspace` is absent.

- [ ] **Step 3: Add types, strict wire mapper, HTTP method, and Demo data**

  Define `EssayWorkspaceItem` and `EssayWorkspaceData` in `types.ts`; add
  `getEssayWorkspace` to the interface. Map the snake_case route payload only
  after checking strings, dates, action kind, and resources. Add Demo data for
  two distinct cycles, with per-cycle local-storage keys so writing one demo
  essay cannot replace another’s draft.

- [ ] **Step 4: Verify GREEN and exact destinations**

  Add/extend a route test that builds `learningRouteHref` from both returned
  cards and asserts each includes its own `cycle` value. Run the command in
  Step 2 plus:

  ```bash
  pnpm --filter @iwc/web test -- learning-route.test.ts http-route-contract.test.ts
  ```

- [ ] **Step 5: Commit client access**

  ```bash
  git add apps/web/src/lib/client/types.ts apps/web/src/lib/client/http-service.ts apps/web/src/lib/client/http-service.test.ts apps/web/src/lib/client/mock-service.ts apps/web/src/lib/client/http-route-contract.test.ts
  git commit -m "feat: load concurrent essay workspace"
  ```

### Task 4: Build the My essays workspace and Today switcher

**Files:**

- Create: `apps/web/src/app/essays/page.tsx`
- Create: `apps/web/src/app/essays/page.module.css`
- Create: `apps/web/src/components/essay-workspace.tsx`
- Create: `apps/web/src/components/essay-workspace.test.tsx`
- Modify: `apps/web/src/app/today/page.tsx`
- Modify: `apps/web/src/components/app-shell.tsx`
- Modify: `apps/web/src/components/locale-provider.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**

- Consumes: `LearningClient.getEssayWorkspace`, `EssayWorkspaceData`,
  `learningRouteHref`, `useDemoResource`, and the existing question picker
  calls from Today.
- Produces: `/essays`, an accessible `My essays` navigation entry, an
  eight-slot workspace state, and a compact Today switcher.

- [ ] **Step 1: Write rendering and behavior RED tests**

  In `essay-workspace.test.tsx`, render two workspace items and assert both
  prompts, phase labels, and exact cycle-aware Continue links. Render eight
  items and assert the new-essay action is absent while all Continue links
  remain. Add a Today composition test asserting a non-recommended card links
  to its own cycle:

  ```tsx
  expect(screen.getByRole("link", { name: /继续第一篇/i })).toHaveAttribute(
    "href",
    "/write?cycle=cycle-one",
  );
  expect(screen.getByRole("link", { name: /继续第二篇/i })).toHaveAttribute(
    "href",
    "/feedback?cycle=cycle-two",
  );
  ```

- [ ] **Step 2: Run component tests and verify RED**

  Run:

  ```bash
  pnpm --filter @iwc/web test -- essay-workspace.test.tsx
  ```

  Expected: test collection fails because the workspace component/page do not
  exist.

- [ ] **Step 3: Implement the article-like workspace, not a modal**

  Create `EssayWorkspace` as a semantic section with a heading, progress count
  and one link card per essay. Make cards use a visible Continue link,
  preserving native keyboard operation. Reuse Today’s question picker in a
  `variant="workspace"` component or extract that picker before composing it;
  do not duplicate question creation state. At eight slots, replace the create
  action with calm explanatory copy and leave all card links enabled.

- [ ] **Step 4: Compose it into Today and global navigation**

  Add `My essays` / `我的作文` to the sidebar and mobile navigation. In Today,
  fetch the workspace independently from the next-task data and render a
  compact card list below the recommendation. A workspace fetch failure must
  not hide or disable Today’s recommended task.

- [ ] **Step 5: Verify GREEN and responsive semantics**

  Run the component test from Step 2 and:

  ```bash
  pnpm --filter @iwc/web typecheck
  pnpm --filter @iwc/web lint
  ```

  Confirm all focusable cards are real links, no control offers deletion, and
  390px layout stacks cards without horizontal overflow.

- [ ] **Step 6: Commit workspace UI**

  ```bash
  git add apps/web/src/app/essays apps/web/src/components/essay-workspace.tsx apps/web/src/components/essay-workspace.test.tsx apps/web/src/app/today/page.tsx apps/web/src/components/app-shell.tsx apps/web/src/components/locale-provider.tsx apps/web/src/app/globals.css
  git commit -m "feat: add multi-essay workspace"
  ```

### Task 5: Prove isolation, recovery, and the full browser workflow

**Files:**

- Modify: `tests/e2e/writing.spec.ts` (or create
  `tests/e2e/essay-workspace.spec.ts` if no focused writing suite exists)
- Modify: `tests/e2e/lesson.spec.ts`
- Modify: `apps/web/src/lib/client/learning-navigation.test.ts`

**Interfaces:**

- Consumes: all previous tasks, explicit route identities, and existing
  focused-package recovery behavior.
- Produces: browser evidence that multiple essays can be switched and
  recovered independently.

- [ ] **Step 1: Write browser RED flow for two essays**

  Use the normal question picker to start two essays. Save distinct drafts in
  each using their explicit `/write?cycle=` URL, reload, switch through
  `/essays`, and assert the original cycle’s draft is restored. Then navigate
  one card through feedback/lesson and assert its `lesson` URL retains the
  same cycle ID.

- [ ] **Step 2: Run only the new browser test and verify RED**

  Run:

  ```bash
  NEXT_PUBLIC_DEMO_MODE=true pnpm exec playwright test tests/e2e/essay-workspace.spec.ts --project=chromium --workers=1
  ```

  Expected: failure because `/essays` and concurrent Demo cycle data are not
  implemented.

- [ ] **Step 3: Complete only implementation gaps exposed by the browser test**

  Do not add a global selected-cycle store. If the Demo implementation needs
  extra per-cycle storage, name every storage key with the cycle ID. If the
  workspace’s action mapping needs a missing resource identity, add it to the
  server/client projection and its unit test first.

- [ ] **Step 4: Add ninth-slot and cycle-scoped recovery browser cases**

  Seed or create eight active Demo/HTTP workspace records. Assert the ninth
  slot shows explanatory copy, all eight Continue links work, and no deletion
  control exists. Trigger focused-package recovery for only one essay and
  assert the other essay’s URL, draft, and workspace card remain unchanged.

- [ ] **Step 5: Run full verification and commit**

  ```bash
  pnpm validate
  pnpm test:e2e
  git add tests/e2e apps/web/src/lib/client/learning-navigation.test.ts
  git commit -m "test: cover multi-essay isolation"
  ```

## Plan Self-Review

- **Spec coverage:** Task 1 enforces the eight-slot boundary; Task 2 provides
  cycle-owned server data; Task 3 makes it safe for all client modes; Task 4
  delivers the workspace and Today switcher; Task 5 proves switching,
  persistence, cap behavior, and cycle-scoped recovery.
- **No destructive scope:** No task deletes, archives, exports, or rewrites a
  completed cycle. Every card is navigational only.
- **Identity consistency:** `EssayWorkspaceItem.id` is the cycle ID in every
  task. `resources` uses the existing `LearningNavigationResources` shape and
  `learningRouteHref` owns URL construction.
- **Placeholder scan:** The plan contains no unfinished implementation markers
  or generic testing instructions; each task specifies the intended test and
  command.
