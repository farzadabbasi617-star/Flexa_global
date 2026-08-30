export type StaticHonor = {
  id: string;
  type: string;
  icon: string;
  title: string;
  description: string;
  time?: string;
  prize?: string;
  username?: string;
  level?: number;
  highlight?: boolean;
  image?: string;
  imageAlt?: string;
  summary?: string;
  seoKeywords?: string[];
  readTimeMinutes?: number;
  sources?: Array<{ title: string; link: string; source: string; pubDate?: string | null }>;
  game?: string;
  publishedAt?: string;
  createdAt?: string;
  htmlUrl?: string;
  galleryImages?: Array<{ src: string; alt: string }>;
};

export const STATIC_HONORS: StaticHonor[] = [
  {
    id: "cod-mobile-season-6-arcade-ltm-rewards-fa",
    type: "news",
    icon: "📰",
    title: "آرکید به کالاف دیوتی موبایل می‌آید؛ مودهای محدود، مأموریت‌های ویژه و جوایز فصل ۶",
    description: `فصل ۶ کالاف دیوتی موبایل با یک تغییر مهم در لابی و رابط کاربری بخش‌های Multiplayer و Battle Royale همراه است: بخش جدید Arcade. این قابلیت قرار است مودهای محدود زمانی و رویدادهای مرتبط را در یک فضای مرتب‌تر و قابل‌فهم‌تر نمایش دهد تا بازیکن‌ها سریع‌تر بتوانند حالت‌های ویژه فصل را پیدا کنند و سراغ مأموریت‌های مخصوص همان مودها بروند.

در نسخه اول Arcade، تمرکز اصلی روی Limited Time Modes است؛ یعنی مودهایی که برای مدت محدود فعال می‌شوند و معمولاً با چالش‌ها و پاداش‌های خاص همراه هستند. برای فصل ۶، دو مود Plunder Treasure Hunt و Throwable Frenzy به‌عنوان محور اصلی Arcade معرفی شده‌اند. بازیکن‌ها با تجربه این دو حالت می‌توانند مأموریت‌های اختصاصی Arcade را کامل کنند و به بیش از دوازده پاداش مرحله‌ای دسترسی داشته باشند.

از مهم‌ترین جوایز اعلام‌شده می‌توان به Konig - The Wolf، اسکین DRH - Fiercest و Lachman-556 - Catwalker اشاره کرد. این پاداش‌ها مخصوص فعالیت در Arcade هستند و نشان می‌دهند کالاف موبایل قصد دارد در فصل‌های آینده Arcade را به یک بخش جدی‌تر برای رویدادها، چالش‌های کوتاه‌مدت و جایزه‌های اختصاصی تبدیل کند.

در کنار Arcade، چند Draw و Offer قدیمی هم در طول فصل برمی‌گردند. برنامه فعلی شامل The Chariot Draw از ۷ تا ۲۰ جولای، Required Draw از ۱۲ تا ۲۰ جولای، Ion Pulse Mythic Drop از ۱۷ جولای تا پایان فصل، Eternal Divinity Draw از ۱۹ جولای تا پایان فصل، Fuschian Nights Mythic Redux از ۲۴ جولای تا پایان فصل، Power Supply Draw از ۲۶ جولای تا فصل ۷ و Lethal Azure Draw از ۲۸ جولای تا فصل ۷ است.

یکی از نکات مهم این فصل، بازگشت دو Draw محبوب در قالب یک Dual Draw جدید با نام Crimson Moonlight Howl Draw است. این بسته شامل Crimson Cloak Draw و Moonlight Draw می‌شود و طبق برنامه فعلی در تاریخ ۲۱ جولای به وقت UTC فعال خواهد شد. البته مثل همیشه، زمان‌بندی Drawها و پیشنهادها ممکن است در طول فصل تغییر کند.`,
    summary:
      "در فصل ۶ کالاف موبایل، بخش جدید Arcade برای مودهای محدود زمانی BR و MP معرفی می‌شود؛ همراه با مأموریت‌های اختصاصی، جوایز ویژه و بازگشت چند Draw محبوب.",
    highlight: true,
    image: "/news/codm-season-6-arcade-weapons.jpg",
    imageAlt: "سلاح‌ها و جوایز فصل ۶ کالاف دیوتی موبایل در بخش Arcade",
    galleryImages: [
      { src: "/news/codm-season-6-arcade-action.jpg", alt: "نمایی از گیم‌پلی فصل ۶ کالاف دیوتی موبایل و مودهای Arcade" },
    ],
    seoKeywords: [
      "کالاف دیوتی موبایل فصل ۶",
      "Call of Duty Mobile Season 6",
      "Arcade COD Mobile",
      "Plunder Treasure Hunt",
      "Throwable Frenzy",
      "Crimson Moonlight Howl Draw",
      "جوایز کالاف موبایل",
      "Flexa اخبار کالاف موبایل",
    ],
    readTimeMinutes: 5,
    game: "cod_mobile",
    publishedAt: "2026-06-26T14:00:00+03:30",
    createdAt: "2026-06-26T14:00:00+03:30",
  },
  {
    id: "supercell-store-free-goblin-emote-2026-fa",
    type: "news",
    icon: "📰",
    title: "ایموت گابلین رایگان در Supercell Store؛ فرصت محدود برای دریافت جایزه",
    description:
      "سوپرسل یک ایموت گابلین رایگان و محدود به زمان را از طریق Supercell Store در دسترس قرار داده است. کاربران بازی‌های سوپرسل می‌توانند با ورود به فروشگاه رسمی سوپرسل و بررسی بخش پیشنهادها، این جایزه رایگان را دریافت کنند. این نوع هدیه‌ها معمولاً برای مدت کوتاهی فعال هستند و بهتر است بازیکنان کلش رویال، کلش آو کلنز و دیگر بازی‌های Supercell سریع‌تر وضعیت حساب خود را در فروشگاه رسمی بررسی کنند. برای امنیت حساب، فقط از لینک رسمی https://store.supercell.com/en?boost=Biscotti یا دامنه store.supercell.com استفاده کنید و از وارد کردن اطلاعات در لینک‌های ناشناس یا مشابه خودداری کنید.",
    summary:
      "یک Goblin Emote رایگان به‌صورت محدود در فروشگاه رسمی Supercell Store فعال شده است؛ کاربران باید از دامنه رسمی store.supercell.com برای دریافت آن اقدام کنند.",
    highlight: true,
    image: "/news/supercell-store-goblin-emote-freebie.jpg",
    imageAlt: "هدیه رایگان ایموت گابلین در Supercell Store با تصویر شخصیت‌های کلش رویال",
    seoKeywords: [
      "ایموت گابلین رایگان",
      "Supercell Store",
      "سوپرسل استور",
      "Goblin Emote",
      "کلش رویال",
      "هدیه رایگان سوپرسل",
      "Flexa اخبار گیمینگ",
    ],
    readTimeMinutes: 3,
    game: "clash_royale",
    publishedAt: "2026-06-26T13:10:00+03:30",
    createdAt: "2026-06-26T13:10:00+03:30",
    sources: [
      {
        title: "Supercell Store — Goblin Emote freebie",
        link: "https://store.supercell.com/en?boost=Biscotti",
        source: "Supercell Store",
        pubDate: "2026-06-26",
      },
    ],
  },
  {
    id: "merge-tactics-season-9-balance-changes-fa",
    type: "news",
    icon: "📰",
    title: "تغییرات بالانس فصل ۹ Merge Tactics کلش رویال",
    description:
      "بسته خبری کامل تغییرات بالانس فصل ۹ تاکتیک‌های ادغام کلش رویال؛ شامل nerf و buffهای مهم مینی‌پکا، ویژگی Boss، حاکمان و سربازها همراه با جدول تغییرات و تحلیل فارسی.",
    summary:
      "بررسی کامل آپدیت بالانس Season 9 Merge Tactics کلش رویال؛ از کاهش شدید HP مینی‌پکا و تضعیف Boss Trait تا تقویت نگهبان بزرگ، جادوگر، اژدهای اسکلتی و تغییرات مأموریت‌های حاکمان.",
    highlight: true,
    image: "https://clashroyale.inbox.supercell.com/9jtsgmsiuthj/6RiSIAymrumYiP7YvqvrPN/f15b9acaca486955a753d634ca2fb3d5/March_Balance_changes.jpg",
    imageAlt: "تغییرات بالانس فصل ۹ کلش رویال Merge Tactics",
    seoKeywords: ["کلش رویال", "Merge Tactics", "تغییرات بالانس", "فصل ۹", "مینی پکا", "Boss Trait"],
    readTimeMinutes: 9,
    game: "clash_royale",
    publishedAt: "2026-06-25T12:00:00+03:30",
    createdAt: "2026-06-25T12:00:00+03:30",
    htmlUrl: "/news/merge-tactics-season-9-balance-changes-fa.html",
    sources: [
      {
        title: "Merge Tactics Season 9 Balance Changes",
        link: "https://supercell.com/en/games/clashroyale/blog/release-notes/merge-tactics-season-9-balance-changes/",
        source: "Supercell / Clash Royale",
        pubDate: "2026-06-01",
      },
    ],
  },
];

export function getStaticHonorById(id: string) {
  return STATIC_HONORS.find((item) => item.id === id) || null;
}
