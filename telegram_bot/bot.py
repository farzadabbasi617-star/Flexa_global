from __future__ import annotations

import html
import random
import re
from typing import Any

from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
    Update,
)
from telegram.constants import ParseMode
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    Defaults,
    MessageHandler,
    filters,
)

import database as db
import gament as fx
from config import settings


(
    CHOOSING_GAME,
    CUSTOM_GAME,
    CHOOSING_PLATFORM,
    CUSTOM_PLATFORM,
    FULL_NAME,
    GAMER_TAG,
    PHONE,
    GAMENT_ID,
    CITY,
    TEAM,
    CONFIRM,
) = range(11)

SKIP_TEXT = "رد کردن"
CANCEL_TEXT = "لغو"


def e(value: Any) -> str:
    return html.escape(str(value or ""))


def is_admin(user_id: int | None) -> bool:
    return bool(user_id and user_id in settings.admin_ids)


def is_other(value: str) -> bool:
    normalized = value.strip().casefold()
    return normalized in {"other", "others", "سایر", "دیگر", "متفرقه"}


def storage_game_name(value: str | None) -> str | None:
    """Map aliases like cod_mobile/کالاف to the game label stored in SQLite."""
    if not value:
        return None
    game_id = fx.normalize_game_id(value)
    if not game_id:
        return value
    for item in settings.games:
        if fx.normalize_game_id(item) == game_id:
            return item
    return fx.GAME_META[game_id]["bot_name"]


def main_menu_keyboard() -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = [
        [InlineKeyboardButton("⚡ ورود به وب‌اپ Gament", url=settings.app_url)],
        [
            InlineKeyboardButton("🏟 روم‌های فعال", callback_data="menu:rooms"),
            InlineKeyboardButton("🎮 پیش‌ثبت‌نام تلگرامی", callback_data="menu:register"),
        ],
        [
            InlineKeyboardButton("📜 قوانین", callback_data="menu:rules"),
            InlineKeyboardButton("👤 وضعیت من", callback_data="menu:status"),
        ],
        [
            InlineKeyboardButton("👤 پروفایل Gament", url=fx.profile_url()),
            InlineKeyboardButton("🆕 ساخت حساب", url=fx.signup_url()),
        ],
        [
            InlineKeyboardButton("❌ لغو پیش‌ثبت‌نام", callback_data="menu:cancel"),
            InlineKeyboardButton("ℹ️ راهنما", callback_data="menu:help"),
        ],
    ]
    if settings.channel_url:
        rows.insert(1, [InlineKeyboardButton("📣 کانال/اطلاعیه‌های Gament", url=settings.channel_url)])
    return InlineKeyboardMarkup(rows)


def after_registration_keyboard(game: str | None = None) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("🏆 تکمیل ثبت‌نام رسمی در وب‌اپ", url=fx.tournaments_url(game))],
            [
                InlineKeyboardButton("🏟 روم‌های فعال", callback_data="menu:rooms"),
                InlineKeyboardButton("👤 پروفایل Gament", url=fx.profile_url()),
            ],
            [
                InlineKeyboardButton("📜 قوانین", callback_data="menu:rules"),
                InlineKeyboardButton("ℹ️ راهنما", callback_data="menu:help"),
            ],
        ]
    )


def list_keyboard(items: list[str], prefix: str) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    for i in range(0, len(items), 2):
        row = []
        for idx, item in enumerate(items[i : i + 2], start=i):
            row.append(InlineKeyboardButton(item, callback_data=f"{prefix}:{idx}"))
        rows.append(row)
    rows.append([InlineKeyboardButton("لغو", callback_data="reg:abort")])
    return InlineKeyboardMarkup(rows)


def confirm_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("✅ تأیید و ثبت نهایی", callback_data="reg:confirm")],
            [
                InlineKeyboardButton("🔁 شروع دوباره", callback_data="reg:restart"),
                InlineKeyboardButton("لغو", callback_data="reg:abort"),
            ],
        ]
    )


def rooms_keyboard(tournaments: list[dict[str, Any]], game: str | None = None) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = [
        [InlineKeyboardButton("🌐 مشاهده همه روم‌ها در وب‌اپ", url=fx.tournaments_url(game))],
    ]
    for tournament in tournaments[:5]:
        tournament_id = tournament.get("id")
        name = str(tournament.get("name") or "روم Gament")[:32]
        if tournament_id:
            rows.append([InlineKeyboardButton(f"ثبت‌نام/جزئیات: {name}", url=fx.tournament_detail_url(str(tournament_id)))])
    rows.append([InlineKeyboardButton("🎮 پیش‌ثبت‌نام تلگرامی", callback_data="menu:register")])
    return InlineKeyboardMarkup(rows)


def phone_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [[KeyboardButton("📱 ارسال شماره من", request_contact=True)], [CANCEL_TEXT]],
        resize_keyboard=True,
        one_time_keyboard=True,
        input_field_placeholder="شماره تماس را وارد کنید یا دکمه ارسال شماره را بزنید",
    )


def skip_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [[SKIP_TEXT], [CANCEL_TEXT]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def normalize_digits(text: str) -> str:
    return text.translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789"))


def normalize_phone(text: str) -> str:
    text = normalize_digits(text).strip()
    text = re.sub(r"[\s\-()]+", "", text)
    if text.startswith("0098"):
        text = "+98" + text[4:]
    if text.startswith("98") and not text.startswith("+"):
        text = "+" + text
    return text


def is_valid_phone(phone: str) -> bool:
    digits = re.sub(r"\D", "", phone)
    return 8 <= len(digits) <= 15


def player_display_name(player: dict[str, Any]) -> str:
    full_name = player.get("full_name") or "بدون نام"
    gamer_tag = player.get("gamer_tag") or "-"
    gament_id = player.get("gament_id")
    username = player.get("username")
    gament_part = f" | {gament_id}" if gament_id else ""
    username_part = f" @{username}" if username else ""
    return f"{full_name} ({gamer_tag}{gament_part}){username_part}"


def registration_summary(data: dict[str, Any], include_private: bool = True) -> str:
    game = data.get("game") or ""
    account_label = fx.game_account_label(game)
    lines = [
        "⚡ <b>خلاصه پیش‌ثبت‌نام Gament</b>",
        "",
        f"🎮 بازی: <b>{e(fx.game_title(game))}</b>",
        f"🕹 دستگاه/پلتفرم: <b>{e(data.get('platform'))}</b>",
        f"👤 نام نمایشی/نام کامل: <b>{e(data.get('full_name'))}</b>",
        f"🏷 {e(account_label)}: <b>{e(data.get('gamer_tag'))}</b>",
    ]
    if data.get("gament_id"):
        lines.append(f"🆔 Gament ID: <code>{e(data.get('gament_id'))}</code>")
    else:
        lines.append("🆔 Gament ID: <b>ثبت نشده</b>")
    if include_private:
        lines.append(f"📞 شماره تماس: <b>{e(data.get('phone'))}</b>")
    if data.get("city"):
        lines.append(f"📍 شهر: <b>{e(data.get('city'))}</b>")
    if data.get("team_name"):
        lines.append(f"👥 تیم/کلن: <b>{e(data.get('team_name'))}</b>")
    if data.get("status"):
        status_fa = "فعال" if data.get("status") == "registered" else "لغوشده"
        lines.append(f"وضعیت: <b>{status_fa}</b>")
    return "\n".join(lines)


async def send_long_message(
    context: ContextTypes.DEFAULT_TYPE,
    chat_id: int,
    text: str,
    reply_markup: InlineKeyboardMarkup | None = None,
) -> None:
    max_len = 3900
    if len(text) <= max_len:
        await context.bot.send_message(chat_id=chat_id, text=text, reply_markup=reply_markup)
        return
    chunks = [text[i : i + max_len] for i in range(0, len(text), max_len)]
    for idx, chunk in enumerate(chunks):
        await context.bot.send_message(chat_id=chat_id, text=chunk, reply_markup=reply_markup if idx == 0 else None)


async def notify_admins(context: ContextTypes.DEFAULT_TYPE, text: str) -> None:
    for admin_id in settings.admin_ids:
        try:
            await context.bot.send_message(chat_id=admin_id, text=text)
        except Exception:
            # اگر ادمین هنوز ربات را start نکرده باشد، تلگرام اجازه ارسال نمی‌دهد.
            pass


async def start_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_user:
        db.upsert_user(update.effective_user)
    text = f"""
سلام 👋
به <b>{e(settings.tournament_title)}</b> خوش آمدی.

اینجا دستیار تلگرام Gament است:
• مشاهده روم‌های فعال
• پیش‌ثبت‌نام و جمع‌آوری اطلاعات بازیکن
• راهنمای ساخت حساب و تکمیل پروفایل
• دریافت قوانین و اطلاعیه‌ها

ثبت‌نام قطعی تورنومنت، پرداخت ورودی احتمالی، مشاهده لابی و داوری نهایی از داخل وب‌اپ Gament انجام می‌شود.
    """.strip()
    await update.effective_message.reply_text(text, reply_markup=main_menu_keyboard())


async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = f"""
ℹ️ <b>راهنمای دستیار Gament</b>

/start — نمایش منوی اصلی
/rooms — مشاهده روم‌های فعال وب‌اپ
/rooms cod_mobile — روم‌های کالاف موبایل
/rooms fortnite — روم‌های فورتنایت
/rooms clash_royale — روم‌های کلش رویال
/register — شروع پیش‌ثبت‌نام تلگرامی
/status — مشاهده وضعیت پیش‌ثبت‌نام شما
/rules — مشاهده قوانین خلاصه
/links — لینک‌های مهم Gament
/unregister — لغو پیش‌ثبت‌نام تلگرامی
/cancel — لغو عملیات فعلی

لینک وب‌اپ: {e(settings.app_url)}
    """.strip()
    await update.effective_message.reply_text(text, reply_markup=main_menu_keyboard())


async def links_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    rows = [
        [InlineKeyboardButton("⚡ وب‌اپ Gament", url=settings.app_url)],
        [InlineKeyboardButton("🏟 تورنومنت‌ها و روم‌ها", url=fx.tournaments_url())],
        [InlineKeyboardButton("🆕 ساخت حساب", url=fx.signup_url())],
        [InlineKeyboardButton("👤 پروفایل", url=fx.profile_url())],
    ]
    if settings.channel_url:
        rows.append([InlineKeyboardButton("📣 کانال Gament", url=settings.channel_url)])
    await update.effective_message.reply_text("🔗 لینک‌های مهم Gament:", reply_markup=InlineKeyboardMarkup(rows))


async def rules_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = f"📜 <b>قوانین {e(settings.brand_name)}</b>\n\n{e(settings.rules_text)}"
    if settings.payment_info:
        text += f"\n\n💳 <b>اطلاعات ورودی/پرداخت</b>\n{e(settings.payment_info)}"
    text += f"\n\nبرای جزئیات هر روم، صفحه همان تورنومنت را در وب‌اپ ببین:\n{e(fx.tournaments_url())}"
    await send_long_message(context, update.effective_chat.id, text, reply_markup=main_menu_keyboard())


async def rooms_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    game = " ".join(context.args).strip() or None
    await send_rooms(update.effective_chat.id, context, game=game)


async def send_rooms(chat_id: int, context: ContextTypes.DEFAULT_TYPE, game: str | None = None) -> None:
    try:
        tournaments = await fx.fetch_tournaments(game=game, limit=20)
        text = fx.format_tournaments_message(tournaments, game=game)
        await send_long_message(context, chat_id, text, reply_markup=rooms_keyboard(tournaments, game=game))
    except Exception:
        await context.bot.send_message(
            chat_id=chat_id,
            text="اتصال به وب‌اپ Gament برای دریافت روم‌ها انجام نشد. می‌توانی مستقیم از لینک زیر بررسی کنی:",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🏟 مشاهده روم‌ها", url=fx.tournaments_url(game))]]),
        )


async def status_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_user:
        db.upsert_user(update.effective_user)
    registration = db.get_registration(update.effective_user.id)
    if not registration:
        await update.effective_message.reply_text(
            "هنوز پیش‌ثبت‌نامی برای شما ثبت نشده است. برای شروع، دکمه زیر را بزنید.",
            reply_markup=main_menu_keyboard(),
        )
        return
    await update.effective_message.reply_text(registration_summary(registration), reply_markup=after_registration_keyboard(registration.get("game")))


async def unregister_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_user:
        db.upsert_user(update.effective_user)
    ok = db.cancel_registration(update.effective_user.id)
    if ok:
        await update.effective_message.reply_text("پیش‌ثبت‌نام تلگرامی شما لغو شد.", reply_markup=main_menu_keyboard())
        await notify_admins(
            context,
            f"❌ پیش‌ثبت‌نام تلگرامی لغو شد\nکاربر: {e(update.effective_user.full_name)}\nآیدی تلگرام: <code>{update.effective_user.id}</code>",
        )
    else:
        await update.effective_message.reply_text("پیش‌ثبت‌نام فعالی برای لغو کردن پیدا نشد.", reply_markup=main_menu_keyboard())


async def menu_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    action = query.data.split(":", 1)[1]

    if action == "rules":
        await rules_cmd(update, context)
    elif action == "status":
        await status_cmd(update, context)
    elif action == "cancel":
        await unregister_cmd(update, context)
    elif action == "help":
        await help_cmd(update, context)
    elif action == "rooms":
        await send_rooms(update.effective_chat.id, context)


async def start_registration(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    if update.effective_user:
        db.upsert_user(update.effective_user)
    context.user_data["registration"] = {}
    text = (
        "🎮 <b>پیش‌ثبت‌نام تلگرامی Gament</b>\n\n"
        "بازی موردنظر را انتخاب کن. اگر قبلاً پیش‌ثبت‌نام کرده باشی، اطلاعات جدید جایگزین می‌شود.\n\n"
        "نکته: ثبت‌نام قطعی، پرداخت ورودی و مشاهده لابی از طریق وب‌اپ Gament انجام می‌شود."
    )
    keyboard = list_keyboard(settings.games, "reg:game")

    if update.callback_query:
        query = update.callback_query
        await query.answer()
        await query.edit_message_text(text, reply_markup=keyboard)
    else:
        await update.effective_message.reply_text(text, reply_markup=keyboard)
    return CHOOSING_GAME


async def choose_game(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    idx = int(query.data.rsplit(":", 1)[1])
    game = settings.games[idx]
    if is_other(game):
        await query.edit_message_text("نام بازی را بنویسید:")
        return CUSTOM_GAME
    context.user_data["registration"]["game"] = game
    await query.edit_message_text(
        f"بازی انتخاب شد: <b>{e(fx.game_title(game))}</b>\n\nحالا دستگاه/پلتفرم را انتخاب کنید:",
        reply_markup=list_keyboard(settings.platforms, "reg:platform"),
    )
    return CHOOSING_PLATFORM


async def custom_game(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = normalize_digits(update.message.text.strip())
    if text == CANCEL_TEXT:
        return await cancel_flow(update, context)
    if len(text) < 2 or len(text) > 50:
        await update.message.reply_text("نام بازی باید بین ۲ تا ۵۰ کاراکتر باشد. دوباره بنویسید:")
        return CUSTOM_GAME
    context.user_data["registration"]["game"] = text
    await update.message.reply_text(
        f"بازی ثبت شد: <b>{e(text)}</b>\n\nحالا دستگاه/پلتفرم را انتخاب کنید:",
        reply_markup=list_keyboard(settings.platforms, "reg:platform"),
    )
    return CHOOSING_PLATFORM


async def choose_platform(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    idx = int(query.data.rsplit(":", 1)[1])
    platform = settings.platforms[idx]
    if is_other(platform):
        await query.edit_message_text("نام دستگاه/پلتفرم را بنویس؛ مثلاً Mobile، PC، PS5 و...")
        return CUSTOM_PLATFORM
    context.user_data["registration"]["platform"] = platform
    await query.edit_message_text(
        f"پلتفرم انتخاب شد: <b>{e(platform)}</b>\n\nنام نمایشی Gament یا نام و نام‌خانوادگی خودت را بنویس:"
    )
    return FULL_NAME


async def custom_platform(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = normalize_digits(update.message.text.strip())
    if text == CANCEL_TEXT:
        return await cancel_flow(update, context)
    if len(text) < 2 or len(text) > 30:
        await update.message.reply_text("نام پلتفرم باید بین ۲ تا ۳۰ کاراکتر باشد. دوباره بنویسید:")
        return CUSTOM_PLATFORM
    context.user_data["registration"]["platform"] = text
    await update.message.reply_text(
        f"پلتفرم ثبت شد: <b>{e(text)}</b>\n\nنام نمایشی Gament یا نام و نام‌خانوادگی خودت را بنویس:"
    )
    return FULL_NAME


async def full_name(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = normalize_digits(update.message.text.strip())
    if text == CANCEL_TEXT:
        return await cancel_flow(update, context)
    if len(text) < 2 or len(text) > 80:
        await update.message.reply_text("نام واردشده معتبر نیست. لطفاً نام نمایشی یا نام کامل را درست‌تر بنویسید:")
        return FULL_NAME
    context.user_data["registration"]["full_name"] = text
    game = context.user_data["registration"].get("game")
    await update.message.reply_text(fx.game_account_prompt(game))
    return GAMER_TAG


async def gamer_tag(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = normalize_digits(update.message.text.strip())
    if text == CANCEL_TEXT:
        return await cancel_flow(update, context)
    if len(text) < 2 or len(text) > 80:
        await update.message.reply_text("آیدی بازی معتبر نیست. دوباره وارد کن:")
        return GAMER_TAG
    context.user_data["registration"]["gamer_tag"] = text
    await update.message.reply_text(
        "شماره تماس خود را وارد کن یا دکمه «ارسال شماره من» را بزن:",
        reply_markup=phone_keyboard(),
    )
    return PHONE


async def phone(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    if update.message.text and update.message.text.strip() == CANCEL_TEXT:
        return await cancel_flow(update, context)

    phone_value = ""
    if update.message.contact:
        contact = update.message.contact
        if contact.user_id and contact.user_id != update.effective_user.id:
            await update.message.reply_text("لطفاً شماره تماس خودتان را ارسال کنید، نه مخاطب دیگران.")
            return PHONE
        phone_value = normalize_phone(contact.phone_number)
    elif update.message.text:
        phone_value = normalize_phone(update.message.text)

    if not is_valid_phone(phone_value):
        await update.message.reply_text("شماره تماس معتبر نیست. لطفاً دوباره وارد کنید:")
        return PHONE

    context.user_data["registration"]["phone"] = phone_value
    gament_text = (
        "اگر در وب‌اپ Gament حساب داری، Gament ID خودت را وارد کن؛ مثلاً <code>FLX-1234</code>.\n"
        "اگر هنوز حساب نداری، «رد کردن» را بزن و بعداً از لینک ساخت حساب تکمیلش کن:\n"
        f"{e(fx.signup_url())}"
    )
    if settings.gament_id_required:
        gament_text = (
            "برای ادامه، Gament ID الزامی است. وارد وب‌اپ شو، حساب بساز/وارد شو و Gament ID مثل <code>FLX-1234</code> را اینجا بنویس:\n"
            f"{e(fx.signup_url())}"
        )
    await update.message.reply_text(gament_text, reply_markup=skip_keyboard() if not settings.gament_id_required else ReplyKeyboardRemove())
    return GAMENT_ID


async def gament_id(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = normalize_digits(update.message.text.strip())
    if text == CANCEL_TEXT:
        return await cancel_flow(update, context)
    if text == SKIP_TEXT and not settings.gament_id_required:
        context.user_data["registration"]["gament_id"] = ""
    else:
        normalized = fx.normalize_gament_id(text)
        if not fx.is_valid_gament_id(normalized):
            await update.message.reply_text(
                "Gament ID معتبر نیست. نمونه درست: <code>FLX-1234</code>\n"
                + ("اگر هنوز حساب نداری، «رد کردن» را بزن." if not settings.gament_id_required else "لطفاً Gament ID صحیح را وارد کن."),
                reply_markup=skip_keyboard() if not settings.gament_id_required else None,
            )
            return GAMENT_ID
        context.user_data["registration"]["gament_id"] = normalized

    await update.message.reply_text(
        "شهر محل سکونت را بنویس. اگر لازم نیست، «رد کردن» را بزن:",
        reply_markup=skip_keyboard(),
    )
    return CITY


async def city(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = normalize_digits(update.message.text.strip())
    if text == CANCEL_TEXT:
        return await cancel_flow(update, context)
    context.user_data["registration"]["city"] = "" if text == SKIP_TEXT else text[:50]
    await update.message.reply_text(
        "نام تیم/کلن را وارد کن. اگر انفرادی هستی یا تیم نداری، «رد کردن» را بزن:",
        reply_markup=skip_keyboard(),
    )
    return TEAM


async def team(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = normalize_digits(update.message.text.strip())
    if text == CANCEL_TEXT:
        return await cancel_flow(update, context)
    context.user_data["registration"]["team_name"] = "" if text == SKIP_TEXT else text[:80]

    data = context.user_data["registration"]
    await update.message.reply_text("✅ اطلاعات دریافت شد.", reply_markup=ReplyKeyboardRemove())
    await update.message.reply_text(
        registration_summary(data) + "\n\nاگر اطلاعات درست است، ثبت نهایی را بزن.",
        reply_markup=confirm_keyboard(),
    )
    return CONFIRM


async def confirm_registration(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    action = query.data.rsplit(":", 1)[1]

    if action == "restart":
        context.user_data["registration"] = {}
        await query.edit_message_text(
            "پیش‌ثبت‌نام از اول شروع شد. بازی موردنظر را انتخاب کن:",
            reply_markup=list_keyboard(settings.games, "reg:game"),
        )
        return CHOOSING_GAME

    if action == "abort":
        context.user_data.pop("registration", None)
        await query.edit_message_text("عملیات پیش‌ثبت‌نام لغو شد.", reply_markup=main_menu_keyboard())
        return ConversationHandler.END

    data = context.user_data.get("registration") or {}
    required = ["game", "platform", "full_name", "gamer_tag", "phone"]
    if settings.gament_id_required:
        required.append("gament_id")
    if not all(data.get(key) for key in required):
        await query.edit_message_text("بخشی از اطلاعات ناقص است. لطفاً پیش‌ثبت‌نام را دوباره شروع کنید.", reply_markup=main_menu_keyboard())
        return ConversationHandler.END

    db.save_registration(update.effective_user.id, data)
    sync_ok, sync_message = await fx.sync_pre_registration(data, update.effective_user)
    context.user_data.pop("registration", None)

    sync_note = "\n\n⚡ اطلاعات شما با پنل وب‌اپ Gament همگام شد." if sync_ok else "\n\n⚠️ پیش‌ثبت‌نام در ربات ذخیره شد، اما همگام‌سازی با پنل وب‌اپ فعلاً انجام نشد. ادمین می‌تواند از خروجی CSV ربات هم استفاده کند."

    await query.edit_message_text(
        "✅ پیش‌ثبت‌نام تلگرامی شما با موفقیت ثبت شد.\n\n"
        + registration_summary(data)
        + sync_note
        + "\n\nبرای ثبت‌نام قطعی در روم، پرداخت ورودی احتمالی، مشاهده لابی و دریافت نتیجه/جایزه، دکمه وب‌اپ را بزن.",
        reply_markup=after_registration_keyboard(data.get("game")),
    )

    admin_text = (
        "🆕 <b>پیش‌ثبت‌نام جدید/به‌روزرسانی Gament</b>\n"
        f"کاربر تلگرام: {e(update.effective_user.full_name)}"
        + (f" (@{e(update.effective_user.username)})" if update.effective_user.username else "")
        + f"\nآیدی تلگرام: <code>{update.effective_user.id}</code>"
        + f"\nSync وب‌اپ: <b>{'OK' if sync_ok else 'FAILED'}</b>"
        + (f"\nجزئیات Sync: <code>{e(sync_message[:300])}</code>" if not sync_ok else "")
        + "\n\n"
        + registration_summary(data)
    )
    await notify_admins(context, admin_text)
    return ConversationHandler.END


async def abort_registration_button(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    context.user_data.pop("registration", None)
    await query.edit_message_text("عملیات پیش‌ثبت‌نام لغو شد.", reply_markup=main_menu_keyboard())
    return ConversationHandler.END


async def cancel_flow(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.pop("registration", None)
    if update.callback_query:
        await update.callback_query.answer()
        await update.callback_query.edit_message_text("عملیات فعلی لغو شد.", reply_markup=main_menu_keyboard())
    else:
        await update.effective_message.reply_text("عملیات فعلی لغو شد.", reply_markup=ReplyKeyboardRemove())
        await update.effective_message.reply_text("منوی اصلی:", reply_markup=main_menu_keyboard())
    return ConversationHandler.END


async def admin_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_admin(update.effective_user.id):
        await update.effective_message.reply_text("شما دسترسی ادمین ندارید.")
        return
    text = """
🛠 <b>پنل ادمین Gament Telegram</b>

/stats — آمار پیش‌ثبت‌نام‌ها
/players — نمایش ۲۰ پیش‌ثبت‌نام آخر
/players COD MOBILE — نمایش ۲۰ پیش‌ثبت‌نام آخر یک بازی
/export — خروجی CSV کامل
/draw COD MOBILE — قرعه‌کشی ساده برای یک بازی
/announce متن — ارسال اطلاعیه به همه پیش‌ثبت‌نام‌شده‌ها
/rooms — مشاهده روم‌های فعال وب‌اپ از داخل ربات

نکته: اطلاعیه فقط برای کاربرانی ارسال می‌شود که خودشان در ربات پیش‌ثبت‌نام کرده‌اند.
    """.strip()
    await update.effective_message.reply_text(text)


async def stats_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_admin(update.effective_user.id):
        await update.effective_message.reply_text("شما دسترسی ادمین ندارید.")
        return
    stats = db.get_stats()
    lines = [
        "📊 <b>آمار پیش‌ثبت‌نام تلگرامی Gament</b>",
        "",
        f"کل پیش‌ثبت‌نام‌های فعال: <b>{stats['total']}</b>",
        f"دارای Gament ID: <b>{stats.get('with_gament_id', 0)}</b>",
    ]
    lines.append("\n🎮 بر اساس بازی:")
    if stats["by_game"]:
        lines.extend([f"- {e(fx.game_title(row['game'], bilingual=False))}: <b>{row['c']}</b>" for row in stats["by_game"]])
    else:
        lines.append("- هنوز پیش‌ثبت‌نامی نداریم.")
    lines.append("\n🕹 بر اساس پلتفرم:")
    if stats["by_platform"]:
        lines.extend([f"- {e(row['platform'])}: <b>{row['c']}</b>" for row in stats["by_platform"]])
    else:
        lines.append("- هنوز پیش‌ثبت‌نامی نداریم.")
    await update.effective_message.reply_text("\n".join(lines))


async def players_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_admin(update.effective_user.id):
        await update.effective_message.reply_text("شما دسترسی ادمین ندارید.")
        return
    game = storage_game_name(" ".join(context.args).strip() or None)
    players = db.list_players(limit=20, game=game)
    if not players:
        await update.effective_message.reply_text("پیش‌ثبت‌نام فعالی پیدا نشد.")
        return
    lines = ["👥 <b>آخرین پیش‌ثبت‌نام‌ها</b>" + (f" — {e(fx.game_title(game, bilingual=False))}" if game else ""), ""]
    for idx, player in enumerate(players, start=1):
        gament_id = f" | {e(player['gament_id'])}" if player.get("gament_id") else ""
        lines.append(
            f"{idx}) {e(player['full_name'])} | {e(fx.game_title(player['game'], bilingual=False))} | {e(player['platform'])} | {e(player['gamer_tag'])}{gament_id}"
            + (f" | @{e(player['username'])}" if player.get("username") else "")
        )
    await update.effective_message.reply_text("\n".join(lines))


async def export_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_admin(update.effective_user.id):
        await update.effective_message.reply_text("شما دسترسی ادمین ندارید.")
        return
    path = db.export_registrations_csv()
    with path.open("rb") as f:
        await update.effective_message.reply_document(document=f, filename=path.name, caption="خروجی پیش‌ثبت‌نام‌های Gament")


async def draw_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_admin(update.effective_user.id):
        await update.effective_message.reply_text("شما دسترسی ادمین ندارید.")
        return
    game = storage_game_name(" ".join(context.args).strip() or None)
    players = db.get_active_players(game=game)
    if len(players) < 2:
        await update.effective_message.reply_text(
            "برای قرعه‌کشی حداقل ۲ بازیکن لازم است.\nمثال: <code>/draw COD MOBILE</code>"
        )
        return

    random.shuffle(players)
    title = f"🎲 <b>قرعه‌کشی {e(fx.game_title(game, bilingual=False))}</b>" if game else "🎲 <b>قرعه‌کشی همه پیش‌ثبت‌نام‌ها</b>"
    lines = [title, ""]
    match_no = 1
    for i in range(0, len(players), 2):
        p1 = player_display_name(players[i])
        if i + 1 < len(players):
            p2 = player_display_name(players[i + 1])
            lines.append(f"مسابقه {match_no}: {e(p1)}  VS  {e(p2)}")
        else:
            lines.append(f"استراحت/Bye: {e(p1)}")
        match_no += 1
    await send_long_message(context, update.effective_chat.id, "\n".join(lines))


async def announce_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_admin(update.effective_user.id):
        await update.effective_message.reply_text("شما دسترسی ادمین ندارید.")
        return
    text = update.effective_message.text.partition(" ")[2].strip()
    if not text:
        await update.effective_message.reply_text("متن اطلاعیه را بعد از دستور بنویسید. مثال:\n<code>/announce زمان روم امشب ساعت ۹ است.</code>")
        return
    user_ids = db.get_active_telegram_ids()
    if not user_ids:
        await update.effective_message.reply_text("هیچ پیش‌ثبت‌نام فعالی برای ارسال اطلاعیه وجود ندارد.")
        return

    sent = 0
    failed = 0
    message = f"📢 <b>اطلاعیه Gament</b>\n\n{e(text)}\n\n🏟 روم‌ها: {e(fx.tournaments_url())}"
    for user_id in user_ids:
        try:
            await context.bot.send_message(chat_id=user_id, text=message)
            sent += 1
        except Exception:
            failed += 1
    await update.effective_message.reply_text(f"ارسال اطلاعیه تمام شد. موفق: {sent} | ناموفق: {failed}")


async def unknown_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.effective_message.reply_text(
        "متوجه نشدم. از منوی زیر استفاده کن یا /help را بزن.",
        reply_markup=main_menu_keyboard(),
    )


def build_application() -> Application:
    defaults = Defaults(parse_mode=ParseMode.HTML)
    application = Application.builder().token(settings.bot_token).defaults(defaults).build()

    registration_conv = ConversationHandler(
        entry_points=[
            CommandHandler("register", start_registration),
            CallbackQueryHandler(start_registration, pattern=r"^menu:register$"),
        ],
        states={
            CHOOSING_GAME: [CallbackQueryHandler(choose_game, pattern=r"^reg:game:\d+$")],
            CUSTOM_GAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, custom_game)],
            CHOOSING_PLATFORM: [CallbackQueryHandler(choose_platform, pattern=r"^reg:platform:\d+$")],
            CUSTOM_PLATFORM: [MessageHandler(filters.TEXT & ~filters.COMMAND, custom_platform)],
            FULL_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, full_name)],
            GAMER_TAG: [MessageHandler(filters.TEXT & ~filters.COMMAND, gamer_tag)],
            PHONE: [MessageHandler((filters.CONTACT | filters.TEXT) & ~filters.COMMAND, phone)],
            GAMENT_ID: [MessageHandler(filters.TEXT & ~filters.COMMAND, gament_id)],
            CITY: [MessageHandler(filters.TEXT & ~filters.COMMAND, city)],
            TEAM: [MessageHandler(filters.TEXT & ~filters.COMMAND, team)],
            CONFIRM: [CallbackQueryHandler(confirm_registration, pattern=r"^reg:(confirm|restart|abort)$")],
        },
        fallbacks=[
            CommandHandler("cancel", cancel_flow),
            CallbackQueryHandler(abort_registration_button, pattern=r"^reg:abort$"),
            MessageHandler(filters.Regex(f"^{CANCEL_TEXT}$"), cancel_flow),
        ],
        allow_reentry=True,
        name="gament_registration_conversation",
    )

    application.add_handler(registration_conv)

    application.add_handler(CommandHandler("start", start_cmd))
    application.add_handler(CommandHandler("help", help_cmd))
    application.add_handler(CommandHandler("links", links_cmd))
    application.add_handler(CommandHandler("rules", rules_cmd))
    application.add_handler(CommandHandler("rooms", rooms_cmd))
    application.add_handler(CommandHandler("status", status_cmd))
    application.add_handler(CommandHandler("unregister", unregister_cmd))

    application.add_handler(CommandHandler("admin", admin_cmd))
    application.add_handler(CommandHandler("stats", stats_cmd))
    application.add_handler(CommandHandler("players", players_cmd))
    application.add_handler(CommandHandler("export", export_cmd))
    application.add_handler(CommandHandler("draw", draw_cmd))
    application.add_handler(CommandHandler("announce", announce_cmd))

    application.add_handler(CallbackQueryHandler(menu_callback, pattern=r"^menu:"))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, unknown_text))

    return application


def main() -> None:
    db.init_db()
    application = build_application()
    print(f"Bot is running: {settings.tournament_title}")
    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
