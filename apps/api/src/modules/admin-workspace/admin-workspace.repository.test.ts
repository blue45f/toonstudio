import "reflect-metadata";

import { randomUUID } from "node:crypto";
import { createAdminWorkspace, type AdminWorkspace, type AdminWorkspaceSave } from "@toonstudio/contracts/admin-workspace";
import { describe, expect, it, vi } from "vitest";

import { AdminWorkspaceController } from "./admin-workspace.controller";
import { AdminWorkspaceRepository, adminWorkspaceDigest } from "./admin-workspace.repository";

import type { Pool } from "pg";

const instant = "2026-11-17T10:00:00.000Z";
const empty = { revision: 0, payload: null, payload_digest: null, updated_at: null };
const stored = (state: AdminWorkspace, revision = 1) => ({ revision, payload: state, payload_digest: adminWorkspaceDigest(state), updated_at: instant });
const request = (state = createAdminWorkspace(), expectedRevision = 0): AdminWorkspaceSave => ({ state, expectedRevision, mutationId: randomUUID() });

function fixture(options: { role?: string | null; row?: unknown; receipt?: unknown; failOn?: RegExp; rollbackFails?: boolean; storageBytes?: number } = {}) {
  const query = vi.fn(async (text: string, values?: unknown[]) => {
    if (options.failOn?.test(text) || (options.rollbackFails && text === "ROLLBACK")) throw new Error("private SQL data must not escape");
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) return { rows: [] };
    if (text.startsWith("SELECT role")) return { rows: options.role === null ? [] : [{ role: options.role ?? "admin" }] };
    if (text.includes("WHERE FALSE")) return { rows: [] };
    if (text.startsWith("SELECT revision")) return { rows: options.row === undefined ? [empty] : options.row === null ? [] : [options.row] };
    if (text.startsWith("SELECT request_digest")) return { rows: options.receipt ? [options.receipt] : [] };
    if (text.startsWith("SELECT octet_length")) return { rows: [{ bytes: options.storageBytes ?? 1000 }] };
    if (text.startsWith("UPDATE admin_workspace")) return { rows: [{ updated_at: instant }] };
    if (text.startsWith("INSERT INTO admin_workspace_")) return { rows: [] };
    throw new Error(`Unexpected fixture query: ${text}; ${values?.length ?? 0} bound values`);
  });
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  return { repository: new AdminWorkspaceRepository({ connect } as unknown as Pool), query, release, connect };
}
const mutations = (query: ReturnType<typeof fixture>["query"]) => query.mock.calls.filter(([sql]) => /^(?:UPDATE|INSERT|DELETE|CREATE|ALTER)/u.test(sql));

describe("관리자 작업 보드 저장 경계", () => {
  it.each(["admin", "operator"])("활성 %s는 빈 보드를 읽고 편집 가능 여부를 받는다", async (role) => {
    const f = fixture({ role });
    expect(await f.repository.read("actor")).toEqual({ boardId: "toonstudio", ...{ revision: 0, state: null, updatedAt: null }, canEdit: role === "admin" });
    expect(mutations(f.query)).toHaveLength(0);
    expect(f.query.mock.calls[1]).toEqual([`SELECT role FROM "user" WHERE id=$1 AND status='active' FOR SHARE`, ["actor"]]);
    expect(f.release).toHaveBeenCalledWith(false);
  });
  it.each([null, "user"])("비활성·일반 계정(%s)은 원문을 읽기 전에 거부된다", async (role) => {
    const f = fixture({ role });
    await expect(f.repository.read("actor")).rejects.toMatchObject({ status: 403 });
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith("SELECT revision"))).toBe(false);
  });
  it("운영자 저장은 거부하고 감사·원문을 변경하지 않는다", async () => {
    const f = fixture({ role: "operator" });
    await expect(f.repository.save("actor", request())).rejects.toMatchObject({ status: 403 });
    expect(mutations(f.query)).toHaveLength(0);
    expect(f.query).toHaveBeenCalledWith("ROLLBACK");
  });
  it("유효한 보드·감사·receipt를 같은 트랜잭션으로 저장한다", async () => {
    const f = fixture();
    const input = request();
    expect(await f.repository.save("actor", input)).toEqual({ boardId: "toonstudio", revision: 1, updatedAt: instant, replayed: false });
    const calls = f.query.mock.calls;
    expect(calls.find(([sql]) => sql.startsWith("SELECT revision"))?.[0]).toContain("FOR UPDATE");
    expect(mutations(f.query).map(([sql]) => sql.split(/\s+/u).slice(0, 3).join(" "))).toEqual([
      "UPDATE admin_workspace SET", "INSERT INTO admin_workspace_audit(board_id,revision,actor_user_id,action,before_digest,after_digest,occurred_at)",
      "INSERT INTO admin_workspace_receipt(board_id,actor_user_id,mutation_id,request_digest,accepted_revision,accepted_at)",
    ]);
    const update = calls.find(([sql]) => sql.startsWith("UPDATE"));
    expect(update?.[1]).toEqual([1, JSON.stringify(input.state), adminWorkspaceDigest(input.state), "actor", "toonstudio", 0]);
    expect(calls.at(-1)?.[0]).toBe("COMMIT");
  });
  it("이전 revision은 저장과 감사 추가 전에 409를 반환한다", async () => {
    const f = fixture({ row: stored(createAdminWorkspace(), 7) });
    await expect(f.repository.save("actor", request())).rejects.toMatchObject({ status: 409, response: { code: "admin_workspace_conflict", currentRevision: 7 } });
    expect(mutations(f.query)).toHaveLength(0);
  });
  it("같은 요청은 최신 revision보다 오래되어도 원래 승인을 재전달한다", async () => {
    const input = request();
    const f = fixture({ row: stored(input.state, 3), receipt: { request_digest: adminWorkspaceDigest(input), accepted_revision: 1, accepted_at: instant } });
    expect(await f.repository.save("actor", input)).toEqual({ boardId: "toonstudio", revision: 1, updatedAt: instant, replayed: true });
    expect(mutations(f.query)).toHaveLength(0);
  });
  it("같은 mutation ID로 내용을 바꾸면 충돌로 처리한다", async () => {
    const input = request();
    const f = fixture({ row: stored(structuredClone(input.state)), receipt: { request_digest: adminWorkspaceDigest(input), accepted_revision: 1, accepted_at: instant } });
    input.state.records[0].notes = "새 편집";
    await expect(f.repository.save("actor", input)).rejects.toMatchObject({ status: 409 });
    expect(mutations(f.query)).toHaveLength(0);
  });
  it("감사 추가가 실패하면 본문 변경까지 롤백하고 원문 오류를 숨긴다", async () => {
    const f = fixture({ failOn: /^INSERT INTO admin_workspace_audit/u });
    const error = await f.repository.save("actor", request()).catch(error => error);
    expect(error).toMatchObject({ status: 503, response: { code: "admin_workspace_storage_unavailable" } });
    expect(JSON.stringify(error)).not.toContain("private SQL data");
    expect(f.query).toHaveBeenCalledWith("ROLLBACK");
    expect(f.query).not.toHaveBeenCalledWith("COMMIT");
  });
  it("JSONB 표현이 상한을 넘으면 저장 전에 400으로 거부한다", async () => {
    const f = fixture({ storageBytes: 12 * 1024 * 1024 + 1 });
    await expect(f.repository.save("actor", request())).rejects.toMatchObject({ status: 400, response: { code: "admin_workspace_invalid" } });
    expect(mutations(f.query)).toHaveLength(0);
    expect(f.query).toHaveBeenCalledWith("ROLLBACK");
  });
  it.each([
    { failOn: /WHERE FALSE/u },
    { row: null },
    { row: { ...stored(createAdminWorkspace()), payload_digest: "a".repeat(64) } },
  ])("스키마·구조 행·원문 digest 오류는 초기화하지 않고 503으로 중단한다", async (options) => {
    const f = fixture(options);
    await expect(f.repository.read("actor")).rejects.toMatchObject({ status: 503 });
    expect(mutations(f.query)).toHaveLength(0);
  });
  it("연결 실패와 롤백 실패를 숨기고 손상된 연결을 폐기한다", async () => {
    const f = fixture({ failOn: /WHERE FALSE/u, rollbackFails: true });
    await expect(f.repository.read("actor")).rejects.toMatchObject({ status: 503 });
    expect(f.release).toHaveBeenCalledWith(true);
    f.connect.mockRejectedValueOnce(new Error("private connection details"));
    await expect(f.repository.read("actor")).rejects.toMatchObject({ status: 503 });
  });
  it("기존 승인 전용 표시를 해제한 저장은 공통 전이 검증이 차단한다", async () => {
    const before = createAdminWorkspace();
    Object.assign(before.records[0], { approvalOnly: true, approvalReason: "별도 승인 필요", status: "승인 대기" });
    const after = structuredClone(before);
    Object.assign(after.records[0], { approvalOnly: false, approvalReason: "", status: "초안" });
    const f = fixture({ row: stored(before) });
    await expect(f.repository.save("actor", request(after, 1))).rejects.toMatchObject({ status: 400, response: { code: "admin_workspace_invalid" } });
    expect(mutations(f.query)).toHaveLength(0);
  });
  it("새 원문의 과거 확인 상태를 현재 검증으로 자동 승격하지 않는다", async () => {
    const state = createAdminWorkspace();
    Object.assign(state.records[0], { factStatus: "확인", sourceTitle: "합성 근거", sourceUrl: "https://example.test/evidence", verifiedAt: "2026-11-17", reviewer: "검증자", verificationNote: "테스트 문서와 대조" });
    const f = fixture();
    await expect(f.repository.save("actor", request(state))).rejects.toMatchObject({ status: 400 });
    expect(mutations(f.query)).toHaveLength(0);
  });
  it("본문 신원 주입·근거 없는 확인은 연결 전에 거부한다", async () => {
    const f = fixture();
    await expect(f.repository.save("actor", { ...request(), userId: "other" } as AdminWorkspaceSave)).rejects.toMatchObject({ status: 400 });
    const state = createAdminWorkspace(); state.records[0].factStatus = "확인";
    await expect(f.repository.save("actor", request(state))).rejects.toMatchObject({ status: 400 });
    expect(f.connect).not.toHaveBeenCalled();
  });
  it("digest는 객체 키 순서에만 무관하고 기록 내용 변경은 구분한다", () => {
    expect(adminWorkspaceDigest({ b: 2, a: [1, { y: "검증", x: null }] })).toBe(adminWorkspaceDigest({ a: [1, { x: null, y: "검증" }], b: 2 }));
    expect(adminWorkspaceDigest({ a: 1 })).not.toBe(adminWorkspaceDigest({ a: 2 }));
  });
});

describe("관리자 보드 controller 입력 경계", () => {
  it("서버 인증 헤더가 없으면 저장소를 호출하지 않는다", () => {
    const f = fixture(); const controller = new AdminWorkspaceController(f.repository);
    expect(() => controller.read()).toThrow(/로그인/u);
    expect(() => controller.save(request())).toThrow(/로그인/u);
    expect(f.connect).not.toHaveBeenCalled();
  });
  it("잘못된 body를 저장소 호출 전에 거부한다", () => {
    const f = fixture(); const controller = new AdminWorkspaceController(f.repository);
    expect(() => controller.save({ state: {} }, "actor")).toThrow();
    expect(f.connect).not.toHaveBeenCalled();
  });
});
