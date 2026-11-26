/**
 * 오프라인 3-Way 시맨틱 시각·레이어 트리 병합 검사기 및
 * Display-P3 -> sRGB -> 인쇄용 ISO-Coated CMYK 지각적 소프트-니(Soft-Knee) 색역 매퍼.
 *
 * - 외부 서버 호출 0회(₩0), 로컬 메모리 상에서 완결 동작.
 * - 원고 원본(Base), 어시스턴트 작업본(Assistant), 작가 작업본(Author) 3개 리비전을 비교해
 *   레이어 속성(불투명도·혼합모드·변환·가시성·순서)과 8-연결 픽셀 변경 영역(Dirty BBox)을 분리 병합하고,
 *   동일 픽셀/영역에서 서로 다르게 칠한 충돌 구간만 정밀 좌표로 추출한다.
 * - 광색역 Display-P3 선형 RGB를 CIE XYZ(D65)와 OKLab/OKLCH 지각 색공간으로 변환해 색역 이탈 픽셀을 찾고,
 *   지각 색상각(`h`)과 커스프(Cusp) 기준 밝기(`L`)를 유지한 채 채도(`C`)를 소프트-니 곡선으로 압축해
 *   계조 뭉개짐(Posterization) 없는 sRGB 및 총잉크량(`TAC <= 300%`) 준수 CMYK 데이터를 생성한다.
 */

export type LayerBlendMode =
  | "normal" | "multiply" | "screen" | "overlay"
  | "darken" | "lighten" | "color-dodge" | "linear-burn";

export interface LayerTransform2D {
  readonly tx: number; readonly ty: number;
  readonly scaleX: number; readonly scaleY: number; readonly rotationDeg: number;
}

export interface LayerRasterBuffer {
  readonly width: number; readonly height: number;
  readonly rgba: Uint8Array | Uint8ClampedArray;
}

export interface ManuscriptLayerSnapshot {
  readonly layerId: string; readonly name: string; readonly zIndex: number;
  readonly visible: boolean; readonly opacity: number; readonly blendMode: LayerBlendMode;
  readonly transform: LayerTransform2D; readonly raster?: LayerRasterBuffer;
}

export interface ManuscriptRevisionSnapshot {
  readonly revisionId: string;
  readonly canvasWidth: number; readonly canvasHeight: number;
  readonly layers: readonly ManuscriptLayerSnapshot[];
}

export interface DirtyRegionBox {
  readonly x: number; readonly y: number;
  readonly width: number; readonly height: number; readonly pixelCount: number;
}

export type LayerPropertyField =
  | "name" | "zIndex" | "visible" | "opacity" | "blendMode" | "transform" | "lifecycle";

export interface MergedPropertyChange {
  readonly layerId: string; readonly field: LayerPropertyField;
  readonly resolution: "merged-assistant" | "merged-author" | "converged-identical";
  readonly summaryKo: string;
}

export interface StructuralPropertyConflict {
  readonly layerId: string; readonly field: LayerPropertyField;
  readonly baseValue: string; readonly assistantValue: string; readonly authorValue: string;
  readonly messageKo: string;
}

export interface VisualConflictRegion {
  readonly layerId: string; readonly bounds: DirtyRegionBox;
  readonly conflictingPixelCount: number; readonly messageKo: string;
}

export interface LayerThreeWayDiffSummary {
  readonly layerId: string;
  readonly status:
    | "unchanged" | "clean-merged" | "added-assistant" | "added-author" | "deleted" | "conflicted";
  readonly assistantDirtyBoxes: readonly DirtyRegionBox[];
  readonly authorDirtyBoxes: readonly DirtyRegionBox[];
  readonly visualConflicts: readonly VisualConflictRegion[];
  readonly mergedLayer: ManuscriptLayerSnapshot | null;
}

export interface ThreeWayDiffOptions {
  readonly channelTolerance?: number;
  readonly componentLinkRadiusPx?: number;
}

export interface ThreeWayManuscriptDiffReport {
  readonly baseRevisionId: string; readonly assistantRevisionId: string; readonly authorRevisionId: string;
  readonly mergedChanges: readonly MergedPropertyChange[];
  readonly structuralConflicts: readonly StructuralPropertyConflict[];
  readonly visualConflicts: readonly VisualConflictRegion[];
  readonly layerSummaries: readonly LayerThreeWayDiffSummary[];
  readonly mergedLayers: readonly ManuscriptLayerSnapshot[];
  readonly canAutoMergeCleanly: boolean; readonly serverCostKrw: 0;
}

function approxEq(a: number, b: number, eps = 1e-4): boolean {
  return Math.abs(a - b) <= eps;
}

function transformsEqual(a: LayerTransform2D, b: LayerTransform2D): boolean {
  return (
    approxEq(a.tx, b.tx) && approxEq(a.ty, b.ty) &&
    approxEq(a.scaleX, b.scaleX) && approxEq(a.scaleY, b.scaleY) &&
    approxEq(a.rotationDeg, b.rotationDeg)
  );
}

function formatTransform(t: LayerTransform2D): string {
  return `tx=${t.tx},ty=${t.ty},sx=${t.scaleX},sy=${t.scaleY},rot=${t.rotationDeg}`;
}

function pixelChanged(
  bufA: Uint8Array | Uint8ClampedArray, bufB: Uint8Array | Uint8ClampedArray, offset: number, tol: number,
): boolean {
  return (
    Math.abs((bufA[offset] ?? 0) - (bufB[offset] ?? 0)) > tol ||
    Math.abs((bufA[offset + 1] ?? 0) - (bufB[offset + 1] ?? 0)) > tol ||
    Math.abs((bufA[offset + 2] ?? 0) - (bufB[offset + 2] ?? 0)) > tol ||
    Math.abs((bufA[offset + 3] ?? 0) - (bufB[offset + 3] ?? 0)) > tol
  );
}

/** 이진 마스크에서 반복형 BFS로 8-연결(또는 반경 확장) 더티 바운딩 박스를 추출한다. */
export function extractDirtyConnectedComponents(
  mask: Uint8Array, width: number, height: number, linkRadiusPx = 1,
): readonly DirtyRegionBox[] {
  const total = width * height;
  if (total === 0 || mask.length < total) return [];

  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const boxes: DirtyRegionBox[] = [];
  const r = Math.max(1, Math.min(4, Math.floor(linkRadiusPx)));

  for (let idx = 0; idx < total; idx += 1) {
    if (mask[idx] === 0 || visited[idx] === 1) continue;
    visited[idx] = 1;
    let head = 0;
    let tail = 0;
    queue[tail] = idx;
    tail += 1;

    let minX = width; let minY = height; let maxX = -1; let maxY = -1; let count = 0;
    while (head < tail) {
      const cur = queue[head]!;
      head += 1;
      const cy = Math.floor(cur / width);
      const cx = cur - cy * width;
      count += 1;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;

      const y0 = Math.max(0, cy - r);
      const y1 = Math.min(height - 1, cy + r);
      const x0 = Math.max(0, cx - r);
      const x1 = Math.min(width - 1, cx + r);
      for (let ny = y0; ny <= y1; ny += 1) {
        const rowOffset = ny * width;
        for (let nx = x0; nx <= x1; nx += 1) {
          const nIdx = rowOffset + nx;
          if (visited[nIdx] === 0 && mask[nIdx] !== 0) {
            visited[nIdx] = 1;
            queue[tail] = nIdx;
            tail += 1;
          }
        }
      }
    }
    if (count > 0 && maxX >= minX && maxY >= minY) {
      boxes.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, pixelCount: count });
    }
  }
  return boxes;
}

function layerModifiedAgainstBase(base: ManuscriptLayerSnapshot, target: ManuscriptLayerSnapshot, tol: number): boolean {
  if (
    base.name !== target.name || base.zIndex !== target.zIndex || base.visible !== target.visible ||
    !approxEq(base.opacity, target.opacity) || base.blendMode !== target.blendMode ||
    !transformsEqual(base.transform, target.transform)
  ) {
    return true;
  }
  if (base.raster && target.raster) {
    if (base.raster.width !== target.raster.width || base.raster.height !== target.raster.height) return true;
    const len = base.raster.width * base.raster.height * 4;
    for (let o = 0; o < len; o += 4) {
      if (pixelChanged(base.raster.rgba, target.raster.rgba, o, tol)) return true;
    }
  }
  return false;
}

/** 원본(Base)·어시스턴트(Assistant)·작가(Author) 3-Way 레이어 트리 및 픽셀 변경 영역을 비교·병합한다. */
export function inspectThreeWayManuscriptDiff(
  base: ManuscriptRevisionSnapshot,
  assistant: ManuscriptRevisionSnapshot,
  author: ManuscriptRevisionSnapshot,
  options: ThreeWayDiffOptions = {},
): ThreeWayManuscriptDiffReport {
  const tol = Math.max(0, Math.floor(options.channelTolerance ?? 2));
  const linkRadius = Math.max(1, Math.floor(options.componentLinkRadiusPx ?? 1));

  const baseMap = new Map<string, ManuscriptLayerSnapshot>();
  const asstMap = new Map<string, ManuscriptLayerSnapshot>();
  const authMap = new Map<string, ManuscriptLayerSnapshot>();
  const orderedIds: string[] = [];
  const seen = new Set<string>();

  for (const list of [base.layers, assistant.layers, author.layers]) {
    for (const l of list) {
      if (!seen.has(l.layerId)) { seen.add(l.layerId); orderedIds.push(l.layerId); }
    }
  }
  for (const l of base.layers) baseMap.set(l.layerId, l);
  for (const l of assistant.layers) asstMap.set(l.layerId, l);
  for (const l of author.layers) authMap.set(l.layerId, l);

  const mergedChanges: MergedPropertyChange[] = [];
  const structuralConflicts: StructuralPropertyConflict[] = [];
  const visualConflicts: VisualConflictRegion[] = [];
  const layerSummaries: LayerThreeWayDiffSummary[] = [];
  const mergedLayers: ManuscriptLayerSnapshot[] = [];

  for (const layerId of orderedIds) {
    const bL = baseMap.get(layerId);
    const sL = asstMap.get(layerId);
    const uL = authMap.get(layerId);

    if (!bL) {
      if (sL && !uL) {
        mergedChanges.push({ layerId, field: "lifecycle", resolution: "merged-assistant", summaryKo: `어시스턴트가 추가한 레이어(${sL.name})를 병합했습니다.` });
        mergedLayers.push(sL);
        layerSummaries.push({ layerId, status: "added-assistant", assistantDirtyBoxes: [], authorDirtyBoxes: [], visualConflicts: [], mergedLayer: sL });
      } else if (!sL && uL) {
        mergedChanges.push({ layerId, field: "lifecycle", resolution: "merged-author", summaryKo: `작가가 추가한 레이어(${uL.name})를 병합했습니다.` });
        mergedLayers.push(uL);
        layerSummaries.push({ layerId, status: "added-author", assistantDirtyBoxes: [], authorDirtyBoxes: [], visualConflicts: [], mergedLayer: uL });
      } else if (sL && uL) {
        structuralConflicts.push({
          layerId, field: "lifecycle", baseValue: "<없음>", assistantValue: sL.name, authorValue: uL.name,
          messageKo: `동일 레이어 ID(${layerId})가 어시스턴트와 작가 양쪽에서 동시에 생성되었습니다.`,
        });
        mergedLayers.push(uL);
        layerSummaries.push({ layerId, status: "conflicted", assistantDirtyBoxes: [], authorDirtyBoxes: [], visualConflicts: [], mergedLayer: uL });
      }
      continue;
    }

    if (!sL || !uL) {
      if (!sL && !uL) {
        mergedChanges.push({ layerId, field: "lifecycle", resolution: "converged-identical", summaryKo: `양쪽 모두 삭제한 레이어(${bL.name})를 제거했습니다.` });
        layerSummaries.push({ layerId, status: "deleted", assistantDirtyBoxes: [], authorDirtyBoxes: [], visualConflicts: [], mergedLayer: null });
        continue;
      }
      const survivor = sL ?? uL!;
      if (layerModifiedAgainstBase(bL, survivor, tol)) {
        structuralConflicts.push({
          layerId, field: "lifecycle", baseValue: bL.name,
          assistantValue: sL ? "수정됨" : "삭제됨", authorValue: uL ? "수정됨" : "삭제됨",
          messageKo: `한쪽에서 삭제한 레이어(${bL.name})를 다른 작업자가 수정해 삭제-수정 충돌이 발생했습니다.`,
        });
        mergedLayers.push(survivor);
        layerSummaries.push({ layerId, status: "conflicted", assistantDirtyBoxes: [], authorDirtyBoxes: [], visualConflicts: [], mergedLayer: survivor });
      } else {
        mergedChanges.push({ layerId, field: "lifecycle", resolution: sL ? "merged-author" : "merged-assistant", summaryKo: `수정되지 않은 레이어(${bL.name}) 삭제를 반영했습니다.` });
        layerSummaries.push({ layerId, status: "deleted", assistantDirtyBoxes: [], authorDirtyBoxes: [], visualConflicts: [], mergedLayer: null });
      }
      continue;
    }

    let hadChange = false;
    let hadConflict = false;

    const resolveScalar = <T>(
      field: LayerPropertyField, bVal: T, sVal: T, uVal: T, eq: (x: T, y: T) => boolean, fmt: (x: T) => string,
    ): T => {
      const sChanged = !eq(bVal, sVal);
      const uChanged = !eq(bVal, uVal);
      if (!sChanged && !uChanged) return bVal;
      hadChange = true;
      if (sChanged && !uChanged) {
        mergedChanges.push({ layerId, field, resolution: "merged-assistant", summaryKo: `레이어(${bL.name})의 ${field} 변경(${fmt(sVal)})을 어시스턴트 작업본에서 병합했습니다.` });
        return sVal;
      }
      if (!sChanged && uChanged) {
        mergedChanges.push({ layerId, field, resolution: "merged-author", summaryKo: `레이어(${bL.name})의 ${field} 변경(${fmt(uVal)})을 작가 작업본에서 병합했습니다.` });
        return uVal;
      }
      if (eq(sVal, uVal)) {
        mergedChanges.push({ layerId, field, resolution: "converged-identical", summaryKo: `레이어(${bL.name})의 ${field} 값이 동일하게 변경되어 자동 수렴했습니다.` });
        return uVal;
      }
      hadConflict = true;
      structuralConflicts.push({
        layerId, field, baseValue: fmt(bVal), assistantValue: fmt(sVal), authorValue: fmt(uVal),
        messageKo: `레이어(${bL.name})의 ${field} 속성이 어시스턴트(${fmt(sVal)})와 작가(${fmt(uVal)}) 사이에서 충돌합니다.`,
      });
      return uVal;
    };

    const mergedName = resolveScalar("name", bL.name, sL.name, uL.name, (a, b) => a === b, String);
    const mergedZ = resolveScalar("zIndex", bL.zIndex, sL.zIndex, uL.zIndex, (a, b) => a === b, String);
    const mergedVis = resolveScalar("visible", bL.visible, sL.visible, uL.visible, (a, b) => a === b, String);
    const mergedOpacity = resolveScalar("opacity", bL.opacity, sL.opacity, uL.opacity, (a, b) => approxEq(a, b), (v) => v.toFixed(3));
    const mergedBlend = resolveScalar("blendMode", bL.blendMode, sL.blendMode, uL.blendMode, (a, b) => a === b, String);
    const mergedTransform = resolveScalar("transform", bL.transform, sL.transform, uL.transform, transformsEqual, formatTransform);

    let assistantDirtyBoxes: readonly DirtyRegionBox[] = [];
    let authorDirtyBoxes: readonly DirtyRegionBox[] = [];
    const layerVisualConflicts: VisualConflictRegion[] = [];
    let mergedRaster: LayerRasterBuffer | undefined = uL.raster ?? sL.raster ?? bL.raster;

    if (
      bL.raster && sL.raster && uL.raster &&
      bL.raster.width === sL.raster.width && bL.raster.width === uL.raster.width &&
      bL.raster.height === sL.raster.height && bL.raster.height === uL.raster.height
    ) {
      const w = bL.raster.width;
      const h = bL.raster.height;
      const pxTotal = w * h;
      const asstMask = new Uint8Array(pxTotal);
      const authMask = new Uint8Array(pxTotal);
      const conflictMask = new Uint8Array(pxTotal);
      const outRgba = new Uint8Array(pxTotal * 4);

      for (let p = 0; p < pxTotal; p += 1) {
        const o = p * 4;
        const sDiff = pixelChanged(bL.raster.rgba, sL.raster.rgba, o, tol);
        const uDiff = pixelChanged(bL.raster.rgba, uL.raster.rgba, o, tol);
        if (sDiff) asstMask[p] = 1;
        if (uDiff) authMask[p] = 1;

        const chosenSrc = sDiff && !uDiff ? sL.raster.rgba : !sDiff && uDiff ? uL.raster.rgba : sDiff && uDiff ? uL.raster.rgba : bL.raster.rgba;
        if (sDiff || uDiff) hadChange = true;
        if (sDiff && uDiff && pixelChanged(sL.raster.rgba, uL.raster.rgba, o, tol)) {
          conflictMask[p] = 1;
          hadConflict = true;
        }
        outRgba[o] = chosenSrc[o]!;
        outRgba[o + 1] = chosenSrc[o + 1]!;
        outRgba[o + 2] = chosenSrc[o + 2]!;
        outRgba[o + 3] = chosenSrc[o + 3]!;
      }

      assistantDirtyBoxes = extractDirtyConnectedComponents(asstMask, w, h, linkRadius);
      authorDirtyBoxes = extractDirtyConnectedComponents(authMask, w, h, linkRadius);
      for (const box of extractDirtyConnectedComponents(conflictMask, w, h, linkRadius)) {
        const conflictEntry: VisualConflictRegion = {
          layerId, bounds: box, conflictingPixelCount: box.pixelCount,
          messageKo: `레이어(${bL.name})의 (${box.x}, ${box.y}) ${box.width}x${box.height}px 영역에서 어시스턴트와 작가의 브러시 터치가 겹쳐 충돌했습니다.`,
        };
        layerVisualConflicts.push(conflictEntry);
        visualConflicts.push(conflictEntry);
      }
      mergedRaster = { width: w, height: h, rgba: outRgba };
    }

    const mergedLayer: ManuscriptLayerSnapshot = {
      layerId, name: mergedName, zIndex: mergedZ, visible: mergedVis,
      opacity: mergedOpacity, blendMode: mergedBlend, transform: mergedTransform,
      ...(mergedRaster !== undefined ? { raster: mergedRaster } : {}),
    };
    mergedLayers.push(mergedLayer);
    layerSummaries.push({
      layerId, status: hadConflict ? "conflicted" : hadChange ? "clean-merged" : "unchanged",
      assistantDirtyBoxes, authorDirtyBoxes, visualConflicts: layerVisualConflicts, mergedLayer,
    });
  }

  mergedLayers.sort((a, b) => a.zIndex - b.zIndex);
  return {
    baseRevisionId: base.revisionId, assistantRevisionId: assistant.revisionId, authorRevisionId: author.revisionId,
    mergedChanges, structuralConflicts, visualConflicts, layerSummaries, mergedLayers,
    canAutoMergeCleanly: structuralConflicts.length === 0 && visualConflicts.length === 0,
    serverCostKrw: 0,
  };
}

// ============================================================================
// 2. Display-P3 -> sRGB -> 인쇄 CMYK 지각적 소프트-니(Soft-Knee) 색역 매퍼
// ============================================================================

export type TargetColorGamut = "srgb" | "iso-coated-cmyk";
export type TransferFunctionKind = "srgb-eotf" | "linear";

export interface CieXyzColor { readonly x: number; readonly y: number; readonly z: number }
export interface OklchColor { readonly l: number; readonly c: number; readonly hRad: number }
export interface CmykSample {
  readonly c: number; readonly m: number; readonly y: number; readonly k: number; readonly tacPercent: number;
}

export interface GamutMappingOptions {
  readonly targetGamut: TargetColorGamut; readonly inputTransfer?: TransferFunctionKind;
  readonly kneeStartRatio?: number; readonly maxTacPercent?: number; readonly gcrStrength?: number;
}

export interface SingleColorGamutMapResult {
  readonly sourceXyz: CieXyzColor; readonly sourceOklch: OklchColor; readonly mappedOklch: OklchColor;
  readonly srgbLinear: readonly [number, number, number];
  readonly srgbEncoded: readonly [number, number, number];
  readonly cmyk: CmykSample | null; readonly wasOutOfGamut: boolean;
  readonly deltaEOklab: number; readonly hueDriftDeg: number;
}

export interface BufferGamutMapReport {
  readonly targetGamut: TargetColorGamut; readonly pixelCount: number;
  readonly outOfGamutPixelCount: number; readonly outOfGamutRatio: number;
  readonly maxDeltaEOklab: number; readonly meanDeltaEOklab: number;
  readonly maxHueDriftDeg: number; readonly maxObservedTacPercent: number;
  readonly srgbRgba8: Uint8ClampedArray; readonly cmykFloat32: Float32Array | null;
  readonly serverCostKrw: 0;
}

const RAD_TO_DEG = 180 / Math.PI;

function clamp01(v: number): number {
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

function srgbTransferToLinear(v: number): number {
  const c = clamp01(v);
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgbTransfer(v: number): number {
  const c = clamp01(v);
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** 선형 Display-P3 RGB(`0..1`)를 표준 D65 기준 CIE XYZ로 변환한다. */
export function linearDisplayP3ToXyzD65(r: number, g: number, b: number): CieXyzColor {
  return {
    x: 0.4865709486 * r + 0.2656676932 * g + 0.1982172852 * b,
    y: 0.2289745641 * r + 0.6917385218 * g + 0.0792869141 * b,
    z: 0.0451133819 * g + 1.0439443689 * b,
  };
}

function xyzD65ToUnboundedLinearSrgb(xyz: CieXyzColor): readonly [number, number, number] {
  return [
    3.2404541621 * xyz.x - 1.5371385128 * xyz.y - 0.4985314095 * xyz.z,
    -0.9692660305 * xyz.x + 1.8760108454 * xyz.y + 0.0415560175 * xyz.z,
    0.0556434309 * xyz.x - 0.2040259135 * xyz.y + 1.0572251882 * xyz.z,
  ];
}

function unboundedLinearSrgbToOklch(r: number, g: number, b: number): OklchColor {
  const lRoot = Math.cbrt(Math.max(0, 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b));
  const mRoot = Math.cbrt(Math.max(0, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b));
  const sRoot = Math.cbrt(Math.max(0, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b));

  const okL = 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot;
  const okA = 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot;
  const okB = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot;
  const chroma = Math.hypot(okA, okB);
  return { l: okL, c: chroma, hRad: chroma > 1e-7 ? Math.atan2(okB, okA) : 0 };
}

function oklchToUnboundedLinearSrgb(l: number, c: number, hRad: number): readonly [number, number, number] {
  const okA = c * Math.cos(hRad);
  const okB = c * Math.sin(hRad);
  const lRoot = l + 0.3963377774 * okA + 0.2158037573 * okB;
  const mRoot = l - 0.1055613458 * okA - 0.0638541728 * okB;
  const sRoot = l - 0.0894841775 * okA - 1.291485548 * okB;
  const lc = lRoot * lRoot * lRoot;
  const mc = mRoot * mRoot * mRoot;
  const sc = sRoot * sRoot * sRoot;
  return [
    4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
  ];
}

function isInUnitRgbGamut(rgb: readonly [number, number, number], eps = 1e-5): boolean {
  return (
    rgb[0] >= -eps && rgb[0] <= 1 + eps &&
    rgb[1] >= -eps && rgb[1] <= 1 + eps &&
    rgb[2] >= -eps && rgb[2] <= 1 + eps
  );
}

function findMaxSrgbChromaAtLh(l: number, hRad: number): number {
  const clampedL = Math.max(0.0005, Math.min(0.9995, l));
  let lo = 0;
  let hi = 0.42;
  for (let i = 0; i < 14; i += 1) {
    const mid = (lo + hi) * 0.5;
    if (isInUnitRgbGamut(oklchToUnboundedLinearSrgb(clampedL, mid, hRad), 0)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** 삼분 탐색으로 해당 색상각 `hRad`의 정밀 sRGB 커스프 `(cuspL, cuspC)`를 구한다. */
function findHueCusp(hRad: number): { readonly cuspL: number; readonly cuspC: number } {
  let bestL = 0.6;
  let bestC = -1;
  for (let step = 1; step <= 19; step += 1) {
    const candL = step * 0.05;
    const cMax = findMaxSrgbChromaAtLh(candL, hRad);
    if (cMax > bestC) { bestC = cMax; bestL = candL; }
  }
  let lo = Math.max(0.02, bestL - 0.06);
  let hi = Math.min(0.98, bestL + 0.06);
  for (let iter = 0; iter < 8; iter += 1) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (findMaxSrgbChromaAtLh(m1, hRad) < findMaxSrgbChromaAtLh(m2, hRad)) lo = m1;
    else hi = m2;
  }
  const cuspL = (lo + hi) * 0.5;
  return { cuspL, cuspC: findMaxSrgbChromaAtLh(cuspL, hRad) };
}

function compressChromaSoftKnee(c: number, cMax: number, kneeStartRatio: number): number {
  if (cMax <= 1e-6) return 0;
  const knee = cMax * kneeStartRatio;
  if (c <= knee) return c;
  const headroom = Math.max(1e-6, cMax - knee);
  const excess = c - knee;
  return knee + headroom * (excess / (headroom + excess));
}

function convertSrgbEncodedToIsoCoatedCmyk(
  rEnc: number, gEnc: number, bEnc: number, gcrStrength: number, maxTacPercent: number,
): CmykSample {
  const c0 = 1 - clamp01(rEnc);
  const m0 = 1 - clamp01(gEnc);
  const y0 = 1 - clamp01(bEnc);
  let k = Math.min(c0, m0, y0) * gcrStrength;
  const denom = Math.max(1e-5, 1 - k);
  let c = clamp01((c0 - k) / denom);
  let m = clamp01((m0 - k) / denom);
  let y = clamp01((y0 - k) / denom);

  const maxTacRatio = Math.max(1.2, maxTacPercent / 100);
  let total = c + m + y + k;

  if (total > maxTacRatio) {
    const maxKAdd = Math.min(Math.min(c, m, y), 0.96 - k);
    if (maxKAdd > 0) {
      const transfer = Math.min(maxKAdd, (total - maxTacRatio) * 0.5);
      c -= transfer; m -= transfer; y -= transfer; k += transfer;
      total = c + m + y + k;
    }
    if (total > maxTacRatio) {
      const cmySum = c + m + y;
      const allowedCmy = Math.max(0, maxTacRatio - k);
      if (cmySum > 1e-6) {
        const scale = (allowedCmy * 0.9995) / cmySum;
        c *= scale; m *= scale; y *= scale;
      } else {
        k = Math.min(k, maxTacRatio);
      }
    }
  }

  c = clamp01(c); m = clamp01(m); y = clamp01(y); k = clamp01(k);
  return { c, m, y, k, tacPercent: (c + m + y + k) * 100 };
}

function oklabDistance(a: OklchColor, b: OklchColor): number {
  return Math.hypot(
    a.l - b.l,
    a.c * Math.cos(a.hRad) - b.c * Math.cos(b.hRad),
    a.c * Math.sin(a.hRad) - b.c * Math.sin(b.hRad),
  );
}

function angularDiffDeg(radA: number, radB: number): number {
  const diff = (Math.abs(radA - radB) * RAD_TO_DEG) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/** 단일 Display-P3 RGB 색상을 지각적 소프트-니 색역 압축으로 목표 색역(sRGB 또는 ISO-Coated CMYK)에 매핑한다. */
export function mapDisplayP3ColorGamut(
  rP3: number, gP3: number, bP3: number, options: GamutMappingOptions,
): SingleColorGamutMapResult {
  const transfer = options.inputTransfer ?? "srgb-eotf";
  const kneeRatio = Math.max(0.5, Math.min(0.98, options.kneeStartRatio ?? 0.82));
  const maxTacPercent = Math.max(180, Math.min(360, options.maxTacPercent ?? 300));
  const gcrStrength = Math.max(0.2, Math.min(1.0, options.gcrStrength ?? 0.78));

  const linP3R = transfer === "srgb-eotf" ? srgbTransferToLinear(rP3) : clamp01(rP3);
  const linP3G = transfer === "srgb-eotf" ? srgbTransferToLinear(gP3) : clamp01(gP3);
  const linP3B = transfer === "srgb-eotf" ? srgbTransferToLinear(bP3) : clamp01(bP3);

  const sourceXyz = linearDisplayP3ToXyzD65(linP3R, linP3G, linP3B);
  const unboundedSrgb = xyzD65ToUnboundedLinearSrgb(sourceXyz);
  const sourceOklch = unboundedLinearSrgbToOklch(unboundedSrgb[0], unboundedSrgb[1], unboundedSrgb[2]);
  const srgbOut = !isInUnitRgbGamut(unboundedSrgb, 1e-4);
  const { cuspL, cuspC } = findHueCusp(sourceOklch.hRad);

  if (options.targetGamut === "srgb") {
    let targetL = clamp01(sourceOklch.l);
    const baseCMax = findMaxSrgbChromaAtLh(targetL, sourceOklch.hRad);
    if (sourceOklch.c > baseCMax * kneeRatio && cuspC > 0.02) {
      const pull = clamp01((sourceOklch.c - baseCMax * kneeRatio) / Math.max(0.025, cuspC * 0.36));
      targetL += (cuspL - targetL) * pull * 0.9;
    }
    const cMax = findMaxSrgbChromaAtLh(targetL, sourceOklch.hRad);
    const mappedC = compressChromaSoftKnee(sourceOklch.c, cMax, kneeRatio);

    const rawLin = oklchToUnboundedLinearSrgb(targetL, mappedC, sourceOklch.hRad);
    const srgbLinear: readonly [number, number, number] = [clamp01(rawLin[0]), clamp01(rawLin[1]), clamp01(rawLin[2])];
    const srgbEncoded: readonly [number, number, number] = [
      linearToSrgbTransfer(srgbLinear[0]), linearToSrgbTransfer(srgbLinear[1]), linearToSrgbTransfer(srgbLinear[2]),
    ];
    const actualOklch = unboundedLinearSrgbToOklch(srgbLinear[0], srgbLinear[1], srgbLinear[2]);
    const hueDriftDeg = sourceOklch.c > 0.015 && actualOklch.c > 0.015 ? angularDiffDeg(sourceOklch.hRad, actualOklch.hRad) : 0;

    return {
      sourceXyz, sourceOklch, mappedOklch: actualOklch, srgbLinear, srgbEncoded,
      cmyk: null, wasOutOfGamut: srgbOut, deltaEOklab: oklabDistance(sourceOklch, actualOklch), hueDriftDeg,
    };
  }

  const paperWhiteL = 0.955;
  const inkBlackL = 0.19;
  const compressedL = inkBlackL + clamp01(sourceOklch.l) * (paperWhiteL - inkBlackL);
  const pullPrint = cuspC > 0.02 ? clamp01(sourceOklch.c / cuspC) * 0.12 : 0;
  const printTargetL = compressedL + (cuspL - compressedL) * pullPrint;

  const printChromaCeiling = findMaxSrgbChromaAtLh(printTargetL, sourceOklch.hRad) * 0.76;
  const wasPrintOut = srgbOut || sourceOklch.c > printChromaCeiling || sourceOklch.l < inkBlackL || sourceOklch.l > paperWhiteL;
  const mappedPrintC = compressChromaSoftKnee(sourceOklch.c, printChromaCeiling, kneeRatio);

  const rawProofLin = oklchToUnboundedLinearSrgb(printTargetL, mappedPrintC, sourceOklch.hRad);
  const srgbLinear: readonly [number, number, number] = [clamp01(rawProofLin[0]), clamp01(rawProofLin[1]), clamp01(rawProofLin[2])];
  const srgbEncoded: readonly [number, number, number] = [
    linearToSrgbTransfer(srgbLinear[0]), linearToSrgbTransfer(srgbLinear[1]), linearToSrgbTransfer(srgbLinear[2]),
  ];
  const cmyk = convertSrgbEncodedToIsoCoatedCmyk(srgbEncoded[0], srgbEncoded[1], srgbEncoded[2], gcrStrength, maxTacPercent);
  const actualOklch = unboundedLinearSrgbToOklch(srgbLinear[0], srgbLinear[1], srgbLinear[2]);
  const hueDriftDeg = sourceOklch.c > 0.015 && actualOklch.c > 0.015 ? angularDiffDeg(sourceOklch.hRad, actualOklch.hRad) : 0;

  return {
    sourceXyz, sourceOklch, mappedOklch: actualOklch, srgbLinear, srgbEncoded,
    cmyk, wasOutOfGamut: wasPrintOut, deltaEOklab: oklabDistance(sourceOklch, actualOklch), hueDriftDeg,
  };
}

/** Display-P3 RGBA8 이미지 버퍼 전체를 목표 색역으로 지각적 소프트-니 매핑한다. */
export function mapDisplayP3BufferGamut(
  p3Rgba8: Uint8Array | Uint8ClampedArray, options: GamutMappingOptions,
): BufferGamutMapReport {
  const pixelCount = Math.floor(p3Rgba8.length / 4);
  const srgbRgba8 = new Uint8ClampedArray(pixelCount * 4);
  const cmykFloat32 = options.targetGamut === "iso-coated-cmyk" ? new Float32Array(pixelCount * 4) : null;

  let outOfGamutPixelCount = 0; let maxDeltaE = 0; let sumDeltaE = 0; let maxHueDriftDeg = 0; let maxObservedTacPercent = 0;

  for (let i = 0; i < pixelCount; i += 1) {
    const o = i * 4;
    const mapped = mapDisplayP3ColorGamut(
      (p3Rgba8[o] ?? 0) / 255, (p3Rgba8[o + 1] ?? 0) / 255, (p3Rgba8[o + 2] ?? 0) / 255, options,
    );
    if (mapped.wasOutOfGamut) outOfGamutPixelCount += 1;
    if (mapped.deltaEOklab > maxDeltaE) maxDeltaE = mapped.deltaEOklab;
    sumDeltaE += mapped.deltaEOklab;
    if (mapped.hueDriftDeg > maxHueDriftDeg) maxHueDriftDeg = mapped.hueDriftDeg;

    srgbRgba8[o] = Math.round(mapped.srgbEncoded[0] * 255);
    srgbRgba8[o + 1] = Math.round(mapped.srgbEncoded[1] * 255);
    srgbRgba8[o + 2] = Math.round(mapped.srgbEncoded[2] * 255);
    srgbRgba8[o + 3] = p3Rgba8[o + 3] ?? 255;

    if (cmykFloat32 !== null && mapped.cmyk !== null) {
      cmykFloat32[o] = mapped.cmyk.c;
      cmykFloat32[o + 1] = mapped.cmyk.m;
      cmykFloat32[o + 2] = mapped.cmyk.y;
      cmykFloat32[o + 3] = mapped.cmyk.k;
      if (mapped.cmyk.tacPercent > maxObservedTacPercent) maxObservedTacPercent = mapped.cmyk.tacPercent;
    }
  }

  return {
    targetGamut: options.targetGamut, pixelCount, outOfGamutPixelCount,
    outOfGamutRatio: pixelCount > 0 ? outOfGamutPixelCount / pixelCount : 0,
    maxDeltaEOklab: maxDeltaE, meanDeltaEOklab: pixelCount > 0 ? sumDeltaE / pixelCount : 0,
    maxHueDriftDeg, maxObservedTacPercent, srgbRgba8, cmykFloat32, serverCostKrw: 0,
  };
}
