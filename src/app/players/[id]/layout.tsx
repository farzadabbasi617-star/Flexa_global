import type { Metadata } from "next";
import type { ReactNode } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { players } from "@/db/schema";
import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;

  try {
    const [player] = await db
      .select({
        id: players.id,
        username: players.username,
        displayName: players.displayName,
        rating: players.rating,
        wins: players.wins,
        losses: players.losses,
        avatarUrl: players.avatarUrl,
      })
      .from(players)
      .where(eq(players.id, id))
      .limit(1);

    if (player) {
      return createPageMetadata({
        title: `${player.displayName} | پروفایل بازیکن`,
        description: `پروفایل ${player.displayName} در Flexa؛ امتیاز ${player.rating}، ${player.wins} برد و ${player.losses} باخت در مسابقات گیمینگ آنلاین.`,
        path: `/players/${id}`,
        image: player.avatarUrl || undefined,
        keywords: [player.displayName, player.username, "پروفایل گیمر", "بازیکن Flexa"].filter(Boolean),
      });
    }
  } catch {
    // Keep a safe fallback if database metadata is temporarily unavailable.
  }

  return createPageMetadata({
    title: "پروفایل بازیکن",
    description: "مشاهده پروفایل بازیکن، آمار، رتبه و مسابقات اخیر در Flexa.",
    path: `/players/${id}`,
  });
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
