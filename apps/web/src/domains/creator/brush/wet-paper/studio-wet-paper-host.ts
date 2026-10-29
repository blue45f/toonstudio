/**
 * 젖은 종이 정착 베이크 호스트(Canvas 경로): 결정적 캐시 + 시분할 작업 + 솔버 지연 로드 + 래스터 그리기.
 *
 * `studio-living-ink-settled-bake-v1.ts`의 요청 계약을 그대로 따른다.
 * - 렌더 본문은 `requestStudioWetPaperBake`를 부르고, 결과가 아직 없으면 null을 받아 이번 프레임은 베이스 워시
 *   (같은 레인의 라이브 dab)를 그린다. 작업이 끝나면 `onReady`가 한 번 불리고, 같은 입력으로 다시 부르면 굽힌
 *   래스터가 돌아온다. `renderGeneration`은 React Compiler가 메모한 호출 지점을 다시 실행시키는 용도다(값은 읽지
 *   않는다).
 * - 작업은 매크로태스크(setTimeout 0) 조각으로 나뉜다. 조각마다 예산(8 ms)을 확인하며 솔버 고정 스텝을 하나씩,
 *   합성은 몇 행씩 전진한다. 동기 베이크(`solveStudioWetPaperBakeUncached`·`compositeStudioWetPaperRaster`,
 *   SVG 내보내기)와 같은 create → advance(1)·N → finish 순서라 조각 나누기는 스케줄만 바꾸고 바이트는 바꾸지
 *   않는다.
 * - 솔버·합성 코드와 프로그램 표는 `studio-wet-paper-runtime.ts` 동적 import 뒤에 있어 Studio 진입 청크에 실리지
 *   않는다. 호스트는 요청 키(프로그램 id·시드·정착 게이트)만 정규화하고, 표는 런타임이 붙인다.
 * - 캐시: 베이크 결과(색과 무관한 광학 밀도)를 dab 서명으로, 합성 래스터(캔버스)를 색으로 나눠 보관한다.
 *   결과는 항목 수·총 셀 수, 래스터는 총 픽셀 수 상한이 있는 LRU다. 색만 바뀐 획은 다시 풀지 않고 합성만 한다.
 */

import { normalizeStudioWetPaperBakeRequestKey } from "./studio-wet-paper-program-ids";

import type { StudioWetPaperRaster, StudioWetPaperRasterJob } from "./studio-wet-paper-composite";
import type { WetPaperInputDab } from "./studio-wet-paper-deposit";
import type {
  StudioWetPaperBakeProgramId,
  StudioWetPaperBakeRequestKey,
} from "./studio-wet-paper-program-ids";
import type { StudioWetPaperBakeResult, WetPaperSolve } from "./studio-wet-paper-solver";

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

interface WetPaperBakeCacheEntry {
  readonly signature: Float64Array;
  readonly result: StudioWetPaperBakeResult | null;
  readonly cells: number;
  /** 색 → 합성 캔버스(null = 해석할 수 없는 색이거나 캔버스를 만들 수 없음). */
  readonly rasters: Map<string, StudioWetPaperCanvasBake | null>;
}

interface PendingSolveJob {
  readonly key: string;
  readonly dabs: readonly WetPaperInputDab[];
  readonly signature: Float64Array;
  readonly request: StudioWetPaperBakeRequestKey;
  /** 처음 요청한 획 색(풀이가 끝나면 이 색으로 곧바로 합성한다). */
  readonly color: string;
  readonly listeners: Set<() => void>;
  solve: WetPaperSolve | null;
  seeded: boolean;
}

interface PendingCompositeJob {
  readonly key: string;
  /** 결과 캐시 키(합성 도중 결과가 LRU에서 밀려났는지 확인한다). */
  readonly entryKey: string;
  readonly color: string;
  readonly entry: WetPaperBakeCacheEntry;
  readonly listeners: Set<() => void>;
  raster: StudioWetPaperRasterJob | null;
  started: boolean;
}

/** 결과 LRU 상한: 항목 수와 보관 셀 수(셀당 Float32 밀도 + Uint8 덮임 ≈ 5 B → 약 20 MiB). */
const WET_PAPER_CACHE_MAX_ENTRIES = 48;
const WET_PAPER_CACHE_MAX_CELLS = 4_000_000;
/** 래스터(캔버스) 총 픽셀 상한(RGBA8 → 약 24 MiB). 넘으면 가장 오래된 항목의 래스터부터 버린다(다시 합성 가능). */
const WET_PAPER_RASTER_MAX_PIXELS = 6_000_000;
const WET_PAPER_MAX_RASTERS_PER_ENTRY = 2;
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
}

function storeEntry(
  key: string,
  signature: Float64Array,
  result: StudioWetPaperBakeResult | null,
): WetPaperBakeCacheEntry {
  const existing = bakeCache.get(key);
  if (existing) {
    bakeCache.delete(key);
    bakeCacheCells -= existing.cells;
    dropRasters(existing);
  }
  const cells = result ? result.width * result.height : 0;
  const entry: WetPaperBakeCacheEntry = { signature, result, cells, rasters: new Map() };
  bakeCache.set(key, entry);
  bakeCacheCells += cells;
  while (bakeCache.size > WET_PAPER_CACHE_MAX_ENTRIES || bakeCacheCells > WET_PAPER_CACHE_MAX_CELLS) {
    const oldestKey = bakeCache.keys().next().value;
    if (oldestKey === undefined || oldestKey === key) break;
    const oldest = bakeCache.get(oldestKey);
    if (oldest) {
      bakeCacheCells -= oldest.cells;
      dropRasters(oldest);
    }
    bakeCache.delete(oldestKey);
  }
  return entry;
}

function storeRaster(entry: WetPaperBakeCacheEntry, color: string, bake: StudioWetPaperCanvasBake | null): void {
  const previous = entry.rasters.get(color);
  if (previous !== undefined) rasterPixels -= rasterArea(previous);
  entry.rasters.delete(color);
  entry.rasters.set(color, bake);
  rasterPixels += rasterArea(bake);
  while (entry.rasters.size > WET_PAPER_MAX_RASTERS_PER_ENTRY) {
    const oldestColor = entry.rasters.keys().next().value;
    if (oldestColor === undefined) break;
    rasterPixels -= rasterArea(entry.rasters.get(oldestColor));
    entry.rasters.delete(oldestColor);
  }
  // 총 픽셀 상한: 가장 오래 안 쓴 항목의 래스터부터 버린다(지금 넣은 항목은 남긴다).
  for (const other of bakeCache.values()) {
    if (rasterPixels <= WET_PAPER_RASTER_MAX_PIXELS) break;
    if (other !== entry) dropRasters(other);
  }
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

function finishRaster(raster: StudioWetPaperRaster): StudioWetPaperCanvasBake | null {
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

function enqueueComposite(
  key: string,
  entry: WetPaperBakeCacheEntry,
  color: string,
  listeners: Iterable<() => void>,
): void {
  const compositeKey = `${key}|${color}`;
  const pending = compositeJobs.get(compositeKey);
  if (pending) {
    for (const listener of listeners) pending.listeners.add(listener);
    return;
  }
  compositeJobs.set(compositeKey, {
    key: compositeKey,
    entryKey: key,
    color,
    entry,
    listeners: new Set(listeners),
    raster: null,
    started: false,
  });
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
  if (entry.result) {
    // 같은 조각 흐름에서 곧바로 이 색을 합성한다(다시 렌더되기 전에 래스터까지 준비).
    enqueueComposite(job.key, entry, job.color, job.listeners);
  } else {
    for (const listener of job.listeners) ready.add(listener);
  }
  return true;
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
  if (bakeCache.get(job.entryKey) === job.entry) {
    storeRaster(job.entry, job.color, job.raster ? finishRaster(job.raster.raster) : null);
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
  // 진행 보장: 조각은 예산을 단위마다 먼저 확인하되, 시작한 조각은 최소 한 단위를 실행한다.
  let first = true;
  while (first || nowMs() - startedAt < WET_PAPER_SLICE_BUDGET_MS) {
    first = false;
    const composite = compositeJobs.values().next().value;
    if (composite) {
      advanceCompositeJob(loaded, composite, ready);
      continue;
    }
    const solve = solveJobs.values().next().value;
    if (!solve) break;
    advanceSolveJob(loaded, solve, ready);
  }
  // 알림은 예산 밖에서 한다(렌더 예약만 한다).
  for (const listener of ready) listener();
  scheduleSlice();
}

/**
 * 렌더 안전 진입점(StudioDrawNode 수채 커밋 경로). 굽힌 래스터가 이미 있으면 돌려주고, 없으면 시분할 작업을
 * 걸고 null을 돌려준다(호출자는 이번 프레임에 베이스 워시를 그린다). 알 수 없는 프로그램·빈 dab은 null이다.
 */
export function requestStudioWetPaperBake(
  dabs: readonly WetPaperInputDab[],
  request: StudioWetPaperBakeRequest,
  color: string,
  onReady: () => void,
  renderGeneration = 0,
): StudioWetPaperCanvasBake | null {
  void renderGeneration;
  const bakeKey = normalizeStudioWetPaperBakeRequestKey({
    seed: request.seed,
    phase: "settled",
    programId: request.programId,
  });
  if (!bakeKey || dabs.length === 0 || runtimeFailed) return null;
  if (typeof globalThis.setTimeout !== "function") return null;
  const signature = computeSignature(dabs);
  const key = cacheKey(bakeKey, dabs.length, signature);
  const entry = readEntry(key, signature);
  if (entry) {
    if (!entry.result) return null;
    const cached = entry.rasters.get(color);
    if (cached !== undefined) {
      entry.rasters.delete(color);
      entry.rasters.set(color, cached);
      return cached;
    }
    enqueueComposite(key, entry, color, [onReady]);
  } else {
    const pending = solveJobs.get(key);
    if (pending) {
      pending.listeners.add(onReady);
      return null;
    }
    solveJobs.set(key, {
      key,
      dabs,
      signature,
      request: bakeKey,
      color,
      listeners: new Set([onReady]),
      solve: null,
      seeded: false,
    });
  }
  ensureRuntime();
  scheduleSlice();
  return null;
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
  if (entry.result && runtime) {
    enqueueComposite(key, entry, pending.color, pending.listeners);
    scheduleSlice();
    return;
  }
  const listeners = [...pending.listeners];
  globalThis.setTimeout(() => {
    for (const listener of listeners) listener();
  }, 0);
}

/** 테스트 격리: 캐시·대기 작업을 비운다(로드된 런타임은 유지). */
export function resetStudioWetPaperBakeHostForTests(): void {
  bakeCache.clear();
  bakeCacheCells = 0;
  rasterPixels = 0;
  solveJobs.clear();
  compositeJobs.clear();
  runtimeFailed = false;
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
