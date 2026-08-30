"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";

interface Ticket {
  id: string;
  subject: string;
  status: string;
  createdAt: string;
}

interface SupportMessage {
  id: string;
  senderId: string;
  senderName: string | null;
  senderRole: string | null;
  message: string;
  createdAt: string;
}

const CATEGORIES = ["مشکل پرداخت", "مشکل تورنومنت", "مشکل جایزه", "مشکل حساب کاربری", "گزارش تقلب", "سایر"];
const STATUS_LABELS: Record<string, string> = {
  open: "باز",
  pending: "در انتظار",
  resolved: "حل‌شده",
  closed: "بسته",
};

export default function SupportPage() {
  const { user, loading } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [busy, setBusy] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (ticketId?: string) => {
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      const url = ticketId ? `/api/support?ticketId=${ticketId}` : "/api/support";
      const res = await fetch(url, { cache: "no-store", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "پشتیبانی بارگذاری نشد");
      setTickets(Array.isArray(data.tickets) ? data.tickets : []);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      if (data.ticket) setSelectedTicket(data.ticket);
      else if (!ticketId) setSelectedTicket((prev) => prev || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "پشتیبانی بارگذاری نشد");
    } finally {
      setBusy(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) load();
    else setBusy(false);
  }, [user, load]);

  async function createTicket(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ category, subject, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تیکت ثبت نشد");
      setSubject("");
      setMessage("");
      setShowNew(false);
      setSelectedTicket(data.ticket);
      await load(data.ticket.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تیکت ثبت نشد");
    } finally {
      setSubmitting(false);
    }
  }

  async function sendReply(e: FormEvent) {
    e.preventDefault();
    if (!selectedTicket || !reply.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ ticketId: selectedTicket.id, message: reply }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "پیام ارسال نشد");
      setReply("");
      await load(selectedTicket.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "پیام ارسال نشد");
    } finally {
      setSubmitting(false);
    }
  }

  async function closeTicket() {
    if (!selectedTicket) return;
    await fetch("/api/support", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ ticketId: selectedTicket.id, status: "closed" }),
    });
    await load(selectedTicket.id);
  }

  const ticketStats = useMemo(() => ({
    all: tickets.length,
    open: tickets.filter((t) => t.status === "open").length,
    resolved: tickets.filter((t) => t.status === "resolved" || t.status === "closed").length,
  }), [tickets]);

  if (loading || busy) {
    return <div className="min-h-screen bg-dark-900 text-white flex items-center justify-center"><div className="text-4xl animate-neon-pulse">🎧</div></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-dark-900 text-white">
        <Navbar />
        <div className="max-w-md mx-auto px-4 py-16 text-center" style={{ paddingBottom: "var(--bottom-nav-space)" }}>
          <div className="gaming-card p-8">
            <div className="text-6xl mb-4">🎧</div>
            <h1 className="text-2xl font-black mb-3">برای پشتیبانی وارد شو</h1>
            <p className="text-gray-400 text-sm leading-7 mb-6">برای ساخت تیکت و پیگیری پاسخ‌ها باید وارد حساب کاربری شوی.</p>
            <Link href="/login" className="gaming-btn w-full">ورود</Link>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050508] text-white relative overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_-10%,rgba(92,0,160,.62),transparent_70%)]" />
      <Navbar />
      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8" style={{ paddingBottom: "var(--bottom-nav-space)" }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-black neon-text-purple">🎧 پشتیبانی Flexa</h1>
            <p className="text-gray-500 text-sm mt-2">تیکت بساز، مشکل رو توضیح بده و پاسخ مدیریت رو پیگیری کن.</p>
          </div>
          <button onClick={() => setShowNew((v) => !v)} className="gaming-btn">+ تیکت جدید</button>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-3 mb-5 text-sm">{error}</div>}

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="gaming-card p-4 text-center"><div className="text-2xl font-black text-neon-blue">{ticketStats.all.toLocaleString("fa-IR")}</div><div className="text-xs text-gray-500">کل تیکت‌ها</div></div>
          <div className="gaming-card p-4 text-center"><div className="text-2xl font-black text-neon-orange">{ticketStats.open.toLocaleString("fa-IR")}</div><div className="text-xs text-gray-500">باز</div></div>
          <div className="gaming-card p-4 text-center"><div className="text-2xl font-black text-neon-green">{ticketStats.resolved.toLocaleString("fa-IR")}</div><div className="text-xs text-gray-500">بسته/حل‌شده</div></div>
        </div>

        {showNew && (
          <form onSubmit={createTicket} className="gaming-card p-4 sm:p-5 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-slide-up">
            <select className="gaming-select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className="gaming-input" placeholder="موضوع کوتاه" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <textarea className="gaming-input sm:col-span-2 min-h-32" placeholder="مشکل را کامل توضیح بده..." value={message} onChange={(e) => setMessage(e.target.value)} />
            <button disabled={submitting} className="gaming-btn sm:col-span-2 disabled:opacity-50">{submitting ? "در حال ارسال..." : "ثبت تیکت"}</button>
          </form>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <section className="lg:col-span-1 space-y-3">
            {tickets.length === 0 ? <div className="gaming-card p-8 text-center text-gray-500">هنوز تیکتی نداری.</div> : tickets.map((ticket) => (
              <button key={ticket.id} onClick={() => load(ticket.id)} className={`gaming-card p-4 w-full text-right ${selectedTicket?.id === ticket.id ? "border-neon-purple" : ""}`}>
                <div className="font-black truncate">{ticket.subject}</div>
                <div className="flex justify-between items-center mt-2 text-xs text-gray-500"><span>{new Date(ticket.createdAt).toLocaleDateString("fa-IR")}</span><span className="text-neon-blue">{STATUS_LABELS[ticket.status] || ticket.status}</span></div>
              </button>
            ))}
          </section>

          <section className="lg:col-span-2 gaming-card p-4 sm:p-5 min-h-[min(540px,calc(100dvh-190px))]">
            {!selectedTicket ? <div className="text-center text-gray-500 py-24">یک تیکت را انتخاب کن یا تیکت جدید بساز.</div> : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-b border-white/5 pb-4">
                  <div><h2 className="font-black text-xl">{selectedTicket.subject}</h2><p className="text-xs text-gray-500 mt-1">وضعیت: {STATUS_LABELS[selectedTicket.status] || selectedTicket.status}</p></div>
                  {selectedTicket.status !== "closed" && <button onClick={closeTicket} className="px-4 py-2 rounded-xl bg-red-500/10 text-red-300 text-xs font-bold">بستن تیکت</button>}
                </div>
                <div className="space-y-3 max-h-[42dvh] overflow-y-auto overscroll-contain mb-4">
                  {messages.map((msg) => {
                    const mine = msg.senderId === user.id;
                    return (
                      <div key={msg.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-2xl p-3 ${mine ? "bg-purple-600/25 rounded-br-none" : "bg-dark-700 rounded-bl-none"}`}>
                          <div className="text-[10px] text-gray-500 mb-2">{msg.senderName || "کاربر"} • {new Date(msg.createdAt).toLocaleString("fa-IR")}</div>
                          <p className="text-sm leading-7 whitespace-pre-wrap">{msg.message}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {selectedTicket.status !== "closed" ? (
                  <form onSubmit={sendReply} className="space-y-3">
                    <textarea className="gaming-input min-h-24" placeholder="پیام جدید..." value={reply} onChange={(e) => setReply(e.target.value)} />
                    <button disabled={submitting || !reply.trim()} className="gaming-btn disabled:opacity-50">ارسال پیام</button>
                  </form>
                ) : <div className="text-center text-gray-500 text-sm">این تیکت بسته شده است.</div>}
              </>
            )}
          </section>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
