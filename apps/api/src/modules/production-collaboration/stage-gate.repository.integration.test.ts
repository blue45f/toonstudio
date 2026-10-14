import { validatePostgresIntegrationUrl } from "../../../../../scripts/run-postgres-integration-tests.mjs";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StageGateRepository } from "./stage-gate.repository";
import { StageGateCommandSchema } from "./stage-gate.dto";

const url = process.env.TEST_DATABASE_URL;
const schema = `creco_gate_${randomUUID().replaceAll("-", "")}`;
const migration = (name: string): string => readFileSync(new URL(`../../platform/database/migrations/${name}`, import.meta.url), "utf8").replaceAll("public.", `"${schema}".`);
const versioned = (expectedRevision: number) => ({ expectedRevision, mutationId: randomUUID() });

describe("stage gate DTO contract (no database)", () => {
  it("rejects forged actor, reviewer and role fields", () => {
    expect(StageGateCommandSchema.safeParse({ ...versioned(0), type: "record-decision", round: 1, value: "approve", reason: "", conditions: [], pinThreadIds: [], reviewerId: "someone-else" }).success).toBe(false);
    expect(StageGateCommandSchema.safeParse({ ...versioned(0), type: "record-decision", round: 1, value: "approve", reason: "", conditions: [], pinThreadIds: [], role: "lead" }).success).toBe(false);
    expect(StageGateCommandSchema.safeParse({ ...versioned(0), type: "assign-lead", leadReviewerId: "lead-1", leadReviewerName: "위조" }).success).toBe(false);
  });
  it("rejects unknown commands and non-uuid mutation ids", () => {
    expect(StageGateCommandSchema.safeParse({ ...versioned(0), type: "delete-gate" }).success).toBe(false);
    expect(StageGateCommandSchema.safeParse({ mutationId: "not-a-uuid", expectedRevision: 0, type: "submit-round", revisionRef: null }).success).toBe(false);
  });
});

describe.skipIf(!url)("stage gate server contract actual Postgres", () => {
  let admin: Pool;
  let pool: Pool;
  let repository: StageGateRepository;
  beforeAll(async () => {
    validatePostgresIntegrationUrl(url);
    admin = new Pool({ connectionString: url, max: 1 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: url, max: 8, options: `-c search_path=${schema}` });
    await pool.query(`CREATE TABLE "user"(id text PRIMARY KEY,name text,email text UNIQUE,"emailVerified" timestamptz,status text NOT NULL DEFAULT 'active');
      CREATE TABLE creator_work(id text PRIMARY KEY,"userId" text NOT NULL);
      CREATE TABLE creator_work_collaborator("workId" text NOT NULL,"userId" text NOT NULL,role text NOT NULL,status text NOT NULL DEFAULT 'active');
      CREATE TABLE production_project(id text PRIMARY KEY,"workId" text NOT NULL);`);
    await pool.query(migration("0110_stage_consensus_gate.sql"));
    repository = new StageGateRepository(pool);
  });
  afterAll(async () => {
    await pool?.end();
    if (admin) { await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); }
  });
  async function user(name: string): Promise<string> {
    const id = randomUUID();
    await pool.query(`INSERT INTO "user"(id,name,email) VALUES($1,$2,$3)`, [id, name, `${id}@example.test`]);
    return id;
  }
  async function project(owner: string, collaborators: [string, string][] = []): Promise<string> {
    const workId = randomUUID(); const projectId = randomUUID();
    await pool.query(`INSERT INTO creator_work(id,"userId") VALUES($1,$2)`, [workId, owner]);
    for (const [userId, role] of collaborators) {
      await pool.query(`INSERT INTO creator_work_collaborator("workId","userId",role) VALUES($1,$2,$3)`, [workId, userId, role]);
    }
    await pool.query(`INSERT INTO production_project(id,"workId") VALUES($1,$2)`, [projectId, workId]);
    return projectId;
  }
  it("persists lead, round and decision so another device reads the identical gate", async () => {
    const owner = await user("소유자"); const lead = await user("리드"); const artist = await user("작가");
    const projectId = await project(owner, [[lead, "editor"], [artist, "editor"]]);
    await repository.command(owner, projectId, "ep-1", "plan", { ...versioned(0), type: "assign-lead", leadReviewerId: lead });
    await repository.command(artist, projectId, "ep-1", "plan", { ...versioned(1), type: "submit-round", revisionRef: "rev-1" });
    await repository.command(lead, projectId, "ep-1", "plan", { ...versioned(2), type: "record-decision", round: 1, value: "approve-with-conditions", reason: "", conditions: ["전개 속도 조정"], pinThreadIds: [] });
    // 판정 핵심: 누가(어떤 기기로) 조회하든 같은 리드·라운드·판정이 서버 응답으로 돌아온다.
    for (const viewer of [owner, lead, artist]) {
      const bundle = await repository.list(viewer, projectId, "ep-1");
      expect(bundle.gates).toHaveLength(1);
      expect(bundle.gates[0]).toMatchObject({ leadReviewerId: lead, leadReviewerName: "리드", revision: 3 });
      expect(bundle.gates[0].rounds[0]).toMatchObject({ round: 1, submittedById: artist, revisionRef: "rev-1" });
      expect(bundle.gates[0].rounds[0].decisions[0]).toMatchObject({ reviewerId: lead, role: "lead", value: "approve-with-conditions", conditions: ["전개 속도 조정"] });
    }
  });
  it("derives participant role server-side and enforces the storage validation", async () => {
    const owner = await user("소유자"); const lead = await user("리드"); const peer = await user("동료");
    const projectId = await project(owner, [[lead, "editor"], [peer, "commenter"]]);
    await repository.command(owner, projectId, "ep-2", "art", { ...versioned(0), type: "assign-lead", leadReviewerId: lead });
    await repository.command(owner, projectId, "ep-2", "art", { ...versioned(1), type: "submit-round", revisionRef: null });
    await repository.command(peer, projectId, "ep-2", "art", { ...versioned(2), type: "record-decision", round: 1, value: "request-changes", reason: "표정이 어색해요", conditions: [], pinThreadIds: ["thread-1"] });
    const bundle = await repository.list(owner, projectId, "ep-2");
    expect(bundle.gates[0].rounds[0].decisions[0]).toMatchObject({ reviewerId: peer, role: "participant" });
    // 사유 없는 반려는 서버가 거부한다(클라이언트 검증을 우회해도 저장 불가).
    await expect(repository.command(lead, projectId, "ep-2", "art", { ...versioned(3), type: "record-decision", round: 1, value: "veto", reason: " ", conditions: [], pinThreadIds: [] }))
      .rejects.toMatchObject({ status: 400 });
  });
  it("replays idempotently, rejects key reuse and stale revisions", async () => {
    const owner = await user("소유자"); const lead = await user("리드");
    const projectId = await project(owner, [[lead, "editor"]]);
    const input = { ...versioned(0), type: "assign-lead", leadReviewerId: lead } as const;
    const first = await repository.command(owner, projectId, "ep-3", "storyboard", input);
    expect(await repository.command(owner, projectId, "ep-3", "storyboard", input)).toEqual(first);
    await expect(repository.command(owner, projectId, "ep-3", "storyboard", { ...input, leadReviewerId: owner }))
      .rejects.toMatchObject({ status: 409 });
    await expect(repository.command(owner, projectId, "ep-3", "storyboard", { ...versioned(0), type: "submit-round", revisionRef: null }))
      .rejects.toMatchObject({ status: 409, response: { code: "revision_conflict", currentRevision: 1 } });
  });
  it("hides projects from strangers and gates decisions behind lead assignment and roles", async () => {
    const owner = await user("소유자"); const member = await user("구성원"); const stranger = await user("외부인");
    const projectId = await project(owner, [[member, "editor"]]);
    await expect(repository.list(stranger, projectId, "ep-4")).rejects.toMatchObject({ status: 404 });
    await expect(repository.command(owner, projectId, "ep-4", "plan", { ...versioned(0), type: "submit-round", revisionRef: null })
      .then(() => repository.command(owner, projectId, "ep-4", "plan", { ...versioned(1), type: "record-decision", round: 1, value: "approve", reason: "", conditions: [], pinThreadIds: [] })))
      .rejects.toMatchObject({ status: 409, response: { code: "lead_not_assigned" } });
    // 리드 지정은 소유자·관리자만 — 편집 구성원은 할 수 없다.
    await expect(repository.command(member, projectId, "ep-4", "plan", { ...versioned(1), type: "assign-lead", leadReviewerId: member }))
      .rejects.toMatchObject({ status: 403 });
  });
});
