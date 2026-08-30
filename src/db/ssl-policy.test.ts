import { describe, expect, it } from "vitest";
import { shouldUseSsl } from "./ssl-policy";

/**
 * The site moved from Neon to a PostgreSQL running on the same VPS.
 *
 * The pool forced `ssl: { rejectUnauthorized: true }` unconditionally, which is
 * right for Neon but fatal for a local server: a stock local install serves no
 * certificate, so every query died with "self-signed certificate" and the app
 * booted with a dead pool — /api/health returned DATABASE_CONNECTION_FAILED
 * while `psql` on the same box worked fine.
 *
 * The rule below is deliberately narrow: TLS is skipped only for loopback,
 * where traffic never leaves the machine. Anything reachable over a network
 * keeps full verification.
 */
describe("shouldUseSsl", () => {
  it("skips TLS for loopback, where there is nothing to encrypt", () => {
    expect(shouldUseSsl("postgresql://u:p@127.0.0.1:5432/db")).toBe(false);
    expect(shouldUseSsl("postgresql://u:p@localhost:5432/db")).toBe(false);
    expect(shouldUseSsl("postgresql://u:p@[::1]:5432/db")).toBe(false);
  });

  it("keeps TLS for managed hosts like Neon", () => {
    expect(shouldUseSsl("postgresql://u:p@ep-x.neon.tech/db?sslmode=require")).toBe(true);
  });

  it("keeps TLS for private network addresses", () => {
    // A LAN host is still a network hop — someone on that network could listen.
    expect(shouldUseSsl("postgresql://u:p@10.0.0.5:5432/db")).toBe(true);
    expect(shouldUseSsl("postgresql://u:p@192.168.1.10:5432/db")).toBe(true);
  });

  it("defaults to TLS when the URL is missing or unparseable", () => {
    // Failing closed: a config typo must not silently drop encryption.
    expect(shouldUseSsl(undefined)).toBe(true);
    expect(shouldUseSsl("")).toBe(true);
    expect(shouldUseSsl("not a url")).toBe(true);
  });

  it("lets DB_SSL override the autodetection in both directions", () => {
    expect(shouldUseSsl("postgresql://u:p@ep-x.neon.tech/db", { DB_SSL: "disable" })).toBe(false);
    expect(shouldUseSsl("postgresql://u:p@127.0.0.1/db", { DB_SSL: "require" })).toBe(true);
  });

  it("accepts the common spellings of the override", () => {
    for (const off of ["disable", "false", "off", "DISABLE", " Off "]) {
      expect(shouldUseSsl("postgresql://u:p@host/db", { DB_SSL: off })).toBe(false);
    }
    for (const on of ["require", "true", "on", "REQUIRE"]) {
      expect(shouldUseSsl("postgresql://u:p@127.0.0.1/db", { DB_SSL: on })).toBe(true);
    }
  });
});
