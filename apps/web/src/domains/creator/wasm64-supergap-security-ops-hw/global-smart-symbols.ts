/**
 * #26 다중 에피소드 글로벌 스마트 심볼 인스턴스 전파기(GlobalSmartSymbolRegistry).
 *
 * - 주인공 검 문양·교복 엠블럼·반복 소품/간판 등의 마스터 벡터·텍스처 정의를 한 번 수정하면
 *   연결된 모든 에피소드·컷 인스턴스에 즉시 전파한다.
 * - 전파 과정에서 각 컷 인스턴스가 보유한 3×3 2D 사영 호모그래피(원근 변환) 행렬과
 *   로컬 투명도·Z-순서·색조 오버라이드를 100% 보존한 채 신규 정점을 재투영한다.
 */

import { canonicalJsonBytes, sha256Hex } from "./crypto-binary-utils";

export interface SymbolPoint2D {
  readonly x: number;
  readonly y: number;
}

/** 3×3 행 우선(row-major) 2D 사영 호모그래피 행렬. */
export type HomographyMatrix3x3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/** 시계 방향 4꼭짓점 원근 사각형 [좌상, 우상, 우하, 좌하]. */
export type PerspectiveQuad2D = readonly [
  SymbolPoint2D,
  SymbolPoint2D,
  SymbolPoint2D,
  SymbolPoint2D,
];

export interface SymbolVectorPath {
  readonly pathId: string;
  readonly closed: boolean;
  readonly strokeWidth: number;
  readonly semanticRole: "outline" | "fill-primary" | "fill-accent" | "highlight";
  readonly points: readonly SymbolPoint2D[];
}

export interface MasterSymbolDefinitionInput {
  readonly symbolId: string;
  readonly name: string;
  readonly bounds: { readonly width: number; readonly height: number };
  readonly vectorPaths: readonly SymbolVectorPath[];
  readonly textureDigestSha256?: string;
}

export interface MasterSymbolRecord extends MasterSymbolDefinitionInput {
  readonly version: number;
  readonly masterDigestSha256Hex: string;
  readonly updatedAtMs: number;
}

export interface MasterSymbolPatch {
  readonly name?: string;
  readonly bounds?: { readonly width: number; readonly height: number };
  readonly vectorPaths?: readonly SymbolVectorPath[];
  readonly textureDigestSha256?: string;
  readonly updatedAtMs?: number;
}

export interface LinkSymbolInstanceInput {
  readonly instanceId: string;
  readonly symbolId: string;
  readonly episodeId: string;
  readonly cutId: string;
  /** 직접 지정한 3×3 호모그래피(미지정 시 perspectiveQuad에서 자동 해법 계산). */
  readonly homography?: HomographyMatrix3x3;
  /** 컷 내 4꼭짓점 원근 사각형(homography 미지정 시 필수). */
  readonly perspectiveQuad?: PerspectiveQuad2D;
  readonly opacity?: number;
  readonly zIndex?: number;
  readonly tintSlotOverride?: string;
}

export interface LinkedSymbolInstanceState {
  readonly instanceId: string;
  readonly symbolId: string;
  readonly episodeId: string;
  readonly cutId: string;
  readonly appliedMasterVersion: number;
  readonly homography: HomographyMatrix3x3;
  readonly homographyHashHex: string;
  readonly opacity: number;
  readonly zIndex: number;
  readonly tintSlotOverride?: string;
  readonly textureDigestSha256?: string;
  readonly warpedPaths: readonly SymbolVectorPath[];
}

export interface GlobalSymbolPropagationReport {
  readonly symbolId: string;
  readonly previousVersion: number;
  readonly nextVersion: number;
  readonly masterDigestSha256Hex: string;
  readonly affectedEpisodeIds: readonly string[];
  readonly affectedCutIds: readonly string[];
  readonly updatedInstanceCount: number;
  readonly propagatedInstances: readonly LinkedSymbolInstanceState[];
}

export const IDENTITY_HOMOGRAPHY_3X3: HomographyMatrix3x3 = [
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
];

/** 3×3 행렬식(비퇴화 사영 변환 여부 검증). */
export function computeHomographyDeterminant(h: HomographyMatrix3x3): number {
  return (
    h[0] * (h[4] * h[8] - h[5] * h[7]) -
    h[1] * (h[3] * h[8] - h[5] * h[6]) +
    h[2] * (h[3] * h[7] - h[4] * h[6])
  );
}

/** 2D 점에 3×3 사영 호모그래피 적용. */
export function applyHomographyToPoint(
  h: HomographyMatrix3x3,
  point: SymbolPoint2D,
): SymbolPoint2D {
  const w = h[6] * point.x + h[7] * point.y + h[8];
  if (Math.abs(w) < 1e-9) {
    throw new Error("호모그래피 투영 분모가 0에 수렴해 변환할 수 없습니다.");
  }
  return {
    x: Number(((h[0] * point.x + h[1] * point.y + h[2]) / w).toFixed(4)),
    y: Number(((h[3] * point.x + h[4] * point.y + h[5]) / w).toFixed(4)),
  };
}

/** 두 3×3 호모그래피 행렬 합성(a * b). */
export function composeHomographies(
  a: HomographyMatrix3x3,
  b: HomographyMatrix3x3,
): HomographyMatrix3x3 {
  const out = new Array<number>(9);
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      out[r * 3 + c] =
        a[r * 3 + 0] * b[0 * 3 + c] +
        a[r * 3 + 1] * b[1 * 3 + c] +
        a[r * 3 + 2] * b[2 * 3 + c];
    }
  }
  const scale = Math.abs(out[8]) > 1e-9 ? out[8] : 1;
  return [
    out[0] / scale,
    out[1] / scale,
    out[2] / scale,
    out[3] / scale,
    out[4] / scale,
    out[5] / scale,
    out[6] / scale,
    out[7] / scale,
    out[8] / scale,
  ];
}

/**
 * 4쌍의 대응 꼭짓점(srcQuad → dstQuad)으로부터 정확한 3×3 2D 호모그래피 행렬을
 * 부분 피벗팅 가우스 소거법으로 해법 계산한다.
 */
export function solveHomographyFromQuads(
  srcQuad: PerspectiveQuad2D,
  dstQuad: PerspectiveQuad2D,
): HomographyMatrix3x3 {
  const aug: number[][] = [];
  for (let i = 0; i < 4; i += 1) {
    const sx = srcQuad[i].x;
    const sy = srcQuad[i].y;
    const dx = dstQuad[i].x;
    const dy = dstQuad[i].y;
    aug.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy, dx]);
    aug.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy, dy]);
  }

  for (let col = 0; col < 8; col += 1) {
    let pivotRow = col;
    let maxAbs = Math.abs(aug[col][col]);
    for (let row = col + 1; row < 8; row += 1) {
      const cand = Math.abs(aug[row][col]);
      if (cand > maxAbs) {
        maxAbs = cand;
        pivotRow = row;
      }
    }
    if (maxAbs < 1e-12) {
      throw new Error("원근 사각형 꼭짓점이 일직선이거나 퇴화되어 호모그래피를 구할 수 없습니다.");
    }
    if (pivotRow !== col) {
      const tmp = aug[col];
      aug[col] = aug[pivotRow];
      aug[pivotRow] = tmp;
    }

    const pivotVal = aug[col][col];
    for (let j = col; j <= 8; j += 1) {
      aug[col][j] /= pivotVal;
    }
    for (let row = 0; row < 8; row += 1) {
      if (row === col) continue;
      const factor = aug[row][col];
      if (factor === 0) continue;
      for (let j = col; j <= 8; j += 1) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  return [
    aug[0][8],
    aug[1][8],
    aug[2][8],
    aug[3][8],
    aug[4][8],
    aug[5][8],
    aug[6][8],
    aug[7][8],
    1,
  ];
}

function warpVectorPaths(
  paths: readonly SymbolVectorPath[],
  homography: HomographyMatrix3x3,
): readonly SymbolVectorPath[] {
  return paths.map((path) => ({
    ...path,
    points: path.points.map((pt) => applyHomographyToPoint(homography, pt)),
  }));
}

function computeMasterDigest(def: MasterSymbolDefinitionInput): string {
  return sha256Hex(
    canonicalJsonBytes({
      symbolId: def.symbolId,
      name: def.name,
      bounds: def.bounds,
      vectorPaths: def.vectorPaths,
      textureDigestSha256: def.textureDigestSha256 ?? null,
    }),
  );
}

function hashHomography(h: HomographyMatrix3x3): string {
  return sha256Hex(canonicalJsonBytes(h.map((v) => Number(v.toFixed(8)))));
}

/**
 * 다중 에피소드 글로벌 스마트 심볼 등록·연결·원근 보존 전파 레지스트리.
 */
export class GlobalSmartSymbolRegistry {
  private readonly masters = new Map<string, MasterSymbolRecord>();
  private readonly instancesById = new Map<string, LinkedSymbolInstanceState>();
  private readonly instanceIdsBySymbol = new Map<string, Set<string>>();

  /** 마스터 심볼 신규 등록(version=1). */
  registerMasterSymbol(
    definition: MasterSymbolDefinitionInput,
    nowMs = Date.now(),
  ): MasterSymbolRecord {
    if (definition.bounds.width <= 0 || definition.bounds.height <= 0) {
      throw new Error("마스터 심볼 경계 크기는 양수여야 합니다.");
    }
    if (this.masters.has(definition.symbolId)) {
      throw new Error(`이미 등록된 마스터 심볼 ID입니다(${definition.symbolId}).`);
    }
    const record: MasterSymbolRecord = {
      ...definition,
      version: 1,
      masterDigestSha256Hex: computeMasterDigest(definition),
      updatedAtMs: nowMs,
    };
    this.masters.set(definition.symbolId, record);
    this.instanceIdsBySymbol.set(definition.symbolId, new Set());
    return record;
  }

  /** 특정 에피소드·컷에 심볼 인스턴스 연결(호모그래피 또는 4꼭짓점 원근 사각형 보존). */
  linkInstance(input: LinkSymbolInstanceInput): LinkedSymbolInstanceState {
    const master = this.masters.get(input.symbolId);
    if (!master) {
      throw new Error(`존재하지 않는 마스터 심볼입니다(${input.symbolId}).`);
    }
    if (this.instancesById.has(input.instanceId)) {
      throw new Error(`이미 등록된 심볼 인스턴스 ID입니다(${input.instanceId}).`);
    }

    let homography: HomographyMatrix3x3;
    if (input.homography) {
      homography = [...input.homography] as unknown as HomographyMatrix3x3;
    } else if (input.perspectiveQuad) {
      const srcQuad: PerspectiveQuad2D = [
        { x: 0, y: 0 },
        { x: master.bounds.width, y: 0 },
        { x: master.bounds.width, y: master.bounds.height },
        { x: 0, y: master.bounds.height },
      ];
      homography = solveHomographyFromQuads(srcQuad, input.perspectiveQuad);
    } else {
      homography = IDENTITY_HOMOGRAPHY_3X3;
    }

    if (Math.abs(computeHomographyDeterminant(homography)) < 1e-10) {
      throw new Error("유효하지 않은 특이(singular) 호모그래피 행렬입니다.");
    }

    const state: LinkedSymbolInstanceState = {
      instanceId: input.instanceId,
      symbolId: input.symbolId,
      episodeId: input.episodeId,
      cutId: input.cutId,
      appliedMasterVersion: master.version,
      homography,
      homographyHashHex: hashHomography(homography),
      opacity: Math.max(0, Math.min(1, input.opacity ?? 1)),
      zIndex: input.zIndex ?? 0,
      tintSlotOverride: input.tintSlotOverride,
      textureDigestSha256: master.textureDigestSha256,
      warpedPaths: warpVectorPaths(master.vectorPaths, homography),
    };

    this.instancesById.set(input.instanceId, state);
    this.instanceIdsBySymbol.get(input.symbolId)?.add(input.instanceId);
    return state;
  }

  /**
   * 마스터 심볼 정의를 갱신하고, 연결된 모든 에피소드·컷 인스턴스에
   * 각 인스턴스의 2D 호모그래피/원근 변환과 로컬 속성을 그대로 보존한 채 전파한다.
   */
  updateMasterSymbol(
    symbolId: string,
    patch: MasterSymbolPatch,
  ): GlobalSymbolPropagationReport {
    const existing = this.masters.get(symbolId);
    if (!existing) {
      throw new Error(`갱신할 마스터 심볼을 찾을 수 없습니다(${symbolId}).`);
    }

    const nextDef: MasterSymbolDefinitionInput = {
      symbolId: existing.symbolId,
      name: patch.name ?? existing.name,
      bounds: patch.bounds ?? existing.bounds,
      vectorPaths: patch.vectorPaths ?? existing.vectorPaths,
      textureDigestSha256:
        patch.textureDigestSha256 !== undefined
          ? patch.textureDigestSha256
          : existing.textureDigestSha256,
    };

    const nextVersion = existing.version + 1;
    const masterDigestSha256Hex = computeMasterDigest(nextDef);
    const updatedMaster: MasterSymbolRecord = {
      ...nextDef,
      version: nextVersion,
      masterDigestSha256Hex,
      updatedAtMs: patch.updatedAtMs ?? Date.now(),
    };
    this.masters.set(symbolId, updatedMaster);

    const linkedIds = this.instanceIdsBySymbol.get(symbolId) ?? new Set<string>();
    const episodeSet = new Set<string>();
    const cutSet = new Set<string>();
    const propagatedInstances: LinkedSymbolInstanceState[] = [];

    linkedIds.forEach((instanceId) => {
      const prev = this.instancesById.get(instanceId);
      if (!prev) return;
      const updatedInstance: LinkedSymbolInstanceState = {
        ...prev,
        appliedMasterVersion: nextVersion,
        textureDigestSha256: updatedMaster.textureDigestSha256,
        // 인스턴스의 원래 2D 호모그래피와 로컬 오버라이드는 1비트도 바꾸지 않고 새 벡터만 재투영
        warpedPaths: warpVectorPaths(updatedMaster.vectorPaths, prev.homography),
      };
      this.instancesById.set(instanceId, updatedInstance);
      episodeSet.add(updatedInstance.episodeId);
      cutSet.add(updatedInstance.cutId);
      propagatedInstances.push(updatedInstance);
    });

    return {
      symbolId,
      previousVersion: existing.version,
      nextVersion,
      masterDigestSha256Hex,
      affectedEpisodeIds: [...episodeSet].sort(),
      affectedCutIds: [...cutSet].sort(),
      updatedInstanceCount: propagatedInstances.length,
      propagatedInstances,
    };
  }

  /** 특정 인스턴스 현재 상태 조회. */
  getInstance(instanceId: string): LinkedSymbolInstanceState | undefined {
    return this.instancesById.get(instanceId);
  }

  /** 특정 에피소드 내 연결된 모든 심볼 인스턴스 조회. */
  listInstancesByEpisode(episodeId: string): readonly LinkedSymbolInstanceState[] {
    const out: LinkedSymbolInstanceState[] = [];
    this.instancesById.forEach((inst) => {
      if (inst.episodeId === episodeId) {
        out.push(inst);
      }
    });
    return out;
  }

  /** 마스터 심볼 조회. */
  getMasterSymbol(symbolId: string): MasterSymbolRecord | undefined {
    return this.masters.get(symbolId);
  }
}
