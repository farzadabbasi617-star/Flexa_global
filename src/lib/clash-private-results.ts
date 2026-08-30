import { db } from "@/db";
import { sql } from "drizzle-orm";
import { fetchAIResponse } from "@/lib/ai-provider-manager";
import { validateParsedLeaderboardRows } from "@/lib/clash-private-results-policy";

export { validateParsedLeaderboardRows } from "@/lib/clash-private-results-policy";

let schemaPromise: Promise<void> | null = null;

async function createSchema(client: any) {
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS tournament_leaderboard_submissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id uuid NOT NULL REFERENCES tournaments(id),
    submitted_by_id uuid REFERENCES users(id),
    image_url text NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'pending',
    parsed_data jsonb,
    ai_provider varchar(50),
    error text,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  );`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS tournament_leaderboard_submissions_tournament_idx ON tournament_leaderboard_submissions(tournament_id);`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS tournament_leaderboard_submissions_status_idx ON tournament_leaderboard_submissions(status);`));

  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS private_tournament_standings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id uuid NOT NULL REFERENCES tournaments(id),
    submission_id uuid REFERENCES tournament_leaderboard_submissions(id),
    rank integer NOT NULL,
    player_id uuid REFERENCES players(id),
    user_id uuid REFERENCES users(id),
    player_tag varchar(32),
    player_name varchar(100) NOT NULL,
    score integer,
    verified boolean NOT NULL DEFAULT false,
    source varchar(30) NOT NULL DEFAULT 'leaderboard_ocr',
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    CONSTRAINT private_tournament_standings_tournament_rank_unique UNIQUE(tournament_id, rank)
  );`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS private_tournament_standings_tournament_player_idx ON private_tournament_standings(tournament_id, player_id);`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS private_tournament_standings_user_idx ON private_tournament_standings(user_id);`));
}

export function ensureClashPrivateResultsSchema(client: any = db) {
  if (client !== db) return createSchema(client);
  if (!schemaPromise) {
    schemaPromise = createSchema(client).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

function extractJson(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = (fenced || content).trim();
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("LEADERBOARD_OCR_INVALID_JSON");
  return JSON.parse(source.slice(start, end + 1));
}

export async function parseClashPrivateLeaderboardImage(imageUrl: string, maxPlayers = 200) {
  const prompt = `این تصویر Leaderboard یک مسابقه خصوصی Clash Royale است.
تمام ردیف‌های قابل مشاهده را دقیق استخراج کن. متن فارسی/انگلیسی نام بازیکن را همان‌طور که دیده می‌شود نگه دار.
اگر Player Tag در تصویر نیست null بگذار. امتیاز یا Score را فقط اگر واضح است عدد بده.
فقط JSON معتبر با این ساختار برگردان:
{"rows":[{"rank":1,"playerName":"name","playerTag":null,"score":123}]}
هیچ توضیح دیگری ننویس و چیزی را حدس نزن.`;
  const system = "You are a strict OCR parser for Clash Royale private tournament leaderboard screenshots. Never invent missing rows, names, tags, scores, or ranks. Return JSON only.";
  const result = await fetchAIResponse(prompt, system, imageUrl);
  if (!result?.content) throw new Error("LEADERBOARD_OCR_UNAVAILABLE");
  const parsed = extractJson(result.content);
  const rows = validateParsedLeaderboardRows(parsed, maxPlayers);
  if (!rows.length) throw new Error("LEADERBOARD_OCR_NO_ROWS");
  return { rows, provider: result.provider, model: result.model || null };
}
