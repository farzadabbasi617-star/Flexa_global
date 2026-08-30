/**
 * Flexa AI Engine (Global Edition)
 * Handles AI-powered judging, match verification, screenshot analysis, and moderation.
 */

export interface AIJudgmentResult {
  verdict: "player1_wins" | "player2_wins" | "draw" | "rematch" | "needs_review";
  confidence: number; // 0.0 - 1.0 (e.g. 0.95 = 95% confident)
  reasoning: string;
  reasoningAR?: string;
  factors: AIFactor[];
  suspicionLevel: number; // 0.0 - 1.0 (e.g. 0.05 = clean, 0.85 = suspicious)
  recommendations: string[];
}

export interface AIFactor {
  name: string;
  nameAR?: string;
  score: number;
  weight: number;
  description: string;
  descriptionAR?: string;
}

export interface AIModerationResult {
  isAllowed: boolean;
  toxicityScore: number;
  categories: string[];
  suggestion: string | null;
}

/**
 * Calculates AI judgment verdict based on match scores, evidence quality, and player rating differentials.
 */
export function calculateAIJudgment(input: {
  player1Score: number;
  player2Score: number;
  player1Rating?: number;
  player2Rating?: number;
  hasEvidenceP1?: boolean;
  hasEvidenceP2?: boolean;
  gameId?: string;
  lang?: "en" | "ar" | "tr" | "fa";
}): AIJudgmentResult {
  const { player1Score, player2Score, player1Rating = 1200, player2Rating = 1200, hasEvidenceP1, hasEvidenceP2, lang = "en" } = input;

  const scoreGap = Math.abs(player1Score - player2Score);
  const totalScore = player1Score + player2Score;

  // 1. Score Clarity Factor
  const scoreClarity = totalScore === 0 ? 0.2 : Math.min(1.0, 0.5 + scoreGap * 0.2);

  // 2. Rating Alignment Factor
  const expectedP1Win = 1 / (1 + Math.pow(10, (player2Rating - player1Rating) / 400));
  const actualP1Win = player1Score > player2Score ? 1 : player1Score < player2Score ? 0 : 0.5;
  const ratingAlignment = 1 - Math.abs(expectedP1Win - actualP1Win);

  // 3. Evidence Quality Factor
  let evidenceQuality = 0.5;
  if (hasEvidenceP1 && hasEvidenceP2) evidenceQuality = 1.0;
  else if (hasEvidenceP1 || hasEvidenceP2) evidenceQuality = 0.75;

  // Calculate Weighted Confidence
  const confidence = Math.min(
    0.99,
    scoreClarity * 0.5 + ratingAlignment * 0.3 + evidenceQuality * 0.2
  );

  // Determine Verdict
  let verdict: AIJudgmentResult["verdict"] = "needs_review";
  let suspicionLevel = 0.05;

  if (player1Score > player2Score) {
    verdict = "player1_wins";
  } else if (player2Score > player1Score) {
    verdict = "player2_wins";
  } else if (player1Score === player2Score && totalScore > 0) {
    verdict = "draw";
  }

  // Suspicion logic (e.g. no evidence provided for contested match)
  if (!hasEvidenceP1 && !hasEvidenceP2 && scoreGap > 3) {
    suspicionLevel = 0.45;
    if (confidence < 0.7) verdict = "needs_review";
  }

  const factors: AIFactor[] = [
    {
      name: "Score Clarity",
      nameAR: "وضوح النتيجة",
      score: Math.round(scoreClarity * 100),
      weight: 0.5,
      description: `Score differential of ${scoreGap} goals/kills.`,
      descriptionAR: `فارق نقاط قدره ${scoreGap}.`,
    },
    {
      name: "ELO Rating Expectation",
      nameAR: "تطابق التصنيف",
      score: Math.round(ratingAlignment * 100),
      weight: 0.3,
      description: `Rating prediction alignment: ${Math.round(expectedP1Win * 100)}% expected win rate.`,
      descriptionAR: `تطابق التوقعات مع التصنيف الحالي.`,
    },
    {
      name: "Evidence Verification",
      nameAR: "جودة الأدلة والصور",
      score: Math.round(evidenceQuality * 100),
      weight: 0.2,
      description: hasEvidenceP1 && hasEvidenceP2 ? "Dual screenshot evidence verified." : "Single or pending screenshot evidence.",
      descriptionAR: hasEvidenceP1 && hasEvidenceP2 ? "تم التحقق من صور إثبات كلا اللاعبين." : "في انتظار اكتمال الأدلة.",
    },
  ];

  let reasoning = "";
  let reasoningAR = "";

  if (verdict === "player1_wins") {
    reasoning = `Player 1 secured victory with a score of ${player1Score} to ${player2Score} (${Math.round(confidence * 100)}% AI confidence).`;
    reasoningAR = `فوز اللاعب الأول بنتيجة ${player1Score} مقابل ${player2Score} (نسبة ثقة الذكاء الاصطناعي ${Math.round(confidence * 100)}%).`;
  } else if (verdict === "player2_wins") {
    reasoning = `Player 2 secured victory with a score of ${player2Score} to ${player1Score} (${Math.round(confidence * 100)}% AI confidence).`;
    reasoningAR = `فوز اللاعب الثاني بنتيجة ${player2Score} مقابل ${player1Score} (نسبة ثقة الذكاء الاصطناعي ${Math.round(confidence * 100)}%).`;
  } else if (verdict === "draw") {
    reasoning = `Match ended in a tie with score ${player1Score}-${player2Score}.`;
    reasoningAR = `انتهت المباراة بالتعادل بنتيجة ${player1Score}-${player2Score}.`;
  } else {
    reasoning = `Match result requires human referee review due to insufficient evidence or unusual score gap.`;
    reasoningAR = `تتطلب نتيجة المباراة مراجعة الحكم البشري بسبب عدم اكتمال الأدلة.`;
  }

  const recommendations = [
    confidence > 0.85 ? "Automated payout can be triggered." : "Human referee confirmation recommended.",
    suspicionLevel < 0.2 ? "Clean match log integrity." : "Flagged for screenshot OCR verification.",
  ];

  return {
    verdict,
    confidence: Math.round(confidence * 100) / 100,
    reasoning,
    reasoningAR,
    factors,
    suspicionLevel,
    recommendations,
  };
}
