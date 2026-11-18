import { describe, expect, it } from "vitest";

import { createAdminWorkspace, createWorkspaceRecord } from "./domain";
import { createOperationsWorkspace, hasPrivateWorkspaceData, projectWorkspaceScope } from "./projection";
import { parseAdminWorkspace, parseAdminWorkspaceSave, parseAdminWorkspaceSaveAck, parseAdminWorkspaceView } from "./validation";

const access = {
  operations: { canRead: true, canWrite: true, canExport: true, canManageAccess: false },
  business: { canRead: false, canWrite: false, canExport: false, canManageAccess: false },
};
const view = () => ({ boardId: "toonstudio", revision: 0, state: createOperationsWorkspace(), updatedAt: null, canEdit: true, scope: "operations", access });

describe("관리자 작업실 접근 계약", () => {
  it("운영 초기 상태는 사업 문서·개인 점검 항목을 생성하지 않는다", () => {
    const state = createOperationsWorkspace();
    expect(hasPrivateWorkspaceData(state)).toBe(false);
    expect(parseAdminWorkspace(state).ok).toBe(true);
    expect(state.records).toEqual([]);
    expect(state.documents).toEqual([]);
  });
  it("이전 전체 공개 API 응답이나 모순된 권한 응답은 사용하지 않는다", () => {
    const legacy = { ...view(), state: createAdminWorkspace() };
    expect(parseAdminWorkspaceView({ ...legacy, scope: undefined, access: undefined }).ok).toBe(false);
    expect(parseAdminWorkspaceView(legacy).ok).toBe(false);
    expect(parseAdminWorkspaceView({ ...view(), access: { ...access, operations: { ...access.operations, canRead: false } } }).ok).toBe(false);
    expect(parseAdminWorkspaceView({ ...view(), canEdit: false }).ok).toBe(false);
    expect(parseAdminWorkspaceView(view()).ok).toBe(true);
  });
  it("운영 응답에서 숨긴 business task 연결과 비공개 sidecar를 제거한다", () => {
    const state = createAdminWorkspace();
    const operation = { ...createWorkspaceRecord("ops-task", "ai", "task"), title: "운영", taskId: state.records[0].id };
    state.records.push(operation);
    state.documents[0].working.content = "private-business-content";
    const projected = projectWorkspaceScope(state, "operations");
    expect(projected.records).toHaveLength(1);
    expect(projected.records[0].taskId).toBe("");
    expect(JSON.stringify(projected)).not.toContain("private-business-content");
    expect(parseAdminWorkspace(projected).ok).toBe(true);
    expect(state.records.at(-1)?.taskId).toBe("task-01");
  });
  it("새 business 소유권은 명시적인 business 저장에만 요청할 수 있다", () => {
    const request = { expectedRevision: 0, mutationId: "11111111-1111-4111-8111-111111111111", state: createOperationsWorkspace() };
    expect(parseAdminWorkspaceSave(request)).toMatchObject({ ok: true, value: { scope: "operations" } });
    for (const scope of [null, "all", "private"]) expect(parseAdminWorkspaceSave({ ...request, scope }).ok).toBe(false);
    expect(parseAdminWorkspaceSave({ ...request, claimBusinessOwnership: true }).ok).toBe(false);
    expect(parseAdminWorkspaceSave({ ...request, scope: "business", claimBusinessOwnership: true }).ok).toBe(true);
    expect(parseAdminWorkspaceSave({ ...request, ownerUserId: "another-user" }).ok).toBe(false);
  });
  it("저장 범위가 없는 구버전 승인 응답을 현재 영역의 저장 성공으로 쓰지 않는다", () => {
    const ack = { boardId: "toonstudio", revision: 1, updatedAt: "2026-11-17T00:00:00.000Z", replayed: false };
    expect(parseAdminWorkspaceSaveAck(ack).ok).toBe(false);
    expect(parseAdminWorkspaceSaveAck({ ...ack, scope: "operations" }).ok).toBe(true);
  });
});
