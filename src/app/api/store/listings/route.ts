import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { storeListings, users } from "@/db/schema";
import { and, asc, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { StoreListingCreateSchema } from "@/lib/validations";
import { canUserSell } from "@/lib/store-service";
import { parseTomanToRial } from "@/lib/money";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";
import { safePagination } from "@/lib/pagination";

export const dynamic = "force-dynamic";

function cleanText(value: unknown, max = 500) {
  return String(value || "").trim().slice(0, max);
}
function cleanInt(value: unknown, min = 0, max = 1_000_000) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}
function cleanBool(value: unknown) {
  return value === true || value === "true" || value === "yes" || value === "1";
}
function normalizeListingMetadata(kind: string, game: string | null | undefined, raw: unknown) {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  if (kind !== "account") return input;
  if (game !== "cod_mobile") return input;
  const codm = input.codm && typeof input.codm === "object" && !Array.isArray(input.codm) ? input.codm as Record<string, unknown> : input;
  const normalized = {
    schema: "codm-account-v1",
    level: cleanInt(codm.level, 1, 1000),
    uid: cleanText(codm.uid, 100),
    region: ["global", "garena"].includes(String(codm.region)) ? String(codm.region) : "global",
    platform: cleanText(codm.platform, 80),
    loginMethod: cleanText(codm.loginMethod, 120),
    activisionOnly: cleanBool(codm.activisionOnly),
    fullAccess: cleanBool(codm.fullAccess),
    emailChangeable: cleanBool(codm.emailChangeable),
    firstOwner: cleanBool(codm.firstOwner),
    cpBalance: cleanInt(codm.cpBalance, 0, 100_000_000),
    mythicWeapons: cleanInt(codm.mythicWeapons, 0, 1000),
    maxedMythicWeapons: cleanInt(codm.maxedMythicWeapons, 0, 1000),
    legendaryWeapons: cleanInt(codm.legendaryWeapons, 0, 5000),
    epicWeapons: cleanInt(codm.epicWeapons, 0, 10000),
    mythicCharacters: cleanInt(codm.mythicCharacters, 0, 1000),
    legendaryCharacters: cleanInt(codm.legendaryCharacters, 0, 5000),
    epicCharacters: cleanInt(codm.epicCharacters, 0, 10000),
    diamondCamos: cleanInt(codm.diamondCamos, 0, 10000),
    damascusUnlocked: cleanBool(codm.damascusUnlocked),
    battlePass: cleanText(codm.battlePass, 200),
    rankMp: cleanText(codm.rankMp, 80),
    rankBr: cleanText(codm.rankBr, 80),
    notableWeapons: cleanText(codm.notableWeapons, 1200),
    notableCharacters: cleanText(codm.notableCharacters, 1200),
    rareItems: cleanText(codm.rareItems, 1200),
    screenshotsIncluded: cleanText(codm.screenshotsIncluded, 500),
  };
  return { ...input, codm: normalized };
}

// GET: public catalogue of active listings, with optional filters.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const kind = searchParams.get("kind");
    const currencyKind = searchParams.get("currencyKind"); // gem | cp | uc | vbucks | ...
    const game = searchParams.get("game");
    const source = searchParams.get("source"); // official | user
    const q = (searchParams.get("q") || "").trim().slice(0, 80);
    const sort = searchParams.get("sort") || "newest"; // newest | cheapest | expensive | bestselling
    const minToman = Number(searchParams.get("minToman") || "");
    const maxToman = Number(searchParams.get("maxToman") || "");
    const { page, limit: pageSize, offset } = safePagination({
      page: searchParams.get("page"),
      limit: searchParams.get("pageSize"),
      defaultLimit: 24,
      maxLimit: 48,
    });

    const conditions = [eq(storeListings.status, "active")];
    if (kind) conditions.push(eq(storeListings.kind, kind as never));
    if (currencyKind) {
      // Currency-kind filter implies currency items.
      conditions.push(eq(storeListings.kind, "currency"));
      conditions.push(eq(storeListings.currencyKind, currencyKind));
    }
    if (game) conditions.push(eq(storeListings.game, game as never));
    if (source === "official" || source === "user") {
      conditions.push(eq(storeListings.source, source));
    }
    if (q) {
      conditions.push(ilike(storeListings.title, `%${q}%`));
    }
    // Price range filter (Toman -> Rial).
    if (Number.isFinite(minToman) && minToman > 0) {
      conditions.push(gte(storeListings.priceRial, String(BigInt(Math.floor(minToman)) * BigInt(10))));
    }
    if (Number.isFinite(maxToman) && maxToman > 0) {
      conditions.push(lte(storeListings.priceRial, String(BigInt(Math.floor(maxToman)) * BigInt(10))));
    }

    // CODM account-specific filters (query the codm JSONB metadata).
    const minLevel = Number(searchParams.get("minLevel") || "");
    const minMythic = Number(searchParams.get("minMythic") || "");
    const minLegendary = Number(searchParams.get("minLegendary") || "");
    const platform = (searchParams.get("platform") || "").trim();
    const region = (searchParams.get("region") || "").trim();
    if (Number.isFinite(minLevel) && minLevel > 0) {
      conditions.push(sql`((${storeListings.metadata} -> 'codm' ->> 'level')::int) >= ${minLevel}`);
    }
    if (Number.isFinite(minMythic) && minMythic > 0) {
      conditions.push(sql`((${storeListings.metadata} -> 'codm' ->> 'mythicWeapons')::int) >= ${minMythic}`);
    }
    if (Number.isFinite(minLegendary) && minLegendary > 0) {
      conditions.push(sql`((${storeListings.metadata} -> 'codm' ->> 'legendaryWeapons')::int) >= ${minLegendary}`);
    }
    if (platform) {
      conditions.push(sql`(lower(${storeListings.metadata} -> 'codm' ->> 'platform')) LIKE ${`%${platform.toLowerCase()}%`}`);
    }
    if (region) {
      conditions.push(sql`(lower(${storeListings.metadata} -> 'codm' ->> 'region')) = ${region.toLowerCase()}`);
    }

    const orderBy =
      sort === "cheapest"
        ? asc(storeListings.priceRial)
        : sort === "expensive"
          ? desc(storeListings.priceRial)
          : sort === "bestselling"
            ? desc(storeListings.soldCount)
            : desc(storeListings.createdAt);

    const rows = await db
      .select({
        id: storeListings.id,
        source: storeListings.source,
        kind: storeListings.kind,
        game: storeListings.game,
        title: storeListings.title,
        description: storeListings.description,
        priceRial: storeListings.priceRial,
        currencyKind: storeListings.currencyKind,
        currencyAmount: storeListings.currencyAmount,
        stock: storeListings.stock,
        soldCount: storeListings.soldCount,
        warrantyDays: storeListings.warrantyDays,
        images: storeListings.images,
        metadata: storeListings.metadata,
        createdAt: storeListings.createdAt,
        sellerId: storeListings.sellerId,
        sellerName: users.displayName,
      })
      .from(storeListings)
      .leftJoin(users, eq(users.id, storeListings.sellerId))
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(pageSize)
      .offset(offset);

    // Never leak protected delivery notes on the public list.
    const items = rows.map((r) => ({
      ...r,
      priceToman: Number(BigInt(r.priceRial) / BigInt(10)),
    }));

    return NextResponse.json({ items, page, pageSize });
  } catch (err) {
    logger.error({ err }, "Store listings GET error");
    return NextResponse.json({ error: "خطا در دریافت محصولات" }, { status: 500 });
  }
}

// POST: a KYC-verified user creates a marketplace listing (goes to review).
export async function POST(request: NextRequest) {
  try {
    const { user, error, status } = await requireUser(request);
    if (!user) return NextResponse.json({ error }, { status });

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limit = await rateLimit(`store:listing:create:${user.id}:${ip}`, 20, 60 * 60 * 1000);
    if (!limit.success) {
      return NextResponse.json({ error: "تعداد آگهی‌های ثبت‌شده زیاد است." }, { status: 429 });
    }

    if (!(await canUserSell(user.id))) {
      return NextResponse.json(
        { error: "برای فروش باید ابتدا احراز هویت شما تأیید شود.", needKyc: true },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = StoreListingCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "اطلاعات نامعتبر" }, { status: 400 });
    }
    const d = parsed.data;
    const normalizedMetadata = normalizeListingMetadata(d.kind, d.game, d.metadata);
    const codmMeta = normalizedMetadata && typeof normalizedMetadata === "object" && "codm" in normalizedMetadata ? (normalizedMetadata as { codm?: Record<string, unknown> }).codm : null;
    if (d.kind === "account" && d.game === "cod_mobile") {
      if (!codmMeta || Number(codmMeta.level || 0) < 1) return NextResponse.json({ error: "برای اکانت کالاف، لول اکانت الزامی است" }, { status: 400 });
      if (!String(codmMeta.loginMethod || "").trim()) return NextResponse.json({ error: "برای اکانت کالاف، روش ورود/اتصال اکانت را مشخص کنید" }, { status: 400 });
      if (!String(codmMeta.platform || "").trim()) return NextResponse.json({ error: "برای اکانت کالاف، پلتفرم قابل تحویل را مشخص کنید" }, { status: 400 });
      if ((d.images || []).length < 3) return NextResponse.json({ error: "برای اکانت کالاف حداقل ۳ تصویر لازم است: پروفایل/لول، گان‌ها، کاراکترها یا لینک‌شده‌ها" }, { status: 400 });
      if (!String(d.deliveryNotes || "").trim() || String(d.deliveryNotes || "").trim().length < 20) {
        return NextResponse.json({ error: "برای اکانت کالاف، اطلاعات تحویل محرمانه را کامل‌تر وارد کنید" }, { status: 400 });
      }
    }
    const priceRial = parseTomanToRial(String(d.priceToman));
    if (priceRial <= BigInt(0)) {
      return NextResponse.json({ error: "قیمت نامعتبر است" }, { status: 400 });
    }

    const [created] = await db
      .insert(storeListings)
      .values({
        source: "user",
        sellerId: user.id,
        kind: d.kind,
        game: d.game ?? null,
        title: d.title,
        description: d.description ?? null,
        priceRial: priceRial.toString(),
        currencyKind: d.currencyKind ?? null,
        currencyAmount: d.currencyAmount ?? null,
        stock: d.stock,
        images: d.images,
        deliveryNotes: d.deliveryNotes ?? null,
        warrantyDays: d.warrantyDays ?? 0,
        metadata: normalizedMetadata,
        status: "pending_review",
      })
      .returning({ id: storeListings.id, status: storeListings.status });

    return NextResponse.json({ listing: created }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "Store listing POST error");
    return NextResponse.json({ error: "خطا در ثبت آگهی" }, { status: 500 });
  }
}
