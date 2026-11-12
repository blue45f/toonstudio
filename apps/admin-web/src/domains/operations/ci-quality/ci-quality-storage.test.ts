import { describe, expect, it } from "vitest";

import { createQualityBoard } from "./ci-quality-model";
import { getQualityStorageKey, loadQualityBoard, saveQualityBoard } from "./ci-quality-storage";

import type { QualityStorage } from "./ci-quality-storage";

const NOW = Date.parse("2026-11-12T08:00:00Z");
function memoryStorage() {
  const values = new Map<string, string>();
  let writes = 0;
  return { values, get writes() { return writes; }, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { writes += 1; values.set(key, value); } };
}

describe("관리자별 CI·QA 로컬 저장", () => {
  it("빈 저장소는 초기 보드를 제공하되 읽기로 저장하지 않는다", () => {
    const storage = memoryStorage();
    expect(loadQualityBoard("admin-a", storage, NOW)).toMatchObject({ board: { project: "ToonStudio" }, error: null });
    expect(storage.writes).toBe(0);
  });

  it("인증된 사용자별로 저장을 분리하고 결과·분석·메모를 재열기한다", () => {
    const storage = memoryStorage();
    const board = createQualityBoard(NOW);
    board.checks[0].status = "failed";
    board.checks[0].failure.cause = "추정한 원인";
    board.approvals[0].note = "변경 제안";
    expect(saveQualityBoard("admin-a", board, storage, NOW)).toEqual({ ok: true, error: null });
    expect(loadQualityBoard("admin-a", storage, NOW).board?.checks[0].failure.cause).toBe("추정한 원인");
    expect(loadQualityBoard("admin-a", storage, NOW).board?.approvals[0].note).toBe("변경 제안");
    expect(loadQualityBoard("admin-b", storage, NOW).board?.checks[0].status).toBe("unknown");
    expect(getQualityStorageKey("admin:a")).not.toBe(getQualityStorageKey("admin%3Aa"));
    expect(() => getQualityStorageKey(" ")).toThrow(/식별자/u);
    expect(loadQualityBoard("", storage, NOW).board).toBeNull();
  });

  it("손상된 원본과 읽기 오류를 빈 저장소로 취급하지 않는다", () => {
    const storage = memoryStorage();
    const key = getQualityStorageKey("admin-a");
    storage.values.set(key, "{broken");
    const result = loadQualityBoard("admin-a", storage, NOW);
    expect(result.board).toBeNull();
    expect(result.error).toContain("자동으로 덮어쓰지");
    expect(storage.values.get(key)).toBe("{broken");
    expect(storage.writes).toBe(0);
    const blocked: QualityStorage = { getItem: () => { throw new Error("접근 거부"); }, setItem: () => { throw new Error("접근 거부"); } };
    expect(loadQualityBoard("admin-a", blocked, NOW).error).toContain("접근 거부");
    expect(loadQualityBoard("admin-a", null, NOW).board).toBeNull();
  });

  it("저장 한도·권한·검증 실패를 성공으로 표시하지 않는다", () => {
    const blocked: QualityStorage = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } };
    expect(saveQualityBoard("admin-a", createQualityBoard(NOW), blocked, NOW)).toMatchObject({ ok: false, error: expect.stringContaining("QuotaExceededError") });
    const storage = memoryStorage();
    const invalid = createQualityBoard(NOW);
    Object.assign(invalid.qa, { integration: "active" });
    expect(saveQualityBoard("admin-a", invalid, storage, NOW).ok).toBe(false);
    expect(storage.writes).toBe(0);
  });
});
