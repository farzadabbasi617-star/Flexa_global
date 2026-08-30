import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "COD Arena | کاستوم‌روم‌های کالاف موبایل Flexa",
  description: "کاستوم‌روم‌های امن Call of Duty Mobile برای Global و Garena؛ جایزه Kill و جایگاه، Check-in، مدرک ضدچیت و تسویه شفاف.",
  path: "/cod-arena",
  keywords: ["کاستوم روم کالاف", "مسابقات کالاف موبایل", "COD Mobile custom room", "COD Arena", "Flexa"],
});

export default function CodArenaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
