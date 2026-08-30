"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";

interface Match {
  id: string;
  tournamentId: string;
  round: number;
  matchNumber: number;
  player1Id: string | null;
  player2Id: string | null;
  player1Score: number | null;
  player2Score: number | null;
  winnerId: string | null;
  status: "pending" | "in_progress" | "awaiting_judgment" | "completed" | "disputed";
}

interface Judge {
  id: string;
  name: string;
  email: string | null;
  role: string;
}

interface Judgment {
  id: string;
  matchId: string;
  judgeId: string | null;
  isAiJudgment: boolean;
  verdict: string;
  reasoning: string | null;
  confidence: number | null;
  scoreBreakdown: Record<string, unknown> | null;
  createdAt: string;
}

interface Evidence {
  id: string;
  uploaderName: string | null;
  uploaderUsername: string | null;
  uploaderRole: string | null;
  fileUrl: string;
  fileType: string;
  description: string | null;
  createdAt: string;
}

interface Player {
  id: string;
  username: string;
  displayName: string;
  rating: number;
}

const MATCH_STATUS_STYLES = {
  pending: { color: "text-gray-400" },
  in_progress: { color: "text-neon-yellow" },
  awaiting_judgment: { color: "text-neon-orange" },
  completed: { color: "text-neon-green" },
  disputed: { color: "text-neon-pink" },
};

function JudgingContent() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const preSelectedMatch = searchParams.get("matchId");

  const [matches, setMatches] = useState<Match[]>([]);
  const [judges, setJudges] = useState<Judge[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<string>(preSelectedMatch || "");
  const [selectedJudge, setSelectedJudge] = useState("");
  const [judgments, setJudgments] = useState<Judgment[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [verdict, setVerdict] = useState("player1_wins");
  const [reasoning, setReasoning] = useState("");
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [p1Score, setP1Score] = useState("0");
  const [p2Score, setP2Score] = useState("0");

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedMatch) {
      fetchJudgments(selectedMatch);
      fetchEvidence(selectedMatch);
    } else {
      setEvidence([]);
    }
  }, [selectedMatch]);

  async function fetchData() {
    setLoading(true);
    try {
      const [mRes, jRes, pRes] = await Promise.all([
        fetch("/api/tournaments"),
        fetch("/api/judges"),
        fetch("/api/players"),
      ]);
      const tournamentsData = await mRes.json();
      const judgesData = await jRes.json();
      const playersData = await pRes.json();

      setJudges(Array.isArray(judgesData) ? judgesData : []);
      setPlayers(Array.isArray(playersData) ? playersData : Array.isArray(playersData.data) ? playersData.data : []);

      const tournaments = Array.isArray(tournamentsData)
        ? tournamentsData
        : Array.isArray(tournamentsData.data)
        ? tournamentsData.data
        : [];

      const allMatches: Match[] = [];
      if (Array.isArray(tournaments)) {
        for (const trnmt of tournaments) {
          try {
            const tRes = await fetch(`/api/tournaments/${trnmt.id}`);
            const tData = await tRes.json();
            if (tData.matches) {
              allMatches.push(...tData.matches);
            }
          } catch {
            // skip
          }
        }
      }
      setMatches(allMatches);
    } catch {
      // handle error
    }
    setLoading(false);
  }

  async function fetchJudgments(matchId: string) {
    try {
      const res = await fetch(`/api/judgments?matchId=${matchId}`);
      const data = await res.json();
      setJudgments(Array.isArray(data) ? data : []);
    } catch {
      setJudgments([]);
    }
  }

  async function fetchEvidence(matchId: string) {
    try {
      const res = await fetch(`/api/matches/${matchId}/evidence`, { cache: "no-store" });
      const data = await res.json();
      setEvidence(Array.isArray(data) ? data : []);
    } catch {
      setEvidence([]);
    }
  }

  function getPlayerName(id: string | null) {
    if (!id) return t.common.tbd;
    const p = players.find((pl) => pl.id === id);
    return p?.displayName || t.common.unknown;
  }

  async function submitHumanJudgment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMatch) return;

    const match = matches.find((m) => m.id === selectedMatch);
    if (match) {
      const winnerId = verdict === "player1_wins" ? match.player1Id : match.player2Id;

      await fetch(`/api/matches/${selectedMatch}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({
          player1Score: parseInt(p1Score),
          player2Score: parseInt(p2Score),
          status: "awaiting_judgment",
        }),
      });

      await fetch("/api/judgments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({
          matchId: selectedMatch,
          judgeId: selectedJudge || null,
          isAiJudgment: false,
          verdict,
          reasoning,
        }),
      });

      await fetch(`/api/matches/${selectedMatch}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ winnerId, status: "completed" }),
      });
    }

    await fetchJudgments(selectedMatch);
    await fetchData();
    setReasoning("");
  }

  async function requestAiJudgment() {
    if (!selectedMatch) return;
    setAiLoading(true);

    await fetch(`/api/matches/${selectedMatch}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({
        player1Score: parseInt(p1Score),
        player2Score: parseInt(p2Score),
        status: "awaiting_judgment",
      }),
    });

    try {
      const res = await fetch("/api/judgments/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ matchId: selectedMatch }),
      });
      const data = await res.json();

      if (data.verdict && data.verdict !== "rematch") {
        const match = matches.find((m) => m.id === selectedMatch);
        if (match) {
          const winnerId = data.verdict === "player1_wins" ? match.player1Id : match.player2Id;
          await fetch(`/api/matches/${selectedMatch}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
            body: JSON.stringify({ winnerId, status: "completed" }),
          });
        }
      }

      await fetchJudgments(selectedMatch);
      await fetchData();
    } catch {
      // handle error
    }
    setAiLoading(false);
  }

  const activeMatches = matches.filter(
    (m) => m.player1Id && m.player2Id && m.status !== "completed"
  );
  const currentMatch = matches.find((m) => m.id === selectedMatch);

  if (loading) {
    return (
      <div className="text-center py-20">
        <div className="text-4xl mb-4 animate-neon-pulse">⚖️</div>
        <p className="text-gray-400">{t.judgingPage.loading}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Match Selection */}
      <div className="lg:col-span-1">
        <div className="gaming-card p-5">
          <h3 className="font-bold text-neon-purple mb-4">{t.judgingPage.activeMatches}</h3>
          {activeMatches.length === 0 ? (
            <p className="text-gray-400 text-sm">{t.judgingPage.noActiveMatches}</p>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {activeMatches.map((match) => {
                const mStatus = MATCH_STATUS_STYLES[match.status];
                const mLabel = t.matchStatuses[match.status];
                return (
                  <button
                    key={match.id}
                    onClick={() => setSelectedMatch(match.id)}
                    className={`w-full text-start p-3 rounded-lg border transition-all ${
                      selectedMatch === match.id
                        ? "border-neon-purple bg-neon-purple/10"
                        : "border-gaming-border bg-dark-700 hover:border-neon-purple/30"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500">
                        R{match.round} M{match.matchNumber}
                      </span>
                      <span className={`text-xs ${mStatus.color}`}>{mLabel}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-200">{getPlayerName(match.player1Id)}</span>
                      <span className="text-gray-500"> {t.common.vs} </span>
                      <span className="text-gray-200">{getPlayerName(match.player2Id)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Judging Area */}
      <div className="lg:col-span-2">
        {!selectedMatch || !currentMatch ? (
          <div className="gaming-card p-12 text-center">
            <div className="text-5xl mb-4">⚖️</div>
            <h3 className="text-xl font-bold mb-2">{t.judgingPage.selectMatch}</h3>
            <p className="text-gray-400">{t.judgingPage.selectMatchDesc}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Match Info */}
            <div className="gaming-card p-6">
              <h3 className="font-bold text-neon-blue mb-4">{t.judgingPage.matchDetails}</h3>
              <div className="flex items-center justify-center gap-8">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-neon-blue/20 flex items-center justify-center text-2xl mb-2 mx-auto">
                    ⚔️
                  </div>
                  <div className="font-bold">{getPlayerName(currentMatch.player1Id)}</div>
                  <div className="text-xs text-gray-500">{t.judgingPage.player1}</div>
                </div>
                <div className="text-3xl font-bold text-gray-600">{t.common.vs}</div>
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-neon-pink/20 flex items-center justify-center text-2xl mb-2 mx-auto">
                    🗡️
                  </div>
                  <div className="font-bold">{getPlayerName(currentMatch.player2Id)}</div>
                  <div className="text-xs text-gray-500">{t.judgingPage.player2}</div>
                </div>
              </div>

              {/* Score Input */}
              <div className="flex items-center justify-center gap-4 mt-6">
                <div className="text-center">
                  <label className="text-xs text-gray-500 block mb-1">{t.judgingPage.p1Score}</label>
                  <input
                    type="number"
                    min="0"
                    className="w-20 bg-dark-800 text-center text-lg rounded-lg px-2 py-2 text-white border border-gaming-border font-bold"
                    value={p1Score}
                    onChange={(e) => setP1Score(e.target.value)}
                  />
                </div>
                <span className="text-2xl text-gray-600 mt-5">:</span>
                <div className="text-center">
                  <label className="text-xs text-gray-500 block mb-1">{t.judgingPage.p2Score}</label>
                  <input
                    type="number"
                    min="0"
                    className="w-20 bg-dark-800 text-center text-lg rounded-lg px-2 py-2 text-white border border-gaming-border font-bold"
                    value={p2Score}
                    onChange={(e) => setP2Score(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Evidence */}
            <div className="gaming-card p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📸</span>
                  <h3 className="font-bold text-neon-green">مدارک ثبت‌شده بازیکنان</h3>
                </div>
                <span className="text-xs text-gray-500">{evidence.length.toLocaleString("fa-IR")} مدرک</span>
              </div>

              {evidence.length === 0 ? (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-sm text-yellow-200 leading-7">
                  هنوز مدرکی برای این مسابقه ثبت نشده است. اگر نتیجه توسط بازیکن ارسال شده باشد، لینک یا اسکرین‌شات اینجا نمایش داده می‌شود.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {evidence.map((item) => {
                    const isImage = item.fileUrl.startsWith("data:image") || /\.(png|jpg|jpeg|webp|gif)(\?.*)?$/i.test(item.fileUrl);
                    return (
                      <div key={item.id} className="bg-dark-700 rounded-2xl border border-white/5 overflow-hidden">
                        {isImage ? (
                          <a href={item.fileUrl} target="_blank" rel="noreferrer">
                            <img src={item.fileUrl} alt={item.description || "مدرک مسابقه"} className="w-full h-40 object-cover" loading="lazy" decoding="async" />
                          </a>
                        ) : (
                          <a href={item.fileUrl} target="_blank" rel="noreferrer" className="block p-5 text-neon-blue text-sm font-bold break-all">
                            🔗 مشاهده لینک مدرک
                          </a>
                        )}
                        <div className="p-4">
                          <div className="text-xs text-gray-500 mb-2">
                            {item.uploaderName || item.uploaderUsername || "کاربر"} • {new Date(item.createdAt).toLocaleString("fa-IR")}
                          </div>
                          {item.description && <p className="text-sm text-gray-300 leading-6 whitespace-pre-wrap">{item.description}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Judging Methods */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Human Judgment */}
              <div className="gaming-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xl">👨‍⚖️</span>
                  <h3 className="font-bold text-neon-purple">{t.judgingPage.humanJudgment}</h3>
                </div>

                <form onSubmit={submitHumanJudgment} className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">{t.judgingPage.judge}</label>
                    <select
                      className="gaming-select text-sm"
                      value={selectedJudge}
                      onChange={(e) => setSelectedJudge(e.target.value)}
                    >
                      <option value="">{t.judgingPage.selectJudge}</option>
                      {judges.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.name} ({j.role})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-gray-400 block mb-1">{t.judgingPage.verdict}</label>
                    <select
                      className="gaming-select text-sm"
                      value={verdict}
                      onChange={(e) => setVerdict(e.target.value)}
                    >
                      <option value="player1_wins">
                        {getPlayerName(currentMatch.player1Id)} {t.judgingPage.wins}
                      </option>
                      <option value="player2_wins">
                        {getPlayerName(currentMatch.player2Id)} {t.judgingPage.wins}
                      </option>
                      <option value="draw">{t.judgingPage.draw}</option>
                      <option value="rematch">{t.judgingPage.rematchRequired}</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-gray-400 block mb-1">{t.judgingPage.reasoning}</label>
                    <textarea
                      className="gaming-input text-sm min-h-[80px] resize-y"
                      placeholder={t.judgingPage.reasoningPlaceholder}
                      value={reasoning}
                      onChange={(e) => setReasoning(e.target.value)}
                    />
                  </div>

                  <button type="submit" className="gaming-btn w-full text-sm py-2">
                    {t.judgingPage.submitJudgment}
                  </button>
                </form>
              </div>

              {/* AI Judgment */}
              <div className="gaming-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xl">🤖</span>
                  <h3 className="font-bold text-neon-blue">{t.judgingPage.aiAnalysis}</h3>
                </div>

                <div className="text-sm text-gray-400 mb-4 space-y-2">
                  <p>{t.judgingPage.aiDesc}</p>
                  <div className="bg-dark-700 rounded-lg p-3 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span>📊 {t.judgingPage.scoreAnalysis}</span>
                      <span className="text-neon-green">{t.judgingPage.active}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>📈 {t.judgingPage.ratingHistory}</span>
                      <span className="text-neon-green">{t.judgingPage.active}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>🎯 {t.judgingPage.performanceIndex}</span>
                      <span className="text-neon-green">{t.judgingPage.active}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>⚖️ {t.judgingPage.fairnessScore}</span>
                      <span className="text-neon-green">{t.judgingPage.active}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={requestAiJudgment}
                  disabled={aiLoading}
                  className="gaming-btn w-full text-sm py-2 bg-gradient-to-r from-neon-blue to-neon-green disabled:opacity-50"
                >
                  {aiLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin">⚙️</span> {t.judgingPage.analyzing}
                    </span>
                  ) : (
                    `🤖 ${t.judgingPage.requestAiJudgment}`
                  )}
                </button>
              </div>
            </div>

            {/* Judgment History */}
            {judgments.length > 0 && (
              <div className="gaming-card p-6">
                <h3 className="font-bold text-neon-purple mb-4">
                  {t.judgingPage.judgmentHistory} ({judgments.length})
                </h3>
                <div className="space-y-3">
                  {judgments.map((j) => (
                    <div
                      key={j.id}
                      className={`bg-dark-700 rounded-lg p-4 border-s-4 ${
                        j.isAiJudgment ? "border-neon-blue" : "border-neon-purple"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span>{j.isAiJudgment ? "🤖" : "👨‍⚖️"}</span>
                          <span className="text-sm font-bold">
                            {j.isAiJudgment ? t.judgingPage.aiAnalysis : t.judgingPage.humanJudge}
                          </span>
                        </div>
                        {j.confidence !== null && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">{t.judgingPage.confidence}:</span>
                            <span
                              className={`text-sm font-bold ${
                                j.confidence >= 80
                                  ? "text-neon-green"
                                  : j.confidence >= 60
                                  ? "text-neon-yellow"
                                  : "text-neon-orange"
                              }`}
                            >
                              {j.confidence}%
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="mb-2">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                            j.verdict === "player1_wins"
                              ? "bg-blue-900/30 text-neon-blue"
                              : j.verdict === "player2_wins"
                              ? "bg-pink-900/30 text-neon-pink"
                              : j.verdict === "rematch"
                              ? "bg-yellow-900/30 text-neon-yellow"
                              : "bg-gray-700 text-gray-300"
                          }`}
                        >
                          {j.verdict.replace(/_/g, " ").toUpperCase()}
                        </span>
                      </div>

                      {j.reasoning && <p className="text-sm text-gray-400">{j.reasoning}</p>}

                      {j.scoreBreakdown && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {Object.entries(j.scoreBreakdown)
                            .filter(([, value]) => typeof value === "number")
                            .map(([key, value]) => (
                              <div key={key} className="bg-dark-800 rounded px-2 py-1 text-xs">
                                <span className="text-gray-500">
                                  {key.replace(/([A-Z])/g, " $1").trim()}:
                                </span>{" "}
                                <span className="text-white font-medium">{String(value)}</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function JudgingPage() {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">
            ⚖️ <span className="neon-text-blue">{t.judgingPage.title}</span>
          </h1>
          <p className="text-gray-400 mt-1">{t.judgingPage.subtitle}</p>
        </div>
        <Suspense
          fallback={
            <div className="text-center py-20">
              <div className="text-4xl mb-4 animate-neon-pulse">⚖️</div>
              <p className="text-gray-400">{t.judgingPage.loading}</p>
            </div>
          }
        >
          <JudgingContent />
        </Suspense>
      </div>
    </div>
  );
}
