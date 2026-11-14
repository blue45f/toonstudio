export const STUDIO_REVIEW_STATUSES = [
  "draft",
  "in-review",
  "changes-requested",
  "approved",
  "superseded",
] as const;

export type StudioReviewStatus = (typeof STUDIO_REVIEW_STATUSES)[number];
export type StudioReviewThreadKind = "comment" | "change-request" | "paint-over";
export type StudioReviewThreadStatus = "open" | "resolved";
export type StudioReviewDecision = "approved" | "changes-requested";
export type StudioReviewCollaboratorRole = "editor" | "reviewer" | "viewer";

export interface StudioReviewPinCoordinate {
  readonly cutId: string;
  readonly xPercent: number;
  readonly yPercent: number;
}

export interface SyntheticReviewCutPreset {
  readonly cutId: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly stageNoteKo: string;
  readonly stageNoteEn: string;
}

/** 실제 고객 원고를 쓰지 않는 합성 데모 컷 목록. */
export const SYNTHETIC_STUDIO_REVIEW_CUTS: readonly SyntheticReviewCutPreset[] = Object.freeze([
  Object.freeze({
    cutId: "cut-01",
    labelKo: "컷 01 · 오프닝 전경",
    labelEn: "Cut 01 · Opening Wide",
    stageNoteKo: "도시 야경 도입부 · 타이틀 여백 확인",
    stageNoteEn: "City night intro · title safe-margin check",
  }),
  Object.freeze({
    cutId: "cut-02",
    labelKo: "컷 02 · 대사 클로즈업",
    labelEn: "Cut 02 · Dialogue Close-up",
    stageNoteKo: "주인공 시선 방향 · 말풍선 꼬리 위치",
    stageNoteEn: "Protagonist gaze & speech-balloon tail",
  }),
  Object.freeze({
    cutId: "cut-03",
    labelKo: "컷 03 · 액션 하이라이트",
    labelEn: "Cut 03 · Action Highlight",
    stageNoteKo: "속도선 밀도 · 명암 대비 검수",
    stageNoteEn: "Speedline density & shadow contrast",
  }),
  Object.freeze({
    cutId: "cut-04",
    labelKo: "컷 04 · 엔딩 여운",
    labelEn: "Cut 04 · Cliffhanger Ending",
    stageNoteKo: "스크롤 간격 · 하단 예고 문구 배치",
    stageNoteEn: "Scroll pacing & bottom teaser placement",
  }),
]);

export function formatCutPinTargetId(pin: StudioReviewPinCoordinate): string {
  return `${pin.cutId} @ (${Math.round(pin.xPercent)}%, ${Math.round(pin.yPercent)}%)`;
}

export interface StudioReviewRolePermissions {
  readonly role: StudioReviewCollaboratorRole;
  readonly canComment: boolean;
  readonly canResolve: boolean;
  readonly canDecide: boolean;
  readonly canSaveCheckpoint: boolean;
  readonly canRestoreHistory: boolean;
  readonly canEditManuscript: boolean;
}

export interface SyntheticStudioReviewPersona {
  readonly actorId: string;
  readonly role: StudioReviewCollaboratorRole;
  readonly labelKo: string;
  readonly labelEn: string;
}

/** 실제 고객 데이터를 일절 사용하지 않는 합성 데모 협업 역할 프리셋. */
export const SYNTHETIC_STUDIO_REVIEW_PERSONAS: readonly SyntheticStudioReviewPersona[] = Object.freeze([
  Object.freeze({
    actorId: "project-owner",
    role: "editor",
    labelKo: "데모 메인작가 (편집·이력 복구)",
    labelEn: "Demo Lead Artist (Edit & Restore)",
  }),
  Object.freeze({
    actorId: "demo-reviewer-pd",
    role: "reviewer",
    labelKo: "데모 PD검수자 (댓글·승인 전용)",
    labelEn: "Demo PD Reviewer (Review Only)",
  }),
  Object.freeze({
    actorId: "demo-viewer-guest",
    role: "viewer",
    labelKo: "데모 열람참여자 (보기 전용)",
    labelEn: "Demo Guest Viewer (Read Only)",
  }),
]);

export function permissionsForStudioReviewRole(
  role: StudioReviewCollaboratorRole,
): StudioReviewRolePermissions {
  if (role === "editor") {
    return Object.freeze({
      role,
      canComment: true,
      canResolve: true,
      canDecide: true,
      canSaveCheckpoint: true,
      canRestoreHistory: true,
      canEditManuscript: true,
    });
  }
  if (role === "reviewer") {
    return Object.freeze({
      role,
      canComment: true,
      canResolve: true,
      canDecide: true,
      canSaveCheckpoint: false,
      canRestoreHistory: false,
      canEditManuscript: false,
    });
  }
  return Object.freeze({
    role: "viewer",
    canComment: false,
    canResolve: false,
    canDecide: false,
    canSaveCheckpoint: false,
    canRestoreHistory: false,
    canEditManuscript: false,
  });
}

export interface StudioReviewMessage {
  readonly id: string;
  readonly authorId: string;
  readonly body: string;
  readonly createdAt: string;
}

export interface StudioReviewThread {
  readonly id: string;
  readonly kind: StudioReviewThreadKind;
  readonly targetId: string;
  readonly status: StudioReviewThreadStatus;
  readonly messages: readonly StudioReviewMessage[];
  readonly resolvedBy: string | null;
  readonly resolvedAt: string | null;
  readonly pinCoordinate?: StudioReviewPinCoordinate | null;
}

export interface StudioReviewerDecision {
  readonly reviewerId: string;
  readonly decision: StudioReviewDecision;
  readonly note: string;
  readonly decidedAt: string;
}

export interface StudioReviewSession {
  readonly documentId: string;
  readonly versionId: string;
  readonly basedOnVersionId: string | null;
  readonly status: StudioReviewStatus;
  readonly requiredReviewerIds: readonly string[];
  readonly threads: readonly StudioReviewThread[];
  readonly decisions: readonly StudioReviewerDecision[];
  readonly submittedAt: string | null;
  readonly approvedAt: string | null;
  readonly updatedAt: string;
}

export interface StudioReviewReadiness {
  readonly canApprove: boolean;
  readonly openChangeRequestCount: number;
  readonly missingApprovalReviewerIds: readonly string[];
  readonly reasons: readonly string[];
}

export interface StudioReviewRevisionTransition {
  readonly previous: StudioReviewSession;
  readonly next: StudioReviewSession;
}

function requireText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function requireTimestamp(value: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error("A valid ISO timestamp is required.");
  return value;
}

function unique(values: readonly string[]): string[] {
  const normalized = values.map((value) => requireText(value, "Reviewer id"));
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("Reviewer ids must be unique.");
  }
  return normalized;
}

function immutableSession(session: StudioReviewSession): StudioReviewSession {
  return Object.freeze({
    ...session,
    requiredReviewerIds: Object.freeze([...session.requiredReviewerIds]),
    threads: Object.freeze([...session.threads]),
    decisions: Object.freeze([...session.decisions]),
  });
}

function assertMutable(session: StudioReviewSession): void {
  if (session.status === "approved" || session.status === "superseded") {
    throw new Error("Approved or superseded review versions are immutable.");
  }
}

export function createStudioReviewSession(input: {
  readonly documentId: string;
  readonly versionId: string;
  readonly requiredReviewerIds: readonly string[];
  readonly createdAt: string;
  readonly basedOnVersionId?: string | null;
}): StudioReviewSession {
  return immutableSession({
    documentId: requireText(input.documentId, "Document id"),
    versionId: requireText(input.versionId, "Version id"),
    basedOnVersionId: input.basedOnVersionId ?? null,
    status: "draft",
    requiredReviewerIds: unique(input.requiredReviewerIds),
    threads: [],
    decisions: [],
    submittedAt: null,
    approvedAt: null,
    updatedAt: requireTimestamp(input.createdAt),
  });
}

export function submitStudioReview(
  session: StudioReviewSession,
  submittedAt: string,
): StudioReviewSession {
  assertMutable(session);
  return immutableSession({
    ...session,
    status: "in-review",
    submittedAt: requireTimestamp(submittedAt),
    updatedAt: submittedAt,
  });
}

export function addStudioReviewThread(
  session: StudioReviewSession,
  thread: StudioReviewThread,
  updatedAt: string,
): StudioReviewSession {
  assertMutable(session);
  requireText(thread.id, "Thread id");
  requireText(thread.targetId, "Review target id");
  if (session.threads.some((candidate) => candidate.id === thread.id)) {
    throw new Error("Review thread ids must be unique.");
  }
  if (thread.messages.length === 0) throw new Error("A review thread requires a message.");
  for (const message of thread.messages) {
    requireText(message.id, "Message id");
    requireText(message.authorId, "Message author id");
    requireText(message.body, "Message body");
    requireTimestamp(message.createdAt);
  }
  const timestamp = requireTimestamp(updatedAt);
  return immutableSession({
    ...session,
    status: thread.kind === "change-request" ? "changes-requested" : session.status,
    threads: [...session.threads, Object.freeze({
      ...thread,
      messages: Object.freeze([...thread.messages]),
    })],
    updatedAt: timestamp,
  });
}

export function resolveStudioReviewThread(
  session: StudioReviewSession,
  threadId: string,
  actorId: string,
  resolvedAt: string,
): StudioReviewSession {
  assertMutable(session);
  const id = requireText(threadId, "Thread id");
  const actor = requireText(actorId, "Actor id");
  const timestamp = requireTimestamp(resolvedAt);
  let matched = false;
  const threads = session.threads.map((thread) => {
    if (thread.id !== id) return thread;
    matched = true;
    return Object.freeze({
      ...thread,
      status: "resolved" as const,
      resolvedBy: actor,
      resolvedAt: timestamp,
    });
  });
  if (!matched) throw new Error("Review thread was not found.");
  return immutableSession({ ...session, threads, updatedAt: timestamp });
}

export function reopenStudioReviewThread(
  session: StudioReviewSession,
  threadId: string,
  actorId: string,
  reopenedAt: string,
): StudioReviewSession {
  assertMutable(session);
  const id = requireText(threadId, "Thread id");
  requireText(actorId, "Actor id");
  const timestamp = requireTimestamp(reopenedAt);
  let matchedKind: StudioReviewThreadKind | null = null;
  const threads = session.threads.map((thread) => {
    if (thread.id !== id) return thread;
    matchedKind = thread.kind;
    return Object.freeze({
      ...thread,
      status: "open" as const,
      resolvedBy: null,
      resolvedAt: null,
    });
  });
  if (!matchedKind) throw new Error("Review thread was not found.");
  const nextStatus: StudioReviewStatus =
    matchedKind === "change-request" && session.status !== "draft"
      ? "changes-requested"
      : session.status;
  return immutableSession({ ...session, status: nextStatus, threads, updatedAt: timestamp });
}

export function studioReviewReadiness(
  session: StudioReviewSession,
): StudioReviewReadiness {
  const openChangeRequestCount = session.threads.filter(
    (thread) => thread.kind === "change-request" && thread.status === "open",
  ).length;
  const approvedReviewers = new Set(
    session.decisions
      .filter((decision) => decision.decision === "approved")
      .map((decision) => decision.reviewerId),
  );
  const missingApprovalReviewerIds = session.requiredReviewerIds.filter(
    (reviewerId) => !approvedReviewers.has(reviewerId),
  );
  const reasons: string[] = [];
  if (session.status === "draft") reasons.push("Submit the version for review first.");
  if (openChangeRequestCount > 0) reasons.push("Resolve every open change request.");
  if (missingApprovalReviewerIds.length > 0) reasons.push("Collect all required approvals.");
  return Object.freeze({
    canApprove: session.status !== "draft"
      && session.status !== "superseded"
      && openChangeRequestCount === 0
      && missingApprovalReviewerIds.length === 0,
    openChangeRequestCount,
    missingApprovalReviewerIds: Object.freeze(missingApprovalReviewerIds),
    reasons: Object.freeze(reasons),
  });
}

export function recordStudioReviewDecision(
  session: StudioReviewSession,
  decision: StudioReviewerDecision,
): StudioReviewSession {
  assertMutable(session);
  if (session.status === "draft") throw new Error("Submit the version before recording a decision.");
  const reviewerId = requireText(decision.reviewerId, "Reviewer id");
  const decidedAt = requireTimestamp(decision.decidedAt);
  const decisions = [
    ...session.decisions.filter((current) => current.reviewerId !== reviewerId),
    Object.freeze({
      ...decision,
      reviewerId,
      note: decision.note.trim(),
      decidedAt,
    }),
  ];
  const intermediate = immutableSession({
    ...session,
    status: decision.decision === "changes-requested"
      ? "changes-requested"
      : "in-review",
    decisions,
    updatedAt: decidedAt,
  });
  const readiness = studioReviewReadiness(intermediate);
  if (!readiness.canApprove) return intermediate;
  return immutableSession({
    ...intermediate,
    status: "approved",
    approvedAt: decidedAt,
  });
}

export function startStudioRevision(
  approved: StudioReviewSession,
  input: {
    readonly nextVersionId: string;
    readonly actorId: string;
    readonly createdAt: string;
  },
): StudioReviewRevisionTransition {
  if (approved.status !== "approved") {
    throw new Error("Only an approved version can start a protected revision.");
  }
  requireText(input.actorId, "Actor id");
  const createdAt = requireTimestamp(input.createdAt);
  const previous = immutableSession({
    ...approved,
    status: "superseded",
    updatedAt: createdAt,
  });
  const next = createStudioReviewSession({
    documentId: approved.documentId,
    versionId: requireText(input.nextVersionId, "Next version id"),
    basedOnVersionId: approved.versionId,
    requiredReviewerIds: approved.requiredReviewerIds,
    createdAt,
  });
  return Object.freeze({ previous, next });
}
