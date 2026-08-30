from __future__ import annotations

import html
from typing import Any

from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
    Update,
    WebAppInfo,
)
from telegram.constants import ParseMode
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    Defaults,
    MessageHandler,
    filters,
)

import database as db
import gament as fx
from config import settings, DEFAULT_RULES_EN, DEFAULT_RULES_AR


def e(value: Any) -> str:
    return html.escape(str(value or ""))


def is_admin(user_id: int | None) -> bool:
    return bool(user_id and user_id in settings.admin_ids)


def get_user_lang(context: ContextTypes.DEFAULT_TYPE) -> str:
    return context.user_data.get("lang", "en")


def main_keyboard_en() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [
            [KeyboardButton("🎮 Active Tournaments"), KeyboardButton("💳 Crypto Wallet")],
            [KeyboardButton("📜 Rules & Fair Play"), KeyboardButton("🌐 Open WebApp")],
            [KeyboardButton("🌍 Language / اللغة")],
        ],
        resize_keyboard=True,
    )


def main_keyboard_ar() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [
            [KeyboardButton("🎮 البطولات النشطة"), KeyboardButton("💳 المحفظة الرقمية")],
            [KeyboardButton("📜 القوانين والشروط"), KeyboardButton("🌐 فتح التطبيق")],
            [KeyboardButton("🌍 Language / اللغة")],
        ],
        resize_keyboard=True,
    )


def get_menu_keyboard(context: ContextTypes.DEFAULT_TYPE) -> ReplyKeyboardMarkup:
    lang = get_user_lang(context)
    return main_keyboard_ar() if lang == "ar" else main_keyboard_en()


async def start_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_user:
        db.upsert_user(update.effective_user)

    lang = get_user_lang(context)

    if lang == "ar":
        text = f"""
مرحباً بك 👋 في <b>{e(settings.brand_name)}</b>

منصة البطولات العالمية بالذكاء الاصطناعي وجوائز الكريبتو المباشرة:
• تصفح بطولات Call of Duty و Clash Royale و Fortnite
• إيداع وسحب فوري بالـ USDT و TON
• تحكيم آلي وسريع للمباريات

اضغط على الزر أدناه لفتح التطبيق المباشر:
        """.strip()
    else:
        text = f"""
Welcome 👋 to <b>{e(settings.brand_name)}</b>

Next-Gen Global Esports Platform with Instant Crypto Payouts:
• Call of Duty: Mobile, Clash Royale & Fortnite Tournaments
• Instant USDT & TON Wallet Payouts
• Automated AI Match Verification

Launch our WebApp below to join active tournaments:
        """.strip()

    webapp_url = settings.app_url
    inline_kb = InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("⚡ Launch Flexa WebApp", web_app=WebAppInfo(url=webapp_url))],
            [InlineKeyboardButton("🇬🇧 English", callback_data="lang_en"), InlineKeyboardButton("🇸🇦 العربية", callback_data="lang_ar")],
        ]
    )

    await update.effective_message.reply_text(
        text, parse_mode=ParseMode.HTML, reply_markup=inline_kb
    )
    await update.effective_message.reply_text(
        "Navigation Menu / القائمة الرئيسية:", reply_markup=get_menu_keyboard(context)
    )


async def language_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()

    if query.data == "lang_ar":
        context.user_data["lang"] = "ar"
        await query.edit_message_text(
            "تم تغيير اللغة إلى **العربية** 🇸🇦", parse_mode=ParseMode.MARKDOWN
        )
    else:
        context.user_data["lang"] = "en"
        await query.edit_message_text(
            "Language set to **English** 🇬🇧", parse_mode=ParseMode.MARKDOWN
        )


async def wallet_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    lang = get_user_lang(context)
    ton_addr = settings.ton_wallet

    if lang == "ar":
        text = f"""
💳 <b>المحفظة الرقمية الإيداع - {e(settings.brand_name)}</b>

عنوان إيداع شبكة TON / USDT:
<code>{e(ton_addr)}</code>

• يتم إضافة الرصيد تلقائياً بعد تأكيد البلوكشين.
• ادخل إلى التطبيق للسحب الفوري بـ USDT TRC-20 أو TON.
        """.strip()
    else:
        text = f"""
💳 <b>Crypto Deposit Wallet - {e(settings.brand_name)}</b>

Official TON / USDT Deposit Address:
<code>{e(ton_addr)}</code>

• Funds are credited automatically upon blockchain confirmation.
• Open WebApp for instant withdrawals & balance management.
        """.strip()

    inline_kb = InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("🌐 Open Wallet in WebApp", url=f"{settings.app_url}/wallet")],
        ]
    )
    await update.effective_message.reply_text(
        text, parse_mode=ParseMode.HTML, reply_markup=inline_kb
    )


async def rules_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    lang = get_user_lang(context)
    rules_text = DEFAULT_RULES_AR if lang == "ar" else DEFAULT_RULES_EN

    await update.effective_message.reply_text(
        f"📜 <b>{e(settings.brand_name)} Rules</b>\n\n{e(rules_text)}",
        parse_mode=ParseMode.HTML,
        reply_markup=get_menu_keyboard(context),
    )


async def rooms_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    lang = get_user_lang(context)
    if lang == "ar":
        text = "🏆 <b>البطولات المتاحة حالياً:</b>\n\n• Call of Duty: Mobile - 1v1 Duels & Kill Race\n• Clash Royale - Golden Ladder\n• Fortnite - Duo Zero Build\n\nانضم الآن عبر التطبيق:"
    else:
        text = "🏆 <b>Active Global Tournaments:</b>\n\n• Call of Duty: Mobile - 1v1 Duels & Kill Race\n• Clash Royale - Golden Ladder\n• Fortnite - Duo Zero Build\n\nJoin via WebApp:"

    inline_kb = InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("⚔️ Explore Tournaments", url=f"{settings.app_url}/tournaments")],
        ]
    )
    await update.effective_message.reply_text(
        text, parse_mode=ParseMode.HTML, reply_markup=inline_kb
    )


async def handle_messages(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    msg_text = update.effective_message.text or ""

    if "Wallet" in msg_text or "المحفظة" in msg_text:
        await wallet_cmd(update, context)
    elif "Tournaments" in msg_text or "البطولات" in msg_text:
        await rooms_cmd(update, context)
    elif "Rules" in msg_text or "القوانين" in msg_text:
        await rules_cmd(update, context)
    elif "Language" in msg_text or "اللغة" in msg_text:
        inline_kb = InlineKeyboardMarkup(
            [
                [InlineKeyboardButton("🇬🇧 English", callback_data="lang_en"), InlineKeyboardButton("🇸🇦 العربية", callback_data="lang_ar")],
            ]
        )
        await update.effective_message.reply_text("Select language / اختر اللغة:", reply_markup=inline_kb)
    else:
        await start_cmd(update, context)


def main() -> None:
    if not settings.bot_token:
        print("BOT_TOKEN is required in .env")
        return

    defaults = Defaults(parse_mode=ParseMode.HTML)
    app = Application.builder().token(settings.bot_token).defaults(defaults).build()

    app.add_handler(CommandHandler("start", start_cmd))
    app.add_handler(CommandHandler("wallet", wallet_cmd))
    app.add_handler(CommandHandler("rules", rules_cmd))
    app.add_handler(CommandHandler("rooms", rooms_cmd))
    app.add_handler(CallbackQueryHandler(language_callback, pattern="^lang_"))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_messages))

    print("Flexa Global Telegram Bot starting...")
    app.run_polling()


if __name__ == "__main__":
    main()
