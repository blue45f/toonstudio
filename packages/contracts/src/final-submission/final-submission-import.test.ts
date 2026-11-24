import { describe, expect, it, vi } from "vitest";

import { createEmptyFinalSubmissionBoard, FINAL_SUBMISSION_IMPORT_MAX_BYTES, FINAL_SUBMISSION_MAX_BYTES, importFinalSubmissionBoard, parseFinalSubmissionBoard } from "./index";

const at = "2026-11-25T02:00:00+09:00";
function largeBoard() {
  const board = createEmptyFinalSubmissionBoard();
  board.sources = Array.from({ length: 170 }, (_, index) => ({ id: `proof-${index}`, title: "검토 근거", url: "", type: "검토", observedAt: "", note: "가".repeat(4000) }));
  return board;
}

describe("제출 점검 JSON 백업 복원 경계", () => {
  it("2MiB 이내 보드의 이력·들여쓰기 포함 백업이 2MiB를 넘어도 복원한다", () => {
    const board = largeBoard();
    board.revision = 100;
    const history = Array.from({ length: 100 }, (_, index) => ({ id: `change-${index}`, revision: index + 1, changedAt: at, summary: "기록".repeat(250) }));
    const exported = JSON.stringify({ board, history, exportedAt: at }, null, 2);
    expect(new TextEncoder().encode(JSON.stringify(board)).byteLength).toBeLessThan(FINAL_SUBMISSION_MAX_BYTES);
    expect(parseFinalSubmissionBoard(board).ok).toBe(true);
    expect(new TextEncoder().encode(exported).byteLength).toBeGreaterThan(FINAL_SUBMISSION_MAX_BYTES);
    expect(new TextEncoder().encode(exported).byteLength).toBeLessThan(FINAL_SUBMISSION_IMPORT_MAX_BYTES);
    const restored = importFinalSubmissionBoard(JSON.parse(exported), 0);
    expect(restored).toEqual({ ok: true, value: { ...board, revision: 0, updatedAt: "" } });
  });

  it("백업 한도 이내라도 내부 보드의 2MiB 제한은 유지한다", () => {
    const board = largeBoard();
    board.sources.push(...board.sources.slice(0, 30).map((source, index) => ({ ...source, id: `extra-${index}` })));
    const payload = { board, history: [], exportedAt: at };
    expect(new TextEncoder().encode(JSON.stringify(payload)).byteLength).toBeLessThan(FINAL_SUBMISSION_IMPORT_MAX_BYTES);
    expect(importFinalSubmissionBoard(payload, 0)).toEqual({ ok: false, errors: ["점검 기록은 2MB 이하여야 합니다."] });
    expect(importFinalSubmissionBoard(board, 0).ok).toBe(false);
  });

  it("백업 자체의 8MiB 제한과 안전한 JSON 검사도 유지한다", () => {
    const board = createEmptyFinalSubmissionBoard();
    expect(importFinalSubmissionBoard({ board, history: ["x".repeat(FINAL_SUBMISSION_IMPORT_MAX_BYTES)] }, 0)).toEqual({ ok: false, errors: ["점검 기록은 8MB 이하여야 합니다."] });
    const getter = vi.fn(() => board);
    const accessor = Object.defineProperty({}, "board", { enumerable: true, get: getter });
    expect(importFinalSubmissionBoard(accessor, 0).ok).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    const circular: Record<string, unknown> = { board };
    circular.history = circular;
    expect(importFinalSubmissionBoard(circular, 0).ok).toBe(false);
  });
});
