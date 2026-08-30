"use client";

import { FormEvent, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  meta?: string;
};

const QUICK_PROMPTS = [
  "چطور در تورنومنت ثبت‌نام کنم؟",
  "آیدی بازی‌ها را از کجا وارد کنم؟",
  "اگر نتیجه مسابقه اشتباه ثبت شد چی کار کنم؟",
];

export default function AIAssistant() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "سلام! من دستیار هوشمند Flexa هستم. درباره تورنمنت، کیف پول، داوری، آیدی بازی‌ها و قوانین می‌تونم راهنمایی‌ات کنم.",
      meta: "Flexa AI",
    },
  ]);

  const hidden = useMemo(() => {
    return pathname.startsWith("/admin") || pathname.startsWith("/login") || pathname.startsWith("/register");
  }, [pathname]);

  if (hidden) return null;

  async function ask(message: string) {
    const text = message.trim();
    if (!text || busy) return;

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "پاسخ دریافت نشد");

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: data.response,
          meta: data.provider === "cache" && data.cachedProvider ? `cache • ${data.cachedProvider}` : data.provider || "local",
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: err instanceof Error ? err.message : "دستیار فعلاً در دسترس نیست.",
          meta: "خطا",
        },
      ]);
    }

    setBusy(false);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    ask(input);
  }

  return (
    <>
      {open && (
        <div className="fixed inset-x-3 z-[70] mx-auto max-w-[430px] rounded-[28px] border border-purple-400/20 bg-[#090911]/95 shadow-[0_22px_80px_rgba(0,0,0,.72)] backdrop-blur-2xl overflow-hidden"
          style={{ bottom: "calc(112px + env(safe-area-inset-bottom))", maxHeight: "calc(100dvh - 140px - env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10 bg-gradient-to-l from-purple-900/30 to-transparent">
            <div className="text-right">
              <div className="text-sm font-black">🤖 دستیار هوشمند Flexa</div>
              <div className="text-[10px] text-gray-500 mt-1">
                {user ? `${user.displayName} عزیز، بپرس` : "برای راهنمایی سریع سؤال بپرس"}
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="w-9 h-9 rounded-2xl bg-white/5 text-gray-300">×</button>
          </div>

          <div className="max-h-[42dvh] overflow-y-auto px-4 py-4 space-y-3 overscroll-contain">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[86%] rounded-3xl px-4 py-3 text-xs leading-6 whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-purple-600 text-white rounded-bl-lg"
                    : "bg-white/7 border border-white/10 text-gray-100 rounded-br-lg"
                }`}>
                  {msg.text}
                  {msg.meta && <div className="mt-2 text-[9px] text-gray-500" dir="ltr">{msg.meta}</div>}
                </div>
              </div>
            ))}
            {busy && <div className="text-[11px] text-purple-300 animate-pulse text-right">در حال فکر کردن...</div>}
          </div>

          <div className="px-4 pb-3 flex gap-2 overflow-x-auto">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => ask(prompt)}
                disabled={busy}
                className="shrink-0 rounded-full bg-white/5 border border-white/10 px-3 py-2 text-[10px] text-gray-300 disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="flex gap-2 p-4 border-t border-white/10">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 rounded-2xl bg-black/30 border border-white/10 px-4 py-3 text-xs outline-none focus:border-purple-400"
              placeholder="سؤالت را بنویس..."
              maxLength={1000}
            />
            <button disabled={busy || !input.trim()} className="rounded-2xl bg-purple-600 px-4 text-xs font-black disabled:opacity-40">
              ارسال
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((value) => !value)}
        className="fixed left-4 z-[69] w-13 h-13 sm:w-14 sm:h-14 rounded-3xl bg-gradient-to-br from-purple-600 to-cyan-500 shadow-[0_0_32px_rgba(188,0,255,.55)] border border-white/20 text-xl sm:text-2xl active:scale-95"
        style={{ bottom: "calc(112px + env(safe-area-inset-bottom))" }}
        aria-label="دستیار هوشمند Flexa"
      >
        🤖
      </button>
    </>
  );
}
