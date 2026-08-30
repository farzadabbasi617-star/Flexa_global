"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";

interface StandingRow {
  rank: number;
  playerName: string;
  playerTag: string | null;
  score: number | null;
  verified?: boolean;
  userId?: string | null;
}

export default function PrivateClashLeaderboardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [tournamentName, setTournamentName] = useState("");
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [parsedRows, setParsedRows] = useState<StandingRow[]>([]);
  const [submissionId, setSubmissionId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/tournaments/${params.id}/leaderboard`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "بارگذاری انجام نشد.");
    setTournamentName(data.tournament?.name || "مسابقه خصوصی کلش");
    setStandings(Array.isArray(data.standings) ? data.standings : []);
  }, [params.id]);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.push("/");
  }, [loading, user, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin) return;
    load().catch((err) => setError(err instanceof Error ? err.message : "بارگذاری انجام نشد."));
  }, [isAdmin, load]);

  async function uploadAndParse() {
    if (!file) return setError("ابتدا تصویر Leaderboard را انتخاب کن.");
    setBusy(true); setError(""); setMessage("");
    try {
      const upload = new FormData();
      upload.append("file", file);
      upload.append("folder", "flexa/clash-leaderboards");
      const uploadResponse = await fetch("/api/admin/upload", { method: "POST", body: upload });
      const uploaded = await uploadResponse.json();
      if (!uploadResponse.ok) throw new Error(uploaded.error || "آپلود تصویر انجام نشد.");

      const parseResponse = await fetch(`/api/admin/tournaments/${params.id}/leaderboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ imageUrl: uploaded.url }),
      });
      const parsed = await parseResponse.json();
      if (!parseResponse.ok) throw new Error(parsed.error || "OCR انجام نشد.");
      setSubmissionId(parsed.submissionId);
      setParsedRows(parsed.rows || []);
      setMessage(`${(parsed.rows || []).length.toLocaleString("fa-IR")} ردیف استخراج شد؛ قبل از ثبت نهایی بررسی و اصلاح کن.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "پردازش انجام نشد.");
    } finally { setBusy(false); }
  }

  function updateRow(index: number, patch: Partial<StandingRow>) {
    setParsedRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }

  async function confirmRows() {
    if (!submissionId || !parsedRows.length) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/admin/tournaments/${params.id}/leaderboard`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ submissionId, rows: parsedRows }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "ثبت نتایج انجام نشد.");
      setMessage(`نتایج ثبت شد: ${data.matched.toLocaleString("fa-IR")} متصل، ${data.unmatched.toLocaleString("fa-IR")} نیازمند تطبیق دستی.`);
      setParsedRows([]); setSubmissionId(""); setFile(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ثبت انجام نشد.");
    } finally { setBusy(false); }
  }

  async function finalize() {
    if (!confirm("نتایج نهایی و جوایز به کیف پول نفرات برتر واریز شوند؟ این عملیات قابل تکرار نیست.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/admin/tournaments/${params.id}/leaderboard`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: "{}",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "نهایی‌سازی انجام نشد.");
      setMessage(`مسابقه نهایی شد و ${data.payments.length.toLocaleString("fa-IR")} جایزه پرداخت شد.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "نهایی‌سازی انجام نشد.");
    } finally { setBusy(false); }
  }

  if (loading || !user || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-dark-900 text-white">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 pb-28">
        <button onClick={() => router.push("/admin/tournaments")} className="text-gray-500 hover:text-white mb-4">← بازگشت</button>
        <h1 className="text-2xl sm:text-3xl font-black neon-text-purple">🏅 Leaderboard مسابقه خصوصی</h1>
        <p className="text-gray-400 text-sm mt-2 mb-6">{tournamentName}</p>

        {error && <div className="mb-5 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-red-300 text-sm">{error}</div>}
        {message && <div className="mb-5 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-green-300 text-sm">{message}</div>}

        <section className="gaming-card p-5 mb-6">
          <h2 className="font-black text-cyan-300 mb-2">۱. ارسال تصویر جدول داخل Clash Royale</h2>
          <p className="text-xs text-gray-500 leading-6 mb-4">برای جدول‌های طولانی چند تصویر بفرست. هر خروجی OCR قبل از ثبت قابل ویرایش است.</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} className="gaming-input flex-1" />
            <button onClick={uploadAndParse} disabled={busy || !file} className="gaming-btn px-5 disabled:opacity-50">{busy ? "در حال پردازش..." : "🤖 استخراج رتبه‌ها"}</button>
          </div>
        </section>

        {parsedRows.length > 0 && (
          <section className="gaming-card p-5 mb-6 overflow-x-auto">
            <h2 className="font-black text-yellow-300 mb-4">۲. بازبینی خروجی OCR</h2>
            <table className="w-full min-w-[650px] text-sm">
              <thead><tr className="text-gray-500 border-b border-white/10"><th className="p-2">رتبه</th><th>نام</th><th>Player Tag</th><th>امتیاز</th><th></th></tr></thead>
              <tbody>{parsedRows.map((row, index) => (
                <tr key={`${row.rank}-${index}`} className="border-b border-white/5">
                  <td className="p-2"><input className="gaming-input w-20" type="number" value={row.rank} onChange={(e) => updateRow(index, { rank: Number(e.target.value) })} /></td>
                  <td><input className="gaming-input" value={row.playerName} onChange={(e) => updateRow(index, { playerName: e.target.value })} /></td>
                  <td><input className="gaming-input" value={row.playerTag || ""} onChange={(e) => updateRow(index, { playerTag: e.target.value || null })} /></td>
                  <td><input className="gaming-input w-28" type="number" value={row.score ?? ""} onChange={(e) => updateRow(index, { score: e.target.value ? Number(e.target.value) : null })} /></td>
                  <td><button onClick={() => setParsedRows((rows) => rows.filter((_, i) => i !== index))} className="text-red-300 px-3">حذف</button></td>
                </tr>
              ))}</tbody>
            </table>
            <button onClick={confirmRows} disabled={busy} className="gaming-btn mt-5">✅ ثبت ردیف‌های تأییدشده</button>
          </section>
        )}

        <section className="gaming-card p-5 overflow-x-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div><h2 className="font-black text-neon-purple">۳. جدول تأییدشده</h2><p className="text-xs text-gray-500 mt-1">فقط رتبه‌های متصل به حساب Flexa قابل دریافت جایزه‌اند.</p></div>
            <button onClick={finalize} disabled={busy || !standings.length} className="px-4 py-3 rounded-xl bg-green-500/15 text-green-300 border border-green-500/30 disabled:opacity-40">💰 نهایی‌سازی و پرداخت</button>
          </div>
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="text-gray-500 border-b border-white/10"><th className="p-2">رتبه</th><th>بازیکن</th><th>Tag</th><th>امتیاز</th><th>اتصال</th></tr></thead>
            <tbody>{standings.map((row) => (
              <tr key={row.rank} className="border-b border-white/5">
                <td className="p-3 font-black">{row.rank.toLocaleString("fa-IR")}</td><td>{row.playerName}</td><td className="font-mono">{row.playerTag || "—"}</td><td>{row.score ?? "—"}</td>
                <td>{row.verified ? <span className="text-green-300">✅ تأیید</span> : <span className="text-orange-300">⚠️ دستی</span>}</td>
              </tr>
            ))}</tbody>
          </table>
          {!standings.length && <p className="text-center text-gray-500 py-10">هنوز رتبه‌ای ثبت نشده است.</p>}
        </section>
      </main>
    </div>
  );
}
