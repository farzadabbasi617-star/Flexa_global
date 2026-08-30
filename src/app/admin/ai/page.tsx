"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";

interface AIStatus {
  configured: { openrouter: boolean; groq: boolean };
  /** `null` when the live probe was skipped to avoid burning AI credits. */
  connected: boolean | null;
  probeSkipped?: boolean;
  provider: string | null;
  cachedProvider: string | null;
  model: string | null;
  sample: string | null;
}

interface ModerationResult {
  isAllowed: boolean;
  toxicityScore: number;
  categories: string[];
  suggestion: string | null;
}

interface AssistantResult {
  response: string;
  suggestions: string[];
  provider: string;
  cachedProvider?: string;
  model?: string;
  cached?: boolean;
}

interface RiskReport {
  summary: string;
  riskScore: number;
  items: Array<{
    type: string;
    severity: string;
    title: string;
    detail: string;
    action: string;
  }>;
  nextActions: string[];
  provider: string;
  cachedProvider?: string | null;
  model?: string | null;
  snapshot?: Record<string, unknown>;
}

interface DailyReport {
  headline: string;
  summary: string;
  highlights: string[];
  concerns: string[];
  recommendedActions: string[];
  provider: string;
  cachedProvider?: string | null;
  model?: string | null;
  snapshot?: Record<string, number>;
}

function ProviderBadge({ status }: { status: AIStatus | null }) {
  if (!status) return <span className="text-xs text-gray-500">در حال بررسی...</span>;
  if (status.connected === null) {
    // Throttled, not broken — saying "disconnected" here would be a lie.
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-black text-amber-300">
        ● تست زنده موقتاً محدود شد؛ کمی بعد دوباره بررسی کنید
      </span>
    );
  }
  if (status.connected) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-black text-green-300">
        ● متصل به {status.provider === "cache" ? status.cachedProvider : status.provider} {status.model ? `• ${status.model}` : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-black text-red-300">
      ● اتصال واقعی برقرار نیست؛ fallback لوکال فعال است
    </span>
  );
}

export default function AIAdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [moderationResult, setModerationResult] = useState<ModerationResult | null>(null);
  const [testQuery, setTestQuery] = useState("");
  const [assistantResult, setAssistantResult] = useState<AssistantResult | null>(null);
  const [riskReport, setRiskReport] = useState<RiskReport | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [dailyReport, setDailyReport] = useState<DailyReport | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [error, setError] = useState("");

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/ai/status", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "وضعیت AI بارگذاری نشد");
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "وضعیت AI بارگذاری نشد");
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.push("/");
  }, [loading, user, isAdmin, router]);

  useEffect(() => {
    if (isAdmin) loadStatus();
  }, [isAdmin, loadStatus]);

  async function testModeration() {
    if (!testMessage.trim()) return;
    setError("");
    try {
      const res = await fetch("/api/ai/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ message: testMessage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تست مدریشن ناموفق بود");
      setModerationResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تست مدریشن ناموفق بود");
    }
  }

  async function testAssistant() {
    if (!testQuery.trim()) return;
    setError("");
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ message: testQuery }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تست دستیار ناموفق بود");
      setAssistantResult(data);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تست دستیار ناموفق بود");
    }
  }

  async function loadRiskReport() {
    setRiskLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/ai/risk-report", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "گزارش ریسک ساخته نشد");
      setRiskReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "گزارش ریسک ساخته نشد");
    } finally {
      setRiskLoading(false);
    }
  }

  async function loadDailyReport() {
    setDailyLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/ai/daily-report", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "گزارش روزانه ساخته نشد");
      setDailyReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "گزارش روزانه ساخته نشد");
    } finally {
      setDailyLoading(false);
    }
  }

  if (loading || !user || !isAdmin) return null;

  const systems = [
    { title: "OpenRouter", icon: "🌐", active: Boolean(status?.configured.openrouter), detail: "کلید OPENROUTER_API_KEY" },
    { title: "Groq", icon: "⚡", active: Boolean(status?.configured.groq), detail: "کلید GROQ_API_KEY" },
    {
      title: "اتصال واقعی",
      icon: "🔌",
      active: status?.connected === true,
      detail: status?.connected === null ? "تست زنده محدود شد" : status?.model || "در انتظار تست",
    },
    {
      // Only claim the local fallback is in use when the probe actually ran
      // and failed; a skipped probe says nothing about provider health.
      title: "Fallback لوکال",
      icon: "🧠",
      active: status?.connected === false,
      detail: "فقط وقتی providerها قطع باشند",
    },
  ];

  return (
    <div className="min-h-screen bg-dark-900 text-white">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <button onClick={() => router.push("/admin")} className="text-gray-500 hover:text-white mb-4">← بازگشت</button>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <span className="text-5xl animate-float-slow">🤖</span>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black neon-text-purple">مرکز کنترل هوش مصنوعی</h1>
              <p className="text-gray-400 text-sm mt-1">وضعیت اتصال OpenRouter/Groq، تست دستیار، مدریشن و تشخیص fallback</p>
            </div>
          </div>
          <button onClick={loadStatus} disabled={statusLoading} className="gaming-btn text-sm disabled:opacity-50">
            {statusLoading ? "در حال تست..." : "تست اتصال AI"}
          </button>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-3 mb-5 text-sm">{error}</div>}

        <section className="gaming-card p-5 mb-8 border-neon-purple/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="font-black text-lg">وضعیت اتصال</h2>
              <p className="text-xs text-gray-500 mt-1">اگر connected=false باشد، دستیار به provider وصل نشده و پاسخ لوکال می‌دهد.</p>
            </div>
            <ProviderBadge status={status} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {systems.map((system) => (
              <div key={system.title} className={`rounded-2xl border p-4 ${system.active ? "bg-green-500/10 border-green-500/20" : "bg-red-500/10 border-red-500/20"}`}>
                <div className="text-3xl mb-2">{system.icon}</div>
                <div className="font-black text-sm">{system.title}</div>
                <div className={`text-xs mt-2 ${system.active ? "text-green-300" : "text-red-300"}`}>{system.active ? "فعال" : "غیرفعال"}</div>
                <div className="text-[10px] text-gray-500 mt-2 truncate">{system.detail}</div>
              </div>
            ))}
          </div>
          {status?.sample && <div className="mt-4 bg-dark-700 rounded-2xl p-4 text-sm text-gray-300 leading-7">نمونه پاسخ: {status.sample}</div>}
        </section>

        <section className="gaming-card p-6 mb-8 border-cyan-500/20 bg-cyan-500/5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="font-black text-lg text-cyan-200">📋 گزارش روزانه AI</h2>
              <p className="text-xs text-gray-500 mt-1 leading-6">
                خلاصه اجرایی ۲۴ ساعت اخیر شامل کاربران جدید، ثبت‌نام‌ها، تراکنش‌ها، تیکت‌ها، اعتراض‌ها و اقدامات پیشنهادی.
              </p>
            </div>
            <button onClick={loadDailyReport} disabled={dailyLoading} className="gaming-btn text-sm disabled:opacity-50">
              {dailyLoading ? "در حال ساخت..." : "ساخت گزارش روزانه"}
            </button>
          </div>

          {dailyReport ? (
            <div className="space-y-4">
              <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                  <div>
                    <div className="text-xl font-black text-cyan-100">{dailyReport.headline}</div>
                    <div className="text-[10px] text-gray-500 mt-2" dir="ltr">
                      {dailyReport.provider}{dailyReport.cachedProvider ? ` / ${dailyReport.cachedProvider}` : ""}{dailyReport.model ? ` • ${dailyReport.model}` : ""}
                    </div>
                  </div>
                  {dailyReport.snapshot && (
                    <div className="grid grid-cols-3 gap-2 text-center text-[10px] min-w-[220px]">
                      <div className="rounded-2xl bg-white/5 p-2"><b className="block text-cyan-200 text-sm">{dailyReport.snapshot.newUsers || 0}</b>کاربر جدید</div>
                      <div className="rounded-2xl bg-white/5 p-2"><b className="block text-cyan-200 text-sm">{dailyReport.snapshot.newRegistrations || 0}</b>ثبت‌نام</div>
                      <div className="rounded-2xl bg-white/5 p-2"><b className="block text-cyan-200 text-sm">{dailyReport.snapshot.openTickets || 0}</b>تیکت باز</div>
                    </div>
                  )}
                </div>
                <p className="text-sm leading-7 text-gray-200">{dailyReport.summary}</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="rounded-3xl border border-green-500/20 bg-green-500/10 p-4">
                  <div className="text-xs font-black text-green-200 mb-3">نکات مثبت</div>
                  <ul className="space-y-2 text-xs leading-6 text-gray-300 list-disc pr-5">
                    {dailyReport.highlights.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
                <div className="rounded-3xl border border-yellow-500/20 bg-yellow-500/10 p-4">
                  <div className="text-xs font-black text-yellow-200 mb-3">موارد نیازمند توجه</div>
                  <ul className="space-y-2 text-xs leading-6 text-gray-300 list-disc pr-5">
                    {dailyReport.concerns.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
                <div className="rounded-3xl border border-purple-500/20 bg-purple-500/10 p-4">
                  <div className="text-xs font-black text-purple-200 mb-3">اقدام‌های پیشنهادی</div>
                  <ul className="space-y-2 text-xs leading-6 text-gray-300 list-disc pr-5">
                    {dailyReport.recommendedActions.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-white/10 bg-black/20 p-5 text-sm text-gray-500 leading-7">
              هنوز گزارش روزانه ساخته نشده. روی «ساخت گزارش روزانه» بزن تا AI وضعیت ۲۴ ساعت اخیر را خلاصه کند.
            </div>
          )}
        </section>

        <section className="gaming-card p-6 mb-8 border-yellow-500/20 bg-yellow-500/5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="font-black text-lg text-yellow-200">🕵️ گزارش ریسک و ضدتقلب AI</h2>
              <p className="text-xs text-gray-500 mt-1 leading-6">
                مسابقات، اعتراض‌ها، تراکنش‌های pending و الگوهای آماری بازیکنان را بررسی می‌کند و موارد نیازمند بررسی را پیشنهاد می‌دهد.
              </p>
            </div>
            <button onClick={loadRiskReport} disabled={riskLoading} className="gaming-btn text-sm disabled:opacity-50">
              {riskLoading ? "در حال تحلیل..." : "ساخت گزارش ریسک"}
            </button>
          </div>

          {riskReport ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-4">
                <div className="rounded-3xl border border-yellow-500/20 bg-black/25 p-4 text-center">
                  <div className="text-[10px] text-gray-500 mb-2">امتیاز ریسک</div>
                  <div className={`text-4xl font-black ${riskReport.riskScore >= 70 ? "text-red-300" : riskReport.riskScore >= 40 ? "text-yellow-300" : "text-green-300"}`}>
                    {riskReport.riskScore}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-2" dir="ltr">{riskReport.provider}{riskReport.cachedProvider ? ` / ${riskReport.cachedProvider}` : ""}</div>
                </div>
                <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                  <div className="text-xs font-black text-gray-400 mb-2">خلاصه</div>
                  <p className="text-sm leading-7 text-gray-200">{riskReport.summary}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {riskReport.items.map((item, index) => (
                  <div key={`${item.title}-${index}`} className="rounded-3xl border border-white/10 bg-dark-700/70 p-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="font-black text-sm">{item.title}</span>
                      <span className={`text-[10px] px-2 py-1 rounded-full ${item.severity === "critical" || item.severity === "high" ? "bg-red-500/15 text-red-300" : item.severity === "medium" ? "bg-yellow-500/15 text-yellow-300" : "bg-green-500/15 text-green-300"}`}>
                        {item.severity}
                      </span>
                    </div>
                    <p className="text-xs leading-6 text-gray-400 mb-3">{item.detail}</p>
                    <div className="text-[11px] leading-6 text-cyan-200 bg-cyan-500/10 border border-cyan-500/15 rounded-2xl p-3">
                      اقدام پیشنهادی: {item.action}
                    </div>
                  </div>
                ))}
              </div>

              {riskReport.nextActions?.length > 0 && (
                <div className="rounded-3xl border border-purple-500/20 bg-purple-500/10 p-4">
                  <div className="text-xs font-black text-purple-200 mb-3">اقدام‌های بعدی</div>
                  <ul className="space-y-2 text-xs leading-6 text-gray-300 list-disc pr-5">
                    {riskReport.nextActions.map((action) => <li key={action}>{action}</li>)}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-3xl border border-white/10 bg-black/20 p-5 text-sm text-gray-500 leading-7">
              هنوز گزارشی ساخته نشده. روی «ساخت گزارش ریسک» بزن تا AI داده‌های ۷ روز اخیر را بررسی کند.
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="gaming-card p-6">
            <h3 className="font-black text-neon-blue mb-4">🛡️ تست مدریشن پیام</h3>
            <textarea className="gaming-input min-h-[90px] resize-y" placeholder="پیام تست..." value={testMessage} onChange={(e) => setTestMessage(e.target.value)} />
            <button onClick={testModeration} className="gaming-btn text-sm mt-4">تحلیل پیام</button>
            {moderationResult && (
              <div className={`mt-4 p-4 rounded-xl border ${moderationResult.isAllowed ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"}`}>
                <div className="font-black">{moderationResult.isAllowed ? "✅ مجاز" : "🚫 مسدود"}</div>
                <p className="text-sm text-gray-400 mt-2">سطح سمیت: {moderationResult.toxicityScore}%</p>
                {moderationResult.categories.length > 0 && <p className="text-sm text-gray-400 mt-1">دسته‌ها: {moderationResult.categories.join(", ")}</p>}
              </div>
            )}
          </section>

          <section className="gaming-card p-6">
            <h3 className="font-black text-neon-purple mb-4">💬 تست دستیار هوشمند</h3>
            <input className="gaming-input" placeholder="سوال بپرس..." value={testQuery} onChange={(e) => setTestQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && testAssistant()} />
            <button onClick={testAssistant} className="gaming-btn text-sm mt-4">ارسال سوال</button>
            {assistantResult && (
              <div className="mt-4 bg-dark-700 rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-3">
                  Provider: <span className="text-neon-blue">{assistantResult.provider}</span>
                  {assistantResult.cachedProvider ? ` / ${assistantResult.cachedProvider}` : ""}
                  {assistantResult.model ? ` • ${assistantResult.model}` : ""}
                  {assistantResult.cached ? " • cached" : ""}
                </div>
                <p className="text-gray-200 text-sm whitespace-pre-wrap leading-7">{assistantResult.response}</p>
                {assistantResult.provider === "local" && (
                  <div className="mt-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-xs text-yellow-200 leading-6">
                    این پاسخ لوکال است. کلیدهای OpenRouter/Groq یا مدل‌های انتخابی در Render را بررسی کن.
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
