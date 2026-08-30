"use client";

import { useState } from "react";
import Link from "next/link";

const sections = [
  {
    id: "about",
    title: "درباره ما",
    icon: "🏢",
    content: (
      <>
        <p className="mb-3">
          Flexa (Flexa) یک پلتفرم تورنمنت گیمینگ، ثبت‌نام، داوری، پشتیبانی، کیف پول داخلی و انتشار خبرهای رقابتی است. تمرکز ما روی تجربه امن، شفاف و مهارتی برای گیمرهاست.
        </p>
        <p>
          Flexa ناشر یا نماینده رسمی بازی‌ها نیست؛ بازی‌ها و نام‌های تجاری متعلق به مالکان اصلی خودشان هستند و استفاده از آن‌ها صرفاً برای معرفی رویدادها و محتوای مرتبط است.
        </p>
      </>
    ),
  },
  {
    id: "contact",
    title: "تماس و پشتیبانی",
    icon: "📬",
    content: (
      <>
        <p className="mb-4">برای گزارش مشکل، پیگیری پرداخت، اعتراض مسابقه یا پیشنهاد همکاری از مسیرهای زیر اقدام کنید:</p>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3"><span className="text-purple-400">✉️</span><span>support@flexa1.ir</span></div>
          <div className="flex items-center gap-3"><span className="text-purple-400">🤖</span><span>ربات تلگرام: @FlexaTournamentBot</span></div>
          <div className="flex items-center gap-3"><span className="text-purple-400">💬</span><span>بخش پشتیبانی داخل سایت</span></div>
        </div>
      </>
    ),
  },
  {
    id: "privacy",
    title: "حریم خصوصی و داده‌ها",
    icon: "🔒",
    content: (
      <>
        <p className="mb-3">اطلاعات ضروری فقط برای ارائه خدمات، امنیت، داوری، پشتیبانی، پرداخت، جلوگیری از تقلب و الزامات قانونی پردازش می‌شود.</p>
        <ul className="list-disc pr-5 space-y-1 text-sm">
          <li>شماره موبایل، آیدی بازی، سوابق مسابقه و تراکنش برای ارائه خدمات نگهداری می‌شود.</li>
          <li>اطلاعات بانکی/شبا فقط برای بررسی و پرداخت برداشت استفاده می‌شود.</li>
          <li>حساب تلگرام در صورت لینک کردن، برای ورود سریع، اعلان و امکانات ربات استفاده می‌شود.</li>
          <li>حذف داده‌ها در چارچوب محدودیت‌های مالی، امنیتی و قانونی بررسی می‌شود.</li>
        </ul>
      </>
    ),
  },
  {
    id: "skill",
    title: "ماهیت مهارتی مسابقات",
    icon: "⚖️",
    content: (
      <>
        <p className="mb-3">تورنومنت‌های Flexa بر پایه مهارت، استراتژی، تصمیم‌گیری و عملکرد واقعی بازیکنان برگزار می‌شود و شرط‌بندی یا قمار نیست.</p>
        <ul className="list-disc pr-5 space-y-1 text-sm">
          <li>پرداخت احتمالی بابت خدمات پلتفرم، داوری، زیرساخت و مدیریت رویداد است.</li>
          <li>جایزه فقط بعد از تأیید نتیجه و عدم تخلف پرداخت می‌شود.</li>
          <li>تبانی، خرید/فروش نتیجه و پرداخت خارج از پلتفرم ممنوع است.</li>
        </ul>
      </>
    ),
  },
  {
    id: "faq",
    title: "سوالات متداول",
    icon: "❓",
    content: (
      <div className="space-y-4 text-sm">
        <div><p className="font-bold text-purple-300 mb-1">چگونه در تورنومنت شرکت کنم؟</p><p>از صفحه تورنومنت‌ها، رویداد مورد نظر را انتخاب کنید، قوانین اختصاصی را بخوانید و ثبت‌نام را کامل کنید.</p></div>
        <div><p className="font-bold text-purple-300 mb-1">جوایز چطور پرداخت می‌شود؟</p><p>پس از تأیید نتیجه و نبود تخلف، جایزه به کیف پول یا روش اعلام‌شده در همان رویداد پرداخت می‌شود.</p></div>
        <div><p className="font-bold text-purple-300 mb-1">داوری چطور انجام می‌شود؟</p><p>بر اساس مدارک، گزارش کاربران، بررسی انسانی و در صورت فعال بودن تحلیل هوش مصنوعی انجام می‌شود.</p></div>
      </div>
    ),
  },
  {
    id: "tournament-guide",
    title: "راهنمای شرکت در تورنومنت",
    icon: "🎮",
    content: (
      <ol className="list-decimal pr-5 space-y-2 text-sm">
        <li>حساب بسازید و اطلاعات بازی خود را کامل کنید.</li>
        <li>تورنومنت مناسب را از لیست روم‌ها انتخاب کنید.</li>
        <li>قوانین، زمان، ظرفیت، جایزه و شرایط داوری را بخوانید.</li>
        <li>در صورت وجود ورودی، پرداخت/کسر کیف پول را کامل کنید.</li>
        <li>در زمان اعلام‌شده چک‌این کنید و مدارک نتیجه را به‌موقع ارسال کنید.</li>
      </ol>
    ),
  },
  {
    id: "wallet-guide",
    title: "راهنمای کیف پول، شارژ و برداشت",
    icon: "💰",
    content: (
      <>
        <p className="mb-3">کیف پول Flexa برای مدیریت ورودی‌ها، جوایز و تراکنش‌های داخل پلتفرم است و حساب بانکی یا سپرده سرمایه‌گذاری محسوب نمی‌شود.</p>
        <ul className="list-disc pr-5 space-y-1 text-sm">
          <li>شارژ کیف پول پس از تأیید پرداخت معتبر اعمال می‌شود.</li>
          <li>برداشت فقط به حساب متعلق به خود کاربر و پس از بررسی امنیتی انجام می‌شود.</li>
          <li>موجودی قابل استفاده و موجودی قابل برداشت ممکن است متفاوت باشد.</li>
          <li>ثبت رسید جعلی، سوءاستفاده مالی یا تلاش برای دستکاری موجودی موجب مسدودی و پیگیری می‌شود.</li>
        </ul>
      </>
    ),
  },
];

export default function LegalDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const toggleSection = (id: string) => {
    setActiveSection(activeSection === id ? null : id);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[55] max-w-[480px] mx-auto pointer-events-none">
      <div className="mx-3 mb-1 pointer-events-auto">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-center gap-2 bg-[#0f0f14] border border-white/10 rounded-2xl py-2.5 text-xs font-bold text-white/70 active:bg-white/5 transition-all shadow-lg"
        >
          <span>اطلاعات قانونی و راهنما</span>
          <span className={`text-base transition-transform ${isOpen ? "rotate-180" : ""}`}>⌄</span>
        </button>

        {isOpen && (
          <div className="mt-1 bg-[#0f0f14] border border-white/10 rounded-2xl overflow-hidden shadow-2xl max-h-[60vh] overflow-y-auto">
            {sections.map((section) => (
              <div key={section.id} className="border-b border-white/10 last:border-none">
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center justify-between px-4 py-3.5 text-right active:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{section.icon}</span>
                    <span className="font-bold text-sm">{section.title}</span>
                  </div>
                  <span className={`text-lg transition-transform ${activeSection === section.id ? "rotate-180" : ""}`}>⌄</span>
                </button>

                {activeSection === section.id && (
                  <div className="px-4 pb-5 text-white/75 text-[13px] leading-relaxed border-t border-white/10">
                    {section.content}
                  </div>
                )}
              </div>
            ))}
            <div className="p-4">
              <Link href="/rules" className="block text-center rounded-2xl bg-purple-600/20 border border-purple-400/30 text-purple-100 text-xs font-black py-3">
                مشاهده متن کامل قوانین و شرایط استفاده
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
