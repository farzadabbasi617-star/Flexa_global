import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

// Private user page — kept out of the search index.
export const metadata = createPageMetadata({
  title: "سفارش‌های من | فروشگاه Flexa",
  description: "پیگیری سفارش‌ها و پیشنهادهای قیمت در فروشگاه Flexa.",
  path: "/store/orders",
  noIndex: true,
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
