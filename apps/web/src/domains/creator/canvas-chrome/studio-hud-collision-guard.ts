/**
 * 드로잉 스튜디오 HUD 충돌 회피(0px² 겹침 보장) · Z-Index 사다리 · 팝오버 안전 앵커 ·
 * 전 기능 100% 도달성 레지스트리 · 동적 반응형 스페이싱 & 고대비/가독성 계약 검증기.
 *
 * - 순수 계산 모듈(DOM/localStorage/sessionStorage/indexedDB 직접 접근 없음).
 * - 220px 워치~3440px 울트라와이드 및 폴더블 힌지(`foldSegmentX`)에서 HUD 쌍 겹침 면적 0px² 보장.
 */

import type { StudioVibrantSpriteId } from "./studio-vibrant-sprite-catalog";

/** 단일 정본 Z-Index 사다리 — 모든 스튜디오 HUD/팝오버/휠의 층위를 엄격 단조 증가로 잠근다. */
export const STUDIO_Z_LAYERS = Object.freeze({
  canvas: 0,
  canvasOverlay: 10,
  toolRail: 30,
  topContextBar: 40,
  adaptiveModeBar: 45,
  dockedPanel: 50,
  floatingHud: 60,
  popover: 75,
  creationModePalette: 85,
  railMoreDialog: 90,
  radialQuickWheel: 95,
  modalDialog: 100,
  toastAlert: 110,
} as const);

export type StudioZLayerName = keyof typeof STUDIO_Z_LAYERS;

export function isStrictAscendingZLayerLadder(): boolean {
  const values = Object.values(STUDIO_Z_LAYERS);
  for (let i = 1; i < values.length; i += 1) {
    if ((values[i] ?? 0) <= (values[i - 1] ?? 0)) return false;
  }
  return values.length > 0;
}

export interface HudRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface HudSafeAreaInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface HudViewportConstraints {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly safeAreaInsets?: HudSafeAreaInsets;
  /** 폴더블 디스플레이 힌지 중심 X 좌표(px). null/undefined면 단일 디스플레이. */
  readonly foldSegmentX?: number | null;
  /** 폴더블 힌지 회피 폭(px, 기본 24px). */
  readonly foldHingeWidthPx?: number;
  readonly minGapPx?: number;
  readonly label?: string;
}

export type HudSpacingTier = "watch" | "compact-mobile" | "mobile" | "tablet" | "desktop" | "ultrawide";

export interface ResponsiveHudSpacingSpec {
  readonly tier: HudSpacingTier;
  readonly gapPx: number;
  readonly paddingPx: number;
  readonly minTouchTargetPx: number;
  readonly maxVisibleFloatingCount: number;
  readonly spriteSizePx: number;
}

/** 220px 워치 ~ 3440px 울트라와이드 동적 반응형 스페이싱 계산기. */
export function resolveResponsiveHudSpacing(viewportWidthPx: number): ResponsiveHudSpacingSpec {
  const width = Number.isFinite(viewportWidthPx) ? Math.max(180, viewportWidthPx) : 1440;
  if (width <= 260) {
    return Object.freeze({ tier: "watch", gapPx: 4, paddingPx: 4, minTouchTargetPx: 44, maxVisibleFloatingCount: 2, spriteSizePx: 18 });
  }
  if (width <= 375) {
    return Object.freeze({ tier: "compact-mobile", gapPx: 6, paddingPx: 6, minTouchTargetPx: 44, maxVisibleFloatingCount: 3, spriteSizePx: 20 });
  }
  if (width < 768) {
    return Object.freeze({ tier: "mobile", gapPx: 8, paddingPx: 8, minTouchTargetPx: 44, maxVisibleFloatingCount: 4, spriteSizePx: 20 });
  }
  if (width < 1024) {
    return Object.freeze({ tier: "tablet", gapPx: 8, paddingPx: 10, minTouchTargetPx: 44, maxVisibleFloatingCount: 5, spriteSizePx: 22 });
  }
  if (width < 1920) {
    return Object.freeze({ tier: "desktop", gapPx: 10, paddingPx: 12, minTouchTargetPx: 44, maxVisibleFloatingCount: 7, spriteSizePx: 22 });
  }
  return Object.freeze({ tier: "ultrawide", gapPx: 12, paddingPx: 16, minTouchTargetPx: 44, maxVisibleFloatingCount: 9, spriteSizePx: 24 });
}

export interface FoldHingeBand {
  readonly left: number;
  readonly right: number;
  readonly centerX: number;
  readonly width: number;
}

interface SafeBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
  readonly hinge: FoldHingeBand | null;
}

function resolveSafeBounds(viewport: HudViewportConstraints): SafeBounds {
  const widthPx = Math.max(180, Number.isFinite(viewport.widthPx) ? viewport.widthPx : 1280);
  const heightPx = Math.max(180, Number.isFinite(viewport.heightPx) ? viewport.heightPx : 800);
  const spacing = resolveResponsiveHudSpacing(widthPx);
  const insets = viewport.safeAreaInsets ?? {
    top: spacing.paddingPx,
    right: spacing.paddingPx,
    bottom: spacing.paddingPx,
    left: spacing.paddingPx,
  };
  const left = Math.max(0, Math.min(widthPx - 44, insets.left));
  const top = Math.max(0, Math.min(heightPx - 44, insets.top));
  const right = Math.max(left + 44, widthPx - Math.max(0, insets.right));
  const bottom = Math.max(top + 44, heightPx - Math.max(0, insets.bottom));

  let hinge: FoldHingeBand | null = null;
  if (
    typeof viewport.foldSegmentX === "number"
    && Number.isFinite(viewport.foldSegmentX)
    && viewport.foldSegmentX > left + 24
    && viewport.foldSegmentX < right - 24
  ) {
    const hingeWidth = Math.max(8, Math.min(64, viewport.foldHingeWidthPx ?? 24));
    const half = hingeWidth / 2;
    hinge = Object.freeze({
      left: Math.round(viewport.foldSegmentX - half),
      right: Math.round(viewport.foldSegmentX + half),
      centerX: Math.round(viewport.foldSegmentX),
      width: hingeWidth,
    });
  }
  return { left, top, right, bottom, width: right - left, height: bottom - top, hinge };
}

/** 두 사각형의 겹침 면적(px²)을 정확히 계산한다. */
export function computeRectIntersectionArea(a: HudRect, b: HudRect): number {
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return 0;
  const overlapW = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapH = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (overlapW <= 0 || overlapH <= 0) return 0;
  return Number((overlapW * overlapH).toFixed(2));
}

function rectsOverlapWithGap(a: HudRect, b: HudRect, gap: number): boolean {
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false;
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}

function rectIntersectsHinge(rect: HudRect, hinge: FoldHingeBand | null): boolean {
  if (!hinge || rect.width <= 0 || rect.height <= 0) return false;
  return rect.x < hinge.right && rect.x + rect.width > hinge.left;
}

function rectInsideBounds(rect: HudRect, bounds: SafeBounds): boolean {
  return rect.x >= bounds.left && rect.y >= bounds.top && rect.x + rect.width <= bounds.right && rect.y + rect.height <= bounds.bottom;
}

function clampRectToSegment(x: number, y: number, width: number, height: number, bounds: SafeBounds): HudRect {
  const clampedH = Math.min(height, bounds.height);
  const clampedY = Math.max(bounds.top, Math.min(bounds.bottom - clampedH, y));
  if (!bounds.hinge) {
    const clampedW = Math.min(width, bounds.width);
    const clampedX = Math.max(bounds.left, Math.min(bounds.right - clampedW, x));
    return { x: Math.round(clampedX), y: Math.round(clampedY), width: Math.round(clampedW), height: Math.round(clampedH) };
  }
  const leftSpan = Math.max(0, bounds.hinge.left - bounds.left);
  const rightSpan = Math.max(0, bounds.right - bounds.hinge.right);
  const preferLeft = x + width / 2 <= bounds.hinge.centerX;
  const chooseLeft = (preferLeft && width <= leftSpan) || (!preferLeft && width > rightSpan && leftSpan >= rightSpan);
  if (chooseLeft && leftSpan > 0) {
    const clampedW = Math.min(width, leftSpan);
    const clampedX = Math.max(bounds.left, Math.min(bounds.hinge.left - clampedW, x));
    return { x: Math.round(clampedX), y: Math.round(clampedY), width: Math.round(clampedW), height: Math.round(clampedH) };
  }
  const clampedW = Math.min(width, Math.max(1, rightSpan));
  const clampedX = Math.max(bounds.hinge.right, Math.min(bounds.right - clampedW, x));
  return { x: Math.round(clampedX), y: Math.round(clampedY), width: Math.round(clampedW), height: Math.round(clampedH) };
}

export interface HudCollisionPair {
  readonly aId: string;
  readonly bId: string;
  readonly overlapAreaPx2: number;
}

export interface HudOverlapAuditReport {
  readonly totalOverlapAreaPx2: number;
  readonly collidingPairs: readonly HudCollisionPair[];
  readonly passed: boolean;
}

export function auditHudRectPairwiseOverlaps(
  items: readonly { readonly id: string; readonly rect: HudRect }[],
): HudOverlapAuditReport {
  const collidingPairs: HudCollisionPair[] = [];
  let totalOverlapAreaPx2 = 0;
  for (let i = 0; i < items.length; i += 1) {
    const a = items[i]!;
    for (let j = i + 1; j < items.length; j += 1) {
      const b = items[j]!;
      const area = computeRectIntersectionArea(a.rect, b.rect);
      if (area > 0) {
        totalOverlapAreaPx2 += area;
        collidingPairs.push({ aId: a.id, bId: b.id, overlapAreaPx2: area });
      }
    }
  }
  return Object.freeze({
    totalOverlapAreaPx2: Number(totalOverlapAreaPx2.toFixed(2)),
    collidingPairs: Object.freeze(collidingPairs),
    passed: collidingPairs.length === 0 && totalOverlapAreaPx2 === 0,
  });
}

export interface HudBoxInput {
  readonly id: string;
  readonly rect: HudRect;
  readonly priority: number;
  readonly collapsible?: boolean;
  readonly minWidthPx?: number;
  readonly minHeightPx?: number;
}

export interface ResolvedHudPlacement {
  readonly id: string;
  readonly rect: HudRect;
  readonly shifted: boolean;
  readonly collapsed: boolean;
  readonly avoidedFoldHinge: boolean;
  readonly priority: number;
}

export interface CollisionFreeHudLayoutResult {
  readonly placements: readonly ResolvedHudPlacement[];
  readonly visibleRects: readonly { readonly id: string; readonly rect: HudRect }[];
  readonly collapsedIds: readonly string[];
  readonly totalOverlapAreaPx2: number;
  readonly zeroOverlapGuaranteed: boolean;
  readonly spacing: ResponsiveHudSpacingSpec;
  readonly foldHingeBand: FoldHingeBand | null;
}

function findNonCollidingPlacement(
  preferred: HudRect,
  width: number,
  height: number,
  placed: readonly HudRect[],
  bounds: SafeBounds,
  gap: number,
): HudRect | null {
  const xAnchors = new Set<number>([preferred.x, bounds.left, bounds.right - width]);
  const yAnchors = new Set<number>([preferred.y, bounds.top, bounds.bottom - height]);
  if (bounds.hinge) {
    xAnchors.add(bounds.hinge.left - width);
    xAnchors.add(bounds.hinge.right);
  }
  for (const obs of placed) {
    xAnchors.add(obs.x + obs.width + gap);
    xAnchors.add(obs.x - width - gap);
    xAnchors.add(obs.x);
    yAnchors.add(obs.y + obs.height + gap);
    yAnchors.add(obs.y - height - gap);
    yAnchors.add(obs.y);
  }
  let best: HudRect | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const rawX of xAnchors) {
    for (const rawY of yAnchors) {
      const candidate: HudRect = { x: Math.round(rawX), y: Math.round(rawY), width: Math.round(width), height: Math.round(height) };
      if (!rectInsideBounds(candidate, bounds) || rectIntersectsHinge(candidate, bounds.hinge)) continue;
      if (placed.some((obs) => rectsOverlapWithGap(candidate, obs, gap))) continue;
      const dist = Math.hypot(candidate.x - preferred.x, candidate.y - preferred.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = candidate;
      }
    }
  }
  return best;
}

/**
 * 다수의 스튜디오 HUD 박스를 우선순위 순으로 배치해 임의의 두 HUD 박스 겹침 면적을 0px²로 보장한다.
 * 폴더블 힌지(`foldSegmentX`)와 화면 밖 클리핑을 동시에 회피한다.
 */
export function resolveCollisionFreeHudRects(
  boxes: readonly HudBoxInput[],
  viewport: HudViewportConstraints,
): CollisionFreeHudLayoutResult {
  const spacing = resolveResponsiveHudSpacing(viewport.widthPx);
  const gap = Math.max(0, viewport.minGapPx ?? spacing.gapPx);
  const bounds = resolveSafeBounds(viewport);
  const ordered = boxes
    .map((box, index) => ({ box, index }))
    .sort((a, b) => (b.box.priority - a.box.priority) || (a.index - b.index));

  const placedRects: HudRect[] = [];
  const placementsByIndex = new Map<number, ResolvedHudPlacement>();
  const collapsedIds: string[] = [];

  for (const { box, index } of ordered) {
    const initial = clampRectToSegment(box.rect.x, box.rect.y, Math.max(1, box.rect.width), Math.max(1, box.rect.height), bounds);
    const avoidedHinge = rectIntersectsHinge(box.rect, bounds.hinge) && !rectIntersectsHinge(initial, bounds.hinge);
    const minW = Math.max(44, Math.min(initial.width, box.minWidthPx ?? Math.min(initial.width, 44)));
    const minH = Math.max(44, Math.min(initial.height, box.minHeightPx ?? Math.min(initial.height, 44)));

    const tryDims = [
      { w: initial.width, h: initial.height, g: gap },
      { w: initial.width, h: initial.height, g: 0 },
      { w: Math.max(minW, Math.round(initial.width * 0.75)), h: initial.height, g: gap },
      { w: minW, h: minH, g: gap },
      { w: minW, h: minH, g: 0 },
    ] as const;

    let resolved: HudRect | null = null;
    for (const dim of tryDims) {
      resolved = findNonCollidingPlacement(initial, dim.w, dim.h, placedRects, bounds, dim.g);
      if (resolved) break;
    }

    if (!resolved) {
      collapsedIds.push(box.id);
      placementsByIndex.set(index, Object.freeze({
        id: box.id,
        rect: Object.freeze({ x: bounds.left, y: bounds.top, width: 0, height: 0 }),
        shifted: true,
        collapsed: true,
        avoidedFoldHinge: avoidedHinge,
        priority: box.priority,
      }));
      continue;
    }

    placedRects.push(resolved);
    placementsByIndex.set(index, Object.freeze({
      id: box.id,
      rect: Object.freeze(resolved),
      shifted:
        resolved.x !== Math.round(box.rect.x)
        || resolved.y !== Math.round(box.rect.y)
        || resolved.width !== Math.round(box.rect.width)
        || resolved.height !== Math.round(box.rect.height),
      collapsed: false,
      avoidedFoldHinge: avoidedHinge || (bounds.hinge !== null && !rectIntersectsHinge(resolved, bounds.hinge)),
      priority: box.priority,
    }));
  }

  const placements = boxes.map((_, index) => placementsByIndex.get(index)!);
  const visibleRects = placements
    .filter((entry) => !entry.collapsed && entry.rect.width > 0 && entry.rect.height > 0)
    .map((entry) => Object.freeze({ id: entry.id, rect: entry.rect }));
  const audit = auditHudRectPairwiseOverlaps(visibleRects);

  return Object.freeze({
    placements: Object.freeze(placements),
    visibleRects: Object.freeze(visibleRects),
    collapsedIds: Object.freeze(collapsedIds),
    totalOverlapAreaPx2: audit.totalOverlapAreaPx2,
    zeroOverlapGuaranteed: audit.passed,
    spacing,
    foldHingeBand: bounds.hinge,
  });
}

export type PopoverPreferredSide = "right" | "left" | "bottom" | "top" | "center";

export interface SafePopoverAnchorInput {
  readonly triggerRect: HudRect;
  readonly popoverSize: { readonly width: number; readonly height: number };
  readonly viewport: HudViewportConstraints;
  readonly preferredSide?: PopoverPreferredSide;
  readonly obstacles?: readonly HudRect[];
  readonly zLayer?: StudioZLayerName;
}

export interface SafePopoverAnchorResult {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly placement: PopoverPreferredSide;
  readonly flipped: boolean;
  readonly avoidedFoldHinge: boolean;
  readonly overlapAreaPx2: number;
  readonly zIndex: number;
}

/** 220px~3440px 및 폴더블 힌지(`foldSegmentX`) 환경에서 팝오버/팔레트/방사형 휠의 안전 좌표를 계산한다. */
export function resolveSafePopoverAnchor(input: SafePopoverAnchorInput): SafePopoverAnchorResult {
  const preferredSide = input.preferredSide ?? "right";
  const zIndex = STUDIO_Z_LAYERS[input.zLayer ?? "popover"];
  const bounds = resolveSafeBounds(input.viewport);
  const gap = Math.max(4, input.viewport.minGapPx ?? resolveResponsiveHudSpacing(input.viewport.widthPx).gapPx);
  const obstacles = input.obstacles ?? [];
  const maxSegW = bounds.hinge ? Math.max(bounds.hinge.left - bounds.left, bounds.right - bounds.hinge.right) : bounds.width;
  const width = Math.max(44, Math.min(Math.round(input.popoverSize.width), Math.max(44, Math.round(maxSegW))));
  const height = Math.max(44, Math.min(Math.round(input.popoverSize.height), Math.max(44, Math.round(bounds.height))));
  const t = input.triggerRect;

  if (preferredSide === "center") {
    const clamped = clampRectToSegment(t.x + t.width / 2 - width / 2, t.y + t.height / 2 - height / 2, width, height, bounds);
    const overlap = obstacles.reduce((sum, obs) => sum + computeRectIntersectionArea(clamped, obs), 0);
    return Object.freeze({
      left: clamped.x,
      top: clamped.y,
      width: clamped.width,
      height: clamped.height,
      placement: "center",
      flipped: false,
      avoidedFoldHinge: bounds.hinge !== null && !rectIntersectsHinge(clamped, bounds.hinge),
      overlapAreaPx2: overlap,
      zIndex,
    });
  }

  const sideOrder: readonly PopoverPreferredSide[] =
    preferredSide === "right" ? ["right", "left", "bottom", "top"]
      : preferredSide === "left" ? ["left", "right", "bottom", "top"]
        : preferredSide === "bottom" ? ["bottom", "top", "right", "left"]
          : ["top", "bottom", "right", "left"];

  let best: { readonly rect: HudRect; readonly side: PopoverPreferredSide; readonly overlap: number; readonly score: number } | null = null;
  for (let i = 0; i < sideOrder.length; i += 1) {
    const side = sideOrder[i]!;
    const rawX = side === "right" ? t.x + t.width + gap : side === "left" ? t.x - width - gap : t.x;
    const rawY = side === "bottom" ? t.y + t.height + gap : side === "top" ? t.y - height - gap : t.y;
    const clamped = clampRectToSegment(rawX, rawY, width, height, bounds);
    const overlap = computeRectIntersectionArea(clamped, t)
      + obstacles.reduce((sum, obs) => sum + computeRectIntersectionArea(clamped, obs), 0);
    const score = overlap * 100 + i * 12;
    if (!best || score < best.score) best = { rect: clamped, side, overlap, score };
    if (overlap === 0 && i === 0) break;
  }

  const picked = best!;
  return Object.freeze({
    left: picked.rect.x,
    top: picked.rect.y,
    width: picked.rect.width,
    height: picked.rect.height,
    placement: picked.side,
    flipped: picked.side !== preferredSide,
    avoidedFoldHinge: bounds.hinge !== null && !rectIntersectsHinge(picked.rect, bounds.hinge),
    overlapAreaPx2: picked.overlap,
    zIndex,
  });
}

export type StudioFeatureDomain = "drawing" | "bg3d" | "vrm" | "lettering" | "ai" | "layers" | "export" | "compare-tech";
export type StudioEntrySurfaceId =
  | "left-tool-rail" | "creation-mode-launcher" | "adaptive-mode-bar"
  | "radial-quick-wheel" | "brush-picker" | "top-context-bar" | "overflow-all-tools";

export interface StudioFeatureReachabilityEntry {
  readonly id: string; readonly domain: StudioFeatureDomain; readonly labelKo: string;
  readonly primarySurface: StudioEntrySurfaceId; readonly fallbackSurface: StudioEntrySurfaceId;
  readonly spriteId: StudioVibrantSpriteId; readonly minTouchTargetPx: number;
  readonly keyboardReachable: boolean; readonly selectorHint: string;
}

/** 전 기능 100% 도달성 정본 레지스트리 (드로잉·3D·VRM·식자·AI·레이어·출고·비교/테크). */
export const STUDIO_FEATURE_REACHABILITY_REGISTRY: readonly StudioFeatureReachabilityEntry[] = Object.freeze([
  { id: "draw-gpen", domain: "drawing", labelKo: "G펜 선화 그리기", primarySurface: "left-tool-rail", fallbackSurface: "adaptive-mode-bar", spriteId: "tool-gpen", minTouchTargetPx: 44, keyboardReachable: true, selectorHint: '[data-studio-rail-tool-id="pen"]' },
  { id: "draw-brush-picker", domain: "drawing", labelKo: "기본 프리셋 브러시 피커", primarySurface: "brush-picker", fallbackSurface: "adaptive-mode-bar", spriteId: "brush-watercolor", minTouchTargetPx: 44, keyboardReachable: true, selectorHint: '[data-studio-unified-brush-picker="mobile"]' },
  { id: "draw-eraser", domain: "drawing", labelKo: "지우개", primarySurface: "left-tool-rail", fallbackSurface: "adaptive-mode-bar", spriteId: "tool-eraser", minTouchTargetPx: 44, keyboardReachable: true, selectorHint: '[data-studio-rail-tool-id="eraser"]' },
  { id: "draw-fill-eyedropper", domain: "drawing", labelKo: "채우기·스포이드", primarySurface: "left-tool-rail", fallbackSurface: "adaptive-mode-bar", spriteId: "tool-fill", minTouchTargetPx: 44, keyboardReachable: true, selectorHint: '[data-studio-rail-tool-id="fill"]' },
  { id: "draw-radial-wheel", domain: "drawing", labelKo: "방사형 퀵 휠", primarySurface: "radial-quick-wheel", fallbackSurface: "top-context-bar", spriteId: "device-dial-pad", minTouchTargetPx: 44, keyboardReachable: true, selectorHint: '[data-studio-radial-quick-wheel="true"]' },
  { id: "bg3d-stage", domain: "bg3d", labelKo: "3D 배경 장면 도우미", primarySurface: "creation-mode-launcher", fallbackSurface: "overflow-all-tools", spriteId: "tool-bg3d", minTouchTargetPx: 44, keyboardReachable: true, selectorHint: '[data-studio-creation-mode="background"]' },
  { id: "bg3d-hybrid-dcc", domain: "bg3d", labelKo: "Hybrid 3D DCC 세트장", primarySurface: "overflow-all-tools", fallbackSurface: "adaptive-mode-bar", spriteId: "emblem-bg3d-stage", minTouchTargetPx: 44, keyboardReachable: true, selectorHint: '[data-studio-rail-tool-id="hybrid-dcc"]' },
  { id: "vrm-character", domain: "vrm", labelKo: "3D VRM 캐릭터·포즈", primarySurface: "creation-mode-launcher", fallbackSurface: "overflow-all-tools", spriteId: "tool-vrm", minTouchTargetPx: 44, keyboardReachable: true, selectorHint: '[data-studio-creation-mode="character"]' },
  { id: "vrm-mannequin", domain: "vrm", labelKo: "3D 데생 인형", primarySurface: "overflow-all-tools", fallbackSurface: "adaptive-mode-bar", spriteId: "emblem-character", minTouchTargetPx: 44, keyboardReachable: true, selectorHint: '[data-studio-rail-tool-id="mannequin3d"]' },
  { id: "lettering-bubble", domain: "lettering", labelKo: "말풍선·대사 식자", primarySurface: "left-tool-rail", fallbackSurface: "adaptive-mode-bar", spriteId: "tool-bubble-sfx", minTouchTargetPx: 44, keyboardReachable: true, selectorHint: '[data-studio-rail-tool-id="bubble"]' },
  { id: "lettering-sfx", domain: "lettering", labelKo: "효과음·세로쓰기 식자", primarySurface: "adaptive-mode-bar", fallbackSurface: "creation-mode-launcher", spriteId: "brush-fx-ribbon", minTouchTargetPx: 44, keyboardReachable: true, selectorHint: '[data-testid="adaptive-mode-tab-lettering"]' },
  { id: "ai-director", domain: "ai", labelKo: "AI 디렉터·구도 어시스트", primarySurface: "creation-mode-launcher", fallbackSurface: "top-context-bar", spriteId: "tool-ai-compass", minTouchTargetPx: 44, keyboardReachable: true, selectorHint: '[data-studio-creation-mode="ai"]' },
  { id: "layers-mask-lock", domain: "layers", labelKo: "레이어·클리핑 마스크·알파 잠금", primarySurface: "radial-quick-wheel", fallbackSurface: "adaptive-mode-bar", spriteId: "tool-layers", minTouchTargetPx: 44, keyboardReachable: true, selectorHint: '[data-studio-radial-slot="toggle-clipping-mask"]' },
  { id: "export-publish", domain: "export", labelKo: "원고 출고·내보내기 프리플라이트", primarySurface: "top-context-bar", fallbackSurface: "overflow-all-tools", spriteId: "emblem-production", minTouchTargetPx: 44, keyboardReachable: true, selectorHint: '[data-studio-primary-action="export"]' },
  { id: "compare-tech-entry", domain: "compare-tech", labelKo: "비교·WebGPU 테크 랩 & 30초 정착", primarySurface: "creation-mode-launcher", fallbackSurface: "adaptive-mode-bar", spriteId: "tech-webgpu", minTouchTargetPx: 44, keyboardReachable: true, selectorHint: '[data-studio-quick-migrate-trigger="true"]' },
  { id: "compare-benchmark", domain: "compare-tech", labelKo: "성능 벤치마크·리모션 미리보기", primarySurface: "adaptive-mode-bar", fallbackSurface: "top-context-bar", spriteId: "emblem-benchmark", minTouchTargetPx: 44, keyboardReachable: true, selectorHint: '[data-testid="adaptive-chrome-occupancy"]' },
]);

export interface FeatureReachabilityAuditReport {
  readonly totalFeatures: number;
  readonly reachableFeatures: number;
  readonly reachabilityRatio: number;
  readonly missingFeatureIds: readonly string[];
  readonly coveredDomains: readonly StudioFeatureDomain[];
  readonly passed: boolean;
}

const REQUIRED_DOMAINS: readonly StudioFeatureDomain[] = [
  "drawing", "bg3d", "vrm", "lettering", "ai", "layers", "export", "compare-tech",
];

export function auditStudioFeatureReachability(
  activeSurfaces?: ReadonlySet<StudioEntrySurfaceId>,
): FeatureReachabilityAuditReport {
  const available = activeSurfaces ?? new Set<StudioEntrySurfaceId>([
    "left-tool-rail", "creation-mode-launcher", "adaptive-mode-bar",
    "radial-quick-wheel", "brush-picker", "top-context-bar", "overflow-all-tools",
  ]);
  const missingFeatureIds: string[] = [];
  const coveredDomains = new Set<StudioFeatureDomain>();

  for (const entry of STUDIO_FEATURE_REACHABILITY_REGISTRY) {
    const ok = (available.has(entry.primarySurface) || available.has(entry.fallbackSurface))
      && entry.minTouchTargetPx >= 44 && entry.keyboardReachable;
    if (ok) coveredDomains.add(entry.domain);
    else missingFeatureIds.push(entry.id);
  }
  const totalFeatures = STUDIO_FEATURE_REACHABILITY_REGISTRY.length;
  const reachableFeatures = totalFeatures - missingFeatureIds.length;
  return Object.freeze({
    totalFeatures,
    reachableFeatures,
    reachabilityRatio: totalFeatures > 0 ? reachableFeatures / totalFeatures : 0,
    missingFeatureIds: Object.freeze(missingFeatureIds),
    coveredDomains: Object.freeze([...coveredDomains]),
    passed: missingFeatureIds.length === 0 && REQUIRED_DOMAINS.every((d) => coveredDomains.has(d)),
  });
}

/** 고대비·텍스트 깨짐 방지·터치 타깃 정본 계약 상수. */
export const STUDIO_READABILITY_AND_CONTRAST_CONTRACT = Object.freeze({
  minTouchTargetPx: 44,
  minNormalTextContrastRatio: 4.5,
  minHighContrastTextRatio: 7.0,
  minUiBorderContrastRatio: 3.0,
  minReadableFontSizePx: 12,
  requiredKoreanWordBreak: "keep-all" as const,
  requiredNumericVariant: "tabular-nums" as const,
});

export interface HudReadabilityAuditInput {
  readonly touchTargetWidthPx: number;
  readonly touchTargetHeightPx: number;
  readonly normalTextContrastRatio: number;
  readonly highContrastTextRatio: number;
  readonly uiBorderContrastRatio: number;
  readonly fontSizePx: number;
  readonly wordBreak: string;
  readonly usesTabularNums: boolean;
  readonly supportsForcedColors: boolean;
  readonly supportsReducedMotion: boolean;
}

export interface HudReadabilityAuditResult {
  readonly passed: boolean;
  readonly violations: readonly string[];
}

export function auditHudReadabilityAndContrastContract(
  input: HudReadabilityAuditInput,
): HudReadabilityAuditResult {
  const c = STUDIO_READABILITY_AND_CONTRAST_CONTRACT;
  const violations: string[] = [];
  if (input.touchTargetWidthPx < c.minTouchTargetPx || input.touchTargetHeightPx < c.minTouchTargetPx) {
    violations.push(`touch-target-under-44px:${input.touchTargetWidthPx}x${input.touchTargetHeightPx}`);
  }
  if (input.normalTextContrastRatio < c.minNormalTextContrastRatio) violations.push(`normal-contrast-under-4.5:${input.normalTextContrastRatio}`);
  if (input.highContrastTextRatio < c.minHighContrastTextRatio) violations.push(`high-contrast-under-7.0:${input.highContrastTextRatio}`);
  if (input.uiBorderContrastRatio < c.minUiBorderContrastRatio) violations.push(`border-contrast-under-3.0:${input.uiBorderContrastRatio}`);
  if (input.fontSizePx < c.minReadableFontSizePx) violations.push(`font-size-under-12px:${input.fontSizePx}`);
  if (input.wordBreak !== c.requiredKoreanWordBreak) violations.push(`word-break-not-keep-all:${input.wordBreak}`);
  if (!input.usesTabularNums) violations.push("missing-tabular-nums");
  if (!input.supportsForcedColors) violations.push("missing-forced-colors-support");
  if (!input.supportsReducedMotion) violations.push("missing-reduced-motion-support");
  return Object.freeze({ passed: violations.length === 0, violations: Object.freeze(violations) });
}

/** 8개 표준 감사 뷰포트 (220px 워치 · 320px · 430px · 768px · 1024px · 1440px · 2560px · 폴더블). */
export const STANDARD_HUD_AUDIT_VIEWPORTS: readonly HudViewportConstraints[] = Object.freeze([
  { label: "220px 워치", widthPx: 220, heightPx: 268, foldSegmentX: null },
  { label: "320px 초소형 모바일", widthPx: 320, heightPx: 568, foldSegmentX: null },
  { label: "430px 대형 모바일", widthPx: 430, heightPx: 932, foldSegmentX: null },
  { label: "768px 태블릿", widthPx: 768, heightPx: 1024, foldSegmentX: null },
  { label: "1024px 소형 노트북", widthPx: 1024, heightPx: 768, foldSegmentX: null },
  { label: "1440px 데스크톱", widthPx: 1440, heightPx: 900, foldSegmentX: null },
  { label: "2560px 울트라와이드", widthPx: 2560, heightPx: 1440, foldSegmentX: null },
  { label: "폴더블 듀얼 스크린", widthPx: 884, heightPx: 1104, foldSegmentX: 442, foldHingeWidthPx: 24 },
]);
