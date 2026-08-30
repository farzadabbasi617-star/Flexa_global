import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "تماس با Flexa",
  description: "راه‌های ارتباط با تیم Flexa برای پشتیبانی، همکاری، گزارش مشکل و سوالات مربوط به مسابقات.",
  path: "/contact",
  keywords: ['تماس با Flexa', 'پشتیبانی Flexa', 'ارتباط با Flexa'],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
