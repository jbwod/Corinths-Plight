# Corinth's Plight Guided Enlistment

**Status:** onboarding deployed with migration `0007` on 2026-08-10; migration `0008` invitation-abuse and expiry operations are locally verified, not deployed

## Product outcome

A newly verified commander completes one server-authoritative flow before entering the main command interface:

1. join an open Battalion, accept a targeted invitation, use a private invite code, or charter a Battalion;
2. name and create one starter unit from the deliberately narrow executable starter list;
3. review the Command, Galactic, Battalion, Ship, Forces, Deployment, and Campaign surfaces;
4. explicitly complete onboarding and enter the persistent interface.

After completion, the Battalion Recruitment surface continues to expose pending targeted invitations, the open directory, and private-code joining. A successful assignment changes only the selected operational Battalion; historical memberships remain durable.

Existing accounts without an `onboarding_progress` record are not retroactively trapped. The rollout seed opts verified production accounts into the flow once and excludes `.invalid` fixtures/system identities. Demo authentication bypasses onboarding.

## Authority boundaries

- Session identity is the only User authority. Client-provided User IDs, balances, memberships, permissions, prices, and completion state are ignored.
- Registration fails closed before account creation when the active onboarding economy policy is absent; deployment must seed policy before deploying the registration integration.
- `battalion_memberships` remains the durable many-to-many relationship; `user_active_battalions` is selected context, not permission cache.
- A public Battalion is directory-visible only while active, open, below capacity, and carrying a non-empty engagement summary. Private Battalions require a targeted invitation or hashed invite code.
- Recruitment settings are owned by the Battalion aggregate. Editing them requires active membership plus `BATTALION_EDIT`; invitations require `MEMBER_INVITE`.
- Username/email invitations and a durable delivery job are committed atomically before any Resend call. The `202` response does not wait on the provider: `ExecutionContext.waitUntil` starts a bounded immediate attempt, while the hourly schedule recovers missed or failed attempts. Invitation email and provider identifiers never appear in public Battalion projections.
- Every mutation uses a 16–128 character actor-scoped command ID, canonical request hash, and stored response receipt. Reuse with a changed payload is a conflict.
- Invitation eligibility is deliberately non-enumerating. Unknown usernames, self-invites, active members, and existing pending invitations receive the same generic accepted projection as an eligible target; delivery failures are also kept out of the eligibility response and recorded for operations.

## Economy and rules disposition

The V5 concept of Requisition is canonical, but general unit prices and starting budgets remain blocked by `RC-V5-016`. This slice therefore makes two narrower decisions:

- verified accounts receive one 100 Req **command charter grant**;
- chartering a Battalion consumes exactly 100 Req and one creator may charter only one Battalion;
- the first unit is a one-time onboarding grant, not a purchase. It records requisition value `0` with `BALANCE_REQUIRED`, preserving the fact that the class price is unpublished.

The charter policy is application anti-spam policy, not a canonical V5 unit or equipment price. The starter list is limited to definitions whose current foundation mechanics are executable: Infantry Squad, Light Vehicle, and Main Battle Tank. Catalogue-only, non-executable, and hidden definitions are never offered.

## System Battalions

The production fixture supplies three clearly product-authored NPC recruitment Battalions so a new user is never stranded by an empty public directory. They are not canonical lore and grant no special rule behavior:

- 12th Corinthian Line;
- 8th Expeditionary Support;
- Nightwatch Reconnaissance.

Each has an explicit engagement summary, open recruitment rank, high onboarding capacity, and no player-owned ship or fabricated campaign membership.

## Threat and privacy model

- same-origin enforcement protects all mutations;
- invite and general Battalion codes are stored only as SHA-256 hashes;
- email invite tokens are single-use, expire after seven days, and are valid only for the authenticated account whose normalized email matches the invitation;
- registered-user invite acceptance checks the invited User ID;
- recipient email is private operational data used for delivery/matching only;
- public directory responses contain Battalion identity, engagement, capacity, and member count, never member email/session/auth identity;
- Resend failures leave a durable pending delivery job, return the same non-enumerating accepted projection, and record an internal failed outcome without logging the destination or token. A job is retried at most five times with exponential backoff starting at 15 minutes and capped at 24 hours; it is abandoned no later than invitation expiry, and terminal delivery failure revokes the pending invitation.

### Invitation abuse controls and expiry

Migration `0008_auth_retention_and_invitation_abuse.sql` adds persistent fixed-window buckets for every invitation attempt. The Worker charges actor and source-IP scopes before authority lookup or any unauthorized audit append. Only an authorized `MEMBER_INVITE` actor reaches the Battalion and normalized-recipient scopes, which are charged before target lookup.

| Scope | Cooldown | Maximum attempts per fixed 24-hour window |
|---|---:|---:|
| inviting actor | 30 seconds | 20 |
| Battalion | 5 seconds | 100 |
| normalized recipient | 15 minutes | 5 |
| source IP | 10 seconds | 30 |

Recipient and IP bucket identities are HMAC-pseudonymized with `AUTH_HASH_KEY`; raw recipients and IP addresses are not written to the invitation-security tables or logs. Production and preview require a non-placeholder, printable key of at least 43 characters with at least 12 distinct characters; missing or invalid configuration fails invitation handling with `503 INVITATION_SECURITY_UNAVAILABLE`. Cooldown and quota failures return one generic `429 INVITATION_THROTTLED` response without identifying the blocked scope. Repeated blocked attempts do not append unbounded audit rows: only the first cooldown/quota transition is audited. Unknown usernames, unauthorized actors, and all other eligibility no-ops retain the same accepted receipt. Internal audit rows record accepted, rejected, failed, queued, retry, and delivery outcomes with reason codes, never the raw target. Replayed successful/no-op command receipts bypass a second rate charge.

The hourly scheduled job first claims at most 10 due delivery jobs under five-minute leases, then processes at most 100 cleanup candidates per table. Cleanup marks expired account/email invitations and outbox jobs terminal, releases pending-recipient uniqueness constraints, and is idempotent. Invitation-security rate buckets age out after 48 inactive hours; their pseudonymized audit events age out after 90 days. Terminal account and email invitation rows, including their raw recipient/message fields and linked delivery job, are deleted after 30 days. All due/retention paths use predicate-matched indexes and bounded `ORDER BY … LIMIT` candidates. These defaults remain subject to the broader privacy/legal decision recorded as `DEC-016`.

## Deployment order

1. apply migrations `0007` and `0008` locally; apply `0008` to each remote environment before deploying code that uses its rate/audit tables or hourly schedule;
2. apply `seeds/onboarding-foundation.sql` and verify three public NPC Battalions plus one policy row;
3. deploy Worker/UI code;
4. smoke test a real verified account through public join, starter grant, tour completion, and returning-session bypass;
5. verify private/code, non-enumerating invitation limits, expiry cleanup, and invitation controls through service tests plus an isolated local D1/HTTP replay before enabling general promotion.

## Production verification

Cloudflare Worker version `f34fa674-b242-4bda-9a7d-dd06cddc7363` serves the guided flow at `https://corinthplight.qnetica.com.au`. At that recorded release, production D1 was current through migration `0007` and had three open NPC recruitment Battalions, the exact 100 Req grant / 100 Req cost / one-charter policy, one onboarding/grant row for the one verified human account present at rollout, and zero foreign-key violations. Live smoke checks passed for health, signed-out auth availability, unauthenticated onboarding rejection, cross-origin mutation rejection, and SPA/security-header delivery. No live account or invitation was created for the smoke test.

That production statement describes the migration `0007` release only. Migration `0008`, its cron trigger, and its invitation controls have local evidence but no production deployment evidence yet.

The `0008` local evidence includes an empty eight-migration replay, both idempotent seed passes, clean integrity/foreign-key checks, focused invitation/security/schedule tests, a real scheduled-event cleanup smoke, and the shared 37-file / 256-test gate. No remote database, cron trigger, account, or invitation was mutated while collecting it.
