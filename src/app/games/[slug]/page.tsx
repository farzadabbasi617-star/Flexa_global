import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { createPageMetadata, SITE_URL } from "@/lib/seo";
import { gameLandings, getGameLanding } from "@/lib/game-landing";
import { pseoLinksForGame } from "@/lib/pseo-content";

export function generateStaticParams() {
  return gameLandings.map((game) => ({ slug: game.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const game = getGameLanding(slug);

  if (!game) {
    return createPageMetadata({
      title: "مسابقات گیمینگ",
      description: "مشاهده تورنومنت‌ها و مسابقات آنلاین در Flexa.",
      path: "/games",
    });
  }

  return createPageMetadata({
    title: game.metaTitle,
    description: game.description,
    path: `/games/${game.slug}`,
    image: game.icon,
    keywords: game.keywords,
  });
}

export default async function GameLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = getGameLanding(slug);

  if (!game) notFound();

  const tournamentUrl = game.gameId === "cod_mobile" ? "/cod-arena" : `/tournaments?game=${game.gameId}`;
  const pageUrl = `${SITE_URL}/games/${game.slug}`;
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: game.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Flexa", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "مسابقات", item: `${SITE_URL}/tournaments` },
      { "@type": "ListItem", position: 3, name: game.title, item: pageUrl },
    ],
  };

  return (
    <div className="min-h-screen bg-[#050508] text-white overflow-x-hidden">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <Navbar />

      <main className="pb-28">
        <section className={`relative overflow-hidden bg-gradient-to-br ${game.heroGradient}`}>
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.35),transparent_25%),radial-gradient(circle_at_80%_10%,rgba(168,85,247,.4),transparent_28%)]" />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-20" dir="rtl">
            <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_.8fr] gap-10 items-center">
              <div className="text-right">
                <Link href="/tournaments" className="inline-flex items-center gap-2 text-xs font-black text-purple-200 bg-white/5 border border-white/10 rounded-full px-4 py-2 mb-5">
                  همه تورنومنت‌ها ←
                </Link>
                <h1 className="text-3xl sm:text-5xl font-black leading-tight mb-5">
                  {game.title}
                </h1>
                <p className="text-base sm:text-lg text-gray-200 leading-8 max-w-3xl">
                  {game.shortDescription}
                </p>
                <div className="flex flex-wrap gap-3 mt-8">
                  <Link href={tournamentUrl} className={`gaming-btn bg-gradient-to-r ${game.accent}`}>
                    مشاهده مسابقات فعال
                  </Link>
                  <Link href="/guide/tournaments" className="px-5 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-bold hover:bg-white/10 transition">
                    راهنمای ثبت‌نام
                  </Link>
                </div>
              </div>

              <div className="relative mx-auto w-56 h-56 sm:w-72 sm:h-72 rounded-[3rem] bg-white/5 border border-white/10 grid place-items-center shadow-[0_0_80px_rgba(168,85,247,.2)]">
                <div className={`absolute inset-6 rounded-[2.5rem] bg-gradient-to-br ${game.accent} opacity-20 blur-2xl`} />
                <img src={game.icon} alt={game.title} className="relative w-36 h-36 sm:w-44 sm:h-44 object-contain drop-shadow-[0_0_28px_rgba(255,255,255,.18)]" loading="lazy" decoding="async" />
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12" dir="rtl">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-12">
            {game.sections.map((section) => (
              <article key={section.heading} className="gaming-card p-6 rounded-3xl text-right border border-white/5">
                <h2 className="text-xl font-black text-purple-300 mb-4">{section.heading}</h2>
                <p className="text-sm leading-8 text-gray-300">{section.body}</p>
              </article>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[.9fr_1.1fr] gap-6 items-start">
            <aside className="gaming-card p-6 rounded-3xl border border-white/5 text-right">
              <h2 className="text-xl font-black mb-4">مسیر سریع شرکت در مسابقه</h2>
              <ol className="space-y-4 text-sm text-gray-300 leading-7 list-decimal list-inside">
                <li>صفحه تورنومنت‌های فعال را باز کن.</li>
                <li>بازی مورد نظر را انتخاب کن و ظرفیت/جایزه را بررسی کن.</li>
                <li>قوانین مسابقه را بخوان و در صورت مناسب بودن ثبت‌نام کن.</li>
                <li>در زمان اعلام‌شده وارد لابی شو و نتیجه را ثبت کن.</li>
              </ol>
              <Link href={tournamentUrl} className="gaming-btn mt-6 w-full justify-center text-center block">
                رفتن به لیست مسابقات
              </Link>
            </aside>

            <section className="gaming-card p-6 rounded-3xl border border-white/5 text-right">
              <h2 className="text-xl font-black mb-5">سوالات پرتکرار</h2>
              <div className="space-y-4">
                {game.faqs.map((faq) => (
                  <article key={faq.question} className="bg-dark-700/70 rounded-2xl p-5 border border-white/5">
                    <h3 className="font-black text-white mb-2">{faq.question}</h3>
                    <p className="text-sm text-gray-300 leading-7">{faq.answer}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <section className="mt-12 gaming-card rounded-3xl p-6 sm:p-8 text-right border border-purple-500/20">
            <h2 className="text-2xl font-black mb-3">برای رقابت آماده‌ای؟</h2>
            <p className="text-gray-300 leading-8 mb-6">
              اگر می‌خواهی در یک فضای رقابتی، منظم و قابل پیگیری بازی کنی، تورنومنت‌های فعال را ببین و اولین مسابقه مناسب خودت را انتخاب کن.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href={tournamentUrl} className={`gaming-btn bg-gradient-to-r ${game.accent}`}>
                مشاهده {game.title}
              </Link>
              <Link href="/leaderboard" className="px-5 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-bold">
                دیدن رتبه‌بندی بازیکنان
              </Link>
            </div>

            {/* حلقهٔ لینک‌سازی داخلی صفحات Programmatic SEO */}
            <div className="flex flex-wrap gap-2 mt-5">
              {pseoLinksForGame(game.gameId).map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-xs font-bold text-gray-300 bg-white/5 border border-white/10 rounded-full px-4 py-2 hover:bg-white/10 hover:text-white transition"
                >
                  {link.label}
                </Link>
              ))}
            </div>

          </section>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
