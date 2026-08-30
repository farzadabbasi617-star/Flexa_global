/**
 * Game ID guides for the Telegram bot.
 * Helps users find their in-game IDs for each supported game.
 */

export function getGameIdGuide(gameId: string): { title: string; steps: string[] } {
  switch (gameId) {
    case "cod_mobile":
      return {
        title: "🎯 پیدا کردن UID کالاف دیوتی موبایل",
        steps: [
          "1. وارد بازی Call of Duty Mobile شو.",
          "2. روی آیکون پروفایل (بالا سمت چپ) بزن.",
          "3. روی تب «Player Info» یا «Profile» بزن.",
          "4. عدد بلند زیر اسم یا Avatar را ببین؛ این همان UID توست.",
          "5. معمولاً ۱۰ رقم است، مثل: <code>1234567890</code>",
          "",
          "⚠️ دقت کن این UID را با کسی به‌اشتراک نگذاری.",
        ],
      };
    case "clash_royale":
      return {
        title: "👑 پیدا کردن Player Tag کلش رویال",
        steps: [
          "1. Clash Royale را باز کن.",
          "2. روی نام پروفایل خودت (بالا صفحه) بزن.",
          "3. زیر Avatar پروفایل، یک کد با هشتگ می‌بینی.",
          "4. آن کد را کپی کن، مثل: <code>#ABC1234Q</code>",
          "",
          "⚠️ حرف‌ها و اعداد تگ مهم هستن؛ درست کپی کن.",
        ],
      };
    case "fortnite":
      return {
        title: "🏗️ پیدا کردن Epic Games ID فورتنایت",
        steps: [
          "1. فورتنایت را باز کن یا به epicgames.com وارد شو.",
          "2. روی Settings → Account برو.",
          "3. بخش «Account Info» را باز کن.",
          "4. فیلد «Display Name» یا «Epic ID» را ببین.",
          "5. نام کاربری Epic توست، مثل: <code>EpicPlayer123</code>",
          "",
          "⚠️ دقت کن این نام کاربری را در بخش پروفایل Flexa وارد کنی.",
        ],
      };
    default:
      return {
        title: "❓ راهنمای بازی موردنظر پیدا نشد",
        steps: ["بازی موردنظر را انتخاب کن: /howto cod_mobile یا /howto clash_royale یا /howto fortnite"],
      };
  }
}

export function gameGuideKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🎯 کالاف موبایل", callback_data: "howto:cod_mobile" }],
      [{ text: "👑 کلش رویال", callback_data: "howto:clash_royale" }],
      [{ text: "🏗️ فورتنایت", callback_data: "howto:fortnite" }],
    ],
  };
}
