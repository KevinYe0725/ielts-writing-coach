# Sign-in Auto-registration Design

## Goal

Make sign-in the first page for visitors without a session and let a new
learner create a personal account from that same form, without weakening the
invite-only boundary of a shared instance.

## Scope

- The root route sends an unauthenticated visitor to `/signin` and an active
  session to `/today`.
- Protected learning routes send an unauthenticated visitor to `/signin` with
  a same-origin return path.
- In a personal deployment, the sign-in form automatically creates a learner
  account only when the server has established that the email does not exist.
- In a shared deployment, normal sign-in remains invite-only. The existing
  invitation acceptance path remains the only account-creation path for a
  learner.

## Non-goals

- No public registration page.
- No change to administrator setup, invitation authorization, password-reset
  policy, or provider ownership.
- No client-side inference from error wording and no storage of credentials.

## Design

### Entry routing

The root page performs a server-side session lookup. A valid session redirects
to `/today`; a missing or invalid session redirects to `/signin`.

The authentication boundary for protected pages uses the same session source.
It redirects to `/signin?next=<encoded internal path>` only when the requested
return path is local, starts with `/`, and is not protocol-relative. After a
successful sign-in or permitted auto-registration, the browser returns to that
path; otherwise it goes to `/today`.

### Single sign-in form

The page keeps one email/password form and labels the submit button “Continue”
instead of presenting separate log-in and registration modes.

1. Submit email and password to the normal sign-in endpoint.
2. If it succeeds, navigate to the validated return path.
3. If it fails because the account does not exist, fetch the authoritative
   instance deployment mode.
4. In `personal` mode only, call the normal sign-up endpoint with the supplied
   email, password, and a conservative display name derived from the email
   local part. Then create a session and navigate to the validated return
   path.
5. For every other sign-in failure, including a wrong password, disabled
   registration, malformed input, rate limiting, or server error, stop and
   display a learner-facing message. Do not attempt account creation.

The server owns the “unknown account” classification and the deployment-mode
decision. The client only follows explicit, typed responses; it never matches
English error strings.

### Shared deployment and invitations

Shared deployments return a stable user-facing result for an unknown account:
an invitation is required. The invitation acceptance route continues to create
the invited learner and then sends them to sign-in. It is not affected by the
personal-instance auto-registration path.

### Safety and recovery

- Email uniqueness remains enforced by the auth/database layer.
- If two requests race to create the same personal account, the request that
  loses the uniqueness race retries ordinary sign-in once. It never creates a
  duplicate and never reports a generic internal error for the normal race.
- The submitted email stays in the form after a recoverable failure; password
  input is left to normal browser form semantics and never stored outside the
  request.
- The form disables repeated submission while one request is in flight.
- All authentication responses retain `Cache-Control: no-store`.

## Testing

1. Unit/route tests verify root routing for no session and active session.
2. Client tests verify existing-account login, explicit unknown-account
   auto-registration in personal mode, wrong-password non-registration,
   shared-instance invitation-required behavior, safe `next` validation, and
   create-race fallback to sign-in.
3. Browser tests verify a signed-out root lands on sign-in, a personal new
   account continues to Today, and a shared unknown email does not gain access.
4. Existing invitation acceptance tests remain green.

## Acceptance criteria

- A signed-out visitor never first sees Today.
- A personal-instance learner can use one form to sign in or create their own
  account.
- A shared-instance stranger cannot create an account or access learning data
  without an invitation.
- A wrong password cannot result in an account being created.
- Return paths cannot redirect to an external site.
