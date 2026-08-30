import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { notifications, ticketMessages, tickets, users } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { validateSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

function clientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
}

async function requireCurrentUser(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") || "unknown";
  const user = await validateSession(token || "", ip, ua, request);
  return user;
}

async function notifyAdmins(ticketId: string, subject: string, message: string) {
  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.role, ["admin", "super_admin"]));

  if (admins.length === 0) return;

  await db.insert(notifications).values(
    admins.map((admin) => ({
      userId: admin.id,
      type: "support",
      title: "تیکت پشتیبانی جدید",
      message: `${subject}: ${message.slice(0, 140)}`,
      link: `/admin/support?ticketId=${ticketId}`,
    }))
  );
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireCurrentUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ticketId = request.nextUrl.searchParams.get("ticketId");

    const userTickets = await db
      .select()
      .from(tickets)
      .where(eq(tickets.userId, user.id))
      .orderBy(desc(tickets.createdAt));

    if (!ticketId) {
      return NextResponse.json({ tickets: userTickets, messages: [] });
    }

    const ticket = userTickets.find((t) => t.id === ticketId);
    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

    const messages = await db
      .select({
        id: ticketMessages.id,
        ticketId: ticketMessages.ticketId,
        senderId: ticketMessages.senderId,
        senderName: users.displayName,
        senderRole: users.role,
        message: ticketMessages.message,
        createdAt: ticketMessages.createdAt,
      })
      .from(ticketMessages)
      .leftJoin(users, eq(ticketMessages.senderId, users.id))
      .where(eq(ticketMessages.ticketId, ticketId))
      .orderBy(ticketMessages.createdAt);

    return NextResponse.json({ tickets: userTickets, ticket, messages });
  } catch (err) {
    logger.error({ err }, "Support GET failed");
    return NextResponse.json({ error: "پشتیبانی بارگذاری نشد" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser(request);
    if (!user) return NextResponse.json({ error: "برای ارسال تیکت باید وارد حساب شوی." }, { status: 401 });

    const limit = await rateLimit(`support:${user.id}:${clientIp(request)}`, 8, 60 * 1000);
    if (!limit.success) return NextResponse.json({ error: "تعداد پیام‌های پشتیبانی زیاد است. کمی بعد تلاش کن." }, { status: 429 });

    const body = await request.json();
    const ticketId = body.ticketId ? String(body.ticketId) : "";
    const subject = String(body.subject || "").trim().slice(0, 255);
    const message = String(body.message || "").trim().slice(0, 3000);
    const category = String(body.category || "عمومی").trim().slice(0, 80);

    if (!message) return NextResponse.json({ error: "متن پیام الزامی است" }, { status: 400 });

    if (ticketId) {
      const [ticket] = await db
        .select()
        .from(tickets)
        .where(and(eq(tickets.id, ticketId), eq(tickets.userId, user.id)))
        .limit(1);

      if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
      if (ticket.status === "closed") return NextResponse.json({ error: "این تیکت بسته شده است." }, { status: 409 });

      const [created] = await db.transaction(async (tx) => {
        const [msg] = await tx.insert(ticketMessages).values({ ticketId, senderId: user.id, message }).returning();
        await tx.update(tickets).set({ status: "open" }).where(eq(tickets.id, ticketId));
        return [msg];
      });

      await notifyAdmins(ticketId, ticket.subject, message).catch(() => undefined);
      return NextResponse.json({ message: created }, { status: 201 });
    }

    if (!subject) return NextResponse.json({ error: "موضوع تیکت الزامی است" }, { status: 400 });

    const result = await db.transaction(async (tx) => {
      const [ticket] = await tx
        .insert(tickets)
        .values({ userId: user.id, subject: `[${category}] ${subject}`, status: "open" })
        .returning();

      const [msg] = await tx.insert(ticketMessages).values({ ticketId: ticket.id, senderId: user.id, message }).returning();
      return { ticket, message: msg };
    });

    await notifyAdmins(result.ticket.id, result.ticket.subject, message).catch(() => undefined);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    logger.error({ err }, "Support POST failed");
    return NextResponse.json({ error: "ارسال پیام پشتیبانی انجام نشد" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireCurrentUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const ticketId = String(body.ticketId || "");
    const status = String(body.status || "closed");
    if (!ticketId) return NextResponse.json({ error: "ticketId required" }, { status: 400 });
    if (!["closed", "resolved", "open"].includes(status)) return NextResponse.json({ error: "status invalid" }, { status: 400 });

    const [updated] = await db
      .update(tickets)
      .set({ status })
      .where(and(eq(tickets.id, ticketId), eq(tickets.userId, user.id)))
      .returning();

    if (!updated) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    logger.error({ err }, "Support PATCH failed");
    return NextResponse.json({ error: "تغییر وضعیت تیکت انجام نشد" }, { status: 500 });
  }
}
