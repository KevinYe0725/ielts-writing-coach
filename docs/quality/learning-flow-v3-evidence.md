# Learning flow iteration 3 — 11 September 2026

## Implemented

- Today reads a learner-safe assessment configuration status from its own API,
  using the same personal/shared routing rules as job admission. It no longer
  requests the privileged provider list to guess whether AI is configured.
  Unknown status is not displayed as missing configuration, and learners are
  directed to an administrator rather than a configuration action they cannot use.
- Configuration is not described as a successful network health check.
- Today identifies the essay associated with the primary action. The copy makes
  it clear that another essay can be selected. Each essay card displays its
  existing due/overdue metadata without inventing a deadline.
- Active background jobs are displayed and refreshed without replacing the
  page with a skeleton. Transient refresh failures keep existing content. An
  actionable 4xx error is surfaced; 401/403 hides stale primary content, offers
  sign-in, and stops polling. Saved learning data is not deleted.
- Active requeued jobs take precedence over historical success. Otherwise the
  latest completed attempt prevents an older failure from being shown forever.
- A paper awaiting evaluation retains links to teaching, feedback, and Today,
  preserving the current cycle and lesson identifiers.
- Recommendation selection and refill admission share one captured clock,
  including contention rechecks. The 72-hour recommendation cooldown, six-hour
  refill-failure cooldown, and explicit administrative retry policy are preserved.
- Tutorial analysis receives the canonical skill and its compatible improvement
  codes. Unrelated improvement atoms are omitted without hiding valid evidence
  or creating a learner failure. Existing stored analysis formats remain readable.
- Fresh generation checks reject a choice task that demands an extra written
  answer or a paragraph rewrite with no supplied source. The checks are opt-in
  for fresh generation, so existing courses are not retroactively blocked.
  Ordinary wording about viewing explanations or improving city life is allowed.
- Generation guidance asks for original new-context output rather than only
  filling blanks or copying a supplied subject. Prompt versions are now 5.2.0
  for focused packages and 2.2.0 for tutorial analysis.

## Verification

- Final relevant unit/integration run against isolated PostgreSQL: **875/875
  tests passed across 88 files**, with no failures or skipped tests in that run.
- The two previously failing recommendation cooldown regressions were fixed in
  production logic; their assertions were not weakened. The complete recommendation
  suite passed 47/47 and the jobs suite passed 16/16.
- Real PostgreSQL Today regressions cover current progress, clearing old failure
  messages, and requeueing an older job. They reproduced the old query failures
  before the fix and pass afterward.
- The ordinary learner/provider-permission regression reproduced the false
  missing-AI state before the fix and passes afterward.
- Demo browser suite: 25 passed, 49 intentionally skipped live-only cases, zero
  failures (Chromium and iPhone-sized WebKit).
- Live HTTP-contract browser suite over local HTTPS: 10 passed, two demo-only
  cases intentionally skipped, zero failures (Chromium and iPhone-sized WebKit).
  This includes a transient polling failure, later completion, and session expiry
  with no further polling after the re-login message appears.
- Additional existing Today HTTP-boundary cases: 22/22 passed in Chromium,
  including request recovery, duplicate-event fencing, cross-tab account changes,
  and preserved manual/custom question fallbacks.
- Production Web build generated 48/48 pages. Web and Worker typechecks passed;
  lint had no errors and only the four existing Web Fast Refresh warnings.
- The scoped independent Today review found the session-expiry edge case. The
  browser regression failed against the earlier build; the follow-up reviewer
  confirmed the fix and no remaining issue in that scope.

Production WebKit initially failed when tested over plain HTTP because the
production CSP upgraded asset requests to HTTPS. Tests were rerun through a
loopback HTTPS proxy with a test certificate. Production security headers were
not weakened. This is browser-contract evidence, not public-domain TLS acceptance.

## AI and data boundaries

One live DeepSeek tutorial-generation check used authored material and the fresh
generation checks. It produced five sections and four prompts, including two
original sentence tasks in community-service and family-life contexts. This is
a bounded sample, not an official IELTS scoring calibration or proof of retention.
Canonical-target filtering and impossible-question cases have deterministic
regression coverage; subjective topic novelty does not introduce a new hard gate.

Tests used disposable databases. No real account or saved essay was rewritten,
regraded, migrated, or deleted. This iteration remains in the local preview branch;
it is not a production server deployment.
