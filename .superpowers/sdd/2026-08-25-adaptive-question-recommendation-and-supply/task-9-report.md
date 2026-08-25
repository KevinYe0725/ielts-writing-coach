# Task 9 report — search-setting fix round 1

## RED evidence

Before changing the response mapper, the focused client suite reported two
failures: a GET/PUT/test response with `encrypted_api_key` or `provider_trace`
was accepted, and a PUT `null` response was projected as `MISSING` rather than
rejected. The command was:

```bash
pnpm exec vitest run apps/web/src/lib/client/http-service.test.ts
```

The new non-demo route-stubbed E2E initially found two real Axe contrast
violations in the mounted Settings UI: the destructive-zone text and red badges
were below the 4.5:1 threshold against the existing error surface.

## GREEN evidence

- `projectSearchConnectionSetting` now requires exactly `kind`, `status`, and
  `tested_at`; only GET may convert `null` to `MISSING`.
- The POST test response now accepts exactly `ok`, `latency_ms`, and
  `safe_message`; unknown provider or secret-shaped fields reject with
  `INVALID_RESPONSE`.
- PUT accepts only an exact `ACTIVE` projection, so the UI cannot show a saved
  state after a malformed 200 response.
- The non-demo HTTP test stubs MISSING, ACTIVE, INVALID, 403, and 503 states;
  asserts test failure/success, two exact PUT bodies with Origin and idempotency
  headers, cancel/accept revoke, key clearing, and no key in browser storage.
- AxeBuilder scans the mounted active desktop and invalid 390px UI. The Settings
  error text and red badge colors were darkened locally to meet the scan.

Fresh focused commands:

```bash
pnpm exec vitest run apps/web/src/lib/client/http-service.test.ts
NEXT_PUBLIC_DEMO_MODE=false PLAYWRIGHT_BASE_URL=http://127.0.0.1:3295 \
  pnpm exec playwright test tests/e2e/account.spec.ts tests/e2e/redesign-contracts.spec.ts \
  --project=chromium --workers=1 --grep='owner-safe HTTP search-connection'
```

Both passed after the green changes.

## Screenshot evidence

The compact sibling and deliberate 390px stack were visually inspected in the
previous Task 9 captures:

- `output/playwright/task9-search-settings/.playwright-cli/page-2026-08-25T05-31-51-475Z.png`
- `output/playwright/task9-search-settings/.playwright-cli/page-2026-08-25T05-32-07-050Z.png`

The current non-demo route-stub test additionally verifies active and invalid
interactive states with AxeBuilder, the 12px text floor, and no horizontal
overflow at 390px.

## Fix Round 2 — complete the non-demo HTTP oracle

### RED / GREEN

The first oracle revision asserted the expected sequence but the route stub
only recorded non-GET mutations. The exact false-mode browser command failed
with the four expected GET requests absent from the transcript. The stub now
records every `/search-connection` request before routing it.

The final oracle asserts the exact ordered dev-mode transcript (including the
strict-mode duplicate GET effects), every GET body/header boundary, both POST
test bodies, both PUT bodies, and the accepted DELETE null body. It requires
Origin on all mutations, JSON content type only on POST/PUT, idempotency on
PUT/DELETE, and no idempotency on GET or temporary POST testing. A GET moved
after the first POST, malformed test body, or DELETE body/content-type change
now fails this browser test.

Fresh command:

```bash
NEXT_PUBLIC_DEMO_MODE=false PLAYWRIGHT_BASE_URL=http://127.0.0.1:3295 \
  pnpm exec playwright test tests/e2e/account.spec.ts tests/e2e/redesign-contracts.spec.ts \
  --project=chromium --workers=1 --grep='search|检索'
```

Result: one non-demo HTTP test passed; the separate demo-only visual test was
intentionally skipped. `git diff --check` also passed.

## Fix Round 3 — phase-normalized GET oracle

### RED / GREEN

The previous assertion encoded an exact development-mode GET count. The new
RED test instead required recorded response phases for MISSING, ACTIVE,
INVALID, 403, and 503; it failed before GET records carried phase information.
The route stub now labels each GET with the response phase at dispatch time and
reloads once while ACTIVE so all five phases are observed.

The oracle intentionally accepts duplicate GETs, which can vary with React
development effects, but requires at least one GET for each phase in the
meaningful MISSING → ACTIVE → INVALID → 403 → 503 order. It additionally
requires the initial MISSING GET before the first POST test. Every GET must
have null body and no Origin, Content-Type, or idempotency key; every PUT must
have JSON Content-Type as well as the existing exact body, Origin, and
idempotency checks. POST and DELETE boundaries remain exact.

Falsification: changing the stub to omit a GET phase, move the initial GET
after POST, attach Origin or a JSON body to GET, or remove the PUT content type
causes the focused E2E to fail. Adding harmless duplicate GETs does not.

Fresh command:

```bash
NEXT_PUBLIC_DEMO_MODE=false PLAYWRIGHT_BASE_URL=http://127.0.0.1:3295 \
  pnpm exec playwright test tests/e2e/account.spec.ts tests/e2e/redesign-contracts.spec.ts \
  --project=chromium --workers=1 --grep='search|检索'
```

Result: the non-demo oracle passed; the demo-only visual test was intentionally
skipped, and `git diff --check` passed.

## Fix Round 4 — exact method/path and collapsed-phase oracle

### RED / GREEN

The route stub now records every `/api/v1/search-connection` route before
dispatch. The oracle permits only `GET`, `PUT`, and `DELETE` on the setting
route and only `POST` on `/test`; the two temporary-key calls also assert an
exact `POST`, `POST` method sequence. Existing exact request boundaries remain:
GET has a null body and no Origin, content type, or idempotency key; POST and
PUT have exact JSON bodies, JSON content type, and Origin; PUT and DELETE have
idempotency keys; POST does not; DELETE has no body or content type.

GET response phases are now normalized by collapsing consecutive duplicates,
then compared exactly with `MISSING → ACTIVE → INVALID → 403 → 503`. This keeps
the oracle insensitive to adjacent development-effect duplicates while
rejecting missing, reordered, or later repeated phases.

Focused falsification evidence:

- Changing the real client `/test` method from POST to PUT failed with two
  unexpected `PUT /api/v1/search-connection/test` transcript entries.
- Injecting an extra `PATCH /api/v1/search-connection` failed the allowed
  method/path assertion.
- Reloading once more in ACTIVE after the 503 phase failed with the collapsed
  stream ending in an extra `ACTIVE`.
- Restoring each mutant returned the focused non-demo E2E to green.

Fresh final command:

```bash
NEXT_PUBLIC_DEMO_MODE=false PLAYWRIGHT_BASE_URL=http://127.0.0.1:3295 \
  pnpm exec playwright test tests/e2e/account.spec.ts tests/e2e/redesign-contracts.spec.ts \
  --project=chromium --workers=1 --grep='search|检索'
```

Result: the owner-safe HTTP contract passed; the separate demo-only visual
test was intentionally skipped. Both `git diff --check` and
`git diff --cached --check` passed.
