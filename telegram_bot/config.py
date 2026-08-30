from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
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
            pass
    return ids


DEFAULT_RULES_EN = """
📜 Flexa Arena - Tournament Rules & Fair Play

1) Skill-Based Competition: All tournaments are strictly skill-based esports competitions.
2) Authentic Game IDs: Your registered Game ID (CODM UID, Clash Royale Tag) must match your active in-game profile.
3) Zero Tolerance for Cheating: Hacks, scripts, hacks, or score manipulation will result in immediate permanent disqualification.
4) Match Verification: Results are verified through screenshot proof and automated AI log analysis.
5) Crypto & Instant Payouts: Winners receive prize payouts in USDT / TON directly to their registered wallet.
""".strip()

DEFAULT_RULES_AR = """
📜 Flexa Arena - القوانين واللعب العادل

1) منافسات قتالية قائمة على المهارة: جميع البطولات هي منافسات رياضات إلكترونية عادلة.
2) معرفات ألعاب صحيحة: يجب أن يطابق معرف اللعبة (CODM UID ، Clash Tag) حسابك الفعلي داخل اللعبة.
3) منع الغش تماماً: استخدام أي هكر أو ثغرات يؤدي إلى الحظر الدائم وحرمان الجوائز.
4) التحقق من النتائج: يتم إثبات النتائج عبر صور الشاشة وتحليل الذكاء الاصطناعي.
5) جوائز فورية بالكريبتو: يتم توزيع الجوائز بالـ USDT و TON مباشرة على محفظتك.
""".strip()


@dataclass(frozen=True)
class Settings:
    bot_token: str
    admin_ids: set[int]
    tournament_title: str
    brand_name: str
    app_url: str
    games: list[str]
    ton_wallet: str
    support_url: str
    channel_url: str


_raw_app_url = os.getenv("APP_URL", "https://flexa.gg").strip().rstrip("/")

settings = Settings(
    bot_token=os.getenv("BOT_TOKEN", "").strip(),
    admin_ids=_split_int_csv(os.getenv("ADMIN_IDS")),
    tournament_title=os.getenv("TOURNAMENT_TITLE", "Flexa Arena Global — Next-Gen Esports").strip(),
    brand_name=os.getenv("BRAND_NAME", "Flexa Arena").strip(),
    app_url=_raw_app_url,
    games=_split_csv(
        os.getenv("GAMES"),
        ["COD MOBILE", "FORTNITE", "CLASH ROYALE"],
    ),
    ton_wallet=os.getenv("TON_WALLET_ADDRESS", "UQCwqcdcUzIvpdsLIJyzd1nVxGkit8q3KIQ1upXeSUEDxcwU").strip(),
    support_url=(os.getenv("SUPPORT_URL") or f"{_raw_app_url}/support").strip(),
    channel_url=(os.getenv("CHANNEL_URL") or "").strip(),
)
