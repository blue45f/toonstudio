/**
 * 장르 분위기 터치 파티클 · 5종 종이 질감 물리 프로필 · Kubelka-Munk 도자기 웨트 믹싱 웰 · 햅틱 디텐트 통합 엔진.
 *
 * - 5종 파티클: `romance-blossom` · `action-ink-splatter` · `healing-watercolor-ripple` · `eraser-crumb-curl` · `magic-prism-scan`
 * - 5종 종이 질감(`PAPER_TOOTH_PROFILES`) 및 Kubelka-Munk 안료 혼색은 `studio-paper-and-pigment-physics.ts`에서 재수출한다.
 * - 브라우저 영속 저장소 직접 호출 0건.
 */

export {
  PAPER_TOOTH_PROFILES,
  STUDIO_PAPER_TEXTURE_IDS,
  STUDIO_PORCELAIN_BASE_PIGMENTS,
  createPorcelainWetMixingWell,
  getPaperToothProfile,
  isStudioPaperTextureId,
  mixPigmentsKubelkaMunk,
  samplePaperToothResistance,
  type PorcelainWetMixingWell,
  type StudioPaperTextureId,
  type StudioPaperToothProfile,
  type StudioPaperToothResistanceSample,
  type StudioPigmentMixResult,
  type StudioPigmentSample,
  type StudioPorcelainWellSlot,
} from "./studio-paper-and-pigment-physics";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------------
// 장르 분위기 터치 파티클 엔진
// ---------------------------------------------------------------------------

export type StudioTactileParticleKind =
  | "romance-blossom"
  | "action-ink-splatter"
  | "healing-watercolor-ripple"
  | "eraser-crumb-curl"
  | "magic-prism-scan";

export interface StudioTactileParticleSpec {
  readonly kind: StudioTactileParticleKind;
  readonly labelKo: string;
  readonly defaultCount: number;
  readonly accentToken: string;
  readonly gravityPxPerSec2: number;
  readonly dragPerSec: number;
  readonly baseLifeMs: number;
  readonly baseSizePx: number;
  readonly shape: "petal" | "droplet" | "ring" | "crumb" | "prism";
}

export const STUDIO_TACTILE_PARTICLE_SPECS: Readonly<
  Record<StudioTactileParticleKind, StudioTactileParticleSpec>
> = Object.freeze({
  "romance-blossom": Object.freeze({
    kind: "romance-blossom",
    labelKo: "로맨스 벚꽃잎",
    defaultCount: 9,
    accentToken: "--ts-vibrant-accent-rose",
    gravityPxPerSec2: 46,
    dragPerSec: 1.9,
    baseLifeMs: 920,
    baseSizePx: 10,
    shape: "petal",
  }),
  "action-ink-splatter": Object.freeze({
    kind: "action-ink-splatter",
    labelKo: "액션 먹물 스플래터",
    defaultCount: 12,
    accentToken: "--ts-vibrant-accent-ink",
    gravityPxPerSec2: 185,
    dragPerSec: 3.1,
    baseLifeMs: 540,
    baseSizePx: 7,
    shape: "droplet",
  }),
  "healing-watercolor-ripple": Object.freeze({
    kind: "healing-watercolor-ripple",
    labelKo: "힐링 수채 물결",
    defaultCount: 4,
    accentToken: "--ts-vibrant-accent-water",
    gravityPxPerSec2: 0,
    dragPerSec: 0.9,
    baseLifeMs: 1050,
    baseSizePx: 18,
    shape: "ring",
  }),
  "eraser-crumb-curl": Object.freeze({
    kind: "eraser-crumb-curl",
    labelKo: "지우개 가루 컬",
    defaultCount: 8,
    accentToken: "--ts-vibrant-accent-amber",
    gravityPxPerSec2: 260,
    dragPerSec: 2.2,
    baseLifeMs: 680,
    baseSizePx: 6,
    shape: "crumb",
  }),
  "magic-prism-scan": Object.freeze({
    kind: "magic-prism-scan",
    labelKo: "매직 프리즘 스캔",
    defaultCount: 10,
    accentToken: "--ts-vibrant-accent-violet",
    gravityPxPerSec2: -24,
    dragPerSec: 1.4,
    baseLifeMs: 780,
    baseSizePx: 9,
    shape: "prism",
  }),
});

export interface StudioTactileParticle {
  readonly id: string;
  readonly kind: StudioTactileParticleKind;
  readonly shape: StudioTactileParticleSpec["shape"];
  readonly accentToken: string;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly sizePx: number;
  readonly rotationDeg: number;
  readonly angularVelocityDegPerSec: number;
  readonly initialOpacity: number;
  readonly opacity: number;
  readonly ageMs: number;
  readonly maxLifeMs: number;
  readonly swirlPhaseRad: number;
}

export interface StudioTactileBurstInput {
  readonly kind: StudioTactileParticleKind;
  readonly x: number;
  readonly y: number;
  readonly intensity01?: number;
  readonly directionAngleRad?: number;
  readonly count?: number;
  readonly reducedMotion?: boolean;
  readonly seed?: number;
}

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 장르 분위기에 맞는 터치 파티클 버스트를 생성한다.
 * `reducedMotion` 활성화 시 시각 피로를 줄이기 위해 단일 정적 페이드 요소로 축소한다.
 */
export function createTactileParticleBurst(
  input: StudioTactileBurstInput,
): readonly StudioTactileParticle[] {
  const spec = STUDIO_TACTILE_PARTICLE_SPECS[input.kind];
  const intensity = clampRange(input.intensity01 ?? 0.72, 0.15, 1);
  const seedBase = input.seed ?? Math.round((input.x * 31 + input.y * 17 + intensity * 997) * 13);
  const rand = createMulberry32(seedBase);

  if (input.reducedMotion) {
    return [
      {
        id: `${input.kind}-rm-${seedBase >>> 0}`,
        kind: input.kind,
        shape: spec.shape,
        accentToken: spec.accentToken,
        x: input.x,
        y: input.y,
        vx: 0,
        vy: 0,
        sizePx: Number((spec.baseSizePx * 0.9).toFixed(2)),
        rotationDeg: 0,
        angularVelocityDegPerSec: 0,
        initialOpacity: 0.55,
        opacity: 0.55,
        ageMs: 0,
        maxLifeMs: Math.round(spec.baseLifeMs * 0.45),
        swirlPhaseRad: 0,
      },
    ];
  }

  const count = Math.round(
    clampRange(input.count ?? Math.max(2, Math.round(spec.defaultCount * (0.55 + 0.65 * intensity))), 1, 24),
  );
  const baseDir = input.directionAngleRad ?? -Math.PI / 2;
  const particles: StudioTactileParticle[] = [];

  for (let i = 0; i < count; i += 1) {
    const spread =
      input.kind === "action-ink-splatter"
        ? (rand() - 0.5) * 1.45
        : (Math.PI * 2 * i) / count + (rand() - 0.5) * 0.45;
    const angle = input.kind === "action-ink-splatter" ? baseDir + spread : spread;
    const speedBase =
      input.kind === "healing-watercolor-ripple"
        ? 14 + rand() * 18
        : input.kind === "action-ink-splatter"
          ? 140 + rand() * 210
          : input.kind === "eraser-crumb-curl"
            ? 55 + rand() * 95
            : 45 + rand() * 80;
    const speed = speedBase * (0.5 + 0.7 * intensity);
    const maxLifeMs = Math.round(spec.baseLifeMs * (0.78 + rand() * 0.44));
    const sizePx = Number((spec.baseSizePx * (0.68 + rand() * 0.64) * (0.75 + 0.35 * intensity)).toFixed(2));

    const initialOpacity = Number((0.78 + rand() * 0.22).toFixed(3));
    particles.push({
      id: `${input.kind}-${seedBase >>> 0}-${i}`,
      kind: input.kind,
      shape: spec.shape,
      accentToken: spec.accentToken,
      x: input.x + (rand() - 0.5) * 6,
      y: input.y + (rand() - 0.5) * 6,
      vx: Number((Math.cos(angle) * speed).toFixed(2)),
      vy: Number((Math.sin(angle) * speed).toFixed(2)),
      sizePx,
      rotationDeg: Number((rand() * 360).toFixed(1)),
      angularVelocityDegPerSec: Number(((rand() - 0.5) * (input.kind === "romance-blossom" ? 140 : 240)).toFixed(1)),
      initialOpacity,
      opacity: initialOpacity,
      ageMs: 0,
      maxLifeMs,
      swirlPhaseRad: Number((rand() * Math.PI * 2).toFixed(3)),
    });
  }

  return particles;
}

/**
 * 파티클 집합의 물리 상태(중력·항력·벚꽃 선회·수채 링 확장·감쇠)를 한 프레임 전진시킨다.
 */
export function stepTactileParticles(
  particles: readonly StudioTactileParticle[],
  deltaMs: number,
): readonly StudioTactileParticle[] {
  if (particles.length === 0) return [];
  const safeDeltaMs = clampRange(deltaMs, 0, 250);
  if (safeDeltaMs === 0) return particles;
  const dt = safeDeltaMs / 1000;
  const next: StudioTactileParticle[] = [];

  for (const p of particles) {
    const nextAge = p.ageMs + safeDeltaMs;
    if (nextAge >= p.maxLifeMs) continue;
    const spec = STUDIO_TACTILE_PARTICLE_SPECS[p.kind];
    const progress = nextAge / p.maxLifeMs;
    const damp = Math.exp(-spec.dragPerSec * dt);
    const swirlAccelX =
      p.kind === "romance-blossom" ? Math.sin(p.swirlPhaseRad + nextAge * 0.008) * 38 : 0;

    const vx = (p.vx + swirlAccelX * dt) * damp;
    const vy = (p.vy + spec.gravityPxPerSec2 * dt) * damp;
    const sizePx =
      p.kind === "healing-watercolor-ripple"
        ? p.sizePx + 36 * dt
        : p.kind === "magic-prism-scan"
          ? p.sizePx * (1 - 0.12 * dt)
          : p.sizePx;

    next.push({
      ...p,
      x: Number((p.x + vx * dt).toFixed(2)),
      y: Number((p.y + vy * dt).toFixed(2)),
      vx: Number(vx.toFixed(2)),
      vy: Number(vy.toFixed(2)),
      sizePx: Number(Math.max(1, sizePx).toFixed(2)),
      rotationDeg: Number(((p.rotationDeg + p.angularVelocityDegPerSec * dt) % 360).toFixed(1)),
      opacity: Number(clamp01(p.initialOpacity * (1 - progress * progress)).toFixed(3)),
      ageMs: nextAge,
    });
  }

  return next;
}

export class StudioTactileParticleSystem {
  private particles: readonly StudioTactileParticle[] = [];
  private readonly maxParticles: number;

  constructor(maxParticles = 96) {
    this.maxParticles = Math.max(8, Math.min(256, Math.round(maxParticles)));
  }

  emit(input: StudioTactileBurstInput): readonly StudioTactileParticle[] {
    const burst = createTactileParticleBurst(input);
    const combined = [...this.particles, ...burst];
    this.particles =
      combined.length > this.maxParticles
        ? combined.slice(combined.length - this.maxParticles)
        : combined;
    return burst;
  }

  step(deltaMs: number): readonly StudioTactileParticle[] {
    this.particles = stepTactileParticles(this.particles, deltaMs);
    return this.particles;
  }

  getParticles(): readonly StudioTactileParticle[] {
    return this.particles;
  }

  clear(): void {
    this.particles = [];
  }
}

// ---------------------------------------------------------------------------
// Web Vibration / Gamepad 햅틱 디텐트 트리거
// ---------------------------------------------------------------------------

export type StudioHapticPatternId =
  | "detent-tick"
  | "brush-grain"
  | "panel-snap"
  | "undo-thump"
  | "ink-bloom"
  | "palette-dip";

export interface StudioHapticPatternSpec {
  readonly id: StudioHapticPatternId;
  readonly labelKo: string;
  readonly vibratePatternMs: readonly number[];
  readonly gamepadDualRumble: {
    readonly durationMs: number;
    readonly strongMagnitude: number;
    readonly weakMagnitude: number;
  };
}

export const STUDIO_HAPTIC_PATTERNS: Readonly<
  Record<StudioHapticPatternId, StudioHapticPatternSpec>
> = Object.freeze({
  "detent-tick": Object.freeze({
    id: "detent-tick",
    labelKo: "자석 다이얼 디텐트",
    vibratePatternMs: [8],
    gamepadDualRumble: { durationMs: 18, strongMagnitude: 0.14, weakMagnitude: 0.35 },
  }),
  "brush-grain": Object.freeze({
    id: "brush-grain",
    labelKo: "종이 요철 미세 진동",
    vibratePatternMs: [6, 12, 6],
    gamepadDualRumble: { durationMs: 24, strongMagnitude: 0.08, weakMagnitude: 0.28 },
  }),
  "panel-snap": Object.freeze({
    id: "panel-snap",
    labelKo: "패널 자석 스냅",
    vibratePatternMs: [12, 16, 10],
    gamepadDualRumble: { durationMs: 36, strongMagnitude: 0.38, weakMagnitude: 0.24 },
  }),
  "undo-thump": Object.freeze({
    id: "undo-thump",
    labelKo: "실행 취소 묵직한 탭",
    vibratePatternMs: [18],
    gamepadDualRumble: { durationMs: 42, strongMagnitude: 0.45, weakMagnitude: 0.18 },
  }),
  "ink-bloom": Object.freeze({
    id: "ink-bloom",
    labelKo: "잉크 번짐 활성 공명",
    vibratePatternMs: [10, 14, 14],
    gamepadDualRumble: { durationMs: 32, strongMagnitude: 0.22, weakMagnitude: 0.42 },
  }),
  "palette-dip": Object.freeze({
    id: "palette-dip",
    labelKo: "도자기 물감 찍기",
    vibratePatternMs: [7, 10, 5],
    gamepadDualRumble: { durationMs: 20, strongMagnitude: 0.12, weakMagnitude: 0.3 },
  }),
});

export interface StudioGamepadActuatorLike {
  readonly playEffect?: (
    type: string,
    params: {
      readonly startDelay?: number;
      readonly duration: number;
      readonly strongMagnitude: number;
      readonly weakMagnitude: number;
    },
  ) => Promise<unknown> | unknown;
}

export interface StudioGamepadLike {
  readonly connected?: boolean;
  readonly vibrationActuator?: StudioGamepadActuatorLike | null;
}

export interface StudioHapticNavigatorLike {
  readonly vibrate?: (pattern: number | number[]) => boolean;
  readonly getGamepads?: () => readonly (StudioGamepadLike | null)[];
}

export interface StudioHapticDispatchOptions {
  readonly enabled?: boolean;
  readonly reducedMotion?: boolean;
  readonly intensity01?: number;
  readonly navigatorLike?: StudioHapticNavigatorLike | null;
}

export interface StudioHapticDispatchResult {
  readonly patternId: StudioHapticPatternId;
  readonly vibrated: boolean;
  readonly gamepadActuatorsTriggered: number;
  readonly skippedReason: "disabled" | "reduced-motion" | "unsupported" | null;
}

/**
 * Web Vibration API 및 연결된 Gamepad `dual-rumble` 액추에이터로 촉각 디텐트를 안전하게 전달한다.
 */
export function triggerTactileHapticDetent(
  patternId: StudioHapticPatternId,
  options: StudioHapticDispatchOptions = {},
): StudioHapticDispatchResult {
  if (options.enabled === false) {
    return { patternId, vibrated: false, gamepadActuatorsTriggered: 0, skippedReason: "disabled" };
  }
  if (options.reducedMotion) {
    return {
      patternId,
      vibrated: false,
      gamepadActuatorsTriggered: 0,
      skippedReason: "reduced-motion",
    };
  }

  const nav =
    options.navigatorLike !== undefined
      ? options.navigatorLike
      : typeof navigator !== "undefined"
        ? (navigator as unknown as StudioHapticNavigatorLike)
        : null;

  if (!nav) {
    return {
      patternId,
      vibrated: false,
      gamepadActuatorsTriggered: 0,
      skippedReason: "unsupported",
    };
  }

  const spec = STUDIO_HAPTIC_PATTERNS[patternId];
  const scale = clampRange(options.intensity01 ?? 1, 0.25, 1);

  let vibrated = false;
  if (typeof nav.vibrate === "function") {
    try {
      const scaled = spec.vibratePatternMs.map((ms) => Math.max(4, Math.round(ms * scale)));
      vibrated = Boolean(nav.vibrate(scaled));
    } catch {
      vibrated = false;
    }
  }

  let gamepadActuatorsTriggered = 0;
  if (typeof nav.getGamepads === "function") {
    try {
      const pads = nav.getGamepads() ?? [];
      for (const pad of pads) {
        if (!pad || pad.connected === false) continue;
        const actuator = pad.vibrationActuator;
        if (!actuator || typeof actuator.playEffect !== "function") continue;
        void Promise.resolve(
          actuator.playEffect("dual-rumble", {
            startDelay: 0,
            duration: spec.gamepadDualRumble.durationMs,
            strongMagnitude: Number((spec.gamepadDualRumble.strongMagnitude * scale).toFixed(3)),
            weakMagnitude: Number((spec.gamepadDualRumble.weakMagnitude * scale).toFixed(3)),
          }),
        ).catch(() => undefined);
        gamepadActuatorsTriggered += 1;
      }
    } catch {
      // 샌드박스 환경 권한 예외를 안전하게 무시한다.
    }
  }

  return {
    patternId,
    vibrated,
    gamepadActuatorsTriggered,
    skippedReason: !vibrated && gamepadActuatorsTriggered === 0 ? "unsupported" : null,
  };
}
