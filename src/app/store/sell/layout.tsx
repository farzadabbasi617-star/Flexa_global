import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "فروش اکانت بازی | ثبت آگهی فروش امن در Flexa",
  description:
    "اکانت کالاف موبایل، فورتنایت یا کلش رویال خود را در Flexa به‌صورت امن بفروش؛ ثبت آگهی با احراز هویت، خرید امانی (اسکرو) و پرداخت مطمئن به فروشنده.",
  path: "/store/sell",
  keywords: [
    "فروش اکانت بازی",
    "فروش اکانت کالاف موبایل",
    "فروش اکانت فورتنایت",
    "فروش اکانت کلش رویال",
    "ثبت آگهی فروش اکانت",
    "فروش امن اکانت گیمینگ",
  ],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
