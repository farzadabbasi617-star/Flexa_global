from __future__ import annotations

import asyncio
import html
import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from config import settings


GAME_META: dict[str, dict[str, str]] = {
    "cod_mobile": {
        "bot_name": "COD MOBILE",
        "en": "COD Mobile",
        "fa": "کالاف موبایل",
        "icon": "🎯",
        "account_label": "UID / Username کالاف موبایل",
        "account_prompt": "UID یا Username کالاف موبایل را وارد کن. بهتر است همان چیزی باشد که در پروفایل Gament ثبت می‌کنی.",
    },
    "fortnite": {
        "bot_name": "FORTNITE",
        "en": "Fortnite",
        "fa": "فورتنایت",
        "icon": "🏗️",
        "account_label": "Epic Games ID / Username فورتنایت",
        "account_prompt": "Epic Games ID یا Username فورتنایت را وارد کن. این شناسه باید با پروفایل Gament هماهنگ باشد.",
    },
    "clash_royale": {
        "bot_name": "CLASH ROYALE",
        "en": "Clash Royale",
        "fa": "کلش رویال",
        "icon": "👑",
        "account_label": "Player Tag کلش رویال",
        "account_prompt": "Player Tag کلش رویال را وارد کن؛ مثل #ABC123. این تگ باید متعلق به خودت باشد.",
    },
}

_GAME_ALIASES: dict[str, str] = {
    "cod": "cod_mobile",
    "cod mobile": "cod_mobile",
    "cod_mobile": "cod_mobile",
    "call of duty": "cod_mobile",
    "call of duty mobile": "cod_mobile",
    "کالاف": "cod_mobile",
    "کالاف موبایل": "cod_mobile",
    "فورتنایت": "fortnite",
    "fortnite": "fortnite",
    "کلش": "clash_royale",
    "کلش رویال": "clash_royale",
    "clash": "clash_royale",
    "clash royale": "clash_royale",
    "clash_royale": "clash_royale",
}

for _game_id, _meta in GAME_META.items():
    _GAME_ALIASES[_meta["bot_name"].lower()] = _game_id
    _GAME_ALIASES[_meta["en"].lower()] = _game_id
    _GAME_ALIASES[_meta["fa"].lower()] = _game_id


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def normalize_game_id(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().lower().replace("-", "_")
    normalized_space = normalized.replace("_", " ")
    return _GAME_ALIASES.get(normalized) or _GAME_ALIASES.get(normalized_space)


def game_title(value: str | None, bilingual: bool = True) -> str:
    game_id = normalize_game_id(value)
    if not game_id:
        return value or "سایر"
    meta = GAME_META[game_id]
    if bilingual:
        return f"{meta['icon']} {meta['fa']} ({meta['en']})"
    return f"{meta['icon']} {meta['fa']}"


def game_account_prompt(value: str | None) -> str:
    game_id = normalize_game_id(value)
    if not game_id:
        return "آیدی بازی / گیمرتگ / یوزرنیم داخل بازی را وارد کن:"
    return GAME_META[game_id]["account_prompt"]


def game_account_label(value: str | None) -> str:
    game_id = normalize_game_id(value)
    if not game_id:
        return "آیدی بازی"
    return GAME_META[game_id]["account_label"]


def tournaments_url(game: str | None = None) -> str:
    game_id = normalize_game_id(game)
    if game_id:
        return f"{settings.app_url}/tournaments?game={urllib.parse.quote(game_id)}"
    return f"{settings.app_url}/tournaments"


def tournament_detail_url(tournament_id: str) -> str:
    return f"{settings.app_url}/tournaments/{urllib.parse.quote(tournament_id)}"


def signup_url() -> str:
    return f"{settings.app_url}/register"


def profile_url() -> str:
    return f"{settings.app_url}/profile"


def normalize_gament_id(value: str) -> str:
    return value.strip().upper().replace(" ", "")


def is_valid_gament_id(value: str) -> bool:
    normalized = normalize_gament_id(value)
    if not normalized.startswith("FLX-"):
        return False
    suffix = normalized[4:]
    return 4 <= len(suffix) <= 12 and all(ch.isalnum() or ch == "-" for ch in suffix)


async def sync_pre_registration(data: dict[str, Any], telegram_user: Any) -> tuple[bool, str]:
    """Push a Telegram pre-registration into the Gament web app.

    Returns (ok, message). The bot still keeps a local SQLite copy even if this
    sync fails, so temporary web-app downtime does not lose leads.
    """
    if not settings.telegram_integration_secret:
        return False, "TELEGRAM_INTEGRATION_SECRET is not configured in bot .env"

    endpoint = f"{settings.app_url}/api/integrations/telegram/pre-registrations"
    payload = {
        "telegramId": str(getattr(telegram_user, "id", "")),
        "telegramUsername": getattr(telegram_user, "username", None),
        "telegramFirstName": getattr(telegram_user, "first_name", None),
        "telegramLastName": getattr(telegram_user, "last_name", None),
        "gamentId": data.get("gament_id") or None,
        "fullName": data.get("full_name") or "",
        "phoneNumber": data.get("phone") or "",
        "game": normalize_game_id(data.get("game")) or data.get("game") or "",
        "platform": data.get("platform") or None,
        "gamerTag": data.get("gamer_tag") or "",
        "city": data.get("city") or None,
        "teamName": data.get("team_name") or None,
        "source": "telegram_bot",
    }

    def _post() -> tuple[bool, str]:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            endpoint,
            data=body,
            method="POST",
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": f"Bearer {settings.telegram_integration_secret}",
                "User-Agent": "GamentTelegramBot/1.0",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                response_body = response.read().decode("utf-8")
            return 200 <= response.status < 300, response_body
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            return False, f"HTTP {exc.code}: {detail[:500]}"
        except Exception as exc:
            return False, str(exc)

    return await asyncio.to_thread(_post)


async def fetch_tournaments(game: str | None = None, limit: int = 20) -> list[dict[str, Any]]:
    params: dict[str, str] = {"limit": str(limit)}
    game_id = normalize_game_id(game)
    if game_id:
        params["game"] = game_id
    url = f"{settings.app_url}/api/tournaments?{urllib.parse.urlencode(params)}"

    def _fetch() -> list[dict[str, Any]]:
        req = urllib.request.Request(
            url,
            headers={
                "Accept": "application/json",
                "User-Agent": "GamentTelegramBot/1.0",
            },
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8"))
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict) and isinstance(payload.get("data"), list):
            return payload["data"]
        return []

    return await asyncio.to_thread(_fetch)


def status_fa(status: str | None) -> str:
    return {
        "registration": "ثبت‌نام باز",
        "in_progress": "در حال برگزاری",
        "completed": "تمام‌شده",
        "cancelled": "لغوشده",
    }.get(status or "", status or "نامشخص")


def format_tournament_card(tournament: dict[str, Any], index: int) -> str:
    game = game_title(tournament.get("game"), bilingual=False)
    name = tournament.get("name") or "روم بدون عنوان"
    registered = tournament.get("registeredCount", 0)
    max_players = tournament.get("maxPlayers") or "?"
    entry_fee = tournament.get("entryFee") or "رایگان"
    prize = tournament.get("prizePool") or tournament.get("prize1st") or "اعلام نشده"
    mode = tournament.get("gameMode") or "مود اعلام نشده"
    status = status_fa(tournament.get("status"))

    return "\n".join(
        [
            f"<b>{index}. {esc(name)}</b>",
            f"🎮 {esc(game)} | {esc(mode)}",
            f"👥 ظرفیت: <b>{registered}/{max_players}</b>",
            f"💳 ورودی: <b>{esc(entry_fee)}</b>",
            f"🏆 جایزه: <b>{esc(prize)}</b>",
            f"📌 وضعیت: <b>{esc(status)}</b>",
        ]
    )


def format_tournaments_message(tournaments: list[dict[str, Any]], game: str | None = None) -> str:
    title = "🏟 <b>روم‌های فعال Gament</b>"
    if game:
        title += f" — {esc(game_title(game, bilingual=False))}"
    if not tournaments:
        return title + "\n\nفعلاً روم فعالی پیدا نشد. از وب‌اپ گیمنت هم می‌توانی آخرین وضعیت را ببینی."

    parts = [title, ""]
    for index, tournament in enumerate(tournaments[:10], start=1):
        parts.append(format_tournament_card(tournament, index))
        parts.append("")
    parts.append("برای ثبت‌نام قطعی، پرداخت ورودی احتمالی و مشاهده لابی، وارد وب‌اپ گیمنت شو.")
    return "\n".join(parts).strip()
