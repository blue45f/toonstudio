import { parseAdminWorkspaceSaveAck, parseAdminWorkspaceView } from "@toonstudio/contracts/admin-workspace";

import { AdminApiError, requestAdminJson } from "./admin-api";

import type { AdminWorkspaceSave, AdminWorkspaceSaveAck, AdminWorkspaceView } from "@toonstudio/contracts/admin-workspace";

const endpoint = "/api/admin/workspaces/toonstudio";

export async function loadAdminWorkspace(signal?: AbortSignal): Promise<AdminWorkspaceView> {
  const parsed = parseAdminWorkspaceView(await requestAdminJson<unknown>(endpoint, { signal }));
  if (!parsed.ok) throw new AdminApiError(502, "작업실 응답을 확인할 수 없습니다. " + parsed.errors.join(" "));
  return parsed.value;
}

export async function saveAdminWorkspace(input: AdminWorkspaceSave, signal?: AbortSignal): Promise<AdminWorkspaceSaveAck> {
  const parsed = parseAdminWorkspaceSaveAck(await requestAdminJson<unknown>(endpoint + "/save", { body: input, signal }));
  if (!parsed.ok) throw new AdminApiError(502, "저장 결과를 확인할 수 없습니다. 같은 변경으로 다시 시도해 주세요.");
  return parsed.value;
}
