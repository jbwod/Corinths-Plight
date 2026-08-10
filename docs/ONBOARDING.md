# Corinth's Plight Guided Enlistment

**Status:** deployed to production with migration `0007` on 2026-08-10

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
- Username/email invitations are persisted before Resend delivery. Invitation email and provider identifiers never appear in public Battalion projections.
- Every mutation uses a 16–128 character actor-scoped command ID, canonical request hash, and stored response receipt. Reuse with a changed payload is a conflict.

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
- Resend failures leave the invitation durable and return a retryable delivery error without logging the destination or token.

## Deployment order

1. apply migration `0007` locally and to production;
2. apply `seeds/onboarding-foundation.sql` and verify three public NPC Battalions plus one policy row;
3. deploy Worker/UI code;
4. smoke test a real verified account through public join, starter grant, tour completion, and returning-session bypass;
5. verify private/code and invitation controls through service tests plus an isolated local D1/HTTP replay before enabling general promotion.

## Production verification

Cloudflare Worker version `f34fa674-b242-4bda-9a7d-dd06cddc7363` serves the guided flow at `https://corinthplight.qnetica.com.au`. Production D1 has no pending migrations, three open NPC recruitment Battalions, the exact 100 Req grant / 100 Req cost / one-charter policy, one onboarding/grant row for the one verified human account present at rollout, and zero foreign-key violations. Live smoke checks passed for health, signed-out auth availability, unauthenticated onboarding rejection, cross-origin mutation rejection, and SPA/security-header delivery. No live account or invitation was created for the smoke test.
