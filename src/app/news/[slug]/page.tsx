import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { db } from "@/db";
import { honors } from "@/db/schema";
import { createPageMetadata, SITE_URL } from "@/lib/seo";
import { getNewsPage, pseoNewsPages, pseoLinksForGame } from "@/lib/pseo-content";

export const revalidate = 300;

export function generateStaticParams() {
  return pseoNewsPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = getNewsPage(slug);
  if (!page) return createPageMetadata({ title: "اخبار گیمینگ", description: "اخبار بازی‌ها در Flexa", path: "/honors" });
  return createPageMetadata({
    title: page.metaTitle,
    description: page.metaDescription,
    path: `/news/${page.slug}`,
    keywords: [page.keyword, "آپدیت", "سیزن جدید"],
  });
}

function faDate(value: Date | string | null): string {
  if (!value) return "به‌تازگی";
  try {
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(new Date(value));
  } catch {
    return "به‌تازگی";
  }
}

function summaryOf(metadata: unknown): string {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const meta = metadata as Record<string, unknown>;
    if (typeof meta.summary === "string" && meta.summary.trim()) return meta.summary;
  }
  return "";
}

async function latestNews(game: string) {
  try {
    return await db
      .select({
        id: honors.id,
        title: honors.title,
        description: honors.description,
        imageUrl: honors.imageUrl,
        publishedAt: honors.publishedAt,
        createdAt: honors.createdAt,
        metadata: honors.metadata,
      })
      .from(honors)
      .where(and(eq(honors.status, "approved"), eq(honors.game, game)))
      .orderBy(desc(honors.publishedAt), desc(honors.createdAt))
      .limit(12);
  } catch {
    return [];
  }
}

export default async function GameNewsHubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getNewsPage(slug);
  if (!page) return null;

  const news = await latestNews(page.game);
  const pageUrl = `${SITE_URL}/news/${page.slug}`;

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
      { "@type": "ListItem", position: 2, name: "تالار افتخارات", item: `${SITE_URL}/honors` },
      { "@type": "ListItem", position: 3, name: page.keyword, item: pageUrl },
    ],
  };
  const itemListJsonLd = news.length
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        itemListElement: news.slice(0, 10).map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `${SITE_URL}/honors/${item.id}`,
          name: item.title,
        })),
      }
    : null;

  const relatedLinks = pseoLinksForGame(page.game);

  return (
    <div className="min-h-screen bg-[#050508] text-white overflow-x-hidden">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      {itemListJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />}
      <Navbar />

      <main className="pb-28">
        <section className="relative overflow-hidden bg-gradient-to-br from-[#0b0618] to-[#050508] border-b border-white/5">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_15%_20%,rgba(34,197,94,.3),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(168,85,247,.35),transparent_28%)]" />
          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16" dir="rtl">
            <nav aria-label="مسیر صفحه" className="text-xs text-gray-400 mb-4">
              <Link href="/honors" className="hover:text-purple-300">تالار افتخارات</Link>
              <span className="mx-2">›</span>
              <span className="text-gray-300">{page.keyword}</span>
            </nav>
            <h1 className="text-3xl sm:text-4xl font-black leading-tight mb-5">{page.h1}</h1>
            {page.intro.map((paragraph, index) => (
              <p key={index} className="text-base sm:text-lg text-gray-200 leading-9 mb-4">{paragraph}</p>
            ))}
            <div className="flex flex-wrap gap-3 mt-6">
              <Link href="/honors" className="gaming-btn bg-gradient-to-r from-emerald-600 to-teal-600">
                همهٔ اخبار تالار افتخارات
              </Link>
            </div>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10" dir="rtl">
          <h2 className="text-xl font-black text-purple-300 mb-5">آخرین اخبار</h2>
          {news.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              {news.map((item) => {
                const summary = summaryOf(item.metadata) || item.description;
                return (
                  <Link key={item.id} href={`/honors/${item.id}`} className="gaming-card p-5 rounded-2xl border border-white/5 hover:border-emerald-500/30 transition block">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="font-black text-sm sm:text-base leading-7">{item.title}</h3>
                      <span className="text-[11px] text-gray-400 whitespace-nowrap mt-1">{faDate(item.publishedAt || item.createdAt)}</span>
                    </div>
                    {summary ? <p className="text-xs text-gray-400 leading-7 line-clamp-3">{summary.slice(0, 180)}</p> : null}
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="gaming-card p-6 rounded-2xl border border-white/5 mb-4">
              <p className="text-sm text-gray-300 leading-8">
                خبرهای این بازی به‌صورت خودکار توسط سیستم خبر Flexa جمع‌آوری و ترجمه می‌شود و همین‌جا نمایش داده می‌شود.
                اگر فعلاً خبری نمی‌بینی، به‌زودی اولین‌ها منتشر می‌شوند — مجموعهٔ کامل اخبار در تالار افتخارات است.
              </p>
              <div className="flex flex-wrap gap-3 mt-5">
                <Link href="/honors" className="gaming-btn bg-gradient-to-r from-emerald-600 to-teal-600">تالار افتخارات</Link>
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
            <div className="gaming-card rounded-3xl p-6 border border-emerald-500/20">
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
