"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { copyTextSafely } from "@/lib/client-clipboard";

interface Registration {
  registration: { id: string; isOwner?: boolean; checkedInAt: string | null; registeredAt: string };
  player: { id: string; displayName: string; username: string; isOwner?: boolean } | null;
}

interface TournamentDetail {
  id: string;
  name: string;
  game: string;
  maxPlayers: number;
  status: string;
  startDate: string | null;
  roomId: string | null;
  roomPassword: string | null;
  lobbyNotes: string | null;
  roomVisibleAt: string | null;
  registrations: Registration[];
}

function useCountdown(target: string | null) {
  const [value, setValue] = useState("");
  useEffect(() => {
    if (!target) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    function update() {
      const diff = new Date(target!).getTime() - Date.now();
      if (diff <= 0) {
        setValue("شروع شده");
        // Stop ticking once started — otherwise this kept firing an
        // identical setState every second forever, forcing pointless
        // re-renders for the rest of the page's lifetime.
        if (timer) clearInterval(timer);
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setValue(`${h.toLocaleString("fa-IR")}:${m.toString().padStart(2,"0")}:${s.toString().padStart(2,"0")}`);
    }
    update();
    timer = setInterval(update, 1000);
    return () => { if (timer) clearInterval(timer); };
  }, [target]);
  return value;
}

export default function TournamentLobby() {
  const params = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const [tournament, setTournament] = useState<TournamentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [checkingIn, setCheckingIn] = useState(false);

  const countdown = useCountdown(tournament?.startDate || null);
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/tournaments/${params.id}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "لابی بارگذاری نشد");
        setTournament(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "لابی بارگذاری نشد");
      } finally {
        setLoading(false);
      }
    }
    if (params.id) load();
  }, [params.id]);

  const myRegistration = useMemo(() => {
    if (!user || !tournament) return null;
    return tournament.registrations.find((r) => r.registration.isOwner || r.player?.isOwner) || null;
  }, [tournament, user]);

  // Ticks every second so `credentialsVisible` below re-evaluates as time
  // passes, instead of only recomputing when `tournament`/`user` change
  // (which previously meant a user could stay on the page past the
  // reveal time without ever seeing the room credentials appear).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const canViewLobby = Boolean(isAdmin || myRegistration);
  const credentialsVisible = useMemo(() => {
    if (!tournament) return false;
    if (isAdmin) return true;
    if (!myRegistration) return false;

    if (tournament.roomVisibleAt && now >= new Date(tournament.roomVisibleAt).getTime()) return true;
    if (tournament.startDate && now >= new Date(tournament.startDate).getTime() - 30 * 60 * 1000) return true;
    if (tournament.status === "in_progress") return true;
    return false;
  }, [isAdmin, myRegistration, tournament, now]);

  // Room credentials are now withheld by the API until the reveal window.
  // Poll while an authorised participant is waiting so credentials appear
  // without a manual page refresh once the server starts returning them.
  useEffect(() => {
    if (!canViewLobby || !tournament || tournament.roomId || tournament.roomPassword || !params.id) return;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/tournaments/${params.id}`, { cache: "no-store" });
        if (!response.ok) return;
        const fresh = await response.json();
        setTournament(fresh);
      } catch {
        // Keep the current lobby state and retry on the next interval.
      }
    }, 30_000);
    return () => clearInterval(timer);
  }, [canViewLobby, tournament, params.id]);

  const copyToClipboard = async (text: string, type: string) => {
    const copiedSuccessfully = await copyTextSafely(text);
    if (!copiedSuccessfully) {
      setError("کپی خودکار در این مرورگر انجام نشد؛ روی مقدار نگه دار و دستی Copy کن.");
      return;
    }
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  async function checkIn() {
    setCheckingIn(true);
    setError("");
    try {
      const res = await fetch(`/api/tournaments/${params.id}/check-in`, { method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "تأیید حضور انجام نشد");
      const detail = await fetch(`/api/tournaments/${params.id}`, { cache: "no-store" }).then((r) => r.json());
      setTournament(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تأیید حضور انجام نشد");
    } finally {
      setCheckingIn(false);
    }
  }

  if (loading || authLoading) {
    return <div className="min-h-screen bg-[#050508] text-white flex items-center justify-center"><div className="text-4xl animate-neon-pulse">🎮</div></div>;
  }

  if (!tournament) {
    return <div className="min-h-screen bg-[#050508] text-white flex items-center justify-center"><div>{error || "لابی پیدا نشد"}</div></div>;
  }

  return (
    <div className="min-h-screen bg-[#050508] text-white relative overflow-x-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,_#2a004f_0%,_transparent_50%)]" />
      </div>

      <div className="relative z-10 max-w-[480px] mx-auto px-4 sm:px-6" style={{ paddingBottom: "var(--bottom-nav-space)" }}>
        <header className="pt-7 sm:pt-12 pb-6 sm:pb-8 flex items-center justify-between">
          <Link href={`/tournaments/${tournament.id}`} className="w-10 h-10 glass-panel rounded-full flex items-center justify-center text-xs opacity-70">❯</Link>
          <div className="text-center">
            <h1 className="text-xl font-black italic tracking-tighter en-font">MATCH LOBBY</h1>
            <p className="text-[8px] font-bold text-purple-400 uppercase tracking-[0.3em]">Official Tournament</p>
          </div>
          <div className="w-10" />
        </header>

        <section className="mb-8">
          <div className="glass-panel p-6 rounded-[35px] border border-purple-500/20 flex items-center gap-5">
            <div className="w-16 h-16 glass-panel rounded-2xl flex items-center justify-center text-3xl border-purple-500/30 shadow-[0_0_15px_rgba(188,0,255,0.2)]">🎯</div>
            <div className="text-right">
              <h2 className="text-lg font-black leading-none mb-1">{tournament.name}</h2>
              <p className="text-[10px] text-gray-500 font-bold uppercase">{tournament.game} • {tournament.registrations.length}/{tournament.maxPlayers} Players</p>
            </div>
          </div>
        </section>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-3 rounded-2xl mb-6 text-xs leading-6">{error}</div>}

        {!canViewLobby ? (
          <div className="glass-panel p-8 rounded-[35px] border border-white/10 text-center">
            <div className="text-6xl mb-4">🔒</div>
            <h2 className="font-black text-xl mb-3">دسترسی محدود</h2>
            <p className="text-sm text-gray-400 leading-7 mb-5">اطلاعات لابی فقط برای شرکت‌کنندگان ثبت‌نام‌شده و ادمین‌ها نمایش داده می‌شود.</p>
            <Link href={`/tournaments/${tournament.id}`} className="gaming-btn w-full">بازگشت به تورنومنت</Link>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 bg-red-500/10 px-4 py-1.5 rounded-full border border-red-500/20 mb-3">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />
                <span className="text-[9px] font-black text-red-400 uppercase tracking-widest">Starts in: {countdown || "نامشخص"}</span>
              </div>
            </div>

            <section className="mb-8">
              <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mr-4 mb-4">اطلاعات ورود به بازی</h3>
              <div className="glass-panel p-8 rounded-[45px] border border-white/10 relative overflow-hidden bg-gradient-to-br from-[#1a1a20] to-transparent">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-50" />
                {credentialsVisible ? (
                  <div className="space-y-8">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-[9px] font-black text-gray-500 uppercase mb-1">Room ID</p>
                        <p className="text-2xl en-font font-black num-en tracking-widest" dir="ltr">{tournament.roomId || "اعلام نشده"}</p>
                      </div>
                      {tournament.roomId && <button onClick={() => copyToClipboard(tournament.roomId!, "id")} className={`px-4 py-2 rounded-xl text-[10px] font-black ${copied === "id" ? "bg-green-500/20 text-green-400" : "bg-white/5 text-gray-400"}`}>{copied === "id" ? "کپی شد!" : "کپی آیدی"}</button>}
                    </div>
                    <div className="h-px bg-white/5 w-full" />
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-[9px] font-black text-gray-500 uppercase mb-1">Password</p>
                        <p className="text-2xl en-font font-black num-en tracking-widest" dir="ltr">{tournament.roomPassword || "اعلام نشده"}</p>
                      </div>
                      {tournament.roomPassword && <button onClick={() => copyToClipboard(tournament.roomPassword!, "pass")} className={`px-4 py-2 rounded-xl text-[10px] font-black ${copied === "pass" ? "bg-green-500/20 text-green-400" : "bg-white/5 text-gray-400"}`}>{copied === "pass" ? "کپی شد!" : "کپی رمز"}</button>}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="text-5xl mb-4">⏳</div>
                    <p className="text-sm text-gray-300 leading-7">اطلاعات لابی هنوز منتشر نشده است. معمولاً ۳۰ دقیقه قبل از شروع نمایش داده می‌شود.</p>
                  </div>
                )}
              </div>
              <p className="text-[9px] text-center text-red-400/70 font-bold mt-4">⚠️ اشتراک‌گذاری اطلاعات لابی باعث محرومیت دائم می‌شود.</p>
            </section>

            <section className="mb-8 px-2">
              <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mr-2 mb-4">قوانین اختصاصی این مسابقه</h3>
              <div className="glass-panel p-6 rounded-[30px] border border-white/5 space-y-3 text-xs font-bold text-gray-300 leading-7">
                {tournament.lobbyNotes ? tournament.lobbyNotes.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => <div key={line} className="flex items-center gap-3"><span className="text-purple-500">●</span>{line}</div>) : (
                  <>
                    <div className="flex items-center gap-3"><span className="text-purple-500">●</span>آیدی بازی باید با آیدی ثبت‌شده در پروفایل مطابقت داشته باشد.</div>
                    <div className="flex items-center gap-3"><span className="text-purple-500">●</span>ضبط یا اسکرین‌شات نتیجه برای داوری توصیه می‌شود.</div>
                    <div className="flex items-center gap-3"><span className="text-purple-500">●</span>تأخیر بیش از زمان اعلام‌شده می‌تواند باخت محسوب شود.</div>
                  </>
                )}
              </div>
            </section>

            <div className="glass-panel p-5 rounded-[25px] border border-purple-500/20 flex items-center justify-center gap-3 opacity-90 mb-8">
              <span className="text-xl">🤖</span>
              <span className="text-[10px] font-black uppercase tracking-widest">AI Judge Is Monitoring This Lobby</span>
            </div>
          </>
        )}
      </div>

      {canViewLobby && myRegistration && (
        <div className="fixed bottom-10 left-0 right-0 max-w-[480px] mx-auto px-6 z-50">
          {myRegistration.registration.checkedInAt ? (
            <div className="w-full py-5 rounded-3xl bg-green-500/15 border border-green-500/30 text-green-300 font-black text-sm text-center">✅ حضور شما تأیید شده</div>
          ) : (
            <button onClick={checkIn} disabled={checkingIn} className="w-full py-5 rounded-3xl bg-gradient-to-r from-purple-600 to-blue-600 font-black text-sm shadow-[0_15px_30px_rgba(147,51,234,0.3)] active:scale-95 transition-all disabled:opacity-50">
              {checkingIn ? "در حال ثبت..." : "ورود به بازی و تایید حضور"}
            </button>
          )}
        </div>
      )}

      <style jsx global>{`
        .glass-panel { background: rgba(20, 20, 25, 0.72); backdrop-filter: blur(25px); }
        .en-font { font-family: Impact, "Arial Black", system-ui, sans-serif; letter-spacing: -0.04em; }
        .num-en { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      `}</style>
    </div>
  );
}
