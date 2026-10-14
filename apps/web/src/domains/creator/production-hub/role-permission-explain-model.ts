import type { TeamWorkspaceRole } from "@toonstudio/contracts/production-workspace";

import type {
  StudioTeamCapabilities,
  StudioTeamRole,
} from "../studio-team-client";
import type { BilingualLabel } from "./production-labels";

/**
 * 역할·권한 자기설명 모델 — "내가 지금 뭘 할 수 있고, 뭘 못 하는지, 막히면 누구에게
 * 어떻게 요청하는지"를 자연어로 바꾸는 순수 모델.
 *
 * 새 권한 판정을 만들지 않는다. 문장의 근거는 전부 기존 판정·계약이다:
 * - 워크스페이스 역할: 서버 계약 4단계(@toonstudio/contracts/production-workspace)와
 *   TeamWorkspacePage의 실제 노출 조건(관리자 전용 카드는 isWorkspaceManager,
 *   구성원 목록은 guest에게 비공개), TeamAccessGuide의 역할 가이드 문구.
 * - 작품 역할: StudioTeamPanel의 ROLE_COPY와 서버가 내려 주는 StudioTeamCapabilities.
 * - capabilitiesExplanation은 서버 판정 boolean을 문장으로만 옮긴다.
 */
export interface RolePermissionExplanation {
  readonly label: BilingualLabel;
  readonly summary: BilingualLabel;
  readonly can: readonly BilingualLabel[];
  readonly cannot: readonly BilingualLabel[];
}

const WORKSPACE_EXPLANATIONS: Record<TeamWorkspaceRole, RolePermissionExplanation> = {
  owner: {
    label: { ko: "소유자", en: "Owner" },
    summary: { ko: "이 팀을 만든 사람이에요. 팀 운영의 모든 권한을 가집니다.", en: "You created this team and hold every team-management right." },
    can: [
      { ko: "팀 이름 바꾸기, 구성원 초대·제외, 역할 변경", en: "Rename the team, invite or remove members, change roles" },
      { ko: "관리자 초대와 소유권 이전", en: "Invite admins and transfer ownership" },
      { ko: "작품 연결·해제와 사용량 확인", en: "Link or unlink projects and check usage" },
    ],
    cannot: [
      { ko: "팀 연결만으로 작품 소유권이 넘어오지는 않아요 — 작품 권한은 작품별로 따로 움직입니다", en: "Linking a team never moves project ownership — project access is granted per project" },
    ],
  },
  admin: {
    label: { ko: "관리자", en: "Admin" },
    summary: { ko: "소유자와 함께 팀을 운영해요.", en: "You run this team together with the owner." },
    can: [
      { ko: "구성원 초대·제외와 역할 변경(구성원·게스트까지)", en: "Invite or remove members and change roles (member and guest)" },
      { ko: "팀 이름 바꾸기, 작품 연결·해제, 사용량 확인", en: "Rename the team, link or unlink projects, check usage" },
      { ko: "구성원 목록과 연결된 작품 목록 보기", en: "See the member list and linked projects" },
    ],
    cannot: [
      { ko: "다른 관리자를 초대하거나 소유권을 이전하는 건 소유자만 할 수 있어요", en: "Only the owner can invite another admin or transfer ownership" },
      { ko: "팀 소속만으로 원고가 열리지는 않아요 — 작품 권한은 작품별로 따로 받아요", en: "Team membership alone doesn't open manuscripts — project access is granted per project" },
    ],
  },
  member: {
    label: { ko: "구성원", en: "Member" },
    summary: { ko: "팀에 소속되어 함께 일하는 사람이에요.", en: "You belong to this team and work with it." },
    can: [
      { ko: "구성원 목록과 연결된 작품 목록 보기", en: "See the member list and linked projects" },
      { ko: "작품 권한을 받으면 그 작품의 원고 편집·검토 참여", en: "Once given project access, edit and review that project's pages" },
    ],
    cannot: [
      { ko: "사람 초대·구성원 관리·팀 설정 변경은 소유자·관리자만 할 수 있어요", en: "Only the owner and admins can invite people, manage members, or change team settings" },
      { ko: "팀 소속만으로 원고가 열리지는 않아요 — 작품 권한은 작품별로 따로 받아요", en: "Team membership alone doesn't open manuscripts — project access is granted per project" },
    ],
  },
  guest: {
    label: { ko: "게스트", en: "Guest" },
    summary: { ko: "초대 링크로 잠깐 참여하는 외부 사람이에요.", en: "You're an outside participant joining through an invite link." },
    can: [
      { ko: "허락받은 작품과 검수본만 보기", en: "See only the projects and review copies shared with you" },
    ],
    cannot: [
      { ko: "구성원 목록은 볼 수 없어요", en: "You can't see the member list" },
      { ko: "다른 사람을 초대하거나 팀 설정을 바꿀 수 없어요", en: "You can't invite others or change team settings" },
    ],
  },
};

export function workspaceRolePermissionExplanation(
  role: TeamWorkspaceRole,
): RolePermissionExplanation {
  return WORKSPACE_EXPLANATIONS[role];
}

const PROJECT_EXPLANATIONS: Record<StudioTeamRole, RolePermissionExplanation> = {
  owner: {
    label: { ko: "소유자", en: "Owner" },
    summary: { ko: "이 작품의 모든 것을 관리해요.", en: "You manage everything about this work." },
    can: [
      { ko: "원고 편집과 공동 저장", en: "Edit pages and save them together" },
      { ko: "게시 상태 변경과 작품 연결 관리", en: "Change publish state and manage project links" },
      { ko: "팀원 초대·역할 관리", en: "Invite members and manage roles" },
    ],
    cannot: [],
  },
  admin: {
    label: { ko: "관리자", en: "Admin" },
    summary: { ko: "원고를 함께 만들고 팀원을 관리해요.", en: "You build pages together and manage members." },
    can: [
      { ko: "원고 읽기와 공동 저장", en: "Read pages and save them together" },
      { ko: "팀원 초대·관리", en: "Invite and manage members" },
    ],
    cannot: [
      { ko: "게시는 소유자만 할 수 있어요", en: "Only the owner can publish" },
      { ko: "작품 소유권 이전은 소유자만 할 수 있어요", en: "Only the owner can transfer ownership of the work" },
    ],
  },
  editor: {
    label: { ko: "편집자", en: "Editor" },
    summary: { ko: "원고를 고치는 사람이에요.", en: "You edit this work's pages." },
    can: [
      { ko: "원고 읽기와 공동 저장", en: "Read pages and save them together" },
      { ko: "검수에 제출하고 의견에 답변", en: "Submit for review and reply to feedback" },
    ],
    cannot: [
      { ko: "게시 상태와 팀원은 바꿀 수 없어요", en: "You can't change publish state or members" },
    ],
  },
  commenter: {
    label: { ko: "검토자", en: "Reviewer" },
    summary: { ko: "원고를 보고 의견만 남기는 사람이에요.", en: "You review pages and only leave feedback." },
    can: [
      { ko: "원고 읽기", en: "Read pages" },
      { ko: "댓글·핀으로 검토 의견 남기기", en: "Leave review feedback with comments and pins" },
    ],
    cannot: [
      { ko: "원고를 고칠 수 없어요", en: "You can't edit pages" },
      { ko: "게시 상태와 팀원은 바꿀 수 없어요", en: "You can't change publish state or members" },
    ],
  },
  viewer: {
    label: { ko: "열람자", en: "Viewer" },
    summary: { ko: "공유된 원고를 읽기만 하는 사람이에요.", en: "You can only read the shared pages." },
    can: [{ ko: "공유 원고 읽기", en: "Read the shared pages" }],
    cannot: [
      { ko: "댓글·편집·게시는 할 수 없어요", en: "You can't comment, edit, or publish" },
    ],
  },
};

export function projectRolePermissionExplanation(
  role: StudioTeamRole,
): RolePermissionExplanation {
  return PROJECT_EXPLANATIONS[role];
}

/**
 * 서버가 내려 준 실제 판정(StudioTeamCapabilities)을 문장으로 옮긴다.
 * boolean이 곧 권한이므로, 여기서는 어떤 추론도 더하지 않는다.
 */
export function capabilityPermissionExplanation(
  capabilities: StudioTeamCapabilities,
): Pick<RolePermissionExplanation, "can" | "cannot"> {
  const can: BilingualLabel[] = [];
  const cannot: BilingualLabel[] = [];
  const push = (allowed: boolean, text: BilingualLabel) => {
    (allowed ? can : cannot).push(text);
  };
  push(capabilities.view, { ko: "원고 보기", en: "View pages" });
  push(capabilities.edit, { ko: "원고 고치기(공동 저장)", en: "Edit pages (save together)" });
  push(capabilities.comment, { ko: "댓글·의견 남기기", en: "Leave comments and feedback" });
  push(capabilities.manageMembers, { ko: "팀원 초대·관리", en: "Invite and manage members" });
  if (capabilities.respondInvite) {
    can.push({ ko: "받은 초대에 응답하기", en: "Respond to invitations" });
  }
  return { can, cannot };
}

/** 권한 때문에 막히는 행동. 표면이 숨기는 대신 이유와 요청 방법을 보여 줄 때 쓴다. */
export type PermissionBlockAction =
  | "invite-member"
  | "manage-members"
  | "team-settings"
  | "edit-manuscript"
  | "comment-manuscript"
  | "publish-work"
  | "project-access";

export interface PermissionBlockNoticeData {
  readonly title: BilingualLabel;
  readonly reason: BilingualLabel;
  readonly requestGuide: BilingualLabel;
  /** 요청하러 가거나 관리자를 확인할 수 있는 화면. 없으면 문구 안내만 한다. */
  readonly requestHref: string | null;
  readonly requestLinkLabel: BilingualLabel | null;
}

const TEAM_PEOPLE_HREF = "/team/people";

export function permissionBlockNotice(
  action: PermissionBlockAction,
): PermissionBlockNoticeData {
  switch (action) {
    case "invite-member":
      return {
        title: { ko: "사람 초대는 관리자만 할 수 있어요", en: "Only managers can invite people" },
        reason: { ko: "초대와 구성원 관리는 팀 소유자·관리자의 권한이에요. 지금 내 역할로는 초대 버튼이 보이지 않습니다.", en: "Invites and member management belong to the team owner and admins, so the invite button isn't shown for your role." },
        requestGuide: { ko: "소유자나 관리자에게 초대를 부탁하거나, 내 역할을 관리자로 올려 달라고 요청하세요. 누가 관리자인지 사람·권한 화면에서 확인할 수 있어요.", en: "Ask the owner or an admin to send the invite, or to raise your role to admin. You can see who the managers are under People & access." },
        requestHref: TEAM_PEOPLE_HREF,
        requestLinkLabel: { ko: "사람·권한에서 관리자 확인", en: "See managers in People & access" },
      };
    case "manage-members":
      return {
        title: { ko: "구성원 관리는 관리자만 할 수 있어요", en: "Only managers can manage members" },
        reason: { ko: "역할 변경과 구성원 제외는 팀 소유자·관리자의 권한이에요.", en: "Changing roles and removing members belong to the team owner and admins." },
        requestGuide: { ko: "소유자나 관리자에게 변경을 요청하세요. 누가 관리자인지 사람·권한 화면에서 확인할 수 있어요.", en: "Ask the owner or an admin to make the change. You can see who the managers are under People & access." },
        requestHref: TEAM_PEOPLE_HREF,
        requestLinkLabel: { ko: "사람·권한에서 관리자 확인", en: "See managers in People & access" },
      };
    case "team-settings":
      return {
        title: { ko: "팀 설정은 관리자만 바꿀 수 있어요", en: "Only managers can change team settings" },
        reason: { ko: "팀 이름·작품 연결 같은 설정은 팀 소유자·관리자의 권한이에요.", en: "Settings such as the team name and linked projects belong to the team owner and admins." },
        requestGuide: { ko: "소유자나 관리자에게 변경을 요청하세요. 누가 관리자인지 사람·권한 화면에서 확인할 수 있어요.", en: "Ask the owner or an admin to make the change. You can see who the managers are under People & access." },
        requestHref: TEAM_PEOPLE_HREF,
        requestLinkLabel: { ko: "사람·권한에서 관리자 확인", en: "See managers in People & access" },
      };
    case "edit-manuscript":
      return {
        title: { ko: "지금 역할로는 원고를 고칠 수 없어요", en: "Your role can't edit pages" },
        reason: { ko: "검토자·열람자 역할은 원고를 읽고 의견을 남기는 역할이라, 원고 자체는 바꿀 수 없어요.", en: "Reviewer and viewer roles read pages and leave feedback, so the pages themselves can't be changed." },
        requestGuide: { ko: "고칠 내용이 있으면 댓글·핀으로 남겨 주세요. 직접 고쳐야 한다면 작품 소유자나 관리자에게 편집자 역할을 요청하세요.", en: "Leave changes as comments or pins. If you need to edit directly, ask the work's owner or an admin for the editor role." },
        requestHref: null,
        requestLinkLabel: null,
      };
    case "comment-manuscript":
      return {
        title: { ko: "지금 역할로는 의견을 남길 수 없어요", en: "Your role can't leave feedback" },
        reason: { ko: "열람자 역할은 공유된 원고를 읽기만 하는 역할이에요.", en: "The viewer role only reads the shared pages." },
        requestGuide: { ko: "의견을 남겨야 한다면 작품 소유자나 관리자에게 검토자 역할을 요청하세요.", en: "If you need to leave feedback, ask the work's owner or an admin for the reviewer role." },
        requestHref: null,
        requestLinkLabel: null,
      };
    case "publish-work":
      return {
        title: { ko: "게시는 소유자만 할 수 있어요", en: "Only the owner can publish" },
        reason: { ko: "게시 상태 변경은 작품 소유자의 권한으로 고정돼 있어요. 관리자에게도 열려 있지 않습니다.", en: "Changing publish state is reserved for the work's owner — it isn't open to admins either." },
        requestGuide: { ko: "게시 준비가 끝나면 소유자에게 게시를 요청하세요. 검수 승인이 끝나 있어야 게시할 수 있어요.", en: "When everything is ready, ask the owner to publish. Review approval must be complete first." },
        requestHref: null,
        requestLinkLabel: null,
      };
    case "project-access":
      return {
        title: { ko: "이 작품에 대한 권한이 아직 없어요", en: "You don't have access to this work yet" },
        reason: { ko: "팀에 합류해도 작품 원고는 자동으로 열리지 않아요. 작품 권한은 팀 소속과 별도로 받아야 합니다.", en: "Joining a team doesn't open a work's pages automatically. Project access is granted separately from team membership." },
        requestGuide: { ko: "초대한 관리자나 작품 소유자에게 이 작품의 권한을 요청하세요. 권한을 받으면 이 화면에서 바로 열립니다.", en: "Ask the inviting manager or the work's owner for access to this work. Once granted, it opens right here." },
        requestHref: TEAM_PEOPLE_HREF,
        requestLinkLabel: { ko: "사람·권한 열기", en: "Open People & access" },
      };
  }
}
