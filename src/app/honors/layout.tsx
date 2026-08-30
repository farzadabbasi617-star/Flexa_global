import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";
export const metadata = createPageMetadata({
  title:"اخبار گیمینگ | اخبار کالاف، فورتنایت، کلش رویال، PS4 و PS5 | Flexa",
  description:"آخرین اخبار گیمینگ، قهرمانان تورنومنت، آپدیت‌های بازی و رویدادهای کالاف دیوتی موبایل، فورتنایت، کلش رویال و PS4/PS5 در Flexa.",
  path:"/honors",
  keywords:["اخبار گیمینگ","اخبار کالاف موبایل","اخبار فورتنایت","اخبار کلش رویال","اخبار PS4","اخبار PS5","قهرمانان تورنومنت","آپدیت بازی","رویدادهای گیمینگ ایران","اخبار ورزش الکترونیک"],
});
export default function Layout({children}:{children:ReactNode}){return children;}
