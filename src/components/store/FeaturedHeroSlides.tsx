"use client";

/**
 * Rotating hero slides for promoted listings.
 *
 * Sits inside the existing hero panel and takes it over only when something is
 * actually promoted; with an empty list it renders nothing and the static
 * marketing hero shows exactly as before. That keeps the paid surface from
 * degrading the page when no one has bought a slot.
 *
 * Distinct from FeaturedCarousel: this is the single large rotating banner at
 * the top, that is the multi-card strip below it. Both read the same endpoint,
 * so one approval drives both.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { FeaturedListing } from "@/components/store/FeaturedCarousel";

const ROTATE_MS = 6_000;

function toman(value: number) {
  return `${value.toLocaleString("fa-IR")} USDT`;
}

function firstImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  const found = images.find((entry) => typeof entry === "string" && entry.trim());
  return typeof found === "string" ? found : null;
}

export default function FeaturedHeroSlides({
  onLoaded,
}: {
  /** Lets the page hide its static hero once slides are available. */
  onLoaded?: (count: number) => void;
}) {
  const [items, setItems] = useState<FeaturedListing[]>([]);
  const [index, setIndex] = useState(0);
  const pausedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/store/featured")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.items) ? data.items : [];
        setItems(list);
        onLoaded?.(list.length);
      })
      .catch(() => onLoaded?.(0));
    return () => {
      cancelled = true;
    };
    // onLoaded is a stable setter in practice; re-running on identity change
    // would refetch on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (items.length < 2) return;
    const timer = setInterval(() => {
      // Never rotate under the reader's hands, and never burn cycles on a
      // hidden tab.
      if (pausedRef.current || document.hidden) return;
      setIndex((current) => (current + 1) % items.length);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [items.length]);

  const go = useCallback((next: number) => setIndex(next), []);

  if (items.length === 0) return null;

  const listing = items[index];
  const image = firstImage(listing.images);

  return (
    <div
      className="relative z-10 flex h-full flex-col justify-center"
      onPointerEnter={() => (pausedRef.current = true)}
      onPointerLeave={() => (pausedRef.current = false)}
      onFocusCapture={() => (pausedRef.current = true)}
      onBlurCapture={() => (pausedRef.current = false)}
      aria-roledescription="carousel"
      aria-label="محصولات ویژه"
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-500/10 px-3 py-1.5 text-[10px] font-black text-amber-200">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
            پیشنهاد ویژه
          </span>

          {/* key restarts the animation on each slide so the change is legible
              rather than a silent text swap. */}
          <h1
            key={listing.id}
            className="mt-4 animate-slide-up text-2xl font-black leading-[1.4] tracking-tight sm:text-4xl"
          >
            {listing.title}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-300">
            <span className="text-lg font-black text-white sm:text-2xl">{toman(listing.priceToman)}</span>
            {listing.warrantyDays ? (
              <span className="rounded-lg bg-emerald-500/[.12] px-2 py-1 text-[10px] font-black text-emerald-300">
                {listing.warrantyDays.toLocaleString("fa-IR")} روز گارانتی
              </span>
            ) : null}
            {listing.soldCount > 0 && (
              <span className="text-[11px] text-gray-400">{listing.soldCount.toLocaleString("fa-IR")} فروش</span>
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link
              href={`/store/${listing.id}`}
              className="inline-flex items-center gap-2 rounded-2xl bg-amber-400 px-5 py-3 text-xs font-black text-black transition hover:bg-amber-300"
            >
              مشاهده و خرید
            </Link>
            <a
              href="#products"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[.06] px-5 py-3 text-xs font-black text-white transition hover:bg-white/[.1]"
            >
              همه محصولات
            </a>
          </div>
        </div>

        {image && (
          <div className="relative hidden h-40 w-full shrink-0 overflow-hidden rounded-3xl border border-white/10 md:block md:h-48 md:w-64">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={listing.id} src={image} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
          </div>
        )}
      </div>

      {items.length > 1 && (
        <div className="mt-6 flex items-center gap-1.5">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`اسلاید ${i + 1} از ${items.length}`}
              aria-current={i === index}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-8 bg-amber-400" : "w-3 bg-white/20 hover:bg-white/40"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
