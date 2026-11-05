/** 갈필 초안 전용 침착 표면. 최종 40스텝 결과·캐시에는 쓰지 않는 지연 로드 모듈이다. */
import { createStudioWetPaperCanvasBake } from "./studio-wet-paper-host";
import * as runtime from "./studio-wet-paper-runtime";

import type { WetPaperInputDab } from "./studio-wet-paper-deposit";
import type { StudioWetPaperCanvasBake, StudioWetPaperBakeRequest } from "./studio-wet-paper-host";
import type { WetPaperSolve } from "./studio-wet-paper-solver";
import type { StudioWetPaperRasterJob } from "./studio-wet-paper-composite";

interface Entry {
  id: number;
  signature: Float64Array;
  seed: number;
  color: string;
  bake: StudioWetPaperCanvasBake | null;
  pixels: number;
}
interface Job {
  entry: Entry;
  dabs: readonly WetPaperInputDab[];
  phase: "create" | "deposit" | "finish" | "raster";
  solve: WetPaperSolve | null;
  cursor: number;
  raster: StudioWetPaperRasterJob | null;
}
interface Owner { entryId: number; ready: () => void }
const entries = new Map<number, Entry>();
const jobs = new Map<number, Job>();
const owners = new Map<string | (() => void), Owner>();
let preparation: Promise<void> | null = null;
let preparedReady: (() => void) | undefined;
const MAX_ENTRIES = 32;
const MAX_OWNERS = 128;
const MAX_PIXELS = 12_000_000;
let nextId = 0;
let pixels = 0;
let prepared = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const now = () => globalThis.performance?.now() ?? 0;

function signatureOf(dabs: readonly WetPaperInputDab[]): Float64Array | null {
  if (dabs.length === 0 || dabs.length > 16_384) return null;
  const values = new Float64Array(dabs.length * 5);
  for (const [index, dab] of dabs.entries()) {
    if (![dab.x, dab.y, dab.radius, dab.opacity].every(Number.isFinite)) return null;
    values.set([dab.x, dab.y, dab.radius, dab.opacity, dab.role === "core" ? 1 : 0], index * 5);
  }
  return values;
}
function same(a: Float64Array, b: Float64Array): boolean {
  return a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
}
function drop(entry: Entry): void {
  entries.delete(entry.id);
  jobs.delete(entry.id);
  pixels -= entry.pixels;
  // 이미 Shape closure가 받은 canvas는 비우거나 닫지 않는다. 마지막 소비자가 놓으면 GC된다.
}
function detach(key: string | (() => void)): void {
  const owner = owners.get(key);
  owners.delete(key);
  if (!owner || [...owners.values()].some((other) => other.entryId === owner.entryId)) return;
  const entry = entries.get(owner.entryId);
  if (entry && jobs.has(entry.id)) drop(entry);
}
function schedule(): void {
  if (timer !== null || (prepared && jobs.size === 0)) return;
  timer = setTimeout(run, 0);
}
function complete(job: Job): void {
  jobs.delete(job.entry.id);
  if (entries.get(job.entry.id) !== job.entry) return;
  const raster = job.raster?.raster;
  const size = raster ? raster.width * raster.height : 0;
  if (size > MAX_PIXELS) { drop(job.entry); return; }
  while (pixels + size > MAX_PIXELS) {
    const oldest = [...entries.values()].find((entry) => entry !== job.entry && entry.pixels > 0);
    if (!oldest) { drop(job.entry); return; }
    drop(oldest);
  }
  job.entry.bake = raster ? createStudioWetPaperCanvasBake(raster) : null;
  job.entry.pixels = job.entry.bake ? size : 0;
  pixels += job.entry.pixels;
  for (const [key, owner] of [...owners]) {
    if (owner.entryId === job.entry.id && owners.get(key) === owner) owner.ready();
  }
}
function advance(job: Job): void {
  if (job.phase === "create") {
    const settings = runtime.normalizeStudioWetPaperBakeSettings({
      seed: job.entry.seed, phase: "settled", programId: "chu-tai-dry-brush",
    });
    job.solve = settings ? runtime.createWetPaperSolve(job.dabs, settings) : null;
    job.phase = "deposit";
    if (!job.solve) complete(job);
  } else if (job.phase === "deposit" && job.solve) {
    const solve = job.solve;
    if (job.cursor < solve.events.count) {
      runtime.applyWetPaperDepositEvent(solve.state, solve.events, job.cursor++, solve.program, solve.fillPaper, solve.bristleScratch);
    } else job.phase = "finish";
  } else if (job.phase === "finish" && job.solve) {
    const result = runtime.finishWetPaperSolve(job.solve);
    job.raster = result ? runtime.createStudioWetPaperRasterJob(result, job.entry.color) : null;
    job.solve = null;
    job.phase = "raster";
    if (!job.raster) complete(job);
  } else if (job.phase === "raster" && job.raster) {
    const rows = Math.max(1, Math.floor(16_384 / job.raster.raster.width));
    if (runtime.advanceStudioWetPaperRasterJob(job.raster, rows)) complete(job);
  }
}
function run(): void {
  timer = null;
  const start = now();
  do {
    if (!prepared) {
      prepared = runtime.advanceWetPaperBristleFieldBuild();
      if (prepared) {
        preparedReady?.(); preparedReady = undefined; preparation = null;
      }
    } else {
      // 한 번에 한 solve만 할당한다(기존 최대 격자 65,536셀). 대기 prefix는 수치 스냅숏만 보관한다.
      const job = jobs.values().next().value;
      if (!job) break;
      advance(job);
    }
  } while (now() - start < 8);
  schedule();
}

export function prewarmStudioDryBrushLiveHost(): Promise<void> {
  if (prepared) return Promise.resolve();
  preparation ??= new Promise<void>((resolve) => { preparedReady = resolve; });
  schedule();
  return preparation;
}

export function requestStudioDryBrushLiveHost(
  dabs: readonly WetPaperInputDab[], request: StudioWetPaperBakeRequest, color: string,
  onReady: () => void, requester?: string, allowCreate = true,
): StudioWetPaperCanvasBake | null {
  const key = requester ?? onReady;
  if (request.programId !== "chu-tai-dry-brush" || !Number.isFinite(request.seed)) { detach(key); return null; }
  const seed = Math.floor(request.seed) | 0;
  const candidates = [...entries.values()].filter((item) => item.seed === seed && item.color === color);
  if (!allowCreate && candidates.length === 0) { detach(key); return null; }
  const signature = signatureOf(dabs);
  if (!signature) { detach(key); return null; }
  let entry = candidates.find((item) => same(item.signature, signature));
  if (!entry || owners.get(key)?.entryId !== entry.id) detach(key);
  if (!entry && !allowCreate) return null;
  if (!entry) {
    while (entries.size >= MAX_ENTRIES) { const oldest = entries.values().next().value; if (oldest) drop(oldest); }
    entry = { id: ++nextId, signature, seed, color, bake: null, pixels: 0 };
    entries.set(entry.id, entry);
    // 호출자의 append 배열은 보관하지 않는다. 원점·평균·간격에 의존하는 전체 prefix를 다시 푼다.
    const copied = dabs.map(({ x, y, radius, opacity, role }) => ({ x, y, radius, opacity, role }));
    jobs.set(entry.id, { entry, dabs: copied, phase: "create", solve: null, cursor: 0, raster: null });
  }
  entries.delete(entry.id); entries.set(entry.id, entry);
  owners.delete(key); owners.set(key, { entryId: entry.id, ready: onReady });
  while (owners.size > MAX_OWNERS) { const oldest = owners.keys().next().value; if (oldest !== undefined) detach(oldest); }
  schedule();
  return entry.bake;
}

export function releaseStudioDryBrushLiveHost(prefix: string): void {
  for (const key of [...owners.keys()]) if (typeof key === "string" && (key === prefix || key.startsWith(`${prefix}#`))) detach(key);
}
export function resetStudioDryBrushLiveHostForTests(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null; entries.clear(); jobs.clear(); owners.clear(); pixels = 0;
  preparedReady?.(); preparedReady = undefined; preparation = null;
}
export function studioDryBrushLiveHostStatsForTests() {
  return { entries: entries.size, jobs: jobs.size, owners: owners.size, pixels, prepared };
}
