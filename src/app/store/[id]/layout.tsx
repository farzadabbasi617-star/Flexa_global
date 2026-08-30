import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "آگهی فروش اکانت بازی | فروشگاه Flexa",
  description:
    "مشاهده‌ی جزئیات آگهی فروش اکانت بازی در فروشگاه امن Flexa؛ خرید امانی (اسکرو)، مشخصات اکانت، امتیاز فروشنده و امکان پیشنهاد قیمت.",
  path: "/store",
  keywords: ["خرید اکانت بازی", "آگهی فروش اکانت", "خرید امن اکانت گیمینگ"],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
