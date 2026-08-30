"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import BottomNav from "@/components/BottomNav";

function FailedContent() {
  // The gateway callback already redirects here with a specific reason
  // (cancelled, amount mismatch, verification failed). Showing it beats a
  // generic "try again" that gives the user nothing to act on.
  const reason = useSearchParams().get("reason");

  return (
    <div className="text-center max-w-sm">
      <div className="text-6xl mb-6">❌</div>
      <h1 className="text-3xl font-black mb-3">پرداخت ناموفق</h1>
      <p className="text-gray-400 mb-4">
        {reason || "متأسفانه پرداخت شما انجام نشد."}
      </p>
      <p className="text-xs text-gray-500 mb-6">
        اگر مبلغی از حساب شما کسر شده باشد، طی ۲۴ تا ۷۲ ساعت به‌صورت خودکار
        توسط بانک بازگردانده می‌شود.
      </p>

      {/* A foreign IP is the single most common cause of a failed Iranian
          gateway payment, so it leads the troubleshooting list. */}
      <div className="rounded-3xl bg-rose-500/10 border border-rose-300/30 p-4 text-right mb-6">
        <div className="font-black text-rose-100 mb-2 text-sm">شایع‌ترین دلایل</div>
        <ul className="text-[13px] leading-7 text-rose-50/90 space-y-1.5">
          <li>🔴 <b>فیلترشکن (VPN) روشن بوده است.</b> آن را خاموش کنید و دوباره تلاش کنید.</li>
          <li>💻 پرداخت از مرورگر داخل تلگرام یا اینستاگرام انجام شده؛ از داخل سایت اقدام کنید.</li>
          <li>💳 موجودی کارت کافی نبوده یا رمز پویا اشتباه وارد شده است.</li>
          <li>⏳ صفحه‌ی درگاه پیش از تکمیل پرداخت بسته شده است.</li>
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <Link href="/wallet" className="gaming-btn">تلاش دوباره</Link>
        <Link href="/support" className="text-sm text-purple-400">تماس با پشتیبانی</Link>
      </div>
    </div>
  );
}

export default function PaymentFailedPage() {
  return (
    <div className="min-h-screen bg-[#050508] text-white flex items-center justify-center px-6 py-10">
      <Suspense fallback={<div>در حال بارگذاری...</div>}>
        <FailedContent />
      </Suspense>
      <BottomNav />
    </div>
  );
}
