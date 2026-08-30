# Gament media affiliate program

## Commercial rules

- One verified paid Match creates one 7,000-Toman commission pool.
- One attributed partner receives 7,000 Toman.
- Two different attributed partners receive 3,500 Toman each.
- Two referred players belonging to the same partner still create only 7,000 Toman total.
- Attribution is first-touch and lasts exactly 30 days. Re-clicking does not extend it.
- Existing players with a paid Match in the previous 30 days are ineligible as new referrals.
- Free, refunded, cancelled, disputed, wrong-mode or non-Battle-Log Match records do not qualify.
- Live commissions remain Pending for 72 hours. Settlement is weekly with a 300,000-Toman minimum.
- Each referred user can generate at most three commission-bearing Matches per rolling 24 hours.

## Safe rollout

`AFFILIATE_PROGRAM_LIVE=false` is the production default. In Shadow Mode,
commission events and shares are calculated but cannot be withdrawn. Real
accrual additionally requires `AFFILIATE_LEGAL_APPROVED=true` and
`AFFILIATE_FINANCE_APPROVED=true`.

The first real-money rollout uses `AFFILIATE_LIVE_ROLLOUT=canary` plus a
comma-separated `AFFILIATE_CANARY_GAMENT_IDS` allowlist. Only Match commissions
whose attributed players are in that allowlist become real Pending events;
all other correctly calculated events remain Shadow. After the paid Match,
Battle Log, 72-hour hold, refund and both payout destinations pass QA, rollout
may be changed to `public`. No Gament ID allowlist is committed to Git.

The current Render blueprint uses `public` only after the owner confirmed legal
and finance approval. Cash payout remains manual: the system atomically reserves
eligible shares, records the verified IBAN snapshot and creates a request; an
admin must review and mark the bank transfer paid. No bank transfer is executed
automatically.

## Contract evidence

The website stores an immutable snapshot of the exact contract, SHA-256 hash,
version, signer name, verified account, OTP consumption time, server time, IP
and User-Agent. A new contract version requires new acceptance. The contract
text is an operational template and must be reviewed by qualified legal counsel
before enabling real payouts.

## Attribution security

Public referral codes are identifiers, never authorization secrets. The server
resolves active partners, applies first-touch locking, and binds a Telegram lead
to the one-to-one Gament account after `/link`. Partner IDs and commission
amounts sent by a browser are never trusted.

Telegram group connection requires the active partner to run
`/connect_media CODE` while they are present in `getChatAdministrators`. Personal,
financial and Match operations remain private-chat only.

## Financial safety

`affiliate_commission_events.match_id` is unique, preventing duplicate payout
from webhook/Cron retries. A Match can create a commission only inside the
verified result-settlement transaction. Share sums never exceed the event pool.
Payout requests atomically reserve available shares, preventing duplicate
withdrawals. Admin actions are audit logged.

## Personal referrers

Ordinary Gament users use the same one-pool financial ledger as media partners.
They accept a shorter OTP contract and receive an opaque `aff_` deep link.
Attribution, self-referral blocking, active-player exclusion, the three-Match
daily cap, 72-hour hold, Battle Log verification and the 7,000-Toman Match cap
are identical. Two different referrers split 3,500/3,500; two players from the
same referrer still create only 7,000 total.

After release, a personal referrer chooses either bank settlement (minimum
200,000 Toman, verified own IBAN) or an irreversible conversion to
non-withdrawable Gament gaming credit. Gaming-credit transactions carry
`withdrawable:false` and cannot be withdrawn as cash.

## Migration and runtime repair

- Base migration: `drizzle/manual/0033_add_media_affiliate_program.sql`
- Personal referrals: `drizzle/manual/0034_add_personal_referral_program.sql`
- Runtime repair: `ensureAffiliateSchema()`
- Health response exposes Shadow/Live state without secrets.
