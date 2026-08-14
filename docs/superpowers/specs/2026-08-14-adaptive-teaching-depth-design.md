# Adaptive teaching depth — design specification

**Goal:** Turn the focused teaching article into a substantial, personalised IELTS Writing tutorial before the timed practice paper, without exposing implementation language or turning every lesson into a fixed template.

## Learner outcome

Each article teaches one observable micro-skill selected from the learner's diagnosed weakness. It should help a learner make a better writing decision on a new topic before the timed paper asks them to perform it.

## Bounded adaptive structure

The article remains free to use different section names and examples, but it must contain the following learning moves in an order that fits the diagnosed difficulty:

1. Explain the decision the learner needs to make.
2. Contrast a weak and effective version, or make the hidden reasoning visible.
3. Teach a reusable tool, rule, or expression with its usage condition.
4. Surface one or more plausible mistakes and how to avoid them.
5. Require guided active practice followed by a new-topic transfer attempt.
6. End with a compact self-check that the learner can use in the paper.

For argument, development, cohesion, and task-response skills, articles target 25–35 minutes. For grammar and lexical micro-skills, they target 15–25 minutes. Articles require 3–6 sections and 7–12 blocks; the exact mix is selected by the diagnosis rather than a page template.

## Knowledge base

The product owns a small, versioned teaching profile for each skill. Each profile contains a decision lens, common confusion patterns, transferable IELTS topic domains, and article-quality requirements. It is original teaching guidance synthesized from public IELTS assessment criteria and writing-teaching practice; it never copies third-party lesson text.

The first enriched profile is `mechanism_chain`, because it is the active learner target and requires clear causal reasoning. The generation prompt receives the matching profile and uses it only as a planning resource. Learners never see profile IDs, hidden selections, or technical metadata.

## Reliability rules

- The tutorial and paper share one narrow ability, but the tutorial may not reveal paper answers or a complete paper model response.
- A compatible provider generates the article and paper separately. Each result must pass the same full-package validation before it is shown.
- If a provider cannot return a valid mechanism-chain package, the existing validated deterministic package is used as an honest fallback. It never claims to assess language quality.
- A failed generation remains retryable and never locks a learner out of the paper or their account.

## Acceptance checks

- Validators enforce the new article time, section, block, active-practice, and self-check bounds.
- Provider JSON schema matches those bounds.
- The deterministic mechanism-chain package demonstrates all core learning moves and validates.
- Prompt guidance includes the profile and selection rules without exposing them to learners.
- Existing timed-paper answer isolation and learner-facing vocabulary protections remain covered by tests.
