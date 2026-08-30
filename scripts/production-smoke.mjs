#!/usr/bin/env node

/**
 * Non-destructive production launch checks.
 *
 * This script intentionally uses only public/unauthenticated requests. It never
 * creates users, sends OTPs, changes money, joins tournaments, or writes data.
 */

const baseUrl = new URL(process.env.PRODUCTION_BASE_URL || "https://www.gament1.ir");
const expectedRelease = (process.env.EXPECTED_RELEASE || "").trim().toLowerCase();
const attempts = positiveInteger(process.env.PRODUCTION_SMOKE_ATTEMPTS, 1);
const delayMs = positiveInteger(process.env.PRODUCTION_SMOKE_DELAY_MS, 30_000);
const timeoutMs = positiveInteger(process.env.PRODUCTION_SMOKE_TIMEOUT_MS, 20_000);
// /api/health only returns the detailed integration payload to an authorised
// caller; without this the deep assertions below cannot see those fields.
const healthSecret = (process.env.HEALTH_SECRET || "").trim();
const requestNonce = Date.now().toString(36);

if (baseUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(baseUrl.hostname)) {
  throw new Error("PRODUCTION_BASE_URL must use HTTPS (localhost is the only exception).");
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function endpoint(path) {
  return new URL(path, baseUrl);
}

async function request(path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("accept", headers.get("accept") || "application/json, text/html;q=0.9, */*;q=0.8");
  headers.set("cache-control", "no-cache");
  headers.set("pragma", "no-cache");
  headers.set("user-agent", "Gament-Production-Smoke/1.0");

  return fetch(endpoint(path), {
    ...init,
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function expectStatus(path, allowedStatuses = [200], init = {}) {
  const response = await request(path, init);
  assert(
    allowedStatuses.includes(response.status),
    `${path}: expected HTTP ${allowedStatuses.join("/")}, received ${response.status}`,
  );
  return response;
}

async function expectJson(path, allowedStatuses = [200], init = {}) {
  const response = await expectStatus(path, allowedStatuses, init);
  const contentType = response.headers.get("content-type") || "";
  assert(contentType.includes("application/json"), `${path}: expected JSON, received ${contentType || "unknown"}`);
  return { response, body: await response.json() };
}

function assertNoKeys(value, forbiddenKeys, location = "response") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoKeys(item, forbiddenKeys, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    assert(!forbiddenKeys.has(key), `${location}: private key "${key}" is publicly exposed`);
    assertNoKeys(child, forbiddenKeys, `${location}.${key}`);
  }
}

async function checkPages() {
  const pages = [
    "/",
    "/login",
    "/register",
    "/forgot-password",
    "/tournaments",
    "/store",
    "/leaderboard",
    "/honors",
    "/support",
    "/profile",
    "/wallet",
    "/robots.txt",
    "/sitemap.xml",
    "/manifest.json",
    "/sw.js",
  ];

  await Promise.all(pages.map(async (path) => {
    const separator = path.includes("?") ? "&" : "?";
    const response = await expectStatus(`${path}${separator}smoke=${requestNonce}`);
    const contentType = response.headers.get("content-type") || "";
    assert(contentType.length > 0, `${path}: missing Content-Type header`);
  }));
}

async function checkSecurityHeaders() {
  const response = await expectStatus(`/?smoke_headers=${requestNonce}`);
  const required = [
    ["strict-transport-security", /max-age=31536000/i],
    // Enforcing header, not Report-Only. Also assert unsafe-eval is absent,
    // so a future change cannot quietly reintroduce it in production.
    ["content-security-policy", /default-src 'self'/i],
    ["x-content-type-options", /^nosniff$/i],
    ["x-frame-options", /^(sameorigin|deny)$/i],
    ["referrer-policy", /strict-origin/i],
    ["permissions-policy", /camera=\(\)/i],
  ];

  for (const [name, pattern] of required) {
    const value = response.headers.get(name) || "";
    assert(pattern.test(value), `/: missing or invalid ${name} header`);
  }

  // A Report-Only header allows every violation, so shipping one alongside the
  // enforcing header would silently undo the policy.
  assert(
    !response.headers.get("content-security-policy-report-only"),
    "/: CSP is served as Report-Only, which enforces nothing"
  );

  const csp = response.headers.get("content-security-policy") || "";
  assert(!/unsafe-eval/i.test(csp), "/: CSP allows unsafe-eval in production");
}

async function checkHealthAndRelease() {
  const { body: health } = await expectJson(`/api/health?smoke=${requestNonce}`, [200], {
    headers: healthSecret ? { "x-health-secret": healthSecret } : {},
  });
  assert(health?.ok === true, "/api/health: application is not healthy");
  assert(health?.database === true, "/api/health: database is not ready");

  // Without the secret the endpoint intentionally omits integration detail, so
  // asserting on it would fail for the wrong reason. Say so loudly instead.
  if (!healthSecret) {
    console.warn("[production-smoke] HEALTH_SECRET not set - skipping integration assertions");
  } else {
    assert(health?.email?.configured === true, "/api/health: transactional email is not configured");
    assert(health?.clashRoyaleApi?.configured === true, "/api/health: Clash Royale API is not configured");
    assert(health?.telegramCron?.protected === true, "/api/health: Telegram cron is not protected by a secret");

    // The gateway takes real money, and nothing else notices when it stops:
    // deposits just start refusing. render.yaml used to pin ZARINPAL_LIVE to
    // 'false' while the dashboard had it 'true', so a blueprint sync could
    // disable payments with no failing check anywhere. Assert it out loud.
    assert(
      health?.paymentGateway?.configured === true,
      "/api/health: payment gateway is not configured (check ZARINPAL_MERCHANT_ID and PAYMENT_CALLBACK_BASE_URL)",
    );
    assert(
      health?.paymentGateway?.live === true,
      "/api/health: payment gateway is NOT live - deposits are being refused (check ZARINPAL_LIVE)",
    );
    assert(
      health?.paymentGateway?.sandbox === false,
      "/api/health: payment gateway is in sandbox mode in production",
    );
  }

  if (expectedRelease) {
    const liveRelease = String(health?.release || "").toLowerCase();
    assert(liveRelease !== "" && liveRelease !== "unknown", "/api/health: release metadata is unavailable");
    assert(
      expectedRelease.startsWith(liveRelease) || liveRelease.startsWith(expectedRelease.slice(0, liveRelease.length)),
      `/api/health: expected release ${expectedRelease.slice(0, 12)}, live release is ${liveRelease}`,
    );
  }

  const { body: telegram } = await expectJson(`/api/telegram/webhook?smoke=${requestNonce}`);
  assert(telegram?.ok === true, "Telegram webhook health failed");
  assert(telegram?.reliabilityReady === true, "Telegram reliability schema is not ready");
  assert(telegram?.clash1v1Ready === true, "Clash Royale 1V1 schema is not ready");
}

async function checkPublicPrivacyAndPagination() {
  const privatePlayerKeys = new Set([
    "email",
    "visibleUserId",
    "ownerId",
    "gameId",
    "clashRoyaleId",
    "codMobileId",
    "fortniteId",
  ]);
  const { body: players } = await expectJson(`/api/players?limit=5&smoke=${requestNonce}`);
  assert(Array.isArray(players?.data), "/api/players: data must be an array");
  assertNoKeys(players.data, privatePlayerKeys, "players.data");

  const { body: cappedPlayers } = await expectJson(`/api/players?page=-5&limit=100000&smoke=${requestNonce}`);
  assert(cappedPlayers?.pagination?.page === 1, "/api/players: invalid page was not normalized");
  assert(cappedPlayers?.pagination?.limit === 100, "/api/players: excessive limit was not capped at 100");

  const privateTournamentListKeys = new Set(["roomId", "roomPassword", "lobbyNotes", "createdById"]);
  const { body: tournaments } = await expectJson(`/api/tournaments?limit=5&smoke=${requestNonce}`);
  assert(Array.isArray(tournaments?.data), "/api/tournaments: data must be an array");
  assertNoKeys(tournaments.data, privateTournamentListKeys, "tournaments.data");

  const { body: cappedTournaments } = await expectJson(`/api/tournaments?page=-2&limit=100000&smoke=${requestNonce}`);
  assert(cappedTournaments?.pagination?.page === 1, "/api/tournaments: invalid page was not normalized");
  assert(cappedTournaments?.pagination?.limit === 100, "/api/tournaments: excessive limit was not capped at 100");

  const firstTournamentId = tournaments.data[0]?.id;
  if (firstTournamentId) {
    assert(/^[0-9a-f-]{36}$/i.test(firstTournamentId), "/api/tournaments: invalid tournament id in list");
    const { body: detail } = await expectJson(`/api/tournaments/${firstTournamentId}?smoke=${requestNonce}`);
    assert(detail?.roomId == null, "tournament detail: Room ID exposed to an anonymous viewer");
    assert(detail?.roomPassword == null, "tournament detail: room password exposed to an anonymous viewer");
    assert(detail?.lobbyNotes == null, "tournament detail: lobby notes exposed to an anonymous viewer");
    assert(!Object.hasOwn(detail, "createdById"), "tournament detail: creator UUID exposed publicly");
    assertNoKeys(
      { registrations: detail?.registrations, matches: detail?.matches },
      new Set(["ownerId", "visibleUserId", "evidence", "evidenceUrls"]),
      "tournament.detail",
    );
  }

  const { body: store } = await expectJson(`/api/store/listings?page=abc&pageSize=999999&smoke=${requestNonce}`);
  assert(store?.page === 1, "/api/store/listings: invalid page was not normalized");
  assert(store?.pageSize === 48, "/api/store/listings: excessive page size was not capped at 48");
}

async function checkAuthenticationBoundaries() {
  await expectJson(`/api/debug/images?smoke=${requestNonce}`, [401]);
  await expectJson(`/api/wallet/balance?smoke=${requestNonce}`, [401]);
  await expectJson(`/api/admin/users?smoke=${requestNonce}`, [401, 404]);
  await expectJson(`/api/telegram/cron?smoke=${requestNonce}`, [401, 503]);
}

async function checkOptimizedAssets() {
  const assets = [
    ["/icons/icon-teams.png", 700_000],
    ["/icons/icon-judging.png", 700_000],
    ["/avatars/avatar_1.jpg", 250_000],
    ["/avatars/avatar_2.jpg", 250_000],
    ["/avatars/avatar_3.jpg", 250_000],
    ["/avatars/avatar_4.jpg", 250_000],
    ["/guides/clash-friend-link-step-1.jpg", 200_000],
    ["/guides/clash-friend-link-step-2.jpg", 200_000],
  ];

  await Promise.all(assets.map(async ([path, maxBytes]) => {
    const response = await expectStatus(`${path}?smoke=${requestNonce}`);
    const contentType = response.headers.get("content-type") || "";
    assert(contentType.startsWith("image/"), `${path}: expected an image, received ${contentType || "unknown"}`);
    const bytes = (await response.arrayBuffer()).byteLength;
    assert(bytes > 0 && bytes <= maxBytes, `${path}: unexpected asset size ${bytes} bytes (max ${maxBytes})`);
  }));
}

async function run() {
  const checks = [
    ["health/release", checkHealthAndRelease],
    ["security headers", checkSecurityHeaders],
    ["privacy/pagination", checkPublicPrivacyAndPagination],
    ["authentication boundaries", checkAuthenticationBoundaries],
    ["optimized assets", checkOptimizedAssets],
    ["public pages", checkPages],
  ];
  const results = await Promise.allSettled(checks.map(([, check]) => check()));
  const failures = results.flatMap((result, index) => result.status === "rejected"
    ? [`${checks[index][0]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`]
    : []);
  if (failures.length > 0) throw new Error(failures.join(" | "));
}

let lastError;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    console.log(`[production-smoke] attempt ${attempt}/${attempts}: ${baseUrl.origin}`);
    await run();
    console.log("[production-smoke] PASS — public launch checks completed without destructive actions.");
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.error(`[production-smoke] attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`);
    if (attempt < attempts) await sleep(delayMs);
  }
}

console.error("[production-smoke] FAIL — production is not ready for public launch.");
throw lastError;
