"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { copyTextSafely } from "@/lib/client-clipboard";
import { referralShareMessage, referralWebLink, shareTargetUrl } from "@/lib/referral-invite";

interface InviteState {
  status: "loading" | "anonymous" | "not_activated" | "ready";
  referralCode?: string;
  totalReferrals?: number;
}

/**
 * Compact invite widget for placing on high-intent surfaces (home, arena, after
 * a settlement) instead of making players hunt for /referrals.
 *
 * It deliberately shows the share buttons for an already-active referrer and a
 * single call to action for everybody else, so it never renders a dead end.
 */
export default function InviteFriendCard({ variant = "full" }: { variant?: "full" | "compact" }) {
  const [state, setState] = useState<InviteState>({ status: "loading" });
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/referrals", { cache: "no-store", credentials: "include" });
        if (response.status === 401) {
          if (!cancelled) setState({ status: "anonymous" });
          return;
        }
        const data = await response.json();
        if (cancelled) return;
        // Stage-based, not status-based: a link is live once the short rules
        // are accepted, before any contract is signed.
        if (data?.stage && data.stage !== "anonymous" && data?.partner?.referralCode) {
          setState({
            status: "ready",
            referralCode: data.partner.referralCode,
            totalReferrals: data?.stats?.totalReferrals || 0,
          });
        } else {
          setState({ status: "not_activated" });
        }
      } catch {
        if (!cancelled) setState({ status: "anonymous" });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const flash = useCallback((text: string) => {
    setToast(text);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const link = state.referralCode ? referralWebLink(state.referralCode) : "";
  const message = state.referralCode ? referralShareMessage({ referralCode: state.referralCode }) : "";

  const share = useCallback(async () => {
    if (!link) return;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Flexa", text: message, url: link });
        return;
      } catch {
        // User dismissed the sheet, or the browser refused. Fall back to copy.
      }
    }
    flash(await copyTextSafely(message) ? "متن دعوت کپی شد ✅" : "کپی نشد؛ لینک را دستی انتخاب کن");
  }, [link, message, flash]);

  if (state.status === "loading") return null;

  const wrapper = variant === "compact"
    ? "rounded-2xl border border-cyan-400/20 bg-cyan-500/[.06] p-4"
    : "rounded-[26px] border border-cyan-400/20 bg-[linear-gradient(135deg,rgba(6,182,212,.14),rgba(124,58,237,.07))] p-5 sm:p-6";

  if (state.status !== "ready") {
    return (
      <div className={wrapper} dir="rtl">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎁</span>
          <div className="min-w-0">
            <h3 className="text-sm font-black text-white">دوستت را دعوت کن، از بازی‌هایش سهم بگیر</h3>
            <p className="mt-1 text-[11px] leading-5 text-gray-400">
              {state.status === "anonymous"
                ? "بعد از ورود به حساب، لینک دعوت اختصاصی‌ات فعال می‌شود."
                : "با تأیید سه قانون کوتاه، لینک دعوتت همین حالا فعال می‌شود. نیازی به کد ملی یا شبا نیست."}
            </p>
          </div>
        </div>
        <Link
          href={state.status === "anonymous" ? "/login" : "/referrals"}
          className="mt-4 block rounded-xl bg-cyan-600 py-2.5 text-center text-xs font-black text-white active:scale-95"
        >
          {state.status === "anonymous" ? "ورود به حساب" : "دریافت لینک دعوت"}
        </Link>
      </div>
    );
  }

  return (
    <div className={wrapper} dir="rtl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-black text-white">🎁 لینک دعوت تو</h3>
          <p className="mt-1 text-[11px] text-gray-400">
            تا حالا {(state.totalReferrals || 0).toLocaleString("fa-IR")} نفر دعوت کرده‌ای
          </p>
        </div>
        <Link href="/referrals" className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1 text-[9px] font-black text-gray-300">
          جزئیات
        </Link>
      </div>

      <code dir="ltr" className="mt-3 block select-all break-all rounded-xl bg-black/25 p-2.5 text-[11px] text-cyan-200">
        {link}
      </code>

      <div className="mt-3 grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={share}
          className="rounded-xl bg-cyan-600 py-2 text-[10px] font-black text-white active:scale-95"
        >
          اشتراک
        </button>
        <a
          href={shareTargetUrl("whatsapp", message, link)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl bg-emerald-600/85 py-2 text-center text-[10px] font-black text-white active:scale-95"
        >
          واتساپ
        </a>
        <a
          href={shareTargetUrl("telegram", message, link)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl bg-sky-600/85 py-2 text-center text-[10px] font-black text-white active:scale-95"
        >
          تلگرام
        </a>
        <button
          type="button"
          onClick={async () => flash(await copyTextSafely(link) ? "لینک کپی شد ✅" : "کپی نشد")}
          className="rounded-xl border border-white/12 py-2 text-[10px] font-black text-gray-200 active:scale-95"
        >
          کپی
        </button>
      </div>

      {toast && <p className="mt-2 text-center text-[10px] font-black text-emerald-300">{toast}</p>}
    </div>
  );
}
