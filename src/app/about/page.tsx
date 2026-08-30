"use client";

import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#050508] text-white">
      <Navbar />
      <main className="pb-24">
        <div className="max-w-[480px] mx-auto px-6 pt-12">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">🏢</span>
            <h1 className="text-3xl font-black">درباره Flexa</h1>
          </div>
          <p className="text-sm text-white/60">پلتفرم حرفه‌ای تورنومنت گیمینگ</p>
        </div>

        <div className="space-y-8 text-[15px] leading-relaxed">
          <section>
            <h2 className="font-bold text-lg mb-3 text-purple-300">داستان ما</h2>
            <p>
              Flexa در سال ۱۴۰۳ با هدف ایجاد بستری عادلانه، امن و هوشمند برای رقابت گیمرهای ایرانی راه‌اندازی شد. ما معتقدیم که هر بازیکنی باید بتواند مهارت خود را در محیطی حرفه‌ای و بدون نگرانی از تقلب به نمایش بگذارد.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-lg mb-3 text-purple-300">مأموریت ما</h2>
            <p>
              ارائه تجربه‌ای متفاوت از تورنومنت‌های آنلاین با استفاده از هوش مصنوعی برای داوری، سیستم کیف پول شفاف، و جوایز واقعی.
            </p>
          </section>

          <section>
            <h2 className="font-bold text-lg mb-3 text-purple-300">ارزش‌های ما</h2>
            <ul className="space-y-2 pr-1">
              <li className="flex gap-2">• <span>عدالت و شفافیت در داوری</span></li>
              <li className="flex gap-2">• <span>امنیت اطلاعات و تراکنش‌ها</span></li>
              <li className="flex gap-2">• <span>پشتیبانی واقعی و سریع</span></li>
              <li className="flex gap-2">• <span>رشد جامعه گیمینگ ایران</span></li>
            </ul>
          </section>
        </div>

        <div className="mt-12 text-center text-xs text-white/40">
          Flexa — جایی که مهارت حرف اول را می‌زند
        </div>
      </div>
      </main>

      <BottomNav />
    </div>
  );
}
