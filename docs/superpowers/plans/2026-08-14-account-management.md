# Account Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give signed-in learners a reliable account menu, an account-and-security page, password updates, and sign out without adding learning-data export or deletion.

**Architecture:** A small client authentication adapter maps Better Auth’s session response to a safe `AccountIdentity` view model. Reusable account controls consume that adapter in the desktop sidebar, mobile navigation, and `/account`; existing Better Auth endpoints remain the only authority for changing a password or ending a session.

**Tech Stack:** Next.js App Router, React, TypeScript, Better Auth 1.6.27, existing CSS tokens/components, Vitest, Playwright.

## Global Constraints

- Use the existing Better Auth endpoints at `/api/v1/auth/get-session`, `/api/v1/auth/change-password`, and `/api/v1/auth/sign-out` with `credentials: "include"`.
- Never render raw session tokens, user IDs, API paths, provider information, jobs, or infrastructure information to the learner.
- Passwords stay in React state only; no browser storage and no logging.
- The client checks only blank confirmation and the existing 12–128 character range; Better Auth remains authoritative for all credential decisions.
- Logout clears only `iwc:learning-navigation:v1` session presentation state after a successful server sign-out; it does not delete learning data.
- Do not add export, delete-learning-data, account-deletion, email-change, organization, billing, or device-management controls.
- Account menus must support keyboard activation, Escape, outside activation, visible focus, and focus restoration.

---

## File structure

- Create `apps/web/src/lib/client/account-session.ts`: safe session parsing, sign-out, password-update requests, and learning-navigation cleanup.
- Create `apps/web/src/lib/client/account-session.test.ts`: tests for identity projection, unavailable sessions, auth request shapes, and cleanup timing.
- Create `apps/web/src/components/account-menu.tsx`: shared accessible identity trigger/menu for desktop and mobile.
- Create `apps/web/src/components/account-menu.test.tsx`: unit-level interaction and safe fallback coverage.
- Create `apps/web/src/app/account/page.tsx`: authenticated Account and security page with password form.
- Create `apps/web/src/app/account/account.module.css`: focused responsive layout and focus-visible rules.
- Create `apps/web/src/app/account/page.test.tsx`: password validation/submission/session redirect states.
- Modify `apps/web/src/components/app-shell.tsx`: replace static profile row and add mobile account actions.
- Modify `apps/web/src/lib/client/learning-navigation.ts`: export a narrowly scoped `clearLearningDestinations()` helper.
- Modify `tests/e2e/account.spec.ts`: desktop/mobile keyboard, account page, password, sign-out, and prohibited-control browser coverage.
- Modify `playwright.config.ts` only if the existing test server needs the new account fixture route; otherwise keep it unchanged.

## Task 1: Safe account-session boundary

**Files:**

- Create: `apps/web/src/lib/client/account-session.ts`
- Create: `apps/web/src/lib/client/account-session.test.ts`
- Modify: `apps/web/src/lib/client/learning-navigation.ts`
- Modify: `apps/web/src/lib/client/learning-navigation.test.ts`

**Interfaces:**

- Produces `AccountIdentity`, `getAccountIdentity()`, `changeAccountPassword(input)`, `signOutAccount()`, and `clearLearningDestinations()`.
- Consumes Better Auth’s anonymous `GET /api/v1/auth/get-session` and protected POST endpoints.
- Later tasks only receive `AccountIdentity | null`; they never consume raw auth payloads.

- [ ] **Step 1: Write failing boundary tests**

```ts
it("projects only email, initial, and role from a session", async () => {
  mockFetchJson({
    user: { id: "private", email: "learner@example.com", role: "learner" },
  });
  await expect(getAccountIdentity()).resolves.toEqual({
    email: "learner@example.com",
    initial: "L",
    role: "learner",
  });
});

it("returns null for an absent or malformed session", async () => {
  mockFetchStatus(401);
  await expect(getAccountIdentity()).resolves.toBeNull();
});

it("clears navigation only after successful sign out", async () => {
  mockFetchStatus(500);
  await expect(signOutAccount()).rejects.toThrow();
  expect(sessionStorage.getItem("iwc:learning-navigation:v1")).not.toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @iwc/web test -- account-session.test.ts learning-navigation.test.ts`

Expected: FAIL because the account-session module and cleanup helper do not exist.

- [ ] **Step 3: Implement the narrow adapter**

```ts
export type AccountRole = "owner" | "admin" | "learner";
export interface AccountIdentity {
  email: string;
  initial: string;
  role: AccountRole;
}

export async function getAccountIdentity(): Promise<AccountIdentity | null> {
  const response = await fetch("/api/v1/auth/get-session", {
    credentials: "include",
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) return null;
  return projectAccountIdentity(await response.json());
}

export function clearLearningDestinations(): void {
  window.sessionStorage.removeItem("iwc:learning-navigation:v1");
  window.dispatchEvent(new Event("iwc:learning-navigation"));
}
```

`changeAccountPassword()` sends exactly `{ currentPassword, newPassword }` to `/api/v1/auth/change-password`; `signOutAccount()` POSTs `{}` to `/api/v1/auth/sign-out`, checks success, then calls `clearLearningDestinations()`.

- [ ] **Step 4: Run focused tests**

Run: `pnpm --filter @iwc/web test -- account-session.test.ts learning-navigation.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/client/account-session.ts apps/web/src/lib/client/account-session.test.ts apps/web/src/lib/client/learning-navigation.ts apps/web/src/lib/client/learning-navigation.test.ts
git commit -m "feat: add safe account session client"
```

## Task 2: Accessible account menu in both navigation surfaces

**Files:**

- Create: `apps/web/src/components/account-menu.tsx`
- Create: `apps/web/src/components/account-menu.test.tsx`
- Modify: `apps/web/src/components/app-shell.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**

- Consumes `getAccountIdentity()` and `signOutAccount()` from Task 1.
- Produces `<AccountMenu variant="sidebar" | "mobile" />`.
- The menu accepts no raw session data; it loads/refreshes its own safe identity.

- [ ] **Step 1: Write failing component tests**

```tsx
it("opens from the profile trigger and restores trigger focus on Escape", async () => {
  render(<AccountMenu variant="sidebar" />);
  await user.click(
    screen.getByRole("button", { name: /learner@example.com/i }),
  );
  await user.keyboard("{Escape}");
  expect(
    screen.getByRole("button", { name: /learner@example.com/i }),
  ).toHaveFocus();
});

it("shows Account and security and Sign out, but no data-management actions", async () => {
  render(<AccountMenu variant="mobile" />);
  await user.click(screen.getByRole("button", { name: /account/i }));
  expect(screen.queryByText(/export|delete learning/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @iwc/web test -- account-menu.test.tsx`

Expected: FAIL because the menu component is absent.

- [ ] **Step 3: Implement the shared menu and wire AppShell**

```tsx
<button
  aria-expanded={open}
  aria-haspopup="menu"
  onClick={toggle}
  ref={triggerRef}
  type="button"
>
  <span className="avatar" aria-hidden="true">
    {identity.initial}
  </span>
  <span>{identity.email}</span>
</button>;
{
  open ? <div role="menu">...</div> : null;
}
```

Use a document-level pointer/focus boundary only while open. Escape closes the menu and focuses `triggerRef`. The account link uses `/account`. The sign-out action is disabled only while its request is pending and calls `router.replace("/signin")` only after `signOutAccount()` resolves.

Replace the sidebar’s static “当前学习者” row with `<AccountMenu variant="sidebar" />`. Add `<AccountMenu variant="mobile" />` beneath the existing mobile navigation links. Keep the sidebar collapse control unchanged.

- [ ] **Step 4: Add visual/accessibility CSS and run tests**

Run: `pnpm --filter @iwc/web test -- account-menu.test.tsx && pnpm --filter @iwc/web lint`

Expected: PASS with a compact, non-overflowing menu and visible `var(--blue)` focus outline.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/account-menu.tsx apps/web/src/components/account-menu.test.tsx apps/web/src/components/app-shell.tsx apps/web/src/app/globals.css
git commit -m "feat: add account menu and sign out"
```

## Task 3: Account and security page

**Files:**

- Create: `apps/web/src/app/account/page.tsx`
- Create: `apps/web/src/app/account/account.module.css`
- Create: `apps/web/src/app/account/page.test.tsx`

**Interfaces:**

- Consumes `getAccountIdentity()` and `changeAccountPassword()` from Task 1.
- Requires an authenticated `AccountIdentity`; otherwise redirects to `/signin`.
- Does not create or change records outside Better Auth’s password/session records.

- [ ] **Step 1: Write failing page tests**

```tsx
it("redirects to sign in without an account identity", async () => {
  getAccountIdentityMock.mockResolvedValue(null);
  render(<AccountPage />);
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/signin"));
});

it("blocks mismatched or short passwords before submit", async () => {
  render(<AccountPage />);
  await user.type(screen.getByLabelText(/new password/i), "short");
  await user.type(screen.getByLabelText(/confirm/i), "different");
  expect(
    screen.getByRole("button", { name: /update password/i }),
  ).toBeDisabled();
});

it("clears all password fields after a successful update", async () => {
  changeAccountPasswordMock.mockResolvedValue(undefined);
  render(<AccountPage />);
  // fill valid values and submit
  await waitFor(() =>
    expect(screen.getByText(/password updated/i)).toBeVisible(),
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @iwc/web test -- app/account/page.test.tsx`

Expected: FAIL because `/account` does not exist.

- [ ] **Step 3: Implement the page**

```tsx
const valid =
  currentPassword.length > 0 &&
  newPassword.length >= 12 &&
  newPassword.length <= 128 &&
  newPassword === confirmation;

<form onSubmit={submitPassword}>
  <label htmlFor="current-password">Current password</label>
  <input
    autoComplete="current-password"
    id="current-password"
    type="password"
  />
  <label htmlFor="new-password">New password</label>
  <input autoComplete="new-password" id="new-password" type="password" />
  <label htmlFor="confirm-password">Confirm new password</label>
  <input autoComplete="new-password" id="confirm-password" type="password" />
</form>;
```

Render only learner-facing headings and descriptions. Use `role="status"` for success, `role="alert"` for expected failures, and disable submission while invalid or pending. Clear all password state in a `finally` branch only on successful update, and in an unmount cleanup.

- [ ] **Step 4: Run focused tests and static checks**

Run: `pnpm --filter @iwc/web test -- app/account/page.test.tsx && pnpm --filter @iwc/web typecheck && pnpm --filter @iwc/web lint`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/account/page.tsx apps/web/src/app/account/account.module.css apps/web/src/app/account/page.test.tsx
git commit -m "feat: add account security page"
```

## Task 4: Browser acceptance and release verification

**Files:**

- Create: `tests/e2e/account.spec.ts`
- Modify: `apps/web/src/lib/server/api-security-invariants.test.ts` only if an existing auth contract needs a no-store/mutation regression.

**Interfaces:**

- Uses the real rendered `<AccountMenu />` and `/account` page from Tasks 2–3.
- Uses the existing authentication fixture/session setup, never an injected raw token.

- [ ] **Step 1: Write failing browser acceptance tests**

```ts
test("desktop account menu opens by keyboard, reaches security, and signs out", async ({
  page,
}) => {
  await page.goto("/today");
  await page
    .getByRole("button", { name: /learner@example.com/i })
    .press("Enter");
  await page.getByRole("link", { name: /account and security/i }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("button", { name: /sign out/i })).toHaveCount(0);
});

test("mobile account controls remain keyboard reachable and omit data controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/today");
  await expect(page.getByText(/export learning|delete learning/i)).toHaveCount(
    0,
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec playwright test tests/e2e/account.spec.ts --project=chromium --workers=1`

Expected: FAIL until the account menu and page are wired.

- [ ] **Step 3: Complete only test-driven fixes**

Fix selectors, focus behavior, responsive layout, or safe error copy exposed by the failing tests. Do not add new account-management scope.

- [ ] **Step 4: Run final verification**

Run:

```bash
pnpm --filter @iwc/web test
pnpm --filter @iwc/web typecheck
pnpm --filter @iwc/web lint
pnpm exec playwright test tests/e2e/account.spec.ts --project=chromium --workers=1
pnpm exec prettier --check apps/web/src/components/account-menu.tsx apps/web/src/lib/client/account-session.ts apps/web/src/app/account/page.tsx tests/e2e/account.spec.ts
git diff --check
```

Expected: every command exits 0 (aside from any documented pre-existing Fast Refresh warning with no lint errors).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/account.spec.ts apps/web/src/lib/server/api-security-invariants.test.ts
git commit -m "test: cover account management flows"
```

## Plan self-review

### Spec coverage

- Account identity, menu, mobile actions, security page, password change, logout, safe errors, keyboard behavior, and responsive coverage map to Tasks 1–4.
- The explicit prohibition on learning-data export/deletion is included in global constraints and both component/browser tests.
- No unrequested email changes, session/device management, teams, billing, or data management are planned.

### Placeholder scan

The plan contains no unfinished markers, vague validation instructions, or unbounded error-handling work. Each task defines its inputs, outputs, failing test, implementation shape, verification, and commit.

### Type consistency

All UI uses `AccountIdentity` from Task 1. `AccountMenu` calls only Task 1 operations and the account page calls only `changeAccountPassword()`. `clearLearningDestinations()` is the sole browser-storage mutation introduced by this feature.
