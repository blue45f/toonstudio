/**
 * 에피소드 검수 뷰어 모드·단축키·피드백 포커스·팝아웃·3종 비교 동기화 모델.
 *
 * - 툴바 도킹 위치(`T`): 좌측(`left`) / 하단 중앙(`bottom`) / 우측(`right`)
 * - 뷰어 모드(`D`/`C`/`G`): 세로 기본(`vertical`) / 비교(`compare`) / 가로 스프레드(`horizontal`)
 * - 디바이스 미리보기(`M`): `pc` / `mobile`
 * - 최적 너비 고정(`V`): `free` / `720` / `1080` (고정 시 줌 비활성)
 * - 자동 스크롤(`>`): `0`(정지) / `1` / `1.5` / `2` / `3`
 * - 좌우 패널 접기(`[`, `]`): `leftPanelOpen` / `rightPanelOpen`
 * - UI 숨김(`H` / `Escape`): `uiHidden`
 * - 비교 모드 3종 동기화(`A` 전체 / `S` 오프셋 유지 스크롤 / `P` 페이지 높이 비례)
 * - 타 회차 사이드 뷰어(`SideViewerSlot`, 최대 2개)
 * - 피드백 3단계 중요도(`required` / `recommended` / `suggestion`) 및 3단계 공개 범위(`private` / `restricted` / `public`)
 * - 초안 전체 발행, 공개 상태 일괄 변경, 스크롤 중심 피드백 포커스, 새 창 팝아웃 동기화
 */

export type ViewerToolbarDock = "left" | "bottom" | "right";
export type ViewerLayoutMode = "vertical" | "compare" | "horizontal";
export type ViewerDevicePreview = "pc" | "mobile";
export type OptimalWidthLock = "free" | 720 | 1080;
export type AutoScrollSpeed = 0 | 1 | 1.5 | 2 | 3;
export type HorizontalWidthPreset = 360 | 540 | 720 | 1080 | "fit";
export type CompareScrollSyncMode = "all" | "scroll-offset" | "page-proportional";
export type FeedbackVisibilityScope = "private" | "restricted" | "public";
export type FeedbackImportanceLevel = "required" | "recommended" | "suggestion";

export const VIEWER_TOOLBAR_DOCKS: readonly ViewerToolbarDock[] = ["left", "bottom", "right"];
export const OPTIMAL_WIDTH_LOCKS: readonly OptimalWidthLock[] = ["free", 720, 1080];
export const AUTO_SCROLL_SPEEDS: readonly AutoScrollSpeed[] = [0, 1, 1.5, 2, 3];
export const HORIZONTAL_WIDTH_PRESETS: readonly HorizontalWidthPreset[] = [360, 540, 720, 1080, "fit"];
export const MAX_SIDE_VIEWERS = 2;

export interface SideViewerSlot {
  readonly id: string;
  readonly episodeId: string;
  readonly episodeLabel: string;
  readonly processLabel: string;
  readonly scrollTop: number;
}

export interface ViewerControlsState {
  readonly toolbarDock: ViewerToolbarDock;
  readonly layoutMode: ViewerLayoutMode;
  readonly devicePreview: ViewerDevicePreview;
  readonly optimalWidthLock: OptimalWidthLock;
  readonly autoScrollSpeed: AutoScrollSpeed;
  readonly horizontalWidthPreset: HorizontalWidthPreset;
  readonly selectedHorizontalPages: readonly number[];
  readonly leftPanelOpen: boolean;
  readonly rightPanelOpen: boolean;
  readonly uiHidden: boolean;
  readonly compareSyncMode: CompareScrollSyncMode;
  readonly sideViewers: readonly SideViewerSlot[];
  readonly feedbackFocusEnabled: boolean;
  readonly popoutFeedbackId: string | null;
}

export interface ScopedFeedbackItem {
  readonly id: string;
  readonly authorId: string;
  readonly authorName: string;
  readonly body: string;
  readonly pageNumber: number;
  /** 원고 전체 세로 길이 기준 정규화 위치 (0~1) */
  readonly normalizedY: number;
  readonly visibility: FeedbackVisibilityScope;
  readonly importance: FeedbackImportanceLevel;
  readonly resolved: boolean;
  readonly hasDrawing: boolean;
}

export function createInitialViewerControlsState(
  overrides?: Partial<ViewerControlsState>,
): ViewerControlsState {
  return {
    toolbarDock: "bottom",
    layoutMode: "vertical",
    devicePreview: "pc",
    optimalWidthLock: "free",
    autoScrollSpeed: 0,
    horizontalWidthPreset: 720,
    selectedHorizontalPages: [1, 2, 3, 4],
    leftPanelOpen: true,
    rightPanelOpen: true,
    uiHidden: false,
    compareSyncMode: "all",
    sideViewers: [],
    feedbackFocusEnabled: true,
    popoutFeedbackId: null,
    ...overrides,
  };
}

/** `T` 단축키: 툴바 도킹 위치를 좌측 → 하단 → 우측 순으로 순환한다. */
export function cycleViewerToolbarDock(current: ViewerToolbarDock): ViewerToolbarDock {
  const index = VIEWER_TOOLBAR_DOCKS.indexOf(current);
  return VIEWER_TOOLBAR_DOCKS[(index + 1) % VIEWER_TOOLBAR_DOCKS.length] ?? "bottom";
}

/** `M` 단축키: PC ↔ 모바일 디바이스 미리보기를 전환한다. */
export function toggleViewerDevicePreview(current: ViewerDevicePreview): ViewerDevicePreview {
  return current === "pc" ? "mobile" : "pc";
}

/** `V` 단축키: 자유 폭 → 720px 고정 → 1080px 고정 순으로 순환한다. */
export function cycleOptimalWidthLock(current: OptimalWidthLock): OptimalWidthLock {
  const index = OPTIMAL_WIDTH_LOCKS.indexOf(current);
  return OPTIMAL_WIDTH_LOCKS[(index + 1) % OPTIMAL_WIDTH_LOCKS.length] ?? "free";
}

/** `>` 단축키: 정지(0) → x1.0 → x1.5 → x2.0 → x3.0 → 정지(0) 순으로 순환한다. */
export function cycleAutoScrollSpeed(current: AutoScrollSpeed): AutoScrollSpeed {
  const index = AUTO_SCROLL_SPEEDS.indexOf(current);
  return AUTO_SCROLL_SPEEDS[(index + 1) % AUTO_SCROLL_SPEEDS.length] ?? 0;
}

/** 자동 스크롤 프레임당 이동 픽셀을 계산한다 (기본 120px/sec × 배속). */
export function computeAutoScrollStepPx(speed: AutoScrollSpeed, deltaMs: number): number {
  if (speed <= 0 || deltaMs <= 0) return 0;
  const basePxPerSecond = 120;
  return Math.round((basePxPerSecond * speed * deltaMs) / 1000);
}

/**
 * 비교 모드 3종 동기화(`A` / `S` / `P`)에 따른 대상 창의 목표 스크롤 위치를 계산한다.
 * - `all`(`A`): 원본 스크롤 위치를 그대로 일치(최대 스크롤 범위 내 클램프)
 * - `scroll-offset`(`S`): 사용자가 맞춰 둔 수동 오프셋(`manualOffsetPx`)을 유지한 채 함께 이동
 * - `page-proportional`(`P`): 두 창의 전체 세로 길이가 다를 때 진행 비율(0~1)을 기준으로 비례 이동
 */
export function computeCompareSyncedScrollTop(input: {
  readonly mode: CompareScrollSyncMode;
  readonly sourceScrollTop: number;
  readonly sourceMaxScroll: number;
  readonly targetMaxScroll: number;
  readonly manualOffsetPx?: number;
}): number {
  const { mode, sourceScrollTop, sourceMaxScroll, targetMaxScroll, manualOffsetPx = 0 } = input;
  const safeTargetMax = Math.max(0, targetMaxScroll);
  if (safeTargetMax === 0) return 0;
  const clampedSource = Math.max(0, sourceScrollTop);

  if (mode === "scroll-offset") {
    return Math.min(safeTargetMax, Math.max(0, Math.round(clampedSource + manualOffsetPx)));
  }
  if (mode === "page-proportional") {
    if (sourceMaxScroll <= 0) return 0;
    const ratio = Math.min(1, Math.max(0, clampedSource / sourceMaxScroll));
    return Math.round(ratio * safeTargetMax);
  }
  return Math.min(safeTargetMax, Math.round(clampedSource));
}

/** 타 회차 사이드 뷰어를 추가한다 (최대 2개 제한). */
export function addSideViewerSlot(
  current: readonly SideViewerSlot[],
  slot: Omit<SideViewerSlot, "scrollTop"> & { readonly scrollTop?: number },
): { readonly slots: readonly SideViewerSlot[]; readonly added: boolean } {
  if (current.length >= MAX_SIDE_VIEWERS) {
    return { slots: current, added: false };
  }
  if (current.some((item) => item.id === slot.id)) {
    return { slots: current, added: false };
  }
  return {
    slots: [...current, { ...slot, scrollTop: slot.scrollTop ?? 0 }],
    added: true,
  };
}

export function removeSideViewerSlot(
  current: readonly SideViewerSlot[],
  slotId: string,
): readonly SideViewerSlot[] {
  return current.filter((item) => item.id !== slotId);
}

/**
 * 피드백 열람 권한 필터:
 * - `public`: 모든 열람자에게 표시
 * - `restricted`(`일부 공개`): `canEdit === true` 이상에게만 표시
 * - `private`(`비공개` 초안): 작성자 본인(`viewerId === item.authorId`)에게만 표시
 */
export function filterVisibleFeedbacks(
  items: readonly ScopedFeedbackItem[],
  viewer: { readonly viewerId: string; readonly canEdit: boolean },
): readonly ScopedFeedbackItem[] {
  return items.filter((item) => {
    if (item.visibility === "public") return true;
    if (item.visibility === "restricted") return viewer.canEdit || item.authorId === viewer.viewerId;
    return item.authorId === viewer.viewerId;
  });
}

/** 내 초안(`private`) 피드백을 한 번에 공개(`public`) 또는 일부 공개(`restricted`)로 발행한다. */
export function publishAllDraftFeedbacks(
  items: readonly ScopedFeedbackItem[],
  authorId: string,
  targetVisibility: Exclude<FeedbackVisibilityScope, "private"> = "public",
): { readonly items: readonly ScopedFeedbackItem[]; readonly publishedCount: number } {
  let publishedCount = 0;
  const next = items.map((item) => {
    if (item.authorId === authorId && item.visibility === "private") {
      publishedCount += 1;
      return { ...item, visibility: targetVisibility };
    }
    return item;
  });
  return { items: next, publishedCount };
}

/** 선택한 피드백들의 공개 상태를 일괄 변경한다. */
export function bulkUpdateFeedbackVisibility(
  items: readonly ScopedFeedbackItem[],
  ids: ReadonlySet<string>,
  nextVisibility: FeedbackVisibilityScope,
): readonly ScopedFeedbackItem[] {
  return items.map((item) => (ids.has(item.id) ? { ...item, visibility: nextVisibility } : item));
}

/**
 * 피드백 포커스(`피드백 포커스`):
 * 현재 스크롤 중심(`viewportCenterRatio`, 0~1)에 가장 가까운 미해결 피드백을 반환한다.
 */
export function findFocusedFeedbackForScroll(
  items: readonly ScopedFeedbackItem[],
  viewportCenterRatio: number,
): ScopedFeedbackItem | null {
  if (items.length === 0) return null;
  const clampedCenter = Math.min(1, Math.max(0, viewportCenterRatio));
  const pool = items.some((item) => !item.resolved)
    ? items.filter((item) => !item.resolved)
    : items;
  let best: ScopedFeedbackItem | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const item of pool) {
    const distance = Math.abs(item.normalizedY - clampedCenter);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = item;
    }
  }
  return best;
}

/** 가로 스프레드 모드(`G`)에서 페이지 번호 필터를 토글한다 (최소 1페이지는 유지). */
export function toggleHorizontalPageFilter(
  selectedPages: readonly number[],
  pageNumber: number,
): readonly number[] {
  if (selectedPages.includes(pageNumber)) {
    if (selectedPages.length <= 1) return selectedPages;
    return selectedPages.filter((page) => page !== pageNumber);
  }
  return [...selectedPages, pageNumber].sort((a, b) => a - b);
}
