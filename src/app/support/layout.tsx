import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "پشتیبانی Flexa",
  description: "ارسال درخواست پشتیبانی و پیگیری مشکلات حساب، کیف پول، ثبت‌نام و مسابقات در Flexa.",
  path: "/support",
  keywords: ['پشتیبانی Flexa', 'مشکل حساب', 'پشتیبانی مسابقات'],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
