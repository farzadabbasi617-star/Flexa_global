import logger from "./logger";

/**
 * Extract the first balanced JSON object or array from arbitrary text.
 *
 * Scans character by character while tracking string state and escapes, so a
 * brace inside a quoted value (very common in Persian prose containing `{` or
 * quotes) does not end the object early.
 */
function extractBalancedJson(text: string): string | null {
  for (let start = 0; start < text.length; start += 1) {
    const opener = text[start];
    if (opener !== "{" && opener !== "[") continue;
    const closer = opener === "{" ? "}" : "]";

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1) {
      const char = text[index];

      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        if (inString) escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (char === opener) depth += 1;
      else if (char === closer) {
        depth -= 1;
        if (depth === 0) return text.slice(start, index + 1);
      }
    }
  }
  return null;
}

/**
 * Repair the small set of malformations models actually emit.
 * Deliberately conservative — nothing here rewrites string contents.
 */
function repairCommonJsonFlaws(input: string): string {
  return input
    // Smart quotes around keys/values (models copy these from prose).
    .replace(/[\u201C\u201D]/g, '"')
    // Trailing commas before a closing brace/bracket.
    .replace(/,(\s*[}\]])/g, "$1")
    // Literal newlines inside quoted strings are invalid JSON; models emit
    // them constantly when writing multi-paragraph Persian descriptions.
    .replace(/"(?:[^"\\]|\\.)*"/g, (match) => match.replace(/\n/g, "\\n").replace(/\r/g, ""));
}

/**
 * Parse JSON out of an AI response.
 *
 * Providers rarely return a bare JSON document. They wrap it in ```json or
 * plain ``` fences, prefix it with a sentence ("Here is the JSON:"), append a
 * closing remark, or emit multi-line strings. The previous implementation only
 * handled the ```json case and passed everything else straight to JSON.parse,
 * which is why the Hall of Fame news pipeline logged `unparseable_json` on
 * every run despite the model returning usable content.
 */
export function safeParseAIJson<T>(text: string): T | null {
  if (!text) return null;

  const attempts: string[] = [];
  const trimmed = text.trim();

  // 1. Fenced block, with or without a language tag.
  const fenced = trimmed.match(/```(?:json|JSON)?\s*([\s\S]*?)\s*```/);
  if (fenced?.[1]) attempts.push(fenced[1].trim());

  // 2. The whole response.
  attempts.push(trimmed);

  // 3. First balanced object/array anywhere in the text.
  const balanced = extractBalancedJson(trimmed);
  if (balanced) attempts.push(balanced);

  // 4. Same candidates again, with conservative repairs applied.
  for (const candidate of [...attempts]) {
    const repaired = repairCommonJsonFlaws(candidate);
    if (repaired !== candidate) attempts.push(repaired);
  }

  for (const candidate of attempts) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try the next strategy.
    }
  }

  logger.error(
    { preview: trimmed.slice(0, 400), length: trimmed.length },
    "Failed to parse AI response as JSON"
  );
  return null;
}
