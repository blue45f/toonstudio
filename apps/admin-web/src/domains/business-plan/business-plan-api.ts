import { parseBusinessPlanState } from "@toonstudio/contracts/business-plan";

import { AdminApiError, requestAdminJson } from "../../platform/http/admin-api";

import type { BusinessPlanRecord, SaveBusinessPlanRequest } from "@toonstudio/contracts/business-plan";

export function parseBusinessPlanRecord(value: unknown): BusinessPlanRecord {
  if (!value || typeof value !== "object" || !("board" in value) || !("revision" in value) || !("updatedAt" in value)) {
    throw new AdminApiError(502, "사업계획서 서버 응답 형식이 올바르지 않습니다. 기존 기록을 변경하지 않았습니다.");
  }
  if (typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 0 || (value.updatedAt !== null && (typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))))) {
    throw new AdminApiError(502, "사업계획서 저장 버전 또는 시각을 확인할 수 없습니다.");
  }
  if (value.board === null) {
    if (value.revision !== 0 || value.updatedAt !== null) throw new AdminApiError(502, "비어 있는 보드의 서버 버전이 일치하지 않습니다.");
    return { board: null, revision: value.revision, updatedAt: value.updatedAt };
  }
  const parsed = parseBusinessPlanState(value.board);
  if (!parsed.ok) throw new AdminApiError(502, `서버 기록을 검증하지 못했습니다: ${parsed.errors.slice(0, 4).join(" · ")}`);
  if (value.revision < 1 || value.updatedAt === null) throw new AdminApiError(502, "저장된 보드의 버전과 저장 시각이 누락되었습니다.");
  return { board: parsed.value, revision: value.revision, updatedAt: value.updatedAt };
}

export async function loadBusinessPlan(signal?: AbortSignal): Promise<BusinessPlanRecord> {
  return parseBusinessPlanRecord(await requestAdminJson<unknown>("/api/admin/business-plan", { signal }));
}

export async function saveBusinessPlan(request: SaveBusinessPlanRequest, signal?: AbortSignal): Promise<BusinessPlanRecord> {
  const parsed = parseBusinessPlanState(request.board);
  if (!parsed.ok) throw new Error(parsed.errors.join(" · "));
  if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0) throw new Error("확인된 서버 버전이 필요합니다. 먼저 서버 기록을 불러오세요.");
  const record = parseBusinessPlanRecord(await requestAdminJson<unknown>("/api/admin/business-plan/save", { body: request, signal }));
  if (!record.board || record.revision !== request.expectedRevision + 1) throw new AdminApiError(502, "저장 결과의 서버 버전을 확인하지 못했습니다. 동일한 요청으로 다시 확인하세요.");
  return record;
}

export function isBusinessPlanAccessDenied(cause: unknown): boolean {
  return cause instanceof AdminApiError && (cause.status === 401 || cause.status === 403);
}

export function isBusinessPlanConflict(cause: unknown): boolean {
  return cause instanceof AdminApiError && cause.status === 409;
}
