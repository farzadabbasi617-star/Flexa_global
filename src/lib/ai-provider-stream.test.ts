import { describe, expect, it } from "vitest";
import { parseOpenAITextStream } from "@/lib/ai-provider-manager";

function streamFromChunks(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("OpenAI-compatible text stream parser", () => {
  it("joins text deltas even when network chunks split an SSE line", async () => {
    const body = streamFromChunks([
      'data: {"choices":[{"delta":{"content":"سلام "}}]}\n',
      'data: {"choices":[{"delta":{"con',
      'tent":"قهرمان"}}]}\n',
      "data: [DONE]\n",
    ]);

    let output = "";
    for await (const delta of parseOpenAITextStream(body)) output += delta;

    expect(output).toBe("سلام قهرمان");
  });

  it("ignores keep-alives and malformed non-content events", async () => {
    const body = streamFromChunks([
      ": keep-alive\n",
      "data: not-json\n",
      'data: {"choices":[{"delta":{}}]}\n',
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n',
    ]);

    const chunks: string[] = [];
    for await (const delta of parseOpenAITextStream(body)) chunks.push(delta);
    expect(chunks).toEqual(["ok"]);
  });
});
