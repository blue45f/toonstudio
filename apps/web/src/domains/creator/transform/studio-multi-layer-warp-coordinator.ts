/**
 * CSP 3.0–4.0 복수 레이어 동시 변형(Liquify · Puppet Warp · 메쉬 · 코너핀) 코디네이터.
 *
 * 선화·밑색·음영·효과 레이어를 하나의 공유 바운딩 박스 좌표계로 묶어
 * 유동화 변위 필드, 퍼핏 핀 변형, N×M 제어 격자, 4점 원근 호모그래피를
 * 정합 오차 없이 동시에 적용하고 단일 원자적 실행취소(Undo) 묶음으로 반환한다.
 */

import {
  applyLiquifyDisplacement,
  buildLiquifyDisplacementField,
  normalizeStudioLiquifyMode,
  type LiquifyDisplacementOptions,
  type LiquifyPixelPoint,
  type StudioLiquifyMode,
} from "../studio-liquify";
import {
  applyCornerPinTransform,
  solveHomography8Dof,
  validateCornerPinQuad,
  type CornerPinDistortMode,
  type CornerPinQuad,
  type QuadValidationResult,
} from "./studio-corner-pin-transform";
import {
  buildPuppetLatticeMesh,
  deformPuppetMesh,
  rasterizePuppetWarpedBuffer,
  type PuppetPin,
} from "./studio-puppet-warp";
import {
  applyRasterMeshTransform,
  type RasterMeshLattice,
} from "./studio-raster-mesh-transform";

import type { StudioImageDataLike } from "../studio-filters";

export type MultiLayerWarpOperationKind = "liquify" | "puppet" | "mesh" | "corner-pin";

export type MultiLayerWarpScope = "selected" | "linked" | "folder";

export type MultiLayerWarpRole = "lineart" | "flat" | "shadow" | "effect" | "raster";

export interface MultiLayerWarpLayerInput {
  readonly id: string;
  readonly name: string;
  readonly image: StudioImageDataLike;
  /** 문서 좌표계 기준 레이어 좌상단 X(px). */
  readonly offsetX: number;
  /** 문서 좌표계 기준 레이어 좌상단 Y(px). */
  readonly offsetY: number;
  readonly locked?: boolean;
  readonly visible?: boolean;
  readonly opacity?: number;
  readonly role?: MultiLayerWarpRole;
  readonly folderId?: string;
  readonly linkedGroupId?: string;
}

export interface MultiLayerUnionBounds {
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
}

export type MultiLayerWarpSkipReason =
  | "locked"
  | "hidden"
  | "empty-buffer"
  | "outside-scope";

export interface MultiLayerWarpSkippedEntry {
  readonly layerId: string;
  readonly name: string;
  readonly reason: MultiLayerWarpSkipReason;
}

export interface MultiLayerWarpSelectionOptions {
  readonly scope?: MultiLayerWarpScope;
  readonly targetIds?: ReadonlySet<string> | readonly string[];
  readonly folderId?: string;
  readonly linkedGroupId?: string;
  readonly includeHidden?: boolean;
  readonly skipLocked?: boolean;
}

export interface MultiLayerWarpLayerResult {
  readonly layerId: string;
  readonly name: string;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly image: StudioImageDataLike;
  readonly changedPixels: number;
}

export interface MultiLayerWarpBatchResult {
  readonly ok: boolean;
  readonly operation: MultiLayerWarpOperationKind;
  readonly bounds: MultiLayerUnionBounds | null;
  readonly results: readonly MultiLayerWarpLayerResult[];
  readonly skipped: readonly MultiLayerWarpSkippedEntry[];
  readonly changedLayerCount: number;
  readonly errorReason?: string;
}

export interface MultiLayerWarpCommitPlan {
  readonly labelKo: string;
  readonly operation: MultiLayerWarpOperationKind;
  readonly affectedLayerIds: readonly string[];
  readonly beforeByLayerId: Readonly<Record<string, StudioImageDataLike>>;
  readonly afterByLayerId: Readonly<Record<string, StudioImageDataLike>>;
}

export interface MultiLayerLiquifyParams {
  /** 공유 바운딩 박스 기준 스트로크 좌표열(px). */
  readonly points: readonly LiquifyPixelPoint[];
  readonly radiusPx: number;
  /** 0..1 정규화 강도. */
  readonly strength: number;
  readonly mode?: StudioLiquifyMode;
  readonly options?: LiquifyDisplacementOptions;
  readonly selection?: MultiLayerWarpSelectionOptions;
}

export interface MultiLayerPuppetParams {
  /** 공유 바운딩 박스 기준 퍼핏 핀 목록. */
  readonly pins: readonly PuppetPin[];
  readonly influenceRadiusPx?: number;
  readonly gridCols?: number;
  readonly gridRows?: number;
  readonly selection?: MultiLayerWarpSelectionOptions;
}

export interface MultiLayerMeshParams {
  /** 공유 바운딩 박스 기준 제어 격자. */
  readonly lattice: RasterMeshLattice;
  readonly selection?: MultiLayerWarpSelectionOptions;
}

export interface MultiLayerCornerPinParams {
  /** 공유 바운딩 박스 기준 목표 4점 사각형. */
  readonly destinationQuad: CornerPinQuad;
  readonly distortMode?: CornerPinDistortMode;
  readonly selection?: MultiLayerWarpSelectionOptions;
}

function isValidImageBuffer(image: StudioImageDataLike): boolean {
  return (
    Number.isFinite(image.width) &&
    Number.isFinite(image.height) &&
    image.width > 0 &&
    image.height > 0 &&
    image.data.length >= image.width * image.height * 4
  );
}

function cloneImageDataLike(image: StudioImageDataLike): StudioImageDataLike {
  return {
    width: image.width,
    height: image.height,
    data: new Uint8ClampedArray(image.data),
  };
}

function countChangedPixels(
  before: StudioImageDataLike,
  after: StudioImageDataLike,
): number {
  const len = Math.min(before.data.length, after.data.length);
  let changed = 0;
  for (let i = 0; i + 3 < len; i += 4) {
    if (
      before.data[i] !== after.data[i] ||
      before.data[i + 1] !== after.data[i + 1] ||
      before.data[i + 2] !== after.data[i + 2] ||
      before.data[i + 3] !== after.data[i + 3]
    ) {
      changed += 1;
    }
  }
  return changed;
}

function toIdSet(
  ids?: ReadonlySet<string> | readonly string[],
): ReadonlySet<string> | null {
  if (!ids) return null;
  if (ids instanceof Set) return ids;
  return new Set(ids);
}

/**
 * 다중 레이어 변형 대상 목록에서 잠금·숨김·빈 버퍼·범위 외 레이어를 분리한다.
 */
export function selectEligibleWarpLayers(
  layers: readonly MultiLayerWarpLayerInput[],
  options: MultiLayerWarpSelectionOptions = {},
): {
  readonly eligible: readonly MultiLayerWarpLayerInput[];
  readonly skipped: readonly MultiLayerWarpSkippedEntry[];
} {
  const scope = options.scope ?? "selected";
  const targetIdSet = toIdSet(options.targetIds);
  const skipLocked = options.skipLocked !== false;
  const includeHidden = options.includeHidden === true;

  const eligible: MultiLayerWarpLayerInput[] = [];
  const skipped: MultiLayerWarpSkippedEntry[] = [];

  for (const layer of layers) {
    let inScope = true;
    if (scope === "selected" && targetIdSet) {
      inScope = targetIdSet.has(layer.id);
    } else if (scope === "folder" && options.folderId) {
      inScope = layer.folderId === options.folderId;
    } else if (scope === "linked" && options.linkedGroupId) {
      inScope = layer.linkedGroupId === options.linkedGroupId;
    }

    if (!inScope) {
      skipped.push({ layerId: layer.id, name: layer.name, reason: "outside-scope" });
      continue;
    }
    if (skipLocked && layer.locked === true) {
      skipped.push({ layerId: layer.id, name: layer.name, reason: "locked" });
      continue;
    }
    if (!includeHidden && layer.visible === false) {
      skipped.push({ layerId: layer.id, name: layer.name, reason: "hidden" });
      continue;
    }
    if (!isValidImageBuffer(layer.image)) {
      skipped.push({ layerId: layer.id, name: layer.name, reason: "empty-buffer" });
      continue;
    }
    eligible.push(layer);
  }

  return {
    eligible: Object.freeze(eligible),
    skipped: Object.freeze(skipped),
  };
}

/**
 * 대상 레이어 전체를 감싸는 공유 문서 바운딩 박스를 계산한다.
 */
export function computeMultiLayerUnionBounds(
  layers: readonly MultiLayerWarpLayerInput[],
): MultiLayerUnionBounds | null {
  if (layers.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const layer of layers) {
    if (!isValidImageBuffer(layer.image)) continue;
    const ox = Math.round(Number.isFinite(layer.offsetX) ? layer.offsetX : 0);
    const oy = Math.round(Number.isFinite(layer.offsetY) ? layer.offsetY : 0);
    if (ox < minX) minX = ox;
    if (oy < minY) minY = oy;
    if (ox + layer.image.width > maxX) maxX = ox + layer.image.width;
    if (oy + layer.image.height > maxY) maxY = oy + layer.image.height;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || maxX <= minX || maxY <= minY) {
    return null;
  }

  return Object.freeze({
    originX: minX,
    originY: minY,
    width: maxX - minX,
    height: maxY - minY,
  });
}

/**
 * CSP 3.0+ 복수 레이어 동시 Liquify — 공유 변위 필드를 한 번 계산해 모든 대상 레이어에 정합 적용한다.
 */
export function applyMultiLayerLiquify(
  layers: readonly MultiLayerWarpLayerInput[],
  params: MultiLayerLiquifyParams,
): MultiLayerWarpBatchResult {
  const { eligible, skipped } = selectEligibleWarpLayers(layers, params.selection);
  const bounds = computeMultiLayerUnionBounds(eligible);
  if (!bounds || eligible.length === 0) {
    return {
      ok: false,
      operation: "liquify",
      bounds: null,
      results: [],
      skipped,
      changedLayerCount: 0,
      errorReason: "변형할 유효한 레이어가 없습니다.",
    };
  }

  const mode = normalizeStudioLiquifyMode(params.mode ?? params.options?.mode);
  const field = buildLiquifyDisplacementField(
    params.points,
    params.radiusPx,
    params.strength,
    bounds.width,
    bounds.height,
    { ...params.options, mode },
  );

  if (!field) {
    return {
      ok: false,
      operation: "liquify",
      bounds,
      results: [],
      skipped,
      changedLayerCount: 0,
      errorReason: "유효한 유동화 변위 필드를 생성하지 못했습니다.",
    };
  }

  const results: MultiLayerWarpLayerResult[] = [];
  let changedLayerCount = 0;

  for (const layer of eligible) {
    const src = layer.image;
    const dst = cloneImageDataLike(src);
    const localOriginX = Math.round(layer.offsetX) - bounds.originX;
    const localOriginY = Math.round(layer.offsetY) - bounds.originY;

    applyLiquifyDisplacement(src, dst, field, {
      signal: params.options?.signal,
      region: {
        originX: localOriginX,
        originY: localOriginY,
        canvasWidth: bounds.width,
        canvasHeight: bounds.height,
      },
    });

    const changedPixels = countChangedPixels(src, dst);
    if (changedPixels > 0) changedLayerCount += 1;
    results.push({
      layerId: layer.id,
      name: layer.name,
      offsetX: layer.offsetX,
      offsetY: layer.offsetY,
      image: dst,
      changedPixels,
    });
  }

  return {
    ok: true,
    operation: "liquify",
    bounds,
    results: Object.freeze(results),
    skipped,
    changedLayerCount,
  };
}

/**
 * CSP 4.0 복수 레이어 동시 Puppet Warp — 공유 핀 집합을 각 레이어 로컬 좌표로 투영해 동시 변형한다.
 */
export function applyMultiLayerPuppetWarp(
  layers: readonly MultiLayerWarpLayerInput[],
  params: MultiLayerPuppetParams,
): MultiLayerWarpBatchResult {
  const { eligible, skipped } = selectEligibleWarpLayers(layers, params.selection);
  const bounds = computeMultiLayerUnionBounds(eligible);
  if (!bounds || eligible.length === 0) {
    return {
      ok: false,
      operation: "puppet",
      bounds: null,
      results: [],
      skipped,
      changedLayerCount: 0,
      errorReason: "퍼핏 변형을 적용할 레이어가 없습니다.",
    };
  }

  const radius = Math.max(1, params.influenceRadiusPx ?? 120);
  const gridCols = params.gridCols ?? 10;
  const gridRows = params.gridRows ?? 10;
  const results: MultiLayerWarpLayerResult[] = [];
  let changedLayerCount = 0;

  for (const layer of eligible) {
    const relX = Math.round(layer.offsetX) - bounds.originX;
    const relY = Math.round(layer.offsetY) - bounds.originY;
    const localPins: PuppetPin[] = params.pins.map((pin) => ({
      ...pin,
      x: pin.x - relX,
      y: pin.y - relY,
      restX: pin.restX - relX,
      restY: pin.restY - relY,
    }));

    const baseMesh = buildPuppetLatticeMesh(
      layer.image.width,
      layer.image.height,
      gridCols,
      gridRows,
    );
    const deformedMesh = deformPuppetMesh(baseMesh, localPins, radius);
    const warpedData = rasterizePuppetWarpedBuffer(
      layer.image.data,
      layer.image.width,
      layer.image.height,
      deformedMesh,
      localPins,
    );
    const nextImage: StudioImageDataLike = {
      width: layer.image.width,
      height: layer.image.height,
      data: warpedData,
    };

    const changedPixels = countChangedPixels(layer.image, nextImage);
    if (changedPixels > 0) changedLayerCount += 1;
    results.push({
      layerId: layer.id,
      name: layer.name,
      offsetX: layer.offsetX,
      offsetY: layer.offsetY,
      image: nextImage,
      changedPixels,
    });
  }

  return {
    ok: true,
    operation: "puppet",
    bounds,
    results: Object.freeze(results),
    skipped,
    changedLayerCount,
  };
}

/**
 * 복수 레이어 동시 메쉬 변형 — 공유 제어 격자를 각 레이어 로컬 좌표로 이동해 일괄 워프한다.
 */
export function applyMultiLayerMeshWarp(
  layers: readonly MultiLayerWarpLayerInput[],
  params: MultiLayerMeshParams,
): MultiLayerWarpBatchResult {
  const { eligible, skipped } = selectEligibleWarpLayers(layers, params.selection);
  const bounds = computeMultiLayerUnionBounds(eligible);
  if (!bounds || eligible.length === 0) {
    return {
      ok: false,
      operation: "mesh",
      bounds: null,
      results: [],
      skipped,
      changedLayerCount: 0,
      errorReason: "메쉬 변형을 적용할 레이어가 없습니다.",
    };
  }

  const results: MultiLayerWarpLayerResult[] = [];
  let changedLayerCount = 0;

  for (const layer of eligible) {
    const relX = Math.round(layer.offsetX) - bounds.originX;
    const relY = Math.round(layer.offsetY) - bounds.originY;
    const localLattice: RasterMeshLattice = {
      width: layer.image.width,
      height: layer.image.height,
      rows: params.lattice.rows,
      cols: params.lattice.cols,
      nodes: params.lattice.nodes.map((node) => ({
        row: node.row,
        col: node.col,
        restX: node.restX - relX,
        restY: node.restY - relY,
        x: node.x - relX,
        y: node.y - relY,
      })),
    };

    const nextImage = applyRasterMeshTransform(layer.image, localLattice, {
      outputWidth: layer.image.width,
      outputHeight: layer.image.height,
    });
    const changedPixels = countChangedPixels(layer.image, nextImage);
    if (changedPixels > 0) changedLayerCount += 1;

    results.push({
      layerId: layer.id,
      name: layer.name,
      offsetX: layer.offsetX,
      offsetY: layer.offsetY,
      image: nextImage,
      changedPixels,
    });
  }

  return {
    ok: true,
    operation: "mesh",
    bounds,
    results: Object.freeze(results),
    skipped,
    changedLayerCount,
  };
}

/**
 * 복수 레이어 동시 4점 원근·코너핀 변형 — 공유 호모그래피로 모든 레이어를 동일한 투시 평면에 정합한다.
 */
export function applyMultiLayerCornerPin(
  layers: readonly MultiLayerWarpLayerInput[],
  params: MultiLayerCornerPinParams,
): MultiLayerWarpBatchResult & { readonly validation?: QuadValidationResult } {
  const { eligible, skipped } = selectEligibleWarpLayers(layers, params.selection);
  const bounds = computeMultiLayerUnionBounds(eligible);
  if (!bounds || eligible.length === 0) {
    return {
      ok: false,
      operation: "corner-pin",
      bounds: null,
      results: [],
      skipped,
      changedLayerCount: 0,
      errorReason: "원근 변형을 적용할 레이어가 없습니다.",
    };
  }

  const validation = validateCornerPinQuad(params.destinationQuad);
  if (!validation.valid) {
    return {
      ok: false,
      operation: "corner-pin",
      bounds,
      results: [],
      skipped,
      changedLayerCount: 0,
      validation,
      errorReason: "자가교차하거나 오목한 사각형은 변형할 수 없습니다.",
    };
  }

  const unionSourceQuad: CornerPinQuad = {
    topLeft: { x: 0, y: 0 },
    topRight: { x: Math.max(1, bounds.width - 1), y: 0 },
    bottomRight: { x: Math.max(1, bounds.width - 1), y: Math.max(1, bounds.height - 1) },
    bottomLeft: { x: 0, y: Math.max(1, bounds.height - 1) },
  };

  if (!solveHomography8Dof(unionSourceQuad, params.destinationQuad)) {
    return {
      ok: false,
      operation: "corner-pin",
      bounds,
      results: [],
      skipped,
      changedLayerCount: 0,
      validation,
      errorReason: "원근 사영 행렬을 풀 수 없습니다.",
    };
  }

  const results: MultiLayerWarpLayerResult[] = [];
  let changedLayerCount = 0;

  for (const layer of eligible) {
    const relX = Math.round(layer.offsetX) - bounds.originX;
    const relY = Math.round(layer.offsetY) - bounds.originY;
    const localSrcQuad: CornerPinQuad = {
      topLeft: { x: unionSourceQuad.topLeft.x - relX, y: unionSourceQuad.topLeft.y - relY },
      topRight: { x: unionSourceQuad.topRight.x - relX, y: unionSourceQuad.topRight.y - relY },
      bottomRight: {
        x: unionSourceQuad.bottomRight.x - relX,
        y: unionSourceQuad.bottomRight.y - relY,
      },
      bottomLeft: {
        x: unionSourceQuad.bottomLeft.x - relX,
        y: unionSourceQuad.bottomLeft.y - relY,
      },
    };
    const localDstQuad: CornerPinQuad = {
      topLeft: {
        x: params.destinationQuad.topLeft.x - relX,
        y: params.destinationQuad.topLeft.y - relY,
      },
      topRight: {
        x: params.destinationQuad.topRight.x - relX,
        y: params.destinationQuad.topRight.y - relY,
      },
      bottomRight: {
        x: params.destinationQuad.bottomRight.x - relX,
        y: params.destinationQuad.bottomRight.y - relY,
      },
      bottomLeft: {
        x: params.destinationQuad.bottomLeft.x - relX,
        y: params.destinationQuad.bottomLeft.y - relY,
      },
    };

    const nextImage = applyCornerPinTransform(layer.image, localDstQuad, {
      sourceQuad: localSrcQuad,
      outputWidth: layer.image.width,
      outputHeight: layer.image.height,
    });
    const changedPixels = countChangedPixels(layer.image, nextImage);
    if (changedPixels > 0) changedLayerCount += 1;

    results.push({
      layerId: layer.id,
      name: layer.name,
      offsetX: layer.offsetX,
      offsetY: layer.offsetY,
      image: nextImage,
      changedPixels,
    });
  }

  return {
    ok: true,
    operation: "corner-pin",
    bounds,
    results: Object.freeze(results),
    skipped,
    changedLayerCount,
    validation,
  };
}

const OPERATION_LABELS_KO: Readonly<Record<MultiLayerWarpOperationKind, string>> = Object.freeze({
  liquify: "다중 레이어 유동화",
  puppet: "다중 레이어 퍼핏 변형",
  mesh: "다중 레이어 메쉬 변형",
  "corner-pin": "다중 레이어 원근 변형",
});

/**
 * 배치 변형 결과를 단일 실행취소(Undo) 트랜잭션 계획으로 포장한다.
 */
export function createMultiLayerWarpCommitPlan(
  originals: readonly MultiLayerWarpLayerInput[],
  batch: MultiLayerWarpBatchResult,
): MultiLayerWarpCommitPlan | null {
  if (!batch.ok || batch.results.length === 0) return null;
  const originalMap = new Map(originals.map((layer) => [layer.id, layer.image]));
  const beforeByLayerId: Record<string, StudioImageDataLike> = {};
  const afterByLayerId: Record<string, StudioImageDataLike> = {};
  const affectedLayerIds: string[] = [];

  for (const res of batch.results) {
    const before = originalMap.get(res.layerId);
    if (!before) continue;
    affectedLayerIds.push(res.layerId);
    beforeByLayerId[res.layerId] = cloneImageDataLike(before);
    afterByLayerId[res.layerId] = cloneImageDataLike(res.image);
  }

  if (affectedLayerIds.length === 0) return null;

  return {
    labelKo: `${OPERATION_LABELS_KO[batch.operation]} (${affectedLayerIds.length}개 레이어)`,
    operation: batch.operation,
    affectedLayerIds: Object.freeze(affectedLayerIds),
    beforeByLayerId: Object.freeze(beforeByLayerId),
    afterByLayerId: Object.freeze(afterByLayerId),
  };
}
