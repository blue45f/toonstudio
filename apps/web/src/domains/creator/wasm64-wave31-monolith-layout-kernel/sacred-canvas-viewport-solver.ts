/**
 * Wasm64 Wave 31: ToonStudio `PRODUCT.md` 성역 `>= 82%` 캔버스 뷰포트 보장 및
 * 무충돌 플로팅 HUD 레이아웃 솔버 (`sacred-canvas-viewport-solver`).
 *
 * - 단일 `44px` 상단 컨텍스트 바(`contextBarHeightPx === 44`)와 최대 `7`개 상단 메뉴 예산(`visibleTopMenuCount <= 7`)을 강제한다.
 *   초과 액션은 숨김 개수 배지가 달린 `"더보기"` 점진적 공개 슬롯으로 자동 수납한다.
 * - `360×640`, `768×1024`, `1280×800`, `1920×1080` 전 해상도에서 실효 비차폐 캔버스 비율(`unobstructedCanvasRatio >= 0.82`)을
 *   유지하도록 양측 도킹 패널을 `expanded-dock -> icon-rail -> compact-sheet` 순서로 점진 폴딩한다.
 * - `zoom-compass`, `color-loupe`, `undo-toast`, `save-status-pill` 등 플로팅 HUD에 최소 `44×44px` 터치·펜 히트 영역과
 *   최소 `8px` AABB 이격(`hudOverlapCount === 0`)을 보장한다.
 */

export const SACRED_CONTEXT_BAR_HEIGHT_PX = 44 as const;
export const MAX_VISIBLE_TOP_MENUS = 7 as const;
export const SACRED_MIN_CANVAS_RATIO = 0.82 as const;
export const MIN_TOUCH_HIT_SIZE_PX = 44 as const;
export const MIN_HUD_SEPARATION_PX = 8 as const;

export type CanonicalHudKind = "zoom-compass" | "color-loupe" | "undo-toast" | "save-status-pill";
export type HudAnchorCorner =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "bottom-center"
  | "top-center";
export type SideDockSide = "left" | "right";
export type SideDockFoldStage = "expanded-dock" | "icon-rail" | "compact-sheet";
export type SacredViewportPresetName =
  | "mobile-360x640"
  | "tablet-768x1024"
  | "laptop-1280x800"
  | "desktop-1920x1080";

export interface LayoutRect {
  readonly x: number;
  readonly y: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface TopMenuActionInput {
  readonly id: string;
  readonly labelKo: string;
  /** 낮을수록 상단 바에 먼저 남는다. 생략 시 입력 순서를 유지한다. */
  readonly priority?: number;
  readonly minWidthPx?: number;
}

export interface ResolvedTopMenuSlot {
  readonly id: string;
  readonly labelKo: string;
  readonly isOverflowTrigger: boolean;
  readonly hiddenCount: number;
  readonly badgeLabelKo: string | null;
  readonly hitBox: LayoutRect;
}

export interface OverflowMenuDisclosure {
  readonly triggerId: "top-menu-overflow-more";
  readonly labelKo: "더보기";
  readonly badgeLabelKo: string;
  readonly hiddenCount: number;
  readonly hiddenMenus: readonly TopMenuActionInput[];
  readonly hitBox: LayoutRect;
}

export interface SideDockSpec {
  readonly side: SideDockSide;
  readonly id: string;
  readonly labelKo: string;
  readonly expandedWidthPx?: number;
  readonly iconRailWidthPx?: number;
  readonly priority?: number;
}

export interface ResolvedSideDockLayout {
  readonly side: SideDockSide;
  readonly id: string;
  readonly labelKo: string;
  readonly foldStage: SideDockFoldStage;
  readonly inlineWidthPx: number;
  readonly sheetTriggerLabelKo: string | null;
  readonly inlineRect: LayoutRect | null;
}

export interface HudOverlayInput {
  readonly id: string;
  readonly labelKo?: string;
  readonly anchor?: HudAnchorCorner;
  readonly preferredX?: number;
  readonly preferredY?: number;
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly priority?: number;
}

export interface ResolvedHudOverlay {
  readonly id: string;
  readonly labelKo: string;
  readonly anchor: HudAnchorCorner;
  readonly rect: LayoutRect;
  readonly displacedByPx: number;
  readonly meetsHitAreaMinimum: boolean;
}

export interface SacredCanvasViewportInput {
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly topMenus?: readonly TopMenuActionInput[];
  readonly leftDock?: SideDockSpec | null;
  readonly rightDock?: SideDockSpec | null;
  readonly hudOverlays?: readonly HudOverlayInput[];
  readonly minCanvasRatio?: number;
  readonly minHudSeparationPx?: number;
  readonly canvasEdgePaddingPx?: number;
}

export interface SacredCanvasViewportSolution {
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly viewportAreaPx2: number;
  readonly contextBarHeightPx: 44;
  readonly contextBarRect: LayoutRect;
  readonly visibleTopMenuCount: number;
  readonly visibleTopMenuSlots: readonly ResolvedTopMenuSlot[];
  readonly overflowMenuDisclosure: OverflowMenuDisclosure | null;
  readonly leftDock: ResolvedSideDockLayout | null;
  readonly rightDock: ResolvedSideDockLayout | null;
  readonly dockFoldingStepsApplied: number;
  readonly canvasBoundsRect: LayoutRect;
  readonly hudOverlays: readonly ResolvedHudOverlay[];
  readonly hudTotalAreaPx2: number;
  readonly hudOverlapCount: number;
  readonly minPairwiseHudSeparationPx: number;
  readonly dockFreeCanvasRatio: number;
  readonly unobstructedCanvasAreaPx2: number;
  readonly unobstructedCanvasRatio: number;
  readonly meetsSacredInvariants: boolean;
  readonly summaryKo: string;
}

interface MutableHudBox {
  readonly id: string;
  readonly labelKo: string;
  readonly anchor: HudAnchorCorner;
  readonly priority: number;
  readonly originIndex: number;
  initialX: number;
  initialY: number;
  x: number;
  y: number;
  widthPx: number;
  heightPx: number;
}

const DEFAULT_TOP_MENUS: readonly TopMenuActionInput[] = [
  { id: "file", labelKo: "작품 파일", priority: 1 },
  { id: "brush", labelKo: "펜·브러시", priority: 2 },
  { id: "ruler", labelKo: "원근·대칭 자", priority: 3 },
  { id: "panel", labelKo: "컷 테두리", priority: 4 },
  { id: "lettering", labelKo: "대사·식자", priority: 5 },
  { id: "assets3d", labelKo: "3D 배경", priority: 6 },
  { id: "export", labelKo: "원고 내보내기", priority: 7 },
];

const DEFAULT_LEFT_DOCK: SideDockSpec = { side: "left", id: "dock-tools", labelKo: "도구·브러시 서랍", expandedWidthPx: 216, iconRailWidthPx: 48, priority: 1 };
const DEFAULT_RIGHT_DOCK: SideDockSpec = { side: "right", id: "dock-layers", labelKo: "레이어·색상 서랍", expandedWidthPx: 264, iconRailWidthPx: 48, priority: 2 };

const DEFAULT_HUD_OVERLAYS: readonly HudOverlayInput[] = [
  { id: "save-status-pill", labelKo: "로컬 저장 완료", anchor: "top-right", widthPx: 96, heightPx: 44, priority: 1 },
  { id: "zoom-compass", labelKo: "배율·회전 나침반", anchor: "bottom-right", widthPx: 88, heightPx: 44, priority: 2 },
  { id: "undo-toast", labelKo: "실행 취소 알림", anchor: "bottom-left", widthPx: 104, heightPx: 44, priority: 3 },
  { id: "color-loupe", labelKo: "색상 돋보기", anchor: "top-left", widthPx: 68, heightPx: 44, priority: 4 },
];

const HUD_META: Readonly<Record<CanonicalHudKind, { readonly labelKo: string; readonly anchor: HudAnchorCorner }>> = {
  "save-status-pill": { labelKo: "로컬 저장 완료", anchor: "top-right" },
  "zoom-compass": { labelKo: "배율·회전 나침반", anchor: "bottom-right" },
  "undo-toast": { labelKo: "실행 취소 알림", anchor: "bottom-left" },
  "color-loupe": { labelKo: "색상 돋보기", anchor: "top-left" },
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function round4(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 10000) / 10000 : 0;
}

/**
 * 두 축 정렬 사각형(AABB) 사이의 유클리드 이격 거리(`px`)를 반환한다.
 * 서로 겹치거나 맞닿은 경우 침투 깊이를 음수(접촉 시 `0`)로 반환한다.
 */
export function computeAabbSeparationPx(a: LayoutRect, b: LayoutRect): number {
  const gapX = Math.max(a.x - (b.x + b.widthPx), b.x - (a.x + a.widthPx));
  const gapY = Math.max(a.y - (b.y + b.heightPx), b.y - (a.y + a.heightPx));
  if (gapX > 0 && gapY > 0) return Math.hypot(gapX, gapY);
  if (gapX > 0) return gapX;
  if (gapY > 0) return gapY;
  return Math.max(gapX, gapY);
}

function resolveHudMeta(id: string): { readonly labelKo: string; readonly anchor: HudAnchorCorner } {
  if (id in HUD_META) {
    return HUD_META[id as CanonicalHudKind];
  }
  return { labelKo: id, anchor: "top-left" };
}

function resolveTopMenuBar(
  viewportWidthPx: number,
  requestedMenus: readonly TopMenuActionInput[],
): {
  readonly visibleTopMenuSlots: readonly ResolvedTopMenuSlot[];
  readonly overflowMenuDisclosure: OverflowMenuDisclosure | null;
} {
  if (requestedMenus.length === 0) {
    return { visibleTopMenuSlots: [], overflowMenuDisclosure: null };
  }

  const ordered = requestedMenus
    .map((item, idx) => ({ item, idx, priority: item.priority ?? idx + 1 }))
    .sort((a, b) => (a.priority !== b.priority ? a.priority - b.priority : a.idx - b.idx))
    .map((entry) => entry.item);

  const gapPx = 4;
  const padPx = 8;
  const usableWidthPx = Math.max(MIN_TOUCH_HIT_SIZE_PX, viewportWidthPx - padPx * 2);
  const physicalCap = Math.max(1, Math.floor((usableWidthPx + gapPx) / (MIN_TOUCH_HIT_SIZE_PX + gapPx)));
  const slotBudget = Math.min(MAX_VISIBLE_TOP_MENUS, physicalCap);

  const needsOverflow = ordered.length > slotBudget;
  const directCount = needsOverflow ? Math.max(0, slotBudget - 1) : ordered.length;
  const directMenus = ordered.slice(0, directCount);
  const hiddenMenus = needsOverflow ? ordered.slice(directCount) : [];
  const totalSlots = directMenus.length + (needsOverflow ? 1 : 0);

  const slotWidthPx = Math.max(
    MIN_TOUCH_HIT_SIZE_PX,
    Math.min(132, Math.floor((usableWidthPx - Math.max(0, totalSlots - 1) * gapPx) / Math.max(1, totalSlots))),
  );

  const slots: ResolvedTopMenuSlot[] = [];
  let cursorX = padPx;
  for (const menu of directMenus) {
    const w = Math.max(MIN_TOUCH_HIT_SIZE_PX, Math.min(slotWidthPx, menu.minWidthPx ?? slotWidthPx));
    const hitBox: LayoutRect = { x: cursorX, y: 0, widthPx: w, heightPx: SACRED_CONTEXT_BAR_HEIGHT_PX };
    slots.push({ id: menu.id, labelKo: menu.labelKo, isOverflowTrigger: false, hiddenCount: 0, badgeLabelKo: null, hitBox });
    cursorX += w + gapPx;
  }

  let overflowMenuDisclosure: OverflowMenuDisclosure | null = null;
  if (needsOverflow) {
    const hiddenCount = hiddenMenus.length;
    const badgeLabelKo = `+${hiddenCount}`;
    const hitBox: LayoutRect = { x: cursorX, y: 0, widthPx: Math.max(MIN_TOUCH_HIT_SIZE_PX, slotWidthPx), heightPx: SACRED_CONTEXT_BAR_HEIGHT_PX };
    slots.push({ id: "top-menu-overflow-more", labelKo: "더보기", isOverflowTrigger: true, hiddenCount, badgeLabelKo, hitBox });
    overflowMenuDisclosure = { triggerId: "top-menu-overflow-more", labelKo: "더보기", badgeLabelKo, hiddenCount, hiddenMenus, hitBox };
  }

  return { visibleTopMenuSlots: slots, overflowMenuDisclosure };
}

function buildResolvedDock(
  spec: SideDockSpec | null,
  stage: SideDockFoldStage,
  viewportWidthPx: number,
  bodyTopPx: number,
  bodyHeightPx: number,
): ResolvedSideDockLayout | null {
  if (spec === null) return null;
  const inlineWidthPx =
    stage === "compact-sheet"
      ? 0
      : stage === "icon-rail"
        ? Math.max(MIN_TOUCH_HIT_SIZE_PX, spec.iconRailWidthPx ?? 48)
        : Math.max(MIN_TOUCH_HIT_SIZE_PX, spec.expandedWidthPx ?? 220);

  const inlineRect: LayoutRect | null =
    inlineWidthPx > 0
      ? {
          x: spec.side === "left" ? 0 : viewportWidthPx - inlineWidthPx,
          y: bodyTopPx,
          widthPx: inlineWidthPx,
          heightPx: bodyHeightPx,
        }
      : null;

  return {
    side: spec.side,
    id: spec.id,
    labelKo: spec.labelKo,
    foldStage: stage,
    inlineWidthPx,
    sheetTriggerLabelKo: stage === "compact-sheet" ? `${spec.labelKo} 열기` : null,
    inlineRect,
  };
}

function computeAnchorCoords(
  anchor: HudAnchorCorner,
  widthPx: number,
  heightPx: number,
  safeRect: LayoutRect,
): { readonly x: number; readonly y: number } {
  const rightX = safeRect.x + safeRect.widthPx - widthPx;
  const bottomY = safeRect.y + safeRect.heightPx - heightPx;
  const centerX = Math.round(safeRect.x + (safeRect.widthPx - widthPx) * 0.5);
  if (anchor === "top-right") return { x: rightX, y: safeRect.y };
  if (anchor === "top-center") return { x: centerX, y: safeRect.y };
  if (anchor === "bottom-left") return { x: safeRect.x, y: bottomY };
  if (anchor === "bottom-center") return { x: centerX, y: bottomY };
  if (anchor === "bottom-right") return { x: rightX, y: bottomY };
  return { x: safeRect.x, y: safeRect.y };
}

function clampBoxToSafeRect(box: MutableHudBox, safeRect: LayoutRect): void {
  box.x = clamp(box.x, safeRect.x, safeRect.x + safeRect.widthPx - box.widthPx);
  box.y = clamp(box.y, safeRect.y, safeRect.y + safeRect.heightPx - box.heightPx);
}

function inspectHudSeparations(
  boxes: readonly MutableHudBox[],
  minSepPx: number,
): { readonly violationCount: number; readonly minSeparationPx: number } {
  let violationCount = 0;
  let minSeparationPx = Number.POSITIVE_INFINITY;
  for (let i = 0; i < boxes.length; i += 1) {
    const a = boxes[i];
    if (!a) continue;
    for (let j = i + 1; j < boxes.length; j += 1) {
      const b = boxes[j];
      if (!b) continue;
      const sep = computeAabbSeparationPx(a, b);
      if (sep < minSeparationPx) minSeparationPx = sep;
      if (sep + 1e-6 < minSepPx) violationCount += 1;
    }
  }
  return { violationCount, minSeparationPx };
}

function packShelfBand(
  group: MutableHudBox[],
  safeRect: LayoutRect,
  minSepPx: number,
  fromBottom: boolean,
  minAllowedTopY: number,
): number {
  let cursorY = fromBottom ? safeRect.y + safeRect.heightPx : safeRect.y;
  let leftX = safeRect.x;
  let rightX = safeRect.x + safeRect.widthPx;
  let rowMaxH = 0;

  for (const box of group) {
    const wantsRight = box.anchor === "top-right" || box.anchor === "bottom-right";
    if (rightX - leftX < box.widthPx && rowMaxH > 0) {
      cursorY = fromBottom ? cursorY - (rowMaxH + minSepPx) : cursorY + (rowMaxH + minSepPx);
      leftX = safeRect.x;
      rightX = safeRect.x + safeRect.widthPx;
      rowMaxH = 0;
    }
    const rowY = fromBottom ? Math.max(minAllowedTopY, cursorY - box.heightPx) : cursorY;
    if (wantsRight) {
      box.x = rightX - box.widthPx;
      rightX = box.x - minSepPx;
    } else {
      box.x = leftX;
      leftX = box.x + box.widthPx + minSepPx;
    }
    box.y = rowY;
    rowMaxH = Math.max(rowMaxH, box.heightPx);
    clampBoxToSafeRect(box, safeRect);
  }
  return fromBottom ? cursorY : rowMaxH > 0 ? cursorY + rowMaxH + minSepPx : safeRect.y;
}

function solveHudNonOverlappingLayout(
  hudInputs: readonly HudOverlayInput[],
  canvasBoundsRect: LayoutRect,
  edgePaddingPx: number,
  minSepPx: number,
  widthScale: number,
): {
  readonly resolvedHuds: readonly ResolvedHudOverlay[];
  readonly totalAreaPx2: number;
  readonly overlapCount: number;
  readonly minSeparationPx: number;
} {
  const safeRect: LayoutRect = {
    x: canvasBoundsRect.x + edgePaddingPx,
    y: canvasBoundsRect.y + edgePaddingPx,
    widthPx: Math.max(MIN_TOUCH_HIT_SIZE_PX, canvasBoundsRect.widthPx - edgePaddingPx * 2),
    heightPx: Math.max(MIN_TOUCH_HIT_SIZE_PX, canvasBoundsRect.heightPx - edgePaddingPx * 2),
  };

  const boxes: MutableHudBox[] = hudInputs
    .map((item, idx) => {
      const meta = resolveHudMeta(item.id);
      const anchor = item.anchor ?? meta.anchor;
      const widthPx = clamp(Math.round((item.widthPx ?? 88) * widthScale), MIN_TOUCH_HIT_SIZE_PX, safeRect.widthPx);
      const heightPx = clamp(Math.round(item.heightPx ?? MIN_TOUCH_HIT_SIZE_PX), MIN_TOUCH_HIT_SIZE_PX, safeRect.heightPx);
      const anchored = computeAnchorCoords(anchor, widthPx, heightPx, safeRect);
      const box: MutableHudBox = {
        id: item.id,
        labelKo: item.labelKo ?? meta.labelKo,
        anchor,
        priority: item.priority ?? idx + 1,
        originIndex: idx,
        initialX: item.preferredX ?? anchored.x,
        initialY: item.preferredY ?? anchored.y,
        x: item.preferredX ?? anchored.x,
        y: item.preferredY ?? anchored.y,
        widthPx,
        heightPx,
      };
      clampBoxToSafeRect(box, safeRect);
      box.initialX = box.x;
      box.initialY = box.y;
      return box;
    })
    .sort((a, b) => (a.priority !== b.priority ? a.priority - b.priority : a.originIndex - b.originIndex));

  for (let pass = 0; pass < 48; pass += 1) {
    let movedAny = false;
    for (let i = 0; i < boxes.length; i += 1) {
      const fixed = boxes[i];
      if (!fixed) continue;
      for (let j = i + 1; j < boxes.length; j += 1) {
        const mobile = boxes[j];
        if (!mobile || computeAabbSeparationPx(fixed, mobile) + 1e-6 >= minSepPx) continue;

        const maxX = safeRect.x + safeRect.widthPx - mobile.widthPx;
        const maxY = safeRect.y + safeRect.heightPx - mobile.heightPx;
        const moves: Array<{ readonly x: number; readonly y: number; readonly cost: number }> = [];
        const rightX = fixed.x + fixed.widthPx + minSepPx;
        const leftX = fixed.x - minSepPx - mobile.widthPx;
        const downY = fixed.y + fixed.heightPx + minSepPx;
        const upY = fixed.y - minSepPx - mobile.heightPx;

        if (rightX <= maxX) moves.push({ x: rightX, y: mobile.y, cost: Math.abs(rightX - mobile.x) });
        if (leftX >= safeRect.x) moves.push({ x: leftX, y: mobile.y, cost: Math.abs(leftX - mobile.x) });
        if (downY <= maxY) moves.push({ x: mobile.x, y: downY, cost: Math.abs(downY - mobile.y) });
        if (upY >= safeRect.y) moves.push({ x: mobile.x, y: upY, cost: Math.abs(upY - mobile.y) });

        moves.sort((m1, m2) => m1.cost - m2.cost);
        const best = moves[0];
        if (best) {
          mobile.x = best.x;
          mobile.y = best.y;
          movedAny = true;
        }
      }
    }
    if (!movedAny) break;
  }

  let check = inspectHudSeparations(boxes, minSepPx);
  if (check.violationCount > 0) {
    const topGroup = boxes.filter((b) => b.anchor === "top-left" || b.anchor === "top-right" || b.anchor === "top-center");
    const bottomGroup = boxes.filter((b) => b.anchor === "bottom-left" || b.anchor === "bottom-right" || b.anchor === "bottom-center");
    const nextMinY = packShelfBand(topGroup, safeRect, minSepPx, false, safeRect.y);
    packShelfBand(bottomGroup, safeRect, minSepPx, true, nextMinY);
    check = inspectHudSeparations(boxes, minSepPx);
  }

  const orderedBack = [...boxes].sort((a, b) => a.originIndex - b.originIndex);
  let totalAreaPx2 = 0;
  const resolvedHuds: ResolvedHudOverlay[] = orderedBack.map((box) => {
    totalAreaPx2 += box.widthPx * box.heightPx;
    return {
      id: box.id,
      labelKo: box.labelKo,
      anchor: box.anchor,
      rect: { x: box.x, y: box.y, widthPx: box.widthPx, heightPx: box.heightPx },
      displacedByPx: round4(Math.hypot(box.x - box.initialX, box.y - box.initialY)),
      meetsHitAreaMinimum: box.widthPx >= MIN_TOUCH_HIT_SIZE_PX && box.heightPx >= MIN_TOUCH_HIT_SIZE_PX,
    };
  });

  return {
    resolvedHuds,
    totalAreaPx2,
    overlapCount: check.violationCount,
    minSeparationPx: check.minSeparationPx,
  };
}

/**
 * ToonStudio `PRODUCT.md` 성역 규칙(`44px` 단일 바, `<= 7` 메뉴, `>= 82%` 캔버스, HUD 무충돌)을 만족하는
 * 뷰포트 레이아웃 해를 결정론적으로 산출한다.
 */
export function solveSacredCanvasViewportLayout(
  input: SacredCanvasViewportInput,
): SacredCanvasViewportSolution {
  const viewportWidthPx = Math.max(240, Math.round(input.viewportWidthPx));
  const viewportHeightPx = Math.max(320, Math.round(input.viewportHeightPx));
  const viewportAreaPx2 = viewportWidthPx * viewportHeightPx;

  const minCanvasRatio = clamp(input.minCanvasRatio ?? SACRED_MIN_CANVAS_RATIO, 0.5, 0.95);
  const minHudSeparationPx = Math.max(0, input.minHudSeparationPx ?? MIN_HUD_SEPARATION_PX);
  const canvasEdgePaddingPx = Math.max(0, input.canvasEdgePaddingPx ?? 8);

  const leftSpec = input.leftDock === undefined ? DEFAULT_LEFT_DOCK : input.leftDock;
  const rightSpec = input.rightDock === undefined ? DEFAULT_RIGHT_DOCK : input.rightDock;
  const hudInputs = input.hudOverlays ?? DEFAULT_HUD_OVERLAYS;
  const { visibleTopMenuSlots, overflowMenuDisclosure } = resolveTopMenuBar(
    viewportWidthPx,
    input.topMenus ?? DEFAULT_TOP_MENUS,
  );

  const bodyTopPx = SACRED_CONTEXT_BAR_HEIGHT_PX;
  const bodyHeightPx = Math.max(MIN_TOUCH_HIT_SIZE_PX, viewportHeightPx - bodyTopPx);
  const leftFirst = (leftSpec?.priority ?? 1) <= (rightSpec?.priority ?? 2);

  const baseOrder: ReadonlyArray<readonly [SideDockFoldStage, SideDockFoldStage, number]> = [
    ["expanded-dock", "expanded-dock", 1],
    ["expanded-dock", "icon-rail", 1],
    ["expanded-dock", "compact-sheet", 1],
    ["icon-rail", "icon-rail", 1],
    ["icon-rail", "compact-sheet", 1],
    ["compact-sheet", "compact-sheet", 1],
    ["compact-sheet", "compact-sheet", 0.72],
    ["compact-sheet", "compact-sheet", 0.5],
  ];
  const stagePairs = leftFirst ? baseOrder : baseOrder.map(([a, b, s]) => [b, a, s] as const);

  let chosenStep = 0;
  let chosenLeftDock: ResolvedSideDockLayout | null = null;
  let chosenRightDock: ResolvedSideDockLayout | null = null;
  let chosenCanvasBounds: LayoutRect = { x: 0, y: bodyTopPx, widthPx: viewportWidthPx, heightPx: bodyHeightPx };
  let chosenHud = solveHudNonOverlappingLayout(hudInputs, chosenCanvasBounds, canvasEdgePaddingPx, minHudSeparationPx, 1);
  let chosenUnobstructedArea = 0;
  let chosenRatio = 0;

  for (let step = 0; step < stagePairs.length; step += 1) {
    const pair = stagePairs[step];
    if (!pair) continue;
    const leftDock = buildResolvedDock(leftSpec, pair[0], viewportWidthPx, bodyTopPx, bodyHeightPx);
    const rightDock = buildResolvedDock(rightSpec, pair[1], viewportWidthPx, bodyTopPx, bodyHeightPx);
    const leftW = leftDock?.inlineWidthPx ?? 0;
    const rightW = rightDock?.inlineWidthPx ?? 0;
    const canvasBounds: LayoutRect = {
      x: leftW,
      y: bodyTopPx,
      widthPx: Math.max(MIN_TOUCH_HIT_SIZE_PX * 2, viewportWidthPx - leftW - rightW),
      heightPx: bodyHeightPx,
    };
    const hudRes = solveHudNonOverlappingLayout(hudInputs, canvasBounds, canvasEdgePaddingPx, minHudSeparationPx, pair[2]);
    const unobstructedArea = Math.max(0, canvasBounds.widthPx * canvasBounds.heightPx - hudRes.totalAreaPx2);
    const ratio = unobstructedArea / viewportAreaPx2;

    chosenStep = step;
    chosenLeftDock = leftDock;
    chosenRightDock = rightDock;
    chosenCanvasBounds = canvasBounds;
    chosenHud = hudRes;
    chosenUnobstructedArea = unobstructedArea;
    chosenRatio = ratio;

    if (ratio >= minCanvasRatio && hudRes.overlapCount === 0) break;
  }

  const dockFreeCanvasRatio = round4((chosenCanvasBounds.widthPx * chosenCanvasBounds.heightPx) / viewportAreaPx2);
  const unobstructedCanvasRatio = round4(chosenRatio);
  const visibleTopMenuCount = visibleTopMenuSlots.length;
  const meetsSacredInvariants =
    visibleTopMenuCount <= MAX_VISIBLE_TOP_MENUS &&
    chosenHud.overlapCount === 0 &&
    chosenHud.resolvedHuds.every((h) => h.meetsHitAreaMinimum) &&
    chosenRatio + 1e-9 >= minCanvasRatio;

  const summaryKo =
    `${viewportWidthPx}×${viewportHeightPx} 뷰포트: 상단 44px 바(노출 메뉴 ${visibleTopMenuCount}개` +
    (overflowMenuDisclosure !== null ? `, 더보기 +${overflowMenuDisclosure.hiddenCount}` : "") +
    `), 실효 캔버스 점유율 ${(unobstructedCanvasRatio * 100).toFixed(1)}%, HUD 겹침 ${chosenHud.overlapCount}건`;

  return {
    viewportWidthPx,
    viewportHeightPx,
    viewportAreaPx2,
    contextBarHeightPx: SACRED_CONTEXT_BAR_HEIGHT_PX,
    contextBarRect: { x: 0, y: 0, widthPx: viewportWidthPx, heightPx: SACRED_CONTEXT_BAR_HEIGHT_PX },
    visibleTopMenuCount,
    visibleTopMenuSlots,
    overflowMenuDisclosure,
    leftDock: chosenLeftDock,
    rightDock: chosenRightDock,
    dockFoldingStepsApplied: chosenStep,
    canvasBoundsRect: chosenCanvasBounds,
    hudOverlays: chosenHud.resolvedHuds,
    hudTotalAreaPx2: chosenHud.totalAreaPx2,
    hudOverlapCount: chosenHud.overlapCount,
    minPairwiseHudSeparationPx: Number.isFinite(chosenHud.minSeparationPx)
      ? round4(chosenHud.minSeparationPx)
      : Number.POSITIVE_INFINITY,
    dockFreeCanvasRatio,
    unobstructedCanvasAreaPx2: chosenUnobstructedArea,
    unobstructedCanvasRatio,
    meetsSacredInvariants,
    summaryKo,
  };
}

/**
 * 대표 4대 표준 기기 해상도(`360×640`, `768×1024`, `1280×800`, `1920×1080`) 전체의
 * 성역 캔버스 레이아웃 해를 한 번에 검증·산출한다.
 */
export function solveCanonicalViewportPresets(
  overrides?: Partial<Omit<SacredCanvasViewportInput, "viewportWidthPx" | "viewportHeightPx">>,
): Readonly<Record<SacredViewportPresetName, SacredCanvasViewportSolution>> {
  return {
    "mobile-360x640": solveSacredCanvasViewportLayout({ ...overrides, viewportWidthPx: 360, viewportHeightPx: 640 }),
    "tablet-768x1024": solveSacredCanvasViewportLayout({ ...overrides, viewportWidthPx: 768, viewportHeightPx: 1024 }),
    "laptop-1280x800": solveSacredCanvasViewportLayout({ ...overrides, viewportWidthPx: 1280, viewportHeightPx: 800 }),
    "desktop-1920x1080": solveSacredCanvasViewportLayout({ ...overrides, viewportWidthPx: 1920, viewportHeightPx: 1080 }),
  };
}
