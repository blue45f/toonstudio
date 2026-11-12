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
    expect(saveQualityBoard("admin-a", board, null, storage, NOW)).toMatchObject({ ok: true, error: null });
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
    expect(saveQualityBoard("admin-a", createQualityBoard(NOW), null, blocked, NOW)).toMatchObject({ ok: false, error: expect.stringContaining("QuotaExceededError") });
    const storage = memoryStorage();
    const invalid = createQualityBoard(NOW);
    Object.assign(invalid.qa, { integration: "active" });
    expect(saveQualityBoard("admin-a", invalid, null, storage, NOW).ok).toBe(false);
    expect(storage.writes).toBe(0);
  });

  it("동일 원본을 읽은 두 창의 뒤늦은 저장과 재시도가 최신 기록을 덮어쓰지 않는다", () => {
    const storage = memoryStorage();
    const first = loadQualityBoard("admin-a", storage, NOW);
    const second = loadQualityBoard("admin-a", storage, NOW);
    const boardA = createQualityBoard(NOW);
    boardA.checks[0].summary = "첫 창의 검증 결과";
    const saved = saveQualityBoard("admin-a", boardA, first.source, storage, NOW);
    expect(saved.ok).toBe(true);
    const boardB = createQualityBoard(NOW);
    boardB.approvals[0].note = "둘째 창의 승인 메모";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect(saveQualityBoard("admin-a", boardB, second.source, storage, NOW)).toMatchObject({ ok: false, conflict: true });
    }
    expect(storage.writes).toBe(1);
    expect(loadQualityBoard("admin-a", storage, NOW).board?.checks[0].summary).toBe("첫 창의 검증 결과");

    const latest = loadQualityBoard("admin-a", storage, NOW);
    expect(saveQualityBoard("admin-a", { ...boardA, approvals: boardB.approvals }, latest.source, storage, NOW).ok).toBe(true);
    expect(loadQualityBoard("admin-a", storage, NOW).board?.approvals[0].note).toBe("둘째 창의 승인 메모");
    expect(loadQualityBoard("admin-a", storage, NOW).board?.checks[0].summary).toBe("첫 창의 검증 결과");
  });

  it("같은 창의 연속 저장은 반환된 원본으로 갱신하고 삭제·미확인 원본은 보호한다", () => {
    const storage = memoryStorage();
    const board = createQualityBoard(NOW);
    const first = saveQualityBoard("admin-a", board, null, storage, NOW);
    if (!first.ok) throw new Error(first.error);
    board.checks[0].summary = "연속 저장";
    const second = saveQualityBoard("admin-a", board, first.source, storage, NOW);
    expect(second.ok).toBe(true);
    storage.values.delete(getQualityStorageKey("admin-a"));
    if (!second.ok) throw new Error(second.error);
    expect(saveQualityBoard("admin-a", board, second.source, storage, NOW)).toMatchObject({ ok: false, conflict: true });
    expect(saveQualityBoard("admin-a", board, undefined, storage, NOW).ok).toBe(false);
    expect(storage.writes).toBe(2);
  });
});
