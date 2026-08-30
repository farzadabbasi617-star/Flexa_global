import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "قوانین Flexa",
  description: "قوانین شرکت در تورنومنت‌های Flexa، شرایط ثبت نتیجه، رفتار بازیکنان، اعتراض‌ها و داوری مسابقات.",
  path: "/rules",
  keywords: ['قوانین تورنومنت', 'قوانین Flexa', 'قوانین مسابقات بازی'],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
