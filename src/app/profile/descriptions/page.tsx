import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import { SITE_URL } from "@/lib/seo";

// Real FAQ used both for the on-page accordion and the FAQPage rich-result schema.
const faqs = [
  {
    question: "Flexa چیست و چه کاری انجام می‌دهد؟",
    answer:
      "Flexa یک پلتفرم ایرانی برای برگزاری و شرکت در تورنومنت‌های گیمینگ است. می‌توانی روم‌های فعال بازی‌هایی مثل کالاف دیوتی موبایل، فورتنایت و کلش رویال را ببینی، در آن‌ها ثبت‌نام کنی، با داوری قابل‌پیگیری برای رتبه و جایزه رقابت کنی و در فروشگاه امن، اکانت و ارز بازی خرید و فروش کنی.",
  },
  {
    question: "چطور در یک تورنومنت ثبت‌نام کنم؟",
    answer:
      "ابتدا حساب بساز و پروفایل بازیکن را کامل کن. سپس از صفحه‌ی تورنومنت‌ها بازی مورد نظر را فیلتر کن، ظرفیت، ورودی، جایزه و قوانین مسابقه را بررسی کن و روی ثبت‌نام بزن. در زمان اعلام‌شده وارد لابی می‌شوی و نتیجه را ثبت می‌کنی.",
  },
  {
    question: "داوری هوشمند Flexa چطور کار می‌کند؟",
    answer:
      "در Flexa ثبت نتیجه، بررسی مدارک (اسکرین‌شات/ویدیو) و رسیدگی به اعتراض‌ها به‌صورت شفاف و قابل‌پیگیری انجام می‌شود. این مسیر کمک می‌کند تصمیم نهایی درباره‌ی برنده و جایزه دقیق‌تر و منصفانه‌تر باشد.",
  },
  {
    question: "آیا خرید و فروش اکانت در Flexa امن است؟",
    answer:
      "بله. فروشگاه Flexa از خرید امانی (اسکرو) استفاده می‌کند؛ یعنی مبلغ خریدار تا زمان تأیید تحویل نزد پلتفرم نگه داشته می‌شود و بعد به فروشنده پرداخت می‌گردد. فروشندگان احراز هویت می‌شوند و خریدار می‌تواند قیمت پیشنهاد بدهد تا فروشنده قبول یا رد کند.",
  },
  {
    question: "چطور قیمت اکانت بازی‌ام را بفهمم؟",
    answer:
      "از ابزار «تخمین قیمت اکانت» در فروشگاه استفاده کن. با وارد کردن آیتم‌ها، لول، ریجن و وضعیت امنیت اکانت، یک بازه‌ی قیمت منصفانه بر اساس بازار به تو پیشنهاد می‌شود.",
  },
  {
    question: "برای برداشت جایزه چه باید بکنم؟",
    answer:
      "جوایز و درآمد فروش به کیف پول حساب کاربری‌ات اضافه می‌شود و از بخش کیف پول می‌توانی درخواست برداشت بدهی. راهنمای کامل در صفحه‌ی راهنمای کیف پول موجود است.",
  },
];

const gameLinks = [
  {
    href: "/games/call-of-duty-mobile",
    title: "تورنومنت کالاف موبایل",
    desc: "مسابقات آنلاین COD Mobile با ثبت‌نام سریع، داوری منصفانه و جوایز واقعی.",
    color: "border-orange-400/10 hover:border-orange-400/30",
  },
  {
    href: "/games/fortnite",
    title: "تورنومنت فورتنایت",
    desc: "رقابت‌های فورتنایت با قوانین مشخص، زمان‌بندی منظم و صفحه اختصاصی مسابقه.",
    color: "border-purple-400/10 hover:border-purple-400/30",
  },
  {
    href: "/games/clash-royale",
    title: "تورنومنت کلش رویال",
    desc: "مسابقات Clash Royale برای بازیکنان رقابتی، ثبت نتیجه و رتبه‌بندی بهتر.",
    color: "border-cyan-400/10 hover:border-cyan-400/30",
  },
];

export default function ProfileDescriptionsPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Flexa", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "توضیحات و راهنما", item: `${SITE_URL}/profile/descriptions` },
    ],
  };

  return (
    <div className="min-h-screen bg-[#050508] text-white relative overflow-x-hidden">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,_rgba(92,0,160,.68)_0%,_rgba(32,0,56,.42)_34%,_transparent_72%)]" />
        <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-purple-700/20 blur-[80px]" />
      </div>

      <main className="relative z-10 max-w-[760px] mx-auto px-4 sm:px-5 py-6 sm:py-8" style={{ paddingBottom: "var(--bottom-nav-space)" }} dir="rtl">
        <Link href="/profile" className="inline-flex items-center gap-2 text-xs text-gray-400 hover:text-white mb-5">
          ← بازگشت به تنظیمات
        </Link>

        <header className="glass-panel rounded-[30px] p-4 sm:p-6 border border-purple-400/15 mb-6 overflow-hidden relative">
          <div className="absolute -top-12 -left-12 w-40 h-40 rounded-full bg-purple-500/20 blur-3xl" />
          <div className="relative text-right">
            <span className="inline-flex mb-3 px-3 py-1 rounded-full bg-purple-500/15 border border-purple-400/20 text-purple-200 text-[10px] font-black">
              توضیحات و راهنمای Flexa
            </span>
            <h1 className="text-3xl sm:text-4xl font-black leading-tight mb-4">
              Flexa چطور کار می‌کند؟
            </h1>
            <p className="text-sm sm:text-base leading-8 text-gray-300">
              Flexa پلتفرم ایرانی مدیریت و شرکت در تورنومنت‌های گیمینگ است؛ روم‌های فعال را ببین، قوانین و جوایز را بررسی کن، ثبت‌نام کن و با سیستم داوری قابل پیگیری برای رتبه و جایزه رقابت کن.
            </p>
            <p className="text-sm sm:text-base leading-8 text-gray-300 mt-4">
              فرقی نمی‌کند بازیکن کالاف دیوتی موبایل باشی، فورتنایت یا کلش رویال؛ Flexa همه‌چیز را در یک مسیر شفاف جمع کرده است:
              ثبت‌نام سریع در مسابقه، قوانین روشن، لابی منظم، ثبت نتیجه و داوری هوشمند، جدول رتبه‌بندی بازیکنان و تیم‌ها،
              تالار افتخارات برای اخبار و دستاوردها، و یک فروشگاه امن برای خرید و فروش اکانت و ارز بازی با پرداخت امانی.
              هدف Flexa ساختن یک فضای رقابتی سالم، قابل‌اعتماد و حرفه‌ای برای جامعه‌ی گیمرهای ایرانی است.
            </p>
            <div className="flex flex-wrap gap-3 mt-6">
              <Link href="/tournaments" className="gaming-btn text-sm">مشاهده تورنومنت‌های فعال</Link>
              <Link href="/guide/tournaments" className="px-5 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-black hover:bg-white/10 transition">راهنمای شرکت در مسابقه</Link>
            </div>
          </div>
        </header>

        <section className="glass-panel rounded-[30px] p-4 sm:p-6 border border-white/10 mb-6">
          <h2 className="text-xl sm:text-2xl font-black mb-4">مسابقات کالاف موبایل، فورتنایت و کلش رویال در یک پلتفرم</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4"><div className="text-2xl mb-2">🏆</div><div className="text-xs font-black text-gray-300">تورنومنت‌های آنلاین</div></div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4"><div className="text-2xl mb-2">⚖️</div><div className="text-xs font-black text-gray-300">داوری هوشمند</div></div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4"><div className="text-2xl mb-2">📊</div><div className="text-xs font-black text-gray-300">رتبه‌بندی بازیکنان</div></div>
          </div>
        </section>

        <section className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-black">مسابقات محبوب Flexa</h2>
            <Link href="/tournaments" className="text-xs font-black text-purple-300">مشاهده همه</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {gameLinks.map((item) => (
              <Link key={item.href} href={item.href} className={`glass-panel rounded-3xl p-5 border transition-all block ${item.color}`}>
                <h3 className="font-black text-lg mb-2">{item.title}</h3>
                <p className="text-xs leading-6 text-gray-400">{item.desc}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-[.9fr_1.1fr] gap-5 mb-6">
          <article className="glass-panel rounded-3xl p-6 border border-white/10 text-right">
            <h2 className="text-xl sm:text-2xl font-black mb-4">چطور در Flexa شروع کنم؟</h2>
            <ol className="space-y-4 text-sm leading-7 text-gray-300 list-decimal list-inside">
              <li>از بخش تورنومنت‌ها، بازی مورد علاقه‌ات را انتخاب کن.</li>
              <li>ظرفیت، زمان شروع، ورودی، جایزه و قوانین مسابقه را بررسی کن.</li>
              <li>حساب بساز، پروفایل بازیکن را کامل کن و در روم مناسب ثبت‌نام کن.</li>
              <li>در زمان اعلام‌شده وارد لابی شو، نتیجه را ثبت کن و در رتبه‌بندی بالا برو.</li>
            </ol>
          </article>

          <article className="glass-panel rounded-3xl p-6 border border-white/10 text-right">
            <h2 className="text-xl sm:text-2xl font-black mb-4">چرا گیمرها به Flexa نیاز دارند؟</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white/5 border border-white/5 p-4"><h3 className="font-black mb-2 text-purple-200">مسابقه منظم</h3><p className="text-xs leading-6 text-gray-400">اطلاعات هر تورنومنت، زمان شروع، ظرفیت و قوانین در یک صفحه قابل پیگیری است.</p></div>
              <div className="rounded-2xl bg-white/5 border border-white/5 p-4"><h3 className="font-black mb-2 text-cyan-200">داوری قابل اعتماد</h3><p className="text-xs leading-6 text-gray-400">ثبت نتیجه، بررسی مدارک و مدیریت اعتراض‌ها شفاف‌تر و حرفه‌ای‌تر انجام می‌شود.</p></div>
              <div className="rounded-2xl bg-white/5 border border-white/5 p-4"><h3 className="font-black mb-2 text-green-200">رشد رتبه بازیکن</h3><p className="text-xs leading-6 text-gray-400">آمار بازیکنان، برد و باخت و امتیازها در پروفایل و جدول رتبه‌بندی بهتر دیده می‌شود.</p></div>
              <div className="rounded-2xl bg-white/5 border border-white/5 p-4"><h3 className="font-black mb-2 text-orange-200">جامعه رقابتی</h3><p className="text-xs leading-6 text-gray-400">Flexa برای ساختن یک مسیر رقابتی سالم برای گیمرهای ایرانی طراحی شده است.</p></div>
            </div>
          </article>
        </section>

        <section className="glass-panel rounded-3xl p-5 sm:p-6 border border-white/10 text-right mb-6">
          <h2 className="text-xl sm:text-2xl font-black mb-5">سوالات پرتکرار درباره‌ی Flexa</h2>
          <div className="space-y-3">
            {faqs.map((f) => (
              <details key={f.question} className="group rounded-2xl bg-white/5 border border-white/10 p-4 open:border-purple-400/30">
                <summary className="cursor-pointer list-none flex items-center justify-between gap-3 font-black text-white">
                  <span>{f.question}</span>
                  <span className="text-purple-300 transition-transform group-open:rotate-45">＋</span>
                </summary>
                <p className="mt-3 text-sm leading-7 text-gray-300">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="glass-panel rounded-3xl p-5 sm:p-6 border border-white/10 text-right">
          <h2 className="text-xl sm:text-2xl font-black mb-4">دسترسی سریع به بخش‌های مهم</h2>
          <div className="flex flex-wrap gap-3">
            <Link href="/tournaments" className="px-4 py-2 rounded-full bg-purple-500/15 text-purple-200 text-sm font-black border border-purple-400/20">تورنومنت‌های فعال</Link>
            <Link href="/leaderboard" className="px-4 py-2 rounded-full bg-white/5 text-gray-300 text-sm font-black border border-white/10">جدول رتبه‌بندی</Link>
            <Link href="/players" className="px-4 py-2 rounded-full bg-white/5 text-gray-300 text-sm font-black border border-white/10">بازیکنان</Link>
            <Link href="/teams" className="px-4 py-2 rounded-full bg-white/5 text-gray-300 text-sm font-black border border-white/10">تیم‌های گیمینگ</Link>
            <Link href="/honors" className="px-4 py-2 rounded-full bg-white/5 text-gray-300 text-sm font-black border border-white/10">تالار افتخارات</Link>
            <Link href="/store" className="px-4 py-2 rounded-full bg-white/5 text-gray-300 text-sm font-black border border-white/10">فروشگاه اکانت</Link>
            <Link href="/store/price-estimate" className="px-4 py-2 rounded-full bg-white/5 text-gray-300 text-sm font-black border border-white/10">تخمین قیمت اکانت</Link>
            <Link href="/rules" className="px-4 py-2 rounded-full bg-white/5 text-gray-300 text-sm font-black border border-white/10">قوانین مسابقات</Link>
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
