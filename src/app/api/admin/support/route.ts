import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ticketMessages, tickets, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import { notifyLinkedUserOnTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "support");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const ticketId = request.nextUrl.searchParams.get("ticketId");
    if (ticketId) {
      const messages = await db
        .select({ id: ticketMessages.id, ticketId: ticketMessages.ticketId, senderId: ticketMessages.senderId, senderName: users.displayName, message: ticketMessages.message, createdAt: ticketMessages.createdAt })
        .from(ticketMessages)
        .leftJoin(users, eq(ticketMessages.senderId, users.id))
        .where(eq(ticketMessages.ticketId, ticketId))
        .orderBy(ticketMessages.createdAt);
      return NextResponse.json({ messages });
    }

    const rows = await db
      .select({ id: tickets.id, userId: tickets.userId, subject: tickets.subject, status: tickets.status, createdAt: tickets.createdAt, displayName: users.displayName, username: users.username, phoneNumber: users.phoneNumber })
      .from(tickets)
      .leftJoin(users, eq(tickets.userId, users.id))
      .orderBy(desc(tickets.createdAt))
      .limit(300);
    return NextResponse.json({ tickets: rows });
  } catch {
    return NextResponse.json({ error: "Failed to load support" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "support");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json();
    const ticketId = String(body.ticketId || "");
    const message = String(body.message || "").trim();
    const status = body.status ? String(body.status) : undefined;
    if (!ticketId || !message) return NextResponse.json({ error: "ticketId and message required" }, { status: 400 });
    const [ticket] = await db.select({ userId: tickets.userId, subject: tickets.subject }).from(tickets).where(eq(tickets.id, ticketId)).limit(1);
    const [created] = await db.insert(ticketMessages).values({ ticketId, senderId: auth.user.id, message }).returning();
    if (status) await db.update(tickets).set({ status }).where(eq(tickets.id, ticketId));
    if (ticket?.userId) {
      await notifyLinkedUserOnTelegram(
        ticket.userId,
        `🎧 <b>پاسخ پشتیبانی Flexa</b>

موضوع: <b>${ticket.subject}</b>

${message.slice(0, 900)}${status ? `

وضعیت تیکت: <b>${status}</b>` : ""}`,
        { inline_keyboard: [[{ text: "مشاهده تیکت", url: `${process.env.APP_URL || "https://www.flexa1.ir"}/support?ticketId=${ticketId}` }]] }
      ).catch(() => undefined);
    }
    await logAdminAction({ adminId: auth.user.id, action: "reply", entityType: "ticket", entityId: ticketId, metadata: { status }, ipAddress: getClientIp(request.headers) });
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to reply" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "support");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json();
    const id = String(body.id || "");
    const status = String(body.status || "open");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const [updated] = await db.update(tickets).set({ status }).where(eq(tickets.id, id)).returning();
    await logAdminAction({ adminId: auth.user.id, action: "update_status", entityType: "ticket", entityId: id, metadata: { status }, ipAddress: getClientIp(request.headers) });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
