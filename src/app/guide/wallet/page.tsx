"use client";

import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";

export default function WalletGuidePage() {
  return (
    <div className="min-h-screen bg-[#050508] text-white">
      <Navbar />
      <main className="pb-24">
        <div className="max-w-[480px] mx-auto px-6 pt-12">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">💰</span>
            <h1 className="text-3xl font-black">راهنمای کیف پول و جوایز</h1>
          </div>
        </div>

        <div className="space-y-8 text-[15px]">
          <div className="glass-panel p-6 rounded-3xl border border-white/10">
            <h3 className="font-bold mb-4">شارژ کیف پول</h3>
            <p className="text-sm text-white/75">از بخش کیف پول می‌توانید موجودی خود را از طریق درگاه‌های امن بانکی افزایش دهید.</p>
          </div>

          <div className="glass-panel p-6 rounded-3xl border border-white/10">
            <h3 className="font-bold mb-4">دریافت جوایز</h3>
            <p className="text-sm text-white/75">پس از پایان تورنومنت و تأیید نتایج، جایزه به‌صورت خودکار به کیف پول شما اضافه می‌شود.</p>
          </div>

          <div className="glass-panel p-6 rounded-3xl border border-white/10">
            <h3 className="font-bold mb-4">برداشت از کیف پول</h3>
            <p className="text-sm text-white/75">حداقل مبلغ برداشت ۵۰٬۰۰۰ USDT است. درخواست برداشت معمولاً ظرف ۲۴ تا ۴۸ ساعت پردازش می‌شود.</p>
          </div>

          <div className="glass-panel p-6 rounded-3xl border border-white/10">
            <h3 className="font-bold mb-4">تاریخچه تراکنش‌ها</h3>
            <p className="text-sm text-white/75">تمام شارژها، پرداخت‌های ورودی و جوایز دریافتی در بخش «تراکنش‌ها» قابل مشاهده است.</p>
          </div>
        </div>
      </div>
      </main>

      <BottomNav />
    </div>
  );
}
