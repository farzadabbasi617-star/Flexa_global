"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";
import { calculateAIJudgment, AIJudgmentResult } from "@/lib/ai-engine";

interface Match {
  id: string;
  tournamentId: string;
  round: number;
  matchNumber: number;
  player1Id: string | null;
  player2Id: string | null;
  player1Name?: string;
  player2Name?: string;
  player1Score: number | null;
  player2Score: number | null;
  winnerId: string | null;
  status: "pending" | "in_progress" | "awaiting_judgment" | "completed" | "disputed";
}

function JudgingContent() {
  const { lang, dir } = useLanguage();
  const searchParams = useSearchParams();
  const preSelectedMatch = searchParams.get("matchId");

  const [matches, setMatches] = useState<Match[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>(preSelectedMatch || "");
  const [p1Score, setP1Score] = useState<number>(0);
  const [p2Score, setP2Score] = useState<number>(0);

  const [aiResult, setAiResult] = useState<AIJudgmentResult | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState<boolean>(false);
  const [verdictSubmitted, setVerdictSubmitted] = useState<boolean>(false);

  // Sample active matches
  const sampleMatches: Match[] = [
    {
      id: "match-301",
      tournamentId: "trnmt-01",
      round: 1,
      matchNumber: 1,
      player1Id: "p1",
      player2Id: "p2",
      player1Name: "ShadowStrike (CODM)",
      player2Name: "ApexHunter (CODM)",
      player1Score: 10,
      player2Score: 7,
      winnerId: null,
      status: "awaiting_judgment",
    },
    {
      id: "match-302",
      tournamentId: "trnmt-02",
      round: 2,
      matchNumber: 3,
      player1Id: "p3",
      player2Id: "p4",
      player1Name: "RoyalKing (Clash)",
      player2Name: "DeckMaster (Clash)",
      player1Score: 2,
      player2Score: 1,
      winnerId: null,
      status: "disputed",
    },
  ];

  const currentMatch = sampleMatches.find((m) => m.id === selectedMatchId) || sampleMatches[0];

  useEffect(() => {
    if (currentMatch) {
      setP1Score(currentMatch.player1Score || 0);
      setP2Score(currentMatch.player2Score || 0);
      setAiResult(null);
      setVerdictSubmitted(false);
    }
  }, [selectedMatchId]);

  function runAIVerdict() {
    setAiAnalyzing(true);
    setTimeout(() => {
      const res = calculateAIJudgment({
        player1Score: p1Score,
        player2Score: p2Score,
        player1Rating: 1450,
        player2Rating: 1380,
        hasEvidenceP1: true,
        hasEvidenceP2: true,
        lang: lang as "en" | "ar",
      });
      setAiResult(res);
      setAiAnalyzing(false);
    }, 1000);
  }

  function submitVerdict(verdictType: string) {
    setVerdictSubmitted(true);
    setTimeout(() => {
      setVerdictSubmitted(false);
    }, 3000);
  }

  return (
    <div className="min-h-screen bg-[#050508] text-white selection:bg-purple-500/30" dir={dir}>
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="text-xs font-black tracking-widest text-cyan-400 uppercase mb-1">
            FLEXA ARENA
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white">
            ⚖️ {lang === "ar" ? "لوحة التحكيم والذكاء الاصطناعي" : "AI & Referee Judging Panel"}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {lang === "ar"
              ? "تحقيق نتائج المباريات بالذكاء الاصطناعي وإثبات لقطات الشاشة"
              : "Automated AI match verification, screenshot OCR analysis, and referee dispute resolution."}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-8">
          {/* Active Matches Column */}
          <div className="space-y-4">
            <h2 className="text-lg font-black text-white mb-3">
              {lang === "ar" ? "المباريات القائمة بانتظار القرار" : "Active Pending Matches"}
            </h2>

            {sampleMatches.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMatchId(m.id)}
                className={`w-full p-5 rounded-3xl border text-start transition-all ${
                  selectedMatchId === m.id || (!selectedMatchId && m.id === sampleMatches[0].id)
                    ? "border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/20"
                    : "border-white/10 bg-dark-900/60 hover:bg-dark-800"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                    Round {m.round} • Match #{m.matchNumber}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      m.status === "disputed"
                        ? "bg-red-500/20 text-red-300 border border-red-500/30"
                        : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    }`}
                  >
                    {m.status === "disputed" ? (lang === "ar" ? "اعتراض" : "Disputed") : (lang === "ar" ? "بانتظار التحكيم" : "Awaiting Verdict")}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm font-bold text-white mb-1">
                  <span>{m.player1Name}</span>
                  <span className="text-purple-400 font-black">{m.player1Score}</span>
                </div>
                <div className="flex items-center justify-between text-sm font-bold text-white">
                  <span>{m.player2Name}</span>
                  <span className="text-purple-400 font-black">{m.player2Score}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Verdict Execution Column */}
          <div className="p-6 sm:p-8 rounded-3xl bg-dark-900 border border-white/10 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <h2 className="text-xl font-black text-white">
                {lang === "ar" ? "تفاصيل التحقيق" : "Match Verdict Panel"}
              </h2>
              <span className="text-xs font-mono text-cyan-300 bg-cyan-500/10 px-3 py-1 rounded-xl border border-cyan-500/20">
                ID: {currentMatch.id}
              </span>
            </div>

            {/* Score Modifier */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-dark-800 border border-white/10">
                <label className="block text-xs font-bold text-gray-400 mb-2 truncate">
                  {currentMatch.player1Name}
                </label>
                <input
                  type="number"
                  value={p1Score}
                  onChange={(e) => setP1Score(parseInt(e.target.value) || 0)}
                  className="w-full bg-dark-950 border border-white/10 rounded-xl px-4 py-3 text-lg font-black text-center text-purple-300 focus:outline-none"
                />
              </div>

              <div className="p-4 rounded-2xl bg-dark-800 border border-white/10">
                <label className="block text-xs font-bold text-gray-400 mb-2 truncate">
                  {currentMatch.player2Name}
                </label>
                <input
                  type="number"
                  value={p2Score}
                  onChange={(e) => setP2Score(parseInt(e.target.value) || 0)}
                  className="w-full bg-dark-950 border border-white/10 rounded-xl px-4 py-3 text-lg font-black text-center text-purple-300 focus:outline-none"
                />
              </div>
            </div>

            {/* Trigger AI Analysis Button */}
            <button
              onClick={runAIVerdict}
              disabled={aiAnalyzing}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 text-sm font-black text-white transition-all shadow-lg shadow-purple-600/30 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {aiAnalyzing ? (
                <>
                  <span className="animate-spin text-lg">🤖</span>
                  <span>{lang === "ar" ? "جاري تحلیل المباراة بالذكاء الاصطناعي..." : "Analyzing Match Evidence with AI..."}</span>
                </>
              ) : (
                <>
                  <span>🤖</span>
                  <span>{lang === "ar" ? "تشغيل التحكيم الآلي الذكي" : "Run AI Match Verification"}</span>
                </>
              )}
            </button>

            {/* AI Result Card */}
            {aiResult && (
              <div className="p-5 rounded-2xl bg-purple-950/30 border border-purple-500/30 space-y-4 animate-slide-up">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-300 uppercase tracking-wider">
                    AI Confidence Score
                  </span>
                  <span className="text-lg font-black text-emerald-400">
                    {Math.round(aiResult.confidence * 100)}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-dark-950 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-emerald-400 transition-all duration-1000"
                    style={{ width: `${aiResult.confidence * 100}%` }}
                  />
                </div>

                <div className="text-xs text-gray-200 leading-6 bg-dark-900/60 p-3 rounded-xl border border-white/5">
                  💬 {lang === "ar" ? aiResult.reasoningAR : aiResult.reasoning}
                </div>

                {/* Factors */}
                <div className="space-y-2 pt-2 border-t border-white/10">
                  {aiResult.factors.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px] text-gray-300">
                      <span>{lang === "ar" ? f.nameAR : f.name}</span>
                      <span className="font-bold text-cyan-300">{f.score}/100</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {verdictSubmitted && (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold text-center">
                ✓ {lang === "ar" ? "تم تثبيت القرار وتوزيع الجوائز تلقائياً!" : "Verdict confirmed and prizes distributed!"}
              </div>
            )}

            {/* Verdict Approval Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => submitVerdict("p1")}
                className="py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-black text-white transition-all shadow-md"
              >
                ✓ {lang === "ar" ? "فوز اللاعب 1" : "Approve P1 Victory"}
              </button>

              <button
                onClick={() => submitVerdict("p2")}
                className="py-3.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-black text-white transition-all shadow-md"
              >
                ✓ {lang === "ar" ? "فوز اللاعب 2" : "Approve P2 Victory"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function JudgingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#050508] flex items-center justify-center text-3xl animate-pulse">⚡</div>}>
      <JudgingContent />
    </Suspense>
  );
}
