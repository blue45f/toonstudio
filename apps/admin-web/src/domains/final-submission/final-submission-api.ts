import { isFinalSubmissionDate, parseFinalSubmissionBoard } from "@toonstudio/contracts/final-submission";
import { TOONSPECTRUM_CSRF_HEADER, TOONSPECTRUM_CSRF_HEADER_VALUE } from "@toonstudio/contracts/security/csrf";

import { AdminApiError } from "../../platform/http/admin-api";
import { sanitizeAdminDiagnosticText } from "../../platform/http/admin-response-whitelist";

import type { FinalSubmissionRecord, HistoryEntry, SaveFinalSubmissionRequest } from "@toonstudio/contracts/final-submission";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 개인 기록 원문은 도메인 계약으로 검증하고, 운영 진단 마스킹은 오류에만 적용한다. */
async function requestSubmission(path: string, signal?: AbortSignal, body?: SaveFinalSubmissionRequest): Promise<unknown> {
  const response = await fetch(path, {
    method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal,
    headers: body ? { "Content-Type": "application/json", [TOONSPECTRUM_CSRF_HEADER]: TOONSPECTRUM_CSRF_HEADER_VALUE } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const reason = record(payload) && typeof payload.message === "string" ? sanitizeAdminDiagnosticText(payload.message) : "서버 연결과 관리자 로그인 상태를 확인해 주세요.";
    throw new AdminApiError(response.status, response.status === 404 || response.status === 503
      ? `최종 제출 점검 저장 기능을 사용할 수 없습니다. 서버 준비 상태를 확인한 뒤 다시 시도해 주세요. ${reason}` : reason);
  }
  return payload;
}

export function parseFinalSubmissionRecord(value: unknown, ownerUserId: string): FinalSubmissionRecord {
  const invalid = () => new AdminApiError(502, "최종 제출 점검의 서버 기록을 검증하지 못했습니다. 기존 기록을 변경하지 않았습니다.");
  if (!record(value)) throw invalid();
  if (!ownerUserId.trim() || value.ownerUserId !== ownerUserId) {
    throw new AdminApiError(403, "확인된 관리자 계정과 자료 소유자가 다릅니다. 로그인 상태를 다시 확인하세요.");
  }
  if (typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 0
    || (value.updatedAt !== null && (typeof value.updatedAt !== "string" || !value.updatedAt || !isFinalSubmissionDate(value.updatedAt)))
    || !Array.isArray(value.history) || value.history.length > 100) throw invalid();
  const ids = new Set<string>();
  const history: HistoryEntry[] = value.history.map((entry: unknown) => {
    if (!record(entry) || typeof entry.id !== "string" || !entry.id || ids.has(entry.id)
      || typeof entry.revision !== "number" || !Number.isSafeInteger(entry.revision) || entry.revision < 1 || entry.revision > Number(value.revision)
      || typeof entry.changedAt !== "string" || !entry.changedAt || !isFinalSubmissionDate(entry.changedAt)
      || typeof entry.summary !== "string" || !entry.summary.trim() || entry.summary.length > 500) throw invalid();
    ids.add(entry.id);
    return { id: entry.id, revision: entry.revision, changedAt: entry.changedAt, summary: entry.summary };
  });
  if (value.board === null) {
    if (value.revision !== 0 || value.updatedAt !== null || history.length) throw invalid();
    return { ownerUserId, board: null, revision: 0, updatedAt: null, history: [] };
  }
  const parsed = parseFinalSubmissionBoard(value.board);
  if (!parsed.ok || value.revision < 1 || typeof value.updatedAt !== "string"
    || parsed.value.revision !== value.revision || parsed.value.updatedAt !== value.updatedAt) throw invalid();
  return { ownerUserId, board: parsed.value, revision: value.revision, updatedAt: value.updatedAt, history };
}

export async function loadFinalSubmission(ownerUserId: string, signal?: AbortSignal): Promise<FinalSubmissionRecord> {
  return parseFinalSubmissionRecord(await requestSubmission("/api/admin/final-submission", signal), ownerUserId);
}

export async function exportFinalSubmission(ownerUserId: string, signal?: AbortSignal): Promise<FinalSubmissionRecord> {
  return parseFinalSubmissionRecord(await requestSubmission("/api/admin/final-submission/export", signal), ownerUserId);
}

export async function saveFinalSubmission(ownerUserId: string, request: SaveFinalSubmissionRequest, signal?: AbortSignal): Promise<FinalSubmissionRecord> {
  const parsed = parseFinalSubmissionBoard(request.board);
  if (!parsed.ok) throw new Error(parsed.errors.join(" · "));
  if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0 || request.board.revision !== request.expectedRevision) {
    throw new Error("서버에서 확인한 저장 버전을 기준으로 저장해야 합니다.");
  }
  const result = parseFinalSubmissionRecord(await requestSubmission("/api/admin/final-submission/save", signal, request), ownerUserId);
  if (!result.board || result.revision <= request.expectedRevision) throw new AdminApiError(502, "저장 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.");
  return result;
}

export function finalSubmissionAccessDenied(cause: unknown): boolean {
  return cause instanceof AdminApiError && (cause.status === 401 || cause.status === 403);
}

export function finalSubmissionConflict(cause: unknown): boolean {
  return cause instanceof AdminApiError && cause.status === 409;
}

export function finalSubmissionInputRejected(cause: unknown): boolean {
  return cause instanceof AdminApiError && [400, 413, 422].includes(cause.status);
}
