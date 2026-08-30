import { describe, expect, it } from "vitest";
import {
  getRequestContext,
  getRequestId,
  resolveRequestId,
  runWithRequestContext,
  setRequestUser,
} from "./request-context";

describe("resolveRequestId", () => {
  it("reuses a well-formed inbound id so a trace survives a proxy hop", () => {
    expect(resolveRequestId("abc-123_XYZ.9")).toBe("abc-123_XYZ.9");
  });

  it("mints an id when none is supplied", () => {
    const id = resolveRequestId(undefined);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  // The value is echoed into a response header and written to logs, so a
  // caller must not be able to inject newlines or unbounded junk through it.
  it("rejects an id containing header-breaking characters", () => {
    const id = resolveRequestId("bad\r\nX-Injected: 1");
    expect(id).not.toContain("\n");
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects an over-long id", () => {
    const id = resolveRequestId("a".repeat(200));
    expect(id).toHaveLength(36);
  });

  it("rejects a too-short id", () => {
    expect(resolveRequestId("abc")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("ignores whitespace-only input", () => {
    expect(resolveRequestId("   ")).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("request context propagation", () => {
  it("is empty outside a request", () => {
    expect(getRequestContext()).toBeUndefined();
    expect(getRequestId()).toBeUndefined();
  });

  it("exposes the id inside the context", () => {
    runWithRequestContext({ requestId: "req-1" }, () => {
      expect(getRequestId()).toBe("req-1");
    });
  });

  // The whole point: an id set before an await must still be readable after it,
  // otherwise logs from the slow part of a request lose their correlation.
  it("survives await boundaries", async () => {
    await runWithRequestContext({ requestId: "req-async" }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(getRequestId()).toBe("req-async");
    });
  });

  it("keeps concurrent requests isolated", async () => {
    const seen: string[] = [];
    await Promise.all([
      runWithRequestContext({ requestId: "req-a" }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        seen.push(getRequestId()!);
      }),
      runWithRequestContext({ requestId: "req-b" }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        seen.push(getRequestId()!);
      }),
    ]);
    expect(seen.sort()).toEqual(["req-a", "req-b"]);
  });

  it("attaches a user id once auth resolves", () => {
    runWithRequestContext({ requestId: "req-2" }, () => {
      setRequestUser("user-9");
      expect(getRequestContext()?.userId).toBe("user-9");
    });
  });

  it("ignores an empty user id", () => {
    runWithRequestContext({ requestId: "req-3" }, () => {
      setRequestUser(null);
      expect(getRequestContext()?.userId).toBeUndefined();
    });
  });

  it("does not leak a user id between requests", () => {
    runWithRequestContext({ requestId: "req-4" }, () => setRequestUser("user-1"));
    runWithRequestContext({ requestId: "req-5" }, () => {
      expect(getRequestContext()?.userId).toBeUndefined();
    });
  });
});
