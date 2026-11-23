/**
 * 매직 리사이즈 엔진 (Magic Resize & Intelligent Anchor Reflow)
 *
 * - 14종 실전 포맷 원클릭 전환(applyMagicResize)
 * - 역할(headline, subcopy, hero-image, badge, cta, logo) 기반 지능형 앵커 리플로우
 * - 안전 여백, 최소 가독 폰트, 종횡비 유지 스케일링, 3mm 인쇄 재단선/도련(Bleed) 자동 계산
 * - 모든 출력 요소의 100% 캔버스 경계 내 위치 및 NaN 0건 보장
 */

import {
  classifyArtboardOrientation,
  getMagicResizeFormat,
  type AnchorHorizontal,
  type AnchorVertical,
  type ArtboardBoundsAudit,
  type ArtboardOrientation,
  type DesignArtboardDocument,
  type DesignArtboardElement,
  type DesignElementRole,
  type MagicResizeFormatId,
  type MagicResizeResult,
  type PrintBleedMetrics,
  type RectBox,
} from "./magic-resize-formats";

export {
  MAGIC_RESIZE_FORMATS,
  classifyArtboardOrientation,
  getMagicResizeFormat,
  type AnchorHorizontal,
  type AnchorVertical,
  type ArtboardBoundsAudit,
  type ArtboardElementKind,
  type ArtboardOrientation,
  type DesignArtboardDocument,
  type DesignArtboardElement,
  type DesignElementRole,
  type ElementTokenRole,
  type MagicResizeCategory,
  type MagicResizeFormatId,
  type MagicResizeFormatSpec,
  type MagicResizeReport,
  type MagicResizeResult,
  type PrintBleedMetrics,
  type RectBox,
} from "./magic-resize-formats";

const MM_PER_INCH = 25.4;

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * 3mm 인쇄 재단선(Trim) · 도련(Bleed) · 안전 여백(Safe Zone) 픽셀 계산.
 */
export function computePrintBleedMetrics(
  width: number,
  height: number,
  options: {
    readonly isPrint: boolean;
    readonly forceShowGuides?: boolean;
    readonly dpi?: number;
    readonly bleedMm?: number;
  },
): PrintBleedMetrics {
  const safeW = Math.max(1, finiteOr(width, 1080));
  const safeH = Math.max(1, finiteOr(height, 1080));
  const minDim = Math.min(safeW, safeH);
  const enabled = options.isPrint || Boolean(options.forceShowGuides);
  const dpi = Math.max(72, finiteOr(options.dpi, options.isPrint ? 300 : 96));
  const bleedMm = enabled ? Math.max(0, finiteOr(options.bleedMm, 3)) : 0;

  const rawBleedPx = enabled ? Math.max(6, Math.round((bleedMm / MM_PER_INCH) * dpi)) : 0;
  const bleedPx = enabled ? Math.min(rawBleedPx, Math.floor(minDim * 0.07)) : 0;

  const extraSafeInset = Math.max(
    Math.round(minDim * 0.045),
    enabled ? Math.round(bleedPx * 0.75) : 12,
  );
  const totalSafeInset = Math.min(bleedPx + extraSafeInset, Math.floor(minDim * 0.14));

  return {
    enabled,
    bleedMm,
    dpi,
    bleedPx,
    trimRect: {
      x: round2(bleedPx),
      y: round2(bleedPx),
      width: round2(Math.max(1, safeW - bleedPx * 2)),
      height: round2(Math.max(1, safeH - bleedPx * 2)),
    },
    safeRect: {
      x: round2(totalSafeInset),
      y: round2(totalSafeInset),
      width: round2(Math.max(1, safeW - totalSafeInset * 2)),
      height: round2(Math.max(1, safeH - totalSafeInset * 2)),
    },
    cropMarkLengthPx: enabled ? clamp(Math.round(minDim * 0.028), 10, 48) : 0,
  };
}

interface RoleSlotMap {
  readonly logo: RectBox;
  readonly badge: RectBox;
  readonly "hero-image": RectBox;
  readonly headline: RectBox;
  readonly subcopy: RectBox;
  readonly cta: RectBox;
}

function buildRoleSlots(safeRect: RectBox, orientation: ArtboardOrientation): RoleSlotMap {
  const { x: sx, y: sy, width: sw, height: sh } = safeRect;
  const gx = Math.max(8, Math.round(sw * 0.035));
  const gy = Math.max(6, Math.round(sh * 0.032));

  if (orientation === "ultra-wide") {
    const leftW = Math.max(1, sw * 0.6 - gx);
    const rightX = sx + leftW + gx;
    const rightW = Math.max(1, sw - leftW - gx);
    const topH = Math.max(1, sh * 0.22);
    const headH = Math.max(1, sh * 0.34);
    const subH = Math.max(1, sh * 0.18);
    const ctaH = Math.max(1, sh - topH - headH - subH - gy * 2);

    return {
      logo: { x: sx, y: sy, width: leftW * 0.42, height: topH },
      badge: { x: sx + leftW * 0.46, y: sy, width: leftW * 0.54, height: topH },
      headline: { x: sx, y: sy + topH + gy * 0.5, width: leftW, height: headH },
      subcopy: { x: sx, y: sy + topH + headH + gy, width: leftW, height: subH },
      cta: { x: sx, y: sy + sh - ctaH, width: Math.min(leftW * 0.58, Math.max(leftW * 0.36, 120)), height: ctaH },
      "hero-image": { x: rightX, y: sy, width: rightW, height: sh },
    };
  }

  if (orientation === "landscape") {
    const leftW = Math.max(1, sw * 0.54 - gx * 0.5);
    const rightX = sx + leftW + gx;
    const rightW = Math.max(1, sw - leftW - gx);
    const topH = Math.max(1, sh * 0.14);
    const headH = Math.max(1, sh * 0.32);
    const subH = Math.max(1, sh * 0.22);
    const ctaH = Math.max(1, sh * 0.16);

    return {
      logo: { x: sx, y: sy, width: leftW * 0.44, height: topH },
      badge: { x: sx + leftW * 0.48, y: sy, width: leftW * 0.52, height: topH },
      headline: { x: sx, y: sy + topH + gy, width: leftW, height: headH },
      subcopy: { x: sx, y: sy + topH + headH + gy * 1.6, width: leftW, height: subH },
      cta: { x: sx, y: sy + sh - ctaH, width: Math.min(leftW * 0.68, Math.max(leftW * 0.44, 120)), height: ctaH },
      "hero-image": { x: rightX, y: sy, width: rightW, height: sh },
    };
  }

  if (orientation === "square") {
    const topH = Math.max(1, sh * 0.11);
    const heroH = Math.max(1, sh * 0.4);
    const headH = Math.max(1, sh * 0.18);
    const subH = Math.max(1, sh * 0.12);
    const ctaH = Math.max(1, sh * 0.11);

    return {
      logo: { x: sx, y: sy, width: sw * 0.42, height: topH },
      badge: { x: sx + sw * 0.54, y: sy, width: sw * 0.46, height: topH },
      "hero-image": { x: sx + sw * 0.05, y: sy + topH + gy * 0.6, width: sw * 0.9, height: heroH },
      headline: { x: sx, y: sy + topH + heroH + gy * 1.2, width: sw, height: headH },
      subcopy: { x: sx, y: sy + topH + heroH + headH + gy * 1.5, width: sw, height: subH },
      cta: { x: sx + sw * 0.22, y: sy + sh - ctaH, width: sw * 0.56, height: ctaH },
    };
  }

  const topH = Math.max(1, sh * 0.085);
  const heroH = Math.max(1, sh * 0.44);
  const headH = Math.max(1, sh * 0.18);
  const subH = Math.max(1, sh * 0.12);
  const ctaH = Math.max(1, sh * 0.095);

  return {
    logo: { x: sx, y: sy, width: sw * 0.45, height: topH },
    badge: { x: sx + sw * 0.5, y: sy, width: sw * 0.5, height: topH },
    "hero-image": { x: sx + sw * 0.04, y: sy + topH + gy * 0.8, width: sw * 0.92, height: heroH },
    headline: { x: sx, y: sy + topH + heroH + gy * 1.6, width: sw, height: headH },
    subcopy: { x: sx, y: sy + topH + heroH + headH + gy * 2.1, width: sw, height: subH },
    cta: { x: sx + sw * 0.16, y: sy + sh - ctaH, width: sw * 0.68, height: ctaH },
  };
}

function fitPreservingAspect(
  slot: RectBox,
  originalWidth: number,
  originalHeight: number,
  anchorX: AnchorHorizontal,
  anchorY: AnchorVertical,
): RectBox {
  const origW = Math.max(1, finiteOr(originalWidth, slot.width));
  const origH = Math.max(1, finiteOr(originalHeight, slot.height));
  const origRatio = clamp(origW / origH, 0.25, 4);
  const slotRatio = slot.width / Math.max(1, slot.height);

  const fittedW = slotRatio > origRatio ? slot.height * origRatio : slot.width;
  const fittedH = slotRatio > origRatio ? slot.height : slot.width / origRatio;

  const nextX =
    anchorX === "center"
      ? slot.x + (slot.width - fittedW) / 2
      : anchorX === "end"
        ? slot.x + (slot.width - fittedW)
        : slot.x;
  const nextY =
    anchorY === "middle"
      ? slot.y + (slot.height - fittedH) / 2
      : anchorY === "bottom"
        ? slot.y + (slot.height - fittedH)
        : slot.y;

  return {
    x: round2(nextX),
    y: round2(nextY),
    width: round2(Math.max(1, fittedW)),
    height: round2(Math.max(1, fittedH)),
  };
}

function subdivideSlot(slot: RectBox, count: number, index: number, preferHorizontal: boolean): RectBox {
  if (count <= 1) return slot;
  const gap = Math.max(4, Math.round(Math.min(slot.width, slot.height) * 0.04));
  if (preferHorizontal) {
    const cellW = Math.max(1, (slot.width - gap * (count - 1)) / count);
    return { x: slot.x + index * (cellW + gap), y: slot.y, width: cellW, height: slot.height };
  }
  const cellH = Math.max(1, (slot.height - gap * (count - 1)) / count);
  return { x: slot.x, y: slot.y + index * (cellH + gap), width: slot.width, height: cellH };
}

function computeRoleFontSize(
  role: DesignElementRole,
  sourceFontSize: number | undefined,
  scaleFactor: number,
  targetMinDim: number,
  boxHeight: number,
): { readonly fontSize: number | undefined; readonly clampedToFloor: boolean } {
  if (role === "hero-image" && sourceFontSize === undefined) {
    return { fontSize: undefined, clampedToFloor: false };
  }
  const baseFont = finiteOr(sourceFontSize, role === "headline" ? 48 : 20);
  const scaled = Math.round(baseFont * scaleFactor);

  const floorMap: Readonly<Record<DesignElementRole, number>> = {
    headline: Math.max(14, Math.round(targetMinDim * 0.042)),
    subcopy: Math.max(11, Math.round(targetMinDim * 0.024)),
    badge: Math.max(10, Math.round(targetMinDim * 0.021)),
    cta: Math.max(11, Math.round(targetMinDim * 0.025)),
    logo: Math.max(10, Math.round(targetMinDim * 0.021)),
    "hero-image": Math.max(10, Math.round(targetMinDim * 0.02)),
  };
  const ceilingRatioMap: Readonly<Record<DesignElementRole, number>> = {
    headline: 0.64,
    subcopy: 0.5,
    badge: 0.56,
    cta: 0.52,
    logo: 0.56,
    "hero-image": 0.4,
  };

  const floor = floorMap[role];
  const ceiling = Math.max(floor, Math.round(boxHeight * ceilingRatioMap[role]));
  return { fontSize: clamp(scaled, floor, ceiling), clampedToFloor: scaled < floor };
}

function clampElementToBounds(
  el: DesignArtboardElement,
  canvasWidth: number,
  canvasHeight: number,
): DesignArtboardElement {
  const safeW = Math.max(1, finiteOr(canvasWidth, 1));
  const safeH = Math.max(1, finiteOr(canvasHeight, 1));
  const width = round2(clamp(finiteOr(el.width, 1), 1, safeW));
  const height = round2(clamp(finiteOr(el.height, 1), 1, safeH));
  const x = round2(clamp(finiteOr(el.x, 0), 0, Math.max(0, safeW - width)));
  const y = round2(clamp(finiteOr(el.y, 0), 0, Math.max(0, safeH - height)));

  return {
    ...el,
    x,
    y,
    width,
    height,
    borderRadius:
      el.borderRadius !== undefined
        ? round2(clamp(finiteOr(el.borderRadius, 0), 0, Math.min(width, height) / 2))
        : undefined,
    rotationDeg: el.rotationDeg !== undefined ? round2(finiteOr(el.rotationDeg, 0)) : undefined,
  };
}

function rectsOverlap(a: RectBox, b: RectBox): boolean {
  return (
    a.x < b.x + b.width - 0.5 &&
    a.x + a.width > b.x + 0.5 &&
    a.y < b.y + b.height - 0.5 &&
    a.y + a.height > b.y + 0.5
  );
}

function resolveTextStackOverlaps(
  elements: readonly DesignArtboardElement[],
  safeRect: RectBox,
  canvasWidth: number,
  canvasHeight: number,
): { readonly elements: readonly DesignArtboardElement[]; readonly resolvedCount: number } {
  const stackOrder: readonly DesignElementRole[] = ["headline", "subcopy", "cta"];
  const mutable = elements.map((item) => ({ ...item }));
  let resolvedCount = 0;

  for (let i = 0; i < stackOrder.length - 1; i += 1) {
    const upperItems = mutable.filter((el) => el.role === stackOrder[i]);
    const lowerItems = mutable.filter((el) => el.role === stackOrder[i + 1]);
    for (const upper of upperItems) {
      for (const lower of lowerItems) {
        if (!rectsOverlap(upper, lower)) continue;
        const neededY = round2(upper.y + upper.height + 4);
        const maxBottom = safeRect.y + safeRect.height;
        if (neededY + lower.height <= maxBottom) {
          lower.y = neededY;
        } else {
          const availableH = Math.max(12, maxBottom - neededY);
          lower.y = Math.min(neededY, Math.max(0, canvasHeight - availableH));
          lower.height = round2(Math.min(lower.height, availableH));
        }
        resolvedCount += 1;
      }
    }
  }

  return {
    elements: mutable.map((el) => clampElementToBounds(el, canvasWidth, canvasHeight)),
    resolvedCount,
  };
}

/**
 * 아트보드의 모든 요소가 캔버스 경계 내에 있고 NaN이 0건인지 검사한다.
 */
export function verifyArtboardBounds(artboard: DesignArtboardDocument): ArtboardBoundsAudit {
  const clippedIds: string[] = [];
  const nanIds: string[] = [];

  for (const el of artboard.elements) {
    const numericFields = [el.x, el.y, el.width, el.height];
    if (el.fontSize !== undefined) numericFields.push(el.fontSize);
    if (el.borderRadius !== undefined) numericFields.push(el.borderRadius);
    if (el.rotationDeg !== undefined) numericFields.push(el.rotationDeg);

    if (numericFields.some((num) => !Number.isFinite(num))) {
      nanIds.push(el.id);
      continue;
    }

    const outOfBounds =
      el.x < -0.01 ||
      el.y < -0.01 ||
      el.width <= 0 ||
      el.height <= 0 ||
      el.x + el.width > artboard.width + 0.01 ||
      el.y + el.height > artboard.height + 0.01;
    if (outOfBounds) clippedIds.push(el.id);
  }

  return { valid: clippedIds.length === 0 && nanIds.length === 0, clippedIds, nanIds };
}

/**
 * 지능형 앵커 리플로우 알고리즘.
 * 원본 아트보드를 14종 목표 포맷으로 변환하며 안전 여백·종횡비·최소 폰트·3mm 도련을 적용한다.
 */
export function applyMagicResize(
  artboard: DesignArtboardDocument,
  targetFormatId: MagicResizeFormatId,
): MagicResizeResult {
  const targetFormat = getMagicResizeFormat(targetFormatId);
  const srcW = Math.max(1, finiteOr(artboard.width, targetFormat.width));
  const srcH = Math.max(1, finiteOr(artboard.height, targetFormat.height));
  const targetW = targetFormat.width;
  const targetH = targetFormat.height;
  const targetMinDim = Math.min(targetW, targetH);

  const orientation = classifyArtboardOrientation(targetW, targetH);
  const bleed = computePrintBleedMetrics(targetW, targetH, {
    isPrint: targetFormat.isPrint,
    forceShowGuides: artboard.showBleedGuides,
    dpi: targetFormat.dpi,
    bleedMm: targetFormat.isPrint ? targetFormat.defaultBleedMm : 3,
  });

  const scaleFactor = round2(Math.sqrt((targetW * targetH) / (srcW * srcH)));
  const roleSlots = buildRoleSlots(bleed.safeRect, orientation);

  const roleBuckets = new Map<DesignElementRole, DesignArtboardElement[]>();
  for (const el of artboard.elements) {
    const bucket = roleBuckets.get(el.role);
    if (bucket) bucket.push(el);
    else roleBuckets.set(el.role, [el]);
  }

  const minFontAppliedIds: string[] = [];
  const rawPlaced = artboard.elements.map((el) => {
    const bucket = roleBuckets.get(el.role) ?? [el];
    const indexInRole = bucket.indexOf(el);
    const preferHorizontal =
      el.role === "hero-image" || orientation === "ultra-wide" || orientation === "landscape";
    const assignedSlot = subdivideSlot(roleSlots[el.role], bucket.length, indexInRole, preferHorizontal);

    const anchorX: AnchorHorizontal =
      el.anchorX ?? (el.role === "badge" ? "end" : el.role === "cta" ? "center" : "start");
    const anchorY: AnchorVertical =
      el.anchorY ?? (el.role === "hero-image" ? "middle" : "top");

    const shouldPreserveAspect = el.preserveAspectRatio ?? el.role === "hero-image";
    const fittedRect: RectBox = shouldPreserveAspect
      ? fitPreservingAspect(assignedSlot, el.width, el.height, anchorX, anchorY)
      : {
          x: round2(assignedSlot.x),
          y: round2(assignedSlot.y),
          width: round2(Math.max(1, assignedSlot.width)),
          height: round2(Math.max(1, assignedSlot.height)),
        };

    const { fontSize, clampedToFloor } = computeRoleFontSize(
      el.role,
      el.fontSize,
      scaleFactor,
      targetMinDim,
      fittedRect.height,
    );
    if (clampedToFloor) minFontAppliedIds.push(el.id);

    const scaledRadius =
      el.borderRadius !== undefined
        ? round2(
            clamp(
              finiteOr(el.borderRadius, 0) * scaleFactor,
              0,
              Math.min(fittedRect.width, fittedRect.height) / 2,
            ),
          )
        : undefined;

    return clampElementToBounds(
      {
        ...el,
        x: fittedRect.x,
        y: fittedRect.y,
        width: fittedRect.width,
        height: fittedRect.height,
        fontSize,
        borderRadius: scaledRadius,
      },
      targetW,
      targetH,
    );
  });

  const { elements: resolvedElements, resolvedCount } = resolveTextStackOverlaps(
    rawPlaced,
    bleed.safeRect,
    targetW,
    targetH,
  );

  const resizedArtboard: DesignArtboardDocument = {
    ...artboard,
    formatId: targetFormat.id,
    width: targetW,
    height: targetH,
    showBleedGuides: targetFormat.isPrint ? true : artboard.showBleedGuides,
    elements: resolvedElements,
  };

  const audit = verifyArtboardBounds(resizedArtboard);

  return {
    artboard: resizedArtboard,
    report: {
      sourceFormatId: artboard.formatId,
      targetFormatId: targetFormat.id,
      orientation,
      safeMarginPx: { x: round2(bleed.safeRect.x), y: round2(bleed.safeRect.y) },
      bleed,
      scaleFactor,
      clippedCount: audit.clippedIds.length + audit.nanIds.length,
      overlapResolvedCount: resolvedCount,
      minFontAppliedIds,
    },
  };
}
