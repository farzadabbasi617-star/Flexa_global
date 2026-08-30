import type { Metadata } from "next";
import type { ReactNode } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { honors } from "@/db/schema";
import { createPageMetadata, gameNamesFa } from "@/lib/seo";
import { getStaticHonorById } from "@/lib/static-honors";
import { getHonorArticleForSeo, honorNewsArticleJsonLd, honorParagraphs } from "@/lib/honor-article-seo";
import { SITE_URL } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;

  try {
    const [honor] = await db
      .select({
        id: honors.id,
        title: honors.title,
        description: honors.description,
        imageUrl: honors.imageUrl,
        game: honors.game,
      })
      .from(honors)
      .where(eq(honors.id, id))
      .limit(1);

    if (honor) {
      const gameName = honor.game ? gameNamesFa[honor.game] || honor.game : "گیمینگ";
      return createPageMetadata({
        title: honor.title,
        description: honor.description.slice(0, 155),
        path: `/honors/${id}`,
        image: honor.imageUrl || undefined,
        keywords: [honor.title, gameName, "تالار افتخارات Flexa", "اخبار گیمینگ", "Flexa"],
      });
    }
  } catch {
    // Keep a safe fallback if database metadata is temporarily unavailable.
  }

  const staticHonor = getStaticHonorById(id);
  if (staticHonor) {
    const gameName = staticHonor.game ? gameNamesFa[staticHonor.game] || staticHonor.game : "گیمینگ";
    return createPageMetadata({
      title: staticHonor.title,
      description: (staticHonor.summary || staticHonor.description).slice(0, 155),
      path: `/honors/${id}`,
      image: staticHonor.image,
      keywords: [...(staticHonor.seoKeywords || []), gameName, "تالار افتخارات Flexa", "اخبار گیمینگ"],
    });
  }

  return createPageMetadata({
    title: "افتخار Flexa",
    description: "مشاهده خبر، افتخار یا قهرمان منتخب در تالار افتخارات Flexa.",
    path: `/honors/${id}`,
  });
}

/**
 * Emits the article body in the server response.
 *
 * The page itself is a client component that fetches after hydration, so the
 * first HTML a crawler receives contained the title and meta description but no
 * article text. Google indexes the initial response and defers JavaScript to a
 * slower second pass, so the body was effectively unindexed.
 *
 * The copy here is visually hidden rather than removed: it must be real text in
 * the DOM for crawlers, but the client component renders the same article with
 * full styling once it loads, and showing both would duplicate it on screen.
 */
export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const article = await getHonorArticleForSeo(id);
  if (!article) return children;

  const paragraphs = honorParagraphs(article.description);
  const jsonLd = honorNewsArticleJsonLd(article, SITE_URL);

  return (
    <>
      <script
        type="application/ld+json"
        // Escaping "<" prevents a stray closing tag inside the article from
        // terminating this script block early.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <article className="sr-only" aria-hidden="true">
        <h1>{article.title}</h1>
        {article.summary && <p>{article.summary}</p>}
        {paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </article>
      {children}
    </>
  );
}
