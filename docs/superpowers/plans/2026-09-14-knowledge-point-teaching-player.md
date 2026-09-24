# Knowledge-Point Teaching Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将专项教学页改造成按知识点逐步阅读、练习和迁移的短步骤播放器。

**Architecture:** 保留现有 `TeachingArticle` 的练习状态管理和后端数据接口，在前端增加一个纯函数适配层，把 sections、Markdown 语义块和练习位置转换成 `TeachingPage[]`。播放器只渲染当前页面，使用 `step` 查询参数恢复位置；目录、首屏主按钮和练习继续链接统一调用步骤导航。

**Tech Stack:** Next.js App Router、React、TypeScript、CSS Modules、Playwright、Vitest。

**Spec:** `docs/superpowers/specs/2026-09-14-knowledge-point-teaching-player-design.md`

## Global Constraints

- 不修改后端接口、数据库和 AI 作答协议。
- 每个步骤只渲染一个知识点或一个完整练习单元。
- 不丢弃任何 practice prompt；解析失败不得阻塞步骤导航。
- 保持 draft、submitted answer、analysis retry 的 prompt-id 状态。
- 使用项目现有字体与 token，不引入新的字体下载依赖。
- 步骤切换必须支持桌面、移动端、键盘和非法 URL 回退。

### Task 1: Define and test the page adapter

**Files:**

- Create: `apps/web/src/app/lesson/teaching-pages.ts`
- Test: `apps/web/src/app/lesson/teaching-pages.test.ts`

**Interfaces:**

- `buildTeachingPages(sections, placement): TeachingPage[]`
- `splitTeachingMarkdown(markdown, maxCharacters?): string[]`

- [x] Write failing tests for one page per semantic chunk, practice placement, trailing practices, and final finish page.
- [x] Run the focused Vitest file and confirm the new assertions fail.
- [x] Implement the pure adapter with a 440-character soft limit, heading-aware grouping, and no empty pages.
- [x] Re-run the focused Vitest file and confirm it passes.
- [ ] Commit the adapter separately (kept with the complete player for one reviewable change).

### Task 2: Render one knowledge-point page at a time

**Files:**

- Modify: `apps/web/src/app/lesson/teaching-article.tsx`
- Modify: `apps/web/src/app/lesson/page.tsx`
- Test: `tests/e2e/lesson-focus-v2.spec.ts`

**Interfaces:**

- `TeachingArticleProps.initialStep?: number | undefined`
- `TeachingPage` from `teaching-pages.ts`

- [x] Add failing browser assertions for `data-teaching-player`, one visible `data-teaching-step`, hidden non-current steps, and `step` URL restoration.
- [x] Add `step` parsing in the route page with first/last-step clamping.
- [x] Replace the all-sections render with the current `TeachingPage` render while preserving existing practice callbacks and prompt state.
- [x] Make the first CTA navigate to the first dedicated practice page.
- [x] Route practice continuation and contents links through the same step navigator.
- [x] Re-run focused browser tests on Chromium and mobile.

### Task 3: Apply fixed player layout and progress navigation

**Files:**

- Modify: `apps/web/src/app/lesson/page.module.css`
- Test: `tests/e2e/lesson-focus-v2.spec.ts`

- [x] Add failing CSS/geometry assertions for fixed player height, visible pager, no horizontal overflow, and internal content overflow only.
- [x] Implement `.teachingPlayer`, `.playerViewport`, `.playerNav`, and responsive mobile rules using existing desk tokens.
- [x] Keep the compact contents rail but move it below the player on narrow screens.
- [x] Add reduced-motion handling for progress and step transitions.
- [x] Re-run focused browser tests and capture desktop/mobile screenshots.

### Task 4: Full verification and integration handoff

**Files:**

- Modify: `apps/web/src/app/lesson/teaching-article.test.tsx`
- Modify: `tests/e2e/lesson.spec.ts` only where assertions describe the replaced single-document flow.

- [x] Run `pnpm exec vitest run --maxWorkers=4`.
- [x] Run `pnpm --filter @iwc/web typecheck` and `pnpm --filter @iwc/web lint`.
- [x] Run focused lesson browser tests on Chromium and mobile.
- [x] Run `NEXT_PUBLIC_DEMO_MODE=true pnpm --filter @iwc/web build`.
- [x] Use Playwright CLI to inspect first, middle, final, mobile, keyboard, refresh, and unavailable-analysis states; fix visual and interaction regressions before committing.
- [ ] Commit the completed player with a user-facing summary; do not merge, push, or deploy without authorization.
