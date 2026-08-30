"use client";

import { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { parseTomanToRial, rialToTomanNumber } from "@/lib/money";
import { calculateDynamicTournamentPrizePool } from "@/lib/tournament-finance";
import { useCountdown } from "@/hooks/useCountdown";
import { CLASH_PRIVATE_DRAFT_CATEGORY } from "@/lib/clash-private-tournament";
import { CLASH_1V1_CONFIG, isClash1v1QueueTournament } from "@/lib/clash-1v1-config";
import { botDeepLink } from "@/lib/telegram-bot-username";

interface Player {
  id: string;
  isOwner?: boolean;
  username: string;
  displayName: string;
  rating: number;
  wins: number;
  losses: number;
}

interface Match {
  id: string;
  round: number;
  matchNumber: number;
  player1Id: string | null;
  player2Id: string | null;
  winnerId: string | null;
  player1Score: number | null;
  player2Score: number | null;
  status: "pending" | "in_progress" | "awaiting_judgment" | "completed" | "disputed";
}

interface Registration {
  registration: {
    id: string;
    playerId: string;
    isOwner?: boolean;
    checkedInAt: string | null;
    registeredAt: string;
  };
  player: Player | null;
}

interface Tournament {
  id: string;
  name: string;
  game: "clash_royale" | "cod_mobile" | "fortnite";
  format: string;
  status: "registration" | "in_progress" | "completed" | "cancelled";
  description: string | null;
  maxPlayers: number;
  prizePool: string | null;
  bannerUrl?: string | null;
  startDate?: string | null;
  entryFee?: string | null;
  gameMode?: string | null;
  mapName?: string | null;
  categoryLabel?: string | null;
  rules: string | null;
  prize1st?: string | null;
  registrations: Registration[];
  matches: Match[];
  leaderboard?: Array<{ rank: number; playerName: string; score: number | null; verified: boolean }>;
}

const GAMES_DATA = {
  clash_royale: { icon: "⚔️", bgGradient: "from-blue-600 to-cyan-500" },
  cod_mobile: { icon: "🎯", bgGradient: "from-orange-600 to-red-500" },
  fortnite: { icon: "🏗️", bgGradient: "from-purple-600 to-pink-500" },
};

const STATUS_STYLES = {
  registration: { color: "text-neon-blue", bg: "bg-blue-900/30" },
  in_progress: { color: "text-neon-green", bg: "bg-green-900/30" },
  completed: { color: "text-gray-400", bg: "bg-gray-700" },
  cancelled: { color: "text-neon-pink", bg: "bg-red-900/30" },
};

const MATCH_STATUS_STYLES = {
  pending: { color: "text-gray-400", bg: "bg-gray-700" },
  in_progress: { color: "text-neon-yellow", bg: "bg-yellow-900/30" },
  awaiting_judgment: { color: "text-neon-orange", bg: "bg-orange-900/30" },
  completed: { color: "text-neon-green", bg: "bg-green-900/30" },
  disputed: { color: "text-neon-pink", bg: "bg-red-900/30" },
};

export default function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { t } = useLanguage();
  const { user } = useAuth();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "bracket" | "players" | "rules">("overview");
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [registering, setRegistering] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [registrationError, setRegistrationError] = useState("");
  const [privatePolicyAccepted, setPrivatePolicyAccepted] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const countdown = useCountdown(tournament?.startDate);

  const fetchTournament = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tournaments/${id}`);
      const data = await res.json();
      setTournament(data);
    } catch {
      // handle error
    }
    setLoading(false);
  }, [id]);

  const fetchPlayers = useCallback(async () => {
    try {
      const res = await fetch("/api/players");
      const data = await res.json();
      setAllPlayers(Array.isArray(data) ? data : Array.isArray(data.data) ? data.data : []);
    } catch {
      // handle error
    }
  }, []);

  const fetchWalletBalance = useCallback(async () => {
    if (!user) {
      setWalletBalance(null);
      return;
    }
    try {
      const res = await fetch("/api/wallet/balance", { cache: "no-store", credentials: "include" });
      const data = await res.json();
      if (res.ok) setWalletBalance(Number(data.balanceToman || 0));
    } catch {
      setWalletBalance(null);
    }
  }, [user]);

  useEffect(() => {
    fetchTournament();
    fetchPlayers();
  }, [fetchTournament, fetchPlayers]);

  useEffect(() => {
    fetchWalletBalance();
  }, [fetchWalletBalance]);

  async function registerPlayer() {
    if (!selectedPlayer) return;
    if (isPrivateClashDraft && !privatePolicyAccepted) {
      setRegistrationError("قبل از ثبت‌نام باید قانون No-show و عدم بازگشت وجه را بپذیری.");
      return;
    }
    setRegistering(true);
    setRegistrationError("");
    try {
      const res = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ tournamentId: id, playerId: selectedPlayer, policyAccepted: privatePolicyAccepted }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "ثبت‌نام انجام نشد");
      await fetchTournament();
      await fetchWalletBalance();
      setSelectedPlayer("");
      setPrivatePolicyAccepted(false);
    } catch (err) {
      setRegistrationError(err instanceof Error ? err.message : "ثبت‌نام انجام نشد");
    }
    setRegistering(false);
  }

  async function deleteTournament() {
    if (!confirm("تورنومنت و مسابقات/داوری‌های وابسته حذف می‌شوند. ادامه می‌دهی؟")) return;
    setAdminError("");
    try {
      const res = await fetch("/api/admin/tournaments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "حذف تورنومنت انجام نشد");
      router.push("/tournaments");
      router.refresh();
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : "حذف تورنومنت انجام نشد");
    }
  }

  async function generateBrackets() {
    try {
      await fetch(`/api/tournaments/${id}/generate-brackets`, { method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" } });
      await fetchTournament();
      setTab("bracket");
    } catch {
      // handle error
    }
  }

  async function updateMatchScore(matchId: string, p1Score: number, p2Score: number) {
    const winnerId =
      p1Score > p2Score
        ? tournament?.matches.find((m) => m.id === matchId)?.player1Id
        : tournament?.matches.find((m) => m.id === matchId)?.player2Id;

    try {
      await fetch(`/api/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({
          player1Score: p1Score,
          player2Score: p2Score,
          winnerId,
          status: "completed",
        }),
      });
      await fetchTournament();
    } catch {
      // handle error
    }
  }

  async function submitPlayerResult(matchId: string, p1Score: number, p2Score: number, evidenceUrl: string, description: string) {
    const res = await fetch(`/api/matches/${matchId}/submit-result`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ player1Score: p1Score, player2Score: p2Score, evidenceUrl, description }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "ثبت نتیجه انجام نشد");
    await fetchTournament();
  }

  async function raiseMatchDispute(matchId: string, raisedById: string, reason: string) {
    const res = await fetch("/api/disputes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ matchId, raisedById, reason, evidenceUrls: [] }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "ثبت اعتراض انجام نشد");
    await fetchTournament();
  }

  function getPlayerName(playerId: string | null): string {
    if (!playerId) return t.tournamentDetail.tbd;
    const reg = tournament?.registrations.find((r) => r.player?.id === playerId);
    return reg?.player?.displayName || t.common.unknown;
  }

  function getOwnedPlayerIdForMatch(match: Match): string | null {
    if (!user) return null;
    const candidates = [match.player1Id, match.player2Id].filter(Boolean) as string[];
    for (const playerId of candidates) {
      const reg = tournament?.registrations.find((r) => r.player?.id === playerId);
      if (reg?.player?.isOwner) return playerId;
    }
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-900">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <div className="text-4xl mb-4 animate-neon-pulse">🏆</div>
            <p className="text-gray-400">{t.tournamentDetail.loading}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-dark-900">
        <Navbar />
        <div className="text-center py-32">
          <div className="text-6xl mb-4">❌</div>
          <h2 className="text-2xl font-bold mb-4">{t.tournamentDetail.notFound}</h2>
          <Link href="/tournaments" className="gaming-btn">
            {t.tournamentDetail.backToTournaments}
          </Link>
        </div>
      </div>
    );
  }

  const gameData = GAMES_DATA[tournament.game];
  const gameName = t.games[tournament.game];
  const statusStyle = STATUS_STYLES[tournament.status];
  const statusLabel = t.statuses[tournament.status];
  const registeredIds = new Set(tournament.registrations.map((r) => r.registration.playerId));
  const myRegistration = user
    ? tournament.registrations.find((r) => r.registration.isOwner || r.player?.isOwner) || null
    : null;
  const isRegistered = Boolean(myRegistration);
  const availablePlayers = allPlayers.filter((p) => !registeredIds.has(p.id) && (isAdmin || p.isOwner));
  const spotsLeft = Math.max(0, tournament.maxPlayers - tournament.registrations.length);
  const entryFee = tournament.entryFee || "رایگان";
  const entryFeeRial = parseTomanToRial(entryFee);
  const entryFeeToman = rialToTomanNumber(entryFeeRial);
  const isPaidTournament = entryFeeRial > BigInt(0);
  const hasEnoughWallet = walletBalance !== null && walletBalance >= entryFeeToman;
  const checkedInCount = tournament.registrations.filter((r) => r.registration.checkedInAt).length;
  const fillPercent = Math.min((tournament.registrations.length / Math.max(tournament.maxPlayers, 1)) * 100, 100);
  const completedMatches = tournament.matches.filter((m) => m.status === "completed").length;
  const awaitingJudgmentCount = tournament.matches.filter((m) => m.status === "awaiting_judgment" || m.status === "disputed").length;

  const isClash1v1Queue = isClash1v1QueueTournament(tournament);

  const prizeData = calculateDynamicTournamentPrizePool({
    entryFee: tournament.entryFee,
    registeredCount: tournament.registrations.length,
    maxPlayers: tournament.maxPlayers,
    staticPrizePool: tournament.prizePool,
    // 1V1 is a matchmaking queue: maxPlayers is the queue size, not the match.
    isDuel: isClash1v1Queue,
  });

  const roundsMap = new Map<number, Match[]>();
  tournament.matches.forEach((m) => {
    if (!roundsMap.has(m.round)) roundsMap.set(m.round, []);
    roundsMap.get(m.round)!.push(m);
  });
  const rounds = Array.from(roundsMap.entries()).sort(([a], [b]) => a - b);
  const isPrivateClashDraft = tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY;

  const tabs = [
    { key: "overview", label: t.tournamentDetail.overview, icon: "📋" },
    { key: "bracket", label: isPrivateClashDraft ? "Leaderboard" : t.tournamentDetail.bracket, icon: "🏆" },
    { key: "players", label: t.tournamentDetail.players, icon: "👥" },
    { key: "rules", label: t.tournamentDetail.rules, icon: "📜" },
  ] as const;

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Tournament Header */}
        <div className="gaming-card p-6 sm:p-8 mb-8 overflow-hidden relative">
          {tournament.bannerUrl && <img src={tournament.bannerUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" loading="lazy" decoding="async" />}
          <div className="relative flex flex-col sm:flex-row items-start gap-6">
            <div className="text-6xl">{gameData.icon}</div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r ${gameData.bgGradient} text-white text-xs font-bold`}
                >
                  {gameName}
                </span>
                <span
                  className={`text-xs px-3 py-1 rounded-full ${statusStyle.bg} ${statusStyle.color} font-medium`}
                >
                  {statusLabel}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-2">{tournament.name}</h1>
              {tournament.description && (
                <p className="text-gray-400">{tournament.description}</p>
              )}
              <div className="flex flex-wrap gap-4 mt-4 text-sm">
                <span className="text-gray-400">
                  👥 {tournament.registrations.length}/{tournament.maxPlayers} {t.tournamentDetail.players}
                </span>
                <span className="text-neon-green font-bold">
                  💰 جایزه کل: {prizeData.displayPrizePool}
                </span>
                <span className="text-gray-400">
                  📋 {t.formats[tournament.format as keyof typeof t.formats] || tournament.format}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {(isAdmin || isRegistered) && (
                <Link href={`/tournaments/${tournament.id}/lobby`} className="gaming-btn text-sm bg-gradient-to-r from-purple-600 to-blue-600">
                  🎮 ورود به لابی
                </Link>
              )}
              {isAdmin && (
                <>
                  <Link href="/admin/tournaments" className="gaming-btn text-sm bg-gradient-to-r from-cyan-600 to-blue-600">
                    ✏️ ویرایش در پنل مدیریت
                  </Link>
                  <button onClick={deleteTournament} className="gaming-btn gaming-btn-danger text-sm">
                    🗑️ حذف تورنومنت
                  </button>
                </>
              )}
              {tournament.status === "registration" && tournament.registrations.length >= 2 && (
                <button onClick={generateBrackets} className="gaming-btn text-sm">
                  ⚔️ {t.tournamentDetail.generateBrackets}
                </button>
              )}
            </div>
          </div>

          <div className="relative mt-8 grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-dark-700/80 rounded-2xl p-4 border border-white/5">
              <div className="text-xs text-gray-500 mb-1">ظرفیت</div>
              <div className="text-xl font-black text-neon-purple">{tournament.registrations.length.toLocaleString("fa-IR")}/{tournament.maxPlayers.toLocaleString("fa-IR")}</div>
              <div className="h-2 bg-dark-600 rounded-full overflow-hidden mt-3">
                <div className="h-full bg-gradient-to-r from-neon-purple to-neon-blue" style={{ width: `${fillPercent}%` }} />
              </div>
            </div>
            <div className="bg-dark-700/80 rounded-2xl p-4 border border-white/5">
              <div className="text-xs text-gray-500 mb-1">جای خالی</div>
              <div className="text-xl font-black text-neon-blue">{spotsLeft.toLocaleString("fa-IR")}</div>
            </div>
            <div className="bg-dark-700/80 rounded-2xl p-4 border border-white/5">
              <div className="text-xs text-gray-500 mb-1">تأیید حضور</div>
              <div className="text-xl font-black text-neon-green">{checkedInCount.toLocaleString("fa-IR")}</div>
            </div>
            <div className="bg-dark-700/80 rounded-2xl p-4 border border-white/5">
              <div className="text-xs text-gray-500 mb-1">در انتظار داوری</div>
              <div className="text-xl font-black text-neon-orange">{awaitingJudgmentCount.toLocaleString("fa-IR")}</div>
            </div>
            <div className="bg-dark-700/80 rounded-2xl p-4 border border-white/5 col-span-2 lg:col-span-1">
              <div className="text-xs text-gray-500 mb-1">⏳ تا شروع</div>
              <div className={`text-sm font-black ${countdown.expired ? "text-neon-green" : "text-neon-blue animate-neon-pulse"}`}>{countdown.value || "نامشخص"}</div>
            </div>
          </div>
        </div>

        {adminError && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-3 mb-6 text-sm">{adminError}</div>}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto">
          {tabs.map((tabItem) => (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize whitespace-nowrap transition-all ${
                tab === tabItem.key
                  ? "bg-neon-purple/20 text-neon-purple border border-neon-purple/50"
                  : "text-gray-400 hover:text-white hover:bg-dark-600"
              }`}
            >
              {tabItem.icon} {tabItem.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {tab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="gaming-card p-6">
              <h3 className="text-lg font-bold mb-4 neon-text-blue">{t.tournamentDetail.quickStats}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-dark-700 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-neon-purple">
                    {tournament.registrations.length}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{t.tournamentDetail.players}</div>
                </div>
                <div className="bg-dark-700 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-neon-blue">
                    {tournament.matches.length}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{t.home.matches}</div>
                </div>
                <div className="bg-dark-700 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-neon-green">
                    {completedMatches}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{t.tournamentDetail.completed}</div>
                </div>
                <div className="bg-dark-700 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-neon-orange">{rounds.length}</div>
                  <div className="text-xs text-gray-400 mt-1">{t.tournamentDetail.rounds}</div>
                </div>
              </div>
            </div>

            <div className="gaming-card p-6">
              <h3 className="text-lg font-bold mb-4 neon-text-purple">
                وضعیت ثبت‌نام شما
              </h3>

              {registrationError && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-3 mb-4 text-sm leading-6">{registrationError}</div>}

              {isClash1v1Queue ? (
                <div className="space-y-4">
                  <div className="bg-cyan-500/10 border border-cyan-500/30 text-cyan-200 rounded-2xl p-4 text-sm leading-7">
                    ⚔️ <b>این رقابت ۱V۱ کلش رویال است و فقط از داخل بات تلگرام انجام می‌شود.</b>
                    <br />
                    ورودی {tournament.entryFee} / جایزه نفر اول {tournament.prize1st || CLASH_1V1_CONFIG.prize1st}.
                    بعد از پرداخت ورودی از کیف پول، QR یا پیوند دوستی کلشت را به بات بفرست تا بات خودکار حریفت را پیدا کند و شما را به هم وصل کند.
                  </div>
                  <a
                    href={botDeepLink("clash", process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="gaming-btn w-full text-sm text-center"
                  >
                    🤖 ورود به بات و شروع ۱V۱
                  </a>
                </div>
              ) : !user ? (
                <div className="space-y-4">
                  <p className="text-gray-400 text-sm leading-7">برای ثبت‌نام در تورنومنت باید وارد حساب شوی.</p>
                  <Link href="/login" className="gaming-btn w-full text-sm">ورود به حساب</Link>
                </div>
              ) : isRegistered ? (
                <div className="space-y-4">
                  <div className="bg-green-500/10 border border-green-500/25 text-green-300 rounded-2xl p-4 text-sm leading-7">
                    ✅ شما با بازیکن <b>{myRegistration?.player?.displayName || "خودتان"}</b> در این تورنومنت ثبت‌نام کرده‌اید.
                    {myRegistration?.registration.checkedInAt && <div className="mt-2 text-xs">حضور شما در لابی تأیید شده است.</div>}
                  </div>
                  <Link href={`/tournaments/${tournament.id}/lobby`} className="gaming-btn w-full text-sm">ورود به لابی</Link>
                </div>
              ) : tournament.status !== "registration" ? (
                <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 rounded-2xl p-4 text-sm leading-7">
                  ثبت‌نام این تورنومنت در حال حاضر باز نیست.
                </div>
              ) : spotsLeft <= 0 ? (
                <div className="bg-red-500/10 border border-red-500/20 text-red-300 rounded-2xl p-4 text-sm leading-7">
                  ظرفیت تورنومنت تکمیل شده است.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-dark-700 rounded-2xl p-3 text-center">
                      <div className="text-xs text-gray-500 mb-1">ورودی</div>
                      <div className={isPaidTournament ? "text-yellow-300 font-black" : "text-green-300 font-black"}>{entryFee}</div>
                    </div>
                    <div className="bg-dark-700 rounded-2xl p-3 text-center">
                      <div className="text-xs text-gray-500 mb-1">موجودی شما</div>
                      <div className="text-neon-blue font-black">{walletBalance === null ? "—" : `${walletBalance.toLocaleString("fa-IR")} USDT`}</div>
                    </div>
                  </div>

                  {isPaidTournament && walletBalance !== null && !hasEnoughWallet && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-300 rounded-2xl p-3 text-xs leading-6">
                      موجودی کیف پول برای ثبت‌نام کافی نیست. مبلغ لازم: {entryFeeToman.toLocaleString("fa-IR")} USDT.
                    </div>
                  )}

                  {isPaidTournament && !isPrivateClashDraft && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 rounded-2xl p-3 text-xs leading-6">
                      در صورت ثبت‌نام، ورودی از کیف پول کسر می‌شود. اگر تورنومنت لغو شود، وجه به کیف پول برمی‌گردد.
                    </div>
                  )}

                  {isPrivateClashDraft && (
                    <label className="block bg-orange-500/10 border border-orange-500/30 text-orange-100 rounded-2xl p-4 text-xs leading-7 cursor-pointer">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={privatePolicyAccepted}
                          onChange={(event) => setPrivatePolicyAccepted(event.target.checked)}
                          className="mt-1 h-4 w-4 accent-orange-500"
                        />
                        <span>
                          <b>قانون No-show و عدم بازگشت وجه را می‌پذیرم:</b><br />
                          اگر از ۳۰ دقیقه قبل شروع انصراف بدهم، چک‌این نکنم یا در مسابقه حاضر نشوم، ورودی به من بازگردانده نمی‌شود و داخل استخر جایزه برندگان باقی می‌ماند. فقط لغو مسابقه یا خطای فنی برگزارکننده شامل Refund کامل است.
                        </span>
                      </div>
                    </label>
                  )}

                  {availablePlayers.length === 0 ? (
                    <div className="space-y-3">
                      <p className="text-gray-400 text-sm">برای ثبت‌نام، ابتدا باید پروفایل بازیکن داشته باشی. اگر ثبت‌نام کرده‌ای ولی بازیکن نمی‌بینی، پروفایل را کامل کن.</p>
                      <Link href="/profile/edit" className="gaming-btn w-full text-sm">تکمیل پروفایل</Link>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <select
                        className="gaming-select flex-1"
                        value={selectedPlayer}
                        onChange={(e) => setSelectedPlayer(e.target.value)}
                      >
                        <option value="">{t.tournamentDetail.selectPlayer}</option>
                        {availablePlayers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.displayName} ({t.tournamentDetail.rating}: {p.rating})
                          </option>
                        ))}
                      </select>
                      {isPaidTournament && walletBalance !== null && !hasEnoughWallet ? (
                        <Link href="/wallet" className="gaming-btn text-sm bg-gradient-to-r from-orange-600 to-red-600">شارژ کیف پول</Link>
                      ) : (
                        <button
                          onClick={registerPlayer}
                          disabled={!selectedPlayer || registering || (isPrivateClashDraft && !privatePolicyAccepted)}
                          className="gaming-btn disabled:opacity-50 text-sm"
                        >
                          {registering ? "..." : isPaidTournament ? "ثبت‌نام و کسر ورودی" : t.tournamentDetail.register}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="gaming-card p-6 lg:col-span-2 border border-yellow-500/20 bg-gradient-to-br from-yellow-500/5 via-[#111218] to-[#0f0f13]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-lg sm:text-xl font-black text-yellow-400 flex items-center gap-2">
                    🏆 سیستم داینامیک محاسبه و توزیع جوایز
                  </h3>
                  <p className="text-xs text-gray-400 mt-1 leading-6">
                    {!prizeData.isPaid
                      ? `این تورنومنت بدون ورودی (رایگان) بوده و جوایز طبق اعلام مدیریت/اسپانسر به‌صورت پلکانی بین نفرات برتر توزیع می‌گردد.`
                      : isClash1v1Queue
                        ? `این یک مسابقه دو نفره است: هر بازیکن ${prizeData.entryFeeToman.toLocaleString("fa-IR")} USDT ورودی می‌پردازد و پس از کسر ۲۰٪ کارمزد سایت، کل مبلغ باقی‌مانده به برنده مسابقه پرداخت می‌شود.`
                        : `جایزه مسابقات بر اساس تعداد شرکت‌کنندگان محاسبه شده و پس از کسر ۲۰٪ کارمزد سایت، ۸۰٪ مابقی به‌صورت پلکانی بین نفر اول تا دهم تقسیم می‌شود.`}
                  </p>
                </div>
                <div className="bg-yellow-500/10 border border-yellow-500/30 px-4 py-2.5 rounded-2xl text-right shrink-0">
                  <div className="text-[11px] text-yellow-500/80 font-bold">جایزه کل قابل توزیع</div>
                  <div className="text-xl font-black text-yellow-300 mt-0.5">{prizeData.displayPrizePool}</div>
                </div>
              </div>

              {prizeData.isPaid && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
                    <div className="text-xs text-gray-400 mb-1">
                      {isClash1v1Queue ? "مجموع ورودی دو بازیکن" : "مجموع مبالغ ورودی جمع‌شده"}
                    </div>
                    <div className="text-base sm:text-lg font-black text-white">
                      {(isClash1v1Queue ? prizeData.maxTotalCollectedToman : prizeData.totalCollectedToman).toLocaleString("fa-IR")} USDT
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1">
                      {isClash1v1Queue
                        ? `۲ نفر × ${prizeData.entryFeeToman.toLocaleString("fa-IR")} USDT`
                        : `${tournament.registrations.length.toLocaleString("fa-IR")} نفر × ${prizeData.entryFeeToman.toLocaleString("fa-IR")} USDT`}
                    </div>
                  </div>
                  <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-center">
                    <div className="text-xs text-red-300 mb-1">کارمزد سایت (۲۰٪)</div>
                    <div className="text-base sm:text-lg font-black text-red-400">
                      {(isClash1v1Queue ? prizeData.maxSiteCommissionToman : prizeData.siteCommissionToman).toLocaleString("fa-IR")} USDT
                    </div>
                    <div className="text-[10px] text-red-400/70 mt-1">هزینه‌های برگزاری و داوری AI</div>
                  </div>
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-center">
                    <div className="text-xs text-emerald-300 mb-1">
                      {isClash1v1Queue ? "جایزه برنده (۸۰٪)" : "مجموع جوایز بازیکنان (۸۰٪)"}
                    </div>
                    <div className="text-base sm:text-lg font-black text-emerald-400">
                      {(isClash1v1Queue ? prizeData.maxNetPrizePoolToman : prizeData.netPrizePoolToman).toLocaleString("fa-IR")} USDT
                    </div>
                    <div className="text-[10px] text-emerald-400/70 mt-1">
                      {isClash1v1Queue
                        ? "کل مبلغ به برنده مسابقه می‌رسد"
                        : `ظرفیت کامل: ${prizeData.maxNetPrizePoolToman.toLocaleString("fa-IR")} USDT`}
                    </div>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse min-w-[550px]">
                  <thead>
                    <tr className="border-b border-white/10 text-xs text-gray-400 bg-white/[0.02]">
                      <th className="py-3 px-4 font-semibold">مقام</th>
                      <th className="py-3 px-4 font-semibold">عنوان</th>
                      <th className="py-3 px-4 font-semibold text-center">سهم از جایزه</th>
                      <th className="py-3 px-4 font-semibold text-left">مبلغ جایزه فعلی</th>
                      {prizeData.isPaid && (
                        <th className="py-3 px-4 font-semibold text-left text-gray-500">در صورت تکمیل ظرفیت</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-sm">
                    {prizeData.ladder.map((item) => (
                      <tr key={item.rank} className="hover:bg-white/[0.03] transition-colors">
                        <td className="py-3.5 px-4 font-bold text-yellow-400">#{item.rank.toLocaleString("fa-IR")}</td>
                        <td className="py-3.5 px-4 font-semibold text-white">{item.label}</td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="inline-block px-2.5 py-1 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-300 text-xs font-black">
                            {item.percentageText}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-left font-black text-emerald-400">
                          {item.amountToman > 0 ? `${item.amountToman.toLocaleString("fa-IR")} USDT` : "—"}
                        </td>
                        {prizeData.isPaid && (
                          <td className="py-3.5 px-4 text-left font-bold text-gray-400">
                            {item.maxAmountToman.toLocaleString("fa-IR")} USDT
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="gaming-card p-6 lg:col-span-2">
              <h3 className="text-lg font-bold mb-4 neon-text-blue">{t.tournamentDetail.matchResults}</h3>
              {tournament.matches.length === 0 ? (
                <p className="text-gray-400 text-sm">{t.tournamentDetail.noMatchesYet}</p>
              ) : (
                <div className="space-y-2">
                  {tournament.matches
                    .filter((m) => m.player1Id && m.player2Id)
                    .slice(0, 10)
                    .map((match) => {
                      const mStatus = MATCH_STATUS_STYLES[match.status];
                      const mLabel = t.matchStatuses[match.status];
                      return (
                        <div
                          key={match.id}
                          className="flex items-center gap-3 bg-dark-700 rounded-lg p-3"
                        >
                          <span className="text-xs text-gray-500 w-16">
                            R{match.round} M{match.matchNumber}
                          </span>
                          <div className="flex-1 flex items-center gap-2">
                            <span
                              className={`font-medium text-sm ${
                                match.winnerId === match.player1Id
                                  ? "text-neon-green"
                                  : "text-gray-300"
                              }`}
                            >
                              {getPlayerName(match.player1Id)}
                            </span>
                            <span className="text-gray-500 text-xs">
                              {match.player1Score ?? "-"} : {match.player2Score ?? "-"}
                            </span>
                            <span
                              className={`font-medium text-sm ${
                                match.winnerId === match.player2Id
                                  ? "text-neon-green"
                                  : "text-gray-300"
                              }`}
                            >
                              {getPlayerName(match.player2Id)}
                            </span>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full ${mStatus.bg} ${mStatus.color}`}>
                            {mLabel}
                          </span>
                          {match.status === "pending" && match.player1Id && match.player2Id && (
                            <Link
                              href={`/judging?matchId=${match.id}`}
                              className="text-xs text-neon-blue hover:underline"
                            >
                              {t.tournamentDetail.judge} →
                            </Link>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "bracket" && isPrivateClashDraft && (
          <div className="gaming-card p-6 overflow-x-auto">
            <h3 className="text-lg font-bold mb-2 neon-text-blue">🏅 Leaderboard رسمی مسابقه</h3>
            <p className="text-xs text-gray-500 mb-5">رتبه‌ها بعد از بررسی تصویر جدول داخل Clash Royale توسط مدیریت نمایش داده می‌شوند.</p>
            {(tournament.leaderboard || []).length === 0 ? (
              <p className="text-gray-400 text-center py-12">هنوز Leaderboard تأییدشده‌ای ثبت نشده است.</p>
            ) : (
              <table className="w-full min-w-[460px] text-sm">
                <thead><tr className="border-b border-white/10 text-gray-500"><th className="p-3">رتبه</th><th>بازیکن</th><th>امتیاز</th><th>وضعیت</th></tr></thead>
                <tbody>{(tournament.leaderboard || []).map((row) => (
                  <tr key={row.rank} className="border-b border-white/5">
                    <td className="p-3 font-black text-yellow-300">#{row.rank.toLocaleString("fa-IR")}</td>
                    <td className="font-bold">{row.playerName}</td>
                    <td>{row.score ?? "—"}</td>
                    <td>{row.verified ? <span className="text-green-300">✅ متصل به Flexa</span> : <span className="text-orange-300">در انتظار تطبیق</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}

        {tab === "bracket" && !isPrivateClashDraft && (
          <div className="gaming-card p-6 overflow-x-auto">
            <h3 className="text-lg font-bold mb-6 neon-text-blue">{t.tournamentDetail.bracket}</h3>
            {rounds.length === 0 ? (
              <p className="text-gray-400 text-center py-12">
                {t.tournamentDetail.bracketsNotGenerated}
                {tournament.status === "registration" && ` ${t.tournamentDetail.registerAndGenerate}`}
              </p>
            ) : (
              <div className="flex gap-8 min-w-max pb-4">
                {rounds.map(([roundNum, roundMatches]) => (
                  <div key={roundNum} className="flex flex-col gap-4">
                    <div className="text-center text-sm font-bold text-neon-purple mb-2">
                      {roundNum === rounds.length
                        ? `🏆 ${t.tournamentDetail.final}`
                        : roundNum === rounds.length - 1
                        ? t.tournamentDetail.semiFinals
                        : `${t.tournamentDetail.round} ${roundNum}`}
                    </div>
                    <div
                      className="flex flex-col gap-4 justify-around"
                      style={{
                        minHeight: roundNum > 1 ? `${roundMatches.length * 120}px` : undefined,
                      }}
                    >
                      {roundMatches.map((match) => (
                        <BracketMatch
                          key={match.id}
                          match={match}
                          getPlayerName={getPlayerName}
                          onScore={updateMatchScore}
                          onSubmitResult={submitPlayerResult}
                          onDispute={raiseMatchDispute}
                          ownedPlayerId={getOwnedPlayerIdForMatch(match)}
                          isAdmin={isAdmin}
                          t={t}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "players" && (
          <div className="gaming-card p-6">
            <h3 className="text-lg font-bold mb-4 neon-text-blue">
              {t.tournamentDetail.registeredPlayers} ({tournament.registrations.length})
            </h3>
            {tournament.registrations.length === 0 ? (
              <p className="text-gray-400 text-center py-8">
                {t.tournamentDetail.noPlayersRegistered}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {tournament.registrations.map((reg, idx) => (
                  <div
                    key={reg.registration.id}
                    className="flex items-center gap-3 bg-dark-700 rounded-lg p-3"
                  >
                    <span className="w-8 h-8 rounded-full bg-neon-purple/20 flex items-center justify-center text-sm font-bold text-neon-purple">
                      {idx + 1}
                    </span>
                    <div className="flex-1">
                      <div className="font-medium text-sm">
                        {reg.player?.displayName || t.common.unknown}
                      </div>
                      <div className="text-xs text-gray-400">
                        @{reg.player?.username} · {t.tournamentDetail.rating}: {reg.player?.rating}
                      </div>
                    </div>
                    <div className="text-end text-xs space-y-1">
                      <div className="text-neon-green">{reg.player?.wins}W</div>
                      <div className="text-neon-pink">{reg.player?.losses}L</div>
                      {reg.registration.checkedInAt ? (
                        <div className="text-[10px] text-green-300 bg-green-500/10 border border-green-500/20 rounded-full px-2 py-0.5">حاضر</div>
                      ) : (
                        <div className="text-[10px] text-gray-500 bg-white/5 rounded-full px-2 py-0.5">حضور نزده</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "rules" && (
          <div className="gaming-card p-6">
            <h3 className="text-lg font-bold mb-4 neon-text-blue">
              📜 {t.tournamentDetail.tournamentRules}
            </h3>
            {tournament.rules ? (
              <div className="text-gray-300 whitespace-pre-wrap">{tournament.rules}</div>
            ) : (
              <p className="text-gray-400">{t.tournamentDetail.noRulesSet}</p>
            )}

            <div className="mt-8 border-t border-gaming-border pt-6">
              <h4 className="font-bold mb-3 text-neon-purple">⚖️ {t.tournamentDetail.judgingSystem}</h4>
              <div className="text-gray-300 text-sm space-y-2">
                <p>{t.tournamentDetail.judgingSystemDesc}</p>
                <ul className="list-disc list-inside space-y-1 text-gray-400 ps-2">
                  <li>{t.tournamentDetail.judgingPoint1}</li>
                  <li>{t.tournamentDetail.judgingPoint2}</li>
                  <li>{t.tournamentDetail.judgingPoint3}</li>
                  <li>{t.tournamentDetail.judgingPoint4}</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BracketMatch({
  match,
  getPlayerName,
  onScore,
  onSubmitResult,
  onDispute,
  ownedPlayerId,
  isAdmin,
  t,
}: {
  match: Match;
  getPlayerName: (id: string | null) => string;
  onScore: (matchId: string, p1: number, p2: number) => void;
  onSubmitResult: (matchId: string, p1: number, p2: number, evidenceUrl: string, description: string) => Promise<void>;
  onDispute: (matchId: string, raisedById: string, reason: string) => Promise<void>;
  ownedPlayerId: string | null;
  isAdmin: boolean;
  t: ReturnType<typeof useLanguage>["t"];
}) {
  const [editing, setEditing] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [p1, setP1] = useState(match.player1Score?.toString() || "0");
  const [p2, setP2] = useState(match.player2Score?.toString() || "0");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = Boolean((ownedPlayerId || isAdmin) && match.player1Id && match.player2Id && match.status !== "completed");
  const canDispute = Boolean(ownedPlayerId && match.player1Id && match.player2Id && match.status !== "pending");

  async function submitResult() {
    setSubmitting(true);
    setError("");
    try {
      if (isAdmin) {
        onScore(match.id, parseInt(p1), parseInt(p2));
      } else {
        await onSubmitResult(match.id, parseInt(p1), parseInt(p2), evidenceUrl, description);
      }
      setEditing(false);
      setEvidenceUrl("");
      setDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ثبت نتیجه انجام نشد");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitDispute() {
    if (!ownedPlayerId || !reason.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await onDispute(match.id, ownedPlayerId, reason.trim());
      setDisputing(false);
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ثبت اعتراض انجام نشد");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-72 bg-dark-700 rounded-xl border border-gaming-border overflow-hidden shadow-lg">
      <div className="px-3 py-2 border-b border-gaming-border flex items-center justify-between">
        <span className="text-[10px] text-gray-500">R{match.round} • M{match.matchNumber}</span>
        <span className="text-[10px] text-neon-purple">{match.status}</span>
      </div>
      <div
        className={`flex items-center justify-between px-3 py-2 border-b border-gaming-border ${
          match.winnerId === match.player1Id ? "bg-neon-green/10" : ""
        }`}
      >
        <span
          className={`text-sm truncate flex-1 ${
            match.winnerId === match.player1Id
              ? "text-neon-green font-bold"
              : match.player1Id
              ? "text-gray-200"
              : "text-gray-500"
          }`}
        >
          {getPlayerName(match.player1Id)}
        </span>
        <span className="text-sm font-mono text-gray-400 ms-2">
          {match.player1Score ?? "-"}
        </span>
      </div>

      <div
        className={`flex items-center justify-between px-3 py-2 ${
          match.winnerId === match.player2Id ? "bg-neon-green/10" : ""
        }`}
      >
        <span
          className={`text-sm truncate flex-1 ${
            match.winnerId === match.player2Id
              ? "text-neon-green font-bold"
              : match.player2Id
              ? "text-gray-200"
              : "text-gray-500"
          }`}
        >
          {getPlayerName(match.player2Id)}
        </span>
        <span className="text-sm font-mono text-gray-400 ms-2">
          {match.player2Score ?? "-"}
        </span>
      </div>

      {error && <div className="mx-3 mt-2 bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-[11px] text-red-300 leading-5">{error}</div>}

      {editing && (
        <div className="border-t border-gaming-border p-3 space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              className="w-16 bg-dark-800 text-center text-sm rounded px-1 py-2 text-white border border-gaming-border"
              value={p1}
              onChange={(e) => setP1(e.target.value)}
            />
            <span className="text-gray-500 text-xs">:</span>
            <input
              type="number"
              min="0"
              className="w-16 bg-dark-800 text-center text-sm rounded px-1 py-2 text-white border border-gaming-border"
              value={p2}
              onChange={(e) => setP2(e.target.value)}
            />
          </div>
          {!isAdmin && (
            <>
              {/* Screenshots go through the bot: Telegram stores the file and we
                  keep only its file_id, so the site never accepts an upload or
                  carries the image bytes. */}
              <div className="rounded-xl bg-dark-800 border border-white/5 p-3">
                <label className="block text-[11px] text-gray-400 mb-2">ارسال مدرک نتیجه</label>
                <a
                  href={botDeepLink(`ev_${match.id}`, process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#229ED9] px-3 py-2 text-[11px] font-bold text-white transition hover:bg-[#1c8bc0]"
                >
                  📎 ارسال اسکرین‌شات در تلگرام
                </a>
                <p className="mt-2 text-[10px] leading-4 text-gray-500">
                  ربات باز می‌شود و عکس را همان‌جا بفرست. مدرک داخل تلگرام می‌ماند و فقط داور می‌بیندش.
                </p>
              </div>
              <input
                className="gaming-input text-xs"
                placeholder="یا لینک مستقیم مدرک نتیجه (اختیاری)"
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value)}
              />
              <textarea
                className="gaming-input text-xs min-h-16"
                placeholder="توضیح کوتاه برای داور (اختیاری)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <p className="text-[10px] text-yellow-300 leading-5">نتیجه بازیکن برای داوری ارسال می‌شود و بعد از تأیید داور نهایی خواهد شد.</p>
            </>
          )}
          <div className="flex gap-2">
            <button
              onClick={submitResult}
              disabled={submitting}
              className="flex-1 text-xs bg-neon-green/20 text-neon-green px-2 py-2 rounded-lg hover:bg-neon-green/30 disabled:opacity-50"
            >
              {submitting ? "..." : isAdmin ? "ثبت نهایی" : "ارسال برای داوری"}
            </button>
            <button onClick={() => setEditing(false)} className="px-3 text-xs bg-dark-600 text-gray-300 rounded-lg">لغو</button>
          </div>
        </div>
      )}

      {disputing && (
        <div className="border-t border-gaming-border p-3 space-y-3">
          <textarea
            className="gaming-input text-xs min-h-20"
            placeholder="دلیل اعتراض را دقیق بنویس..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <button onClick={submitDispute} disabled={submitting || !reason.trim()} className="flex-1 text-xs bg-red-500/20 text-red-300 px-2 py-2 rounded-lg disabled:opacity-50">ثبت اعتراض</button>
            <button onClick={() => setDisputing(false)} className="px-3 text-xs bg-dark-600 text-gray-300 rounded-lg">لغو</button>
          </div>
        </div>
      )}

      {!editing && !disputing && (canSubmit || canDispute) && (
        <div className="border-t border-gaming-border p-2 flex gap-2">
          {canSubmit && (
            <button onClick={() => setEditing(true)} className="flex-1 text-xs text-neon-blue hover:underline text-center py-1.5">
              {isAdmin ? t.tournamentDetail.enterScore : "ثبت نتیجه"}
            </button>
          )}
          {canDispute && (
            <button onClick={() => setDisputing(true)} className="flex-1 text-xs text-red-300 hover:underline text-center py-1.5">
              اعتراض
            </button>
          )}
        </div>
      )}
    </div>
  );
}
