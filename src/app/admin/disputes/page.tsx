"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";

interface DisputeRow {
  id: string;
  matchId: string;
  tournamentName: string | null;
  playerName: string | null;
  reason: string;
  evidenceUrls: unknown;
  status: string;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export default function AdminDisputesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<DisputeRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<DisputeRow | null>(null);
  const [status, setStatus] = useState("resolved");
  const [resolution, setResolution] = useState("");
  const [error, setError] = useState("");
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try { const res = await fetch("/api/admin/disputes", { cache: "no-store" }); const data = await res.json(); if (!res.ok) throw new Error(data.error || "بارگذاری نشد"); setRows(Array.isArray(data) ? data : []); }
    catch (err) { setError(err instanceof Error ? err.message : "بارگذاری نشد"); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.push("/"); }, [loading, user, isAdmin, router]);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const filtered = useMemo(() => { const q = query.toLowerCase(); return q ? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q)) : rows; }, [query, rows]);

  function openResolve(row: DisputeRow) { setSelected(row); setStatus(row.status === "open" ? "resolved" : row.status); setResolution(row.resolution || ""); window.scrollTo({ top: 0, behavior: "smooth" }); }

  async function save(e: FormEvent) {
    e.preventDefault(); if (!selected) return; setError("");
    try { const res = await fetch("/api/admin/disputes", { method: "PATCH", headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" }, body: JSON.stringify({ id: selected.id, status, resolution }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || "ذخیره نشد"); setSelected(null); load(); }
    catch (err) { setError(err instanceof Error ? err.message : "ذخیره نشد"); }
  }

  async function remove(id: string) { if (!confirm("اعتراض حذف شود؟")) return; const res = await fetch("/api/admin/disputes", { method: "DELETE", headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" }, body: JSON.stringify({ id }) }); if (res.ok) load(); else alert("حذف نشد"); }

  if (loading || !user || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-dark-900 text-white"><Navbar /><main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8" style={{ paddingBottom: "calc(24px + var(--safe-bottom))" }}>
      <button onClick={() => router.push("/admin")} className="text-gray-500 hover:text-white mb-4">← بازگشت</button>
      <h1 className="text-3xl font-black neon-text-purple mb-2">🚨 مدیریت اعتراضات</h1>
      <p className="text-gray-500 text-sm mb-6">بررسی، پاسخ رسمی، حل‌وفصل یا حذف اعتراضات</p>
      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-3 mb-5 text-sm">{error}</div>}
      {selected && <form onSubmit={save} className="gaming-card p-4 sm:p-5 mb-6 animate-slide-up space-y-4"><div className="font-black">رسیدگی به اعتراض {selected.playerName || "—"}</div><select className="gaming-select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="open">باز</option><option value="under_review">در حال بررسی</option><option value="resolved">حل شده</option><option value="rejected">رد شده</option></select><textarea className="gaming-input min-h-28" placeholder="پاسخ/رأی مدیریت" value={resolution} onChange={(e) => setResolution(e.target.value)} /><div className="flex flex-col sm:flex-row gap-3"><button className="gaming-btn">ثبت رأی</button><button type="button" onClick={() => setSelected(null)} className="px-4 py-3 rounded-xl bg-dark-700 text-gray-300">انصراف</button></div></form>}
      <input className="gaming-input max-w-md mb-5" placeholder="جستجو..." value={query} onChange={(e) => setQuery(e.target.value)} />
      {busy ? <div className="text-center py-20 text-4xl animate-neon-pulse">🚨</div> : <div className="space-y-3">{filtered.map((d) => <div key={d.id} className="gaming-card p-4"><div className="flex flex-col sm:flex-row justify-between gap-3"><div><div className="font-black">{d.tournamentName || "—"} <span className="text-neon-pink">{d.status}</span></div><div className="text-xs text-gray-500 mt-1">{d.playerName || "—"} • {new Date(d.createdAt).toLocaleString("fa-IR")}</div><p className="text-sm text-gray-300 mt-3 leading-7">{d.reason}</p>{d.resolution && <div className="mt-3 text-xs bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-green-200">{d.resolution}</div>}</div><div className="flex sm:flex-col gap-2"><button onClick={() => openResolve(d)} className="text-neon-blue text-xs">رسیدگی</button><button onClick={() => remove(d.id)} className="text-red-400 text-xs">حذف</button></div></div></div>)}</div>}
    </main></div>
  );
}
