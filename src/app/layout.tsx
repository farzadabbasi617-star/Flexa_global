import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { UnreadNotificationsProvider } from "@/contexts/UnreadNotificationsContext";
import { QueryProvider } from "@/components/QueryProvider";
import { LayoutWrapper } from "@/components/LayoutWrapper";
import BrandFooter from "@/components/BrandFooter";
import { SITE_NAME, SITE_URL, absoluteUrl, SOCIAL_LINKS, CONTACT_EMAIL } from "@/lib/seo";
import Script from "next/script";

export const viewport: Viewport = {
  themeColor: "#a855f7",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const title = "Flexa | خرید اکانت بازی، تورنومنت، CP، جم، V-Bucks | Flexa";
const description =
  "Flexa (Flexa) پلتفرم ایرانی تورنومنت، خرید و فروش اکانت بازی، CP کالاف موبایل، جم کلش رویال، V-Bucks فورتنایت، اکانت PS4 و PS5 است. مسابقات COD Mobile، Fortnite، Clash Royale با داوری هوشمند و فروشگاه امن. flexa1.ir";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: title,
    template: "%s | Flexa",
  },
  description,
  keywords: [
    "Flexa","flexa","flexa1","Flexa","Flexa اسپورت",
    "تورنومنت","تورنومنت آنلاین","مسابقات بازی آنلاین","مسابقات گیمینگ",
    "تورنومنت کالاف دیوتی موبایل","تورنومنت کالاف موبایل","COD Mobile tournament",
    "خرید CP کالاف موبایل","فروش CP کالاف موبایل","خرید سی پی","فروش سی پی",
    "خرید اکانت کالاف دیوتی موبایل","فروش اکانت کالاف موبایل",
    "تورنومنت فورتنایت","مسابقات فورتنایت","Fortnite tournament",
    "خرید V-Bucks فورتنایت","فروش وی باک","خرید وی باک",
    "خرید اکانت فورتنایت","فروش اکانت فورتنایت","اکانت فول اسکین فورتنایت",
    "تورنومنت کلش رویال","مسابقات کلش رویال","Clash Royale tournament",
    "خرید جم کلش رویال","فروش جم کلش رویال","خرید جم","فروش جم",
    "خرید اکانت کلش رویال","فروش اکانت کلش رویال",
    "خرید اکانت PS4","فروش اکانت PS4","خرید اکانت PS5","فروش اکانت PS5",
    "اکانت پلی استیشن","خرید بازی PS4","خرید بازی PS5","فروش بازی پلی استیشن",
    "خرید اکانت بازی","فروش اکانت بازی","خرید اسکین","فروش اسکین","خرید گان",
    "داوری هوشمند بازی","لیگ گیمینگ ایران","گیمینگ ایران",
  ],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Flexa",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
  alternates: {
    canonical: SITE_URL,
  },
  icons: {
    icon: [
      { url: "/icons/flexa-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/flexa-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/flexa-icon-180.png", sizes: "180x180" },
    ],
    shortcut: "/icons/flexa-icon-192.png",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    title,
    description,
    url: SITE_URL,
    siteName: SITE_NAME,
    images: [
      {
        url: absoluteUrl("/icons/flexa-logo-square.png"),
        width: 512,
        height: 512,
        alt: "Flexa - Flexa",
      },
    ],
    locale: "fa_IR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [absoluteUrl("/icons/flexa-logo-square.png")],
  },
};

// One connected entity graph (linked via @id) so Google treats the
// Organization, WebSite and WebApplication as a single brand entity — the
// strongest signal for ranking the brand query «Flexa» to the official site.
const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": ORG_ID,
      name: "Flexa",
      alternateName: ["Flexa", "Flexa", "Flexa1", "Flexa اسپورت"],
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: absoluteUrl("/icons/flexa-logo-square.png"),
        width: 512,
        height: 512,
      },
      image: absoluteUrl("/icons/flexa-logo-square.png"),
      description:
        "Flexa (Flexa) یک برند و پلتفرم آنلاین برای برگزاری و شرکت در تورنومنت‌های گیمینگ و ورزش‌های الکترونیک در ایران است.",
      email: CONTACT_EMAIL,
      foundingDate: "2025",
      ...(SOCIAL_LINKS.length ? { sameAs: SOCIAL_LINKS } : {}),
    },
    {
      "@type": "WebSite",
      "@id": SITE_ID,
      url: SITE_URL,
      name: "Flexa",
      alternateName: ["Flexa", "Flexa", "Flexa1"],
      inLanguage: "fa-IR",
      publisher: { "@id": ORG_ID },
      about: { "@id": ORG_ID },
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#webapp`,
      name: "Flexa",
      alternateName: ["Flexa", "Flexa"],
      url: SITE_URL,
      applicationCategory: "GameApplication",
      operatingSystem: "Web, Android, iOS",
      inLanguage: "fa-IR",
      description,
      publisher: { "@id": ORG_ID },
      offers: { "@type": "Offer", price: "0", priceCurrency: "IRR" },
    },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/flexa-icon-180.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/flexa-icon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/flexa-icon-16.png" />
        <link rel="icon" href="/icons/flexa-icon-192.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        {/* Load Telegram WebApp Javascript library securely */}
        <script src="https://telegram.org/js/telegram-web-app.js" async></script>
      </head>
      <body className="text-white antialiased font-gaming min-h-screen">
        <QueryProvider>
          <AuthProvider>
            <UnreadNotificationsProvider>
              <LanguageProvider>
                <LayoutWrapper>{children}</LayoutWrapper>
              </LanguageProvider>
            </UnreadNotificationsProvider>
          </AuthProvider>
        </QueryProvider>
        <BrandFooter />
      </body>
    </html>
  );
}
