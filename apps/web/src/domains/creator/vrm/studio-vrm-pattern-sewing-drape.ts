/**
 * CLO 3D Lite 클린룸 — 2D 패턴 조각, 봉제선 페어링, 어레인지먼트 포인트 및 다층 의상 드레이핑 솔버.
 *
 * - 2D 직사각/테이퍼 의상 패턴 패널을 3D 어레인지먼트 포인트(원통 래핑)에 층별(`layerIndex`) 자동 배치
 * - 봉제선(Seam Pair) 페어링 제약으로 앞판·뒷판·소매 경계 정점을 정밀 봉합
 * - PBD(Position-Based Dynamics) 구조 거리 제약 + 중력 + 인체 원통 충돌 + 다층(속옷/셔츠/외투) 순서 유지
 */

export type Vec3Tuple = readonly [number, number, number];
export type PatternEdgeSide = "left" | "right" | "top" | "bottom";
export type FabricMaterialPresetId = "cotton" | "denim" | "silk" | "wool";

export interface FabricMechanicalParams {
  readonly id: FabricMaterialPresetId;
  readonly labelKo: string;
  readonly stretchStiffness: number;
  readonly damping: number;
  readonly massPerVertexKg: number;
}

export const FABRIC_MATERIAL_PRESETS: Readonly<Record<FabricMaterialPresetId, FabricMechanicalParams>> = Object.freeze({
  cotton: { id: "cotton", labelKo: "면(코튼)", stretchStiffness: 0.82, damping: 0.96, massPerVertexKg: 0.015 },
  denim: { id: "denim", labelKo: "데님", stretchStiffness: 0.95, damping: 0.92, massPerVertexKg: 0.028 },
  silk: { id: "silk", labelKo: "실크", stretchStiffness: 0.68, damping: 0.985, massPerVertexKg: 0.008 },
  wool: { id: "wool", labelKo: "울(코트)", stretchStiffness: 0.9, damping: 0.94, massPerVertexKg: 0.032 },
});

export interface PatternArrangementPoint {
  /** 인체 중심축 XZ 좌표(m). */
  readonly axisCenterXZ: readonly [number, number];
  /** 기본 몸통 반경(m). */
  readonly baseRadiusM: number;
  /** 패턴 중심이 놓일 방위각(rad, 0 = +Z 정면, PI = -Z 후면). */
  readonly azimuthCenterRad: number;
  /** 패턴 폭이 감싸는 호 각도(rad). */
  readonly wrapArcRad: number;
  /** 패턴 상단 Y 높이(m). */
  readonly topHeightM: number;
}

export interface GarmentPatternPiece2D {
  readonly id: string;
  readonly labelKo: string;
  readonly widthM: number;
  readonly heightM: number;
  readonly cols: number;
  readonly rows: number;
  /** 0 = 이너 셔츠, 1 = 자켓/외투, 2 = 망토/오버레이어. 높을수록 바깥층. */
  readonly layerIndex: number;
  readonly fabric: FabricMaterialPresetId;
  readonly pinTopEdge: boolean;
  readonly arrangement: PatternArrangementPoint;
}

export interface PatternSeamPair {
  readonly id: string;
  readonly pieceAId: string;
  readonly edgeA: PatternEdgeSide;
  readonly pieceBId: string;
  readonly edgeB: PatternEdgeSide;
  readonly reverseB?: boolean;
  readonly strength?: number;
}

export interface BodyCylinderCollider {
  readonly axisCenterXZ: readonly [number, number];
  readonly radiusM: number;
  readonly minHeightM: number;
  readonly maxHeightM: number;
}

export interface ArrangedPatternMesh {
  readonly pieceId: string;
  readonly layerIndex: number;
  readonly cols: number;
  readonly rows: number;
  readonly vertexCount: number;
  readonly positions: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly restDx: number;
  readonly restDy: number;
}

export interface PatternSewingSimulationOptions {
  readonly substeps: number;
  readonly constraintIterations: number;
  readonly dtSec: number;
  readonly gravityMps2: number;
  readonly layerClearanceM: number;
}

export interface PatternSewingDrapeResult {
  readonly meshes: Readonly<Record<string, ArrangedPatternMesh>>;
  readonly meanSeamGapMm: number;
  readonly maxSeamGapMm: number;
  readonly layerOrderingPreserved: boolean;
  readonly bodyPenetrationCount: number;
}

export const DEFAULT_PATTERN_SEWING_OPTIONS: PatternSewingSimulationOptions = Object.freeze({
  substeps: 18,
  constraintIterations: 6,
  dtSec: 1 / 60,
  gravityMps2: 9.80665,
  layerClearanceM: 0.012,
});

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function getEdgeVertexIndices(
  cols: number,
  rows: number,
  edge: PatternEdgeSide,
  reverse = false,
): number[] {
  const result: number[] = [];
  const stride = cols + 1;
  if (edge === "left") {
    for (let r = 0; r <= rows; r += 1) result.push(r * stride);
  } else if (edge === "right") {
    for (let r = 0; r <= rows; r += 1) result.push(r * stride + cols);
  } else if (edge === "top") {
    for (let c = 0; c <= cols; c += 1) result.push(c);
  } else {
    for (let c = 0; c <= cols; c += 1) result.push(rows * stride + c);
  }
  return reverse ? result.reverse() : result;
}

/**
 * 2D 패턴 조각들을 어레인지먼트 포인트와 층 번호(`layerIndex`)에 따라 3D 원통면에 초기 배치한다.
 */
export function arrangePatternPiece3D(
  piece: GarmentPatternPiece2D,
  layerClearanceM = DEFAULT_PATTERN_SEWING_OPTIONS.layerClearanceM,
): ArrangedPatternMesh {
  const cols = Math.max(2, Math.floor(piece.cols));
  const rows = Math.max(2, Math.floor(piece.rows));
  const stride = cols + 1;
  const vertexCount = (cols + 1) * (rows + 1);
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(cols * rows * 6);

  const radius = Math.max(0.05, piece.arrangement.baseRadiusM + piece.layerIndex * layerClearanceM);
  const [cx, cz] = piece.arrangement.axisCenterXZ;

  for (let r = 0; r <= rows; r += 1) {
    const v = r / rows;
    const y = piece.arrangement.topHeightM - v * piece.heightM;
    for (let c = 0; c <= cols; c += 1) {
      const u = c / cols;
      const angle = piece.arrangement.azimuthCenterRad + (u - 0.5) * piece.arrangement.wrapArcRad;
      const idx = r * stride + c;
      positions[idx * 3] = cx + Math.sin(angle) * radius;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = cz + Math.cos(angle) * radius;
      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = v;
    }
  }

  let out = 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const a = r * stride + c;
      const b = a + 1;
      const d = a + stride;
      const e = d + 1;
      indices[out] = a;
      indices[out + 1] = d;
      indices[out + 2] = b;
      indices[out + 3] = b;
      indices[out + 4] = d;
      indices[out + 5] = e;
      out += 6;
    }
  }

  return {
    pieceId: piece.id,
    layerIndex: piece.layerIndex,
    cols,
    rows,
    vertexCount,
    positions,
    uvs,
    indices,
    restDx: piece.widthM / cols,
    restDy: piece.heightM / rows,
  };
}

/**
 * 다층 2D 패턴 봉제 + PBD 드레이핑 솔버를 실행한다.
 */
export function simulatePatternSewingDrape(
  pieces: readonly GarmentPatternPiece2D[],
  seams: readonly PatternSeamPair[],
  bodyCollider: BodyCylinderCollider,
  options: Partial<PatternSewingSimulationOptions> = {},
): PatternSewingDrapeResult {
  const cfg: PatternSewingSimulationOptions = {
    substeps: options.substeps ?? DEFAULT_PATTERN_SEWING_OPTIONS.substeps,
    constraintIterations: options.constraintIterations ?? DEFAULT_PATTERN_SEWING_OPTIONS.constraintIterations,
    dtSec: options.dtSec ?? DEFAULT_PATTERN_SEWING_OPTIONS.dtSec,
    gravityMps2: options.gravityMps2 ?? DEFAULT_PATTERN_SEWING_OPTIONS.gravityMps2,
    layerClearanceM: options.layerClearanceM ?? DEFAULT_PATTERN_SEWING_OPTIONS.layerClearanceM,
  };

  interface SimPiece {
    readonly spec: GarmentPatternPiece2D;
    readonly mesh: ArrangedPatternMesh;
    readonly pos: Float32Array;
    readonly prev: Float32Array;
    readonly pinned: Uint8Array;
  }

  const simMap = new Map<string, SimPiece>();
  for (const spec of pieces) {
    const mesh = arrangePatternPiece3D(spec, cfg.layerClearanceM);
    const pos = new Float32Array(mesh.positions);
    const prev = new Float32Array(mesh.positions);
    const pinned = new Uint8Array(mesh.vertexCount);
    if (spec.pinTopEdge) {
      for (let c = 0; c <= mesh.cols; c += 1) {
        pinned[c] = 1;
      }
    }
    simMap.set(spec.id, { spec, mesh, pos, prev, pinned });
  }

  interface ResolvedSeamEdgeLink {
    readonly a: SimPiece;
    readonly idxA: number;
    readonly b: SimPiece;
    readonly idxB: number;
    readonly strength: number;
  }

  const seamLinks: ResolvedSeamEdgeLink[] = [];
  for (const seam of seams) {
    const pieceA = simMap.get(seam.pieceAId);
    const pieceB = simMap.get(seam.pieceBId);
    if (!pieceA || !pieceB) continue;
    const edgeA = getEdgeVertexIndices(pieceA.mesh.cols, pieceA.mesh.rows, seam.edgeA, false);
    const edgeB = getEdgeVertexIndices(pieceB.mesh.cols, pieceB.mesh.rows, seam.edgeB, Boolean(seam.reverseB));
    const pairCount = Math.min(edgeA.length, edgeB.length);
    const strength = clamp(seam.strength ?? 0.85, 0.1, 1);
    for (let k = 0; k < pairCount; k += 1) {
      seamLinks.push({ a: pieceA, idxA: edgeA[k], b: pieceB, idxB: edgeB[k], strength });
    }
  }

  const dtSq = cfg.dtSec * cfg.dtSec;
  const [bodyCx, bodyCz] = bodyCollider.axisCenterXZ;

  const satisfyDistance = (
    arr: Float32Array,
    pinned: Uint8Array,
    i0: number,
    i1: number,
    restLen: number,
    stiffness: number,
  ) => {
    const p0 = i0 * 3;
    const p1 = i1 * 3;
    const dx = arr[p1] - arr[p0];
    const dy = arr[p1 + 1] - arr[p0 + 1];
    const dz = arr[p1 + 2] - arr[p0 + 2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist <= 1e-7) return;
    const diff = ((dist - restLen) / dist) * stiffness;
    const w0 = pinned[i0] ? 0 : 1;
    const w1 = pinned[i1] ? 0 : 1;
    const wSum = w0 + w1;
    if (wSum === 0) return;
    const corr0 = (w0 / wSum) * diff;
    const corr1 = (w1 / wSum) * diff;
    arr[p0] += dx * corr0;
    arr[p0 + 1] += dy * corr0;
    arr[p0 + 2] += dz * corr0;
    arr[p1] -= dx * corr1;
    arr[p1 + 1] -= dy * corr1;
    arr[p1 + 2] -= dz * corr1;
  };

  for (let step = 0; step < cfg.substeps; step += 1) {
    // 1) 베를레(Verlet) 중력 적분
    for (const sp of simMap.values()) {
      const fab = FABRIC_MATERIAL_PRESETS[sp.spec.fabric];
      for (let v = 0; v < sp.mesh.vertexCount; v += 1) {
        if (sp.pinned[v]) continue;
        const p = v * 3;
        const vx = (sp.pos[p] - sp.prev[p]) * fab.damping;
        const vy = (sp.pos[p + 1] - sp.prev[p + 1]) * fab.damping;
        const vz = (sp.pos[p + 2] - sp.prev[p + 2]) * fab.damping;
        sp.prev[p] = sp.pos[p];
        sp.prev[p + 1] = sp.pos[p + 1];
        sp.prev[p + 2] = sp.pos[p + 2];
        sp.pos[p] += vx;
        sp.pos[p + 1] += vy - cfg.gravityMps2 * dtSq;
        sp.pos[p + 2] += vz;
      }
    }

    // 2) 구조·봉제·충돌 제약 반복 수렴
    for (let iter = 0; iter < cfg.constraintIterations; iter += 1) {
      for (const sp of simMap.values()) {
        const fab = FABRIC_MATERIAL_PRESETS[sp.spec.fabric];
        const stride = sp.mesh.cols + 1;
        const diagRest = Math.hypot(sp.mesh.restDx, sp.mesh.restDy);
        for (let r = 0; r <= sp.mesh.rows; r += 1) {
          for (let c = 0; c <= sp.mesh.cols; c += 1) {
            const idx = r * stride + c;
            if (c < sp.mesh.cols) {
              satisfyDistance(sp.pos, sp.pinned, idx, idx + 1, sp.mesh.restDx, fab.stretchStiffness);
            }
            if (r < sp.mesh.rows) {
              satisfyDistance(sp.pos, sp.pinned, idx, idx + stride, sp.mesh.restDy, fab.stretchStiffness);
            }
            if (c < sp.mesh.cols && r < sp.mesh.rows) {
              satisfyDistance(sp.pos, sp.pinned, idx, idx + stride + 1, diagRest, fab.stretchStiffness * 0.45);
            }
          }
        }
      }

      // 봉제선 페어링 수축 제약
      for (const link of seamLinks) {
        const pA = link.idxA * 3;
        const pB = link.idxB * 3;
        const dx = link.b.pos[pB] - link.a.pos[pA];
        const dy = link.b.pos[pB + 1] - link.a.pos[pA + 1];
        const dz = link.b.pos[pB + 2] - link.a.pos[pA + 2];
        const wA = link.a.pinned[link.idxA] ? 0 : 1;
        const wB = link.b.pinned[link.idxB] ? 0 : 1;
        const wSum = wA + wB;
        if (wSum === 0) continue;
        const factorA = (wA / wSum) * link.strength;
        const factorB = (wB / wSum) * link.strength;
        link.a.pos[pA] += dx * factorA;
        link.a.pos[pA + 1] += dy * factorA;
        link.a.pos[pA + 2] += dz * factorA;
        link.b.pos[pB] -= dx * factorB;
        link.b.pos[pB + 1] -= dy * factorB;
        link.b.pos[pB + 2] -= dz * factorB;
      }

      // 인체 원통 충돌 + 다층(Layer) 최소 반경 순서 보장
      for (const sp of simMap.values()) {
        const minAllowedR = bodyCollider.radiusM + (sp.spec.layerIndex + 1) * cfg.layerClearanceM;
        for (let v = 0; v < sp.mesh.vertexCount; v += 1) {
          const p = v * 3;
          const y = sp.pos[p + 1];
          if (y < bodyCollider.minHeightM || y > bodyCollider.maxHeightM) continue;
          const rx = sp.pos[p] - bodyCx;
          const rz = sp.pos[p + 2] - bodyCz;
          const rDist = Math.hypot(rx, rz);
          if (rDist < minAllowedR) {
            const scale = rDist > 1e-6 ? minAllowedR / rDist : 1;
            sp.pos[p] = rDist > 1e-6 ? bodyCx + rx * scale : bodyCx + minAllowedR;
            sp.pos[p + 2] = rDist > 1e-6 ? bodyCz + rz * scale : bodyCz;
          }
        }
      }
    }
  }

  let seamGapSumM = 0;
  let maxSeamGapM = 0;
  for (const link of seamLinks) {
    const pA = link.idxA * 3;
    const pB = link.idxB * 3;
    const gap = Math.hypot(
      link.b.pos[pB] - link.a.pos[pA],
      link.b.pos[pB + 1] - link.a.pos[pA + 1],
      link.b.pos[pB + 2] - link.a.pos[pA + 2],
    );
    seamGapSumM += gap;
    if (gap > maxSeamGapM) maxSeamGapM = gap;
  }

  let bodyPenetrationCount = 0;
  const meanRadiusByLayer = new Map<number, { sum: number; count: number }>();
  const meshes: Record<string, ArrangedPatternMesh> = {};

  for (const sp of simMap.values()) {
    meshes[sp.spec.id] = {
      ...sp.mesh,
      positions: sp.pos,
    };
    const layerEntry = meanRadiusByLayer.get(sp.spec.layerIndex) ?? { sum: 0, count: 0 };
    for (let v = 0; v < sp.mesh.vertexCount; v += 1) {
      const p = v * 3;
      const rDist = Math.hypot(sp.pos[p] - bodyCx, sp.pos[p + 2] - bodyCz);
      if (rDist < bodyCollider.radiusM - 1e-4) {
        bodyPenetrationCount += 1;
      }
      layerEntry.sum += rDist;
      layerEntry.count += 1;
    }
    meanRadiusByLayer.set(sp.spec.layerIndex, layerEntry);
  }

  const sortedLayers = [...meanRadiusByLayer.entries()].sort((a, b) => a[0] - b[0]);
  let layerOrderingPreserved = true;
  for (let i = 1; i < sortedLayers.length; i += 1) {
    const prevAvg = sortedLayers[i - 1][1].sum / Math.max(1, sortedLayers[i - 1][1].count);
    const currAvg = sortedLayers[i][1].sum / Math.max(1, sortedLayers[i][1].count);
    if (currAvg <= prevAvg) {
      layerOrderingPreserved = false;
    }
  }

  return {
    meshes,
    meanSeamGapMm: seamLinks.length > 0 ? (seamGapSumM / seamLinks.length) * 1000 : 0,
    maxSeamGapMm: maxSeamGapM * 1000,
    layerOrderingPreserved,
    bodyPenetrationCount,
  };
}
