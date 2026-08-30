import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "حساب کاربری Flexa",
  description: "صفحه حساب کاربری و بخش خصوصی Flexa.",
  path: "/admin",
  noIndex: true,
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
