/**
 * Wave 8 Singularity — 구조 보존 스캔 선화 노이즈 게이트 · 기가픽셀 희소 모턴(Morton) 옥트리/쿼드트리
 * 프러스텀 인덱서 · 온디바이스 음성→52-VRM 표정 애니메이터 · 무가스(₩0) 암호화 로열티 분배 주입기 통합 모듈.
 *
 * 주의: 루트 ES2017 타깃 호환을 위해 ES2020 BigInt 리터럴을 일절 쓰지 않고 `BigInt(...)` 생성자만 사용한다.
 */

export {
  ARKIT_52_BLENDSHAPE_NAMES,
  calculateBasisPointPayouts,
  generateRoyaltySigningKeyPair,
  injectRoyaltySplitManifest,
  TOTAL_ROYALTY_BASIS_POINTS,
  verifyEmbeddedRoyaltyManifest,
  VoiceToVrmExpressionAnimator,
  type Arkit52BlendshapeName,
  type RoyaltyLicenseTerms,
  type RoyaltyManifestVerificationResult,
  type RoyaltyRecipientShare,
  type RoyaltySplitManifestInput,
  type SignedRoyaltyManifestPayload,
  type VoiceExpressionFrameResult,
  type VrmVisemeExpressionWeights,
} from "./voiceface-royalty-manifest";

/* -------------------------------------------------------------------------- */
/* 1. 구조 보존 스캔 선화 노이즈 게이트 (Taper-Safe Scan Line-Art Noise Gate) */
/* -------------------------------------------------------------------------- */

export interface ScanLineArtNoiseGateInput {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly channels?: 1 | 4;
  readonly windowRadius?: number;
  readonly sauvolaK?: number;
  readonly paperWhiteFloor?: number;
  readonly mosquitoContrastGate?: number;
  readonly maxDustAreaPx?: number;
  readonly tangentSmoothingStrength?: number;
}

export interface ScanLineArtNoiseGateResult {
  readonly width: number;
  readonly height: number;
  readonly channels: 1 | 4;
  readonly cleanedPixels: Uint8Array;
  readonly removedDustComponents: number;
  readonly removedDustPixels: number;
  readonly paperWhitePixelRatio: number;
  readonly serverCostKrw: 0;
}

/**
 * 적응형 로컬 Sauvola 임계화 + 연결 성분 먼지 제거(필압 끝선 보존) +
 * 구조 텐서 접선 방향 비등방성 스무딩으로 스캔 종이 결·모스키토 노이즈만 제거한다.
 */
export function denoiseScanLineArt(input: ScanLineArtNoiseGateInput): ScanLineArtNoiseGateResult {
  const w = Math.max(1, Math.trunc(input.width));
  const h = Math.max(1, Math.trunc(input.height));
  const channels = input.channels ?? 1;
  const total = w * h;
  const radius = Math.max(2, Math.min(32, Math.trunc(input.windowRadius ?? 7)));
  const sauvolaK = Math.max(0.02, Math.min(0.6, input.sauvolaK ?? 0.16));
  const paperWhiteFloor = Math.max(180, Math.min(252, input.paperWhiteFloor ?? 216));
  const mosquitoContrastGate = Math.max(6, Math.min(80, input.mosquitoContrastGate ?? 26));
  const maxDustAreaPx = Math.max(0, Math.min(64, Math.trunc(input.maxDustAreaPx ?? 4)));
  const smoothStrength = Math.max(0, Math.min(1, input.tangentSmoothingStrength ?? 0.45));

  const gray = new Float32Array(total);
  for (let i = 0; i < total; i += 1) {
    gray[i] =
      channels === 4
        ? 0.299 * input.pixels[i * 4]! +
          0.587 * input.pixels[i * 4 + 1]! +
          0.114 * input.pixels[i * 4 + 2]!
        : input.pixels[i]!;
  }

  const stride = w + 1;
  const satLen = stride * (h + 1);
  const sat = new Float64Array(satLen);
  const satSq = new Float64Array(satLen);

  for (let y = 0; y < h; y += 1) {
    let rowSum = 0;
    let rowSq = 0;
    for (let x = 0; x < w; x += 1) {
      const v = gray[y * w + x]!;
      rowSum += v;
      rowSq += v * v;
      const dst = (y + 1) * stride + (x + 1);
      sat[dst] = sat[y * stride + (x + 1)]! + rowSum;
      satSq[dst] = satSq[y * stride + (x + 1)]! + rowSq;
    }
  }

  const gated = new Float32Array(total);
  const inkCandidate = new Uint8Array(total);

  for (let y = 0; y < h; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h - 1, y + radius);
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w - 1, x + radius);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);

      const a = y0 * stride + x0;
      const b = y0 * stride + (x1 + 1);
      const c = (y1 + 1) * stride + x0;
      const d = (y1 + 1) * stride + (x1 + 1);

      const sum = sat[d]! - sat[b]! - sat[c]! + sat[a]!;
      const sumSq = satSq[d]! - satSq[b]! - satSq[c]! + satSq[a]!;
      const mean = sum / area;
      const std = Math.sqrt(Math.max(0, sumSq / area - mean * mean));

      const idx = y * w + x;
      const val = gray[idx]!;
      const sauvolaThresh = mean * (1 + sauvolaK * (std / 128 - 1));
      const localContrast = mean - val;

      if (val >= paperWhiteFloor && localContrast < mosquitoContrastGate && val > sauvolaThresh) {
        gated[idx] = 255;
      } else if (val > sauvolaThresh && localContrast < mosquitoContrastGate * 0.65) {
        gated[idx] = 255;
      } else {
        gated[idx] = val;
        if (val < 245) inkCandidate[idx] = 1;
      }
    }
  }

  let removedDustComponents = 0;
  let removedDustPixels = 0;
  if (maxDustAreaPx > 0) {
    const visited = new Uint8Array(total);
    const bfsQueue = new Int32Array(total);

    for (let start = 0; start < total; start += 1) {
      if (inkCandidate[start] === 0 || visited[start] === 1) continue;
      let head = 0;
      let tail = 0;
      bfsQueue[tail] = start;
      tail += 1;
      visited[start] = 1;

      while (head < tail) {
        const u = bfsQueue[head]!;
        head += 1;
        const ux = u % w;
        const uy = Math.floor(u / w);
        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = uy + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = ux + dx;
            if (nx < 0 || nx >= w) continue;
            const v = ny * w + nx;
            if (inkCandidate[v] === 1 && visited[v] === 0) {
              visited[v] = 1;
              bfsQueue[tail] = v;
              tail += 1;
            }
          }
        }
      }

      if (tail <= maxDustAreaPx) {
        removedDustComponents += 1;
        removedDustPixels += tail;
        for (let k = 0; k < tail; k += 1) {
          const p = bfsQueue[k]!;
          gated[p] = 255;
          inkCandidate[p] = 0;
        }
      }
    }
  }

  const smoothed = new Float32Array(gated);
  if (smoothStrength > 0 && w >= 3 && h >= 3) {
    const sampleBilinear = (fx: number, fy: number): number => {
      const cx = Math.max(0, Math.min(w - 1, fx));
      const cy = Math.max(0, Math.min(h - 1, fy));
      const x0 = Math.floor(cx);
      const y0 = Math.floor(cy);
      const x1 = Math.min(w - 1, x0 + 1);
      const y1 = Math.min(h - 1, y0 + 1);
      const tx = cx - x0;
      const ty = cy - y0;
      return (
        (1 - ty) * ((1 - tx) * gated[y0 * w + x0]! + tx * gated[y0 * w + x1]!) +
        ty * ((1 - tx) * gated[y1 * w + x0]! + tx * gated[y1 * w + x1]!)
      );
    };

    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const idx = y * w + x;
        if (inkCandidate[idx] === 0) continue;

        let jxx = 0;
        let jxy = 0;
        let jyy = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const ry = Math.min(h - 1, Math.max(0, y + dy));
          const py = Math.min(h - 1, ry + 1);
          const my = Math.max(0, ry - 1);
          for (let dx = -1; dx <= 1; dx += 1) {
            const rx = Math.min(w - 1, Math.max(0, x + dx));
            const px = Math.min(w - 1, rx + 1);
            const mx = Math.max(0, rx - 1);
            const gx = 0.5 * (gated[ry * w + px]! - gated[ry * w + mx]!);
            const gy = 0.5 * (gated[py * w + rx]! - gated[my * w + rx]!);
            jxx += gx * gx;
            jxy += gx * gy;
            jyy += gy * gy;
          }
        }

        const trace = jxx + jyy;
        if (trace < 1e-3) continue;
        const diff = jxx - jyy;
        const coherence = Math.hypot(diff, 2 * jxy) / (trace + 1e-6);
        const gradAngle = 0.5 * Math.atan2(2 * jxy, diff);
        const tanX = -Math.sin(gradAngle);
        const tanY = Math.cos(gradAngle);

        const center = gated[idx]!;
        const fwd = sampleBilinear(x + tanX, y + tanY);
        const bwd = sampleBilinear(x - tanX, y - tanY);

        let wSum = 1;
        let vSum = center;
        if (Math.abs(fwd - center) <= 42) {
          const wf = 0.5 * smoothStrength * coherence;
          vSum += wf * fwd;
          wSum += wf;
        }
        if (Math.abs(bwd - center) <= 42) {
          const wb = 0.5 * smoothStrength * coherence;
          vSum += wb * bwd;
          wSum += wb;
        }
        smoothed[idx] = vSum / wSum;
      }
    }
  }

  const cleanedPixels = new Uint8Array(total * channels);
  let whiteCount = 0;
  for (let i = 0; i < total; i += 1) {
    const outByte = Math.max(0, Math.min(255, Math.round(smoothed[i]!)));
    if (outByte === 255) whiteCount += 1;
    if (channels === 1) {
      cleanedPixels[i] = outByte;
    } else {
      cleanedPixels[i * 4] = outByte;
      cleanedPixels[i * 4 + 1] = outByte;
      cleanedPixels[i * 4 + 2] = outByte;
      cleanedPixels[i * 4 + 3] = input.pixels[i * 4 + 3] ?? 255;
    }
  }

  return {
    width: w,
    height: h,
    channels,
    cleanedPixels,
    removedDustComponents,
    removedDustPixels,
    paperWhitePixelRatio: whiteCount / total,
    serverCostKrw: 0,
  };
}

/* -------------------------------------------------------------------------- */
/* 2. 기가픽셀 무한 희소 모턴(Morton Z-Order) 옥트리/쿼드트리 프러스텀 인덱서 */
/* -------------------------------------------------------------------------- */

const BI_ZERO = BigInt(0);
const BI_ONE = BigInt(1);
const BI_TWO = BigInt(2);
const BI_THREE = BigInt(3);
const BI_64 = BigInt(64);
const MAX_OCTREE_DEPTH = 21;
const MAX_QUADTREE_DEPTH = 30;

export interface FrustumPlane3D {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly d: number;
}

export interface AxisAlignedBox3D {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
}

export interface ViewportRect2D {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface SpatialTileRecord<TPayload> {
  readonly lod: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly mortonCode: bigint;
  readonly payload: TPayload;
}

export interface FrustumTileQueryResult<TPayload> {
  readonly visibleTiles: readonly SpatialTileRecord<TPayload>[];
  readonly visitedNodes: number;
  readonly totalIndexedTilesAtLod: number;
  readonly serverCostKrw: 0;
}

/** 2개의 30비트 무부호 정수를 60비트 Morton Z-order `bigint`로 인터리빙한다(`BigInt(...)` 전용). */
export function encodeMorton2D(x: number, y: number): bigint {
  const ux = Math.max(0, Math.trunc(x));
  const uy = Math.max(0, Math.trunc(y));
  let code = BI_ZERO;
  for (let bit = 0; bit < MAX_QUADTREE_DEPTH; bit += 1) {
    const shift = BigInt(bit);
    const bx = (BigInt(ux) >> shift) & BI_ONE;
    const by = (BigInt(uy) >> shift) & BI_ONE;
    const outShift = BigInt(bit * 2);
    code = code | (bx << outShift) | (by << (outShift + BI_ONE));
  }
  return code;
}

/** 60비트 Morton Z-order `bigint`를 2D 타일 좌표 `(x, y)`로 복호화한다. */
export function decodeMorton2D(code: bigint): { readonly x: number; readonly y: number } {
  let x = 0;
  let y = 0;
  for (let bit = 0; bit < MAX_QUADTREE_DEPTH; bit += 1) {
    const outShift = BigInt(bit * 2);
    if (((code >> outShift) & BI_ONE) === BI_ONE) x += 2 ** bit;
    if (((code >> (outShift + BI_ONE)) & BI_ONE) === BI_ONE) y += 2 ** bit;
  }
  return { x, y };
}

/** 3개의 21비트 무부호 정수를 63비트 Morton Z-order `bigint`로 인터리빙한다. */
export function encodeMorton3D(x: number, y: number, z: number): bigint {
  const ux = Math.max(0, Math.trunc(x));
  const uy = Math.max(0, Math.trunc(y));
  const uz = Math.max(0, Math.trunc(z));
  let code = BI_ZERO;
  for (let bit = 0; bit < MAX_OCTREE_DEPTH; bit += 1) {
    const shift = BigInt(bit);
    const bx = (BigInt(ux) >> shift) & BI_ONE;
    const by = (BigInt(uy) >> shift) & BI_ONE;
    const bz = (BigInt(uz) >> shift) & BI_ONE;
    const outShift = BigInt(bit * 3);
    code = code | (bx << outShift) | (by << (outShift + BI_ONE)) | (bz << (outShift + BI_TWO));
  }
  return code;
}

/** 63비트 Morton Z-order `bigint`를 3D 복셀/타일 좌표 `(x, y, z)`로 복호화한다. */
export function decodeMorton3D(code: bigint): {
  readonly x: number;
  readonly y: number;
  readonly z: number;
} {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let bit = 0; bit < MAX_OCTREE_DEPTH; bit += 1) {
    const outShift = BigInt(bit * 3);
    if (((code >> outShift) & BI_ONE) === BI_ONE) x += 2 ** bit;
    if (((code >> (outShift + BI_ONE)) & BI_ONE) === BI_ONE) y += 2 ** bit;
    if (((code >> (outShift + BI_TWO)) & BI_ONE) === BI_ONE) z += 2 ** bit;
  }
  return { x, y, z };
}

function packPrefixKey(depth: number, prefix: bigint): bigint {
  return (BigInt(depth) << BI_64) | prefix;
}

function boxIntersectsFrustum(box: AxisAlignedBox3D, planes: readonly FrustumPlane3D[]): boolean {
  for (let i = 0; i < planes.length; i += 1) {
    const p = planes[i]!;
    const px = p.nx >= 0 ? box.maxX : box.minX;
    const py = p.ny >= 0 ? box.maxY : box.minY;
    const pz = p.nz >= 0 ? box.maxZ : box.minZ;
    if (p.nx * px + p.ny * py + p.nz * pz + p.d < -1e-6) return false;
  }
  return true;
}

/** 빈 공간을 전혀 할당하지 않고 O(log N + K)로 프러스텀/뷰포트 가시 타일을 질의하는 희소 공간 인덱서. */
export class SparseMortonTileIndexer<TPayload = string> {
  public readonly worldExtent: number;
  public readonly dimension: 2 | 3;
  private readonly leavesByLod = new Map<number, Map<bigint, SpatialTileRecord<TPayload>>>();
  private readonly occupiedByLod = new Map<number, Set<bigint>>();

  public constructor(options: { readonly worldExtent?: number; readonly dimension?: 2 | 3 } = {}) {
    this.worldExtent = Math.max(1, options.worldExtent ?? 1_048_576);
    this.dimension = options.dimension ?? 3;
  }

  public insertTile(params: {
    readonly lod: number;
    readonly x: number;
    readonly y: number;
    readonly z?: number;
    readonly payload: TPayload;
  }): SpatialTileRecord<TPayload> {
    const maxDepth = this.dimension === 3 ? MAX_OCTREE_DEPTH : MAX_QUADTREE_DEPTH;
    const lod = Math.max(0, Math.min(maxDepth, Math.trunc(params.lod)));
    const z = this.dimension === 3 ? (params.z ?? 0) : 0;
    const mortonCode =
      this.dimension === 3
        ? encodeMorton3D(params.x, params.y, z)
        : encodeMorton2D(params.x, params.y);

    let leafTable = this.leavesByLod.get(lod);
    if (!leafTable) {
      leafTable = new Map<bigint, SpatialTileRecord<TPayload>>();
      this.leavesByLod.set(lod, leafTable);
    }
    let occupiedSet = this.occupiedByLod.get(lod);
    if (!occupiedSet) {
      occupiedSet = new Set<bigint>();
      this.occupiedByLod.set(lod, occupiedSet);
    }

    const record: SpatialTileRecord<TPayload> = {
      lod,
      x: Math.trunc(params.x),
      y: Math.trunc(params.y),
      z: Math.trunc(z),
      mortonCode,
      payload: params.payload,
    };
    leafTable.set(mortonCode, record);

    const bitsPerLevel = this.dimension === 3 ? 3 : 2;
    for (let depth = 0; depth <= lod; depth += 1) {
      const shiftBits = BigInt((lod - depth) * bitsPerLevel);
      occupiedSet.add(packPrefixKey(depth, mortonCode >> shiftBits));
    }

    return record;
  }

  public getIndexedTileCount(lod?: number): number {
    if (lod !== undefined) return this.leavesByLod.get(lod)?.size ?? 0;
    let sum = 0;
    for (const m of this.leavesByLod.values()) sum += m.size;
    return sum;
  }

  /** 목표 LOD에서 6-평면 프러스텀과 교차하는 3D/2D 타일만 희소 조상 가지치기로 O(log N + K) 조회한다. */
  public queryFrustumTiles(
    targetLod: number,
    frustumPlanes: readonly FrustumPlane3D[],
  ): FrustumTileQueryResult<TPayload> {
    const leafTable = this.leavesByLod.get(targetLod);
    const occupiedSet = this.occupiedByLod.get(targetLod);
    if (!leafTable || !occupiedSet || leafTable.size === 0) {
      return { visibleTiles: [], visitedNodes: 0, totalIndexedTilesAtLod: 0, serverCostKrw: 0 };
    }

    const visible: SpatialTileRecord<TPayload>[] = [];
    let visitedNodes = 0;
    const branching = this.dimension === 3 ? 8 : 4;
    const shiftPerStep = this.dimension === 3 ? BI_THREE : BI_TWO;

    const visit = (
      depth: number,
      prefix: bigint,
      minX: number,
      minY: number,
      minZ: number,
      cellSize: number,
    ): void => {
      if (!occupiedSet.has(packPrefixKey(depth, prefix))) return;
      visitedNodes += 1;

      const box: AxisAlignedBox3D = {
        minX,
        minY,
        minZ,
        maxX: minX + cellSize,
        maxY: minY + cellSize,
        maxZ: this.dimension === 3 ? minZ + cellSize : 1,
      };
      if (!boxIntersectsFrustum(box, frustumPlanes)) return;

      if (depth === targetLod) {
        const rec = leafTable.get(prefix);
        if (rec) visible.push(rec);
        return;
      }

      const half = cellSize * 0.5;
      const basePrefix = prefix << shiftPerStep;
      for (let oct = 0; oct < branching; oct += 1) {
        const cx = (oct & 1) !== 0 ? minX + half : minX;
        const cy = (oct & 2) !== 0 ? minY + half : minY;
        const cz = (oct & 4) !== 0 ? minZ + half : minZ;
        visit(depth + 1, basePrefix | BigInt(oct), cx, cy, cz, half);
      }
    };

    visit(0, BI_ZERO, 0, 0, 0, this.worldExtent);
    visible.sort((a, b) => (a.mortonCode < b.mortonCode ? -1 : a.mortonCode > b.mortonCode ? 1 : 0));

    return {
      visibleTiles: visible,
      visitedNodes,
      totalIndexedTilesAtLod: leafTable.size,
      serverCostKrw: 0,
    };
  }

  /** 2D 무한 캔버스 뷰포트 사각형에 대한 편의 질의 헬퍼. */
  public queryViewport2D(
    targetLod: number,
    viewport: ViewportRect2D,
  ): FrustumTileQueryResult<TPayload> {
    return this.queryFrustumTiles(targetLod, [
      { nx: 1, ny: 0, nz: 0, d: -viewport.minX },
      { nx: -1, ny: 0, nz: 0, d: viewport.maxX },
      { nx: 0, ny: 1, nz: 0, d: -viewport.minY },
      { nx: 0, ny: -1, nz: 0, d: viewport.maxY },
    ]);
  }
}
