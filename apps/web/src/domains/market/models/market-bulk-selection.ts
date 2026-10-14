/**
 * Market Bulk Selection — 전문가용 일괄 처리의 순수 계획·실행 모델.
 *
 * 배경 (personal P-8): /market/manage 목록은 항목마다 버튼을 하나씩 눌러야 해서
 * 에셋이 많은 판매자는 공개 전환·정리에 항목 수만큼 왕복해야 했다.
 * 이 모델은 다중 선택 상태와 일괄 작업 계획을 UI·네트워크와 분리해 고정한다.
 *
 * 규칙:
 * - 선택은 리소스 id 목록이며, 토글은 중복을 만들지 않는다.
 * - 관리자 숨김(packageModeration.state === "hidden") 항목은 제작자가 상태를
 *   바꿀 수 없으므로 일괄 계획에서 항상 제외하고 건수를 보고한다.
 * - 일괄 실행은 순차 처리한다. 서버 immutable 릴리스 상태를 한꺼번에 몰아
 *   바꾸지 않고, 항목별 실패를 모아 부분 성공을 정직하게 보고하기 위해서다.
 */

import type { CreatorMarketplaceOwnedRelease } from "@/shared/lib/creator-marketplace-resource-contract";

/** 선택 목록에 id가 없으면 추가하고, 있으면 제거한 새 목록을 돌려준다. */
export function toggleSelectedId(selected: readonly string[], id: string): string[] {
  return selected.includes(id)
    ? selected.filter((selectedId) => selectedId !== id)
    : [...selected, id];
}

export type BulkSelectionState = "none" | "some" | "all";

/**
 * 현재 보이는(선택 가능한) id 기준으로 전체 선택 체크박스의 상태를 정한다.
 * 보이지 않는 id가 선택 목록에 남아 있어도 상태 판정에 섞지 않는다.
 */
export function bulkSelectionState(
  visibleIds: readonly string[],
  selected: readonly string[],
): BulkSelectionState {
  if (visibleIds.length === 0) return "none";
  const selectedSet = new Set(selected);
  const selectedVisible = visibleIds.filter((id) => selectedSet.has(id)).length;
  if (selectedVisible === 0) return "none";
  return selectedVisible === visibleIds.length ? "all" : "some";
}

export type OwnedBulkAction = "relist" | "unlist";

export interface OwnedBulkPlan {
  /** 실제로 서버 호출을 보낼 항목 (선택 순서가 아니라 목록 순서). */
  readonly targets: readonly CreatorMarketplaceOwnedRelease[];
  /** 관리자 숨김이라 제작자가 바꿀 수 없어 제외한 선택 항목 수. */
  readonly skippedModerated: number;
  /** 이미 목표 상태라 호출이 필요 없어 제외한 선택 항목 수. */
  readonly skippedAlreadyInState: number;
}

/**
 * 선택된 owned 릴리스 중 일괄 작업 대상을 가른다.
 * - relist: 비공개(delistedAt 있음)이고 관리자 숨김이 아닌 항목.
 * - unlist: 공개 중(delistedAt 없음)이고 관리자 숨김이 아닌 항목.
 */
export function planOwnedBulkAction(
  items: readonly CreatorMarketplaceOwnedRelease[],
  selectedIds: readonly string[],
  action: OwnedBulkAction,
): OwnedBulkPlan {
  const selectedSet = new Set(selectedIds);
  const targets: CreatorMarketplaceOwnedRelease[] = [];
  let skippedModerated = 0;
  let skippedAlreadyInState = 0;

  for (const item of items) {
    if (!selectedSet.has(item.resource.id)) continue;
    if (item.packageModeration.state === "hidden") {
      skippedModerated += 1;
      continue;
    }
    const delisted = item.delistedAt !== null;
    if ((action === "relist" && delisted) || (action === "unlist" && !delisted)) {
      targets.push(item);
    } else {
      skippedAlreadyInState += 1;
    }
  }

  return { targets, skippedModerated, skippedAlreadyInState };
}

export interface BulkRunResult<T> {
  readonly succeeded: readonly T[];
  readonly failed: readonly T[];
}

/**
 * 대상을 하나씩 순차 실행하고 성공·실패를 모은다.
 * 한 항목이 실패해도 나머지는 계속 진행한다 (부분 성공 보고가 목적).
 */
export async function runBulkSequential<T>(
  targets: readonly T[],
  operation: (target: T) => Promise<void>,
): Promise<BulkRunResult<T>> {
  const succeeded: T[] = [];
  const failed: T[] = [];
  for (const target of targets) {
    try {
      await operation(target);
      succeeded.push(target);
    } catch {
      failed.push(target);
    }
  }
  return { succeeded, failed };
}
