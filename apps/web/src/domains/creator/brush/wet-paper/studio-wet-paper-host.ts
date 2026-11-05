/**
 * 정착 호스트: 지연 runtime·결정적 캐시·8ms 시분할로 최종 물리와 합성을 실행한다.
 * create → advance(1)·N → finish 순서와 바이트는 동기 내보내기와 같다.
 * 결과는 dab 수치 서명으로, 래스터는 색으로 구분하고 항목·셀·픽셀 LRU 상한을 지킨다.
 * 최근 요청·합성 중 결과를 핀해 대칭 획의 재계산 루프를 막고, 하드 상한 거절은 잠시 기억한다.
 * 같은 요청자의 새 입력은 이전 작업에서 빠지고, 언마운트한 소유자는 완료를 다시 게시하지 않는다.
 * 갈필 침착 미리보기는 별도 lazy 캐시이며 최종 결과를 덮어쓰지 않는다.
 * waitForStudioWetPaperBakesIdle은 최종 준비 완료 경계다. 아직 준비되지 않으면 리졸버가 대체 표면을 고른다.
 */

import { normalizeStudioWetPaperBakeRequestKey } from "./studio-wet-paper-program-ids";

import type { StudioWetPaperRaster } from "./studio-wet-paper-composite";
import type { WetPaperInputDab } from "./studio-wet-paper-deposit";
import type {
  PendingCompositeJob, PendingSolveJob, PendingWaiters, RequesterState,
  StudioWetPaperBakeHostLimits, WetPaperBakeCacheEntry,
} from "./studio-wet-paper-host-types";
import type {
  StudioWetPaperBakeProgramId,
  StudioWetPaperBakeRequestKey,
} from "./studio-wet-paper-program-ids";
import type { StudioWetPaperBakeResult } from "./studio-wet-paper-solver";

export type { StudioWetPaperBakeHostLimits } from "./studio-wet-paper-host-types";

type WetPaperRuntime = typeof import("./studio-wet-paper-runtime");

/** 굽힌 래스터 하나(Canvas). 목적지 사각형은 획 요소의 로컬(문서) 좌표다. */
export interface StudioWetPaperCanvasBake {
  readonly image: CanvasImageSource;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioWetPaperBakeRequest {
  /** 획 고정 시드(`watercolorBrushSeedFromKey(element.id)`). */
  readonly seed: number;
  readonly programId: StudioWetPaperBakeProgramId;
}

/** `drawImage`와 `globalAlpha`만 쓰는 최소 컨텍스트(Konva.Context·CanvasRenderingContext2D 모두 만족). */
export interface StudioWetPaperDrawContext {
  globalAlpha: number;
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
}

/** 하드 상한은 소프트의 2배: 한 화면이 함께 쓰는(핀) 것 때문에 버릴 것이 없을 때 여기까지만 넘친다. */
const DEFAULT_LIMITS: StudioWetPaperBakeHostLimits = Object.freeze({
  entrySoftCount: 48,
  entryHardCount: 96,
  cellSoftCount: 4_000_000,
  cellHardCount: 8_000_000,
  rasterSoftPixels: 6_000_000,
  rasterHardPixels: 12_000_000,
});
const WET_PAPER_MAX_RASTERS_PER_ENTRY = 2;
/** 이 시간 안에 요청된 결과·래스터는 소프트 상한 때문에 버리지 않는다(한 화면이 함께 쓰는 것). */
const WET_PAPER_PIN_MS = 2_000;
/** 하드 상한 때문에 보관을 거절한 키는 이 시간 동안 다시 걸지 않는다(헛도는 작업 방지). */
const WET_PAPER_REFUSE_MS = 5_000;
/** 요청자 기록 상한(오래된 것부터 지운다 — 지워진 요청자는 다음 요청에서 새로 시작한다). */
const WET_PAPER_MAX_REQUESTERS = 2_048;
/** 조각 예산(ms). 솔버 한 스텝은 보통 1–10 ms라 조각은 예산 + 한 단위 안에서 끝난다. */
const WET_PAPER_SLICE_BUDGET_MS = 8;
/** 합성 한 단위의 픽셀 수(행 단위로 올림). 픽셀당 약 0.25 µs라 한 단위 ≈ 4 ms. */
const WET_PAPER_COMPOSITE_PIXELS_PER_UNIT = 16_384;
const SIGNATURE_FIELDS_PER_DAB = 5;

const bakeCache = new Map<string, WetPaperBakeCacheEntry>();
let bakeCacheCells = 0;
let rasterPixels = 0;
const solveJobs = new Map<string, PendingSolveJob>();
const compositeJobs = new Map<string, PendingCompositeJob>();
const requesterStates = new Map<string, RequesterState>();
/** 하드 상한으로 보관을 거절한 결과 키·`결과 키|색`과 그 시각. */
const refusedAt = new Map<string, number>();
const idleWaiters = new Set<() => void>();
let preferComposite = true;
let limits = DEFAULT_LIMITS;
let sliceScheduled = false;
let runtime: WetPaperRuntime | null = null;
let runtimeLoad: Promise<void> | null = null;
let runtimeFailed = false;

function nowMs(): number {
  return globalThis.performance?.now?.() ?? 0;
}

/** dab별 정확한 수치 스냅숏(해시 충돌은 이 배열 비교로 걸러진다). */
function computeSignature(dabs: readonly WetPaperInputDab[]): Float64Array {
  const signature = new Float64Array(dabs.length * SIGNATURE_FIELDS_PER_DAB);
  let cursor = 0;
  for (const dab of dabs) {
    signature[cursor] = dab.x;
    signature[cursor + 1] = dab.y;
    signature[cursor + 2] = dab.radius;
    signature[cursor + 3] = dab.opacity;
    signature[cursor + 4] = dab.role === "core" ? 1 : 0;
    cursor += SIGNATURE_FIELDS_PER_DAB;
  }
  return signature;
}

function signatureHash(signature: Float64Array): string {
  const bytes = new Uint8Array(signature.buffer, signature.byteOffset, signature.byteLength);
  let low = 0x811c_9dc5;
  let high = 0xcbf2_9ce4;
  for (let index = 0; index < bytes.length; index += 1) {
    low = Math.imul(low ^ (bytes[index] ?? 0), 0x0100_0193) >>> 0;
    high = Math.imul(high ^ (bytes[index] ?? 0), 0x0100_01a7) >>> 0;
  }
  return `${low.toString(36)}-${high.toString(36)}`;
}

function signaturesEqual(left: Float64Array, right: Float64Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] as number;
    const b = right[index] as number;
    if (a !== b && !(Number.isNaN(a) && Number.isNaN(b))) return false;
  }
  return true;
}

function cacheKey(request: StudioWetPaperBakeRequestKey, count: number, signature: Float64Array): string {
  return `${request.programId}|${request.seed}|${count}|${signatureHash(signature)}`;
}

function readEntry(key: string, signature: Float64Array): WetPaperBakeCacheEntry | null {
  const entry = bakeCache.get(key);
  if (!entry || !signaturesEqual(entry.signature, signature)) return null;
  bakeCache.delete(key);
  bakeCache.set(key, entry);
  return entry;
}

function rasterArea(bake: StudioWetPaperCanvasBake | null | undefined): number {
  const image = bake?.image as { width?: unknown; height?: unknown } | undefined;
  const width = typeof image?.width === "number" ? image.width : 0;
  const height = typeof image?.height === "number" ? image.height : 0;
  return width * height;
}

function dropRasters(entry: WetPaperBakeCacheEntry): void {
  for (const bake of entry.rasters.values()) rasterPixels -= rasterArea(bake);
  entry.rasters.clear();
  entry.rasterRequestedAt.clear();
}

function dropRaster(entry: WetPaperBakeCacheEntry, color: string): void {
  rasterPixels -= rasterArea(entry.rasters.get(color));
  entry.rasters.delete(color);
  entry.rasterRequestedAt.delete(color);
}

/** 핀이 아닌(최근 요청되지 않았고 합성 중이 아닌) 오래된 항목부터 소프트 상한 안으로 버린다. */
function evictEntries(now: number, incomingCells: number): void {
  const compositing = new Set<WetPaperBakeCacheEntry>();
  for (const job of compositeJobs.values()) compositing.add(job.entry);
  for (const [key, entry] of bakeCache) {
    if (bakeCache.size < limits.entrySoftCount && bakeCacheCells + incomingCells <= limits.cellSoftCount) break;
    if (now - entry.requestedAt < WET_PAPER_PIN_MS || compositing.has(entry)) continue;
    bakeCacheCells -= entry.cells;
    dropRasters(entry);
    bakeCache.delete(key);
  }
}

/** 결과를 보관한다. 핀 때문에 하드 상한을 넘겨야 하면 보관하지 않고 null(잠시 다시 걸지 않는다). */
function storeEntry(
  key: string,
  signature: Float64Array,
  result: StudioWetPaperBakeResult | null,
): WetPaperBakeCacheEntry | null {
  const now = nowMs();
  const existing = bakeCache.get(key);
  if (existing) {
    bakeCache.delete(key);
    bakeCacheCells -= existing.cells;
    dropRasters(existing);
  }
  const cells = result ? result.width * result.height : 0;
  evictEntries(now, cells);
  if (bakeCache.size >= limits.entryHardCount || bakeCacheCells + cells > limits.cellHardCount) {
    refusedAt.set(key, now);
    return null;
  }
  const entry: WetPaperBakeCacheEntry = {
    signature, result, cells, rasters: new Map(), requestedAt: now, rasterRequestedAt: new Map(),
  };
  bakeCache.set(key, entry);
  bakeCacheCells += cells;
  return entry;
}

/**
 * 래스터를 보관한다. 핀 때문에 하드 상한을 넘겨야 하면 보관하지 않고 false(잠시 다시 걸지 않는다).
 * 막 보관한 래스터는 핀이다(알림을 받은 요청자가 다시 렌더해 가져가기 전에 다른 래스터에 밀려나면, 대칭 획처럼
 * 한 화면이 여럿을 쓸 때 서로 밀어내며 합성을 끝없이 되풀이했다).
 */
function storeRaster(
  entryKey: string,
  entry: WetPaperBakeCacheEntry,
  color: string,
  bake: StudioWetPaperCanvasBake | null,
): boolean {
  const now = nowMs();
  const area = rasterArea(bake);
  if (entry.rasters.has(color)) dropRaster(entry, color);
  while (entry.rasters.size >= WET_PAPER_MAX_RASTERS_PER_ENTRY) {
    const oldestColor = entry.rasters.keys().next().value;
    if (oldestColor === undefined) break;
    dropRaster(entry, oldestColor);
  }
  // 총 픽셀 소프트 상한: 다른 항목의 핀이 아닌 래스터부터 오래된 순으로 버린다.
  for (const other of bakeCache.values()) {
    if (rasterPixels + area <= limits.rasterSoftPixels) break;
    if (other === entry) continue;
    for (const otherColor of other.rasters.keys()) {
      if (rasterPixels + area <= limits.rasterSoftPixels) break;
      if (now - (other.rasterRequestedAt.get(otherColor) ?? 0) < WET_PAPER_PIN_MS) continue;
      dropRaster(other, otherColor);
    }
  }
  if (rasterPixels + area > limits.rasterHardPixels) {
    refusedAt.set(`${entryKey}|${color}`, now);
    return false;
  }
  entry.rasters.set(color, bake);
  entry.rasterRequestedAt.set(color, now);
  rasterPixels += area;
  return true;
}

/** 합성 래스터 → 캔버스. 문서가 없거나(워커·테스트) 2D 컨텍스트가 없으면 null. */
function createRasterCanvas(raster: StudioWetPaperRaster): CanvasImageSource | null {
  const doc = (globalThis as { document?: Document }).document;
  if (!doc || typeof doc.createElement !== "function") return null;
  const canvas = doc.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  const context = canvas.getContext("2d");
  if (!context || typeof context.createImageData !== "function") return null;
  const image = context.createImageData(raster.width, raster.height);
  image.data.set(raster.rgba);
  context.putImageData(image, 0, 0);
  return canvas;
}

export function createStudioWetPaperCanvasBake(raster: StudioWetPaperRaster): StudioWetPaperCanvasBake | null {
  const image = createRasterCanvas(raster);
  return image
    ? Object.freeze({
        image,
        x: raster.originXPx,
        y: raster.originYPx,
        width: raster.width * raster.pixelPx,
        height: raster.height * raster.pixelPx,
      })
    : null;
}

function attachWaiter(waiters: PendingWaiters, listeners: Iterable<() => void>, requesters: Iterable<string>, anonymous: boolean): void {
  for (const listener of listeners) waiters.listeners.add(listener);
  for (const requester of requesters) waiters.requesters.add(requester);
  if (anonymous) waiters.anonymous = true;
}

function enqueueComposite(
  key: string,
  entry: WetPaperBakeCacheEntry,
  color: string,
  listeners: Iterable<() => void>,
  requesters: Iterable<string>,
  anonymous: boolean,
): void {
  const compositeKey = `${key}|${color}`;
  const pending = compositeJobs.get(compositeKey);
  if (pending) {
    attachWaiter(pending, listeners, requesters, anonymous);
    return;
  }
  compositeJobs.set(compositeKey, {
    key: compositeKey,
    entryKey: key,
    color,
    entry,
    listeners: new Set(listeners),
    requesters: new Set(requesters),
    anonymous,
    raster: null,
    started: false,
  });
}

/** 요청자가 떠난 작업: 아무도(익명 포함) 기다리지 않으면 버린다. */
function detachRequester<T extends PendingWaiters>(jobs: Map<string, T>, key: string, requester: string): void {
  const job = jobs.get(key);
  if (!job || !job.requesters.delete(requester)) return;
  if (job.requesters.size === 0 && !job.anonymous) jobs.delete(key);
}

/** 같은 요청자가 다른 결과·색을 요청하면 이전 대기 작업에서 떼어 낸다(아무도 안 기다리면 버린다). */
function supersede(requester: string, key: string, color: string): void {
  const previous = requesterStates.get(requester);
  if (previous?.key === key && previous.color === color) {
    requesterStates.delete(requester); requesterStates.set(requester, previous); return;
  }
  if (previous) previous.ready = undefined;
  requesterStates.delete(requester);
  requesterStates.set(requester, { key, color });
  while (requesterStates.size > WET_PAPER_MAX_REQUESTERS) {
    const oldest = requesterStates.keys().next().value;
    if (oldest === undefined) break;
    requesterStates.delete(oldest);
  }
  if (!previous) return;
  if (previous.key !== key) detachRequester(solveJobs, previous.key, requester);
  if (previous.key !== key || previous.color !== color) {
    detachRequester(compositeJobs, `${previous.key}|${previous.color}`, requester);
  }
}

function recentlyRefused(key: string, now: number): boolean {
  const at = refusedAt.get(key);
  if (at === undefined) return false;
  if (now - at < WET_PAPER_REFUSE_MS) return true;
  refusedAt.delete(key);
  return false;
}

function resolveIdleWaiters(): void {
  if (solveJobs.size > 0 || compositeJobs.size > 0) return;
  const waiters = [...idleWaiters];
  idleWaiters.clear();
  for (const resolve of waiters) resolve();
}

function ensureRuntime(): void {
  if (runtime || runtimeLoad || runtimeFailed) return;
  runtimeLoad = import("./studio-wet-paper-runtime").then(
    (module) => {
      runtime = module;
      runtimeLoad = null;
      scheduleSlice();
    },
    () => {
      // 청크를 못 받으면 베이스 워시를 계속 그린다(fail-closed). 대기 중인 리스너는 깨우지 않는다.
      runtimeFailed = true;
      runtimeLoad = null;
      solveJobs.clear();
      compositeJobs.clear();
      resolveIdleWaiters();
    },
  );
}

function scheduleSlice(): void {
  if (sliceScheduled || !runtime || (solveJobs.size === 0 && compositeJobs.size === 0)) return;
  sliceScheduled = true;
  globalThis.setTimeout(runSlice, 0);
}

/** 솔버 작업 한 단위(시드 또는 한 스텝 또는 마감). 이 작업이 끝났으면 true. */
function advanceSolveJob(loaded: WetPaperRuntime, job: PendingSolveJob, ready: Set<() => void>): boolean {
  if (!job.seeded) {
    const settings = loaded.normalizeStudioWetPaperBakeSettings(job.request);
    // 갈필 강모 지도는 처음 만들 때 수십 ms 가 걸려 한 단위씩 나눠 만든다(결과 바이트는 같다).
    if (settings && settings.program.dryBrush > 0 && !loaded.advanceWetPaperBristleFieldBuild()) return false;
    job.solve = settings ? loaded.createWetPaperSolve(job.dabs, settings) : null;
    job.seeded = true;
    if (job.solve) return false;
  }
  if (job.solve && job.solve.state.stepIndex < job.solve.steps) {
    loaded.advanceWetPaperSolve(job.solve, 1);
    return false;
  }
  solveJobs.delete(job.key);
  const entry = storeEntry(job.key, job.signature, job.solve ? loaded.finishWetPaperSolve(job.solve) : null);
  // 하드 상한으로 보관하지 못했으면 알리지 않는다(다시 그려도 같은 거절이라 헛돈다 — 베이스 워시 유지).
  if (!entry) return true;
  if (entry.result) {
    enqueueSolvedComposites(job, entry);
  } else {
    for (const listener of job.listeners) ready.add(listener);
  }
  return true;
}

/** 풀이가 끝난 결과를 기다리는 요청자마다 지금 요청한 색으로 곧바로 합성한다(다시 렌더되기 전에 래스터까지). */
function enqueueSolvedComposites(job: PendingSolveJob, entry: WetPaperBakeCacheEntry): void {
  const byColor = new Map<string, string[]>();
  for (const requester of job.requesters) {
    const state = requesterStates.get(requester);
    if (state?.key !== job.key) continue;
    byColor.set(state.color, [...(byColor.get(state.color) ?? []), requester]);
  }
  if (job.anonymous || byColor.size === 0) {
    enqueueComposite(job.key, entry, job.color, job.listeners, byColor.get(job.color) ?? [], true);
    byColor.delete(job.color);
  }
  for (const [color, requesters] of byColor) enqueueComposite(job.key, entry, color, job.listeners, requesters, false);
}

/** 합성 작업 한 단위(시작 또는 몇 행 또는 캔버스 마감). 이 작업이 끝났으면 true. */
function advanceCompositeJob(loaded: WetPaperRuntime, job: PendingCompositeJob, ready: Set<() => void>): boolean {
  if (!job.started) {
    job.started = true;
    job.raster = job.entry.result ? loaded.createStudioWetPaperRasterJob(job.entry.result, job.color) : null;
    if (job.raster) return false;
  } else if (job.raster && job.raster.nextRow < job.raster.raster.height) {
    const rows = Math.max(1, Math.floor(WET_PAPER_COMPOSITE_PIXELS_PER_UNIT / Math.max(1, job.raster.raster.width)));
    loaded.advanceStudioWetPaperRasterJob(job.raster, rows);
    return false;
  }
  compositeJobs.delete(job.key);
  // 합성하는 사이 결과가 LRU에서 밀려났으면 래스터를 보관하지 않는다(다시 요청하면 처음부터 다시 굽는다).
  // 하드 상한으로 보관하지 못했으면 알리지 않는다(다시 그려도 같은 거절이라 헛돈다).
  if (bakeCache.get(job.entryKey) === job.entry
    && !storeRaster(job.entryKey, job.entry, job.color, job.raster ? createStudioWetPaperCanvasBake(job.raster.raster) : null)) {
    return true;
  }
  for (const listener of job.listeners) ready.add(listener);
  return true;
}

function runSlice(): void {
  sliceScheduled = false;
  const loaded = runtime;
  if (!loaded) return;
  const startedAt = nowMs();
  const ready = new Set<() => void>();
  // 진행 보장: 조각은 예산을 단위마다 먼저 확인하되, 시작한 조각은 최소 한 단위를 실행한다. 합성과 풀이는
  // 단위마다 번갈아 진행해 어느 쪽도 다른 쪽을 굶기지 않는다.
  let first = true;
  while (first || nowMs() - startedAt < WET_PAPER_SLICE_BUDGET_MS) {
    first = false;
    const composite = compositeJobs.values().next().value;
    const solve = solveJobs.values().next().value;
    if (!composite && !solve) break;
    const runComposite = composite !== undefined && (solve === undefined || preferComposite);
    preferComposite = !preferComposite;
    if (runComposite) advanceCompositeJob(loaded, composite, ready);
    else if (solve) advanceSolveJob(loaded, solve, ready);
  }
  // 알림은 예산 밖에서 한다(렌더 예약만 한다).
  for (const listener of ready) listener();
  resolveIdleWaiters();
  scheduleSlice();
}

/**
 * 렌더 안전 진입점(StudioDrawNode 수채 커밋 경로). 굽힌 래스터가 이미 있으면 돌려주고, 없으면 시분할 작업을
 * 걸고 null을 돌려준다(호출자는 이번 프레임에 베이스 워시를 그린다). 알 수 없는 프로그램·빈 dab은 null이다.
 * `requester`(요소 id·변형 번호)를 주면 같은 요청자의 이전 요청 중 아무도 기다리지 않게 된 작업을 버린다.
 */
export function requestStudioWetPaperBake(
  dabs: readonly WetPaperInputDab[],
  request: StudioWetPaperBakeRequest,
  color: string,
  onReady: () => void,
  renderGeneration = 0,
  requester?: string,
): StudioWetPaperCanvasBake | null {
  void renderGeneration;
  const bake = requestBake(dabs, request, color, onReady, requester);
  // 대체로 이전 작업이 빠져 대기 작업이 하나도 남지 않았으면 기다리는 쪽(캡처 준비)을 깨운다.
  resolveIdleWaiters();
  return bake;
}

function requestBake(
  dabs: readonly WetPaperInputDab[],
  request: StudioWetPaperBakeRequest,
  color: string,
  onReady: () => void,
  requester: string | undefined,
): StudioWetPaperCanvasBake | null {
  const bakeKey = normalizeStudioWetPaperBakeRequestKey({
    seed: request.seed,
    phase: "settled",
    programId: request.programId,
  });
  if (!bakeKey || dabs.length === 0 || runtimeFailed) return null;
  if (typeof globalThis.setTimeout !== "function") return null;
  const signature = computeSignature(dabs);
  const key = cacheKey(bakeKey, dabs.length, signature);
  const now = nowMs();
  if (requester) supersede(requester, key, color);
  const owner = requester ? requesterStates.get(requester) : undefined;
  if (owner && requester) {
    owner.ready = onReady;
    owner.notify ??= () => { if (requesterStates.get(requester) === owner) owner.ready?.(); };
    onReady = owner.notify;
  }
  const requesters = requester ? [requester] : [];
  const entry = readEntry(key, signature);
  if (entry) {
    entry.requestedAt = now;
    if (!entry.result) return null;
    const cached = entry.rasters.get(color);
    if (cached !== undefined) {
      entry.rasters.delete(color);
      entry.rasters.set(color, cached);
      entry.rasterRequestedAt.set(color, now);
      return cached;
    }
    if (recentlyRefused(`${key}|${color}`, now)) return null;
    enqueueComposite(key, entry, color, [onReady], requesters, !requester);
  } else {
    if (recentlyRefused(key, now)) return null;
    const pending = solveJobs.get(key);
    if (pending) {
      attachWaiter(pending, [onReady], requesters, !requester);
      return null;
    }
    solveJobs.set(key, {
      key,
      dabs,
      signature,
      request: bakeKey,
      color,
      listeners: new Set([onReady]),
      requesters: new Set(requesters),
      anonymous: !requester,
      solve: null,
      seeded: false,
    });
  }
  ensureRuntime();
  scheduleSlice();
  return null;
}

/**
 * 대기 중인 굽기·합성이 모두 끝나면(또는 런타임을 불러오지 못하면) 풀리는 약속. 캡처 준비가 커밋 획이 굽힌
 * 래스터로 그려질 때까지 기다리는 데 쓴다. signal 이 중단되면 거부한다.
 */
export function waitForStudioWetPaperBakesIdle(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  if (!studioWetPaperBakesPending()) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      idleWaiters.delete(done);
      reject(signal?.reason);
    };
    const done = (): void => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    idleWaiters.add(done);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** 대기 중인 굽기·합성이 있는지(런타임을 불러오지 못했으면 굽지 않으므로 false). */
export function studioWetPaperBakesPending(): boolean {
  return !runtimeFailed && (solveJobs.size > 0 || compositeJobs.size > 0);
}

/** 굽힌 래스터를 요소 로컬 좌표에 그린다(획 불투명도는 globalAlpha로 한 번 곱한다). */
export function drawStudioWetPaperBake(
  context: StudioWetPaperDrawContext,
  bake: StudioWetPaperCanvasBake,
  opacity: number,
): void {
  const previousAlpha = context.globalAlpha;
  context.globalAlpha = Math.min(1, Math.max(0, opacity));
  context.drawImage(bake.image, bake.x, bake.y, bake.width, bake.height);
  context.globalAlpha = previousAlpha;
}

/**
 * 동기 경로(SVG 내보내기)의 캐시 읽기: Canvas가 이미 구운 같은 입력의 결과가 있으면 다시 풀지 않는다.
 * `undefined` = 캐시에 없음, `null` = 구웠지만 유한 dab이 없어 결과가 없음.
 */
export function peekStudioWetPaperBakeResult(
  dabs: readonly WetPaperInputDab[],
  request: StudioWetPaperBakeRequestKey,
): StudioWetPaperBakeResult | null | undefined {
  const signature = computeSignature(dabs);
  const entry = readEntry(cacheKey(request, dabs.length, signature), signature);
  return entry ? entry.result : undefined;
}

/** 동기 경로가 구운 결과를 같은 캐시에 넣는다(다음 Canvas 정착은 다시 풀지 않는다). */
export function rememberStudioWetPaperBakeResult(
  dabs: readonly WetPaperInputDab[],
  request: StudioWetPaperBakeRequestKey,
  result: StudioWetPaperBakeResult | null,
): void {
  const signature = computeSignature(dabs);
  const key = cacheKey(request, dabs.length, signature);
  const pending = solveJobs.get(key);
  const entry = storeEntry(key, signature, result);
  if (!pending) return;
  // 같은 키의 대기 작업은 동기 결과로 대체한다. 합성이 남았으면 넘기고, 아니면 새 태스크에서 깨운다.
  solveJobs.delete(key);
  if (entry?.result && runtime) {
    enqueueSolvedComposites(pending, entry);
    scheduleSlice();
    return;
  }
  const listeners = [...pending.listeners];
  globalThis.setTimeout(() => {
    for (const listener of listeners) listener();
    resolveIdleWaiters();
  }, 0);
}

/** 테스트 격리: 캐시·대기 작업을 비운다(로드된 런타임은 유지). */
export function resetStudioWetPaperBakeHostForTests(): void {
  dryEpoch += 1; dryModule?.resetStudioDryBrushLiveHostForTests();
  dryModule = null; dryLoad = null; dryFailed = false; dryWaiting.clear(); dryNotifying = false;
  bakeCache.clear();
  bakeCacheCells = 0;
  rasterPixels = 0;
  solveJobs.clear();
  compositeJobs.clear();
  requesterStates.clear();
  refusedAt.clear();
  preferComposite = true;
  runtimeFailed = false;
  resolveIdleWaiters();
}

/** 테스트 격리: 캐시 상한을 바꾼다(null = 기본값). 바뀐 상한은 다음 보관부터 적용된다. */
export function setStudioWetPaperBakeHostLimitsForTests(next: Partial<StudioWetPaperBakeHostLimits> | null): void {
  limits = next ? Object.freeze({ ...DEFAULT_LIMITS, ...next }) : DEFAULT_LIMITS;
}

/** 테스트 진단: 캐시 항목·셀·래스터 픽셀과 대기 작업 수. */
export function studioWetPaperBakeHostStatsForTests(): {
  entries: number;
  cells: number;
  rasterPixels: number;
  pendingSolves: number;
  pendingComposites: number;
} {
  return {
    entries: bakeCache.size,
    cells: bakeCacheCells,
    rasterPixels,
    pendingSolves: solveJobs.size,
    pendingComposites: compositeJobs.size,
  };
}

type DryModule = typeof import("./studio-dry-brush-live-host");
let dryModule: DryModule | null = null;
let dryLoad: Promise<DryModule | null> | null = null;
let dryFailed = false;
let dryEpoch = 0;
let dryNotifying = false;
const dryWaiting = new Map<string | (() => void), () => void>();

/** 선택 의도가 있을 때만 공용 강모와 지연 모듈을 준비한다. 준비 실패는 기존 워시로 복귀한다. */
export async function prewarmStudioDryBrushLiveBake(): Promise<boolean> {
  if (dryFailed) return false;
  const epoch = dryEpoch;
  dryLoad ??= import("./studio-dry-brush-live-host").then((module) => {
    if (epoch !== dryEpoch) return null;
    dryModule = module; return module;
  }, () => { if (epoch === dryEpoch) dryFailed = true; return null; });
  const module = await dryLoad;
  if (!module || epoch !== dryEpoch) return false;
  await module.prewarmStudioDryBrushLiveHost();
  return epoch === dryEpoch;
}

export function requestStudioDryBrushLiveBake(
  dabs: readonly WetPaperInputDab[], request: StudioWetPaperBakeRequest, color: string,
  onReady: () => void, requester?: string, allowCreate = true,
): StudioWetPaperCanvasBake | null {
  if (dryModule) return dryModule.requestStudioDryBrushLiveHost(dabs, request, color, onReady, requester, allowCreate);
  if (request.programId !== "chu-tai-dry-brush" || dabs.length === 0 || !Number.isFinite(request.seed) || dryFailed) {
    dryWaiting.delete(requester ?? onReady); return null;
  }
  if (!allowCreate) { dryWaiting.delete(requester ?? onReady); return null; }
  dryWaiting.set(requester ?? onReady, onReady);
  while (dryWaiting.size > 128) { const oldest = dryWaiting.keys().next().value; if (oldest !== undefined) dryWaiting.delete(oldest); }
  if (!dryNotifying) {
    dryNotifying = true;
    const epoch = dryEpoch;
    void prewarmStudioDryBrushLiveBake().then((ready) => {
      if (epoch !== dryEpoch) return;
      dryNotifying = false;
      const waiting = [...dryWaiting.values()]; dryWaiting.clear();
      if (ready) for (const notify of waiting) notify();
    });
  }
  return null;
}

/** 언마운트·취소한 렌더 소유자는 다른 소유자의 같은 키 완료에도 다시 게시하지 않는다. */
export function releaseStudioWetPaperBakeRequesters(prefix: string): void {
  const matches = (key: string) => key === prefix || key.startsWith(`${prefix}#`);
  for (const [key, state] of requesterStates) if (matches(key)) {
    state.ready = undefined;
    detachRequester(solveJobs, state.key, key);
    detachRequester(compositeJobs, `${state.key}|${state.color}`, key);
    requesterStates.delete(key);
  }
  for (const key of dryWaiting.keys()) if (typeof key === "string" && matches(key)) dryWaiting.delete(key);
  dryModule?.releaseStudioDryBrushLiveHost(prefix);
  resolveIdleWaiters();
}

export function releaseStudioDryBrushLiveBakeRequester(requester?: string): void {
  if (requester) { dryWaiting.delete(requester); dryModule?.releaseStudioDryBrushLiveHost(requester); }
}
