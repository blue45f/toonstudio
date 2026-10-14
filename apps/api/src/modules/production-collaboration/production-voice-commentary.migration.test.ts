import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "apps/api/src/platform/database/migrations/0113_production_episode_voice_commentary.sql"), "utf8");

describe("production episode voice commentary migration", () => {
  it("pins commentary to a production episode with bounded retention and idempotent authorship", () => {
    expect(sql).toContain("BEGIN;");
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS production_episode_voice_commentary");
    expect(sql).toContain('REFERENCES production_project(id) ON DELETE CASCADE');
    expect(sql).toContain('UNIQUE ("authorUserId", "operationId")');
    expect(sql).toContain('"expiresAt" > "createdAt"');
    expect(sql).toContain("idx_production_episode_voice_commentary_expiry");
    expect(sql).toContain("production_episode_voice_commentary_guard_update");
    expect(sql).toContain("new episode voice commentary cannot start deleted");
    expect(sql).toContain("episode voice commentary immutable fields changed");
    expect(sql).toContain("BEFORE INSERT OR UPDATE OR DELETE");
    expect(sql).toContain("REVOKE ALL ON TABLE production_episode_voice_commentary FROM PUBLIC");
    expect(sql).toContain("REVOKE ALL ON FUNCTION production_episode_voice_commentary_guard() FROM PUBLIC");
  });
});
