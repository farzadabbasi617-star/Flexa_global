"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

interface PlayerProfileData {
  player: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    gameId: string | null;
    rating: number;
    wins: number;
    losses: number;
    totalMatches: number;
    winRate: number;
    flexaId: string | null;
    level: number | null;
    rankPoints: number | null;
      isVerified: boolean | null;
    clashRoyaleUsername: string | null;
    codMobileUsername: string | null;
    fortniteUsername: string | null;
    createdAt: string;
  };
  tournaments: Array<{ registrationId: string; tournamentId: string; tournamentName: string | null; game: string | null; status: string | null; registeredAt: string }>;
  matches: Array<{ id: string; tournamentId: string; tournamentName: string; winnerId: string | null; player1Score: number | null; player2Score: number | null; status: string; completedAt: string | null; createdAt: string }>;
}

export default function PlayerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<PlayerProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/players/${id}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "بازیکن پیدا نشد");
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "بازیکن پیدا نشد");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) return <div className="min-h-screen bg-dark-900 text-white flex items-center justify-center"><div className="text-4xl animate-neon-pulse">👤</div></div>;
  if (!data) return <div className="min-h-screen bg-dark-900 text-white"><Navbar /><div className="text-center py-32">{error || "بازیکن پیدا نشد"}</div></div>;

  const p = data.player;

  return (
    <div className="min-h-screen bg-[#050508] text-white relative overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_-10%,rgba(92,0,160,.62),transparent_70%)]" />
      <Navbar />
      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/players" className="text-gray-500 hover:text-white text-sm">← بازگشت به بازیکنان</Link>

        <section className="gaming-card p-6 sm:p-8 mt-5 mb-8 overflow-hidden relative">
          <div className="absolute -top-16 -left-16 w-52 h-52 rounded-full bg-purple-600/20 blur-3xl" />
          <div className="relative flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-purple-600 to-cyan-500 grid place-items-center text-5xl font-black border-4 border-dark-900 shadow-[0_0_40px_rgba(168,85,247,.25)]">
              {p.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 text-center sm:text-right">
              <div className="flex flex-wrap justify-center sm:justify-start items-center gap-2 mb-2">
                <h1 className="text-3xl sm:text-4xl font-black">{p.displayName}</h1>
                {p.isVerified && <span className="text-neon-green">✓</span>}
              </div>
              <p className="text-gray-500" dir="ltr">@{p.username} • {p.flexaId || "No Flexa ID"}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
                <div className="bg-dark-700 rounded-2xl p-4"><div className="text-2xl font-black text-neon-blue">{p.rating}</div><div className="text-xs text-gray-500">Rating</div></div>
                <div className="bg-dark-700 rounded-2xl p-4"><div className="text-2xl font-black text-neon-green">{p.wins}</div><div className="text-xs text-gray-500">برد</div></div>
                <div className="bg-dark-700 rounded-2xl p-4"><div className="text-2xl font-black text-neon-pink">{p.losses}</div><div className="text-xs text-gray-500">باخت</div></div>
                <div className="bg-dark-700 rounded-2xl p-4"><div className="text-2xl font-black text-neon-purple">{p.winRate}%</div><div className="text-xs text-gray-500">Win Rate</div></div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="gaming-card p-6">
            <h2 className="font-black text-neon-blue mb-4">🎮 آیدی‌ها و بازی‌ها</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between bg-dark-700 rounded-xl p-3"><span>کلش رویال</span><span className="text-gray-400">{p.clashRoyaleUsername || "—"}</span></div>
              <div className="flex justify-between bg-dark-700 rounded-xl p-3"><span>کالاف موبایل</span><span className="text-gray-400">{p.codMobileUsername || "—"}</span></div>
              <div className="flex justify-between bg-dark-700 rounded-xl p-3"><span>فورتنایت</span><span className="text-gray-400">{p.fortniteUsername || "—"}</span></div>
            </div>
          </section>

          <section className="gaming-card p-6 lg:col-span-2">
            <h2 className="font-black text-neon-purple mb-4">🏆 تورنومنت‌های اخیر</h2>
            {data.tournaments.length === 0 ? <p className="text-gray-500 text-sm">هنوز در تورنومنتی ثبت‌نام نکرده است.</p> : <div className="space-y-3">{data.tournaments.map((t) => <Link key={t.registrationId} href={`/tournaments/${t.tournamentId}`} className="block bg-dark-700 rounded-xl p-4 hover:bg-dark-600"><div className="font-bold">{t.tournamentName}</div><div className="text-xs text-gray-500 mt-1">{t.game} • {t.status} • {new Date(t.registeredAt).toLocaleDateString("fa-IR")}</div></Link>)}</div>}
          </section>

          <section className="gaming-card p-6 lg:col-span-3">
            <h2 className="font-black text-neon-green mb-4">⚔️ مسابقات اخیر</h2>
            {data.matches.length === 0 ? <p className="text-gray-500 text-sm">هنوز مسابقه‌ای ثبت نشده است.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="text-gray-500"><tr><th className="p-3 text-right">تورنومنت</th><th className="p-3 text-right">نتیجه</th><th className="p-3 text-right">وضعیت</th><th className="p-3 text-right">زمان</th></tr></thead><tbody>{data.matches.map((m) => <tr key={m.id} className="border-t border-white/5"><td className="p-3">{m.tournamentName || "—"}</td><td className="p-3">{m.player1Score ?? "—"} - {m.player2Score ?? "—"} {m.winnerId === p.id ? <span className="text-neon-green ms-2">برد</span> : m.winnerId ? <span className="text-neon-pink ms-2">باخت</span> : null}</td><td className="p-3 text-neon-blue">{m.status}</td><td className="p-3">{new Date(m.createdAt).toLocaleDateString("fa-IR")}</td></tr>)}</tbody></table></div>}
          </section>
        </div>
      </main>
    </div>
  );
}
