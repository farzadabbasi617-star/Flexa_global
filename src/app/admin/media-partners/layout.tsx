import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";
export const metadata = createPageMetadata({ title: "مدیریت رسانه‌ها", description: "مدیریت شرکای رسانه‌ای و تسویه همکاری Flexa", path: "/admin/media-partners", noIndex: true });
export default function Layout({ children }: { children: ReactNode }) { return children; }
