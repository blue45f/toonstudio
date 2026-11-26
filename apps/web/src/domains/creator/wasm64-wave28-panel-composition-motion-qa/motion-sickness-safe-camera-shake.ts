/**
 * 액션 타격 역경직(Hit-Stop) + Trauma² 펄린·감쇠 조화 카메라 셰이크 및 전정기관 멀미 억제기.
 *
 * - 전경(`foreground`)·중경(`midground`)·배경(`background`) 3단 시차(Parallax) 레이어에 대해
 *   `trauma²` 비선형 진폭, 감쇠 조화 진동, 5차 보간(Quintic) 가치·기울기 노이즈를 결합한 타격 셰이크와
 *   타격 정점의 이산 역경직 프리즈 프레임(`2..5`프레임)을 합성한다.
 * - 전정기관 멀미 예방을 위해 회전각을 `|rollDeg| <= 2.5°` 이내로 엄격히 제한하고,
 *   구토·어지럼증을 유발하는 `0.1–0.45 Hz` 저주파 표류 대역을 2차 버터워스 고역통과 필터로 감쇠하며,
 *   프레임 간 각속도 상한을 강제한다.
 * - 접근성 설정 `prefersReducedMotion === true`일 때는 모든 프레임과 모든 시차 평면에서
 *   정확히 `dx === 0 && dy === 0 && rollDeg === 0` 무변위를 보장한다.
 */

export const CAMERA_SHAKE_PLANES = Object.freeze(["foreground", "midground", "background"] as const);
export type CameraShakePlane = (typeof CAMERA_SHAKE_PLANES)[number];

export const MIN_HIT_STOP_FRAMES = 2 as const;
export const MAX_HIT_STOP_FRAMES = 5 as const;
/** 전정기관 수평 기준선 보호를 위한 최대 허용 카메라 롤 각도 (`±2.5°`). */
export const MAX_VESTIBULAR_ROLL_DEG = 2.5 as const;
export const NAUSEA_BAND_MIN_HZ = 0.1 as const;
export const NAUSEA_BAND_MAX_HZ = 0.45 as const;
export const DEFAULT_VESTIBULAR_HIGH_PASS_CUTOFF_HZ = 1.25 as const;
export const DEFAULT_MAX_ANGULAR_VELOCITY_DEG_PER_SEC = 48 as const;
export const DEFAULT_CAMERA_SHAKE_FPS = 60 as const;

export interface ParallaxPlaneFactors {
  readonly translationScale: number;
  readonly rollScale: number;
}

export const DEFAULT_PARALLAX_FACTORS: Readonly<Record<CameraShakePlane, ParallaxPlaneFactors>> =
  Object.freeze({
    foreground: { translationScale: 1.24, rollScale: 1.0 },
    midground: { translationScale: 1.0, rollScale: 0.82 },
    background: { translationScale: 0.34, rollScale: 0.28 },
  });

export interface ImpactImpulse {
  readonly frameIndex: number;
  /** 타격 충격량 (`0..1`, 누적 trauma는 최대 `1.0`으로 포화). */
  readonly traumaDelta: number;
  /** 타격 방향 편향 벡터 (선택). */
  readonly directionalBias?: { readonly x: number; readonly y: number };
  /** 명시적 역경직 프레임 수 (생략 시 충격량 비례 `2..5`프레임 자동 산정). */
  readonly hitStopFrames?: number;
}

export interface LowFrequencyDriftInjection {
  readonly frequencyHz: number;
  readonly amplitudePx: number;
  readonly rollAmplitudeDeg?: number;
}

export interface SafeCameraShakeConfig {
  readonly totalFrames: number;
  readonly fps?: number;
  readonly seed?: number;
  readonly prefersReducedMotion?: boolean;
  readonly maxTranslationPx?: number;
  readonly maxRollDeg?: number;
  readonly maxAngularVelocityDegPerSec?: number;
  readonly traumaDecayPerSec?: number;
  readonly dominantShakeHz?: number;
  readonly highPassCutoffHz?: number;
  readonly hitStopMinTrauma?: number;
  readonly parallaxFactors?: Partial<Readonly<Record<CameraShakePlane, ParallaxPlaneFactors>>>;
  readonly impacts: readonly ImpactImpulse[];
  readonly ambientDrift?: LowFrequencyDriftInjection;
}

export interface PlaneShakePose {
  readonly dx: number;
  readonly dy: number;
  readonly rollDeg: number;
  readonly angularVelocityDegPerSec: number;
}

export interface SafeCameraShakeFrame {
  readonly frameIndex: number;
  readonly timestampSec: number;
  readonly effectiveMotionTimeSec: number;
  readonly trauma: number;
  readonly traumaSquared: number;
  readonly isHitStopFrozen: boolean;
  readonly hitStopRemainingFrames: number;
  readonly dx: number;
  readonly dy: number;
  readonly rollDeg: number;
  readonly angularVelocityDegPerSec: number;
  readonly planes: Readonly<Record<CameraShakePlane, PlaneShakePose>>;
}

export interface HitStopWindowSummary {
  readonly startFrame: number;
  readonly endFrameInclusive: number;
  readonly durationFrames: number;
  readonly peakTraumaAtImpact: number;
}

export interface SafeCameraShakeTimeline {
  readonly fps: number;
  readonly totalFrames: number;
  readonly prefersReducedMotion: boolean;
  readonly maxObservedAbsRollDeg: number;
  readonly maxObservedAngularVelocityDegPerSec: number;
  readonly maxObservedTranslationPx: number;
  readonly hitStopWindows: readonly HitStopWindowSummary[];
  readonly nauseaBandAttenuationRatio: number;
  readonly frames: readonly SafeCameraShakeFrame[];
  readonly comfortSummaryKo: string;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function cleanZero(value: number): number {
  return Math.abs(value) < 1e-12 ? 0 : value;
}

function quinticFade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function hashLattice1D(latticeIndex: number, channelSeed: number): number {
  let h = (Math.imul(latticeIndex | 0, 0x27d4eb2d) ^ Math.imul(channelSeed | 0, 0x165667b1)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return (h / 0xffffffff) * 2 - 1;
}

/** 결정론적 1D 기울기·가치 혼합 펄린 노이즈 (`[-1, 1]` 범위). */
export function sampleQuinticNoise1D(position: number, seed: number): number {
  const i0 = Math.floor(position);
  const i1 = i0 + 1;
  const frac = position - i0;
  const u = quinticFade(frac);

  const v0 = hashLattice1D(i0, seed);
  const v1 = hashLattice1D(i1, seed);
  const g0 = hashLattice1D(i0, seed ^ 0x9e3779b9);
  const g1 = hashLattice1D(i1, seed ^ 0x9e3779b9);

  const valueBlend = v0 + (v1 - v0) * u;
  const gradBlend = g0 * frac + (g1 * (frac - 1) - g0 * frac) * u;
  return clamp(0.65 * valueBlend + 0.7 * gradBlend, -1, 1);
}

function sampleFractalShakeNoise(timeSec: number, baseHz: number, seed: number): number {
  const octave1 = sampleQuinticNoise1D(timeSec * baseHz, seed);
  const octave2 = sampleQuinticNoise1D(timeSec * baseHz * 2.07, seed + 101);
  return clamp(octave1 * 0.72 + octave2 * 0.28, -1, 1);
}

interface ButterworthHighPassBiquad {
  readonly b0: number;
  readonly b1: number;
  readonly b2: number;
  readonly a1: number;
  readonly a2: number;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

function createButterworthHighPassBiquad(fps: number, cutoffHz: number): ButterworthHighPassBiquad {
  const safeCutoff = clamp(cutoffHz, 0.05, fps * 0.42);
  const omega = Math.tan((Math.PI * safeCutoff) / fps);
  const omega2 = omega * omega;
  const sqrt2Omega = Math.SQRT2 * omega;
  const norm = 1 / (1 + sqrt2Omega + omega2);
  return {
    b0: norm,
    b1: -2 * norm,
    b2: norm,
    a1: 2 * (omega2 - 1) * norm,
    a2: (1 - sqrt2Omega + omega2) * norm,
    x1: 0,
    x2: 0,
    y1: 0,
    y2: 0,
  };
}

function stepBiquad(filter: ButterworthHighPassBiquad, input: number): number {
  const y =
    filter.b0 * input +
    filter.b1 * filter.x1 +
    filter.b2 * filter.x2 -
    filter.a1 * filter.y1 -
    filter.a2 * filter.y2;
  filter.x2 = filter.x1;
  filter.x1 = input;
  filter.y2 = filter.y1;
  filter.y1 = y;
  return y;
}

/** 멀미 유발 저주파 대역(`0.1–0.45 Hz`)을 억제하는 2차 버터워스 고역통과 필터를 시계열에 적용한다. */
export function applyVestibularHighPassFilter(
  samples: ArrayLike<number>,
  fps: number,
  cutoffHz: number = DEFAULT_VESTIBULAR_HIGH_PASS_CUTOFF_HZ,
): Float64Array {
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new RangeError("샘플링 검사용 프레임레이트(fps)는 0보다 커야 합니다.");
  }
  const output = new Float64Array(samples.length);
  const biquad = createButterworthHighPassBiquad(fps, cutoffHz);
  for (let i = 0; i < samples.length; i += 1) {
    output[i] = cleanZero(stepBiquad(biquad, samples[i] ?? 0));
  }
  return output;
}

/** 지정된 주파수 대역(`[minHz, maxHz]`)의 이산 푸리에 스펙트럼 RMS 진폭을 계산한다. */
export function computeBandRmsAmplitude(
  samples: ArrayLike<number>,
  fps: number,
  minHz: number,
  maxHz: number,
): number {
  const n = samples.length;
  if (n === 0 || fps <= 0 || maxHz < minHz) return 0;

  let powerSum = 0;
  const minBin = Math.max(1, Math.ceil((minHz * n) / fps));
  const maxBin = Math.min(Math.floor(n / 2), Math.floor((maxHz * n) / fps));

  if (maxBin >= minBin) {
    let binCount = 0;
    for (let k = minBin; k <= maxBin; k += 1) {
      let re = 0;
      let im = 0;
      const angleStep = (-2 * Math.PI * k) / n;
      for (let t = 0; t < n; t += 1) {
        const val = samples[t] ?? 0;
        re += val * Math.cos(angleStep * t);
        im += val * Math.sin(angleStep * t);
      }
      const amp = (2 * Math.hypot(re, im)) / n;
      powerSum += amp * amp;
      binCount += 1;
    }
    return Math.sqrt(powerSum / Math.max(1, binCount));
  }

  const probeCount = 5;
  for (let p = 0; p < probeCount; p += 1) {
    const freq = minHz + ((maxHz - minHz) * p) / (probeCount - 1);
    let re = 0;
    let im = 0;
    for (let t = 0; t < n; t += 1) {
      const val = samples[t] ?? 0;
      const theta = (-2 * Math.PI * freq * t) / fps;
      re += val * Math.cos(theta);
      im += val * Math.sin(theta);
    }
    const amp = (2 * Math.hypot(re, im)) / n;
    powerSum += amp * amp;
  }
  return Math.sqrt(powerSum / probeCount);
}

function computeHitStopFrameBudget(peakTrauma: number, explicitFrames: number | undefined): number {
  if (explicitFrames !== undefined) {
    return clamp(Math.round(explicitFrames), MIN_HIT_STOP_FRAMES, MAX_HIT_STOP_FRAMES);
  }
  const normalized = clamp((peakTrauma - 0.25) / 0.75, 0, 1);
  return clamp(
    Math.round(MIN_HIT_STOP_FRAMES + normalized * (MAX_HIT_STOP_FRAMES - MIN_HIT_STOP_FRAMES)),
    MIN_HIT_STOP_FRAMES,
    MAX_HIT_STOP_FRAMES,
  );
}

function softLimitRollDeg(rawRollDeg: number, ceilingDeg: number): number {
  if (ceilingDeg <= 0) return 0;
  return cleanZero(clamp(Math.tanh(rawRollDeg / ceilingDeg) * ceilingDeg, -ceilingDeg, ceilingDeg));
}

function buildPlanePoses(
  builder: (plane: CameraShakePlane) => PlaneShakePose,
): Readonly<Record<CameraShakePlane, PlaneShakePose>> {
  return {
    foreground: builder("foreground"),
    midground: builder("midground"),
    background: builder("background"),
  };
}

function createZeroPoseRecord(): Readonly<Record<CameraShakePlane, PlaneShakePose>> {
  const zeroPose: PlaneShakePose = Object.freeze({ dx: 0, dy: 0, rollDeg: 0, angularVelocityDegPerSec: 0 });
  return Object.freeze({ foreground: zeroPose, midground: zeroPose, background: zeroPose });
}

/** 역경직(`2..5`프레임)·다중 평면 시차·전정기관 멀미 억제 한계를 모두 충족하는 카메라 셰이크 타임라인을 생성한다. */
export function synthesizeSafeCameraShake(config: SafeCameraShakeConfig): SafeCameraShakeTimeline {
  const totalFrames = Math.max(0, Math.floor(config.totalFrames));
  const fps = config.fps ?? DEFAULT_CAMERA_SHAKE_FPS;
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new RangeError("카메라 셰이크 합성 fps는 0보다 큰 유한 실수여야 합니다.");
  }

  if (config.prefersReducedMotion === true) {
    const zeroPlanes = createZeroPoseRecord();
    const zeroFrames: SafeCameraShakeFrame[] = Array.from({ length: totalFrames }, (_, i) => ({
      frameIndex: i,
      timestampSec: i / fps,
      effectiveMotionTimeSec: i / fps,
      trauma: 0,
      traumaSquared: 0,
      isHitStopFrozen: false,
      hitStopRemainingFrames: 0,
      dx: 0,
      dy: 0,
      rollDeg: 0,
      angularVelocityDegPerSec: 0,
      planes: zeroPlanes,
    }));
    return {
      fps,
      totalFrames,
      prefersReducedMotion: true,
      maxObservedAbsRollDeg: 0,
      maxObservedAngularVelocityDegPerSec: 0,
      maxObservedTranslationPx: 0,
      hitStopWindows: [],
      nauseaBandAttenuationRatio: 0,
      frames: zeroFrames,
      comfortSummaryKo:
        "모션 줄이기(prefers-reduced-motion) 설정을 존중해 모든 프레임의 이동·회전 변위를 0으로 고정했습니다.",
    };
  }

  const seed = (config.seed ?? 20261128) | 0;
  const maxTranslationPx = Math.max(0, config.maxTranslationPx ?? 26);
  const maxRollDeg = clamp(config.maxRollDeg ?? MAX_VESTIBULAR_ROLL_DEG, 0, MAX_VESTIBULAR_ROLL_DEG);
  const maxAngularVel = Math.max(
    1,
    config.maxAngularVelocityDegPerSec ?? DEFAULT_MAX_ANGULAR_VELOCITY_DEG_PER_SEC,
  );
  const maxRollStepDeg = maxAngularVel / fps;
  const traumaDecayPerSec = Math.max(0.05, config.traumaDecayPerSec ?? 1.65);
  const dominantShakeHz = clamp(config.dominantShakeHz ?? 10.5, 3.0, 24.0);
  const highPassCutoffHz = config.highPassCutoffHz ?? DEFAULT_VESTIBULAR_HIGH_PASS_CUTOFF_HZ;
  const hitStopMinTrauma = clamp(config.hitStopMinTrauma ?? 0.28, 0.05, 1.0);

  const parallax: Record<CameraShakePlane, ParallaxPlaneFactors> = {
    foreground: config.parallaxFactors?.foreground ?? DEFAULT_PARALLAX_FACTORS.foreground,
    midground: config.parallaxFactors?.midground ?? DEFAULT_PARALLAX_FACTORS.midground,
    background: config.parallaxFactors?.background ?? DEFAULT_PARALLAX_FACTORS.background,
  };

  const impactsByFrame = new Map<number, ImpactImpulse[]>();
  for (const impact of config.impacts) {
    const idx = Math.floor(impact.frameIndex);
    if (idx < 0 || idx >= totalFrames) continue;
    const list = impactsByFrame.get(idx);
    if (list !== undefined) list.push(impact);
    else impactsByFrame.set(idx, [impact]);
  }

  const hpDx = createButterworthHighPassBiquad(fps, highPassCutoffHz);
  const hpDy = createButterworthHighPassBiquad(fps, highPassCutoffHz);
  const hpRoll = createButterworthHighPassBiquad(fps, highPassCutoffHz);

  const rawUnfilteredDx = new Float64Array(totalFrames);
  const filteredMidDx = new Float64Array(totalFrames);

  let trauma = 0;
  let effectiveMotionTimeSec = 0;
  let timeSinceLastImpactSec = 10;
  let biasX = 0;
  let biasY = 0;
  let hitStopRemaining = 0;
  let currentWindowStart = -1;
  let currentWindowBudget = 0;
  let currentWindowPeakTrauma = 0;

  let lockedPlanes = createZeroPoseRecord();
  const prevPlaneRoll: Record<CameraShakePlane, number> = { foreground: 0, midground: 0, background: 0 };

  const hitStopWindows: HitStopWindowSummary[] = [];
  const frames: SafeCameraShakeFrame[] = [];
  let maxObservedAbsRollDeg = 0;
  let maxObservedAngularVelocityDegPerSec = 0;
  let maxObservedTranslationPx = 0;

  for (let i = 0; i < totalFrames; i += 1) {
    const timestampSec = i / fps;
    const frameImpacts = impactsByFrame.get(i);

    if (frameImpacts !== undefined && frameImpacts.length > 0) {
      let requestedFreeze: number | undefined;
      for (const imp of frameImpacts) {
        trauma = clamp(trauma + Math.max(0, imp.traumaDelta), 0, 1);
        if (imp.directionalBias !== undefined) {
          biasX = clamp(imp.directionalBias.x, -1, 1);
          biasY = clamp(imp.directionalBias.y, -1, 1);
        }
        if (imp.hitStopFrames !== undefined) {
          requestedFreeze = Math.max(requestedFreeze ?? 0, imp.hitStopFrames);
        }
      }
      timeSinceLastImpactSec = 0;

      if (trauma >= hitStopMinTrauma || requestedFreeze !== undefined) {
        const freezeBudget = computeHitStopFrameBudget(trauma, requestedFreeze);
        if (hitStopRemaining > 0 && currentWindowStart >= 0) {
          hitStopWindows.push({
            startFrame: currentWindowStart,
            endFrameInclusive: i - 1,
            durationFrames: i - currentWindowStart,
            peakTraumaAtImpact: currentWindowPeakTrauma,
          });
        }
        hitStopRemaining = freezeBudget;
        currentWindowStart = i;
        currentWindowBudget = freezeBudget;
        currentWindowPeakTrauma = trauma;

        const contactSnap = trauma * trauma * maxTranslationPx * 0.22;
        const snapDx = cleanZero(stepBiquad(hpDx, (biasX !== 0 ? biasX : 0.65) * contactSnap));
        const snapDy = cleanZero(stepBiquad(hpDy, (biasY !== 0 ? biasY : -0.45) * contactSnap));
        const snapRollRaw = cleanZero(stepBiquad(hpRoll, trauma * trauma * maxRollDeg * 0.35));

        lockedPlanes = buildPlanePoses((plane) => {
          const factors = parallax[plane];
          const targetRoll = softLimitRollDeg(snapRollRaw * factors.rollScale, maxRollDeg);
          const prevRoll = prevPlaneRoll[plane];
          const slewRoll = cleanZero(clamp(targetRoll, prevRoll - maxRollStepDeg, prevRoll + maxRollStepDeg));
          prevPlaneRoll[plane] = slewRoll;
          return {
            dx: cleanZero(snapDx * factors.translationScale),
            dy: cleanZero(snapDy * factors.translationScale),
            rollDeg: slewRoll,
            angularVelocityDegPerSec: 0,
          };
        });
      }
    }

    if (hitStopRemaining > 0) {
      const frozenMid = lockedPlanes.midground;
      rawUnfilteredDx[i] = frozenMid.dx;
      filteredMidDx[i] = frozenMid.dx;
      for (const plane of CAMERA_SHAKE_PLANES) {
        const pose = lockedPlanes[plane];
        maxObservedAbsRollDeg = Math.max(maxObservedAbsRollDeg, Math.abs(pose.rollDeg));
        maxObservedTranslationPx = Math.max(maxObservedTranslationPx, Math.hypot(pose.dx, pose.dy));
      }

      frames.push({
        frameIndex: i,
        timestampSec,
        effectiveMotionTimeSec,
        trauma,
        traumaSquared: trauma * trauma,
        isHitStopFrozen: true,
        hitStopRemainingFrames: hitStopRemaining,
        dx: frozenMid.dx,
        dy: frozenMid.dy,
        rollDeg: frozenMid.rollDeg,
        angularVelocityDegPerSec: 0,
        planes: lockedPlanes,
      });

      hitStopRemaining -= 1;
      if (hitStopRemaining === 0 && currentWindowStart >= 0) {
        hitStopWindows.push({
          startFrame: currentWindowStart,
          endFrameInclusive: i,
          durationFrames: currentWindowBudget,
          peakTraumaAtImpact: currentWindowPeakTrauma,
        });
        currentWindowStart = -1;
      }
      continue;
    }

    const dt = 1 / fps;
    effectiveMotionTimeSec += dt;
    timeSinceLastImpactSec += dt;

    const traumaSq = trauma * trauma;
    const harmonicDecay = Math.exp(-timeSinceLastImpactSec * 5.2);
    const harmonicPhase = 2 * Math.PI * dominantShakeHz * effectiveMotionTimeSec;
    const harmonicX = Math.cos(harmonicPhase) * harmonicDecay;
    const harmonicY = Math.sin(harmonicPhase * 1.13 + 0.6) * harmonicDecay;

    const noiseX = sampleFractalShakeNoise(effectiveMotionTimeSec, dominantShakeHz * 0.85, seed + 11);
    const noiseY = sampleFractalShakeNoise(effectiveMotionTimeSec, dominantShakeHz * 0.91, seed + 37);
    const noiseRoll = sampleFractalShakeNoise(effectiveMotionTimeSec, dominantShakeHz * 0.74, seed + 73);

    const drift = config.ambientDrift;
    const driftPhase = drift !== undefined ? 2 * Math.PI * drift.frequencyHz * timestampSec : 0;
    const driftDx = drift !== undefined ? Math.sin(driftPhase) * drift.amplitudePx : 0;
    const driftDy = drift !== undefined ? Math.cos(driftPhase * 0.92) * drift.amplitudePx * 0.8 : 0;
    const driftRoll = drift !== undefined ? Math.sin(driftPhase * 0.88) * (drift.rollAmplitudeDeg ?? 0) : 0;

    const rawDx =
      traumaSq * maxTranslationPx * (0.55 * noiseX + 0.45 * harmonicX + 0.25 * biasX * harmonicDecay) + driftDx;
    const rawDy =
      traumaSq * maxTranslationPx * (0.55 * noiseY + 0.45 * harmonicY + 0.25 * biasY * harmonicDecay) + driftDy;
    const rawRoll =
      traumaSq * maxRollDeg * (0.65 * noiseRoll + 0.35 * Math.sin(harmonicPhase * 0.8)) + driftRoll;

    rawUnfilteredDx[i] = rawDx;
    const highPassedDx = stepBiquad(hpDx, rawDx);
    const highPassedDy = stepBiquad(hpDy, rawDy);
    const highPassedRoll = stepBiquad(hpRoll, rawRoll);
    filteredMidDx[i] = highPassedDx;

    const framePlanes = buildPlanePoses((plane) => {
      const factors = parallax[plane];
      const limitPx = maxTranslationPx * factors.translationScale;
      const dx = cleanZero(clamp(highPassedDx * factors.translationScale, -limitPx, limitPx));
      const dy = cleanZero(clamp(highPassedDy * factors.translationScale, -limitPx, limitPx));
      const desiredRoll = softLimitRollDeg(highPassedRoll * factors.rollScale, maxRollDeg);
      const prevRoll = prevPlaneRoll[plane];
      const rollDeg = cleanZero(
        clamp(
          clamp(desiredRoll, prevRoll - maxRollStepDeg, prevRoll + maxRollStepDeg),
          -MAX_VESTIBULAR_ROLL_DEG,
          MAX_VESTIBULAR_ROLL_DEG,
        ),
      );
      const angVel = cleanZero(Math.abs(rollDeg - prevRoll) * fps);
      prevPlaneRoll[plane] = rollDeg;

      maxObservedAbsRollDeg = Math.max(maxObservedAbsRollDeg, Math.abs(rollDeg));
      maxObservedAngularVelocityDegPerSec = Math.max(maxObservedAngularVelocityDegPerSec, angVel);
      maxObservedTranslationPx = Math.max(maxObservedTranslationPx, Math.hypot(dx, dy));

      return { dx, dy, rollDeg, angularVelocityDegPerSec: angVel };
    });

    const mid = framePlanes.midground;
    frames.push({
      frameIndex: i,
      timestampSec,
      effectiveMotionTimeSec,
      trauma,
      traumaSquared: traumaSq,
      isHitStopFrozen: false,
      hitStopRemainingFrames: 0,
      dx: mid.dx,
      dy: mid.dy,
      rollDeg: mid.rollDeg,
      angularVelocityDegPerSec: mid.angularVelocityDegPerSec,
      planes: framePlanes,
    });

    trauma = Math.max(0, trauma - traumaDecayPerSec * dt);
    biasX *= 0.88;
    biasY *= 0.88;
  }

  if (hitStopRemaining > 0 && currentWindowStart >= 0) {
    hitStopWindows.push({
      startFrame: currentWindowStart,
      endFrameInclusive: totalFrames - 1,
      durationFrames: totalFrames - currentWindowStart,
      peakTraumaAtImpact: currentWindowPeakTrauma,
    });
  }

  const rawNauseaRms = computeBandRmsAmplitude(rawUnfilteredDx, fps, NAUSEA_BAND_MIN_HZ, NAUSEA_BAND_MAX_HZ);
  const filteredNauseaRms = computeBandRmsAmplitude(filteredMidDx, fps, NAUSEA_BAND_MIN_HZ, NAUSEA_BAND_MAX_HZ);
  const nauseaBandAttenuationRatio = rawNauseaRms > 1e-9 ? clamp(1 - filteredNauseaRms / rawNauseaRms, 0, 1) : 1;

  return {
    fps,
    totalFrames,
    prefersReducedMotion: false,
    maxObservedAbsRollDeg,
    maxObservedAngularVelocityDegPerSec,
    maxObservedTranslationPx,
    hitStopWindows,
    nauseaBandAttenuationRatio,
    frames,
    comfortSummaryKo: `역경직 ${hitStopWindows.length}구간 합성 완료 · 최대 롤 ${maxObservedAbsRollDeg.toFixed(2)}°(상한 2.50°) · 멀미 대역(0.1–0.45Hz) ${(nauseaBandAttenuationRatio * 100).toFixed(1)}% 감쇠.`,
  };
}
