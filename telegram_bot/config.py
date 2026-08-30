from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # Allows basic imports before dependencies are installed.
    def load_dotenv(*args, **kwargs):
        return False


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _split_csv(value: str | None, default: list[str]) -> list[str]:
    if not value:
        return default
    items = [item.strip() for item in value.split(",") if item.strip()]
    return items or default


def _split_int_csv(value: str | None) -> set[int]:
    if not value:
        return set()
    ids: set[int] = set()
    for item in value.split(","):
        item = item.strip()
        if not item:
            continue
        try:
            ids.add(int(item))
        except ValueError:
            raise ValueError(f"ADMIN_IDS contains a non-numeric value: {item!r}")
    return ids


def _bool(value: str | None, default: bool = False) -> bool:
    if value is None or value.strip() == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on", "بله", "آره"}


DEFAULT_RULES = """
📜 قوانین خلاصه گیمنت

1) Gament پلتفرم مدیریت، ثبت‌نام، اطلاع‌رسانی، داوری و پشتیبانی تورنومنت‌های گیمینگ است.
2) مسابقات بر پایه مهارت برگزار می‌شوند؛ هرگونه شرط‌بندی، تبانی مالی، خرید/فروش نتیجه یا قمار ممنوع است.
3) اطلاعات ثبت‌شده شامل شماره تماس، Gament ID و آیدی بازی باید صحیح و متعلق به خود بازیکن باشد.
4) آیدی بازی در روز مسابقه باید با آیدی ثبت‌شده در پروفایل/ربات مطابقت داشته باشد.
5) استفاده از چیت، هک، اسکریپت، باگ، اکانت اشتراکی، جعل اسکرین‌شات یا هر ابزار غیرمجاز باعث حذف می‌شود.
6) نتیجه مسابقه باید طبق قوانین همان روم و با مدارک قابل بررسی ثبت شود؛ داوری انسانی/هوشمند گیمنت ملاک تصمیم نهایی است.
7) بی‌احترامی، تهدید، نشر اطلاعات شخصی، اسپم و تبلیغات بدون مجوز در چت یا مسابقه ممنوع است.
8) برای ثبت‌نام رسمی، پرداخت ورودی احتمالی، مشاهده لابی و دریافت جایزه باید حساب وب‌اپ گیمنت تکمیل باشد.
""".strip()


@dataclass(frozen=True)
class Settings:
    bot_token: str
    admin_ids: set[int]
    tournament_title: str
    brand_name: str
    app_url: str
    games: list[str]
    platforms: list[str]
    rules_text: str
    payment_info: str
    gament_id_required: bool
    support_url: str
    channel_url: str
    telegram_integration_secret: str


_raw_app_url = os.getenv("APP_URL", "https://www.gament1.ir").strip().rstrip("/")

settings = Settings(
    bot_token=os.getenv("BOT_TOKEN", "").strip(),
    admin_ids=_split_int_csv(os.getenv("ADMIN_IDS")),
    tournament_title=os.getenv("TOURNAMENT_TITLE", "Gament — پلتفرم تورنومنت گیمینگ").strip(),
    brand_name=os.getenv("BRAND_NAME", "Gament").strip(),
    app_url=_raw_app_url,
    games=_split_csv(
        os.getenv("GAMES"),
        ["COD MOBILE", "FORTNITE", "CLASH ROYALE"],
    ),
    platforms=_split_csv(
        os.getenv("PLATFORMS"),
        ["Mobile", "PC", "Console", "PS5", "PS4", "Xbox", "Nintendo Switch", "Other"],
    ),
    rules_text=(os.getenv("RULES_TEXT") or DEFAULT_RULES).strip(),
    payment_info=(os.getenv("PAYMENT_INFO") or "").strip(),
    gament_id_required=_bool(os.getenv("GAMENT_ID_REQUIRED"), default=False),
    support_url=(os.getenv("SUPPORT_URL") or f"{_raw_app_url}/profile").strip(),
    channel_url=(os.getenv("CHANNEL_URL") or "").strip(),
    telegram_integration_secret=(os.getenv("TELEGRAM_INTEGRATION_SECRET") or "").strip(),
)


if not settings.bot_token:
    raise RuntimeError("BOT_TOKEN is missing. Create a .env file based on .env.example and set BOT_TOKEN.")
