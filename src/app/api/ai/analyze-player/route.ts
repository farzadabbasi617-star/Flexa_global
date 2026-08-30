import { NextRequest, NextResponse } from "next/server";
import { analyzePlayer } from "@/lib/ai-engine";
import { db } from "@/db";
import { players, matches } from "@/db/schema";
import { eq, or, desc } from "drizzle-orm";
import { AIAnalyzePlayerSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import { aiCache } from "@/lib/ai-cache";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";


export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    
    // 1. Rate Limiting (Tight limit for AI)
    const rateLimitResult = await rateLimit(ip, 5, 60 * 1000); 
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: "Too many AI requests. Please try again later." }, { status: 429 });
    }

    const playerIdParam = request.nextUrl.searchParams.get("playerId");
    
    // 2. Zod Validation
    const validation = AIAnalyzePlayerSchema.safeParse({ playerId: playerIdParam });
    if (!validation.success) {
      return NextResponse.json({ error: "Invalid Player ID" }, { status: 400 });
    }

    const playerId = validation.data.playerId;

    // 3. Caching
    const cacheKey = `analyze_player_${playerId}`;
    const cachedAnalysis = aiCache.get(cacheKey);
    if (cachedAnalysis) {
      return NextResponse.json({ 
        player: { id: playerId }, 
        analysis: cachedAnalysis, 
        cached: true 
      });
    }

    const [player] = await db
      .select()
      .from(players)
      .where(eq(players.id, playerId));

    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const recentMatches = await db
      .select()
      .from(matches)
      .where(
        or(
          eq(matches.player1Id, playerId),
          eq(matches.player2Id, playerId)
        )
      )
      .orderBy(desc(matches.createdAt))
      .limit(10);

    const formattedMatches = recentMatches
      .filter(m => m.winnerId)
      .map(m => ({
        won: m.winnerId === playerId,
        scoreDiff: m.player1Id === playerId
          ? (m.player1Score || 0) - (m.player2Score || 0)
          : (m.player2Score || 0) - (m.player1Score || 0),
      }));

    const analysis = analyzePlayer(
      player.rating,
      player.wins,
      player.losses,
      formattedMatches
    );

    // Save to cache (1 hour TTL)
    aiCache.set(cacheKey, analysis, 3600);

    return NextResponse.json({
      player: {
        id: player.id,
        displayName: player.displayName,
        rating: player.rating,
        wins: player.wins,
        losses: player.losses,
      },
      analysis,
      cached: false
    });
  } catch (err) {
    logger.error({ err }, 'AI Player Analysis failed');
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
