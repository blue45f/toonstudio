// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProductionDemoProject } from "./production-demo";
import { clearProductionCommandRecoveriesForActor, loadProductionCommandRecovery, productionCommandRecoveryKey,
  PRODUCTION_COMMAND_RECOVERY_TTL_MS, saveProductionCommandRecovery, type PendingProductionCommand } from "./production-command-recovery";

const request = (): PendingProductionCommand => ({ mutationId: "11111111-1111-4111-8111-111111111111", expectedRevision: 3,
  command: { type: "upsert-task", task: createProductionDemoProject().tasks[0] }, confirmedRevision: null, queuedAt: Date.now() });
beforeEach(() => window.sessionStorage.clear());
afterEach(() => { vi.restoreAllMocks(); window.sessionStorage.clear(); });

describe("탭 한정 제작 명령 복구 기록", () => {
  it("원래 요청과 confirmedRevision을 보존하고 다른 계정·프로젝트에는 반환하지 않는다", () => {
    const pending = { ...request(), confirmedRevision: 4 };
    expect(saveProductionCommandRecovery("actor-a", "project-a", pending)).toBe(true);
    expect(loadProductionCommandRecovery("actor-a", "project-a")).toEqual(pending);
    expect(loadProductionCommandRecovery("actor-b", "project-a")).toBeNull();
    expect(loadProductionCommandRecovery("actor-a", "project-b")).toBeNull();
    saveProductionCommandRecovery("actor-b", "project-a", pending);
    clearProductionCommandRecoveriesForActor("actor-a");
    expect(loadProductionCommandRecovery("actor-a", "project-a")).toBeNull();
    expect(loadProductionCommandRecovery("actor-b", "project-a")).toEqual(pending);
  });
  it("버전·계정·TTL·요청 형식이 잘못된 기록은 폐기한다", () => {
    const pending = request();
    const key = productionCommandRecoveryKey("actor-a", "project-a");
    for (const value of [
      { version: 2, actorId: "actor-a", projectId: "project-a", request: pending },
      { version: 1, actorId: "other", projectId: "project-a", request: pending },
      { version: 1, actorId: "actor-a", projectId: "project-a", request: { ...pending, mutationId: "bad" } },
      { version: 1, actorId: "actor-a", projectId: "project-a", request: { ...pending, expectedRevision: -1 } },
    ]) {
      window.sessionStorage.setItem(key, JSON.stringify(value));
      expect(loadProductionCommandRecovery("actor-a", "project-a")).toBeNull();
      expect(window.sessionStorage.getItem(key)).toBeNull();
    }
    saveProductionCommandRecovery("actor-a", "project-a", pending);
    expect(loadProductionCommandRecovery("actor-a", "project-a", pending.queuedAt + PRODUCTION_COMMAND_RECOVERY_TTL_MS)).toBeNull();
  });
  it("상업·통합·외부 검수 명령과 비밀 필드가 섞인 본문은 보관하지 않는다", () => {
    for (const command of [
      { type: "upsert-commercial-record", record: {} },
      { type: "upsert-operations-record", record: { kind: "integration" } },
      { type: "create-external-review", review: {} },
      { type: "upsert-task", task: { ...createProductionDemoProject().tasks[0], accessToken: "placeholder" } },
    ]) expect(saveProductionCommandRecovery("actor-a", "project-a", { ...request(), command })).toBe(false);
    expect(window.sessionStorage.length).toBe(0);
  });
  it("저장소 quota 오류를 성공으로 표시하지 않는다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("quota", "QuotaExceededError"); });
    expect(saveProductionCommandRecovery("actor-a", "project-a", request())).toBe(false);
  });
});
