import type { Metadata } from "next";
import type { ReactNode } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;

  try {
    const [team] = await db
      .select({
        id: teams.id,
        name: teams.name,
        tag: teams.tag,
        description: teams.description,
        logoUrl: teams.logoUrl,
      })
      .from(teams)
      .where(eq(teams.id, id))
      .limit(1);

    if (team) {
      return createPageMetadata({
        title: `${team.name} [${team.tag}] | تیم گیمینگ`,
        description: team.description?.slice(0, 155) || `پروفایل تیم ${team.name} با تگ ${team.tag} در Flexa؛ مشاهده اعضا و شرکت در رقابت‌های تیمی گیمینگ.`,
        path: `/teams/${id}`,
        image: team.logoUrl || undefined,
        keywords: [team.name, team.tag, "تیم گیمینگ", "تیم Flexa"],
      });
    }
  } catch {
    // Keep a safe fallback if database metadata is temporarily unavailable.
  }

  return createPageMetadata({
    title: "پروفایل تیم",
    description: "مشاهده پروفایل تیم گیمینگ، اعضا و اطلاعات تیم در Flexa.",
    path: `/teams/${id}`,
  });
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
