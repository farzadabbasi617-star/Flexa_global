"use client";

import { useCallback, useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

interface Achievement {
  id: string;
  name: string;
  nameFA: string;
  description: string;
  descriptionFA: string;
  icon: string;
  category: string;
  requirement: number;
  points: number;
  unlocked: boolean;
  progress?: number;
  progressPercent?: number;
}

const RANKS = {
  1: {
    fa: "سرباز تازه‌کار",
    en: "The Recruit",
    icon: "/icons/achievement_rank1.png",
    color: "text-gray-400",
    glow: "shadow-[0_0_10px_rgba(156,163,175,0.3)]",
  },
  11: {
    fa: "کاوشگر میدان",
    en: "The Seeker",
    icon: "/icons/achievement_rank2.png",
    color: "text-orange-300",
    glow: "shadow-[0_0_12px_rgba(253,186,116,0.4)]",
  },
  21: {
    fa: "مبارز جسور",
    en: "The Bold Fighter",
    icon: "/icons/achievement_rank3.png",
    color: "text-blue-400",
    glow: "shadow-[0_0_15px_rgba(96,165,250,0.4)]",
  },
  31: {
    fa: "تخریب‌گر",
    en: "The Crusher",
    icon: "/icons/achievement_rank4.png",
    color: "text-blue-700",
    glow: "shadow-[0_0_18px_rgba(29,78,216,0.5)]",
  },
  41: {
    fa: "کهنه‌کار نبرد",
    en: "The Veteran",
    icon: "/icons/achievement_rank5.png",
    color: "text-purple-400",
    glow: "shadow-[0_0_20px_rgba(192,132,252,0.5)]",
  },
  51: {
    fa: "فرمانده میدان",
    en: "The Field Commander",
    icon: "/icons/achievement_rank6.png",
    color: "text-fuchsia-400",
    glow: "shadow-[0_0_22px_rgba(232,121,249,0.6)]",
  },
  61: {
    fa: "پیشرو نخبه",
    en: "The Elite Vanguard",
    icon: "/icons/achievement_rank7.png",
    color: "text-yellow-500",
    glow: "shadow-[0_0_25px_rgba(234,179,8,0.7)]",
  },
  71: {
    fa: "جنگ‌سالار",
    en: "The Warlord",
    icon: "/icons/achievement_rank8.png",
    color: "text-red-500",
    glow: "shadow-[0_0_28px_rgba(239,68,68,0.8)]",
  },
  81: {
    fa: "افسانه زنده",
    en: "The Living Legend",
    icon: "/icons/achievement_rank9.png",
    color: "text-cyan-400",
    glow: "shadow-[0_0_30px_rgba(34,211,238,0.9)]",
  },
  91: {
    fa: "امپراتور جاودانه",
    en: "The Immortal Emperor",
    icon: "/icons/achievement_rank10.png",
    color: "text-yellow-400",
    glow: "shadow-[0_0_35px_rgba(250,204,21,1)]",
  },
};

const CATEGORY_LABELS = {
  en: { wins: "Wins", tournaments: "Tournaments", rating: "Rating", special: "Special" },
  fa: { wins: "بردها", tournaments: "تورنومنت‌ها", rating: "امتیاز", special: "ویژه" },
};

export default function AchievementsPage() {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const fetchAchievements = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/achievements");
      const data = await res.json();
      setAchievements(Array.isArray(data) ? data : []);
    } catch {
      setAchievements([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAchievements();
  }, [fetchAchievements]);

  const getRank = (points: number) => {
    if (points >= 91) return RANKS[91];
    if (points >= 81) return RANKS[81];
    if (points >= 71) return RANKS[71];
    if (points >= 61) return RANKS[61];
    if (points >= 51) return RANKS[51];
    if (points >= 41) return RANKS[41];
    if (points >= 31) return RANKS[31];
    if (points >= 21) return RANKS[21];
    if (points >= 11) return RANKS[11];
    return RANKS[1];
  };

  const categories = ["all", "wins", "tournaments", "rating", "special"];

  const filteredAchievements =
    filter === "all"
      ? achievements
      : achievements.filter((a) => a.category === filter);

  const totalPoints = achievements
    .filter((a) => a.unlocked)
    .reduce((sum, a) => sum + a.points, 0);

  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2">
            🏅 <span className="neon-text-purple">{t.achievementsPage?.title || "Achievements"}</span>
          </h1>
          <p className="text-gray-400">{t.achievementsPage?.subtitle || "Track your progress and unlock rewards"}</p>
          {user && (
            <button
              onClick={fetchAchievements}
              className="mt-4 px-4 py-2 rounded-xl bg-dark-700 text-xs font-black text-neon-blue hover:bg-dark-600"
            >
              🔄 {lang === "fa" ? "بروزرسانی دستاوردها" : "Refresh Achievements"}
            </button>
          )}
        </div>

        {/* Stats */}
        {user && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
            <div className="gaming-card p-4 text-center">
              <div className="text-2xl font-bold text-neon-purple">
                {unlockedCount}/{achievements.length}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {t.achievementsPage?.unlocked || "Unlocked"}
              </div>
            </div>
            <div className="gaming-card p-4 text-center">
              <div className="text-2xl font-bold text-neon-blue">{totalPoints}</div>
              <div className="text-xs text-gray-500 mt-1">
                {t.achievementsPage?.points || "Points"}
              </div>
            </div>
            <div className="gaming-card p-4 text-center col-span-2 sm:col-span-1">
              <div className="text-2xl font-bold text-neon-green">
                {achievements.length > 0
                  ? Math.round((unlockedCount / achievements.length) * 100)
                  : 0}
                %
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {t.achievementsPage?.progress || "Progress"}
              </div>
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="flex flex-wrap gap-2 justify-center mb-8">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === cat
                  ? "bg-neon-purple/20 text-neon-purple border border-neon-purple/50"
                  : "bg-dark-700 text-gray-400 border border-gaming-border hover:border-neon-purple/30"
              }`}
            >
              {cat === "all"
                ? lang === "fa"
                  ? "همه"
                  : "All"
                : CATEGORY_LABELS[lang === "fa" ? "fa" : "en"][cat as keyof typeof CATEGORY_LABELS.en]}
            </button>
          ))}
        </div>

        {/* Achievements Grid */}
        {loading ? (
          <div className="text-center py-20">
            <div className="text-4xl animate-neon-pulse mb-4">🏅</div>
            <p className="text-gray-400">
              {lang === "fa" ? "در حال بارگذاری..." : "Loading..."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAchievements.length > 0 ? (
              filteredAchievements.map((achievement) => {
                const rank = getRank(achievement.points);
                // Determine whether to use individual custom achievement icon or rank default icon
                const achievementIconUrl = achievement.icon && (achievement.icon.startsWith("/") || achievement.icon.startsWith("http"))
                  ? achievement.icon
                  : rank.icon;

                return (
                  <div
                    key={achievement.id}
                    className={`gaming-card p-5 relative overflow-hidden ${
                      achievement.unlocked
                        ? "border-neon-green/50"
                        : "opacity-60 grayscale"
                    }`}
                  >
                    {achievement.unlocked && (
                      <div className="absolute top-2 end-2">
                        <span className="text-neon-green text-xl">✓</span>
                      </div>
                    )}

                    <div
                      className={`text-center text-[10px] font-black uppercase tracking-widest mb-3 ${rank.color} ${rank.glow}`}
                    >
                      {lang === "fa" ? rank.fa : rank.en}
                    </div>

                    <div className="flex items-center gap-4">
                      <div
                        className={`w-16 h-16 rounded-2xl flex items-center justify-center overflow-hidden shrink-0 ${
                          achievement.unlocked
                            ? "bg-gradient-to-br from-neon-purple to-neon-blue shadow-lg"
                            : "bg-dark-600"
                        }`}
                      >
                        <img
                          src={achievementIconUrl}
                          alt={lang === "fa" ? achievement.nameFA : achievement.name}
                          className={`w-full h-full object-cover ${
                            achievement.unlocked ? "opacity-100" : "opacity-30 grayscale"
                          }`}
                          loading="lazy"
                          decoding="async"
                        />
                      </div>

                      <div className="flex-1 min-w-0 text-right">
                        <h3 className="font-bold truncate">
                          {lang === "fa" ? achievement.nameFA : achievement.name}
                        </h3>
                        <p className="text-xs text-gray-400 truncate">
                          {lang === "fa" ? achievement.descriptionFA : achievement.description}
                        </p>

                        <div className="mt-3">
                          <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
                            <span>{lang === "fa" ? "پیشرفت" : "Progress"}</span>
                            <span>
                              {(achievement.progress || 0).toLocaleString("en-US")} /{" "}
                              {achievement.requirement.toLocaleString("en-US")}
                            </span>
                          </div>
                          <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                achievement.unlocked
                                  ? "bg-neon-green"
                                  : "bg-gradient-to-r from-neon-purple to-neon-blue"
                              }`}
                              style={{ width: `${achievement.progressPercent || 0}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 mt-3">
                          <span className="text-xs text-gray-500">
                            {CATEGORY_LABELS[lang === "fa" ? "fa" : "en"][
                              achievement.category as keyof typeof CATEGORY_LABELS.en
                            ]}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-neon-purple/20 text-neon-purple font-bold num-en">
                            {achievement.points} pts
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-3 text-center py-12 text-gray-400">
                {lang === "fa" ? "هیچ دستاوردی یافت نشد" : "No achievements found"}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
