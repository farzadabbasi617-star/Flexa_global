export const GAMES = {
  clash_royale: {
    id: "clash_royale",
    name: "Clash Royale",
    icon: "⚔️",
    color: "#00d4ff",
    bgGradient: "from-blue-600 to-cyan-500",
    description: "Real-time strategy card battles",
  },
  cod_mobile: {
    id: "cod_mobile",
    name: "Call of Duty Mobile",
    icon: "🎯",
    color: "#ff6b00",
    bgGradient: "from-orange-600 to-red-500",
    description: "Intense FPS combat",
  },
  fortnite: {
    id: "fortnite",
    name: "Fortnite",
    icon: "🏗️",
    color: "#a855f7",
    bgGradient: "from-purple-600 to-pink-500",
    description: "Battle Royale & Building",
  },
} as const;

export type GameType = keyof typeof GAMES;

export const TOURNAMENT_FORMATS = {
  single_elimination: { name: "Single Elimination", icon: "🏆" },
  double_elimination: { name: "Double Elimination", icon: "🔄" },
  round_robin: { name: "Round Robin", icon: "🔁" },
} as const;

export const MATCH_STATUSES = {
  pending: { label: "Pending", color: "text-gray-400", bg: "bg-gray-700" },
  in_progress: { label: "In Progress", color: "text-neon-yellow", bg: "bg-yellow-900/30" },
  awaiting_judgment: { label: "Awaiting Judgment", color: "text-neon-orange", bg: "bg-orange-900/30" },
  completed: { label: "Completed", color: "text-neon-green", bg: "bg-green-900/30" },
  disputed: { label: "Disputed", color: "text-neon-pink", bg: "bg-red-900/30" },
} as const;

export const TOURNAMENT_STATUSES = {
  registration: { label: "Registration Open", color: "text-neon-blue", bg: "bg-blue-900/30" },
  in_progress: { label: "In Progress", color: "text-neon-green", bg: "bg-green-900/30" },
  completed: { label: "Completed", color: "text-gray-400", bg: "bg-gray-700" },
  cancelled: { label: "Cancelled", color: "text-neon-pink", bg: "bg-red-900/30" },
} as const;
