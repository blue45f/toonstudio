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

export interface PlazaLiveMessageItem {
  readonly id: string;
  readonly partyId: string | null;
  readonly senderName: string;
  readonly roleLabel: string;
  readonly text: string;
  readonly createdAt: string;
}

export type PlazaAvailabilityMode = "urgent-sub-ready" | "online-ready" | "busy";

export interface PlazaPresenceItem {
  readonly userId: string;
  readonly nickname: string;
  readonly roleCode: string;
  readonly availability: PlazaAvailabilityMode;
  readonly tools: readonly string[];
  readonly cutRateKrw: number;
  readonly updatedAt: string;
}

export interface PlazaTrustBadgeView {
  readonly avatarId: string;
  readonly nickname: string;
  readonly verifiedHandoffCount: number;
  readonly onTimeDeliveryRatePct: number;
  readonly cleanPassRatePct: number;
  readonly medianResponseMinutes: number;
  readonly badgeTier:
    | "unverified"
    | "verified-handoff"
    | "clean-finisher"
    | "studio-anchor";
  readonly badgeLabelKo: string;
}

export type ManuscriptColorProfileView =
  | "sRGB"
  | "Display-P3"
  | "CMYK"
  | "Grayscale";

export interface StarterKitColorChipView {
  readonly roleKo: string;
  readonly hex: string;
}

export interface PartyStarterKitView {
  readonly partyId: string;
  readonly workTitle: string;
  readonly canvasWidthPx: number;
  readonly dpi: number;
  readonly colorProfile: ManuscriptColorProfileView;
  readonly brushSpecKo: string;
  readonly perspectiveGuideKo: string;
  readonly colorChips: readonly StarterKitColorChipView[];
  readonly updatedAt: string;
}

export interface PlazaPreflightResultView {
  readonly passed: boolean;
  readonly parsedFromBinary: boolean;
  readonly fileName: string;
  readonly expectedWidthPx: number;
  readonly expectedDpi: number;
  readonly expectedColorProfile: ManuscriptColorProfileView;
  readonly detectedWidthPx: number | null;
  readonly detectedDpi: number | null;
  readonly detectedColorProfile: ManuscriptColorProfileView | null;
  readonly changedLayerCount: number;
  readonly unresolvedMandatoryPinCount: number;
  readonly issues: readonly {
    readonly code: string;
    readonly severity: "blocker" | "warning";
    readonly messageKo: string;
  }[];
  readonly summaryKo: string;
}

export interface AcademyClassroomView {
  readonly classroomId: string;
  readonly institutionName: string;
  readonly courseTitle: string;
  readonly instructorName: string;
  readonly cohortSize: number;
  readonly inviteCode: string;
  readonly feeKrw: 0;
  readonly targetWidthPx: number;
  readonly targetDpi: number;
  readonly submissions: readonly {
    readonly submissionId: string;
    readonly studentName: string;
    readonly episodeCutLabel: string;
    readonly unresolvedPinCount: number;
    readonly passedSpecPreflight: boolean;
    readonly approvalLocked: boolean;
  }[];
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
    return api.post<{
      assigned: boolean;
      brokerageFeeRate?: 0;
      handoffReviewPath?: string;
    }>(
      `/studio-ecosystem/plaza/parties/${encodeURIComponent(partyId)}/slots/${encodeURIComponent(slotId)}/assign`,
      { avatarId },
    );
  },

  listPlazaMessages(partyId?: string) {
    return api.get<{ items: PlazaLiveMessageItem[] }>(
      "/studio-ecosystem/plaza/messages",
      { params: partyId ? { partyId } : undefined },
    );
  },

  postPlazaMessage(payload: {
    readonly partyId?: string | null;
    readonly senderName: string;
    readonly roleLabel?: string;
    readonly text: string;
  }) {
    return api.post<PlazaLiveMessageItem>(
      "/studio-ecosystem/plaza/messages",
      payload,
    );
  },

  listPlazaPresence() {
    return api.get<{ items: PlazaPresenceItem[] }>(
      "/studio-ecosystem/plaza/presence",
    );
  },

  upsertPlazaPresence(payload: {
    readonly userId: string;
    readonly nickname: string;
    readonly roleCode: string;
    readonly availability: PlazaAvailabilityMode;
    readonly tools?: readonly string[];
    readonly cutRateKrw?: number;
  }) {
    return api.post<PlazaPresenceItem>(
      "/studio-ecosystem/plaza/presence",
      payload,
    );
  },

  listPlazaTrustBadges() {
    return api.get<{ items: PlazaTrustBadgeView[] }>(
      "/studio-ecosystem/plaza/trust-badges",
    );
  },

  getPartyStarterKit(partyId: string) {
    return api.get<PartyStarterKitView>(
      `/studio-ecosystem/plaza/parties/${encodeURIComponent(partyId)}/starter-kit`,
    );
  },

  savePartyStarterKit(
    partyId: string,
    payload: Omit<PartyStarterKitView, "partyId" | "updatedAt">,
  ) {
    return api.post<PartyStarterKitView>(
      `/studio-ecosystem/plaza/parties/${encodeURIComponent(partyId)}/starter-kit`,
      payload,
    );
  },

  inspectManuscriptPreflight(payload: {
    readonly partyId?: string;
    readonly fileName: string;
    readonly headerBase64?: string;
    readonly reportedWidthPx?: number;
    readonly reportedDpi?: number;
    readonly reportedColorProfile?: ManuscriptColorProfileView;
    readonly changedLayerNames?: readonly string[];
    readonly unresolvedMandatoryPinCount?: number;
  }) {
    return api.post<PlazaPreflightResultView>(
      "/studio-ecosystem/plaza/preflight-check",
      payload,
    );
  },

  listAcademyClassrooms() {
    return api.get<{ items: AcademyClassroomView[] }>(
      "/studio-ecosystem/academy/classrooms",
    );
  },

  createAcademyClassroom(payload: {
    readonly institutionName: string;
    readonly courseTitle: string;
    readonly instructorName: string;
    readonly cohortSize?: number;
  }) {
    return api.post<AcademyClassroomView>(
      "/studio-ecosystem/academy/classrooms",
      payload,
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

  issueDeliveryRightsCertificate(payload: {
    readonly workTitle: string;
    readonly episodeLabel: string;
    readonly creatorName: string;
    readonly verifiedAssets: readonly {
      readonly assetName: string;
      readonly category: "3d-bg" | "font" | "brush" | "texture" | "ai-assist";
      readonly licenseType: string;
      readonly licenseVerified: boolean;
    }[];
    readonly zeroUnauthorizedAiConfirmed: boolean;
  }) {
    return api.post<{
      certificateId: string;
      sha256Digest: string;
      shortVerifyCode: string;
      assetCount: number;
      issuedAt: string;
    }>("/studio-ecosystem/handoff/rights-certificate", payload);
  },

  createGuestReviewLink(payload: {
    readonly workspaceId: string;
    readonly episodeCutLabel: string;
    readonly createdByUserId: string;
    readonly ttlHours?: number;
  }) {
    return api.post<{
      token: string;
      workspaceId: string;
      episodeCutLabel: string;
      status: "active" | "revoked";
      expiresAt: string;
    }>("/studio-ecosystem/handoff/guest-links", payload);
  },

  revokeGuestReviewLink(token: string) {
    return api.post<{ token: string; status: "active" | "revoked" }>(
      `/studio-ecosystem/handoff/guest-links/${encodeURIComponent(token)}/revoke`,
      {},
    );
  },

  configureStudioByokPolicy(
    workspaceId: string,
    payload: {
      readonly enabled: boolean;
      readonly provider: "openai" | "anthropic" | "gemini" | "local";
      readonly keyTailHint?: string;
    },
  ) {
    return api.post<{
      workspaceId: string;
      enabled: boolean;
      provider: string;
      maskedKeyHint: string | null;
      platformTokenChargeKrw: 0;
    }>(
      `/studio-ecosystem/handoff/byok/${encodeURIComponent(workspaceId)}`,
      payload,
    );
  },
};
