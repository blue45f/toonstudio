import { GLOBAL_PLATFORM_TASK_ID, REQUIRED_DOCUMENT_IDS } from "./types";

import type { BoardState, DocumentRecord, Task } from "./types";

const identityKeys = ["fileName", "version", "fileHash", "sourceUrl"] as const;
const platformIdentityKeys = ["fileName", "version", "hash"] as const;
const formatEvidenceKeys = ["formatStatus", "expectedFormat", "availability", "lastConfirmedAt", "notes", "bytes"] as const;
const taskMaterialKeys = ["fileName", "version", "docId", "category", "evidenceLinks", "attachments", "discrepancy"] as const;
export function documentIdentityChanged(next: DocumentRecord, previous: DocumentRecord): boolean {
  return identityKeys.some((key) => next[key] !== previous[key]);
}
export function platformIdentityChanged(next: DocumentRecord, previous: DocumentRecord): boolean {
  return platformIdentityKeys.some((key) => next.platform[key] !== previous.platform[key]);
}
export function taskEvidenceChanged(next: Task, previous: Task): boolean {
  return taskMaterialKeys.some((key) => JSON.stringify(next[key]) !== JSON.stringify(previous[key]));
}
function relatedConfirmationChanged(task: Task, next: DocumentRecord, previous: DocumentRecord): boolean {
  if (documentIdentityChanged(next, previous)) return true;
  if (task.category === "플랫폼" || task.id === GLOBAL_PLATFORM_TASK_ID) return JSON.stringify(next.platform) !== JSON.stringify(previous.platform);
  if (task.category === "파일 형식") return formatEvidenceKeys.some((key) => next[key] !== previous[key]);
  return task.category === "최종본" && ["candidateState", "candidateEvidence", "finalizedAt"].some((key) => next[key as keyof DocumentRecord] !== previous[key as keyof DocumentRecord]);
}
/** 대조 작업은 보고서·대장을 함께, 전체 접수 점검은 필수 문서 세 가지를 함께 참조한다. */
function taskDependenciesChanged(task: Task, next: BoardState, previous: BoardState): boolean {
  const ids = new Set([
    task.docId,
    ...(task.category === "증빙 대조" ? ["report", "ledger"] : []),
    ...(task.id === GLOBAL_PLATFORM_TASK_ID ? REQUIRED_DOCUMENT_IDS : []),
  ]);
  for (const id of ids) {
    if (!id) continue;
    const doc = next.documents.find((item) => item.id === id);
    const old = previous.documents.find((item) => item.id === id);
    if (doc && old && relatedConfirmationChanged(task, doc, old)) return true;
  }
  return false;
}
function reopen(task: Task): Task {
  return { ...task, status: "검토 필요", lastConfirmedAt: "", confirmedBy: "", confirmationNote: "", unresolved: true };
}

/** 편집자가 기준을 바꾸면 기존 판정을 해제한다. 원본 문서나 제출 플랫폼에는 요청하지 않는다. */
export function reconcileFinalSubmissionBoard(candidate: BoardState, previous: BoardState): BoardState {
  const next = structuredClone(candidate);
  for (const doc of next.documents) {
    const old = previous.documents.find((item) => item.id === doc.id);
    if (!old) continue;
    if (documentIdentityChanged(doc, old)) {
      doc.candidateState = "검토 후보";
      doc.candidateEvidence = ""; doc.finalizedAt = ""; doc.lastConfirmedAt = ""; doc.formatStatus = "미확인";
      doc.platform.comparison = "미확인"; doc.platform.comparisonNote = "기준 파일 변경으로 재대조 필요";
    } else if (platformIdentityChanged(doc, old)) {
      doc.platform.comparison = "미확인"; doc.platform.comparisonNote = "플랫폼 첨부 파일 변경으로 재대조 필요";
    }
  }
  next.tasks = next.tasks.map((task) => {
    if (task.approvalRequired || task.status !== "최종 확인") return task;
    const old = previous.tasks.find((item) => item.id === task.id);
    return (old?.status === "최종 확인" && taskEvidenceChanged(task, old)) || taskDependenciesChanged(task, next, previous) ? reopen(task) : task;
  });
  return next;
}

export function finalSubmissionTransitionErrors(next: BoardState, previous: BoardState): string[] {
  const errors: string[] = [];
  for (const old of previous.documents) {
    const doc = next.documents.find((item) => item.id === old.id);
    if (!doc) { errors.push(`${old.label}: 관리 대상 파일은 삭제할 수 없습니다.`); continue; }
    if (documentIdentityChanged(doc, old) && (doc.candidateState === "최종본 확정" || doc.candidateEvidence || doc.finalizedAt || doc.lastConfirmedAt || doc.formatStatus !== "미확인" || doc.platform.comparison !== "미확인")) {
      errors.push(`${doc.label}: 기존 확인을 해제하고 기준 파일 변경을 먼저 서버에 저장한 뒤 최종본·형식·첨부 비교를 다시 확인해 주세요.`);
    }
    if (platformIdentityChanged(doc, old) && doc.platform.comparison !== "미확인") errors.push(`${doc.label}: 첨부 비교 확인을 해제하고 플랫폼 파일 변경을 먼저 서버에 저장한 뒤 다시 대조해 주세요.`);
  }
  for (const old of previous.tasks) {
    const task = next.tasks.find((item) => item.id === old.id);
    if (old.approvalRequired && (!task || !task.approvalRequired || task.status !== "승인 대기")) errors.push(`${old.title}: 승인 대기 항목은 삭제하거나 승인 필요 표시를 해제할 수 없습니다.`);
    if (task?.status === "최종 확인" && old.status === "최종 확인" && taskEvidenceChanged(task, old)) errors.push(`${task.title}: 최종 확인을 해제한 변경 기록을 먼저 서버에 저장한 뒤 다시 최종 확인해 주세요.`);
  }
  for (const task of next.tasks.filter((item) => item.status === "최종 확인")) {
    if (taskDependenciesChanged(task, next, previous)) errors.push(`${task.title}: 관련 파일의 기준·관측 변경을 먼저 서버에 저장한 뒤 다시 최종 확인해 주세요.`);
  }
  return errors;
}
