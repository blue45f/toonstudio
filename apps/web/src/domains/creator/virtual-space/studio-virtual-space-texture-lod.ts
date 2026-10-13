/**
 * 텍스처 LOD(소프트웨어 밉맵) — 크게 줄어 그려지는 스프라이트의 앨리어싱을 없앤다.
 *
 * 문제: 가상 스튜디오의 그림 원본은 화면에 그려지는 크기보다 훨씬 크다. 아바타 정지 그림은 160px 원본이 약 66px로,
 * 가구 시트(1254px 4×4 격자)의 칸은 313px 원본이 28~126px로 그려져 1x 화면에서 2.3~7.5배로 줄어든다. WebGL의 이중선형
 * 필터는 한 화소에 텍셀 4개만 읽으므로 이 정도로 줄이면 얇은 선이 끊기고(벤치 등판 틈새, 가로등 기둥) 윤곽이 계단지며
 * 움직일 때 반짝인다. 하드웨어 밉맵은 Phaser 3(WebGL1)에서 2의 거듭제곱 크기 텍스처에만 걸려 이 시트들(1254·160·640px)에는 쓸 수 없다.
 *
 * 해법: 실제 화면 밀도(원본 텍셀 ÷ 화면 픽셀)를 칸(프레임)마다 재서, 2배 이상 줄어 그려지는 칸은 Lanczos3로 반감한 사본 텍스처를 읽게 한다.
 * 사본은 원본과 같은 칸 배치를 줄인 것이라 UV(0~1 정규화)·표시 크기·원본 크기 검증은 그대로다. Phaser의 WebGL 파이프라인은 칸의
 * frame.source.glTexture를 바인딩하므로, 칸의 source를 "glTexture만 사본으로 바꾼 파생 객체"(원본 TextureSource를 프로토타입으로 둔다)로
 * 칸 단위로 갈아 끼운다. 원본 텍스처는 건드리지 않아 크게 그려지는 칸(깔개·확대된 소품)은 같은 시트에서도 원본을 그대로 읽는다.
 * 칸마다 따로 줄여 이웃 칸의 그림이 번지지 않게 한다. 픽셀 아트(NEAREST)·캔버스 렌더러·반복 타일은 건드리지 않는다.
 */
import { readStudioTexturePixels, type StudioTexturePixels } from "./studio-virtual-space-character-texture-preparer";
import {
  studioLodCellsOverlap,
  studioLodImageStages,
  studioPremultiplyRgba,
  type StudioLodCell,
  type StudioRgbaImage,
} from "./studio-virtual-space-texture-lod-pixels";
import { StudioTextureLodWorkerClient, type StudioTextureLodWorkerFactory } from "./studio-virtual-space-texture-lod-worker-client";


/** 줄이는 최대 단계(2^3 = 8배). 이보다 작게 그려지는 건 원본 아트 문제라 LOD로 풀지 않는다. */
export const STUDIO_TEXTURE_LOD_MAX_LEVEL = 3;
/** 이 크기보다 작은 텍스처는 얻을 것이 없다. */
const MIN_LOD_SIDE = 96;
/** 한 단계를 더 줄여도 이 정도(7%)의 확대까지는 눈에 띄지 않는다. 경계(2.0배)에서 아슬하게 못 줄이는 일을 막는다. */
const MAGNIFICATION_TOLERANCE = 1.07;
/** 화면에 거의 안 보이게 줄어든 객체(0 배율로 숨긴 것 등)가 단계를 끌어올리지 않게 한다. */
const MIN_DISPLAY_SCALE = 0.05;
/** 진단·A/B용 끔 스위치(localStorage 값이 "off"면 사본을 만들지 않는다). */
export const STUDIO_TEXTURE_LOD_FLAG_KEY = "toonspectrum:virtual-space-texture-lod";
const RESCAN_INTERVAL_MS = 400;
/** 더 줄여도 되는 상태가 이만큼 이어져야 줄인다(배율이 맥박처럼 흔들릴 때 올렸다 내렸다 하지 않도록). */
const REDUCE_STABLE_MS = 1_200;
/** 더 선명해야 하는 쪽은 경계를 이만큼(log2) 넘어야 반응한다. */
const SHARPEN_MARGIN = 0.08;
const ZOOM_RESCAN_RATIO = 0.02;
const FIRST_SIGHT_BUDGET_MS = 14;
const RELAXED_BUDGET_MS = 5;
/** 사본 한 변이 이보다 작아지는 단계는 만들지 않는다. */
const MIN_COPY_SIDE = 24;
/** 어떤 칸도 읽지 않는 사본은 이 시간이 지나면 GPU에서 내린다(줌이 오르내릴 때 만들었다 지웠다 하지 않도록 넉넉히). */
const IDLE_COPY_MS = 10_000;

export function studioTextureLodDisabled(storage?: Pick<Storage, "getItem">): boolean {
  try {
    return (storage ?? globalThis.localStorage).getItem(STUDIO_TEXTURE_LOD_FLAG_KEY) === "off";
  } catch {
    return false;
  }
}

/** 원본 텍셀 ÷ 화면 픽셀. 1보다 크면 줄어 그려진다. 가로·세로 중 더 크게 그려지는 쪽을 따른다(번짐이 우선 보호 대상). */
export function studioTextureDensity(scaleX: number, scaleY: number, zoom: number): number {
  const scale = Math.max(Math.abs(scaleX), Math.abs(scaleY)) * zoom;
  return scale > 0 && Number.isFinite(scale) ? 1 / scale : Number.NaN;
}

/** 밀도 d의 텍스처를 몇 번 반감하면 남는 축소가 2배 미만(1~2배)이 되는지. */
export function studioTextureLodLevel(density: number, maxLevel = STUDIO_TEXTURE_LOD_MAX_LEVEL): number {
  if (!Number.isFinite(density) || density <= 1) return 0;
  return Math.min(maxLevel, Math.max(0, Math.floor(Math.log2(density * MAGNIFICATION_TOLERANCE))));
}


/** Phaser WebGLTextureWrapper 중 LOD가 쓰는 부분. */
export interface StudioLodWrapper {
  readonly flipY: boolean;
  readonly wrapS: number;
  readonly wrapT: number;
  readonly minFilter: number;
  readonly magFilter: number;
  readonly format: number;
}

/** Phaser WebGLRenderer 중 LOD가 쓰는 부분. 사본 텍스처를 만들고 내린다. */
export interface StudioLodRenderer {
  readonly type?: number;
  readonly gl?: unknown;
  createTexture2D?(
    mipLevel: number, minFilter: number, magFilter: number, wrapT: number, wrapS: number, format: number,
    pixels: Uint8Array, width: number, height: number, pma: boolean, forceSize: boolean, flipY: boolean,
  ): StudioLodWrapper;
  deleteTexture?(wrapper: StudioLodWrapper): unknown;
}

/** Phaser TextureSource 중 LOD가 쓰는 부분. */
export interface StudioLodSource {
  readonly width: number;
  readonly height: number;
  readonly image: unknown;
  readonly scaleMode: number;
  readonly isCanvas: boolean;
  readonly isVideo: boolean;
  readonly isRenderTexture: boolean;
  readonly isGLTexture: boolean;
  readonly compressionAlgorithm: number | null;
  readonly glTexture: StudioLodWrapper | null;
}

interface StudioLodFrame {
  /** Phaser Frame.source — WebGL 파이프라인이 바인딩하는 glTexture를 여기서 읽는다. */
  readonly source?: unknown;
  readonly name: string | number;
  readonly cutX: number;
  readonly cutY: number;
  readonly cutWidth: number;
  readonly cutHeight: number;
}

/** Phaser Texture 중 LOD가 쓰는 부분. */
export interface StudioLodTexture {
  readonly key: string;
  readonly source: readonly StudioLodSource[];
  /** Phaser의 Texture.frames는 이름 → Frame 객체 사전이다(타입은 object로만 선언돼 있다). */
  readonly frames: object;
}

interface StudioLodDisplayObject {
  readonly type: string;
  readonly visible: boolean;
  readonly alpha: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly texture?: { readonly key: string } | null;
  readonly frame?: { readonly name: string | number } | null;
  readonly parentContainer?: StudioLodDisplayObject | null;
  readonly list?: readonly unknown[];
}

export interface StudioLodScene {
  readonly children: { readonly list: readonly unknown[] };
  readonly cameras: { readonly main: { readonly zoom: number } };
  readonly textures: {
    exists(key: string): boolean;
    get(key: string): StudioLodTexture;
    on(event: string, listener: (key: string) => void): unknown;
    off(event: string, listener: (key: string) => void): unknown;
  };
  readonly game?: { readonly renderer?: StudioLodRenderer | null } | null;
}

export interface StudioTextureLodOptions {
  readonly scene: StudioLodScene;
  /** false면 아무것도 하지 않는다(캔버스 렌더러·픽셀 아트·끔 스위치). */
  readonly enabled: boolean;
  readonly now?: () => number;
  /** 테스트용 주입. 기본은 DOM 캔버스로 읽는다. */
  readonly readPixels?: (image: unknown) => StudioTexturePixels | null;
  /** 큰 시트의 반감을 돌릴 워커. 생략하면 모듈 워커를 게으르게 만들고, null이면 메인 스레드에서만 계산한다. */
  readonly workerFactory?: StudioTextureLodWorkerFactory | null;
  /** 디코딩된 이미지를 비트맵으로 만든다(워커가 직접 읽을 수 있게). 기본은 createImageBitmap이고, 없으면 null을 돌려준다. */
  readonly createBitmap?: (image: unknown) => Promise<ImageBitmap> | null;
}

export interface StudioTextureLodEntry {
  readonly key: string;
  /** 만들어 둔 사본(단계·크기). */
  readonly copies: readonly { readonly level: number; readonly width: number; readonly height: number }[];
  /** 단계별로 사본을 읽는 칸 수(원본을 읽는 칸은 세지 않는다). */
  readonly frames: Readonly<Record<number, number>>;
}

interface LodCopy {
  readonly wrapper: StudioLodWrapper;
  /** 원본 TextureSource를 프로토타입으로 두고 glTexture만 사본으로 바꾼 파생 객체. 칸의 source로 쓴다. */
  readonly source: object;
  readonly width: number;
  readonly height: number;
  lastUsedAt: number;
}

interface LodFrameState {
  /** 지금 이 칸이 읽는 단계(0이면 원본). */
  applied: number;
  desired: number;
  desiredSince: number;
}

interface LodRecord {
  readonly key: string;
  readonly texture: StudioLodTexture;
  readonly source: StudioLodSource;
  readonly base: StudioLodWrapper;
  readonly frameTotal: number;
  readonly maxLevel: number;
  readonly copies: Map<number, LodCopy>;
  readonly frames: Map<string, LodFrameState>;
}

interface LodJob {
  readonly record: LodRecord;
  readonly level: number;
  urgent: boolean;
  /** queued: 아직 시작 전, preparing: 원본을 비트맵으로 만드는 중, worker: 워커가 계산 중(결과를 기다린다), thread: 메인 스레드에서 시간 예산을 나눠 계산 중. */
  phase: "queued" | "preparing" | "worker" | "thread";
  ticket?: number;
  stages?: Generator<void, StudioRgbaImage>;
  bitmap?: ImageBitmap;
  bitmapFailed?: boolean;
}

const isLodFrame = (value: unknown): value is StudioLodFrame => typeof value === "object" && value !== null
  && typeof (value as { cutX?: unknown }).cutX === "number" && typeof (value as { cutWidth?: unknown }).cutWidth === "number";

const isDisplayObject = (value: unknown): value is StudioLodDisplayObject =>
  typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";

const frameNameOf = (object: StudioLodDisplayObject): string => {
  const name = object.frame?.name;
  return typeof name === "string" ? name : String(name ?? "__BASE");
};

/**
 * 씬의 스프라이트·이미지가 쓰는 칸마다 화면 밀도를 재서 LOD 사본을 읽게 한다. 매 프레임 update()만 부르면 된다.
 * 처음 쓰이는 칸은 그 프레임에 바로 작업을 시작하고(첫 렌더 전에 끝나도록 예산을 더 쓴다), 줌·창 크기가 바뀌면 다시 재서
 * 더 선명해야 하는 쪽은 곧바로, 더 줄여도 되는 쪽은 한동안 안정된 뒤에 바꾼다.
 */
export class StudioTextureLodRuntime {
  private readonly records = new Map<string, LodRecord>();
  private readonly ineligible = new Set<string>();
  private readonly tileKeys = new Set<string>();
  /** 한 번이라도 측정에 들어간 (텍스처, 칸). 보이지 않는 객체 때문에 매 프레임 다시 재지 않도록 한다. */
  private readonly considered = new Map<string, Set<string>>();
  private readonly usage = new Map<string, Map<string, number>>();
  private newFrames = false;
  private readonly jobs: LodJob[] = [];
  private readonly enabled: boolean;
  private readonly now: () => number;
  private readonly readPixels: (image: unknown) => StudioTexturePixels | null;
  private readonly worker: StudioTextureLodWorkerClient | null;
  private readonly createBitmap: (image: unknown) => Promise<ImageBitmap> | null;
  private disposed = false;
  private lastRescanAt = Number.NEGATIVE_INFINITY;
  private lastZoom = 0;
  private readonly failed: Array<{ readonly key: string; readonly reason: string }> = [];
  private readonly onRemoved = (key: string) => this.forget(key);
  private readonly onAdded = (key: string) => { this.ineligible.delete(key); this.considered.delete(key); };

  constructor(private readonly options: StudioTextureLodOptions) {
    this.enabled = options.enabled;
    this.now = options.now ?? (() => globalThis.performance.now());
    this.readPixels = options.readPixels ?? ((image) => readStudioTexturePixels(image as Parameters<typeof readStudioTexturePixels>[0]));
    this.worker = this.enabled && options.workerFactory !== null ? new StudioTextureLodWorkerClient(options.workerFactory) : null;
    this.createBitmap = options.createBitmap ?? ((image) => (typeof globalThis.createImageBitmap === "function" ? globalThis.createImageBitmap(image as ImageBitmapSource) : null));
    if (this.enabled) {
      options.scene.textures.on("removetexture", this.onRemoved);
      options.scene.textures.on("addtexture", this.onAdded);
    }
  }

  /** 사본이 만들어져 있는 텍스처 목록(진단·테스트용). */
  entries(): readonly StudioTextureLodEntry[] {
    const list: StudioTextureLodEntry[] = [];
    for (const record of this.records.values()) {
      if (record.copies.size === 0) continue;
      const frames: Record<number, number> = {};
      for (const state of record.frames.values()) if (state.applied > 0) frames[state.applied] = (frames[state.applied] ?? 0) + 1;
      list.push({ key: record.key, copies: [...record.copies].map(([level, copy]) => ({ level, width: copy.width, height: copy.height })), frames });
    }
    return list;
  }

  /** 사본을 만들다 실패해 원본으로 남긴 텍스처와 이유(진단용). */
  failures(): readonly { readonly key: string; readonly reason: string }[] {
    return this.failed;
  }

  /** 사본이 GPU에서 차지하는 바이트(원본에 더해지는 양). */
  copyBytes(): number {
    let bytes = 0;
    for (const record of this.records.values()) for (const copy of record.copies.values()) bytes += copy.width * copy.height * 4;
    return bytes;
  }

  summary(): string {
    if (!this.enabled) return "off";
    let lodFrames = 0, trackedFrames = 0, textures = 0;
    for (const record of this.records.values()) {
      if (record.copies.size > 0) textures += 1;
      for (const state of record.frames.values()) { trackedFrames += 1; if (state.applied > 0) lodFrames += 1; }
    }
    return `텍스처 ${textures}개 · 칸 ${lodFrames}/${trackedFrames} · 사본 ${(this.copyBytes() / 1_048_576).toFixed(1)}MB${this.failed.length ? ` · 실패 ${this.failed.length}` : ""}`;
  }

  /** 캔버스 호스트의 data-* 진단 값(하네스·QA가 읽는다). */
  diagnostics(): { readonly textureLod: string; readonly textureLodFailures: string } {
    return { textureLod: this.summary(), textureLodFailures: JSON.stringify(this.failed) };
  }

  /** 줌·창 크기·해상도가 바뀐 직후 다음 update에서 밀도를 다시 잰다. */
  invalidate(): void {
    this.lastRescanAt = Number.NEGATIVE_INFINITY;
  }

  update(time: number): void {
    const renderer = this.options.scene.game?.renderer;
    if (!this.enabled || this.disposed || !renderer?.gl || !renderer.createTexture2D || !renderer.deleteTexture) return;
    this.noticeNewFrames();
    const zoom = this.options.scene.cameras.main.zoom;
    const zoomMoved = this.lastZoom > 0 && Math.abs(zoom - this.lastZoom) / this.lastZoom > ZOOM_RESCAN_RATIO;
    if (this.newFrames || zoomMoved || time - this.lastRescanAt >= RESCAN_INTERVAL_MS) this.rescan(time, zoom);
    this.pump(renderer, time);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.enabled) {
      this.options.scene.textures.off("removetexture", this.onRemoved);
      this.options.scene.textures.off("addtexture", this.onAdded);
    }
    this.jobs.length = 0;
    this.worker?.dispose();
    for (const record of [...this.records.values()]) this.dropRecord(record);
  }

  private renderer(): StudioLodRenderer | null {
    return this.options.scene.game?.renderer ?? null;
  }

  private forget(key: string): void {
    const record = this.records.get(key);
    if (record) this.dropRecord(record, false);
    this.ineligible.delete(key);
    this.tileKeys.delete(key);
    this.considered.delete(key);
  }

  /** 텍스처의 칸을 원본으로 되돌리고 사본을 내린다. 텍스처 자체가 지워지는 중이면(overrides는 의미 없음) 사본만 내린다. */
  private dropRecord(record: LodRecord, restoreFrames = true): void {
    if (restoreFrames) for (const name of record.frames.keys()) this.setFrameLevel(record, name, 0);
    const renderer = this.renderer();
    for (const copy of record.copies.values()) {
      try { renderer?.deleteTexture?.(copy.wrapper); } catch { /* 렌더러가 이미 내려갔으면 GPU 자원도 함께 사라졌다 */ }
    }
    record.copies.clear();
    record.frames.clear();
    this.records.delete(record.key);
    this.cancelJobs((job) => job.record === record);
  }

  private cancelJobs(matches: (job: LodJob) => boolean): void {
    for (let index = this.jobs.length - 1; index >= 0; index -= 1) {
      const job = this.jobs[index];
      if (!job || !matches(job)) continue;
      if (job.ticket !== undefined) this.worker?.cancel(job.ticket);
      job.bitmap?.close();
      this.jobs.splice(index, 1);
    }
  }

  /** 아직 한 번도 측정하지 않은 (텍스처, 칸)을 쓰는 객체가 보이면 다음 측정을 앞당긴다(프레임마다 이름만 훑으므로 값싸다). */
  private noticeNewFrames(): void {
    this.visit(this.options.scene.children.list, (object) => {
      const key = object.texture?.key;
      if (key === undefined || object.type === "TileSprite") return;
      if (!this.considered.get(key)?.has(frameNameOf(object))) this.newFrames = true;
    });
  }

  private visit(list: readonly unknown[], callback: (object: StudioLodDisplayObject) => void): void {
    for (const value of list) {
      if (!isDisplayObject(value)) continue;
      if (value.type === "Sprite" || value.type === "Image" || value.type === "TileSprite") callback(value);
      if (value.list) this.visit(value.list, callback);
    }
  }

  private rescan(time: number, zoom: number): void {
    this.lastRescanAt = time;
    this.lastZoom = zoom;
    this.newFrames = false;
    this.usage.clear();
    this.visit(this.options.scene.children.list, (object) => {
      const key = object.texture?.key;
      if (key === undefined) return;
      const name = frameNameOf(object);
      let seen = this.considered.get(key);
      if (!seen) { seen = new Set(); this.considered.set(key, seen); }
      seen.add(name);
      if (object.type === "TileSprite") { this.tileKeys.add(key); return; }
      if (!object.visible || object.alpha <= 0.01) return;
      let scaleX = Math.abs(object.scaleX), scaleY = Math.abs(object.scaleY);
      for (let parent = object.parentContainer; parent; parent = parent.parentContainer) { scaleX *= Math.abs(parent.scaleX); scaleY *= Math.abs(parent.scaleY); }
      if (Math.max(scaleX, scaleY) * zoom < MIN_DISPLAY_SCALE) return;
      const density = studioTextureDensity(scaleX, scaleY, zoom);
      if (!Number.isFinite(density)) return;
      let frames = this.usage.get(key);
      if (!frames) { frames = new Map(); this.usage.set(key, frames); }
      const known = frames.get(name);
      if (known === undefined || density < known) frames.set(name, density);
    });
    // 반복 타일은 UV가 0~1을 벗어나 되풀이되므로 사본으로 바꾸지 않는다. 이미 만들었다면 되돌린다.
    for (const key of this.tileKeys) {
      const record = this.records.get(key);
      if (record) this.dropRecord(record);
      this.usage.delete(key);
    }
    for (const [key, frames] of this.usage) {
      const record = this.recordFor(key);
      if (!record) continue;
      for (const [name, density] of frames) this.retarget(record, name, density, time);
    }
    this.releaseIdleCopies(time);
  }

  private recordFor(key: string): LodRecord | null {
    const existing = this.records.get(key);
    const { scene } = this.options;
    if (existing) {
      // 같은 키로 텍스처가 다시 만들어졌거나 칸이 늘어났으면 예전 사본은 믿지 않고(새 칸은 사본에 없다) 원본으로 되돌린 뒤 다시 잰다.
      const texture = scene.textures.exists(key) ? scene.textures.get(key) : null;
      if (texture && texture.source[0] === existing.source && Object.keys(texture.frames).length === existing.frameTotal) return existing;
      this.dropRecord(existing, Boolean(texture && texture.source[0] === existing.source));
    }
    if (this.ineligible.has(key) || this.tileKeys.has(key) || !scene.textures.exists(key)) return null;
    const texture = scene.textures.get(key);
    const source = texture.source.length === 1 ? texture.source[0] : undefined;
    const base = source?.glTexture;
    if (!source || !base || source.isCanvas || source.isVideo || source.isRenderTexture || source.isGLTexture || source.compressionAlgorithm !== null
      || source.scaleMode !== 0 || !source.image || Math.min(source.width, source.height) < MIN_LOD_SIDE) {
      this.ineligible.add(key);
      return null;
    }
    const maxLevel = Math.min(STUDIO_TEXTURE_LOD_MAX_LEVEL, Math.floor(Math.log2(Math.min(source.width, source.height) / MIN_COPY_SIDE)));
    const record: LodRecord = {
      key, texture, source, base, frameTotal: Object.keys(texture.frames).length, maxLevel,
      copies: new Map(), frames: new Map(),
    };
    this.records.set(key, record);
    return record;
  }

  private retarget(record: LodRecord, name: string, density: number, time: number): void {
    const candidate = Math.min(studioTextureLodLevel(density), record.maxLevel);
    const state = record.frames.get(name);
    if (!state) {
      // 처음 쓰이는 칸은 기다리지 않는다(원본으로 한 프레임이라도 그리면 앨리어싱이 보였다 사라진다).
      const created: LodFrameState = { applied: 0, desired: candidate, desiredSince: time };
      record.frames.set(name, created);
      if (candidate > 0) this.want(record, name, created, candidate, true);
      return;
    }
    if (candidate === state.applied) { state.desired = candidate; return; }
    if (candidate < state.applied) {
      // 더 크게 그려져야 해서(줌 인 등) 지금 사본이 흐려진다: 경계를 조금 넘으면 곧바로 선명한 쪽으로 되돌린다.
      if (Math.log2(density * MAGNIFICATION_TOLERANCE) < state.applied - SHARPEN_MARGIN) this.want(record, name, state, candidate, false);
      return;
    }
    if (state.desired !== candidate) { state.desired = candidate; state.desiredSince = time; }
    if (time - state.desiredSince >= REDUCE_STABLE_MS) this.want(record, name, state, candidate, false);
  }

  /** 칸이 level 단계를 읽게 한다. 사본이 아직 없으면 만들 작업을 세우고, 끝나면 이 칸을 포함해 그 단계를 원하는 칸 모두에 적용한다. */
  private want(record: LodRecord, name: string, state: LodFrameState, level: number, urgent: boolean): void {
    state.desired = level;
    if (level === 0 || record.copies.has(level)) {
      this.setFrameLevel(record, name, level);
      state.applied = level;
      return;
    }
    const queued = this.jobs.find((job) => job.record === record && job.level === level);
    if (queued) { queued.urgent ||= urgent; return; }
    this.jobs.push({ record, level, urgent, phase: "queued" });
  }

  /** 칸이 사본을 읽게 하거나(level>0) 원본 TextureSource로 되돌린다(level 0). */
  private setFrameLevel(record: LodRecord, name: string, level: number): void {
    const frame: unknown = Reflect.get(record.texture.frames, name);
    if (typeof frame !== "object" || frame === null) return;
    const copy = level > 0 ? record.copies.get(level) : undefined;
    if (copy) copy.lastUsedAt = this.now();
    Reflect.set(frame, "source", copy ? copy.source : record.source);
  }

  /** 메인 스레드 계산(워커가 없거나 실패했을 때, 그리고 작은 시트). 읽기·곱하기·반감을 양보 지점마다 끊어 시간 예산을 지킨다. */
  private *build(record: LodRecord, level: number, readyPixels?: StudioTexturePixels): Generator<void, StudioRgbaImage> {
    const pixels = readyPixels ?? this.readPixels(record.source.image);
    if (!pixels) throw new Error("lod-read-failed");
    yield;
    const base: StudioRgbaImage = { data: studioPremultiplyRgba(pixels.data, pixels.width, pixels.height), width: pixels.width, height: pixels.height };
    yield;
    return yield* studioLodImageStages(base, this.cellsOf(record, base.width, base.height), level);
  }

  /** 이름 있는 프레임이 있으면 그 칸들, 없으면 이미지 전체를 한 칸으로 본다. 칸이 서로 겹치면 독립 축소가 불가능해 예외로 건너뛴다. */
  private cellsOf(record: LodRecord, width: number, height: number): readonly StudioLodCell[] {
    const named = Object.values(record.texture.frames).filter(isLodFrame).filter((frame) => String(frame.name) !== "__BASE");
    const cells = named.length > 0
      ? named.map((frame) => ({ x: frame.cutX, y: frame.cutY, width: frame.cutWidth, height: frame.cutHeight }))
      : [{ x: 0, y: 0, width, height }];
    if (cells.some((cell) => !Number.isInteger(cell.x) || !Number.isInteger(cell.y) || !Number.isInteger(cell.width) || !Number.isInteger(cell.height))
      || studioLodCellsOverlap(cells)) throw new Error("lod-cells-unsupported");
    return cells;
  }

  /**
   * 작업 시작. 워커가 비트맵을 직접 읽을 수 있으면 디코딩된 이미지를 비트맵으로 만들어 넘겨(픽셀 읽기·곱하기·반감이 모두 메인 스레드 밖에서 돈다),
   * 아니면 메인 스레드에서 픽셀을 읽어 워커로 넘기거나 직접 계산한다.
   */
  private start(job: LodJob): void {
    const bitmap = this.worker?.bitmapAvailable ? this.createBitmap(job.record.source.image) : null;
    if (!bitmap) { this.startFromPixels(job); return; }
    job.phase = "preparing";
    bitmap.then(
      (made) => { if (job.phase === "preparing") job.bitmap = made; else made.close(); },
      () => { job.bitmapFailed = true; },
    );
  }

  private submitBitmap(job: LodJob): void {
    const { bitmap } = job;
    if (!bitmap) return;
    job.bitmap = undefined;
    const cells = this.cellsOf(job.record, bitmap.width, bitmap.height);
    const ticket = this.worker?.submit({ level: job.level, width: bitmap.width, height: bitmap.height, cells, source: { kind: "bitmap", bitmap } }) ?? null;
    if (ticket === null) { bitmap.close(); this.startFromPixels(job); return; }
    job.phase = "worker";
    job.ticket = ticket;
  }

  private startFromPixels(job: LodJob): void {
    const { record, level } = job;
    const pixels = this.readPixels(record.source.image);
    if (!pixels) throw new Error("lod-read-failed");
    const cells = this.cellsOf(record, pixels.width, pixels.height);
    const buffer = pixels.data instanceof Uint8ClampedArray && pixels.data.byteOffset === 0 && pixels.data.buffer instanceof ArrayBuffer
      && pixels.data.buffer.byteLength === pixels.data.length ? pixels.data.buffer : null;
    const ticket = this.worker?.available && buffer
      ? this.worker.submit({ level, width: pixels.width, height: pixels.height, cells, source: { kind: "pixels", data: buffer } })
      : null;
    if (ticket !== null && ticket !== undefined) { job.phase = "worker"; job.ticket = ticket; return; }
    job.phase = "thread";
    job.stages = this.build(record, level, pixels);
  }

  /**
   * 맨 앞 작업을 한 걸음 진행한다. 워커 작업은 결과가 올 때까지 기다리고(메인 스레드 비용 없음), 메인 스레드 작업은 시간 예산 안에서 돌린다.
   * 처음 쓰이는 칸을 기다리는 작업은 화면에 앨리어싱이 비치지 않도록 예산을 더 쓴다.
   */
  private pump(renderer: StudioLodRenderer, time: number): void {
    const job = this.jobs[0];
    if (!job) return;
    try {
      if (job.phase === "queued") this.start(job);
      if (job.phase === "preparing") {
        if (job.bitmapFailed) this.startFromPixels(job);
        else if (job.bitmap) this.submitBitmap(job);
        else return;
      }
      if (job.phase === "worker") {
        const taken = this.worker?.take(job.ticket ?? 0) ?? { status: "failed" as const };
        if (taken.status === "pending") return;
        if (taken.status === "done") {
          this.jobs.shift();
          this.finish(renderer, job, taken.image, time);
          return;
        }
        // 워커가 실패했다: 이 작업은 메인 스레드에서 다시 계산한다(전송한 버퍼는 이미 넘어갔으므로 픽셀을 다시 읽는다).
        job.phase = "thread";
        job.stages = this.build(job.record, job.level);
      }
      if (job.phase !== "thread" || !job.stages) return;
      const deadline = this.now() + (job.urgent ? FIRST_SIGHT_BUDGET_MS : RELAXED_BUDGET_MS);
      for (;;) {
        const step = job.stages.next();
        if (step.done) {
          this.jobs.shift();
          this.finish(renderer, job, step.value, time);
          return;
        }
        if (this.now() >= deadline) return;
      }
    } catch (error) {
      this.jobs.shift();
      this.failed.push({ key: job.record.key, reason: error instanceof Error ? error.message : "lod-failed" });
      this.ineligible.add(job.record.key);
      this.dropRecord(job.record);
    }
  }

  private finish(renderer: StudioLodRenderer, job: LodJob, image: StudioRgbaImage, time: number): void {
    const { record, level } = job;
    if (this.disposed || this.records.get(record.key) !== record || !renderer.createTexture2D) return;
    const { base } = record;
    // 사본은 이미 프리멀티플라이드라 업로드 때 다시 곱하지 않는다(pma=false).
    const wrapper = renderer.createTexture2D(0, base.minFilter, base.magFilter, base.wrapT, base.wrapS, base.format, image.data, image.width, image.height, false, false, false);
    const source: object = Object.create(record.source, { glTexture: { value: wrapper, enumerable: true, configurable: true } });
    record.copies.set(level, { wrapper, source, width: image.width, height: image.height, lastUsedAt: time });
    for (const [name, state] of record.frames) {
      if (state.desired !== level || state.applied === level) continue;
      this.setFrameLevel(record, name, level);
      state.applied = level;
    }
  }

  private releaseIdleCopies(time: number): void {
    const renderer = this.renderer();
    for (const record of this.records.values()) {
      for (const [level, copy] of record.copies) {
        let used = false;
        for (const state of record.frames.values()) if (state.applied === level || state.desired === level) { used = true; break; }
        if (used) { copy.lastUsedAt = time; continue; }
        if (time - copy.lastUsedAt < IDLE_COPY_MS) continue;
        try { renderer?.deleteTexture?.(copy.wrapper); } catch { /* 이미 내려간 GPU 자원 */ }
        record.copies.delete(level);
      }
    }
  }
}

/**
 * 월드 장면에 붙이는 런타임. 픽셀 아트 화풍(NEAREST)과 끔 스위치가 켜진 경우는 아무것도 하지 않는 껍데기를 돌려준다.
 * 개발 모드에서는 하네스(Playwright)가 화면 밀도별 사본 품질을 재도록 전역 핸들을 노출한다(__studioMotionTrace와 같은 방식).
 */
export function createStudioTextureLod(scene: StudioLodScene, options: { readonly pixelated: boolean }): StudioTextureLodRuntime {
  const runtime = new StudioTextureLodRuntime({ scene, enabled: !options.pixelated && !studioTextureLodDisabled() });
  if (import.meta.env.DEV) (globalThis as { __studioTextureLod?: StudioTextureLodRuntime }).__studioTextureLod = runtime;
  return runtime;
}
