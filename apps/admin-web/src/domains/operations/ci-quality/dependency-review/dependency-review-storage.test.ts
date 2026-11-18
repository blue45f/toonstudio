import { describe, expect, it } from "vitest";

import { createQualityBoard, exportQualityBoardJson } from "../ci-quality-model";
import { getQualityStorageKey, loadQualityBoard } from "../ci-quality-storage";

import { updateDependencyRecord } from "./dependency-review-model";
import { createDependencyReviewBoard } from "./dependency-review-seed";
import { loadDependencyReviewBoard, saveDependencyReviewBoard } from "./dependency-review-storage";

import type { DependencyReviewBoard } from "./dependency-review-types";

const NOW = Date.parse("2026-11-19T12:00:00Z");

function memoryStorage() {
  const values = new Map<string, string>();
  let writes = 0;
  return {
    values, get writes() { return writes; },
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { writes += 1; values.set(key, value); },
  };
}

function withNote(board: DependencyReviewBoard, note: string): DependencyReviewBoard {
  const current = board.records.find(item => item.id === "build");
  if (!current) throw new Error("빌드 기록을 찾지 못했습니다.");
  return updateDependencyRecord(board, { ...current, notes: note }, NOW);
}

function note(board: DependencyReviewBoard | null): string | undefined {
  return board?.records.find(item => item.id === "build")?.notes;
}

describe("의존성 검토의 사용자별 브라우저 저장", () => {
  it("빈 저장소 읽기는 기록하지 않고 기존 CI·QA v1 저장과 독립적이다", () => {
    const storage = memoryStorage();
    const legacy = createQualityBoard(NOW);
    legacy.checks[0].summary = "기존 검증 결과를 보존해야 합니다.";
    legacy.approvals[0].note = "기존 승인 메모";
    const legacyJson = exportQualityBoardJson(legacy, NOW);
    const legacyKey = getQualityStorageKey("admin-a");
    storage.values.set(legacyKey, legacyJson);

    const loaded = loadDependencyReviewBoard("admin-a", storage, NOW);
    expect(loaded).toMatchObject({ board: { kind: "toonstudio-dependency-review" }, error: null, source: null });
    expect(storage.writes).toBe(0);
    expect(saveDependencyReviewBoard("admin-a", createDependencyReviewBoard(NOW), loaded.source, storage, NOW)).toMatchObject({ ok: true, error: null });
    expect(storage.values.size).toBe(2);
    expect(storage.values.get(legacyKey)).toBe(legacyJson);
    expect(loadQualityBoard("admin-a", storage, NOW).board).toEqual(legacy);
  });

  it("인증된 사용자마다 기록을 분리하고 저장 성공 후 재열기한다", () => {
    const storage = memoryStorage();
    const board = withNote(createDependencyReviewBoard(NOW), "관리자 A의 검토 메모");
    const saved = saveDependencyReviewBoard("admin:a", board, null, storage, NOW);
    expect(saved).toMatchObject({ ok: true, error: null });
    expect(note(loadDependencyReviewBoard("admin:a", storage, NOW).board)).toBe("관리자 A의 검토 메모");
    expect(note(loadDependencyReviewBoard("admin%3Aa", storage, NOW).board)).not.toBe("관리자 A의 검토 메모");
    expect(storage.writes).toBe(1);

    const anonymous = loadDependencyReviewBoard(" ", storage, NOW);
    expect(anonymous.board).toBeNull();
    expect(anonymous.error).toBeTruthy();
    expect(saveDependencyReviewBoard("", board, null, storage, NOW).ok).toBe(false);
    expect(storage.writes).toBe(1);
  });

  it("손상된 원본과 저장소 접근 오류를 빈 보드로 덮어쓰지 않는다", () => {
    const storage = memoryStorage();
    expect(saveDependencyReviewBoard("admin-a", createDependencyReviewBoard(NOW), null, storage, NOW).ok).toBe(true);
    const key = Array.from(storage.values.keys())[0];
    storage.values.set(key, "{broken");
    const loaded = loadDependencyReviewBoard("admin-a", storage, NOW);
    expect(loaded).toMatchObject({ board: null, source: "{broken" });
    expect(loaded.error).toBeTruthy();
    expect(storage.values.get(key)).toBe("{broken");
    expect(storage.writes).toBe(1);

    const blocked = { getItem: () => { throw new Error("접근 거부"); }, setItem: () => { throw new Error("접근 거부"); } };
    expect(loadDependencyReviewBoard("admin-a", blocked, NOW)).toMatchObject({ board: null, error: expect.stringContaining("접근 거부") });
    expect(loadDependencyReviewBoard("admin-a", null, NOW).board).toBeNull();
  });

  it("오래된 원본을 읽은 다른 창의 저장과 재시도가 최신 기록을 덮어쓰지 않는다", () => {
    const storage = memoryStorage();
    const first = loadDependencyReviewBoard("admin-a", storage, NOW);
    const second = loadDependencyReviewBoard("admin-a", storage, NOW);
    const boardA = withNote(createDependencyReviewBoard(NOW), "첫 창이 저장한 메모");
    const boardB = withNote(createDependencyReviewBoard(NOW), "둘째 창의 미저장 메모");
    expect(saveDependencyReviewBoard("admin-a", boardA, first.source, storage, NOW).ok).toBe(true);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect(saveDependencyReviewBoard("admin-a", boardB, second.source, storage, NOW)).toMatchObject({ ok: false, conflict: true });
    }
    expect(storage.writes).toBe(1);
    expect(note(loadDependencyReviewBoard("admin-a", storage, NOW).board)).toBe("첫 창이 저장한 메모");
    expect(note(boardB)).toBe("둘째 창의 미저장 메모");
  });

  it("반환된 원본으로 연속 저장하되 삭제되거나 읽지 못한 원본은 보호한다", () => {
    const storage = memoryStorage();
    const board = createDependencyReviewBoard(NOW);
    const first = saveDependencyReviewBoard("admin-a", board, null, storage, NOW);
    if (!first.ok) throw new Error(first.error ?? "초기 저장 실패");
    const updated = withNote(board, "두 번째 저장");
    const second = saveDependencyReviewBoard("admin-a", updated, first.source, storage, NOW);
    expect(second.ok).toBe(true);
    expect(note(loadDependencyReviewBoard("admin-a", storage, NOW).board)).toBe("두 번째 저장");

    storage.values.clear();
    expect(saveDependencyReviewBoard("admin-a", updated, first.source, storage, NOW)).toMatchObject({ ok: false, conflict: true });
    expect(saveDependencyReviewBoard("admin-a", updated, undefined, storage, NOW).ok).toBe(false);
    expect(storage.writes).toBe(2);
    expect(storage.values.size).toBe(0);
  });

  it("저장 용량·형식 오류를 성공으로 알리지 않고 입력 초안을 보존한다", () => {
    const board = withNote(createDependencyReviewBoard(NOW), "용량 실패 후에도 남아야 할 메모");
    const original = JSON.stringify(board);
    const quota = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } };
    expect(saveDependencyReviewBoard("admin-a", board, null, quota, NOW)).toMatchObject({ ok: false, error: expect.stringContaining("QuotaExceededError") });
    expect(JSON.stringify(board)).toBe(original);

    const storage = memoryStorage();
    const invalid = { ...board, records: board.records.slice(1) };
    expect(saveDependencyReviewBoard("admin-a", invalid, null, storage, NOW).ok).toBe(false);
    expect(storage.writes).toBe(0);
  });

  it("최종 내보내기가 2MB를 넘으면 작은 기존 저장본을 그대로 보존한다", () => {
    const storage = memoryStorage();
    const board = createDependencyReviewBoard(NOW);
    const initial = saveDependencyReviewBoard("admin-a", board, null, storage, NOW);
    if (!initial.ok) throw new Error(initial.error ?? "초기 저장 실패");
    for (const item of board.records) {
      for (const key of ["summary", "notes", "hypothesis", "patchDraft", "lockInterpretation"] as const) item[key] = "가".repeat(12_000);
    }
    expect(saveDependencyReviewBoard("admin-a", board, initial.source, storage, NOW)).toMatchObject({ ok: false, error: expect.stringContaining("2MB") });
    expect(storage.writes).toBe(1);
    expect(loadDependencyReviewBoard("admin-a", storage, NOW).source).toBe(initial.source);
  });
});
