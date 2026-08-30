"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";

interface PrizeData {
  tournaments: Array<{ id: string; name: string; status: string; game: string }>;
  players: Array<{ playerId: string; playerName: string; playerUsername: string; userId: string; userDisplayName: string; phoneNumber: string }>;
  recentPrizes: Array<Record<string, any>>;
}

export default function AdminPrizesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<PrizeData | null>(null);
  const [busy, setBusy] = useState(true);
  const [form, setForm] = useState({ tournamentId: "", playerId: "", amountToman: "", reason: "پرداخت جایزه تورنومنت" });
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/prizes", { cache: "no-store" });
      const json = await res.json();
      setData(res.ok ? json : null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.push("/"); }, [loading, user, isAdmin, router]);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const players = useMemo(() => {
    const rows = data?.players || [];
    const q = query.toLowerCase();
    return q ? rows.filter((p) => JSON.stringify(p).toLowerCase().includes(q)) : rows;
  }, [data, query]);

  async function pay(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/prizes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "پرداخت جایزه انجام نشد");
      setMessage("جایزه با موفقیت به کیف پول کاربر واریز شد.");
      setForm({ tournamentId: "", playerId: "", amountToman: "", reason: "پرداخت جایزه تورنومنت" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "پرداخت جایزه انجام نشد");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user || !isAdmin) return null;

  return <div className="min-h-screen bg-dark-900 text-white"><Navbar /><main className="max-w-6xl mx-auto px-4 sm:px-6 py-8"><button onClick={() => router.push("/admin")} className="text-gray-500 hover:text-white mb-4">← بازگشت</button><h1 className="text-3xl font-black neon-text-purple mb-2">🏆 پرداخت جایزه</h1><p className="text-gray-500 text-sm mb-6">واریز جایزه تورنومنت به کیف پول بازیکن و ثبت تراکنش tournament_win</p>{error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-3 mb-5 text-sm">{error}</div>}{message && <div className="bg-green-500/10 border border-green-500/30 text-green-300 rounded-xl p-3 mb-5 text-sm">{message}</div>}{busy ? <div className="text-center py-20 text-4xl animate-neon-pulse">🏆</div> : data && <><form onSubmit={pay} className="gaming-card p-5 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4"><select className="gaming-select" value={form.tournamentId} onChange={(e) => setForm({ ...form, tournamentId: e.target.value })}><option value="">انتخاب تورنومنت</option>{data.tournaments.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.status})</option>)}</select><select className="gaming-select" value={form.playerId} onChange={(e) => setForm({ ...form, playerId: e.target.value })}><option value="">انتخاب بازیکن</option>{players.map((p) => <option key={p.playerId} value={p.playerId}>{p.playerName} / {p.userDisplayName}</option>)}</select><input className="gaming-input" placeholder="مبلغ USDT" value={form.amountToman} onChange={(e) => setForm({ ...form, amountToman: e.target.value })} /><input className="gaming-input" placeholder="دلیل پرداخت" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /><input className="gaming-input sm:col-span-2" placeholder="جستجوی سریع بازیکن..." value={query} onChange={(e) => setQuery(e.target.value)} /><button disabled={saving} className="gaming-btn sm:col-span-2 disabled:opacity-50">{saving ? "در حال پرداخت..." : "پرداخت جایزه"}</button></form><section className="gaming-card overflow-hidden"><div className="p-4 border-b border-white/5 font-black">پرداخت‌های اخیر جایزه</div><div className="divide-y divide-white/5">{data.recentPrizes.map((tx) => <div key={tx.id} className="p-4 flex justify-between gap-4"><div><div className="font-bold">{tx.userName || tx.username || "—"}</div><div className="text-xs text-gray-500 mt-1">{new Date(tx.createdAt).toLocaleString("fa-IR")}</div></div><div className="font-black text-neon-green">{Number(tx.amountToman || 0).toLocaleString("fa-IR")} USDT</div></div>)}</div></section></>}</main></div>;
}
