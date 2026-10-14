/**
 * 조직·팀 공용 라이브러리 스코프 계약의 정본.
 *
 * 지금까지 라이브러리(에셋·브러시·템플릿)는 개인/작품 스코프와 마켓 유통만 있었다.
 * 이 계약은 같은 아이템에 "팀 공유"와 "조직 공유" 스코프를 더한다.
 *
 * - 팀 공유: 올린 사람의 팀(워크스페이스)에 속한 작품이면 어느 작품에서든 바로 보인다.
 *   작품이 달라도 팀이 같으면 보인다 — 스코프의 기준은 작품이 아니라 팀이다.
 * - 조직 공유: 조직에 연결된 팀 전체로 전파된다. 조직 구성원이 아니어도, 지금 여는
 *   작품의 팀이 그 조직에 연결돼 있으면 보인다. 조직 연결이 해제되면 전파도 끊긴다.
 * - 조직 소속·팀 소속 자체가 원고 접근권을 새로 만들지는 않는다(조직 계약과 같은 경계).
 *   이 계약이 정하는 것은 라이브러리 아이템의 보임과 게시·관리 권한뿐이다.
 *
 * 웹 표시와 서버 강제가 이 파일의 판정 함수를 함께 쓰므로 양쪽이 어긋날 수 없다.
 * 조직 역할 값은 production-organization의 OrganizationRole과 동일하지만, 두 계약의
 * 머지 순서에 의존하지 않도록 이 파일 안에서 같은 값의 별칭으로 선언한다.
 */
import type { TeamWorkspaceRole } from "./production-workspace";

export type SharedLibraryItemKind = "asset" | "brush" | "template";

/** personal=내 라이브러리, work=이 작품만, team=팀 공유, organization=조직 공유, market=마켓 공개. */
export type SharedLibraryScope = "personal" | "work" | "team" | "organization" | "market";

/** production-organization의 OrganizationRole과 값이 같은 조직 역할. */
export type SharedLibraryOrganizationRole = "owner" | "admin" | "manager" | "member" | "guest";

/**
 * 아이템이 어느 스코프에 게시됐는지의 배치 정보.
 * 스코프마다 필요한 식별자가 다르다: team은 workspaceId, organization은 organizationId,
 * work는 workId가 반드시 있어야 하고, personal/market은 셋 다 없어야 한다.
 * 불변식은 sharedLibraryPlacementErrors가 검사한다.
 */
export interface SharedLibraryPlacement {
  readonly scope: SharedLibraryScope;
  readonly ownerUserId: string;
  readonly workId: string | null;
  readonly workspaceId: string | null;
  readonly organizationId: string | null;
}

export interface SharedLibraryItem {
  readonly id: string;
  readonly kind: SharedLibraryItemKind;
  readonly title: string;
  readonly placement: SharedLibraryPlacement;
  readonly revision: number;
  readonly updatedAt: string;
}

/**
 * 보는 사람의 현재 맥락. 서버가 멤버십에서 도출해 내려주며, 클라이언트가 임의로
 * 넓힐 수 없다. organizationLinkedWorkspaces는 "조직 → 연결된 팀 목록"으로,
 * 조직 공유 전파 판정의 근거다(조직 상세의 linkedWorkspaceIds와 같은 값).
 */
export interface SharedLibraryViewerContext {
  readonly userId: string;
  /** 지금 열고 있는 작품. 없으면(작품 밖 라이브러리 탐색) null. */
  readonly workId: string | null;
  /** 지금 열고 있는 작품이 속한 팀(워크스페이스). 작품이 팀에 붙어 있지 않으면 null. */
  readonly workspaceId: string | null;
  /** 현재 팀에서의 내 역할. 팀 맥락이 없으면 null. */
  readonly teamRole: TeamWorkspaceRole | null;
  /** organizationId → 그 조직에서의 내 역할. 구성원이 아닌 조직은 항목이 없다. */
  readonly organizationRoles: Readonly<Record<string, SharedLibraryOrganizationRole>>;
  /** organizationId → 그 조직에 연결된 workspaceId 목록. */
  readonly organizationLinkedWorkspaces: Readonly<Record<string, readonly string[]>>;
}

/** 무료 공용 라이브러리 정책 v1. 한도는 서버가 강제한다. */
export const SHARED_LIBRARY_FREE_POLICY = Object.freeze({
  version: "free-shared-library-v1",
  teamItemsPerWorkspace: 1000,
  organizationItemsPerOrganization: 5000,
});
export type SharedLibraryFreePolicy = {
  readonly [K in keyof typeof SHARED_LIBRARY_FREE_POLICY]: K extends "version" ? string : number;
};

export const SHARED_LIBRARY_SCOPE_LABELS: Readonly<Record<SharedLibraryScope, string>> = Object.freeze({
  personal: "내 라이브러리",
  work: "이 작품만",
  team: "팀 공유",
  organization: "조직 공유",
  market: "마켓",
});

/** 스코프 선택지에서 사용자가 범위를 오해하지 않도록 한 줄로 설명한다. */
export const SHARED_LIBRARY_SCOPE_DESCRIPTIONS: Readonly<Record<SharedLibraryScope, string>> =
  Object.freeze({
    personal: "나만 볼 수 있어요.",
    work: "이 작품에서만 볼 수 있어요.",
    team: "같은 팀의 모든 작품에서 바로 보여요.",
    organization: "조직에 연결된 모든 팀의 작품에서 보여요.",
    market: "마켓 등록 절차를 거쳐 모두에게 공개돼요.",
  });

/** 배치 불변식 위반 코드. 빈 배열이면 유효한 배치다. */
export function sharedLibraryPlacementErrors(
  placement: SharedLibraryPlacement,
): readonly string[] {
  const errors: string[] = [];
  if (!placement.ownerUserId) errors.push("owner-required");
  switch (placement.scope) {
    case "team":
      if (!placement.workspaceId) errors.push("workspace-required");
      if (placement.organizationId) errors.push("organization-not-allowed");
      break;
    case "organization":
      if (!placement.organizationId) errors.push("organization-required");
      if (placement.workspaceId) errors.push("workspace-not-allowed");
      break;
    case "work":
      if (!placement.workId) errors.push("work-required");
      if (placement.workspaceId) errors.push("workspace-not-allowed");
      if (placement.organizationId) errors.push("organization-not-allowed");
      break;
    case "personal":
    case "market":
      if (placement.workId) errors.push("work-not-allowed");
      if (placement.workspaceId) errors.push("workspace-not-allowed");
      if (placement.organizationId) errors.push("organization-not-allowed");
      break;
  }
  return errors;
}

export function isValidSharedLibraryPlacement(placement: SharedLibraryPlacement): boolean {
  return sharedLibraryPlacementErrors(placement).length === 0;
}

/**
 * 이 아이템이 이 맥락에서 보이는가.
 * 잘못된 배치(불변식 위반)는 어떤 스코프에서도 보이지 않는다 — 조용히 넓게 열리는
 * 것보다 안 보이는 쪽이 안전하다.
 */
export function canViewSharedLibraryItem(
  item: Pick<SharedLibraryItem, "placement">,
  context: SharedLibraryViewerContext,
): boolean {
  const placement = item.placement;
  if (!isValidSharedLibraryPlacement(placement)) return false;
  switch (placement.scope) {
    case "market":
      return true;
    case "personal":
      return placement.ownerUserId === context.userId;
    case "work":
      return context.workId !== null && placement.workId === context.workId;
    case "team":
      // 게스트 포함 팀 구성원이면 읽기 가능. 게시는 canPublish가 따로 막는다.
      return context.teamRole !== null && placement.workspaceId === context.workspaceId;
    case "organization": {
      const organizationId = placement.organizationId as string;
      const role = context.organizationRoles[organizationId];
      if (role !== undefined && role !== "guest") return true;
      // 전파: 내 조직이 아니어도, 지금 작품의 팀이 조직에 연결돼 있으면 보인다.
      const linked = context.organizationLinkedWorkspaces[organizationId] ?? [];
      return context.workspaceId !== null && linked.includes(context.workspaceId);
    }
  }
}

/**
 * 이 스코프에 새 아이템을 올릴 수 있는가.
 * - 팀 공유: 게스트를 제외한 팀 구성원(작품이 달라도 팀이 같으면 게시 대상 팀은 현재 팀).
 * - 조직 공유: 조직의 owner/admin/manager만. member가 올린 개인 자산을 조직 표준으로
 *   승격하는 것은 관리자 몫이다 — 조직 라이브러리가 개인 업로드로 오염되지 않게.
 * - 마켓: 이 계약이 아니라 마켓 등록 절차가 정본이라 항상 false.
 */
export function canPublishToSharedLibraryScope(
  scope: SharedLibraryScope,
  context: SharedLibraryViewerContext,
  target: { readonly workspaceId?: string | null; readonly organizationId?: string | null } = {},
): boolean {
  switch (scope) {
    case "personal":
    case "work":
      return true;
    case "team": {
      const workspaceId = target.workspaceId ?? context.workspaceId;
      return (
        workspaceId !== null &&
        workspaceId === context.workspaceId &&
        context.teamRole !== null &&
        context.teamRole !== "guest"
      );
    }
    case "organization": {
      const organizationId = target.organizationId ?? null;
      if (!organizationId) return false;
      const role = context.organizationRoles[organizationId];
      return role === "owner" || role === "admin" || role === "manager";
    }
    case "market":
      return false;
  }
}

/**
 * 게시된 아이템을 고치거나 내릴 수 있는가.
 * 본인 아이템은 항상 가능. 남의 아이템은 그 스코프의 관리자만:
 * 팀 아이템은 팀 owner/admin, 조직 아이템은 조직 owner/admin.
 */
export function canManageSharedLibraryItem(
  item: Pick<SharedLibraryItem, "placement">,
  context: SharedLibraryViewerContext,
): boolean {
  const placement = item.placement;
  if (placement.ownerUserId === context.userId) return true;
  if (placement.scope === "team") {
    return (
      placement.workspaceId === context.workspaceId &&
      (context.teamRole === "owner" || context.teamRole === "admin")
    );
  }
  if (placement.scope === "organization" && placement.organizationId) {
    const role = context.organizationRoles[placement.organizationId];
    return role === "owner" || role === "admin";
  }
  return false;
}

const SCOPE_RANK: Readonly<Record<SharedLibraryScope, number>> = Object.freeze({
  organization: 0,
  team: 1,
  work: 2,
  personal: 3,
  market: 4,
});

/**
 * 맥락에서 보이는 아이템만, 결정적 순서로 돌려준다.
 * 스튜디오 표준(조직→팀)이 먼저 오고, 동률이면 제목 코드포인트→id 순 —
 * localeCompare를 쓰지 않아 같은 입력이면 어느 기기에서도 같은 순서다.
 */
export function resolveVisibleSharedLibraryItems(
  items: readonly SharedLibraryItem[],
  context: SharedLibraryViewerContext,
): readonly SharedLibraryItem[] {
  return items
    .filter((item) => canViewSharedLibraryItem(item, context))
    .sort(
      (left, right) =>
        SCOPE_RANK[left.placement.scope] - SCOPE_RANK[right.placement.scope] ||
        (left.title < right.title ? -1 : left.title > right.title ? 1 : 0) ||
        (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    );
}

/** 스코프 변경·삭제 커맨드. 서버 강제는 이 입력만 받는다(행위자·소유자 위조 불가). */
export type SharedLibraryCommandInput =
  | { readonly type: "set-scope"; readonly itemId: string; readonly placement: SharedLibraryPlacement }
  | { readonly type: "remove"; readonly itemId: string };
