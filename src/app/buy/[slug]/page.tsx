import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, ilike } from "drizzle-orm";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { db } from "@/db";
import { storeListings } from "@/db/schema";
import { createPageMetadata, SITE_URL } from "@/lib/seo";
import { getBuyPage, pseoBuyPages, pseoLinksForGame, type PseoBuyPage } from "@/lib/pseo-content";

export const revalidate = 300;

export function generateStaticParams() {
  return pseoBuyPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = getBuyPage(slug);
  if (!page) return createPageMetadata({ title: "فروشگاه Flexa", description: "راهنمای خرید در Flexa", path: "/store" });
  return createPageMetadata({
    title: page.metaTitle,
    description: page.metaDescription,
    path: `/buy/${page.slug}`,
    keywords: [page.keyword, ...page.faqs.slice(0, 3).map((f) => f.q)],
  });
}

function formatToman(priceRial: string): string {
  const toman = Math.round(Number(priceRial) / 10);
  if (!Number.isFinite(toman) || toman <= 0) return "استعلام قیمت";
  return `${toman.toLocaleString("fa-IR")} USDT`;
}

async function liveListings(page: PseoBuyPage) {
  try {
    const conditions = [eq(storeListings.status, "active"), eq(storeListings.kind, page.query.kind)];
    if (page.query.game) conditions.push(eq(storeListings.game, page.query.game));
    if (page.query.currencyKind) conditions.push(eq(storeListings.currencyKind, page.query.currencyKind));
    if (page.query.titleLike) conditions.push(ilike(storeListings.title, `%${page.query.titleLike}%`));
    return await db
      .select({
        id: storeListings.id,
        title: storeListings.title,
        priceRial: storeListings.priceRial,
        currencyAmount: storeListings.currencyAmount,
        stock: storeListings.stock,
      })
      .from(storeListings)
      .where(and(...conditions))
      .orderBy(desc(storeListings.updatedAt))
      .limit(8);
  } catch {
    return [];
  }
}

export default async function BuyGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getBuyPage(slug);
  if (!page) return null;

  const listings = await liveListings(page);
  const pageUrl = `${SITE_URL}/buy/${page.slug}`;

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
      { "@type": "ListItem", position: 2, name: "فروشگاه", item: `${SITE_URL}/store` },
      { "@type": "ListItem", position: 3, name: page.keyword, item: pageUrl },
    ],
  };
  const itemListJsonLd = listings.length
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        itemListElement: listings.map((listing, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `${SITE_URL}/store/${listing.id}`,
          name: listing.title,
        })),
      }
    : null;

  const relatedLinks = page.game ? pseoLinksForGame(page.game).filter((l) => l.href !== `/buy/${page.slug}`) : [];
  const otherBuys = pseoBuyPages.filter((p) => p.slug !== page.slug && p.game === page.game).slice(0, 2);

  return (
    <div className="min-h-screen bg-[#050508] text-white overflow-x-hidden">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      {itemListJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />}
      <Navbar />

      <main className="pb-28">
        <section className="relative overflow-hidden bg-gradient-to-br from-[#0b0618] to-[#050508] border-b border-white/5">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_15%_20%,rgba(168,85,247,.4),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(59,130,246,.35),transparent_28%)]" />
          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16" dir="rtl">
            <nav aria-label="مسیر صفحه" className="text-xs text-gray-400 mb-4">
              <Link href="/store" className="hover:text-purple-300">فروشگاه</Link>
              <span className="mx-2">›</span>
              <span className="text-gray-300">{page.keyword}</span>
            </nav>
            <h1 className="text-3xl sm:text-4xl font-black leading-tight mb-5">{page.h1}</h1>
            {page.intro.map((paragraph, index) => (
              <p key={index} className="text-base sm:text-lg text-gray-200 leading-9 mb-4">{paragraph}</p>
            ))}
            <div className="flex flex-wrap gap-3 mt-6">
              <Link href="/store" className="gaming-btn bg-gradient-to-r from-purple-600 to-fuchsia-600">
                مشاهده فروشگاه
              </Link>
              <Link href="/store/price-estimate" className="px-5 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-bold hover:bg-white/10 transition">
                تخمین قیمت
              </Link>
            </div>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10" dir="rtl">
          <h2 className="text-xl font-black text-purple-300 mb-5">
            {listings.length ? "موجودی و قیمت‌های فعلی" : "خرید از فروشگاه Flexa"}
          </h2>
          {listings.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              {listings.map((listing) => (
                <Link key={listing.id} href={`/store/${listing.id}`} className="gaming-card p-5 rounded-2xl border border-white/5 hover:border-purple-500/30 transition block">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <h3 className="font-black text-sm sm:text-base">{listing.title}</h3>
                    {listing.stock > 0 ? (
                      <span className="text-[11px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1">موجود</span>
                    ) : (
                      <span className="text-[11px] font-bold text-gray-400 bg-white/5 border border-white/10 rounded-full px-3 py-1">ناموجود</span>
                    )}
                  </div>
                  <p className="text-purple-300 font-black">{formatToman(listing.priceRial)}</p>
                  {listing.currencyAmount ? (
                    <p className="text-xs text-gray-400 mt-1">{listing.currencyAmount.toLocaleString("fa-IR")} واحد</p>
                  ) : null}
                </Link>
              ))}
            </div>
          ) : (
            <div className="gaming-card p-6 rounded-2xl border border-white/5 mb-4">
              <p className="text-sm text-gray-300 leading-8">
                موجودی این بخش به‌صورت زنده از فروشگاه خوانده می‌شود؛ هر زمان آیتمی فعال شود، همان‌جا با قیمت روز نمایش داده می‌شود.
                تا آن موقع می‌توانی قیمت تخمینی موردنظرت را در ابزار تخمین قیمت ببینی یا مجموعه فروشگاه را مرور کنی.
              </p>
              <div className="flex flex-wrap gap-3 mt-5">
                <Link href="/store" className="gaming-btn bg-gradient-to-r from-purple-600 to-fuchsia-600">رفتن به فروشگاه</Link>
                <Link href="/store/price-estimate" className="px-5 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-bold">تخمین قیمت</Link>
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

        {(relatedLinks.length > 0 || otherBuys.length > 0) && (
          <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-10" dir="rtl">
            <div className="gaming-card rounded-3xl p-6 border border-purple-500/20">
              <h2 className="text-lg font-black mb-4">صفحات مرتبط</h2>
              <div className="flex flex-wrap gap-3">
                {relatedLinks.map((link) => (
                  <Link key={link.href} href={link.href} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm font-bold hover:bg-white/10 transition">
                    {link.label}
                  </Link>
                ))}
                {otherBuys.map((p) => (
                  <Link key={p.slug} href={`/buy/${p.slug}`} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm font-bold hover:bg-white/10 transition">
                    {p.keyword}
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
