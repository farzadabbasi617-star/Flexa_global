"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";

interface JudgmentRow { id: string; matchId: string; tournamentName: string | null; verdict: string; isAiJudgment: boolean; confidence: number | null; reasoning: string | null; createdAt: string; judgeName: string | null; }
interface MatchOption { id: string; tournamentName: string | null; round: number; matchNumber: number; status: string; }
interface JudgeOption { id: string; name: string; }

export default function AdminJudgmentsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [judgments, setJudgments] = useState<JudgmentRow[]>([]);
  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [judges, setJudges] = useState<JudgeOption[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ matchId: "", judgeId: "", isAiJudgment: false, verdict: "needs_review", confidence: "80", reasoning: "" });
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try { const res = await fetch("/api/admin/judgments", { cache: "no-store" }); const data = await res.json(); if (!res.ok) throw new Error(data.error || "بارگذاری نشد"); setJudgments(data.judgments || []); setMatches(data.matches || []); setJudges(data.judges || []); }
    catch (err) { setError(err instanceof Error ? err.message : "بارگذاری نشد"); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.push("/"); }, [loading, user, isAdmin, router]);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const filtered = useMemo(() => { const q = query.toLowerCase(); return q ? judgments.filter((j) => JSON.stringify(j).toLowerCase().includes(q)) : judgments; }, [query, judgments]);

  async function create(e: FormEvent) {
    e.preventDefault(); setError("");
    try { const res = await fetch("/api/admin/judgments", { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" }, body: JSON.stringify(form) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || "ثبت نشد"); setShowForm(false); setForm({ matchId: "", judgeId: "", isAiJudgment: false, verdict: "needs_review", confidence: "80", reasoning: "" }); load(); }
    catch (err) { setError(err instanceof Error ? err.message : "ثبت نشد"); }
  }

  async function remove(id: string) { if (!confirm("داوری حذف شود؟")) return; const res = await fetch("/api/admin/judgments", { method: "DELETE", headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" }, body: JSON.stringify({ id }) }); if (res.ok) load(); else alert("حذف نشد"); }

  if (loading || !user || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-dark-900 text-white"><Navbar /><main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <button onClick={() => router.push("/admin")} className="text-gray-500 hover:text-white mb-4">← بازگشت</button>
      <div className="flex justify-between gap-4 mb-6"><div><h1 className="text-3xl font-black neon-text-purple">⚖️ مدیریت داوری‌ها</h1><p className="text-gray-500 text-sm mt-2">ثبت، مشاهده و حذف داوری‌های دستی و هوش مصنوعی</p></div><button onClick={() => setShowForm((v) => !v)} className="gaming-btn">+ داوری</button></div>
      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-3 mb-5 text-sm">{error}</div>}
      {showForm && <form onSubmit={create} className="gaming-card p-5 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4 animate-slide-up">
        <select className="gaming-select" value={form.matchId} onChange={(e) => setForm({ ...form, matchId: e.target.value })}><option value="">انتخاب مسابقه</option>{matches.map((m) => <option key={m.id} value={m.id}>{m.tournamentName || "—"} / {m.round}-{m.matchNumber}</option>)}</select>
        <select className="gaming-select" value={form.judgeId} onChange={(e) => setForm({ ...form, judgeId: e.target.value })}><option value="">بدون داور مشخص</option>{judges.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}</select>
        <select className="gaming-select" value={form.verdict} onChange={(e) => setForm({ ...form, verdict: e.target.value })}><option value="player1_wins">برد بازیکن ۱</option><option value="player2_wins">برد بازیکن ۲</option><option value="draw">مساوی</option><option value="rematch">بازی مجدد</option><option value="needs_review">نیاز به بررسی</option></select>
        <input className="gaming-input" placeholder="درصد اطمینان" value={form.confidence} onChange={(e) => setForm({ ...form, confidence: e.target.value })} />
        <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={form.isAiJudgment} onChange={(e) => setForm({ ...form, isAiJudgment: e.target.checked })} /> داوری AI</label>
        <textarea className="gaming-input sm:col-span-3 min-h-24" placeholder="استدلال" value={form.reasoning} onChange={(e) => setForm({ ...form, reasoning: e.target.value })} />
        <button className="gaming-btn sm:col-span-3">ثبت داوری</button>
      </form>}
      <input className="gaming-input max-w-md mb-5" placeholder="جستجو..." value={query} onChange={(e) => setQuery(e.target.value)} />
      {busy ? <div className="text-center py-20 text-4xl animate-neon-pulse">⚖️</div> : <div className="space-y-3">{filtered.map((j) => <div key={j.id} className="gaming-card p-4"><div className="flex flex-col sm:flex-row justify-between gap-3"><div><div className="font-black">{j.verdict} {j.isAiJudgment && <span className="text-neon-blue">🤖</span>}</div><div className="text-xs text-gray-500 mt-1">{j.tournamentName || "—"} • {j.judgeName || "بدون داور"} • {new Date(j.createdAt).toLocaleString("fa-IR")}</div><p className="text-sm text-gray-300 mt-3 leading-7">{j.reasoning || "—"}</p></div><button onClick={() => remove(j.id)} className="text-red-400 text-xs">حذف</button></div></div>)}</div>}
    </main></div>
  );
}
