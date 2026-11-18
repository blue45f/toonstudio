import { parseAiOperationsSnapshot } from "@toonstudio/contracts/ai-operations";

import { requestAdminJson } from "../../../platform/http/admin-api";

import type { AiOperationsSave, AiOperationsView, AiOperationsAudit } from "@toonstudio/contracts/ai-operations";

function auditEntry(value: unknown): AiOperationsAudit {
  if (!value || typeof value !== "object") throw new Error("운영 보드 감사 응답을 확인할 수 없습니다.");
  const row = value as Record<string, unknown>;
  if (!Number.isSafeInteger(row.revision) || Number(row.revision) < 1 || typeof row.actorUserId !== "string" || typeof row.at !== "string" || !Number.isFinite(Date.parse(row.at)) || typeof row.beforeDigest !== "string" || typeof row.afterDigest !== "string") throw new Error("운영 보드 감사 응답 형식이 올바르지 않습니다.");
  return { revision: Number(row.revision), actorUserId: row.actorUserId, at: row.at, beforeDigest: row.beforeDigest, afterDigest: row.afterDigest };
}
export function parseAiOperationsView(value: unknown): AiOperationsView {
  if (!value || typeof value !== "object") throw new Error("운영 보드 응답이 올바르지 않습니다.");
  const row = value as Record<string, unknown>;
  if (!Number.isSafeInteger(row.revision) || Number(row.revision) < 0 || typeof row.canEdit !== "boolean" || !Array.isArray(row.audit) || row.audit.length > 100 || (row.updatedAt !== null && (typeof row.updatedAt !== "string" || !Number.isFinite(Date.parse(row.updatedAt))))) throw new Error("운영 보드 응답 형식을 확인할 수 없습니다.");
  return { snapshot: row.snapshot === null ? null : parseAiOperationsSnapshot(row.snapshot), revision: Number(row.revision), updatedAt: row.updatedAt, canEdit: row.canEdit, audit: row.audit.map(auditEntry) };
}
export async function loadAiOperations(signal?: AbortSignal): Promise<AiOperationsView> { return parseAiOperationsView(await requestAdminJson<unknown>("/api/admin/ai-operations", { signal })); }
export async function saveAiOperations(body: AiOperationsSave): Promise<AiOperationsView> { return parseAiOperationsView(await requestAdminJson<unknown>("/api/admin/ai-operations", { body })); }
