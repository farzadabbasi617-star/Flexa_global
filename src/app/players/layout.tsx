import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "بازیکنان Flexa",
  description: "پروفایل و آمار بازیکنان Flexa، رتبه، برد و باخت و عملکرد در مسابقات گیمینگ آنلاین.",
  path: "/players",
  keywords: ['بازیکنان Flexa', 'پروفایل گیمر', 'آمار بازیکنان'],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
