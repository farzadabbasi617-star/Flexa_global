import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "راهنمای کیف پول Flexa",
  description: "آموزش استفاده از کیف پول Flexa، شارژ، برداشت و پیگیری تراکنش‌های مربوط به مسابقات و جوایز.",
  path: "/guide/wallet",
  keywords: ['راهنمای کیف پول', 'برداشت جایزه', 'شارژ حساب Flexa'],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
