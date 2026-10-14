import type { EffectiveOperationPolicy } from "@toonstudio/contracts/operation-policy";
import type {
  TeamWorkspaceSummary, TeamWorkspaceDetail, TeamWorkspaceCommandInput,
  TeamWorkspaceInvitePreview, WorkspaceMutationResult, WorkspaceUsageResponse,
  TeamWorkspaceAuditQuery, TeamWorkspaceAuditResponse,
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
/** 감사 로그 열람(관리자 전용). 값이 있는 필터만 쿼리스트링으로 보내 서버 DTO의 strict 검증을 통과한다. */
export function getTeamAuditLog(id: string, query: TeamWorkspaceAuditQuery = {}): Promise<TeamWorkspaceAuditResponse> {
  const params = new URLSearchParams();
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.actorUserId) params.set("actorUserId", query.actorUserId);
  if (query.action) params.set("action", query.action);
  if (query.cursor !== undefined) params.set("cursor", String(query.cursor));
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  const serialized = params.toString();
  return api.get(`${path(id)}/audit${serialized ? `?${serialized}` : ""}`);
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
