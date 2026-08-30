"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import {
  CLASH_PRIVATE_DRAFT_CAPACITIES,
  CLASH_PRIVATE_DRAFT_CATEGORY,
  CLASH_PRIVATE_DRAFT_DEFAULT_CAPACITY,
  CLASH_PRIVATE_DRAFT_DESCRIPTION,
  CLASH_PRIVATE_DRAFT_MODE,
  CLASH_PRIVATE_DRAFT_RULES,
  CLASH_PRIVATE_DRAFT_VENUE,
} from "@/lib/clash-private-tournament";
import { CLASH_1V1_CONFIG } from "@/lib/clash-1v1-config";

type GameId = "clash_royale" | "cod_mobile" | "fortnite";
type FormatId = "single_elimination" | "double_elimination" | "round_robin";

type TournamentRow = {
  id: string;
  name: string;
  game: GameId;
  format: FormatId;
  status: string;
  description: string | null;
  maxPlayers: number;
  prizePool: string | null;
  winnersCount: number | null;
  categoryLabel: string | null;
  entryFee: string | null;
  gameMode: string | null;
  mapName: string | null;
  serverSlots: number | null;
  prize1st: string | null;
  prize2nd: string | null;
  prize3rd: string | null;
  prize4to10: string | null;
  rules: string | null;
  bannerUrl: string | null;
  roomId: string | null;
  roomPassword: string | null;
  lobbyNotes: string | null;
  roomVisibleAt: string | null;
  startDate: string | null;
  endDate: string | null;
  registrations: number;
  checkedInCount?: number;
  noShowCount?: number;
};

const games = [
  { id: "clash_royale", name: "کلش رویال", icon: "⚔️" },
  { id: "cod_mobile", name: "کالاف موبایل", icon: "🎯" },
  { id: "fortnite", name: "فورتنایت", icon: "🏗️" },
] as const;

const formats = [
  { id: "single_elimination", name: "حذفی" },
  { id: "double_elimination", name: "حذفی دوگانه" },
  { id: "round_robin", name: "لیگ / گروهی" },
] as const;

const statuses = [
  { id: "registration", name: "ثبت‌نام" },
  { id: "in_progress", name: "در جریان" },
  { id: "completed", name: "تکمیل‌شده" },
  { id: "cancelled", name: "لغوشده" },
] as const;

const emptyForm = {
  id: "",
  name: "",
  game: "clash_royale" as GameId,
  format: "round_robin" as FormatId,
  status: "registration",
  description: CLASH_PRIVATE_DRAFT_DESCRIPTION,
  maxPlayers: CLASH_PRIVATE_DRAFT_DEFAULT_CAPACITY,
  prizePool: "",
  winnersCount: 3,
  categoryLabel: CLASH_PRIVATE_DRAFT_CATEGORY,
  entryFee: "رایگان",
  gameMode: CLASH_PRIVATE_DRAFT_MODE,
  mapName: CLASH_PRIVATE_DRAFT_VENUE,
  serverSlots: CLASH_PRIVATE_DRAFT_DEFAULT_CAPACITY,
  prize1st: "",
  prize2nd: "",
  prize3rd: "",
  prize4to10: "",
  rules: CLASH_PRIVATE_DRAFT_RULES,
  bannerUrl: "",
  roomId: "",
  roomPassword: "",
  lobbyNotes: "",
  roomVisibleAt: "",
  startDate: "",
  endDate: "",
};

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function AdminTournamentsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<TournamentRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/tournaments", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "بارگذاری نشد");
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "بارگذاری نشد");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.push("/");
  }, [loading, user, isAdmin, router]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(q));
  }, [query, rows]);

  function changeGame(game: GameId) {
    if (game === "clash_royale") {
      setForm((current) => ({
        ...current,
        game,
        format: "round_robin",
        categoryLabel: CLASH_PRIVATE_DRAFT_CATEGORY,
        gameMode: CLASH_PRIVATE_DRAFT_MODE,
        mapName: CLASH_PRIVATE_DRAFT_VENUE,
        maxPlayers: CLASH_PRIVATE_DRAFT_DEFAULT_CAPACITY,
        serverSlots: CLASH_PRIVATE_DRAFT_DEFAULT_CAPACITY,
        winnersCount: 3,
        description: CLASH_PRIVATE_DRAFT_DESCRIPTION,
        rules: CLASH_PRIVATE_DRAFT_RULES,
        // A private Clash draft is not a manual room: clear stale room fields so
        // normalizeClashPrivateDraftSettings / the API never receive a leftover
        // Room ID/Password that has no meaning here (fixes "room creation error").
        roomId: "",
        roomPassword: "",
        roomVisibleAt: "",
        lobbyNotes: "",
      }));
      return;
    }
    // Non-Clash games are normal hosted rooms. Make absolutely sure the clash
    // private-draft category is cleared so the draft-only normalizer does not
    // reject the capacity of a regular COD/Fortnite room.
    setForm((current) => ({ ...current, game, categoryLabel: "", gameMode: "", mapName: "" }));
  }

  function edit(row: TournamentRow) {
    setForm({
      id: row.id,
      name: row.name,
      game: row.game,
      format: row.format,
      status: row.status,
      description: row.description || "",
      maxPlayers: row.maxPlayers,
      prizePool: row.prizePool || "",
      winnersCount: row.winnersCount || 1,
      categoryLabel: row.categoryLabel || "",
      entryFee: row.entryFee || "رایگان",
      gameMode: row.gameMode || "",
      mapName: row.mapName || "",
      serverSlots: row.serverSlots || row.maxPlayers || 16,
      prize1st: row.prize1st || "",
      prize2nd: row.prize2nd || "",
      prize3rd: row.prize3rd || "",
      prize4to10: row.prize4to10 || "",
      rules: row.rules || "",
      bannerUrl: row.bannerUrl || "",
      roomId: row.roomId || "",
      roomPassword: row.roomPassword || "",
      lobbyNotes: row.lobbyNotes || "",
      roomVisibleAt: toDateTimeLocal(row.roomVisibleAt),
      startDate: toDateTimeLocal(row.startDate),
      endDate: toDateTimeLocal(row.endDate),
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startNew() {
    setForm(emptyForm);
    setShowForm(true);
  }

  function isSystemClash1v1Form() {
    return form.categoryLabel === CLASH_1V1_CONFIG.categoryLabel;
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/tournaments", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ ...form, startDate: form.startDate || null, endDate: form.endDate || null, roomVisibleAt: form.roomVisibleAt || null }),
      });
      let data: { error?: string } = {};
      try { data = await res.json(); } catch { /* non-JSON (e.g. auth redirect / 500) */ }
      if (!res.ok) {
        const reason = data.error
          || (res.status === 401 ? "نشست ادمین منقضی شده؛ دوباره وارد شو." : "")
          || (res.status === 403 ? "دسترسی ادمین نداری." : "")
          || (res.status === 400 ? "داده‌های فرم نامعتبر است." : "")
          || `ذخیره نشد (کد ${res.status})`;
        throw new Error(reason);
      }
      setShowForm(false);
      setForm(emptyForm);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ذخیره نشد");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("تورنومنت و مسابقات/داوری‌های وابسته حذف می‌شوند. ادامه می‌دهی؟")) return;
    try {
      const res = await fetch("/api/admin/tournaments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("delete failed");
      load();
    } catch {
      alert("حذف انجام نشد");
    }
  }

  if (loading || !user || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-dark-900 text-white">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8" style={{ paddingBottom: "calc(24px + var(--safe-bottom))" }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <button onClick={() => router.push("/admin")} className="text-gray-500 hover:text-white mb-3">← بازگشت</button>
            <h1 className="text-3xl font-black neon-text-purple">🏆 مدیریت کامل تورنومنت‌ها</h1>
            <p className="text-gray-500 text-sm mt-2">ایجاد، ویرایش، حذف، وضعیت، جوایز، قوانین و تصویر بنر تورنومنت</p>
          </div>
          <button onClick={startNew} className="gaming-btn">+ تورنومنت جدید</button>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-3 mb-5 text-sm">{error}</div>}

        {showForm && (
          <form onSubmit={save} className="gaming-card p-4 sm:p-5 mb-8 grid grid-cols-1 md:grid-cols-2 gap-4 animate-slide-up">
            <input className="gaming-input" placeholder="نام تورنومنت" value={form.name} readOnly={isSystemClash1v1Form()} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="gaming-input" placeholder="لینک تصویر بنر" value={form.bannerUrl} onChange={(e) => setForm({ ...form, bannerUrl: e.target.value })} />
            <div className="md:col-span-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-4 text-sm leading-7 text-cyan-100">
              <b>⚔️ محصول خودکار 1V1 کلش رویال</b><br />
              این گزینه <b>روم نمی‌سازد</b>. ورودی هر نفر ۵۰٬۰۰۰ USDT و جایزه برنده ۸۰٬۰۰۰ USDT است؛ ثبت‌نام، پرداخت، دریافت QR/Share Link و مچ‌کردن دو بازیکن فقط توسط بات تلگرام انجام می‌شود.
              <button
                type="button"
                className="mt-3 gaming-btn text-xs"
                onClick={() => setForm({
                  ...form,
                  id: "",
                  name: CLASH_1V1_CONFIG.name,
                  game: "clash_royale",
                  format: "single_elimination",
                  status: "registration",
                  categoryLabel: CLASH_1V1_CONFIG.categoryLabel,
                  maxPlayers: CLASH_1V1_CONFIG.maxPlayers,
                  serverSlots: 2,
                  winnersCount: 1,
                  entryFee: CLASH_1V1_CONFIG.entryFee,
                  prizePool: CLASH_1V1_CONFIG.prizePool,
                  prize1st: CLASH_1V1_CONFIG.prize1st,
                  prize2nd: "",
                  prize3rd: "",
                  prize4to10: "",
                  gameMode: CLASH_1V1_CONFIG.gameMode,
                  mapName: CLASH_1V1_CONFIG.mapName,
                  description: CLASH_1V1_CONFIG.description,
                  rules: CLASH_1V1_CONFIG.rules,
                  lobbyNotes: CLASH_1V1_CONFIG.lobbyNotes,
                  roomId: "",
                  roomPassword: "",
                  roomVisibleAt: "",
                })}
              >
                ⚙️ تنظیم فرم به 1V1 خودکار — ۵۰K / ۸۰K
              </button>
            </div>
            <select className="gaming-select" value={form.game} disabled={isSystemClash1v1Form()} onChange={(e) => changeGame(e.target.value as GameId)}>{games.map((g) => <option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}</select>
            <select className="gaming-select" value={form.format} disabled={form.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY || isSystemClash1v1Form()} onChange={(e) => setForm({ ...form, format: e.target.value as FormatId })}>{formats.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
            <select className="gaming-select" value={form.status} disabled={isSystemClash1v1Form()} onChange={(e) => setForm({ ...form, status: e.target.value })}>{statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <input className="gaming-input" title="زمان شروع" type="datetime-local" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            <input className="gaming-input" title="زمان پایان" type="datetime-local" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            <input className="gaming-input" placeholder="مود بازی" value={form.gameMode} readOnly={form.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY || isSystemClash1v1Form()} onChange={(e) => setForm({ ...form, gameMode: e.target.value })} />
            <input className="gaming-input" placeholder="محل برگزاری" value={form.mapName} readOnly={form.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY || isSystemClash1v1Form()} onChange={(e) => setForm({ ...form, mapName: e.target.value })} />
            {form.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY ? (
              <select
                className="gaming-select md:col-span-2"
                value={form.maxPlayers}
                onChange={(e) => {
                  const capacity = Number(e.target.value);
                  setForm({ ...form, maxPlayers: capacity, serverSlots: capacity });
                }}
              >
                {CLASH_PRIVATE_DRAFT_CAPACITIES.map((capacity) => (
                  <option key={capacity} value={capacity}>ظرفیت رسمی کلش: {capacity} نفر</option>
                ))}
              </select>
            ) : (
              <>
                <input className="gaming-input" type="number" placeholder="حداکثر بازیکن" value={form.maxPlayers} onChange={(e) => setForm({ ...form, maxPlayers: Number(e.target.value) })} />
                <input className="gaming-input" type="number" placeholder="ظرفیت سرور" value={form.serverSlots} onChange={(e) => setForm({ ...form, serverSlots: Number(e.target.value) })} />
              </>
            )}
            <input className="gaming-input" placeholder="ورودی" value={form.entryFee} onChange={(e) => setForm({ ...form, entryFee: e.target.value })} />
            <input className="gaming-input" placeholder="کل جایزه" value={form.prizePool} onChange={(e) => setForm({ ...form, prizePool: e.target.value })} />
            <input className="gaming-input" placeholder="نفر اول" value={form.prize1st} onChange={(e) => setForm({ ...form, prize1st: e.target.value })} />
            <input className="gaming-input" placeholder="نفر دوم" value={form.prize2nd} onChange={(e) => setForm({ ...form, prize2nd: e.target.value })} />
            <input className="gaming-input" placeholder="نفر سوم" value={form.prize3rd} onChange={(e) => setForm({ ...form, prize3rd: e.target.value })} />
            <input className="gaming-input" placeholder="نفرات ۴ تا ۱۰" value={form.prize4to10} onChange={(e) => setForm({ ...form, prize4to10: e.target.value })} />
            {isSystemClash1v1Form() ? (
              <div className="md:col-span-2 gaming-card p-4 bg-cyan-400/10 border-cyan-400/30 text-sm leading-7 text-cyan-100">
                🤖 <b>این محصول خودکار است و روم ندارد.</b> Room ID، Password و زمان نمایش روم توسط بات مدیریت نمی‌شوند؛ ثبت‌نام، پرداخت و مچ‌میکینگ فقط در بات تلگرام انجام می‌شود.
              </div>
            ) : (
            <div className="md:col-span-2 gaming-card p-4 bg-dark-800/60 border-neon-blue/20">
              <h3 className="font-black text-neon-blue mb-3">🎮 اطلاعات لابی / روم بازی</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input className="gaming-input" placeholder="Room ID / Lobby ID" value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })} />
                <input className="gaming-input" placeholder="Password" value={form.roomPassword} onChange={(e) => setForm({ ...form, roomPassword: e.target.value })} />
                <input className="gaming-input" type="datetime-local" title="زمان نمایش اطلاعات روم" value={form.roomVisibleAt} onChange={(e) => setForm({ ...form, roomVisibleAt: e.target.value })} />
                <textarea className="gaming-input min-h-20 md:col-span-3" placeholder="توضیحات و قوانین اختصاصی لابی" value={form.lobbyNotes} onChange={(e) => setForm({ ...form, lobbyNotes: e.target.value })} />
              </div>
              <p className="text-[11px] text-gray-500 mt-3 leading-6">اگر زمان نمایش را خالی بگذاری، اطلاعات روم ۳۰ دقیقه قبل از شروع برای شرکت‌کنندگان نمایش داده می‌شود. ادمین‌ها همیشه می‌بینند.</p>
            </div>
            )}
            <textarea className="gaming-input min-h-24 md:col-span-2" placeholder="توضیحات" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <textarea className="gaming-input min-h-28 md:col-span-2" placeholder="قوانین" value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })} />
            <div className="md:col-span-2 flex flex-col sm:flex-row gap-3">
              <button disabled={saving} className="gaming-btn disabled:opacity-50">{saving ? "ذخیره..." : "ذخیره"}</button>
              <button type="button" onClick={() => setShowForm(false)} className="px-5 py-3 rounded-xl bg-dark-700 text-gray-300">انصراف</button>
            </div>
          </form>
        )}

        <div className="mb-5 flex flex-col sm:flex-row gap-3">
          <input className="gaming-input max-w-md" placeholder="جستجو..." value={query} onChange={(e) => setQuery(e.target.value)} />
          <button onClick={load} className="px-4 py-3 rounded-xl bg-dark-700 text-sm font-bold">🔄</button>
        </div>

        {busy ? <div className="text-center py-20 text-4xl animate-neon-pulse">🏆</div> : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filtered.map((row) => (
              <article key={row.id} className="gaming-card p-4 sm:p-5 overflow-hidden relative">
                {row.bannerUrl && <img src={row.bannerUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-15" loading="lazy" decoding="async" />}
                <div className="relative">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div>
                      <h2 className="font-black text-lg text-white">{row.name}</h2>
                      <p className="text-xs text-gray-500 mt-1">{row.game} • {row.format} • {row.registrations} ثبت‌نام</p>
                    </div>
                    <span className="text-xs px-3 py-1 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">{row.status}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-4 text-xs text-gray-400">
                    <div>ظرفیت: {row.maxPlayers}</div><div>سرور: {row.serverSlots || "—"}</div>
                    <div>ورودی: {row.entryFee || "—"}</div><div>جایزه: {row.prizePool || "—"}</div>
                    {row.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY && (
                      <><div className="text-green-300">چک‌این: {row.checkedInCount || 0}</div><div className="text-orange-300">No-show: {row.noShowCount || 0}</div></>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-5">
                    <Link href={`/tournaments/${row.id}`} className="px-3 py-2 rounded-lg bg-dark-700 text-neon-blue text-xs font-bold">مشاهده</Link>
                    {row.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY && (
                      <Link href={`/admin/tournaments/${row.id}/leaderboard`} className="px-3 py-2 rounded-lg bg-yellow-500/10 text-yellow-300 text-xs font-bold">🏅 Leaderboard</Link>
                    )}
                    <button onClick={() => edit(row)} className="px-3 py-2 rounded-lg bg-dark-700 text-neon-green text-xs font-bold">ویرایش</button>
                    <button onClick={() => remove(row.id)} className="px-3 py-2 rounded-lg bg-red-500/10 text-red-300 text-xs font-bold">حذف</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
