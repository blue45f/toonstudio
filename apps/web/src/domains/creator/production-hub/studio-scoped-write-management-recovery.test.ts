// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearScopedManagementRecovery, loadScopedManagementRecovery, saveScopedManagementRecovery, scopedManagementRecoveryKey } from "./studio-scoped-write-management-recovery";
import { scopedManagementRequest } from "./studio-scoped-write-management-model";

beforeEach(() => { window.sessionStorage.clear(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-29T06:00:00.000Z")); });
afterEach(() => vi.useRealTimers());
describe("편집 권한 요청의 결과 미확인 복구", () => {
  it("actor/work에 묶은 동일 mutation·본문만 새로고침 뒤 복구한다", () => {
    const request = scopedManagementRequest(2, { type: "revoke-grant", grantId: "grant" });
    expect(saveScopedManagementRecovery("owner", "work", request)).toBe(true);
    expect(loadScopedManagementRecovery("owner", "work")).toEqual(request);
    expect(loadScopedManagementRecovery("other", "work")).toBeNull();
    expect(loadScopedManagementRecovery("owner", "other")).toBeNull();
    clearScopedManagementRecovery("owner", "work");
    expect(loadScopedManagementRecovery("owner", "work")).toBeNull();
  });
  it("새 task 없는 grant·추가 키·만료 기록은 네트워크 요청 없이 폐기한다", () => {
    const request = scopedManagementRequest(2, { type: "revoke-target", targetId: "target" });
    const key = scopedManagementRecoveryKey("owner", "work");
    window.sessionStorage.setItem(key, JSON.stringify({ version: 1, actorId: "owner", workId: "work", queuedAt: Date.now(), request: { ...request, unrecognized: true } }));
    expect(loadScopedManagementRecovery("owner", "work")).toBeNull();
    saveScopedManagementRecovery("owner", "work", request);
    vi.setSystemTime(new Date("2026-11-06T06:00:00.000Z"));
    expect(loadScopedManagementRecovery("owner", "work")).toBeNull();
  });
});
