from __future__ import annotations
import csv
import psycopg2
from psycopg2.extras import RealDictCursor, execute_values
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import os
from config import settings

# We use the same DATABASE_URL as the Next.js app.
#
# NOTE: this bot used to be SQLite-backed (DB_PATH) and was migrated to the
# shared PostgreSQL database. If you find a DB_PATH setting anywhere, it is a
# leftover from that migration and is no longer read.
DATABASE_URL = os.getenv("DATABASE_URL")


def get_conn():
    """Returns a connection to the PostgreSQL database."""
    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL تنظیم نشده است.\n"
            "این ربات از همان دیتابیس PostgreSQL وب‌اپ Gament استفاده می‌کند.\n"
            "مقدار آن را در محیط اجرا (Render → Environment) تعریف کنید.\n"
            "توجه: DB_PATH قدیمی دیگر خوانده نمی‌شود."
        )
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()

def init_db() -> None:
    """
    Ensures necessary tables for the bot exist.
    Note: Most tables are already managed by Drizzle ORM in the Next.js app.
    We only ensure the bot-specific logic is consistent.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # The main tables (users, registrations, etc.) are already 
            # created by 'npm run db:push' in the Next.js app.
            # We just need to make sure we don't crash if they aren't there.
            pass
        conn.commit()

def upsert_user(user: Any) -> None:
    now = utc_now()
    query = """
        INSERT INTO users (telegram_id, username, first_name, last_name, created_at, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (phone_number) DO UPDATE SET
            username = EXCLUDED.username,
            updated_at = EXCLUDED.updated_at;
    """
    # Note: In the PostgreSQL schema, telegram_id is not the primary key. 
    # We must handle this carefully. Since we are syncing with the Web App,
    # we will use the telegram_pre_registrations table for bot-first users.
    pass

def save_registration(telegram_id: int, data: dict[str, Any]) -> None:
    now = utc_now()
    query = """
        INSERT INTO telegram_pre_registrations 
        (telegram_id, telegram_username, telegram_first_name, telegram_last_name, 
         gament_id, full_name, phone_number, game, platform, gamer_tag, city, team_name, status, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'new', %s)
        ON CONFLICT (telegram_id) DO UPDATE SET
            gament_id = EXCLUDED.gament_id,
            full_name = EXCLUDED.full_name,
            phone_number = EXCLUDED.phone_number,
            game = EXCLUDED.game,
            platform = EXCLUDED.platform,
            gamer_tag = EXCLUDED.gamer_tag,
            city = EXCLUDED.city,
            team_name = EXCLUDED.team_name,
            status = 'new',
            updated_at = EXCLUDED.updated_at;
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(query, (
                str(telegram_id),
                data.get("username"),
                data.get("first_name"),
                data.get("last_name"),
                data.get("gament_id") or None,
                data["full_name"],
                data["phone"],
                data["game"],
                data["platform"],
                data["gamer_tag"],
                data.get("city") or None,
                data.get("team_name") or None,
                now
            ))
        conn.commit()

def cancel_registration(telegram_id: int) -> bool:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE telegram_pre_registrations SET status='archived', updated_at=%s WHERE telegram_id=%s AND status='new'",
                (utc_now(), str(telegram_id))
            )
            count = cur.rowcount
        conn.commit()
        return count > 0

def get_registration(telegram_id: int) -> dict[str, Any] | None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM telegram_pre_registrations WHERE telegram_id=%s ORDER BY updated_at DESC LIMIT 1",
                (str(telegram_id),)
            )
            return cur.fetchone()

def get_stats() -> dict[str, Any]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) as c FROM telegram_pre_registrations WHERE status='new'")
            total = cur.fetchone()['c']
            
            cur.execute("SELECT COUNT(*) as c FROM telegram_pre_registrations WHERE status='new' AND gament_id IS NOT NULL AND gament_id != ''")
            with_gament_id = cur.fetchone()['c']
            
            cur.execute("SELECT game, COUNT(*) as c FROM telegram_pre_registrations WHERE status='new' GROUP BY game ORDER BY c DESC")
            by_game = cur.fetchall()
            
            cur.execute("SELECT platform, COUNT(*) as c FROM telegram_pre_registrations WHERE status='new' GROUP BY platform ORDER BY c DESC")
            by_platform = cur.fetchall()
            
    return {
        "total": total,
        "with_gament_id": with_gament_id,
        "by_game": [dict(row) for row in by_game],
        "by_platform": [dict(row) for row in by_platform],
    }

def list_players(limit: int = 20, game: str | None = None) -> list[dict[str, Any]]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            if game:
                cur.execute(
                    "SELECT * FROM telegram_pre_registrations WHERE status='new' AND game=%s ORDER BY created_at DESC LIMIT %s",
                    (game, limit)
                )
            else:
                cur.execute(
                    "SELECT * FROM telegram_pre_registrations WHERE status='new' ORDER BY created_at DESC LIMIT %s",
                    (limit,)
                )
            return [dict(row) for row in cur.fetchall()]

def get_active_players(game: str | None = None) -> list[dict[str, Any]]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            if game:
                cur.execute(
                    "SELECT * FROM telegram_pre_registrations WHERE status='new' AND LOWER(game)=LOWER(%s) ORDER BY created_at ASC",
                    (game,)
                )
            else:
                cur.execute(
                    "SELECT * FROM telegram_pre_registrations WHERE status='new' ORDER BY created_at ASC",
                )
            return [dict(row) for row in cur.fetchall()]

def get_active_telegram_ids() -> list[int]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT telegram_id FROM telegram_pre_registrations WHERE status='new'")
            return [int(row["telegram_id"]) for row in cur.fetchall()]

def export_registrations_csv(output_dir: Path | None = None) -> Path:
    output_dir = output_dir or (Path(os.getcwd()) / "exports")
    output_dir.mkdir(parents=True, exist_ok=True)
    filename = f"gament_telegram_registrations_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    path = output_dir / filename

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM telegram_pre_registrations ORDER BY created_at ASC")
            rows = cur.fetchall()
            if not rows:
                return path
            
            headers = rows[0].keys()
            with path.open("w", newline="", encoding="utf-8-sig") as f:
                writer = csv.DictWriter(f, fieldnames=headers)
                writer.writeheader()
                writer.writerows(rows)
    return path
