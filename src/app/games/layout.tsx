import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";
export const metadata = createPageMetadata({
  title:"بازی‌های Flexa | کالاف موبایل، فورتنایت، کلش رویال | تورنومنت و فروشگاه",
  description:"صفحه‌های اختصاصی بازی‌های Flexa — تورنومنت کالاف دیوتی موبایل، فورتنایت و کلش رویال. خرید و فروش اکانت، CP، جم، V-Bucks و مسابقات آنلاین در یک پلتفرم فارسی.",
  path:"/games",
  keywords:["بازی‌های Flexa","کالاف دیوتی موبایل","فورتنایت","کلش رویال","تورنومنت کالاف موبایل","تورنومنت فورتنایت","تورنومنت کلش رویال","خرید اکانت کالاف موبایل","خرید اکانت فورتنایت","خرید اکانت کلش رویال","COD Mobile","Fortnite","Clash Royale","مسابقات موبایل ایران"],
});
export default function Layout({children}:{children:ReactNode}){return children;}
