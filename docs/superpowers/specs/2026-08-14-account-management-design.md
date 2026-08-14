# Account management design

**Date:** 2026-08-14  
**Status:** Approved direction — awaiting written-spec review  
**Scope:** A lightweight account area for the self-hosted app, inspired by the clarity of Railway’s account controls without copying Railway branding or interface assets.

## Goal

Give a signed-in learner an obvious, trustworthy way to see which account is active, open account security controls, change their password, and sign out. The controls must work from both the desktop sidebar and the mobile navigation.

This is an account-and-security feature, not a data-management feature. It must not introduce export, deletion, or other learning-record management controls.

## User experience

### Account menu

The profile area at the bottom of the desktop sidebar becomes a button. It shows the active user’s initial, email address, and a friendly role label (Owner, Administrator, or Learner). Activating it opens a compact menu with:

1. **Account and security** — opens `/account`.
2. **Sign out** — ends the current session and returns to `/signin`.

The mobile navigation contains the same two actions. A signed-out or unavailable session never shows a fabricated identity; it shows a sign-in action instead.

The menu is fully keyboard accessible: it can be opened with Enter or Space, closes with Escape or outside activation, and restores focus to its trigger when it closes.

### Account and security page

`/account` is a focused account page, visually consistent with the existing app rather than a generic settings dashboard. It has two small sections:

- **Signed-in account** — email and role in plain learner-facing language.
- **Password** — current password, new password, confirmation, inline validation, and a single “Update password” action.

The page does not display account IDs, sessions, API routes, provider settings, or infrastructure information. It does not offer learning-data export or deletion.

On success, the page confirms that the password was updated. On an expected authentication failure, it explains the problem without revealing sensitive details. If the session is absent, the page redirects to sign-in.

## Architecture and data flow

1. A small client-side account-session adapter reads the existing Better Auth session endpoint (`/api/v1/auth/get-session`) with credentials included.
2. It maps only safe fields into an `AccountIdentity` view model: display email, initial, and localized role label. Session tokens, raw user IDs, and internal fields never reach the UI contract.
3. `AccountMenu` consumes that view model in the desktop sidebar and mobile navigation. It owns only popover focus/open state; it does not own authentication state.
4. The account page uses the same adapter. Its password form submits to the existing Better Auth password-change endpoint through the project’s bounded, CSRF-protected mutation path.
5. Sign out uses Better Auth’s existing sign-out endpoint. Once it succeeds, the app clears only navigation/presentation state stored for the browser session, then navigates to `/signin`. It does not delete any learning data.

## Security and reliability rules

- All authentication requests use `credentials: "include"` and existing origin/CSRF protections.
- Password values remain form-local, are never stored in browser storage, and are cleared after a successful change or unmount.
- Password validation mirrors the existing server bounds (12–128 characters) and requires confirmation before sending. The server remains authoritative.
- Session loads have explicit loading, unavailable, and signed-out states. A failed session lookup cannot make a stale identity appear signed in.
- Sign-out failure keeps the person on the current page and provides a concise retryable message; it never pretends they were signed out.
- Account text is no-store and contains no infrastructure, provider, job, or implementation terminology.

## Accessibility and responsive behavior

- Menus use semantic buttons, menu items/links, Escape handling, visible focus, and focus restoration.
- The profile trigger’s accessible name includes the signed-in email without exposing it unnecessarily in decorative content.
- The account page has a single page heading, correctly associated form labels, alert/live feedback, and no layout-only controls.
- On narrow screens, account actions live inside the existing navigation panel; no horizontal overflow or hidden hover-only interaction is introduced.

## Out of scope

- Learning-data export.
- Learning-data deletion.
- Account deletion.
- Email-address changes or verification flows.
- Global session/device management.
- Billing, teams, organization switching, or copying Railway visual assets/branding.

## Verification

The implementation must include focused tests for:

1. Safe session mapping, including unknown or signed-out responses.
2. Desktop and mobile account-menu open/close/focus behavior.
3. Redirect to sign-in when `/account` has no authenticated session.
4. Password confirmation and length validation, success, and expected failure states.
5. Sign out calling the real auth endpoint, clearing session-only navigation state, and navigating to sign-in only after success.
6. Regression checks that the account surface contains neither learning-data export nor deletion controls.

Browser coverage will exercise keyboard interaction on desktop and mobile layout, plus an accessibility smoke check for the account page and menu.
