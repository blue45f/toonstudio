/**
 * `/studio/canvas` 라이브 드로잉 포인터 루프와 물리 Foley 오디오(`studio-procedural-foley-audio`)·
 * 필압 감도 커브·Coalesced Pointer 샘플 추출을 연결하는 경량 브리지.
 * - `studio-procedural-foley-audio`는 첫 포인터 제스처 시점 동적 `import()`로 지연 로드한다.
 * - 브라우저 영속 키-값 저장소는 일절 사용하지 않는다.
 */
import type { StudioPaperTextureId } from "../vibrant-studio-fx/studio-paper-and-pigment-physics";
import { LIVE_FOLEY_BRIDGE_SYMBOL } from "./studio-foley-tool-gesture";
import { dispatchLiveNibVfxSample } from "./studio-live-nib-vfx-bridge";
import type {
  StudioFoleyAudioEngine,
  StudioFoleyAudioEngineOptions,
  StudioFoleyPresetId,
  StudioFoleySoundId,
  StudioFoleyTriggerResult,
} from "../vibrant-studio-fx/studio-procedural-foley-audio";

export type { StudioFoleyPresetId, StudioFoleySoundId, StudioPaperTextureId };
export type StudioPressureCurvePreset = "soft" | "standard" | "firm";

export const STUDIO_PRESSURE_CURVE_ORDER: readonly StudioPressureCurvePreset[] = Object.freeze(["standard", "soft", "firm"]);
export const STUDIO_PRESSURE_CURVE_GAMMA: Readonly<Record<StudioPressureCurvePreset, number>> =
  Object.freeze({ soft: 0.68, standard: 1.0, firm: 1.48 });
export const STUDIO_LIVE_FOLEY_PRESET_ORDER: readonly StudioFoleyPresetId[] = Object.freeze([
  "quiet-atelier", "lively-asmr", "silent-focus",
]);

export interface StudioFoleyBrushResolution {
  readonly soundId: StudioFoleySoundId;
  readonly paperTexture: StudioPaperTextureId;
}

export interface StudioLiveStrokeSampleInput {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
  readonly timestampMs?: number;
  readonly brushId?: string | null;
  readonly drawMode?: string | null;
  readonly paperTexture?: StudioPaperTextureId | null;
}

export interface StudioLiveFoleyState {
  readonly preset: StudioFoleyPresetId;
  readonly muted: boolean;
  readonly activeSoundId: StudioFoleySoundId | null;
  readonly activePaperTexture: StudioPaperTextureId;
}

export interface StudioCoalescedPointerSample {
  readonly clientX: number;
  readonly clientY: number;
  readonly pressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly timeStamp: number;
  readonly pointerType: string;
}

interface ProceduralFoleyModule {
  readonly createStudioFoleyAudioEngine: (options?: StudioFoleyAudioEngineOptions) => StudioFoleyAudioEngine;
}

export interface StudioLiveStrokeFoleyControllerOptions {
  readonly initialPreset?: StudioFoleyPresetId;
  readonly minMoveIntervalMs?: number;
  readonly minMoveDistancePx?: number;
  readonly nowMs?: () => number;
  readonly audioContextFactory?: () => AudioContext | null;
  readonly engineFactory?: (options: StudioFoleyAudioEngineOptions) => StudioFoleyAudioEngine;
  readonly moduleLoader?: () => Promise<ProceduralFoleyModule>;
}

const DEFAULT_MIN_MOVE_INTERVAL_MS = 36;
const DEFAULT_MIN_MOVE_DISTANCE_PX = 2.5;

const clamp01 = (v: unknown, fb = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fb;
const finiteOr = (v: unknown, fb: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fb;
const computeTilt01 = (tx?: number, ty?: number): number =>
  clamp01(Math.hypot(finiteOr(tx, 0), finiteOr(ty, 0)) / 70, 0);

function defaultCreateAudioContext(): AudioContext | null {
  if (typeof globalThis === "undefined") return null;
  const host = globalThis as typeof globalThis & { readonly webkitAudioContext?: typeof AudioContext };
  const Ctor = host.AudioContext ?? host.webkitAudioContext;
  if (typeof Ctor !== "function") return null;
  try { return new Ctor(); } catch { return null; }
}

/** 브러시 ID·드로잉 모드에서 물리 마찰음 모델과 기본 종이 결을 결정한다. */
export function resolveStudioFoleySoundForBrush(
  brushId?: string | null,
  drawMode?: string | null,
  paperTextureOverride?: StudioPaperTextureId | null,
): StudioFoleyBrushResolution {
  const normalized = (brushId ?? "").trim().toLowerCase();
  const mode = (drawMode ?? "").trim().toLowerCase();
  const pick = (soundId: StudioFoleySoundId, fallback: StudioPaperTextureId): StudioFoleyBrushResolution => ({
    soundId,
    paperTexture: paperTextureOverride ?? fallback,
  });

  if (mode === "eraser" || /(?:eraser|지우개)/u.test(normalized)) return pick("eraser-scrub", "manga-kent");
  if (/(?:airbrush|spray|mist|splatter|에어브러시|스프레이)/u.test(normalized)) return pick("airbrush", "smooth-bristol");
  if (/(?:marker|highlighter|felt-?tip|neon|마커|형광펜)/u.test(normalized)) return pick("alcohol-marker", "smooth-bristol");
  if (/(?:sumi|india-?ink|ink-?wash|ink-?brush|fude|calligraphy-?(?:brush|fude)|수묵|먹물|먹붓|캘리붓|캘리그래피-?붓|붓펜|서예)/u.test(normalized)) return pick("sumi-ink-brush", "cold-press-watercolor");
  if (/(?:watercolor|watery|(?:^|-)wc(?:-|$)|wash|수채)/u.test(normalized)) return pick("watercolor-sable", "cold-press-watercolor");
  if (/(?:crayon|charcoal|pastel|chalk|dry-?media|크레파스|크레용|목탄|파스텔|초크|분필)/u.test(normalized)) return pick("charcoal-pastel", "rough-cotton");
  if (/(?:pencil|graphite|연필|흑연)/u.test(normalized)) {
    return pick("graphite-pencil", /(?:color|6b|soft|grain|erodible|색연필)/u.test(normalized) ? "cold-press-watercolor" : "manga-kent");
  }
  if (/(?:oil|acrylic|impasto|bristle|knife|gouache|paint-?tube|유화|아크릴|과슈|나이프)/u.test(normalized)) {
    return pick("oil-impasto", "linen-canvas");
  }
  if (/(?:g-?pen|maru|calligraphy|liner|fountain|ballpoint|kabura|mapping|ink|pen|펜|잉크)/u.test(normalized)) {
    return pick("gpen-ink", "manga-kent");
  }
  return pick("gpen-ink", "manga-kent");
}

let activePressureCurvePreset: StudioPressureCurvePreset = "standard";
const pressureCurveListeners = new Set<(preset: StudioPressureCurvePreset) => void>();

/** 필압 감도 감마 커브(`soft` 0.68 / `standard` 1.0 / `firm` 1.48)를 단조 적용한다. */
export function applyStudioPressureCurve(
  pressure01: number,
  preset: StudioPressureCurvePreset = activePressureCurvePreset,
): number {
  const clamped = clamp01(pressure01, 0);
  if (clamped <= 0) return 0;
  if (clamped >= 1) return 1;
  return clamp01(clamped ** (STUDIO_PRESSURE_CURVE_GAMMA[preset] ?? 1.0), clamped);
}

export const getStudioPressureCurvePreset = (): StudioPressureCurvePreset => activePressureCurvePreset;
export const getStudioPressureCurveGamma = (preset: StudioPressureCurvePreset = activePressureCurvePreset): number =>
  STUDIO_PRESSURE_CURVE_GAMMA[preset] ?? 1.0;

export function setStudioPressureCurvePreset(preset: StudioPressureCurvePreset): StudioPressureCurvePreset {
  const next: StudioPressureCurvePreset =
    preset === "soft" || preset === "firm" || preset === "standard" ? preset : "standard";
  if (activePressureCurvePreset === next) return next;
  activePressureCurvePreset = next;
  for (const listener of [...pressureCurveListeners]) listener(next);
  return next;
}

export function cycleStudioPressureCurvePreset(): StudioPressureCurvePreset {
  const index = STUDIO_PRESSURE_CURVE_ORDER.indexOf(activePressureCurvePreset);
  return setStudioPressureCurvePreset(STUDIO_PRESSURE_CURVE_ORDER[(index + 1) % STUDIO_PRESSURE_CURVE_ORDER.length] ?? "standard");
}

export function subscribeStudioPressureCurve(listener: (preset: StudioPressureCurvePreset) => void): () => void {
  pressureCurveListeners.add(listener);
  return () => { pressureCurveListeners.delete(listener); };
}

/** `getCoalescedEvents?.()` 지원 브라우저에서 고속 포인터 중간 샘플을 누락 없이 추출한다. */
export function extractCoalescedPointerSamples(
  nativeEvent: Partial<PointerEvent> | null | undefined,
): readonly StudioCoalescedPointerSample[] {
  if (!nativeEvent) return [];
  let rawEvents: readonly Partial<PointerEvent>[] = [];
  if (typeof nativeEvent.getCoalescedEvents === "function") {
    try {
      const coalesced = nativeEvent.getCoalescedEvents();
      if (Array.isArray(coalesced) && coalesced.length > 0) rawEvents = coalesced;
    } catch { rawEvents = []; }
  }
  const source = rawEvents.length > 0 ? rawEvents : [nativeEvent];
  const fallbackTime = finiteOr(nativeEvent.timeStamp, 0);
  const fallbackType = typeof nativeEvent.pointerType === "string" ? nativeEvent.pointerType : "mouse";
  return source
    .filter((sample) => sample !== null && typeof sample === "object")
    .map((sample) => ({
      clientX: finiteOr(sample.clientX, finiteOr(nativeEvent.clientX, 0)),
      clientY: finiteOr(sample.clientY, finiteOr(nativeEvent.clientY, 0)),
      pressure: clamp01(sample.pressure, clamp01(nativeEvent.pressure, 0.5)),
      tiltX: finiteOr(sample.tiltX, finiteOr(nativeEvent.tiltX, 0)),
      tiltY: finiteOr(sample.tiltY, finiteOr(nativeEvent.tiltY, 0)),
      timeStamp: finiteOr(sample.timeStamp, fallbackTime),
      pointerType: typeof sample.pointerType === "string" ? sample.pointerType : fallbackType,
    }));
}

/** 실시간 포인터 스트로크를 물리 Foley 사운드(`StudioFoleyAudioEngine`)에 연결하는 컨트롤러. */
export class StudioLiveStrokeFoleyController {
  private readonly minMoveIntervalMs: number;
  private readonly minMoveDistancePx: number;
  private readonly nowMs: () => number;
  private readonly audioContextFactory: () => AudioContext | null;
  private readonly engineFactory?: (options: StudioFoleyAudioEngineOptions) => StudioFoleyAudioEngine;
  private readonly moduleLoader: () => Promise<ProceduralFoleyModule>;
  private readonly listeners = new Set<(state: StudioLiveFoleyState) => void>();

  private preset: StudioFoleyPresetId;
  private lastUnmutedPreset: Exclude<StudioFoleyPresetId, "silent-focus">;
  private muted: boolean;
  private activeSoundId: StudioFoleySoundId | null = null;
  private activePaperTexture: StudioPaperTextureId = "manga-kent";
  private engine: StudioFoleyAudioEngine | null = null;
  private engineLoadPromise: Promise<StudioFoleyAudioEngine | null> | null = null;
  private prewarmedContext: AudioContext | null = null;
  private disposed = false;
  private strokeActive = false;
  private lastX = 0;
  private lastY = 0;
  private lastTriggerMs = -Infinity;
  private latestClockMs: number | null = null;
  private accumulatedDistPx = 0;

  constructor(options: StudioLiveStrokeFoleyControllerOptions = {}) {
    this.minMoveIntervalMs = Math.max(0, options.minMoveIntervalMs ?? DEFAULT_MIN_MOVE_INTERVAL_MS);
    this.minMoveDistancePx = Math.max(0, options.minMoveDistancePx ?? DEFAULT_MIN_MOVE_DISTANCE_PX);
    this.nowMs = options.nowMs ?? (() => globalThis.performance?.now?.() ?? Date.now());
    this.audioContextFactory = options.audioContextFactory ?? defaultCreateAudioContext;
    this.engineFactory = options.engineFactory;
    this.moduleLoader = options.moduleLoader ?? (() => import("../vibrant-studio-fx/studio-procedural-foley-audio"));
    this.preset = options.initialPreset ?? "quiet-atelier";
    this.muted = this.preset === "silent-focus";
    this.lastUnmutedPreset = this.preset === "lively-asmr" ? "lively-asmr" : "quiet-atelier";
  }

  getState(): StudioLiveFoleyState {
    return Object.freeze({ preset: this.preset, muted: this.muted, activeSoundId: this.activeSoundId, activePaperTexture: this.activePaperTexture });
  }

  subscribe(listener: (state: StudioLiveFoleyState) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  setPreset(preset: StudioFoleyPresetId): StudioLiveFoleyState {
    const next: StudioFoleyPresetId = preset === "lively-asmr" || preset === "silent-focus" || preset === "quiet-atelier" ? preset : "quiet-atelier";
    this.preset = next;
    this.muted = next === "silent-focus";
    if (next !== "silent-focus") this.lastUnmutedPreset = next;
    this.engine?.applyPreset(next);
    const snapshot = this.getState();
    for (const listener of [...this.listeners]) listener(snapshot);
    return snapshot;
  }

  cyclePreset(): StudioLiveFoleyState {
    const index = STUDIO_LIVE_FOLEY_PRESET_ORDER.indexOf(this.preset);
    return this.setPreset(STUDIO_LIVE_FOLEY_PRESET_ORDER[(index + 1) % STUDIO_LIVE_FOLEY_PRESET_ORDER.length] ?? "quiet-atelier");
  }

  toggleMute(): StudioLiveFoleyState {
    return this.setPreset(this.muted || this.preset === "silent-focus" ? this.lastUnmutedPreset : "silent-focus");
  }

  onStrokeStart(input: StudioLiveStrokeSampleInput): StudioFoleyTriggerResult | null {
    if (this.disposed) return null;
    const resolution = resolveStudioFoleySoundForBrush(input.brushId, input.drawMode, input.paperTexture);
    this.activeSoundId = resolution.soundId;
    this.activePaperTexture = resolution.paperTexture;
    const now = finiteOr(input.timestampMs, this.nowMs());
    this.latestClockMs = now;
    this.strokeActive = true;
    this.lastX = finiteOr(input.x, 0);
    this.lastY = finiteOr(input.y, 0);
    this.lastTriggerMs = now;
    this.accumulatedDistPx = 0;
    dispatchLiveNibVfxSample({ x: this.lastX, y: this.lastY, phase: "down", pressure: clamp01(input.pressure, 0.5), tiltX: finiteOr(input.tiltX, 0), tiltY: finiteOr(input.tiltY, 0), brushId: input.brushId ?? undefined, drawMode: input.drawMode ?? undefined, timestampMs: now });
    if (this.muted || this.preset === "silent-focus") return null;

    const contactParams = {
      speed01: 0.16,
      pressure01: clamp01(applyStudioPressureCurve(clamp01(input.pressure, 0.48)) * 0.72 + 0.14, 0.42),
      tilt01: computeTilt01(input.tiltX, input.tiltY),
      paperTexture: resolution.paperTexture,
    };
    this.prewarmContextFromGesture();
    const ready = this.ensureEngineSyncOrLoad((loaded) => {
      if (this.disposed || this.muted || this.preset === "silent-focus") return;
      void loaded.unlock();
      loaded.triggerSound(resolution.soundId, contactParams);
    });
    if (!ready) return null;
    void ready.unlock();
    return ready.triggerSound(resolution.soundId, contactParams);
  }

  onStrokeMove(input: StudioLiveStrokeSampleInput): StudioFoleyTriggerResult | null {
    if (this.disposed) return null;
    const x = finiteOr(input.x, this.lastX);
    const y = finiteOr(input.y, this.lastY);
    const now = finiteOr(input.timestampMs, this.nowMs());
    this.latestClockMs = now;
    if (!this.strokeActive) {
      this.strokeActive = true;
      this.lastX = x;
      this.lastY = y;
      this.lastTriggerMs = now;
      this.accumulatedDistPx = 0;
      return null;
    }

    const stepDistPx = Math.hypot(x - this.lastX, y - this.lastY);
    this.accumulatedDistPx += stepDistPx;
    this.lastX = x;
    this.lastY = y;
    const dtMs = now - this.lastTriggerMs;
    dispatchLiveNibVfxSample({ x, y, phase: "move", pressure: clamp01(input.pressure, 0.52), tiltX: finiteOr(input.tiltX, 0), tiltY: finiteOr(input.tiltY, 0), speedPxPerMs: dtMs > 0 ? stepDistPx / Math.max(1, dtMs) : 0, brushId: input.brushId ?? undefined, drawMode: input.drawMode ?? undefined, timestampMs: now });
    if (this.muted || this.preset === "silent-focus") return null;
    if (dtMs < this.minMoveIntervalMs || this.accumulatedDistPx < this.minMoveDistancePx) return null;

    const resolution = resolveStudioFoleySoundForBrush(input.brushId, input.drawMode, input.paperTexture);
    this.activeSoundId = resolution.soundId;
    this.activePaperTexture = resolution.paperTexture;
    const speed01 = clamp01(Math.pow(clamp01((this.accumulatedDistPx / Math.max(1, dtMs)) / 2.2, 0), 0.78), 0.25);
    const pressure01 = clamp01(Math.max(0.18, applyStudioPressureCurve(clamp01(input.pressure, 0.52))), 0.5);
    this.lastTriggerMs = now;
    this.accumulatedDistPx = 0;

    const engine = this.ensureEngineSyncOrLoad();
    if (!engine) return null;
    return engine.triggerSound(resolution.soundId, {
      speed01, pressure01, tilt01: computeTilt01(input.tiltX, input.tiltY), paperTexture: resolution.paperTexture,
    });
  }

  onStrokeEnd(): void {
    if (this.strokeActive) dispatchLiveNibVfxSample({ x: this.lastX, y: this.lastY, phase: "up", timestampMs: this.latestClockMs ?? this.nowMs() });
    this.strokeActive = false;
    this.accumulatedDistPx = 0;
    this.lastTriggerMs = -Infinity;
    this.latestClockMs = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.onStrokeEnd();
    this.listeners.clear();
    this.engine?.dispose();
    this.engine = null;
    if (this.prewarmedContext && typeof this.prewarmedContext.close === "function") {
      void Promise.resolve(this.prewarmedContext.close()).catch(() => undefined);
    }
    this.prewarmedContext = null;
    this.engineLoadPromise = null;
  }

  prewarmContextFromGesture(): void {
    if (this.disposed || this.muted || this.engine || this.prewarmedContext) return;
    const ctx = this.audioContextFactory();
    if (!ctx) return;
    this.prewarmedContext = ctx;
    if (ctx.state === "suspended" && typeof ctx.resume === "function") void Promise.resolve(ctx.resume()).catch(() => undefined);
  }

  private buildEngineOptions(): StudioFoleyAudioEngineOptions {
    return {
      initialPreset: this.preset,
      minTriggerIntervalMs: Math.max(0, Math.min(20, this.minMoveIntervalMs)),
      nowMs: () => this.latestClockMs ?? this.nowMs(),
      audioContextFactory: () => {
        if (!this.prewarmedContext) return this.audioContextFactory();
        const ctx = this.prewarmedContext;
        this.prewarmedContext = null;
        return ctx;
      },
    };
  }

  private ensureEngineSyncOrLoad(onLoaded?: (engine: StudioFoleyAudioEngine) => void): StudioFoleyAudioEngine | null {
    if (this.disposed) return null;
    if (this.engine) return this.engine;
    if (this.engineFactory) {
      this.engine = this.engineFactory(this.buildEngineOptions());
      this.engine.applyPreset(this.preset);
      return this.engine;
    }
    if (!this.engineLoadPromise) {
      this.engineLoadPromise = this.moduleLoader()
        .then((mod) => {
          if (this.disposed) return null;
          const created = mod.createStudioFoleyAudioEngine(this.buildEngineOptions());
          created.applyPreset(this.preset);
          this.engine = created;
          return created;
        })
        .catch(() => null);
    }
    if (onLoaded) void this.engineLoadPromise.then((loaded) => { if (loaded && !this.disposed) onLoaded(loaded); });
    return null;
  }
}

export const studioLiveStrokeFoley = new StudioLiveStrokeFoleyController();
export const getStudioLiveStrokeFoleyController = (): StudioLiveStrokeFoleyController => studioLiveStrokeFoley;
export const getLiveFoleyState = (): StudioLiveFoleyState => studioLiveStrokeFoley.getState();
export const setLiveFoleyPreset = (preset: StudioFoleyPresetId): StudioLiveFoleyState => studioLiveStrokeFoley.setPreset(preset);
export const cycleLiveFoleyPreset = (): StudioLiveFoleyState => studioLiveStrokeFoley.cyclePreset();
export const toggleLiveFoleyMute = (): StudioLiveFoleyState => studioLiveStrokeFoley.toggleMute();
export const subscribeLiveFoleyState = (listener: (state: StudioLiveFoleyState) => void): (() => void) =>
  studioLiveStrokeFoley.subscribe(listener);

export interface StudioLiveStrokeFoleyBridgeRuntime {
  readonly studioLiveStrokeFoley: StudioLiveStrokeFoleyController;
  readonly getStudioPressureCurveGamma: typeof getStudioPressureCurveGamma;
  readonly applyStudioPressureCurve: typeof applyStudioPressureCurve;
  readonly extractCoalescedPointerSamples: typeof extractCoalescedPointerSamples;
}

if (typeof globalThis !== "undefined") {
  (globalThis as Record<PropertyKey, unknown>)[LIVE_FOLEY_BRIDGE_SYMBOL] = Object.freeze({
    studioLiveStrokeFoley, getStudioPressureCurveGamma, applyStudioPressureCurve, extractCoalescedPointerSamples,
  } satisfies StudioLiveStrokeFoleyBridgeRuntime);
}
