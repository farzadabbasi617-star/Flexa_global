"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";

const faqs = [
  {
    q: "چگونه در تورنومنت شرکت کنم؟",
    a: "از صفحه اصلی یا منوی تورنومنت‌ها، بازی مورد نظر را انتخاب کنید. سپس روم دلخواه را باز کرده و روی دکمه «شرکت در مسابقه» کلیک کنید.",
  },
  {
    q: "جوایز چطور پرداخت می‌شود؟",
    a: "پس از پایان تورنومنت و تأیید نتایج، جوایز به‌صورت خودکار به کیف پول داخل اپلیکیشن واریز می‌شود. می‌توانید آن را به حساب بانکی برداشت کنید.",
  },
  {
    q: "حداقل مبلغ برداشت چقدر است؟",
    a: "حداقل مبلغ برداشت از کیف پول ۵۰٬۰۰۰ USDT است.",
  },
  {
    q: "داوری چطور انجام می‌شود؟",
    a: "ترکیبی از هوش مصنوعی و بررسی انسانی. موتور AI نتایج را تحلیل می‌کند و در موارد مشکوک، داور انسانی بررسی نهایی را انجام می‌دهد.",
  },
  {
    q: "آیا می‌توانم چند حساب داشته باشم؟",
    a: "خیر. هر کاربر فقط مجاز به داشتن یک حساب است. داشتن چند حساب منجر به مسدود شدن دائمی می‌شود.",
  },
];

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-[#050508] text-white">
      <Navbar />
      <main className="pb-24">
        <div className="max-w-[480px] mx-auto px-6 pt-12">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">❓</span>
            <h1 className="text-3xl font-black">سوالات متداول</h1>
          </div>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, index) => (
            <div key={index} className="glass-panel rounded-3xl border border-white/10 overflow-hidden">
              <button
                onClick={() => toggle(index)}
                className="w-full flex justify-between items-center px-6 py-5 text-right active:bg-white/5 transition"
              >
                <span className="font-bold pr-4">{faq.q}</span>
                <span className={`text-xl transition-transform flex-shrink-0 ${openIndex === index ? "rotate-180" : ""}`}>
                  ⌄
                </span>
              </button>
              {openIndex === index && (
                <div className="px-6 pb-6 text-sm text-white/80 leading-relaxed border-t border-white/10 pt-4">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      </main>

      <BottomNav />
    </div>
  );
}
