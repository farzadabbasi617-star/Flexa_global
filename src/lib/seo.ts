import type { Metadata } from "next";

export const SITE_URL = "https://www.flexa1.ir";
export const SITE_NAME = "Flexa | Flexa";
export const DEFAULT_OG_IMAGE = "/icons/flexa-icon-192.png";

const RAW_SOCIAL_LINKS: string[] = [];
export const SOCIAL_LINKS: string[] = RAW_SOCIAL_LINKS.filter(
  (u) => u && !u.includes("your_")
);
export const CONTACT_EMAIL = "support@flexa1.ir";

export function absoluteUrl(path = "/") {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export const GLOBAL_KEYWORDS = [
  "Flexa","flexa","flexa1","Flexa","Flexa اسپورت",
  "تورنومنت","تورنومنت آنلاین","مسابقات بازی آنلاین","مسابقات گیمینگ","تورنومنت گیمینگ ایران",
  "تورنومنت کالاف دیوتی موبایل","تورنومنت کالاف موبایل","مسابقات کالاف دیوتی موبایل","COD Mobile tournament",
  "خرید CP کالاف موبایل","فروش CP کالاف موبایل","خرید سی پی","فروش سی پی",
  "خرید اکانت کالاف دیوتی موبایل","فروش اکانت کالاف موبایل",
  "تورنومنت فورتنایت","مسابقات فورتنایت","Fortnite tournament",
  "خرید V-Bucks فورتنایت","فروش وی باک","خرید وی باک","vbucks ارزان",
  "خرید اکانت فورتنایت","فروش اکانت فورتنایت","اکانت فول اسکین فورتنایت",
  "تورنومنت کلش رویال","مسابقات کلش رویال","Clash Royale tournament",
  "خرید جم کلش رویال","فروش جم کلش رویال","خرید جم","فروش جم",
  "خرید اکانت کلش رویال","فروش اکانت کلش رویال","اکانت کلش رویال ماکس",
  "خرید اکانت PS4","فروش اکانت PS4","خرید اکانت PS5","فروش اکانت PS5",
  "اکانت پلی استیشن","خرید بازی PS4","خرید بازی PS5","فروش بازی پلی استیشن",
  "خرید اکانت بازی","فروش اکانت بازی","فروشگاه اکانت بازی","خرید و فروش اکانت",
  "خرید اسکین","فروش اسکین","خرید گان","ارز داخل بازی",
  "داوری هوشمند بازی","لیگ گیمینگ ایران","گیمینگ ایران",
];

export function createPageMetadata({
  title, description, path, keywords = [], image = DEFAULT_OG_IMAGE, noIndex = false,
}: {
  title: string; description: string; path: string;
  keywords?: string[]; image?: string; noIndex?: boolean;
}): Metadata {
  const url = absoluteUrl(path);
  return {
    title, description,
    keywords: [...new Set([...keywords, ...GLOBAL_KEYWORDS])].slice(0, 50),
    alternates: { canonical: url },
    robots: noIndex
      ? { index: false, follow: false, nocache: true }
      : { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
    openGraph: { title, description, url, siteName: SITE_NAME, images: [{ url: absoluteUrl(image), width: 512, height: 512, alt: title }], locale: "fa_IR", type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [absoluteUrl(image)] },
  };
}

export const gameNamesFa: Record<string, string> = {
  clash_royale: "کلش رویال",
  cod_mobile: "کالاف دیوتی موبایل",
  fortnite: "فورتنایت",
};
