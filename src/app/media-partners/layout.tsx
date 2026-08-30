import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "همکاری رسانه‌ای با Flexa",
  description: "داشبورد همکاری رسانه‌ای Flexa، لینک معرفی، قرارداد و گزارش کمیسیون Matchهای پولی.",
  path: "/media-partners",
  noIndex: true,
});

export default function MediaPartnersLayout({ children }: { children: ReactNode }) {
  return children;
}
