/**
 * Wave-34: 거리장·곡률 유도 틈새 닫기(Gap-Closing) 선화 채우기 및 멀티모달 스튜디오 에셋 자동 태거.
 *
 * - `floodFillWithGapClosing`: 유클리드 거리 변환(`EDT`) 기반 형태학적 팽창 장벽(`maxGapPx`)으로
 *   끊어진 먹선 틈새의 밑색 누출을 막고, 단조 거리 하강 클레임으로 실제 먹선 경계까지 빈틈없이 복원한다.
 * - `inferStudioAssetSemanticTags`: 해상도·종횡비·3D 치수·OKLab 색온도·투명도·한/영 어간 토큰을 결합해
 *   `3d-prop`, `vrm-outfit`, `brush`, `panel-template`을 결정론적으로 분류하고 한글·영문 태그를 부여한다.
 */

import { srgbToOklab, type SrgbColor } from "./multimodal-style-transfer-lut-baker";

export type StudioAssetCategory = "3d-prop" | "vrm-outfit" | "brush" | "panel-template";
export type AssetColorTemperature = "warm" | "cool" | "neutral";
export type AssetTransparencyClass = "opaque" | "cutout-alpha" | "soft-translucent";
export type AssetAspectProfile = "square-stamp" | "vertical-scroll" | "landscape-wide" | "humanoid-tall" | "balanced";

export interface GapClosingFloodFillInput {
  readonly width: number;
  readonly height: number;
  readonly inkMask: Uint8Array | Float32Array;
  readonly seedX: number;
  readonly seedY: number;
  readonly maxGapPx?: number;
  readonly inkThreshold?: number;
  readonly fillColor?: SrgbColor;
  readonly baseRgba?: Float32Array;
}

export interface GapClosingFloodFillResult {
  readonly width: number;
  readonly height: number;
  readonly filledMask: Uint8Array;
  readonly filledPixelCount: number;
  readonly corePixelCount: number;
  readonly reclaimedBoundaryPixelCount: number;
  readonly sealedGapPixelCount: number;
  readonly leakedToBorder: boolean;
  readonly compositedRgba?: Float32Array;
}

export interface StudioAssetDimensions3D { readonly x: number; readonly y: number; readonly z: number }

export interface StudioAssetMultimodalInput {
  readonly name: string;
  readonly description?: string;
  readonly fileExtension?: string;
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly boundingBoxMeters?: StudioAssetDimensions3D;
  readonly dominantColorsSrgb?: readonly SrgbColor[];
  readonly thumbnailRgba?: Float32Array;
  readonly transparencyRatio?: number;
  readonly hasRiggedHumanoidBones?: boolean;
  readonly panelFrameCount?: number;
}

export interface StudioAssetSemanticTagResult {
  readonly category: StudioAssetCategory;
  readonly confidence: number;
  readonly categoryScores: Readonly<Record<StudioAssetCategory, number>>;
  readonly colorTemperature: AssetColorTemperature;
  readonly transparencyClass: AssetTransparencyClass;
  readonly aspectProfile: AssetAspectProfile;
  readonly tagsKo: readonly string[];
  readonly tagsEn: readonly string[];
  readonly matchedTokenStems: readonly string[];
}

const EDT_INF_SQ = 1e12;

function edt1d(f: Float64Array, d: Float64Array, v: Int32Array, z: Float64Array, n: number): void {
  let k = 0;
  v[0] = 0;
  z[0] = Number.NEGATIVE_INFINITY;
  z[1] = Number.POSITIVE_INFINITY;
  for (let q = 1; q < n; q += 1) {
    const fq = f[q] ?? EDT_INF_SQ;
    let vk = v[k] ?? 0;
    let s = (fq + q * q - ((f[vk] ?? EDT_INF_SQ) + vk * vk)) / (2 * q - 2 * vk);
    while (s <= (z[k] ?? Number.NEGATIVE_INFINITY)) {
      k -= 1;
      vk = v[k] ?? 0;
      s = (fq + q * q - ((f[vk] ?? EDT_INF_SQ) + vk * vk)) / (2 * q - 2 * vk);
    }
    k += 1;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Number.POSITIVE_INFINITY;
  }
  k = 0;
  for (let q = 0; q < n; q += 1) {
    while ((z[k + 1] ?? Number.POSITIVE_INFINITY) < q) k += 1;
    const vk = v[k] ?? 0;
    const diff = q - vk;
    d[q] = diff * diff + (f[vk] ?? EDT_INF_SQ);
  }
}

/** 이진 먹선 마스크(`1` = 먹선)로부터 최근접 먹선까지의 제곱 유클리드 거리장(`EDT^2`)을 계산한다. */
export function computeSquaredDistanceTransform(
  binaryInk: Uint8Array,
  width: number,
  height: number,
): Float64Array {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  const grid = new Float64Array(safeW * safeH);
  for (let i = 0; i < grid.length; i += 1) {
    grid[i] = (binaryInk[i] ?? 0) > 0 ? 0 : EDT_INF_SQ;
  }
  const maxDim = Math.max(safeW, safeH);
  const f = new Float64Array(maxDim);
  const d = new Float64Array(maxDim);
  const v = new Int32Array(maxDim + 1);
  const z = new Float64Array(maxDim + 2);

  for (let x = 0; x < safeW; x += 1) {
    for (let y = 0; y < safeH; y += 1) f[y] = grid[y * safeW + x] ?? EDT_INF_SQ;
    edt1d(f, d, v, z, safeH);
    for (let y = 0; y < safeH; y += 1) grid[y * safeW + x] = d[y] ?? EDT_INF_SQ;
  }
  for (let y = 0; y < safeH; y += 1) {
    const row = y * safeW;
    for (let x = 0; x < safeW; x += 1) f[x] = grid[row + x] ?? EDT_INF_SQ;
    edt1d(f, d, v, z, safeW);
    for (let x = 0; x < safeW; x += 1) grid[row + x] = d[x] ?? EDT_INF_SQ;
  }
  return grid;
}

function getNeighbors4(idx: number, width: number, height: number, out: Int32Array): number {
  const x = idx % width;
  const y = Math.floor(idx / width);
  let count = 0;
  if (x > 0) { out[count] = idx - 1; count += 1; }
  if (x + 1 < width) { out[count] = idx + 1; count += 1; }
  if (y > 0) { out[count] = idx - width; count += 1; }
  if (y + 1 < height) { out[count] = idx + width; count += 1; }
  return count;
}

function compositeFilledMask(
  width: number,
  height: number,
  filledMask: Uint8Array,
  binaryInk: Uint8Array,
  fillColor?: SrgbColor,
  baseRgba?: Float32Array,
): Float32Array | undefined {
  if (fillColor === undefined) return undefined;
  const total = width * height;
  const out = new Float32Array(total * 4);
  if (baseRgba !== undefined && baseRgba.length >= total * 4) {
    out.set(baseRgba.subarray(0, total * 4));
  } else {
    for (let i = 0; i < total; i += 1) {
      const tone = (binaryInk[i] ?? 0) > 0 ? 0.05 : 1;
      const base = i * 4;
      out[base] = tone;
      out[base + 1] = tone;
      out[base + 2] = tone;
      out[base + 3] = 1;
    }
  }
  for (let i = 0; i < total; i += 1) {
    if ((filledMask[i] ?? 0) === 0 || (binaryInk[i] ?? 0) > 0) continue;
    const base = i * 4;
    out[base] = fillColor.r;
    out[base + 1] = fillColor.g;
    out[base + 2] = fillColor.b;
    out[base + 3] = 1;
  }
  return out;
}

/** 끊어진 선화 틈새(`<= maxGapPx`)를 형태학적으로 봉합해 채운 뒤 실제 먹선 경계까지 정밀 복원한다. */
export function floodFillWithGapClosing(input: GapClosingFloodFillInput): GapClosingFloodFillResult {
  const width = Math.max(1, Math.floor(input.width));
  const height = Math.max(1, Math.floor(input.height));
  const total = width * height;
  const threshold = input.inkThreshold ?? 0.5;
  const maxGapPx = Math.max(0, input.maxGapPx ?? 3);

  const binaryInk = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    binaryInk[i] = (input.inkMask[i] ?? 0) >= threshold ? 1 : 0;
  }

  const filledMask = new Uint8Array(total);
  const sx = Math.floor(input.seedX);
  const sy = Math.floor(input.seedY);
  const seedIdx = sy * width + sx;

  const makeResult = (
    filledPixelCount: number,
    corePixelCount: number,
    sealedGapPixelCount: number,
    leakedToBorder: boolean,
  ): GapClosingFloodFillResult => ({
    width,
    height,
    filledMask,
    filledPixelCount,
    corePixelCount,
    reclaimedBoundaryPixelCount: filledPixelCount - corePixelCount,
    sealedGapPixelCount,
    leakedToBorder,
    compositedRgba: compositeFilledMask(width, height, filledMask, binaryInk, input.fillColor, input.baseRgba),
  });

  if (sx < 0 || sx >= width || sy < 0 || sy >= height || (binaryInk[seedIdx] ?? 0) > 0) {
    return makeResult(0, 0, 0, false);
  }

  const queue = new Int32Array(total);
  const nbrs = new Int32Array(4);

  if (maxGapPx <= 0) {
    let head = 0, tail = 1, leakedToBorder = false;
    filledMask[seedIdx] = 1;
    queue[0] = seedIdx;
    while (head < tail) {
      const curr = queue[head] ?? 0;
      head += 1;
      const cx = curr % width, cy = Math.floor(curr / width);
      if (cx === 0 || cx === width - 1 || cy === 0 || cy === height - 1) leakedToBorder = true;
      const nCount = getNeighbors4(curr, width, height, nbrs);
      for (let ni = 0; ni < nCount; ni += 1) {
        const next = nbrs[ni] ?? 0;
        if ((binaryInk[next] ?? 0) === 0 && (filledMask[next] ?? 0) === 0) {
          filledMask[next] = 1;
          queue[tail] = next;
          tail += 1;
        }
      }
    }
    return makeResult(tail, tail, 0, leakedToBorder);
  }

  const edtSq = computeSquaredDistanceTransform(binaryInk, width, height);
  const barrierRadiusPx = (maxGapPx + 1) * 0.5;
  const barrierRadiusSq = barrierRadiusPx * barrierRadiusPx;

  let activeSeed = seedIdx;
  if ((edtSq[activeSeed] ?? 0) <= barrierRadiusSq) {
    const visited = new Uint8Array(total);
    const localQueue: number[] = [seedIdx];
    visited[seedIdx] = 1;
    const maxPromote = Math.ceil(barrierRadiusPx) + 2;
    for (let qi = 0; qi < localQueue.length; qi += 1) {
      const curr = localQueue[qi] ?? seedIdx;
      if ((edtSq[curr] ?? 0) > barrierRadiusSq) {
        activeSeed = curr;
        break;
      }
      const cx = curr % width;
      const cy = Math.floor(curr / width);
      if (Math.abs(cx - sx) + Math.abs(cy - sy) >= maxPromote) continue;
      const nCount = getNeighbors4(curr, width, height, nbrs);
      for (let ni = 0; ni < nCount; ni += 1) {
        const next = nbrs[ni] ?? 0;
        if ((visited[next] ?? 0) === 0 && (binaryInk[next] ?? 0) === 0 && (edtSq[next] ?? 0) >= (edtSq[curr] ?? 0)) {
          visited[next] = 1;
          localQueue.push(next);
        }
      }
    }
  }

  let head = 0;
  let tail = 1;
  filledMask[activeSeed] = 1;
  queue[0] = activeSeed;

  if ((edtSq[activeSeed] ?? 0) > barrierRadiusSq) {
    while (head < tail) {
      const curr = queue[head] ?? 0;
      head += 1;
      const nCount = getNeighbors4(curr, width, height, nbrs);
      for (let ni = 0; ni < nCount; ni += 1) {
        const next = nbrs[ni] ?? 0;
        if (
          (binaryInk[next] ?? 0) === 0 &&
          (filledMask[next] ?? 0) === 0 &&
          (edtSq[next] ?? 0) > barrierRadiusSq
        ) {
          filledMask[next] = 1;
          queue[tail] = next;
          tail += 1;
        }
      }
    }
  }

  const corePixelCount = tail;
  const claimSteps = new Uint16Array(total);
  const maxClaimSteps = Math.ceil(barrierRadiusPx * 2) + 2;
  let claimHead = 0;
  let claimTail = tail;

  while (claimHead < claimTail) {
    const curr = queue[claimHead] ?? 0;
    claimHead += 1;
    const step = claimSteps[curr] ?? 0;
    if (step >= maxClaimSteps) continue;
    const currEdt = edtSq[curr] ?? 0;
    const nCount = getNeighbors4(curr, width, height, nbrs);
    for (let ni = 0; ni < nCount; ni += 1) {
      const next = nbrs[ni] ?? 0;
      if ((binaryInk[next] ?? 0) === 0 && (filledMask[next] ?? 0) === 0 && (edtSq[next] ?? 0) <= currEdt) {
        filledMask[next] = 1;
        claimSteps[next] = step + 1;
        queue[claimTail] = next;
        claimTail += 1;
      }
    }
  }

  let sealedGapPixelCount = 0;
  let leakedToBorder = false;
  for (let i = 0; i < claimTail; i += 1) {
    const idx = queue[i] ?? 0;
    const x = idx % width;
    const y = Math.floor(idx / width);
    if (x === 0 || x === width - 1 || y === 0 || y === height - 1) leakedToBorder = true;
    const nCount = getNeighbors4(idx, width, height, nbrs);
    for (let ni = 0; ni < nCount; ni += 1) {
      const next = nbrs[ni] ?? 0;
      if ((binaryInk[next] ?? 0) === 0 && (filledMask[next] ?? 0) === 0) {
        sealedGapPixelCount += 1;
        break;
      }
    }
  }

  return makeResult(claimTail, corePixelCount, sealedGapPixelCount, leakedToBorder);
}

interface StemRuleGroup {
  readonly stems: readonly string[];
  readonly category: StudioAssetCategory;
  readonly weight: number;
  readonly subTagKo: string;
  readonly subTagEn: string;
}

const STEM_GROUPS: readonly StemRuleGroup[] = [
  { stems: ["prop", "소품", "오브젝트"], category: "3d-prop", weight: 2.7, subTagKo: "배경 소품", subTagEn: "stage-prop" },
  { stems: ["가구", "테이블", "책상", "의자", "table", "chair", "desk"], category: "3d-prop", weight: 2.4, subTagKo: "실내 가구", subTagEn: "furniture" },
  { stems: ["원목", "목재", "wood", "timber"], category: "3d-prop", weight: 1.8, subTagKo: "목재 질감", subTagEn: "timber" },
  { stems: ["배경", "카페", "건물", "교실", "cafe", "building", "room"], category: "3d-prop", weight: 2.2, subTagKo: "공간 세트", subTagEn: "environment" },
  { stems: ["검", "무기", "sword", "weapon"], category: "3d-prop", weight: 2.3, subTagKo: "액션 무기", subTagEn: "weapon-prop" },
  { stems: ["vrm", "아바타", "avatar"], category: "vrm-outfit", weight: 3.0, subTagKo: "아바타 호환", subTagEn: "vrm-ready" },
  { stems: ["outfit", "costume", "의상", "복장"], category: "vrm-outfit", weight: 2.8, subTagKo: "캐릭터 의상", subTagEn: "wearable" },
  { stems: ["교복", "uniform"], category: "vrm-outfit", weight: 2.7, subTagKo: "교복 스타일", subTagEn: "school-uniform" },
  { stems: ["자켓", "원피스", "치마", "레이스", "jacket", "dress", "skirt", "lace"], category: "vrm-outfit", weight: 2.3, subTagKo: "패션 파츠", subTagEn: "garment" },
  { stems: ["brush", "브러시", "브러쉬"], category: "brush", weight: 3.0, subTagKo: "드로잉 브러시", subTagEn: "drawing-brush" },
  { stems: ["먹선", "선화", "펜", "ink", "nib", "pen"], category: "brush", weight: 2.6, subTagKo: "선화·먹선", subTagEn: "ink-lineart" },
  { stems: ["수채", "스크린톤", "스탬프", "watercolor", "halftone", "stamp"], category: "brush", weight: 2.5, subTagKo: "텍스처 표현", subTagEn: "texture-brush" },
  { stems: ["panel", "template", "패널", "템플릿"], category: "panel-template", weight: 2.7, subTagKo: "컷 레이아웃", subTagEn: "panel-layout" },
  { stems: ["컷", "콘티", "스크롤", "대각선", "storyboard", "gutter", "scroll"], category: "panel-template", weight: 2.3, subTagKo: "웹툰 연출", subTagEn: "webtoon-pacing" },
];

function tokenizeStems(rawText: string): string[] {
  const normalized = rawText.normalize("NFC").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  const rawTokens = normalized.split(/[\s._\-/,()[\]:;+]+/).filter((t) => t.length > 0);
  const stems = new Set<string>();
  for (const token of rawTokens) {
    stems.add(token);
    if (token.length >= 4 && token.endsWith("ing")) stems.add(token.slice(0, -3));
    else if (token.length >= 4 && token.endsWith("es")) stems.add(token.slice(0, -2));
    else if (token.length >= 3 && token.endsWith("s")) stems.add(token.slice(0, -1));
    for (const koSuffix of ["용", "형", "들", "세트"]) {
      if (token.length > koSuffix.length + 1 && token.endsWith(koSuffix)) {
        stems.add(token.slice(0, -koSuffix.length));
      }
    }
  }
  return [...stems];
}

function resolveColorAndAlpha(input: StudioAssetMultimodalInput): {
  readonly colorTemperature: AssetColorTemperature;
  readonly transparencyRatio: number;
} {
  let alphaRatio = input.transparencyRatio ?? -1;
  const colors: SrgbColor[] = input.dominantColorsSrgb ? [...input.dominantColorsSrgb] : [];

  if (input.thumbnailRgba !== undefined && input.thumbnailRgba.length >= 4) {
    const pixelCount = Math.floor(input.thumbnailRgba.length / 4);
    let transparentPixels = 0;
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let opaqueCount = 0;
    for (let i = 0; i < pixelCount; i += 1) {
      const base = i * 4;
      const a = input.thumbnailRgba[base + 3] ?? 1;
      if (a < 0.85) transparentPixels += 1;
      if (a >= 0.1) {
        rSum += input.thumbnailRgba[base] ?? 0;
        gSum += input.thumbnailRgba[base + 1] ?? 0;
        bSum += input.thumbnailRgba[base + 2] ?? 0;
        opaqueCount += 1;
      }
    }
    if (alphaRatio < 0) alphaRatio = transparentPixels / pixelCount;
    if (colors.length === 0 && opaqueCount > 0) {
      colors.push({ r: rSum / opaqueCount, g: gSum / opaqueCount, b: bSum / opaqueCount });
    }
  }

  const safeTransparency = Math.max(0, Math.min(1, alphaRatio < 0 ? 0 : alphaRatio));
  if (colors.length === 0) return { colorTemperature: "neutral", transparencyRatio: safeTransparency };

  let warmth = 0;
  for (const c of colors) {
    const lab = srgbToOklab(c);
    warmth += lab.b + 0.35 * lab.a;
  }
  const meanWarmth = warmth / colors.length;
  const colorTemperature: AssetColorTemperature =
    meanWarmth > 0.025 ? "warm" : meanWarmth < -0.025 ? "cool" : "neutral";
  return { colorTemperature, transparencyRatio: safeTransparency };
}

/** 스튜디오 에셋의 치수·종횡비·색온도·투명도·한영 토큰 어간을 분석해 결정론적 시맨틱 태그를 산출한다. */
export function inferStudioAssetSemanticTags(input: StudioAssetMultimodalInput): StudioAssetSemanticTagResult {
  const scores: Record<StudioAssetCategory, number> = {
    "3d-prop": 0.1,
    "vrm-outfit": 0.1,
    brush: 0.1,
    "panel-template": 0.1,
  };

  const ext = (
    input.fileExtension ?? (input.name.includes(".") ? `.${input.name.split(".").pop() ?? ""}` : "")
  ).toLowerCase();

  if (ext === ".glb" || ext === ".gltf" || ext === ".obj" || ext === ".fbx" || ext === ".skp") {
    scores["3d-prop"] += 2.6;
    scores["vrm-outfit"] += 0.7;
  } else if (ext === ".vrm" || ext === ".vrma") {
    scores["vrm-outfit"] += 3.4;
  } else if (ext === ".abr" || ext === ".sut" || ext === ".gbr") {
    scores.brush += 3.4;
  } else if (ext === ".svg" || ext === ".json") {
    scores["panel-template"] += 0.9;
  }

  const { colorTemperature, transparencyRatio } = resolveColorAndAlpha(input);
  const transparencyClass: AssetTransparencyClass =
    transparencyRatio < 0.05 ? "opaque" : transparencyRatio <= 0.45 ? "cutout-alpha" : "soft-translucent";

  let aspectProfile: AssetAspectProfile = "balanced";
  if (input.widthPx !== undefined && input.heightPx !== undefined && input.heightPx > 0) {
    const aspect = input.widthPx / input.heightPx;
    if (aspect <= 0.55 && input.heightPx >= 1200) {
      aspectProfile = "vertical-scroll";
      scores["panel-template"] += 2.6;
    } else if (aspect >= 0.82 && aspect <= 1.22 && input.widthPx <= 1024) {
      aspectProfile = "square-stamp";
      if (transparencyClass !== "opaque") scores.brush += 2.1;
    } else if (aspect >= 1.6) {
      aspectProfile = "landscape-wide";
    }
  }

  if (input.boundingBoxMeters !== undefined) {
    const { x, y, z } = input.boundingBoxMeters;
    const footprint = Math.max(0.01, Math.max(x, z));
    if (y / footprint >= 1.45 && y >= 0.35 && y <= 2.2) {
      aspectProfile = "humanoid-tall";
      scores["vrm-outfit"] += input.hasRiggedHumanoidBones ? 2.8 : 1.2;
      scores["3d-prop"] += 1.0;
    } else {
      scores["3d-prop"] += 2.2;
    }
  }

  if (input.hasRiggedHumanoidBones) scores["vrm-outfit"] += 2.6;
  if ((input.panelFrameCount ?? 0) >= 1) scores["panel-template"] += 2.8;
  if (transparencyClass === "soft-translucent") {
    scores.brush += 1.2;
    scores["vrm-outfit"] += 0.4;
  }

  const tokens = tokenizeStems(`${input.name} ${input.description ?? ""}`);
  const matchedStems: string[] = [];
  const subTagsKo = new Set<string>();
  const subTagsEn = new Set<string>();

  for (const group of STEM_GROUPS) {
    for (const stem of group.stems) {
      const hit = tokens.some((token) => token === stem || (stem.length >= 2 && token.includes(stem)));
      if (hit) {
        scores[group.category] += group.weight;
        matchedStems.push(stem);
        subTagsKo.add(group.subTagKo);
        subTagsEn.add(group.subTagEn);
        break;
      }
    }
  }

  const categories: readonly StudioAssetCategory[] = ["3d-prop", "vrm-outfit", "brush", "panel-template"];
  let bestCategory: StudioAssetCategory = "3d-prop";
  let bestScore = -1;
  let scoreSum = 0;
  for (const cat of categories) {
    scoreSum += scores[cat];
    if (scores[cat] > bestScore) {
      bestScore = scores[cat];
      bestCategory = cat;
    }
  }

  const categoryKoMap: Readonly<Record<StudioAssetCategory, string>> = {
    "3d-prop": "3D 소품", "vrm-outfit": "VRM 의상", brush: "브러시", "panel-template": "패널 템플릿",
  };
  const tempKoMap: Readonly<Record<AssetColorTemperature, string>> = {
    warm: "따뜻한 색감", cool: "차가운 색감", neutral: "중성 톤",
  };
  const tempEnMap: Readonly<Record<AssetColorTemperature, string>> = {
    warm: "warm-tone", cool: "cool-tone", neutral: "neutral-tone",
  };
  const alphaKoMap: Readonly<Record<AssetTransparencyClass, string>> = {
    opaque: "불투명 표면", "cutout-alpha": "알파 컷아웃", "soft-translucent": "반투명 알파",
  };

  return {
    category: bestCategory,
    confidence: scoreSum > 0 ? Math.min(0.99, bestScore / scoreSum) : 0.25,
    categoryScores: scores,
    colorTemperature,
    transparencyClass,
    aspectProfile,
    tagsKo: [...new Set([categoryKoMap[bestCategory], tempKoMap[colorTemperature], alphaKoMap[transparencyClass], ...subTagsKo])],
    tagsEn: [...new Set([bestCategory, tempEnMap[colorTemperature], transparencyClass, ...subTagsEn])],
    matchedTokenStems: [...new Set(matchedStems)],
  };
}
