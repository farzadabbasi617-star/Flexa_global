"use client";

import { Suspense } from "react";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";

function SuccessContent() {
  const router = useRouter();
  const params = useSearchParams();
  const ref = params.get("ref");

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push("/wallet");
    }, 4000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="text-center max-w-sm">
      <div className="text-6xl mb-6">✅</div>
      <h1 className="text-3xl font-black mb-3">پرداخت موفق</h1>
      <p className="text-gray-400 mb-8">مبلغ با موفقیت به کیف پول شما اضافه شد.</p>
      {ref && <p className="text-xs text-gray-500 mb-8">شماره پیگیری: {ref}</p>}
      <Link href="/wallet" className="gaming-btn inline-block px-8">
        بازگشت به کیف پول
      </Link>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <div className="min-h-screen bg-[#050508] text-white flex items-center justify-center px-6">
      <Suspense fallback={<div>در حال بارگذاری...</div>}>
        <SuccessContent />
      </Suspense>
      <BottomNav />
    </div>
  );
}
