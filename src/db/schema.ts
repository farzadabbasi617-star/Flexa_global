import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
  numeric,
} from "drizzle-orm/pg-core";

// --- ENUMS ---
export const userRoleEnum = pgEnum("user_role", [
  "player", "judge", "moderator", "admin", "super_admin"
]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "unlinked", "pending", "verified", "rejected"
]);

export const gameEnum = pgEnum("game_type", [
  "clash_royale", "cod_mobile", "fortnite"
]);

export const tournamentStatusEnum = pgEnum("tournament_status", [
  "registration", "in_progress", "completed", "cancelled"
]);

export const matchStatusEnum = pgEnum("match_status", [
  "pending", "in_progress", "awaiting_judgment", "completed", "disputed"
]);

export const tournamentFormatEnum = pgEnum("tournament_format", [
  "single_elimination", "double_elimination", "round_robin"
]);

export const transactionTypeEnum = pgEnum("transaction_type", [
  "deposit", "withdrawal", "tournament_win", "entry_fee", "refund",
  "store_purchase", "store_payout", "store_escrow_hold", "store_escrow_release", "store_fee"
]);

export const transactionStatusEnum = pgEnum("transaction_status", [
  "pending", "completed", "failed", "cancelled"
]);

export const clash1v1EntryStatusEnum = pgEnum("clash_1v1_entry_status", [
  "waiting_qr", "queued", "matched", "completed", "cancelled"
]);

// --- STORE / MARKETPLACE ENUMS ---
export const kycStatusEnum = pgEnum("kyc_status", [
  "none", "pending", "verified", "rejected"
]);

export const storeItemKindEnum = pgEnum("store_item_kind", [
  "currency", "account", "item", "service"
]);

// Who owns/sells the listing: the platform itself, or a regular user (P2P).
export const storeListingSourceEnum = pgEnum("store_listing_source", [
  "official", "user"
]);

export const storeListingStatusEnum = pgEnum("store_listing_status", [
  "draft", "pending_review", "active", "paused", "sold_out", "rejected", "archived"
]);

// Promotion state for the storefront hero carousel. Separate from
// store_listing_status because a listing can be active (buyable) while its
// promotion is still awaiting review, or rejected, or expired.
export const storeFeaturedStatusEnum = pgEnum("store_featured_status", [
  "none", "pending_review", "approved", "rejected"
]);

export const storeReportStatusEnum = pgEnum("store_report_status", [
  "open", "reviewing", "resolved", "dismissed"
]);

// Price-negotiation offers a buyer makes on a listing.
export const storeOfferStatusEnum = pgEnum("store_offer_status", [
  "pending",   // waiting for the seller to respond
  "accepted",  // seller accepted -> an escrow order is created
  "rejected",  // seller rejected
  "withdrawn", // buyer cancelled their offer
  "expired"    // offer timed out
]);

export const storeOrderStatusEnum = pgEnum("store_order_status", [
  "pending_payment", // order created, awaiting wallet debit
  "paid_escrow",     // buyer paid, funds held by platform
  "delivered",       // seller marked as delivered
  "completed",       // buyer confirmed -> funds released to seller
  "disputed",        // buyer/seller opened a dispute
  "refunded",        // funds returned to buyer
  "cancelled"        // cancelled before payment / by admin
]);

// --- TABLES ---

// Site settings
export const siteSettings = pgTable("site_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Site images
export const siteImages = pgTable("site_images", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  url: text("url").notNull(),
  altText: varchar("alt_text", { length: 255 }),
  category: varchar("category", { length: 50 }).notNull().default("general"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Users
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull().unique(),
  phoneVerifiedAt: timestamp("phone_verified_at"),
  username: varchar("username", { length: 100 }).unique(),
  email: varchar("email", { length: 255 }).unique(),
  // Registration now sends the OTP to email (not SMS), while the mobile
  // number is still collected and required. This tracks when that email
  // OTP was confirmed — separate from `isVerified`, which is a broader
  // "trusted account" flag also set by the store's KYC review flow.
  emailVerifiedAt: timestamp("email_verified_at"),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  flexaId: varchar("flexa_id", { length: 20 }).notNull().unique(),
  // Legal/KYC first and last name are private and must never become the public
  // gamer identity automatically. `displayName` is the independent nickname
  // shown in profiles, matchmaking and leaderboards (username is its default).
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  // Age-gate + light identity check. Required at signup for NEW users
  // (existing users are grandfathered as nullable). Payment-related flows —
  // wallet top-up requests and paid tournament registrations — refuse to
  // proceed when either is missing or when the computed age is under 18.
  // `birthDate` is stored as an ISO date (YYYY-MM-DD, Gregorian) so age
  // arithmetic is trivial. `nationalId` is an Iranian کد ملی (10 digits)
  // and is unique across the site — the same document cannot be reused
  // to farm multiple paid accounts.
  birthDate: varchar("birth_date", { length: 10 }),
  nationalId: varchar("national_id", { length: 10 }),
  bio: text("bio"),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  role: userRoleEnum("role").notNull().default("player"),
  isVerified: boolean("is_verified").notNull().default(false),
  xp: integer("xp").default(0).notNull(),
  level: integer("level").default(1).notNull(),
  rankPoints: integer("rank_points").default(1000).notNull(),
  clashRoyaleId: varchar("clash_royale_id", { length: 100 }),
  clashRoyaleUsername: varchar("clash_royale_username", { length: 100 }),
  clashRoyaleStatus: verificationStatusEnum("cr_status").default("unlinked"),
  codMobileId: varchar("cod_mobile_id", { length: 100 }),
  codMobileUsername: varchar("cod_mobile_username", { length: 100 }),
  codMobileRegion: varchar("cod_mobile_region", { length: 16 }).notNull().default("global"),
  codMobileStatus: verificationStatusEnum("codm_status").default("unlinked"),
  fortniteId: varchar("fortnite_id", { length: 100 }),
  fortniteUsername: varchar("fortnite_username", { length: 100 }),
  fortniteStatus: verificationStatusEnum("fortnite_status").default("unlinked"),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  termsVersion: varchar("terms_version", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
  metadata: jsonb("metadata"),
}, (table) => ({
  phoneIdx: index("users_phone_idx").on(table.phoneNumber),
  rankIdx: index("users_rank_points_idx").on(table.rankPoints),
  flexaIdIdx: index("users_flexa_id_idx").on(table.flexaId),
  // Enforce one paid-eligible account per national ID (nullable — legacy
  // users without a code_melli are ignored by unique-with-nulls semantics).
  nationalIdIdx: uniqueIndex("users_national_id_idx").on(table.nationalId),
}));

// Sessions
export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: varchar("user_agent", { length: 500 }),
}, (table) => ({
  // `token` is already indexed by its UNIQUE constraint (the hot
  // validateSession lookup). These cover the remaining access patterns:
  // listing a user's devices, revoking all sessions, and expiry sweeps.
  userIdIdx: index("sessions_user_id_idx").on(table.userId),
  expiresAtIdx: index("sessions_expires_at_idx").on(table.expiresAt),
}));

// Notifications
export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  type: varchar("type", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  link: varchar("link", { length: 500 }),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("notifications_user_id_idx").on(table.userId),
}));

// Teams
export const teams = pgTable("teams", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  tag: varchar("tag", { length: 10 }).notNull(),
  logoUrl: varchar("logo_url", { length: 500 }),
  ownerId: uuid("owner_id").notNull().references(() => users.id),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  ownerIdIdx: index("teams_owner_id_idx").on(table.ownerId),
  createdAtIdx: index("teams_created_at_idx").on(table.createdAt),
}));

// Team members
export const teamMembers = pgTable("team_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  teamId: uuid("team_id").notNull().references(() => teams.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  role: varchar("role", { length: 50 }).notNull().default("member"),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (table) => ({
  teamIdIdx: index("team_members_team_id_idx").on(table.teamId),
  userIdIdx: index("team_members_user_id_idx").on(table.userId),
}));

// Achievements
export const achievements = pgTable("achievements", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  nameFA: varchar("name_fa", { length: 100 }).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  descriptionFA: varchar("description_fa", { length: 255 }).notNull(),
  icon: varchar("icon", { length: 50 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  requirement: integer("requirement").notNull(),
  points: integer("points").notNull().default(10),
});

// User achievements
export const userAchievements = pgTable("user_achievements", {
  id: uuid("id").defaultRandom().primaryKey(),
  visibleUserId: uuid("user_id").notNull().references(() => users.id),
  achievementId: uuid("achievement_id").notNull().references(() => achievements.id),
  unlockedAt: timestamp("unlocked_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("user_achievements_user_id_idx").on(table.visibleUserId),
}));

// Tournaments
export const tournaments = pgTable("tournaments", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  game: gameEnum("game").notNull(),
  format: tournamentFormatEnum("format").notNull().default("single_elimination"),
  status: tournamentStatusEnum("status").notNull().default("registration"),
  description: text("description"),
  maxPlayers: integer("max_players").notNull().default(16),
  prizePool: varchar("prize_pool", { length: 100 }),
  winnersCount: integer("winners_count").default(1),
  categoryLabel: varchar("category_label", { length: 100 }),
  entryFee: varchar("entry_fee", { length: 100 }).default("رایگان"),
  gameMode: varchar("game_mode", { length: 100 }),
  mapName: varchar("map_name", { length: 100 }),
  serverSlots: integer("server_slots").default(16),
  prize1st: varchar("prize_1st", { length: 100 }),
  prize2nd: varchar("prize_2nd", { length: 100 }),
  prize3rd: varchar("prize_3rd", { length: 100 }),
  prize4to10: varchar("prize_4to10", { length: 100 }),
  rules: text("rules"),
  bannerUrl: varchar("banner_url", { length: 500 }),
  roomId: varchar("room_id", { length: 100 }),
  roomPassword: varchar("room_password", { length: 100 }),
  lobbyNotes: text("lobby_notes"),
  roomVisibleAt: timestamp("room_visible_at"),
  createdById: uuid("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
});

// Uploaded Clash Royale private-tournament leaderboard screenshots.
export const tournamentLeaderboardSubmissions = pgTable("tournament_leaderboard_submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  tournamentId: uuid("tournament_id").notNull().references(() => tournaments.id),
  submittedById: uuid("submitted_by_id").references(() => users.id),
  imageUrl: text("image_url").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  parsedData: jsonb("parsed_data"),
  aiProvider: varchar("ai_provider", { length: 50 }),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tournamentIdx: index("tournament_leaderboard_submissions_tournament_idx").on(table.tournamentId),
  statusIdx: index("tournament_leaderboard_submissions_status_idx").on(table.status),
}));

// Confirmed standings extracted from the in-game Clash Royale leaderboard.
export const privateTournamentStandings = pgTable("private_tournament_standings", {
  id: uuid("id").defaultRandom().primaryKey(),
  tournamentId: uuid("tournament_id").notNull().references(() => tournaments.id),
  submissionId: uuid("submission_id").references(() => tournamentLeaderboardSubmissions.id),
  rank: integer("rank").notNull(),
  playerId: uuid("player_id").references(() => players.id),
  userId: uuid("user_id").references(() => users.id),
  playerTag: varchar("player_tag", { length: 32 }),
  playerName: varchar("player_name", { length: 100 }).notNull(),
  score: integer("score"),
  verified: boolean("verified").notNull().default(false),
  source: varchar("source", { length: 30 }).notNull().default("leaderboard_ocr"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tournamentRankUnique: uniqueIndex("private_tournament_standings_tournament_rank_unique").on(table.tournamentId, table.rank),
  tournamentPlayerIdx: index("private_tournament_standings_tournament_player_idx").on(table.tournamentId, table.playerId),
  userIdx: index("private_tournament_standings_user_idx").on(table.userId),
}));

// Honors / Hall of Fame
export const honors = pgTable("honors", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: varchar("type", { length: 30 }).notNull().default("news"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  icon: varchar("icon", { length: 20 }).notNull().default("🏆"),
  imageUrl: text("image_url"),
  prize: varchar("prize", { length: 120 }),
  username: varchar("username", { length: 100 }),
  level: integer("level"),
  highlight: boolean("highlight").notNull().default(false),
  game: varchar("game", { length: 50 }),
  tournamentId: uuid("tournament_id").references(() => tournaments.id),
  userId: uuid("user_id").references(() => users.id),
  createdById: uuid("created_by_id").references(() => users.id),
  approvedById: uuid("approved_by_id").references(() => users.id),
  source: varchar("source", { length: 50 }).notNull().default("manual"),
  metadata: jsonb("metadata"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("honors_status_idx").on(table.status),
  typeIdx: index("honors_type_idx").on(table.type),
  gameIdx: index("honors_game_idx").on(table.game),
  createdAtIdx: index("honors_created_at_idx").on(table.createdAt),
  publishedAtIdx: index("honors_published_at_idx").on(table.publishedAt),
}));


// Honor engagement (views / likes)
export const honorViews = pgTable("honor_views", {
  id: uuid("id").defaultRandom().primaryKey(),
  honorId: uuid("honor_id").notNull().references(() => honors.id),
  userId: uuid("user_id").references(() => users.id),
  visitorKey: varchar("visitor_key", { length: 120 }).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: varchar("user_agent", { length: 300 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
}, (table) => ({
  honorIdx: index("honor_views_honor_id_idx").on(table.honorId),
  userIdx: index("honor_views_user_id_idx").on(table.userId),
  uniqueViewerIdx: uniqueIndex("honor_views_honor_visitor_unique").on(table.honorId, table.visitorKey),
}));

export const honorLikes = pgTable("honor_likes", {
  id: uuid("id").defaultRandom().primaryKey(),
  honorId: uuid("honor_id").notNull().references(() => honors.id),
  userId: uuid("user_id").references(() => users.id),
  visitorKey: varchar("visitor_key", { length: 120 }).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: varchar("user_agent", { length: 300 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  honorIdx: index("honor_likes_honor_id_idx").on(table.honorId),
  userIdx: index("honor_likes_user_id_idx").on(table.userId),
  uniqueLikeIdx: uniqueIndex("honor_likes_honor_visitor_unique").on(table.honorId, table.visitorKey),
}));


export const honorContentViews = pgTable("honor_content_views", {
  id: uuid("id").defaultRandom().primaryKey(),
  contentId: varchar("content_id", { length: 120 }).notNull(),
  userId: uuid("user_id").references(() => users.id),
  visitorKey: varchar("visitor_key", { length: 120 }).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: varchar("user_agent", { length: 300 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
}, (table) => ({
  contentIdx: index("honor_content_views_content_id_idx").on(table.contentId),
  uniqueViewerIdx: uniqueIndex("honor_content_views_content_visitor_unique").on(table.contentId, table.visitorKey),
}));

export const honorContentLikes = pgTable("honor_content_likes", {
  id: uuid("id").defaultRandom().primaryKey(),
  contentId: varchar("content_id", { length: 120 }).notNull(),
  userId: uuid("user_id").references(() => users.id),
  visitorKey: varchar("visitor_key", { length: 120 }).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: varchar("user_agent", { length: 300 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  contentIdx: index("honor_content_likes_content_id_idx").on(table.contentId),
  uniqueLikeIdx: uniqueIndex("honor_content_likes_content_visitor_unique").on(table.contentId, table.visitorKey),
}));

// Players
export const players = pgTable("players", {
  id: uuid("id").defaultRandom().primaryKey(),
  visibleUserId: uuid("user_id").references(() => users.id),
  username: varchar("username", { length: 100 }).notNull(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  gameId: varchar("game_id", { length: 100 }),
  rating: integer("rating").notNull().default(1000),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("players_user_id_idx").on(table.visibleUserId),
}));

// Registrations
export const registrations = pgTable("registrations", {
  id: uuid("id").defaultRandom().primaryKey(),
  tournamentId: uuid("tournament_id").notNull().references(() => tournaments.id),
  playerId: uuid("player_id").notNull().references(() => players.id),
  visibleUserId: uuid("user_id").notNull().references(() => users.id),
  seed: integer("seed"),
  checkedInAt: timestamp("checked_in_at"),
  attendanceStatus: varchar("attendance_status", { length: 20 }).notNull().default("registered"),
  noShowAt: timestamp("no_show_at"),
  cancellationPolicyAcceptedAt: timestamp("cancellation_policy_accepted_at"),
  // Optional per-registration invite payload used for games like Clash Royale
  // where players can share an Add Friend / Quickplay QR or link. Keeping this
  // on the registration makes the QR tournament-specific: a player can refresh
  // it for one paid event without changing their global profile.
  gameInviteLink: text("game_invite_link"),
  gameInviteQrFileId: varchar("game_invite_qr_file_id", { length: 255 }),
  gameInviteSubmittedAt: timestamp("game_invite_submitted_at"),
  registeredAt: timestamp("registered_at").defaultNow().notNull(),
}, (table) => ({
  tournamentIdx: index("registrations_tournament_id_idx").on(table.tournamentId),
  playerIdIdx: index("registrations_player_id_idx").on(table.playerId),
  tournamentPlayerUnique: uniqueIndex("registrations_tournament_player_unique").on(table.tournamentId, table.playerId),
  tournamentUserUnique: uniqueIndex("registrations_tournament_user_unique").on(table.tournamentId, table.visibleUserId),
}));

// Standalone Clash Royale 1V1 paid queue entries.
// This is intentionally separate from tournament registrations: a 1V1 queue is
// not a room/bracket signup and the same player may buy a new entry for a new
// duel after a previous one completes.
export const clash1v1Entries = pgTable("clash_1v1_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  tournamentId: uuid("tournament_id").notNull().references(() => tournaments.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  playerId: uuid("player_id").notNull().references(() => players.id),
  telegramId: varchar("telegram_id", { length: 32 }).notNull(),
  status: clash1v1EntryStatusEnum("status").notNull().default("waiting_qr"),
  entryFeeRial: numeric("entry_fee_rial", { precision: 20, scale: 0 }).notNull().default("500000"),
  prizeRial: numeric("prize_rial", { precision: 20, scale: 0 }).notNull().default("800000"),
  opponentType: varchar("opponent_type", { length: 16 }).notNull().default("random"),
  stakeMode: varchar("stake_mode", { length: 16 }).notNull().default("paid"),
  gameMode: varchar("game_mode", { length: 32 }).notNull().default("normal"),
  challengeId: uuid("challenge_id"),
  inviteLink: text("invite_link"),
  qrFileId: varchar("qr_file_id", { length: 255 }),
  submittedAt: timestamp("submitted_at"),
  matchedMatchId: uuid("matched_match_id").references(() => matches.id),
  matchedAt: timestamp("matched_at"),
  readyAt: timestamp("ready_at"),
  completedAt: timestamp("completed_at"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  metadata: jsonb("metadata"),
}, (table) => ({
  userStatusIdx: index("clash_1v1_entries_user_status_idx").on(table.userId, table.status),
  statusSubmittedIdx: index("clash_1v1_entries_status_submitted_idx").on(table.status, table.submittedAt),
  queueModeIdx: index("clash_1v1_entries_queue_mode_idx").on(table.status, table.opponentType, table.stakeMode, table.gameMode, table.submittedAt),
  challengeIdx: index("clash_1v1_entries_challenge_idx").on(table.challengeId),
  matchIdx: index("clash_1v1_entries_match_idx").on(table.matchedMatchId),
  telegramIdx: index("clash_1v1_entries_telegram_idx").on(table.telegramId),
}));

// Private friend challenges are negotiated before either wallet is debited.
// The active proposal has one proposer; only the other party can accept it.
export const clash1v1Challenges = pgTable("clash_1v1_challenges", {
  id: uuid("id").defaultRandom().primaryKey(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  tournamentId: uuid("tournament_id").notNull().references(() => tournaments.id),
  challengerUserId: uuid("challenger_user_id").notNull().references(() => users.id),
  challengerTelegramId: varchar("challenger_telegram_id", { length: 32 }).notNull(),
  opponentUserId: uuid("opponent_user_id").references(() => users.id),
  opponentTelegramId: varchar("opponent_telegram_id", { length: 32 }),
  proposedByUserId: uuid("proposed_by_user_id").notNull().references(() => users.id),
  stakeMode: varchar("stake_mode", { length: 16 }).notNull(),
  gameMode: varchar("game_mode", { length: 32 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  proposalVersion: integer("proposal_version").notNull().default(1),
  matchId: uuid("match_id").references(() => matches.id),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  metadata: jsonb("metadata"),
}, (table) => ({
  challengerStatusIdx: index("clash_1v1_challenges_challenger_status_idx").on(table.challengerUserId, table.status),
  opponentStatusIdx: index("clash_1v1_challenges_opponent_status_idx").on(table.opponentUserId, table.status),
  expiresIdx: index("clash_1v1_challenges_expires_idx").on(table.status, table.expiresAt),
  matchIdx: index("clash_1v1_challenges_match_idx").on(table.matchId),
}));

// Telegram pre-registrations
// Leads/users collected by the official Flexa Telegram bot before the user
// completes official tournament registration inside the web app.
export const telegramPreRegistrations = pgTable("telegram_pre_registrations", {
  id: uuid("id").defaultRandom().primaryKey(),
  telegramId: varchar("telegram_id", { length: 32 }).notNull().unique(),
  telegramUsername: varchar("telegram_username", { length: 100 }),
  telegramFirstName: varchar("telegram_first_name", { length: 100 }),
  telegramLastName: varchar("telegram_last_name", { length: 100 }),
  linkedUserId: uuid("linked_user_id").references(() => users.id),
  flexaId: varchar("flexa_id", { length: 20 }),
  fullName: varchar("full_name", { length: 100 }).notNull(),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
  game: varchar("game", { length: 50 }).notNull(),
  platform: varchar("platform", { length: 50 }),
  gamerTag: varchar("gamer_tag", { length: 100 }).notNull(),
  city: varchar("city", { length: 100 }),
  teamName: varchar("team_name", { length: 100 }),
  status: varchar("status", { length: 30 }).notNull().default("new"),
  source: varchar("source", { length: 50 }).notNull().default("telegram_bot"),
  rawPayload: jsonb("raw_payload"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  telegramIdIdx: index("telegram_pre_reg_telegram_id_idx").on(table.telegramId),
  flexaIdIdx: index("telegram_pre_reg_flexa_id_idx").on(table.flexaId),
  phoneIdx: index("telegram_pre_reg_phone_idx").on(table.phoneNumber),
  gameIdx: index("telegram_pre_reg_game_idx").on(table.game),
  statusIdx: index("telegram_pre_reg_status_idx").on(table.status),
  createdAtIdx: index("telegram_pre_reg_created_at_idx").on(table.createdAt),
}));

// Telegram webhook conversation sessions
export const telegramBotSessions = pgTable("telegram_bot_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  telegramId: varchar("telegram_id", { length: 32 }).notNull().unique(),
  state: varchar("state", { length: 50 }).notNull().default("idle"),
  data: jsonb("data").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  telegramIdIdx: index("telegram_bot_sessions_telegram_id_idx").on(table.telegramId),
  updatedAtIdx: index("telegram_bot_sessions_updated_at_idx").on(table.updatedAt),
}));

// Telegram accounts linked to Flexa users
export const telegramAccounts = pgTable("telegram_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  telegramId: varchar("telegram_id", { length: 32 }).notNull().unique(),
  telegramUsername: varchar("telegram_username", { length: 100 }),
  telegramFirstName: varchar("telegram_first_name", { length: 100 }),
  telegramLastName: varchar("telegram_last_name", { length: 100 }),
  userId: uuid("user_id").notNull().references(() => users.id).unique(),
  linkedAt: timestamp("linked_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  telegramIdIdx: index("telegram_accounts_telegram_id_idx").on(table.telegramId),
  userIdIdx: index("telegram_accounts_user_id_idx").on(table.userId),
}));

// One-time codes generated by /link in the Telegram bot
export const telegramLinkCodes = pgTable("telegram_link_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  telegramId: varchar("telegram_id", { length: 32 }).notNull(),
  codeHash: varchar("code_hash", { length: 64 }).notNull(),
  telegramUsername: varchar("telegram_username", { length: 100 }),
  telegramFirstName: varchar("telegram_first_name", { length: 100 }),
  telegramLastName: varchar("telegram_last_name", { length: 100 }),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  telegramIdIdx: index("telegram_link_codes_telegram_id_idx").on(table.telegramId),
  codeHashIdx: index("telegram_link_codes_code_hash_idx").on(table.codeHash),
  expiresAtIdx: index("telegram_link_codes_expires_at_idx").on(table.expiresAt),
}));

// Referral tracking for Telegram growth loops
export const telegramReferrals = pgTable("telegram_referrals", {
  id: uuid("id").defaultRandom().primaryKey(),
  referrerTelegramId: varchar("referrer_telegram_id", { length: 32 }).notNull(),
  referredTelegramId: varchar("referred_telegram_id", { length: 32 }).notNull().unique(),
  referredUsername: varchar("referred_username", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  referrerIdx: index("telegram_referrals_referrer_idx").on(table.referrerTelegramId),
  referredIdx: index("telegram_referrals_referred_idx").on(table.referredTelegramId),
}));

// De-duplication for reminders, lobby notices and channel result posts
export const telegramSentNotifications = pgTable("telegram_sent_notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  dedupeKey: varchar("dedupe_key", { length: 180 }).notNull().unique(),
  telegramId: varchar("telegram_id", { length: 32 }),
  tournamentId: uuid("tournament_id").references(() => tournaments.id),
  type: varchar("type", { length: 50 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  dedupeIdx: index("telegram_sent_notifications_dedupe_idx").on(table.dedupeKey),
  tournamentIdx: index("telegram_sent_notifications_tournament_idx").on(table.tournamentId),
  typeIdx: index("telegram_sent_notifications_type_idx").on(table.type),
}));

// Idempotency ledger for incoming Telegram webhook updates. Telegram retries
// webhooks when delivery is uncertain; this table prevents duplicate wallet,
// registration, reward, and notification side effects while allowing a failed
// or abandoned processing lease to be retried safely.
export const telegramWebhookUpdates = pgTable("telegram_webhook_updates", {
  updateId: varchar("update_id", { length: 32 }).primaryKey(),
  status: varchar("status", { length: 20 }).notNull().default("processing"),
  attempts: integer("attempts").notNull().default(1),
  lockedUntil: timestamp("locked_until").notNull(),
  lastError: text("last_error"),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  expiresAt: timestamp("expires_at").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusLockIdx: index("telegram_webhook_updates_status_lock_idx").on(table.status, table.lockedUntil),
  expiresIdx: index("telegram_webhook_updates_expires_idx").on(table.expiresAt),
}));

// PostgreSQL-backed outgoing Telegram queue. Cron/background callers enqueue
// messages transactionally; a worker claims them with a short lease and retries
// transient Telegram failures with exponential backoff.
export const telegramOutbox = pgTable("telegram_outbox", {
  id: uuid("id").defaultRandom().primaryKey(),
  dedupeKey: varchar("dedupe_key", { length: 191 }).unique(),
  chatId: varchar("chat_id", { length: 100 }).notNull(),
  method: varchar("method", { length: 50 }).notNull().default("sendMessage"),
  payload: jsonb("payload").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  priority: integer("priority").notNull().default(0),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  nextAttemptAt: timestamp("next_attempt_at").defaultNow().notNull(),
  lockedUntil: timestamp("locked_until"),
  lastError: text("last_error"),
  telegramMessageId: varchar("telegram_message_id", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  sentAt: timestamp("sent_at"),
}, (table) => ({
  dueIdx: index("telegram_outbox_due_idx").on(table.status, table.nextAttemptAt, table.priority),
  lockIdx: index("telegram_outbox_lock_idx").on(table.status, table.lockedUntil),
}));

// Telegram campaign analytics for /start campaign_* and other deep links
export const telegramCampaignEvents = pgTable("telegram_campaign_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaign: varchar("campaign", { length: 100 }).notNull(),
  telegramId: varchar("telegram_id", { length: 32 }).notNull(),
  telegramUsername: varchar("telegram_username", { length: 100 }),
  eventType: varchar("event_type", { length: 50 }).notNull().default("start"),
  rawPayload: jsonb("raw_payload"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  campaignIdx: index("telegram_campaign_events_campaign_idx").on(table.campaign),
  telegramIdx: index("telegram_campaign_events_telegram_idx").on(table.telegramId),
  eventIdx: index("telegram_campaign_events_event_idx").on(table.eventType),
}));

// Coupons usable by Telegram and web registration flows
export const coupons = pgTable("coupons", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  title: varchar("title", { length: 120 }),
  discountPercent: integer("discount_percent").notNull().default(0),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").notNull().default(0),
  game: varchar("game", { length: 50 }),
  tournamentId: uuid("tournament_id").references(() => tournaments.id),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  codeIdx: index("coupons_code_idx").on(table.code),
  activeIdx: index("coupons_active_idx").on(table.isActive),
  tournamentIdx: index("coupons_tournament_idx").on(table.tournamentId),
}));

export const couponRedemptions = pgTable("coupon_redemptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  couponId: uuid("coupon_id").notNull().references(() => coupons.id),
  userId: uuid("user_id").references(() => users.id),
  telegramId: varchar("telegram_id", { length: 32 }),
  tournamentId: uuid("tournament_id").references(() => tournaments.id),
  status: varchar("status", { length: 30 }).notNull().default("active"),
  discountRial: numeric("discount_rial", { precision: 20, scale: 0 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  usedAt: timestamp("used_at"),
}, (table) => ({
  couponIdx: index("coupon_redemptions_coupon_idx").on(table.couponId),
  userIdx: index("coupon_redemptions_user_idx").on(table.userId),
  telegramIdx: index("coupon_redemptions_telegram_idx").on(table.telegramId),
  statusIdx: index("coupon_redemptions_status_idx").on(table.status),
}));

// Waiting list for full tournaments
export const tournamentWaitlist = pgTable("tournament_waitlist", {
  id: uuid("id").defaultRandom().primaryKey(),
  tournamentId: uuid("tournament_id").notNull().references(() => tournaments.id),
  userId: uuid("user_id").references(() => users.id),
  telegramId: varchar("telegram_id", { length: 32 }),
  status: varchar("status", { length: 30 }).notNull().default("waiting"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  notifiedAt: timestamp("notified_at"),
}, (table) => ({
  tournamentIdx: index("tournament_waitlist_tournament_idx").on(table.tournamentId),
  userIdx: index("tournament_waitlist_user_idx").on(table.userId),
  telegramIdx: index("tournament_waitlist_telegram_idx").on(table.telegramId),
  statusIdx: index("tournament_waitlist_status_idx").on(table.status),
}));

// Telegram channel message tracking, used to edit capacity/status later
export const telegramChannelPosts = pgTable("telegram_channel_posts", {
  id: uuid("id").defaultRandom().primaryKey(),
  tournamentId: uuid("tournament_id").notNull().references(() => tournaments.id),
  chatId: varchar("chat_id", { length: 100 }).notNull(),
  messageId: integer("message_id").notNull(),
  kind: varchar("kind", { length: 50 }).notNull().default("tournament"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tournamentIdx: index("telegram_channel_posts_tournament_idx").on(table.tournamentId),
  chatIdx: index("telegram_channel_posts_chat_idx").on(table.chatId),
}));

// Matches
export const matches = pgTable("matches", {
  id: uuid("id").defaultRandom().primaryKey(),
  tournamentId: uuid("tournament_id").notNull().references(() => tournaments.id),
  round: integer("round").notNull(),
  matchNumber: integer("match_number").notNull(),
  player1Id: uuid("player1_id").references(() => players.id),
  player2Id: uuid("player2_id").references(() => players.id),
  winnerId: uuid("winner_id").references(() => players.id),
  player1Score: integer("player1_score"),
  player2Score: integer("player2_score"),
  status: matchStatusEnum("status").notNull().default("pending"),
  scheduledAt: timestamp("scheduled_at"),
  completedAt: timestamp("completed_at"),
  evidence: jsonb("evidence"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tournamentIdx: index("matches_tournament_id_idx").on(table.tournamentId),
  player1Idx: index("matches_player1_id_idx").on(table.player1Id),
  player2Idx: index("matches_player2_id_idx").on(table.player2Id),
}));

// Independent result claims from both match participants. Keeping one row per
// player prevents the second report from overwriting the first one.
export const matchResultClaims = pgTable("match_result_claims", {
  id: uuid("id").defaultRandom().primaryKey(),
  matchId: uuid("match_id").notNull().references(() => matches.id),
  playerId: uuid("player_id").notNull().references(() => players.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  telegramId: varchar("telegram_id", { length: 32 }),
  claim: varchar("claim", { length: 10 }).notNull(),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  matchPlayerUnique: uniqueIndex("match_result_claims_match_player_unique").on(table.matchId, table.playerId),
  matchIdx: index("match_result_claims_match_idx").on(table.matchId),
  userIdx: index("match_result_claims_user_idx").on(table.userId),
}));

// =========================================================================
// MEDIA PARTNERS / AFFILIATE PROGRAM
// =========================================================================

export const mediaPartners = pgTable("media_partners", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id).unique(),
  partnerType: varchar("partner_type", { length: 20 }).notNull().default("media"),
  referralCode: varchar("referral_code", { length: 24 }).notNull().unique(),
  legalName: varchar("legal_name", { length: 160 }).notNull(),
  // Nullable since migration 0046: a personal referrer gets a link before
  // supplying any legal identity. Required again to withdraw cash.
  nationalId: varchar("national_id", { length: 10 }),
  sheba: varchar("sheba", { length: 26 }),
  mediaName: varchar("media_name", { length: 160 }).notNull(),
  mediaType: varchar("media_type", { length: 30 }).notNull(),
  mediaUrl: varchar("media_url", { length: 500 }).notNull(),
  followerCount: integer("follower_count").notNull().default(0),
  ownershipProofUrl: text("ownership_proof_url"),
  status: varchar("status", { length: 30 }).notNull().default("draft"),
  commissionRialPerMatch: numeric("commission_rial_per_match", { precision: 20, scale: 0 }).notNull().default("70000"),
  attributionDays: integer("attribution_days").notNull().default(30),
  minimumPayoutRial: numeric("minimum_payout_rial", { precision: 20, scale: 0 }).notNull().default("3000000"),
  contractAcceptedAt: timestamp("contract_accepted_at"),
  /** Stage 1: the three short rules that unlock a referral link. */
  quickRulesAcceptedAt: timestamp("quick_rules_accepted_at"),
  quickRulesVersion: varchar("quick_rules_version", { length: 60 }),
  approvedById: uuid("approved_by_id").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  settings: jsonb("settings").notNull().default('{}'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("media_partners_status_idx").on(table.status),
  typeStatusIdx: index("media_partners_type_status_idx").on(table.partnerType, table.status),
  referralIdx: uniqueIndex("media_partners_referral_code_idx").on(table.referralCode),
  nationalIdx: index("media_partners_national_id_idx").on(table.nationalId),
}));

export const mediaPartnerAgreements = pgTable("media_partner_agreements", {
  id: uuid("id").defaultRandom().primaryKey(),
  partnerId: uuid("partner_id").notNull().references(() => mediaPartners.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  contractVersion: varchar("contract_version", { length: 60 }).notNull(),
  contentHash: varchar("content_hash", { length: 64 }).notNull(),
  contentSnapshot: text("content_snapshot").notNull(),
  signerName: varchar("signer_name", { length: 160 }).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: varchar("user_agent", { length: 500 }),
  otpVerifiedAt: timestamp("otp_verified_at").notNull(),
  acceptedAt: timestamp("accepted_at").defaultNow().notNull(),
}, (table) => ({
  partnerVersionIdx: index("media_partner_agreements_partner_version_idx").on(table.partnerId, table.contractVersion),
  userIdx: index("media_partner_agreements_user_idx").on(table.userId),
}));

export const mediaProperties = pgTable("media_properties", {
  id: uuid("id").defaultRandom().primaryKey(),
  partnerId: uuid("partner_id").notNull().references(() => mediaPartners.id),
  platform: varchar("platform", { length: 30 }).notNull(),
  externalId: varchar("external_id", { length: 100 }),
  title: varchar("title", { length: 200 }),
  url: varchar("url", { length: 500 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  verifiedByUserId: uuid("verified_by_user_id").references(() => users.id),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  externalUnique: uniqueIndex("media_properties_platform_external_idx").on(table.platform, table.externalId),
  partnerIdx: index("media_properties_partner_idx").on(table.partnerId),
  statusIdx: index("media_properties_status_idx").on(table.status),
}));

export const affiliateAttributions = pgTable("affiliate_attributions", {
  id: uuid("id").defaultRandom().primaryKey(),
  partnerId: uuid("partner_id").notNull().references(() => mediaPartners.id),
  telegramId: varchar("telegram_id", { length: 32 }).notNull().unique(),
  /**
   * Channel-agnostic visitor identity: `tg:<telegramId>` for the bot flow,
   * `web:<uuid>` for an invite link opened in a browser. Telegram was the only
   * possible entry point before this existed.
   */
  visitorKey: varchar("visitor_key", { length: 64 }),
  userId: uuid("user_id").references(() => users.id).unique(),
  campaignCode: varchar("campaign_code", { length: 60 }),
  source: varchar("source", { length: 30 }).notNull().default("telegram_deep_link"),
  status: varchar("status", { length: 30 }).notNull().default("active"),
  attributedAt: timestamp("attributed_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  metadata: jsonb("metadata").notNull().default('{}'),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  partnerStatusIdx: index("affiliate_attributions_partner_status_idx").on(table.partnerId, table.status),
  expiresIdx: index("affiliate_attributions_expires_idx").on(table.status, table.expiresAt),
}));

export const affiliateClicks = pgTable("affiliate_clicks", {
  id: uuid("id").defaultRandom().primaryKey(),
  partnerId: uuid("partner_id").notNull().references(() => mediaPartners.id),
  telegramId: varchar("telegram_id", { length: 32 }),
  campaignCode: varchar("campaign_code", { length: 60 }),
  source: varchar("source", { length: 30 }).notNull().default("telegram"),
  metadata: jsonb("metadata").notNull().default('{}'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  partnerCreatedIdx: index("affiliate_clicks_partner_created_idx").on(table.partnerId, table.createdAt),
  telegramIdx: index("affiliate_clicks_telegram_idx").on(table.telegramId),
}));

export const affiliateCommissionEvents = pgTable("affiliate_commission_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  matchId: uuid("match_id").references(() => matches.id).unique(),
  sourceType: varchar("source_type", { length: 30 }).notNull().default("clash_match"),
  sourceId: varchar("source_id", { length: 100 }),
  totalAmountRial: numeric("total_amount_rial", { precision: 20, scale: 0 }).notNull().default("70000"),
  status: varchar("status", { length: 20 }).notNull().default("shadow"),
  availableAt: timestamp("available_at").notNull(),
  paidAt: timestamp("paid_at"),
  reversedAt: timestamp("reversed_at"),
  reversalReason: text("reversal_reason"),
  risk: jsonb("risk").notNull().default('{}'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusAvailableIdx: index("affiliate_commission_events_status_available_idx").on(table.status, table.availableAt),
  sourceUniqueIdx: uniqueIndex("affiliate_commission_events_source_unique_idx").on(table.sourceType, table.sourceId),
}));

export const affiliatePayouts = pgTable("affiliate_payouts", {
  id: uuid("id").defaultRandom().primaryKey(),
  partnerId: uuid("partner_id").notNull().references(() => mediaPartners.id),
  amountRial: numeric("amount_rial", { precision: 20, scale: 0 }).notNull(),
  destination: varchar("destination", { length: 20 }).notNull().default("bank"),
  status: varchar("status", { length: 20 }).notNull().default("requested"),
  shebaSnapshot: varchar("sheba_snapshot", { length: 26 }).notNull(),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  reviewedById: uuid("reviewed_by_id").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  paidAt: timestamp("paid_at"),
  reference: varchar("reference", { length: 120 }),
  adminNote: text("admin_note"),
}, (table) => ({
  partnerStatusIdx: index("affiliate_payouts_partner_status_idx").on(table.partnerId, table.status),
}));

export const affiliateCommissionShares = pgTable("affiliate_commission_shares", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull().references(() => affiliateCommissionEvents.id),
  partnerId: uuid("partner_id").notNull().references(() => mediaPartners.id),
  referredUserId: uuid("referred_user_id").references(() => users.id),
  amountRial: numeric("amount_rial", { precision: 20, scale: 0 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("shadow"),
  payoutId: uuid("payout_id").references(() => affiliatePayouts.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  eventPartnerUnique: uniqueIndex("affiliate_commission_shares_event_partner_idx").on(table.eventId, table.partnerId),
  partnerStatusIdx: index("affiliate_commission_shares_partner_status_idx").on(table.partnerId, table.status),
  payoutIdx: index("affiliate_commission_shares_payout_idx").on(table.payoutId),
}));

// Match evidence
export const matchEvidence = pgTable("match_evidence", {
  id: uuid("id").defaultRandom().primaryKey(),
  matchId: uuid("match_id").notNull().references(() => matches.id),
  uploadedById: uuid("uploaded_by_id").notNull().references(() => users.id),
  fileUrl: varchar("file_url", { length: 500 }).notNull(),
  fileType: varchar("file_type", { length: 50 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  matchIdIdx: index("match_evidence_match_id_idx").on(table.matchId),
}));

// Judges
export const judges = pgTable("judges", {
  id: uuid("id").defaultRandom().primaryKey(),
  visibleUserId: uuid("user_id").references(() => users.id),
  name: varchar("name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }),
  role: varchar("role", { length: 50 }).notNull().default("judge"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  activeCreatedAtIdx: index("judges_is_active_created_at_idx").on(table.isActive, table.createdAt),
  userIdIdx: index("judges_user_id_idx").on(table.visibleUserId),
}));

// Judgments
export const judgments = pgTable("judgments", {
  id: uuid("id").defaultRandom().primaryKey(),
  matchId: uuid("match_id").notNull().references(() => matches.id),
  judgeId: uuid("judge_id").references(() => judges.id),
  isAiJudgment: boolean("is_ai_judgment").notNull().default(false),
  verdict: varchar("verdict", { length: 50 }).notNull(),
  reasoning: text("reasoning"),
  confidence: integer("confidence"),
  scoreBreakdown: jsonb("score_breakdown"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  matchIdIdx: index("judgments_match_id_idx").on(table.matchId),
}));

// Disputes
export const disputes = pgTable("disputes", {
  id: uuid("id").defaultRandom().primaryKey(),
  matchId: uuid("match_id").notNull().references(() => matches.id),
  raisedById: uuid("raised_by_id").notNull().references(() => players.id),
  reason: text("reason").notNull(),
  evidenceUrls: jsonb("evidence_urls"),
  status: varchar("status", { length: 50 }).notNull().default("open"),
  resolution: text("resolution"),
  resolvedById: uuid("resolved_by_id").references(() => judges.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => ({
  matchIdIdx: index("disputes_match_id_idx").on(table.matchId),
}));

// Verification
export const verificationTokens = pgTable("verification_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  identifier: varchar("identifier", { length: 255 }).notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  identifierIdx: index("verif_phone_idx").on(table.identifier),
}));

// AI Management
export const aiProposals = pgTable("ai_proposals", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: varchar("type", { length: 50 }).notNull(),
  targetId: uuid("target_id").notNull(),
  suggestedAction: text("suggested_action").notNull(),
  confidence: integer("confidence").notNull(),
  reasoning: text("reasoning"),
  status: varchar("status", { length: 20 }).default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  statusCreatedAtIdx: index("ai_proposals_status_created_at_idx").on(table.status, table.createdAt),
  targetIdIdx: index("ai_proposals_target_id_idx").on(table.targetId),
}));

// Granular admin permissions
export const adminPermissions = pgTable("admin_permissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  permission: varchar("permission", { length: 80 }).notNull(),
  allowed: boolean("allowed").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userPermissionIdx: index("admin_permissions_user_permission_idx").on(table.userId, table.permission),
}));

// Admin audit logs
export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  adminId: uuid("admin_id").references(() => users.id),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 100 }).notNull(),
  entityId: varchar("entity_id", { length: 100 }),
  metadata: jsonb("metadata"),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  adminIdx: index("admin_audit_admin_idx").on(table.adminId),
  entityIdx: index("admin_audit_entity_idx").on(table.entityType, table.entityId),
  createdIdx: index("admin_audit_created_idx").on(table.createdAt),
}));

// Wallets
export const wallets = pgTable("wallets", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id).unique(),
  balance: numeric("balance", { precision: 20, scale: 0 }).notNull().default("0"),
  currency: varchar("currency", { length: 10 }).notNull().default("RIAL"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("wallets_user_id_idx").on(table.userId),
}));

// Transactions
export const transactions = pgTable("transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  walletId: uuid("wallet_id").notNull().references(() => wallets.id),
  amount: numeric("amount", { precision: 20, scale: 0 }).notNull(),
  type: transactionTypeEnum("type").notNull(),
  status: transactionStatusEnum("status").notNull().default("pending"),
  referenceId: varchar("reference_id", { length: 255 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  walletIdIdx: index("transactions_wallet_id_idx").on(table.walletId),
  referenceIdx: index("transactions_reference_id_idx").on(table.referenceId),
}));

// COD Mobile custom-room engine. Financial actions remain shadow-only until
// COD_ARENA_LIVE=true is explicitly enabled after private-beta review.
export const codRooms = pgTable("cod_rooms", {
  id: uuid("id").defaultRandom().primaryKey(),
  game: varchar("game", { length: 24 }).notNull().default("cod_mobile"),
  title: varchar("title", { length: 180 }).notNull(),
  description: text("description"),
  region: varchar("region", { length: 16 }).notNull().default("global"),
  map: varchar("map", { length: 40 }).notNull().default("isolated"),
  teamMode: varchar("team_mode", { length: 16 }).notNull().default("solo"),
  perspective: varchar("perspective", { length: 8 }).notNull().default("tpp"),
  status: varchar("status", { length: 24 }).notNull().default("draft"),
  isPublished: boolean("is_published").notNull().default(false),
  capacity: integer("capacity").notNull().default(40),
  entryFeeRial: numeric("entry_fee_rial", { precision: 20, scale: 0 }).notNull().default("0"),
  serviceFeeRial: numeric("service_fee_rial", { precision: 20, scale: 0 }).notNull().default("0"),
  prizeBudgetRial: numeric("prize_budget_rial", { precision: 20, scale: 0 }).notNull().default("0"),
  referralRateBps: integer("referral_rate_bps").notNull().default(2000),
  rewardConfig: jsonb("reward_config").notNull().default('{}'),
  minRankPoints: integer("min_rank_points").notNull().default(0),
  minCodLevel: integer("min_cod_level").notNull().default(0),
  bannerImageUrl: text("banner_image_url"),
  category: varchar("category", { length: 60 }),
  originalEntryFeeRial: numeric("original_entry_fee_rial", { precision: 20, scale: 0 }),
  matchSettings: jsonb("match_settings").notNull().default('{}'),
  prizeScaling: jsonb("prize_scaling").notNull().default('{}'),
  faq: jsonb("faq").notNull().default('[]'),
  rules: text("rules"),
  rulesVersion: varchar("rules_version", { length: 40 }).notNull().default("cod-beta-1"),
  requiresRecording: boolean("requires_recording").notNull().default(true),
  roomCode: varchar("room_code", { length: 100 }),
  roomPassword: varchar("room_password", { length: 100 }),
  officialJoinUrl: text("official_join_url"),
  checkInOpensAt: timestamp("check_in_opens_at"),
  checkInClosesAt: timestamp("check_in_closes_at"),
  credentialsRevealAt: timestamp("credentials_reveal_at"),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at"),
  createdById: uuid("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusStartIdx: index("cod_rooms_status_start_idx").on(table.status, table.startsAt),
  regionPublishedIdx: index("cod_rooms_region_published_idx").on(table.region, table.isPublished),
}));

export const codRoomStaff = pgTable("cod_room_staff", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id").notNull().references(() => codRooms.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  role: varchar("role", { length: 20 }).notNull(),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
}, (table) => ({
  roomUserRoleUnique: uniqueIndex("cod_room_staff_room_user_role_unique").on(table.roomId, table.userId, table.role),
  userIdx: index("cod_room_staff_user_idx").on(table.userId),
}));

export const codRoomEntries = pgTable("cod_room_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  game: varchar("game", { length: 24 }).notNull().default("cod_mobile"),
  roomId: uuid("room_id").notNull().references(() => codRooms.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  playerId: uuid("player_id").references(() => players.id),
  teamId: uuid("team_id").references(() => teams.id),
  codUidSnapshot: varchar("cod_uid_snapshot", { length: 100 }).notNull(),
  codUsernameSnapshot: varchar("cod_username_snapshot", { length: 100 }).notNull(),
  region: varchar("region", { length: 16 }).notNull(),
  status: varchar("status", { length: 24 }).notNull().default("registered"),
  paymentMode: varchar("payment_mode", { length: 16 }).notNull().default("shadow"),
  entryFeeRial: numeric("entry_fee_rial", { precision: 20, scale: 0 }).notNull().default("0"),
  serviceFeeRial: numeric("service_fee_rial", { precision: 20, scale: 0 }).notNull().default("0"),
  paymentTransactionId: uuid("payment_transaction_id").references(() => transactions.id),
  rulesVersion: varchar("rules_version", { length: 40 }).notNull(),
  rulesAcceptedAt: timestamp("rules_accepted_at").notNull(),
  checkedInAt: timestamp("checked_in_at"),
  joinedAt: timestamp("joined_at"),
  kills: integer("kills"),
  placement: integer("placement"),
  rewardRial: numeric("reward_rial", { precision: 20, scale: 0 }).notNull().default("0"),
  resultStatus: varchar("result_status", { length: 24 }).notNull().default("pending"),
  settledAt: timestamp("settled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  roomUserUnique: uniqueIndex("cod_room_entries_room_user_unique").on(table.roomId, table.userId),
  roomStatusIdx: index("cod_room_entries_room_status_idx").on(table.roomId, table.status),
  userCreatedIdx: index("cod_room_entries_user_created_idx").on(table.userId, table.createdAt),
}));

export const codRoomEvidence = pgTable("cod_room_evidence", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id").notNull().references(() => codRooms.id),
  entryId: uuid("entry_id").references(() => codRoomEntries.id),
  uploadedById: uuid("uploaded_by_id").notNull().references(() => users.id),
  kind: varchar("kind", { length: 24 }).notNull(),
  fileUrl: text("file_url").notNull(),
  contentHash: varchar("content_hash", { length: 64 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  metadata: jsonb("metadata").notNull().default('{}'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  roomKindIdx: index("cod_room_evidence_room_kind_idx").on(table.roomId, table.kind),
  roomHashUnique: uniqueIndex("cod_room_evidence_room_hash_unique").on(table.roomId, table.contentHash),
}));

export const codRoomSettlements = pgTable("cod_room_settlements", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id").notNull().references(() => codRooms.id),
  entryId: uuid("entry_id").notNull().references(() => codRoomEntries.id),
  kills: integer("kills").notNull().default(0),
  placement: integer("placement"),
  killRewardRial: numeric("kill_reward_rial", { precision: 20, scale: 0 }).notNull().default("0"),
  placementRewardRial: numeric("placement_reward_rial", { precision: 20, scale: 0 }).notNull().default("0"),
  participationRewardRial: numeric("participation_reward_rial", { precision: 20, scale: 0 }).notNull().default("0"),
  totalRewardRial: numeric("total_reward_rial", { precision: 20, scale: 0 }).notNull().default("0"),
  status: varchar("status", { length: 20 }).notNull().default("shadow"),
  rewardTransactionId: uuid("reward_transaction_id").references(() => transactions.id),
  verifiedById: uuid("verified_by_id").references(() => users.id),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  roomEntryUnique: uniqueIndex("cod_room_settlements_room_entry_unique").on(table.roomId, table.entryId),
  statusIdx: index("cod_room_settlements_status_idx").on(table.status),
}));

export const codPlayerRanks = pgTable("cod_player_ranks", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  region: varchar("region", { length: 16 }).notNull(),
  points: integer("points").notNull().default(0),
  tier: varchar("tier", { length: 20 }).notNull().default("rookie"),
  verifiedRooms: integer("verified_rooms").notNull().default(0),
  totalKills: integer("total_kills").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userRegionUnique: uniqueIndex("cod_player_ranks_user_region_unique").on(table.userId, table.region),
  regionPointsIdx: index("cod_player_ranks_region_points_idx").on(table.region, table.points),
}));

export const codRoomAuditEvents = pgTable("cod_room_audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id").notNull().references(() => codRooms.id),
  actorId: uuid("actor_id").references(() => users.id),
  eventType: varchar("event_type", { length: 40 }).notNull(),
  payload: jsonb("payload").notNull().default('{}'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  roomCreatedIdx: index("cod_room_audit_room_created_idx").on(table.roomId, table.createdAt),
}));

export const codRoomReports = pgTable("cod_room_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id").notNull().references(() => codRooms.id),
  reporterId: uuid("reporter_id").notNull().references(() => users.id),
  accusedEntryId: uuid("accused_entry_id").references(() => codRoomEntries.id),
  accusedUserId: uuid("accused_user_id").references(() => users.id),
  accusedCodUsername: varchar("accused_cod_username", { length: 100 }),
  category: varchar("category", { length: 32 }).notNull(),
  description: text("description").notNull(),
  evidenceUrl: text("evidence_url"),
  status: varchar("status", { length: 24 }).notNull().default("pending"),
  resolution: varchar("resolution", { length: 40 }),
  adminNote: text("admin_note"),
  reviewedById: uuid("reviewed_by_id").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  roomStatusIdx: index("cod_room_reports_room_status_idx").on(table.roomId, table.status, table.createdAt),
  reporterIdx: index("cod_room_reports_reporter_idx").on(table.reporterId, table.createdAt),
  accusedUserIdx: index("cod_room_reports_accused_user_idx").on(table.accusedUserId, table.createdAt),
}));

export const codRoomPenalties = pgTable("cod_room_penalties", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id").references(() => codRooms.id),
  reportId: uuid("report_id").references(() => codRoomReports.id),
  entryId: uuid("entry_id").references(() => codRoomEntries.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  type: varchar("type", { length: 24 }).notNull(),
  reason: text("reason").notNull(),
  fineRial: numeric("fine_rial", { precision: 20, scale: 0 }).notNull().default("0"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  startsAt: timestamp("starts_at").defaultNow().notNull(),
  endsAt: timestamp("ends_at"),
  createdById: uuid("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  metadata: jsonb("metadata").notNull().default('{}'),
}, (table) => ({
  userActiveIdx: index("cod_room_penalties_user_active_idx").on(table.userId, table.status, table.startsAt),
  roomIdx: index("cod_room_penalties_room_idx").on(table.roomId, table.createdAt),
  reportIdx: index("cod_room_penalties_report_idx").on(table.reportId),
}));

export const codRoomLobbyChecks = pgTable("cod_room_lobby_checks", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id").notNull().references(() => codRooms.id),
  uploadedById: uuid("uploaded_by_id").notNull().references(() => users.id),
  telegramFileId: text("telegram_file_id"),
  telegramFileUniqueId: text("telegram_file_unique_id"),
  sourceKind: varchar("source_kind", { length: 24 }).notNull().default("telegram_photo"),
  status: varchar("status", { length: 24 }).notNull().default("manual_review"),
  extractedUsernames: jsonb("extracted_usernames").notNull().default('[]'),
  matchedUsernames: jsonb("matched_usernames").notNull().default('[]'),
  unauthorizedUsernames: jsonb("unauthorized_usernames").notNull().default('[]'),
  missingCheckedInUsernames: jsonb("missing_checked_in_usernames").notNull().default('[]'),
  matchedCount: integer("matched_count").notNull().default(0),
  unauthorizedCount: integer("unauthorized_count").notNull().default(0),
  missingCheckedInCount: integer("missing_checked_in_count").notNull().default(0),
  confidence: integer("confidence").notNull().default(0),
  aiProvider: varchar("ai_provider", { length: 30 }),
  aiModel: varchar("ai_model", { length: 120 }),
  rawAiResponse: text("raw_ai_response"),
  operatorNote: text("operator_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  roomCreatedIdx: index("cod_room_lobby_checks_room_created_idx").on(table.roomId, table.createdAt),
  statusIdx: index("cod_room_lobby_checks_status_idx").on(table.status, table.createdAt),
}));

// Support Tickets
export const tickets = pgTable("tickets", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  subject: varchar("subject", { length: 255 }).notNull(),
  status: varchar("status", { length: 20 }).default("open"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ticketMessages = pgTable("ticket_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticketId: uuid("ticket_id").notNull().references(() => tickets.id),
  senderId: uuid("sender_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Rate limits
export const rateLimits = pgTable("rate_limits", {
  key: varchar("key", { length: 191 }).primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: timestamp("reset_at").notNull(),
}, (table) => ({
  resetAtIdx: index("rate_limits_reset_at_idx").on(table.resetAt),
}));

// Classified ads monitoring (Divar / Sheypoor)
export const classifiedAds = pgTable("classified_ads", {
  id: uuid("id").defaultRandom().primaryKey(),
  platform: varchar("platform", { length: 30 }).notNull(),
  externalId: varchar("external_id", { length: 255 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  url: text("url").notNull(),
  price: varchar("price", { length: 100 }),
  city: varchar("city", { length: 100 }),
  district: varchar("district", { length: 100 }),
  category: varchar("category", { length: 100 }),
  imageUrl: text("image_url"),
  keywords: jsonb("keywords").notNull().default('[]'),
  rawPayload: jsonb("raw_payload"),
  status: varchar("status", { length: 30 }).notNull().default("new"),
  contactedAt: timestamp("contacted_at"),
  contactMethod: varchar("contact_method", { length: 50 }),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  platformExternalIdUnique: index("classified_ads_platform_external_id_idx").on(table.platform, table.externalId),
  statusIdx: index("classified_ads_status_idx").on(table.status),
  platformIdx: index("classified_ads_platform_idx").on(table.platform),
  createdAtIdx: index("classified_ads_created_at_idx").on(table.createdAt),
  keywordsIdx: index("classified_ads_keywords_idx").on(table.keywords),
}));

export const classifiedScrapeLogs = pgTable("classified_scrape_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  platform: varchar("platform", { length: 30 }).notNull(),
  status: varchar("status", { length: 30 }).notNull(),
  itemsFound: integer("items_found").default(0).notNull(),
  itemsNew: integer("items_new").default(0).notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  createdAtIdx: index("classified_scrape_logs_created_at_idx").on(table.createdAt),
}));

// =========================================================================
// STORE / MARKETPLACE
// =========================================================================

// KYC profiles — required before a user can SELL on the marketplace.
export const kycProfiles = pgTable("kyc_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id).unique(),
  fullName: varchar("full_name", { length: 150 }).notNull(),
  nationalId: varchar("national_id", { length: 10 }).notNull(),
  birthDate: varchar("birth_date", { length: 10 }), // YYYY-MM-DD (Jalali or Gregorian as entered)
  // `text`, not varchar(500): with Cloudinary unconfigured the uploader returns
  // an inline base64 data URL, which overflowed the old cap and made every real
  // submission fail (migration 0041).
  idCardImageUrl: text("id_card_image_url").notNull(),
  // Legacy: seller verification no longer collects a selfie. Kept nullable so
  // historical submissions stay readable in the admin panel (migration 0040).
  selfieImageUrl: text("selfie_image_url"),
  status: kycStatusEnum("status").notNull().default("pending"),
  rejectionReason: text("rejection_reason"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: uniqueIndex("kyc_profiles_user_id_idx").on(table.userId),
  nationalIdIdx: index("kyc_profiles_national_id_idx").on(table.nationalId),
  statusIdx: index("kyc_profiles_status_idx").on(table.status),
}));

// Store listings — both official (platform-owned) and user (P2P) live here.
export const storeListings = pgTable("store_listings", {
  id: uuid("id").defaultRandom().primaryKey(),
  source: storeListingSourceEnum("source").notNull().default("user"),
  sellerId: uuid("seller_id").references(() => users.id), // null for official listings
  kind: storeItemKindEnum("kind").notNull(),
  game: gameEnum("game"), // optional: which game this relates to
  title: varchar("title", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 220 }),
  description: text("description"),
  // Price stored in RIAL (matches wallets/transactions precision pattern).
  priceRial: numeric("price_rial", { precision: 20, scale: 0 }).notNull(),
  // For currency packs: how much in-game currency this represents (e.g. "1000 gems").
  currencyKind: varchar("currency_kind", { length: 50 }), // gem | cp | uc | vbucks | ...
  currencyAmount: integer("currency_amount"),
  // Inventory. For unique account sales this is usually 1.
  stock: integer("stock").notNull().default(1),
  soldCount: integer("sold_count").notNull().default(0),
  images: jsonb("images").notNull().default('[]'),
  // Account-specific protected details revealed only after a completed order.
  deliveryNotes: text("delivery_notes"),
  // Warranty/guarantee window in days shown to buyers (0 = none).
  warrantyDays: integer("warranty_days").notNull().default(0),
  status: storeListingStatusEnum("status").notNull().default("pending_review"),
  rejectionReason: text("rejection_reason"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  // Promotion into the storefront hero carousel. Time-boxed via featuredUntil
  // so expiry is data rather than something a cron has to enforce.
  featuredStatus: storeFeaturedStatusEnum("featured_status").notNull().default("none"),
  featuredUntil: timestamp("featured_until"),
  featuredRank: integer("featured_rank").notNull().default(0),
  featuredRequestedAt: timestamp("featured_requested_at"),
  featuredReviewedAt: timestamp("featured_reviewed_at"),
  featuredReviewedBy: uuid("featured_reviewed_by").references(() => users.id),
  featuredRejectionReason: text("featured_rejection_reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  sellerIdx: index("store_listings_seller_idx").on(table.sellerId),
  sourceStatusIdx: index("store_listings_source_status_idx").on(table.source, table.status),
  kindIdx: index("store_listings_kind_idx").on(table.kind),
  statusCreatedIdx: index("store_listings_status_created_idx").on(table.status, table.createdAt),
}));

// Orders with escrow lifecycle.
export const storeOrders = pgTable("store_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  listingId: uuid("listing_id").notNull().references(() => storeListings.id),
  buyerId: uuid("buyer_id").notNull().references(() => users.id),
  sellerId: uuid("seller_id").references(() => users.id), // null when buying official goods
  source: storeListingSourceEnum("source").notNull(),
  quantity: integer("quantity").notNull().default(1),
  // Snapshot of pricing at purchase time.
  unitPriceRial: numeric("unit_price_rial", { precision: 20, scale: 0 }).notNull(),
  totalPriceRial: numeric("total_price_rial", { precision: 20, scale: 0 }).notNull(),
  platformFeeRial: numeric("platform_fee_rial", { precision: 20, scale: 0 }).notNull().default("0"),
  sellerPayoutRial: numeric("seller_payout_rial", { precision: 20, scale: 0 }).notNull().default("0"),
  status: storeOrderStatusEnum("status").notNull().default("pending_payment"),
  // Transaction references for auditing the escrow flow.
  holdTxId: uuid("hold_tx_id"),
  releaseTxId: uuid("release_tx_id"),
  refundTxId: uuid("refund_tx_id"),
  deliveredAt: timestamp("delivered_at"),
  deliveryDeadlineAt: timestamp("delivery_deadline_at"),
  autoReleaseAt: timestamp("auto_release_at"),
  completedAt: timestamp("completed_at"),
  buyerNote: text("buyer_note"),
  disputeReason: text("dispute_reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  buyerIdx: index("store_orders_buyer_idx").on(table.buyerId),
  sellerIdx: index("store_orders_seller_idx").on(table.sellerId),
  listingIdx: index("store_orders_listing_idx").on(table.listingId),
  statusIdx: index("store_orders_status_idx").on(table.status),
}));

// =========================================================================
// PRICE ESTIMATOR (admin-configurable per-game, per-field unit prices in RIAL)
// =========================================================================
export const priceEstimatorRates = pgTable("price_estimator_rates", {
  id: uuid("id").defaultRandom().primaryKey(),
  game: gameEnum("game").notNull(),
  // Field key, e.g. "level", "cp", "gun_legendary". Matches the field defs in lib.
  fieldKey: varchar("field_key", { length: 60 }).notNull(),
  // Unit price in RIAL per 1 unit of this field (multiplied by the entered count).
  unitPriceRial: numeric("unit_price_rial", { precision: 20, scale: 0 }).notNull().default("0"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  gameFieldUnique: uniqueIndex("price_estimator_rates_game_field_idx").on(table.game, table.fieldKey),
}));

// =========================================================================
// STORE: seller reviews & abuse reports (trust & safety)
// =========================================================================

// One review per completed order, left by the buyer about the seller.
export const sellerReviews = pgTable("seller_reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => storeOrders.id).unique(),
  sellerId: uuid("seller_id").notNull().references(() => users.id),
  buyerId: uuid("buyer_id").notNull().references(() => users.id),
  rating: integer("rating").notNull(), // 1..5
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  orderUnique: uniqueIndex("seller_reviews_order_idx").on(table.orderId),
  sellerIdx: index("seller_reviews_seller_idx").on(table.sellerId),
}));

// Abuse reports against a listing/seller/order, reviewed by admins.
export const storeReports = pgTable("store_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  reporterId: uuid("reporter_id").notNull().references(() => users.id),
  listingId: uuid("listing_id").references(() => storeListings.id),
  sellerId: uuid("seller_id").references(() => users.id),
  orderId: uuid("order_id").references(() => storeOrders.id),
  reason: varchar("reason", { length: 80 }).notNull(),
  details: text("details"),
  status: storeReportStatusEnum("status").notNull().default("open"),
  adminNote: text("admin_note"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("store_reports_status_idx").on(table.status),
  listingIdx: index("store_reports_listing_idx").on(table.listingId),
}));

// =========================================================================
// PRICE MEMORY (learning cache): remembers what similar accounts were valued /
// sold at, so future similar accounts get a fast, grounded estimate.
// =========================================================================
export const priceMemory = pgTable("price_memory", {
  id: uuid("id").defaultRandom().primaryKey(),
  game: gameEnum("game").notNull(),
  // Bucketed signature of the account (e.g. "lvl:300|cp:2000|gun_legendary_paid:3")
  // used to match similar accounts quickly.
  signature: varchar("signature", { length: 400 }).notNull(),
  // Raw stats snapshot for richer similarity / auditing.
  stats: jsonb("stats").notNull().default('{}'),
  priceToman: numeric("price_toman", { precision: 20, scale: 0 }).notNull(),
  // "sale" = real completed order (most trusted), "ai" = AI estimate.
  origin: varchar("origin", { length: 20 }).notNull().default("ai"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  gameSigIdx: index("price_memory_game_sig_idx").on(table.game, table.signature),
  gameOriginIdx: index("price_memory_game_origin_idx").on(table.game, table.origin),
}));

// =========================================================================
// STORE: price-negotiation offers
// A buyer proposes a price on a user listing; the seller accepts (which creates
// an escrow order at the agreed price) or rejects. Lets buyers haggle within
// the estimated price range instead of paying a fixed sticker price.
// =========================================================================
export const storeOffers = pgTable("store_offers", {
  id: uuid("id").defaultRandom().primaryKey(),
  listingId: uuid("listing_id").notNull().references(() => storeListings.id),
  buyerId: uuid("buyer_id").notNull().references(() => users.id),
  sellerId: uuid("seller_id").notNull().references(() => users.id),
  // Proposed unit price in RIAL (stored like all other money fields).
  offerPriceRial: numeric("offer_price_rial", { precision: 20, scale: 0 }).notNull(),
  // Snapshot of the listing's sticker price when the offer was made.
  listingPriceRial: numeric("listing_price_rial", { precision: 20, scale: 0 }).notNull(),
  message: text("message"),
  status: storeOfferStatusEnum("status").notNull().default("pending"),
  // Set when accepted: the escrow order that was created from this offer.
  orderId: uuid("order_id").references(() => storeOrders.id),
  respondedAt: timestamp("responded_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  listingIdx: index("store_offers_listing_idx").on(table.listingId),
  buyerIdx: index("store_offers_buyer_idx").on(table.buyerId),
  sellerStatusIdx: index("store_offers_seller_status_idx").on(table.sellerId, table.status),
}));
