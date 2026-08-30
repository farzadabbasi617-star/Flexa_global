import { describe, expect, it } from "vitest";
import { positiveInteger, safePagination } from "@/lib/pagination";

describe("safe pagination", () => {
  it("falls back for invalid and negative values", () => {
    expect(positiveInteger("abc", 10)).toBe(10);
    expect(positiveInteger("-2", 10)).toBe(10);
    expect(safePagination({ page: "abc", limit: "-1" })).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  it("caps excessive limits", () => {
    expect(safePagination({ page: "2", limit: "999999", maxLimit: 100 }))
      .toEqual({ page: 2, limit: 100, offset: 100 });
  });
});
