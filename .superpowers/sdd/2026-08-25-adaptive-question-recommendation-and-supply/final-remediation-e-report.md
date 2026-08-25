# Final remediation E — fallback safety and final release evidence

## Finding disposition

Completed. While a recommendation request or PREPARING poll is active, the
learner can start a public bank question or create and immediately start a
private question. Choosing either fallback invalidates the recommendation
operation token, clears pending timers, releases only the recommendation busy
state, and never sends `recommendation_id`. The recommended start and swap
actions retain their synchronous mutation fence.

The visual change stays inside the established Annotation Desk system: the
private action now says `保存并开始写作 / Save and start writing`, matching its
actual behavior without adding a new surface or visual primitive.

## Strict RED → GREEN

- Focused Vitest RED: 3 intended failures. A numeric PENDING ID projected as
  PREPARING, Demo deletion retained recommendation state, and a response-body
  AbortError after Brave response headers became INVALID_RESPONSE.
- Browser RED: the PREPARING manual-bank path created zero cycles, and the
  private path had no create-and-start action.
- GREEN: 3 focused files / 131 tests passed. Direct non-Demo Chromium fallback
  tests passed 2/2, each with exactly one `/training-cycles` POST, no
  `recommendation_id`, and an already-started stale poll released afterward.
- Search Settings retains a successfully tested key only in React component
  state, so Save can follow immediately. Save/replace/revoke clear it; Demo and
  exact non-Demo tests prove it never enters localStorage or sessionStorage.

## Remaining minors

- Fixed the post-header timeout classification. `readBoundedJson` now receives
  the bounded signal and preserves TIMEOUT when body reading aborts, while
  continuing to redact provider text and credentials.
- Shared-mode DELETE is no longer an implicit-only assertion. The real
  PostgreSQL service test proves an Admin revokes the canonical Owner row
  before a newer Admin row, and the route suite now separately proves an Admin
  DELETE crosses the idempotent canonical-revocation boundary.
- Demo learning-data deletion clears every `iwc.demo.*` key whose name denotes
  recommendation, swap, exposure, or cooldown state from both localStorage and
  sessionStorage. Preferences, search connection state, and unrelated
  navigation state remain.

## Fresh final gates

The database run used a newly migrated tmpfs `postgres:17.6-bookworm`
container at `127.0.0.1:55441` with test-only credentials.

```text
PostgreSQL 17.6 migrate: pass
DB-backed pnpm test: 91 files / 850 passed / 0 skipped / 0 failed
format: pass
lint: pass, 0 errors / 4 existing Fast Refresh warnings
typecheck: pass
Web build: pass, 48/48 static pages
Worker build: pass, 2 ESM entries plus source maps
Demo E2E clean rerun: 908 enumerated / 658 passed / 250 intentional skips / 0 failed
Non-Demo exact matrix: 208 enumerated / 135 passed / 73 intentional skips / 0 failed
Focused mobile login falsification after the first Demo run: 3/3 passed
git diff --check: pass
```

The first four-worker Demo run was 657 passed / 250 skipped / 1 failed because
the controller-owned mobile sign-in viewport check observed 24 pixels of
temporary vertical overflow. The unchanged test passed three focused repeats,
and the complete two-worker rerun passed. The first non-Demo E run was 131
passed / 73 skipped / 4 failed because the old four-project oracle expected a
successful temporary key test to clear the input; updating that E assertion to
immediate Save produced the clean exact rerun above.

The repository accessibility-review helper was also attempted. It timed out on
its stale bare `/write` route, which no longer supplies the required cycle
identity. The complete Demo matrix independently passed repository-owned
320px/390px reflow, iPhone 14 WebKit emulation, reduced-motion, and Axe checks.
The helper failure is not presented as a passing gate.

## External boundaries and cleanup

- `EXTERNAL_PENDING`: a user-entered real Brave connection and one
  research-backed refill. No credential was requested, read, stored in a
  fixture, synthesized, logged, or transmitted.
- `EXTERNAL_PENDING`: real-account traversal and actual rendered 200%/400%
  browser zoom. Viewport reflow and emulation are not substitutes.
- The owned tmpfs PostgreSQL container was stopped and auto-removed. No
  unrelated container, volume, or server was changed.
- Mind MCP was not exposed in this task; this report and the SDD ledger are the
  durable handoff.

Commit: the commit containing this report.

## Fix Round 1/5 — independent recommendation and cycle fences

### Root cause and RED

The first remediation used one synchronous ref for both recommendation actions
and cycle creation. A READY card entering SWAP → PENDING held that ref through
its request and poll, so the visually enabled manual and private controls were
silently rejected by their handlers.

Two non-Demo HTTP tests now begin READY, dispatch SWAP, return PENDING, and hold
the recommendation GET in flight. Both the bank start and private create/start
buttons remain enabled and receive two synchronous native click events. Before
the split each test failed with zero `/training-cycles` requests.

### Fix

- `recommendationActionLocked` serializes initial recommendation requests,
  swap, retry, and the associated bounded poll. Duplicate swap events cannot
  enter a second recommendation mutation.
- `cycleOperationLocked` is shared by recommended start, manual start, and
  private create/start. It is acquired synchronously before any await, so each
  double event produces one cycle/custom operation.
- Recommended start additionally rejects while a recommendation action is
  active. Manual/private fallbacks deliberately ignore that mutex, obsolete the
  recommendation operation token, clear/resolve its timers, and proceed.
- The test releases the stale poll while cycle creation is still held. Its
  READY payload never renders or changes navigation, and the eventual cycle
  request contains no `recommendation_id`.

### Fresh focused verification

```text
Initial Chromium RED: 2 failed, each observing 0 cycles instead of 1
Chromium GREEN, old double-event start/swap plus new fallbacks: 4/4 passed
Chromium + WebKit + mobile new fallback matrix: 6/6 passed
Client suites: 2 files / 114 passed
Web typecheck: passed
Web lint: passed, 0 errors / 4 existing Fast Refresh warnings
Web production build: passed, 48/48 static pages
Targeted Prettier and git diff checks: passed
```

The complete E gate totals above remain the release baseline; this fix round
changed only the Today interaction controller and its non-Demo regression
fixture. External boundaries are unchanged.

Fix-round commit: the commit containing this section.

## Fix Round 2/5 — cycle-first exclusion of recommendation actions

### Root cause and RED

Fix Round 1 separated the mutexes but only made cycle actions respect an active
recommendation action. In the inverse same-task ordering, a manual, private, or
recommended start acquired `cycleOperationLocked` before React rendered its
busy state, then a following swap or retry could still acquire
`recommendationActionLocked` and issue recommendation traffic.

- A controlled mutation without the central and swap cycle guards made all
  three start → swap tests fail with `[INITIAL, SWAP]` rather than `[INITIAL]`.
- The direct custom → retry RED observed a sixth recommendation GET after the
  completed five-GET bounded window; the required count was unchanged at five.

### Fix

- The central `requestRecommendation` pre-await guard now rejects when either
  recommendation or cycle/custom work is locked.
- `retryRecommendation` and the direct swap entry apply the same cycle guard
  before acquiring the recommendation-action mutex.
- Initial recommendation loading is unchanged because no cycle operation is
  held on mount.
- The existing `finally` blocks remain the lock-release authority. Dedicated
  HTTP characterizations prove a failed cycle permits a later swap and a
  failed swap permits the next swap.

### Direct browser contract

The non-Demo inverse-order tests dispatch both native click events inside one
browser task, before React can commit `disabled`:

- manual start → swap;
- private create/start → swap;
- recommended start → swap;
- private create/start → retry.

Each observes one cycle, one private creation where applicable, and zero new
recommendation POST/GET after the cycle mutex is acquired. The cycle response
is held so Today remains unchanged until release; manual/private cycles omit
`recommendation_id`, while recommended start retains the original ID.

### Fresh focused verification

```text
Swap-guard mutation RED: 3/3 failed with one unexpected SWAP each
Custom→retry RED: 1 failed with GET count 6 instead of 5
Chromium inverse-order GREEN: 4/4 passed
Chromium + WebKit + mobile forward/inverse matrix: 18/18 passed
Failure-path lock release: Chromium 2/2 passed
Client suites: 2 files / 114 passed
Web typecheck: passed
Web lint: passed, 0 errors / 4 existing Fast Refresh warnings
Web production build: passed, 48/48 static pages
Targeted Prettier and git diff checks: passed
```

External boundaries and the complete E release baseline remain unchanged.

Fix-round commit: the commit containing this section.
