import { checkJsonInput, finalSubmissionBoardSchema } from "./schema";
import { finalSubmissionTransitionErrors } from "./transitions";
import { GLOBAL_PLATFORM_TASK_ID, REQUIRED_APPROVALS, REQUIRED_DOCUMENT_IDS } from "./types";

import type { BoardState, FinalSubmissionParseResult } from "./types";

function checkUnique(records: { id: string }[], label: string, errors: string[]) {
  if (new Set(records.map((item) => item.id)).size !== records.length) errors.push(`${label}: ID가 중복되었습니다.`);
}
function checkMeaning(board: BoardState): string[] {
  const errors: string[] = [];
  checkUnique(board.documents, "관리 파일", errors); checkUnique(board.tasks, "점검 항목", errors); checkUnique(board.sources, "기준 자료", errors);
  for (const id of REQUIRED_DOCUMENT_IDS) if (!board.documents.some((doc) => doc.id === id)) errors.push(`${id}: 필수 관리 파일 기록이 누락되었습니다.`);
  for (const fixed of REQUIRED_APPROVALS) {
    const task = board.tasks.find((item) => item.id === fixed.id);
    if (!task || task.title !== fixed.title || task.category !== "승인 대기" || !task.approvalRequired || task.status !== "승인 대기" || !task.unresolved) {
      errors.push(`${fixed.title}: 고정 승인 대기 항목의 이름·분류·승인 필요·미해결 표시를 유지해야 합니다.`);
    }
  }
  for (const doc of board.documents) {
    if (doc.formatStatus !== "미확인" && (!doc.notes.trim() || !doc.lastConfirmedAt || !doc.sourceUrl || doc.availability === "미확보")) {
      errors.push(`${doc.label}: 형식 확인에는 확보한 파일·근거·결과 메모·확인 시점이 필요합니다.`);
    }
    if (doc.candidateState === "최종본 확정" && (!doc.fileName.trim() || !doc.candidateEvidence || !doc.finalizedAt)) {
      errors.push(`${doc.label}: 최종본 확정에는 파일명·확정 근거·확정 시점이 필요합니다.`);
    }
    const platform = doc.platform;
    if (platform.status !== "미확인" && (!platform.evidenceUrl || !platform.observedAt)) errors.push(`${doc.label}: 제출·미제출 확인에는 플랫폼 근거 링크와 관찰 시점이 필요합니다.`);
    if (platform.comparison !== "미확인" && (!platform.evidenceUrl || !platform.observedAt || !platform.fileName.trim() || !doc.fileName.trim() || !platform.comparisonNote.trim())) {
      errors.push(`${doc.label}: 첨부 비교 확인에는 양쪽 파일명·플랫폼 근거·관찰 시점·비교 결과가 필요합니다.`);
    }
    const normalizeHash = (value: string) => value.replace(/^sha256:/i, "").trim().toLowerCase();
    const localHash = normalizeHash(doc.fileHash); const remoteHash = normalizeHash(platform.hash);
    if (platform.comparison === "일치 확인" && /^[a-f0-9]{64}$/.test(localHash) && /^[a-f0-9]{64}$/.test(remoteHash) && localHash !== remoteHash) {
      errors.push(`${doc.label}: 파일 해시가 달라 일치 확인으로 저장할 수 없습니다.`);
    }
  }
  for (const task of board.tasks) {
    const doc = board.documents.find((item) => item.id === task.docId);
    if (task.docId && !doc) errors.push(`${task.title}: 연결한 관리 파일을 찾을 수 없습니다.`);
    if (task.approvalRequired && (task.status !== "승인 대기" || task.category !== "승인 대기")) errors.push(`${task.title}: 실제 작업이 필요한 항목은 승인 대기로 유지해야 합니다.`);
    if (task.status !== "최종 확인") continue;
    if (!task.evidenceLinks.length && !task.attachments.length) errors.push(`${task.title}: 최종 확인에는 근거 링크 또는 첨부 증빙이 필요합니다.`);
    if (!task.confirmationNote.trim() || !task.confirmedBy.trim() || !task.lastConfirmedAt) errors.push(`${task.title}: 최종 확인에는 확인 결과·확인자·확인 시점이 필요합니다.`);
    if (task.unresolved) errors.push(`${task.title}: 미해결 항목은 최종 확인으로 저장할 수 없습니다.`);
    if (task.id === GLOBAL_PLATFORM_TASK_ID) {
      const unobserved = REQUIRED_DOCUMENT_IDS.some((id) => {
        const required = board.documents.find((item) => item.id === id);
        return !required || required.platform.status === "미확인" || required.platform.comparison === "미확인";
      });
      if (unobserved) errors.push(`${task.title}: 활동보고서·사업계획서·증빙 대장 세 문서 모두의 제출 여부와 첨부 비교 근거를 먼저 기록해 주세요.`);
    } else if (task.category === "플랫폼" && (!doc || doc.platform.status === "미확인" || doc.platform.comparison === "미확인")) errors.push(`${task.title}: 연결 문서의 제출 여부와 첨부 비교 근거를 먼저 기록해 주세요.`);
    if (task.category === "최종본" && doc?.candidateState !== "최종본 확정") errors.push(`${task.title}: 연결 문서의 최종 후보와 확정 근거를 먼저 기록해 주세요.`);
  }
  return errors;
}

/** 형식 검증 통과는 사용자가 입력한 사실이나 플랫폼 제출의 진위를 보증하지 않는다. */
export function parseFinalSubmissionBoard(value: unknown, previous?: BoardState): FinalSubmissionParseResult {
  const unsafe = checkJsonInput(value);
  if (unsafe) return { ok: false, errors: [unsafe] };
  const parsed = finalSubmissionBoardSchema.safeParse(value);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.slice(0, 20).map((issue) => `${issue.path.join(".") || "점검 보드"}: ${issue.message}`) };
  const board: BoardState = parsed.data;
  const errors = [...checkMeaning(board), ...(previous ? finalSubmissionTransitionErrors(board, previous) : [])];
  return errors.length ? { ok: false, errors: [...new Set(errors)] } : { ok: true, value: board };
}

export function validateBoard(value: unknown, previous?: BoardState): string[] {
  const result = parseFinalSubmissionBoard(value, previous);
  return result.ok ? [] : result.errors;
}
