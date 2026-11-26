/**
 * 하이브리드 WebGPU + WASM64 이기종 컴퓨트 DAG 스케줄러 ·
 * 청크 인증 AEAD(AES-256-GCM + 머클 스트림) 대용량 P2P 스트리밍 검증기 ·
 * 정적/동적 분리 캐스케이드 그림자 맵(Split CSM) 더티 타일 캐시 ·
 * 저점도 모세관 잉크 번짐 & 공간 해시(Spatial-Hash) 2D/3D 입자 충돌 솔버 ·
 * WebGPU 컴퓨트 메시렛(Meshlet) 수밀 동적 변위 세분화기.
 */

const TEXT_ENCODER = new TextEncoder();

// 1. 하이브리드 WebGPU + WASM64 이기종 컴퓨트 DAG 스케줄러
export type ComputeBackendTarget = "wasm64-simd" | "webgpu-compute";

export interface HeterogeneousDagNode {
  readonly nodeId: string; readonly dependsOn: readonly string[];
  readonly outputBytes: number; readonly wasmSimdExecMs: number; readonly webgpuExecMs: number;
  readonly webgpuDispatchOverheadMs?: number; readonly forcedTarget?: ComputeBackendTarget;
}

export interface HeterogeneousHardwareProfile {
  readonly cpuToGpuBandwidthBytesPerMs?: number;
  readonly gpuToCpuBandwidthBytesPerMs?: number;
  readonly defaultGpuDispatchOverheadMs?: number;
}

export interface ScheduledDagTask {
  readonly nodeId: string; readonly assignedTarget: ComputeBackendTarget;
  readonly startMs: number; readonly finishMs: number; readonly transferCostMs: number;
}

export interface HeterogeneousDagSchedule {
  readonly orderedTasks: readonly ScheduledDagTask[];
  readonly makespanMs: number; readonly pureWasmMakespanMs: number;
  readonly crossDeviceTransferBytes: number; readonly speedupOverPureWasm: number;
}

/** 전송 대역폭과 커널 실행 비용을 함께 비교해 각 DAG 노드를 WASM64 SIMD 또는 WebGPU에 배정한다. */
export function scheduleHeterogeneousComputeDag(
  nodes: readonly HeterogeneousDagNode[],
  hw?: HeterogeneousHardwareProfile,
): HeterogeneousDagSchedule {
  const upBw = Math.max(1024, hw?.cpuToGpuBandwidthBytesPerMs ?? 12 * 1024 * 1024);
  const downBw = Math.max(1024, hw?.gpuToCpuBandwidthBytesPerMs ?? 8 * 1024 * 1024);
  const defaultOverhead = Math.max(0, hw?.defaultGpuDispatchOverheadMs ?? 0.08);

  const byId = new Map<string, HeterogeneousDagNode>();
  const inDegree = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const n of nodes) {
    byId.set(n.nodeId, n);
    inDegree.set(n.nodeId, n.dependsOn.length);
    children.set(n.nodeId, []);
  }
  for (const n of nodes) {
    for (const dep of n.dependsOn) {
      const list = children.get(dep);
      if (!list) throw new Error(`존재하지 않는 상위 DAG 노드 참조입니다: ${dep}`);
      list.push(n.nodeId);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }
  const topoOrder: HeterogeneousDagNode[] = [];
  while (queue.length > 0) {
    const curId = queue.shift()!;
    topoOrder.push(byId.get(curId)!);
    for (const childId of children.get(curId) ?? []) {
      const nextDeg = (inDegree.get(childId) ?? 1) - 1;
      inDegree.set(childId, nextDeg);
      if (nextDeg === 0) queue.push(childId);
    }
  }
  if (topoOrder.length !== nodes.length) {
    throw new Error("컴퓨트 DAG에 순환 의존성(Cycle)이 존재합니다.");
  }

  let wasmLaneReadyMs = 0;
  let gpuLaneReadyMs = 0;
  let crossDeviceTransferBytes = 0;
  let pureWasmMakespanMs = 0;
  const scheduled = new Map<string, ScheduledDagTask>();

  for (const node of topoOrder) {
    pureWasmMakespanMs += Math.max(0.001, node.wasmSimdExecMs);
    const evaluate = (target: ComputeBackendTarget) => {
      let depReadyMs = target === "wasm64-simd" ? wasmLaneReadyMs : gpuLaneReadyMs;
      let transferMs = 0;
      let transferredBytes = 0;
      for (const depId of node.dependsOn) {
        const parent = scheduled.get(depId)!;
        const parentNode = byId.get(depId)!;
        let xfer = 0;
        if (parent.assignedTarget !== target) {
          xfer = parentNode.outputBytes / (parent.assignedTarget === "wasm64-simd" ? upBw : downBw);
          transferMs += xfer;
          transferredBytes += parentNode.outputBytes;
        }
        if (parent.finishMs + xfer > depReadyMs) depReadyMs = parent.finishMs + xfer;
      }
      const execMs =
        target === "wasm64-simd"
          ? Math.max(0.001, node.wasmSimdExecMs)
          : Math.max(0.001, node.webgpuExecMs) + (node.webgpuDispatchOverheadMs ?? defaultOverhead);
      return { startMs: depReadyMs, finishMs: depReadyMs + execMs, transferMs, transferredBytes };
    };

    const wasmEval = evaluate("wasm64-simd");
    const gpuEval = evaluate("webgpu-compute");
    const pickTarget: ComputeBackendTarget =
      node.forcedTarget ?? (gpuEval.finishMs < wasmEval.finishMs ? "webgpu-compute" : "wasm64-simd");
    const chosen = pickTarget === "webgpu-compute" ? gpuEval : wasmEval;
    if (pickTarget === "wasm64-simd") wasmLaneReadyMs = chosen.finishMs;
    else gpuLaneReadyMs = chosen.finishMs;
    crossDeviceTransferBytes += chosen.transferredBytes;
    scheduled.set(node.nodeId, {
      nodeId: node.nodeId,
      assignedTarget: pickTarget,
      startMs: chosen.startMs,
      finishMs: chosen.finishMs,
      transferCostMs: chosen.transferMs,
    });
  }

  const orderedTasks = topoOrder.map((n) => scheduled.get(n.nodeId)!);
  const makespanMs = orderedTasks.reduce((m, t) => Math.max(m, t.finishMs), 0);
  return {
    orderedTasks,
    makespanMs,
    pureWasmMakespanMs,
    crossDeviceTransferBytes,
    speedupOverPureWasm: makespanMs > 0 ? pureWasmMakespanMs / makespanMs : 1,
  };
}

// 2. 청크 인증 AEAD (AES-256-GCM + 머클 스트림) P2P 대용량 스트리밍 검증기
export interface AuthenticatedAssetChunkPacket {
  readonly assetId: string; readonly chunkIndex: number; readonly totalChunks: number; readonly isFinal: boolean;
  readonly iv96: Uint8Array; readonly ciphertextWithTag: Uint8Array; readonly chunkPlainSha256Hex: string;
}

export interface AssetStreamSealManifest {
  readonly assetId: string; readonly totalChunks: number;
  readonly streamNoncePrefix64: Uint8Array; readonly merkleRootHex: string;
}

export interface VerifiedChunkStagePort {
  readonly writeVerifiedChunk: (chunkIndex: number, plainBytes: Uint8Array) => void;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return ab;
}

async function sha256HexBytes(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", toArrayBuffer(bytes)));
  let out = "";
  for (let i = 0; i < digest.length; i += 1) out += (digest[i] ?? 0).toString(16).padStart(2, "0");
  return out;
}

async function computeStreamMerkleRoot(leafHashesHex: readonly string[]): Promise<string> {
  if (leafHashesHex.length === 0) return "0".repeat(64);
  let level = [...leafHashesHex];
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? left;
      next.push(await sha256HexBytes(TEXT_ENCODER.encode(`${left}:${right}`)));
    }
    level = next;
  }
  return level[0]!;
}

function buildChunkIv96(prefix64: Uint8Array, chunkIndex: number): Uint8Array<ArrayBuffer> {
  const ab = new ArrayBuffer(12);
  const iv = new Uint8Array(ab);
  iv.set(prefix64.subarray(0, 8), 0);
  new DataView(ab).setUint32(8, chunkIndex >>> 0, false);
  return iv;
}

function buildChunkAad(assetId: string, chunkIndex: number, totalChunks: number, isFinal: boolean): ArrayBuffer {
  return toArrayBuffer(
    TEXT_ENCODER.encode(`toonstudio-aead-v1|${assetId}|${chunkIndex}|${totalChunks}|${isFinal ? 1 : 0}`),
  );
}

/** 대용량 에셋을 청크별 AES-256-GCM 암호화 + AAD 바인딩 + 머클 루트 매니페스트로 봉인한다. */
export async function encryptAssetIntoAuthenticatedChunks(params: {
  readonly assetId: string;
  readonly assetBytes: Uint8Array;
  readonly aesKey: CryptoKey;
  readonly chunkSizeBytes?: number;
}): Promise<{
  readonly manifest: AssetStreamSealManifest;
  readonly chunks: readonly AuthenticatedAssetChunkPacket[];
}> {
  const step = Math.max(256, Math.round(params.chunkSizeBytes ?? 65536));
  const totalChunks = Math.max(1, Math.ceil(params.assetBytes.byteLength / step));
  const prefix64 = new Uint8Array(8);
  globalThis.crypto.getRandomValues(prefix64);
  const chunks: AuthenticatedAssetChunkPacket[] = [];
  const leafHashes: string[] = [];

  for (let idx = 0; idx < totalChunks; idx += 1) {
    const plain = params.assetBytes.subarray(idx * step, Math.min(params.assetBytes.byteLength, (idx + 1) * step));
    const isFinal = idx === totalChunks - 1;
    const iv96 = buildChunkIv96(prefix64, idx);
    const aad = buildChunkAad(params.assetId, idx, totalChunks, isFinal);
    const encrypted = await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv96, additionalData: aad },
      params.aesKey,
      toArrayBuffer(plain),
    );
    const plainHash = await sha256HexBytes(plain);
    leafHashes.push(plainHash);
    chunks.push({
      assetId: params.assetId,
      chunkIndex: idx,
      totalChunks,
      isFinal,
      iv96,
      ciphertextWithTag: new Uint8Array(encrypted),
      chunkPlainSha256Hex: plainHash,
    });
  }

  return {
    manifest: {
      assetId: params.assetId,
      totalChunks,
      streamNoncePrefix64: prefix64,
      merkleRootHex: await computeStreamMerkleRoot(leafHashes),
    },
    chunks,
  };
}

/** 스트리밍 도중 변조·순서 뒤바뀜·절단된 청크를 OPFS 기록 전에 즉시 차단하는 AEAD + 머클 검증기. */
export class ChunkAuthenticatedAssetStreamVerifier {
  private readonly manifest: AssetStreamSealManifest;
  private readonly aesKey: CryptoKey;
  private readonly stagePort: VerifiedChunkStagePort;
  private readonly leafHashes: string[] = [];
  private expectedIndex = 0;
  private poisonedChunkCount = 0;

  public constructor(manifest: AssetStreamSealManifest, aesKey: CryptoKey, stagePort: VerifiedChunkStagePort) {
    this.manifest = manifest;
    this.aesKey = aesKey;
    this.stagePort = stagePort;
  }

  public async ingestChunk(packet: AuthenticatedAssetChunkPacket): Promise<{
    readonly accepted: boolean;
    readonly streamCompleted: boolean;
    readonly reason: string;
  }> {
    if (
      packet.assetId !== this.manifest.assetId ||
      packet.chunkIndex !== this.expectedIndex ||
      packet.totalChunks !== this.manifest.totalChunks ||
      packet.isFinal !== (packet.chunkIndex === this.manifest.totalChunks - 1)
    ) {
      this.poisonedChunkCount += 1;
      return { accepted: false, streamCompleted: false, reason: "sequence-or-metadata-mismatch" };
    }
    const expectedIv = buildChunkIv96(this.manifest.streamNoncePrefix64, packet.chunkIndex);
    for (let i = 0; i < 12; i += 1) {
      if ((packet.iv96[i] ?? -1) !== (expectedIv[i] ?? -2)) {
        this.poisonedChunkCount += 1;
        return { accepted: false, streamCompleted: false, reason: "nonce-mismatch" };
      }
    }

    let plainBytes: Uint8Array;
    try {
      const aad = buildChunkAad(packet.assetId, packet.chunkIndex, packet.totalChunks, packet.isFinal);
      const dec = await globalThis.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: expectedIv, additionalData: aad },
        this.aesKey,
        toArrayBuffer(packet.ciphertextWithTag),
      );
      plainBytes = new Uint8Array(dec);
    } catch {
      this.poisonedChunkCount += 1;
      return { accepted: false, streamCompleted: false, reason: "aead-tag-rejected" };
    }

    const actualLeafHash = await sha256HexBytes(plainBytes);
    if (actualLeafHash !== packet.chunkPlainSha256Hex) {
      this.poisonedChunkCount += 1;
      return { accepted: false, streamCompleted: false, reason: "leaf-hash-mismatch" };
    }
    if (packet.isFinal) {
      const root = await computeStreamMerkleRoot([...this.leafHashes, actualLeafHash]);
      if (root !== this.manifest.merkleRootHex) {
        this.poisonedChunkCount += 1;
        return { accepted: false, streamCompleted: false, reason: "merkle-root-mismatch" };
      }
    }

    this.leafHashes.push(actualLeafHash);
    this.expectedIndex += 1;
    this.stagePort.writeVerifiedChunk(packet.chunkIndex, plainBytes);
    return { accepted: true, streamCompleted: packet.isFinal, reason: "ok" };
  }

  public getPoisonedChunkCount(): number {
    return this.poisonedChunkCount;
  }
}

// 3. 정적/동적 분리 캐스케이드 그림자 맵(Split CSM) 더티 타일 캐시
export interface CsmCascadeSlice {
  readonly cascadeIndex: number;
  readonly worldMinX: number; readonly worldMinZ: number;
  readonly worldMaxX: number; readonly worldMaxZ: number;
  readonly tilesPerAxis: number;
}

export interface MovingBoneBounds {
  readonly boneId: string;
  readonly prevMinX: number; readonly prevMinZ: number; readonly prevMaxX: number; readonly prevMaxZ: number;
  readonly nextMinX: number; readonly nextMinZ: number; readonly nextMaxX: number; readonly nextMaxZ: number;
}

export interface CsmFrameUpdatePlan {
  readonly lightMoved: boolean;
  readonly totalCascadeTiles: number;
  readonly dirtyTileCount: number;
  readonly skippedCascadeIndices: readonly number[];
  readonly dirtyCascades: readonly {
    readonly cascadeIndex: number;
    readonly dirtyTiles: readonly (readonly [number, number])[];
    readonly reuseStaticDepthCache: boolean;
  }[];
  readonly tileSavingsPct: number;
}

/** 정적 배경 깊이 타일은 캐시로 보존하고 움직인 캐릭터 본 AABB가 닿은 캐스케이드 타일만 재렌더링한다. */
export class SplitCsmDirtyTileCache {
  private readonly cascades: readonly CsmCascadeSlice[];
  private lastLightDir: readonly [number, number, number] | null = null;

  public constructor(cascades: readonly CsmCascadeSlice[]) {
    this.cascades = cascades;
  }

  public planShadowFrame(
    lightDirection: readonly [number, number, number],
    movingBones: readonly MovingBoneBounds[],
  ): CsmFrameUpdatePlan {
    const prev = this.lastLightDir;
    const lightMoved =
      prev === null ||
      Math.hypot(lightDirection[0] - prev[0], lightDirection[1] - prev[1], lightDirection[2] - prev[2]) > 1e-4;
    this.lastLightDir = [lightDirection[0], lightDirection[1], lightDirection[2]];

    let totalCascadeTiles = 0;
    let dirtyTileCount = 0;
    const skippedCascadeIndices: number[] = [];
    const dirtyCascades: {
      readonly cascadeIndex: number;
      readonly dirtyTiles: readonly (readonly [number, number])[];
      readonly reuseStaticDepthCache: boolean;
    }[] = [];

    for (const c of this.cascades) {
      const grid = Math.max(1, c.tilesPerAxis);
      totalCascadeTiles += grid * grid;
      const dirtySet = new Set<number>();
      if (lightMoved) {
        for (let i = 0; i < grid * grid; i += 1) dirtySet.add(i);
      } else {
        const spanX = Math.max(1e-5, c.worldMaxX - c.worldMinX);
        const spanZ = Math.max(1e-5, c.worldMaxZ - c.worldMinZ);
        const markAabb = (minX: number, minZ: number, maxX: number, maxZ: number): void => {
          if (maxX < c.worldMinX || minX > c.worldMaxX || maxZ < c.worldMinZ || minZ > c.worldMaxZ) return;
          const x0 = Math.max(0, Math.floor(((minX - c.worldMinX) / spanX) * grid));
          const x1 = Math.min(grid - 1, Math.floor(((maxX - c.worldMinX) / spanX) * grid));
          const z0 = Math.max(0, Math.floor(((minZ - c.worldMinZ) / spanZ) * grid));
          const z1 = Math.min(grid - 1, Math.floor(((maxZ - c.worldMinZ) / spanZ) * grid));
          for (let tz = z0; tz <= z1; tz += 1) for (let tx = x0; tx <= x1; tx += 1) dirtySet.add(tz * grid + tx);
        };
        for (const b of movingBones) {
          const moved =
            Math.abs(b.nextMinX - b.prevMinX) + Math.abs(b.nextMinZ - b.prevMinZ) +
            Math.abs(b.nextMaxX - b.prevMaxX) + Math.abs(b.nextMaxZ - b.prevMaxZ);
          if (moved <= 1e-5) continue;
          markAabb(b.prevMinX, b.prevMinZ, b.prevMaxX, b.prevMaxZ);
          markAabb(b.nextMinX, b.nextMinZ, b.nextMaxX, b.nextMaxZ);
        }
      }
      if (dirtySet.size === 0) {
        skippedCascadeIndices.push(c.cascadeIndex);
      } else {
        dirtyTileCount += dirtySet.size;
        dirtyCascades.push({
          cascadeIndex: c.cascadeIndex,
          dirtyTiles: [...dirtySet].sort((a, b) => a - b).map((idx) => [idx % grid, Math.floor(idx / grid)] as const),
          reuseStaticDepthCache: !lightMoved,
        });
      }
    }

    return {
      lightMoved, totalCascadeTiles, dirtyTileCount, skippedCascadeIndices, dirtyCascades,
      tileSavingsPct: totalCascadeTiles > 0 ? ((totalCascadeTiles - dirtyTileCount) / totalCascadeTiles) * 100 : 0,
    };
  }
}

// 4. 저점도 모세관 잉크 번짐 & 공간 해시 2D/3D 입자 충돌 솔버
export interface CapillaryInkGridState {
  readonly width: number; readonly height: number;
  readonly pigmentMass: Float32Array; readonly waterSaturation: Float32Array;
}

export interface SpatialParticle3D {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  readonly radius: number; readonly mass: number;
}

/** 종이 섬유 이방성과 모세관 포화도 임계값에 따라 저점도 잉크 번짐을 질량 보존하며 1스텝 전진시킨다. */
export function stepCapillaryInkBleed(
  state: CapillaryInkGridState,
  options?: {
    readonly diffusivity?: number;
    readonly fiberAnisotropyX?: number;
    readonly capillaryThreshold?: number;
    readonly evaporationRate?: number;
  },
): { readonly totalMassBefore: number; readonly totalMassAfter: number; readonly wetCellCount: number } {
  const { width, height, pigmentMass, waterSaturation } = state;
  const diff = Math.min(0.22, Math.max(0.01, options?.diffusivity ?? 0.12));
  const anisoX = Math.max(0.5, Math.min(2.0, options?.fiberAnisotropyX ?? 1.35));
  const anisoY = 2.0 - anisoX;
  const threshold = options?.capillaryThreshold ?? 0.15;
  const evap = Math.max(0, Math.min(0.1, options?.evaporationRate ?? 0.01));

  let totalMassBefore = 0;
  for (let i = 0; i < pigmentMass.length; i += 1) totalMassBefore += pigmentMass[i] ?? 0;

  const nextPigment = new Float32Array(pigmentMass);
  const nextWater = new Float32Array(waterSaturation);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const wHere = waterSaturation[idx] ?? 0;
      const pHere = pigmentMass[idx] ?? 0;
      if (wHere <= threshold || pHere <= 1e-7) continue;

      const neighbors: [number, number][] = [];
      if (x + 1 < width) neighbors.push([idx + 1, anisoX]);
      if (x - 1 >= 0) neighbors.push([idx - 1, anisoX]);
      if (y + 1 < height) neighbors.push([idx + width, anisoY]);
      if (y - 1 >= 0) neighbors.push([idx - width, anisoY]);

      for (const [nIdx, weight] of neighbors) {
        const wOther = waterSaturation[nIdx] ?? 0;
        if (wHere > wOther) {
          const flux = diff * weight * 0.25 * (wHere - wOther);
          nextPigment[idx] = (nextPigment[idx] ?? 0) - pHere * flux;
          nextPigment[nIdx] = (nextPigment[nIdx] ?? 0) + pHere * flux;
          nextWater[idx] = (nextWater[idx] ?? 0) - (wHere - threshold) * flux;
          nextWater[nIdx] = (nextWater[nIdx] ?? 0) + (wHere - threshold) * flux;
        }
      }
    }
  }

  let totalMassAfter = 0;
  let wetCellCount = 0;
  for (let i = 0; i < pigmentMass.length; i += 1) {
    const p = Math.max(0, nextPigment[i] ?? 0);
    const w = Math.max(0, (nextWater[i] ?? 0) * (1 - evap));
    pigmentMass[i] = p;
    waterSaturation[i] = w;
    totalMassAfter += p;
    if (w > threshold) wetCellCount += 1;
  }
  return { totalMassBefore, totalMassAfter, wetCellCount };
}

/** 균일 3D 공간 해시 격자로 O(N) 근방 탐색 및 탄성 충격량 입자 충돌을 해결한다. */
export function stepSpatialHashParticles(
  particles: readonly SpatialParticle3D[],
  dtSec: number,
  cellSize: number,
  restitution = 0.8,
): { readonly resolvedCollisions: number } {
  const invCell = 1 / Math.max(1e-3, cellSize);
  const buckets = new Map<string, number[]>();

  for (let i = 0; i < particles.length; i += 1) {
    const p = particles[i]!;
    p.x += p.vx * dtSec;
    p.y += p.vy * dtSec;
    p.z += p.vz * dtSec;
    const key = `${Math.floor(p.x * invCell)},${Math.floor(p.y * invCell)},${Math.floor(p.z * invCell)}`;
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    list.push(i);
  }

  let resolvedCollisions = 0;
  for (let i = 0; i < particles.length; i += 1) {
    const a = particles[i]!;
    const cx = Math.floor(a.x * invCell);
    const cy = Math.floor(a.y * invCell);
    const cz = Math.floor(a.z * invCell);

    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const list = buckets.get(`${cx + dx},${cy + dy},${cz + dz}`);
          if (!list) continue;
          for (const j of list) {
            if (j <= i) continue;
            const b = particles[j]!;
            const rx = b.x - a.x;
            const ry = b.y - a.y;
            const rz = b.z - a.z;
            const minDist = a.radius + b.radius;
            const distSq = rx * rx + ry * ry + rz * rz;
            if (distSq >= minDist * minDist) continue;

            const dist = Math.max(1e-6, Math.sqrt(distSq));
            const nx = rx / dist;
            const ny = ry / dist;
            const nz = rz / dist;
            const overlap = minDist - dist;
            const invA = 1 / Math.max(1e-6, a.mass);
            const invB = 1 / Math.max(1e-6, b.mass);
            const invSum = invA + invB;

            a.x -= nx * overlap * (invA / invSum);
            a.y -= ny * overlap * (invA / invSum);
            a.z -= nz * overlap * (invA / invSum);
            b.x += nx * overlap * (invB / invSum);
            b.y += ny * overlap * (invB / invSum);
            b.z += nz * overlap * (invB / invSum);

            const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny + (b.vz - a.vz) * nz;
            if (vn < 0) {
              const imp = (-(1 + restitution) * vn) / invSum;
              a.vx -= imp * invA * nx;
              a.vy -= imp * invA * ny;
              a.vz -= imp * invA * nz;
              b.vx += imp * invB * nx;
              b.vy += imp * invB * ny;
              b.vz += imp * invB * nz;
            }
            resolvedCollisions += 1;
          }
        }
      }
    }
  }
  return { resolvedCollisions };
}

// 5. WebGPU 컴퓨트 메시렛(Meshlet) 수밀 동적 변위 세분화기
export const WGSL_MESHLET_DISPLACEMENT_COMPUTE = [
  "struct DisplaceParams { vertex_count: u32, amplitude: f32, frequency: f32, _pad: u32 };",
  "@group(0) @binding(0) var<uniform> params: DisplaceParams;",
  "@group(0) @binding(1) var<storage, read> in_pos: array<f32>;",
  "@group(0) @binding(2) var<storage, read> in_norm: array<f32>;",
  "@group(0) @binding(3) var<storage, read_write> out_pos: array<f32>;",
  "@compute @workgroup_size(64, 1, 1)",
  "fn meshlet_displace_main(@builtin(global_invocation_id) gid: vec3<u32>) {",
  "  let vid = gid.x; if (vid >= params.vertex_count) { return; }",
  "  let b = vid * 3u; let d = params.amplitude * sin(in_pos[b] * params.frequency) * cos(in_pos[b + 2u] * params.frequency);",
  "  out_pos[b] = in_pos[b] + in_norm[b] * d; out_pos[b + 1u] = in_pos[b + 1u] + in_norm[b + 1u] * d; out_pos[b + 2u] = in_pos[b + 2u] + in_norm[b + 2u] * d;",
  "}",
].join("\n");

export interface SubdividedMeshletCluster {
  readonly meshletIndex: number; readonly localVertexIndices: Uint32Array; readonly localTriangles: Uint32Array;
}

export interface DisplacedMeshletOutput {
  readonly positions: Float32Array; readonly normals: Float32Array; readonly indices: Uint32Array;
  readonly meshlets: readonly SubdividedMeshletCluster[];
  readonly vertexCount: number; readonly triangleCount: number; readonly openBoundaryEdges: number;
}

function computeSmoothVertexNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const i0 = (indices[t] ?? 0) * 3;
    const i1 = (indices[t + 1] ?? 0) * 3;
    const i2 = (indices[t + 2] ?? 0) * 3;
    const e1x = (positions[i1] ?? 0) - (positions[i0] ?? 0);
    const e1y = (positions[i1 + 1] ?? 0) - (positions[i0 + 1] ?? 0);
    const e1z = (positions[i1 + 2] ?? 0) - (positions[i0 + 2] ?? 0);
    const e2x = (positions[i2] ?? 0) - (positions[i0] ?? 0);
    const e2y = (positions[i2 + 1] ?? 0) - (positions[i0 + 1] ?? 0);
    const e2z = (positions[i2 + 2] ?? 0) - (positions[i0 + 2] ?? 0);
    const cx = e1y * e2z - e1z * e2y;
    const cy = e1z * e2x - e1x * e2z;
    const cz = e1x * e2y - e1y * e2x;
    for (const base of [i0, i1, i2]) {
      normals[base] = (normals[base] ?? 0) + cx;
      normals[base + 1] = (normals[base + 1] ?? 0) + cy;
      normals[base + 2] = (normals[base + 2] ?? 0) + cz;
    }
  }
  for (let v = 0; v < normals.length; v += 3) {
    const inv = 1 / Math.max(1e-8, Math.hypot(normals[v] ?? 0, normals[v + 1] ?? 0, normals[v + 2] ?? 0));
    normals[v] = (normals[v] ?? 0) * inv;
    normals[v + 1] = (normals[v + 1] ?? 0) * inv;
    normals[v + 2] = (normals[v + 2] ?? 0) * inv;
  }
  return normals;
}

function countNonManifoldOrOpenEdges(indices: Uint32Array): number {
  const edgeUses = new Map<string, number>();
  for (let t = 0; t < indices.length; t += 3) {
    const tri = [indices[t] ?? 0, indices[t + 1] ?? 0, indices[t + 2] ?? 0];
    for (let e = 0; e < 3; e += 1) {
      const a = tri[e]!;
      const b = tri[(e + 1) % 3]!;
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      edgeUses.set(key, (edgeUses.get(key) ?? 0) + 1);
    }
  }
  let open = 0;
  for (const uses of edgeUses.values()) if (uses !== 2) open += 1;
  return open;
}

/** 공유 모서리 용접(Shared-Edge Weld) 1→4 세분화 + 정점 법선 변위 + 메시렛 패킹으로 균열 없는 수밀 메시를 생성한다. */
export function subdivideAndDisplaceMeshlets(params: {
  readonly basePositions: Float32Array;
  readonly baseIndices: Uint32Array;
  readonly subdivisionLevels?: 1 | 2;
  readonly displacementFn?: (x: number, y: number, z: number) => number;
  readonly maxMeshletVertices?: number;
  readonly maxMeshletTriangles?: number;
}): DisplacedMeshletOutput {
  let curPos = new Float32Array(params.basePositions);
  let curIdx = new Uint32Array(params.baseIndices);
  const levels = params.subdivisionLevels ?? 1;

  for (let lv = 0; lv < levels; lv += 1) {
    const posList = Array.from(curPos);
    const nextTris: number[] = [];
    const midMap = new Map<string, number>();
    const mid = (v0: number, v1: number): number => {
      const key = v0 < v1 ? `${v0}_${v1}` : `${v1}_${v0}`;
      const hit = midMap.get(key);
      if (hit !== undefined) return hit;
      const vid = posList.length / 3;
      const b0 = v0 * 3;
      const b1 = v1 * 3;
      posList.push(
        ((curPos[b0] ?? 0) + (curPos[b1] ?? 0)) * 0.5,
        ((curPos[b0 + 1] ?? 0) + (curPos[b1 + 1] ?? 0)) * 0.5,
        ((curPos[b0 + 2] ?? 0) + (curPos[b1 + 2] ?? 0)) * 0.5,
      );
      midMap.set(key, vid);
      return vid;
    };
    for (let t = 0; t < curIdx.length; t += 3) {
      const i0 = curIdx[t] ?? 0;
      const i1 = curIdx[t + 1] ?? 0;
      const i2 = curIdx[t + 2] ?? 0;
      const m01 = mid(i0, i1);
      const m12 = mid(i1, i2);
      const m20 = mid(i2, i0);
      nextTris.push(i0, m01, m20, i1, m12, m01, i2, m20, m12, m01, m12, m20);
    }
    curPos = new Float32Array(posList);
    curIdx = new Uint32Array(nextTris);
  }

  const preNorm = computeSmoothVertexNormals(curPos, curIdx);
  const dispFn = params.displacementFn ?? ((x, _y, z) => 0.04 * Math.sin(x * 3.0) * Math.cos(z * 3.0));
  const displacedPos = new Float32Array(curPos.length);
  for (let v = 0; v < curPos.length; v += 3) {
    const px = curPos[v] ?? 0;
    const py = curPos[v + 1] ?? 0;
    const pz = curPos[v + 2] ?? 0;
    const d = dispFn(px, py, pz);
    displacedPos[v] = px + (preNorm[v] ?? 0) * d;
    displacedPos[v + 1] = py + (preNorm[v + 1] ?? 0) * d;
    displacedPos[v + 2] = pz + (preNorm[v + 2] ?? 0) * d;
  }

  const maxVerts = Math.max(8, params.maxMeshletVertices ?? 64);
  const maxTris = Math.max(4, params.maxMeshletTriangles ?? 126);
  const meshlets: SubdividedMeshletCluster[] = [];
  let g2l = new Map<number, number>();
  let lVerts: number[] = [];
  let lTris: number[] = [];
  const flush = (): void => {
    if (lTris.length === 0) return;
    meshlets.push({
      meshletIndex: meshlets.length,
      localVertexIndices: new Uint32Array(lVerts),
      localTriangles: new Uint32Array(lTris),
    });
    g2l = new Map<number, number>();
    lVerts = [];
    lTris = [];
  };
  for (let t = 0; t < curIdx.length; t += 3) {
    const tri = [curIdx[t] ?? 0, curIdx[t + 1] ?? 0, curIdx[t + 2] ?? 0];
    const addV = tri.reduce((acc, g) => acc + (g2l.has(g) ? 0 : 1), 0);
    if (lVerts.length + addV > maxVerts || lTris.length / 3 >= maxTris) flush();
    for (const g of tri) {
      let loc = g2l.get(g);
      if (loc === undefined) {
        loc = lVerts.length;
        lVerts.push(g);
        g2l.set(g, loc);
      }
      lTris.push(loc);
    }
  }
  flush();

  return {
    positions: displacedPos,
    normals: computeSmoothVertexNormals(displacedPos, curIdx),
    indices: curIdx,
    meshlets,
    vertexCount: displacedPos.length / 3,
    triangleCount: curIdx.length / 3,
    openBoundaryEdges: countNonManifoldOrOpenEdges(curIdx),
  };
}
