/**
 * CVPR 2025 MangaNinja 방식의 레퍼런스 캐릭터 시트 + 사용자 포인트 힌트(Point-Guided Correspondence) 기반
 * 무침범(Leak-Free) 선화 자동 채색 엔진.
 *
 * 1. 선화 장벽 마스크 추출(`extractLineartBarrierMask`)과 4-연결 닫힌 영역 그래프(`segmentClosedLineartRegions`) 구축
 * 2. 레퍼런스 캐릭터 시트 패치 색상·명도 샘플링 및 사용자 포인트 힌트 매칭
 * 3. 포인트 힌트 가중 전파 + 미지정 닫힌 영역의 아핀 정렬 레퍼런스 대응 매칭
 * 4. 선화 경계 침범 0픽셀(Leak-Free) 밑색 및 옵션 1단 셀 명암 채색 + 자동 누수 감사(`auditLineartColorLeaks`)
 */

import type { RgbaImageBuffer } from "./seethrough-layer-decomposer-inpainter";

export interface PointCorrespondenceHint {
  readonly id?: string;
  readonly refX: number;
  readonly refY: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly weight?: number;
  readonly label?: string;
}

export interface MangaNinjaColorizeOptions {
  readonly lineartLuminanceThreshold?: number;
  readonly lineartAlphaThreshold?: number;
  readonly referenceInkLuminanceThreshold?: number;
  readonly patchRadius?: number;
  readonly enableCelShading?: boolean;
  readonly celShadowStrength?: number;
  readonly lightDirection?: { readonly x: number; readonly y: number };
  readonly propagateUnhintedRegions?: boolean;
  readonly preserveOuterBackground?: boolean;
}

export interface ClosedLineartRegion {
  readonly regionId: number;
  readonly pixelCount: number;
  readonly bbox: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number };
  readonly centroidX: number;
  readonly centroidY: number;
  readonly touchesCanvasBorder: boolean;
  readonly neighborRegionIds: ReadonlyArray<number>;
}

export interface LineartRegionGraph {
  readonly width: number;
  readonly height: number;
  readonly lineartMask: Uint8Array;
  readonly regionLabels: Int32Array;
  readonly lineartPixelCount: number;
  readonly regions: ReadonlyArray<ClosedLineartRegion>;
}

export interface AppliedPointHintSummary {
  readonly hintIndex: number;
  readonly id: string;
  readonly refX: number;
  readonly refY: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly targetRegionId: number;
  readonly snappedOffLineart: boolean;
  readonly sampledRgb: readonly [number, number, number];
  readonly sampledLuminance: number;
  readonly weight: number;
}

export type RegionColorSource =
  | "point-hint"
  | "reference-correspondence"
  | "graph-propagated"
  | "preserved-background";

export interface RegionColorAssignment {
  readonly regionId: number;
  readonly source: RegionColorSource;
  readonly baseRgb: readonly [number, number, number];
  readonly shadowRgb: readonly [number, number, number];
  readonly confidence: number;
  readonly hintCount: number;
}

export interface LineartLeakAuditReport {
  readonly totalLineartPixels: number;
  readonly mutatedLineartPixels: number;
  readonly crossBoundaryLeakPixels: number;
  readonly leakRatio: number;
  readonly passed: boolean;
}

export interface MangaNinjaColorizationResult {
  readonly colorizedImage: RgbaImageBuffer;
  readonly regionGraph: LineartRegionGraph;
  readonly appliedHints: ReadonlyArray<AppliedPointHintSummary>;
  readonly assignments: ReadonlyArray<RegionColorAssignment>;
  readonly leakAudit: LineartLeakAuditReport;
}

interface ReferencePatchSample {
  readonly rgb: readonly [number, number, number];
  readonly luminance: number;
}

interface HintProjectionModel {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

function clampByte(v: number): number {
  return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
}

function computeLuma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function rgbDistance(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function assertValidBuffer(image: RgbaImageBuffer, label: string): void {
  if (!Number.isInteger(image.width) || image.width <= 0) {
    throw new Error(`${label} width가 유효하지 않습니다: ${image.width}`);
  }
  if (!Number.isInteger(image.height) || image.height <= 0) {
    throw new Error(`${label} height가 유효하지 않습니다: ${image.height}`);
  }
  if (image.data.length !== image.width * image.height * 4) {
    throw new Error(`${label} RGBA 버퍼 길이가 크기와 일치하지 않습니다.`);
  }
}

/**
 * 선화 이미지에서 불변 잉크 장벽 픽셀을 추출한다.
 */
export function extractLineartBarrierMask(
  lineart: RgbaImageBuffer,
  options: { readonly lineartLuminanceThreshold?: number; readonly lineartAlphaThreshold?: number } = {},
): { readonly mask: Uint8Array; readonly lineartPixelCount: number } {
  assertValidBuffer(lineart, "lineart");
  const lumaThreshold = options.lineartLuminanceThreshold ?? 96;
  const alphaThreshold = options.lineartAlphaThreshold ?? 128;
  const count = lineart.width * lineart.height;
  const mask = new Uint8Array(count);
  let lineartPixelCount = 0;

  for (let i = 0; i < count; i += 1) {
    const p = i * 4;
    if (lineart.data[p + 3] < alphaThreshold) continue;
    if (computeLuma(lineart.data[p], lineart.data[p + 1], lineart.data[p + 2]) <= lumaThreshold) {
      mask[i] = 1;
      lineartPixelCount += 1;
    }
  }
  return { mask, lineartPixelCount };
}

/**
 * 4-연결 컴포넌트 기반으로 닫힌 선화 영역을 분할하고 선화 스트로크를 사이에 둔 영역 인접 그래프(RAG)를 구축한다.
 */
export function segmentClosedLineartRegions(
  lineart: RgbaImageBuffer,
  options: { readonly lineartLuminanceThreshold?: number; readonly lineartAlphaThreshold?: number } = {},
): LineartRegionGraph {
  const { width, height } = lineart;
  const count = width * height;
  const { mask: lineartMask, lineartPixelCount } = extractLineartBarrierMask(lineart, options);
  const regionLabels = new Int32Array(count).fill(-1);
  const queue = new Int32Array(count);

  const rawRegions: Array<{
    regionId: number;
    pixelCount: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    sumX: number;
    sumY: number;
    touchesCanvasBorder: boolean;
    neighbors: Set<number>;
  }> = [];

  for (let startIdx = 0; startIdx < count; startIdx += 1) {
    if (lineartMask[startIdx] === 1 || regionLabels[startIdx] !== -1) continue;
    const regionId = rawRegions.length;
    const entry = {
      regionId,
      pixelCount: 0,
      minX: width,
      minY: height,
      maxX: 0,
      maxY: 0,
      sumX: 0,
      sumY: 0,
      touchesCanvasBorder: false,
      neighbors: new Set<number>(),
    };

    let head = 0;
    let tail = 0;
    regionLabels[startIdx] = regionId;
    queue[tail] = startIdx;
    tail += 1;

    while (head < tail) {
      const idx = queue[head];
      head += 1;
      const x = idx % width;
      const y = Math.floor(idx / width);
      entry.pixelCount += 1;
      entry.sumX += x;
      entry.sumY += y;
      if (x < entry.minX) entry.minX = x;
      if (y < entry.minY) entry.minY = y;
      if (x > entry.maxX) entry.maxX = x;
      if (y > entry.maxY) entry.maxY = y;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) entry.touchesCanvasBorder = true;

      if (x > 0 && lineartMask[idx - 1] === 0 && regionLabels[idx - 1] === -1) {
        regionLabels[idx - 1] = regionId;
        queue[tail] = idx - 1;
        tail += 1;
      }
      if (x + 1 < width && lineartMask[idx + 1] === 0 && regionLabels[idx + 1] === -1) {
        regionLabels[idx + 1] = regionId;
        queue[tail] = idx + 1;
        tail += 1;
      }
      if (y > 0 && lineartMask[idx - width] === 0 && regionLabels[idx - width] === -1) {
        regionLabels[idx - width] = regionId;
        queue[tail] = idx - width;
        tail += 1;
      }
      if (y + 1 < height && lineartMask[idx + width] === 0 && regionLabels[idx + width] === -1) {
        regionLabels[idx + width] = regionId;
        queue[tail] = idx + width;
        tail += 1;
      }
    }
    rawRegions.push(entry);
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (lineartMask[y * width + x] === 0) continue;
      const nearby = new Set<number>();
      for (let dy = -2; dy <= 2; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -2; dx <= 2; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const label = regionLabels[ny * width + nx];
          if (label >= 0) nearby.add(label);
        }
      }
      if (nearby.size >= 2) {
        const ids = Array.from(nearby);
        for (let i = 0; i < ids.length; i += 1) {
          for (let j = i + 1; j < ids.length; j += 1) {
            rawRegions[ids[i]].neighbors.add(ids[j]);
            rawRegions[ids[j]].neighbors.add(ids[i]);
          }
        }
      }
    }
  }

  const regions: ClosedLineartRegion[] = rawRegions.map((item) => ({
    regionId: item.regionId,
    pixelCount: item.pixelCount,
    bbox: { minX: item.minX, minY: item.minY, maxX: item.maxX, maxY: item.maxY },
    centroidX: item.sumX / Math.max(1, item.pixelCount),
    centroidY: item.sumY / Math.max(1, item.pixelCount),
    touchesCanvasBorder: item.touchesCanvasBorder,
    neighborRegionIds: Array.from(item.neighbors).sort((a, b) => a - b),
  }));

  return { width, height, lineartMask, regionLabels, lineartPixelCount, regions };
}

function medianTriple(samples: ReadonlyArray<readonly [number, number, number]>): readonly [number, number, number] {
  const rs = samples.map((s) => s[0]).sort((a, b) => a - b);
  const gs = samples.map((s) => s[1]).sort((a, b) => a - b);
  const bs = samples.map((s) => s[2]).sort((a, b) => a - b);
  const mid = Math.floor(samples.length / 2);
  return [rs[mid], gs[mid], bs[mid]];
}

function sampleReferencePatchColor(
  reference: RgbaImageBuffer,
  cx: number,
  cy: number,
  patchRadius: number,
  inkLumaThreshold: number,
): ReferencePatchSample {
  const { width, height, data } = reference;
  const rx = Math.max(0, Math.min(width - 1, Math.round(cx)));
  const ry = Math.max(0, Math.min(height - 1, Math.round(cy)));
  const centerP = (ry * width + rx) * 4;
  const centerLuma = computeLuma(data[centerP], data[centerP + 1], data[centerP + 2]);
  const centerIsInk = data[centerP + 3] >= 128 && centerLuma <= inkLumaThreshold;
  const centerChroma =
    Math.max(data[centerP], data[centerP + 1], data[centerP + 2]) -
    Math.min(data[centerP], data[centerP + 1], data[centerP + 2]);
  const centerIsNonPaper = !centerIsInk && (centerChroma > 14 || centerLuma < 245);

  const nonInkSamples: Array<readonly [number, number, number]> = [];
  const chromaticSamples: Array<readonly [number, number, number]> = [];

  for (let dy = -patchRadius; dy <= patchRadius; dy += 1) {
    const y = ry + dy;
    if (y < 0 || y >= height) continue;
    for (let dx = -patchRadius; dx <= patchRadius; dx += 1) {
      const x = rx + dx;
      if (x < 0 || x >= width) continue;
      const p = (y * width + x) * 4;
      if (data[p + 3] < 128) continue;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const luma = computeLuma(r, g, b);
      if (luma <= inkLumaThreshold) continue;
      const triple: readonly [number, number, number] = [r, g, b];
      nonInkSamples.push(triple);
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      if (chroma > 14 || luma < 245) chromaticSamples.push(triple);
    }
  }

  // 윤곽선 위 또는 채색 영역 내부 경계 근처 클릭 시 바깥 흰 종이 배경 오염을 배제하고 순수 채색 색상을 우선 추출한다.
  if ((centerIsInk || centerIsNonPaper) && chromaticSamples.length > 0) {
    const rgb = medianTriple(chromaticSamples);
    return { rgb, luminance: computeLuma(rgb[0], rgb[1], rgb[2]) };
  }
  if (nonInkSamples.length > 0) {
    const rgb = medianTriple(nonInkSamples);
    return { rgb, luminance: computeLuma(rgb[0], rgb[1], rgb[2]) };
  }
  const rgb: readonly [number, number, number] = [data[centerP], data[centerP + 1], data[centerP + 2]];
  return { rgb, luminance: computeLuma(rgb[0], rgb[1], rgb[2]) };
}

function locateTargetRegionForPoint(
  graph: LineartRegionGraph,
  targetX: number,
  targetY: number,
): { readonly regionId: number; readonly snappedOffLineart: boolean } {
  const tx = Math.max(0, Math.min(graph.width - 1, Math.round(targetX)));
  const ty = Math.max(0, Math.min(graph.height - 1, Math.round(targetY)));
  const direct = graph.regionLabels[ty * graph.width + tx];
  if (direct >= 0) return { regionId: direct, snappedOffLineart: false };

  let bestRegion = -1;
  let bestDistSq = Number.POSITIVE_INFINITY;
  for (let radius = 1; radius <= 3; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      const y = ty + dy;
      if (y < 0 || y >= graph.height) continue;
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = tx + dx;
        if (x < 0 || x >= graph.width) continue;
        const label = graph.regionLabels[y * graph.width + x];
        if (label >= 0) {
          const dSq = dx * dx + dy * dy;
          if (dSq < bestDistSq) { bestDistSq = dSq; bestRegion = label; }
        }
      }
    }
    if (bestRegion >= 0) break;
  }
  return { regionId: bestRegion, snappedOffLineart: true };
}

function fitHintProjectionModel(
  appliedHints: ReadonlyArray<AppliedPointHintSummary>,
  targetW: number,
  targetH: number,
  refW: number,
  refH: number,
): HintProjectionModel {
  const defaultSx = refW / targetW;
  const defaultSy = refH / targetH;
  if (appliedHints.length === 0) return { offsetX: 0, offsetY: 0, scaleX: defaultSx, scaleY: defaultSy };
  if (appliedHints.length === 1) {
    const h = appliedHints[0];
    return {
      scaleX: defaultSx,
      scaleY: defaultSy,
      offsetX: h.refX - h.targetX * defaultSx,
      offsetY: h.refY - h.targetY * defaultSy,
    };
  }

  let meanTx = 0;
  let meanTy = 0;
  let meanRx = 0;
  let meanRy = 0;
  for (const h of appliedHints) {
    meanTx += h.targetX;
    meanTy += h.targetY;
    meanRx += h.refX;
    meanRy += h.refY;
  }
  const n = appliedHints.length;
  meanTx /= n;
  meanTy /= n;
  meanRx /= n;
  meanRy /= n;

  let covX = 0;
  let varTx = 0;
  let covY = 0;
  let varTy = 0;
  for (const h of appliedHints) {
    const dtx = h.targetX - meanTx;
    const dty = h.targetY - meanTy;
    covX += dtx * (h.refX - meanRx);
    varTx += dtx * dtx;
    covY += dty * (h.refY - meanRy);
    varTy += dty * dty;
  }
  const scaleX = varTx > 4 ? Math.max(0.25, Math.min(4.0, covX / varTx)) : defaultSx;
  const scaleY = varTy > 4 ? Math.max(0.25, Math.min(4.0, covY / varTy)) : defaultSy;
  return { scaleX, scaleY, offsetX: meanRx - meanTx * scaleX, offsetY: meanRy - meanTy * scaleY };
}

function computeCelShadowRgb(
  baseRgb: readonly [number, number, number],
  strength: number,
): readonly [number, number, number] {
  if (strength <= 0) return baseRgb;
  return [
    clampByte(baseRgb[0] * Math.max(0.2, 1 - strength * 1.12)),
    clampByte(baseRgb[1] * Math.max(0.2, 1 - strength * 1.04)),
    clampByte(baseRgb[2] * Math.max(0.2, 1 - strength * 0.84)),
  ];
}

/**
 * 채색 결과 이미지에서 선화 장벽 변조(0픽셀) 및 포인트 힌트 지정 영역 간 색상 누수(0픽셀)를 감사한다.
 */
export function auditLineartColorLeaks(
  originalLineart: RgbaImageBuffer,
  colorized: RgbaImageBuffer,
  regionGraph: LineartRegionGraph,
  assignments: ReadonlyArray<RegionColorAssignment>,
): LineartLeakAuditReport {
  const count = originalLineart.width * originalLineart.height;
  const assignmentById = new Map<number, RegionColorAssignment>();
  for (const item of assignments) assignmentById.set(item.regionId, item);

  let mutatedLineartPixels = 0;
  let crossBoundaryLeakPixels = 0;
  let nonLineartChecked = 0;

  for (let i = 0; i < count; i += 1) {
    const p = i * 4;
    if (regionGraph.lineartMask[i] === 1) {
      if (
        originalLineart.data[p] !== colorized.data[p] ||
        originalLineart.data[p + 1] !== colorized.data[p + 1] ||
        originalLineart.data[p + 2] !== colorized.data[p + 2] ||
        originalLineart.data[p + 3] !== colorized.data[p + 3]
      ) {
        mutatedLineartPixels += 1;
      }
      continue;
    }

    const assignment = assignmentById.get(regionGraph.regionLabels[i]);
    if (!assignment) continue;
    nonLineartChecked += 1;
    const pixelRgb: readonly [number, number, number] = [
      colorized.data[p],
      colorized.data[p + 1],
      colorized.data[p + 2],
    ];
    if (
      assignment.hintCount <= 1 &&
      Math.min(rgbDistance(pixelRgb, assignment.baseRgb), rgbDistance(pixelRgb, assignment.shadowRgb)) > 1.5
    ) {
      crossBoundaryLeakPixels += 1;
    }
  }

  const totalChecked = nonLineartChecked + regionGraph.lineartPixelCount;
  const leakRatio = totalChecked > 0 ? (mutatedLineartPixels + crossBoundaryLeakPixels) / totalChecked : 0;
  return {
    totalLineartPixels: regionGraph.lineartPixelCount,
    mutatedLineartPixels,
    crossBoundaryLeakPixels,
    leakRatio,
    passed: mutatedLineartPixels === 0 && crossBoundaryLeakPixels === 0,
  };
}

/**
 * 레퍼런스 캐릭터 시트와 사용자 포인트 힌트를 기반으로 닫힌 선화 영역을 경계 침범 0%로 자동 채색한다.
 */
export function colorizeLineartFromReferencePoints(
  lineart: RgbaImageBuffer,
  reference: RgbaImageBuffer,
  pointHints: ReadonlyArray<PointCorrespondenceHint>,
  options: MangaNinjaColorizeOptions = {},
): MangaNinjaColorizationResult {
  assertValidBuffer(lineart, "lineart");
  assertValidBuffer(reference, "reference");

  const patchRadius = Math.max(0, Math.min(6, options.patchRadius ?? 2));
  const refInkThreshold = options.referenceInkLuminanceThreshold ?? 36;
  const celShadowStrength =
    options.enableCelShading === true ? Math.max(0, Math.min(0.45, options.celShadowStrength ?? 0.18)) : 0;
  const propagateUnhinted = options.propagateUnhintedRegions ?? true;
  const preserveOuterBackground = options.preserveOuterBackground ?? true;

  const rawLight = options.lightDirection ?? { x: -0.6, y: -0.8 };
  const lightLen = Math.hypot(rawLight.x, rawLight.y) || 1;
  const lightDirX = rawLight.x / lightLen;
  const lightDirY = rawLight.y / lightLen;

  const regionGraph = segmentClosedLineartRegions(lineart, {
    lineartLuminanceThreshold: options.lineartLuminanceThreshold,
    lineartAlphaThreshold: options.lineartAlphaThreshold,
  });

  const appliedHints: AppliedPointHintSummary[] = [];
  const hintsByRegion = new Map<number, AppliedPointHintSummary[]>();

  for (let i = 0; i < pointHints.length; i += 1) {
    const hint = pointHints[i];
    const weight = Math.max(0.01, hint.weight ?? 1.0);
    const sampled = sampleReferencePatchColor(reference, hint.refX, hint.refY, patchRadius, refInkThreshold);
    const located = locateTargetRegionForPoint(regionGraph, hint.targetX, hint.targetY);
    const summary: AppliedPointHintSummary = {
      hintIndex: i,
      id: hint.id ?? `hint-${i + 1}`,
      refX: hint.refX,
      refY: hint.refY,
      targetX: hint.targetX,
      targetY: hint.targetY,
      targetRegionId: located.regionId,
      snappedOffLineart: located.snappedOffLineart,
      sampledRgb: sampled.rgb,
      sampledLuminance: sampled.luminance,
      weight,
    };
    appliedHints.push(summary);
    if (located.regionId >= 0) {
      const bucket = hintsByRegion.get(located.regionId);
      if (bucket) bucket.push(summary);
      else hintsByRegion.set(located.regionId, [summary]);
    }
  }

  const validHints = appliedHints.filter((h) => h.targetRegionId >= 0);
  const projection = fitHintProjectionModel(validHints, lineart.width, lineart.height, reference.width, reference.height);
  const assignmentByRegion = new Map<number, RegionColorAssignment>();

  for (const region of regionGraph.regions) {
    const regionHints = hintsByRegion.get(region.regionId);
    if (regionHints && regionHints.length > 0) {
      let sumW = 0;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      for (const h of regionHints) {
        sumW += h.weight;
        sumR += h.sampledRgb[0] * h.weight;
        sumG += h.sampledRgb[1] * h.weight;
        sumB += h.sampledRgb[2] * h.weight;
      }
      const baseRgb: readonly [number, number, number] = [
        clampByte(sumR / sumW),
        clampByte(sumG / sumW),
        clampByte(sumB / sumW),
      ];
      assignmentByRegion.set(region.regionId, {
        regionId: region.regionId,
        source: "point-hint",
        baseRgb,
        shadowRgb: computeCelShadowRgb(baseRgb, celShadowStrength),
        confidence: 1.0,
        hintCount: regionHints.length,
      });
      continue;
    }

    if (preserveOuterBackground && region.touchesCanvasBorder) {
      const cIdx = Math.round(region.centroidY) * lineart.width + Math.round(region.centroidX);
      const fallbackIdx =
        regionGraph.regionLabels[cIdx] === region.regionId
          ? cIdx
          : region.bbox.minY * lineart.width + region.bbox.minX;
      const p = fallbackIdx * 4;
      const bgRgb: readonly [number, number, number] =
        lineart.data[p + 3] >= 128
          ? [lineart.data[p], lineart.data[p + 1], lineart.data[p + 2]]
          : [255, 255, 255];
      assignmentByRegion.set(region.regionId, {
        regionId: region.regionId,
        source: "preserved-background",
        baseRgb: bgRgb,
        shadowRgb: bgRgb,
        confidence: 1.0,
        hintCount: 0,
      });
      continue;
    }

    if (!propagateUnhinted) {
      const white: readonly [number, number, number] = [255, 255, 255];
      assignmentByRegion.set(region.regionId, {
        regionId: region.regionId,
        source: "preserved-background",
        baseRgb: white,
        shadowRgb: white,
        confidence: 0,
        hintCount: 0,
      });
      continue;
    }

    const projectedRefX = region.centroidX * projection.scaleX + projection.offsetX;
    const projectedRefY = region.centroidY * projection.scaleY + projection.offsetY;
    if (
      projectedRefX >= 0 &&
      projectedRefX < reference.width &&
      projectedRefY >= 0 &&
      projectedRefY < reference.height
    ) {
      const refSample = sampleReferencePatchColor(reference, projectedRefX, projectedRefY, patchRadius, refInkThreshold);
      assignmentByRegion.set(region.regionId, {
        regionId: region.regionId,
        source: "reference-correspondence",
        baseRgb: refSample.rgb,
        shadowRgb: computeCelShadowRgb(refSample.rgb, celShadowStrength),
        confidence: validHints.length > 0 ? 0.85 : 0.7,
        hintCount: 0,
      });
    } else if (validHints.length > 0) {
      let sumW = 0;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      for (const h of validHints) {
        const dSq =
          (region.centroidX - h.targetX) * (region.centroidX - h.targetX) +
          (region.centroidY - h.targetY) * (region.centroidY - h.targetY);
        const w = h.weight / (1 + dSq * 0.01);
        sumW += w;
        sumR += h.sampledRgb[0] * w;
        sumG += h.sampledRgb[1] * w;
        sumB += h.sampledRgb[2] * w;
      }
      const propRgb: readonly [number, number, number] = [
        clampByte(sumR / sumW),
        clampByte(sumG / sumW),
        clampByte(sumB / sumW),
      ];
      assignmentByRegion.set(region.regionId, {
        regionId: region.regionId,
        source: "graph-propagated",
        baseRgb: propRgb,
        shadowRgb: computeCelShadowRgb(propRgb, celShadowStrength),
        confidence: 0.65,
        hintCount: 0,
      });
    } else {
      const white: readonly [number, number, number] = [255, 255, 255];
      assignmentByRegion.set(region.regionId, {
        regionId: region.regionId,
        source: "preserved-background",
        baseRgb: white,
        shadowRgb: white,
        confidence: 0,
        hintCount: 0,
      });
    }
  }

  const outData = new Uint8ClampedArray(lineart.data.length);
  const { width, height } = lineart;
  const regionById = new Map<number, ClosedLineartRegion>();
  for (const r of regionGraph.regions) regionById.set(r.regionId, r);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const p = idx * 4;
      if (regionGraph.lineartMask[idx] === 1) {
        outData.set(lineart.data.subarray(p, p + 4), p);
        continue;
      }

      const regionId = regionGraph.regionLabels[idx];
      const assignment = assignmentByRegion.get(regionId);
      const region = regionById.get(regionId);
      if (!assignment || !region) {
        outData.set(lineart.data.subarray(p, p + 4), p);
        continue;
      }

      let rgb = assignment.baseRgb;
      const regionHints = hintsByRegion.get(regionId);
      if (regionHints && regionHints.length >= 2) {
        let sumW = 0;
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        for (const h of regionHints) {
          const dSq = (x - h.targetX) * (x - h.targetX) + (y - h.targetY) * (y - h.targetY);
          const w = h.weight / (0.25 + dSq);
          sumW += w;
          sumR += h.sampledRgb[0] * w;
          sumG += h.sampledRgb[1] * w;
          sumB += h.sampledRgb[2] * w;
        }
        rgb = [clampByte(sumR / sumW), clampByte(sumG / sumW), clampByte(sumB / sumW)];
      } else if (celShadowStrength > 0 && assignment.source !== "preserved-background") {
        const halfW = Math.max(1, (region.bbox.maxX - region.bbox.minX) * 0.5);
        const halfH = Math.max(1, (region.bbox.maxY - region.bbox.minY) * 0.5);
        const projAlongShadow = -(
          ((x - region.centroidX) / halfW) * lightDirX +
          ((y - region.centroidY) / halfH) * lightDirY
        );
        if (projAlongShadow > 0.35) rgb = assignment.shadowRgb;
      }

      outData[p] = rgb[0];
      outData[p + 1] = rgb[1];
      outData[p + 2] = rgb[2];
      outData[p + 3] = 255;
    }
  }

  const colorizedImage: RgbaImageBuffer = { width, height, data: outData };
  const assignments = regionGraph.regions
    .map((r) => assignmentByRegion.get(r.regionId))
    .filter((item): item is RegionColorAssignment => item !== undefined);
  const leakAudit = auditLineartColorLeaks(lineart, colorizedImage, regionGraph, assignments);

  return { colorizedImage, regionGraph, appliedHints, assignments, leakAudit };
}
