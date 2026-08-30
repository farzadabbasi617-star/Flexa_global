import { afterEach, describe, expect, it } from "vitest";
import { runtimeSchemaDdlEnabled } from "./runtime-schema-guard";

const originalEnv = { ...process.env };

// NODE_ENV is typed read-only; assign through the record to keep tsc happy.
function setNodeEnv(value: string) {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("runtimeSchemaDdlEnabled", () => {
  it("is disabled in production by default", () => {
    // The important case: a live wallet-bearing deploy must not run ALTER
    // TABLE from inside a payment request handler.
    setNodeEnv("production");
    delete process.env.ALLOW_RUNTIME_SCHEMA_DDL;

    expect(runtimeSchemaDdlEnabled()).toBe(false);
  });

  it("stays enabled outside production so scratch databases still bootstrap", () => {
    setNodeEnv("development");
    delete process.env.ALLOW_RUNTIME_SCHEMA_DDL;
    expect(runtimeSchemaDdlEnabled()).toBe(true);

    setNodeEnv("test");
    expect(runtimeSchemaDdlEnabled()).toBe(true);
  });

  it("can be force-enabled in production as an escape hatch", () => {
    setNodeEnv("production");

    for (const value of ["true", "TRUE", "1", "yes"]) {
      process.env.ALLOW_RUNTIME_SCHEMA_DDL = value;
      expect(runtimeSchemaDdlEnabled(), `value: ${value}`).toBe(true);
    }
  });

  it("can be force-disabled outside production", () => {
    setNodeEnv("development");

    for (const value of ["false", "FALSE", "0", "no"]) {
      process.env.ALLOW_RUNTIME_SCHEMA_DDL = value;
      expect(runtimeSchemaDdlEnabled(), `value: ${value}`).toBe(false);
    }
  });

  it("ignores surrounding whitespace", () => {
    setNodeEnv("production");
    process.env.ALLOW_RUNTIME_SCHEMA_DDL = "  true  ";
    expect(runtimeSchemaDdlEnabled()).toBe(true);
  });
});
