/**
 * 단행본 인쇄 프리플라이트(책등 두께·접지 크리프·재단선·DPI), 화자 고정 장애물 회피 탄성 말풍선 꼬리,
 * DeepZoom(DZI)/IIIF 정적 타일 피라미드 익스포터, 개인화 필압 단조 베지어 곡선 피터 통합 모듈.
 *
 * - 외부 서버 연산 비용 ₩0, 순수 결정론 수치·기하 엔진으로 동작한다.
 */

export {
  buildDeepZoomTilePyramid,
  fitErgonomicPressureResponseCurve,
  type DeepZoomLevelSummary,
  type DeepZoomPyramidInput,
  type DeepZoomPyramidResult,
  type DeepZoomTileFormat,
  type DeepZoomTileSlice,
  type ErgonomicPressureCurveResult,
  type ErgonomicPressureFitInput,
  type IiifImageApi3Manifest,
  type MonotonicCubicBezier2D,
  type PressureCurvePoint2D,
  type RawStylusSample,
  type StylusHandProfile,
} from "./deepzoom-pressure-curve-fitter";

export interface Vec2 { readonly x: number; readonly y: number }

const EPSILON = 1e-9;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ============================================================================
// 1. 단행본 인쇄 판짜기·책등 두께(Spine)·접지 크리프(Creep) 프리플라이트 계산기
// ============================================================================

export type PrintPaperStockId =
  | "misaek-mojo-80g"
  | "baeksangji-100g"
  | "snowji-120g"
  | "arte-130g";

export type PrintBindingMethod =
  | "perfect-bind"
  | "pur-bind"
  | "saddle-stitch"
  | "hardcover-case";

export interface PrintPaperStockSpec {
  readonly id: PrintPaperStockId;
  readonly labelKo: string;
  readonly basisWeightGsm: number;
  /** 낱장 1매(2쪽 분량) 실측 두께(mm). */
  readonly caliperMm: number;
  readonly coated: boolean;
}

export const PRINT_PAPER_STOCK_PRESETS: Readonly<Record<PrintPaperStockId, PrintPaperStockSpec>> =
  Object.freeze({
    "misaek-mojo-80g": Object.freeze({
      id: "misaek-mojo-80g",
      labelKo: "미색모조 80g",
      basisWeightGsm: 80,
      caliperMm: 0.105,
      coated: false,
    }),
    "baeksangji-100g": Object.freeze({
      id: "baeksangji-100g",
      labelKo: "백상지 100g",
      basisWeightGsm: 100,
      caliperMm: 0.122,
      coated: false,
    }),
    "snowji-120g": Object.freeze({
      id: "snowji-120g",
      labelKo: "스노우지 120g",
      basisWeightGsm: 120,
      caliperMm: 0.108,
      coated: true,
    }),
    "arte-130g": Object.freeze({
      id: "arte-130g",
      labelKo: "아르떼 130g",
      basisWeightGsm: 130,
      caliperMm: 0.152,
      coated: true,
    }),
  });

const DEFAULT_COVER_ALLOWANCE_MM: Readonly<Record<PrintBindingMethod, number>> = Object.freeze({
  "perfect-bind": 0.55,
  "pur-bind": 0.65,
  "saddle-stitch": 0.2,
  "hardcover-case": 4.2,
});

export interface PrintBoxMm {
  readonly minXMm: number;
  readonly minYMm: number;
  readonly maxXMm: number;
  readonly maxYMm: number;
}

export interface PlacedCutRasterSpec {
  readonly cutId: string;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly placedWidthMm: number;
  readonly placedHeightMm: number;
}

export interface CriticalSafeItemSpec {
  readonly itemId: string;
  readonly kind: "balloon-text" | "sfx-logo" | "character-face";
  readonly boundsMm: PrintBoxMm;
}

export interface PrintPagePreflightInput {
  /** 1부터 시작하는 페이지 번호(홀수: 우측 홀수쪽, 짝수: 좌측 짝수쪽). */
  readonly pageNumber: number;
  /** 배경 원화 커버 영역(재단선 좌상단 `(0,0)` ~ `(trimWidthMm, trimHeightMm)` 기준). */
  readonly artworkCoverageMm?: PrintBoxMm;
  readonly criticalItems?: readonly CriticalSafeItemSpec[];
  readonly placedCuts?: readonly PlacedCutRasterSpec[];
}

export interface PrintPreflightInput {
  readonly pageCount: number;
  readonly paperStock: PrintPaperStockId;
  readonly bindingMethod: PrintBindingMethod;
  readonly customCaliperMm?: number;
  readonly coverBoardAllowanceMm?: number;
  readonly trimWidthMm?: number;
  readonly trimHeightMm?: number;
  readonly wingFlapWidthMm?: number;
  readonly bleedMm?: number;
  readonly safetyMarginMm?: number;
  readonly signaturePageCount?: number;
  readonly minRequiredDpi?: number;
  readonly pages?: readonly PrintPagePreflightInput[];
}

export interface SignatureSheetCreep {
  readonly signatureIndex: number;
  readonly nestedSheetIndex: number;
  readonly folioPages: readonly [number, number, number, number];
  readonly outwardCreepMm: number;
  readonly inwardShiftCompensationMm: number;
}

export type PrintPreflightIssueKind =
  | "page-alignment-warning"
  | "bleed-shortfall"
  | "trim-safety-violation"
  | "gutter-pinch-violation"
  | "low-dpi-cut";

export interface PrintPreflightIssue {
  readonly kind: PrintPreflightIssueKind;
  readonly severity: "error" | "warning";
  readonly pageNumber?: number;
  readonly targetId?: string;
  readonly measuredValue: number;
  readonly thresholdValue: number;
  readonly messageKo: string;
}

export interface PrintPreflightReport {
  readonly paperSpec: PrintPaperStockSpec;
  readonly effectiveCaliperMm: number;
  readonly coverBoardAllowanceMm: number;
  /** 책등 폭 공식: `(pageCount / 2) * caliperMm + coverBoardAllowanceMm`. */
  readonly spineWidthMm: number;
  readonly fullCoverSpreadWidthMm: number;
  readonly fullCoverSpreadHeightMm: number;
  readonly gutterPinchSafeMarginMm: number;
  readonly signatureSheetCreeps: readonly SignatureSheetCreep[];
  readonly issues: readonly PrintPreflightIssue[];
  readonly preflightPass: boolean;
  readonly serverCostKrw: 0;
}

/**
 * 단행본 책등 두께, 중철·무선 대첩별 접지 크리프, 3mm 도련·5mm 안전선·300DPI 미달 컷을 계산한다.
 */
export function calculatePrintPreflightAndImposition(
  input: PrintPreflightInput,
): PrintPreflightReport {
  if (!Number.isInteger(input.pageCount) || input.pageCount <= 0) {
    throw new RangeError(`페이지 수는 양의 정수여야 합니다: ${input.pageCount}`);
  }

  const paperSpec = PRINT_PAPER_STOCK_PRESETS[input.paperStock];
  const caliperMm = Math.max(0.03, input.customCaliperMm ?? paperSpec.caliperMm);
  const coverAllowanceMm = Math.max(
    0,
    input.coverBoardAllowanceMm ?? DEFAULT_COVER_ALLOWANCE_MM[input.bindingMethod],
  );
  const trimWidthMm = Math.max(40, input.trimWidthMm ?? 152);
  const trimHeightMm = Math.max(40, input.trimHeightMm ?? 225);
  const wingFlapWidthMm = Math.max(0, input.wingFlapWidthMm ?? 0);
  const bleedMm = Math.max(0, input.bleedMm ?? 3);
  const safetyMarginMm = Math.max(0, input.safetyMarginMm ?? 5);
  const minRequiredDpi = Math.max(72, input.minRequiredDpi ?? 300);

  const spineWidthMm = (input.pageCount / 2) * caliperMm + coverAllowanceMm;
  const fullCoverSpreadWidthMm =
    bleedMm * 2 + wingFlapWidthMm * 2 + trimWidthMm * 2 + spineWidthMm;
  const fullCoverSpreadHeightMm = bleedMm * 2 + trimHeightMm;

  const gutterPinchSafeMarginMm =
    input.bindingMethod === "perfect-bind"
      ? Math.max(safetyMarginMm, 8.5)
      : input.bindingMethod === "pur-bind"
        ? Math.max(safetyMarginMm, 6.5)
        : input.bindingMethod === "hardcover-case"
          ? Math.max(safetyMarginMm, 9.0)
          : safetyMarginMm;

  const issues: PrintPreflightIssue[] = [];
  if (input.pageCount % 4 !== 0) {
    issues.push({
      kind: "page-alignment-warning",
      severity: input.bindingMethod === "saddle-stitch" ? "error" : "warning",
      measuredValue: input.pageCount % 4,
      thresholdValue: 0,
      messageKo: `총 ${input.pageCount}쪽은 4배수 접지 단위에 맞지 않아 빈 내지 추가가 필요합니다.`,
    });
  }

  const paddedPageCount = Math.ceil(input.pageCount / 4) * 4;
  const rawSigPages = Math.max(4, Math.floor((input.signaturePageCount ?? 16) / 4) * 4);
  const effectiveSigPages =
    input.bindingMethod === "saddle-stitch" ? paddedPageCount : Math.min(paddedPageCount, rawSigPages);
  const signatureCount = Math.max(1, Math.ceil(paddedPageCount / effectiveSigPages));

  const signatureSheetCreeps: SignatureSheetCreep[] = [];
  for (let sigIdx = 0; sigIdx < signatureCount; sigIdx += 1) {
    const startPage = sigIdx * effectiveSigPages + 1;
    const pagesInThisSig = Math.min(effectiveSigPages, paddedPageCount - sigIdx * effectiveSigPages);
    const sheetsCount = Math.max(1, pagesInThisSig / 4);

    for (let s = 0; s < sheetsCount; s += 1) {
      const outerBack = startPage + pagesInThisSig - 1 - 2 * s;
      const outerFront = startPage + 2 * s;
      const innerFront = startPage + 2 * s + 1;
      const innerBack = startPage + pagesInThisSig - 2 - 2 * s;
      const outwardCreepMm = s * 2 * caliperMm;
      signatureSheetCreeps.push({
        signatureIndex: sigIdx,
        nestedSheetIndex: s,
        folioPages: [outerBack, outerFront, innerFront, innerBack],
        outwardCreepMm,
        inwardShiftCompensationMm: outwardCreepMm,
      });
    }
  }

  const pages = input.pages ?? [];
  const bleedTol = 0.02;

  for (const page of pages) {
    if (page.artworkCoverageMm) {
      const box = page.artworkCoverageMm;
      const worstShortfall = Math.max(
        box.minXMm - (-bleedMm),
        box.minYMm - (-bleedMm),
        trimWidthMm + bleedMm - box.maxXMm,
        trimHeightMm + bleedMm - box.maxYMm,
      );
      if (worstShortfall > bleedTol) {
        const achievedBleed = Math.max(0, bleedMm - worstShortfall);
        issues.push({
          kind: "bleed-shortfall",
          severity: "error",
          pageNumber: page.pageNumber,
          measuredValue: achievedBleed,
          thresholdValue: bleedMm,
          messageKo: `${page.pageNumber}쪽 배경 원화의 도련 여백이 ${achievedBleed.toFixed(2)}mm로 기준(${bleedMm}mm)보다 부족합니다.`,
        });
      }
    }

    const isOddRightPage = page.pageNumber % 2 === 1;
    for (const item of page.criticalItems ?? []) {
      const b = item.boundsMm;
      const outerEdgeDist = isOddRightPage ? trimWidthMm - b.maxXMm : b.minXMm;
      const gutterEdgeDist = isOddRightPage ? b.minXMm : trimWidthMm - b.maxXMm;
      const minOuterDist = Math.min(outerEdgeDist, b.minYMm, trimHeightMm - b.maxYMm);

      if (minOuterDist < safetyMarginMm - bleedTol) {
        issues.push({
          kind: "trim-safety-violation",
          severity: "error",
          pageNumber: page.pageNumber,
          targetId: item.itemId,
          measuredValue: minOuterDist,
          thresholdValue: safetyMarginMm,
          messageKo: `${page.pageNumber}쪽 필수 요소(${item.itemId})가 재단선에서 ${minOuterDist.toFixed(2)}mm 위치해 안전선(${safetyMarginMm}mm)을 침범했습니다.`,
        });
      }

      if (gutterEdgeDist < gutterPinchSafeMarginMm - bleedTol) {
        issues.push({
          kind: "gutter-pinch-violation",
          severity: "warning",
          pageNumber: page.pageNumber,
          targetId: item.itemId,
          measuredValue: gutterEdgeDist,
          thresholdValue: gutterPinchSafeMarginMm,
          messageKo: `${page.pageNumber}쪽 필수 요소(${item.itemId})가 제본 안쪽 물림 구역(${gutterPinchSafeMarginMm.toFixed(1)}mm) 안에 들어갔습니다.`,
        });
      }
    }

    for (const cut of page.placedCuts ?? []) {
      const effectiveDpi = Math.min(
        cut.pixelWidth / Math.max(1e-4, cut.placedWidthMm / 25.4),
        cut.pixelHeight / Math.max(1e-4, cut.placedHeightMm / 25.4),
      );
      if (effectiveDpi < minRequiredDpi - 0.05) {
        issues.push({
          kind: "low-dpi-cut",
          severity: "warning",
          pageNumber: page.pageNumber,
          targetId: cut.cutId,
          measuredValue: effectiveDpi,
          thresholdValue: minRequiredDpi,
          messageKo: `${page.pageNumber}쪽 컷(${cut.cutId})의 유효 해상도가 ${effectiveDpi.toFixed(1)} DPI로 인쇄 기준(${minRequiredDpi} DPI) 미만입니다.`,
        });
      }
    }
  }

  const hasError = issues.some((issue) => issue.severity === "error");
  return {
    paperSpec,
    effectiveCaliperMm: caliperMm,
    coverBoardAllowanceMm: coverAllowanceMm,
    spineWidthMm,
    fullCoverSpreadWidthMm,
    fullCoverSpreadHeightMm,
    gutterPinchSafeMarginMm,
    signatureSheetCreeps,
    issues,
    preflightPass: !hasError && issues.length === 0,
    serverCostKrw: 0,
  };
}

// ============================================================================
// 2. 화자 입 고정·타 인물 얼굴 AABB 회피 탄성 말풍선 꼬리(Elastic Balloon Tail) 솔버
// ============================================================================

export interface SpeechBalloonBoundary {
  readonly center: Vec2;
  readonly rx: number;
  readonly ry: number;
  readonly shape?: "ellipse" | "rounded-rect";
  readonly cornerRadius?: number;
}

export interface KeepOutAabb {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly paddingPx?: number;
}

export interface CubicBezierCurve2D {
  readonly p0: Vec2;
  readonly p1: Vec2;
  readonly p2: Vec2;
  readonly p3: Vec2;
}

export interface QuadraticBezierCurve2D {
  readonly p0: Vec2;
  readonly control: Vec2;
  readonly p2: Vec2;
}

export interface ElasticBalloonTailInput {
  readonly balloon: SpeechBalloonBoundary;
  readonly speakerMouth: Vec2;
  readonly obstacleKeepOutBoxes?: readonly KeepOutAabb[];
  readonly tipClearancePx?: number;
  readonly baseHalfWidthPx?: number;
  readonly sampleCount?: number;
}

export interface ElasticBalloonTailResult {
  readonly baseCenter: Vec2;
  readonly baseLeft: Vec2;
  readonly baseRight: Vec2;
  readonly tip: Vec2;
  readonly centerlineCubic: CubicBezierCurve2D;
  readonly quadraticApproximation: QuadraticBezierCurve2D;
  readonly sampledCenterline: readonly Vec2[];
  readonly svgPathD: string;
  readonly avoidedObstacleIds: readonly string[];
  readonly collisionFree: boolean;
  readonly bendingEnergy: number;
  readonly anchorDistanceToMouthPx: number;
  readonly serverCostKrw: 0;
}

function evalCubicPoint(curve: CubicBezierCurve2D, t: number): Vec2 {
  const u = 1 - t;
  const b0 = u * u * u;
  const b1 = 3 * u * u * t;
  const b2 = 3 * u * t * t;
  const b3 = t * t * t;
  return {
    x: b0 * curve.p0.x + b1 * curve.p1.x + b2 * curve.p2.x + b3 * curve.p3.x,
    y: b0 * curve.p0.y + b1 * curve.p1.y + b2 * curve.p2.y + b3 * curve.p3.y,
  };
}

function computeBalloonPerimeterAnchor(
  balloon: SpeechBalloonBoundary,
  aimTarget: Vec2,
): { readonly anchor: Vec2; readonly tangent: Vec2 } {
  const dx = aimTarget.x - balloon.center.x;
  const dy = aimTarget.y - balloon.center.y;
  const rx = Math.max(4, balloon.rx);
  const ry = Math.max(4, balloon.ry);
  const len = Math.hypot(dx, dy);
  const ux = len > EPSILON ? dx / len : 0;
  const uy = len > EPSILON ? dy / len : 1;

  if ((balloon.shape ?? "ellipse") === "rounded-rect") {
    const scaleX = Math.abs(ux) > EPSILON ? rx / Math.abs(ux) : Number.POSITIVE_INFINITY;
    const scaleY = Math.abs(uy) > EPSILON ? ry / Math.abs(uy) : Number.POSITIVE_INFINITY;
    const tRect = Math.min(scaleX, scaleY);
    const anchor: Vec2 = { x: balloon.center.x + ux * tRect, y: balloon.center.y + uy * tRect };
    const tangent: Vec2 =
      scaleX < scaleY ? { x: 0, y: ux >= 0 ? 1 : -1 } : { x: uy >= 0 ? -1 : 1, y: 0 };
    return { anchor, tangent };
  }

  const invScale = Math.hypot(ux / rx, uy / ry);
  const scale = invScale > EPSILON ? 1 / invScale : rx;
  const anchor: Vec2 = { x: balloon.center.x + ux * scale, y: balloon.center.y + uy * scale };
  const nx = (anchor.x - balloon.center.x) / (rx * rx);
  const ny = (anchor.y - balloon.center.y) / (ry * ry);
  const nLen = Math.hypot(nx, ny);
  const tangent: Vec2 = nLen > EPSILON ? { x: -ny / nLen, y: nx / nLen } : { x: 1, y: 0 };
  return { anchor, tangent };
}

function segmentIntersectsExpandedAabb(a: Vec2, b: Vec2, box: KeepOutAabb): boolean {
  const pad = Math.max(0, box.paddingPx ?? 8);
  const minX = box.x - pad;
  const minY = box.y - pad;
  const maxX = box.x + box.width + pad;
  const maxY = box.y + box.height + pad;

  let tMin = 0;
  let tMax = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  if (Math.abs(dx) < EPSILON) {
    if (a.x < minX || a.x > maxX) return false;
  } else {
    let t1 = (minX - a.x) / dx;
    let t2 = (maxX - a.x) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  if (Math.abs(dy) < EPSILON) {
    if (a.y < minY || a.y > maxY) return false;
  } else {
    let t1 = (minY - a.y) / dy;
    let t2 = (maxY - a.y) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  return true;
}

function findCurveCollidingObstacleIds(
  curve: CubicBezierCurve2D,
  boxes: readonly KeepOutAabb[],
): readonly string[] {
  if (boxes.length === 0) return [];
  const hitIds = new Set<string>();
  const steps = 56;
  let prev = curve.p0;
  for (let i = 1; i <= steps; i += 1) {
    const curr = evalCubicPoint(curve, i / steps);
    for (const box of boxes) {
      if (!hitIds.has(box.id) && segmentIntersectsExpandedAabb(prev, curr, box)) {
        hitIds.add(box.id);
      }
    }
    prev = curr;
  }
  return Array.from(hitIds);
}

function computeCubicBendingEnergy(curve: CubicBezierCurve2D): number {
  const ax = curve.p2.x - 2 * curve.p1.x + curve.p0.x;
  const ay = curve.p2.y - 2 * curve.p1.y + curve.p0.y;
  const cx = curve.p3.x - 2 * curve.p2.x + curve.p1.x;
  const cy = curve.p3.y - 2 * curve.p2.y + curve.p1.y;
  return 12 * (ax * ax + ay * ay + ax * cx + ay * cy + cx * cx + cy * cy);
}

/**
 * 말풍선이나 등장인물이 이동해도 꼬리 뿌리와 끝점을 화자 입에 고정하고,
 * 다른 인물의 얼굴 보호 영역(Keep-Out AABB)을 매끄러운 3차/2차 베지어 곡선으로 자동 우회한다.
 */
export function solveElasticBalloonTail(input: ElasticBalloonTailInput): ElasticBalloonTailResult {
  const tipClearancePx = Math.max(0, input.tipClearancePx ?? 10);
  const baseHalfWidthPx = clamp(input.baseHalfWidthPx ?? 9, 2, 36);
  const sampleCount = Math.max(9, Math.floor(input.sampleCount ?? 25));
  const obstacles = input.obstacleKeepOutBoxes ?? [];

  const initialPerimeter = computeBalloonPerimeterAnchor(input.balloon, input.speakerMouth);
  const rawVecX = input.speakerMouth.x - initialPerimeter.anchor.x;
  const rawVecY = input.speakerMouth.y - initialPerimeter.anchor.y;
  const rawDist = Math.hypot(rawVecX, rawVecY);
  const dirX = rawDist > EPSILON ? rawVecX / rawDist : 0;
  const dirY = rawDist > EPSILON ? rawVecY / rawDist : 1;

  const effectiveClearance = Math.min(tipClearancePx, rawDist * 0.45);
  let tip: Vec2 = {
    x: input.speakerMouth.x - dirX * effectiveClearance,
    y: input.speakerMouth.y - dirY * effectiveClearance,
  };

  for (const box of obstacles) {
    const pad = Math.max(0, box.paddingPx ?? 8);
    const minX = box.x - pad;
    const minY = box.y - pad;
    const maxX = box.x + box.width + pad;
    const maxY = box.y + box.height + pad;
    if (tip.x > minX && tip.x < maxX && tip.y > minY && tip.y < maxY) {
      const dLeft = tip.x - minX;
      const dRight = maxX - tip.x;
      const dTop = tip.y - minY;
      const dBottom = maxY - tip.y;
      const minD = Math.min(dLeft, dRight, dTop, dBottom);
      if (minD === dLeft) tip = { x: minX - 2, y: tip.y };
      else if (minD === dRight) tip = { x: maxX + 2, y: tip.y };
      else if (minD === dTop) tip = { x: tip.x, y: minY - 2 };
      else tip = { x: tip.x, y: maxY + 2 };
    }
  }

  const buildCandidateCurve = (normalOffset1: number, normalOffset2: number): CubicBezierCurve2D => {
    const chordX = tip.x - initialPerimeter.anchor.x;
    const chordY = tip.y - initialPerimeter.anchor.y;
    const chordLen = Math.max(1, Math.hypot(chordX, chordY));
    const ux = chordX / chordLen;
    const uy = chordY / chordLen;
    const nx = -uy;
    const ny = ux;

    const prelimP1: Vec2 = {
      x: initialPerimeter.anchor.x + ux * (chordLen * 0.34) + nx * normalOffset1,
      y: initialPerimeter.anchor.y + uy * (chordLen * 0.34) + ny * normalOffset1,
    };
    const refinedStart = computeBalloonPerimeterAnchor(input.balloon, prelimP1).anchor;
    const p1: Vec2 = {
      x: lerp(refinedStart.x, tip.x, 0.34) + nx * normalOffset1,
      y: lerp(refinedStart.y, tip.y, 0.34) + ny * normalOffset1,
    };
    const p2: Vec2 = {
      x: lerp(refinedStart.x, tip.x, 0.68) + nx * normalOffset2,
      y: lerp(refinedStart.y, tip.y, 0.68) + ny * normalOffset2,
    };
    return { p0: refinedStart, p1, p2, p3: tip };
  };

  const gentleBow = Math.min(14, rawDist * 0.06);
  const directCurve = buildCandidateCurve(gentleBow, gentleBow * 0.5);
  const initialHits = findCurveCollidingObstacleIds(directCurve, obstacles);

  let chosenCurve = directCurve;
  let collisionFree = initialHits.length === 0;
  let chosenEnergy = computeCubicBendingEnergy(directCurve);

  if (!collisionFree) {
    let maxObstacleSpan = 48;
    for (const box of obstacles) {
      const span = Math.hypot(box.width, box.height) + (box.paddingPx ?? 8) * 2;
      if (span > maxObstacleSpan) maxObstacleSpan = span;
    }

    let bestValid: CubicBezierCurve2D | undefined;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let step = 1; step <= 14; step += 1) {
      const mag = maxObstacleSpan * 0.22 * step;
      const patterns: readonly (readonly [number, number])[] = [
        [mag, mag],
        [-mag, -mag],
        [mag * 1.25, mag * 0.45],
        [-mag * 1.25, -mag * 0.45],
        [mag * 0.45, mag * 1.25],
        [-mag * 0.45, -mag * 1.25],
        [mag, -mag],
        [-mag, mag],
      ];

      for (const [o1, o2] of patterns) {
        const candidate = buildCandidateCurve(o1, o2);
        if (findCurveCollidingObstacleIds(candidate, obstacles).length === 0) {
          const energy = computeCubicBendingEnergy(candidate);
          if (energy < bestScore) {
            bestScore = energy;
            bestValid = candidate;
          }
        }
      }
      if (bestValid) break;
    }

    if (bestValid) {
      chosenCurve = bestValid;
      collisionFree = true;
      chosenEnergy = bestScore;
    }
  }

  const finalPerimeter = computeBalloonPerimeterAnchor(input.balloon, chosenCurve.p1);
  const baseCenter = chosenCurve.p0;
  const baseLeft: Vec2 = {
    x: baseCenter.x - finalPerimeter.tangent.x * baseHalfWidthPx,
    y: baseCenter.y - finalPerimeter.tangent.y * baseHalfWidthPx,
  };
  const baseRight: Vec2 = {
    x: baseCenter.x + finalPerimeter.tangent.x * baseHalfWidthPx,
    y: baseCenter.y + finalPerimeter.tangent.y * baseHalfWidthPx,
  };

  const midAtHalf = evalCubicPoint(chosenCurve, 0.5);
  const quadControl: Vec2 = {
    x: 2 * midAtHalf.x - 0.5 * (chosenCurve.p0.x + chosenCurve.p3.x),
    y: 2 * midAtHalf.y - 0.5 * (chosenCurve.p0.y + chosenCurve.p3.y),
  };

  const sampledCenterline: Vec2[] = [];
  for (let i = 0; i < sampleCount; i += 1) {
    sampledCenterline.push(evalCubicPoint(chosenCurve, i / (sampleCount - 1)));
  }

  const leftC1: Vec2 = {
    x: chosenCurve.p1.x - finalPerimeter.tangent.x * (baseHalfWidthPx * 0.55),
    y: chosenCurve.p1.y - finalPerimeter.tangent.y * (baseHalfWidthPx * 0.55),
  };
  const leftC2: Vec2 = {
    x: chosenCurve.p2.x - finalPerimeter.tangent.x * (baseHalfWidthPx * 0.2),
    y: chosenCurve.p2.y - finalPerimeter.tangent.y * (baseHalfWidthPx * 0.2),
  };
  const rightC2: Vec2 = {
    x: chosenCurve.p2.x + finalPerimeter.tangent.x * (baseHalfWidthPx * 0.2),
    y: chosenCurve.p2.y + finalPerimeter.tangent.y * (baseHalfWidthPx * 0.2),
  };
  const rightC1: Vec2 = {
    x: chosenCurve.p1.x + finalPerimeter.tangent.x * (baseHalfWidthPx * 0.55),
    y: chosenCurve.p1.y + finalPerimeter.tangent.y * (baseHalfWidthPx * 0.55),
  };

  const fmt = (n: number): string => n.toFixed(2);
  const svgPathD = [
    `M ${fmt(baseLeft.x)} ${fmt(baseLeft.y)}`,
    `C ${fmt(leftC1.x)} ${fmt(leftC1.y)}, ${fmt(leftC2.x)} ${fmt(leftC2.y)}, ${fmt(tip.x)} ${fmt(tip.y)}`,
    `C ${fmt(rightC2.x)} ${fmt(rightC2.y)}, ${fmt(rightC1.x)} ${fmt(rightC1.y)}, ${fmt(baseRight.x)} ${fmt(baseRight.y)}`,
    "Z",
  ].join(" ");

  return {
    baseCenter,
    baseLeft,
    baseRight,
    tip,
    centerlineCubic: chosenCurve,
    quadraticApproximation: { p0: chosenCurve.p0, control: quadControl, p2: chosenCurve.p3 },
    sampledCenterline,
    svgPathD,
    avoidedObstacleIds: initialHits,
    collisionFree,
    bendingEnergy: chosenEnergy,
    anchorDistanceToMouthPx: Math.hypot(tip.x - input.speakerMouth.x, tip.y - input.speakerMouth.y),
    serverCostKrw: 0,
  };
}
