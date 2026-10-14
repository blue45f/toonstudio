import type {
  StudioTeamAssignableRole,
  StudioTeamInvitationSummary,
} from "../studio-team-client";

import type { BilingualLabel } from "./production-labels";

/**
 * 작품 초대 도착 신호 모델 — 작품 권한 초대(서버 초대)의 수락 지점은 지금까지
 * StudioTeamPanel의 받은 초대함 안에만 있었다. 초대받은 작품을 아직 열 수 없는
 * 사람은 협업 홈(/team)·사람·권한(/team/people) 어디에서도 "나에게 온 작품
 * 초대가 있다"는 신호를 받지 못했다(collab-flow-audit REPORT §1.3·마찰 3).
 *
 * 이 모델은 기존 계약 getStudioTeamInvitations가 돌려주는 pending 초대 목록을
 * "대기 중인 작품 초대 N건" 신호로 투영하는 순수 함수다. 새 판정·새 API는
 * 만들지 않는다: 건수는 서버가 pending으로 확정한 목록의 길이 그대로이고,
 * 수락 동선은 작품별 팀·권한 표면(workspaceProjectLinks.team과 같은 주소)으로
 * 한 번에 닿게 한다. 그 표면의 StudioTeamPanel이 pending 응답·받은 초대함의
 * 정본이며, 이 모델은 그 앞단의 발견 가능성만 책임진다.
 */

/** 한 번에 미리 보여 주는 초대 수. 나머지는 moreCount로 정직하게 알린다. */
export const WORK_INVITE_ARRIVAL_PREVIEW_LIMIT = 3;

/** 작품 역할 이름표. StudioTeamPanel ROLE_COPY의 ko 라벨과 사실을 맞춘다. */
export const WORK_INVITE_ROLE_LABELS: Readonly<
  Record<StudioTeamAssignableRole, BilingualLabel>
> = Object.freeze({
  admin: { ko: "관리자", en: "Admin" },
  editor: { ko: "편집자", en: "Editor" },
  commenter: { ko: "검토자", en: "Reviewer" },
  viewer: { ko: "열람자", en: "Viewer" },
});

/**
 * 수락 지점 주소 — studioProjectSectionHref(workId, "settings", "team")와
 * 바이트 단위로 같다(/studio/p/<id>/settings?view=team). 모델을 순수하게
 * 유지하려고 헬퍼를 import하지 않고 같은 규칙으로 조립한다.
 */
export function workInviteAcceptHref(workId: string): string {
  return `/studio/p/${encodeURIComponent(workId)}/settings?view=team`;
}

export interface WorkInviteArrivalItem {
  readonly workId: string;
  readonly workTitle: string;
  readonly ownerName: string;
  readonly role: StudioTeamAssignableRole;
  readonly roleLabel: BilingualLabel;
  readonly invitedAt: string;
  /** 이 초대의 수락 지점(작품 팀·권한 표면). 클릭 1회로 닿는다. */
  readonly acceptHref: string;
}

export interface WorkInviteArrival {
  readonly count: number;
  readonly headline: BilingualLabel;
  readonly description: BilingualLabel;
  readonly items: readonly WorkInviteArrivalItem[];
  /** 미리보기에 다 담지 못한 나머지 건수. 0이면 전부 보인다. */
  readonly moreCount: number;
  readonly moreLabel: BilingualLabel | null;
}

/**
 * pending 초대 목록 → 도착 신호. 초대가 없으면 null(신호를 숨기는 것이
 * 정직하다 — "0건" 배너는 소음이고, 로딩·에러는 컴포넌트가 따로 말한다).
 * 정렬은 초대 시각 최신순(서버도 최신순이지만 계약에 기대지 않고 고정한다).
 */
export function workInviteArrivalModel(
  invitations: readonly StudioTeamInvitationSummary[],
): WorkInviteArrival | null {
  if (invitations.length === 0) return null;

  const sorted = [...invitations].sort(
    (a, b) =>
      b.invitedAt.localeCompare(a.invitedAt) || a.workId.localeCompare(b.workId),
  );
  const count = sorted.length;
  const items = sorted
    .slice(0, WORK_INVITE_ARRIVAL_PREVIEW_LIMIT)
    .map((invitation) => ({
      workId: invitation.workId,
      workTitle: invitation.workTitle,
      ownerName: invitation.owner.name,
      role: invitation.role,
      roleLabel: WORK_INVITE_ROLE_LABELS[invitation.role],
      invitedAt: invitation.invitedAt,
      acceptHref: workInviteAcceptHref(invitation.workId),
    }));
  const moreCount = count - items.length;

  return {
    count,
    headline: {
      ko: `대기 중인 작품 초대 ${count}건`,
      en:
        count === 1
          ? "1 work invitation waiting"
          : `${count} work invitations waiting`,
    },
    description: {
      ko: "작품마다 초대한 사람과 내 역할을 확인하고, 수락 지점에서 바로 수락하거나 거절할 수 있어요.",
      en: "Check who invited you and your role for each work — you can accept or decline right at the accept point.",
    },
    items,
    moreCount,
    moreLabel:
      moreCount > 0
        ? {
            ko: `이 밖에 작품 초대 ${moreCount}건이 더 있어요. 각 작품의 팀·권한 화면에서 모두 확인할 수 있어요.`,
            en: `${moreCount} more work invitation${moreCount === 1 ? "" : "s"} — you can review all of them from each work's team & access screen.`,
          }
        : null,
  };
}
