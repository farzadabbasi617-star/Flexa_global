import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The manual migration list used to be maintained by hand in two places and
 * drifted badly: 16 of 40 files were documented, so a fresh install silently
 * produced an incomplete database. These tests keep documentation and reality
 * in sync automatically.
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle", "manual");
const DOCS = path.join(MIGRATIONS_DIR, "README.md");

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

describe("manual migrations", () => {
  it("documents every migration file", () => {
    const documented = new Set(
      Array.from(readFileSync(DOCS, "utf8").matchAll(/`(\d{4}_[a-z0-9_]+\.sql)`/g)).map(
        (match) => match[1]
      )
    );

    const undocumented = migrationFiles().filter((file) => !documented.has(file));

    expect(undocumented, `undocumented migrations: ${undocumented.join(", ")}`).toEqual([]);
  });

  it("does not document migrations that no longer exist", () => {
    const actual = new Set(migrationFiles());
    const documented = Array.from(
      readFileSync(DOCS, "utf8").matchAll(/`(\d{4}_[a-z0-9_]+\.sql)`/g)
    ).map((match) => match[1]);

    const stale = documented.filter((file) => !actual.has(file));

    expect(stale, `documented but missing: ${stale.join(", ")}`).toEqual([]);
  });

  it("keeps every migration idempotent so the runner can be re-run safely", () => {
    // scripts/apply-migrations.sh applies the whole directory every time, and
    // the README promises that is safe. Enforce the guard that makes it true.
    const guard = /if not exists|do \$\$|or replace|exception when/i;

    const unguarded = migrationFiles().filter(
      (file) => !guard.test(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"))
    );

    expect(unguarded, `not idempotent: ${unguarded.join(", ")}`).toEqual([]);
  });
});
