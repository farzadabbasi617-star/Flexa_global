import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * API error responses must not describe the database.
 *
 * `/api/honors/auto-news` used to return the raw exception message plus the
 * PostgreSQL error code and constraint detail:
 *
 *   { error, details: err.message, dbCode: err.code, dbDetail: err.detail }
 *
 * Those name tables, columns and constraints. They belong in server logs, not
 * in a payload. The endpoint sits behind a shared secret today, so nothing
 * leaked publicly — but one routing change would have made it public, and the
 * pattern is easy to copy into a route that is.
 */

const API_DIR = path.join(process.cwd(), "src", "app", "api");

function routeFiles(dir: string): string[] {
  const { readdirSync } = require("node:fs") as typeof import("node:fs");
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...routeFiles(full));
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

/** Strip comments so documentation about the rule is not mistaken for the rule. */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("API error responses", () => {
  it("never returns PostgreSQL error codes or constraint details", () => {
    const offenders = routeFiles(API_DIR).filter((file) => /\b(dbCode|dbDetail)\b/.test(code(file)));

    expect(
      offenders.map((f) => path.relative(process.cwd(), f)),
      "database internals must stay in logs, not responses"
    ).toEqual([]);
  });

  it("does not put a raw exception message in a `details` field", () => {
    const offenders = routeFiles(API_DIR).filter((file) =>
      /details:\s*(err|error)\??\.(message|stack|detail)/.test(code(file))
    );

    expect(offenders.map((f) => path.relative(process.cwd(), f))).toEqual([]);
  });

  it("never returns a stack trace", () => {
    const offenders = routeFiles(API_DIR).filter((file) =>
      /(?:^|[^.\w])stack:\s*(err|error)\??\.stack/m.test(
        code(file).replace(/logger\.[a-z]+\(\{[\s\S]*?\},/g, "")
      )
    );

    expect(offenders.map((f) => path.relative(process.cwd(), f))).toEqual([]);
  });
});

describe("expensive AI endpoints", () => {
  it("rate limits every route that performs a live AI completion", () => {
    // A live completion costs money on OpenRouter/Groq. Any route calling
    // fetchAIResponse must be throttled, or an open admin tab / retry loop
    // bills on every hit.
    const offenders = routeFiles(API_DIR).filter((file) => {
      const source = code(file);
      return source.includes("fetchAIResponse(") && !source.includes("rateLimit(");
    });

    expect(
      offenders.map((f) => path.relative(process.cwd(), f)),
      "these call an AI provider without a rate limit"
    ).toEqual([]);
  });

  it("rate limits routes that let automation insert reviewable rows", () => {
    const suggest = path.join(API_DIR, "ai", "honors", "suggest", "route.ts");
    expect(code(suggest)).toContain("rateLimit(");
  });
});
