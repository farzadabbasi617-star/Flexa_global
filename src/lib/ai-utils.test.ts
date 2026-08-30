import { describe, expect, it } from "vitest";
import { safeParseAIJson } from "./ai-utils";

/**
 * The Hall of Fame news pipeline logged rejectionDetail="unparseable_json" on
 * every run: the parser only understood a ```json fence and handed anything
 * else straight to JSON.parse. These cover the shapes providers actually
 * return.
 */

type News = { reject?: boolean; title: string; description: string; game?: string };

describe("safeParseAIJson", () => {
  it("parses a bare JSON object", () => {
    expect(safeParseAIJson<News>('{"title":"سلام","description":"متن"}')).toEqual({
      title: "سلام",
      description: "متن",
    });
  });

  it("parses a ```json fenced block", () => {
    const text = '```json\n{"title":"عنوان","description":"متن کامل"}\n```';
    expect(safeParseAIJson<News>(text)?.title).toBe("عنوان");
  });

  it("parses a plain ``` fence with no language tag", () => {
    const text = '```\n{"title":"عنوان","description":"متن"}\n```';
    expect(safeParseAIJson<News>(text)?.title).toBe("عنوان");
  });

  it("ignores prose before and after the JSON", () => {
    const text = 'Here is the JSON you requested:\n{"title":"عنوان","description":"متن"}\nLet me know if you need changes.';
    expect(safeParseAIJson<News>(text)?.description).toBe("متن");
  });

  it("tolerates a trailing comma", () => {
    expect(safeParseAIJson<News>('{"title":"a","description":"b",}')?.title).toBe("a");
  });

  it("tolerates smart quotes copied from prose", () => {
    expect(safeParseAIJson<News>('{\u201Ctitle\u201D:"a","description":"b"}')?.title).toBe("a");
  });

  it("handles raw newlines inside a multi-paragraph description", () => {
    // Models write Persian articles with real line breaks, which is invalid
    // JSON but trivially repairable.
    const text = '{"title":"عنوان","description":"پاراگراف اول\nپاراگراف دوم"}';
    const parsed = safeParseAIJson<News>(text);
    expect(parsed?.description).toContain("پاراگراف اول");
    expect(parsed?.description).toContain("پاراگراف دوم");
  });

  it("does not truncate at a brace inside a string value", () => {
    const parsed = safeParseAIJson<News>('{"title":"a {b} c","description":"d"}');
    expect(parsed?.title).toBe("a {b} c");
  });

  it("does not truncate at an escaped quote inside a string value", () => {
    const parsed = safeParseAIJson<News>('{"title":"say \\"hi\\"","description":"d"}');
    expect(parsed?.title).toBe('say "hi"');
  });

  it("parses arrays too", () => {
    expect(safeParseAIJson<number[]>("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("preserves reject:true so refusals are still honoured", () => {
    const parsed = safeParseAIJson<News>('Sure.\n```json\n{"reject":true,"title":"","description":""}\n```');
    expect(parsed?.reject).toBe(true);
  });

  it("returns null for genuinely unusable input", () => {
    expect(safeParseAIJson("")).toBeNull();
    expect(safeParseAIJson("I cannot help with that request.")).toBeNull();
  });
});
