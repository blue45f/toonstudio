/**
 * 조직·팀 공용 라이브러리 스코프의 웹 배선.
 *
 * 판정 규칙의 정본은 contracts의 production-shared-library다. 이 파일은 그 계약을
 * 웹 표면(통합 에셋 카탈로그·브러시 라이브러리)이 쓰는 모양으로 잇는 어댑터만 둔다:
 * - 보는 사람의 맥락(현재 작품·그 작품의 팀·조직 역할·조직 연결 팀)을 조립하고,
 * - 배치(placement)가 붙은 카탈로그 아이템에 가시성을 적용해 스코프와 배지를 입히고,
 * - 스코프 필터 선택지를 표면에 제공한다.
 *
 * 배치 없는 기존 아이템(Studio 내장·내 에셋)은 지금까지와 똑같이 보인다.
 * 서버 저장이 붙기 전까지 배치는 호출부가 소유자·팀·조직 식별자와 함께 넘긴다.
 */
import {
  SHARED_LIBRARY_SCOPE_DESCRIPTIONS,
  SHARED_LIBRARY_SCOPE_LABELS,
  canViewSharedLibraryItem,
  type SharedLibraryOrganizationRole,
  type SharedLibraryPlacement,
  type SharedLibraryViewerContext,
} from "@toonstudio/contracts/production-shared-library";
import type { TeamWorkspaceRole } from "@toonstudio/contracts/production-workspace";

import type {
  StudioUnifiedAssetItem,
  StudioUnifiedAssetScope,
} from "./studio-unified-asset-catalog";

export {
  SHARED_LIBRARY_SCOPE_DESCRIPTIONS,
  SHARED_LIBRARY_SCOPE_LABELS,
  canManageSharedLibraryItem,
  canPublishToSharedLibraryScope,
  canViewSharedLibraryItem,
  resolveVisibleSharedLibraryItems,
} from "@toonstudio/contracts/production-shared-library";
export type {
  SharedLibraryItem,
  SharedLibraryItemKind,
  SharedLibraryOrganizationRole,
  SharedLibraryPlacement,
  SharedLibraryScope,
  SharedLibraryViewerContext,
} from "@toonstudio/contracts/production-shared-library";

export interface StudioSharedLibraryContextInput {
  readonly userId: string;
  readonly workId?: string | null;
  readonly workspaceId?: string | null;
  readonly teamRole?: TeamWorkspaceRole | null;
  readonly organizationRoles?: Readonly<Record<string, SharedLibraryOrganizationRole>>;
  readonly organizationLinkedWorkspaces?: Readonly<Record<string, readonly string[]>>;
}

/** 표면이 가진 식별자만으로 계약의 viewer context를 조립한다. 빠진 맥락은 null/빈 값이라 넓게 열리지 않는다. */
export function buildStudioSharedLibraryViewerContext(
  input: StudioSharedLibraryContextInput,
): SharedLibraryViewerContext {
  return {
    userId: input.userId,
    workId: input.workId ?? null,
    workspaceId: input.workspaceId ?? null,
    teamRole: input.teamRole ?? null,
    organizationRoles: input.organizationRoles ?? {},
    organizationLinkedWorkspaces: input.organizationLinkedWorkspaces ?? {},
  };
}

/**
 * 계약 스코프 → 통합 카탈로그 스코프.
 * personal/work는 기존 "mine" 버킷으로, market은 별도 유통 표면이라 카탈로그에서는 null.
 */
export function studioUnifiedScopeForPlacement(
  placement: SharedLibraryPlacement,
): Exclude<StudioUnifiedAssetScope, "all"> | null {
  switch (placement.scope) {
    case "team":
      return "team";
    case "organization":
      return "organization";
    case "personal":
    case "work":
      return "mine";
    case "market":
      return null;
  }
}

/** 아이템 종류 → 통합 카탈로그가 아닌 표면(브러시 등)에서도 같은 배치를 쓰기 위한 구조적 최소형. */
export interface StudioSharedLibraryEntry {
  readonly id: string;
  readonly libraryPlacement?: SharedLibraryPlacement | null;
}

/**
 * 배치가 붙은 항목(브러시·템플릿 등 어느 라이브러리든)에 가시성을 적용한다.
 * 배치 없는 항목은 기존 동작 그대로 통과한다.
 */
export function filterStudioSharedLibraryEntries<T extends StudioSharedLibraryEntry>(
  entries: readonly T[],
  context: SharedLibraryViewerContext,
): readonly T[] {
  return entries.filter(
    (entry) =>
      !entry.libraryPlacement ||
      canViewSharedLibraryItem({ placement: entry.libraryPlacement }, context),
  );
}

/**
 * 통합 카탈로그 아이템에 배치를 적용한다: 안 보이는 아이템은 빼고, 보이는 아이템은
 * 카탈로그 스코프와 "팀 공유"/"조직 공유" 배지를 입힌다. 팀 공유로 올린 에셋·템플릿이
 * 같은 팀의 다른 작품 카탈로그에서 바로 보이는 경로는 이 함수다.
 */
export function applyStudioSharedLibraryPlacements(
  items: readonly StudioUnifiedAssetItem[],
  placements: Readonly<Record<string, SharedLibraryPlacement>>,
  context: SharedLibraryViewerContext,
): readonly StudioUnifiedAssetItem[] {
  const result: StudioUnifiedAssetItem[] = [];
  for (const item of items) {
    const placement = placements[item.id];
    if (!placement) {
      result.push(item);
      continue;
    }
    if (!canViewSharedLibraryItem({ placement }, context)) continue;
    const scope = studioUnifiedScopeForPlacement(placement);
    if (!scope) continue;
    const label = SHARED_LIBRARY_SCOPE_LABELS[placement.scope];
    result.push({
      ...item,
      scope,
      libraryPlacement: placement,
      badges: item.badges.includes(label) ? item.badges : Object.freeze([...item.badges, label]),
    });
  }
  return Object.freeze(result);
}

/** 라이브러리 표면의 스코프 필터. "조직 공유"가 전파 범위까지 설명을 함께 준다. */
export const STUDIO_SHARED_LIBRARY_SCOPE_FILTERS: readonly {
  readonly scope: StudioUnifiedAssetScope;
  readonly label: string;
  readonly description: string | null;
}[] = Object.freeze([
  { scope: "all", label: "전체", description: null },
  { scope: "mine", label: SHARED_LIBRARY_SCOPE_LABELS.personal, description: null },
  {
    scope: "team",
    label: SHARED_LIBRARY_SCOPE_LABELS.team,
    description: SHARED_LIBRARY_SCOPE_DESCRIPTIONS.team,
  },
  {
    scope: "organization",
    label: SHARED_LIBRARY_SCOPE_LABELS.organization,
    description: SHARED_LIBRARY_SCOPE_DESCRIPTIONS.organization,
  },
  { scope: "studio", label: "Studio 내장", description: null },
]);
