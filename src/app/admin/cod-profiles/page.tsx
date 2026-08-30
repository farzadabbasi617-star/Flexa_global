"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";

interface CodProfileRow {
  id: string;
  displayName: string;
  username: string;
  flexaId: string;
  email: string;
  phoneNumber: string;
  avatarUrl: string | null;
  codMobileId: string | null;
  codMobileUsername: string | null;
  codMobileRegion: "global" | "garena";
  codMobileStatus: "unlinked" | "pending" | "verified" | "rejected";
  birthDate: string | null;
  nationalId: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

const statusFa: Record<string, string> = {
  all: "همه",
  pending: "در انتظار",
  verified: "تأییدشده",
  rejected: "ردشده",
  unlinked: "قطع اتصال",
};

const statusClass: Record<string, string> = {
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  verified: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  rejected: "border-red-500/30 bg-red-500/10 text-red-300",
  unlinked: "border-gray-500/30 bg-gray-500/10 text-gray-300",
};

function faDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(date);
}

export default function AdminCodProfilesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [profiles, setProfiles] = useState<CodProfileRow[]>([]);
  const [status, setStatus] = useState("pending");
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  useEffect(() => { if (!authLoading && (!user || !isAdmin)) router.push("/"); }, [authLoading, user, isAdmin, router]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      params.set("status", status);
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/admin/cod/profiles?${params}`, { cache: "no-store", credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "پروفایل‌ها دریافت نشد");
      setProfiles(Array.isArray(data.profiles) ? data.profiles : []);
    } catch (err) { setError(err instanceof Error ? err.message : "پروفایل‌ها دریافت نشد"); }
    finally { setLoading(false); }
  }, [status, query]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  async function review(row: CodProfileRow, nextStatus: "verified" | "rejected" | "pending" | "unlinked") {
    setBusyId(row.id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/cod/profiles", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ userId: row.id, status: nextStatus, note: notes[row.id] || null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "ذخیره انجام نشد");
      setMessage(`پروفایل ${row.displayName} ${statusFa[nextStatus]} شد.`);
      setNotes((current) => ({ ...current, [row.id]: "" }));
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "ذخیره انجام نشد"); }
    finally { setBusyId(null); }
  }

  if (authLoading || !isAdmin) return null;

  return <div className="min-h-screen bg-[#070707] text-white"><Navbar />
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-7" dir="rtl">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div><Link href="/admin" className="text-xs text-gray-500">← داشبورد</Link><h1 className="text-3xl font-black mt-3">🎯 تأیید UID کالاف کاربران</h1><p className="text-xs text-gray-500 mt-2">برای ثبت‌نام پولی COD Arena، پروفایل Call of Duty Mobile کاربر باید verified باشد.</p></div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") load(); }} placeholder="جستجو: UID، Username، Flexa ID..." className="rounded-xl bg-black/35 border border-white/10 px-4 py-3 text-xs outline-none focus:border-orange-400 min-w-72" />
          <button onClick={load} className="rounded-xl bg-orange-500 text-black px-5 py-3 text-xs font-black">جستجو</button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {["pending", "verified", "rejected", "unlinked", "all"].map((item) => <button key={item} onClick={() => setStatus(item)} className={`rounded-xl px-4 py-2 text-xs font-black ${status === item ? "bg-orange-500 text-black" : "bg-white/5 text-gray-300"}`}>{statusFa[item]}</button>)}
      </div>
      {error && <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
      {message && <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{message}</div>}

      {loading ? <div className="p-12 text-center text-gray-500">در حال بارگذاری...</div> : profiles.length === 0 ? <div className="mt-7 rounded-3xl border border-white/5 p-12 text-center text-gray-500">موردی برای نمایش نیست.</div> : <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-7">
        {profiles.map((profile) => {
          const busy = busyId === profile.id;
          const note = notes[profile.id] || "";
          const hasIdentity = Boolean(profile.birthDate && profile.nationalId);
          return <article key={profile.id} className="rounded-[2rem] border border-white/10 bg-white/[.025] p-5">
            <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3 min-w-0"><img src={profile.avatarUrl || "/icons/profile_icon.png"} alt="" className="w-12 h-12 rounded-2xl object-cover" /><div className="min-w-0"><h2 className="font-black truncate">{profile.displayName}</h2><div className="text-[10px] text-gray-500 truncate" dir="ltr">{profile.flexaId} • @{profile.username}</div></div></div><span className={`rounded-full border px-3 py-1 text-[10px] font-black ${statusClass[profile.codMobileStatus] || "bg-white/5"}`}>{statusFa[profile.codMobileStatus]}</span></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 text-xs">
              <div className="rounded-xl bg-black/25 p-3"><span className="text-gray-500">COD UID</span><div className="font-mono font-black mt-1" dir="ltr">{profile.codMobileId}</div></div>
              <div className="rounded-xl bg-black/25 p-3"><span className="text-gray-500">COD Username</span><div className="font-black mt-1" dir="ltr">{profile.codMobileUsername}</div></div>
              <div className="rounded-xl bg-black/25 p-3"><span className="text-gray-500">Region</span><div className="font-black mt-1">{profile.codMobileRegion?.toUpperCase()}</div></div>
              <div className={`rounded-xl p-3 ${hasIdentity ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}><span className="text-gray-500">هویت پولی</span><div className="font-black mt-1">{hasIdentity ? "کد ملی/تولد ثبت شده" : "ناقص"}</div></div>
              <div className="rounded-xl bg-black/25 p-3"><span className="text-gray-500">ایمیل</span><div className="truncate mt-1" dir="ltr">{profile.email}</div></div>
              <div className="rounded-xl bg-black/25 p-3"><span className="text-gray-500">ثبت‌نام</span><div className="mt-1">{faDate(profile.createdAt)}</div></div>
            </div>
            <textarea value={note} onChange={(e) => setNotes({ ...notes, [profile.id]: e.target.value })} rows={3} placeholder="یادداشت بررسی ادمین / دلیل رد یا تأیید" className="mt-4 w-full rounded-xl bg-black/35 border border-white/10 px-3 py-3 text-xs outline-none focus:border-orange-400" />
            <div className="mt-4 flex flex-wrap gap-2"><button disabled={busy} onClick={() => review(profile, "verified")} className="rounded-xl bg-emerald-500 text-black px-5 py-3 text-xs font-black disabled:opacity-40">تأیید COD</button><button disabled={busy} onClick={() => review(profile, "rejected")} className="rounded-xl bg-red-500 text-black px-5 py-3 text-xs font-black disabled:opacity-40">رد</button><button disabled={busy} onClick={() => review(profile, "pending")} className="rounded-xl border border-white/10 px-4 py-3 text-xs disabled:opacity-40">برگردان به pending</button><Link href={`/players/${profile.id}`} className="rounded-xl border border-orange-500/20 text-orange-300 px-4 py-3 text-xs">پروفایل عمومی</Link></div>
          </article>;
        })}
      </div>}
    </main>
  </div>;
}
