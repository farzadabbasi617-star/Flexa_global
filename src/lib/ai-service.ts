import { fetchAIResponse, fetchAIResponseStream } from "./ai-provider-manager";
import { analyzeMatch, generateAssistantResponse, AIJudgmentResult } from "./ai-engine";
import { safeParseAIJson } from "./ai-utils";
import { flexaSystemPrompt } from "./ai-prompts";

export interface AssistantAIResponse {
  response: string;
  suggestions: string[];
  provider: "openrouter" | "groq" | "huggingface" | "cache" | "local";
  cachedProvider?: "openrouter" | "groq" | "huggingface";
}

/**
 * Real AI Chat Assistant Response using Multi-Provider Auto-Switch
 */
export async function generateRealAssistantResponse(
  query: string,
  context: { lang: "en" | "fa"; userName?: string }
): Promise<AssistantAIResponse> {
  const isFA = context.lang === "fa";
  const name = context.userName || (isFA ? "کاربر" : "User");

  const systemPrompt = flexaSystemPrompt(
    "assistant",
    isFA
      ? `نام کاربر: ${name}. فقط فارسی پاسخ بده. پاسخ کوتاه، کاربردی و صمیمی باشد.`
      : `User name: ${name}. The user explicitly wants English; answer briefly in English while following Flexa safety rules.`
  );

  const aiResult = await fetchAIResponse(query, systemPrompt);

  const suggestions = isFA
    ? ["قوانین تورنومنت", "نحوه ثبت امتیاز", "تورنومنت‌های فعال"]
    : ["Tournament Rules", "How to report score", "Active Tournaments"];

  if (!aiResult) {
    const fallback = generateAssistantResponse(query, context);
    return {
      response: fallback.response,
      suggestions: fallback.suggestions,
      provider: "local",
    };
  }

  return {
    response: aiResult.content,
    suggestions,
    provider: aiResult.provider,
    cachedProvider: aiResult.cachedProvider,
  };
}

export interface AssistantAIStreamResponse {
  textStream: AsyncIterable<string>;
  provider: AssistantAIResponse["provider"];
  cachedProvider?: AssistantAIResponse["cachedProvider"];
}

/** Open a token stream for Telegram's animated AI message drafts. */
export async function streamRealAssistantResponse(
  query: string,
  context: { lang: "en" | "fa"; userName?: string }
): Promise<AssistantAIStreamResponse | null> {
  const isFA = context.lang === "fa";
  const name = context.userName || (isFA ? "کاربر" : "User");
  const systemPrompt = flexaSystemPrompt(
    "assistant",
    isFA
      ? `نام کاربر: ${name}. فقط فارسی پاسخ بده. پاسخ کوتاه، کاربردی و صمیمی باشد. از HTML و Markdown استفاده نکن.`
      : `User name: ${name}. Answer briefly in English. Do not use HTML or Markdown.`
  );

  const result = await fetchAIResponseStream(query, systemPrompt);
  if (!result) return null;

  return {
    textStream: result.textStream,
    provider: result.provider,
    cachedProvider: result.cachedProvider,
  };
}

/**
 * Real AI Judging System using Multi-Provider Auto-Switch.
 * Supports image screenshot analysis (multimodal) if evidenceUrl is provided!
 */
export async function analyzeMatchWithAI(
  player1Score: number,
  player2Score: number,
  player1Rating: number,
  player2Rating: number,
  player1History: { wins: number; losses: number },
  player2History: { wins: number; losses: number },
  hasEvidence: boolean = false,
  evidenceUrl?: string | null
): Promise<AIJudgmentResult> {
  let prompt = `Analyze this match result and provide a verdict:
    Game: Mobile Gaming Tournament
    Player 1: Score ${player1Score}, Rating ${player1Rating}, History ${player1History.wins}W/${player1History.losses}L
    Player 2: Score ${player2Score}, Rating ${player2Rating}, History ${player2History.wins}W/${player2History.losses}L
    Evidence Provided: ${hasEvidence ? "Yes" : "No"}`;

  if (evidenceUrl) {
    prompt += `\n    An attached end-game screenshot has been provided. 
    PLEASE inspect the image carefully:
    1. Extract the scores and the winner's name/tag from the screenshot.
    2. Verify if the screenshot matches the submitted Flexa scores (P1: ${player1Score} vs P2: ${player2Score}).
    3. If there is a mismatch, a fake/invalid screenshot, or a dispute, flag it by increasing 'suspicionLevel' and setting verdict to 'needs_review'.`;
  }

  prompt += `\n\n    Return ONLY a JSON object:
    {
      "verdict": "player1_wins" | "player2_wins" | "draw" | "rematch" | "needs_review",
      "confidence": number,
      "reasoning": "Explanation in Persian analyzing the match stats and verifying the details seen in the screenshot image",
      "suspicionLevel": number,
      "recommendations": ["string"]
    }`;

  const systemPrompt = flexaSystemPrompt(
    "judging",
    "Respond ONLY with valid JSON matching the requested schema. No markdown. No extra text."
  );

  const aiResult = await fetchAIResponse(prompt, systemPrompt, evidenceUrl || undefined);

  if (!aiResult) {
    return analyzeMatch(player1Score, player2Score, player1Rating, player2Rating, player1History, player2History, hasEvidence);
  }

  const parsed = safeParseAIJson<AIJudgmentResult>(aiResult.content);

  if (!parsed) {
    return analyzeMatch(player1Score, player2Score, player1Rating, player2Rating, player1History, player2History, hasEvidence);
  }

  return {
    ...parsed,
    factors: analyzeMatch(player1Score, player2Score, player1Rating, player2Rating, player1History, player2History, hasEvidence).factors,
  };
}
