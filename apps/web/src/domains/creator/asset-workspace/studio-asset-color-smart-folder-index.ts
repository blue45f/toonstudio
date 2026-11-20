/**
 * Eagle.cool CIEDE2000 지각 유사색 자동 검색 · 동적 스마트 폴더 · 계층 태그 인덱서.
 *
 * 기능:
 * 1. Sharma-Wu-Dalal(2005) 표준 CIEDE2000(ΔE₀₀) 색차 계산
 * 2. RGBA 픽셀 버퍼에서 결정론적 대표 5색 CIELAB 팔레트 히스토그램 추출
 * 3. 컬러 휠·스포이드 입력 기준 CIEDE2000 가중 유사색 통합 검색 및 순위화
 * 4. Allusion식 `/` 구분 계층형 태그 트리(`조명/역광/노을`) 상위-하위 자동 집계
 * 5. AND/OR 규칙 기반 동적 스마트 폴더 평가기 및 JSON 직렬화
 * 6. 멀티포맷(폰트·3D 8각도 턴테이블·오디오 파형·2D 이미지) 호버 스크러버 계획기
 */

import {
  hexToLab,
  rgbToLab,
  type StudioLabColor,
  type StudioRgbColor,
} from "../studio-lab-color";

export type IndexedAssetFormat =
  | "2d-bg"
  | "3d-prop"
  | "character"
  | "brush"
  | "font"
  | "reference"
  | "audio";

export type IndexedAssetFlag = "none" | "pick" | "hold" | "reject";

export type IndexedAssetRightsStatus =
  | "commercial-ok"
  | "personal-only"
  | "review-required";

export interface AssetDominantColorSwatch {
  readonly rgb: StudioRgbColor;
  readonly lab: StudioLabColor;
  /** 이미지 내 해당 대표색 점유 비율 (0..1, 합계 ≈ 1). */
  readonly ratio01: number;
}

export interface ColorIndexedAssetRecord {
  readonly id: string;
  readonly title: string;
  readonly format: IndexedAssetFormat;
  /** 별점 (0..5). */
  readonly rating: number;
  readonly flag: IndexedAssetFlag;
  readonly rightsStatus: IndexedAssetRightsStatus;
  /** 계층형 태그 목록(예: `조명/역광/노을`, `배경/실내/교실`). */
  readonly hierarchicalTags: readonly string[];
  /** 대표 5색 CIELAB 히스토그램 스와치. */
  readonly palette: readonly AssetDominantColorSwatch[];
  /** 멀티포맷 호버 프리뷰용 선택 메타데이터. */
  readonly fontSampleText?: string;
  readonly turntableFrameCount?: number;
  readonly audioWaveformBins?: readonly number[];
}

export type ColorQueryInput = StudioLabColor | StudioRgbColor | string;

export interface ColorSimilarityMatch {
  readonly asset: ColorIndexedAssetRecord;
  /** 가장 가까운 스와치와의 순수 ΔE₀₀ 색차. */
  readonly bestDeltaE: number;
  /** 대표색 점유 비율 가중치를 반영한 종합 유사도 점수(낮을수록 유사). */
  readonly weightedScore: number;
  readonly matchedSwatchIndex: number;
}

export type SmartFolderRule =
  | { readonly kind: "format"; readonly formats: readonly IndexedAssetFormat[] }
  | { readonly kind: "min-rating"; readonly minRating: number }
  | { readonly kind: "flag"; readonly flags: readonly IndexedAssetFlag[] }
  | { readonly kind: "rights-status"; readonly statuses: readonly IndexedAssetRightsStatus[] }
  | { readonly kind: "hierarchical-tag"; readonly tagPath: string }
  | {
      readonly kind: "color-near";
      readonly queryLab: StudioLabColor;
      readonly maxDeltaE: number;
    }
  | { readonly kind: "text-query"; readonly query: string };

export interface SmartFolderDefinition {
  readonly id: string;
  readonly name: string;
  readonly combinator: "all" | "any";
  readonly rules: readonly SmartFolderRule[];
}

export interface HierarchicalTagTreeNode {
  readonly segment: string;
  readonly fullPath: string;
  readonly directCount: number;
  readonly totalCount: number;
  readonly children: readonly HierarchicalTagTreeNode[];
}

export type AssetHoverPreviewPlan =
  | { readonly kind: "font-glyph"; readonly sampleText: string }
  | { readonly kind: "turntable-3d"; readonly angleIndex: number; readonly totalAngles: number; readonly yawDeg: number }
  | { readonly kind: "audio-waveform"; readonly playheadRatio01: number; readonly binIndex: number; readonly amplitude01: number }
  | { readonly kind: "image-zoom"; readonly focusX01: number; readonly focusY01: number };

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const POW_25_7 = Math.pow(25, 7);

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * CIE 2000 (CIEDE2000 / ΔE₀₀) 지각 색차 공식 (Sharma, Wu, Dalal 2005).
 * 동일 색상은 0, 인접 지각 한계(JND)는 약 1~2.3 수준이다.
 */
export function deltaE2000(
  c1: StudioLabColor,
  c2: StudioLabColor,
  weights: { readonly kL?: number; readonly kC?: number; readonly kH?: number } = {},
): number {
  const kL = weights.kL ?? 1;
  const kC = weights.kC ?? 1;
  const kH = weights.kH ?? 1;

  const c1Star = Math.hypot(c1.a, c1.b);
  const c2Star = Math.hypot(c2.a, c2.b);
  const cBar = (c1Star + c2Star) * 0.5;
  const cBar7 = Math.pow(cBar, 7);
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + POW_25_7)));

  const a1Prime = (1 + g) * c1.a;
  const a2Prime = (1 + g) * c2.a;
  const c1Prime = Math.hypot(a1Prime, c1.b);
  const c2Prime = Math.hypot(a2Prime, c2.b);

  const hueAngle = (bVal: number, aPrime: number): number => {
    if (bVal === 0 && aPrime === 0) return 0;
    const deg = Math.atan2(bVal, aPrime) * RAD_TO_DEG;
    return deg >= 0 ? deg : deg + 360;
  };

  const h1Prime = hueAngle(c1.b, a1Prime);
  const h2Prime = hueAngle(c2.b, a2Prime);

  const deltaLPrime = c2.l - c1.l;
  const deltaCPrime = c2Prime - c1Prime;

  let deltahPrime = 0;
  if (c1Prime * c2Prime !== 0) {
    const diff = h2Prime - h1Prime;
    if (Math.abs(diff) <= 180) deltahPrime = diff;
    else if (diff > 180) deltahPrime = diff - 360;
    else deltahPrime = diff + 360;
  }

  const deltaHPrime =
    2 * Math.sqrt(c1Prime * c2Prime) * Math.sin((deltahPrime * 0.5) * DEG_TO_RAD);

  const lBarPrime = (c1.l + c2.l) * 0.5;
  const cBarPrime = (c1Prime + c2Prime) * 0.5;

  let hBarPrime = h1Prime + h2Prime;
  if (c1Prime * c2Prime !== 0) {
    const absDiff = Math.abs(h1Prime - h2Prime);
    if (absDiff <= 180) hBarPrime = (h1Prime + h2Prime) * 0.5;
    else if (h1Prime + h2Prime < 360) hBarPrime = (h1Prime + h2Prime + 360) * 0.5;
    else hBarPrime = (h1Prime + h2Prime - 360) * 0.5;
  }

  const t =
    1 -
    0.17 * Math.cos((hBarPrime - 30) * DEG_TO_RAD) +
    0.24 * Math.cos(2 * hBarPrime * DEG_TO_RAD) +
    0.32 * Math.cos((3 * hBarPrime + 6) * DEG_TO_RAD) -
    0.2 * Math.cos((4 * hBarPrime - 63) * DEG_TO_RAD);

  const deltaTheta = 30 * Math.exp(-Math.pow((hBarPrime - 275) / 25, 2));
  const cBarPrime7 = Math.pow(cBarPrime, 7);
  const rC = 2 * Math.sqrt(cBarPrime7 / (cBarPrime7 + POW_25_7));
  const lTerm = Math.pow(lBarPrime - 50, 2);
  const sL = 1 + (0.015 * lTerm) / Math.sqrt(20 + lTerm);
  const sC = 1 + 0.045 * cBarPrime;
  const sH = 1 + 0.015 * cBarPrime * t;
  const rT = -Math.sin(2 * deltaTheta * DEG_TO_RAD) * rC;

  const termL = deltaLPrime / (kL * sL);
  const termC = deltaCPrime / (kC * sC);
  const termH = deltaHPrime / (kH * sH);

  const deltaE = Math.sqrt(
    Math.max(0, termL * termL + termC * termC + termH * termH + rT * termC * termH),
  );
  return Math.round(deltaE * 10000) / 10000;
}

/**
 * Lab / RGB / 문자열 색상을 CIELAB 좌표로 정규화한다.
 */
export function resolveColorQueryToLab(query: ColorQueryInput): StudioLabColor {
  if (typeof query === "string") {
    return hexToLab(query);
  }
  if ("l" in query && "a" in query && "b" in query) {
    return query;
  }
  return rgbToLab(query.r, query.g, query.b);
}

/**
 * RGBA 픽셀 버퍼에서 결정론적 K-Means(기본 k=5)로 대표 CIELAB 팔레트 히스토그램을 추출한다.
 * 알파 < 32인 투명 픽셀은 제외하며, 점유 비율 내림차순으로 정렬해 반환한다.
 */
export function extractDominantLabPaletteFromRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  paletteSize = 5,
): readonly AssetDominantColorSwatch[] {
  const safeW = Math.max(0, Math.trunc(width));
  const safeH = Math.max(0, Math.trunc(height));
  const k = Math.round(clamp(paletteSize, 1, 8));
  if (safeW === 0 || safeH === 0 || rgba.length < safeW * safeH * 4) return [];

  // 대형 썸네일은 최대 ~4096 샘플로 결정론적 균등 스트라이드 샘플링
  const totalPixels = safeW * safeH;
  const stride = Math.max(1, Math.floor(totalPixels / 4096));
  const samples: [number, number, number][] = [];

  for (let p = 0; p < totalPixels; p += stride) {
    const idx = p * 4;
    if ((rgba[idx + 3] ?? 0) < 32) continue;
    samples.push([rgba[idx] ?? 0, rgba[idx + 1] ?? 0, rgba[idx + 2] ?? 0]);
  }
  if (samples.length === 0) return [];

  // 결정론적 시드 선택: 첫 샘플 이후 가장 먼 샘플을 순차 선택(Farthest-First)
  const centroids: [number, number, number][] = [[...samples[0]!]];
  while (centroids.length < k && centroids.length < samples.length) {
    let bestIdx = -1;
    let bestMinDistSq = -1;
    for (let i = 0; i < samples.length; i += 1) {
      const s = samples[i]!;
      let minDistSq = Infinity;
      for (const c of centroids) {
        const dSq = (s[0] - c[0]) ** 2 + (s[1] - c[1]) ** 2 + (s[2] - c[2]) ** 2;
        if (dSq < minDistSq) minDistSq = dSq;
      }
      if (minDistSq > bestMinDistSq) {
        bestMinDistSq = minDistSq;
        bestIdx = i;
      }
    }
    if (bestIdx < 0 || bestMinDistSq < 4) break;
    centroids.push([...samples[bestIdx]!]);
  }

  const clusterCount = centroids.length;
  const counts = new Uint32Array(clusterCount);

  for (let iter = 0; iter < 6; iter += 1) {
    const sumR = new Float64Array(clusterCount);
    const sumG = new Float64Array(clusterCount);
    const sumB = new Float64Array(clusterCount);
    counts.fill(0);

    for (const s of samples) {
      let bestC = 0;
      let bestDistSq = Infinity;
      for (let c = 0; c < clusterCount; c += 1) {
        const ctr = centroids[c]!;
        const dSq = (s[0] - ctr[0]) ** 2 + (s[1] - ctr[1]) ** 2 + (s[2] - ctr[2]) ** 2;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestC = c;
        }
      }
      counts[bestC] = (counts[bestC] ?? 0) + 1;
      sumR[bestC] = (sumR[bestC] ?? 0) + s[0];
      sumG[bestC] = (sumG[bestC] ?? 0) + s[1];
      sumB[bestC] = (sumB[bestC] ?? 0) + s[2];
    }

    for (let c = 0; c < clusterCount; c += 1) {
      const cnt = counts[c] ?? 0;
      if (cnt > 0) {
        centroids[c] = [sumR[c]! / cnt, sumG[c]! / cnt, sumB[c]! / cnt];
      }
    }
  }

  const totalCount = samples.length;
  const swatches: AssetDominantColorSwatch[] = [];
  for (let c = 0; c < clusterCount; c += 1) {
    const cnt = counts[c] ?? 0;
    if (cnt === 0) continue;
    const ctr = centroids[c]!;
    const rgb: StudioRgbColor = Object.freeze({
      r: Math.round(clamp(ctr[0], 0, 255)),
      g: Math.round(clamp(ctr[1], 0, 255)),
      b: Math.round(clamp(ctr[2], 0, 255)),
    });
    swatches.push({
      rgb,
      lab: rgbToLab(rgb.r, rgb.g, rgb.b),
      ratio01: Math.round((cnt / totalCount) * 10000) / 10000,
    });
  }

  swatches.sort((a, b) => b.ratio01 - a.ratio01);
  return Object.freeze(swatches);
}

/**
 * CIEDE2000 지각 색차 기반으로 지정 색상과 유사한 에셋을 순위 정렬해 반환한다.
 */
export function queryAssetsByColorSimilarity(
  assets: readonly ColorIndexedAssetRecord[],
  queryColor: ColorQueryInput,
  options: {
    readonly thresholdDeltaE?: number;
    readonly limit?: number;
  } = {},
): readonly ColorSimilarityMatch[] {
  const queryLab = resolveColorQueryToLab(queryColor);
  const threshold = clamp(options.thresholdDeltaE ?? 18, 1, 60);
  const matches: ColorSimilarityMatch[] = [];

  for (const asset of assets) {
    if (asset.palette.length === 0) continue;
    let bestDeltaE = Infinity;
    let bestScore = Infinity;
    let bestIndex = 0;

    for (let i = 0; i < asset.palette.length; i += 1) {
      const swatch = asset.palette[i]!;
      const dE = deltaE2000(queryLab, swatch.lab);
      // 지배색 점유율이 높을수록 약간의 보너스(최대 20% 페널티 경감)
      const weightFactor = 1 - Math.min(0.2, swatch.ratio01 * 0.25);
      const score = Math.round(dE * weightFactor * 10000) / 10000;
      if (dE < bestDeltaE || (dE === bestDeltaE && score < bestScore)) {
        bestDeltaE = dE;
        bestScore = score;
        bestIndex = i;
      }
    }

    if (bestDeltaE <= threshold) {
      matches.push({
        asset,
        bestDeltaE,
        weightedScore: bestScore,
        matchedSwatchIndex: bestIndex,
      });
    }
  }

  matches.sort((a, b) => a.weightedScore - b.weightedScore || a.bestDeltaE - b.bestDeltaE);
  const limited =
    options.limit !== undefined && options.limit > 0
      ? matches.slice(0, Math.floor(options.limit))
      : matches;
  return Object.freeze(limited);
}

// ── 계층형 태그 트리 (Allusion 패턴) ─────────────────────────────────

function normalizeTagPath(tag: string): string {
  return tag
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .join("/");
}

/**
 * 상위 태그(`조명`)로 조회 시 하위 태그(`조명/역광/노을`)를 경로 경계 기준으로 포함 매칭한다.
 */
export function matchHierarchicalTag(assetTag: string, queryTagPath: string): boolean {
  const normAsset = normalizeTagPath(assetTag).toLowerCase();
  const normQuery = normalizeTagPath(queryTagPath).toLowerCase();
  if (!normAsset || !normQuery) return false;
  return normAsset === normQuery || normAsset.startsWith(`${normQuery}/`);
}

export function buildHierarchicalTagTree(
  assets: readonly ColorIndexedAssetRecord[],
): readonly HierarchicalTagTreeNode[] {
  interface MutableNode {
    segment: string;
    fullPath: string;
    directIds: Set<string>;
    totalIds: Set<string>;
    children: Map<string, MutableNode>;
  }

  const roots = new Map<string, MutableNode>();

  for (const asset of assets) {
    for (const rawTag of asset.hierarchicalTags) {
      const normalized = normalizeTagPath(rawTag);
      if (!normalized) continue;
      const parts = normalized.split("/");
      let level = roots;
      let accPath = "";

      for (let i = 0; i < parts.length; i += 1) {
        const seg = parts[i]!;
        accPath = i === 0 ? seg : `${accPath}/${seg}`;
        let node = level.get(seg);
        if (!node) {
          node = {
            segment: seg,
            fullPath: accPath,
            directIds: new Set(),
            totalIds: new Set(),
            children: new Map(),
          };
          level.set(seg, node);
        }
        node.totalIds.add(asset.id);
        if (i === parts.length - 1) {
          node.directIds.add(asset.id);
        }
        level = node.children;
      }
    }
  }

  const freezeMap = (map: Map<string, MutableNode>): readonly HierarchicalTagTreeNode[] =>
    Object.freeze(
      [...map.values()]
        .sort((a, b) => a.segment.localeCompare(b.segment, "ko"))
        .map((n) => ({
          segment: n.segment,
          fullPath: n.fullPath,
          directCount: n.directIds.size,
          totalCount: n.totalIds.size,
          children: freezeMap(n.children),
        })),
    );

  return freezeMap(roots);
}

// ── 동적 스마트 폴더 평가기 ──────────────────────────────────────────

export function matchesSmartFolderRule(
  asset: ColorIndexedAssetRecord,
  rule: SmartFolderRule,
): boolean {
  switch (rule.kind) {
    case "format":
      return rule.formats.includes(asset.format);
    case "min-rating":
      return asset.rating >= rule.minRating;
    case "flag":
      return rule.flags.includes(asset.flag);
    case "rights-status":
      return rule.statuses.includes(asset.rightsStatus);
    case "hierarchical-tag":
      return asset.hierarchicalTags.some((t) => matchHierarchicalTag(t, rule.tagPath));
    case "color-near":
      return asset.palette.some(
        (swatch) => deltaE2000(rule.queryLab, swatch.lab) <= Math.max(1, rule.maxDeltaE),
      );
    case "text-query": {
      const q = rule.query.trim().toLowerCase();
      if (!q) return true;
      const haystack = `${asset.title} ${asset.hierarchicalTags.join(" ")}`.toLowerCase();
      return haystack.includes(q);
    }
  }
}

export function evaluateSmartFolder(
  assets: readonly ColorIndexedAssetRecord[],
  folder: SmartFolderDefinition,
): readonly ColorIndexedAssetRecord[] {
  if (folder.rules.length === 0) return Object.freeze([...assets]);
  const matched = assets.filter((asset) =>
    folder.combinator === "all"
      ? folder.rules.every((rule) => matchesSmartFolderRule(asset, rule))
      : folder.rules.some((rule) => matchesSmartFolderRule(asset, rule)),
  );
  return Object.freeze(matched);
}

export function serializeSmartFolder(folder: SmartFolderDefinition): string {
  return JSON.stringify(folder);
}

export function deserializeSmartFolder(rawJson: string): SmartFolderDefinition | null {
  try {
    const parsed = JSON.parse(rawJson) as Partial<SmartFolderDefinition>;
    if (
      !parsed ||
      typeof parsed.id !== "string" ||
      typeof parsed.name !== "string" ||
      (parsed.combinator !== "all" && parsed.combinator !== "any") ||
      !Array.isArray(parsed.rules)
    ) {
      return null;
    }
    return {
      id: parsed.id,
      name: parsed.name,
      combinator: parsed.combinator,
      rules: Object.freeze([...parsed.rules]),
    };
  } catch {
    return null;
  }
}

// ── 멀티포맷 호버 스크러버 계획기 ────────────────────────────────────

export function resolveAssetHoverPreviewPlan(
  asset: ColorIndexedAssetRecord,
  hoverX01: number,
  hoverY01 = 0.5,
  customFontPhrase?: string,
): AssetHoverPreviewPlan {
  const x = clamp(hoverX01, 0, 0.9999);
  const y = clamp(hoverY01, 0, 0.9999);

  if (asset.format === "font") {
    return {
      kind: "font-glyph",
      sampleText:
        customFontPhrase?.trim() ||
        asset.fontSampleText?.trim() ||
        "잠깐, 거기 멈춰 서!",
    };
  }
  if (asset.format === "3d-prop" || asset.format === "character") {
    const totalAngles = Math.max(4, Math.min(24, Math.round(asset.turntableFrameCount ?? 8)));
    const angleIndex = Math.min(totalAngles - 1, Math.floor(x * totalAngles));
    return {
      kind: "turntable-3d",
      angleIndex,
      totalAngles,
      yawDeg: Math.round((angleIndex / totalAngles) * 360),
    };
  }
  if (asset.format === "audio") {
    const bins = asset.audioWaveformBins ?? [];
    const totalBins = Math.max(1, bins.length || 64);
    const binIndex = Math.min(totalBins - 1, Math.floor(x * totalBins));
    return {
      kind: "audio-waveform",
      playheadRatio01: Math.round(x * 1000) / 1000,
      binIndex,
      amplitude01: clamp(bins[binIndex] ?? 0, 0, 1),
    };
  }
  return {
    kind: "image-zoom",
    focusX01: Math.round(x * 1000) / 1000,
    focusY01: Math.round(y * 1000) / 1000,
  };
}
