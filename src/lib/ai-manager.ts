import { fetchAIResponse } from './ai-provider-manager';
import { flexaSystemPrompt } from './ai-prompts';
import { db } from '@/db';
import { aiProposals } from '@/db/schema';
import { safeParseAIJson } from './ai-utils';

export const AIManager = {
  async proposeMatchResult(matchId: string, resultData: any) {
    const prompt = `Review match ${matchId}. Scores: ${JSON.stringify(resultData)}.`;
    const res = await fetchAIResponse(prompt, flexaSystemPrompt("manager", "Propose action in valid JSON only."));
    if (res) {
      const suggestion = safeParseAIJson<{ action: string, confidence: number, reasoning: string }>(res.content);
      if (suggestion) {
        await db.insert(aiProposals).values({
          type: 'match_result',
          targetId: matchId,
          suggestedAction: suggestion.action,
          confidence: suggestion.confidence,
          reasoning: suggestion.reasoning
        });
      }
    }
  }
};
