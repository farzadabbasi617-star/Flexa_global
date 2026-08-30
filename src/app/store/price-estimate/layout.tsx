import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "تخمین قیمت اکانت بازی | ارزش‌گذاری هوشمند اکانت",
  description:
    "قیمت اکانت کالاف دیوتی موبایل، فورتنایت و کلش رویال را رایگان و هوشمند تخمین بزن؛ ارزش‌گذاری بر اساس آیتم‌ها، لول، ریجن و امنیت اکانت به‌همراه بازه‌ی قیمت منصفانه.",
  path: "/store/price-estimate",
  keywords: [
    "تخمین قیمت اکانت بازی",
    "قیمت اکانت کالاف موبایل",
    "قیمت اکانت فورتنایت",
    "قیمت اکانت کلش رویال",
    "ارزش‌گذاری اکانت بازی",
    "محاسبه قیمت اکانت",
    "قیمت‌گذاری اکانت گیمینگ",
  ],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
