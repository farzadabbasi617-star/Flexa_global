"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

interface Player {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  gameId: string | null;
  rating: number;
  wins: number;
  losses: number;
  createdAt: string;
}

export default function PlayersPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    username: "",
    displayName: "",
    email: "",
    gameId: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchPlayers();
  }, []);

  async function fetchPlayers() {
    setLoading(true);
    try {
      const res = await fetch("/api/players");
      const data = await res.json();
      setPlayers(Array.isArray(data) ? data : Array.isArray(data.data) ? data.data : []);
    } catch {
      setPlayers([]);
    }
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(form),
      });
      setForm({ username: "", displayName: "", email: "", gameId: "" });
      setShowForm(false);
      await fetchPlayers();
    } catch {
      // handle error
    }
    setSubmitting(false);
  }

  function getRankEmoji(index: number) {
    if (index === 0) return "🥇";
    if (index === 1) return "🥈";
    if (index === 2) return "🥉";
    return `#${index + 1}`;
  }

  function getWinRate(wins: number, losses: number) {
    const total = wins + losses;
    if (total === 0) return 0;
    return Math.round((wins / total) * 100);
  }

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold">
              👥 <span className="neon-text-blue">{t.playersPage.title}</span>
            </h1>
            <p className="text-gray-400 mt-1">{t.playersPage.subtitle}</p>
          </div>
          {isAdmin && (
            <button onClick={() => setShowForm(!showForm)} className="gaming-btn">
              {showForm ? `✕ ${t.playersPage.close}` : t.playersPage.addPlayer}
            </button>
          )}
        </div>

        {/* Create Form */}
        {isAdmin && showForm && (
          <div className="gaming-card p-6 mb-8 animate-slide-up">
            <h3 className="text-lg font-bold mb-4 neon-text-purple">{t.playersPage.addNewPlayer}</h3>
            <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">{t.playersPage.username} *</label>
                <input
                  type="text"
                  required
                  className="gaming-input"
                  placeholder={t.playersPage.usernamePlaceholder}
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">{t.playersPage.displayName} *</label>
                <input
                  type="text"
                  required
                  className="gaming-input"
                  placeholder={t.playersPage.displayNamePlaceholder}
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">{t.playersPage.email}</label>
                <input
                  type="email"
                  className="gaming-input"
                  placeholder={t.playersPage.emailPlaceholder}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">{t.playersPage.gameId}</label>
                <input
                  type="text"
                  className="gaming-input"
                  placeholder={t.playersPage.gameIdPlaceholder}
                  value={form.gameId}
                  onChange={(e) => setForm({ ...form, gameId: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <button type="submit" disabled={submitting} className="gaming-btn disabled:opacity-50">
                  {submitting ? t.playersPage.creating : t.playersPage.createPlayer}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Players List */}
        {loading ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-4 animate-neon-pulse">👥</div>
            <p className="text-gray-400">{t.playersPage.loading}</p>
          </div>
        ) : players.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">👤</div>
            <h3 className="text-xl font-bold mb-2">{t.playersPage.noPlayers}</h3>
            <p className="text-gray-400 mb-6">{t.playersPage.noPlayersDesc}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Header */}
            <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-2 text-xs text-gray-500 uppercase tracking-wider">
              <div className="col-span-1">{t.playersPage.rank}</div>
              <div className="col-span-4">{t.playersPage.player}</div>
              <div className="col-span-2 text-center">{t.playersPage.rating}</div>
              <div className="col-span-2 text-center">{t.playersPage.wl}</div>
              <div className="col-span-3 text-center">{t.playersPage.winRate}</div>
            </div>

            {players.map((player, idx) => {
              const winRate = getWinRate(player.wins, player.losses);
              return (
                <div
                  key={player.id}
                  className="gaming-card grid grid-cols-12 gap-4 px-4 py-3 items-center"
                >
                  <div className="col-span-1 text-lg font-bold">{getRankEmoji(idx)}</div>
                  <div className="col-span-4">
                    <Link href={`/players/${player.id}`} className="font-bold text-sm hover:text-neon-blue transition-colors">{player.displayName}</Link>
                    <div className="text-xs text-gray-500">@{player.username}</div>
                  </div>
                  <div className="col-span-2 text-center">
                    <span className="text-neon-blue font-bold">{player.rating}</span>
                  </div>
                  <div className="col-span-2 text-center text-sm">
                    <span className="text-neon-green">{player.wins}W</span>
                    {" / "}
                    <span className="text-neon-pink">{player.losses}L</span>
                  </div>
                  <div className="col-span-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-dark-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-neon-green to-neon-blue"
                          style={{ width: `${winRate}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 w-10 text-end">{winRate}%</span>
                    </div>
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
