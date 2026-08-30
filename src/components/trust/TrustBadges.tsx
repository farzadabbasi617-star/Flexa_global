"use client";

/**
 * Trust & licensing showcase.
 *
 * The e-Namad licence and the ZarinPal gateway were both already in place but
 * effectively invisible: a small seal at the bottom of the footer and, for
 * ZarinPal, no mention anywhere on the site at all. For an Iranian platform
 * that handles real money, these are the two strongest signals that the site
 * is legitimate, so they get a real section.
 *
 * The e-Namad badge stays the genuine <img> from trustseal.enamad.ir. It is a
 * verifiable licence, so the 3D treatment is applied to its *frame* — never by
 * redrawing the mark itself, which would break e-Namad's Referer check and
 * misrepresent a government seal.
 */

import { motion, useReducedMotion } from "framer-motion";
import EnamadSeal from "@/components/EnamadSeal";
import CryptoPaymentMark from "@/components/trust/CryptoPaymentMark";
import SealPlinth from "@/components/trust/SealPlinth";

function ShieldIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 2.5 4.5 5.8v5.4c0 4.6 3.2 8.9 7.5 10.3 4.3-1.4 7.5-5.7 7.5-10.3V5.8L12 2.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="m8.8 12 2.3 2.3 4.3-4.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function TrustBadges() {
  // Respect the OS setting: a floating, tilting card is exactly the kind of
  // motion that triggers vestibular discomfort.
  const reduceMotion = useReducedMotion();

  const float = reduceMotion
    ? {}
    : {
        animate: { y: [0, -9, 0] },
        transition: { duration: 5.5, repeat: Infinity, ease: "easeInOut" as const },
      };

  const floatDelayed = reduceMotion
    ? {}
    : {
        animate: { y: [0, -9, 0] },
        transition: { duration: 5.5, repeat: Infinity, ease: "easeInOut" as const, delay: 1.4 },
      };

  return (
    <section
      dir="rtl"
      className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_15%_10%,rgba(16,185,129,.14),transparent_42%),radial-gradient(circle_at_85%_15%,rgba(250,204,21,.12),transparent_40%),linear-gradient(150deg,#0c1018,#080a10)] px-5 py-9 sm:px-8 sm:py-12"
      aria-labelledby="trust-heading"
    >
      {/* Faint grid, masked out toward the bottom so text stays readable. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[.05] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:46px_46px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
      />

      <div className="relative">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-500/10 px-3.5 py-1.5 text-[11px] font-black text-emerald-200">
            <ShieldIcon className="h-3.5 w-3.5" />
            پرداخت امن و مجوز رسمی
          </span>

          <h2 id="trust-heading" className="mt-5 text-2xl font-black leading-[1.5] text-white sm:text-4xl">
            پول شما، امن‌تر از
            <span className="bg-gradient-to-l from-emerald-300 via-cyan-300 to-amber-300 bg-clip-text text-transparent">
              {" "}هر جای دیگر
            </span>
          </h2>

          <p className="mx-auto mt-4 max-w-xl text-xs leading-7 text-gray-400 sm:text-sm sm:leading-8">
            Flexa با مجوز رسمی نماد اعتماد الکترونیکی فعالیت می‌کند و تمام پرداخت‌ها از درگاه بانکی
            زرین‌پال انجام می‌شود. در خرید از فروشگاه، مبلغ تا لحظه‌ی تأیید تحویل نزد Flexa
            امانت می‌ماند — نه دست فروشنده.
          </p>
        </div>

        <div className="mx-auto mt-9 grid max-w-3xl gap-4 sm:grid-cols-2">
          {/* --- e-Namad --- */}
          <motion.div
            {...float}
            whileHover={reduceMotion ? undefined : { rotateX: -7, rotateY: 7, scale: 1.02 }}
            style={{ transformStyle: "preserve-3d", perspective: 900 }}
            className="group relative overflow-hidden rounded-[26px] border border-white/10 bg-white/[.035] p-6 text-center transition-colors hover:border-emerald-300/30"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-16 right-1/2 h-40 w-40 translate-x-1/2 rounded-full bg-emerald-400/15 blur-3xl transition-opacity group-hover:opacity-150"
            />
            <div className="relative flex min-h-[132px] items-center justify-center" style={{ transform: "translateZ(38px)" }}>
              {/* The real, verifiable seal — never redrawn, only framed. */}
              <SealPlinth tone="emerald">
                <EnamadSeal />
              </SealPlinth>
            </div>
            <h3 className="relative mt-5 text-sm font-black text-white">نماد اعتماد الکترونیکی</h3>
            <p className="relative mt-2 text-[11px] leading-6 text-gray-500">
              دارای مجوز رسمی از مرکز توسعه تجارت الکترونیکی. برای مشاهده‌ی پروانه، روی نماد بزنید.
            </p>
          </motion.div>

          {/* --- ZarinPal --- */}
          <motion.div
            {...floatDelayed}
            whileHover={reduceMotion ? undefined : { rotateX: -7, rotateY: -7, scale: 1.02 }}
            style={{ transformStyle: "preserve-3d", perspective: 900 }}
            className="group relative overflow-hidden rounded-[26px] border border-white/10 bg-white/[.035] p-6 text-center transition-colors hover:border-amber-300/30"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-16 right-1/2 h-40 w-40 translate-x-1/2 rounded-full bg-amber-400/15 blur-3xl transition-opacity group-hover:opacity-150"
            />
            <div className="relative flex min-h-[132px] items-center justify-center" style={{ transform: "translateZ(38px)" }}>
              <CryptoPaymentMark className="h-[104px] w-[104px] drop-shadow-[0_14px_28px_rgba(234,179,8,.28)]" />
            </div>
            <h3 className="relative mt-5 text-sm font-black text-white">پرداخت امن زرین‌پال</h3>
            <p className="relative mt-2 text-[11px] leading-6 text-gray-500">
              تراکنش مستقیم روی درگاه بانکی. اطلاعات کارت شما هرگز وارد سایت Flexa نمی‌شود.
            </p>
          </motion.div>
        </div>

        {/* Concrete guarantees. Vaguer than this and it reads as marketing noise. */}
        <ul className="mx-auto mt-6 grid max-w-3xl gap-2.5 sm:grid-cols-3">
          {[
            ["پرداخت امانی", "پول تا تأیید تحویل آزاد نمی‌شود"],
            ["احراز هویت فروشنده", "فقط فروشنده‌ی تأییدشده اجازه‌ی فروش دارد"],
            ["بازگشت وجه", "کالا نرسید؟ مبلغ برمی‌گردد"],
          ].map(([title, sub]) => (
            <li
              key={title}
              className="flex items-start gap-2.5 rounded-2xl border border-white/[.07] bg-white/[.025] px-4 py-3 text-right"
            >
              <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              <div>
                <div className="text-[12px] font-black text-gray-100">{title}</div>
                <div className="mt-0.5 text-[10px] leading-5 text-gray-500">{sub}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
