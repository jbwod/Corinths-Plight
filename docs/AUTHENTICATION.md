# Corinth's Plight Production Authentication

**Status:** Passwordless foundation deployed on 2026-08-10; migration `0008` retention and invitation-abuse operations are implemented and locally verified, but not deployed

**Public origin:** `https://corinthplight.qnetica.com.au`

## 1. Delivered vertical slice

The application now has a public home page and passwordless email registration/login boundary. Registration does not create a User until its single-use link is consumed. Login and registration requests return the same generic acceptance language where doing otherwise would reveal whether an email is registered.

| Surface | Behavior |
|---|---|
| `GET /api/auth/session` | Returns the current session projection or a signed-out/auth-availability result |
| `POST /api/auth/register` | Validates email, username, and display name; rate-limits; stores a challenge; asks Resend to deliver the link |
| `POST /api/auth/login` | Validates email; rate-limits; does not disclose unknown addresses; asks Resend to deliver eligible links |
| `GET /api/auth/verify?token=…` | Validates an unexpired link, stages it in a five-minute HttpOnly cookie, and redirects to explicit confirmation without consuming it |
| `POST /api/auth/verify` | Consumes the staged challenge, creates/verifies the account as needed, and issues the opaque session |
| `POST /api/auth/logout` | Revokes the matching D1 session and expires the browser cookie |

The public React gateway presents the home page while signed out and mounts the existing game workspace only after `/api/auth/session` returns a valid identity. The email GET stages its token in a five-minute HttpOnly cookie and presents an explicit browser confirmation; the same-origin confirmation POST performs the account/session mutation. Local development retains the explicit demo path; append `?signedout=1` to exercise the public and passwordless flows without the demo identity.

## 2. Security contract

- Access links use 32 random bytes, are stored only as SHA-256 hashes, expire after 15 minutes by default, and can be consumed once. Issuing a newer link revokes older pending links for the same HMAC-pseudonymized email identity. GET is non-destructive so mail-security prefetch cannot consume the link; confirmation requires the staged HttpOnly cookie and a browser POST.
- Browser sessions use a separate 32-byte opaque token. D1 stores only its SHA-256 hash. The host-only cookie is `HttpOnly`, `SameSite=Lax`, `Secure` outside development, and expires after 30 days by default.
- Registration is committed atomically only when the link is consumed. The User, Profile, identity link, session, onboarding progress, one-time command-charter ledger grant, and consumed challenge transition share one D1 batch.
- Email, IP address, and User-Agent rate/audit keys are HMAC-pseudonymized with `AUTH_HASH_KEY`. Tokens and raw email addresses are never written to application logs.
- Authentication mutations remain protected by the Worker's exact same-origin policy. The only cross-site navigation exception is an exact top-level document `GET /api/auth/verify`, which stages but does not consume the token; confirmation still requires the same-origin POST. Verification responses use `Referrer-Policy: no-referrer` so the query token is not forwarded while redirecting.
- Wrangler sets `assets.run_worker_first` for `/api/*`; otherwise SPA navigation fallback can serve `index.html` before an email verification GET reaches the Worker.
- Five requests per email and per IP are accepted in each 15-minute window; further requests are blocked for the window.
- Production fails email access closed unless the Resend key, HMAC key, HTTPS base URL, and sender are configured. Development without Resend returns the link in the JSON response for local testing only.
- New registration also fails closed when the production onboarding policy is missing, preventing an account from being created without its one-time charter grant.

Passwordless email access is the recovery path for this slice. Password storage, password reset, JWTs, and client-authored authorization roles are intentionally absent.

The authentication boundary is not the complete account lifecycle. Migration `0008` and the corresponding hourly Worker schedule now implement bounded cleanup for expired operational records, but this code has not been deployed and therefore is not active on the public origin. There is still no session/device management UI, MFA, account linking, data export/deletion, or operator recovery workflow. Those remaining gaps are public-release blockers rather than implicit behavior.

### Operational retention defaults

The Worker schedule is configured for `0 * * * *` in development, preview, and production configuration. Each invocation claims at most 10 due Battalion-invitation delivery jobs under five-minute leases and handles at most 100 cleanup candidates per table. It can be safely repeated: it marks expired pending authentication challenges, invitations, and outbox jobs terminal before deleting retained records. Active, unexpired sessions and account records are never cleanup candidates.

| Record | Operational default |
|---|---|
| expired or revoked sessions | retain 30 days after expiry/revocation, then delete |
| consumed, expired, failed, or revoked email challenges | retain 7 days after their terminal time, then delete |
| inactive auth and invitation rate buckets | retain 48 hours, provided no block/cooldown is active |
| authentication security audit | retain 180 days |
| Battalion invitation-security audit | retain 90 days |
| terminal Battalion account/email invitation PII and linked delivery job | retain 30 days after response/terminal time |

These constants are explicit in `SECURITY_MAINTENANCE_POLICY`; they are operational minimization defaults, not a substitute for the pending legal/privacy decision in `DEC-016`. Changing a duration requires a reviewed code change and tests. The scheduled handler logs only aggregate change counts and the cron timestamp, not identities, tokens, addresses, or IPs.

## 3. D1 records

Migration `0006_production_identity.sql` adds email verification and session activity timestamps plus:

- `auth_email_challenges`: one-time REGISTER/LOGIN link lifecycle and Resend delivery identifier;
- `auth_rate_limits`: persistent HMAC-keyed throttling buckets;
- `auth_audit_events`: pseudonymized security outcomes without credentials.

The existing `users`, `profiles`, `auth_identities`, and `user_sessions` tables remain the identity/session authority. `auth_identities.provider` is `resend_magic_link`; it describes the local verified-email identity mechanism, not an OAuth provider.

Migration `0008_auth_retention_and_invitation_abuse.sql` adds indexed retention paths, pseudonymized Battalion invitation rate buckets and audit events, and a leased durable invitation-delivery outbox. It is additive: it does not update or delete any existing User, Profile, identity, Session, membership, or invitation during migration. Deletion occurs only through the later bounded scheduled policy.

After verification, `onboarding_progress` gates the game workspace until the account joins or creates a Battalion, receives its one starter unit, and explicitly completes the interface tour. This state is authorization-adjacent workflow state, not session authority; changing it never creates a new identity or role. See [ONBOARDING.md](./ONBOARDING.md).

## 4. Resend and Cloudflare production setup

1. In Resend, add and verify the sending subdomain `corinth.qnetica.com.au`. Add the exact SPF and DKIM records Resend supplies in Cloudflare DNS; do not invent or copy values from another domain.
2. Keep `AUTH_FROM_EMAIL` in `wrangler.jsonc` on that verified domain, currently `Corinth's Plight <register@corinth.qnetica.com.au>`.
3. Store secrets through Wrangler, never source control:

   ```bash
   npx wrangler secret put RESEND_API_KEY --env production
   npx wrangler secret put AUTH_HASH_KEY --env production
   ```

   `AUTH_HASH_KEY` must be an independently generated printable secret of at least 43 characters with at least 12 distinct characters; placeholder/test/development values are rejected outside the explicit local demo fallback. Missing or invalid configuration maps invitation handling to `503 INVITATION_SECURITY_UNAVAILABLE`. Rotating it invalidates rate/audit pseudonyms but does not invalidate stored session token hashes.
4. Apply migrations before deploying the Worker code that depends on them. Migration `0006` is present in production; migration `0008` must be applied before deploying the scheduled cleanup/invitation-abuse code.
5. Smoke test one new registration, link replay rejection, a returning login, session projection, logout, and the same-origin rejection path. Confirm no token or raw email appears in Worker logs.

Resend API behavior used by the adapter is documented in [Send Email](https://resend.com/docs/api-reference/emails/send-email), [Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys), and [Managing domains](https://resend.com/docs/dashboard/domains/introduction).

## 5. Verification evidence

The local release gate covers runtime validation, Resend request headers/body/idempotency, secure cookie clearing, auth route behavior, all existing tests, typecheck/lint/build, and an isolated D1 migration replay. A real local Worker/D1 flow also exercised registration, link consumption, authenticated session projection, one-time replay rejection, and logout.

Migration `0008` was separately replayed from an empty local D1 through all eight migrations, followed by all seven seed files twice. Integrity and foreign-key checks passed. A real local scheduled-event smoke deleted eligible retained rows while preserving an active session, and direct rate-bucket SQL produced the expected `COOLDOWN` and `QUOTA` decisions. The final shared local gate passed seed validation, typecheck, lint, 37 Vitest files / 256 tests, development build, and production-target build. This is local evidence only; preview and production migration/cron evidence remain pending.

The latest recorded production deployment is version `f34fa674-b242-4bda-9a7d-dd06cddc7363`, migrated through `0007`; it includes the earlier `0006` passwordless boundary, the verified `register@corinth.qnetica.com.au` sender, and both managed Worker secrets. Recorded live checks passed for health, signed-out session availability, desktop/mobile UI rendering, Resend delivery, and email-client top-level `/api/auth/verify` navigation reaching the Worker. The exact verification-navigation exception returned the expected redirect while cross-site access to other safe API routes and foreign-origin confirmation POSTs remained rejected. The initial asset-routing incident left challenges safely `SENT` and created no User or Session; the API-first routing fix and explicit confirmation POST were deployed before any production account was created. These historical smoke checks do not replace preview, retention, browser-matrix, or ongoing operational evidence.
