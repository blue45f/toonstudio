/**
 * Wave-88: 60fps 자이로스코프 기울기 + 스크롤 속도 리액티브 웹툰 프레임 평가기.
 *
 * 복호화된 `.tstudio-live` 패키지와 독자 실시간 상태를 받아 16.67ms 예산 안에서
 * 2.5D 자이로 시차(전면 채움 0px 검은 여백 안전), 금속·검날 정반사 이동,
 * `tan(gamma)` 빗줄기 기울기 및 스크롤 속도 연동 불티·꽃잎·연기·수면 파문,
 * 뷰포트 교차율 기반 오디오 큐 크로스페이드를 결정적으로 평가한다.
 * `prefersReducedMotion: true` 시 시차 0px, 난류 0, 정적 장식 고정, 반짝임 `<= 0.1`을 강제한다.
 */

import type {
  DecodedTstudioLiveLayer,
  DecodedTstudioLivePackage,
  DecodedTstudioLivePanel,
  ReactiveEmitterKind,
  ReactiveEmitterSpec,
  TstudioLiveAudioTrackSpec,
  TstudioLiveLayerRole,
  TstudioLiveMaterialSpec,
} from "./tstudio-live-container-codec";

export const TARGET_60FPS_FRAME_BUDGET_MS = 16.6667 as const;
export const MAX_REDUCED_MOTION_SHIMMER_INTENSITY = 0.1 as const;
export const DEFAULT_MAX_TILT_DEG = 45 as const;
export const DEFAULT_MAX_AUTO_OVERSCAN_SCALE = 1.28 as const;

export type ReactiveDegradationMode = "full-reactive" | "battery-saver" | "reduced-motion-calm";

/** 실시간 독자 센서·스크롤·접근성 입력 상태. */
export interface ReactiveReaderState {
  readonly scrollY: number;
  readonly scrollVelocityPxPerSec: number;
  readonly gyroBetaDeg: number;
  readonly gyroGammaDeg: number;
  readonly elapsedTimeMs: number;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly prefersReducedMotion: boolean;
  readonly batterySaverMode: boolean;
  readonly devicePixelRatio?: number;
}

/** 프레임 평가 세부 조정 옵션. */
export interface ReactiveEvaluationOptions {
  readonly maxTiltDeg?: number;
  readonly maxAutoOverscanScale?: number;
  readonly baseParallaxWidthRatio?: number;
}

/** 단일 레이어의 0px 검은 여백 안전 시차 변환 결과. */
export interface OverscanSafeParallaxTransform {
  readonly parallaxXPx: number;
  readonly parallaxYPx: number;
  readonly overscanScale: number;
  readonly maxSafeShiftXPx: number;
  readonly maxSafeShiftYPx: number;
  readonly exposedBlackBorderPx: number;
}

/** 금속·검날·눈동자 정반사 하이라이트 평가 결과. */
export interface SpecularLightShiftState {
  readonly lightDirection: readonly [number, number, number];
  readonly halfVector: readonly [number, number, number];
  readonly highlightAngleDeg: number;
  readonly highlightU: number;
  readonly highlightV: number;
  readonly shimmerIntensity: number;
  readonly effectiveMetallic: number;
}

/** 단일 레이어 프레임 평가 결과. */
export interface EvaluatedReactiveLayerFrame {
  readonly layerId: string;
  readonly role: TstudioLiveLayerRole;
  readonly assetIndex: number;
  readonly depthMeters: number;
  readonly fullBleed: boolean;
  readonly lockToViewportFrame: boolean;
  readonly translateXPx: number;
  readonly translateYPx: number;
  readonly parallaxXPx: number;
  readonly parallaxYPx: number;
  readonly scale: number;
  readonly opacity: number;
  readonly exposedBlackBorderPx: number;
  readonly specular: SpecularLightShiftState;
}

/** 단일 파티클 결정적 샘플. */
export interface ReactiveParticleSample {
  readonly id: number;
  readonly xNorm: number;
  readonly yNorm: number;
  readonly vxPxPerSec: number;
  readonly vyPxPerSec: number;
  readonly sizePx: number;
  readonly alpha: number;
  readonly streakLengthPx: number;
  readonly rotationDeg: number;
}

/** 파티클 방출기 프레임 평가 결과. */
export interface EvaluatedReactiveEmitterFrame {
  readonly emitterId: string;
  readonly kind: ReactiveEmitterKind;
  readonly mode: "active-physics" | "battery-throttled" | "static-calm-accent";
  readonly activeParticleCount: number;
  readonly slantAngleDeg: number;
  readonly meanVelocityXPxPerSec: number;
  readonly meanVelocityYPxPerSec: number;
  readonly effectiveSpeedPxPerSec: number;
  readonly effectiveTurbulence: number;
  readonly streakLengthPx: number;
  readonly particles: readonly ReactiveParticleSample[];
}

/** 단일 패널(컷) 프레임 평가 결과. */
export interface EvaluatedReactivePanelFrame {
  readonly panelId: string;
  readonly yPx: number;
  readonly heightPx: number;
  readonly intersectionRatio: number;
  readonly visible: boolean;
  readonly layers: readonly EvaluatedReactiveLayerFrame[];
  readonly emitters: readonly EvaluatedReactiveEmitterFrame[];
}

/** 오디오 큐 트랙 크로스페이드 평가 결과. */
export interface EvaluatedAudioCueFrame {
  readonly trackId: string;
  readonly title: string;
  readonly resourceUri: string;
  readonly loop: boolean;
  readonly intersectionRatio: number;
  readonly normalizedWeight: number;
  readonly effectiveGain: number;
  readonly stereoPan: number;
  readonly active: boolean;
}

/** 프레임 평가 성능 및 예산 진단 지표. */
export interface ReactiveFrameEvaluationMetrics {
  readonly evaluatedPanelCount: number;
  readonly visiblePanelCount: number;
  readonly evaluatedLayerCount: number;
  readonly activeParticleCount: number;
  readonly activeAudioTrackCount: number;
  readonly totalAudioWeight: number;
  readonly maxExposedBlackBorderPx: number;
  readonly estimatedGpuFrameMs: number;
  readonly within60fpsBudget: boolean;
  readonly degradationMode: ReactiveDegradationMode;
}

/** `evaluateReactiveWebtoonFrame` 최종 반환 구조. */
export interface ReactiveWebtoonFrameState {
  readonly episodeId: string;
  readonly timestampMs: number;
  readonly degradationMode: ReactiveDegradationMode;
  readonly effectiveGyroBetaDeg: number;
  readonly effectiveGyroGammaDeg: number;
  readonly effectiveScrollVelocityPxPerSec: number;
  readonly panels: readonly EvaluatedReactivePanelFrame[];
  readonly audioCues: readonly EvaluatedAudioCueFrame[];
  readonly metrics: ReactiveFrameEvaluationMetrics;
}

function sanitizeFinite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, sanitizeFinite(value, min)));
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function smoothstep01(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function hashString32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h === 0 ? 0x9e3779b9 : h >>> 0;
}

function nextXorShift32(state: number): number {
  let x = state >>> 0;
  x ^= (x << 13) >>> 0;
  x ^= x >>> 17;
  x ^= (x << 5) >>> 0;
  return x >>> 0;
}

function normalizeVec3(x: number, y: number, z: number): readonly [number, number, number] {
  const len = Math.sqrt(x * x + y * y + z * z);
  return !Number.isFinite(len) || len <= 1e-9 ? [0, 0, 1] : [x / len, y / len, z / len];
}

/** 구간 `[startYPx, endYPx]`와 현재 뷰포트 간 교차율(`0..1`)을 계산한다. */
export function evaluatePanelIntersectionRatio(
  startYPx: number,
  endYPx: number,
  scrollY: number,
  viewportHeightPx: number,
): number {
  const safeStart = sanitizeFinite(startYPx, 0);
  const safeEnd = Math.max(safeStart, sanitizeFinite(endYPx, safeStart));
  const safeScrollY = Math.max(0, sanitizeFinite(scrollY, 0));
  const safeVpH = Math.max(1, sanitizeFinite(viewportHeightPx, 1));
  const span = safeEnd - safeStart;
  if (span <= 0) return 0;
  const overlap = Math.max(0, Math.min(safeScrollY + safeVpH, safeEnd) - Math.max(safeScrollY, safeStart));
  return clamp(overlap / Math.max(1, Math.min(safeVpH, span)), 0, 1);
}

/** 광학 깊이 기반 2.5D 자이로 시차와 전면 채움 0px 검은 여백 안전 보정을 계산한다. */
export function computeOverscanSafeParallaxOffset(params: {
  readonly depthMeters: number;
  readonly fullBleed: boolean;
  readonly lockToViewportFrame: boolean;
  readonly overscanMarginPx: number;
  readonly effectiveGammaDeg: number;
  readonly effectiveBetaDeg: number;
  readonly viewportWidthPx: number;
  readonly panelHeightPx: number;
  readonly prefersReducedMotion: boolean;
  readonly baseParallaxWidthRatio: number;
  readonly maxAutoOverscanScale: number;
}): OverscanSafeParallaxTransform {
  if (params.prefersReducedMotion || params.lockToViewportFrame) {
    const safeOverscan = Math.max(0, params.overscanMarginPx);
    return {
      parallaxXPx: 0,
      parallaxYPx: 0,
      overscanScale: 1,
      maxSafeShiftXPx: safeOverscan,
      maxSafeShiftYPx: safeOverscan,
      exposedBlackBorderPx: 0,
    };
  }

  const width = Math.max(1, sanitizeFinite(params.viewportWidthPx, 390));
  const height = Math.max(1, sanitizeFinite(params.panelHeightPx, 640));
  const overscan = Math.max(0, sanitizeFinite(params.overscanMarginPx, 0));
  const opticalGain = 1 / clamp(params.depthMeters, 0.35, 65.535);
  const baseSpanX = width * clamp(params.baseParallaxWidthRatio, 0.02, 0.4);
  const baseSpanY = Math.min(width, height) * clamp(params.baseParallaxWidthRatio * 0.65, 0.01, 0.3);
  const rawShiftX = Math.sin(degToRad(params.effectiveGammaDeg)) * opticalGain * baseSpanX;
  const rawShiftY = Math.sin(degToRad(params.effectiveBetaDeg)) * opticalGain * baseSpanY;

  if (!params.fullBleed) {
    const maxX = width * 0.25;
    const maxY = height * 0.2;
    return {
      parallaxXPx: clamp(rawShiftX, -maxX, maxX),
      parallaxYPx: clamp(rawShiftY, -maxY, maxY),
      overscanScale: 1,
      maxSafeShiftXPx: maxX,
      maxSafeShiftYPx: maxY,
      exposedBlackBorderPx: 0,
    };
  }

  const halfW = width * 0.5;
  const halfH = height * 0.5;
  const coveredHalfW = halfW + overscan;
  const coveredHalfH = halfH + overscan;
  let scale = 1;
  if (Math.abs(rawShiftX) > overscan || Math.abs(rawShiftY) > overscan) {
    const reqX = (halfW + Math.abs(rawShiftX)) / Math.max(1, coveredHalfW);
    const reqY = (halfH + Math.abs(rawShiftY)) / Math.max(1, coveredHalfH);
    scale = clamp(Math.max(1, reqX, reqY), 1, Math.max(1, params.maxAutoOverscanScale));
  }

  const maxSafeShiftXPx = Math.max(0, coveredHalfW * scale - halfW);
  const maxSafeShiftYPx = Math.max(0, coveredHalfH * scale - halfH);
  const parallaxXPx = clamp(rawShiftX, -Math.max(0, maxSafeShiftXPx - 1e-6), Math.max(0, maxSafeShiftXPx - 1e-6));
  const parallaxYPx = clamp(rawShiftY, -Math.max(0, maxSafeShiftYPx - 1e-6), Math.max(0, maxSafeShiftYPx - 1e-6));

  const leftEdge = halfW - coveredHalfW * scale + parallaxXPx;
  const rightEdge = halfW + coveredHalfW * scale + parallaxXPx;
  const topEdge = halfH - coveredHalfH * scale + parallaxYPx;
  const bottomEdge = halfH + coveredHalfH * scale + parallaxYPx;
  const rawExposed = Math.max(0, leftEdge, width - rightEdge, topEdge, height - bottomEdge);

  return {
    parallaxXPx,
    parallaxYPx,
    overscanScale: scale,
    maxSafeShiftXPx,
    maxSafeShiftYPx,
    exposedBlackBorderPx: rawExposed < 1e-7 ? 0 : rawExposed,
  };
}

/** 자이로 기울기와 레이어 재질(금속성·거칠기·마스크)로 정반사 하이라이트 벡터와 시머 강도를 계산한다. */
export function computeSpecularLightShift(params: {
  readonly material: TstudioLiveMaterialSpec;
  readonly effectiveGammaDeg: number;
  readonly effectiveBetaDeg: number;
  readonly prefersReducedMotion: boolean;
  readonly batterySaverMode: boolean;
}): SpecularLightShiftState {
  const mat = params.material;
  let maskPeakMetallic = 0;
  if (mat.metallicMaskBytes) {
    for (let i = 0; i < mat.metallicMaskBytes.length; i += 1) {
      const val = (mat.metallicMaskBytes[i] ?? 0) / 255;
      if (val > maskPeakMetallic) maskPeakMetallic = val;
    }
  }
  const effectiveMetallic = clamp(Math.max(mat.metallic, maskPeakMetallic * 0.85), 0, 1);

  if (params.prefersReducedMotion) {
    const neutralLight = normalizeVec3(0, -0.35, 0.9367);
    const neutralHalf = normalizeVec3(neutralLight[0], neutralLight[1], neutralLight[2] + 1);
    return {
      lightDirection: neutralLight,
      halfVector: neutralHalf,
      highlightAngleDeg: 0,
      highlightU: 0.5,
      highlightV: 0.45,
      shimmerIntensity: clamp(
        mat.specularStrength * (0.2 + 0.8 * effectiveMetallic) * 0.12,
        0,
        MAX_REDUCED_MOTION_SHIMMER_INTENSITY,
      ),
      effectiveMetallic,
    };
  }

  const lxRaw = Math.sin(degToRad(clamp(params.effectiveGammaDeg * 1.45, -65, 65)));
  const lyRaw = clamp(-0.32 + Math.sin(degToRad(params.effectiveBetaDeg * 1.15)) * 0.48, -0.85, 0.85);
  const lzRaw = Math.sqrt(Math.max(0.08, 1 - Math.min(0.92, lxRaw * lxRaw + lyRaw * lyRaw)));
  const lightDirection = normalizeVec3(lxRaw, lyRaw, lzRaw);
  const halfVector = normalizeVec3(lightDirection[0], lightDirection[1], lightDirection[2] + 1);

  const smoothness = clamp(1 - mat.roughness, 0, 1);
  const shininessExp = 1.5 + smoothness * 10;
  const fresnelFactor = 0.22 + 0.78 * effectiveMetallic;
  const tiltEnergy = clamp(Math.hypot(params.effectiveGammaDeg, params.effectiveBetaDeg) / 22, 0, 1);
  let shimmer =
    mat.specularStrength *
    fresnelFactor *
    (0.3 + 0.7 * smoothness) *
    (0.35 + 0.65 * Math.pow(clamp(halfVector[2], 0, 1), shininessExp * 0.25)) *
    (0.45 + 0.55 * tiltEnergy);
  if (params.batterySaverMode) shimmer *= 0.65;

  return {
    lightDirection,
    halfVector,
    highlightAngleDeg: radToDeg(Math.atan2(lightDirection[0], Math.max(0.05, lightDirection[2]))),
    highlightU: clamp(0.5 + lightDirection[0] * 0.44, 0.04, 0.96),
    highlightV: clamp(0.46 + lightDirection[1] * 0.36, 0.04, 0.96),
    shimmerIntensity: clamp(shimmer, 0, 1),
    effectiveMetallic,
  };
}

/** 단일 반응형 파티클 방출기의 `tan(gamma)` 기울기·스크롤 속도 연동 운동학을 평가한다. */
export function evaluateReactiveEmitterParticles(params: {
  readonly panelId: string;
  readonly emitter: ReactiveEmitterSpec;
  readonly effectiveGammaDeg: number;
  readonly scrollVelocityPxPerSec: number;
  readonly elapsedTimeMs: number;
  readonly panelWidthPx: number;
  readonly panelHeightPx: number;
  readonly prefersReducedMotion: boolean;
  readonly batterySaverMode: boolean;
}): EvaluatedReactiveEmitterFrame {
  const { emitter } = params;
  const seed = hashString32(`${params.panelId}:${emitter.id}:${emitter.kind}`);

  if (params.prefersReducedMotion) {
    const staticCount = Math.min(emitter.particleCount, emitter.reducedMotionStaticCount);
    const particles: ReactiveParticleSample[] = [];
    let rng = seed;
    for (let i = 0; i < staticCount; i += 1) {
      rng = nextXorShift32(rng);
      const rx = (rng & 0xffff) / 0xffff;
      rng = nextXorShift32(rng);
      const ry = (rng & 0xffff) / 0xffff;
      rng = nextXorShift32(rng);
      const sz = (rng & 0xff) / 0xff;
      particles.push({
        id: i,
        xNorm: clamp(emitter.region.xRatio + rx * emitter.region.widthRatio, 0, 1),
        yNorm: clamp(emitter.region.yRatio + ry * emitter.region.heightRatio, 0, 1),
        vxPxPerSec: 0,
        vyPxPerSec: 0,
        sizePx: 2 + sz * 3.5,
        alpha: 0.22 + sz * 0.16,
        streakLengthPx: 2,
        rotationDeg: 0,
      });
    }
    return {
      emitterId: emitter.id,
      kind: emitter.kind,
      mode: "static-calm-accent",
      activeParticleCount: staticCount,
      slantAngleDeg: 0,
      meanVelocityXPxPerSec: 0,
      meanVelocityYPxPerSec: 0,
      effectiveSpeedPxPerSec: 0,
      effectiveTurbulence: 0,
      streakLengthPx: 2,
      particles,
    };
  }

  const activeParticleCount = Math.max(1, Math.floor(emitter.particleCount * (params.batterySaverMode ? 0.5 : 1)));
  const scrollSpeed = Math.abs(sanitizeFinite(params.scrollVelocityPxPerSec, 0));
  const scrollSign = params.scrollVelocityPxPerSec >= 0 ? 1 : -1;
  const tanGamma = Math.tan(degToRad(clamp(params.effectiveGammaDeg, -45, 45)));
  const effectiveTurbulence = params.batterySaverMode ? emitter.turbulence * 0.5 : emitter.turbulence;

  let meanVx: number;
  let meanVy: number;
  let slantAngleDeg: number;
  let streakLengthPx: number;

  if (emitter.kind === "rain") {
    meanVy = Math.max(10, emitter.baseSpeedPxPerSec + scrollSpeed * emitter.scrollVelocityCoupling * 0.2);
    meanVx = tanGamma * emitter.baseSpeedPxPerSec * emitter.tiltCoupling + emitter.windDriftPxPerSec;
    slantAngleDeg = clamp(radToDeg(Math.atan2(meanVx, meanVy)), -48, 48);
    streakLengthPx = clamp(Math.hypot(meanVx, meanVy) * 0.028, 6, 56);
  } else if (emitter.kind === "ripples") {
    meanVy = 0;
    meanVx = tanGamma * emitter.baseSpeedPxPerSec * emitter.tiltCoupling * 0.3;
    slantAngleDeg = clamp(params.effectiveGammaDeg * emitter.tiltCoupling * 0.4, -20, 20);
    streakLengthPx = clamp(4 + (emitter.baseSpeedPxPerSec + scrollSpeed * emitter.scrollVelocityCoupling * 0.18) * 0.02, 4, 28);
  } else {
    const boostCoeff = emitter.kind === "embers" ? 0.55 : emitter.kind === "petals" ? 0.45 : 0.32;
    const scrollBoost = scrollSpeed * emitter.scrollVelocityCoupling * boostCoeff;
    meanVy = (emitter.kind === "petals" ? 1 : -1) * (emitter.baseSpeedPxPerSec + scrollBoost);
    meanVx =
      emitter.windDriftPxPerSec +
      tanGamma * emitter.baseSpeedPxPerSec * emitter.tiltCoupling * 0.5 +
      scrollSign * scrollBoost * 0.22;
    slantAngleDeg = clamp(radToDeg(Math.atan2(meanVx, Math.max(1, Math.abs(meanVy)))), -48, 48);
    streakLengthPx = clamp(2.5 + Math.hypot(meanVx, meanVy) * 0.015, 2.5, 36);
  }

  const timeSec = Math.max(0, sanitizeFinite(params.elapsedTimeMs, 0)) / 1000;
  const safeW = Math.max(1, params.panelWidthPx);
  const safeH = Math.max(1, params.panelHeightPx);
  const particles: ReactiveParticleSample[] = [];
  let rng = seed;
  for (let i = 0; i < activeParticleCount; i += 1) {
    rng = nextXorShift32(rng);
    const seedX = (rng & 0xffff) / 0xffff;
    rng = nextXorShift32(rng);
    const seedY = (rng & 0xffff) / 0xffff;
    rng = nextXorShift32(rng);
    const speedJitter = 0.78 + ((rng & 0xff) / 0xff) * 0.44;
    rng = nextXorShift32(rng);
    const phase = ((rng & 0xffff) / 0xffff) * Math.PI * 2;

    const vx = meanVx * speedJitter + Math.sin(timeSec * 3.1 + phase) * effectiveTurbulence * 42;
    const vy = meanVy * speedJitter + Math.cos(timeSec * 2.4 + phase) * effectiveTurbulence * 20;
    const wrappedX = (((seedX + (vx * timeSec) / safeW) % 1) + 1) % 1;
    const wrappedY = (((seedY + (vy * timeSec) / safeH) % 1) + 1) % 1;
    particles.push({
      id: i,
      xNorm: clamp(emitter.region.xRatio + wrappedX * emitter.region.widthRatio, 0, 1),
      yNorm: clamp(emitter.region.yRatio + wrappedY * emitter.region.heightRatio, 0, 1),
      vxPxPerSec: vx,
      vyPxPerSec: vy,
      sizePx: emitter.kind === "rain" ? 1.5 + speedJitter : 2.5 + speedJitter * 4,
      alpha: clamp(0.4 + speedJitter * 0.45, 0.15, 0.95),
      streakLengthPx: streakLengthPx * speedJitter,
      rotationDeg: slantAngleDeg,
    });
  }

  return {
    emitterId: emitter.id,
    kind: emitter.kind,
    mode: params.batterySaverMode ? "battery-throttled" : "active-physics",
    activeParticleCount,
    slantAngleDeg,
    meanVelocityXPxPerSec: meanVx,
    meanVelocityYPxPerSec: meanVy,
    effectiveSpeedPxPerSec: Math.hypot(meanVx, meanVy),
    effectiveTurbulence,
    streakLengthPx,
    particles,
  };
}

/** 스크롤 위치와 뷰포트 교차율로 오디오 큐 트랙의 연속 크로스페이드 게인을 계산한다(가중치 합 `<= 1.0`). */
export function evaluateAudioCueCrossfades(params: {
  readonly audioTracks: readonly TstudioLiveAudioTrackSpec[];
  readonly scrollY: number;
  readonly viewportHeightPx: number;
  readonly effectiveGammaDeg: number;
  readonly prefersReducedMotion: boolean;
}): readonly EvaluatedAudioCueFrame[] {
  const safeScrollY = Math.max(0, sanitizeFinite(params.scrollY, 0));
  const safeVpH = Math.max(1, sanitizeFinite(params.viewportHeightPx, 844));
  const rawEntries = params.audioTracks.map((track) => {
    const intersectionRatio = evaluatePanelIntersectionRatio(track.startYPx, track.endYPx, safeScrollY, safeVpH);
    const margin = Math.max(1, track.crossfadeMarginPx);
    const envelope = smoothstep01((safeScrollY + safeVpH - track.startYPx) / margin) *
      smoothstep01((track.endYPx - safeScrollY) / margin);
    const rawWeight = intersectionRatio > 0 ? clamp(intersectionRatio * (0.35 + 0.65 * envelope), 0, 1) : 0;
    return { track, intersectionRatio, rawWeight };
  });

  let rawSum = 0;
  for (const item of rawEntries) rawSum += item.rawWeight;
  const normScale = rawSum > 1 ? 1 / rawSum : 1;

  return rawEntries.map(({ track, intersectionRatio, rawWeight }) => {
    const normalizedWeight = clamp(rawWeight * normScale, 0, 1);
    const effectiveGain = clamp(track.baseGain * normalizedWeight, 0, 1);
    return {
      trackId: track.trackId,
      title: track.title,
      resourceUri: track.resourceUri,
      loop: track.loop,
      intersectionRatio,
      normalizedWeight,
      effectiveGain,
      stereoPan: params.prefersReducedMotion ? 0 : clamp(track.spatialPanBias + (params.effectiveGammaDeg / 45) * 0.25, -1, 1),
      active: effectiveGain > 1e-4,
    };
  });
}

function evaluatePanel(
  panel: DecodedTstudioLivePanel,
  ctx: {
    readonly scrollY: number;
    readonly scrollVelocityPxPerSec: number;
    readonly effectiveGammaDeg: number;
    readonly effectiveBetaDeg: number;
    readonly elapsedTimeMs: number;
    readonly viewportWidthPx: number;
    readonly viewportHeightPx: number;
    readonly prefersReducedMotion: boolean;
    readonly batterySaverMode: boolean;
    readonly baseParallaxWidthRatio: number;
    readonly maxAutoOverscanScale: number;
  },
): EvaluatedReactivePanelFrame {
  const intersectionRatio = evaluatePanelIntersectionRatio(panel.yPx, panel.yPx + panel.heightPx, ctx.scrollY, ctx.viewportHeightPx);
  const visible = intersectionRatio > 0;
  const layers: EvaluatedReactiveLayerFrame[] = visible
    ? panel.layers.map((layer: DecodedTstudioLiveLayer) => {
        const parallax = computeOverscanSafeParallaxOffset({
          depthMeters: layer.depthMeters,
          fullBleed: layer.fullBleed,
          lockToViewportFrame: layer.lockToViewportFrame,
          overscanMarginPx: layer.overscanMarginPx,
          effectiveGammaDeg: ctx.effectiveGammaDeg,
          effectiveBetaDeg: ctx.effectiveBetaDeg,
          viewportWidthPx: ctx.viewportWidthPx,
          panelHeightPx: panel.heightPx,
          prefersReducedMotion: ctx.prefersReducedMotion,
          baseParallaxWidthRatio: ctx.baseParallaxWidthRatio,
          maxAutoOverscanScale: ctx.maxAutoOverscanScale,
        });
        return {
          layerId: layer.id,
          role: layer.role,
          assetIndex: layer.assetIndex,
          depthMeters: layer.depthMeters,
          fullBleed: layer.fullBleed,
          lockToViewportFrame: layer.lockToViewportFrame,
          translateXPx: layer.baseOffsetXPx + parallax.parallaxXPx,
          translateYPx: layer.baseOffsetYPx + parallax.parallaxYPx,
          parallaxXPx: parallax.parallaxXPx,
          parallaxYPx: parallax.parallaxYPx,
          scale: parallax.overscanScale,
          opacity: layer.opacity,
          exposedBlackBorderPx: parallax.exposedBlackBorderPx,
          specular: computeSpecularLightShift({
            material: layer.material,
            effectiveGammaDeg: ctx.effectiveGammaDeg,
            effectiveBetaDeg: ctx.effectiveBetaDeg,
            prefersReducedMotion: ctx.prefersReducedMotion,
            batterySaverMode: ctx.batterySaverMode,
          }),
        };
      })
    : [];

  const emitters: EvaluatedReactiveEmitterFrame[] = visible
    ? panel.emitters.map((emitter) =>
        evaluateReactiveEmitterParticles({
          panelId: panel.id,
          emitter,
          effectiveGammaDeg: ctx.effectiveGammaDeg,
          scrollVelocityPxPerSec: ctx.scrollVelocityPxPerSec,
          elapsedTimeMs: ctx.elapsedTimeMs,
          panelWidthPx: ctx.viewportWidthPx,
          panelHeightPx: panel.heightPx,
          prefersReducedMotion: ctx.prefersReducedMotion,
          batterySaverMode: ctx.batterySaverMode,
        }),
      )
    : [];

  return { panelId: panel.id, yPx: panel.yPx, heightPx: panel.heightPx, intersectionRatio, visible, layers, emitters };
}

/** 복호화된 `.tstudio-live` 에피소드와 독자 실시간 상태로 60fps 단일 프레임 장면을 평가한다. */
export function evaluateReactiveWebtoonFrame(
  pkg: DecodedTstudioLivePackage,
  readerState: ReactiveReaderState,
  options?: ReactiveEvaluationOptions,
): ReactiveWebtoonFrameState {
  const maxTiltDeg = clamp(options?.maxTiltDeg ?? DEFAULT_MAX_TILT_DEG, 5, 60);
  const maxAutoOverscanScale = clamp(options?.maxAutoOverscanScale ?? DEFAULT_MAX_AUTO_OVERSCAN_SCALE, 1, 1.6);
  const baseParallaxWidthRatio = clamp(options?.baseParallaxWidthRatio ?? 0.16, 0.02, 0.35);

  const viewportWidthPx = Math.max(1, sanitizeFinite(readerState.viewportWidthPx, 390));
  const viewportHeightPx = Math.max(1, sanitizeFinite(readerState.viewportHeightPx, 844));
  const scrollY = Math.max(0, sanitizeFinite(readerState.scrollY, 0));
  const elapsedTimeMs = Math.max(0, sanitizeFinite(readerState.elapsedTimeMs, 0));
  const prefersReducedMotion = Boolean(readerState.prefersReducedMotion);
  const batterySaverMode = Boolean(readerState.batterySaverMode);
  const degradationMode: ReactiveDegradationMode = prefersReducedMotion
    ? "reduced-motion-calm"
    : batterySaverMode
      ? "battery-saver"
      : "full-reactive";

  const tiltScale = prefersReducedMotion ? 0 : batterySaverMode ? 0.55 : 1;
  const effectiveGammaDeg = clamp(sanitizeFinite(readerState.gyroGammaDeg, 0), -maxTiltDeg, maxTiltDeg) * tiltScale;
  const effectiveBetaDeg = clamp(sanitizeFinite(readerState.gyroBetaDeg, 0), -maxTiltDeg, maxTiltDeg) * tiltScale;
  const effectiveScrollVelocityPxPerSec = prefersReducedMotion
    ? 0
    : clamp(sanitizeFinite(readerState.scrollVelocityPxPerSec, 0), -12000, 12000);

  const panels = pkg.panels.map((panel) =>
    evaluatePanel(panel, {
      scrollY,
      scrollVelocityPxPerSec: effectiveScrollVelocityPxPerSec,
      effectiveGammaDeg,
      effectiveBetaDeg,
      elapsedTimeMs,
      viewportWidthPx,
      viewportHeightPx,
      prefersReducedMotion,
      batterySaverMode,
      baseParallaxWidthRatio,
      maxAutoOverscanScale,
    }),
  );

  const audioCues = evaluateAudioCueCrossfades({
    audioTracks: pkg.audioTracks,
    scrollY,
    viewportHeightPx,
    effectiveGammaDeg,
    prefersReducedMotion,
  });

  let visiblePanelCount = 0, evaluatedLayerCount = 0, activeParticleCount = 0, maxExposedBlackBorderPx = 0;
  for (const p of panels) {
    if (p.visible) visiblePanelCount += 1;
    evaluatedLayerCount += p.layers.length;
    for (const l of p.layers) {
      if (l.exposedBlackBorderPx > maxExposedBlackBorderPx) maxExposedBlackBorderPx = l.exposedBlackBorderPx;
    }
    for (const em of p.emitters) activeParticleCount += em.activeParticleCount;
  }

  let activeAudioTrackCount = 0, totalAudioWeight = 0;
  for (const c of audioCues) {
    if (c.active) activeAudioTrackCount += 1;
    totalAudioWeight += c.normalizedWeight;
  }

  const gpuMult = degradationMode === "reduced-motion-calm" ? 0.55 : degradationMode === "battery-saver" ? 0.72 : 1;
  const estimatedGpuFrameMs =
    (0.65 + evaluatedLayerCount * 0.32 + activeParticleCount * 0.011 + activeAudioTrackCount * 0.08) * gpuMult;

  return {
    episodeId: pkg.episode.episodeId,
    timestampMs: elapsedTimeMs,
    degradationMode,
    effectiveGyroBetaDeg: effectiveBetaDeg,
    effectiveGyroGammaDeg: effectiveGammaDeg,
    effectiveScrollVelocityPxPerSec,
    panels,
    audioCues,
    metrics: {
      evaluatedPanelCount: panels.length,
      visiblePanelCount,
      evaluatedLayerCount,
      activeParticleCount,
      activeAudioTrackCount,
      totalAudioWeight,
      maxExposedBlackBorderPx,
      estimatedGpuFrameMs,
      within60fpsBudget: estimatedGpuFrameMs < TARGET_60FPS_FRAME_BUDGET_MS,
      degradationMode,
    },
  };
}
