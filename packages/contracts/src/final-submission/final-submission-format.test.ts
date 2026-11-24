import { describe, expect, it } from "vitest";

import {
  createEmptyFinalSubmissionBoard, parseFinalSubmissionBoard,
  reconcileFinalSubmissionBoard, validateBoard,
} from "./index";

import type { BoardState, DocumentRecord, Task } from "./types";

const at = "2026-01-15T12:00:00+09:00";
const proof = "https://example.invalid/format-evidence";

function finalize(task: Task): Task {
  return { ...task, status: "최종 확인", evidenceLinks: [{ label: "검수 근거", url: proof }],
    confirmedBy: "검수 담당자", confirmationNote: "파일 형식 대조 완료", lastConfirmedAt: at, unresolved: false };
}

function confirmedFormats(): BoardState {
  const board = createEmptyFinalSubmissionBoard();
  board.documents = board.documents.map((document) => ({
    ...document, fileName: `${document.id}-v1.docx`, version: "v1", sourceUrl: proof,
    availability: "내용 확인", expectedFormat: "DOCX", formatStatus: "적합 확인", bytes: "1024",
    notes: "파일 열기와 요구 형식 대조 완료", lastConfirmedAt: at,
    candidateState: "최종본 확정", candidateEvidence: proof, finalizedAt: at,
  }));
  board.tasks = board.tasks.map((task) => task.category === "파일 형식" || task.id === "DOC-01" ? finalize(task) : task);
  return board;
}

const formatChanges = [
  { label: "검수 결과에 문제 발견", patch: { formatStatus: "문제 확인" } },
  { label: "검수 결과를 미확인으로 변경", patch: { formatStatus: "미확인" } },
  { label: "요구 형식 변경", patch: { expectedFormat: "PDF" } },
  { label: "파일 확보 수준 변경", patch: { availability: "메타데이터 확인" } },
  { label: "검수 시점 변경", patch: { lastConfirmedAt: "2026-01-16T12:00:00+09:00" } },
  { label: "검수 근거와 결과 메모 변경", patch: { notes: "새 형식 요구사항의 적용 여부를 다시 확인해야 함" } },
  { label: "검수한 파일 크기 변경", patch: { bytes: "2048" } },
] as const satisfies ReadonlyArray<{ label: string; patch: Partial<DocumentRecord> }>;

describe("파일 형식 검수의 최종 확인 의존성", () => {
  it.each(formatChanges)("$label 시 연결 확인을 해제하고 직접 저장도 거절한다", ({ patch }) => {
    const previous = confirmedFormats();
    expect(validateBoard(previous)).toEqual([]);
    const candidate = structuredClone(previous);
    Object.assign(candidate.documents[0], patch);

    // UI 조정을 우회한 서버 입력도 이전 검수의 최종 확인을 유지할 수 없다.
    const direct = parseFinalSubmissionBoard(candidate, previous);
    expect(direct.ok).toBe(false);
    if (!direct.ok) expect(direct.errors.join(" ")).toContain("관련 파일의 기준·관측 변경을 먼저 서버에 저장");

    const reconciled = reconcileFinalSubmissionBoard(candidate, previous);
    expect(reconciled.tasks.find((task) => task.id === "FORMAT-01")).toMatchObject({
      status: "검토 필요", lastConfirmedAt: "", confirmedBy: "", confirmationNote: "", unresolved: true,
    });
    expect(reconciled.documents[0]).toMatchObject(patch);
    for (const id of ["FORMAT-02", "FORMAT-03", "DOC-01"]) {
      expect(reconciled.tasks.find((task) => task.id === id)).toEqual(previous.tasks.find((task) => task.id === id));
    }
    expect(validateBoard(reconciled, previous)).toEqual([]);
    expect(candidate.tasks.find((task) => task.id === "FORMAT-01")?.status).toBe("최종 확인");
    expect(previous.documents[0].formatStatus).toBe("적합 확인");
  });

  it.each(["report", "business", "ledger"])("%s 문서에 연결된 형식 항목만 다시 검토한다", (docId) => {
    const previous = confirmedFormats();
    const candidate = structuredClone(previous);
    candidate.documents.find((document) => document.id === docId)!.notes = "검수 근거 보완";
    const reconciled = reconcileFinalSubmissionBoard(candidate, previous);
    for (const task of reconciled.tasks.filter((item) => item.category === "파일 형식")) {
      expect(task.status).toBe(task.docId === docId ? "검토 필요" : "최종 확인");
    }
    expect(validateBoard(reconciled, previous)).toEqual([]);
  });

  it("형식 근거 변경과 최종 확인을 함께 저장할 수 없고, 변경을 저장한 뒤 재확인한다", () => {
    const previous = confirmedFormats();
    previous.tasks.find((task) => task.id === "FORMAT-01")!.status = "검토 필요";
    const candidate = structuredClone(previous);
    candidate.documents[0].notes = "검수 근거 보완 후 요구 형식 충족 확인";
    candidate.tasks = candidate.tasks.map((task) => task.id === "FORMAT-01" ? finalize(task) : task);
    expect(parseFinalSubmissionBoard(candidate, previous).ok).toBe(false);

    const savedChanges = reconcileFinalSubmissionBoard(candidate, previous);
    expect(validateBoard(savedChanges, previous)).toEqual([]);
    expect(savedChanges.tasks.find((task) => task.id === "FORMAT-01")?.status).toBe("검토 필요");
    const reconfirmed = structuredClone(savedChanges);
    reconfirmed.tasks = reconfirmed.tasks.map((task) => task.id === "FORMAT-01" ? finalize(task) : task);
    expect(validateBoard(reconfirmed, savedChanges)).toEqual([]);
  });

  it("형식과 관계없는 메타데이터 설명 변경은 검수 결과를 해제하지 않는다", () => {
    const previous = confirmedFormats();
    const candidate = structuredClone(previous);
    candidate.documents[0].metadataNote = "작성일 메타데이터 출처 설명 보완";
    expect(reconcileFinalSubmissionBoard(candidate, previous).tasks).toEqual(previous.tasks);
    expect(validateBoard(candidate, previous)).toEqual([]);
  });
});
