import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { codRoomAuditEvents, codRoomEntries, codRoomLobbyChecks, codRooms } from "@/db/schema";
import { ensureCodArenaSchema } from "@/lib/cod-room-service";

/**
 * Advances scheduled COD rooms without exposing credentials or settling money.
 * Every transition and no-show mutation is written to the immutable room audit.
 */
export async function advanceCodRoomLifecycle(now = new Date()) {
  await ensureCodArenaSchema();
  const candidates = await db.select().from(codRooms).where(and(
    eq(codRooms.isPublished, true),
    inArray(codRooms.status, ["registration", "check_in", "lobby_open"]),
  ));
  let transitioned = 0;
  let noShows = 0;
  for (const candidate of candidates) {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM cod_rooms WHERE id=${candidate.id} FOR UPDATE`);
      const [room] = await tx.select().from(codRooms).where(eq(codRooms.id, candidate.id)).limit(1);
      if (!room) return { transitioned: 0, noShows: 0 };
      let next = room.status;
      if (room.status === "registration" && room.checkInOpensAt && room.checkInOpensAt <= now) next = "check_in";
      if (["registration", "check_in"].includes(room.status) && room.credentialsRevealAt && room.credentialsRevealAt <= now) next = "lobby_open";
      if (["registration", "check_in", "lobby_open"].includes(room.status) && room.startsAt <= now) {
        const [latestLobbyCheck] = await tx.select({ id: codRoomLobbyChecks.id, status: codRoomLobbyChecks.status })
          .from(codRoomLobbyChecks)
          .where(eq(codRoomLobbyChecks.roomId, room.id))
          .orderBy(desc(codRoomLobbyChecks.createdAt))
          .limit(1);
        if (latestLobbyCheck?.status === "verified") next = "in_progress";
        else if (["registration", "check_in"].includes(room.status)) next = "lobby_open";
      }
      let marked = 0;
      if (room.checkInClosesAt && room.checkInClosesAt <= now) {
        const absent = await tx.update(codRoomEntries).set({ status: "no_show", resultStatus: "no_show", updatedAt: now })
          .where(and(eq(codRoomEntries.roomId, room.id), eq(codRoomEntries.status, "registered"), isNull(codRoomEntries.checkedInAt)))
          .returning({ id: codRoomEntries.id });
        marked = absent.length;
        if (marked > 0) await tx.insert(codRoomAuditEvents).values({ roomId: room.id, actorId: null, eventType: "no_shows_marked", payload: { count: marked, at: now.toISOString() } });
      }
      if (next !== room.status) {
        await tx.update(codRooms).set({ status: next, updatedAt: now }).where(eq(codRooms.id, room.id));
        await tx.insert(codRoomAuditEvents).values({ roomId: room.id, actorId: null, eventType: "status_auto_advanced", payload: { from: room.status, to: next, at: now.toISOString() } });
      }
      return { transitioned: next === room.status ? 0 : 1, noShows: marked };
    });
    transitioned += result.transitioned;
    noShows += result.noShows;
  }
  return { checked: candidates.length, transitioned, noShows };
}
