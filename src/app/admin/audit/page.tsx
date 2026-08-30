"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: string;
  adminName: string | null;
  adminUsername: string | null;
}

export default function AdminAuditPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [query, setQuery] = useState("");
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.push("/");
  }, [loading, user, isAdmin, router]);

  async function load() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/audit", { cache: "no-store" });
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(q));
  }, [query, rows]);

  if (loading || !user || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <button onClick={() => router.push("/admin")} className="text-gray-500 hover:text-white mb-4">← بازگشت</button>
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-black neon-text-purple">🧾 لاگ فعالیت مدیران</h1>
            <p className="text-gray-500 text-sm mt-2">هر تغییر مهم مدیریتی اینجا ثبت می‌شود.</p>
          </div>
          <button onClick={load} className="gaming-btn text-sm">بروزرسانی</button>
        </div>
        <input className="gaming-input mb-5 max-w-md" placeholder="جستجو در لاگ‌ها..." value={query} onChange={(e) => setQuery(e.target.value)} />
        {busy ? <div className="text-center py-20 text-4xl animate-neon-pulse">🧾</div> : (
          <div className="space-y-3">
            {filtered.map((row) => (
              <div key={row.id} className="gaming-card p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="font-black text-white">{row.action} <span className="text-neon-blue">{row.entityType}</span></div>
                    <div className="text-xs text-gray-500 mt-1">{row.adminName || row.adminUsername || "سیستم"} • {new Date(row.createdAt).toLocaleString("fa-IR")} • IP: {row.ipAddress || "—"}</div>
                  </div>
                  <div className="text-xs text-gray-500 font-mono" dir="ltr">{row.entityId || "—"}</div>
                </div>
                {row.metadata ? <pre className="mt-3 text-[11px] bg-dark-800 rounded-xl p-3 overflow-auto text-gray-400" dir="ltr">{JSON.stringify(row.metadata, null, 2)}</pre> : null}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
