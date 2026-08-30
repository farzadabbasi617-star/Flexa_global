/**
 * Flexa AI Engine
 * Handles AI-powered judging, moderation, and assistance
 */

import { detectPersianProfanity } from "./persian-moderation";

// Types
export interface AIJudgmentResult {
  verdict: "player1_wins" | "player2_wins" | "draw" | "rematch" | "needs_review";
  confidence: number;
  reasoning: string;
  factors: AIFactor[];
  suspicionLevel: number;
  recommendations: string[];
}

export interface AIFactor {
  name: string;
  nameFA: string;
  score: number;
  weight: number;
  description: string;
}

export interface AIModerationResult {
  isAllowed: boolean;
  toxicityScore: number;
  categories: string[];
  suggestion: string | null;
}

export interface AIAnalytics {
  playerPerformance: number;
  predictedWinRate: number;
  skillTier: string;
  recommendations: string[];
}

// AI Configuration
const AI_CONFIG = {
  /*
   * Weights for the CONFIDENCE score (how sure we are the verdict is correct).
   * Every factor here must genuinely increase certainty about the result:
   *  - scoreClarity:    a bigger score gap => the winner is clearer.
   *  - ratingAlignment: the result matching ELO expectation => more believable.
   *  - evidenceQuality: submitted evidence => more trustworthy.
   * (Match "closeness" and player win-rate similarity describe how *exciting*
   *  or *balanced* a match is — not how *certain* the outcome is — so they are
   *  reported as informational factors but excluded from the confidence sum.)
   */
  judgingWeights: {
    scoreClarity: 0.5,
    ratingAlignment: 0.3,
    evidenceQuality: 0.2,
  },
  moderationThresholds: {
    toxicity: 0.7,
    spam: 0.8,
    harassment: 0.6,
  },
  suspicionThresholds: {
    low: 0.3,
    medium: 0.6,
    high: 0.8,
  },
};

// Toxic words detection (basic list - in production use ML model)
const TOXIC_PATTERNS = [
  /fuck|shit|damn|ass|bitch/i,
  /idiot|stupid|dumb|loser/i,
  /kill\s*yourself|kys/i,
];

// Talking about cheats can be legitimate in a gaming-support context, so this
// is a low-severity signal rather than profanity by itself.
const CHEATING_REFERENCE_PATTERNS = [/hack|cheat|exploit/i];

const SPAM_PATTERNS = [
  /(.)\1{5,}/i, // Repeated characters
  /^(.+?)\1{3,}$/i, // Repeated phrases
  /(https?:\/\/[^\s]+){3,}/i, // Multiple links
];

/**
 * AI Judging System
 * Analyzes match data and provides verdict
 */
export async function analyzeMatchWithAI(player1Score: number, player2Score: number, player1Rating: number, player2Rating: number, player1History: { wins: number; losses: number }, player2History: { wins: number; losses: number }, hasEvidence: boolean = false): Promise<AIJudgmentResult> {
  const prompt = `Analyze this match result and provide a verdict:\n    Game: Mobile Gaming Tournament\n    Player 1: Score ${player1Score}, Rating ${player1Rating}, History ${player1History.wins}W/${player1History.losses}L\n    Player 2: Score ${player2Score}, Rating ${player2Rating}, History ${player2History.wins}W/${player2History.losses}L\n    Evidence Provided: ${hasEvidence ? "Yes" : "No"}\n\n    Please return a JSON object with:\n    {\n      "verdict": "player1_wins" | "player2_wins" | "draw" | "rematch" | "needs_review",\n      "confidence": number (0-100),\n      "reasoning": "Detailed explanation in Persian",\n      "suspicionLevel": number (0-100),\n      "recommendations": ["string"]\n    }`;

  const systemPrompt = `You are the Flexa AI Head Judge. Your task is to analyze match scores and player data to ensure fair play.\n    Look for:\n    - Anomalies: High scores with low ratings.\n    - Consistency: Does the result match the players skill levels?\n    - Evidence: How much does the presence (or absence) of evidence affect certainty?\n    Respond ONLY with valid JSON.`;

  const response = await askOpenRouter(prompt, systemPrompt);

  if (!response) {
    return analyzeMatch(player1Score, player2Score, player1Rating, player2Rating, player1History, player2History, hasEvidence);
  }

  try {
    const jsonStr = response.includes("```json") 
      ? response.split("```json")[1].split("```")[0].trim()
      : response.trim();
    
    const parsed = JSON.parse(jsonStr);
    
    return {
      ...parsed,
      factors: analyzeMatch(player1Score, player2Score, player1Rating, player2Rating, player1History, player2History, hasEvidence).factors
    };
  } catch (e) {
    return analyzeMatch(player1Score, player2Score, player1Rating, player2Rating, player1History, player2History, hasEvidence);
  }
}

/**
 * AI Judging System (Static Logic)
 * Analyzes match data and provides verdict
 */
export function analyzeMatch(
  player1Score: number,
  player2Score: number,
  player1Rating: number,
  player2Rating: number,
  player1History: { wins: number; losses: number },
  player2History: { wins: number; losses: number },
  hasEvidence: boolean = false
): AIJudgmentResult {
  const factors: AIFactor[] = [];
  let confidenceScore = 0; // weighted sum of certainty factors (0..1)

  const scoreDiff = player1Score - player2Score;
  const absDiff = Math.abs(scoreDiff);

  // 1. Score Clarity — a larger gap makes the winner clearer (more certain).
  const scoreClarity = Math.min(absDiff / 10, 1);
  factors.push({
    name: "Score Clarity",
    nameFA: "وضوح نتیجه",
    score: scoreClarity * 100,
    weight: AI_CONFIG.judgingWeights.scoreClarity,
    description:
      scoreDiff === 0
        ? "Scores are tied"
        : `Player ${scoreDiff > 0 ? "1" : "2"} leads by ${absDiff} points`,
  });
  confidenceScore += scoreClarity * AI_CONFIG.judgingWeights.scoreClarity;

  // 2. Rating Alignment — does the result match ELO expectation?
  const ratingDiff = player1Rating - player2Rating;
  const expectedOutcome = 1 / (1 + Math.pow(10, -ratingDiff / 400)); // ELO formula
  const actualOutcome = scoreDiff > 0 ? 1 : scoreDiff < 0 ? 0 : 0.5;
  const ratingAlignment = 1 - Math.abs(expectedOutcome - actualOutcome);

  factors.push({
    name: "Rating Alignment",
    nameFA: "تطابق رتبه‌بندی",
    score: ratingAlignment * 100,
    weight: AI_CONFIG.judgingWeights.ratingAlignment,
    description: `Result ${ratingAlignment > 0.5 ? "aligns" : "differs"} from expected based on ratings`,
  });
  confidenceScore += ratingAlignment * AI_CONFIG.judgingWeights.ratingAlignment;

  // 3. Evidence Quality — submitted evidence makes the result more trustworthy.
  const evidenceScore = hasEvidence ? 1 : 0.5;
  factors.push({
    name: "Evidence Quality",
    nameFA: "کیفیت مدارک",
    score: evidenceScore * 100,
    weight: AI_CONFIG.judgingWeights.evidenceQuality,
    description: hasEvidence ? "Evidence submitted" : "No evidence provided",
  });
  confidenceScore += evidenceScore * AI_CONFIG.judgingWeights.evidenceQuality;

  // --- Informational factors (NOT part of confidence) ---

  // Match closeness: how balanced/exciting the game was (weight 0 = info only).
  const matchBalance = 1 - Math.min(absDiff / 20, 1);
  factors.push({
    name: "Match Closeness",
    nameFA: "نزدیکی نتیجه",
    score: matchBalance * 100,
    weight: 0,
    description: matchBalance > 0.5 ? "Close match" : "One-sided match",
  });

  // Player history similarity (info only).
  const p1WinRate = player1History.wins / (player1History.wins + player1History.losses || 1);
  const p2WinRate = player2History.wins / (player2History.wins + player2History.losses || 1);
  const historyGap = Math.abs(p1WinRate - p2WinRate);
  factors.push({
    name: "History Similarity",
    nameFA: "شباهت سابقه",
    score: (1 - historyGap) * 100,
    weight: 0,
    description: `Players have ${historyGap < 0.3 ? "similar" : "different"} performance history`,
  });

  // Calculate suspicion level — flags results that look manipulated.
  let suspicionLevel = 0;
  if (absDiff > 15) suspicionLevel += 0.2; // Unusually high score diff
  if (ratingAlignment < 0.3) suspicionLevel += 0.3; // Result doesn't match ratings
  if (!hasEvidence && absDiff > 10) suspicionLevel += 0.2;
  suspicionLevel = Math.min(suspicionLevel, 1);

  // Confidence: weighted certainty (0..100).
  const confidence = Math.round(confidenceScore * 100);

  // Determine verdict
  let verdict: AIJudgmentResult["verdict"];
  let reasoning: string;
  const recommendations: string[] = [];

  if (suspicionLevel > AI_CONFIG.suspicionThresholds.high) {
    verdict = "needs_review";
    reasoning = "High suspicion detected. Match requires human review.";
    recommendations.push("Request video evidence from both players");
    recommendations.push("Check for previous disputes involving these players");
  } else if (scoreDiff === 0) {
    // A tie is a clear, decidable outcome — handle it before the ambiguity check.
    verdict = "draw";
    reasoning = "Scores are equal. Match ends in a draw.";
    if (!hasEvidence) recommendations.push("Ask both players to confirm the tie");
  } else if (absDiff === 1 && !hasEvidence && suspicionLevel >= AI_CONFIG.suspicionThresholds.medium) {
    // Only call for a rematch when the result is genuinely ambiguous: a razor-thin
    // margin, no evidence, AND some suspicion — not merely a low numeric score.
    verdict = "rematch";
    reasoning = "Razor-thin result with no evidence and some irregularities. Recommend rematch for fairness.";
    recommendations.push("Schedule rematch with stricter monitoring");
    recommendations.push("Ask both players to submit screenshots");
  } else if (scoreDiff > 0) {
    verdict = "player1_wins";
    reasoning = `Player 1 wins with score ${player1Score}-${player2Score}. `;
    if (ratingAlignment > 0.7) {
      reasoning += "Result aligns with player ratings.";
    } else {
      reasoning += "This is an upset based on rating difference.";
      recommendations.push("Consider rating adjustment");
    }
  } else {
    verdict = "player2_wins";
    reasoning = `Player 2 wins with score ${player2Score}-${player1Score}. `;
    if (ratingAlignment > 0.7) {
      reasoning += "Result aligns with player ratings.";
    } else {
      reasoning += "This is an upset based on rating difference.";
      recommendations.push("Consider rating adjustment");
    }
  }

  return {
    verdict,
    confidence,
    reasoning,
    factors,
    suspicionLevel: Math.round(suspicionLevel * 100),
    recommendations,
  };
}

/**
 * AI Moderation System
 * Checks messages for toxicity and spam
 */
export function moderateMessage(message: string): AIModerationResult {
  const categories: string[] = [];
  let toxicityScore = 0;

  // Check Persian first. The detector normalizes Arabic/Persian variants and
  // zero-width characters, and uses exact tokens to keep false positives low.
  const persianProfanity = detectPersianProfanity(message);
  if (persianProfanity.detected) {
    toxicityScore += 0.75;
    categories.push("toxic_language");
    categories.push("persian_profanity");
  }

  // Check for toxic English content. Do not add the same category twice when
  // a bilingual message contains both Persian and English profanity.
  for (const pattern of TOXIC_PATTERNS) {
    if (pattern.test(message)) {
      toxicityScore += 0.75;
      if (!categories.includes("toxic_language")) categories.push("toxic_language");
      break;
    }
  }

  for (const pattern of CHEATING_REFERENCE_PATTERNS) {
    if (pattern.test(message)) {
      toxicityScore += 0.1;
      categories.push("cheating_reference");
      break;
    }
  }

  // Check for spam
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(message)) {
      toxicityScore += 0.2;
      categories.push("spam");
      break;
    }
  }

  // Check message length
  if (message.length > 500) {
    toxicityScore += 0.1;
    categories.push("excessive_length");
  }

  // Check for all caps (shouting)
  if (message === message.toUpperCase() && message.length > 10) {
    toxicityScore += 0.1;
    categories.push("shouting");
  }

  toxicityScore = Math.min(toxicityScore, 1);

  const isAllowed = toxicityScore < AI_CONFIG.moderationThresholds.toxicity;
  
  let suggestion: string | null = null;
  if (!isAllowed) {
    if (categories.includes("toxic_language")) {
      suggestion = "Please keep the conversation respectful.";
    } else if (categories.includes("spam")) {
      suggestion = "Please avoid sending repetitive messages.";
    } else {
      suggestion = "Message flagged for review.";
    }
  }

  return {
    isAllowed,
    toxicityScore: Math.round(toxicityScore * 100),
    categories,
    suggestion,
  };
}

/**
 * AI Player Analytics
 * Analyzes player performance and provides insights
 */
export function analyzePlayer(
  rating: number,
  wins: number,
  losses: number,
  recentMatches: Array<{ won: boolean; scoreDiff: number }>
): AIAnalytics {
  const totalMatches = wins + losses;
  const winRate = totalMatches > 0 ? wins / totalMatches : 0;

  // Calculate performance score
  let performanceScore = 0;
  performanceScore += (rating / 2000) * 30; // Rating contribution (max 30)
  performanceScore += winRate * 40; // Win rate contribution (max 40)
  
  // Recent form (last 5 matches)
  const recentWins = recentMatches.filter(m => m.won).length;
  performanceScore += (recentWins / Math.max(recentMatches.length, 1)) * 30;

  // Predict win rate based on trends
  const predictedWinRate = Math.min(winRate + (recentWins > 3 ? 0.1 : -0.05), 1);

  // Determine skill tier
  let skillTier: string;
  if (rating >= 1600) skillTier = "Legend";
  else if (rating >= 1400) skillTier = "Diamond";
  else if (rating >= 1200) skillTier = "Platinum";
  else if (rating >= 1000) skillTier = "Gold";
  else if (rating >= 800) skillTier = "Silver";
  else skillTier = "Bronze";

  // Generate recommendations
  const recommendations: string[] = [];
  
  if (winRate < 0.4) {
    recommendations.push("Practice more in casual matches before entering tournaments");
  }
  if (recentWins < 2 && recentMatches.length >= 5) {
    recommendations.push("Consider taking a break - you may be on tilt");
  }
  if (rating > 1400 && winRate > 0.6) {
    recommendations.push("You're ready for higher-stakes tournaments!");
  }
  if (totalMatches < 10) {
    recommendations.push("Play more matches to establish your true rating");
  }

  return {
    playerPerformance: Math.round(performanceScore),
    predictedWinRate: Math.round(predictedWinRate * 100),
    skillTier,
    recommendations,
  };
}

import { askOpenRouter } from './openrouter';

/**
 * Real AI Chat Assistant Response using OpenRouter
 */
export async function generateRealAssistantResponse(
  query: string,
  context: { lang: "en" | "fa"; userName?: string }
): Promise<{ response: string; suggestions: string[] }> {
  const isFA = context.lang === "fa";
  const name = context.userName || (isFA ? "کاربر" : "User");
  
  const systemPrompt = isFA 
    ? `شما "Flexa" (Flexa) هستید، یک دستیار هوشمند برای پلتفرم برگزاری تورنمنت بازی‌های موبایل (کلش رویال، کالاف دیوتی موبایل و فورتنایت). 
       نام کاربر: ${name}.
       وظیفه شما راهنمایی کاربران در مورد قوانین، نحوه ثبت‌نام، جوایز و سیستم داوری است.
       پاسخ‌ها را صمیمی، کوتاه و به زبان فارسی بنویسید.`
    : `You are "Flexa", an AI assistant for a mobile gaming tournament platform (Clash Royale, COD Mobile, Fortnite).
       User name: ${name}.
       Your job is to guide users about rules, registration, prizes, and judging.
       Keep responses friendly, brief, and in English.`;

  const response = await askOpenRouter(query, systemPrompt);

  if (!response) {
    // Fallback to the static version if OpenRouter fails
    return generateAssistantResponse(query, context);
  }

  // Generate some dynamic suggestions based on the response or query
  const suggestions = isFA 
    ? ["قوانین تورنومنت", "نحوه ثبت امتیاز", "تورنومنت‌های فعال"]
    : ["Tournament Rules", "How to report score", "Active Tournaments"];

  return {
    response,
    suggestions
  };
}

/**
 * AI Chat Assistant Responses (Static Fallback)
 */
export function generateAssistantResponse(
  query: string,
  context: { lang: "en" | "fa"; userName?: string }
): { response: string; suggestions: string[] } {
  const q = query.toLowerCase();
  const isFA = context.lang === "fa";
  const name = context.userName || (isFA ? "کاربر" : "User");

  // Tournament related
  if (q.includes("tournament") || q.includes("تورنومنت") || q.includes("مسابق")) {
    return {
      response: isFA
        ? `سلام ${name}! 🎮 برای شرکت در تورنومنت:\n1. به صفحه تورنومنت‌ها برو\n2. یه تورنومنت انتخاب کن\n3. روی ثبت‌نام کلیک کن\n\nمطمئن شو آیدی بازی‌ها رو در پروفایلت وارد کردی!`
        : `Hi ${name}! 🎮 To join a tournament:\n1. Go to Tournaments page\n2. Select a tournament\n3. Click Register\n\nMake sure you've added your game IDs in your profile!`,
      suggestions: isFA
        ? ["چطور جایزه بگیرم؟", "قوانین تورنومنت", "چطور براکت کار میکنه؟"]
        : ["How to claim prizes?", "Tournament rules", "How do brackets work?"],
    };
  }

  // Prize related
  if (q.includes("prize") || q.includes("جایزه") || q.includes("reward")) {
    return {
      response: isFA
        ? `🏆 برای دریافت جایزه:\n1. باید آیدی بازی‌ها رو در پروفایلت وارد کرده باشی\n2. بعد از برنده شدن، جایزه به آیدی بازیت ارسال میشه\n3. معمولاً ۲۴-۴۸ ساعت طول میکشه`
        : `🏆 To receive prizes:\n1. Make sure your game IDs are set in your profile\n2. After winning, prizes are sent to your game account\n3. Usually takes 24-48 hours`,
      suggestions: isFA
        ? ["چطور آیدی بازی وارد کنم؟", "تورنومنت‌های فعال", "تاریخچه جوایز"]
        : ["How to add game ID?", "Active tournaments", "Prize history"],
    };
  }

  // Game ID related
  if (q.includes("game id") || q.includes("آیدی") || q.includes("uid") || q.includes("tag")) {
    return {
      response: isFA
        ? `📝 برای وارد کردن آیدی بازی‌ها:\n1. برو به پروفایل > ویرایش پروفایل\n2. آیدی و نام کاربری هر بازی رو وارد کن\n3. ذخیره کن\n\n⚔️ کلش رویال: تگ بازیکن (مثل #ABC123)\n🎯 کالاف موبایل: UID عددی\n🏗️ فورتنایت: آیدی Epic Games`
        : `📝 To add game IDs:\n1. Go to Profile > Edit Profile\n2. Enter your ID and username for each game\n3. Save\n\n⚔️ Clash Royale: Player Tag (like #ABC123)\n🎯 COD Mobile: Numeric UID\n🏗️ Fortnite: Epic Games ID`,
      suggestions: isFA
        ? ["چطور تگ کلش رویال پیدا کنم؟", "UID کالاف کجاست؟", "آیدی فورتنایت"]
        : ["How to find CR tag?", "Where is COD UID?", "Fortnite ID help"],
    };
  }

  // Judging related
  if (q.includes("judge") || q.includes("داوری") || q.includes("dispute") || q.includes("اعتراض")) {
    return {
      response: isFA
        ? `⚖️ سیستم داوری Flexa:\n\n🤖 **داوری AI**: نتایج رو تحلیل میکنه و رأی میده\n👨‍⚖️ **داوری انسانی**: داور نتیجه نهایی رو تأیید میکنه\n\nاگه با نتیجه مخالفی، میتونی اعتراض ثبت کنی و مدارک (اسکرین‌شات) ارسال کنی.`
        : `⚖️ Flexa Judging System:\n\n🤖 **AI Judging**: Analyzes results and provides verdict\n👨‍⚖️ **Human Judging**: Judge confirms final result\n\nIf you disagree, you can file a dispute with evidence (screenshots).`,
      suggestions: isFA
        ? ["چطور اعتراض کنم؟", "مدارک چی باید باشه؟", "زمان بررسی اعتراض"]
        : ["How to dispute?", "What evidence needed?", "Dispute review time"],
    };
  }

  // Help / General
  return {
    response: isFA
      ? `سلام ${name}! 👋 من دستیار هوشمند Flexa هستم.\n\nمیتونم کمکت کنم در مورد:\n🏆 تورنومنت‌ها\n💰 جوایز\n🎮 آیدی بازی‌ها\n⚖️ داوری\n\nسوالت رو بپرس!`
      : `Hi ${name}! 👋 I'm the Flexa AI Assistant.\n\nI can help you with:\n🏆 Tournaments\n💰 Prizes\n🎮 Game IDs\n⚖️ Judging\n\nAsk me anything!`,
    suggestions: isFA
      ? ["چطور تورنومنت بسازم؟", "قوانین سایت", "تماس با پشتیبانی"]
      : ["How to create tournament?", "Site rules", "Contact support"],
  };
}
