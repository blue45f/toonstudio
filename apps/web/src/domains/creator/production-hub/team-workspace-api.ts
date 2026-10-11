import type { EffectiveOperationPolicy } from "@toonstudio/contracts/operation-policy";
import type {
  TeamWorkspaceSummary, TeamWorkspaceDetail, TeamWorkspaceCommandInput,
  TeamWorkspaceInvitePreview, WorkspaceMutationResult, WorkspaceUsageResponse,
} from "@toonstudio/contracts/production-workspace";
import { api } from "@/platform/api";

const root = "/production/workspaces";
const path = (id: string): string => `${root}/${encodeURIComponent(id)}`;
export function listTeamWorkspaces(): Promise<{ workspaces: readonly TeamWorkspaceSummary[] }> {
  return api.get(root);
}
export function getTeamWorkspace(id: string): Promise<TeamWorkspaceDetail> {
  return api.get(path(id));
}
export function getTeamUsage(id: string): Promise<WorkspaceUsageResponse> {
  return api.get(`${path(id)}/usage`);
}
export function createTeamWorkspace(name: string): Promise<WorkspaceMutationResult> {
  return api.post(root, { name, mutationId: crypto.randomUUID() });
}
export function commandTeamWorkspace(id: string, expectedRevision: number, command: TeamWorkspaceCommandInput): Promise<WorkspaceMutationResult> {
  return api.post(`${path(id)}/commands`, { ...command, expectedRevision, mutationId: crypto.randomUUID() });
}
export function acceptTeamInvite(token: string): Promise<WorkspaceMutationResult> {
  return api.post(`${root}/accept-invite`, { token, mutationId: crypto.randomUUID() });
}
/** 수락 전 미리보기 — 토큰은 주소가 아닌 본문으로만 보내고, 서버는 이메일이 일치할 때만 답한다. */
export function previewTeamInvite(token: string): Promise<TeamWorkspaceInvitePreview> {
  return api.post(`${root}/preview-invite`, { token });
}

export function getEffectiveOperationPolicy(): Promise<EffectiveOperationPolicy> {
  return api.get("/production/operation-policy");
}
