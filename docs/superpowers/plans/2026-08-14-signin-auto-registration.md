# Sign-in Auto-registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send anonymous visitors to sign-in and create an unknown email account from that one form only in a personal deployment.

**Architecture:** A server-owned account-entry service attempts Better Auth sign-in first. Only a typed unknown-account result plus persisted `personal` deployment may lead to Better Auth sign-up. The UI receives safe typed outcomes and accepts only a validated local return path.

**Tech Stack:** Next.js App Router, Better Auth, Drizzle/PostgreSQL, Zod, Vitest, Playwright.

## Global Constraints

- `/` redirects anonymous visitors to `/signin`; an active session goes to `/today`.
- Only `personal` deployments may auto-register. Shared deployments stay invitation-only.
- Wrong credentials, malformed requests, throttling and server errors never cause registration.
- The entry mutation keeps Origin protection, a 4 KiB bounded body, authentication rate limiting and `Cache-Control: no-store`.
- `next` must be a local path with one leading `/`; reject `//`, protocol URLs and malformed input.
- Do not store passwords or tokens in browser storage or emit them in tests.

## Files

- Create `apps/web/src/lib/server/account-entry.ts` and `account-entry.test.ts`: typed policy and safe return parser.
- Create `apps/web/src/app/api/v1/account-entry/route.ts` and `route.test.ts`: bounded public mutation.
- Modify `apps/web/src/app/page.tsx`, `apps/web/src/app/signin/page.tsx`, and only if needed `apps/web/src/lib/server/session.ts`: root and one-form behavior.
- Modify `tests/e2e/account.spec.ts`: browser acceptance evidence.

## Interfaces

```ts
export type AccountEntryResult =
  | { kind: "SIGNED_IN"; redirectTo: string }
  | { kind: "REGISTERED"; redirectTo: string }
  | { kind: "INVITE_REQUIRED" }
  | { kind: "INVALID_CREDENTIALS" };

export function parseAccountReturnPath(value: string | null): string;
export async function enterAccount(
  input: { email: string; password: string; returnPath: string; origin: string },
  dependencies?: AccountEntryDependencies,
): Promise<AccountEntryResult>;
```

### Task 1: Server account-entry policy

**Files:** Create `apps/web/src/lib/server/account-entry.ts`; create `apps/web/src/lib/server/account-entry.test.ts`.

**Consumes:** Better Auth email sign-in/sign-up APIs, `instanceConfiguration.deploymentMode`, user email uniqueness.

**Produces:** `enterAccount` and `parseAccountReturnPath`.

- [ ] **Step 1: Write failing tests.** Assert that a typed unknown email registers in a personal deployment, that a wrong password never calls sign-up, that an unknown shared email returns `INVITE_REQUIRED`, that a duplicate-create race retries sign-in once, and that `//evil.test`, `https://evil.test` and `javascript:alert(1)` all normalize to `/today`.

- [ ] **Step 2: Verify RED.** Run `pnpm --filter @iwc/web test -- account-entry.test.ts --runInBand`. Expected: failure because the module does not exist.

- [ ] **Step 3: Implement minimally.** `parseAccountReturnPath` rejects any value without exactly one leading slash, then parses against `https://local.invalid` and preserves only matching-origin pathname plus search. `enterAccount` tries sign-in; only an adapter-typed unknown-account result reads the persisted deployment mode. It signs up in `personal` only, retries sign-in once if unique-email creation races, and returns `INVALID_CREDENTIALS` for every other auth failure.

- [ ] **Step 4: Verify GREEN.** Run `pnpm --filter @iwc/web test -- account-entry.test.ts --runInBand`. Expected: all policy and return-path cases pass.

- [ ] **Step 5: Commit.** Run `git add apps/web/src/lib/server/account-entry.ts apps/web/src/lib/server/account-entry.test.ts` followed by `git commit -m "feat: add personal account entry policy"`.

### Task 2: Bounded account-entry API

**Files:** Create `apps/web/src/app/api/v1/account-entry/route.ts`; create `apps/web/src/app/api/v1/account-entry/route.test.ts`.

**Consumes:** Task 1, `protectMutation`, `enforceRateLimit`, `parseJsonBody`, and `apiRoute`.

**Produces:** `POST /api/v1/account-entry` with safe typed outcomes.

- [ ] **Step 1: Write failing tests.** Personal unknown credentials return `{outcome:"REGISTERED",redirect_to:"/today"}` with `no-store`; shared unknown returns 403 invite-required; an untrusted Origin returns 403 before policy execution; a body over 4 KiB is rejected.

- [ ] **Step 2: Verify RED.** Run `pnpm --filter @iwc/web test -- account-entry/route.test.ts --runInBand`. Expected: failure because the route does not exist.

- [ ] **Step 3: Implement minimally.** Use strict Zod `{email,password,next?}`, `parseJsonBody` maximum 4096 bytes, `protectMutation`, and the existing authentication rate-limit bucket. Call `enterAccount`; map shared unknown to a plain 403, invalid credentials to generic 401, and successful outcomes to redirect payloads while preserving auth cookies and no-store.

- [ ] **Step 4: Verify GREEN.** Run `pnpm --filter @iwc/web test -- account-entry/route.test.ts --runInBand`. Expected: policy, origin, size and cache tests pass.

- [ ] **Step 5: Commit.** Run `git add apps/web/src/app/api/v1/account-entry/route.ts apps/web/src/app/api/v1/account-entry/route.test.ts` followed by `git commit -m "feat: add safe account entry endpoint"`.

### Task 3: Root and sign-in UI

**Files:** Modify `apps/web/src/app/page.tsx`, `apps/web/src/app/signin/page.tsx`, and `apps/web/src/lib/server/session.ts` only if a shared redirect helper is needed; add adjacent route/component tests.

**Consumes:** Task 2 response and Task 1 safe return behavior.

**Produces:** one “继续 / Continue” form and session-aware root routing.

- [ ] **Step 1: Write failing tests.** A signed-out root redirects to `/signin`; a session root redirects to `/today`; an invite-required form result preserves the submitted email and shows an invitation message; an account-entry response with an external path never redirects the browser externally.

- [ ] **Step 2: Verify RED.** Run `pnpm --filter @iwc/web test -- signin page --runInBand`. Expected: failure because root currently always redirects to Today and sign-in calls Better Auth directly.

- [ ] **Step 3: Implement minimally.** Root checks the server session. The sign-in form sends `{email,password,next}` to account-entry, uses Continue wording, retains email on recoverable outcomes, explains personal creation or shared invitation in learner language, and navigates only to the typed local `redirect_to`.

- [ ] **Step 4: Verify GREEN.** Run `pnpm --filter @iwc/web test -- signin page --runInBand`. Expected: root, safe redirect, email retention and outcome-copy tests pass.

- [ ] **Step 5: Commit.** Run `git add apps/web/src/app/page.tsx apps/web/src/app/signin/page.tsx apps/web/src/lib/server/session.ts` followed by `git commit -m "feat: make sign-in the first account entry page"`.

### Task 4: Browser acceptance

**Files:** Modify `tests/e2e/account.spec.ts`.

**Consumes:** Tasks 1–3.

**Produces:** end-to-end proof that convenience does not weaken shared access control.

- [ ] **Step 1: Write failing Playwright cases.** Anonymous `/` opens `/signin`; a typed personal unknown response lets the visible form continue to `/write?cycle=cycle-demo`; a typed shared unknown response remains on `/signin` and exposes an invitation message; unsafe `next` ends at `/today`.

- [ ] **Step 2: Verify RED.** Run `pnpm exec playwright test tests/e2e/account.spec.ts --project=chromium --workers=1`. Expected: failure because root and form behavior do not yet exist.

- [ ] **Step 3: Add only required route fixtures.** Intercept typed account-entry outcomes. Do not inject a fake user session or bypass the visible form.

- [ ] **Step 4: Verify GREEN and release checks.** Run `pnpm exec playwright test tests/e2e/account.spec.ts --project=chromium --project=firefox --project=webkit --project=mobile --workers=1`, `pnpm --filter @iwc/web test -- account-entry --runInBand`, `pnpm --filter @iwc/web typecheck`, `pnpm lint`, targeted Prettier for touched files, and `git diff --check`. Expected: all commands exit 0; lint may retain only the three existing Fast Refresh warnings.

- [ ] **Step 5: Commit.** Run `git add tests/e2e/account.spec.ts` followed by `git commit -m "test: cover safe automatic account entry"`.

## Plan Self-review

- Tasks 1–2 cover typed personal/shared policy, incorrect-password safety, race recovery, Origin, rate and cache boundaries.
- Task 3 covers sign-in-first entry, clear recovery copy and safe internal return paths.
- Task 4 covers public form behavior across all supported browser projects without fake client sessions.
- All interfaces are defined before consumers and no implementation placeholder remains.
