import "reflect-metadata";

import { randomUUID } from "node:crypto";
import { createAdminWorkspace, createOperationsWorkspace, createWorkspaceRecord, parseAdminWorkspace, projectWorkspaceScope, type AdminWorkspace, type AdminWorkspaceSave } from "@toonstudio/contracts/admin-workspace";
import { describe, expect, it, vi } from "vitest";

import { AdminWorkspaceController } from "./admin-workspace.controller";
import { AdminWorkspaceRepository, adminWorkspaceDigest } from "./admin-workspace.repository";

import type { Pool } from "pg";

const instant = "2026-11-17T10:00:00.000Z";
const operations = (): AdminWorkspace => ({ ...createOperationsWorkspace(), records: [{ ...createWorkspaceRecord("ops-1", "ai", "task"), title: "합성 운영 기록" }] });
const empty = { revision: 0, payload: null, payload_digest: null, updated_at: null, operations_revision: 0, operations_updated_at: null, business_revision: 0, business_updated_at: null, business_owner_user_id: null };
const stored = (state: AdminWorkspace, revision = 1) => ({ ...empty, revision, payload: state, payload_digest: adminWorkspaceDigest(state), updated_at: instant, operations_revision: revision, operations_updated_at: instant });
const request = (state = operations(), expectedRevision = 0): AdminWorkspaceSave => ({ state, expectedRevision, mutationId: randomUUID(), scope: "operations" });
const receipt = (input: AdminWorkspaceSave) => ({ request_digest: adminWorkspaceDigest(input), accepted_revision: 1, accepted_scope_revision: 1, accepted_at: instant, scope: "operations" });

function fixture(options: { role?: string | null; row?: unknown; receipt?: unknown; grant?: { can_write: boolean; can_export: boolean }; accessReceipt?: unknown; failOn?: RegExp; rollbackFails?: boolean; storageBytes?: number } = {}) {
  const query = vi.fn(async (text: string, values?: unknown[]) => {
    if (options.failOn?.test(text) || (options.rollbackFails && text === "ROLLBACK")) throw new Error("private SQL data must not escape");
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) return { rows: [] };
    if (text.startsWith("SELECT role")) return { rows: options.role === null ? [] : [{ role: options.role ?? "admin" }] };
    if (text.includes("WHERE FALSE")) return { rows: [] };
    if (text.startsWith("SELECT revision")) return { rows: options.row === undefined ? [empty] : options.row === null ? [] : [options.row] };
    if (text.startsWith("SELECT can_write")) return { rows: options.grant ? [options.grant] : [] };
    if (text.startsWith("SELECT user_id")) return { rows: [] };
    if (text.startsWith("SELECT request_digest,occurred_at")) return { rows: options.accessReceipt ? [options.accessReceipt] : [] };
    if (text.startsWith("SELECT request_digest")) return { rows: options.receipt ? [options.receipt] : [] };
    if (text.startsWith("SELECT octet_length")) return { rows: [{ bytes: options.storageBytes ?? 1000 }] };
    if (text.startsWith("UPDATE admin_workspace")) return { rows: [{ updated_at: instant }] };
    if (text.startsWith("INSERT INTO admin_workspace_business_grant")) return { rows: [{ updated_at: instant }] };
    if (text.startsWith("INSERT INTO admin_workspace_")) return { rows: [] };
    throw new Error(`Unexpected fixture query: ${text}; ${values?.length ?? 0} bound values`);
  });
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  return { repository: new AdminWorkspaceRepository({ connect } as unknown as Pool), query, release, connect };
}
const mutations = (query: ReturnType<typeof fixture>["query"]) => query.mock.calls.filter(([sql]) => /^(?:UPDATE|INSERT|DELETE|CREATE|ALTER)/u.test(sql));

function privateWorkspace(): AdminWorkspace {
  const state = createAdminWorkspace();
  state.records[0].notes = "PRIVATE_BUSINESS_RECORD";
  state.documents[0].working.content = "PRIVATE_DOCUMENT";
  state.mentor[0].notes = "PRIVATE_MENTOR";
  state.checklist[0].notes = "PRIVATE_CHECKLIST";
  state.approvals[0].notes = "PRIVATE_APPROVAL";
  state.settings.deadlineSource = "PRIVATE_DEADLINE";
  const operation = operations().records[0];
  const raw = { ...operation, id: "source-ops", sourceId: "synthetic-source", sourceRecordId: "source-ops", notes: "PRIVATE_RAW" };
  operation.taskId = state.records[0].id;
  operation.origin = { importId: "private-import", sourceId: "synthetic-source", sourceRecordId: "source-ops", raw };
  state.records.push(operation);
  state.imports.push({ id: "private-import", label: "PRIVATE_IMPORT", format: "native-backup", importedAt: "2026-11-17", archive: { kind: "toonstudio-admin-workspace", schemaVersion: 1, records: [raw], privateNote: "PRIVATE_ARCHIVE" } });
  return state;
}
const privateRow = () => ({ ...stored(privateWorkspace(), 40), operations_revision: 2, business_revision: 8, business_updated_at: "2026-11-18T00:00:00.000Z", business_owner_user_id: "owner" });

describe("관리자 작업 보드 저장 경계", () => {
  it.each(["admin", "operator"])("활성 %s는 빈 보드를 읽고 편집 가능 여부를 받는다", async (role) => {
    const f = fixture({ role });
    expect(await f.repository.read("actor")).toEqual({ boardId: "toonstudio", ...{ revision: 0, state: null, updatedAt: null }, canEdit: role === "admin", scope: "operations",
      access: { operations: { canRead: true, canWrite: role === "admin", canExport: true, canManageAccess: false }, business: { canRead: false, canWrite: false, canExport: false, canManageAccess: false } } });
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
    expect(await f.repository.save("actor", input)).toEqual({ boardId: "toonstudio", revision: 1, updatedAt: instant, replayed: false, scope: "operations" });
    const calls = f.query.mock.calls;
    expect(calls.find(([sql]) => sql.startsWith("SELECT revision"))?.[0]).toContain("FOR UPDATE");
    expect(mutations(f.query).map(([sql]) => sql.split(/\s+/u).slice(0, 3).join(" "))).toEqual([
      "UPDATE admin_workspace SET", "INSERT INTO admin_workspace_audit(board_id,revision,actor_user_id,action,before_digest,after_digest,occurred_at,scope,scope_revision)",
      "INSERT INTO admin_workspace_receipt(board_id,actor_user_id,mutation_id,request_digest,accepted_revision,accepted_at,scope,accepted_scope_revision)",
    ]);
    const update = calls.find(([sql]) => sql.startsWith("UPDATE"));
    expect(update?.[1]).toEqual([1, JSON.stringify(input.state), adminWorkspaceDigest(input.state), "actor", "toonstudio", 0, 1, null]);
    expect(calls.at(-1)?.[0]).toBe("COMMIT");
  });
  it("이전 revision은 저장과 감사 추가 전에 409를 반환한다", async () => {
    const f = fixture({ row: stored(operations(), 7) });
    await expect(f.repository.save("actor", request())).rejects.toMatchObject({ status: 409, response: { code: "admin_workspace_conflict", currentRevision: 7 } });
    expect(mutations(f.query)).toHaveLength(0);
  });
  it("같은 요청은 최신 revision보다 오래되어도 원래 승인을 재전달한다", async () => {
    const input = request();
    const f = fixture({ row: stored(input.state, 3), receipt: receipt(input) });
    expect(await f.repository.save("actor", input)).toEqual({ boardId: "toonstudio", revision: 1, updatedAt: instant, replayed: true, scope: "operations" });
    expect(mutations(f.query)).toHaveLength(0);
  });
  it("같은 mutation ID로 내용을 바꾸면 충돌로 처리한다", async () => {
    const input = request();
    const f = fixture({ row: stored(structuredClone(input.state)), receipt: receipt(input) });
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
    { row: { ...stored(operations()), payload_digest: "a".repeat(64) } },
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
    const before = operations();
    Object.assign(before.records[0], { approvalOnly: true, approvalReason: "별도 승인 필요", status: "승인 대기" });
    const after = structuredClone(before);
    Object.assign(after.records[0], { approvalOnly: false, approvalReason: "", status: "초안" });
    const f = fixture({ row: stored(before) });
    await expect(f.repository.save("actor", request(after, 1))).rejects.toMatchObject({ status: 400, response: { code: "admin_workspace_invalid" } });
    expect(mutations(f.query)).toHaveLength(0);
  });
  it("새 원문의 과거 확인 상태를 현재 검증으로 자동 승격하지 않는다", async () => {
    const state = operations();
    Object.assign(state.records[0], { factStatus: "확인", sourceTitle: "합성 근거", sourceUrl: "https://example.test/evidence", verifiedAt: "2026-11-17", reviewer: "검증자", verificationNote: "테스트 문서와 대조" });
    const f = fixture();
    await expect(f.repository.save("actor", request(state))).rejects.toMatchObject({ status: 400 });
    expect(mutations(f.query)).toHaveLength(0);
  });
  it("본문 신원 주입·근거 없는 확인은 연결 전에 거부한다", async () => {
    const f = fixture();
    await expect(f.repository.save("actor", { ...request(), userId: "other" } as AdminWorkspaceSave)).rejects.toMatchObject({ status: 400 });
    const state = operations(); state.records[0].factStatus = "확인";
    await expect(f.repository.save("actor", request(state))).rejects.toMatchObject({ status: 400 });
    expect(f.connect).not.toHaveBeenCalled();
  });
  it("digest는 객체 키 순서에만 무관하고 기록 내용 변경은 구분한다", () => {
    expect(adminWorkspaceDigest({ b: 2, a: [1, { y: "검증", x: null }] })).toBe(adminWorkspaceDigest({ a: [1, { x: null, y: "검증" }], b: 2 }));
    expect(adminWorkspaceDigest({ a: 1 })).not.toBe(adminWorkspaceDigest({ a: 2 }));
  });
});

describe("사업 자료의 서버 권한과 영역별 저장", () => {
  it.each(["admin", "operator"])("일반 %s에게 사업 내용·raw·원문 연결·변경 횟수를 공개하지 않는다", async (role) => {
    const row = privateRow();
    expect(parseAdminWorkspace(row.payload).ok).toBe(true);
    const f = fixture({ row, role });
    const view = await f.repository.read("outsider");
    expect(view.revision).toBe(2);
    expect(view.updatedAt).toBe(instant);
    expect(view.state?.records).toHaveLength(1);
    expect(view.state?.records[0]).toMatchObject({ origin: null, taskId: "" });
    expect(JSON.stringify(view)).not.toContain("PRIVATE_");
    expect(view.state?.imports).toEqual([]);
    expect(view.access.business).toEqual({ canRead: false, canWrite: false, canExport: false, canManageAccess: false });
    await expect(f.repository.read("outsider", "business")).rejects.toMatchObject({ status: 403 });
    expect(mutations(f.query)).toHaveLength(0);
  });
  it("소유자는 사업 영역만 읽고 private 조회 감사는 필수다", async () => {
    const f = fixture({ row: privateRow() });
    const view = await f.repository.read("owner", "business");
    expect(view.revision).toBe(8);
    expect(view.state?.records.every(record => record.module === "business")).toBe(true);
    expect(JSON.stringify(view)).toContain("PRIVATE_DOCUMENT");
    expect(view.access.business).toEqual({ canRead: true, canWrite: true, canExport: true, canManageAccess: true });
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO admin_workspace_access_audit"))).toBe(true);
    const unavailable = fixture({ row: privateRow(), failOn: /^INSERT INTO admin_workspace_access_audit/u });
    await expect(unavailable.repository.read("owner", "business")).rejects.toMatchObject({ status: 503 });
    expect(unavailable.query).toHaveBeenCalledWith("ROLLBACK");
  });
  it("명시적 읽기 허용은 편집·내보내기 권한을 자동 부여하지 않는다", async () => {
    const f = fixture({ row: privateRow(), role: "operator", grant: { can_write: false, can_export: false } });
    expect((await f.repository.read("reader", "business")).canEdit).toBe(false);
    await expect(f.repository.read("reader", "business", true)).rejects.toMatchObject({ status: 403 });
    await expect(f.repository.save("reader", { ...request(projectWorkspaceScope(privateWorkspace(), "business"), 8), scope: "business" })).rejects.toMatchObject({ status: 403 });
  });
  it("운영 영역 저장은 숨긴 사업 자료·원문·연결과 사업 버전을 보존한다", async () => {
    const before = privateWorkspace();
    const input = projectWorkspaceScope(before, "operations");
    input.records[0].notes = "운영 작업만 수정";
    const f = fixture({ row: privateRow() });
    expect(await f.repository.save("outsider", request(input, 2))).toMatchObject({ revision: 3, scope: "operations" });
    const update = f.query.mock.calls.find(([sql]) => sql.startsWith("UPDATE admin_workspace"));
    const saved: AdminWorkspace = JSON.parse(String(update?.[1]?.[1]));
    expect(parseAdminWorkspace(saved).ok).toBe(true);
    expect(projectWorkspaceScope(saved, "business")).toEqual(projectWorkspaceScope(before, "business"));
    expect(saved.records.find(record => record.id === "ops-1")?.origin).toEqual(before.records.at(-1)?.origin);
    expect(saved.records.find(record => record.id === "ops-1")?.taskId).toBe(before.records.at(-1)?.taskId);
    expect(update?.[0]).toContain("operations_revision=$7,operations_updated_at=now()");
    expect(update?.[0]).not.toContain("business_revision=");
  });
  it("사업 영역 저장도 운영 기록·버전을 덮어쓰지 않는다", async () => {
    const before = privateWorkspace();
    const input = projectWorkspaceScope(before, "business"); input.records[0].notes = "소유자의 사업 자료 수정";
    const f = fixture({ row: privateRow() });
    expect(await f.repository.save("owner", { ...request(input, 8), scope: "business" })).toMatchObject({ revision: 9, scope: "business" });
    const update = f.query.mock.calls.find(([sql]) => sql.startsWith("UPDATE admin_workspace"));
    const saved: AdminWorkspace = JSON.parse(String(update?.[1]?.[1]));
    expect(saved.records.find(record => record.id === "ops-1")).toEqual(before.records.find(record => record.id === "ops-1"));
    expect(update?.[0]).not.toContain("operations_revision=");
  });
  it("운영 요청에 사업 자료를 섞거나 숨긴 항목 ID를 덮어쓰는 시도를 거부한다", async () => {
    const f = fixture({ row: privateRow() });
    await expect(f.repository.save("outsider", request(privateWorkspace(), 2))).rejects.toMatchObject({ status: 403 });
    expect(f.connect).not.toHaveBeenCalled();
    const collision = operations(); collision.records.push({ ...collision.records[0], id: "task-01" });
    const error = await f.repository.save("outsider", request(collision, 2)).catch(error => error);
    expect(error).toMatchObject({ status: 403 });
    expect(JSON.stringify(error)).not.toContain("PRIVATE_");
    expect(mutations(f.query)).toHaveLength(0);
  });
  it.each([
    { title: "빈 보관함", create: createOperationsWorkspace },
    { title: "최초 사업 자료", create: createAdminWorkspace },
  ])("빈 비공개 영역에만 관리자의 명시적 소유권과 $title 요청을 기록한다", async ({ create }) => {
    const input = { ...request(create()), scope: "business" as const, claimBusinessOwnership: true };
    const f = fixture();
    expect(await f.repository.save("actor", input)).toMatchObject({ scope: "business", revision: 1 });
    expect(f.query.mock.calls.find(([sql]) => sql.startsWith("UPDATE admin_workspace"))?.[1]?.[7]).toBe("actor");
    expect(f.query.mock.calls.some(([sql, values]) => sql.startsWith("INSERT INTO admin_workspace_access_audit") && values?.[3] === "claim")).toBe(true);
    const notExplicit = fixture();
    await expect(notExplicit.repository.save("actor", { ...input, claimBusinessOwnership: false })).rejects.toMatchObject({ status: 403 });
    expect(mutations(notExplicit.query)).toHaveLength(0);
    for (const role of ["operator", "user", null]) {
      const denied = fixture({ role });
      await expect(denied.repository.save("actor", input)).rejects.toMatchObject({ status: 403 });
      expect(mutations(denied.query)).toHaveLength(0);
    }
  });
  it("빈 보관함 소유권 생성은 기존 운영 기록과 운영 버전을 보존한다", async () => {
    const before = operations();
    const f = fixture({ row: stored(before, 7) });
    const input = { ...request(createOperationsWorkspace()), scope: "business" as const, claimBusinessOwnership: true };
    expect(await f.repository.save("actor", input)).toMatchObject({ scope: "business", revision: 1, replayed: false });
    const update = f.query.mock.calls.find(([sql]) => sql.startsWith("UPDATE admin_workspace"));
    expect(JSON.parse(String(update?.[1]?.[1]))).toEqual(before);
    expect(update?.[1]).toEqual([8, JSON.stringify(before), adminWorkspaceDigest(before), "actor", "toonstudio", 7, 1, "actor"]);
    expect(update?.[0]).not.toContain("operations_revision=");
    expect(f.query.mock.calls.filter(([sql, values]) => sql.startsWith("INSERT INTO admin_workspace_access_audit") && values?.[3] === "claim")).toHaveLength(1);
    expect(f.query).toHaveBeenCalledWith("COMMIT");
  });
  it("owner 없는 기존 비공개 자료의 마지막 수정자가 자동 소유권을 얻지 않는다", async () => {
    const f = fixture({ row: { ...privateRow(), business_owner_user_id: null } });
    await expect(f.repository.read("actor", "business")).rejects.toMatchObject({ status: 403 });
    await expect(f.repository.save("actor", { ...request(projectWorkspaceScope(privateWorkspace(), "business"), 8), scope: "business", claimBusinessOwnership: true })).rejects.toMatchObject({ status: 403 });
    await expect(f.repository.save("actor", { ...request(createOperationsWorkspace(), 8), scope: "business", claimBusinessOwnership: true })).rejects.toMatchObject({ status: 403 });
    expect(mutations(f.query)).toHaveLength(0);
  });
  it("명시적 grant 회수는 과거 성공 저장의 재전송에도 적용된다", async () => {
    const input = { ...request(projectWorkspaceScope(privateWorkspace(), "business"), 7), scope: "business" as const };
    const f = fixture({ row: privateRow(), receipt: { ...receipt(input), scope: "business", accepted_scope_revision: 8 } });
    await expect(f.repository.save("former-editor", input)).rejects.toMatchObject({ status: 403 });
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith("SELECT request_digest"))).toBe(false);
  });
  it("권한 변경은 소유자만 하고 감사가 실패하면 grant도 롤백한다", async () => {
    const value = { userId: "editor", mutationId: randomUUID(), canRead: true, canWrite: true, canExport: false };
    const denied = fixture({ row: privateRow() });
    await expect(denied.repository.changeBusinessAccess("outsider", value)).rejects.toMatchObject({ status: 403 });
    expect(mutations(denied.query)).toHaveLength(0);
    const failed = fixture({ row: privateRow(), failOn: /^INSERT INTO admin_workspace_access_audit/u });
    await expect(failed.repository.changeBusinessAccess("owner", value)).rejects.toMatchObject({ status: 503 });
    expect(failed.query).toHaveBeenCalledWith("ROLLBACK");
    expect(failed.query).not.toHaveBeenCalledWith("COMMIT");
    const allowed = fixture({ row: privateRow() });
    expect(await allowed.repository.changeBusinessAccess("owner", value)).toEqual({ updatedAt: instant, replayed: false });
    expect(allowed.query.mock.calls.some(([sql, values]) => sql.startsWith("INSERT INTO admin_workspace_access_audit") && values?.[4] === "grant")).toBe(true);
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
