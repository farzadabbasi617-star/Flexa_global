import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { db } from "@/db";
import { tournaments } from "@/db/schema";
import { createPageMetadata, SITE_URL } from "@/lib/seo";
import { getTournamentPage, pseoTournamentPages, pseoLinksForGame } from "@/lib/pseo-content";

export const revalidate = 120;

export function generateStaticParams() {
  return pseoTournamentPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = getTournamentPage(slug);
  if (!page) return createPageMetadata({ title: "تورنومنت‌های Flexa", description: "مسابقات آنلاین Flexa", path: "/tournaments" });
  return createPageMetadata({
    title: page.metaTitle,
    description: page.metaDescription,
    path: `/tournament/${page.slug}`,
    keywords: [page.keyword, "مسابقات آنلاین", "تورنومنت با جایزه"],
  });
}

function faDate(value: Date | string | null): string {
  if (!value) return "به‌زودی";
  try {
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "long" }).format(new Date(value));
  } catch {
    return "به‌زودی";
  }
}

const gameLabels: Record<string, string> = {
  clash_royale: "کلش رویال",
  cod_mobile: "کالاف دیوتی موبایل",
  fortnite: "فورتنایت",
};

async function openTournaments(slug: string, game?: string) {
  try {
    const conditions = [
      or(eq(tournaments.status, "registration"), eq(tournaments.status, "in_progress")),
    ] as ReturnType<typeof eq>[];
    if (game) {
      conditions.push(eq(tournaments.game, game as "clash_royale" | "cod_mobile" | "fortnite"));
    } else if (slug === "free") {
      // هاب «رایگان»: فقط مسابقات بدون هزینه ورود
      conditions.push(or(ilike(tournaments.entryFee, "%رایگان%"), eq(tournaments.entryFee, "0"))!);
    }
    return await db
      .select({
        id: tournaments.id,
        name: tournaments.name,
        game: tournaments.game,
        entryFee: tournaments.entryFee,
        prizePool: tournaments.prizePool,
        startDate: tournaments.startDate,
        maxPlayers: tournaments.maxPlayers,
      })
      .from(tournaments)
      .where(and(...conditions))
      .orderBy(desc(tournaments.startDate))
      .limit(10);
  } catch {
    return [];
  }
}

export default async function TournamentHubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getTournamentPage(slug);
  if (!page) return null;

  const open = await openTournaments(page.slug, page.game);
  const pageUrl = `${SITE_URL}/tournament/${page.slug}`;
  const registrationUrl = page.game === "cod_mobile" ? "/cod-arena" : "/tournaments";

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Flexa", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "تورنومنت‌ها", item: `${SITE_URL}/tournaments` },
      { "@type": "ListItem", position: 3, name: page.keyword, item: pageUrl },
    ],
  };
  const itemListJsonLd = open.length
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        itemListElement: open.map((t, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `${SITE_URL}/tournaments/${t.id}`,
          name: t.name,
        })),
      }
    : null;

  const relatedLinks = page.game ? pseoLinksForGame(page.game) : [];

  return (
    <div className="min-h-screen bg-[#050508] text-white overflow-x-hidden">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      {itemListJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />}
      <Navbar />

      <main className="pb-28">
        <section className="relative overflow-hidden bg-gradient-to-br from-[#0b0618] to-[#050508] border-b border-white/5">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_15%_20%,rgba(59,130,246,.4),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(168,85,247,.35),transparent_28%)]" />
          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16" dir="rtl">
            <nav aria-label="مسیر صفحه" className="text-xs text-gray-400 mb-4">
              <Link href="/tournaments" className="hover:text-purple-300">تورنومنت‌ها</Link>
              <span className="mx-2">›</span>
              <span className="text-gray-300">{page.keyword}</span>
            </nav>
            <h1 className="text-3xl sm:text-4xl font-black leading-tight mb-5">{page.h1}</h1>
            {page.intro.map((paragraph, index) => (
              <p key={index} className="text-base sm:text-lg text-gray-200 leading-9 mb-4">{paragraph}</p>
            ))}
            <div className="flex flex-wrap gap-3 mt-6">
              <Link href={registrationUrl} className="gaming-btn bg-gradient-to-r from-cyan-600 to-blue-600">
                مسابقات فعال را ببین
              </Link>
              <Link href="/guide/tournaments" className="px-5 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-bold hover:bg-white/10 transition">
                راهنمای ثبت‌نام
              </Link>
            </div>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10" dir="rtl">
          <h2 className="text-xl font-black text-purple-300 mb-5">
            {open.length ? `مسابقات باز (${open.length.toLocaleString("fa-IR")})` : "مسابقات باز"}
          </h2>
          {open.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              {open.map((t) => (
                <Link key={t.id} href={`/tournaments/${t.id}`} className="gaming-card p-5 rounded-2xl border border-white/5 hover:border-cyan-500/30 transition block">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <h3 className="font-black text-sm sm:text-base">{t.name}</h3>
                    <span className="text-[11px] font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-3 py-1 whitespace-nowrap">
                      {t.entryFee || "رایگان"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 mt-2">
                    {t.prizePool ? <span>🏆 جایزه: {t.prizePool}</span> : null}
                    <span>🎮 {gameLabels[t.game] || t.game}</span>
                    {t.startDate ? <span>📅 {faDate(t.startDate)}</span> : null}
                    {t.maxPlayers ? <span>👥 ظرفیت {t.maxPlayers.toLocaleString("fa-IR")}</span> : null}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="gaming-card p-6 rounded-2xl border border-white/5 mb-4">
              <p className="text-sm text-gray-300 leading-8">
                همین حالا مسابقهٔ بازی خودت باز نیست، اما تورنومنت‌های Flexa به‌صورت منظم برگزار می‌شوند و این صفحه به‌صورت خودکار به‌روز می‌ماند.
                صفحهٔ تورنومنت‌ها را چک کن تا اولین مسابقهٔ بعدی را از دست ندهی.
              </p>
              <div className="flex flex-wrap gap-3 mt-5">
                <Link href="/tournaments" className="gaming-btn bg-gradient-to-r from-cyan-600 to-blue-600">همهٔ تورنومنت‌ها</Link>
                <Link href="/guide/tournaments" className="px-5 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-bold">راهنمای ثبت‌نام</Link>
              </div>
            </div>
          )}
        </section>

        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-6" dir="rtl">
          <div className="grid grid-cols-1 gap-5">
            {page.sections.map((section) => (
              <article key={section.h2} className="gaming-card p-6 rounded-3xl border border-white/5 text-right">
                <h2 className="text-xl font-black text-purple-300 mb-4">{section.h2}</h2>
                {section.paragraphs.map((paragraph, index) => (
                  <p key={index} className="text-sm leading-8 text-gray-300 mb-3">{paragraph}</p>
                ))}
              </article>
            ))}
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10" dir="rtl">
          <h2 className="text-xl font-black mb-5">سوالات پرتکرار</h2>
          <div className="space-y-3">
            {page.faqs.map((faq) => (
              <details key={faq.q} className="gaming-card rounded-2xl p-5 border border-white/5 group">
                <summary className="font-black text-white cursor-pointer list-none flex items-center justify-between gap-3">
                  {faq.q}
                  <span className="text-purple-300 group-open:rotate-45 transition text-lg leading-none">+</span>
                </summary>
                <p className="text-sm text-gray-300 leading-8 mt-3">{faq.a}</p>
              </details>
            ))}
          </div>
        </section>

        {relatedLinks.length > 0 && (
          <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-10" dir="rtl">
            <div className="gaming-card rounded-3xl p-6 border border-cyan-500/20">
              <h2 className="text-lg font-black mb-4">صفحات مرتبط</h2>
              <div className="flex flex-wrap gap-3">
                {relatedLinks.map((link) => (
                  <Link key={link.href} href={link.href} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm font-bold hover:bg-white/10 transition">
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
