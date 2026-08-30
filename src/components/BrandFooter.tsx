import Link from "next/link";
import EnamadSeal from "@/components/EnamadSeal";

/**
 * Server-rendered brand footer present on every page.
 *
 * Purpose (brand SEO): put a clear, keyword-disambiguating description of the
 * brand «Flexa / Flexa» in the INITIAL HTML of every page, with an internal
 * link whose anchor text is exactly «Flexa» pointing to the homepage. This
 * strongly reinforces to Google that this site is the official home of the
 * entity «Flexa» (a platform/brand), separating it from the generic term
 * «گیم‌نت» (gaming café).
 *
 * It sits above the fixed bottom navigation, so it uses the same bottom spacing.
 */
export default function BrandFooter() {
  return (
    <footer
      dir="rtl"
      className="relative z-10 border-t border-white/10 bg-[#050508] text-gray-400"
      style={{ paddingBottom: "var(--bottom-nav-space)" }}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xl">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/flexa-icon-192.png" alt="Flexa" className="h-8 w-8 object-contain" />
              <Link href="/" className="text-lg font-black text-white hover:text-purple-300">
                Flexa
              </Link>
            </div>
            <p className="mt-3 text-xs leading-7">
              <Link href="/" className="font-bold text-gray-300 hover:text-white">Flexa</Link>{" "}
              (Flexa) یک برند و پلتفرم ایرانی برای برگزاری و شرکت در تورنومنت‌های آنلاین بازی و
              ورزش‌های الکترونیک است. در Flexa می‌توانید در مسابقات کالاف دیوتی موبایل، فورتنایت و
              کلش رویال شرکت کنید، اکانت و ارز بازی را به‌صورت امن خرید و فروش کنید و رتبه‌ی خود را
              در جدول بازیکنان بالا ببرید. وب‌سایت رسمی Flexa: www.flexa1.ir
            </p>
          </div>

          <nav className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs sm:text-right">
            <Link href="/tournaments" className="hover:text-white">تورنومنت‌های Flexa</Link>
            <Link href="/store" className="hover:text-white">فروشگاه Flexa</Link>
            <Link href="/leaderboard" className="hover:text-white">جدول رتبه‌بندی</Link>
            <Link href="/honors" className="hover:text-white">تالار افتخارات</Link>
            <Link href="/about" className="hover:text-white">درباره Flexa</Link>
            <Link href="/contact" className="hover:text-white">تماس با Flexa</Link>
            <Link href="/faq" className="hover:text-white">سوالات متداول</Link>
            <Link href="/rules" className="hover:text-white">قوانین مسابقات</Link>
          </nav>
        </div>

        {/* Trust seal. e-Namad requires it to be reachable from every page and
            to link out to their verification page, so it lives in the footer. */}
        <div className="mt-6 flex flex-col items-center gap-3 border-t border-white/5 pt-6 sm:flex-row-reverse sm:items-center sm:justify-between">
          <EnamadSeal />
          <p className="text-center text-[11px] leading-6 text-gray-500 sm:text-right">
            © {new Date().getFullYear()} Flexa | Flexa — پلتفرم تورنومنت‌های گیمینگ. تمامی حقوق محفوظ است.
          </p>
        </div>
      </div>
    </footer>
  );
}
