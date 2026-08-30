# Clash Royale 1V1 modes and friend duels

## Player flow

Flexa exposes three independent choices before a duel is created:

1. Opponent: `random` or `friend`.
2. Stake: `free` or `paid`.
3. Game mode: `normal`, `draft`, `triple_draft`, or `sudden_death`.

Random matchmaking only pairs entries with the same stake and game mode. Friend
entries never enter the random matcher.

## Private invitation negotiation

The challenger creates a single-use Telegram deep link. The invitation expires
after 15 minutes. The invited player can accept, reject, or counter with a
different game mode. A counter-offer is bound to that Gament user so a third
party cannot take over the invitation.

The current proposer cannot accept their own proposal. Only the other party can
accept it. Wallets are not touched while mode negotiation is pending.

On final acceptance of a paid challenge, both wallets are locked and checked in
the same PostgreSQL transaction. Either both entry fees are debited and the
Match is created, or neither wallet changes. Free challenges skip wallet and
prize transactions.

The challenger is designated as the Friendly Battle host. Both players still
submit official Clash Royale friend links and pass the existing ready gate.

## Result verification

The expected game mode is stored on each 1V1 entry. Settlement checks the
Supercell Battle Log's `gameMode`, `deckSelection`, and battle type:

- correct mode and complementary result claims: settle normally;
- wrong mode in a paid duel: keep funds held and send to human review;
- wrong mode in a free duel: clear claims/readiness and require a replay.

Free matches update competitive stats after a valid result but never create a
wallet prize transaction.

## Rules, mode violations and penalties

Players must accept the versioned 1V1 rules inside Flexa before opening a new
queue or private challenge. The first player in the Match is explicitly named
as host and is responsible for sending the Friendly Battle request with the
agreed mode. A Battle Log mode mismatch is never settled automatically. It is
sent to admins with four explicit actions: host forfeit, replay, refund, or a
24-hour 1V1 suspension. Paid entry funds remain unreleased until an admin acts.

## Telegram channel and groups

`TELEGRAM_REQUIRE_CHANNEL_MEMBERSHIP=true` enforces membership for every
non-admin interaction. Flexa must be an admin of `TELEGRAM_CHANNEL_ID` so
`getChatMember` is reliable. Deep-link payloads are retained while a user joins
the channel and resumed after the membership check.

Flexa supports a privacy-safe group mode. Groups can display rules and public
tournament/private-bot links, but account, wallet, Player Tag, private challenge,
payment, evidence, and result operations are redirected to the user's private
chat with Flexa. BotFather group joining must remain enabled; Telegram privacy
mode may remain enabled because the group integration only needs commands.

## Schema

Migration: `drizzle/manual/0032_add_clash_duel_modes_and_friend_challenges.sql`

The runtime schema repair in `src/lib/clash-1v1.ts` also adds the required
columns/table for Render instances that missed a manual migration.
