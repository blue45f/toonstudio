/**
 * 실시간 필기감 이펙트(Tactile Drawing Feel VFX) Zero-Allocation SoA 엔진.
 *
 * - 고정 크기 Float32Array/Uint8Array Struct-of-Arrays(SoA) 링 버퍼(최대 160개 활성 입자)로
 *   `ingestSample` / `step` 핫 패스에서 GC 할당 0 bytes를 유지한다.
 * - 6종 매체 물리 VFX 프로필(`dust-fleck`, `wax-crumb`, `capillary-soak-ring`,
 *   `impasto-ridge-glint`, `ink-snap-trail`, `eraser-shaving`)과 동적 틸트·필압 닙 커서 기하를 제공한다.
 * - `off` / `subtle` / `vivid` 3단계 강도, `prefers-reduced-motion` 자동 `off` 강등,
 *   라이브 뷰포트 전용 비출력(Non-Export, 0% 혼입)을 보장한다.
 */

export const MAX_NIB_VFX_PARTICLES = 160;
export const NIB_VFX_COLOR_SLOT_STROKE = 0;
export const NIB_VFX_COLOR_SLOT_ACCENT = 1;
export const NIB_VFX_COLOR_SLOT_HIGHLIGHT = 2;
export const NIB_VFX_COLOR_SLOT_ERASER = 3;
export const NIB_VFX_COLOR_SLOT_COOL = 4;

const STROKE_COLOR_PALETTE_SLOTS = 8;
const FRAME_STEP_MS = 1000 / 60;
const TAU = Math.PI * 2;
const INK_SNAP_MIN_SPEED_PX_PER_MS = 1.4;
const WATERCOLOR_SLOW_SPEED_PX_PER_MS = 0.58;

export type NibTactileVfxMode = "off" | "subtle" | "vivid";
export const NIB_TACTILE_VFX_MODES: readonly NibTactileVfxMode[] = Object.freeze(["off", "subtle", "vivid"]);

export interface NibTactileVfxModeMeta {
  readonly id: NibTactileVfxMode;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly countMultiplier: number;
  readonly opacityMultiplier: number;
  readonly sizeMultiplier: number;
}

export const NIB_TACTILE_VFX_MODE_META: Readonly<Record<NibTactileVfxMode, NibTactileVfxModeMeta>> = Object.freeze({
  off: Object.freeze({ id: "off", labelKo: "꺼짐", labelEn: "Off", countMultiplier: 0, opacityMultiplier: 0, sizeMultiplier: 0 }),
  subtle: Object.freeze({ id: "subtle", labelKo: "은은함", labelEn: "Subtle", countMultiplier: 1, opacityMultiplier: 0.72, sizeMultiplier: 0.92 }),
  vivid: Object.freeze({ id: "vivid", labelKo: "생생함", labelEn: "Vivid", countMultiplier: 1.55, opacityMultiplier: 1, sizeMultiplier: 1.18 }),
});

export const NON_EXPORT_OVERLAY_POLICY = Object.freeze({
  nonExportOnly: true as const,
  exportMixRatio: 0 as const,
  layerTarget: "live-viewport-overlay-only" as const,
});

export type NibVfxProfileId = "graphite-pencil" | "crayon" | "watercolor" | "oil" | "gpen" | "eraser";
export type NibVfxParticleKind =
  | "dust-fleck" | "wax-crumb" | "capillary-soak-ring"
  | "impasto-ridge-glint" | "ink-snap-trail" | "eraser-shaving";
export type NibVfxColorChannel = "stroke" | "accent" | "highlight" | "eraser" | "cool";
export type NibVfxPointerPhase = "down" | "move" | "up" | "hover" | "cancel";

export const NIB_VFX_KIND_CODE = Object.freeze({
  "dust-fleck": 0,
  "wax-crumb": 1,
  "capillary-soak-ring": 2,
  "impasto-ridge-glint": 3,
  "ink-snap-trail": 4,
  "eraser-shaving": 5,
} as const);

export interface NibVfxProfileSpec {
  readonly id: NibVfxProfileId;
  readonly kind: NibVfxParticleKind;
  readonly kindCode: number;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly drag: number;
  readonly minLifeMs: number;
  readonly maxLifeMs: number;
  readonly minSpeedPxPerMs: number;
  readonly minSpawnPerSample: number;
  readonly maxSpawnPerSample: number;
  readonly gravityPxPerMs2: number;
  readonly colorChannel: NibVfxColorChannel;
}

export const NIB_VFX_PROFILES: Readonly<Record<NibVfxProfileId, NibVfxProfileSpec>> = Object.freeze({
  "graphite-pencil": Object.freeze({
    id: "graphite-pencil", kind: "dust-fleck", kindCode: NIB_VFX_KIND_CODE["dust-fleck"],
    labelKo: "흑연·목탄 가루", labelEn: "Graphite & Charcoal Dust",
    drag: 0.86, minLifeMs: 180, maxLifeMs: 260, minSpeedPxPerMs: 0.04,
    minSpawnPerSample: 2, maxSpawnPerSample: 5, gravityPxPerMs2: 0.00004, colorChannel: "stroke",
  }),
  crayon: Object.freeze({
    id: "crayon", kind: "wax-crumb", kindCode: NIB_VFX_KIND_CODE["wax-crumb"],
    labelKo: "왁스 크레파스 부스러기", labelEn: "Wax Crayon Crumbs",
    drag: 0.84, minLifeMs: 220, maxLifeMs: 360, minSpeedPxPerMs: 0.05,
    minSpawnPerSample: 2, maxSpawnPerSample: 4, gravityPxPerMs2: 0.00009, colorChannel: "stroke",
  }),
  watercolor: Object.freeze({
    id: "watercolor", kind: "capillary-soak-ring", kindCode: NIB_VFX_KIND_CODE["capillary-soak-ring"],
    labelKo: "수채 모세관 번짐 링", labelEn: "Capillary Soak Ring",
    drag: 0.92, minLifeMs: 260, maxLifeMs: 260, minSpeedPxPerMs: 0,
    minSpawnPerSample: 1, maxSpawnPerSample: 3, gravityPxPerMs2: 0, colorChannel: "cool",
  }),
  oil: Object.freeze({
    id: "oil", kind: "impasto-ridge-glint", kindCode: NIB_VFX_KIND_CODE["impasto-ridge-glint"],
    labelKo: "유화 브리스틀·능선 광택", labelEn: "Impasto Ridge Glint",
    drag: 0.9, minLifeMs: 190, maxLifeMs: 280, minSpeedPxPerMs: 0.06,
    minSpawnPerSample: 2, maxSpawnPerSample: 3, gravityPxPerMs2: 0, colorChannel: "highlight",
  }),
  gpen: Object.freeze({
    id: "gpen", kind: "ink-snap-trail", kindCode: NIB_VFX_KIND_CODE["ink-snap-trail"],
    labelKo: "잉크 탄성 테일", labelEn: "Ink Elastic Snap Trail",
    drag: 0.89, minLifeMs: 130, maxLifeMs: 210, minSpeedPxPerMs: INK_SNAP_MIN_SPEED_PX_PER_MS,
    minSpawnPerSample: 2, maxSpawnPerSample: 3, gravityPxPerMs2: 0, colorChannel: "accent",
  }),
  eraser: Object.freeze({
    id: "eraser", kind: "eraser-shaving", kindCode: NIB_VFX_KIND_CODE["eraser-shaving"],
    labelKo: "지우개 고무 가루", labelEn: "Eraser Rubber Shavings",
    drag: 0.88, minLifeMs: 220, maxLifeMs: 340, minSpeedPxPerMs: 0.05,
    minSpawnPerSample: 2, maxSpawnPerSample: 4, gravityPxPerMs2: 0.00032, colorChannel: "eraser",
  }),
});

export interface NibVfxPointerSample {
  readonly x: number;
  readonly y: number;
  readonly phase: NibVfxPointerPhase;
  readonly pressure?: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
  readonly brushSizePx?: number;
  readonly brushId?: string;
  readonly drawMode?: string;
  readonly timestampMs?: number;
  readonly speedPxPerMs?: number;
  readonly strokeColor?: string;
  readonly strokeRgb?: readonly [number, number, number];
  readonly zoomScale?: number;
}

export interface DynamicNibCursorInput {
  readonly x: number;
  readonly y: number;
  readonly brushSizePx?: number;
  readonly pressure?: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
  readonly headingRad?: number;
  readonly profileId?: NibVfxProfileId;
  readonly zoomScale?: number;
}

export interface DynamicNibCursorGeometry {
  readonly x: number;
  readonly y: number;
  readonly majorRadiusPx: number;
  readonly minorRadiusPx: number;
  readonly rotationRad: number;
  readonly headingRad: number;
  readonly tiltMagnitudeDeg: number;
  readonly tilt01: number;
  readonly pressure01: number;
  readonly isTilted: boolean;
  readonly indicatorStartX: number;
  readonly indicatorStartY: number;
  readonly indicatorTipX: number;
  readonly indicatorTipY: number;
}

export interface NibVfxPoolBuffers {
  readonly capacity: number;
  readonly active: Uint8Array;
  readonly kind: Uint8Array;
  readonly subKind: Uint8Array;
  readonly colorSlot: Uint8Array;
  readonly strokePaletteIndex: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly size: Float32Array;
  readonly endSize: Float32Array;
  readonly ageMs: Float32Array;
  readonly lifeMs: Float32Array;
  readonly angle: Float32Array;
  readonly spin: Float32Array;
  readonly drag: Float32Array;
  readonly gravity: Float32Array;
  readonly alpha: Float32Array;
}

function clampFinite(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return value < min ? min : value > max ? max : value;
}

function formatRgbAsCssColor4(rRaw: number, gRaw: number, bRaw: number): string {
  const scale = rRaw > 1 || gRaw > 1 || bRaw > 1 ? 1 / 255 : 1;
  const r = clampFinite(rRaw * scale, 0, 1, 0);
  const g = clampFinite(gRaw * scale, 0, 1, 0);
  const b = clampFinite(bRaw * scale, 0, 1, 0);
  return `color(srgb ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)})`;
}

export function resolveEffectiveNibVfxMode(
  requestedMode: NibTactileVfxMode,
  prefersReducedMotion: boolean,
): NibTactileVfxMode {
  return prefersReducedMotion ? "off" : requestedMode;
}

export function cycleNibTactileVfxMode(current: NibTactileVfxMode): NibTactileVfxMode {
  return current === "subtle" ? "vivid" : current === "vivid" ? "off" : "subtle";
}

/** 브러시 식별자·드로잉 모드에서 6종 매체 필기감 VFX 프로필을 결정한다. */
export function resolveNibVfxProfile(brushId?: string, drawMode?: string): NibVfxProfileSpec {
  const modeToken = (drawMode ?? "").trim().toLowerCase();
  const token = (brushId ?? "").trim().toLowerCase();
  if (modeToken === "eraser" || /(?:eraser|rubber|kneaded|vinyl|지우개)/u.test(token)) return NIB_VFX_PROFILES.eraser;
  if (/(?:crayon|oil[-_\s]?pastel|craypas|wax|크레파스|크레용|오일파스텔)/u.test(token)) return NIB_VFX_PROFILES.crayon;
  if (/(?:graphite|pencil|charcoal|pastel|chalk|conte|연필|목탄|파스텔)/u.test(token)) return NIB_VFX_PROFILES["graphite-pencil"];
  if (/(?:watercolor|water[-_\s]?color|wash|sumi|aquarelle|gouache|수채|먹|워시)/u.test(token)) return NIB_VFX_PROFILES.watercolor;
  if (/(?:oil|acrylic|impasto|bristle|knife|tempera|유화|아크릴|임파스토)/u.test(token)) return NIB_VFX_PROFILES.oil;
  if (/(?:g[-_\s]?pen|ink|calligraphy|maru|kabura|saji|fountain|liner|pen|펜|잉크|캘리)/u.test(token)) return NIB_VFX_PROFILES.gpen;
  return NIB_VFX_PROFILES.gpen;
}

/**
 * 닙 커서 기하를 Float32Array(13) 버퍼에 무할당으로 기록한다.
 * `[active, x, y, majorR, minorR, rotRad, isTilted, indStartX, indStartY, indTipX, indTipY, tiltMagDeg, pressure01]`
 */
function writeCursorGeometryBuffer(
  out: Float32Array, xRaw: number, yRaw: number, brushSizeRaw: number | undefined,
  zoomRaw: number | undefined, pressureRaw: number | undefined, tiltXRaw: number | undefined,
  tiltYRaw: number | undefined, headingRaw: number | undefined, profileId: NibVfxProfileId | undefined,
): void {
  const x = clampFinite(xRaw, -100000, 100000, 0);
  const y = clampFinite(yRaw, -100000, 100000, 0);
  const baseRadius = Math.max(2, clampFinite(brushSizeRaw, 1, 512, 12) * clampFinite(zoomRaw, 0.1, 16, 1) * 0.5);
  const pressure01 = clampFinite(pressureRaw, 0, 1, 0.5);
  const tiltX = clampFinite(tiltXRaw, -85, 85, 0);
  const tiltY = clampFinite(tiltYRaw, -85, 85, 0);
  const headingRad = clampFinite(headingRaw, -TAU * 4, TAU * 4, 0);
  const tiltMag = Math.min(85, Math.hypot(tiltX, tiltY));
  const tilt01 = tiltMag / 85;
  const isTilted = tiltMag > 6;
  const azim = tiltMag > 1 ? Math.atan2(tiltY, tiltX) : headingRad;
  const pScale = 0.55 + pressure01 * 0.65;
  const wideMedia = profileId === "graphite-pencil" || profileId === "crayon";
  const major = baseRadius * pScale * (1 + tilt01 * (wideMedia ? 0.95 : 0.65));
  const minor = Math.max(1.5, baseRadius * pScale * (1 - tilt01 * 0.35));
  const indAngle = isTilted ? azim : headingRad;
  const cosA = Math.cos(indAngle);
  const sinA = Math.sin(indAngle);
  const indLen = Math.max(5, Math.min(18, baseRadius * 0.45));
  const startOff = major + 2;
  out[0] = 1; out[1] = x; out[2] = y; out[3] = major; out[4] = minor;
  out[5] = tiltMag > 1 ? azim : headingRad; out[6] = isTilted ? 1 : 0;
  out[7] = x + cosA * startOff; out[8] = y + sinA * startOff;
  out[9] = x + cosA * (startOff + indLen); out[10] = y + sinA * (startOff + indLen);
  out[11] = tiltMag; out[12] = pressure01;
}

const SCRATCH_CURSOR_GEOMETRY = new Float32Array(13);

/** 기울기(tiltX/tiltY)·필압·진행 방향을 반영한 동적 닙 커서 타원 및 방향 지시선을 계산한다. */
export function computeDynamicNibCursorGeometry(input: DynamicNibCursorInput): DynamicNibCursorGeometry {
  const headingRad = clampFinite(input.headingRad, -TAU * 4, TAU * 4, 0);
  writeCursorGeometryBuffer(
    SCRATCH_CURSOR_GEOMETRY, input.x, input.y, input.brushSizePx, input.zoomScale,
    input.pressure, input.tiltX, input.tiltY, headingRad, input.profileId,
  );
  const c = SCRATCH_CURSOR_GEOMETRY;
  const tiltMagnitudeDeg = c[11];
  return {
    x: c[1], y: c[2], majorRadiusPx: c[3], minorRadiusPx: c[4],
    rotationRad: c[5], headingRad, tiltMagnitudeDeg, tilt01: tiltMagnitudeDeg / 85,
    pressure01: c[12], isTilted: c[6] === 1,
    indicatorStartX: c[7], indicatorStartY: c[8], indicatorTipX: c[9], indicatorTipY: c[10],
  };
}

/** 고정 풀 SoA 링 버퍼 기반 Zero-Allocation 실시간 필기감 파티클·리플 엔진. */
export class NibTactileVfxEngine {
  readonly capacity: number;
  readonly buffers: NibVfxPoolBuffers;
  readonly cursorState = new Float32Array(13);

  private mode: NibTactileVfxMode = "subtle";
  private prefersReducedMotion = false;
  private writeIndex = 0;
  private activeParticleCount = 0;
  private totalSpawnedParticles = 0;
  private overwrittenSlots = 0;
  private rngState: number;
  private hasLastStrokePoint = false;
  private lastX = 0;
  private lastY = 0;
  private lastTimestampMs = 0;
  private lastHeadingRad = 0;
  private lastWatercolorRingMs = -1000;

  private readonly strokePalette: string[];
  private strokePaletteCursor = 0;
  private lastRawStrokeColor = "";
  private lastStrokeRgb0 = -1;
  private lastStrokeRgb1 = -1;
  private lastStrokeRgb2 = -1;
  private lastStrokePaletteIdx = 0;

  constructor(capacity = MAX_NIB_VFX_PARTICLES, seed = 0x51a7c391) {
    const cap = Math.max(16, Math.min(MAX_NIB_VFX_PARTICLES, Math.floor(capacity)));
    this.capacity = cap;
    this.rngState = seed >>> 0 || 1;
    this.strokePalette = new Array<string>(STROKE_COLOR_PALETTE_SLOTS).fill("CanvasText");
    this.buffers = {
      capacity: cap,
      active: new Uint8Array(cap), kind: new Uint8Array(cap), subKind: new Uint8Array(cap),
      colorSlot: new Uint8Array(cap), strokePaletteIndex: new Uint8Array(cap),
      x: new Float32Array(cap), y: new Float32Array(cap), vx: new Float32Array(cap), vy: new Float32Array(cap),
      size: new Float32Array(cap), endSize: new Float32Array(cap), ageMs: new Float32Array(cap),
      lifeMs: new Float32Array(cap), angle: new Float32Array(cap), spin: new Float32Array(cap),
      drag: new Float32Array(cap), gravity: new Float32Array(cap), alpha: new Float32Array(cap),
    };
  }

  get activeCount(): number { return this.activeParticleCount; }
  get totalSpawned(): number { return this.totalSpawnedParticles; }
  get overwriteCount(): number { return this.overwrittenSlots; }
  get requestedMode(): NibTactileVfxMode { return this.mode; }
  get reducedMotion(): boolean { return this.prefersReducedMotion; }
  get effectiveMode(): NibTactileVfxMode { return resolveEffectiveNibVfxMode(this.mode, this.prefersReducedMotion); }
  hasVisibleCursor(): boolean { return this.cursorState[0] === 1; }
  getStrokePaletteEntry(index: number): string { return this.strokePalette[index % STROKE_COLOR_PALETTE_SLOTS] ?? "CanvasText"; }

  setMode(mode: NibTactileVfxMode): void {
    this.mode = mode;
    if (this.effectiveMode === "off") this.clearParticles();
  }

  setPrefersReducedMotion(reduced: boolean): void {
    this.prefersReducedMotion = reduced;
    if (reduced) this.clearParticles();
  }

  clearParticles(): void {
    this.buffers.active.fill(0);
    this.activeParticleCount = 0;
    this.writeIndex = 0;
  }

  clear(): void {
    this.clearParticles();
    this.hasLastStrokePoint = false;
    this.cursorState[0] = 0;
  }

  private nextRandom01(): number {
    let x = this.rngState;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.rngState = x >>> 0 || 1;
    return this.rngState / 4294967296;
  }

  private resolveStrokePaletteIndex(sample: NibVfxPointerSample): number {
    let cssColor = "";
    if (typeof sample.strokeColor === "string" && sample.strokeColor.length > 0) {
      if (sample.strokeColor === this.lastRawStrokeColor) return this.lastStrokePaletteIdx;
      cssColor = sample.strokeColor.trim();
    } else if (sample.strokeRgb && sample.strokeRgb.length === 3) {
      const [r, g, b] = sample.strokeRgb;
      if (r === this.lastStrokeRgb0 && g === this.lastStrokeRgb1 && b === this.lastStrokeRgb2) return this.lastStrokePaletteIdx;
      this.lastStrokeRgb0 = r; this.lastStrokeRgb1 = g; this.lastStrokeRgb2 = b;
      cssColor = formatRgbAsCssColor4(r, g, b);
    }
    if (!cssColor || cssColor === this.lastRawStrokeColor) return this.lastStrokePaletteIdx;
    for (let i = 0; i < STROKE_COLOR_PALETTE_SLOTS; i += 1) {
      if (this.strokePalette[i] === cssColor) {
        this.lastRawStrokeColor = cssColor;
        this.lastStrokePaletteIdx = i;
        return i;
      }
    }
    const idx = this.strokePaletteCursor;
    this.strokePaletteCursor = (this.strokePaletteCursor + 1) % STROKE_COLOR_PALETTE_SLOTS;
    this.strokePalette[idx] = cssColor;
    this.lastRawStrokeColor = cssColor;
    this.lastStrokePaletteIdx = idx;
    return idx;
  }

  private allocParticle(
    kindCode: number, subKind: number, colorSlot: number, strokePaletteIndex: number,
    x: number, y: number, vx: number, vy: number,
    size: number, endSize: number, lifeMs: number, angle: number,
    spin: number, drag: number, gravity: number, alpha: number,
  ): void {
    const idx = this.writeIndex;
    this.writeIndex = (idx + 1) % this.capacity;
    const b = this.buffers;
    if (b.active[idx] === 1) this.overwrittenSlots += 1;
    else { b.active[idx] = 1; this.activeParticleCount += 1; }
    b.kind[idx] = kindCode; b.subKind[idx] = subKind;
    b.colorSlot[idx] = colorSlot; b.strokePaletteIndex[idx] = strokePaletteIndex;
    b.x[idx] = x; b.y[idx] = y; b.vx[idx] = vx; b.vy[idx] = vy;
    b.size[idx] = size; b.endSize[idx] = endSize; b.ageMs[idx] = 0; b.lifeMs[idx] = lifeMs;
    b.angle[idx] = angle; b.spin[idx] = spin; b.drag[idx] = drag; b.gravity[idx] = gravity; b.alpha[idx] = alpha;
    this.totalSpawnedParticles += 1;
  }

  /** 포인터 샘플 1건을 처리해 매체별 필기감 입자를 고정 SoA 버퍼에 기록한다. */
  ingestSample(sample: NibVfxPointerSample): number {
    const profile = resolveNibVfxProfile(sample.brushId, sample.drawMode);
    const x = clampFinite(sample.x, -100000, 100000, 0);
    const y = clampFinite(sample.y, -100000, 100000, 0);
    const nowMs = clampFinite(sample.timestampMs, 0, 1e15, this.lastTimestampMs + 16);
    const pressure01 = clampFinite(sample.pressure, 0, 1, 0.5);
    const tilt01 = Math.min(1, Math.hypot(clampFinite(sample.tiltX, -85, 85, 0), clampFinite(sample.tiltY, -85, 85, 0)) / 85);
    const brushSizePx = clampFinite(sample.brushSizePx, 1, 256, 12);

    let speedPxPerMs = 0;
    if (this.hasLastStrokePoint && (sample.phase === "move" || sample.phase === "up")) {
      const dx = x - this.lastX;
      const dy = y - this.lastY;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.25) this.lastHeadingRad = Math.atan2(dy, dx);
      speedPxPerMs = dist / Math.max(1, nowMs - this.lastTimestampMs);
    }
    if (typeof sample.speedPxPerMs === "number" && Number.isFinite(sample.speedPxPerMs)) {
      speedPxPerMs = Math.max(0, sample.speedPxPerMs);
    }

    if (sample.phase === "cancel") this.cursorState[0] = 0;
    else {
      writeCursorGeometryBuffer(
        this.cursorState, x, y, brushSizePx, sample.zoomScale,
        pressure01, sample.tiltX, sample.tiltY, this.lastHeadingRad, profile.id,
      );
    }

    const prevHasPoint = this.hasLastStrokePoint;
    if (sample.phase === "down" || sample.phase === "move") {
      this.hasLastStrokePoint = true; this.lastX = x; this.lastY = y; this.lastTimestampMs = nowMs;
    } else if (sample.phase === "up" || sample.phase === "cancel") {
      this.hasLastStrokePoint = false; this.lastTimestampMs = nowMs;
    }

    const activeMode = this.effectiveMode;
    if (activeMode === "off" || sample.phase === "hover" || sample.phase === "cancel") return 0;

    const modeMeta = NIB_TACTILE_VFX_MODE_META[activeMode];
    const hasColor = (typeof sample.strokeColor === "string" && sample.strokeColor.length > 0) || Boolean(sample.strokeRgb);
    const strokeIdx = this.resolveStrokePaletteIndex(sample);
    const strokeSlot = hasColor ? NIB_VFX_COLOR_SLOT_STROKE : NIB_VFX_COLOR_SLOT_ACCENT;
    const heading = this.lastHeadingRad;
    const normal = heading + Math.PI * 0.5;
    let spawned = 0;

    if (profile.id === "graphite-pencil") {
      if ((sample.phase !== "move" && sample.phase !== "down") || (sample.phase === "move" && prevHasPoint && speedPxPerMs < profile.minSpeedPxPerMs)) return 0;
      const energy = clampFinite(pressure01 * 0.5 + Math.min(1, speedPxPerMs * 0.5) * 0.3 + tilt01 * 0.35, 0, 1, 0.4);
      const count = Math.max(2, Math.min(5, Math.round((2 + energy * 2.2) * modeMeta.countMultiplier)));
      const spread = Math.max(2.5, brushSizePx * (0.35 + tilt01 * 0.55));
      for (let i = 0; i < count; i += 1) {
        const perp = (this.nextRandom01() - 0.5) * spread * 2;
        const along = (this.nextRandom01() - 0.5) * spread;
        const scatter = heading + Math.PI + (this.nextRandom01() - 0.5) * 1.9;
        const vel = (0.018 + this.nextRandom01() * 0.055) * (0.6 + speedPxPerMs * 0.45);
        const life = profile.minLifeMs + this.nextRandom01() * (profile.maxLifeMs - profile.minLifeMs);
        const r = (0.85 + this.nextRandom01() * 1.45) * modeMeta.sizeMultiplier;
        this.allocParticle(
          profile.kindCode, 0, strokeSlot, strokeIdx,
          x + Math.cos(normal) * perp + Math.cos(heading) * along, y + Math.sin(normal) * perp + Math.sin(heading) * along,
          Math.cos(scatter) * vel, Math.sin(scatter) * vel,
          r, r * 0.5, life, this.nextRandom01() * TAU, (this.nextRandom01() - 0.5) * 0.008,
          profile.drag, profile.gravityPxPerMs2, (0.36 + pressure01 * 0.42) * modeMeta.opacityMultiplier,
        );
        spawned += 1;
      }
      return spawned;
    }

    if (profile.id === "crayon") {
      if (sample.phase !== "move" || (prevHasPoint && speedPxPerMs < profile.minSpeedPxPerMs)) return 0;
      const count = Math.max(2, Math.min(4, Math.round((2 + pressure01 * 1.6) * modeMeta.countMultiplier)));
      for (let i = 0; i < count; i += 1) {
        const side = i % 2 === 0 ? 1 : -1;
        const eject = normal + (side < 0 ? Math.PI : 0) + (this.nextRandom01() - 0.5) * 0.32;
        const edge = Math.max(2, brushSizePx * 0.42) * side;
        const vel = (0.045 + this.nextRandom01() * 0.065) * (0.7 + pressure01 * 0.6);
        const life = profile.minLifeMs + this.nextRandom01() * (profile.maxLifeMs - profile.minLifeMs);
        const r = (1.5 + this.nextRandom01() * 1.9) * modeMeta.sizeMultiplier;
        this.allocParticle(
          profile.kindCode, 0, strokeSlot, strokeIdx,
          x + Math.cos(normal) * edge, y + Math.sin(normal) * edge,
          Math.cos(eject) * vel, Math.sin(eject) * vel,
          r, r * 0.85, life, this.nextRandom01() * TAU, (this.nextRandom01() - 0.5) * 0.012,
          profile.drag, profile.gravityPxPerMs2, (0.5 + pressure01 * 0.38) * modeMeta.opacityMultiplier,
        );
        spawned += 1;
      }
      return spawned;
    }

    if (profile.id === "watercolor") {
      const isTrigger = sample.phase === "down" || sample.phase === "up"
        || (sample.phase === "move" && speedPxPerMs <= WATERCOLOR_SLOW_SPEED_PX_PER_MS);
      if (!isTrigger) return 0;
      if (sample.phase === "move" && nowMs >= this.lastWatercolorRingMs && nowMs - this.lastWatercolorRingMs < 55) return 0;
      this.lastWatercolorRingMs = nowMs;
      const startR = Math.max(3, brushSizePx * 0.34) * modeMeta.sizeMultiplier;
      const endR = startR + (10 + pressure01 * 14) * modeMeta.sizeMultiplier;
      const ringSlot = hasColor ? NIB_VFX_COLOR_SLOT_STROKE : NIB_VFX_COLOR_SLOT_COOL;
      this.allocParticle(
        profile.kindCode, 0, ringSlot, strokeIdx, x, y, 0, 0,
        startR, endR, 260, heading, 0, profile.drag, 0, (0.34 + pressure01 * 0.3) * modeMeta.opacityMultiplier,
      );
      spawned += 1;
      const mistCount = activeMode === "vivid" ? 3 : 2;
      for (let i = 0; i < mistCount; i += 1) {
        const ang = this.nextRandom01() * TAU;
        const dist = startR * (0.7 + this.nextRandom01() * 0.6);
        const vel = 0.012 + this.nextRandom01() * 0.022;
        this.allocParticle(
          profile.kindCode, 1, ringSlot, strokeIdx,
          x + Math.cos(ang) * dist, y + Math.sin(ang) * dist, Math.cos(ang) * vel, Math.sin(ang) * vel,
          (1.2 + this.nextRandom01() * 1.3) * modeMeta.sizeMultiplier, 0.8,
          220 + this.nextRandom01() * 60, ang, 0, 0.93, 0, 0.28 * modeMeta.opacityMultiplier,
        );
        spawned += 1;
      }
      return spawned;
    }

    if (profile.id === "oil") {
      if ((sample.phase !== "move" && sample.phase !== "down") || (sample.phase === "move" && prevHasPoint && speedPxPerMs < profile.minSpeedPxPerMs)) return 0;
      const ridgeOffset = Math.max(2, brushSizePx * 0.36);
      const life = profile.minLifeMs + this.nextRandom01() * (profile.maxLifeMs - profile.minLifeMs);
      const ribbonLen = Math.max(6, brushSizePx * 0.65) * modeMeta.sizeMultiplier;
      this.allocParticle(
        profile.kindCode, 1, strokeSlot, strokeIdx,
        x, y, Math.cos(heading) * 0.012, Math.sin(heading) * 0.012,
        ribbonLen, Math.max(3, brushSizePx * 0.45), life, heading, 0,
        profile.drag, 0, (0.32 + pressure01 * 0.28) * modeMeta.opacityMultiplier,
      );
      this.allocParticle(
        profile.kindCode, 0, NIB_VFX_COLOR_SLOT_HIGHLIGHT, strokeIdx,
        x + Math.cos(normal) * ridgeOffset, y + Math.sin(normal) * ridgeOffset,
        Math.cos(heading) * 0.018, Math.sin(heading) * 0.018,
        ribbonLen * 0.72, Math.max(1.8, brushSizePx * 0.14), life * 0.9, heading, 0,
        profile.drag, 0, (0.45 + pressure01 * 0.35) * modeMeta.opacityMultiplier,
      );
      return 2;
    }

    if (profile.id === "gpen") {
      if (sample.phase !== "move" || speedPxPerMs <= INK_SNAP_MIN_SPEED_PX_PER_MS) return 0;
      const speedBoost = Math.min(2.2, (speedPxPerMs - INK_SNAP_MIN_SPEED_PX_PER_MS) * 0.7 + 0.8);
      const tailLen = Math.min(34, (10 + speedPxPerMs * 6.5) * modeMeta.sizeMultiplier);
      const life = profile.minLifeMs + this.nextRandom01() * (profile.maxLifeMs - profile.minLifeMs);
      this.allocParticle(
        profile.kindCode, 0, strokeSlot, strokeIdx,
        x, y, -Math.cos(heading) * 0.045 * speedBoost, -Math.sin(heading) * 0.045 * speedBoost,
        tailLen, Math.max(1.4, brushSizePx * 0.16), life, heading, 0,
        profile.drag, 0, Math.min(0.9, (0.42 + speedBoost * 0.2) * modeMeta.opacityMultiplier),
      );
      this.allocParticle(
        profile.kindCode, 1, NIB_VFX_COLOR_SLOT_ACCENT, strokeIdx,
        x, y, Math.cos(heading) * 0.025, Math.sin(heading) * 0.025,
        (2.4 + speedBoost * 1.4) * modeMeta.sizeMultiplier, 0.8, life * 0.78, heading, 0.01,
        0.87, 0, Math.min(0.95, 0.56 * modeMeta.opacityMultiplier),
      );
      return 2;
    }

    if ((sample.phase !== "move" && sample.phase !== "up") || (sample.phase === "move" && prevHasPoint && speedPxPerMs < profile.minSpeedPxPerMs)) return 0;
    const shavingCount = Math.max(2, Math.min(4, Math.round((2 + pressure01 * 1.4) * modeMeta.countMultiplier)));
    for (let i = 0; i < shavingCount; i += 1) {
      const side = i % 2 === 0 ? 1 : -1;
      const eject = normal + (side < 0 ? Math.PI : 0) + (this.nextRandom01() - 0.5) * 0.7;
      const vel = 0.032 + this.nextRandom01() * 0.05;
      const life = profile.minLifeMs + this.nextRandom01() * (profile.maxLifeMs - profile.minLifeMs);
      const curlR = (2.1 + this.nextRandom01() * 1.9) * modeMeta.sizeMultiplier;
      this.allocParticle(
        profile.kindCode, 0, NIB_VFX_COLOR_SLOT_ERASER, strokeIdx,
        x + Math.cos(eject) * 3, y + Math.sin(eject) * 3, Math.cos(eject) * vel, Math.sin(eject) * vel - 0.025,
        curlR, curlR * 0.9, life, this.nextRandom01() * TAU, side * (0.012 + this.nextRandom01() * 0.014),
        profile.drag, profile.gravityPxPerMs2, (0.48 + pressure01 * 0.34) * modeMeta.opacityMultiplier,
      );
      spawned += 1;
    }
    return spawned;
  }

  /** 고정 SoA 버퍼를 `dtMs`만큼 적분하고 남은 활성 입자 수를 반환한다(0이면 rAF 즉시 정지). */
  step(dtMs: number): number {
    if (!Number.isFinite(dtMs) || dtMs <= 0 || this.activeParticleCount === 0) return this.activeParticleCount;
    const clampedDt = dtMs > 100 ? 100 : dtMs;
    const frameFactor = clampedDt / FRAME_STEP_MS;
    const b = this.buffers;
    let remaining = 0;
    for (let i = 0; i < this.capacity; i += 1) {
      if (b.active[i] === 0) continue;
      const nextAge = b.ageMs[i] + clampedDt;
      if (nextAge >= b.lifeMs[i]) {
        b.active[i] = 0;
        continue;
      }
      b.ageMs[i] = nextAge;
      const dragPow = Math.pow(b.drag[i], frameFactor);
      b.vx[i] *= dragPow;
      b.vy[i] = (b.vy[i] + b.gravity[i] * clampedDt) * dragPow;
      b.x[i] += b.vx[i] * clampedDt;
      b.y[i] += b.vy[i] * clampedDt;
      b.angle[i] += b.spin[i] * clampedDt;
      remaining += 1;
    }
    this.activeParticleCount = remaining;
    return remaining;
  }
}
