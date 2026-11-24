import { cloudWorkboardResponseSchema } from "@toonstudio/contracts/admin-cloud-workboard";

import { requestAdminJson } from "./admin-api";

import type { Board, CloudWorkboardResponse } from "@toonstudio/contracts/admin-cloud-workboard";

export const CLOUD_WORKBOARD_PATH = "/api/admin/cloud-workboard";

function response(value: unknown): CloudWorkboardResponse {
  const result = cloudWorkboardResponseSchema.safeParse(value);
  if (!result.success) throw new Error("서버 작업 기록의 형식을 확인할 수 없습니다. 기록을 수정하지 않고 다시 확인해 주세요.");
  return result.data;
}

export async function loadCloudWorkboard(signal?: AbortSignal): Promise<CloudWorkboardResponse> {
  return response(await requestAdminJson<unknown>(CLOUD_WORKBOARD_PATH, { signal }));
}

export async function saveCloudWorkboard(
  board: Board,
  expectedRevision: number,
  mutationId: string,
  signal?: AbortSignal,
  importHistory = false,
): Promise<CloudWorkboardResponse> {
  return response(await requestAdminJson<unknown>(CLOUD_WORKBOARD_PATH, {
    body: { board, expectedRevision, mutationId, ...(importHistory ? { importHistory: true } : {}) }, signal,
  }));
}
