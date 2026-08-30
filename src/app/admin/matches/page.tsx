"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";

interface MatchRow {
  id: string;
  tournamentName: string | null;
  round: number;
  matchNumber: number;
  player1Id: string | null;
  player2Id: string | null;
  winnerId: string | null;
  player1Name: string | null;
  player2Name: string | null;
  winnerName: string | null;
  player1Score: number | null;
  player2Score: number | null;
  status: string;
  scheduledAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface PlayerOption { id: string; displayName: string; username: string; }

const statuses = ["pending", "in_progress", "awaiting_judgment", "completed", "disputed"];

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function AdminMatchesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [busy, setBusy] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<MatchRow | null>(null);
  const [form, setForm] = useState({ status: "pending", player1Score: "", player2Score: "", winnerId: "", scheduledAt: "" });
  const [error, setError] = useState("");
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/matches", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "بارگذاری نشد");
      setMatches(data.matches || []);
      setPlayers(data.players || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "بارگذاری نشد");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.push("/"); }, [loading, user, isAdmin, router]);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return matches;
    return matches.filter((m) => JSON.stringify(m).toLowerCase().includes(q));
  }, [query, matches]);

  function startEdit(row: MatchRow) {
    setEditing(row);
    setForm({
      status: row.status,
      player1Score: row.player1Score?.toString() || "",
      player2Score: row.player2Score?.toString() || "",
      winnerId: row.winnerId || "",
      scheduledAt: toDateTimeLocal(row.scheduledAt),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError("");
    try {
      const res = await fetch("/api/admin/matches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ id: editing.id, ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ذخیره نشد");
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ذخیره نشد");
    }
  }

  async function remove(id: string) {
    if (!confirm("مسابقه و داوری/اعتراض‌های مرتبط حذف می‌شود. ادامه می‌دهی؟")) return;
    const res = await fetch("/api/admin/matches", { method: "DELETE", headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" }, body: JSON.stringify({ id }) });
    if (res.ok) load(); else alert("حذف انجام نشد");
  }

  if (loading || !user || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-dark-900 text-white">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8" style={{ paddingBottom: "calc(24px + var(--safe-bottom))" }}>
        <button onClick={() => router.push("/admin")} className="text-gray-500 hover:text-white mb-4">← بازگشت</button>
        <h1 className="text-3xl font-black neon-text-purple mb-2">⚔️ مدیریت مسابقات</h1>
        <p className="text-gray-500 text-sm mb-6">ثبت نتیجه، تعیین برنده، تغییر وضعیت و زمان‌بندی مسابقات</p>
        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-3 mb-5 text-sm">{error}</div>}

        {editing && (
          <form onSubmit={save} className="gaming-card p-4 sm:p-5 mb-6 grid grid-cols-1 sm:grid-cols-5 gap-4 animate-slide-up">
            <div className="sm:col-span-5 text-sm text-gray-300">ویرایش مسابقه {editing.tournamentName || "—"} / دور {editing.round} / شماره {editing.matchNumber}</div>
            <select className="gaming-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{statuses.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <input className="gaming-input" placeholder="امتیاز بازیکن ۱" value={form.player1Score} onChange={(e) => setForm({ ...form, player1Score: e.target.value })} />
            <input className="gaming-input" placeholder="امتیاز بازیکن ۲" value={form.player2Score} onChange={(e) => setForm({ ...form, player2Score: e.target.value })} />
            <select className="gaming-select" value={form.winnerId} onChange={(e) => setForm({ ...form, winnerId: e.target.value })}>
              <option value="">برنده نامشخص</option>
              {players.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
            </select>
            <input type="datetime-local" className="gaming-input" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
            <button className="gaming-btn sm:col-span-2">ذخیره</button>
            <button type="button" onClick={() => setEditing(null)} className="px-4 py-3 rounded-xl bg-dark-700 text-gray-300">انصراف</button>
          </form>
        )}

        <div className="mb-5 flex flex-col sm:flex-row gap-3"><input className="gaming-input max-w-md" placeholder="جستجو..." value={query} onChange={(e) => setQuery(e.target.value)} /><button onClick={load} className="px-4 py-3 rounded-xl bg-dark-700">🔄</button></div>
        {busy ? <div className="text-center py-20 text-4xl animate-neon-pulse">⚔️</div> : (
          <div className="gaming-card overflow-hidden"><div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 scrollbar-hide"><table className="w-full min-w-[980px] text-sm">
            <thead className="bg-dark-800 text-gray-400"><tr><th className="p-3 text-right">تورنومنت</th><th className="p-3 text-right">دور/شماره</th><th className="p-3 text-right">بازیکن‌ها</th><th className="p-3 text-right">امتیاز</th><th className="p-3 text-right">برنده</th><th className="p-3 text-right">وضعیت</th><th className="p-3 text-right">عملیات</th></tr></thead>
            <tbody>{filtered.map((m) => <tr key={m.id} className="border-t border-white/5 hover:bg-white/[.03]"><td className="p-3">{m.tournamentName || "—"}</td><td className="p-3">{m.round}/{m.matchNumber}</td><td className="p-3">{m.player1Name || "TBD"} vs {m.player2Name || "TBD"}</td><td className="p-3">{m.player1Score ?? "—"} - {m.player2Score ?? "—"}</td><td className="p-3">{m.winnerName || "—"}</td><td className="p-3 text-neon-purple">{m.status}</td><td className="p-3 flex gap-2"><button onClick={() => startEdit(m)} className="text-neon-blue text-xs">ویرایش</button><button onClick={() => remove(m.id)} className="text-red-400 text-xs">حذف</button></td></tr>)}</tbody>
          </table></div></div>
        )}
      </main>
    </div>
  );
}
