import { parseAdminWorkspaceSaveAck, parseAdminWorkspaceView } from "@toonstudio/contracts/admin-workspace";

import { AdminApiError, requestAdminJson } from "./admin-api";

import type { AdminWorkspaceGrantInput, AdminWorkspaceSave, AdminWorkspaceSaveAck, AdminWorkspaceScope, AdminWorkspaceView } from "@toonstudio/contracts/admin-workspace";

const endpoint = "/api/admin/workspaces/toonstudio";

export async function loadAdminWorkspace(signal?: AbortSignal, scope: AdminWorkspaceScope = "operations"): Promise<AdminWorkspaceView> {
  const parsed = parseAdminWorkspaceView(await requestAdminJson<unknown>(endpoint + "?scope=" + scope, { signal }));
  if (!parsed.ok) throw new AdminApiError(502, "작업실 응답을 확인할 수 없습니다. " + parsed.errors.join(" "));
  if (parsed.value.scope !== scope) throw new AdminApiError(502, "요청한 자료 범위와 응답이 일치하지 않습니다.");
  return parsed.value;
}

export async function exportAdminWorkspace(scope: AdminWorkspaceScope, signal?: AbortSignal): Promise<AdminWorkspaceView> {
  const parsed = parseAdminWorkspaceView(await requestAdminJson<unknown>(endpoint + "/export?scope=" + scope, { signal }));
  if (!parsed.ok) throw new AdminApiError(502, "내보내기 권한과 응답을 확인할 수 없습니다.");
  if (parsed.value.scope !== scope || !parsed.value.access[scope].canExport) throw new AdminApiError(502, "요청한 범위의 내보내기 권한을 확인할 수 없습니다.");
  return parsed.value;
}

export async function saveAdminWorkspace(input: AdminWorkspaceSave, signal?: AbortSignal): Promise<AdminWorkspaceSaveAck> {
  const parsed = parseAdminWorkspaceSaveAck(await requestAdminJson<unknown>(endpoint + "/save", { body: input, signal }));
  if (!parsed.ok) throw new AdminApiError(502, "저장 결과를 확인할 수 없습니다. 같은 변경으로 다시 시도해 주세요.");
  if (parsed.value.scope !== (input.scope ?? "operations")) throw new AdminApiError(502, "저장한 자료 범위와 확인 응답이 일치하지 않습니다.");
  return parsed.value;
}

export interface WorkspaceAccessList {
  ownerUserId: string;
  grants: { userId: string; canRead: true; canWrite: boolean; canExport: boolean; updatedAt: string }[];
}
export async function loadWorkspaceAccess(signal?: AbortSignal): Promise<WorkspaceAccessList> {
  const value = await requestAdminJson<unknown>(endpoint + "/business-access", { signal });
  if (!value || typeof value !== "object" || !("ownerUserId" in value) || typeof value.ownerUserId !== "string" || !("grants" in value) || !Array.isArray(value.grants)
    || value.grants.some(grant => !grant || typeof grant !== "object" || typeof grant.userId !== "string" || grant.canRead !== true || typeof grant.canWrite !== "boolean" || typeof grant.canExport !== "boolean" || typeof grant.updatedAt !== "string")) throw new AdminApiError(502, "비공개 자료의 접근 권한을 확인할 수 없습니다.");
  return value as WorkspaceAccessList;
}
export async function saveWorkspaceAccess(input: AdminWorkspaceGrantInput, signal?: AbortSignal): Promise<void> {
  const value = await requestAdminJson<unknown>(endpoint + "/business-access", { body: input, signal });
  if (!value || typeof value !== "object" || !("updatedAt" in value) || typeof value.updatedAt !== "string" || !("replayed" in value) || typeof value.replayed !== "boolean") throw new AdminApiError(502, "접근 권한의 저장 결과를 확인할 수 없습니다.");
}
