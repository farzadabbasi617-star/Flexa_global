"use client";

import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#050508] text-white">
      <Navbar />
      <main style={{ paddingBottom: "var(--bottom-nav-space)" }}>
        <div className="max-w-[480px] mx-auto px-6 pt-12">
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">🔒</span>
              <h1 className="text-3xl font-black">حریم خصوصی</h1>
            </div>
            <p className="text-sm text-white/60">آخرین به‌روزرسانی: خرداد ۱۴۰۵</p>
          </div>

          <div className="space-y-8 text-[15px] leading-relaxed">
            <section>
              <h3 className="font-bold mb-3 text-purple-300">اطلاعاتی که جمع‌آوری می‌کنیم</h3>
              <ul className="pr-4 space-y-1.5 text-sm">
                <li>• اطلاعات حساب کاربری (نام، ایمیل، شماره تلفن)</li>
                <li>• اطلاعات کیف پول و تراکنش‌ها</li>
                <li>• اطلاعات بازی و نتایج تورنومنت‌ها</li>
                <li>• لاگ‌های فنی برای بهبود عملکرد</li>
              </ul>
            </section>

            <section>
              <h3 className="font-bold mb-3 text-purple-300">نحوه استفاده از اطلاعات</h3>
              <p>اطلاعات شما فقط برای ارائه خدمات، احراز هویت، پرداخت جوایز و بهبود تجربه کاربری استفاده می‌شود.</p>
            </section>

            <section>
              <h3 className="font-bold mb-3 text-purple-300">اشتراک‌گذاری اطلاعات</h3>
              <p>ما اطلاعات شخصی شما را با هیچ شخص ثالثی به اشتراک نمی‌گذاریم مگر در موارد قانونی الزامی.</p>
            </section>

            <section>
              <h3 className="font-bold mb-3 text-purple-300">امنیت</h3>
              <p>تمام اطلاعات با رمزنگاری استاندارد ذخیره و منتقل می‌شوند. کیف پول‌ها نیز از امنیت بالایی برخوردارند.</p>
            </section>
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
