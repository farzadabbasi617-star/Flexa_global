import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";
export const metadata = createPageMetadata({
  title:"جدول رتبه‌بندی گیمرها | لیدربورد Flexa",
  description:"رتبه‌بندی بازیکنان Flexa بر اساس امتیاز Elo، تعداد برد و عملکرد در تورنومنت‌های کالاف دیوتی موبایل، فورتنایت و کلش رویال. بهترین گیمرهای ایران را ببین.",
  path:"/leaderboard",
  keywords:["لیدربورد گیمینگ","رتبه‌بندی گیمرها","بازیکنان برتر ایران","لیدربورد کالاف موبایل","لیدربورد فورتنایت","لیدربورد کلش رویال","رتبه‌بندی Elo","بهترین گیمر ایران","جدول امتیازات گیمینگ"],
});
export default function Layout({children}:{children:ReactNode}){return children;}
