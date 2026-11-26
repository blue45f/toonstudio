/**
 * Renderer-neutral dynamic scene spatial index backed by a zero-dep flat Morton 2D BVH.
 */

export const STUDIO_ENGINE_SCENE_SPATIAL_INDEX_VERSION = 1 as const;

export const STUDIO_ENGINE_SCENE_SPATIAL_INDEX_LIMITS = Object.freeze({
  maxEntries: 262_144,
  maxIdentifierCodeUnits: 256,
  maxCoordinateAbsolute: 10_000_000,
  maxZOrderAbsolute: 2_147_483_647,
  maxSearchCandidates: 65_536,
  maxSearchResults: 16_384,
  rbushMaxEntries: 16,
} as const);

export interface StudioEngineSceneSpatialBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface StudioEngineSceneSpatialEntryCandidate {
  readonly id: string;
  readonly bounds: StudioEngineSceneSpatialBounds;
  readonly zOrder: number;
  readonly locked?: boolean;
  readonly hidden?: boolean;
  readonly interactive?: boolean;
}

export interface StudioEngineSceneSpatialEntry {
  readonly id: string;
  readonly bounds: StudioEngineSceneSpatialBounds;
  readonly zOrder: number;
  readonly locked: boolean;
  readonly hidden: boolean;
  readonly interactive: boolean;
}

export interface StudioEngineSceneSpatialPoint {
  readonly x: number;
  readonly y: number;
}

export interface StudioEngineSceneSpatialSearchOptions {
  readonly includeHidden?: boolean;
  readonly includeLocked?: boolean;
  readonly interactiveOnly?: boolean;
  readonly limit?: number;
}

export interface StudioEngineSceneSpatialPointHitOptions {
  readonly includeHidden?: boolean;
  readonly includeLocked?: boolean;
}

export interface StudioEngineSceneSpatialIndexLimits {
  readonly maxEntries?: number;
  readonly maxIdentifierCodeUnits?: number;
  readonly maxCoordinateAbsolute?: number;
  readonly maxZOrderAbsolute?: number;
  readonly maxSearchCandidates?: number;
  readonly maxSearchResults?: number;
  readonly rbushMaxEntries?: number;
}

export interface StudioEngineSceneSpatialIndexOptions {
  readonly limits?: StudioEngineSceneSpatialIndexLimits;
}

export type StudioEngineSceneSpatialFailureReason =
  | "invalid-input"
  | "duplicate-id"
  | "budget-exceeded"
  | "disposed"
  | "index-failure";

export type StudioEngineSceneSpatialUpsertResult =
  | Readonly<{ readonly ok: true; readonly replaced: boolean; readonly entry: StudioEngineSceneSpatialEntry; readonly size: number }>
  | StudioEngineSceneSpatialFailure;

export type StudioEngineSceneSpatialRemoveResult =
  | Readonly<{ readonly ok: true; readonly removed: boolean; readonly size: number }>
  | StudioEngineSceneSpatialFailure;

export type StudioEngineSceneSpatialRebuildResult =
  | Readonly<{ readonly ok: true; readonly entryCount: number; readonly size: number }>
  | StudioEngineSceneSpatialFailure;

export type StudioEngineSceneSpatialSearchResult =
  | Readonly<{ readonly ok: true; readonly entries: readonly StudioEngineSceneSpatialEntry[]; readonly candidateCount: number }>
  | StudioEngineSceneSpatialFailure;

export type StudioEngineSceneSpatialPointHitResult =
  | Readonly<{ readonly ok: true; readonly entry: StudioEngineSceneSpatialEntry | null; readonly candidateCount: number }>
  | StudioEngineSceneSpatialFailure;

export interface StudioEngineSceneSpatialFailure {
  readonly ok: false;
  readonly reason: StudioEngineSceneSpatialFailureReason;
  readonly detail: string;
}

export interface StudioEngineSceneSpatialIndexSnapshot {
  readonly kind: "studio-engine-scene-spatial-index";
  readonly version: typeof STUDIO_ENGINE_SCENE_SPATIAL_INDEX_VERSION;
  readonly phase: "ready" | "disposed";
  readonly size: number;
  readonly mutationSequence: number;
}

type Limits = Required<StudioEngineSceneSpatialIndexLimits>;
interface Item extends StudioEngineSceneSpatialBounds { readonly entry: StudioEngineSceneSpatialEntry }
interface SearchOpts { readonly includeHidden: boolean; readonly includeLocked: boolean; readonly interactiveOnly: boolean; readonly limit: number }

const LIMIT_KEYS = [
  "maxEntries", "maxIdentifierCodeUnits", "maxCoordinateAbsolute",
  "maxZOrderAbsolute", "maxSearchCandidates", "maxSearchResults", "rbushMaxEntries",
] as const;

const spread16 = (v: number): number => {
  let x = v & 0xffff;
  x = (x | (x << 8)) & 0x00ff00ff;
  x = (x | (x << 4)) & 0x0f0f0f0f;
  x = (x | (x << 2)) & 0x33333333;
  return (x | (x << 1)) & 0x55555555;
};

/** Flat pre-order Morton Z-Order 2D BVH matching MortonBvh2D exact AABB intersection semantics. */
class FlatMortonBvh2D {
  private items: Item[] = [];
  private box = new Float64Array(0);
  private meta = new Int32Array(0);
  private nodes = 0;

  constructor(private readonly leafCap: number) {}

  clear(): void {
    this.items = [];
    this.nodes = 0;
  }

  load(src: readonly Item[]): void {
    const n = src.length;
    if (n === 0) { this.clear(); return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i += 1) {
      const it = src[i]!, cx = 0.5 * (it.minX + it.maxX), cy = 0.5 * (it.minY + it.maxY);
      if (cx < x0) x0 = cx;
      if (cy < y0) y0 = cy;
      if (cx > x1) x1 = cx;
      if (cy > y1) y1 = cy;
    }
    const sx = x1 > x0 ? 65535 / (x1 - x0) : 0, sy = y1 > y0 ? 65535 / (y1 - y0) : 0;
    const codes = new Uint32Array(n), order = new Int32Array(n);
    for (let i = 0; i < n; i += 1) {
      const it = src[i]!;
      const qx = Math.min(65535, Math.max(0, Math.round((0.5 * (it.minX + it.maxX) - x0) * sx)));
      const qy = Math.min(65535, Math.max(0, Math.round((0.5 * (it.minY + it.maxY) - y0) * sy)));
      codes[i] = (spread16(qx) | (spread16(qy) << 1)) >>> 0;
      order[i] = i;
    }
    order.sort((a, b) => (codes[a]! - codes[b]!) || (a - b));
    this.items = Array.from(order, (idx) => src[idx]!);
    const cap = Math.max(1, 2 * Math.ceil(n / Math.max(1, this.leafCap)) + 8);
    if (this.box.length < cap * 4) {
      this.box = new Float64Array(cap * 4);
      this.meta = new Int32Array(cap * 2);
    }
    this.nodes = 0;
    this.build(0, n);
  }

  private build(start: number, end: number): number {
    const idx = this.nodes;
    this.nodes += 1;
    if (idx * 4 >= this.box.length) {
      const next = Math.max(idx + 1, (this.box.length >>> 2) * 2);
      const b = new Float64Array(next * 4); b.set(this.box); this.box = b;
      const m = new Int32Array(next * 2); m.set(this.meta); this.meta = m;
    }
    let b0 = Infinity, b1 = Infinity, b2 = -Infinity, b3 = -Infinity;
    for (let i = start; i < end; i += 1) {
      const it = this.items[i]!;
      if (it.minX < b0) b0 = it.minX;
      if (it.minY < b1) b1 = it.minY;
      if (it.maxX > b2) b2 = it.maxX;
      if (it.maxY > b3) b3 = it.maxY;
    }
    const o4 = idx * 4, o2 = idx * 2;
    this.box[o4] = b0; this.box[o4 + 1] = b1; this.box[o4 + 2] = b2; this.box[o4 + 3] = b3;
    const count = end - start;
    if (count <= this.leafCap) {
      this.meta[o2] = start;
      this.meta[o2 + 1] = count;
      return idx;
    }
    const mid = (start + end) >>> 1;
    this.build(start, mid);
    const rightIdx = this.build(mid, end);
    this.meta[o2] = rightIdx;
    this.meta[o2 + 1] = 0;
    return idx;
  }

  search(x0: number, y0: number, x1: number, y1: number, maxCand: number): Item[] | null {
    if (this.nodes === 0) return [];
    const hits: Item[] = [], stack = [0];
    while (stack.length > 0) {
      const idx = stack.pop()!, o4 = idx * 4;
      if (this.box[o4]! > x1 || this.box[o4 + 2]! < x0 || this.box[o4 + 1]! > y1 || this.box[o4 + 3]! < y0) continue;
      const o2 = idx * 2, count = this.meta[o2 + 1]!;
      if (count > 0) {
        const s = this.meta[o2]!;
        for (let i = s, e = s + count; i < e; i += 1) {
          const it = this.items[i]!;
          if (it.minX <= x1 && it.maxX >= x0 && it.minY <= y1 && it.maxY >= y0) {
            hits.push(it);
            if (hits.length > maxCand) return null;
          }
        }
      } else {
        stack.push(this.meta[o2]!, idx + 1);
      }
    }
    return hits;
  }
}

const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};

const hasKeys = (v: Readonly<Record<string, unknown>>, req: readonly string[], opt: readonly string[] = []): boolean => {
  const keys = Object.keys(v);
  return keys.length >= req.length && keys.length <= req.length + opt.length
    && req.every((k) => Object.hasOwn(v, k))
    && keys.every((k) => req.includes(k) || opt.includes(k));
};

const posInt = (v: number | undefined, fb: number, n: string): number => {
  const x = v ?? fb;
  if (!Number.isSafeInteger(x) || x <= 0) throw new TypeError(`${n} must be a positive safe integer`);
  return x;
};

const posFin = (v: number | undefined, fb: number, n: string): number => {
  const x = v ?? fb;
  if (!Number.isFinite(x) || x <= 0) throw new TypeError(`${n} must be a positive finite number`);
  return x;
};

function resolveLimits(cand: StudioEngineSceneSpatialIndexLimits | undefined): Limits {
  if (cand !== undefined && (!isPlain(cand) || !hasKeys(cand, [], LIMIT_KEYS))) {
    throw new TypeError("Spatial-index limits must be a plain object");
  }
  const lim = (cand ?? {}) as StudioEngineSceneSpatialIndexLimits;
  const d = STUDIO_ENGINE_SCENE_SPATIAL_INDEX_LIMITS;
  const r: Limits = {
    maxEntries: posInt(lim.maxEntries, d.maxEntries, "maxEntries"),
    maxIdentifierCodeUnits: posInt(lim.maxIdentifierCodeUnits, d.maxIdentifierCodeUnits, "maxIdentifierCodeUnits"),
    maxCoordinateAbsolute: posFin(lim.maxCoordinateAbsolute, d.maxCoordinateAbsolute, "maxCoordinateAbsolute"),
    maxZOrderAbsolute: posInt(lim.maxZOrderAbsolute, d.maxZOrderAbsolute, "maxZOrderAbsolute"),
    maxSearchCandidates: posInt(lim.maxSearchCandidates, d.maxSearchCandidates, "maxSearchCandidates"),
    maxSearchResults: posInt(lim.maxSearchResults, d.maxSearchResults, "maxSearchResults"),
    rbushMaxEntries: posInt(lim.rbushMaxEntries, d.rbushMaxEntries, "rbushMaxEntries"),
  };
  if (r.rbushMaxEntries < 4 || r.rbushMaxEntries > 64) {
    throw new TypeError("rbushMaxEntries must be from four to sixty-four");
  }
  return Object.freeze(r);
}

const fail = (reason: StudioEngineSceneSpatialFailureReason, detail: string): StudioEngineSceneSpatialFailure =>
  Object.freeze({ ok: false, reason, detail });

function parseId(v: unknown, lim: Limits): string | null {
  if (typeof v !== "string" || v.length === 0 || v.length > lim.maxIdentifierCodeUnits || v !== v.trim()) return null;
  for (let i = 0; i < v.length; i += 1) {
    const c = v.charCodeAt(i);
    if (c <= 31 || c === 127) return null;
  }
  return v;
}

function parseBounds(v: unknown, lim: Limits): StudioEngineSceneSpatialBounds | null {
  if (!isPlain(v) || !hasKeys(v, ["minX", "minY", "maxX", "maxY"])) return null;
  const { minX, minY, maxX, maxY } = v, cap = lim.maxCoordinateAbsolute;
  if (
    typeof minX !== "number" || typeof minY !== "number" || typeof maxX !== "number" || typeof maxY !== "number"
    || !Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)
    || Math.abs(minX) > cap || Math.abs(minY) > cap || Math.abs(maxX) > cap || Math.abs(maxY) > cap
    || minX > maxX || minY > maxY
  ) return null;
  return Object.freeze({ minX, minY, maxX, maxY });
}

function parseEntry(v: unknown, lim: Limits): StudioEngineSceneSpatialEntry | null {
  if (!isPlain(v) || !hasKeys(v, ["id", "bounds", "zOrder"], ["locked", "hidden", "interactive"])) return null;
  const id = parseId(v.id, lim), bounds = parseBounds(v.bounds, lim);
  if (
    id === null || bounds === null
    || typeof v.zOrder !== "number" || !Number.isSafeInteger(v.zOrder) || Math.abs(v.zOrder) > lim.maxZOrderAbsolute
    || (v.locked !== undefined && typeof v.locked !== "boolean")
    || (v.hidden !== undefined && typeof v.hidden !== "boolean")
    || (v.interactive !== undefined && typeof v.interactive !== "boolean")
  ) return null;
  return Object.freeze({
    id, bounds, zOrder: v.zOrder,
    locked: v.locked ?? false, hidden: v.hidden ?? false, interactive: v.interactive ?? true,
  });
}

const toItem = (entry: StudioEngineSceneSpatialEntry): Item =>
  Object.freeze({ minX: entry.bounds.minX, minY: entry.bounds.minY, maxX: entry.bounds.maxX, maxY: entry.bounds.maxY, entry });

const topmostOrder = (a: Item, b: Item): number =>
  a.entry.zOrder !== b.entry.zOrder
    ? (a.entry.zOrder > b.entry.zOrder ? -1 : 1)
    : (a.entry.id === b.entry.id ? 0 : (a.entry.id < b.entry.id ? -1 : 1));

const optBool = (v: unknown, fb: boolean): boolean | null =>
  v === undefined ? fb : typeof v === "boolean" ? v : null;

function parseSearchOpts(v: unknown, lim: Limits): SearchOpts | null {
  if (v !== undefined && (!isPlain(v) || !hasKeys(v, [], ["includeHidden", "includeLocked", "interactiveOnly", "limit"]))) return null;
  const o = v ?? {};
  const includeHidden = optBool(o.includeHidden, false);
  const includeLocked = optBool(o.includeLocked, true);
  const interactiveOnly = optBool(o.interactiveOnly, false);
  const limit = o.limit ?? lim.maxSearchResults;
  if (
    includeHidden === null || includeLocked === null || interactiveOnly === null
    || typeof limit !== "number" || !Number.isSafeInteger(limit) || limit <= 0 || limit > lim.maxSearchResults
  ) return null;
  return Object.freeze({ includeHidden, includeLocked, interactiveOnly, limit });
}

function parseHitOpts(v: unknown): Readonly<{ includeHidden: boolean; includeLocked: boolean }> | null {
  if (v !== undefined && (!isPlain(v) || !hasKeys(v, [], ["includeHidden", "includeLocked"]))) return null;
  const o = v ?? {};
  const includeHidden = optBool(o.includeHidden, false);
  const includeLocked = optBool(o.includeLocked, false);
  return includeHidden === null || includeLocked === null ? null : Object.freeze({ includeHidden, includeLocked });
}

export class StudioEngineSceneSpatialIndex {
  private bvh: FlatMortonBvh2D;
  private entriesById = new Map<string, Item>();
  private readonly limits: Limits;
  private dirty = false;
  private disposed = false;
  private mutationSequence = 0;

  constructor(options: StudioEngineSceneSpatialIndexOptions = {}) {
    if (!isPlain(options) || !hasKeys(options, [], ["limits"])) {
      throw new TypeError("Spatial-index options contain unknown fields");
    }
    this.limits = resolveLimits((options as StudioEngineSceneSpatialIndexOptions).limits);
    this.bvh = new FlatMortonBvh2D(this.limits.rbushMaxEntries);
  }

  public get size(): number {
    return this.entriesById.size;
  }

  private sync(): void {
    if (!this.dirty) return;
    this.bvh.load([...this.entriesById.values()]);
    this.dirty = false;
  }

  public upsert(candidate: unknown): StudioEngineSceneSpatialUpsertResult {
    if (this.disposed) return fail("disposed", "Scene spatial index is disposed");
    const entry = parseEntry(candidate, this.limits);
    if (entry === null) return fail("invalid-input", "Scene spatial entry is invalid");
    const existing = this.entriesById.get(entry.id);
    if (existing === undefined && this.entriesById.size >= this.limits.maxEntries) {
      return fail("budget-exceeded", "Scene spatial entry budget exceeded");
    }
    this.entriesById.set(entry.id, toItem(entry));
    this.dirty = true;
    this.mutationSequence += 1;
    return Object.freeze({ ok: true, replaced: existing !== undefined, entry, size: this.entriesById.size });
  }

  public remove(idCandidate: unknown): StudioEngineSceneSpatialRemoveResult {
    if (this.disposed) return fail("disposed", "Scene spatial index is disposed");
    const id = parseId(idCandidate, this.limits);
    if (id === null) return fail("invalid-input", "Scene spatial ID is invalid");
    if (!this.entriesById.delete(id)) return Object.freeze({ ok: true, removed: false, size: this.entriesById.size });
    this.dirty = true;
    this.mutationSequence += 1;
    return Object.freeze({ ok: true, removed: true, size: this.entriesById.size });
  }

  public rebuild(candidates: unknown): StudioEngineSceneSpatialRebuildResult {
    if (this.disposed) return fail("disposed", "Scene spatial index is disposed");
    if (!Array.isArray(candidates)) return fail("invalid-input", "Scene spatial rebuild input must be an array");
    if (candidates.length > this.limits.maxEntries) return fail("budget-exceeded", "Scene spatial rebuild exceeds the entry budget");
    const next = new Map<string, Item>(), items: Item[] = [];
    for (const c of candidates) {
      const entry = parseEntry(c, this.limits);
      if (entry === null) return fail("invalid-input", "Scene spatial rebuild contains an invalid entry");
      if (next.has(entry.id)) return fail("duplicate-id", "Scene spatial rebuild contains a duplicate ID");
      const it = toItem(entry);
      next.set(entry.id, it);
      items.push(it);
    }
    const bvh = new FlatMortonBvh2D(this.limits.rbushMaxEntries);
    bvh.load(items);
    this.bvh = bvh;
    this.entriesById = next;
    this.dirty = false;
    this.mutationSequence += 1;
    return Object.freeze({ ok: true, entryCount: items.length, size: this.entriesById.size });
  }

  public bulkRebuild(candidates: unknown): StudioEngineSceneSpatialRebuildResult {
    return this.rebuild(candidates);
  }

  public search(
    boundsCandidate: unknown,
    optionsCandidate?: StudioEngineSceneSpatialSearchOptions,
  ): StudioEngineSceneSpatialSearchResult {
    if (this.disposed) return fail("disposed", "Scene spatial index is disposed");
    const bounds = parseBounds(boundsCandidate, this.limits);
    const opts = parseSearchOpts(optionsCandidate, this.limits);
    if (bounds === null || opts === null) return fail("invalid-input", "Scene spatial search input is invalid");
    this.sync();
    const cands = this.bvh.search(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, this.limits.maxSearchCandidates);
    if (cands === null) return fail("budget-exceeded", "Scene spatial search candidate budget exceeded");
    const entries = cands
      .filter((it) => (opts.includeHidden || !it.entry.hidden) && (opts.includeLocked || !it.entry.locked) && (!opts.interactiveOnly || it.entry.interactive))
      .sort(topmostOrder)
      .slice(0, opts.limit)
      .map((it) => it.entry);
    return Object.freeze({ ok: true, entries: Object.freeze(entries), candidateCount: cands.length });
  }

  public hitTestPoint(
    pointCandidate: unknown,
    optionsCandidate?: StudioEngineSceneSpatialPointHitOptions,
  ): StudioEngineSceneSpatialPointHitResult {
    if (this.disposed) return fail("disposed", "Scene spatial index is disposed");
    if (
      !isPlain(pointCandidate) || !hasKeys(pointCandidate, ["x", "y"])
      || typeof pointCandidate.x !== "number" || typeof pointCandidate.y !== "number"
      || !Number.isFinite(pointCandidate.x) || !Number.isFinite(pointCandidate.y)
      || Math.abs(pointCandidate.x) > this.limits.maxCoordinateAbsolute
      || Math.abs(pointCandidate.y) > this.limits.maxCoordinateAbsolute
    ) return fail("invalid-input", "Scene spatial hit-test point is invalid");
    const opts = parseHitOpts(optionsCandidate);
    if (opts === null) return fail("invalid-input", "Scene spatial hit-test options are invalid");
    const { x, y } = pointCandidate;
    this.sync();
    const cands = this.bvh.search(x, y, x, y, this.limits.maxSearchCandidates);
    if (cands === null) return fail("budget-exceeded", "Scene spatial hit-test candidate budget exceeded");
    const top = cands
      .filter((it) => x >= it.minX && x <= it.maxX && y >= it.minY && y <= it.maxY && it.entry.interactive && (opts.includeHidden || !it.entry.hidden) && (opts.includeLocked || !it.entry.locked))
      .sort(topmostOrder)[0];
    return Object.freeze({ ok: true, entry: top?.entry ?? null, candidateCount: cands.length });
  }

  public clear(): StudioEngineSceneSpatialRebuildResult {
    return this.rebuild([]);
  }

  public getSnapshot(): StudioEngineSceneSpatialIndexSnapshot {
    return Object.freeze({
      kind: "studio-engine-scene-spatial-index",
      version: STUDIO_ENGINE_SCENE_SPATIAL_INDEX_VERSION,
      phase: this.disposed ? "disposed" : "ready",
      size: this.entriesById.size,
      mutationSequence: this.mutationSequence,
    });
  }

  public dispose(): void {
    if (this.disposed) return;
    this.bvh.clear();
    this.entriesById.clear();
    this.dirty = false;
    this.mutationSequence += 1;
    this.disposed = true;
  }
}

export function createStudioEngineSceneSpatialIndex(
  options?: StudioEngineSceneSpatialIndexOptions,
): StudioEngineSceneSpatialIndex {
  return new StudioEngineSceneSpatialIndex(options);
}
