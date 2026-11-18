import { describe, expect, it } from "vitest";

import { exportDependencyReviewBoard, getRecordFreshness, updateDependencyRecord, validateDependencyReviewBoard } from "./dependency-review-model";
import { createDependencyReviewBoard } from "./dependency-review-seed";

import type { DependencyReviewBoard, ReviewRecord } from "./dependency-review-types";

const NOW = Date.parse("2026-11-19T12:00:00Z");
const OBSERVED_AT = "2026-11-19T11:58:00Z";
const OLD_SHA = "a2cf3525b93d287dd1c6436a04e8c0d10c597511";
const CI_URL = "https://github.com/blue45f/toonstudio/actions/runs/43971954681";

function record(board: DependencyReviewBoard, id: string): ReviewRecord {
  const found = board.records.find(item => item.id === id);
  if (!found) throw new Error(`테스트 기록 ${id}를 찾지 못했습니다.`);
  return found;
}

function currentBoard(): DependencyReviewBoard {
  const board = createDependencyReviewBoard(NOW);
  board.snapshot.checkedAt = OBSERVED_AT;
  return board;
}

function completionDraft(board: DependencyReviewBoard): ReviewRecord {
  const current = record(board, "build");
  current.status = "검토 필요";
  current.result = "미확인";
  current.verifiedAt = "";
  current.evidence = "이전 결과는 미확인";
  current.verificationSha = "";
  current.recordedResult = "미확인";
  current.links = [];
  current.ciLinks = "";
  return {
    ...current, status: "검증 완료", verifiedAt: OBSERVED_AT,
    verificationSha: board.snapshot.sha, recordedResult: "통과",
    evidence: `${board.snapshot.sha}의 실행 결과를 수동 대조했습니다.`, ciLinks: CI_URL,
  };
}

describe("의존성 검토의 기록 계약", () => {
  it("고정된 원인 2개·검사 5개·승인 4개·보관 1개를 손실 없이 내보낸다", () => {
    const board = currentBoard();
    const original = JSON.stringify(board);
    const restored = validateDependencyReviewBoard(JSON.parse(exportDependencyReviewBoard(board, NOW)), NOW);

    expect(restored).toEqual(board);
    expect(JSON.stringify(board)).toBe(original);
    expect(restored.records.filter(item => item.category === "cause")).toHaveLength(2);
    expect(restored.records.filter(item => item.category === "check")).toHaveLength(5);
    expect(restored.records.filter(item => item.category === "approval")).toHaveLength(4);
    expect(restored.records.filter(item => item.category === "archive")).toHaveLength(1);
    expect(record(restored, "player").causeIds).toEqual(["remotion"]);
    expect(record(restored, "core").causeIds).toEqual(["deepmerge"]);
    expect(record(restored, "archive2789")).toMatchObject({ category: "archive", status: "main 머지 완료", causeIds: [] });
  });

  it("누락·중복·분류 변경·다른 원인의 합치기를 거부한다", () => {
    const board = currentBoard();
    expect(() => validateDependencyReviewBoard({ ...board, records: board.records.slice(1) }, NOW)).toThrow();
    expect(() => validateDependencyReviewBoard({ ...board, records: [board.records[0], ...board.records.slice(0, -1)] }, NOW)).toThrow();
    for (const patch of [
      { id: "unknown-record" }, { category: "cause" }, { causeIds: ["deepmerge"] },
    ]) {
      const records = board.records.map(item => item.id === "build" ? { ...item, ...patch } : item);
      expect(() => validateDependencyReviewBoard({ ...board, records }, NOW)).toThrow();
    }
  });

  it("실행 승인 항목의 완료 전환과 해결된 #2789의 재개방을 차단한다", () => {
    const board = currentBoard();
    for (const item of board.records.filter(item => item.category === "approval" || item.category === "archive")) {
      const status = item.category === "approval" ? "검증 완료" : "진행 중";
      expect(() => validateDependencyReviewBoard({ ...board, records: board.records.map(current => current.id === item.id ? { ...current, status } : current) }, NOW)).toThrow();
      expect(() => updateDependencyRecord(board, { ...item, status }, NOW)).toThrow();
    }
  });

  it("메모 편집은 원본 결과·SHA·검증 시각을 보존하고 오래된 초안을 거부한다", () => {
    const board = currentBoard();
    const current = record(board, "build");
    const original = JSON.stringify(board);
    const draft = { ...current, notes: "다음 검토자가 확인할 메모", result: "위조 결과", snapshotSha: "b".repeat(40), provenance: "repository-snapshot" as const };
    const updated = updateDependencyRecord(board, draft, NOW);
    const saved = record(updated, "build");

    expect(saved).toMatchObject({ notes: draft.notes, result: current.result, snapshotSha: current.snapshotSha, verifiedAt: current.verifiedAt, provenance: "manual-record", edited: true, revision: current.revision + 1 });
    expect(saved.historicalResult).toBe(current.historicalResult);
    expect(updated.history[0]).toMatchObject({ recordId: current.id, createdAt: new Date(NOW).toISOString() });
    expect(JSON.stringify(board)).toBe(original);
    expect(() => updateDependencyRecord(updated, draft, NOW + 1)).toThrow(/변경|최신/u);
  });

  it("새 SHA의 수동 검증과 이전 snapshot의 관측 결과를 분리한다", () => {
    const board = currentBoard();
    const draft = completionDraft(board);
    record(board, "build").snapshotSha = OLD_SHA;
    const updated = updateDependencyRecord(board, { ...draft, snapshotSha: OLD_SHA }, NOW);
    const saved = record(updated, "build");

    expect(saved).toMatchObject({ status: "검증 완료", result: "미확인", snapshotSha: OLD_SHA, recordedResult: "통과", verificationSha: board.snapshot.sha, provenance: "manual-record" });
    expect(getRecordFreshness(saved, updated, NOW)).toMatchObject({ kind: "recorded", label: expect.stringContaining("수동") });
  });

  it("완료 전환은 새 날짜·근거·기준 SHA·통과 결과·저장소 증빙을 모두 요구한다", () => {
    const board = currentBoard();
    const draft = completionDraft(board);
    const current = record(board, "build");
    const invalid: Partial<ReviewRecord>[] = [
      { evidence: current.evidence }, { verifiedAt: current.verifiedAt },
      { verificationSha: "c".repeat(40) }, { evidence: "SHA 없는 수동 주장" },
      { recordedResult: "실패" }, { recordedResult: "미확인" },
      { ciLinks: "https://github.com/other/repository/actions/runs/1" },
      { ciLinks: "https://github.com.example.org/blue45f/toonstudio/actions/runs/1" },
    ];
    for (const patch of invalid) {
      expect(() => updateDependencyRecord(board, { ...draft, ...patch }, NOW)).toThrow();
    }
    expect(() => updateDependencyRecord(board, draft, NOW)).not.toThrow();
  });

  it("완료 후에도 모순된 검사 결과·SHA·근거를 차단하고 메모 편집은 허용한다", () => {
    const board = currentBoard();
    const completed = updateDependencyRecord(board, completionDraft(board), NOW);
    const saved = record(completed, "build");
    for (const patch of [
      { recordedResult: "실패" }, { verificationSha: "e".repeat(40) },
      { evidence: "기준 SHA가 빠진 새 문장" }, { ciLinks: "" },
    ]) {
      expect(() => updateDependencyRecord(completed, { ...saved, ...patch }, NOW + 1_000)).toThrow();
    }
    const noteOnly = updateDependencyRecord(completed, { ...saved, notes: "증빙은 유지하고 다음 조치만 설명" }, NOW + 1_000);
    expect(record(noteOnly, "build")).toMatchObject({ status: "검증 완료", recordedResult: "통과", verificationSha: saved.verificationSha, verifiedAt: saved.verifiedAt, evidence: saved.evidence });
  });

  it("잘못된 날짜·URL·위험한 JSON 키를 저장 가능한 보드로 인정하지 않는다", () => {
    const board = currentBoard();
    for (const patch of [
      { verifiedAt: "2026-02-30T12:00:00Z" }, { verifiedAt: "2026-11-19T12:06:00Z" },
      { ciLinks: "javascript:alert(1)" }, { ciLinks: "https://user:password@github.com/blue45f/toonstudio/actions/runs/1" },
    ]) {
      const records = board.records.map(item => item.id === "build" ? { ...item, ...patch } : item);
      expect(() => validateDependencyReviewBoard({ ...board, records }, NOW)).toThrow();
    }
    const poisoned = JSON.parse(JSON.stringify(board).replace('"records":', '"extra":{"__proto__":{"trusted":true}},"records":'));
    expect(() => validateDependencyReviewBoard(poisoned, NOW)).toThrow(/허용하지 않는 키/u);
  });

  it("각 필드가 허용 길이여도 전체 UTF-8 내보내기가 2MB를 넘으면 거부한다", () => {
    const board = currentBoard();
    for (const item of board.records) {
      for (const key of ["summary", "notes", "hypothesis", "patchDraft", "lockInterpretation"] as const) item[key] = "가".repeat(12_000);
    }
    expect(() => validateDependencyReviewBoard(board, NOW)).not.toThrow();
    expect(() => exportDependencyReviewBoard(board, NOW)).toThrow(/2MB/u);
  });
});

describe("의존성 검토 근거의 최신성", () => {
  it("가져온 완료 주장·누락·이전 SHA·TTL 초과를 유효한 현재 기록과 구분한다", () => {
    const board = currentBoard();
    const current = { ...record(board, "build"), snapshotSha: board.snapshot.sha, verificationSha: "", verifiedAt: OBSERVED_AT, evidence: "수동 대조 근거", provenance: "manual-record" as const };

    expect(getRecordFreshness(current, board, NOW).kind).toBe("recorded");
    expect(getRecordFreshness({ ...current, provenance: "sites-import" }, board, NOW).kind).toBe("review");
    expect(getRecordFreshness({ ...current, verifiedAt: "" }, board, NOW).kind).toBe("missing");
    expect(getRecordFreshness({ ...current, snapshotSha: "d".repeat(40) }, board, NOW).kind).toBe("stale");
    expect(getRecordFreshness(current, board, NOW + board.ttlHours * 3_600_000).kind).toBe("stale");
    const oldBaseline = { ...board, snapshot: { ...board.snapshot, checkedAt: new Date(NOW - (board.ttlHours + 1) * 3_600_000).toISOString() } };
    expect(getRecordFreshness(current, oldBaseline, NOW).kind).toBe("stale");
  });
});
