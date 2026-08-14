# Grammarly-Inspired Learning Layout Design

## Goal

Improve the detailed feedback report and focused-teaching page by adopting the useful interaction model of a document editor with a suggestion rail, while preserving the IELTS learning flow and the product's own visual identity.

## Product principles

- Borrow interaction structure, not Grammarly branding, copy, colours, or proprietary assets.
- Keep the learner's essay as the primary object. Feedback must visibly point to exact submitted text.
- Use progressive disclosure: show the issue and proposed change first; reveal explanation, knowledge and transfer rules in the active card.
- Preserve all detailed feedback. Layout changes must not reduce paragraph analysis, four-criterion estimates, small-error coverage, or the next teaching step.
- Never show model routing, prompt, schema, rubric-version, job, confidence or provider fields in learner-facing content.
- Desktop may use sticky two-column workspaces only from 1280px; narrower widths become a natural single-column reading flow so the existing app sidebar never squeezes the content.

## Detailed-feedback workbench

### Desktop structure

The page header remains above a two-column workbench.

- Left, approximately 60%: original task and immutable essay in a document surface.
- Right, approximately 40%: report overview and suggestion feed.
- The document surface remains sticky while the learner scrolls suggestion cards.
- Paragraph-level review is folded into the document pane, while small recurring errors live in the suggestion pane; the focused-teaching call to action and locked-model explanation remain in normal page flow after the workbench.

### Evidence synchronisation

Each issue carries exact zero-based UTF-16 `startOffset` and `endOffset` values. The document renderer accepts only a span whose excerpt exactly equals that immutable essay slice. A unique exact-text fallback may support historical records without exposed offsets; ambiguous or missing matches remain unhighlighted rather than guessing.

- Selecting a suggestion scrolls its essay highlight into view and marks both as active.
- Selecting an essay highlight scrolls the corresponding suggestion card into view.
- Both controls are native buttons with visible keyboard focus and meaningful accessible names.
- Non-overlapping evidence spans are rendered once; invalid or overlapping spans are safely omitted from annotation.

### Suggestion feed

The feed begins with a compact overview: estimate boundary, overall diagnosis, retained strength and four IELTS criterion summaries. It then shows all priority issues as cards grouped through simple learner language:

- 需要改正 / Must fix
- 更自然 / More natural
- 表达提升 / Writing development

Only the active card expands to show original wording, revised wording, why it changes, the knowledge point and a transfer rule. No “accept” action changes the immutable submitted essay.

## Focused-teaching reader

### Desktop structure

Use a two-column reading layout:

- Left rail: target, current pattern, decision rule and a six-step section outline.
- Right content: knowledge cards, reusable expression or thinking tools, worked example, two quick checks and readiness checklist.
- The left rail is sticky and section links use normal anchors.
- Teaching remains untimed; the 60-minute timer starts only after entering the paper.

### Responsive structure

Below 1280px, both pages become one column. At phone widths, feedback uses an accessible “修改建议 / 原文” switcher and defaults to suggestions so a long essay does not bury the corrections; “在原文中查看” switches to and locates the exact source. The teaching outline becomes a horizontally scrollable section navigator before the content. No fixed-height panel or nested scroll trap is used on mobile.

## Accessibility

- Use one `h1`, ordered headings and landmark labels for the document, suggestions and teaching outline.
- Active synchronised controls expose `aria-pressed` or `aria-expanded` state.
- Do not move keyboard focus automatically when the user activates a card; scroll the counterpart without stealing focus.
- Respect reduced-motion preferences when scrolling.
- Maintain visible focus, 44px practical targets on mobile and existing Chinese/English locale behaviour.

## Acceptance criteria

- Desktop feedback visibly renders document and suggestions side by side.
- Every valid issue maps to one exact source highlight; activating either side synchronises the other.
- Keyboard activation works without focus loss.
- The feedback page retains all detailed report content and contains no backend jargon.
- Focused teaching has a persistent learning outline and readable main content on desktop.
- Both layouts become one column on mobile with no horizontal page overflow.
- Opening focused teaching does not display or start `60:00`.
- Chromium, Firefox, WebKit and mobile Playwright paths pass alongside typecheck, lint and production build.
