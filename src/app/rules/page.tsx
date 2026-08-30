"use client";

import Navbar from "@/components/Navbar";
import { TERMS_LAST_UPDATED_FA, TERMS_SECTIONS, TERMS_VERSION } from "@/lib/terms";

export default function RulesPage() {
  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="text-center mb-10">
          <div className="text-5xl mb-4">📜</div>
          <h1 className="text-3xl sm:text-4xl font-black mb-3">
            <span className="neon-text-purple">قوانین، مقررات و شرایط استفاده Flexa</span>
          </h1>
          <p className="text-gray-400 leading-8 max-w-2xl mx-auto">
            این سند، چارچوب استفاده از پلتفرم Flexa، شرکت در تورنومنت‌ها، پرداخت‌ها، جوایز، داوری، امنیت و مسئولیت کاربران را مشخص می‌کند. ثبت‌نام یا استفاده از خدمات Flexa به منزله پذیرش کامل این مقررات است.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3 text-xs text-gray-500">
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10">نسخه: {TERMS_VERSION}</span>
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10">آخرین بروزرسانی: {TERMS_LAST_UPDATED_FA}</span>
          </div>
        </div>

        <div className="grid gap-4 mb-8">
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-5 text-yellow-100 leading-8 text-sm">
            <strong className="text-yellow-300">تذکر مهم:</strong> این مقررات برای شفاف‌سازی رابطه کاربر و پلتفرم نوشته شده است و جایگزین مشاوره حقوقی تخصصی نیست. برای استفاده تجاری گسترده، اتصال درگاه پرداخت و برگزاری رویدادهای بزرگ، پیشنهاد می‌شود نسخه نهایی توسط مشاور حقوقی حوزه فناوری، پرداخت و ورزش‌های الکترونیک بررسی شود.
          </div>
          <div className="bg-cyan-500/10 border border-cyan-500/25 rounded-2xl p-5 text-cyan-50 leading-8 text-sm">
            <strong className="text-cyan-300">خلاصه کاربردی:</strong> مسابقات Flexa مهارتی هستند، پرداخت‌ها بابت خدمات پلتفرم و مدیریت رویداد است، جایزه فقط بعد از تأیید نتیجه و عدم تخلف پرداخت می‌شود، برداشت کیف پول نیازمند احراز مالکیت حساب بانکی است و تقلب/تبانی/رسید جعلی باعث محرومیت و پیگیری خواهد شد.
          </div>
        </div>

        <div className="space-y-6">
          {TERMS_SECTIONS.map((section, idx) => (
            <section key={section.title} className="gaming-card p-6 animate-slide-up" style={{ animationDelay: `${idx * 0.05}s` }}>
              <div className="flex items-center gap-3 mb-5">
                <span className="text-2xl">{section.icon}</span>
                <h2 className="text-lg sm:text-xl font-black text-neon-blue">{section.title}</h2>
              </div>
              <ol className="space-y-4 list-decimal list-inside">
                {section.items.map((item, i) => (
                  <li key={i} className="text-gray-300 text-sm leading-8 marker:text-neon-purple marker:font-black">
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>

        <div className="mt-8 bg-neon-pink/10 border border-neon-pink/30 rounded-xl p-5 text-center">
          <span className="text-3xl">⚠️</span>
          <p className="font-bold text-neon-pink mt-3 leading-8">
            نقض هر یک از قوانین فوق می‌تواند منجر به اخطار، حذف نتیجه، لغو جایزه، تعلیق حساب، محرومیت دائم، مطالبه خسارت و پیگیری از مراجع قانونی شود.
          </p>
        </div>
      </div>
    </div>
  );
}
