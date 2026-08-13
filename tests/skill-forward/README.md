# Skill fresh-agent forward tests

These tests exercise `coach-ielts-writing` through independent Codex CLI sessions. They are not substitutes for the deterministic Python golden tests: each scenario copies the Skill into a new temporary workspace, starts `codex exec --ephemeral`, and then checks both the agent trace and durable workspace state.

Run the paid/model-backed suite intentionally:

```bash
pnpm skill:forward
```

Validate the checked-in evidence without calling a model:

```bash
pnpm skill:forward:validate
```

The runner uses synthetic prompts and fixtures only. It never loads a learner essay, provider key, or normal Codex conversation. `--ignore-user-config`, `--ignore-rules`, `--skip-git-repo-check`, and a fresh temporary directory isolate every invocation; Codex authentication is still required. The evidence file records unique ephemeral thread IDs, assertions, command summaries, usage, and the exact Skill tree digest.

Re-run the suite whenever the Skill instructions or scripts change. A stale digest is a release failure.
