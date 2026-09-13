# Inline focused teaching implementation plan

> **For agentic workers:** Use test-driven-development for implementation and requesting-code-review for the integrated change. This extends an existing coupled teaching flow; retain the active isolated worktree and execute inline.

**Goal:** Deliver the approved article-with-inline-practice teaching design without introducing learning gates.

**Architecture:** Keep ADAPTIVE_ARTICLE_V1, canonical prompt IDs, saved first responses, and evidence-bound analysis. Add optional one-based `afterSection` placement metadata. Render valid placements after their sections, unplaced prompts at the end; never infer a semantic association for old content. Keep all response state in TeachingArticleContent so placement does not change persistence.

**Tech Stack:** Existing Next/React, CSS Modules/tokens, react-markdown and native details; no new dependency.

**Spec:** User-approved design in the preceding conversation: one personalized micro-skill article, adjacent practice, answer-specific supplementary explanation, optional reference/rewrite, unrestricted paper entry, backward compatibility.

## Global constraints

- Do not quote or locate the original essay in the tutorial.
- Keep dynamically authored sections, not a fixed lesson template.
- No grades/mastery claims in tutorial practice, no answer-gated paper access.
- Preserve submitted answer, retry/poll recovery, accessible focus and locale.
- Read old courses without new required fields or regeneration.
- Reference answers are examples, not exact-match writing keys; demo is not real AI acceptance.
- Use existing fonts, color/spacing/type tokens. No new dependency, server deployment, push or merge.

### Task 1: Placement contract and generation guidance

Files: worker learning.ts/schemas.ts; API adaptive-teaching.ts; client types.ts; AI prompts.ts/pedagogy-knowledge.ts; worker tasks/ai.ts; related unit/route tests.

Interface: `TeachingPracticePrompt.afterSection?: number` (one-based). Out-of-range integers and absent fields are unplaced; malformed optional metadata is discarded by the public projection. No new content-quality rejection gates.

- [x] Add contract/route regression tests preserving placement and reading legacy content.
- [x] Run tests red, add optional metadata and projection, run green.
- [x] Align all live generation instructions: privately assign each prompt to a relevant section; keep separate answer-bearing prompt list; no answers in article; narrow skill and changed-context independent output; no fixed pedagogical sequence. Increment generation prompt version.

### Task 2: Article/practice integration and representative course

Files: app/lesson/teaching-article.tsx, new teaching-practice-placement.ts and tests, page.module.css, client/mock-service.ts.

Interface: `placeTeachingPractices(prompts, sectionCount)` returns `{ bySection, trailing }` with zero-based arrays; valid one-based positions only, input order preserved.

- [x] Write tests: `[afterSection:2, absent, afterSection:1, afterSection:99]` across two sections yields section IDs `[[third],[first]]`, trailing `[second,fourth]`; all legacy prompts remain trailing; input arrays unmutated.
- [x] Run red, implement and run green.
- [x] Render each valid group inside its associated article section, retain legacy trailing block and unique practice anchor. Shared state/submit remains unchanged.
- [x] For inline exercises show learner answer and evidence-based supplement prominently, reference collapsed as “一种写法”; keep the old presentation for legacy trailing exercises. Optional rewrite is not a scored/persisted second submission.
- [x] Provide continuation anchors and paper entry irrespective of submission/analysis state. Use heading focus on mobile and sticky-header offsets.
- [x] Expand the representative causal-reasoning example with concrete explanation, limits and changed-context practice; add explicit placement to demo courses without copying user essays.

### Task 3: Verify and review

- [x] Browser inspect desktop/mobile article, keyboard reference disclosure, submit/restore and available paper entry. Capture screenshots.
- [x] Run existing lesson browser suites, adding focused regressions for inline rendering/reference/continuation where needed, and production HTTP recovery scenarios.
- [x] Run affected unit tests, typecheck, lint, style-contract and build. Record skipped real inference/database verification explicitly.
- [x] Request independent code review while performing local visual acceptance; resolve important findings.
- [x] Save concise evidence document and hand off local preview; no main merge/push/deploy.
