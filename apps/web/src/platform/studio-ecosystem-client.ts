import type {
  RbacEvaluationResult,
  RoleAssignmentRecord,
  SecurityAuditEntry,
  SecurityPermissionId,
  SecurityRoleId,
  SecurityScopeType,
} from "@toonstudio/contracts/studio-security-rbac";

import { api } from "./api";

export interface CafePostAttachmentPayload {
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly dataUrl: string;
  readonly caption?: string;
  readonly spoilerBlur?: boolean;
}

export const studioEcosystemClient = {
  evaluatePermission(payload: {
    readonly userId: string;
    readonly permission: SecurityPermissionId;
    readonly clientIp?: string;
  }) {
    return api.post<RbacEvaluationResult>("/studio-ecosystem/rbac/evaluate", payload);
  },

  assignRole(payload: {
    readonly actorUserId: string;
    readonly targetUserId: string;
    readonly displayName: string;
    readonly roleId: SecurityRoleId;
    readonly scopeType: SecurityScopeType;
    readonly scopeId: string;
  }) {
    return api.post<{ assignment: RoleAssignmentRecord; audit: SecurityAuditEntry }>(
      "/studio-ecosystem/rbac/assign",
      payload,
    );
  },

  listAuditLogs() {
    return api.get<{ items: SecurityAuditEntry[] }>("/studio-ecosystem/rbac/audit-logs");
  },

  listPlazaParties() {
    return api.get<{ parties: unknown[] }>("/studio-ecosystem/plaza/parties");
  },

  createPlazaParty(payload: {
    readonly title: string;
    readonly studioName: string;
    readonly genre: string;
    readonly roleCode: string;
    readonly budgetPerCutKrw: number;
    readonly urgent?: boolean;
  }) {
    return api.post<{ partyId: string }>("/studio-ecosystem/plaza/parties", payload);
  },

  assignPlazaSlot(partyId: string, slotId: string, avatarId: string) {
    return api.post<{ assigned: boolean }>(
      `/studio-ecosystem/plaza/parties/${encodeURIComponent(partyId)}/slots/${encodeURIComponent(slotId)}/assign`,
      { avatarId },
    );
  },

  listCafePosts(scope?: SecurityScopeType) {
    return api.get<{ items: unknown[] }>("/studio-ecosystem/cafes/posts", {
      params: scope ? { scope } : undefined,
    });
  },

  createCafePost(
    cafeId: string,
    payload: {
      readonly scope: SecurityScopeType;
      readonly channel: string;
      readonly authorName: string;
      readonly title: string;
      readonly body: string;
      readonly attachments?: readonly CafePostAttachmentPayload[];
    },
  ) {
    return api.post<{ id: string }>(
      `/studio-ecosystem/cafes/${encodeURIComponent(cafeId)}/posts`,
      payload,
    );
  },

  compileModelerCut(payload: {
    readonly artStyle: string;
    readonly cameraShot: string;
    readonly lighting: string;
    readonly backgroundPrompt: string;
    readonly preserveLineartPass?: boolean;
  }) {
    return api.post<{ positivePrompt: string; renderPasses: readonly string[] }>(
      "/studio-ecosystem/modeler/compile",
      payload,
    );
  },

  evaluateIpReadiness(payload: {
    readonly workTitle: string;
    readonly publishedEpisodes: number;
    readonly hasCleanRightsBom: boolean;
  }) {
    return api.post<{ workTitle: string; readinessScore: number; status: string }>(
      "/studio-ecosystem/ip/evaluate",
      payload,
    );
  },

  triageSupport(message: string) {
    return api.post<{
      category: string;
      suggestHumanEscalation: boolean;
      estimatedQueueMinutes: number;
    }>("/studio-ecosystem/support/triage", { message });
  },
};
