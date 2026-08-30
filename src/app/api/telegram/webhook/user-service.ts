import { eq } from "drizzle-orm";
import { db } from "@/db";
import { telegramAccounts, users } from "@/db/schema";

export async function getLinkedUserByTelegram(telegramId: string) {
  const [row] = await db
    .select({
      userId: telegramAccounts.userId,
      flexaId: users.flexaId,
      displayName: users.displayName,
      username: users.username,
      role: users.role,
      level: users.level,
      rankPoints: users.rankPoints,
      clashRoyaleId: users.clashRoyaleId,
      clashRoyaleUsername: users.clashRoyaleUsername,
      clashRoyaleStatus: users.clashRoyaleStatus,
    })
    .from(telegramAccounts)
    .leftJoin(users, eq(telegramAccounts.userId, users.id))
    .where(eq(telegramAccounts.telegramId, telegramId))
    .limit(1);
  return row || null;
}
