# Writing Knowledge Base and Practice UX Design

## Goal

Build a source-backed IELTS Writing Task 2 teaching knowledge base and use it to improve three learner-facing outcomes: diagnostic reports, complete practice papers, and post-submission feedback. At the same time, repair learning navigation and let a learner reopen the source report while completing a paper.

## Product decisions

1. The knowledge base has two layers:
   - human-auditable Markdown with sources, evidence level, examples, and product implications;
   - concise typed runtime guidance selected by AI task, so prompts do not carry the entire library.
2. Official IELTS material defines scoring. Peer-reviewed research informs feedback and practice design. Teacher resources and authored cases supply examples but never override official criteria.
3. Every negative report judgment must quote learner evidence and distinguish grammar, lexical precision, collocation, L1-influenced information structure, logic, cohesion, and optional style.
4. A practice question exposes one complete instruction, not a separate learner-facing rubric. Internal criteria may remain structured for reliable AI marking, but they must mirror rather than extend the instruction.
5. During a paper, the learner can reopen the source report. Draft answers remain locally saved and the server timer continues.
6. Sidebar links use the current cycle's actual resource identities. They do not silently redirect every stage to Today.
7. Missing historical resources produce a calm empty state, never a backend error or internal identifier.

## Knowledge architecture

`docs/knowledge-base/` is the source library. `packages/ai/src/pedagogy-knowledge.ts` is its versioned runtime projection. Each projection states what the model must observe, what output it must produce, and what it must not infer.

The Prompt Registry composes shared safety rules with task-specific knowledge for assessment, issue classification, objective selection, paper generation, paper evaluation, comparison, and transfer. The complete source library is not loaded at runtime.

## Navigation

The Today response exposes the selected cycle's available writing attempt, report, paper, rewrite, comparison, and transfer resource identities. A client navigation snapshot creates exact URLs. The shell refreshes this snapshot and renders a disabled, explained state only when a stage genuinely has no resource yet.

## Practice paper page

Before submission, each question shows only:

- question number and suggested time;
- one explicit Chinese task instruction;
- indispensable English source material or prompt;
- answer control and length guidance.

The instruction includes output form, size, required content, and restrictions. The page does not show “marking criteria”, criterion weights, skill IDs, prompt versions, model data, or job state.

After submission, successful questions remain compact. A missed question shows the learner's evidence, the missing or incorrect element in ordinary language, why it matters, one improved version, and one next action.

## Validation

- Unit tests protect route construction and prompt knowledge selection.
- Worker tests reject questions whose visible instruction omits an internal criterion.
- Browser tests verify navigation, report access, draft preservation, absence of “评分要点”, and post-submission expansion only for missed questions.
- Full typecheck, lint, relevant unit/integration tests, production build, and a real-browser pass are required before completion is claimed.
