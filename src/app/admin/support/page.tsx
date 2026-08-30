"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";

interface Ticket {
  id: string;
  subject: string;
  status: string;
  createdAt: string;
  displayName: string | null;
  username: string | null;
  phoneNumber: string | null;
}

interface TicketMessage {
  id: string;
  senderName: string | null;
  message: string;
  createdAt: string;
}

interface SupportAIInsight {
  category: string;
  categoryLabel: string;
  priority: string;
  summary: string;
  suggestedReply: string;
  requiredInfo: string[];
  provider: string;
  cachedProvider?: string | null;
}

const STATUS_OPTIONS = [
  { value: "open", label: "باز" },
  { value: "pending", label: "در انتظار" },
  { value: "closed", label: "بسته" },
  { value: "resolved", label: "حل شده" },
];

const PRIORITY_LABELS: Record<string, string> = {
  low: "کم",
  normal: "عادی",
  high: "بالا",
  urgent: "فوری",
};

export default function AdminSupportPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState("open");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiInsight, setAiInsight] = useState<SupportAIInsight | null>(null);
  const [aiError, setAiError] = useState("");
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/support", { cache: "no-store" });
      const data = await res.json();
      setTickets(data.tickets || []);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.push("/");
  }, [loading, user, isAdmin, router]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return q ? tickets.filter((ticket) => JSON.stringify(ticket).toLowerCase().includes(q)) : tickets;
  }, [query, tickets]);

  async function open(ticket: Ticket) {
    setSelected(ticket);
    setStatus(ticket.status || "open");
    setAiInsight(null);
    setAiError("");
    const res = await fetch(`/api/admin/support?ticketId=${ticket.id}`, { cache: "no-store" });
    const data = await res.json();
    setMessages(data.messages || []);
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!selected || !reply.trim()) return;
    const res = await fetch("/api/admin/support", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ ticketId: selected.id, message: reply, status }),
    });
    if (res.ok) {
      setReply("");
      open(selected);
      load();
    } else {
      alert("ارسال نشد");
    }
  }

  async function saveStatus(ticket: Ticket, next: string) {
    await fetch("/api/admin/support", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ id: ticket.id, status: next }),
    });
    load();
  }

  async function analyzeTicket() {
    if (!selected) return;
    setAiBusy(true);
    setAiError("");
    try {
      const res = await fetch("/api/admin/support/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ ticketId: selected.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تحلیل AI انجام نشد");
      setAiInsight(data);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "تحلیل AI انجام نشد");
    } finally {
      setAiBusy(false);
    }
  }

  if (loading || !user || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-dark-900 text-white">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8" style={{ paddingBottom: "calc(24px + var(--safe-bottom))" }}>
        <button onClick={() => router.push("/admin")} className="text-gray-500 hover:text-white mb-4">
          ← بازگشت
        </button>
        <h1 className="text-3xl font-black neon-text-purple mb-2">🎧 مرکز پشتیبانی</h1>
        <p className="text-gray-500 text-sm mb-6">مشاهده تیکت‌ها، پاسخ مدیر، تغییر وضعیت و تحلیل هوشمند AI</p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
          <section className="lg:col-span-1">
            <input className="gaming-input mb-4" placeholder="جستجو..." value={query} onChange={(e) => setQuery(e.target.value)} />
            {busy ? (
              <div className="text-center py-16">🎧</div>
            ) : (
              <div className="space-y-3">
                {filtered.map((ticket) => (
                  <button
                    key={ticket.id}
                    onClick={() => open(ticket)}
                    className={`gaming-card p-4 w-full text-right ${selected?.id === ticket.id ? "border-neon-purple" : ""}`}
                  >
                    <div className="font-black line-clamp-2">{ticket.subject}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {ticket.displayName || ticket.username || "—"} • {ticket.status}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="lg:col-span-2 gaming-card p-4 sm:p-5 min-h-[min(520px,calc(100dvh-180px))]">
            {selected ? (
              <>
                <div className="flex flex-col sm:flex-row justify-between gap-3 mb-4">
                  <div>
                    <h2 className="font-black text-xl">{selected.subject}</h2>
                    <p className="text-xs text-gray-500 mt-1">
                      {selected.displayName || selected.username || "—"} • {selected.phoneNumber || "—"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={analyzeTicket}
                      disabled={aiBusy}
                      className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-4 rounded-2xl text-xs font-black"
                    >
                      {aiBusy ? "تحلیل..." : "🤖 تحلیل AI"}
                    </button>
                    <select
                      className="gaming-select w-full sm:max-w-[180px]"
                      value={status}
                      onChange={(e) => {
                        setStatus(e.target.value);
                        saveStatus(selected, e.target.value);
                      }}
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {aiError && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-3 mb-4 text-sm">{aiError}</div>}

                {aiInsight && (
                  <div className="bg-purple-500/10 border border-purple-500/25 rounded-3xl p-4 mb-4">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className="text-xs font-black text-purple-200">🤖 خلاصه AI</span>
                      <span className="text-[10px] bg-white/5 px-2 py-1 rounded-full">{aiInsight.categoryLabel}</span>
                      <span className="text-[10px] bg-yellow-500/10 text-yellow-300 px-2 py-1 rounded-full">
                        اولویت: {PRIORITY_LABELS[aiInsight.priority] || aiInsight.priority}
                      </span>
                      <span className="text-[10px] text-gray-500" dir="ltr">{aiInsight.provider}</span>
                    </div>
                    <p className="text-sm leading-7 text-gray-200 mb-3">{aiInsight.summary}</p>
                    {aiInsight.requiredInfo?.length > 0 && (
                      <div className="mb-3">
                        <div className="text-[10px] text-gray-500 mb-2">اطلاعات لازم:</div>
                        <div className="flex flex-wrap gap-2">
                          {aiInsight.requiredInfo.map((item) => (
                            <span key={item} className="text-[10px] bg-black/25 border border-white/10 rounded-full px-2 py-1">{item}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="bg-black/25 rounded-2xl p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] text-cyan-300 font-black">پاسخ پیشنهادی</span>
                        <button onClick={() => setReply(aiInsight.suggestedReply)} className="text-[10px] bg-cyan-500/15 text-cyan-200 px-3 py-1.5 rounded-xl">
                          استفاده در پاسخ
                        </button>
                      </div>
                      <p className="text-xs leading-6 text-gray-300 whitespace-pre-wrap">{aiInsight.suggestedReply}</p>
                    </div>
                  </div>
                )}

                <div className="space-y-3 max-h-[45dvh] overflow-y-auto overscroll-contain mb-4">
                  {messages.map((message) => (
                    <div key={message.id} className="bg-dark-700 rounded-2xl p-3">
                      <div className="text-xs text-gray-500 mb-2">
                        {message.senderName || "کاربر"} • {new Date(message.createdAt).toLocaleString("fa-IR")}
                      </div>
                      <p className="text-sm leading-7 whitespace-pre-wrap">{message.message}</p>
                    </div>
                  ))}
                </div>

                <form onSubmit={send} className="space-y-3">
                  <textarea className="gaming-input min-h-28" placeholder="پاسخ مدیریت..." value={reply} onChange={(e) => setReply(e.target.value)} />
                  <button className="gaming-btn">ارسال پاسخ</button>
                </form>
              </>
            ) : (
              <div className="text-center text-gray-500 py-24">یک تیکت را انتخاب کن.</div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
