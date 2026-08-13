# IELTS Writing Coach knowledge base

This library turns reliable IELTS Writing Task 2 evidence into product rules. It is not a collection of copied model essays and it is not a substitute for official examiner training.

## Authority order

1. **Official assessment source:** IELTS, British Council, IDP, or Cambridge English material that defines the test and descriptors.
2. **Research synthesis:** peer-reviewed meta-analysis, systematic review, or established formative-assessment research.
3. **Applied teaching source:** official lesson plans and examiner-commented samples.
4. **Authored case:** an original example used to make a rule concrete. A case illustrates; it does not establish an IELTS rule.

When sources disagree, the product follows the higher-authority source and records uncertainty. Community posts, commercial score calculators, and unattributed “Band 9 templates” are excluded from scoring rules.

## Runtime use

The complete library stays here for humans to audit. `packages/ai/src/pedagogy-knowledge.ts` contains a short, versioned projection for each AI task. A task receives only relevant rules:

- assessment: official criteria, evidence, confidence, error classification;
- report: priority, explanation, actionability, and learner uptake;
- focused teaching: one decision rule, worked examples, reusable language or thinking tools, and quick checks tied to the diagnosed weakness;
- paper generation: explicit instructions, graduated output, varied contexts, no answer leakage;
- evaluation: immutable answer, no hidden requirement, exact evidence, useful next action;
- comparison and transfer: delayed independent performance rather than same-text correction.

## Required output quality

Every report claim answers four questions:

1. What exact words in the learner's essay are the evidence?
2. What type of problem is this?
3. Why does it affect meaning, naturalness, organisation, or an IELTS criterion?
4. What observable action should the learner perform next?

Every practice question tells the learner, in one place, what to produce, how much, which ideas must appear, and what restrictions apply. Internal marking data may restate these requirements, but may never add another one.

Every learning package follows one target through three distinct stages: the report corrects and explains the learner's original text, focused teaching builds the missing ability, and the timed paper tests independent use. None of the three may substitute for another.

## Maintenance

- Record retrieval date and stable URL in `source-register.md`.
- Prefer a current official descriptor over an old blog summary.
- Do not copy full copyrighted samples. Store short compliant excerpts only when essential; otherwise paraphrase.
- Version runtime guidance when a rule changes learner-visible or evaluation behavior.
- Validate new rules against original cases and at least one official examiner-commented sample.
