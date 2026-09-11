# Writing Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace sidebar-led navigation with a focused essay workspace and deepen report/tutorial readability without changing learning functions.

**Architecture:** Reuse current client services and route identities. Isolate top navigation and essay switcher from page bodies; use existing UI primitives and CSS Modules, plus narrowly scoped OSS components.

**Tech Stack:** Next 16, React 19, CSS Modules, Radix, cmdk, Motion, react-resizable-panels.

**Spec:** docs/superpowers/specs/2026-09-12-writing-workspace-design.md

## Global Constraints

- 不改服务端、AI 提示词、判分、身份权限、数据结构、计时、自动保存和草稿版本。
- 保留所有既有路由、恢复入口和功能。系统错误不能被视觉折叠隐藏。
- 所有当前资源链接保留 cycle / lesson / task 身份。
- 移动端无横向溢出；支持键盘、焦点恢复和 reduced motion。
- 沿用隔离工作区，不合并、不推送、不部署；本地正式版本 3201 不动，预览使用 3202。

### Task 1: Sidebar-free navigation and reusable interaction foundation

**Files:** app-shell.tsx/module.css; new essay-switcher.tsx/module.css; account-menu.tsx; notification-center.tsx only if positioning requires; new client/workspace-navigation.ts/test.ts; tokens.css; apps/web/package.json; pnpm-lock.yaml; tests/e2e/app-shell.spec.ts and relevant navigation contracts.

**Interfaces:** consumes existing LearningDestinations, useLocale, learningClient.getEssayWorkspace(); produces sidebar-free shell, top essay switcher, safe per-route destinations. Existing page components require no API changes.

- [ ] Write failing navigation tests. Required counterexample: current URL `/feedback?cycle=B` plus cached links for A must never expose lesson/rewrite/compare links for A. Current link keeps complete current query. Empty resources still expose Today, Essays, Growth, Settings.

```ts
expect(workspaceDestinations("/feedback?cycle=B", cachedA).feedback).toBe(
  "/feedback?cycle=B",
);
expect(workspaceDestinations("/feedback?cycle=B", cachedA).lesson).toBeNull();
```

- [ ] Run focused Vitest tests and capture RED, implement pure safe projection (do not invent lesson/task IDs), rerun GREEN.
- [ ] Add cmdk, motion, react-resizable-panels with pinned versions after inspecting published APIs; preserve existing Radix and markdown packages. No blanket component CLI install.
- [ ] Implement compact responsive topbar: Brand/Today, searchable essay switcher, writing/feedback/learning links, More disclosure with remaining routes, existing locale/account/notification controls. Load essays on opening switcher, allow retry and all essays fallback; use actual nextTask.href, not synthesized destinations. Standard Radix Dialog provides focus containment and Escape. Ensure account popover opens down, not old sidebar-up positioning.
- [ ] Remove legacy permanent sidebar DOM. Update navigation-specific browser tests to assert same identities and reachable functions via new visible controls; do not skip old behavioral coverage. Add selector search/empty/failure keyboard coverage and no-scroll-overflow checks.
- [ ] Use named palette in spec and existing fonts. Motion only for interactive changes; no page-body entrance animation. Prefer native links for route state, no body-wide animation keys that remount forms.
- [ ] Run related unit/browser tests and web typecheck, inspect desktop/mobile screenshot, commit only task files and report evidence.

### Task 2: Document-first report, tutorial, and essay surfaces

**Files:** app/feedback/page.tsx and feedback.module.css; new resizable-feedback.tsx/module.css if extraction improves clarity; app/lesson/page.tsx, teaching-article.tsx, page.module.css; app/lesson/paper/paper.module.css for header offsets; app/today/page.tsx/today.module.css; components/essay-workspace.tsx/module.css; related e2e tests.

**Interfaces:** consumes Task 1 shell width, installed motion and resizable panels; leaves all existing client loaders, event handlers and data contracts intact.

- [ ] Add a failing desktop browser test proving report columns can be resized while selected issue and source highlight persist. Include mobile single-column behavior without duplicated hidden content.

```ts
const separator = page.getByRole("separator", { name: /调整.*宽度|resize/i });
await separator.focus();
await page.keyboard.press("ArrowLeft");
await expect(page.locator("[data-feedback-summary]")).toBeVisible();
```

- [ ] Capture RED, implement Group/Panel/Separator using current package API, preserve min content sizes and responsive fallback. No persisted panel widths needed this iteration.
- [ ] Simplify report duplicate eyebrows, repeated priority instructions and decorative boxes; keep criteria explanations accessible, original issue filters/anchoring and corrective content intact. Use appropriate details for deeper ancillary content, not errors or task instructions.
- [ ] On a 1440×1000 desktop viewport, show the beginning of the original essay within the first screen (current baseline workbench begins at y=864). Compact the summary and priorities into meaningful lines, not miniature text. Source and suggestion headings need no repeated eyebrow. Keep score and its disclaimer visible; per-criterion explanation and extended overall strengths may use disclosure. Preserve all actual feedback text, even when it moves into a disclosure.
- [ ] Simplify tutorial heading area and article wrappers, improve typography/spacing and example contrast. Keep substantive AI lesson text unchanged, no fixed tutorial skeleton, and retain practice/nav/assessment controls.
- [ ] Align tutorial header with the main article column instead of centering a 760px header over a wider article+TOC grid. Remove duplicate decorative numbering in article section headings; headings 24–28px rather than page-title-size. Teaching readingPage width must no longer subtract legacy sidebar width. Baseline screenshots: output/playwright/v4-before-feedback.png and v4-before-teaching.png.
- [ ] Use Task1 `--workspace-header-height` (72px desktop,112px mobile) for sticky tools and anchor scroll offsets where header overlap could occur, notably tutorial contents and paper question rail. Existing question-anchor tests must pass below actual header bottom. Remove fixed paper-submit sidebar offset or retain safe collapsed compatibility; never cover focused input or submit controls.
- [ ] Simplify Today and essay list duplicate scaffolding; don't remove active limit, deadlines, next action, error/queued status. Existing multi-essay continue URLs stay unchanged.
- [ ] Run full relevant e2e browser files after updating only presentation-dependent locators/wording; execute web typecheck, lint, build and OSS license audit. Screenshot desktop report/tutorial/Today and mobile report/tutorial; review and correct collisions.
- [ ] Commit changes and write docs/quality/writing-workspace-v4-evidence.md with exact passed/skipped checks, preview URLs and residual limitations.

## Review

Each task receives independent spec/quality review; final review covers combined interaction boundaries. Old sidebar-specific tests must be migrated to new interaction equivalents, not silently omitted. Keep package/runtime changes local until user requests delivery.
