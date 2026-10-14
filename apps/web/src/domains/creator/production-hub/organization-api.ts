import type {
  OrganizationCommandInput, OrganizationDetail, OrganizationInvitePreview,
  OrganizationKind, OrganizationMutationResult, OrganizationSummary,
} from "@toonstudio/contracts/production-organization";
import { api } from "@/platform/api";

const root = "/production/organizations";
const path = (id: string): string => `${root}/${encodeURIComponent(id)}`;
export function listOrganizations(): Promise<{ organizations: readonly OrganizationSummary[] }> {
  return api.get(root);
}
export function getOrganization(id: string): Promise<OrganizationDetail> {
  return api.get(path(id));
}
export function createOrganization(input: { name: string; kind: OrganizationKind; description: string }): Promise<OrganizationMutationResult> {
  return api.post(root, { ...input, mutationId: crypto.randomUUID() });
}
export function commandOrganization(id: string, expectedRevision: number, command: OrganizationCommandInput): Promise<OrganizationMutationResult> {
  return api.post(`${path(id)}/commands`, { ...command, expectedRevision, mutationId: crypto.randomUUID() });
}
export function acceptOrganizationInvite(token: string): Promise<OrganizationMutationResult> {
  return api.post(`${root}/accept-invite`, { token, mutationId: crypto.randomUUID() });
}
/** 수락 전 미리보기 — 토큰은 주소가 아닌 본문으로만 보내고, 서버는 이메일이 일치할 때만 답한다. */
export function previewOrganizationInvite(token: string): Promise<OrganizationInvitePreview> {
  return api.post(`${root}/preview-invite`, { token });
}
