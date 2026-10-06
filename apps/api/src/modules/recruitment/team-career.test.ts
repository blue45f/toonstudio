import { describe, expect, it, vi } from "vitest";

import { HiringStore } from "../collaboration/hiring.store";
import { parseHiring } from "../collaboration/hiring.validation";

import { careerSchema } from "./career.controller";
import { CreatorCareerRepository } from "./career.repository";
import { CreatorTeamRepository } from "./team.repository";

import type { Pool } from "pg";

function harness(respond: (sql: string, values: unknown[]) => object[]) {
  const query = vi.fn(async (sql: string, values: unknown[] = []) => ({ rows: respond(sql, values) }));
  const store = new HiringStore({ connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool);
  return { query, store };
}
const career = { title: "작품", role: "lineart", startMonth: "2026-01", endMonth: null, episodeFrom: 1, episodeTo: 5, scope: "선화", contribution: "직접 작업", portfolioUrl: "https://example.com/works", rights: "owned", visibility: "public", expectedRevision: 1 };
describe("team actor and group boundaries (mock SQL)", () => {
  it("checks membership after obtaining the team lock, observing a completed removal", async () => {
    const h = harness((sql) => sql.startsWith("SELECT * FROM creator_hiring_team") ? [{ id: "team", owner_id: "owner", revision: 1 }] : []);
    await expect(new CreatorTeamRepository(h.store).team({ query: h.query } as never, "removed", "team")).rejects.toMatchObject({ status: 404 });
    expect(h.query.mock.calls[0][0]).toContain("FOR UPDATE"); expect(h.query.mock.calls[1][0]).toContain("creator_hiring_team_member");
  });
  it("prevents removing or leaving the final owner", async () => {
    const h = harness((sql) => sql.includes('FROM "user"') ? [{ id: "owner" }] : sql.startsWith("SELECT * FROM creator_hiring_team") ? [{ id: "team", owner_id: "owner", revision: 1 }] : sql.startsWith("SELECT user_id") ? [{ user_id: "owner" }] : []);
    await expect(new CreatorTeamRepository(h.store).removeMember("owner", "team", "owner")).rejects.toMatchObject({ status: 409 });
    expect(h.query.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(false);
  });
  it("targeted invitation acceptance cannot update another account's membership", async () => {
    const h = harness((sql) => sql.includes('FROM "user"') ? [{ id: "outsider" }] : sql.startsWith("SELECT owner_id") ? [{ owner_id: "owner" }] : []);
    await expect(new CreatorTeamRepository(h.store).respond("outsider", "team", true, 1)).rejects.toMatchObject({ status: 409 });
    const write = h.query.mock.calls.find(([s]) => s.startsWith("UPDATE creator_hiring_team_member"));
    expect(write?.[0]).toContain("user_id=$2"); expect(write?.[1]?.[1]).toBe("outsider");
  });
  it("rejects cross-team group members without writing", async () => {
    const h = harness((sql) => sql.includes('FROM "user"') ? [{ id: "owner" }] : sql.startsWith("SELECT * FROM creator_hiring_team") ? [{ id: "team", owner_id: "owner", revision: 1 }] : sql.startsWith("SELECT user_id FROM creator_hiring_team_member") && !sql.includes("ANY") ? [{ user_id: "owner" }] : []);
    await expect(new CreatorTeamRepository(h.store).saveGroup("owner", "team", null, "선화팀", ["other-team-member"])).rejects.toMatchObject({ status: 403 });
    expect(h.query.mock.calls.some(([s]) => s.startsWith("INSERT"))).toBe(false);
  });
});
describe("career privacy and rights", () => {
  it("cannot self-verify or publish unconfirmed rights", () => {
    expect(() => parseHiring(careerSchema, { ...career, proof: "verified" })).toThrow();
    expect(() => parseHiring(careerSchema, { ...career, rights: "pending" })).toThrow();
    expect(() => parseHiring(careerSchema, { ...career, points: 99999 })).toThrow();
  });
  it("still permits privacy revocation at the content-version limit", async () => {
    const h = harness((sql) => sql.includes('FROM "user"') ? [{ id: "owner" }] : sql.startsWith("SELECT * FROM creator_hiring_career") ? [{ id: "career", revision: 100, content: career }] : []);
    await expect(new CreatorCareerRepository(h.store).revoke("owner", "career")).resolves.toEqual({ revision: 101 });
    expect(h.query.mock.calls.some(([s]) => s.includes("rights='pending',visibility='private'"))).toBe(true);
  });
  it("rejects historical-version import after current rights revocation", async () => {
    const h = harness((sql) => sql.includes('FROM "user"') ? [{ id: "owner" }] : sql.startsWith("SELECT rights") ? [{ rights: "pending" }] : []);
    await expect(new CreatorCareerRepository(h.store).importResume("owner", "career", "old-version", "활동명", "request")).rejects.toMatchObject({ status: 409 });
    expect(h.query.mock.calls.some(([s]) => s.startsWith("INSERT"))).toBe(false);
  });
  it("does not expose private version history to another actor", async () => {
    const h = harness((sql) => sql.includes('FROM "user"') ? [{ id: "outsider" }] : []);
    await expect(new CreatorCareerRepository(h.store).versions("outsider", "career")).rejects.toMatchObject({ status: 404 });
    expect(h.query.mock.calls.some(([s]) => s.startsWith("SELECT * FROM creator_hiring_career_version"))).toBe(false);
  });
});
describe("career cover image", () => {
  it("defaults a missing cover to null for pre-cover payloads and accepts a public HTTPS cover", () => {
    expect(parseHiring(careerSchema, career).coverImageUrl).toBeNull();
    expect(parseHiring(careerSchema, { ...career, coverImageUrl: null }).coverImageUrl).toBeNull();
    expect(parseHiring(careerSchema, { ...career, coverImageUrl: "https://images.example.com/cover.png" }).coverImageUrl).toBe("https://images.example.com/cover.png");
  });
  // 자격증명이 박힌 주소는 사용자명만 있어도 거부된다(비밀번호 없이도 userinfo가 남아면 안 된다).
  it("rejects cover addresses that are not public HTTPS", () => {
    for (const coverImageUrl of ["http://images.example.com/cover.png", "https://user@images.example.com/cover.png", "https://127.0.0.1/cover.png", "https://images.example.com:8443/cover.png", "https://localhost/cover.png"]) {
      expect(() => parseHiring(careerSchema, { ...career, coverImageUrl })).toThrow();
    }
  });
  it("persists a registered cover in the stored career content", async () => {
    const h = harness((sql) => sql.includes('FROM "user"') ? [{ id: "owner" }] : sql.includes("count(*)") ? [{ count: 0 }] : []);
    const input = parseHiring(careerSchema, { ...career, expectedRevision: 0, coverImageUrl: "https://images.example.com/cover.png" });
    await new CreatorCareerRepository(h.store).save("owner", null, input);
    const insert = h.query.mock.calls.find(([s]) => s.startsWith("INSERT INTO creator_hiring_career("));
    expect(JSON.parse(String(insert?.[1]?.[4])).coverImageUrl).toBe("https://images.example.com/cover.png");
  });
  it("normalizes legacy careers without a cover to null in owner lists", async () => {
    const row = { id: "career", user_id: "owner", name: "작가", revision: 1, content: career, updated_at: new Date("2026-09-20T00:00:00Z"), version_id: "version1" };
    const h = harness((sql) => sql.includes('FROM "user"') ? [{ id: "owner" }] : sql.includes("FROM creator_hiring_career c") ? [row] : []);
    const items = await new CreatorCareerRepository(h.store).list("owner");
    expect(items[0]?.coverImageUrl).toBeNull();
  });
  it("projects registered covers only through the rights-confirmed public gallery", async () => {
    const covered = { id: "covered", user_id: "a", name: "작가 가", revision: 1, content: { ...career, coverImageUrl: "https://images.example.com/cover.png" }, updated_at: new Date("2026-09-20T00:00:00Z"), version_id: "v1" };
    const legacy = { id: "legacy", user_id: "b", name: "작가 나", revision: 1, content: career, updated_at: new Date("2026-09-19T00:00:00Z"), version_id: "v2" };
    const h = harness((sql) => sql.includes("visibility='public'") ? [covered, legacy] : []);
    const gallery = await new CreatorCareerRepository(h.store).gallery();
    expect(h.query.mock.calls.some(([s]) => s.includes("visibility='public'") && s.includes("rights IN ('owned','authorized')"))).toBe(true);
    expect(gallery.map((g) => g.coverImageUrl)).toEqual(["https://images.example.com/cover.png", null]);
  });
});
