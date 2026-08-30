"use client";

/**
 * Storefront hero carousel for promoted listings.
 *
 * Renders nothing at all when there is nothing promoted, so the storefront is
 * unchanged until an admin approves a placement. That also means the feature
 * can ship before the paid flow exists without altering the page.
 *
 * Scrolling uses native CSS scroll-snap rather than a JS animation loop: it
 * keeps momentum scrolling on touch, works without JS, and costs no frame
 * budget on the low-end phones most of this audience is using.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

export type FeaturedListing = {
  id: string;
  source: string;
  kind: string;
  game?: string | null;
  title: string;
  priceToman: number;
  images?: unknown;
  stock: number;
  soldCount: number;
  warrantyDays?: number | null;
  sellerName?: string | null;
};

function toman(value: number) {
  return `${value.toLocaleString("fa-IR")} USDT`;
}

function firstImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  const found = images.find((entry) => typeof entry === "string" && entry.trim());
  return typeof found === "string" ? found : null;
}

/** Rotate this slowly; a fast carousel is unreadable and feels like an ad. */
const AUTOPLAY_MS = 5_000;

export default function FeaturedCarousel() {
  const [items, setItems] = useState<FeaturedListing[]>([]);
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/store/featured")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setItems(Array.isArray(data?.items) ? data.items : []);
      })
      // The carousel is decoration: a failure leaves the storefront intact.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const scrollTo = useCallback((index: number) => {
    const track = trackRef.current;
    if (!track) return;
    const child = track.children[index] as HTMLElement | undefined;
    if (child) track.scrollTo({ left: child.offsetLeft, behavior: "smooth" });
  }, []);

  // Advance on a timer, but never while the user is interacting, and never
  // when the tab is hidden -- a background timer scrolling a hidden carousel
  // is pure battery cost.
  useEffect(() => {
    if (items.length < 2) return;
    const timer = setInterval(() => {
      if (pausedRef.current || document.hidden) return;
      setActive((current) => {
        const next = (current + 1) % items.length;
        scrollTo(next);
        return next;
      });
    }, AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [items.length, scrollTo]);

  // Keep the dots honest when the user swipes manually.
  const handleScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const children = Array.from(track.children) as HTMLElement[];
    const nearest = children.reduce(
      (best, child, index) =>
        Math.abs(child.offsetLeft - track.scrollLeft) < best.distance
          ? { index, distance: Math.abs(child.offsetLeft - track.scrollLeft) }
          : best,
      { index: 0, distance: Infinity }
    );
    setActive(nearest.index);
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="mt-9 sm:mt-12" aria-labelledby="featured-heading">
      <div className="mb-4 flex items-end justify-between gap-3 border-b border-white/[.07] pb-4">
        <div>
          <span className="text-[9px] font-black tracking-[.25em] text-amber-400">FEATURED</span>
          <h2 id="featured-heading" className="mt-1 text-xl font-black sm:text-2xl">
            محصولات ویژه
          </h2>
        </div>
        {items.length > 1 && (
          <div className="flex items-center gap-1.5" role="tablist" aria-label="اسلایدهای محصولات ویژه">
            {items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={index === active}
                aria-label={`اسلاید ${index + 1} از ${items.length}`}
                onClick={() => {
                  setActive(index);
                  scrollTo(index);
                }}
                className={`h-2 rounded-full transition-all ${
                  index === active ? "w-6 bg-amber-400" : "w-2 bg-white/20 hover:bg-white/40"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      <div
        ref={trackRef}
        onScroll={handleScroll}
        onPointerEnter={() => (pausedRef.current = true)}
        onPointerLeave={() => (pausedRef.current = false)}
        onTouchStart={() => (pausedRef.current = true)}
        onFocusCapture={() => (pausedRef.current = true)}
        onBlurCapture={() => (pausedRef.current = false)}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((listing) => {
          const image = firstImage(listing.images);
          return (
            <article
              key={listing.id}
              className="group relative flex w-[86%] shrink-0 snap-start overflow-hidden rounded-[26px] border border-amber-400/20 bg-gradient-to-bl from-amber-500/[.07] to-white/[.02] sm:w-[48%] lg:w-[32%]"
            >
              <Link href={`/store/${listing.id}`} className="flex w-full flex-col">
                <div className="relative h-40 w-full overflow-hidden bg-black/40 sm:h-44">
                  {image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={image}
                      alt=""
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-3xl opacity-30">🎮</div>
                  )}
                  <span className="absolute right-3 top-3 rounded-lg bg-amber-400 px-2 py-1 text-[9px] font-black text-black shadow-lg">
                    ⭐ ویژه
                  </span>
                </div>

                <div className="flex flex-1 flex-col p-4">
                  <h3 className="line-clamp-2 min-h-11 text-[13px] font-black leading-6 text-gray-100 transition group-hover:text-amber-200">
                    {listing.title}
                  </h3>

                  <div className="mt-2 text-[9px] text-gray-500">
                    {listing.source === "user"
                      ? listing.sellerName || "فروشنده احرازشده"
                      : "عرضه مستقیم Flexa"}
                    {listing.soldCount > 0 && ` · ${listing.soldCount.toLocaleString("fa-IR")} فروش`}
                  </div>

                  <div className="mt-auto border-t border-white/[.06] pt-3">
                    <span className="block text-[9px] text-gray-600">قیمت نهایی</span>
                    <div className="mt-0.5 text-sm font-black text-white sm:text-base">
                      {toman(listing.priceToman)}
                    </div>
                  </div>
                </div>
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
