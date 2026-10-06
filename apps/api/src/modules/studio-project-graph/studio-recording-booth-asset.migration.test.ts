import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "apps/api/src/platform/database/migrations/0102_studio_recording_booth_asset.sql"), "utf8");

describe("studio recording booth asset migration", () => {
  it("stores durable work assets with bounded webm payloads and idempotent authorship", () => {
    expect(sql).toContain("BEGIN;");
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS studio_recording_booth_asset");
    expect(sql).toContain("\"contentType\" IN ('audio/webm')");
    expect(sql).toContain("\"durationMs\" BETWEEN 1 AND 300000");
    expect(sql).toContain("\"byteLength\" BETWEEN 1 AND 5242880");
    expect(sql).toContain('UNIQUE ("authorUserId", "operationId")');
    expect(sql).toContain("studio_recording_booth_asset_work_idx");
    expect(sql).toContain("studio_recording_booth_asset_guard_update");
    expect(sql).toContain("new recording booth asset cannot start deleted");
    expect(sql).toContain("recording booth asset immutable fields changed");
    expect(sql).toContain("BEFORE INSERT OR UPDATE OR DELETE");
    expect(sql).toContain("REVOKE ALL ON TABLE studio_recording_booth_asset FROM PUBLIC");
    expect(sql).toContain("REVOKE ALL ON FUNCTION studio_recording_booth_asset_guard() FROM PUBLIC");
    // 영속 에셋이라 검수 음성 메모와 달리 만료 컬럼을 두지 않는다.
    expect(sql).not.toContain("expiresAt");
  });
});
