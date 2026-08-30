import { db } from "@/db";
import { clash1v1Challenges, clash1v1Entries, matches, players, telegramSentNotifications, tournaments, transactions, wallets } from "@/db/schema";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { ensureWalletMoneySchema, updateWalletBalanceSafely } from "@/lib/wallet-balance-service";
import { createAffiliateCommissionForMatch } from "@/lib/affiliate-service";
import {
  CLASH_1V1_CONFIG,
  isClash1v1TournamentLike,
} from "@/lib/clash-1v1-config";

export {
  CLASH_1V1_CONFIG,
  isClash1v1QueueTournament,
  isClash1v1TournamentLike,
  normalizeClash1v1QueueSettings,
} from "@/lib/clash-1v1-config";

let clash1v1SchemaReady: Promise<void> | null = null;

async function createClash1v1Schema(client: any) {
  await ensureWalletMoneySchema(client);
  await client.execute(sql.raw(`DO $$ BEGIN
    CREATE TYPE clash_1v1_entry_status AS ENUM ('waiting_qr', 'queued', 'matched', 'completed', 'cancelled');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`));

  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS clash_1v1_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id uuid NOT NULL REFERENCES tournaments(id),
    user_id uuid NOT NULL REFERENCES users(id),
    player_id uuid NOT NULL REFERENCES players(id),
    telegram_id varchar(32) NOT NULL,
    status clash_1v1_entry_status NOT NULL DEFAULT 'waiting_qr',
    entry_fee_rial numeric(20,0) NOT NULL DEFAULT 500000,
    prize_rial numeric(20,0) NOT NULL DEFAULT 800000,
    invite_link text,
    qr_file_id varchar(255),
    submitted_at timestamp,
    matched_match_id uuid REFERENCES matches(id),
    matched_at timestamp,
    ready_at timestamp,
    completed_at timestamp,
    cancelled_at timestamp,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    metadata jsonb
  );`));

  await client.execute(sql.raw(`ALTER TABLE clash_1v1_entries ADD COLUMN IF NOT EXISTS ready_at timestamp;`));
  await client.execute(sql.raw(`ALTER TABLE clash_1v1_entries ADD COLUMN IF NOT EXISTS qr_file_id varchar(255);`));
  await client.execute(sql.raw(`ALTER TABLE clash_1v1_entries ADD COLUMN IF NOT EXISTS opponent_type varchar(16) NOT NULL DEFAULT 'random';`));
  await client.execute(sql.raw(`ALTER TABLE clash_1v1_entries ADD COLUMN IF NOT EXISTS stake_mode varchar(16) NOT NULL DEFAULT 'paid';`));
  await client.execute(sql.raw(`ALTER TABLE clash_1v1_entries ADD COLUMN IF NOT EXISTS game_mode varchar(32) NOT NULL DEFAULT 'normal';`));
  await client.execute(sql.raw(`ALTER TABLE clash_1v1_entries ADD COLUMN IF NOT EXISTS challenge_id uuid;`));
  // Older Neon databases may have been created from an early baseline where
  // users.cr_status was missing.  The Telegram 1V1 path reads this field to
  // ensure a submitted Player Tag has been verified, so repair it before any
  // queue action rather than failing after the player presses the button.
  await client.execute(sql.raw(`ALTER TABLE users ADD COLUMN IF NOT EXISTS cr_status verification_status DEFAULT 'unlinked';`));
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS clash_1v1_challenges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash varchar(64) NOT NULL UNIQUE,
    tournament_id uuid NOT NULL REFERENCES tournaments(id),
    challenger_user_id uuid NOT NULL REFERENCES users(id),
    challenger_telegram_id varchar(32) NOT NULL,
    opponent_user_id uuid REFERENCES users(id),
    opponent_telegram_id varchar(32),
    proposed_by_user_id uuid NOT NULL REFERENCES users(id),
    stake_mode varchar(16) NOT NULL,
    game_mode varchar(32) NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'pending',
    proposal_version integer NOT NULL DEFAULT 1,
    match_id uuid REFERENCES matches(id),
    expires_at timestamp NOT NULL,
    accepted_at timestamp,
    cancelled_at timestamp,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    metadata jsonb
  );`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS clash_1v1_entries_user_status_idx ON clash_1v1_entries(user_id, status);`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS clash_1v1_entries_status_submitted_idx ON clash_1v1_entries(status, submitted_at);`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS clash_1v1_entries_queue_mode_idx ON clash_1v1_entries(status, opponent_type, stake_mode, game_mode, submitted_at);`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS clash_1v1_entries_challenge_idx ON clash_1v1_entries(challenge_id);`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS clash_1v1_entries_match_idx ON clash_1v1_entries(matched_match_id);`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS clash_1v1_entries_telegram_idx ON clash_1v1_entries(telegram_id);`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS clash_1v1_challenges_challenger_status_idx ON clash_1v1_challenges(challenger_user_id, status);`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS clash_1v1_challenges_opponent_status_idx ON clash_1v1_challenges(opponent_user_id, status);`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS clash_1v1_challenges_expires_idx ON clash_1v1_challenges(status, expires_at);`));

  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS match_result_claims (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id uuid NOT NULL REFERENCES matches(id),
    player_id uuid NOT NULL REFERENCES players(id),
    user_id uuid NOT NULL REFERENCES users(id),
    telegram_id varchar(32),
    claim varchar(10) NOT NULL CHECK (claim IN ('win', 'lose')),
    submitted_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    CONSTRAINT match_result_claims_match_player_unique UNIQUE (match_id, player_id)
  );`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS match_result_claims_match_idx ON match_result_claims(match_id);`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS match_result_claims_user_idx ON match_result_claims(user_id);`));
}

/**
 * Production safety net: Render/Neon deployments may miss manual migrations.
 * The 1V1 bot calls this before touching the queue table, so a missing
 * `clash_1v1_entries` table does not break Telegram callbacks.
 */
export async function ensureClash1v1Schema(client: any = db) {
  if (client === db) {
    if (!clash1v1SchemaReady) {
      clash1v1SchemaReady = createClash1v1Schema(client).catch((err) => {
        clash1v1SchemaReady = null;
        throw err;
      });
    }
    return clash1v1SchemaReady;
  }
  return createClash1v1Schema(client);
}

/**
 * How long a player may sit in the matchmaking queue before we give up.
 *
 * Production had two entries queued since 21 July -- a month -- because
 * expireClash1v1Challenges only expires *challenges*, never queue *entries*.
 * Those two happened to be free, so no money was trapped, but a paid entry in
 * the same state would have held the player's 50,000 USDT indefinitely.
 */
const QUEUE_TIMEOUT_MS = 6 * 60 * 60 * 1000;

/**
 * Cancel queue entries nobody was ever matched with, refunding paid ones.
 *
 * The refund reuses the referenceId-keyed insert used by the admin refund path,
 * so a retry of this sweep cannot pay a player twice.
 */
export async function expireStaleClash1v1QueueEntries(now = new Date()) {
  await ensureClash1v1Schema();
  const cutoff = new Date(now.getTime() - QUEUE_TIMEOUT_MS);

  const stale = await db
    .select()
    .from(clash1v1Entries)
    .where(and(
      inArray(clash1v1Entries.status, ["waiting_qr", "queued"]),
      lte(clash1v1Entries.createdAt, cutoff),
    ))
    .limit(50);

  let cancelled = 0;
  let refundedPlayers = 0;
  let refundedRial = BigInt(0);

  for (const entry of stale) {
    await db.transaction(async (tx) => {
      // Re-read under the transaction: matchmaking may have paired this entry
      // between our scan and now, and cancelling a matched entry would strand
      // the opponent.
      const [fresh] = await tx.select().from(clash1v1Entries)
        .where(eq(clash1v1Entries.id, entry.id)).limit(1);
      if (!fresh || !["waiting_qr", "queued"].includes(fresh.status)) return;

      const amount = BigInt(fresh.entryFeeRial || "0");
      if (amount > BigInt(0)) {
        const referenceId = `clash1v1-queue-timeout-${fresh.id}`;
        const [existing] = await tx.select({ id: transactions.id }).from(transactions)
          .where(eq(transactions.referenceId, referenceId)).limit(1);
        if (!existing) {
          let [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, fresh.userId)).limit(1);
          if (!wallet) [wallet] = await tx.insert(wallets)
            .values({ userId: fresh.userId, balance: "0", currency: "RIAL" }).returning();
          const [locked] = await tx.select().from(wallets).where(eq(wallets.id, wallet.id)).for("update").limit(1);
          await tx.update(wallets)
            .set({ balance: (BigInt(locked.balance || "0") + amount).toString(), updatedAt: new Date() })
            .where(eq(wallets.id, wallet.id));
          await tx.insert(transactions).values({
            walletId: wallet.id,
            amount: amount.toString(),
            type: "refund",
            status: "completed",
            referenceId,
            metadata: { kind: "clash_1v1_queue_timeout", entryId: fresh.id, userId: fresh.userId },
          });
          refundedPlayers += 1;
          refundedRial += amount;
        }
      }

      await tx.update(clash1v1Entries)
        .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
        .where(and(eq(clash1v1Entries.id, fresh.id), eq(clash1v1Entries.status, fresh.status)));
      cancelled += 1;
    });
  }

  return { cancelled, refundedPlayers, refundedRial: refundedRial.toString() };
}

export async function expireClash1v1Challenges() {
  await ensureClash1v1Schema();
  const expired = await db
    .update(clash1v1Challenges)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(
      inArray(clash1v1Challenges.status, ["pending", "countered"]),
      lte(clash1v1Challenges.expiresAt, new Date()),
    ))
    .returning({ id: clash1v1Challenges.id });
  return { expired: expired.length };
}

export async function activeClash1v1Suspension(telegramId: string, hours = 24) {
  const threshold = new Date(Date.now() - Math.max(1, hours) * 60 * 60 * 1000);
  const [row] = await db.select({ createdAt: telegramSentNotifications.createdAt })
    .from(telegramSentNotifications)
    .where(and(
      eq(telegramSentNotifications.telegramId, telegramId),
      eq(telegramSentNotifications.type, "clash_1v1_suspension"),
      gte(telegramSentNotifications.createdAt, threshold),
    )).orderBy(desc(telegramSentNotifications.createdAt)).limit(1);
  if (!row) return null;
  return new Date(new Date(row.createdAt).getTime() + Math.max(1, hours) * 60 * 60 * 1000);
}

export async function suspendClash1v1Telegram(telegramId: string, matchId: string) {
  await db.insert(telegramSentNotifications).values({
    dedupeKey: `clash1v1:suspension:${matchId}:${telegramId}`,
    telegramId,
    type: "clash_1v1_suspension",
  }).onConflictDoNothing({ target: telegramSentNotifications.dedupeKey });
  return activeClash1v1Suspension(telegramId);
}

export function clash1v1PrizeRial() {
  return BigInt(CLASH_1V1_CONFIG.prizeToman) * BigInt(10);
}

export async function payoutClash1v1Prize(tx: any, matchId: string, winnerPlayerId: string) {
  await ensureClash1v1Schema(tx);
  const [match] = await tx.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match) return { paid: false as const, reason: "match_not_found" };

  const [tournament] = await tx
    .select({ id: tournaments.id, name: tournaments.name, game: tournaments.game, categoryLabel: tournaments.categoryLabel })
    .from(tournaments)
    .where(eq(tournaments.id, match.tournamentId))
    .limit(1);

  if (!isClash1v1TournamentLike(tournament)) {
    return { paid: false as const, reason: "not_clash_1v1" };
  }

  const [winner] = await tx
    .select({ userId: players.visibleUserId, displayName: players.displayName })
    .from(players)
    .where(eq(players.id, winnerPlayerId))
    .limit(1);

  if (!winner?.userId) return { paid: false as const, reason: "winner_user_not_found" };

  const [duelEntry] = await tx
    .select({ prizeRial: clash1v1Entries.prizeRial, stakeMode: clash1v1Entries.stakeMode })
    .from(clash1v1Entries)
    .where(eq(clash1v1Entries.matchedMatchId, matchId))
    .limit(1);
  const configuredPrize = duelEntry ? BigInt(duelEntry.prizeRial || "0") : clash1v1PrizeRial();
  if (duelEntry?.stakeMode === "free" || configuredPrize <= BigInt(0)) {
    return { paid: false as const, reason: "free_match_no_prize" as const };
  }

  const referenceId = `clash-1v1-prize-${matchId}`;
  const [existing] = await tx
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.referenceId, referenceId))
    .limit(1);

  if (existing) return { paid: false as const, reason: "already_paid" };

  let [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, winner.userId)).limit(1);
  if (!wallet) {
    [wallet] = await tx.insert(wallets).values({ userId: winner.userId, balance: "0", currency: "RIAL" }).returning();
  }

  const amountRial = configuredPrize;
  const credited = await updateWalletBalanceSafely(tx, wallet.id, amountRial, "increase");
  if (!credited) throw new Error("CLASH_1V1_PRIZE_WALLET_UPDATE_FAILED");

  const [transaction] = await tx
    .insert(transactions)
    .values({
      walletId: wallet.id,
      amount: amountRial.toString(),
      type: "tournament_win",
      status: "completed",
      referenceId,
      metadata: {
        kind: "clash_1v1_prize",
        matchId,
        tournamentId: match.tournamentId,
        winnerPlayerId,
        winnerUserId: winner.userId,
        prizeToman: CLASH_1V1_CONFIG.prizeToman,
      },
    })
    .returning({ id: transactions.id });

  await tx
    .update(clash1v1Entries)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(clash1v1Entries.matchedMatchId, matchId));

  return {
    paid: true as const,
    transactionId: transaction.id,
    amountRial: amountRial.toString(),
    amountToman: CLASH_1V1_CONFIG.prizeToman,
    winnerUserId: winner.userId,
    winnerName: winner.displayName,
  };
}

export async function refundClash1v1Match(tx: any, matchId: string, reason: string) {
  await ensureClash1v1Schema(tx);
  const [match] = await tx.select({ status: matches.status, evidence: matches.evidence })
    .from(matches).where(eq(matches.id, matchId)).for("update").limit(1);
  if (!match) return { refunded: false as const, reason: "match_not_found" as const };
  if (match.status === "completed") return { refunded: false as const, reason: "already_completed" as const };
  const entries = await tx.select().from(clash1v1Entries).where(eq(clash1v1Entries.matchedMatchId, matchId));
  let refundedPlayers = 0;
  let refundedRial = BigInt(0);
  for (const entry of entries) {
    const amount = BigInt(entry.entryFeeRial || "0");
    if (amount <= BigInt(0)) continue;
    const referenceId = `clash-1v1-admin-refund-${matchId}-${entry.userId}`;
    const [existing] = await tx.select({ id: transactions.id }).from(transactions)
      .where(eq(transactions.referenceId, referenceId)).limit(1);
    if (existing) continue;
    let [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, entry.userId)).limit(1);
    if (!wallet) [wallet] = await tx.insert(wallets).values({ userId: entry.userId, balance: "0", currency: "RIAL" }).returning();
    const [locked] = await tx.select().from(wallets).where(eq(wallets.id, wallet.id)).for("update").limit(1);
    await tx.update(wallets).set({ balance: (BigInt(locked.balance || "0") + amount).toString(), updatedAt: new Date() })
      .where(eq(wallets.id, wallet.id));
    await tx.insert(transactions).values({
      walletId: wallet.id,
      amount: amount.toString(),
      type: "refund",
      status: "completed",
      referenceId,
      metadata: { kind: "clash_1v1_admin_refund", matchId, entryId: entry.id, userId: entry.userId, reason },
    });
    refundedPlayers += 1;
    refundedRial += amount;
  }
  await tx.update(clash1v1Entries).set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
    .where(eq(clash1v1Entries.matchedMatchId, matchId));
  await tx.update(matches).set({
    status: "completed",
    winnerId: null,
    completedAt: new Date(),
    evidence: { ...((match.evidence as Record<string, unknown> | null) || {}), resolution: "admin_refund", refundReason: reason },
  }).where(eq(matches.id, matchId));
  return { refunded: true as const, refundedPlayers, refundedRial: refundedRial.toString() };
}

/** Complete a match exactly once, apply stats, and settle the 1V1 prize. */
export async function finalizeMatchResult(
  tx: any,
  matchId: string,
  winnerId: string,
  options: { affiliateEligible?: boolean } = {},
) {
  await ensureClash1v1Schema(tx);
  const [before] = await tx.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!before) return { completed: false as const, reason: "match_not_found" as const };
  if (!before.player1Id || !before.player2Id) return { completed: false as const, reason: "match_not_ready" as const };
  if (winnerId !== before.player1Id && winnerId !== before.player2Id) {
    return { completed: false as const, reason: "invalid_winner" as const };
  }

  const loserId = winnerId === before.player1Id ? before.player2Id : before.player1Id;
  const [completed] = await tx
    .update(matches)
    .set({ status: "completed", winnerId, completedAt: before.completedAt || new Date() })
    .where(and(eq(matches.id, matchId), sql`${matches.status} <> 'completed'`))
    .returning();

  if (!completed) {
    return {
      completed: true as const,
      transitioned: false as const,
      winnerId: before.winnerId || winnerId,
      loserId,
      tournamentId: before.tournamentId,
      prize: { paid: false as const, reason: "already_completed" as const },
    };
  }

  await tx
    .update(players)
    .set({ wins: sql`${players.wins} + 1`, rating: sql`${players.rating} + 25` })
    .where(eq(players.id, winnerId));
  await tx
    .update(players)
    .set({ losses: sql`${players.losses} + 1`, rating: sql`GREATEST(0, ${players.rating} - 15)` })
    .where(eq(players.id, loserId));

  const prize = await payoutClash1v1Prize(tx, matchId, winnerId);
  const affiliateCommission = options.affiliateEligible
    ? await createAffiliateCommissionForMatch(tx, matchId)
    : { created: false as const, reason: "not_api_verified" as const };
  return {
    completed: true as const,
    transitioned: true as const,
    winnerId,
    loserId,
    tournamentId: before.tournamentId,
    prize,
    affiliateCommission,
  };
}
