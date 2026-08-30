import type { ReactNode } from "react";
import { createPageMetadata, SITE_URL } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "سوالات متداول Flexa",
  description: "پاسخ سوالات متداول درباره ثبت‌نام در تورنومنت‌ها، پرداخت جوایز، کیف پول، داوری و قوانین Flexa.",
  path: "/faq",
  keywords: ['سوالات متداول Flexa', 'راهنمای تورنومنت', 'پرسش و پاسخ'],
});

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "چگونه در تورنومنت شرکت کنم؟",
      acceptedAnswer: {
        "@type": "Answer",
        text: "از صفحه اصلی یا منوی تورنومنت‌ها، بازی مورد نظر را انتخاب کنید. سپس روم دلخواه را باز کرده و روی دکمه شرکت در مسابقه کلیک کنید.",
      },
    },
    {
      "@type": "Question",
      name: "جوایز چطور پرداخت می‌شود؟",
      acceptedAnswer: {
        "@type": "Answer",
        text: "پس از پایان تورنومنت و تأیید نتایج، جوایز به کیف پول داخل اپلیکیشن واریز می‌شود و امکان برداشت وجود دارد.",
      },
    },
    {
      "@type": "Question",
      name: "داوری چطور انجام می‌شود؟",
      acceptedAnswer: {
        "@type": "Answer",
        text: "داوری با ترکیبی از هوش مصنوعی و بررسی انسانی انجام می‌شود. موارد مشکوک توسط داور انسانی بررسی نهایی می‌شوند.",
      },
    },
  ],
  url: `${SITE_URL}/faq`,
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {children}
    </>
  );
}
