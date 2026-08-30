import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Leveling Service - Manages XP and Rankings
 */
export const LevelingService = {
  /**
   * Add XP to a user and handle Level Ups
   */
  async addXP(tx: any, userId: string, xpAmount: number) {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!user) throw new Error("User not found");

    const newXP = (user.xp ?? 0) + xpAmount;
    
    // Formula: Level = Floor(sqrt(XP / 100)) + 1
    const newLevel = Math.floor(Math.sqrt(newXP / 100)) + 1;

    await tx.update(users)
      .set({ 
        xp: newXP, 
        level: newLevel
      })
      .where(eq(users.id, userId));

    if (newLevel > (user.level ?? 1)) {
      await tx.insert(notifications).values({
        userId,
        type: "level_up",
        title: "لول‌آپ شدی!",
        message: `تبریک! سطح شما از ${user.level ?? 1} به ${newLevel} رسید. مأموریت‌ها و رقابت‌های جدید را دنبال کن.`,
        link: "/achievements",
      });
    }

    return { xp: newXP, level: newLevel };
  },

  /**
   * Update Rank Points (Elo) after a Match
   */
  async updateRankPoints(tx: any, userId: string, pointsChange: number) {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!user) throw new Error("User not found");

    const newPoints = Math.max(0, (user.rankPoints ?? 1000) + pointsChange);

    await tx.update(users)
      .set({ rankPoints: newPoints })
      .where(eq(users.id, userId));

    return newPoints;
  }
};
