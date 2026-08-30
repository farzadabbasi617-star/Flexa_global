import { db } from "@/db";
import { achievements, notifications, players, registrations, transactions, userAchievements } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { LevelingService } from "@/lib/leveling-service";

export const DEFAULT_ACHIEVEMENTS = [
  { name: "First Win", nameFA: "اولین برد", description: "Win your first match", descriptionFA: "اولین مسابقه خود را ببرید", icon: "🏆", category: "wins", requirement: 1, points: 10 },
  { name: "5 Wins", nameFA: "۵ برد", description: "Win 5 matches", descriptionFA: "۵ مسابقه ببرید", icon: "⭐", category: "wins", requirement: 5, points: 25 },
  { name: "10 Wins", nameFA: "۱۰ برد", description: "Win 10 matches", descriptionFA: "۱۰ مسابقه ببرید", icon: "🌟", category: "wins", requirement: 10, points: 50 },
  { name: "25 Wins", nameFA: "۲۵ برد", description: "Win 25 matches", descriptionFA: "۲۵ مسابقه ببرید", icon: "💫", category: "wins", requirement: 25, points: 100 },
  { name: "First Tournament", nameFA: "اولین تورنومنت", description: "Join your first tournament", descriptionFA: "در اولین تورنومنت شرکت کنید", icon: "🎮", category: "tournaments", requirement: 1, points: 15 },
  { name: "Tournament Veteran", nameFA: "حاضر در ۱۰ تورنومنت", description: "Join 10 tournaments", descriptionFA: "در ۱۰ تورنومنت شرکت کنید", icon: "🛡️", category: "tournaments", requirement: 10, points: 80 },
  { name: "Tournament Champion", nameFA: "قهرمان تورنومنت", description: "Win a tournament prize", descriptionFA: "جایزه یک تورنومنت را دریافت کنید", icon: "👑", category: "tournaments", requirement: 1, points: 200 },
  { name: "Rating 1200", nameFA: "امتیاز ۱۲۰۰", description: "Reach 1200 rating", descriptionFA: "به امتیاز ۱۲۰۰ برسید", icon: "📈", category: "rating", requirement: 1200, points: 30 },
  { name: "Rating 1400", nameFA: "امتیاز ۱۴۰۰", description: "Reach 1400 rating", descriptionFA: "به امتیاز ۱۴۰۰ برسید", icon: "🚀", category: "rating", requirement: 1400, points: 75 },
  { name: "Rating 1600", nameFA: "امتیاز ۱۶۰۰", description: "Reach 1600 rating", descriptionFA: "به امتیاز ۱۶۰۰ برسید", icon: "💎", category: "rating", requirement: 1600, points: 150 },
  { name: "Wallet Ready", nameFA: "کیف پول آماده", description: "Make your first wallet deposit", descriptionFA: "اولین شارژ کیف پول را ثبت کنید", icon: "💳", category: "special", requirement: 1, points: 20 },
] as const;

async function ensureAchievements(tx: any = db) {
  const existing = await tx.select().from(achievements);
  if (existing.length > 0) return existing;
  return tx.insert(achievements).values([...DEFAULT_ACHIEVEMENTS]).returning();
}

async function getUserMetrics(tx: any, userId: string) {
  const userPlayers = await tx.select().from(players).where(eq(players.visibleUserId, userId));
  const totalWins = userPlayers.reduce((sum: number, p: typeof players.$inferSelect) => sum + p.wins, 0);
  const maxRating = userPlayers.reduce((max: number, p: typeof players.$inferSelect) => Math.max(max, p.rating), 0);

  const [{ value: tournamentCount }] = await tx
    .select({ value: sql<number>`count(*)` })
    .from(registrations)
    .where(eq(registrations.visibleUserId, userId));

  const [{ value: championCount }] = await tx
    .select({ value: sql<number>`count(*)` })
    .from(transactions)
    .where(sql`${transactions.type} = 'tournament_win' AND ${transactions.status} = 'completed' AND ${transactions.metadata}->>'userId' = ${userId}`);

  const [{ value: depositCount }] = await tx
    .select({ value: sql<number>`count(*)` })
    .from(transactions)
    .where(sql`${transactions.type} = 'deposit' AND ${transactions.status} = 'completed' AND ${transactions.metadata}->>'userId' = ${userId}`);

  return {
    wins: totalWins,
    tournaments: Number(tournamentCount || 0),
    rating: maxRating,
    champion: Number(championCount || 0),
    deposit: Number(depositCount || 0),
  };
}

function progressFor(category: string, metrics: Awaited<ReturnType<typeof getUserMetrics>>) {
  if (category === "wins") return metrics.wins;
  if (category === "tournaments") return metrics.tournaments;
  if (category === "rating") return metrics.rating;
  if (category === "special") return Math.max(metrics.deposit, 0);
  return 0;
}

function isUnlockedBy(achievement: typeof achievements.$inferSelect, metrics: Awaited<ReturnType<typeof getUserMetrics>>) {
  if (achievement.name === "Tournament Champion") return metrics.champion >= achievement.requirement;
  if (achievement.name === "Wallet Ready") return metrics.deposit >= achievement.requirement;
  return progressFor(achievement.category, metrics) >= achievement.requirement;
}

export async function evaluateUserAchievements(userId: string, tx: any = db) {
  const all = await ensureAchievements(tx);
  const metrics = await getUserMetrics(tx, userId);
  const unlockedRows = await tx.select().from(userAchievements).where(eq(userAchievements.visibleUserId, userId));
  const unlocked = new Set(unlockedRows.map((row: typeof userAchievements.$inferSelect) => row.achievementId));
  const newlyUnlocked: Array<typeof achievements.$inferSelect> = [];

  for (const achievement of all) {
    if (unlocked.has(achievement.id)) continue;
    if (!isUnlockedBy(achievement, metrics)) continue;

    await tx.insert(userAchievements).values({ visibleUserId: userId, achievementId: achievement.id });
    await LevelingService.addXP(tx, userId, achievement.points);
    await tx.insert(notifications).values({
      userId,
      type: "achievement",
      title: `دستاورد جدید: ${achievement.nameFA}`,
      message: `${achievement.descriptionFA} • +${achievement.points} XP`,
      link: "/achievements",
    });
    newlyUnlocked.push(achievement);
  }

  return { metrics, newlyUnlocked };
}

export async function achievementProgressForUser(userId: string | null) {
  const all = await ensureAchievements(db);
  if (!userId) {
    return all.map((achievement: typeof achievements.$inferSelect) => ({
      ...achievement,
      unlocked: false,
      progress: 0,
      progressPercent: 0,
    }));
  }

  const metrics = await getUserMetrics(db, userId);
  const unlockedRows = await db.select().from(userAchievements).where(eq(userAchievements.visibleUserId, userId));
  const unlocked = new Set(unlockedRows.map((row) => row.achievementId));

  return all.map((achievement: typeof achievements.$inferSelect) => {
    const progress = achievement.name === "Tournament Champion"
      ? metrics.champion
      : achievement.name === "Wallet Ready"
      ? metrics.deposit
      : progressFor(achievement.category, metrics);
    return {
      ...achievement,
      unlocked: unlocked.has(achievement.id),
      progress,
      progressPercent: Math.min(100, Math.round((progress / Math.max(achievement.requirement, 1)) * 100)),
    };
  });
}
