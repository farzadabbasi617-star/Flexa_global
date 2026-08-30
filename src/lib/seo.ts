import type { Metadata } from "next";

export const SITE_URL = "https://flexa.gg";
export const SITE_NAME = "Flexa Arena | Global Esports Platform";
export const DEFAULT_OG_IMAGE = "/icons/icon-512.svg";

const RAW_SOCIAL_LINKS: string[] = [];
export const SOCIAL_LINKS: string[] = RAW_SOCIAL_LINKS.filter(
  (u) => u && !u.includes("your_")
);
export const CONTACT_EMAIL = "support@flexa.gg";

export function absoluteUrl(path = "/") {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export const GLOBAL_KEYWORDS = [
  "Flexa Arena", "Flexa Global", "flexa.gg", "esports platform",
  "Call of Duty Mobile tournament", "CODM 1v1 duels", "CODM Kill Race",
  "Clash Royale tournament", "Clash Royale golden ladder",
  "Fortnite tournament", "Fortnite zero build",
  "crypto gaming tournaments", "USDT esports prize", "TON crypto gaming",
  "AI esports referee", "automated tournament brackets", "global mobile esports",
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
    openGraph: { title, description, url, siteName: SITE_NAME, images: [{ url: absoluteUrl(image), width: 512, height: 512, alt: title }], locale: "en_US", type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [absoluteUrl(image)] },
  };
}

export const gameNamesFa: Record<string, string> = {
  clash_royale: "Clash Royale",
  cod_mobile: "Call of Duty: Mobile",
  fortnite: "Fortnite",
};
