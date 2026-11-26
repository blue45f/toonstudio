/**
 * 온디바이스 예측형 SSE Auto-LOD 에셋 프리로더, 공간 BVH 광선 차폐 + 엣지-스토핑 조화 자동 채색기,
 * 그리고 임계치 M-of-N 오프라인 WebCrypto 공동 서명 출고 게이트.
 *
 * - 뷰포트 이동 궤적과 화면 공간 픽셀 오차(`SSE`)를 결합해 엄격한 메모리 한도 안에서
 *   `LOD3 -> LOD2 -> LOD1 -> LOD0` 점진 프리페치와 우선순위 축출을 수행한다.
 * - 3D/2.5D 공간 BVH 그림자·주변광 차폐 힌트와 형태학적 틈새 봉합 엣지-스토핑 조화 확산(Poisson/Jacobi)을
 *   결합해 성긴 색 스크리블만으로 선화 경계 밖 번짐 없이 깔끔한 밑색·명암을 완성한다(`₩0`).
 * - WebCrypto ECDSA `P-256` + `SHA-256`으로 작가·작화·채색·편집 등 최소 `M`개 고유 역할의
 *   정본 매니페스트 서명을 오프라인 검증해 중복 서명 재전송·위변조·정족수 미달을 차단한다.
 */

export type LodLevel = 0 | 1 | 2 | 3;
export type Vec3 = readonly [number, number, number];
export type RgbTuple = readonly [number, number, number];

export interface PredictiveAssetDescriptor {
  readonly assetId: string; readonly center: Vec3; readonly boundingRadius: number;
  /** `LOD0..LOD3` 기하 오차(m) 및 메모리 바이트 크기 (`LOD0` 최고 정밀, `LOD3` 프록시). */
  readonly geometricErrorByLod: readonly [number, number, number, number];
  readonly byteSizeByLod: readonly [number, number, number, number];
}

export interface ViewportTrajectoryState {
  readonly cameraPosition: Vec3; readonly cameraVelocity: Vec3; readonly cameraAcceleration?: Vec3;
  readonly viewportWidthPx: number; readonly viewportHeightPx: number; readonly verticalFovDeg: number;
  readonly nearPlane?: number; readonly predictionHorizonSec?: number; readonly maxAllowedSsePx?: number;
}

export interface LodPrefetchTask {
  readonly assetId: string; readonly targetLod: LodLevel; readonly nextProgressiveLod: LodLevel;
  readonly byteCost: number; readonly predictedMinDistance: number;
  readonly currentSsePx: number; readonly nextLodSsePx: number; readonly priorityScore: number;
}

export interface PredictiveLodPlanReport {
  readonly scheduledTasks: readonly LodPrefetchTask[];
  readonly evictedEntries: readonly { readonly assetId: string; readonly lod: LodLevel; readonly freedBytes: number }[];
  readonly residentBytesAfterPlan: number; readonly memoryCapBytes: number; readonly serverCostKrw: 0;
}

interface ResidentLodEntry {
  readonly assetId: string; readonly lod: LodLevel; readonly byteSize: number;
  lastUtilityScore: number; lastTouchTick: number;
}

const ALL_LODS_COARSE_FIRST: readonly LodLevel[] = [3, 2, 1, 0];

/** 뷰포트 궤적 예측과 화면 공간 오차(`SSE`)에 기반한 엄격 메모리 상한 Auto-LOD 캐시 스케줄러. */
export class PredictiveAutoLodAssetCache {
  private readonly memoryCapBytes: number;
  private readonly catalog = new Map<string, PredictiveAssetDescriptor>();
  private readonly resident = new Map<string, ResidentLodEntry>();
  private residentBytes = 0;
  private tick = 0;

  constructor(memoryCapBytes: number) {
    this.memoryCapBytes = Math.max(1024, Math.floor(memoryCapBytes));
  }

  registerAsset(descriptor: PredictiveAssetDescriptor): void {
    this.catalog.set(descriptor.assetId, descriptor);
  }

  getResidentBytes(): number { return this.residentBytes; }
  getMemoryCapBytes(): number { return this.memoryCapBytes; }

  getBestResidentLod(assetId: string): LodLevel | null {
    for (const lod of [0, 1, 2, 3] as const) {
      if (this.resident.has(`${assetId}@${lod}`)) return lod;
    }
    return null;
  }

  private evaluateMinTrajectoryDistance(asset: PredictiveAssetDescriptor, view: ViewportTrajectoryState): number {
    const horizon = Math.max(0, view.predictionHorizonSec ?? 0.5);
    const acc = view.cameraAcceleration ?? [0, 0, 0];
    const vx = view.cameraVelocity[0] + 0.5 * acc[0] * horizon;
    const vy = view.cameraVelocity[1] + 0.5 * acc[1] * horizon;
    const vz = view.cameraVelocity[2] + 0.5 * acc[2] * horizon;
    const dx0 = view.cameraPosition[0] - asset.center[0];
    const dy0 = view.cameraPosition[1] - asset.center[1];
    const dz0 = view.cameraPosition[2] - asset.center[2];
    const vSq = vx * vx + vy * vy + vz * vz;
    let tStar = 0;
    if (vSq > 1e-9 && horizon > 0) {
      tStar = Math.max(0, Math.min(horizon, -(dx0 * vx + dy0 * vy + dz0 * vz) / vSq));
    }
    const px = view.cameraPosition[0] + view.cameraVelocity[0] * tStar + 0.5 * acc[0] * tStar * tStar;
    const py = view.cameraPosition[1] + view.cameraVelocity[1] * tStar + 0.5 * acc[1] * tStar * tStar;
    const pz = view.cameraPosition[2] + view.cameraVelocity[2] * tStar + 0.5 * acc[2] * tStar * tStar;
    const centerDist = Math.hypot(px - asset.center[0], py - asset.center[1], pz - asset.center[2]);
    return Math.max(view.nearPlane ?? 0.1, centerDist - Math.max(0, asset.boundingRadius));
  }

  planAndAdmitPrefetch(view: ViewportTrajectoryState, maxPrefetchTasks = 8): PredictiveLodPlanReport {
    this.tick += 1;
    const fovRad = (Math.max(10, Math.min(160, view.verticalFovDeg)) * Math.PI) / 180;
    const projScale = Math.max(1, view.viewportHeightPx) / (2 * Math.tan(fovRad * 0.5));
    const maxSse = Math.max(0.1, view.maxAllowedSsePx ?? 1.5);

    const candidates: LodPrefetchTask[] = [];
    const activeTargetByAsset = new Map<string, { targetLod: LodLevel; score: number }>();

    for (const asset of this.catalog.values()) {
      const minDist = this.evaluateMinTrajectoryDistance(asset, view);
      let targetLod: LodLevel = 0;
      for (const lod of ALL_LODS_COARSE_FIRST) {
        const sse = (asset.geometricErrorByLod[lod] * projScale) / minDist;
        if (sse <= maxSse) { targetLod = lod; break; }
      }

      const bestResident = this.getBestResidentLod(asset.assetId);
      const keepUtility = ((asset.geometricErrorByLod[3] * projScale) / minDist) / Math.max(1, asset.byteSizeByLod[targetLod]);
      activeTargetByAsset.set(asset.assetId, { targetLod, score: keepUtility });

      if (bestResident !== null) {
        const curEntry = this.resident.get(`${asset.assetId}@${bestResident}`);
        if (curEntry) { curEntry.lastUtilityScore = keepUtility * 2; curEntry.lastTouchTick = this.tick; }
      }

      if (bestResident === null || bestResident > targetLod) {
        // 점진 로딩: 상주본이 없으면 가장 가벼운 LOD3부터, 있으면 한 단계 높은 해상도로 승격
        const nextLod = (bestResident === null ? 3 : Math.max(targetLod, bestResident - 1)) as LodLevel;
        const byteCost = asset.byteSizeByLod[nextLod];
        if (byteCost <= this.memoryCapBytes) {
          const curSse = bestResident === null
            ? (asset.geometricErrorByLod[3] * 4 * projScale) / minDist
            : (asset.geometricErrorByLod[bestResident] * projScale) / minDist;
          const nextSse = (asset.geometricErrorByLod[nextLod] * projScale) / minDist;
          const deltaSse = Math.max(0.01, curSse - nextSse);
          const priorityScore = (deltaSse / Math.max(1, byteCost / 1024)) * (1 + 1 / minDist);
          candidates.push({
            assetId: asset.assetId, targetLod, nextProgressiveLod: nextLod, byteCost,
            predictedMinDistance: minDist, currentSsePx: curSse, nextLodSsePx: nextSse, priorityScore,
          });
        }
      }
    }

    candidates.sort((a, b) => b.priorityScore - a.priorityScore);
    const scheduled: LodPrefetchTask[] = [];
    const evicted: { readonly assetId: string; readonly lod: LodLevel; readonly freedBytes: number }[] = [];

    for (const task of candidates) {
      if (scheduled.length >= maxPrefetchTasks) break;
      const key = `${task.assetId}@${task.nextProgressiveLod}`;
      if (this.resident.has(key)) continue;

      // 동일 에셋의 더 거친 하위 프록시는 승격 시 우선 회수 후보로 표시
      const evictPool = [...this.resident.values()].sort((a, b) => {
        const aSuperseded = a.assetId === task.assetId && a.lod > task.nextProgressiveLod ? 0 : 1;
        const bSuperseded = b.assetId === task.assetId && b.lod > task.nextProgressiveLod ? 0 : 1;
        if (aSuperseded !== bSuperseded) return aSuperseded - bSuperseded;
        if (a.lastUtilityScore !== b.lastUtilityScore) return a.lastUtilityScore - b.lastUtilityScore;
        return a.lastTouchTick - b.lastTouchTick;
      });

      let projectedBytes = this.residentBytes;
      const pendingEvict: ResidentLodEntry[] = [];
      for (const victim of evictPool) {
        if (projectedBytes + task.byteCost <= this.memoryCapBytes) break;
        const activeTarget = activeTargetByAsset.get(victim.assetId);
        const isSuperseded = victim.assetId === task.assetId && victim.lod > task.nextProgressiveLod;
        if (!isSuperseded && activeTarget && victim.lastUtilityScore > task.priorityScore) continue;
        pendingEvict.push(victim);
        projectedBytes -= victim.byteSize;
      }

      if (projectedBytes + task.byteCost > this.memoryCapBytes) continue;

      for (const victim of pendingEvict) {
        this.resident.delete(`${victim.assetId}@${victim.lod}`);
        this.residentBytes -= victim.byteSize;
        evicted.push({ assetId: victim.assetId, lod: victim.lod, freedBytes: victim.byteSize });
      }

      this.resident.set(key, {
        assetId: task.assetId, lod: task.nextProgressiveLod, byteSize: task.byteCost,
        lastUtilityScore: task.priorityScore, lastTouchTick: this.tick,
      });
      this.residentBytes += task.byteCost;
      scheduled.push(task);
    }

    return {
      scheduledTasks: scheduled, evictedEntries: evicted,
      residentBytesAfterPlan: this.residentBytes, memoryCapBytes: this.memoryCapBytes, serverCostKrw: 0,
    };
  }
}

// ============================================================================
// 2. 공간 BVH 광선 차폐 + 엣지-스토핑 조화 확산(Poisson/Jacobi) 자동 채색기
// ============================================================================

export type BvhOccluderPrimitive =
  | { readonly kind: "aabb"; readonly id: string; readonly min: Vec3; readonly max: Vec3 }
  | { readonly kind: "triangle"; readonly id: string; readonly v0: Vec3; readonly v1: Vec3; readonly v2: Vec3 };

interface BvhNode {
  readonly min: Vec3;
  readonly max: Vec3;
  readonly left: BvhNode | null;
  readonly right: BvhNode | null;
  readonly primitives: readonly BvhOccluderPrimitive[];
}

function primitiveBounds(p: BvhOccluderPrimitive): { min: Vec3; max: Vec3; centroid: Vec3 } {
  if (p.kind === "aabb") {
    return {
      min: p.min, max: p.max,
      centroid: [(p.min[0] + p.max[0]) * 0.5, (p.min[1] + p.max[1]) * 0.5, (p.min[2] + p.max[2]) * 0.5],
    };
  }
  const minX = Math.min(p.v0[0], p.v1[0], p.v2[0]), maxX = Math.max(p.v0[0], p.v1[0], p.v2[0]);
  const minY = Math.min(p.v0[1], p.v1[1], p.v2[1]), maxY = Math.max(p.v0[1], p.v1[1], p.v2[1]);
  const minZ = Math.min(p.v0[2], p.v1[2], p.v2[2]), maxZ = Math.max(p.v0[2], p.v1[2], p.v2[2]);
  return {
    min: [minX, minY, minZ], max: [maxX, maxY, maxZ],
    centroid: [(p.v0[0] + p.v1[0] + p.v2[0]) / 3, (p.v0[1] + p.v1[1] + p.v2[1]) / 3, (p.v0[2] + p.v1[2] + p.v2[2]) / 3],
  };
}

function intersectRayAabb(origin: Vec3, invDir: Vec3, min: Vec3, max: Vec3, maxDist: number): boolean {
  let tMin = 1e-4, tMax = maxDist;
  for (let axis = 0; axis < 3; axis += 1) {
    const t0 = (min[axis]! - origin[axis]!) * invDir[axis]!;
    const t1 = (max[axis]! - origin[axis]!) * invDir[axis]!;
    const lo = Math.min(t0, t1), hi = Math.max(t0, t1);
    if (lo > tMin) tMin = lo;
    if (hi < tMax) tMax = hi;
    if (tMax < tMin) return false;
  }
  return true;
}

function intersectRayTriangle(origin: Vec3, dir: Vec3, v0: Vec3, v1: Vec3, v2: Vec3, maxDist: number): boolean {
  const e1x = v1[0] - v0[0], e1y = v1[1] - v0[1], e1z = v1[2] - v0[2];
  const e2x = v2[0] - v0[0], e2y = v2[1] - v0[1], e2z = v2[2] - v0[2];
  const hx = dir[1] * e2z - dir[2] * e2y;
  const hy = dir[2] * e2x - dir[0] * e2z;
  const hz = dir[0] * e2y - dir[1] * e2x;
  const det = e1x * hx + e1y * hy + e1z * hz;
  if (Math.abs(det) < 1e-8) return false;
  const invDet = 1 / det;
  const sx = origin[0] - v0[0], sy = origin[1] - v0[1], sz = origin[2] - v0[2];
  const u = invDet * (sx * hx + sy * hy + sz * hz);
  if (u < 0 || u > 1) return false;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const v = invDet * (dir[0] * qx + dir[1] * qy + dir[2] * qz);
  if (v < 0 || u + v > 1) return false;
  const t = invDet * (e2x * qx + e2y * qy + e2z * qz);
  return t > 1e-4 && t <= maxDist;
}

/** 3D AABB·삼각형 차폐물 대상 중앙값 분할 공간 BVH 가속 구조. */
export class SpatialOccluderBvh {
  private readonly root: BvhNode | null;

  constructor(primitives: readonly BvhOccluderPrimitive[]) {
    const items = primitives.map((prim) => ({ prim, ...primitiveBounds(prim) }));
    this.root = items.length > 0 ? this.buildNode(items, 0) : null;
  }

  private buildNode(
    items: { prim: BvhOccluderPrimitive; min: Vec3; max: Vec3; centroid: Vec3 }[],
    depth: number,
  ): BvhNode {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const it of items) {
      if (it.min[0] < minX) minX = it.min[0];
      if (it.min[1] < minY) minY = it.min[1];
      if (it.min[2] < minZ) minZ = it.min[2];
      if (it.max[0] > maxX) maxX = it.max[0];
      if (it.max[1] > maxY) maxY = it.max[1];
      if (it.max[2] > maxZ) maxZ = it.max[2];
    }
    const min: Vec3 = [minX, minY, minZ], max: Vec3 = [maxX, maxY, maxZ];
    if (items.length <= 2 || depth >= 16) {
      return { min, max, left: null, right: null, primitives: items.map((x) => x.prim) };
    }
    const ex = maxX - minX, ey = maxY - minY, ez = maxZ - minZ;
    const axis = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2;
    items.sort((a, b) => a.centroid[axis]! - b.centroid[axis]!);
    const mid = items.length >>> 1;
    return {
      min, max,
      left: this.buildNode(items.slice(0, mid), depth + 1),
      right: this.buildNode(items.slice(mid), depth + 1),
      primitives: [],
    };
  }

  hasAnyHit(origin: Vec3, direction: Vec3, maxDistance = 100): boolean {
    if (!this.root) return false;
    const len = Math.hypot(direction[0], direction[1], direction[2]);
    if (len <= 1e-9) return false;
    const dir: Vec3 = [direction[0] / len, direction[1] / len, direction[2] / len];
    const invDir: Vec3 = [
      Math.abs(dir[0]) > 1e-12 ? 1 / dir[0] : 1e12,
      Math.abs(dir[1]) > 1e-12 ? 1 / dir[1] : 1e12,
      Math.abs(dir[2]) > 1e-12 ? 1 / dir[2] : 1e12,
    ];

    const stack: BvhNode[] = [this.root];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (!intersectRayAabb(origin, invDir, node.min, node.max, maxDistance)) continue;
      if (node.left === null && node.right === null) {
        for (const p of node.primitives) {
          const hit = p.kind === "aabb"
            ? intersectRayAabb(origin, invDir, p.min, p.max, maxDistance)
            : intersectRayTriangle(origin, dir, p.v0, p.v1, p.v2, maxDistance);
          if (hit) return true;
        }
      } else {
        if (node.left) stack.push(node.left);
        if (node.right) stack.push(node.right);
      }
    }
    return false;
  }

  evaluateShadingHint(origin: Vec3, keyLightDir: Vec3, ambientRayCount = 6, aoRange = 1.5): {
    readonly directLit: number; readonly ambientVisibility: number; readonly shadeFactor: number;
  } {
    const directLit = this.hasAnyHit(origin, keyLightDir, 100) ? 0 : 1;
    const rays = Math.max(1, ambientRayCount);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    let unoccluded = 0;
    for (let i = 0; i < rays; i += 1) {
      const z = 1 - ((i + 0.5) / rays) * 0.88;
      const r = Math.sqrt(Math.max(0, 1 - z * z));
      const phi = i * goldenAngle;
      if (!this.hasAnyHit(origin, [r * Math.cos(phi), r * Math.sin(phi), z], aoRange)) unoccluded += 1;
    }
    const ambientVisibility = unoccluded / rays;
    const shadeFactor = 0.55 * ambientVisibility + 0.45 * (0.45 + 0.55 * directLit);
    return { directLit, ambientVisibility, shadeFactor: Math.max(0.25, Math.min(1, shadeFactor)) };
  }
}

export interface ColorScribbleSeed {
  readonly x: number; readonly y: number; readonly rgb: RgbTuple; readonly radiusPx?: number;
}

export interface HarmonicAutoColorizeInput {
  readonly width: number; readonly height: number;
  /** 선화 RGBA 버퍼 (어둡고 불투명한 픽셀을 잉크 경계선으로 인식). */
  readonly lineArtRgba: Uint8Array;
  readonly scribbles: readonly ColorScribbleSeed[];
  readonly occluders?: readonly BvhOccluderPrimitive[];
  readonly keyLightDirection?: Vec3;
  readonly ambientShadowTintRgb?: RgbTuple;
  /** 미세하게 끊긴 선화 틈새(예: `1..3px`)를 봉합하는 형태학적 반경(px, 기본값 `1`). */
  readonly gapCloseRadiusPx?: number;
  readonly edgeSharpnessKappa?: number;
  readonly diffusionIterations?: number;
}

export interface HarmonicAutoColorizeResult {
  readonly colorizedRgba: Uint8Array;
  readonly shadowFactorMap: Float32Array;
  readonly iterationsExecuted: number;
  readonly maxStepDelta: number;
  readonly aiTokensUsed: 0;
  readonly serverCostKrw: 0;
}

function closeInkGapsMorphological(ink: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius <= 0) return ink;
  const dilated = new Float32Array(width * height);
  const closed = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let mx = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const v = ink[ny * width + nx]!;
          if (v > mx) mx = v;
        }
      }
      dilated[y * width + x] = mx;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let mn = 1;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const v = dilated[ny * width + nx]!;
          if (v < mn) mn = v;
        }
      }
      closed[y * width + x] = Math.max(ink[y * width + x]!, mn);
    }
  }
  return closed;
}

/**
 * 성긴 아티스트 색 스크리블과 공간 BVH 광선 차폐를 결합해 선화 틈새 번짐 없이 자동 밑색·명암을 생성한다.
 */
export function autoColorizeHarmonicBvh(input: HarmonicAutoColorizeInput): HarmonicAutoColorizeResult {
  const { width, height, lineArtRgba, scribbles } = input;
  const n = width * height;
  const rawInk = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const off = i * 4;
    const lum = (0.299 * lineArtRgba[off]! + 0.587 * lineArtRgba[off + 1]! + 0.114 * lineArtRgba[off + 2]!) / 255;
    const alpha = lineArtRgba[off + 3]! / 255;
    rawInk[i] = alpha * (1 - lum);
  }

  const barrier = closeInkGapsMorphological(rawInk, width, height, Math.max(0, Math.round(input.gapCloseRadiusPx ?? 1)));
  const kappa = Math.max(4, input.edgeSharpnessKappa ?? 16);

  const isSeed = new Uint8Array(n);
  const rCur = new Float32Array(n).fill(255);
  const gCur = new Float32Array(n).fill(255);
  const bCur = new Float32Array(n).fill(255);

  const bfsQueue = new Int32Array(n);
  let qHead = 0, qTail = 0;
  const visited = new Uint8Array(n);

  for (const seed of scribbles) {
    const rad = Math.max(0, Math.round(seed.radiusPx ?? 0));
    for (let dy = -rad; dy <= rad; dy += 1) {
      const sy = Math.round(seed.y) + dy;
      if (sy < 0 || sy >= height) continue;
      for (let dx = -rad; dx <= rad; dx += 1) {
        const sx = Math.round(seed.x) + dx;
        if (sx < 0 || sx >= width) continue;
        const idx = sy * width + sx;
        if (rawInk[idx]! >= 0.65) continue;
        isSeed[idx] = 1;
        rCur[idx] = seed.rgb[0]; gCur[idx] = seed.rgb[1]; bCur[idx] = seed.rgb[2];
        if (!visited[idx]) { visited[idx] = 1; bfsQueue[qTail++] = idx; }
      }
    }
  }

  // 장벽 인식 BFS 초기 전파로 닫힌 선화 영역 내부의 초기 수렴 속도를 대폭 가속
  const dirs = [-1, 1, -width, width];
  while (qHead < qTail) {
    const cur = bfsQueue[qHead++]!;
    const cx = cur % width;
    for (const step of dirs) {
      if ((step === -1 && cx === 0) || (step === 1 && cx === width - 1)) continue;
      const nxt = cur + step;
      if (nxt < 0 || nxt >= n || visited[nxt] || barrier[nxt]! >= 0.45) continue;
      visited[nxt] = 1;
      rCur[nxt] = rCur[cur]!; gCur[nxt] = gCur[cur]!; bCur[nxt] = bCur[cur]!;
      bfsQueue[qTail++] = nxt;
    }
  }

  // Red-Black 가속 엣지-스토핑 조화 확산(Poisson/Jacobi SOR)
  const iters = Math.max(8, input.diffusionIterations ?? 48);
  const omega = 1.35;
  let maxStepDelta = 0;
  for (let iter = 0; iter < iters; iter += 1) {
    maxStepDelta = 0;
    for (let parity = 0; parity < 2; parity += 1) {
      for (let y = 0; y < height; y += 1) {
        for (let x = (y + parity) & 1; x < width; x += 2) {
          const p = y * width + x;
          if (isSeed[p]) continue;
          const bp = barrier[p]!;
          let wSum = 0, sr = 0, sg = 0, sb = 0;
          if (x > 0) {
            const q = p - 1, w = Math.exp(-kappa * Math.max(bp, barrier[q]!));
            wSum += w; sr += w * rCur[q]!; sg += w * gCur[q]!; sb += w * bCur[q]!;
          }
          if (x + 1 < width) {
            const q = p + 1, w = Math.exp(-kappa * Math.max(bp, barrier[q]!));
            wSum += w; sr += w * rCur[q]!; sg += w * gCur[q]!; sb += w * bCur[q]!;
          }
          if (y > 0) {
            const q = p - width, w = Math.exp(-kappa * Math.max(bp, barrier[q]!));
            wSum += w; sr += w * rCur[q]!; sg += w * gCur[q]!; sb += w * bCur[q]!;
          }
          if (y + 1 < height) {
            const q = p + width, w = Math.exp(-kappa * Math.max(bp, barrier[q]!));
            wSum += w; sr += w * rCur[q]!; sg += w * gCur[q]!; sb += w * bCur[q]!;
          }
          if (wSum > 1e-12) {
            const nr = rCur[p]! + omega * (sr / wSum - rCur[p]!);
            const ng = gCur[p]! + omega * (sg / wSum - gCur[p]!);
            const nb = bCur[p]! + omega * (sb / wSum - bCur[p]!);
            const d = Math.max(Math.abs(nr - rCur[p]!), Math.abs(ng - gCur[p]!), Math.abs(nb - bCur[p]!));
            if (d > maxStepDelta) maxStepDelta = d;
            rCur[p] = Math.max(0, Math.min(255, nr));
            gCur[p] = Math.max(0, Math.min(255, ng));
            bCur[p] = Math.max(0, Math.min(255, nb));
          }
        }
      }
    }
    if (maxStepDelta < 0.05) break;
  }

  const bvh = new SpatialOccluderBvh(input.occluders ?? []);
  const lightDir = input.keyLightDirection ?? [0.45, -0.35, 0.82];
  const shadowTint = input.ambientShadowTintRgb ?? [182, 194, 224];
  const shadowFactorMap = new Float32Array(n);
  const outRgba = new Uint8Array(n * 4);

  for (let y = 0; y < height; y += 1) {
    const wy = (y + 0.5) / Math.max(1, height);
    for (let x = 0; x < width; x += 1) {
      const wx = (x + 0.5) / Math.max(1, width);
      const i = y * width + x, off = i * 4;
      const shade = input.occluders && input.occluders.length > 0
        ? bvh.evaluateShadingHint([wx, wy, 0.002], lightDir, 6, 1.2).shadeFactor
        : 1;
      shadowFactorMap[i] = shade;

      const shadowMix = 1 - shade;
      const shadedR = rCur[i]! * (shade + shadowMix * (shadowTint[0] / 255));
      const shadedG = gCur[i]! * (shade + shadowMix * (shadowTint[1] / 255));
      const shadedB = bCur[i]! * (shade + shadowMix * (shadowTint[2] / 255));
      const inkWeight = rawInk[i]!;
      outRgba[off] = Math.round(shadedR * (1 - inkWeight) + lineArtRgba[off]! * inkWeight);
      outRgba[off + 1] = Math.round(shadedG * (1 - inkWeight) + lineArtRgba[off + 1]! * inkWeight);
      outRgba[off + 2] = Math.round(shadedB * (1 - inkWeight) + lineArtRgba[off + 2]! * inkWeight);
      outRgba[off + 3] = 255;
    }
  }

  return {
    colorizedRgba: outRgba, shadowFactorMap, iterationsExecuted: iters,
    maxStepDelta, aiTokensUsed: 0, serverCostKrw: 0,
  };
}

// ============================================================================
// 3. 임계치 M-of-N 오프라인 WebCrypto 공동 서명(Co-Signing) 출고 게이트
// ============================================================================

export type StudioCosignRole = "writer" | "artist" | "colorist" | "editor";

export interface ManuscriptReleaseManifest {
  readonly projectId: string; readonly episodeNumber: number; readonly manuscriptRevision: number;
  readonly archiveSha256Hex: string; readonly layerCount: number;
  readonly canvasWidth: number; readonly canvasHeight: number; readonly createdAtIso: string;
}

export interface AuthorizedCosignerKey {
  readonly keyId: string; readonly role: StudioCosignRole;
  readonly displayNameKo: string; readonly publicKey: CryptoKey;
}

export interface GeneratedStudioCosigner extends AuthorizedCosignerKey {
  readonly privateKey: CryptoKey;
}

export interface CosignatureReceipt {
  readonly keyId: string; readonly role: StudioCosignRole;
  readonly manifestDigestHex: string; readonly signedAtIso: string; readonly signatureBytes: Uint8Array;
}

export type CosignRejectionReason =
  | "unknown-key" | "role-mismatch" | "duplicate-key-replay"
  | "duplicate-role-quorum" | "digest-mismatch" | "invalid-signature";

export interface RejectedCosignature {
  readonly keyId: string; readonly role: StudioCosignRole; readonly reason: CosignRejectionReason;
}

export interface CosignReleaseGateReport {
  readonly approved: boolean; readonly thresholdM: number; readonly registeredKeyCountN: number;
  readonly manifestDigestHex: string; readonly verifiedKeyIds: readonly string[];
  readonly distinctVerifiedRoles: readonly StudioCosignRole[];
  readonly rejectedReceipts: readonly RejectedCosignature[]; readonly serverCostKrw: 0;
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += bytes[i]!.toString(16).padStart(2, "0");
  return out;
}

function canonicalizeManifestString(manifest: ManuscriptReleaseManifest): string {
  return JSON.stringify([
    "TOONSTUDIO_WAVE7_MANIFEST_V1", manifest.projectId.normalize("NFC"),
    manifest.episodeNumber, manifest.manuscriptRevision, manifest.archiveSha256Hex.toLowerCase(),
    manifest.layerCount, manifest.canvasWidth, manifest.canvasHeight, manifest.createdAtIso,
  ]);
}

function buildBoundSigningBytes(
  manifestDigestHex: string, keyId: string, role: StudioCosignRole, signedAtIso: string,
): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(
    JSON.stringify(["TOONSTUDIO_WAVE7_COSIGN_BIND_V1", manifestDigestHex, keyId, role, signedAtIso]),
  );
  const copy = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  copy.set(encoded);
  return copy;
}

/** 정본 원고 출고 매니페스트의 결정론적 SHA-256 다이제스트(hex)를 계산한다. */
export async function computeCanonicalManifestSha256Hex(manifest: ManuscriptReleaseManifest): Promise<string> {
  const raw = new TextEncoder().encode(canonicalizeManifestString(manifest));
  const buf = new Uint8Array(new ArrayBuffer(raw.byteLength));
  buf.set(raw);
  return toHex(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", buf)));
}

/** 스튜디오 역할별 오프라인 공동 서명용 ECDSA `P-256` 키쌍을 생성한다. */
export async function generateStudioCosignerKeyPair(
  keyId: string, role: StudioCosignRole, displayNameKo: string,
): Promise<GeneratedStudioCosigner> {
  const pair = await globalThis.crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"],
  );
  return { keyId, role, displayNameKo, publicKey: pair.publicKey, privateKey: pair.privateKey };
}

/** 개인키로 원고 출고 매니페스트 다이제스트와 역할·키 식별자를 바인딩 서명한다. */
export async function signManuscriptReleaseManifest(
  manifest: ManuscriptReleaseManifest,
  signer: Pick<GeneratedStudioCosigner, "keyId" | "role" | "privateKey">,
  signedAtIso = "2026-11-26T00:00:00.000Z",
): Promise<CosignatureReceipt> {
  const manifestDigestHex = await computeCanonicalManifestSha256Hex(manifest);
  const message = buildBoundSigningBytes(manifestDigestHex, signer.keyId, signer.role, signedAtIso);
  const sigBuf = await globalThis.crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signer.privateKey, message);
  return { keyId: signer.keyId, role: signer.role, manifestDigestHex, signedAtIso, signatureBytes: new Uint8Array(sigBuf) };
}

/**
 * 등록된 `N`개 공개키 중 최소 `M`개의 서로 다른 승인 스튜디오 역할이 정본 매니페스트에 서명했는지 검증한다.
 */
export async function verifyThresholdManuscriptRelease(
  manifest: ManuscriptReleaseManifest,
  roster: readonly AuthorizedCosignerKey[],
  receipts: readonly CosignatureReceipt[],
  thresholdM: number,
): Promise<CosignReleaseGateReport> {
  if (!Number.isInteger(thresholdM) || thresholdM < 1 || thresholdM > roster.length) {
    throw new Error(`유효하지 않은 M-of-N 임계치 설정입니다 (M=${thresholdM}, N=${roster.length}).`);
  }

  const rosterById = new Map<string, AuthorizedCosignerKey>();
  for (const member of roster) {
    if (rosterById.has(member.keyId)) {
      throw new Error(`등록 공개키 목록에 중복된 keyId(${member.keyId})가 존재합니다.`);
    }
    rosterById.set(member.keyId, member);
  }

  const expectedDigestHex = await computeCanonicalManifestSha256Hex(manifest);
  const seenKeys = new Set<string>();
  const verifiedRoles = new Set<StudioCosignRole>();
  const verifiedKeyIds: string[] = [];
  const rejectedReceipts: RejectedCosignature[] = [];

  for (const receipt of receipts) {
    if (seenKeys.has(receipt.keyId)) {
      rejectedReceipts.push({ keyId: receipt.keyId, role: receipt.role, reason: "duplicate-key-replay" });
      continue;
    }
    seenKeys.add(receipt.keyId);

    const registered = rosterById.get(receipt.keyId);
    if (!registered) {
      rejectedReceipts.push({ keyId: receipt.keyId, role: receipt.role, reason: "unknown-key" });
      continue;
    }
    if (registered.role !== receipt.role) {
      rejectedReceipts.push({ keyId: receipt.keyId, role: receipt.role, reason: "role-mismatch" });
      continue;
    }
    if (receipt.manifestDigestHex !== expectedDigestHex) {
      rejectedReceipts.push({ keyId: receipt.keyId, role: receipt.role, reason: "digest-mismatch" });
      continue;
    }

    const sigCopy = new Uint8Array(new ArrayBuffer(receipt.signatureBytes.byteLength));
    sigCopy.set(receipt.signatureBytes);
    const message = buildBoundSigningBytes(expectedDigestHex, receipt.keyId, receipt.role, receipt.signedAtIso);
    const valid = await globalThis.crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      registered.publicKey,
      sigCopy,
      message,
    );
    if (!valid) {
      rejectedReceipts.push({ keyId: receipt.keyId, role: receipt.role, reason: "invalid-signature" });
      continue;
    }
    if (verifiedRoles.has(registered.role)) {
      rejectedReceipts.push({ keyId: receipt.keyId, role: receipt.role, reason: "duplicate-role-quorum" });
      continue;
    }

    verifiedRoles.add(registered.role);
    verifiedKeyIds.push(registered.keyId);
  }

  const distinctVerifiedRoles = [...verifiedRoles];
  return {
    approved: distinctVerifiedRoles.length >= thresholdM && verifiedKeyIds.length >= thresholdM,
    thresholdM,
    registeredKeyCountN: roster.length,
    manifestDigestHex: expectedDigestHex,
    verifiedKeyIds,
    distinctVerifiedRoles,
    rejectedReceipts,
    serverCostKrw: 0,
  };
}
