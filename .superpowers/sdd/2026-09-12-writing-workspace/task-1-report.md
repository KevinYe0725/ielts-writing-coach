# Task 1 report: sidebar-free workspace navigation

Status: implementation complete for scoped navigation work; ready for controller review and Task 2 integration. This is local demo acceptance, not real-account AI or database acceptance. The real app on port 3201 was untouched. No push, merge, or deployment was performed.

## Result

- Removed the permanent sidebar and its preference/toggle implementation. One responsive topbar exposes Brand/Today, an essay switcher, Write/Feedback/Learn, More, locale, notifications, and the existing account actions.
- Added a pure destination projection that retains the current full query and masks cached resources from other cycles, missing resource IDs, mismatched paths, and external/malformed URLs. Global pages can continue one consistent recent essay. Today, Essays, Growth, and Settings remain independent of resource availability.
- Added a cmdk search menu within the existing Radix Dialog. It requests essays only while open, cancels obsolete response updates, supports search/empty/error/retry, follows `nextTask.href`, preserves focus containment/Escape restoration, and exposes All essays/New essay fallbacks. Navigation continues when optional sessionStorage writes fail.
- Kept the actual essay prompt in DOM/search/accessibility while clamping visible menu summaries to three 17px lines. Only the dialog's short opening transition uses Motion, with reduced-motion support; page bodies and forms have no animation keys or remount behavior.
- Account dropdown now opens below its topbar trigger; notification and More popovers close on outside pointer/Escape. Notification positioning is relative to its actual control, with tested mobile bounds.
- Updated the approved paper/background tokens to #ffffff / #f6f8fb; reused all existing font roles and executable spacing/shape/typography token constraints.
- Kept `data-sidebar-state="collapsed"` only as compatibility for existing writing/paper widths and action bars. No sidebar DOM remains. `--workspace-header-height` is 72px desktop and 112px at <=760px.

## Dependencies and API evidence

Pinned `cmdk@1.1.1`, `motion@13.2.0`, and `react-resizable-panels@4.12.4`. Published versions, MIT licenses, React 18/19 peer ranges, and installed types were inspected. Existing Radix and markdown dependencies remain intact. The generated lockfile also normalized pre-existing Vitest optional-peer metadata; no root dependency version was changed.

- [cmdk primary API](https://github.com/dip/cmdk): Command/Input/List/Item with keywords; Radix Dialog supplies focus management.
- [Motion React API](https://motion.dev/docs/react): `motion/react`, `motion.div`, `useReducedMotion`.
- [Resizable panels primary API](https://github.com/bvaughn/react-resizable-panels): version 4 uses `Group`, `Panel`, and `Separator`; Task 2 owns actual panel usage.
- Read the installed Next 16.3 useSearchParams/usePathname/useRouter guides before implementation. The route-aware header is below Suspense; the page body stays outside that boundary.

## TDD evidence

1. Pure navigation RED: 12 failures / 1 pass against an unfiltered cached-destination scaffold. The required counterexample received `/feedback?cycle=A` while expecting `/feedback?cycle=B`; missing globals, full-query preservation, unsafe URLs, missing IDs, and mixed cycles also failed.
2. Pure navigation GREEN: new projection plus existing navigation tests passed 15/15.
3. Browser UI RED: the first new contract expected zero legacy sidebar nodes but found one on the running demo.
4. Focus RED: opening the Radix dialog initially focused its close control rather than the search field. Fixed with the dialog's `onOpenAutoFocus` boundary; input focus, Tab containment, Escape, and trigger restoration pass.
5. Storage RED: with only `iwc:learning-navigation:v1` writes denied, selecting the second essay left the URL at `/today`. Fixed by treating the cache write as optional; the same browser test now reaches `/write?cycle=cycle-demo-second`.
6. Immediate Escape exposed asynchronous details-toggle listener timing. The listener now checks the live details `open` state, and all four geometry/Escape cases pass.
7. Same-route history tests now wait for the page's client-loaded content before changing browser history, so they exercise Next's hydrated navigation integration. No stale-cache navigation expectation remains.

## Verification run

All commands ran in `/Users/kevinye/Documents/IELST Writing /.local-qa/learning-quality`, with Node 24 on PATH. Browser runs used `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3202 NEXT_PUBLIC_DEMO_MODE=true`.

- `pnpm exec vitest run apps/web/src/lib/client/workspace-navigation.test.ts apps/web/src/lib/client/learning-navigation.test.ts apps/web/src/lib/client/style-contract.test.ts apps/web/src/lib/client/account-session.test.ts --maxWorkers=1`: 37 passed across 4 files.
- `pnpm --filter @iwc/web typecheck`: passed.
- ESLint for the changed shell/switcher/account/notification/projection/style-contract TypeScript files: passed with no errors.
- Prettier check for all owned source/test/dependency files and `git diff --check`: passed.
- `pnpm licenses:check`: passed, 494 package records / 14 reviewed SPDX expressions. The controller's preceding font-license packaging commit remains intact.
- `playwright test tests/e2e/app-shell.spec.ts tests/e2e/workspace-navigation.spec.ts --project=chromium --project=mobile --workers=2`: 41 passed, 9 expected skips. Eight skips are the two existing notification HTTP tests plus the two new switcher HTTP tests across two profiles; one is the pre-existing mobile hardware-keyboard skip-link exception.
- Migrated account/lesson/setup/contract/writing navigation subset in Chromium + mobile: 16 passed, 2 existing project-specific skips. This preserves direct paper/report restoration, exact cycle/lesson/task identity, mobile locale, account Escape/logout, and navigation reachability.
- Targeted Chromium accessibility smoke checks for Today, Write, Feedback, Rewrite, and Settings: passed 5/5.

Screenshots captured and visually inspected: `output/playwright/workspace-navigation-{1440,1280,390,375}.png`, `output/playwright/essay-switcher-1280.png`, and `output/playwright/essay-switcher-390.png`. Topbar controls, More/account/notification bounds, menu summaries, and dialog layout remain clear. These artifacts are local ignored QA output.

## Changed files

- `apps/web/src/components/app-shell.tsx`, `app-shell.module.css`
- `apps/web/src/components/essay-switcher.tsx`, `essay-switcher.module.css` (new)
- `apps/web/src/components/account-menu.tsx`, `notification-center.tsx`
- `apps/web/src/lib/client/workspace-navigation.ts`, `workspace-navigation.test.ts` (new)
- `apps/web/src/lib/client/style-contract.test.ts`
- `apps/web/src/styles/tokens.css`
- `apps/web/package.json`, `pnpm-lock.yaml`
- `tests/e2e/app-shell.spec.ts`, `workspace-navigation.spec.ts` (new)
- Navigation-specific assertions/helpers only in `tests/e2e/accessibility.spec.ts`, `account.spec.ts`, `lesson.spec.ts`, `redesign-contracts.spec.ts`, `setup-today.spec.ts`
- This task report.

## Controller handoff and limits

- Build and the isolated HTTP-mode run on 3203 are explicitly owned by the controller. New HTTP switcher tests cover lazy loading, zero essays/global links, failed load with retry, and actual supplied lesson identity. They are authored and type-valid but not executed by this agent because demo 3202 uses the mock client. Existing notification read/mark-read HTTP contracts are retained.
- Task 2 must migrate its sticky teaching/paper offsets to the new header height and remove remaining sidebar-width assumptions. The legacy lesson test named `uses the space recovered when the product sidebar is hidden` is deliberately left to Task 2's page-layout changes. Existing app-shell essay grid/eyebrow tests are still unchanged page assertions and may need the approved Task 2 visual migration.
- No feedback/lesson/Today/essay page body source was changed in Task 1. No full database suite ran, consistent with the brief's missing DB test environment and controller scope.
- Mind MCP tools were absent from the available tool list. Relevant registry memory was checked for prior constraints; durable handoff is recorded here instead of claiming a Mind save.

Frontend-design influenced the restrained topbar, token reuse, three-line essay summaries, and actual-content screenshot critique. TDD and systematic-debugging drove the cycle-isolation, storage-denial, and focus/timing regression checks.
