import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { notifications, telegramSentNotifications, users } from "@/db/schema";

export async function notifyUsersInApp(input: {
  userIds: string[];
  type: string;
  title: string;
  message: string;
  link?: string | null;
  dedupeKey?: string | null;
}) {
  const userIds = [...new Set(input.userIds.filter(Boolean))];
  if (!userIds.length) return { inserted: 0, skipped: true };

  if (input.dedupeKey) {
    const [created] = await db.insert(telegramSentNotifications).values({
      dedupeKey: input.dedupeKey,
      type: `app_${input.type}`.slice(0, 40),
      tournamentId: null,
      telegramId: null,
    }).onConflictDoNothing({ target: telegramSentNotifications.dedupeKey }).returning({ id: telegramSentNotifications.id });
    if (!created) return { inserted: 0, skipped: true };
  }

  const rows = userIds.map((userId) => ({
    userId,
    type: input.type.slice(0, 50),
    title: input.title.slice(0, 255),
    message: input.message,
    link: input.link || null,
  }));

  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    await db.insert(notifications).values(chunk);
    inserted += chunk.length;
  }
  return { inserted, skipped: false };
}

export async function notifyAllUsersInApp(input: {
  type: string;
  title: string;
  message: string;
  link?: string | null;
  dedupeKey?: string | null;
}) {
  const allUsers = await db.select({ id: users.id }).from(users);
  return notifyUsersInApp({ ...input, userIds: allUsers.map((user) => user.id) });
}

export async function hasAppNotification(userId: string, type: string, link?: string | null) {
  const conditions = [eq(notifications.userId, userId), eq(notifications.type, type)];
  if (link) conditions.push(eq(notifications.link, link));
  const [row] = await db.select({ id: notifications.id }).from(notifications).where(and(...conditions)).limit(1);
  return Boolean(row);
}

export async function notifyUsersByQueryInApp(userIds: string[], input: {
  type: string;
  title: string;
  message: string;
  link?: string | null;
}) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return { inserted: 0 };
  const existing = input.link
    ? await db.select({ userId: notifications.userId }).from(notifications).where(and(
        inArray(notifications.userId, unique),
        eq(notifications.type, input.type),
        eq(notifications.link, input.link),
      ))
    : [];
  const existingSet = new Set(existing.map((row) => row.userId));
  return notifyUsersInApp({ ...input, userIds: unique.filter((id) => !existingSet.has(id)) });
}
