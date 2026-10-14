/**
 * Studio Kinetic Effect Graph — 웹툰 전용 파라메트릭 동적 효과
 * (비, 안개, 벚꽃/꽃잎, 먼지, 먹 번짐, 속도선, 에너지 펄스) 그래프 및 파티클 샘플러 코어.
 *
 * 마스터플랜 14.5 (Kinetic Effect Graph) & 41개 경쟁제품 기능 갭 전수 비교:
 * - 웹툰 전용 효과: 비(Rain), 안개(Mist), 꽃잎(Petals), 먼지(Dust), 먹 번짐(Ink Bloom), 속도선(Speedlines), 발광(Glow Pulse)
 * - 컷(Panel) 범위 마스킹 및 루프 주기(Loop Period) 기반 결정론적 파티클 샘플링
 * - 정적 출고(PDF/인쇄/정적 웹툰)를 위한 자동 정적 대체본(Static Fallback) 생성
 * - 순수 함수, 불변성, 결정론, DOM/React 무관
 */

export const STUDIO_KINETIC_EFFECT_VERSION = 1 as const;

export const KINETIC_EFFECT_TYPES = [
  "rain",
  "mist",
  "petals",
  "dust-motes",
  "ink-bloom",
  "speedlines",
  "energy-glow-pulse",
] as const;
export type KineticEffectType = (typeof KINETIC_EFFECT_TYPES)[number];

export interface KineticRainParams {
  readonly speedPxPerSec: number;
  readonly angleDeg: number;
  readonly density: number; // 0..1
  readonly streakLengthPx: number;
  readonly dropColor?: string;
}

export interface KineticPetalsParams {
  readonly count: number;
  readonly windVelocityX: number;
  readonly windVelocityY: number;
  readonly flutterFrequencyHz: number;
  readonly petalColor?: string;
}

export interface KineticSpeedlinesParams {
  readonly originNormalizedX: number; // 0..1
  readonly originNormalizedY: number; // 0..1
  readonly lineCount: number;
  readonly strokeWidth: number;
  readonly innerRadiusRatio: number; // 0..1
}

export interface KineticGlowPulseParams {
  readonly pulseFrequencyHz: number;
  readonly glowRadiusPx: number;
  readonly coreBrightness: number;
  readonly glowColor: string;
}

export type KineticEffectParameters =
  | { readonly type: "rain"; readonly params: KineticRainParams }
  | { readonly type: "petals"; readonly params: KineticPetalsParams }
  | { readonly type: "speedlines"; readonly params: KineticSpeedlinesParams }
  | { readonly type: "energy-glow-pulse"; readonly params: KineticGlowPulseParams }
  | { readonly type: "mist" | "dust-motes" | "ink-bloom"; readonly params: Readonly<Record<string, number | string>> };

export interface KineticEffectInstance {
  readonly id: string;
  readonly panelId: string;
  readonly effect: KineticEffectParameters;
  readonly seed: number;
  readonly loopPeriodMs: number; // e.g. 2000ms loop
  readonly bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly isMasked?: boolean;
}

export interface StudioKineticEffectGraph {
  readonly version: typeof STUDIO_KINETIC_EFFECT_VERSION;
  readonly id: string;
  readonly episodeId: string;
  readonly effects: readonly KineticEffectInstance[];
}

export interface SampledKineticParticle {
  readonly x: number;
  readonly y: number;
  readonly length?: number;
  readonly angleDeg?: number;
  readonly opacity: number;
  readonly scale: number;
}

/** 한 인스턴스가 만들 수 있는 파티클 수 상한 — count 폭주로 샘플러가 멈추는 것을 막는다. */
export const MAX_KINETIC_PARTICLES_PER_EFFECT = 100_000;

function assertKineticId(value: unknown, field: string): void {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} is required.`);
}

function assertFiniteKineticNumber(value: unknown, field: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RangeError(`${field} must be a finite number.`);
  }
}

function assertNonNegativeKineticNumber(value: unknown, field: string): void {
  assertFiniteKineticNumber(value, field);
  if ((value as number) < 0) throw new RangeError(`${field} must be non-negative.`);
}

function assertKineticRatio(value: unknown, field: string): void {
  assertFiniteKineticNumber(value, field);
  if ((value as number) < 0 || (value as number) > 1) {
    throw new RangeError(`${field} must be between 0 and 1.`);
  }
}

function assertKineticCount(value: unknown, field: string): void {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > MAX_KINETIC_PARTICLES_PER_EFFECT) {
    throw new RangeError(`${field} must be an integer between 0 and ${MAX_KINETIC_PARTICLES_PER_EFFECT}.`);
  }
}

function assertOptionalKineticColor(value: unknown, field: string): void {
  if (value !== undefined && (typeof value !== "string" || !value.trim())) {
    throw new TypeError(`${field} is invalid.`);
  }
}

function assertGenericKineticParams(params: unknown, field: string): void {
  if (typeof params !== "object" || params === null || Array.isArray(params)) {
    throw new TypeError(`${field} is invalid.`);
  }
  for (const [key, value] of Object.entries(params)) {
    const valid =
      typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
    if (!valid) throw new TypeError(`${field}.${key} is invalid.`);
  }
}

/**
 * 키네틱 효과 인스턴스 파라미터 검증.
 * 기존에는 검증이 전혀 없어 loopPeriodMs=0·NaN 시간·density 범위 밖·분수 count 같은
 * 잘못된 값이 샘플러에서 NaN 좌표나 범위 밖 파티클로 조용히 새어 나갔다.
 * 문서화된 범위(density·origin·innerRadiusRatio 0..1 등)를 여기서 강제한다.
 */
export function validateKineticEffectInstance(effect: KineticEffectInstance): void {
  if (typeof effect !== "object" || effect === null) throw new TypeError("kinetic effect instance is invalid.");
  assertKineticId(effect.id, "effect.id");
  assertKineticId(effect.panelId, "effect.panelId");
  assertFiniteKineticNumber(effect.seed, "effect.seed");
  assertFiniteKineticNumber(effect.loopPeriodMs, "effect.loopPeriodMs");
  if (effect.loopPeriodMs <= 0) throw new RangeError("effect.loopPeriodMs must be positive.");
  if (typeof effect.bounds !== "object" || effect.bounds === null) {
    throw new TypeError("effect.bounds is invalid.");
  }
  assertFiniteKineticNumber(effect.bounds.x, "effect.bounds.x");
  assertFiniteKineticNumber(effect.bounds.y, "effect.bounds.y");
  assertFiniteKineticNumber(effect.bounds.width, "effect.bounds.width");
  assertFiniteKineticNumber(effect.bounds.height, "effect.bounds.height");
  if (effect.bounds.width <= 0 || effect.bounds.height <= 0) {
    throw new RangeError("effect.bounds width and height must be positive.");
  }
  if (effect.isMasked !== undefined && typeof effect.isMasked !== "boolean") {
    throw new TypeError("effect.isMasked is invalid.");
  }
  const parameters = effect.effect;
  if (typeof parameters !== "object" || parameters === null) {
    throw new TypeError("effect.effect is invalid.");
  }
  switch (parameters.type) {
    case "rain": {
      const params = parameters.params;
      assertGenericKineticParams(params, "effect.params");
      assertNonNegativeKineticNumber(params.speedPxPerSec, "rain.speedPxPerSec");
      assertFiniteKineticNumber(params.angleDeg, "rain.angleDeg");
      assertKineticRatio(params.density, "rain.density");
      assertNonNegativeKineticNumber(params.streakLengthPx, "rain.streakLengthPx");
      assertOptionalKineticColor(params.dropColor, "rain.dropColor");
      break;
    }
    case "petals": {
      const params = parameters.params;
      assertGenericKineticParams(params, "effect.params");
      assertKineticCount(params.count, "petals.count");
      assertFiniteKineticNumber(params.windVelocityX, "petals.windVelocityX");
      assertFiniteKineticNumber(params.windVelocityY, "petals.windVelocityY");
      assertNonNegativeKineticNumber(params.flutterFrequencyHz, "petals.flutterFrequencyHz");
      assertOptionalKineticColor(params.petalColor, "petals.petalColor");
      break;
    }
    case "speedlines": {
      const params = parameters.params;
      assertGenericKineticParams(params, "effect.params");
      assertKineticRatio(params.originNormalizedX, "speedlines.originNormalizedX");
      assertKineticRatio(params.originNormalizedY, "speedlines.originNormalizedY");
      assertKineticCount(params.lineCount, "speedlines.lineCount");
      assertNonNegativeKineticNumber(params.strokeWidth, "speedlines.strokeWidth");
      assertKineticRatio(params.innerRadiusRatio, "speedlines.innerRadiusRatio");
      break;
    }
    case "energy-glow-pulse": {
      const params = parameters.params;
      assertGenericKineticParams(params, "effect.params");
      assertNonNegativeKineticNumber(params.pulseFrequencyHz, "glow.pulseFrequencyHz");
      assertNonNegativeKineticNumber(params.glowRadiusPx, "glow.glowRadiusPx");
      assertNonNegativeKineticNumber(params.coreBrightness, "glow.coreBrightness");
      assertKineticId(params.glowColor, "glow.glowColor");
      break;
    }
    case "mist":
    case "dust-motes":
    case "ink-bloom":
      assertGenericKineticParams(parameters.params, "effect.params");
      break;
    default:
      throw new TypeError(`Unknown kinetic effect type: ${String((parameters as { type?: unknown }).type)}`);
  }
}

/** 음수 나머지를 양의 나머지로 감싼다 — 음수 시간·음수 각도·역풍에서도 좌표가 bounds 안에 남는다. */
function wrapModulo(value: number, size: number): number {
  return ((value % size) + size) % size;
}

export function createStudioKineticEffectGraph(params: {
  id: string;
  episodeId: string;
  effects?: readonly KineticEffectInstance[];
}): StudioKineticEffectGraph {
  assertKineticId(params.id, "graph.id");
  assertKineticId(params.episodeId, "graph.episodeId");
  const effects = [...(params.effects ?? [])];
  const seen = new Set<string>();
  for (const effect of effects) {
    validateKineticEffectInstance(effect);
    if (seen.has(effect.id)) throw new Error(`Effect ${effect.id} already exists`);
    seen.add(effect.id);
  }
  return Object.freeze({
    version: STUDIO_KINETIC_EFFECT_VERSION,
    id: params.id.trim(),
    episodeId: params.episodeId.trim(),
    effects: Object.freeze(effects),
  });
}

export function addKineticEffect(
  graph: StudioKineticEffectGraph,
  effect: KineticEffectInstance,
): StudioKineticEffectGraph {
  validateKineticEffectInstance(effect);
  if (graph.effects.some((e) => e.id === effect.id)) {
    throw new Error(`Effect ${effect.id} already exists`);
  }
  return {
    ...graph,
    effects: Object.freeze([...graph.effects, effect]),
  };
}

export function removeKineticEffect(
  graph: StudioKineticEffectGraph,
  effectId: string,
): StudioKineticEffectGraph {
  return {
    ...graph,
    effects: Object.freeze(graph.effects.filter((e) => e.id !== effectId)),
  };
}

/**
 * 특정 시점(timeMs)의 결정론적 파티클 위치와 시각 속성을 샘플링한다.
 */
export function sampleKineticParticlesAtTime(
  effect: KineticEffectInstance,
  timeMs: number,
): readonly SampledKineticParticle[] {
  validateKineticEffectInstance(effect);
  if (typeof timeMs !== "number" || !Number.isFinite(timeMs)) {
    throw new RangeError("timeMs must be a finite number.");
  }
  // 음수 시간도 루프 주기 안으로 감싸 결정론을 유지한다(이전에는 음수 좌표가 새어 나갔다).
  const normTime = wrapModulo(timeMs, effect.loopPeriodMs) / effect.loopPeriodMs; // 0..1
  const b = effect.bounds;
  const seed = effect.seed;
  const particles: SampledKineticParticle[] = [];

  if (effect.effect.type === "rain") {
    const rain = effect.effect.params;
    const count = Math.round(50 * rain.density);
    for (let i = 0; i < count; i += 1) {
      const pSeed = (seed + i * 1013) % 10000;
      const initialX = (pSeed % 1000) / 1000 * b.width;
      const initialY = ((pSeed * 7) % 1000) / 1000 * b.height;

      const travelY = wrapModulo(initialY + normTime * b.height * 2, b.height);
      // 음수 각도(역방향 빗줄기)에서도 x가 bounds 왼쪽으로 빠져나가지 않게 감싼다.
      const travelX = wrapModulo(
        initialX + (travelY / b.height) * Math.tan((rain.angleDeg * Math.PI) / 180) * 100,
        b.width,
      );

      particles.push(
        Object.freeze({
          x: b.x + travelX,
          y: b.y + travelY,
          length: rain.streakLengthPx,
          angleDeg: rain.angleDeg,
          opacity: 0.6 + ((i % 5) / 10),
          scale: 1,
        }),
      );
    }
  } else if (effect.effect.type === "petals") {
    const petals = effect.effect.params;
    for (let i = 0; i < petals.count; i += 1) {
      const pSeed = (seed + i * 7919) % 10000;
      const baseX = ((pSeed * 13) % 1000) / 1000 * b.width;
      const baseY = ((pSeed * 37) % 1000) / 1000 * b.height;

      const flutter = Math.sin(normTime * Math.PI * 2 * petals.flutterFrequencyHz + i) * 30;
      const posX = wrapModulo(baseX + normTime * petals.windVelocityX + flutter, b.width);
      const posY = wrapModulo(baseY + normTime * petals.windVelocityY, b.height);

      particles.push(
        Object.freeze({
          x: b.x + posX,
          y: b.y + posY,
          opacity: 0.8,
          scale: 0.8 + ((i % 4) / 10),
          angleDeg: (normTime * 360 * 2 + i * 45) % 360,
        }),
      );
    }
  }

  return Object.freeze(particles);
}

/**
 * 정적 포맷 출고를 위한 대표 정적 키프레임(Fallback Poster) 속성을 산출한다.
 */
export function generateStaticEffectFallback(
  effect: KineticEffectInstance,
): { readonly particleSnapshot: readonly SampledKineticParticle[]; readonly description: string } {
  // 중간 시점(500ms) 샘플링
  const snapshot = sampleKineticParticlesAtTime(effect, Math.floor(effect.loopPeriodMs / 2));
  return Object.freeze({
    particleSnapshot: snapshot,
    description: `정적 렌더링용 ${effect.effect.type} 효과 스냅샷 (파티클 ${snapshot.length}개)`,
  });
}
