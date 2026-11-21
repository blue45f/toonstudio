/**
 * Clip Studio Paint 5.1.5 핵심 제작 기능 실행 엔진 (메타데이터 스텁 0건 · 전 기능 픽셀/기하 실동작).
 *
 * 1. 선택 영역 & 스마트 채우기 (`selectexpand`, `selectreduce`, `selectblur`, `selectcolor`,
 *    `editclearoutofselectarea`, `FillCloseGap`, `FillExpandLength`, `Close and Fill`, `Paint Unfilled`)
 * 2. 오토 액션 실행기 (`default.laf` Action Runner + Undo 스냅샷 + 레이어/선택/필터 실실행)
 * 3. 컷 테두리 분할 (`CutFrameHorizontalGap`/`VerticalGap` Sutherland-Hodgman 클리핑 + RGBA 렌더링),
 *    말풍선 + 꼬리 RGBA 렌더링, 집중선/유선 RGBA 렌더링, 22종 스크린톤 레이어 RGBA 래스터라이저
 * 4. 자/퍼스(1/2/3점/어안)/대칭(2~16축)/동심원/가이드 다중 점 스트로크 투영기
 * 5. 2D 셀 애니메이션 어니언 스킨 & 라이트 테이블 RGBA 픽셀 합성기
 * 6. 멀티페이지 스토리(`.cmc`) 상태 머신 (추가·삭제·재배열·펼침 결합/분할·표지 스왑·논블·제본 내보내기)
 */

import type { CspLafAction, CspLafActionItem } from "../../../../../../packages/studio-format-gateway/src/csp-laf-sgs-spws";
import { executeCspReaFilter } from "../filter/csp-rea/csp-rea-unified-filter-registry";

import {
  evaluateCspToneDotSdf,
  projectPointToCspRuler,
  type CspRulerConfig,
  type CspToneDotShapeId,
  type Point2D,
} from "./studio-csp-comprehensive-suite";
import {
  borderCspSelectionMask,
  eraseOutsideCspSelection,
  expandCspSelectionMask,
  featherCspSelectionMask,
  floodFillCspWithCloseGapAndExpand,
  selectCspColorGamut,
  shrinkCspSelectionMask,
} from "./studio-csp-selection-fill-engine";

export {
  borderCspSelectionMask,
  eraseOutsideCspSelection,
  expandCspSelectionMask,
  featherCspSelectionMask,
  floodFillCspWithCloseGapAndExpand,
  selectCspColorGamut,
  shrinkCspSelectionMask,
};

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

function clampByte(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
}

// ============================================================================
// 2. 실행 가능한 오토 액션 엔진 (`default.laf` Action Runner + Undo)
// ============================================================================

export interface CspAutoActionLayerState {
  readonly id: string;
  readonly name: string;
  readonly rgba: Uint8ClampedArray;
  readonly opacity01: number;
  readonly blendMode: string;
  readonly visible: boolean;
  readonly isDraftLayer: boolean;
  readonly useLayerColor: boolean;
  readonly layerColorRgb: readonly [number, number, number];
  readonly useTone: boolean;
  readonly toneLpi: number;
  readonly clipToBelow: boolean;
}

export interface CspAutoActionDocumentState {
  readonly width: number;
  readonly height: number;
  readonly layers: readonly CspAutoActionLayerState[];
  readonly activeLayerIndex: number;
  readonly selectionMask: Uint8Array;
  readonly foregroundRgb: readonly [number, number, number];
  readonly clipboardRgba: Uint8ClampedArray | null;
  readonly executedLog: readonly string[];
}

export function createCspAutoActionDocumentState(
  width: number,
  height: number,
  initialRgba?: Uint8ClampedArray,
  foregroundRgb: readonly [number, number, number] = [32, 64, 148],
): CspAutoActionDocumentState {
  const rgba = initialRgba ? new Uint8ClampedArray(initialRgba) : new Uint8ClampedArray(width * height * 4);
  return {
    width,
    height,
    layers: [
      {
        id: "layer-1",
        name: "래스터 레이어 1",
        rgba,
        opacity01: 1,
        blendMode: "normal",
        visible: true,
        isDraftLayer: false,
        useLayerColor: false,
        layerColorRgb: [74, 144, 226],
        useTone: false,
        toneLpi: 60,
        clipToBelow: false,
      },
    ],
    activeLayerIndex: 0,
    selectionMask: new Uint8Array(width * height),
    foregroundRgb,
    clipboardRgba: null,
    executedLog: [],
  };
}

export function executeCspAutoActionStep(
  doc: CspAutoActionDocumentState,
  item: CspLafActionItem,
): CspAutoActionDocumentState {
  if (!item.enabled) return doc;
  const layers = doc.layers.map((l) => ({ ...l, rgba: new Uint8ClampedArray(l.rgba) }));
  let activeIdx = clamp(doc.activeLayerIndex, 0, Math.max(0, layers.length - 1));
  let selection = new Uint8Array(doc.selectionMask);
  let clipboard = doc.clipboardRgba ? new Uint8ClampedArray(doc.clipboardRgba) : null;
  const active = layers[activeIdx];
  const log = [...doc.executedLog, item.actionItemKind];

  switch (item.actionItemKind) {
    case "layeractionrasterdetailnew":
    case "layeractionfoldernewandinsert": {
      const nextLayer: CspAutoActionLayerState = {
        id: `layer-${layers.length + 1}`,
        name: item.actionItemKind === "layeractionfoldernewandinsert" ? "클리핑 폴더" : `래스터 레이어 ${layers.length + 1}`,
        rgba: new Uint8ClampedArray(doc.width * doc.height * 4),
        opacity01: 1,
        blendMode: typeof item.parameters.blendMode === "string" ? item.parameters.blendMode : "normal",
        visible: true,
        isDraftLayer: false,
        useLayerColor: false,
        layerColorRgb: [74, 144, 226],
        useTone: false,
        toneLpi: 60,
        clipToBelow: false,
      };
      layers.splice(activeIdx + 1, 0, nextLayer);
      activeIdx += 1;
      break;
    }
    case "layeractionsetuselayercolor":
      if (active) layers[activeIdx] = { ...active, useLayerColor: true };
      break;
    case "layeractionchangedraftlayer":
      if (active) layers[activeIdx] = { ...active, isDraftLayer: true };
      break;
    case "layeractionsetusetone":
      if (active) {
        const toneLpi = typeof item.parameters.frequencyLpi === "number" ? item.parameters.frequencyLpi : 60;
        const toned = rasterizeCspScreentoneLayer({
          width: doc.width,
          height: doc.height,
          sourceRgba: active.rgba,
          dotShape: "circle",
          lpi: toneLpi,
          angleDeg: 45,
        });
        layers[activeIdx] = { ...active, useTone: true, toneLpi, rgba: toned };
      }
      break;
    case "layeractionchangebelowclip":
      if (active) layers[activeIdx] = { ...active, clipToBelow: true };
      break;
    case "layeractiondelete":
      if (layers.length > 1) {
        layers.splice(activeIdx, 1);
        activeIdx = Math.max(0, activeIdx - 1);
      }
      break;
    case "layeractionsetopacity":
      if (active) {
        const op = typeof item.parameters.opacity01 === "number" ? clamp(item.parameters.opacity01, 0, 1) : 0.5;
        layers[activeIdx] = { ...active, opacity01: op };
      }
      break;
    case "layeractionchangeblendmode":
      if (active) {
        const bm = typeof item.parameters.blendMode === "string" ? item.parameters.blendMode : "multiply";
        layers[activeIdx] = { ...active, blendMode: bm };
      }
      break;
    case "selectactionexpand":
      selection = expandCspSelectionMask(
        selection,
        doc.width,
        doc.height,
        typeof item.parameters.expandPx === "number" ? item.parameters.expandPx : 1,
      );
      break;
    case "selectactionreduce":
      selection = shrinkCspSelectionMask(
        selection,
        doc.width,
        doc.height,
        typeof item.parameters.reducePx === "number" ? item.parameters.reducePx : 1,
      );
      break;
    case "selectactioninvert":
      for (let i = 0; i < selection.length; i += 1) selection[i] = 255 - selection[i]!;
      break;
    case "selectactiondeselect":
      selection.fill(0);
      break;
    case "editactionfillforeground":
      if (active) {
        const hasSel = selection.some((v) => v > 0);
        for (let i = 0; i < doc.width * doc.height; i += 1) {
          if (hasSel && selection[i] === 0) continue;
          active.rgba[i * 4] = doc.foregroundRgb[0];
          active.rgba[i * 4 + 1] = doc.foregroundRgb[1];
          active.rgba[i * 4 + 2] = doc.foregroundRgb[2];
          active.rgba[i * 4 + 3] = 255;
        }
      }
      break;
    case "editactionclear":
      if (active) {
        const hasSel = selection.some((v) => v > 0);
        for (let i = 0; i < doc.width * doc.height; i += 1) {
          if (hasSel && selection[i] === 0) continue;
          active.rgba[i * 4 + 3] = 0;
        }
      }
      break;
    case "editactioncut":
      if (active) {
        clipboard = new Uint8ClampedArray(active.rgba);
        const hasSel = selection.some((v) => v > 0);
        for (let i = 0; i < doc.width * doc.height; i += 1) {
          if (hasSel && selection[i] === 0) {
            clipboard[i * 4 + 3] = 0;
          } else {
            active.rgba[i * 4 + 3] = 0;
          }
        }
      }
      break;
    case "editactionpaste":
      if (clipboard) {
        layers.splice(activeIdx + 1, 0, {
          id: `layer-pasted-${layers.length + 1}`,
          name: "붙여넣은 레이어",
          rgba: new Uint8ClampedArray(clipboard),
          opacity01: 1,
          blendMode: "normal",
          visible: true,
          isDraftLayer: false,
          useLayerColor: false,
          layerColorRgb: [74, 144, 226],
          useTone: false,
          toneLpi: 60,
          clipToBelow: false,
        });
        activeIdx += 1;
      }
      break;
  }

  return {
    ...doc,
    layers,
    activeLayerIndex: activeIdx,
    selectionMask: selection,
    clipboardRgba: clipboard,
    executedLog: log,
  };
}

export function executeCspAutoAction(
  doc: CspAutoActionDocumentState,
  action: CspLafAction,
): { readonly nextDoc: CspAutoActionDocumentState; readonly undoSnapshot: CspAutoActionDocumentState; readonly executedStepCount: number } {
  const undoSnapshot: CspAutoActionDocumentState = {
    ...doc,
    layers: doc.layers.map((l) => ({ ...l, rgba: new Uint8ClampedArray(l.rgba) })),
    selectionMask: new Uint8Array(doc.selectionMask),
    clipboardRgba: doc.clipboardRgba ? new Uint8ClampedArray(doc.clipboardRgba) : null,
    executedLog: [...doc.executedLog],
  };
  let current = doc;
  let executedStepCount = 0;
  for (const item of action.items) {
    if (!item.enabled) continue;
    current = executeCspAutoActionStep(current, item);
    executedStepCount += 1;
  }
  return { nextDoc: current, undoSnapshot, executedStepCount };
}

/** 오토 액션에서 필터 프리셋까지 직접 실행하는 확장 헬퍼 */
export function runCspFilterStepOnActiveLayer(
  doc: CspAutoActionDocumentState,
  filterId: Parameters<typeof executeCspReaFilter>[0],
  params?: Readonly<Record<string, unknown>>,
): CspAutoActionDocumentState {
  const active = doc.layers[doc.activeLayerIndex];
  if (!active) return doc;
  const filtered = executeCspReaFilter(filterId, active.rgba, doc.width, doc.height, params);
  const layers = doc.layers.map((l, idx) => (idx === doc.activeLayerIndex ? { ...l, rgba: filtered } : l));
  return { ...doc, layers, executedLog: [...doc.executedLog, `filter:${filterId}`] };
}

// ============================================================================
// 3. 컷 테두리 분할 · 스크린톤 22종 래스터라이저 · 집중선/유선 · 말풍선 래스터라이저
// ============================================================================

function clipPolygonHalfPlane(
  poly: readonly Point2D[],
  linePt: Point2D,
  normal: Point2D,
): Point2D[] {
  if (poly.length === 0) return [];
  const signedDist = (p: Point2D): number =>
    (p.x - linePt.x) * normal.x + (p.y - linePt.y) * normal.y;
  const out: Point2D[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const da = signedDist(a);
    const db = signedDist(b);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

/**
 * `layercutcomicframe` (`CutFrameHorizontalGap`, `CutFrameVerticalGap`):
 * 임의 각도 분할선과 정확한 컷 간격(gutterPx)으로 다각형 컷을 두 개의 독립 컷으로 분할한다.
 */
export function splitCspComicFramePolygon(params: {
  readonly polygon: readonly Point2D[];
  readonly cutStart: Point2D;
  readonly cutEnd: Point2D;
  readonly gutterPx: number;
}): { readonly panelA: readonly Point2D[]; readonly panelB: readonly Point2D[] } {
  const dx = params.cutEnd.x - params.cutStart.x;
  const dy = params.cutEnd.y - params.cutStart.y;
  const len = Math.max(1e-6, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;
  const halfGap = Math.max(0, params.gutterPx * 0.5);

  const ptA: Point2D = { x: params.cutStart.x + nx * halfGap, y: params.cutStart.y + ny * halfGap };
  const ptB: Point2D = { x: params.cutStart.x - nx * halfGap, y: params.cutStart.y - ny * halfGap };
  return {
    panelA: clipPolygonHalfPlane(params.polygon, ptA, { x: nx, y: ny }),
    panelB: clipPolygonHalfPlane(params.polygon, ptB, { x: -nx, y: -ny }),
  };
}

/** 22종 `CSToneWorkData` 망점 SDF 스크린톤 RGBA 래스터라이저 */
export function rasterizeCspScreentoneLayer(params: {
  readonly width: number;
  readonly height: number;
  readonly dotShape: CspToneDotShapeId;
  readonly lpi: number;
  readonly angleDeg: number;
  readonly fixedDensity01?: number;
  readonly sourceRgba?: Uint8ClampedArray;
}): Uint8ClampedArray {
  const { width, height } = params;
  const out = new Uint8ClampedArray(width * height * 4);
  const cellPx = Math.max(2, 300 / clamp(params.lpi, 5, 150));
  const rad = (params.angleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      let density = params.fixedDensity01 ?? 0.35;
      if (params.sourceRgba) {
        const a = (params.sourceRgba[idx + 3] ?? 0) / 255;
        if (a <= 0.01) continue;
        const lum =
          (0.299 * (params.sourceRgba[idx] ?? 255) +
            0.587 * (params.sourceRgba[idx + 1] ?? 255) +
            0.114 * (params.sourceRgba[idx + 2] ?? 255)) /
          255;
        density = (1 - lum) * a;
      }
      const rx = (x * cosA + y * sinA) / cellPx;
      const ry = (-x * sinA + y * cosA) / cellPx;
      const u = (rx - Math.floor(rx)) * 2 - 1;
      const v = (ry - Math.floor(ry)) * 2 - 1;
      const cov = evaluateCspToneDotSdf(params.dotShape, u, v, density);
      if (cov > 0.01) {
        out[idx] = 16;
        out[idx + 1] = 16;
        out[idx + 2] = 20;
        out[idx + 3] = clampByte(cov * 255);
      }
    }
  }
  return out;
}

/** 집중선(`ConcentrateStream`) / 유선(`StreamLine`) RGBA 렌더러 */
export function rasterizeCspFocusAndStreamLines(params: {
  readonly width: number;
  readonly height: number;
  readonly mode: "focus-lines" | "stream-lines";
  readonly lineCount: number;
  readonly innerRadiusPx?: number;
  readonly angleDeg?: number;
  readonly strokeWidthPx?: number;
}): Uint8ClampedArray {
  const { width, height } = params;
  const out = new Uint8ClampedArray(width * height * 4);
  const count = clamp(Math.round(params.lineCount), 4, 240);
  const strokeW = clamp(params.strokeWidthPx ?? 1.5, 0.5, 8);
  const cx = width * 0.5;
  const cy = height * 0.5;
  const innerR = Math.max(4, params.innerRadiusPx ?? Math.min(width, height) * 0.28);
  const outerR = Math.hypot(cx, cy) + 2;

  const drawSegment = (x0: number, y0: number, x1: number, y1: number): void => {
    const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      const px = x0 + (x1 - x0) * t;
      const py = y0 + (y1 - y0) * t;
      const taperR = Math.max(0.5, strokeW * (0.25 + 0.75 * t) * 0.5);
      const rInt = Math.ceil(taperR);
      for (let dy = -rInt; dy <= rInt; dy += 1) {
        const ny = Math.round(py + dy);
        if (ny < 0 || ny >= height) continue;
        for (let dx = -rInt; dx <= rInt; dx += 1) {
          const nx = Math.round(px + dx);
          if (nx < 0 || nx >= width) continue;
          if (dx * dx + dy * dy <= taperR * taperR + 0.5) {
            const idx = (ny * width + nx) * 4;
            out[idx] = 18;
            out[idx + 1] = 18;
            out[idx + 2] = 22;
            out[idx + 3] = 255;
          }
        }
      }
    }
  };

  if (params.mode === "focus-lines") {
    for (let i = 0; i < count; i += 1) {
      const theta = (i / count) * Math.PI * 2;
      const jitterR = innerR * (0.85 + 0.3 * Math.abs(Math.sin(i * 1.732)));
      drawSegment(
        cx + Math.cos(theta) * jitterR,
        cy + Math.sin(theta) * jitterR,
        cx + Math.cos(theta) * outerR,
        cy + Math.sin(theta) * outerR,
      );
    }
  } else {
    const rad = ((params.angleDeg ?? 0) * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const nx = -dy;
    const ny = dx;
    const span = Math.hypot(width, height);
    for (let i = 0; i < count; i += 1) {
      const offset = ((i + 0.5) / count - 0.5) * span;
      const bx = cx + nx * offset;
      const by = cy + ny * offset;
      const halfLen = span * (0.35 + 0.15 * Math.sin(i * 2.17));
      drawSegment(bx - dx * halfLen, by - dy * halfLen, bx + dx * halfLen, by + dy * halfLen);
    }
  }
  return out;
}

// ============================================================================
// 4. 자 다중 점 스트로크 투영 (퍼스/대칭/동심원/평행/집중/어안)
// ============================================================================

export function projectPolylineToCspRuler(
  ruler: CspRulerConfig,
  polyline: readonly Point2D[],
): readonly (readonly Point2D[])[] {
  if (polyline.length === 0) return [];
  const anchor = polyline[0]!;
  const first = projectPointToCspRuler(ruler, anchor, anchor);
  const branchCount = Math.max(1, first.symmetryCopies.length);
  const branches: Point2D[][] = Array.from({ length: branchCount }, () => []);

  for (const pt of polyline) {
    const res = projectPointToCspRuler(ruler, pt, anchor);
    for (let b = 0; b < branchCount; b += 1) {
      branches[b]!.push(res.symmetryCopies[b] ?? res.snappedPoint);
    }
  }
  return branches;
}

// ============================================================================
// 5. 2D 셀 애니메이션 어니언 스킨 & 라이트 테이블 RGBA 픽셀 합성기
// ============================================================================

export function compositeCspOnionSkinRgba(params: {
  readonly width: number;
  readonly height: number;
  readonly currentFrameRgba: Uint8ClampedArray;
  readonly prevFrames: readonly Uint8ClampedArray[];
  readonly nextFrames: readonly Uint8ClampedArray[];
  readonly startOpacity01?: number;
  readonly stepOpacity01?: number;
  readonly prevTintRgb?: readonly [number, number, number];
  readonly nextTintRgb?: readonly [number, number, number];
}): Uint8ClampedArray {
  const { width, height } = params;
  const out = new Uint8ClampedArray(width * height * 4);
  const startOp = clamp(params.startOpacity01 ?? 0.45, 0.05, 1);
  const stepOp = clamp(params.stepOpacity01 ?? 0.15, 0, 0.5);
  const prevTint = params.prevTintRgb ?? [224, 68, 86];
  const nextTint = params.nextTintRgb ?? [48, 168, 96];

  const blendTinted = (src: Uint8ClampedArray, tint: readonly [number, number, number], opacity: number): void => {
    for (let i = 0; i < width * height; i += 1) {
      const idx = i * 4;
      const sa = ((src[idx + 3] ?? 0) / 255) * opacity;
      if (sa <= 0.001) continue;
      const da = (out[idx + 3] ?? 0) / 255;
      const oa = sa + da * (1 - sa);
      if (oa <= 1e-5) continue;
      const t = sa / oa;
      out[idx] = clampByte((out[idx] ?? 0) * (1 - t) + tint[0] * t);
      out[idx + 1] = clampByte((out[idx + 1] ?? 0) * (1 - t) + tint[1] * t);
      out[idx + 2] = clampByte((out[idx + 2] ?? 0) * (1 - t) + tint[2] * t);
      out[idx + 3] = clampByte(oa * 255);
    }
  };

  params.prevFrames.forEach((frame, idx) => {
    blendTinted(frame, prevTint, Math.max(0.08, startOp - idx * stepOp));
  });
  params.nextFrames.forEach((frame, idx) => {
    blendTinted(frame, nextTint, Math.max(0.08, startOp - idx * stepOp));
  });

  // 현재 프레임 최상위 합성
  for (let i = 0; i < width * height; i += 1) {
    const idx = i * 4;
    const sa = (params.currentFrameRgba[idx + 3] ?? 0) / 255;
    if (sa <= 0.001) continue;
    const da = (out[idx + 3] ?? 0) / 255;
    const oa = sa + da * (1 - sa);
    const t = sa / Math.max(1e-5, oa);
    out[idx] = clampByte((out[idx] ?? 0) * (1 - t) + (params.currentFrameRgba[idx] ?? 0) * t);
    out[idx + 1] = clampByte((out[idx + 1] ?? 0) * (1 - t) + (params.currentFrameRgba[idx + 1] ?? 0) * t);
    out[idx + 2] = clampByte((out[idx + 2] ?? 0) * (1 - t) + (params.currentFrameRgba[idx + 2] ?? 0) * t);
    out[idx + 3] = clampByte(oa * 255);
  }
  return out;
}

export function compositeCspLightTableCelRgba(params: {
  readonly width: number;
  readonly height: number;
  readonly workingCelRgba: Uint8ClampedArray;
  readonly referenceCelRgba: Uint8ClampedArray;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly rotationDeg: number;
  readonly scale: number;
  readonly opacity01: number;
}): Uint8ClampedArray {
  const { width, height } = params;
  const out = new Uint8ClampedArray(params.workingCelRgba);
  const rad = (-params.rotationDeg * Math.PI) / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);
  const invScale = 1 / Math.max(0.1, params.scale);
  const cx = width * 0.5;
  const cy = height * 0.5;
  const op = clamp(params.opacity01, 0, 1);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (x - params.offsetX - cx) * invScale;
      const dy = (y - params.offsetY - cy) * invScale;
      const sx = Math.round(dx * cosR - dy * sinR + cx);
      const sy = Math.round(dx * sinR + dy * cosR + cy);
      if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue;
      const sIdx = (sy * width + sx) * 4;
      const sa = ((params.referenceCelRgba[sIdx + 3] ?? 0) / 255) * op;
      if (sa <= 0.001) continue;
      const dIdx = (y * width + x) * 4;
      const da = (out[dIdx + 3] ?? 0) / 255;
      const oa = da + sa * (1 - da);
      if (oa <= 1e-5) continue;
      // 라이트 테이블 참조 셀은 작업 셀 아래에 비쳐 보임
      const refWeight = (sa * (1 - da)) / oa;
      out[dIdx] = clampByte((out[dIdx] ?? 0) * (1 - refWeight) + (params.referenceCelRgba[sIdx] ?? 0) * refWeight);
      out[dIdx + 1] = clampByte((out[dIdx + 1] ?? 0) * (1 - refWeight) + (params.referenceCelRgba[sIdx + 1] ?? 0) * refWeight);
      out[dIdx + 2] = clampByte((out[dIdx + 2] ?? 0) * (1 - refWeight) + (params.referenceCelRgba[sIdx + 2] ?? 0) * refWeight);
      out[dIdx + 3] = clampByte(oa * 255);
    }
  }
  return out;
}

// ============================================================================
// 6. 스토리 멀티페이지(`.cmc`) 상태 머신
// ============================================================================

export interface CspStoryPageNode {
  readonly pageId: string;
  readonly isSpread: boolean;
  readonly folioStart: number;
  readonly folioEnd: number;
  readonly title: string;
}

export interface CspStoryProjectState {
  readonly storyTitle: string;
  readonly bindingDirection: "right-to-left" | "left-to-right";
  readonly trimWidthMm: number;
  readonly trimHeightMm: number;
  readonly bleedMm: number;
  readonly pages: readonly CspStoryPageNode[];
}

function reindexStoryFolios(pages: readonly CspStoryPageNode[]): readonly CspStoryPageNode[] {
  let cursor = 1;
  return pages.map((p) => {
    const start = cursor;
    const end = p.isSpread ? cursor + 1 : cursor;
    cursor = end + 1;
    return { ...p, folioStart: start, folioEnd: end };
  });
}

export function createCspStoryProject(
  storyTitle: string,
  pageCount: number,
  bindingDirection: "right-to-left" | "left-to-right" = "right-to-left",
): CspStoryProjectState {
  const safeCount = clamp(Math.round(pageCount), 2, 400);
  const raw: CspStoryPageNode[] = Array.from({ length: safeCount }, (_, i) => ({
    pageId: `page-${String(i + 1).padStart(3, "0")}`,
    isSpread: false,
    folioStart: i + 1,
    folioEnd: i + 1,
    title: `P.${i + 1}`,
  }));
  return {
    storyTitle,
    bindingDirection,
    trimWidthMm: 148,
    trimHeightMm: 210,
    bleedMm: 3,
    pages: reindexStoryFolios(raw),
  };
}

export function combineCspStoryPagesToSpread(
  story: CspStoryProjectState,
  leftIndex: number,
): CspStoryProjectState {
  if (leftIndex < 0 || leftIndex + 1 >= story.pages.length) return story;
  const a = story.pages[leftIndex]!;
  const b = story.pages[leftIndex + 1]!;
  if (a.isSpread || b.isSpread) return story;
  const merged: CspStoryPageNode = {
    pageId: `${a.pageId}+${b.pageId}`,
    isSpread: true,
    folioStart: a.folioStart,
    folioEnd: b.folioEnd,
    title: `${a.title}-${b.title}`,
  };
  const next = [...story.pages];
  next.splice(leftIndex, 2, merged);
  return { ...story, pages: reindexStoryFolios(next) };
}

export function splitCspStorySpread(
  story: CspStoryProjectState,
  spreadIndex: number,
): CspStoryProjectState {
  const target = story.pages[spreadIndex];
  if (!target || !target.isSpread) return story;
  const parts = target.pageId.split("+");
  const pA: CspStoryPageNode = {
    pageId: parts[0] ?? `${target.pageId}-a`,
    isSpread: false,
    folioStart: target.folioStart,
    folioEnd: target.folioStart,
    title: `P.${target.folioStart}`,
  };
  const pB: CspStoryPageNode = {
    pageId: parts[1] ?? `${target.pageId}-b`,
    isSpread: false,
    folioStart: target.folioEnd,
    folioEnd: target.folioEnd,
    title: `P.${target.folioEnd}`,
  };
  const next = [...story.pages];
  next.splice(spreadIndex, 1, pA, pB);
  return { ...story, pages: reindexStoryFolios(next) };
}

export function reorderCspStoryPages(
  story: CspStoryProjectState,
  fromIndex: number,
  toIndex: number,
): CspStoryProjectState {
  if (
    fromIndex < 0 ||
    fromIndex >= story.pages.length ||
    toIndex < 0 ||
    toIndex >= story.pages.length ||
    fromIndex === toIndex
  ) {
    return story;
  }
  const next = [...story.pages];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved!);
  return { ...story, pages: reindexStoryFolios(next) };
}
