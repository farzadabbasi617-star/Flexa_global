import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "داوری هوشمند مسابقات",
  description: "سیستم داوری هوشمند Flexa برای بررسی نتایج، مدارک مسابقات، اعتراض‌ها و جلوگیری از تقلب.",
  path: "/judging",
  keywords: ['داوری هوشمند بازی', 'داوری مسابقات', 'هوش مصنوعی گیمینگ'],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
