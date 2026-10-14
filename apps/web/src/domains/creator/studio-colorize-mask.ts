/**
 * Studio Colorize Mask — Krita Colorize Mask식 "힌트 채색 마스크" 순수 코어 + 배선.
 *
 * 개념: 선화(image 요소) 위에 "키 스트로크(힌트)"를 몇 획 그으면, 선으로 나뉜 영역별로
 * 힌트 색이 전파돼 채색 결과가 만들어지는 비파괴 마스크다. 마스크 상태(힌트+파라미터)는
 * 선화 요소의 메타데이터(el.colorizeMask)에만 살고, 채색 결과는 항상 별도의 투명 페인트
 * 버퍼로 새로 굽는다 — el.src(선화 원본)는 읽기만 할 뿐 절대 쓰지 않는다. 그래서 마스크를
 * 지우거나(el.colorizeMask 삭제) 힌트를 고쳐 다시 구우면 원본은 무손상이고, 결과는
 * 리비전 비교(isColorizeMaskStale)로 "다시 구워야 함"을 판정할 수 있다.
 *
 * 전파 실행은 새로 만들지 않는다:
 * - 영역 분할(영역 맵)은 studio-auto-color-hints.ts의 연결 요소 라벨링
 *   (planStudioAutoColorHints, seeds 없이 호출하면 labels/components만 얻는다)을 재사용한다.
 *   이는 studio-auto-color-hints-advanced-fill.ts가 "라벨이 곧 권위 마스크"로 삼는 것과
 *   동일한 규약이다.
 * - 틈 메우기(gapCloseHintPx)는 경계 잉크를 반경 ceil(gap/2)+edgeDetectionPx 만큼
 *   팽창(dilation)한 "봉인본" 위에서 라벨링하는 방식으로 근사한다 — studio-smart-gap-fill.ts가
 *   단일 시드 플러드에서 "가상 밀폐 후 칠 구역 추출"을 하는 것과 같은 발상이며, 팽창은
 *   분석용 복사본에만 적용되므로 원본 선화는 굵어지지 않는다.
 * - 채색 타깃은 studio-auto-color-hints-advanced-fill.ts의
 *   createStudioAutoColorBlankPaintTarget(투명 블랭크)를 재사용한다.
 *
 * 힌트·파라미터·할당 계획 모델은 drafts/colorize-mask-model.ts(tool-strengths, 검증 완료)를
 * 그대로 승격한 것이고, 이 파일은 거기에 실제 라벨 맵 배선·래스터화·굽기를 붙인 것이다.
 * DOM 의존 0 — 이미지 로드/캔버스 생성은 호출부(StudioPage)가 담당한다.
 *
 * Krita 실측 파라미터 (공개 매뉴얼 기준):
 * - Edge detection(px): 큰 검정 면적이 있는 선화에서 가장 얇은 선 굵이로 설정
 * - Gap close hint(px): 닫을 틈의 크기. 너무 크면 다른 오류가 늘어난다
 * - Clean up(0~100%): 선을 넘은 지저분한 힌트 획 정리 강도
 * - Limit to layer bounds: 힌트+선화 결합 경계로 계산 범위 제한 (만화 페이지에서 속도)
 */

import type { AdvancedFillImageDataLike, AdvancedFillRgba } from "./studio-advanced-fill";
import { planStudioAutoColorHints } from "./studio-auto-color-hints";
import { createStudioAutoColorBlankPaintTarget } from "./studio-auto-color-hints-advanced-fill";

// ---------------------------------------------------------------------------
// (A) 힌트·파라미터 모델 (drafts/colorize-mask-model.ts 승격)
// ---------------------------------------------------------------------------

export interface ColorizeHintStroke {
  readonly id: string;
  /** "#rrggbb". transparent=true면 이 색은 "투명"으로 해석된다 (Krita의 투명 마커). */
  readonly colorHex: string;
  readonly transparent?: boolean;
  /** 캔버스 좌표 폴리라인. */
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly radiusPx: number;
}

export interface ColorizeMaskParams {
  /** 0..64px, 기본 8. */
  readonly gapCloseHintPx: number;
  /** 0..8px, 기본 0 (끄기). */
  readonly edgeDetectionPx: number;
  /** 0..100%, 기본 30. */
  readonly cleanupPercent: number;
  readonly limitToLayerBounds: boolean;
}

export const COLORIZE_MASK_PARAM_LIMITS = {
  gapCloseHintPx: { min: 0, max: 64 },
  edgeDetectionPx: { min: 0, max: 8 },
  cleanupPercent: { min: 0, max: 100 },
} as const;

export const COLORIZE_MASK_DEFAULT_PARAMS: ColorizeMaskParams = {
  gapCloseHintPx: 8,
  edgeDetectionPx: 0,
  cleanupPercent: 30,
  limitToLayerBounds: true,
};

export function normalizeColorizeParams(
  input: Partial<ColorizeMaskParams>,
): { ok: true; params: ColorizeMaskParams } | { ok: false; reason: string } {
  const merged = { ...COLORIZE_MASK_DEFAULT_PARAMS, ...input };
  for (const key of ["gapCloseHintPx", "edgeDetectionPx", "cleanupPercent"] as const) {
    const value = merged[key];
    const limit = COLORIZE_MASK_PARAM_LIMITS[key];
    if (!Number.isFinite(value) || value < limit.min || value > limit.max) {
      return { ok: false, reason: `${key}는 ${limit.min}..${limit.max} 범위여야 해요.` };
    }
  }
  return { ok: true, params: merged };
}

/** 호스트 영역 분할이 넘기는 영역 요약. hintOverlap은 힌트 색별 겹침 면적(px²). */
export interface ColorizeRegionInput {
  readonly id: string;
  readonly centroid: { readonly x: number; readonly y: number };
  readonly areaPx: number;
  readonly hintOverlap: Readonly<Record<string, number>>;
}

export interface ColorizeAssignment {
  readonly regionId: string;
  /** null = 어떤 힌트도 닿지 않음 (투명으로 남김). */
  readonly colorHex: string | null;
  readonly source: "overlap" | "nearest" | "none";
}

/**
 * 영역→색 할당 계획.
 * 1) 힌트 겹침이 가장 큰 색을 우선한다.
 * 2) 겹침이 전혀 없으면, cleanupPercent가 허용할 때만 가장 가까운 힌트 색으로 채운다
 *    (기본은 none — Krita도 힌트 없는 영역은 건드리지 않는 쪽이 안전하다).
 */
export function planColorizeAssignments(
  regions: readonly ColorizeRegionInput[],
  hints: readonly ColorizeHintStroke[],
  params: ColorizeMaskParams,
): readonly ColorizeAssignment[] {
  const colorByHintId = new Map(hints.map((h) => [h.id, h]));
  const hintCentroids = hints.map((h) => {
    const pts = h.points;
    const mid = pts[Math.floor(pts.length / 2)] ?? { x: 0, y: 0 };
    return { hint: h, x: mid.x, y: mid.y };
  });
  return regions.map((region) => {
    let bestHintId: string | null = null;
    let bestArea = 0;
    for (const [hintId, area] of Object.entries(region.hintOverlap)) {
      if (area > bestArea) {
        bestArea = area;
        bestHintId = hintId;
      }
    }
    if (bestHintId) {
      const hint = colorByHintId.get(bestHintId);
      if (hint) {
        return {
          regionId: region.id,
          colorHex: hint.transparent ? null : hint.colorHex,
          source: "overlap" as const,
        };
      }
    }
    if (params.cleanupPercent >= 60 && hintCentroids.length > 0) {
      let nearest: (typeof hintCentroids)[number] | null = null;
      let nearestDist = Infinity;
      for (const hc of hintCentroids) {
        const dist = (hc.x - region.centroid.x) ** 2 + (hc.y - region.centroid.y) ** 2;
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = hc;
        }
      }
      if (nearest) {
        return {
          regionId: region.id,
          colorHex: nearest.hint.transparent ? null : nearest.hint.colorHex,
          source: "nearest" as const,
        };
      }
    }
    return { regionId: region.id, colorHex: null, source: "none" as const };
  });
}

/** 키 스트로크 팔레트: 힌트에서 쓴 색 목록 (Krita의 key strokes 팔레트 대응). */
export function colorizeHintPalette(
  hints: readonly ColorizeHintStroke[],
): readonly { readonly colorHex: string; readonly transparent: boolean; readonly strokeCount: number }[] {
  const map = new Map<string, { colorHex: string; transparent: boolean; strokeCount: number }>();
  for (const hint of hints) {
    const key = `${hint.colorHex}|${hint.transparent ? "t" : "c"}`;
    const entry = map.get(key) ?? {
      colorHex: hint.colorHex,
      transparent: !!hint.transparent,
      strokeCount: 0,
    };
    entry.strokeCount += 1;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.strokeCount - a.strokeCount);
}

// ---------------------------------------------------------------------------
// (B) 마스크 상태 (el.colorizeMask에 저장되는 형태) · 술어 · 불변 갱신
// ---------------------------------------------------------------------------

/** 선화 요소 메타데이터에 붙는 마스크 상태. 힌트/파라미터만 들고, 결과 래스터는 들고 있지 않다. */
export interface StudioColorizeMaskState {
  readonly hints: readonly ColorizeHintStroke[];
  readonly params: ColorizeMaskParams;
  /** 마지막으로 구운 결과의 리비전. 현재 리비전과 다르면 다시 구워야 한다. */
  readonly bakedRevision: string | null;
}

export function createColorizeMaskState(
  hints: readonly ColorizeHintStroke[] = [],
  params: ColorizeMaskParams = COLORIZE_MASK_DEFAULT_PARAMS,
): StudioColorizeMaskState {
  return { hints: hints.slice(), params, bakedRevision: null };
}

/** StudioPage El의 최소 부분집합 — studio-layer-mask.ts의 LayerMaskLike와 동일한 취지. */
export type ColorizeMaskLike = {
  type?: string;
  colorizeMask?: StudioColorizeMaskState;
  colorizeMaskEnabled?: boolean;
};

/** 마스크가 의미를 갖는 레이어인지 — 자체 래스터(src)를 가진 "image" 요소만(canLayerMask와 동일 조건). */
export function canColorizeMask(el: ColorizeMaskLike): boolean {
  return el.type === "image";
}

/** 마스크 상태가 있는지(켜짐/꺼짐·힌트 유무와 무관 — "삭제"와 "비활성화"를 구분하는 존재 술어). */
export function hasColorizeMask(el: ColorizeMaskLike): boolean {
  return !!el.colorizeMask;
}

/** 유효 적용 여부 — image이고, 상태가 있고, 명시적으로 꺼지지 않았고, 힌트가 1개 이상일 때. */
export function shouldApplyColorizeMask(el: ColorizeMaskLike): boolean {
  return (
    canColorizeMask(el) &&
    hasColorizeMask(el) &&
    el.colorizeMaskEnabled !== false &&
    (el.colorizeMask?.hints.length ?? 0) > 0
  );
}

/** 힌트 획 추가/교체(같은 id면 교체, 순서 유지). 원본 상태는 건드리지 않는다. */
export function appendColorizeHintStroke(
  state: StudioColorizeMaskState,
  stroke: ColorizeHintStroke,
): StudioColorizeMaskState {
  const next = state.hints.filter((h) => h.id !== stroke.id);
  next.push(stroke);
  return { ...state, hints: next };
}

export function removeColorizeHintStroke(
  state: StudioColorizeMaskState,
  strokeId: string,
): StudioColorizeMaskState {
  return { ...state, hints: state.hints.filter((h) => h.id !== strokeId) };
}

export function withColorizeMaskParams(
  state: StudioColorizeMaskState,
  input: Partial<ColorizeMaskParams>,
): { ok: true; state: StudioColorizeMaskState } | { ok: false; reason: string } {
  const normalized = normalizeColorizeParams({ ...state.params, ...input });
  if (!normalized.ok) return normalized;
  return { ok: true, state: { ...state, params: normalized.params } };
}

export function markColorizeMaskBaked(
  state: StudioColorizeMaskState,
  revision: string,
): StudioColorizeMaskState {
  return { ...state, bakedRevision: revision };
}

/**
 * 상태 리비전 — 힌트(좌표는 0.1px로 반올림)와 파라미터의 결정적 해시(FNV-1a).
 * 힌트를 한 획이라도 고치거나 파라미터를 바꾸면 값이 달라져 "결과가 낡았다"를 판정할 수 있다.
 */
export function colorizeMaskRevision(state: StudioColorizeMaskState): string {
  const canonical = JSON.stringify({
    p: state.params,
    h: state.hints.map((h) => [
      h.id,
      h.colorHex,
      h.transparent ? 1 : 0,
      Math.round(h.radiusPx * 10),
      h.points.map((pt) => [Math.round(pt.x * 10), Math.round(pt.y * 10)]),
    ]),
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `cm-${(hash >>> 0).toString(36)}`;
}

/** 구운 결과가 현재 힌트·파라미터와 어긋나는지 — 패널의 "다시 채색" 배지 판정. */
export function isColorizeMaskStale(state: StudioColorizeMaskState): boolean {
  return state.bakedRevision !== colorizeMaskRevision(state);
}

// ---------------------------------------------------------------------------
// (C) 색 변환
// ---------------------------------------------------------------------------

const COLORIZE_HEX_PATTERN = /^#([0-9a-fA-F]{6})$/;

/** "#rrggbb" → [r,g,b,255]. 형식이 아니면 null (fail-closed). */
export function colorizeHexToRgba(colorHex: string): AdvancedFillRgba | null {
  const match = COLORIZE_HEX_PATTERN.exec(colorHex);
  if (!match) return null;
  const value = Number.parseInt(match[1]!, 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff, 255];
}

export function isValidColorizeHex(colorHex: string): boolean {
  return COLORIZE_HEX_PATTERN.test(colorHex);
}

// ---------------------------------------------------------------------------
// (D) 영역 맵 배선 — 라벨링 재사용 + 힌트 래스터화 + 겹침 집계
// ---------------------------------------------------------------------------

/** studio-auto-color-hints.ts의 isBoundaryInk와 동일한 잉크 판정(Rec.709 근사, 임계 24). */
function isColorizeBoundaryInk(data: Uint8ClampedArray, position: number): boolean {
  const offset = position * 4;
  const red = data[offset]!;
  const green = data[offset + 1]!;
  const blue = data[offset + 2]!;
  const alpha = data[offset + 3]!;
  const luminance = (54 * red + 183 * green + 19 * blue + 128) >> 8;
  const inkStrength = Math.round(((255 - luminance) * alpha) / 255);
  return inkStrength >= 24;
}

/**
 * 경계 잉크를 반경 radiusPx만큼 팽창시킨 분석용 복사본. 원본은 절대 수정하지 않는다.
 * gap Gpx인 틈은 양쪽에서 ceil(G/2)씩 자라면 닫히고, edgeDetectionPx는 그 위에 더해진다 —
 * 즉 "가장 얇은 선"보다 얇은 끊김까지 경계로 취급하는 Krita edge detection의 근사다.
 */
export function dilateColorizeBoundaryInk(
  image: AdvancedFillImageDataLike,
  radiusPx: number,
): AdvancedFillImageDataLike {
  const { width, height } = image;
  const data = new Uint8ClampedArray(image.data);
  const radius = Math.max(0, Math.floor(radiusPx));
  if (radius === 0) return { width, height, data };
  const ink = new Uint8Array(width * height);
  for (let position = 0; position < ink.length; position += 1) {
    if (isColorizeBoundaryInk(image.data, position)) ink[position] = 1;
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (ink[y * width + x] !== 1) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (dx * dx + dy * dy > radius * radius) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const offset = (ny * width + nx) * 4;
          data[offset] = 0;
          data[offset + 1] = 0;
          data[offset + 2] = 0;
          data[offset + 3] = 255;
        }
      }
    }
  }
  return { width, height, data };
}

/**
 * 힌트 폴리라인을 픽셀 맵으로 래스터화한다. 반환값은 픽셀별 힌트 인덱스(없으면 -1).
 * 나중에 그린 획이 앞선 획을 덮는다(Krita에서 힌트를 덧그어 고치는 행위와 동일).
 * 선분을 1px 간격으로 샘플링해 반경 디스크를 찍는 방식 — studio-layer-mask.ts가 말하는
 * "브라우저 스트로크 렌더링"과 달리 DOM이 없어 유닛 테스트 가능한 순수 근사를 쓴다.
 */
export function rasterizeColorizeHints(
  width: number,
  height: number,
  hints: readonly ColorizeHintStroke[],
): Int32Array {
  const map = new Int32Array(width * height).fill(-1);
  hints.forEach((hint, hintIndex) => {
    const radius = Math.max(0, hint.radiusPx);
    const stamp = (cx: number, cy: number) => {
      const r = Math.ceil(radius);
      for (let dy = -r; dy <= r; dy += 1) {
        const ny = Math.round(cy) + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -r; dx <= r; dx += 1) {
          if (dx * dx + dy * dy > radius * radius) continue;
          const nx = Math.round(cx) + dx;
          if (nx < 0 || nx >= width) continue;
          map[ny * width + nx] = hintIndex;
        }
      }
    };
    const pts = hint.points;
    if (pts.length === 1) {
      stamp(pts[0]!.x, pts[0]!.y);
      return;
    }
    for (let i = 0; i + 1 < pts.length; i += 1) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
      for (let s = 0; s <= steps; s += 1) {
        stamp(a.x + ((b.x - a.x) * s) / steps, a.y + ((b.y - a.y) * s) / steps);
      }
    }
  });
  return map;
}

export interface ColorizeRegionBuildResult {
  readonly regions: readonly ColorizeRegionInput[];
  /** planStudioAutoColorHints의 라벨 맵 (0=경계, 양수=영역). 굽기 단계의 권위 마스크. */
  readonly labels: Uint32Array;
  readonly width: number;
  readonly height: number;
  readonly boundaryPixelCount: number;
}

function regionIdForLabel(label: number): string {
  return `region-${label}`;
}

/**
 * 선화 + 힌트 + 파라미터 → 영역 입력 목록.
 * 1) gap/edge 파라미터로 봉인본을 만들고, 2) 기존 라벨링으로 영역 맵을 얻고,
 * 3) 힌트 래스터와 라벨을 겹쳐 영역별 겹침 면적·무게중심을 집계한다.
 * limitToLayerBounds면 잉크∪힌트 바운딩 박스(+팽창 여유)만 라벨링하고 전체 좌표로 되돌린다.
 */
export function buildColorizeRegionInputs(input: {
  readonly lineArt: AdvancedFillImageDataLike;
  readonly hints: readonly ColorizeHintStroke[];
  readonly params: ColorizeMaskParams;
}): ColorizeRegionBuildResult {
  const { lineArt, hints, params } = input;
  const { width, height } = lineArt;
  const dilationRadius =
    Math.ceil(params.gapCloseHintPx / 2) + Math.floor(params.edgeDetectionPx);

  let originX = 0;
  let originY = 0;
  let workImage = lineArt;
  if (params.limitToLayerBounds) {
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let position = 0; position < width * height; position += 1) {
      if (!isColorizeBoundaryInk(lineArt.data, position)) continue;
      const x = position % width;
      const y = (position / width) | 0;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    for (const hint of hints) {
      for (const pt of hint.points) {
        const x = Math.floor(pt.x - hint.radiusPx);
        const y = Math.floor(pt.y - hint.radiusPx);
        const x2 = Math.ceil(pt.x + hint.radiusPx);
        const y2 = Math.ceil(pt.y + hint.radiusPx);
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x2 > maxX) maxX = x2;
        if (y2 > maxY) maxY = y2;
      }
    }
    if (maxX >= 0) {
      const pad = dilationRadius + 1;
      minX = Math.max(0, minX - pad);
      minY = Math.max(0, minY - pad);
      maxX = Math.min(width - 1, maxX + pad);
      maxY = Math.min(height - 1, maxY + pad);
      const cropWidth = maxX - minX + 1;
      const cropHeight = maxY - minY + 1;
      if (cropWidth < width || cropHeight < height) {
        const cropData = new Uint8ClampedArray(cropWidth * cropHeight * 4);
        for (let y = 0; y < cropHeight; y += 1) {
          const srcStart = ((minY + y) * width + minX) * 4;
          cropData.set(lineArt.data.subarray(srcStart, srcStart + cropWidth * 4), y * cropWidth * 4);
        }
        workImage = { width: cropWidth, height: cropHeight, data: cropData };
        originX = minX;
        originY = minY;
      }
    }
  }

  const sealed = dilateColorizeBoundaryInk(workImage, dilationRadius);
  const plan = planStudioAutoColorHints({
    image: sealed,
    seeds: [],
    options: { recommendations: { maximumRecommendations: 0 } },
  });

  const labels = new Uint32Array(width * height);
  let boundaryPixelCount = 0;
  for (let y = 0; y < workImage.height; y += 1) {
    for (let x = 0; x < workImage.width; x += 1) {
      const workPos = y * workImage.width + x;
      const fullPos = (originY + y) * width + (originX + x);
      labels[fullPos] = plan.labels[workPos]!;
      if (isColorizeBoundaryInk(sealed.data, workPos)) boundaryPixelCount += 1;
    }
  }

  // 팽창으로 메워진 틈 주변 픽셀(원본에선 잉크가 아닌데 봉인본 라벨이 0인 곳)을 가장 가까운
  // 라벨로 되돌린다 — 안 그러면 gapCloseHintPx를 키울수록 채색이 선에서 그만큼 떨어져
  // 흰 테두리가 남는다. 되돌림의 장벽은 원본 잉크를 edgeDetectionPx만큼만 팽창한 것이라,
  // "틈 메우기"는 영역을 깎지 않고 "선 감지"의 선 굵히기만 결과 경계에 남는다.
  const edgeBarrier = dilateColorizeBoundaryInk(
    lineArt,
    Math.floor(params.edgeDetectionPx),
  );
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  for (let position = 0; position < labels.length; position += 1) {
    if (labels[position] !== 0) queue[tail++] = position;
  }
  const tryExpand = (from: number, to: number) => {
    if (labels[to] !== 0) return;
    if (isColorizeBoundaryInk(edgeBarrier.data, to)) return;
    labels[to] = labels[from]!;
    queue[tail++] = to;
  };
  while (head < tail) {
    const position = queue[head++]!;
    const x = position % width;
    const y = (position / width) | 0;
    if (x > 0) tryExpand(position, position - 1);
    if (x < width - 1) tryExpand(position, position + 1);
    if (y > 0) tryExpand(position, position - width);
    if (y < height - 1) tryExpand(position, position + width);
  }

  const hintMap = rasterizeColorizeHints(width, height, hints);
  const stats = new Map<
    number,
    { area: number; sumX: number; sumY: number; overlap: Map<string, number> }
  >();
  for (const component of plan.components) {
    stats.set(component.label, { area: 0, sumX: 0, sumY: 0, overlap: new Map() });
  }
  for (let position = 0; position < labels.length; position += 1) {
    const label = labels[position]!;
    if (label === 0) continue;
    const entry = stats.get(label);
    if (!entry) continue;
    entry.area += 1;
    entry.sumX += position % width;
    entry.sumY += (position / width) | 0;
    const hintIndex = hintMap[position]!;
    if (hintIndex >= 0) {
      const hintId = hints[hintIndex]!.id;
      entry.overlap.set(hintId, (entry.overlap.get(hintId) ?? 0) + 1);
    }
  }

  const regions: ColorizeRegionInput[] = [...stats.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([label, entry]) => ({
      id: regionIdForLabel(label),
      centroid: {
        x: entry.area > 0 ? entry.sumX / entry.area : 0,
        y: entry.area > 0 ? entry.sumY / entry.area : 0,
      },
      areaPx: entry.area,
      hintOverlap: Object.fromEntries(entry.overlap),
    }));

  return { regions, labels, width, height, boundaryPixelCount };
}

// ---------------------------------------------------------------------------
// (E) 굽기 — 할당 계획을 투명 페인트 버퍼에 칠한다 (선화 무손상)
// ---------------------------------------------------------------------------

export type StudioColorizeMaskApplyResult =
  | {
      readonly ok: true;
      /** 새로 구운 채색 버퍼. 호출부가 새 채색 레이어의 래스터로 삼는다. */
      readonly imageData: AdvancedFillImageDataLike;
      readonly assignments: readonly ColorizeAssignment[];
      readonly paintedPixelCount: number;
      readonly paintedRegionCount: number;
      readonly revision: string;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * 마스크 상태 전체 실행: 영역 분할 → 할당 계획 → 투명 버퍼에 굽기.
 * 힌트를 고친 뒤 다시 호출하면 새 결과가 나오고(리비전 갱신), 선화 버퍼는 입력 그대로
 * 반환되지도 수정되지도 않는다 — 결과는 언제나 별도 버퍼다.
 */
export function applyStudioColorizeMask(input: {
  readonly lineArt: AdvancedFillImageDataLike;
  readonly state: StudioColorizeMaskState;
}): StudioColorizeMaskApplyResult {
  const { lineArt, state } = input;
  const normalized = normalizeColorizeParams(state.params);
  if (!normalized.ok) return { ok: false, reason: normalized.reason };
  if (state.hints.length === 0) {
    return { ok: false, reason: "힌트 획이 없어요. 선화 위에 색 힌트를 먼저 그어 주세요." };
  }
  for (const hint of state.hints) {
    if (!hint.transparent && !isValidColorizeHex(hint.colorHex)) {
      return { ok: false, reason: `힌트 색 형식이 올바르지 않아요: ${hint.colorHex}` };
    }
    if (hint.points.length === 0) {
      return { ok: false, reason: "점이 없는 힌트 획이 있어요." };
    }
  }

  const built = buildColorizeRegionInputs({
    lineArt,
    hints: state.hints,
    params: normalized.params,
  });
  const assignments = planColorizeAssignments(built.regions, state.hints, normalized.params);
  const assignmentByRegionId = new Map(assignments.map((a) => [a.regionId, a] as const));

  const imageData = createStudioAutoColorBlankPaintTarget(built.width, built.height);
  let paintedPixelCount = 0;
  const paintedLabels = new Set<number>();
  for (let position = 0; position < built.labels.length; position += 1) {
    const label = built.labels[position]!;
    if (label === 0) continue;
    const assignment = assignmentByRegionId.get(regionIdForLabel(label));
    if (!assignment || assignment.colorHex === null) continue;
    const rgba = colorizeHexToRgba(assignment.colorHex);
    if (!rgba) continue;
    const offset = position * 4;
    imageData.data[offset] = rgba[0];
    imageData.data[offset + 1] = rgba[1];
    imageData.data[offset + 2] = rgba[2];
    imageData.data[offset + 3] = rgba[3];
    paintedPixelCount += 1;
    paintedLabels.add(label);
  }

  return {
    ok: true,
    imageData,
    assignments,
    paintedPixelCount,
    paintedRegionCount: paintedLabels.size,
    revision: colorizeMaskRevision({ ...state, params: normalized.params }),
  };
}
