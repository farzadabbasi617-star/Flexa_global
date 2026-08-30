import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { judges } from "@/db/schema";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";


export async function GET() {
  try {
    const allJudges = await db.select().from(judges);
    return NextResponse.json(allJudges);
  } catch {
    return NextResponse.json({ error: "Failed to fetch judges" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Only admins may add judges.
  const auth = await requireRole(request, ["admin", "super_admin"]);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const body = await request.json();
    const { name, email, role } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const [judge] = await db
      .insert(judges)
      .values({
        name,
        email: email || null,
        role: role || "judge",
      })
      .returning();

    return NextResponse.json(judge, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create judge" }, { status: 500 });
  }
}
