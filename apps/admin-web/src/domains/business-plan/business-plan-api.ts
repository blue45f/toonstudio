import { parseBusinessPlanAccess, parseBusinessPlanState } from "@toonstudio/contracts/business-plan";

import { AdminApiError, requestAdminJson } from "../../platform/http/admin-api";

import type { BusinessPlanAccessAck, BusinessPlanAccessList, BusinessPlanRecord, ChangeBusinessPlanAccessRequest, SaveBusinessPlanRequest } from "@toonstudio/contracts/business-plan";

export function parseBusinessPlanRecord(value: unknown): BusinessPlanRecord {
  if (!value || typeof value !== "object" || !("board" in value) || !("revision" in value) || !("updatedAt" in value) || !("access" in value)) {
    throw new AdminApiError(502, "사업계획서 서버 응답 형식이 올바르지 않습니다. 기존 기록을 변경하지 않았습니다.");
  }
  const access = parseBusinessPlanAccess(value.access);
  if (!access || (!access.canRead && !access.canClaimOwnership)) throw new AdminApiError(502, "사업계획서 접근 권한 응답을 검증하지 못했습니다.");
  if (typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 0 || (value.updatedAt !== null && (typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))))) {
    throw new AdminApiError(502, "사업계획서 저장 버전 또는 시각을 확인할 수 없습니다.");
  }
  if (value.board === null) {
    if (value.revision !== 0 || value.updatedAt !== null) throw new AdminApiError(502, "비어 있는 보드의 서버 버전이 일치하지 않습니다.");
    return { board: null, revision: value.revision, updatedAt: value.updatedAt, access };
  }
  if (!access.canRead || access.canClaimOwnership) throw new AdminApiError(502, "읽기 권한이 없는 원문 응답을 거절했습니다.");
  const parsed = parseBusinessPlanState(value.board);
  if (!parsed.ok) throw new AdminApiError(502, `서버 기록을 검증하지 못했습니다: ${parsed.errors.slice(0, 4).join(" · ")}`);
  if (value.revision < 1 || value.updatedAt === null) throw new AdminApiError(502, "저장된 보드의 버전과 저장 시각이 누락되었습니다.");
  return { board: parsed.value, revision: value.revision, updatedAt: value.updatedAt, access };
}

export async function loadBusinessPlan(signal?: AbortSignal): Promise<BusinessPlanRecord> {
  return parseBusinessPlanRecord(await requestAdminJson<unknown>("/api/admin/business-plan", { signal }));
}

export async function exportBusinessPlan(signal?: AbortSignal): Promise<BusinessPlanRecord> {
  const record = parseBusinessPlanRecord(await requestAdminJson<unknown>("/api/admin/business-plan/export", { signal }));
  if (!record.access.canExport) throw new AdminApiError(403, "사업계획서 내보내기 권한이 없습니다.");
  return record;
}

export async function claimBusinessPlan(mutationId: string, signal?: AbortSignal): Promise<BusinessPlanRecord> {
  const record = parseBusinessPlanRecord(await requestAdminJson<unknown>("/api/admin/business-plan/claim", { body: { mutationId }, signal }));
  if (!record.access.canManageAccess) throw new AdminApiError(502, "사업계획서 소유권 결과를 확인하지 못했습니다.");
  return record;
}

export async function loadBusinessPlanAccess(signal?: AbortSignal): Promise<BusinessPlanAccessList> {
  const value = await requestAdminJson<unknown>("/api/admin/business-plan/access", { signal });
  if (!value || typeof value !== "object" || !("ownerUserId" in value) || typeof value.ownerUserId !== "string" || !value.ownerUserId
    || !("grants" in value) || !Array.isArray(value.grants)) throw new AdminApiError(502, "사업계획서 권한 목록을 확인하지 못했습니다.");
  const grants = value.grants.map((grant: unknown) => {
    if (!grant || typeof grant !== "object" || !("userId" in grant) || typeof grant.userId !== "string" || !grant.userId
      || !("canRead" in grant) || grant.canRead !== true || !("canWrite" in grant) || typeof grant.canWrite !== "boolean"
      || !("canExport" in grant) || typeof grant.canExport !== "boolean" || !("updatedAt" in grant) || typeof grant.updatedAt !== "string" || !Number.isFinite(Date.parse(grant.updatedAt))) throw new AdminApiError(502, "사업계획서 권한 목록의 형식이 올바르지 않습니다.");
    return { userId: grant.userId, canRead: true as const, canWrite: grant.canWrite, canExport: grant.canExport, updatedAt: grant.updatedAt };
  });
  return { ownerUserId: value.ownerUserId, grants };
}

export async function changeBusinessPlanAccess(input: ChangeBusinessPlanAccessRequest, signal?: AbortSignal): Promise<BusinessPlanAccessAck> {
  const value = await requestAdminJson<unknown>("/api/admin/business-plan/access", { body: input, signal });
  if (!value || typeof value !== "object" || !("updatedAt" in value) || typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))
    || !("replayed" in value) || typeof value.replayed !== "boolean") throw new AdminApiError(502, "사업계획서 권한 변경 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해주세요.");
  return { updatedAt: value.updatedAt, replayed: value.replayed };
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
