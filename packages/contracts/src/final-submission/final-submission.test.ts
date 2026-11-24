import { describe, expect, it } from "vitest";

import {
  createEmptyFinalSubmissionBoard, importFinalSubmissionBoard, isFinalSubmissionDate,
  parseFinalSubmissionBoard, reconcileFinalSubmissionBoard, STATUSES, validateBoard,
} from "./index";

import type { BoardState, Task } from "./types";

const at = "2026-01-15T12:00:00+09:00";
const proof = "https://example.invalid/evidence";
function finalize(task: Task): Task {
  return { ...task, status: "최종 확인", evidenceLinks: [{ label: "확인 근거", url: proof }], confirmedBy: "확인 담당자", confirmationNote: "대조 완료", lastConfirmedAt: at, unresolved: false };
}
function confirmedBoard(): BoardState {
  const board = createEmptyFinalSubmissionBoard();
  board.documents[0] = {
    ...board.documents[0], fileName: "report-v1.docx", version: "v1", sourceUrl: proof, availability: "내용 확인",
    candidateState: "최종본 확정", candidateEvidence: proof, finalizedAt: at, formatStatus: "적합 확인", notes: "형식 검사 완료", lastConfirmedAt: at,
    platform: { ...board.documents[0].platform, status: "제출 확인", fileName: "report-v1.docx", version: "v1", evidenceUrl: proof, observedAt: at, comparison: "일치 확인", comparisonNote: "양쪽 파일 대조 완료" },
  };
  board.documents = board.documents.map((doc) => doc.id === "report" ? doc : {
    ...doc, fileName: `${doc.id}-v1.docx`, version: "v1", sourceUrl: proof,
    platform: { ...doc.platform, status: "제출 확인", fileName: `${doc.id}-v1.docx`, version: "v1", evidenceUrl: proof, observedAt: at, comparison: "일치 확인", comparisonNote: "양쪽 파일 대조 완료" },
  });
  board.tasks = board.tasks.map((task) => task.id === "DOC-01" || task.id === "PLATFORM-01" || task.id === "MATCH-02" ? finalize(task) : task);
  return board;
}

describe("1R 최종 제출 기록 계약", () => {
  it("개인 자료가 없는 3개 문서·13개 점검·4개 승인 대기를 만든다", () => {
    const board = createEmptyFinalSubmissionBoard();
    expect(STATUSES).toEqual(["미확인", "검토 필요", "보완 중", "승인 대기", "최종 확인"]);
    expect(validateBoard(board)).toEqual([]);
    expect(board.documents).toHaveLength(3);
    expect(board.tasks.filter((task) => !task.approvalRequired)).toHaveLength(13);
    expect(board.tasks.filter((task) => task.approvalRequired)).toHaveLength(4);
    expect(board.documents.every((doc) => !doc.fileName && !doc.sourceUrl && doc.platform.status === "미확인")).toBe(true);
    expect(board.sources).toEqual([]);
  });

  it.each([null, undefined, 5, [], { schemaVersion: 1 }, { documents: [null] }])("잘못된 외부 값 %j를 예외 없이 거절한다", (value) => {
    expect(() => parseFinalSubmissionBoard(value)).not.toThrow();
    expect(parseFinalSubmissionBoard(value).ok).toBe(false);
  });

  it("순환 참조·프로토타입·접근자·미등록 속성을 거절한다", () => {
    const board = createEmptyFinalSubmissionBoard();
    const cyclic: Record<string, unknown> = { board }; cyclic.self = cyclic;
    const getter = Object.defineProperty({}, "board", { enumerable: true, get: () => { throw new Error("실행하면 안 됨"); } });
    for (const value of [cyclic, getter, Object.create({ ...board }), { ...board, ownerUserId: "forged" }, JSON.parse('{"__proto__":{"polluted":true}}')]) expect(parseFinalSubmissionBoard(value).ok).toBe(false);
    expect(Object.getPrototypeOf(board)).toBe(Object.prototype);
  });

  it("초기 가져오기에서도 고정 승인 항목의 삭제·해제·완료·이름 변경을 허용하지 않는다", () => {
    for (const mutation of ["remove", "unlock", "complete", "rename", "resolve"] as const) {
      const board = createEmptyFinalSubmissionBoard();
      const task = board.tasks.find((item) => item.id === "ACTION-01")!;
      if (mutation === "remove") board.tasks = board.tasks.filter((item) => item.id !== task.id);
      if (mutation === "unlock") task.approvalRequired = false;
      if (mutation === "complete") task.status = "최종 확인";
      if (mutation === "rename") task.title = "일반 점검";
      if (mutation === "resolve") task.unresolved = false;
      expect(parseFinalSubmissionBoard(board).ok).toBe(false);
    }
  });

  it("근거 없는 플랫폼 제출·첨부 일치 판정을 거절한다", () => {
    const board = createEmptyFinalSubmissionBoard();
    board.documents[0].platform.status = "제출 확인";
    board.documents[0].platform.comparison = "일치 확인";
    expect(validateBoard(board).join(" ")).toContain("플랫폼 근거");
    expect(validateBoard(board).join(" ")).toContain("양쪽 파일명");
  });

  it("일치 판정과 서로 다른 SHA256 해시를 함께 저장하지 못한다", () => {
    const board = confirmedBoard();
    board.documents[0].fileHash = "a".repeat(64);
    board.documents[0].platform.hash = `sha256:${"b".repeat(64)}`;
    expect(validateBoard(board).join(" ")).toContain("파일 해시가 달라");
  });

  it("최종 확인에는 증빙·확인자·확인 결과·시각·불일치 해소가 필요하다", () => {
    for (const key of ["evidenceLinks", "confirmedBy", "confirmationNote", "lastConfirmedAt", "unresolved"] as const) {
      const board = confirmedBoard(); const task = board.tasks.find((item) => item.id === "MATCH-02")!;
      if (key === "evidenceLinks") task[key] = [];
      else if (key === "unresolved") task[key] = true;
      else task[key] = "";
      expect(parseFinalSubmissionBoard(board).ok).toBe(false);
    }
  });

  it("연결 문서의 관측이나 최종 후보가 없으면 관련 최종 확인을 거절한다", () => {
    const board = confirmedBoard();
    board.documents[0].candidateState = "미확인";
    board.documents[0].platform.status = "미확인";
    expect(validateBoard(board).join(" ")).toContain("최종 후보");
    expect(validateBoard(board).join(" ")).toContain("제출 여부");
  });

  it("파일 식별 정보가 바뀌면 최종본·형식·첨부·연결 최종 확인을 해제한다", () => {
    const previous = confirmedBoard();
    const next = structuredClone(previous); next.documents[0].version = "v2";
    expect(parseFinalSubmissionBoard(next, previous).ok).toBe(false);
    expect(validateBoard(next, previous).join(" ")).toContain("먼저 서버에 저장한 뒤");
    const reconciled = reconcileFinalSubmissionBoard(next, previous);
    expect(reconciled.documents[0].candidateState).toBe("검토 후보");
    expect(reconciled.documents[0].formatStatus).toBe("미확인");
    expect(reconciled.documents[0].platform.comparison).toBe("미확인");
    expect(reconciled.tasks.filter((task) => task.docId === "report").every((task) => task.status !== "최종 확인")).toBe(true);
    expect(validateBoard(reconciled, previous)).toEqual([]);
    expect(previous.documents[0].version).toBe("v1");
  });

  it.each(["fileName", "version", "hash"] as const)("플랫폼 %s 변경은 기존 첨부 일치 판정과 관련 최종 확인을 해제한다", (key) => {
    const previous = confirmedBoard(); const next = structuredClone(previous);
    next.documents[0].platform[key] = key === "hash" ? "b".repeat(64) : "changed";
    expect(validateBoard(next, previous).join(" ")).toContain("플랫폼 파일 변경을 먼저 서버에 저장한 뒤");
    const reconciled = reconcileFinalSubmissionBoard(next, previous);
    expect(reconciled.documents[0].platform.comparison).toBe("미확인");
    expect(reconciled.documents[0].platform.comparisonNote).toBe("플랫폼 첨부 파일 변경으로 재대조 필요");
    expect(reconciled.tasks.find((task) => task.id === "PLATFORM-01")?.status).toBe("검토 필요");
    expect(reconciled.tasks.find((task) => task.id === "DOC-01")?.status).toBe("최종 확인");
    expect(validateBoard(reconciled, previous)).toEqual([]);
  });

  it("플랫폼 관측 변경은 플랫폼 확인만, 개별 증빙 변경은 해당 확인을 다시 연다", () => {
    const previous = confirmedBoard(); const next = structuredClone(previous);
    next.documents[0].platform.receipt = "관측 기록 변경";
    const reconciled = reconcileFinalSubmissionBoard(next, previous);
    expect(reconciled.tasks.find((task) => task.id === "PLATFORM-01")?.status).toBe("검토 필요");
    expect(reconciled.tasks.find((task) => task.id === "DOC-01")?.status).toBe("최종 확인");
    const taskChanged = structuredClone(previous);
    taskChanged.tasks.find((task) => task.id === "MATCH-02")!.evidenceLinks = [{ label: "변경 근거", url: "https://example.invalid/revised" }];
    expect(parseFinalSubmissionBoard(taskChanged, previous).ok).toBe(false);
    expect(reconcileFinalSubmissionBoard(taskChanged, previous).tasks.find((task) => task.id === "MATCH-02")?.status).toBe("검토 필요");
  });

  it.each([["MATCH-01", "report"], ["MATCH-02", "ledger"]] as const)("%s는 직접 연결한 문서 외 %s 파일 변경도 재대조한다", (taskId, documentId) => {
    for (const key of ["fileName", "version", "fileHash", "sourceUrl"] as const) {
      const previous = createEmptyFinalSubmissionBoard();
      previous.tasks = previous.tasks.map((task) => task.id === taskId ? finalize(task) : task);
      const next = structuredClone(previous);
      next.documents.find((doc) => doc.id === documentId)![key] = key === "sourceUrl" ? proof : "changed";
      expect(parseFinalSubmissionBoard(next, previous).ok).toBe(false);
      const reconciled = reconcileFinalSubmissionBoard(next, previous);
      expect(reconciled.tasks.find((task) => task.id === taskId)?.status).toBe("검토 필요");
      expect(validateBoard(reconciled, previous)).toEqual([]);
    }
  });

  it("전체 플랫폼 점검은 필수 세 문서의 제출 여부와 첨부 비교가 모두 확인되어야 한다", () => {
    const confirmed = confirmedBoard();
    expect(validateBoard(confirmed)).toEqual([]);
    for (const id of ["report", "business", "ledger"]) {
      for (const key of ["status", "comparison"] as const) {
        const next = structuredClone(confirmed);
        next.documents.find((doc) => doc.id === id)!.platform[key] = "미확인";
        expect(validateBoard(next).join(" ")).toContain("세 문서 모두의 제출 여부와 첨부 비교");
      }
    }
    const renamedCategory = structuredClone(confirmed);
    renamedCategory.tasks.find((task) => task.id === "PLATFORM-01")!.category = "첨부 파일";
    renamedCategory.documents[1].platform.status = "미확인";
    expect(parseFinalSubmissionBoard(renamedCategory).ok).toBe(false);
  });

  it.each(["report", "business", "ledger"])("전체 플랫폼 점검은 %s 문서의 기준이나 관측 변경에도 재검토한다", (id) => {
    for (const kind of ["identity", "observation"]) {
      const previous = confirmedBoard(); const next = structuredClone(previous);
      const doc = next.documents.find((item) => item.id === id)!;
      if (kind === "identity") doc.version = "v2";
      else doc.platform.receipt = "변경된 관측 기록";
      expect(parseFinalSubmissionBoard(next, previous).ok).toBe(false);
      const reconciled = reconcileFinalSubmissionBoard(next, previous);
      expect(reconciled.tasks.find((task) => task.id === "PLATFORM-01")?.status).toBe("검토 필요");
      expect(validateBoard(reconciled, previous)).toEqual([]);
    }
  });

  it("기존 미완료 작업도 같은 변경에서 기준 파일 변경과 최종 확인을 함께 저장하지 못한다", () => {
    const previous = confirmedBoard();
    previous.tasks.find((task) => task.id === "PLATFORM-01")!.status = "검토 필요";
    const next = structuredClone(previous);
    next.documents[1].version = "v2";
    next.tasks = next.tasks.map((task) => task.id === "PLATFORM-01" ? finalize(task) : task);
    expect(parseFinalSubmissionBoard(next, previous).ok).toBe(false);
    expect(reconcileFinalSubmissionBoard(next, previous).tasks.find((task) => task.id === "PLATFORM-01")?.status).toBe("검토 필요");
  });

  it("일반 플랫폼 점검은 연결한 문서 하나의 관측을 기준으로 한다", () => {
    const board = confirmedBoard();
    const global = board.tasks.find((task) => task.id === "PLATFORM-01")!;
    board.tasks.push({ ...structuredClone(global), id: "PLATFORM-SINGLE", title: "보고서 플랫폼 관측", docId: "report" });
    global.status = "미확인";
    for (const doc of board.documents.filter((item) => item.id !== "report")) {
      doc.platform.status = "미확인"; doc.platform.comparison = "미확인";
    }
    expect(validateBoard(board)).toEqual([]);
    const next = structuredClone(board); next.documents[1].platform.receipt = "사업계획서 관측 변경";
    expect(reconcileFinalSubmissionBoard(next, board).tasks.find((task) => task.id === "PLATFORM-SINGLE")?.status).toBe("최종 확인");
  });

  it("필수 문서·중복 ID·깨진 참조·안전하지 않은 링크를 거절한다", () => {
    const cases = [createEmptyFinalSubmissionBoard(), createEmptyFinalSubmissionBoard(), createEmptyFinalSubmissionBoard(), createEmptyFinalSubmissionBoard()];
    cases[0].documents = cases[0].documents.filter((doc) => doc.id !== "ledger");
    cases[1].tasks.push(structuredClone(cases[1].tasks[0]));
    cases[2].tasks[0].docId = "missing";
    cases[3].documents[0].sourceUrl = "https://name:password@example.invalid/file";
    for (const board of cases) expect(parseFinalSubmissionBoard(board).ok).toBe(false);
  });

  it("없는 날짜·24시·윤초를 거절하고 날짜 미확인과 정상 KST 시각을 허용한다", () => {
    for (const value of ["2026-02-30", "2026-01-15T24:00:00+09:00", "2026-01-15T12:00:60+09:00"]) expect(isFinalSubmissionDate(value)).toBe(false);
    for (const value of ["", "2026-01-15", at, "2024-02-29"]) expect(isFinalSubmissionDate(value)).toBe(true);
  });

  it("Sites 내보내기는 검토용 사본으로 가져오고 어드민 저장 버전으로 바꾼다", () => {
    const source = confirmedBoard(); source.revision = 14; source.updatedAt = at;
    const result = importFinalSubmissionBoard({ board: source, history: [{ id: "source-history", revision: 14, changedAt: at, summary: "원본 기록" }], exportedAt: at }, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.revision).toBe(0); expect(result.value.updatedAt).toBe("");
    expect(result.value.documents).toEqual(source.documents);
    expect(source.revision).toBe(14);
  });

  it("가져오기에서 현재 승인 잠금과 자료 변경 후 재검토를 유지한다", () => {
    const previous = confirmedBoard(); previous.revision = 8;
    const source = structuredClone(previous); source.documents[0].version = "v2";
    const result = importFinalSubmissionBoard({ board: source }, 8, previous);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.documents[0].candidateState).toBe("검토 후보");
    expect(result.value.tasks.filter((task) => task.approvalRequired).every((task) => task.status === "승인 대기")).toBe(true);
  });

  it("크기 제한과 허용되지 않는 예전 상태를 거절한다", () => {
    const board = createEmptyFinalSubmissionBoard();
    expect(importFinalSubmissionBoard({ board, extra: "x".repeat(2 * 1024 * 1024) }, 0).ok).toBe(false);
    expect(parseFinalSubmissionBoard({ ...board, tasks: [{ ...board.tasks[0], status: "보완 완료" }, ...board.tasks.slice(1)] }).ok).toBe(false);
  });
});
