import type { Metadata } from "next";
import type { ReactNode } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tournaments } from "@/db/schema";
import { createPageMetadata, gameNamesFa } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;

  try {
    const [tournament] = await db
      .select({
        id: tournaments.id,
        name: tournaments.name,
        game: tournaments.game,
        status: tournaments.status,
        description: tournaments.description,
        prizePool: tournaments.prizePool,
        maxPlayers: tournaments.maxPlayers,
        bannerUrl: tournaments.bannerUrl,
      })
      .from(tournaments)
      .where(eq(tournaments.id, id))
      .limit(1);

    if (tournament) {
      const gameName = gameNamesFa[tournament.game] || tournament.game;
      const description =
        tournament.description?.slice(0, 155) ||
        `ثبت‌نام و مشاهده جزئیات تورنومنت ${tournament.name} در بازی ${gameName}؛ ظرفیت ${tournament.maxPlayers} بازیکن${tournament.prizePool ? ` و جایزه ${tournament.prizePool}` : ""}.`;

      return createPageMetadata({
        title: `${tournament.name} | تورنومنت ${gameName}`,
        description,
        path: `/tournaments/${id}`,
        image: tournament.bannerUrl || undefined,
        keywords: [tournament.name, `تورنومنت ${gameName}`, "ثبت نام مسابقه", "Flexa"],
      });
    }
  } catch {
    // Keep a safe fallback if database metadata is temporarily unavailable.
  }

  return createPageMetadata({
    title: "جزئیات تورنومنت",
    description: "مشاهده جزئیات تورنومنت، بازیکنان، قوانین، جوایز و ثبت‌نام در Flexa.",
    path: `/tournaments/${id}`,
  });
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
