import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";
export const metadata = createPageMetadata({
  title:"تورنومنت‌های گیمینگ | مسابقات کالاف، فورتنایت، کلش رویال | Flexa",
  description:"تورنومنت‌های آنلاین Flexa — مسابقات کالاف دیوتی موبایل، فورتنایت و کلش رویال با جوایز واقعی، داوری هوشمند، ثبت‌نام سریع و لابی اختصاصی.",
  path:"/tournaments",
  keywords:["تورنومنت گیمینگ","تورنومنت آنلاین","تورنومنت کالاف دیوتی موبایل","مسابقات کالاف موبایل","COD Mobile tournament","تورنومنت فورتنایت","مسابقات فورتنایت","Fortnite tournament","تورنومنت کلش رویال","مسابقات کلش رویال","Clash Royale tournament","جایزه تورنومنت","ثبت‌نام تورنومنت","رقابت آنلاین بازی موبایل","لیگ گیمینگ"],
});
export default function Layout({children}:{children:ReactNode}){return children;}
