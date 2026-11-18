import { parseNestBoardDocument } from "@toonstudio/contracts/admin-nestjs-quality";

import { AdminApiError, requestAdminJson } from "../../../platform/http/admin-api";

import type { NestBoardHistorySummary, NestBoardMutation, NestBoardView } from "@toonstudio/contracts/admin-nestjs-quality";

const endpoint = "/api/admin/quality/nestjs";
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

function parseHistory(value: unknown): NestBoardHistorySummary[] {
  if (!Array.isArray(value) || value.length > 1000) throw new Error("서버 변경 이력 형식을 확인할 수 없습니다.");
  return value.map((item: unknown) => {
    if (!record(item) || !Number.isSafeInteger(item.revision) || Number(item.revision) < 1
      || typeof item.actorId !== "string" || typeof item.createdAt !== "string" || !Number.isFinite(Date.parse(item.createdAt))
      || typeof item.reason !== "string" || typeof item.snapshotChanged !== "boolean"
      || !Array.isArray(item.changedTaskIds) || !item.changedTaskIds.every((id: unknown) => typeof id === "string")) {
      throw new Error("서버 변경 이력 형식을 확인할 수 없습니다.");
    }
    return { revision: Number(item.revision), actorId: item.actorId, createdAt: item.createdAt, reason: item.reason,
      changedTaskIds: item.changedTaskIds as string[], snapshotChanged: item.snapshotChanged };
  });
}

export function parseNestBoardView(value: unknown): NestBoardView {
  if (!record(value) || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0 || typeof value.canEdit !== "boolean"
    || (value.updatedAt !== null && (typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))))) {
    throw new AdminApiError(502, "서버 보드 응답 형식이 올바르지 않습니다. 기록을 표시하지 않습니다.");
  }
  return { document: parseNestBoardDocument(value.document), revision: Number(value.revision), history: parseHistory(value.history),
    canEdit: value.canEdit, updatedAt: value.updatedAt as string | null };
}

export async function loadNestBoard(signal: AbortSignal): Promise<NestBoardView> {
  return parseNestBoardView(await requestAdminJson<unknown>(endpoint, { signal }));
}

export async function saveNestBoard(body: NestBoardMutation, signal: AbortSignal): Promise<NestBoardView> {
  return parseNestBoardView(await requestAdminJson<unknown>(endpoint, { body, signal }));
}
