import type { ProductionProjectAccess } from "./production-api";
import type { WebtoonJobPreset } from "./production-grand-atelier-collab-model";
import type { StudioReviewCollaboratorRole } from "../studio-review-workflow";
import type { CreatorRoleLens } from "@/shared/lib/creator-role-contract";

export interface PreservedDraftEntry {
  readonly label: string;
  readonly value: string;
  readonly locked?: boolean;
}

export interface RoleTransitionSummary {
  readonly previousRoleKo: string;
  readonly previousRoleEn: string;
  readonly currentRoleKo: string;
  readonly currentRoleEn: string;
  readonly direction: "downgraded" | "upgraded" | "switched";
  readonly nextActionsKo: string;
  readonly nextActionsEn: string;
}

const ACCESS_RANK: Readonly<Record<NonNullable<ProductionProjectAccess["role"]> | "none", number>> = {
  owner: 5,
  admin: 4,
  editor: 3,
  commenter: 2,
  viewer: 1,
  none: 0,
};

const ACCESS_LABELS: Readonly<
  Record<NonNullable<ProductionProjectAccess["role"]> | "none", { readonly ko: string; readonly en: string }>
> = {
  owner: { ko: "소유자", en: "Owner" },
  admin: { ko: "운영 관리자", en: "Admin" },
  editor: { ko: "편집 참여자", en: "Editor" },
  commenter: { ko: "검수·댓글 참여자", en: "Commenter" },
  viewer: { ko: "열람 전용 참여자", en: "Viewer" },
  none: { ko: "권한 없음", en: "No access" },
};

export function hasProductionAccessChanged(
  previous: ProductionProjectAccess,
  current: ProductionProjectAccess,
): boolean {
  return (
    previous.role !== current.role
    || previous.view !== current.view
    || previous.comment !== current.comment
    || previous.edit !== current.edit
    || previous.manage !== current.manage
    || previous.owner !== current.owner
  );
}

export function describeProductionAccessTransition(
  previous: ProductionProjectAccess,
  current: ProductionProjectAccess,
): RoleTransitionSummary {
  const prevKey = previous.role ?? "none";
  const currKey = current.role ?? "none";
  const prevRank = ACCESS_RANK[prevKey];
  const currRank = ACCESS_RANK[currKey];
  const direction = currRank < prevRank ? "downgraded" : currRank > prevRank ? "upgraded" : "switched";

  let nextActionsKo: string;
  let nextActionsEn: string;
  if (current.manage || current.owner) {
    nextActionsKo = "원고·기획 편집, 제출본 재제출, 검수 질문·결정, 참여 역할 관리까지 계속 진행할 수 있습니다.";
    nextActionsEn = "You can edit plans/manuscripts, resubmit revisions, post review decisions, and manage member roles.";
  } else if (current.edit) {
    nextActionsKo = "원고·기획 편집, 제출본 재제출, 검수 질문·결정을 계속 진행할 수 있습니다. (참여 역할 관리는 잠김)";
    nextActionsEn = "You can edit plans/manuscripts, resubmit revisions, and review cuts (member role management is locked).";
  } else if (current.comment) {
    nextActionsKo = "원고·일정 편집과 재제출 반영은 잠겼지만, 현재 화면 열람과 컷 위치 질문·코멘트 작성은 계속할 수 있습니다.";
    nextActionsEn = "Editing and resubmission are locked, but viewing and posting cut questions/comments remain available.";
  } else {
    nextActionsKo = "열람 전용으로 전환되어 서버 저장·질문 등록은 잠겼습니다. 현재 화면 열람과 남은 작성 내용 복사는 가능합니다.";
    nextActionsEn = "Switched to view-only; server saves and comment submission are locked, while viewing and copying your draft remain available.";
  }

  return {
    previousRoleKo: ACCESS_LABELS[prevKey].ko,
    previousRoleEn: ACCESS_LABELS[prevKey].en,
    currentRoleKo: ACCESS_LABELS[currKey].ko,
    currentRoleEn: ACCESS_LABELS[currKey].en,
    direction,
    nextActionsKo,
    nextActionsEn,
  };
}

const ROLE_LENS_LABELS: Readonly<Record<CreatorRoleLens, { readonly ko: string; readonly en: string }>> = {
  story: { ko: "스토리 작가", en: "Story writer" },
  art: { ko: "그림 작가", en: "Artist" },
  producer: { ko: "PD·편집자", en: "Producer" },
};

export function describeCreatorRoleLensTransition(
  previousLens: CreatorRoleLens,
  currentLens: CreatorRoleLens,
  canEdit: boolean,
): RoleTransitionSummary {
  const nextActionsKo = canEdit
    ? "새 역할 관점으로 컷 비교·질문 작성·검수 결정을 이어갈 수 있으며 작성 중이던 초안은 그대로 유지됩니다."
    : "열람 전용 범위에서 새 역할 관점으로 컷·이슈를 확인할 수 있으며 작성 중이던 초안은 복사해 보관할 수 있습니다.";
  const nextActionsEn = canEdit
    ? "Continue comparing cuts, posting questions, and recording review decisions from the new role lens with your drafts preserved."
    : "Inspect cuts and issues in view-only mode from the new role lens and copy any authored draft.";
  return {
    previousRoleKo: ROLE_LENS_LABELS[previousLens].ko,
    previousRoleEn: ROLE_LENS_LABELS[previousLens].en,
    currentRoleKo: ROLE_LENS_LABELS[currentLens].ko,
    currentRoleEn: ROLE_LENS_LABELS[currentLens].en,
    direction: "switched",
    nextActionsKo,
    nextActionsEn,
  };
}

const COLLAB_JOB_RANK: Readonly<Record<WebtoonJobPreset["id"], number>> = {
  "lead-author": 4,
  "line-color-assist": 3,
  "editor-pd": 2,
  "external-viewer": 1,
};

const COLLAB_JOB_LABELS: Readonly<
  Record<
    WebtoonJobPreset["id"],
    {
      readonly ko: string;
      readonly en: string;
      readonly nextKo: string;
      readonly nextEn: string;
    }
  >
> = {
  "lead-author": {
    ko: "총괄 작가",
    en: "Lead Creator",
    nextKo: "전 레이어 편집, 새 리비전 재제출, 좌표 핀 댓글·승인, 안전 이력 복원을 모두 실행할 수 있습니다.",
    nextEn: "Full layer editing, revision resubmission, pin comments, approval decisions, and history restore are enabled.",
  },
  "line-color-assist": {
    ko: "선화·채색 어시",
    en: "Line & Color Assist",
    nextKo: "선화·밑색 편집, 새 리비전 재제출, 좌표 핀 댓글·해결 표시가 가능하며 최종 승인·이력 복원은 잠깁니다.",
    nextEn: "Line/color editing, resubmission, and pin comments are enabled; final approval and history restore are locked.",
  },
  "editor-pd": {
    ko: "편집자 · 담당 PD",
    en: "Editor · PD",
    nextKo: "원고 수정·재제출·이력 복원은 잠겼지만, 좌표 핀 댓글 작성·전후 비교·수정 요청/최종 승인은 계속 가능합니다.",
    nextEn: "Manuscript edits, resubmission, and history restore are locked; pin comments, diff compare, and review decisions remain enabled.",
  },
  "external-viewer": {
    ko: "외부 열람자",
    en: "External Viewer",
    nextKo: "열람 전용으로 전환되어 핀 댓글·승인·재제출은 잠겼습니다. 컷 탐색·전후 비교·링크 복사와 남은 작성 내용 복사가 가능합니다.",
    nextEn: "Switched to view-only; comments, approvals, and resubmission are locked, while diff viewing, link sharing, and draft copy remain available.",
  },
};

export function describeCollabHubPresetTransition(
  previousId: WebtoonJobPreset["id"],
  currentId: WebtoonJobPreset["id"],
): RoleTransitionSummary {
  const prev = COLLAB_JOB_LABELS[previousId];
  const curr = COLLAB_JOB_LABELS[currentId];
  const direction =
    COLLAB_JOB_RANK[currentId] < COLLAB_JOB_RANK[previousId]
      ? "downgraded"
      : COLLAB_JOB_RANK[currentId] > COLLAB_JOB_RANK[previousId]
        ? "upgraded"
        : "switched";
  return {
    previousRoleKo: prev.ko,
    previousRoleEn: prev.en,
    currentRoleKo: curr.ko,
    currentRoleEn: curr.en,
    direction,
    nextActionsKo: curr.nextKo,
    nextActionsEn: curr.nextEn,
  };
}

const STUDIO_REVIEW_RANK: Readonly<Record<StudioReviewCollaboratorRole, number>> = {
  editor: 3,
  reviewer: 2,
  viewer: 1,
};

const STUDIO_REVIEW_LABELS: Readonly<
  Record<
    StudioReviewCollaboratorRole,
    {
      readonly ko: string;
      readonly en: string;
      readonly nextKo: string;
      readonly nextEn: string;
    }
  >
> = {
  editor: {
    ko: "원고 편집자",
    en: "Manuscript Editor",
    nextKo: "새 리비전 재제출, 좌표 핀 댓글·해결, 승인/수정 요청, 보관 이력 복구를 모두 실행할 수 있습니다.",
    nextEn: "Resubmission, coordinate pin comments, review decisions, and archived history restore are all enabled.",
  },
  reviewer: {
    ko: "담당 PD · 검수자",
    en: "Reviewer / PD",
    nextKo: "원고 재제출·보관 이력 복구는 잠겼지만, 좌표 핀 댓글 추가·해결 표시·승인/수정 요청은 계속할 수 있습니다.",
    nextEn: "Resubmission and history restore are locked, while adding pin comments, resolving items, and recording decisions remain enabled.",
  },
  viewer: {
    ko: "열람 전용 게스트",
    en: "Read-only Guest",
    nextKo: "열람 전용으로 전환되어 댓글 추가·승인·재제출·이력 복구가 잠겼습니다. 기존 스레드 열람과 남은 작성 내용 복사가 가능합니다.",
    nextEn: "Switched to read-only; adding comments, approvals, resubmission, and history restore are locked, while viewing threads and copying your draft remain available.",
  },
};

export function describeStudioReviewRoleTransition(
  previousRole: StudioReviewCollaboratorRole,
  currentRole: StudioReviewCollaboratorRole,
): RoleTransitionSummary {
  const prev = STUDIO_REVIEW_LABELS[previousRole];
  const curr = STUDIO_REVIEW_LABELS[currentRole];
  const direction =
    STUDIO_REVIEW_RANK[currentRole] < STUDIO_REVIEW_RANK[previousRole]
      ? "downgraded"
      : STUDIO_REVIEW_RANK[currentRole] > STUDIO_REVIEW_RANK[previousRole]
        ? "upgraded"
        : "switched";
  return {
    previousRoleKo: prev.ko,
    previousRoleEn: prev.en,
    currentRoleKo: curr.ko,
    currentRoleEn: curr.en,
    direction,
    nextActionsKo: curr.nextKo,
    nextActionsEn: curr.nextEn,
  };
}

export function formatPreservedDraftClipboardText(entries: readonly PreservedDraftEntry[]): string {
  return entries
    .map((entry) => ({ label: entry.label.trim(), value: entry.value.trim() }))
    .filter((entry) => entry.value.length > 0)
    .map((entry) => (entry.label ? `[${entry.label}]\n${entry.value}` : entry.value))
    .join("\n\n");
}

export function describeSharedCanvasRevalidationNotice(
  previous: { readonly role: string; readonly access: string },
  fresh: { readonly role: string; readonly access: string },
  studioTeamCanComment: boolean,
): string | null {
  const roleOrAccessChanged = previous.role !== fresh.role || previous.access !== fresh.access;
  if (!roleOrAccessChanged) return null;

  if (fresh.access !== "edit") {
    if (fresh.role === "commenter") {
      return studioTeamCanComment
        ? "검토 전용 권한으로 변경되었습니다. 원고 편집은 잠기지만 댓글 핀과 답글로 피드백을 계속 남길 수 있고, 현재 작업본은 JSON·이미지로 내보내 보존할 수 있어요."
        : "검토 전용 권한으로 변경되었습니다. 원고와 댓글 작성은 읽기 전용이며 기존 피드백 확인과 JSON·이미지 사본 내보내기가 가능해요.";
    }
    return "팀 편집 권한이 회수되었습니다. 로컬 변경은 JSON·이미지로 내보낼 수 있지만 서버에는 저장할 수 없어요. 열람과 사본 보관은 계속 가능합니다.";
  }

  return "공동 편집 권한으로 변경되었습니다. 보류 중이던 원고 편집과 팀 저장을 이어서 진행할 수 있어요.";
}
