import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "تیم‌های گیمینگ",
  description: "مشاهده و ساخت تیم‌های گیمینگ در Flexa برای شرکت گروهی در تورنومنت‌ها و رقابت‌های آنلاین.",
  path: "/teams",
  keywords: ['تیم گیمینگ', 'تیم esport', 'تورنومنت تیمی'],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
