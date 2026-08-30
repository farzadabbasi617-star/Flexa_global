"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

interface Team {
  id: string;
  name: string;
  tag: string;
  logoUrl: string | null;
  description: string | null;
  createdAt: string;
  memberCount?: number;
}

export default function TeamsPage() {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", tag: "", logoUrl: "", description: "" });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchTeams();
  }, []);

  async function fetchTeams() {
    setLoading(true);
    try {
      const res = await fetch("/api/teams");
      const data = await res.json();
      setTeams(Array.isArray(data) ? data : []);
    } catch {
      setTeams([]);
    }
    setLoading(false);
  }

  async function createTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setCreating(true);

    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        setForm({ name: "", tag: "", logoUrl: "", description: "" });
        setShowForm(false);
        fetchTeams();
      }
    } catch {
      // handle error
    }
    setCreating(false);
  }

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold">
              👥 <span className="neon-text-purple">{t.teamsPage.title}</span>
            </h1>
            <p className="text-gray-400 mt-1">
              {lang === "fa" ? "تیم‌ها و گروه‌های بازیکنان" : "Player teams and groups"}
            </p>
          </div>
          {user && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="gaming-btn"
            >
              {showForm ? "✕" : "+"} {t.teamsPage.createTeam}
            </button>
          )}
        </div>

        {/* Create Form */}
        {showForm && user && (
          <div className="gaming-card p-6 mb-8 animate-slide-up">
            <h3 className="text-lg font-bold mb-4 neon-text-blue">
              {t.teamsPage.createTeam}
            </h3>
            <form onSubmit={createTeam} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  {t.teamsPage.teamName} *
                </label>
                <input
                  type="text"
                  required
                  className="gaming-input"
                  placeholder={lang === "fa" ? "مثال: تیم فونیکس" : "e.g., Team Phoenix"}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  {t.teamsPage.teamTag} *
                </label>
                <input
                  type="text"
                  required
                  maxLength={5}
                  className="gaming-input uppercase"
                  placeholder="e.g., PHX"
                  value={form.tag}
                  onChange={(e) => setForm({ ...form, tag: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm text-gray-400 mb-1">لینک لوگو</label>
                <input
                  type="text"
                  className="gaming-input"
                  placeholder="https://..."
                  value={form.logoUrl}
                  onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm text-gray-400 mb-1">
                  {lang === "fa" ? "توضیحات" : "Description"}
                </label>
                <textarea
                  className="gaming-input min-h-[80px] resize-y"
                  placeholder={lang === "fa" ? "درباره تیم..." : "About the team..."}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={creating}
                  className="gaming-btn disabled:opacity-50"
                >
                  {creating
                    ? lang === "fa" ? "در حال ساخت..." : "Creating..."
                    : t.teamsPage.createTeam}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Teams Grid */}
        {loading ? (
          <div className="text-center py-20">
            <div className="text-4xl animate-neon-pulse mb-4">👥</div>
            <p className="text-gray-400">{lang === "fa" ? "در حال بارگذاری..." : "Loading..."}</p>
          </div>
        ) : teams.length === 0 ? (
          <div className="gaming-card p-12 text-center">
            <div className="text-5xl mb-4">🏟️</div>
            <h3 className="text-xl font-bold mb-2">
              {lang === "fa" ? "هنوز تیمی وجود ندارد" : "No Teams Yet"}
            </h3>
            <p className="text-gray-400">
              {lang === "fa"
                ? "اولین تیم را بسازید!"
                : "Be the first to create a team!"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map((team) => (
              <Link
                key={team.id}
                href={`/teams/${team.id}`}
                className="gaming-card p-5 group"
              >
                <div className="flex items-center gap-4 mb-3">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-neon-purple to-neon-blue flex items-center justify-center text-xl font-bold overflow-hidden">
                    {team.logoUrl ? <img src={team.logoUrl} alt={team.name} className="w-full h-full object-cover" loading="lazy" decoding="async" /> : team.tag}
                  </div>
                  <div>
                    <h3 className="font-bold group-hover:text-neon-blue transition-colors">
                      {team.name}
                    </h3>
                    <p className="text-xs text-gray-500">[{team.tag}] • {(team.memberCount || 0).toLocaleString("fa-IR")} عضو</p>
                  </div>
                </div>
                {team.description && (
                  <p className="text-sm text-gray-400 line-clamp-2">
                    {team.description}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
