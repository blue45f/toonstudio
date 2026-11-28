/**
 * Wave 156 — 웹툰 의성어·의태어(SFX) Bilinearly Blended Coons 패치 경로 워프 ·
 * 야코비안 행렬식 접힘(Fold-Over) 감지기 · 이분 탐색 안전 감쇠 및 텍스트 워프 엔진.
 *
 * - 정본 Coons 패치: `S(u,v) = (1-v)T(u) + vB(u) + (1-u)L(v) + uR(v) - Bilinear(P00,P10,P01,P11)`
 * - 해석적 편미분(`∂S/∂u`, `∂S/∂v`)과 `det(J) = ∂S/∂u × ∂S/∂v` 격자 감사로 접힘 감지 및 자동 복구
 */

import {
  clampFinite,
  createSfxEnvelopePreset,
  distVec2,
  evaluateCubicBezier,
  evaluateCubicBezierDerivative,
  lerpVec2,
  makeStraightBoundary,
  makeVec2,
  SFX_ENVELOPE_PRESET_IDS,
  SFX_ENVELOPE_PRESET_META,
  type CoonsPatchEnvelope,
  type CubicBezierBoundary,
  type SfxEnvelopeBounds,
  type SfxEnvelopePresetId,
  type SfxEnvelopePresetMeta,
  type SfxGlyphUvBox,
  type Vec2,
} from "./sfx-coons-presets";
import {
  buildGlyphUnitStrokes,
  classifyGlyphScript,
  computePolygonArea,
  glyphAdvanceWeight,
  subdividePolylineInUv,
  type SfxGlyphScriptKind,
} from "./sfx-glyph-skeletons";

export {
  clampFinite,
  createSfxEnvelopePreset,
  evaluateCubicBezier,
  evaluateCubicBezierDerivative,
  SFX_ENVELOPE_PRESET_IDS,
  SFX_ENVELOPE_PRESET_META,
  type CoonsPatchEnvelope,
  type CubicBezierBoundary,
  type SfxEnvelopeBounds,
  type SfxEnvelopePresetId,
  type SfxEnvelopePresetMeta,
  type SfxGlyphScriptKind,
  type SfxGlyphUvBox,
  type Vec2,
};

export interface CoonsPatchPartials {
  readonly point: Vec2;
  readonly dSdu: Vec2;
  readonly dSdv: Vec2;
  readonly jacobianDet: number;
}

export interface CoonsJacobianCell {
  readonly uIndex: number;
  readonly vIndex: number;
  readonly uCenter: number;
  readonly vCenter: number;
  readonly center: Vec2;
  readonly detJ: number;
  readonly folded: boolean;
}

export interface CoonsPatchFoldOverAudit {
  readonly hasFoldOver: boolean;
  readonly foldOverCount: number;
  readonly totalSamples: number;
  readonly gridU: number;
  readonly gridV: number;
  readonly minJacobianDet: number;
  readonly maxJacobianDet: number;
  readonly meanJacobianDet: number;
  readonly jacobianRatio: number;
  readonly maxCornerError: number;
  readonly maxBoundaryError: number;
  readonly worstSampleUv: Vec2;
  readonly cells: readonly CoonsJacobianCell[];
}

export interface ClampSafeCoonsOptions {
  readonly gridU?: number;
  readonly gridV?: number;
  readonly minSafeDetRatio?: number;
  readonly maxIterations?: number;
}

export interface SafeCoonsClampResult {
  readonly envelope: CoonsPatchEnvelope;
  readonly wasClamped: boolean;
  readonly cornersRepaired: boolean;
  readonly dampingFactor: number;
  readonly auditBefore: CoonsPatchFoldOverAudit;
  readonly auditAfter: CoonsPatchFoldOverAudit;
}

export interface WarpedSfxGlyph {
  readonly index: number;
  readonly char: string;
  readonly scriptKind: SfxGlyphScriptKind;
  readonly uvBox: SfxGlyphUvBox;
  readonly uvCenter: Vec2;
  readonly warpedCenter: Vec2;
  readonly warpedBoundsPolygon: readonly Vec2[];
  readonly warpedStrokes: readonly (readonly Vec2[])[];
  readonly localRotationDeg: number;
  readonly localScaleX: number;
  readonly localScaleY: number;
  readonly uvArea: number;
  readonly warpedArea: number;
  readonly localAreaScale: number;
}

export interface SfxBoundingBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

export interface WarpSfxTextOptions {
  readonly presetId?: SfxEnvelopePresetId;
  readonly bounds?: Partial<SfxEnvelopeBounds>;
  readonly intensity?: number;
  readonly envelope?: CoonsPatchEnvelope;
  readonly autoClampFoldOver?: boolean;
  readonly letterSpacingRatio?: number;
  readonly paddingU?: number;
  readonly paddingV?: number;
  readonly strokeSubdivisions?: number;
  readonly gridU?: number;
  readonly gridV?: number;
}

export interface WarpedSfxTextResult {
  readonly text: string;
  readonly presetId: SfxEnvelopePresetId | "custom";
  readonly envelope: CoonsPatchEnvelope;
  readonly audit: CoonsPatchFoldOverAudit;
  readonly wasSafelyClamped: boolean;
  readonly dampingFactor: number;
  readonly glyphs: readonly WarpedSfxGlyph[];
  readonly totalWarpedArea: number;
  readonly referenceEnvelopeArea: number;
  readonly areaPreservationRatio: number;
  readonly firstToLastAreaRatio: number;
  readonly isAreaMonotonicallyDecreasing: boolean;
  readonly isScaleMonotonicallyDecreasing: boolean;
  readonly minRotationDeg: number;
  readonly maxRotationDeg: number;
  readonly arcAngleSpanDeg: number;
  readonly boundingBox: SfxBoundingBox;
}

/** 4개 경계 곡선의 공유 모서리 정점이 미세하게 어긋난 경우 평균 정점으로 일치시킨다. */
export function normalizeCoonsPatchCorners(patch: CoonsPatchEnvelope): CoonsPatchEnvelope {
  const p00 = lerpVec2(patch.top.p0, patch.left.p0, 0.5);
  const p10 = lerpVec2(patch.top.p3, patch.right.p0, 0.5);
  const p01 = lerpVec2(patch.bottom.p0, patch.left.p3, 0.5);
  const p11 = lerpVec2(patch.bottom.p3, patch.right.p3, 0.5);
  return {
    top: { p0: p00, p1: makeVec2(patch.top.p1.x, patch.top.p1.y), p2: makeVec2(patch.top.p2.x, patch.top.p2.y), p3: p10 },
    bottom: { p0: p01, p1: makeVec2(patch.bottom.p1.x, patch.bottom.p1.y), p2: makeVec2(patch.bottom.p2.x, patch.bottom.p2.y), p3: p11 },
    left: { p0: p00, p1: makeVec2(patch.left.p1.x, patch.left.p1.y), p2: makeVec2(patch.left.p2.x, patch.left.p2.y), p3: p01 },
    right: { p0: p10, p1: makeVec2(patch.right.p1.x, patch.right.p1.y), p2: makeVec2(patch.right.p2.x, patch.right.p2.y), p3: p11 },
  };
}

/**
 * 정본 Bilinearly Blended Coons 패치 매핑:
 * `S(u, v) = (1-v)T(u) + vB(u) + (1-u)L(v) + uR(v) - [(1-u)(1-v)P00 + u(1-v)P10 + (1-u)vP01 + uvP11]`
 */
export function evaluateCoonsPatchPoint(
  patch: CoonsPatchEnvelope,
  uIn: number,
  vIn: number,
): Vec2 {
  const u = clampFinite(uIn, 0, 1, 0);
  const v = clampFinite(vIn, 0, 1, 0);
  const omu = 1 - u;
  const omv = 1 - v;
  const tU = evaluateCubicBezier(patch.top, u);
  const bU = evaluateCubicBezier(patch.bottom, u);
  const lV = evaluateCubicBezier(patch.left, v);
  const rV = evaluateCubicBezier(patch.right, v);
  const p00 = patch.top.p0;
  const p10 = patch.top.p3;
  const p01 = patch.bottom.p0;
  const p11 = patch.bottom.p3;
  const bilinX = omu * omv * p00.x + u * omv * p10.x + omu * v * p01.x + u * v * p11.x;
  const bilinY = omu * omv * p00.y + u * omv * p10.y + omu * v * p01.y + u * v * p11.y;
  return {
    x: omv * tU.x + v * bU.x + omu * lV.x + u * rV.x - bilinX,
    y: omv * tU.y + v * bU.y + omu * lV.y + u * rV.y - bilinY,
  };
}

/** Coons 패치의 위치, 해석적 편미분(`∂S/∂u`, `∂S/∂v`), 야코비안 행렬식 `det(J)`를 함께 계산한다. */
export function evaluateCoonsPatchPartials(
  patch: CoonsPatchEnvelope,
  uIn: number,
  vIn: number,
): CoonsPatchPartials {
  const u = clampFinite(uIn, 0, 1, 0);
  const v = clampFinite(vIn, 0, 1, 0);
  const omu = 1 - u;
  const omv = 1 - v;
  const tU = evaluateCubicBezier(patch.top, u);
  const bU = evaluateCubicBezier(patch.bottom, u);
  const lV = evaluateCubicBezier(patch.left, v);
  const rV = evaluateCubicBezier(patch.right, v);
  const dtU = evaluateCubicBezierDerivative(patch.top, u);
  const dbU = evaluateCubicBezierDerivative(patch.bottom, u);
  const dlV = evaluateCubicBezierDerivative(patch.left, v);
  const drV = evaluateCubicBezierDerivative(patch.right, v);
  const p00 = patch.top.p0;
  const p10 = patch.top.p3;
  const p01 = patch.bottom.p0;
  const p11 = patch.bottom.p3;

  const bilinX = omu * omv * p00.x + u * omv * p10.x + omu * v * p01.x + u * v * p11.x;
  const bilinY = omu * omv * p00.y + u * omv * p10.y + omu * v * p01.y + u * v * p11.y;
  const point: Vec2 = {
    x: omv * tU.x + v * bU.x + omu * lV.x + u * rV.x - bilinX,
    y: omv * tU.y + v * bU.y + omu * lV.y + u * rV.y - bilinY,
  };
  const dSdu: Vec2 = {
    x: omv * dtU.x + v * dbU.x + (rV.x - lV.x) - omv * (p10.x - p00.x) - v * (p11.x - p01.x),
    y: omv * dtU.y + v * dbU.y + (rV.y - lV.y) - omv * (p10.y - p00.y) - v * (p11.y - p01.y),
  };
  const dSdv: Vec2 = {
    x: (bU.x - tU.x) + omu * dlV.x + u * drV.x - omu * (p01.x - p00.x) - u * (p11.x - p10.x),
    y: (bU.y - tU.y) + omu * dlV.y + u * drV.y - omu * (p01.y - p00.y) - u * (p11.y - p10.y),
  };
  return { point, dSdu, dSdv, jacobianDet: dSdu.x * dSdv.y - dSdu.y * dSdv.x };
}

/**
 * Coons 패치 전체 격자에서 야코비안 행렬식 `det(J)`와 4모서리·4경계 보간 오차를 감사해
 * 접힘·자기교차(Fold-Over, `det(J) <= 0`) 여부를 정밀하게 진단한다.
 */
export function auditCoonsPatchFoldOver(
  patch: CoonsPatchEnvelope,
  gridUIn = 16,
  gridVIn = 8,
): CoonsPatchFoldOverAudit {
  const gridU = Math.max(2, Math.min(64, Math.floor(clampFinite(gridUIn, 2, 64, 16))));
  const gridV = Math.max(2, Math.min(32, Math.floor(clampFinite(gridVIn, 2, 32, 8))));

  const s00 = evaluateCoonsPatchPoint(patch, 0, 0);
  const s10 = evaluateCoonsPatchPoint(patch, 1, 0);
  const s01 = evaluateCoonsPatchPoint(patch, 0, 1);
  const s11 = evaluateCoonsPatchPoint(patch, 1, 1);
  const maxCornerError = Math.max(
    distVec2(s00, patch.top.p0),
    distVec2(s00, patch.left.p0),
    distVec2(s10, patch.top.p3),
    distVec2(s10, patch.right.p0),
    distVec2(s01, patch.bottom.p0),
    distVec2(s01, patch.left.p3),
    distVec2(s11, patch.bottom.p3),
    distVec2(s11, patch.right.p3),
  );

  let maxBoundaryError = 0;
  for (let i = 0; i <= 16; i += 1) {
    const t = i / 16;
    maxBoundaryError = Math.max(
      maxBoundaryError,
      distVec2(evaluateCoonsPatchPoint(patch, t, 0), evaluateCubicBezier(patch.top, t)),
      distVec2(evaluateCoonsPatchPoint(patch, t, 1), evaluateCubicBezier(patch.bottom, t)),
      distVec2(evaluateCoonsPatchPoint(patch, 0, t), evaluateCubicBezier(patch.left, t)),
      distVec2(evaluateCoonsPatchPoint(patch, 1, t), evaluateCubicBezier(patch.right, t)),
    );
  }

  let minDet = Number.POSITIVE_INFINITY;
  let maxDet = Number.NEGATIVE_INFINITY;
  let sumDet = 0;
  let totalSamples = 0;
  let foldOverCount = 0;
  let worstSampleUv: Vec2 = { x: 0, y: 0 };

  const recordSample = (u: number, v: number, det: number): void => {
    totalSamples += 1;
    sumDet += det;
    if (det < minDet) {
      minDet = det;
      worstSampleUv = { x: u, y: v };
    }
    if (det > maxDet) maxDet = det;
    if (det <= 0) foldOverCount += 1;
  };

  for (let iv = 0; iv <= gridV; iv += 1) {
    const v = iv / gridV;
    for (let iu = 0; iu <= gridU; iu += 1) {
      const u = iu / gridU;
      recordSample(u, v, evaluateCoonsPatchPartials(patch, u, v).jacobianDet);
    }
  }

  const cells: CoonsJacobianCell[] = [];
  for (let iv = 0; iv < gridV; iv += 1) {
    const vCenter = (iv + 0.5) / gridV;
    for (let iu = 0; iu < gridU; iu += 1) {
      const uCenter = (iu + 0.5) / gridU;
      const sample = evaluateCoonsPatchPartials(patch, uCenter, vCenter);
      recordSample(uCenter, vCenter, sample.jacobianDet);
      cells.push({
        uIndex: iu,
        vIndex: iv,
        uCenter,
        vCenter,
        center: sample.point,
        detJ: sample.jacobianDet,
        folded: sample.jacobianDet <= 0,
      });
    }
  }

  const meanJacobianDet = totalSamples > 0 ? sumDet / totalSamples : 0;
  const jacobianRatio = Math.abs(maxDet) > 1e-12 ? minDet / maxDet : minDet <= 0 ? -1 : 0;
  return {
    hasFoldOver: foldOverCount > 0 || minDet <= 0,
    foldOverCount,
    totalSamples,
    gridU,
    gridV,
    minJacobianDet: Number.isFinite(minDet) ? minDet : 0,
    maxJacobianDet: Number.isFinite(maxDet) ? maxDet : 0,
    meanJacobianDet,
    jacobianRatio,
    maxCornerError,
    maxBoundaryError,
    worstSampleUv,
    cells,
  };
}

function blendCubicBoundary(
  base: CubicBezierBoundary,
  target: CubicBezierBoundary,
  alpha: number,
): CubicBezierBoundary {
  return {
    p0: lerpVec2(base.p0, target.p0, alpha),
    p1: lerpVec2(base.p1, target.p1, alpha),
    p2: lerpVec2(base.p2, target.p2, alpha),
    p3: lerpVec2(base.p3, target.p3, alpha),
  };
}

function blendCoonsPatch(
  base: CoonsPatchEnvelope,
  target: CoonsPatchEnvelope,
  alpha: number,
): CoonsPatchEnvelope {
  return {
    top: blendCubicBoundary(base.top, target.top, alpha),
    bottom: blendCubicBoundary(base.bottom, target.bottom, alpha),
    left: blendCubicBoundary(base.left, target.left, alpha),
    right: blendCubicBoundary(base.right, target.right, alpha),
  };
}

function buildSafeReferenceEnvelope(
  normalized: CoonsPatchEnvelope,
  gridU: number,
  gridV: number,
): { readonly base: CoonsPatchEnvelope; readonly cornersRepaired: boolean; readonly baseMinDet: number } {
  const bilinearFromCorners: CoonsPatchEnvelope = {
    top: makeStraightBoundary(normalized.top.p0, normalized.top.p3),
    bottom: makeStraightBoundary(normalized.bottom.p0, normalized.bottom.p3),
    left: makeStraightBoundary(normalized.top.p0, normalized.bottom.p0),
    right: makeStraightBoundary(normalized.top.p3, normalized.bottom.p3),
  };
  const bilinearAudit = auditCoonsPatchFoldOver(bilinearFromCorners, gridU, gridV);
  if (!bilinearAudit.hasFoldOver && bilinearAudit.minJacobianDet > 1.0) {
    return { base: bilinearFromCorners, cornersRepaired: false, baseMinDet: bilinearAudit.minJacobianDet };
  }

  const pts = [
    normalized.top.p0, normalized.top.p1, normalized.top.p2, normalized.top.p3,
    normalized.bottom.p0, normalized.bottom.p1, normalized.bottom.p2, normalized.bottom.p3,
    normalized.left.p0, normalized.left.p1, normalized.left.p2, normalized.left.p3,
    normalized.right.p0, normalized.right.p1, normalized.right.p2, normalized.right.p3,
  ];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < pts.length; i += 1) {
    if (pts[i].x < minX) minX = pts[i].x;
    if (pts[i].y < minY) minY = pts[i].y;
    if (pts[i].x > maxX) maxX = pts[i].x;
    if (pts[i].y > maxY) maxY = pts[i].y;
  }
  const width = Math.max(32, Number.isFinite(maxX - minX) ? maxX - minX : 320);
  const height = Math.max(24, Number.isFinite(maxY - minY) ? maxY - minY : 120);
  const originX = Number.isFinite(minX) ? minX : 0;
  const originY = Number.isFinite(minY) ? minY : 0;
  const p00 = makeVec2(originX, originY);
  const p10 = makeVec2(originX + width, originY);
  const p01 = makeVec2(originX, originY + height);
  const p11 = makeVec2(originX + width, originY + height);
  return {
    base: {
      top: makeStraightBoundary(p00, p10),
      bottom: makeStraightBoundary(p01, p11),
      left: makeStraightBoundary(p00, p01),
      right: makeStraightBoundary(p10, p11),
    },
    cornersRepaired: true,
    baseMinDet: width * height,
  };
}

/**
 * 과도한 제어점 구부림 또는 꼬인 모서리로 접힘(`det(J) <= 0`)이 발생한 Coons 패치를
 * 이분 탐색 안전 감쇠로 보정해 모든 격자 셀에서 `det(J) > 0`이 되도록 복구한다.
 */
export function clampSafeCoonsEnvelope(
  patch: CoonsPatchEnvelope,
  options?: ClampSafeCoonsOptions,
): SafeCoonsClampResult {
  const gridU = Math.max(4, Math.min(48, Math.floor(options?.gridU ?? 16)));
  const gridV = Math.max(4, Math.min(24, Math.floor(options?.gridV ?? 8)));
  const minSafeDetRatio = clampFinite(options?.minSafeDetRatio ?? 0.04, 0.001, 0.5, 0.04);
  const maxIterations = Math.max(8, Math.min(40, Math.floor(options?.maxIterations ?? 24)));

  const normalized = normalizeCoonsPatchCorners(patch);
  const auditBefore = auditCoonsPatchFoldOver(patch, gridU, gridV);
  const normalizedAudit = auditCoonsPatchFoldOver(normalized, gridU, gridV);

  if (!auditBefore.hasFoldOver && auditBefore.minJacobianDet > 1e-3 && auditBefore.maxCornerError < 1e-6) {
    return {
      envelope: patch,
      wasClamped: false,
      cornersRepaired: false,
      dampingFactor: 1.0,
      auditBefore,
      auditAfter: auditBefore,
    };
  }
  if (!normalizedAudit.hasFoldOver && normalizedAudit.minJacobianDet > 1e-3) {
    return {
      envelope: normalized,
      wasClamped: true,
      cornersRepaired: true,
      dampingFactor: 1.0,
      auditBefore,
      auditAfter: normalizedAudit,
    };
  }

  const { base, cornersRepaired, baseMinDet } = buildSafeReferenceEnvelope(normalized, gridU, gridV);
  const minRequiredDet = Math.max(1e-3, baseMinDet * minSafeDetRatio);
  let lo = 0;
  let hi = 1;
  let bestPatch = base;
  let bestAudit = auditCoonsPatchFoldOver(base, gridU, gridV);
  let bestAlpha = 0;

  for (let iter = 0; iter < maxIterations; iter += 1) {
    const mid = 0.5 * (lo + hi);
    const candidate = blendCoonsPatch(base, normalized, mid);
    const candidateAudit = auditCoonsPatchFoldOver(candidate, gridU, gridV);
    if (!candidateAudit.hasFoldOver && candidateAudit.minJacobianDet >= minRequiredDet) {
      lo = mid;
      bestAlpha = mid;
      bestPatch = candidate;
      bestAudit = candidateAudit;
    } else {
      hi = mid;
    }
  }

  return {
    envelope: bestPatch,
    wasClamped: true,
    cornersRepaired,
    dampingFactor: bestAlpha,
    auditBefore,
    auditAfter: bestAudit,
  };
}

function computeEnvelopeBoundingBox(
  patch: CoonsPatchEnvelope,
  glyphs: readonly WarpedSfxGlyph[],
): SfxBoundingBox {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const push = (p: Vec2): void => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  };
  for (let i = 0; i <= 12; i += 1) {
    const t = i / 12;
    push(evaluateCoonsPatchPoint(patch, t, 0));
    push(evaluateCoonsPatchPoint(patch, t, 1));
    push(evaluateCoonsPatchPoint(patch, 0, t));
    push(evaluateCoonsPatchPoint(patch, 1, t));
  }
  for (let g = 0; g < glyphs.length; g += 1) {
    for (let k = 0; k < glyphs[g].warpedBoundsPolygon.length; k += 1) {
      push(glyphs[g].warpedBoundsPolygon[k]);
    }
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }
  return { minX, minY, maxX, maxY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

/**
 * 한/일/영 효과음 문자열을 정규화 글리프 박스·폴리라인으로 배치하고 Coons 패치에 워프한다.
 * `autoClampFoldOver !== false`일 때 접힘(`det(J) <= 0`)이 감지되면 자동 안전 감쇠를 적용한다.
 */
export function warpSfxTextToEnvelope(
  textIn: string,
  options?: WarpSfxTextOptions,
): WarpedSfxTextResult {
  const text = textIn.length > 0 ? textIn : "콰아아앙!";
  const presetId: SfxEnvelopePresetId | "custom" = options?.envelope
    ? "custom"
    : (options?.presetId ?? "sword-slash-arc");
  const rawEnvelope =
    options?.envelope ??
    createSfxEnvelopePreset(
      options?.presetId ?? "sword-slash-arc",
      options?.bounds,
      options?.intensity ?? 1.0,
    );
  const gridU = options?.gridU ?? 16;
  const gridV = options?.gridV ?? 8;
  const autoClamp = options?.autoClampFoldOver !== false;

  let finalEnvelope = rawEnvelope;
  let audit = auditCoonsPatchFoldOver(rawEnvelope, gridU, gridV);
  let wasSafelyClamped = false;
  let dampingFactor = 1.0;

  if (autoClamp && audit.hasFoldOver) {
    const clamped = clampSafeCoonsEnvelope(rawEnvelope, { gridU, gridV });
    finalEnvelope = clamped.envelope;
    audit = clamped.auditAfter;
    wasSafelyClamped = clamped.wasClamped;
    dampingFactor = clamped.dampingFactor;
  }

  const paddingU = clampFinite(options?.paddingU ?? 0.03, 0, 0.25, 0.03);
  const paddingV = clampFinite(options?.paddingV ?? 0.08, 0, 0.3, 0.08);
  const letterSpacingRatio = clampFinite(options?.letterSpacingRatio ?? 0.09, 0, 0.5, 0.09);
  const subdivisions = Math.max(2, Math.min(16, Math.floor(options?.strokeSubdivisions ?? 6)));

  const items = Array.from(text).map((ch) => {
    const scriptKind = classifyGlyphScript(ch);
    return {
      char: ch,
      scriptKind,
      isSpace: ch.trim().length === 0,
      weight: glyphAdvanceWeight(ch, scriptKind),
    };
  });

  let totalWeight = 0;
  for (let i = 0; i < items.length; i += 1) {
    totalWeight += items[i].weight + (i + 1 < items.length ? letterSpacingRatio : 0);
  }
  const safeTotalWeight = Math.max(1e-6, totalWeight);
  const usableU = Math.max(0.05, 1 - 2 * paddingU);
  const v0 = paddingV;
  const v1 = 1 - paddingV;

  const refW = Math.max(
    1,
    0.5 * (distVec2(finalEnvelope.top.p0, finalEnvelope.top.p3) + distVec2(finalEnvelope.bottom.p0, finalEnvelope.bottom.p3)),
  );
  const refH = Math.max(
    1,
    0.5 * (distVec2(finalEnvelope.left.p0, finalEnvelope.left.p3) + distVec2(finalEnvelope.right.p0, finalEnvelope.right.p3)),
  );
  const referenceEnvelopeArea = refW * refH;

  const boxCornersUv: readonly Vec2[] = [
    makeVec2(0, 0), makeVec2(1, 0), makeVec2(1, 1), makeVec2(0, 1), makeVec2(0, 0),
  ];

  const glyphs: WarpedSfxGlyph[] = [];
  let cursorWeight = 0;
  let visibleIndex = 0;
  let totalWarpedArea = 0;
  let totalUvArea = 0;
  let minRotationDeg = Number.POSITIVE_INFINITY;
  let maxRotationDeg = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const u0 = paddingU + (cursorWeight / safeTotalWeight) * usableU;
    const u1 = paddingU + ((cursorWeight + item.weight) / safeTotalWeight) * usableU;
    cursorWeight += item.weight + letterSpacingRatio;
    if (item.isSpace) continue;

    const uvBox: SfxGlyphUvBox = { u0, u1, v0, v1 };
    const uvCenter: Vec2 = { x: 0.5 * (u0 + u1), y: 0.5 * (v0 + v1) };
    const partials = evaluateCoonsPatchPartials(finalEnvelope, uvCenter.x, uvCenter.y);
    const localRotationDeg = (Math.atan2(partials.dSdu.y, partials.dSdu.x) * 180) / Math.PI;
    const localScaleX = Math.hypot(partials.dSdu.x, partials.dSdu.y) / refW;
    const localScaleY = Math.hypot(partials.dSdv.x, partials.dSdv.y) / refH;

    const boxOutlineUv = subdividePolylineInUv(boxCornersUv, uvBox, subdivisions);
    const warpedBoundsPolygon: Vec2[] = [];
    for (let k = 0; k < boxOutlineUv.length - 1; k += 1) {
      warpedBoundsPolygon.push(evaluateCoonsPatchPoint(finalEnvelope, boxOutlineUv[k].x, boxOutlineUv[k].y));
    }

    const unitStrokes = buildGlyphUnitStrokes(item.char, item.scriptKind);
    const warpedStrokes: (readonly Vec2[])[] = [];
    for (let s = 0; s < unitStrokes.length; s += 1) {
      const uvStroke = subdividePolylineInUv(unitStrokes[s], uvBox, subdivisions);
      const warpedStroke: Vec2[] = [];
      for (let p = 0; p < uvStroke.length; p += 1) {
        warpedStroke.push(evaluateCoonsPatchPoint(finalEnvelope, uvStroke[p].x, uvStroke[p].y));
      }
      warpedStrokes.push(warpedStroke);
    }

    const uvArea = Math.max(1e-9, (u1 - u0) * (v1 - v0));
    const warpedArea = computePolygonArea(warpedBoundsPolygon);
    const localAreaScale = warpedArea / Math.max(1e-9, uvArea * referenceEnvelopeArea);

    totalWarpedArea += warpedArea;
    totalUvArea += uvArea;
    if (localRotationDeg < minRotationDeg) minRotationDeg = localRotationDeg;
    if (localRotationDeg > maxRotationDeg) maxRotationDeg = localRotationDeg;

    glyphs.push({
      index: visibleIndex,
      char: item.char,
      scriptKind: item.scriptKind,
      uvBox,
      uvCenter,
      warpedCenter: partials.point,
      warpedBoundsPolygon,
      warpedStrokes,
      localRotationDeg,
      localScaleX,
      localScaleY,
      uvArea,
      warpedArea,
      localAreaScale,
    });
    visibleIndex += 1;
  }

  let isAreaMonotonicallyDecreasing = glyphs.length >= 2;
  let isScaleMonotonicallyDecreasing = glyphs.length >= 2;
  for (let i = 1; i < glyphs.length; i += 1) {
    if (!(glyphs[i].warpedArea < glyphs[i - 1].warpedArea)) isAreaMonotonicallyDecreasing = false;
    if (!(glyphs[i].localAreaScale < glyphs[i - 1].localAreaScale)) isScaleMonotonicallyDecreasing = false;
  }

  const firstToLastAreaRatio =
    glyphs.length >= 2 && glyphs[0].warpedArea > 1e-9
      ? glyphs[glyphs.length - 1].warpedArea / glyphs[0].warpedArea
      : 1;
  const areaPreservationRatio = totalWarpedArea / Math.max(1e-9, totalUvArea * referenceEnvelopeArea);
  const safeMinRot = Number.isFinite(minRotationDeg) ? minRotationDeg : 0;
  const safeMaxRot = Number.isFinite(maxRotationDeg) ? maxRotationDeg : 0;

  return {
    text,
    presetId,
    envelope: finalEnvelope,
    audit,
    wasSafelyClamped,
    dampingFactor,
    glyphs,
    totalWarpedArea,
    referenceEnvelopeArea,
    areaPreservationRatio,
    firstToLastAreaRatio,
    isAreaMonotonicallyDecreasing,
    isScaleMonotonicallyDecreasing,
    minRotationDeg: safeMinRot,
    maxRotationDeg: safeMaxRot,
    arcAngleSpanDeg: safeMaxRot - safeMinRot,
    boundingBox: computeEnvelopeBoundingBox(finalEnvelope, glyphs),
  };
}
