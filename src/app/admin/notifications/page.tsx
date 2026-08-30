"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";

interface UserOption { id: string; displayName: string; username: string | null; phoneNumber: string; }
interface NotificationRow { id: string; displayName: string | null; username: string | null; type: string; title: string; message: string; link: string | null; isRead: boolean; createdAt: string; }

export default function AdminNotificationsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserOption[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ target: "all", userId: "", type: "system", title: "", message: "", link: "" });
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/notifications", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "بارگذاری نشد");
      setUsers(data.users || []);
      setNotifications(data.notifications || []);
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
    if (!q) return notifications;
    return notifications.filter((n) => JSON.stringify(n).toLowerCase().includes(q));
  }, [query, notifications]);

  async function send(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ ...form, userIds: form.userId ? [form.userId] : [] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ارسال نشد");
      setForm({ target: "all", userId: "", type: "system", title: "", message: "", link: "" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ارسال نشد");
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("اعلان حذف شود؟")) return;
    const res = await fetch("/api/admin/notifications", { method: "DELETE", headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" }, body: JSON.stringify({ ids: [id] }) });
    if (res.ok) load(); else alert("حذف نشد");
  }

  if (loading || !user || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-dark-900 text-white"><Navbar /><main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <button onClick={() => router.push("/admin")} className="text-gray-500 hover:text-white mb-4">← بازگشت</button>
      <h1 className="text-3xl font-black neon-text-purple mb-2">🔔 ارسال اعلان سیستمی</h1>
      <p className="text-gray-500 text-sm mb-6">ارسال پیام به یک کاربر یا همه کاربران، همراه با لینک اختیاری</p>
      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-3 mb-5 text-sm">{error}</div>}
      <form onSubmit={send} className="gaming-card p-5 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <select className="gaming-select" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}><option value="all">همه کاربران</option><option value="single">یک کاربر</option></select>
        {form.target === "single" && <select className="gaming-select" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}><option value="">انتخاب کاربر</option>{users.map((u) => <option key={u.id} value={u.id}>{u.displayName} @{u.username || "-"}</option>)}</select>}
        <input className="gaming-input" placeholder="نوع اعلان: system, tournament, wallet..." value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
        <input className="gaming-input" placeholder="عنوان" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <textarea className="gaming-input sm:col-span-2 min-h-24" placeholder="متن پیام" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
        <input className="gaming-input sm:col-span-2" placeholder="لینک اختیاری مثل /tournaments" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} />
        <button disabled={sending} className="gaming-btn sm:col-span-2 disabled:opacity-50">{sending ? "در حال ارسال..." : "ارسال اعلان"}</button>
      </form>
      <input className="gaming-input max-w-md mb-5" placeholder="جستجو در اعلان‌های اخیر..." value={query} onChange={(e) => setQuery(e.target.value)} />
      {busy ? <div className="text-center py-20 text-4xl animate-neon-pulse">🔔</div> : <div className="space-y-3">{filtered.map((n) => <div key={n.id} className="gaming-card p-4"><div className="flex justify-between gap-3"><div><div className="font-black">{n.title} <span className="text-xs text-neon-blue">{n.type}</span></div><div className="text-xs text-gray-500 mt-1">{n.displayName || n.username || "—"} • {new Date(n.createdAt).toLocaleString("fa-IR")} • {n.isRead ? "خوانده شده" : "خوانده نشده"}</div><p className="text-sm text-gray-300 mt-3 leading-7">{n.message}</p>{n.link && <div className="text-xs text-purple-300 mt-2">{n.link}</div>}</div><button onClick={() => remove(n.id)} className="text-red-400 text-xs">حذف</button></div></div>)}</div>}
    </main></div>
  );
}
