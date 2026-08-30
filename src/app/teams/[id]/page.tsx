"use client";

import { FormEvent, use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";

interface TeamDetail {
  team: {
    id: string;
    name: string;
    tag: string;
    logoUrl: string | null;
    ownerId: string;
    description: string | null;
    createdAt: string;
    ownerName: string | null;
    ownerUsername: string | null;
  };
  members: Array<{
    id: string;
    role: string;
    joinedAt: string;
    userId: string;
    displayName: string | null;
    username: string | null;
    flexaId: string | null;
    rankPoints: number | null;
    level: number | null;
    avatarUrl: string | null;
  }>;
}

export default function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", tag: "", logoUrl: "", description: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/teams/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "تیم پیدا نشد");
      setData(json);
      setForm({
        name: json.team.name || "",
        tag: json.team.tag || "",
        logoUrl: json.team.logoUrl || "",
        description: json.team.description || "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "تیم پیدا نشد");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const isOwner = Boolean(user && data?.team.ownerId === user.id);
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const canManage = isOwner || isAdmin;
  const myMembership = useMemo(() => data?.members.find((m) => m.userId === user?.id) || null, [data, user]);

  async function joinTeam() {
    setError("");
    try {
      const res = await fetch(`/api/teams/${id}/members`, { method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "عضویت انجام نشد");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "عضویت انجام نشد");
    }
  }

  async function leaveTeam() {
    if (!confirm("از تیم خارج شوی؟")) return;
    setError("");
    try {
      const res = await fetch(`/api/teams/${id}/members`, { method: "DELETE", headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" }, body: JSON.stringify({}) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "خروج انجام نشد");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خروج انجام نشد");
    }
  }

  async function removeMember(memberId: string) {
    if (!confirm("این عضو حذف شود؟")) return;
    const res = await fetch(`/api/teams/${id}/members`, { method: "DELETE", headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" }, body: JSON.stringify({ memberId }) });
    if (res.ok) load(); else alert("حذف عضو انجام نشد");
  }

  async function updateMemberRole(memberId: string, role: string) {
    const res = await fetch(`/api/teams/${id}/members`, { method: "PATCH", headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" }, body: JSON.stringify({ memberId, role }) });
    if (res.ok) load(); else alert("تغییر نقش انجام نشد");
  }

  async function saveTeam(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/teams/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" }, body: JSON.stringify(form) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "ذخیره نشد");
      setEditing(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ذخیره نشد");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTeam() {
    if (!confirm("تیم حذف شود؟ این عملیات قابل بازگشت نیست.")) return;
    const res = await fetch(`/api/teams/${id}`, { method: "DELETE", headers: { "X-Requested-With": "XMLHttpRequest" } });
    if (res.ok) router.push("/teams"); else alert("حذف تیم انجام نشد");
  }

  if (loading || authLoading) return <div className="min-h-screen bg-dark-900 text-white flex items-center justify-center"><div className="text-4xl animate-neon-pulse">🛡️</div></div>;
  if (!data) return <div className="min-h-screen bg-dark-900 text-white"><Navbar /><div className="text-center py-32">{error || "تیم پیدا نشد"}</div></div>;

  return (
    <div className="min-h-screen bg-[#050508] text-white relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_-10%,rgba(92,0,160,.55),transparent_70%)]" />
      <Navbar />
      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/teams" className="text-gray-500 hover:text-white text-sm">← بازگشت به تیم‌ها</Link>
        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-3 my-5 text-sm">{error}</div>}

        <section className="gaming-card p-6 sm:p-8 mt-5 mb-8 overflow-hidden relative">
          {data.team.logoUrl && <img src={data.team.logoUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-15" loading="lazy" decoding="async" />}
          <div className="relative flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-purple-600 to-cyan-500 grid place-items-center text-3xl font-black shadow-[0_0_40px_rgba(168,85,247,.25)]">
              {data.team.logoUrl ? <img src={data.team.logoUrl} alt={data.team.name} className="w-full h-full object-cover rounded-3xl" loading="lazy" decoding="async" /> : data.team.tag}
            </div>
            <div className="flex-1 text-center sm:text-right">
              <h1 className="text-3xl sm:text-4xl font-black">{data.team.name}</h1>
              <p className="text-neon-purple font-black mt-1">[{data.team.tag}]</p>
              <p className="text-gray-400 text-sm leading-7 mt-4">{data.team.description || "بدون توضیحات"}</p>
              <div className="flex flex-wrap gap-3 mt-5 justify-center sm:justify-start">
                <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-300">اعضا: {data.members.length.toLocaleString("fa-IR")}</span>
                <span className="px-3 py-1 rounded-full bg-white/5 text-xs text-gray-300">مالک: {data.team.ownerName || data.team.ownerUsername || "—"}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 min-w-[160px]">
              {!user ? <Link href="/login" className="gaming-btn text-sm">ورود برای عضویت</Link> : myMembership ? <button onClick={leaveTeam} className="gaming-btn gaming-btn-danger text-sm">خروج از تیم</button> : <button onClick={joinTeam} className="gaming-btn text-sm">پیوستن به تیم</button>}
              {canManage && <button onClick={() => setEditing((v) => !v)} className="px-4 py-3 rounded-xl bg-dark-700 text-sm font-bold text-neon-blue">ویرایش تیم</button>}
              {canManage && <button onClick={deleteTeam} className="px-4 py-3 rounded-xl bg-red-500/10 text-sm font-bold text-red-300">حذف تیم</button>}
            </div>
          </div>
        </section>

        {editing && (
          <form onSubmit={saveTeam} className="gaming-card p-5 mb-8 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-slide-up">
            <input className="gaming-input" placeholder="نام تیم" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="gaming-input" placeholder="تگ" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value.toUpperCase() })} />
            <input className="gaming-input sm:col-span-2" placeholder="لینک لوگو" value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} />
            <textarea className="gaming-input sm:col-span-2 min-h-24" placeholder="توضیحات" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <button disabled={saving} className="gaming-btn sm:col-span-2 disabled:opacity-50">{saving ? "ذخیره..." : "ذخیره تغییرات"}</button>
          </form>
        )}

        <section className="gaming-card p-6">
          <h2 className="font-black text-neon-blue mb-5">👥 اعضای تیم</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {data.members.map((member) => (
              <div key={member.id} className="bg-dark-700 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-blue-500 grid place-items-center font-black">
                  {(member.displayName || member.username || "F").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-bold">{member.displayName || member.username || "کاربر"}</span>
                  <div className="text-xs text-gray-500 mt-1">{member.flexaId || "—"} • Level {member.level || 1}</div>
                </div>
                {canManage && member.userId !== data.team.ownerId ? (
                  <div className="flex items-center gap-2">
                    <select className="bg-dark-800 border border-gaming-border rounded-lg px-2 py-1 text-xs" value={member.role} onChange={(e) => updateMemberRole(member.id, e.target.value)}>
                      <option value="member">عضو</option>
                      <option value="captain">کاپیتان</option>
                    </select>
                    <button onClick={() => removeMember(member.id)} className="text-red-400 text-xs">حذف</button>
                  </div>
                ) : <span className="text-xs px-2 py-1 rounded-full bg-purple-500/10 text-purple-300">{member.role}</span>}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
