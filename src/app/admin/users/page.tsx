"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

const PERMISSIONS = [
  { key: "overview", label: "داشبورد" },
  { key: "users", label: "کاربران" },
  { key: "tournaments", label: "تورنومنت‌ها" },
  { key: "matches", label: "مسابقات" },
  { key: "judgments", label: "داوری‌ها" },
  { key: "disputes", label: "اعتراضات" },
  { key: "messages", label: "پیام‌ها" },
  { key: "media", label: "رسانه/ظاهر" },
  { key: "wallets", label: "کیف پول" },
  { key: "finance", label: "گزارش مالی" },
  { key: "notifications", label: "اعلان‌ها" },
  { key: "support", label: "پشتیبانی" },
  { key: "audit", label: "لاگ‌ها" },
  { key: "ai", label: "هوش مصنوعی" },
  { key: "settings", label: "تنظیمات" },
  { key: "uploads", label: "آپلود فایل" },
  { key: "maintenance", label: "نگهداری سیستم" },
];

interface UserRow {
  id: string;
  phoneNumber: string;
  email: string | null;
  username: string | null;
  displayName: string;
  role: string;
  isVerified: boolean;
  clashRoyaleId: string | null;
  codMobileId: string | null;
  fortniteId: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export default function AdminUsersPage() {
  const { lang } = useLanguage();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({
    phoneNumber: "",
    email: "",
    username: "",
    displayName: "",
    password: "",
    role: "player",
  });
  const [permissionTarget, setPermissionTarget] = useState<UserRow | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [savingPermissions, setSavingPermissions] = useState(false);

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isSuperAdmin = user?.role === "super_admin";

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.push("/");
  }, [loading, user, isAdmin, router]);

  useEffect(() => {
    if (isAdmin) fetchUsers();
  }, [isAdmin]);

  async function fetchUsers() {
    setLoadingUsers(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      setError("لیست کاربران بارگذاری نشد.");
      setUsers([]);
    }
    setLoadingUsers(false);
  }

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(newUser),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ساخت کاربر انجام نشد");
      setNewUser({ phoneNumber: "", email: "", username: "", displayName: "", password: "", role: "player" });
      setShowCreate(false);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ساخت کاربر انجام نشد");
    } finally {
      setCreating(false);
    }
  }

  async function deleteUser(id: string) {
    if (!confirm("حساب کاربر به‌صورت امن حذف/ناشناس می‌شود. ادامه می‌دهی؟")) return;
    setError("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "حذف انجام نشد");
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "حذف انجام نشد");
    }
  }

  async function openPermissions(target: UserRow) {
    setPermissionTarget(target);
    setError("");
    try {
      const res = await fetch(`/api/admin/permissions?userId=${target.id}`, { cache: "no-store" });
      const data = await res.json();
      setSelectedPermissions(Array.isArray(data.permissions) ? data.permissions : []);
    } catch {
      setSelectedPermissions([]);
    }
  }

  async function savePermissions() {
    if (!permissionTarget) return;
    setSavingPermissions(true);
    setError("");
    try {
      const res = await fetch("/api/admin/permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ userId: permissionTarget.id, permissions: selectedPermissions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ذخیره دسترسی انجام نشد");
      setPermissionTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ذخیره دسترسی انجام نشد");
    } finally {
      setSavingPermissions(false);
    }
  }

  async function patchUser(id: string, payload: Record<string, unknown>) {
    setError("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ id, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تغییرات ذخیره نشد.");
    }
  }

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      (u.username || "").toLowerCase().includes(q) ||
      (u.displayName || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q) ||
      (u.phoneNumber || "").toLowerCase().includes(q)
    );
  });

  if (loading || !user || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8" style={{ paddingBottom: "calc(24px + var(--safe-bottom))" }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/admin")} className="text-gray-500 hover:text-white">←</button>
            <h1 className="text-2xl font-bold">
              👥 <span className="neon-text-purple">{lang === "fa" ? "مدیریت کاربران" : "User Manager"}</span>
            </h1>
            <span className="text-sm text-gray-500">({users.length})</span>
          </div>
          <button onClick={() => setShowCreate((v) => !v)} className="gaming-btn text-sm">+ کاربر جدید</button>
        </div>

        {error && <div className="bg-red-900/30 border border-red-500/40 text-red-300 rounded-xl p-3 mb-5 text-sm">{error}</div>}

        {showCreate && (
          <form onSubmit={createUser} className="gaming-card p-4 sm:p-5 mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-slide-up">
            <input className="gaming-input text-sm" placeholder="شماره موبایل" value={newUser.phoneNumber} onChange={(e) => setNewUser({ ...newUser, phoneNumber: e.target.value })} />
            <input className="gaming-input text-sm" placeholder="ایمیل اختیاری" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
            <input className="gaming-input text-sm" placeholder="نام کاربری" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} />
            <input className="gaming-input text-sm" placeholder="نام نمایشی" value={newUser.displayName} onChange={(e) => setNewUser({ ...newUser, displayName: e.target.value })} />
            <input className="gaming-input text-sm" placeholder="رمز اولیه" type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
            <select className="gaming-select text-sm" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
              <option value="player">بازیکن</option>
              <option value="judge">داور</option>
              <option value="moderator">ناظر</option>
              {isSuperAdmin && <option value="admin">ادمین</option>}
            </select>
            <button disabled={creating} className="gaming-btn text-sm disabled:opacity-50 sm:col-span-2 lg:col-span-3">{creating ? "در حال ساخت..." : "ساخت کاربر"}</button>
          </form>
        )}

        {permissionTarget && (
          <div className="gaming-card p-4 sm:p-5 mb-6 animate-slide-up border-neon-purple/30">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="font-black text-lg text-neon-purple">سطح دسترسی {permissionTarget.displayName}</h2>
                <p className="text-xs text-gray-500 mt-1">فقط مدیر اصلی می‌تواند دسترسی ادمین‌ها/داورها/ناظرها را تعیین کند.</p>
              </div>
              <button onClick={() => setPermissionTarget(null)} className="text-gray-500 hover:text-white">✕</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {PERMISSIONS.map((permission) => {
                const checked = selectedPermissions.includes(permission.key);
                return (
                  <label key={permission.key} className={`p-3 rounded-xl border cursor-pointer text-sm ${checked ? "bg-purple-500/15 border-purple-500/40 text-purple-200" : "bg-dark-700 border-gaming-border text-gray-400"}`}>
                    <input
                      type="checkbox"
                      className="me-2 accent-purple-600"
                      checked={checked}
                      onChange={(e) => {
                        setSelectedPermissions((prev) => e.target.checked ? [...prev, permission.key] : prev.filter((p) => p !== permission.key));
                      }}
                    />
                    {permission.label}
                  </label>
                );
              })}
            </div>
            <button onClick={savePermissions} disabled={savingPermissions} className="gaming-btn mt-4 text-sm disabled:opacity-50">{savingPermissions ? "ذخیره..." : "ذخیره سطح دسترسی"}</button>
          </div>
        )}

        <div className="mb-6">
          <input
            type="text"
            className="gaming-input"
            placeholder="🔍 جستجوی نام، موبایل، ایمیل..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loadingUsers ? (
          <div className="text-center py-16">
            <div className="text-4xl animate-neon-pulse mb-4">👥</div>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((u) => {
              const canEditAdminRole = isSuperAdmin || (u.role !== "admin" && u.role !== "super_admin");
              return (
                <div key={u.id} className="gaming-card p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-neon-purple to-neon-blue flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {u.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{u.displayName}</span>
                          {u.isVerified && <span className="text-neon-green text-xs">✓</span>}
                        </div>
                        <div className="text-xs text-gray-500 truncate" dir="ltr">
                          @{u.username || "-"} · {u.phoneNumber} · {u.email || "no email"}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 flex-shrink-0">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${u.clashRoyaleId ? "text-neon-blue" : "text-gray-600"}`}>⚔️</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${u.codMobileId ? "text-neon-orange" : "text-gray-600"}`}>🎯</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${u.fortniteId ? "text-neon-purple" : "text-gray-600"}`}>🏗️</span>
                    </div>

                    <select
                      className="bg-dark-700 border border-gaming-border rounded-lg px-3 py-1.5 text-xs text-white flex-shrink-0 disabled:opacity-50"
                      value={u.role}
                      disabled={!canEditAdminRole}
                      onChange={(e) => patchUser(u.id, { role: e.target.value })}
                    >
                      <option value="player">👤 بازیکن</option>
                      <option value="judge">⚖️ داور</option>
                      <option value="moderator">🛡️ ناظر</option>
                      {isSuperAdmin && <option value="admin">👑 ادمین</option>}
                      {isSuperAdmin && <option value="super_admin">💎 مدیر اصلی</option>}
                    </select>

                    <button
                      onClick={() => patchUser(u.id, { isVerified: !u.isVerified })}
                      className={`text-xs px-3 py-1.5 rounded-lg flex-shrink-0 ${
                        u.isVerified ? "bg-neon-green/20 text-neon-green" : "bg-dark-600 text-gray-500"
                      }`}
                    >
                      {u.isVerified ? "✓ تأیید شده" : "تأیید نشده"}
                    </button>
                    {isSuperAdmin && (u.role === "admin" || u.role === "judge" || u.role === "moderator") && (
                      <button
                        onClick={() => openPermissions(u)}
                        className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20"
                      >
                        دسترسی‌ها
                      </button>
                    )}
                    <button
                      onClick={() => deleteUser(u.id)}
                      className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                    >
                      حذف امن
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
