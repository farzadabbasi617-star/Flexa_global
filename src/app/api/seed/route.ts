import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tournaments, players, registrations, users } from "@/db/schema";
import { validateAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { user, error, status } = await validateAdmin(request);
  if (!user) {
    return NextResponse.json({ error: error || "Unauthorized" }, { status: status || 401 });
  }

  try {
    const userNames = ["ShadowStrike", "BlazeFury", "FrostByte"];

    // 1. Create Users
    const sampleUsers = await db
      .insert(users)
      .values(userNames.map((name, i) => ({
        username: name.toLowerCase() + i,
        email: `${name.toLowerCase()}${i}@example.com`,
        passwordHash: "hashed_password",
        displayName: name,
        phoneNumber: `09${Math.floor(100000000 + Math.random() * 900000000)}`,
        flexaId: `FLX-S-${i}-${Math.floor(Math.random() * 1000)}`,
        // Seed users are demo data (not real signups) and this password
        // hash isn't even a valid one for login, so mark them pre-verified
        // to keep them usable for tournament fixtures/testing.
        emailVerifiedAt: new Date(),
      })))
      .returning();

    // 2. Create Players
    const samplePlayers = await db
      .insert(players)
      .values(sampleUsers.map(u => ({
        visibleUserId: u.id,
        username: u.username!,
        displayName: u.displayName,
        rating: 1200,
      })))
      .returning();

    // 3. Create Tournaments (Fixed Enums)
    const sampleTournaments = await db
      .insert(tournaments)
      .values([
        {
          name: "Clash Royale Cup",
          game: "clash_royale" as "clash_royale" | "cod_mobile" | "fortnite",
          format: "single_elimination" as "single_elimination" | "double_elimination" | "round_robin",
          status: "registration" as "registration" | "in_progress" | "completed" | "cancelled",
          maxPlayers: 16,
          prizePool: "5,000,000",
          winnersCount: 30,
          categoryLabel: "صد نفره",
          entryFee: "50,000",
        },
        {
          name: "COD Mobile League",
          game: "cod_mobile" as "clash_royale" | "cod_mobile" | "fortnite",
          format: "single_elimination" as "single_elimination" | "double_elimination" | "round_robin",
          status: "registration" as "registration" | "in_progress" | "completed" | "cancelled",
          maxPlayers: 32,
          prizePool: "10,000,000",
          winnersCount: 10,
          categoryLabel: "کیلی",
          entryFee: "100,000",
        }
      ])
      .returning();

    return NextResponse.json({ message: "Seed successful" });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Seed failed" }, { status: 500 });
  }
}
