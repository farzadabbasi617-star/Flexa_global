import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const generator = readFileSync(join(process.cwd(), "src/lib/gaming-news-generator.ts"), "utf8");
const loggerSource = readFileSync(join(process.cwd(), "src/lib/logger.ts"), "utf8");

/**
 * Production logs showed every Call of Duty article failing with
 * "Failed to parse trusted gaming article" and an empty error object.
 *
 * Two independent causes, both verified against the live hosts from a clean
 * machine:
 *   - callofduty.com black-holes a bot-shaped User-Agent. The TLS handshake
 *     completes and the server then never replies, so the request hung until
 *     the 12s abort. The identical URL returns 200 in ~0.11s with a browser UA.
 *   - the reader-proxy fallback was gated to Fortnite, so a Call of Duty
 *     failure had nowhere to go.
 *
 * These assert the source rather than the network, so they stay deterministic
 * and cannot start failing because a publisher had an outage.
 */
describe("article fetch identifies as a browser", () => {
  it("does not announce itself as a bot to publisher sites", () => {
    // "compatible; SomeBot/1.0" is the shape publishers filter on. The Telegram
    // channel scraper keeps its own UA: t.me serves bots happily, and changing
    // it would be an unrelated risk.
    expect(generator).not.toContain("FlexaNews/2.0; +https://www.flexa1.ir");
    // Bound to the direct publisher fetch only. The Telegram scraper lives
    // further down the same function chain and legitimately keeps a bot UA.
    const start = generator.indexOf("async function fetchTrustedArticleDetails");
    const articleFetch = generator.slice(start, generator.indexOf("const parsed = directParsed", start));
    expect(articleFetch).not.toMatch(/User-Agent":\s*"Mozilla\/5\.0 \(compatible;/);
  });

  it("sends a real browser User-Agent for the direct fetch", () => {
    expect(generator).toMatch(/User-Agent":\s*"Mozilla\/5\.0 \(Windows NT 10\.0; Win64; x64\)/);
  });

  it("sends the Accept headers a browser would", () => {
    // A bare `Accept: text/html` alongside a browser UA is an obvious tell.
    expect(generator).toContain("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
    expect(generator).toContain('"Accept-Language": "en-US,en;q=0.9"');
  });

  it("keeps the abort timeout so a hung host cannot stall the run", () => {
    expect(generator).toMatch(/controller\.abort\(\), 12_000/);
  });
});

describe("reader-proxy fallback", () => {
  it("is available to every trusted source, not only Fortnite", () => {
    // The old guard `item.game !== "fortnite"` meant a Call of Duty timeout
    // returned null instead of retrying through the proxy.
    expect(generator).not.toContain('item.game !== "fortnite" || !isTrustedNewsUrl');
    expect(generator).toContain("if (!isTrustedNewsUrl(item.link, item.game)) return null;");
  });

  it("still refuses a URL outside the per-game allowlist", () => {
    // The proxy must never become a way to launder an untrusted source.
    const fn = generator.slice(
      generator.indexOf("async function fetchTrustedReaderCopy"),
      generator.indexOf("async function fetchTrustedArticleDetails"),
    );
    expect(fn).toContain("isTrustedNewsUrl");
    expect(fn).toContain("r.jina.ai");
  });

  it("bounds the proxy request too", () => {
    const fn = generator.slice(
      generator.indexOf("async function fetchTrustedReaderCopy"),
      generator.indexOf("async function fetchTrustedArticleDetails"),
    );
    expect(fn).toMatch(/AbortSignal\.timeout\(\d+_?\d*\)/);
  });
});

describe("errors are readable in production logs", () => {
  it("registers pino serializers", () => {
    // Without these a bare Error logs as {} because message and stack are
    // non-enumerable, which is why the original reports named the failing URL
    // but not the failure.
    expect(loggerSource).toContain("serializers");
    expect(loggerSource).toContain("pino.stdSerializers.err");
  });

  it("covers the `error` key this codebase actually uses", () => {
    // pino only serializes `err` by default; almost every call site here logs
    // `error`, so both have to be mapped.
    expect(loggerSource).toMatch(/error:\s*pino\.stdSerializers\.err/);
    expect(loggerSource).toMatch(/err:\s*pino\.stdSerializers\.err/);
  });
});
