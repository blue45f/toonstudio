/**
 * 가상 스튜디오 시간대·날씨·감정 멀티레이어 VFX 및 8섹터 방사형 이모트 휠 엔진.
 *
 * - 4종 시간대(`dawn`, `day`, `sunset`, `night`) 광원 색온도(K)·태양 고도·그림자 각도 프로파일
 * - 5종 파티클(발걸음 먼지, 커피 스팀, 창가 빗줄기, 벚꽃 잎, 집중 오라 링) 3계층(배경·중경·전경) 물리 시뮬레이터
 * - 8섹터 방사형 이모트/액션 휠(북쪽 0도 시계방향 각도 → 섹터 인덱스 매핑, 쿨다운, 한국어 접근성 라벨)
 */

import { advanceDeterministicRng, clampScalar } from "./sprite-physics-engine";

export type TimeOfDayId = "dawn" | "day" | "sunset" | "night";
export type WeatherMoodPresetId = "clear-breeze" | "rainy-window" | "spring-blossom" | "deep-focus";
export type AtmosphereParticleKind = "footstep-dust" | "coffee-steam" | "window-rain" | "cherry-blossom" | "focus-aura-ring";
export type ParticleDepthLayer = "background" | "midground" | "foreground";
export type RadialEmoteId =
  | "cheer"
  | "coffee-break"
  | "focus-lock"
  | "sketch-spark"
  | "stretch"
  | "feedback-ping"
  | "music-vibe"
  | "deadline-victory";

export interface TimeOfDayLightingProfile {
  readonly id: TimeOfDayId;
  readonly labelKo: string;
  readonly shortLabelKo: string;
  readonly timeWindowKo: string;
  readonly moodDescriptionKo: string;
  readonly colorTemperatureK: number;
  readonly sunElevationDeg: number;
  readonly shadowAngleDeg: number;
  readonly shadowLengthRatio: number;
  readonly shadowOpacity: number;
  readonly ambientLux: number;
  readonly semanticSurfaceClass: string;
  readonly semanticBadgeClass: string;
}

export interface DirectionalShadowProjection {
  readonly dxPx: number;
  readonly dyPx: number;
  readonly lengthPx: number;
  readonly skewDeg: number;
  readonly blurPx: number;
  readonly opacity: number;
}

export interface InterpolatedLightingSnapshot {
  readonly colorTemperatureK: number;
  readonly sunElevationDeg: number;
  readonly shadowAngleDeg: number;
  readonly shadowLengthRatio: number;
  readonly shadowOpacity: number;
  readonly ambientLux: number;
}

export interface WeatherMoodPreset {
  readonly id: WeatherMoodPresetId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly rainRatePerSec: number;
  readonly blossomRatePerSec: number;
  readonly coffeeSteamRatePerSec: number;
  readonly focusAuraRatePerSec: number;
  readonly windPxPerSec: number;
}

export interface AtmosphereParticle {
  readonly id: number;
  readonly kind: AtmosphereParticleKind;
  readonly layer: ParticleDepthLayer;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly radiusPx: number;
  readonly maxRadiusPx: number;
  readonly rotationDeg: number;
  readonly angularVelDegPerSec: number;
  readonly ageSec: number;
  readonly lifeSec: number;
  readonly opacity: number;
  readonly flutterPhaseRad: number;
}

export interface AtmosphereParticleSystem {
  readonly particles: readonly AtmosphereParticle[];
  readonly nextParticleId: number;
  readonly rngState: number;
  readonly weatherPreset: WeatherMoodPresetId;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly maxParticles: number;
  readonly elapsedSec: number;
  readonly rainAccumulator: number;
  readonly blossomAccumulator: number;
  readonly steamAccumulator: number;
  readonly auraAccumulator: number;
}

export interface ParticleEmitterAnchors {
  readonly coffeeMugPosition?: { readonly x: number; readonly y: number };
  readonly focusCenterPosition?: { readonly x: number; readonly y: number };
  readonly enableCoffeeSteam?: boolean;
  readonly enableFocusAura?: boolean;
}

export interface ParticleLayerSummary {
  readonly total: number;
  readonly byLayer: Readonly<Record<ParticleDepthLayer, number>>;
  readonly byKind: Readonly<Record<AtmosphereParticleKind, number>>;
}

export interface RadialEmoteSector {
  readonly index: number;
  readonly id: RadialEmoteId;
  readonly labelKo: string;
  readonly shortKo: string;
  readonly ariaLabelKo: string;
  readonly clockPositionKo: string;
  readonly centerAngleDeg: number;
  readonly cooldownSec: number;
  readonly hotkeyDigit: string;
  readonly linkedParticleKind: AtmosphereParticleKind;
}

export interface RadialSectorMappingResult {
  readonly inDeadZone: boolean;
  readonly distancePx: number;
  readonly angleFromNorthDeg: number;
  readonly sectorIndex: number | null;
  readonly sector: RadialEmoteSector | null;
}

export interface EmoteWheelState {
  readonly activeSectorIndex: number | null;
  readonly lastTriggeredId: RadialEmoteId | null;
  readonly lastTriggeredAtMs: number | null;
  readonly cooldownUntilMsById: Readonly<Partial<Record<RadialEmoteId, number>>>;
  readonly triggerCount: number;
}

export interface EmoteTriggerResult {
  readonly nextState: EmoteWheelState;
  readonly accepted: boolean;
  readonly reason: "triggered" | "cooldown" | "invalid-sector";
  readonly sector: RadialEmoteSector | null;
  readonly remainingCooldownMs: number;
  readonly announcementKo: string;
}

export const TIME_OF_DAY_PROFILES: Readonly<Record<TimeOfDayId, TimeOfDayLightingProfile>> = {
  dawn: {
    id: "dawn",
    labelKo: "새벽 여명",
    shortLabelKo: "새벽",
    timeWindowKo: "05:30–07:30",
    moodDescriptionKo: "창가로 스며드는 차분한 3600K 아침 햇살과 긴 대각선 그림자",
    colorTemperatureK: 3600,
    sunElevationDeg: 18,
    shadowAngleDeg: 128,
    shadowLengthRatio: 1.55,
    shadowOpacity: 0.34,
    ambientLux: 240,
    semanticSurfaceClass: "bg-info-soft border-cool/40",
    semanticBadgeClass: "bg-info-soft text-cool border-cool/40",
  },
  day: {
    id: "day",
    labelKo: "한낮 작업광",
    shortLabelKo: "낮",
    timeWindowKo: "11:00–15:30",
    moodDescriptionKo: "색 보정에 안정적인 5600K 주광과 짧은 정오 그림자",
    colorTemperatureK: 5600,
    sunElevationDeg: 64,
    shadowAngleDeg: 168,
    shadowLengthRatio: 0.58,
    shadowOpacity: 0.42,
    ambientLux: 920,
    semanticSurfaceClass: "bg-card border-line",
    semanticBadgeClass: "bg-good-soft text-good border-good/40",
  },
  sunset: {
    id: "sunset",
    labelKo: "노을 골든아워",
    shortLabelKo: "노을",
    timeWindowKo: "17:30–19:30",
    moodDescriptionKo: "따뜻한 2800K 석양 역광과 서쪽으로 길게 뻗는 그림자",
    colorTemperatureK: 2800,
    sunElevationDeg: 14,
    shadowAngleDeg: 238,
    shadowLengthRatio: 1.72,
    shadowOpacity: 0.48,
    ambientLux: 360,
    semanticSurfaceClass: "bg-accent-soft border-accent/40",
    semanticBadgeClass: "bg-accent-soft text-accent border-accent/40",
  },
  night: {
    id: "night",
    labelKo: "심야 데스크램프",
    shortLabelKo: "심야",
    timeWindowKo: "21:30–03:30",
    moodDescriptionKo: "7400K 창밖 달빛과 스탠드 집중광이 교차하는 마감 분위기",
    colorTemperatureK: 7400,
    sunElevationDeg: 32,
    shadowAngleDeg: 312,
    shadowLengthRatio: 1.08,
    shadowOpacity: 0.56,
    ambientLux: 95,
    semanticSurfaceClass: "bg-panel border-line-strong",
    semanticBadgeClass: "bg-warning-soft text-warn border-warn/40",
  },
};

export const TIME_OF_DAY_LIST: readonly TimeOfDayLightingProfile[] = [
  TIME_OF_DAY_PROFILES.dawn,
  TIME_OF_DAY_PROFILES.day,
  TIME_OF_DAY_PROFILES.sunset,
  TIME_OF_DAY_PROFILES.night,
];

export const WEATHER_MOOD_PRESETS: Readonly<Record<WeatherMoodPresetId, WeatherMoodPreset>> = {
  "clear-breeze": {
    id: "clear-breeze",
    labelKo: "맑은 미풍",
    descriptionKo: "잔잔한 커피 스팀과 산뜻한 작업실 공기",
    rainRatePerSec: 0,
    blossomRatePerSec: 0.35,
    coffeeSteamRatePerSec: 2.2,
    focusAuraRatePerSec: 0,
    windPxPerSec: 12,
  },
  "rainy-window": {
    id: "rainy-window",
    labelKo: "창가 빗줄기",
    descriptionKo: "배경 창문 유리로 사선 빗줄기가 흐르고 머그컵 김이 피어오름",
    rainRatePerSec: 11,
    blossomRatePerSec: 0,
    coffeeSteamRatePerSec: 2.8,
    focusAuraRatePerSec: 0.35,
    windPxPerSec: -28,
  },
  "spring-blossom": {
    id: "spring-blossom",
    labelKo: "봄 벚꽃 바람",
    descriptionKo: "전경 레이어를 따라 벚꽃 잎이 회전하며 천천히 흩날림",
    rainRatePerSec: 0,
    blossomRatePerSec: 4.5,
    coffeeSteamRatePerSec: 1.8,
    focusAuraRatePerSec: 0,
    windPxPerSec: 26,
  },
  "deep-focus": {
    id: "deep-focus",
    labelKo: "마감 집중 오라",
    descriptionKo: "캐릭터 발밑에서 동심원 집중 오라 링이 규칙적으로 확산",
    rainRatePerSec: 0,
    blossomRatePerSec: 0,
    coffeeSteamRatePerSec: 1.5,
    focusAuraRatePerSec: 1.35,
    windPxPerSec: 4,
  },
};

export const WEATHER_MOOD_LIST: readonly WeatherMoodPreset[] = [
  WEATHER_MOOD_PRESETS["clear-breeze"],
  WEATHER_MOOD_PRESETS["rainy-window"],
  WEATHER_MOOD_PRESETS["spring-blossom"],
  WEATHER_MOOD_PRESETS["deep-focus"],
];

export const PARTICLE_KIND_LABEL_KO: Readonly<Record<AtmosphereParticleKind, string>> = {
  "footstep-dust": "발걸음 먼지",
  "coffee-steam": "커피 스팀",
  "window-rain": "창가 빗줄기",
  "cherry-blossom": "벚꽃 잎",
  "focus-aura-ring": "집중 오라 링",
};

export const PARTICLE_LAYER_LABEL_KO: Readonly<Record<ParticleDepthLayer, string>> = {
  background: "배경",
  midground: "중경",
  foreground: "전경",
};

export const RADIAL_EMOTE_SECTORS: readonly RadialEmoteSector[] = [
  { index: 0, id: "cheer", labelKo: "응원 박수", shortKo: "응원", ariaLabelKo: "응원 박수 이모트 · 12시 북쪽 섹터 (단축키 1)", clockPositionKo: "12시", centerAngleDeg: 0, cooldownSec: 2.5, hotkeyDigit: "1", linkedParticleKind: "cherry-blossom" },
  { index: 1, id: "coffee-break", labelKo: "커피 한 잔", shortKo: "커피", ariaLabelKo: "커피 한 잔 휴식 제안 · 1시 반 북동 섹터 (단축키 2)", clockPositionKo: "1시 반", centerAngleDeg: 45, cooldownSec: 4, hotkeyDigit: "2", linkedParticleKind: "coffee-steam" },
  { index: 2, id: "focus-lock", labelKo: "마감 집중", shortKo: "집중", ariaLabelKo: "마감 집중 오라 켜기 · 3시 동쪽 섹터 (단축키 3)", clockPositionKo: "3시", centerAngleDeg: 90, cooldownSec: 3, hotkeyDigit: "3", linkedParticleKind: "focus-aura-ring" },
  { index: 3, id: "sketch-spark", labelKo: "아이디어 번뜩", shortKo: "영감", ariaLabelKo: "아이디어 번뜩 영감 공유 · 4시 반 남동 섹터 (단축키 4)", clockPositionKo: "4시 반", centerAngleDeg: 135, cooldownSec: 3, hotkeyDigit: "4", linkedParticleKind: "cherry-blossom" },
  { index: 4, id: "stretch", labelKo: "손목 스트레칭", shortKo: "휴식", ariaLabelKo: "손목 스트레칭 알림 · 6시 남쪽 섹터 (단축키 5)", clockPositionKo: "6시", centerAngleDeg: 180, cooldownSec: 5, hotkeyDigit: "5", linkedParticleKind: "footstep-dust" },
  { index: 5, id: "feedback-ping", labelKo: "컷 피드백 요청", shortKo: "피드백", ariaLabelKo: "컷 구도 피드백 요청 · 7시 반 남서 섹터 (단축키 6)", clockPositionKo: "7시 반", centerAngleDeg: 225, cooldownSec: 4.5, hotkeyDigit: "6", linkedParticleKind: "focus-aura-ring" },
  { index: 6, id: "music-vibe", labelKo: "작업실 음감", shortKo: "음감", ariaLabelKo: "작업실 음악 공감 · 9시 서쪽 섹터 (단축키 7)", clockPositionKo: "9시", centerAngleDeg: 270, cooldownSec: 3.5, hotkeyDigit: "7", linkedParticleKind: "window-rain" },
  { index: 7, id: "deadline-victory", labelKo: "컷 완성 축하", shortKo: "완성", ariaLabelKo: "컷 마감 완료 축하 · 10시 반 북서 섹터 (단축키 8)", clockPositionKo: "10시 반", centerAngleDeg: 315, cooldownSec: 4, hotkeyDigit: "8", linkedParticleKind: "cherry-blossom" },
] as const;

/** 시간대 프로파일과 캐릭터 높이로 지면 방향 그림자 투영 벡터를 계산한다. */
export function computeDirectionalShadowVector(
  profile: TimeOfDayLightingProfile,
  spriteHeightPx: number = 64,
): DirectionalShadowProjection {
  const rad = (profile.shadowAngleDeg * Math.PI) / 180;
  const lengthPx = Math.round(spriteHeightPx * profile.shadowLengthRatio * 10) / 10;
  return {
    dxPx: Math.round(Math.cos(rad) * lengthPx * 10) / 10,
    dyPx: Math.round(Math.sin(rad) * lengthPx * 0.42 * 10) / 10,
    lengthPx,
    skewDeg: Math.round(clampScalar(Math.cos(rad) * 34 * profile.shadowLengthRatio, -48, 48) * 10) / 10,
    blurPx: Math.round((2.5 + profile.shadowLengthRatio * 2.4) * 10) / 10,
    opacity: profile.shadowOpacity,
  };
}

/** 두 시간대 광원 프로파일 사이를 선형·최단각 보간한다. */
export function interpolateTimeOfDayLighting(fromId: TimeOfDayId, toId: TimeOfDayId, t: number): InterpolatedLightingSnapshot {
  const ratio = clampScalar(t, 0, 1);
  const a = TIME_OF_DAY_PROFILES[fromId];
  const b = TIME_OF_DAY_PROFILES[toId];
  let angleDelta = b.shadowAngleDeg - a.shadowAngleDeg;
  while (angleDelta > 180) angleDelta -= 360;
  while (angleDelta < -180) angleDelta += 360;
  const shadowAngleDeg = (((a.shadowAngleDeg + angleDelta * ratio) % 360) + 360) % 360;

  return {
    colorTemperatureK: Math.round(a.colorTemperatureK + (b.colorTemperatureK - a.colorTemperatureK) * ratio),
    sunElevationDeg: Math.round((a.sunElevationDeg + (b.sunElevationDeg - a.sunElevationDeg) * ratio) * 10) / 10,
    shadowAngleDeg: Math.round(shadowAngleDeg * 10) / 10,
    shadowLengthRatio: Math.round((a.shadowLengthRatio + (b.shadowLengthRatio - a.shadowLengthRatio) * ratio) * 100) / 100,
    shadowOpacity: Math.round((a.shadowOpacity + (b.shadowOpacity - a.shadowOpacity) * ratio) * 100) / 100,
    ambientLux: Math.round(a.ambientLux + (b.ambientLux - a.ambientLux) * ratio),
  };
}

export function createAtmosphereParticleSystem(options?: {
  readonly weatherPreset?: WeatherMoodPresetId;
  readonly viewportWidth?: number;
  readonly viewportHeight?: number;
  readonly maxParticles?: number;
  readonly seed?: number;
}): AtmosphereParticleSystem {
  return {
    particles: [],
    nextParticleId: 1,
    rngState: options?.seed ?? 20260394,
    weatherPreset: options?.weatherPreset ?? "clear-breeze",
    viewportWidth: options?.viewportWidth ?? 560,
    viewportHeight: options?.viewportHeight ?? 320,
    maxParticles: options?.maxParticles ?? 96,
    elapsedSec: 0,
    rainAccumulator: 0,
    blossomAccumulator: 0,
    steamAccumulator: 0,
    auraAccumulator: 0,
  };
}

function appendParticlesCapped(
  system: AtmosphereParticleSystem,
  added: readonly AtmosphereParticle[],
  nextParticleId: number,
  rngState: number,
): AtmosphereParticleSystem {
  const combined = [...system.particles, ...added];
  const trimmed = combined.length > system.maxParticles ? combined.slice(combined.length - system.maxParticles) : combined;
  return { ...system, particles: trimmed, nextParticleId, rngState };
}

/** 캐릭터 발걸음 먼지 퍼프(중경 레이어)를 생성한다. */
export function spawnFootstepDustBurst(
  system: AtmosphereParticleSystem,
  x: number,
  y: number,
  facingDx: number = 1,
  facingDy: number = 0,
  count: number = 4,
): AtmosphereParticleSystem {
  const safeCount = Math.max(1, Math.min(8, Math.floor(count)));
  const added: AtmosphereParticle[] = [];
  let rng = system.rngState;
  let nextId = system.nextParticleId;

  for (let i = 0; i < safeCount; i += 1) {
    const r1 = advanceDeterministicRng(rng);
    const r2 = advanceDeterministicRng(r1.nextSeed);
    rng = r2.nextSeed;
    added.push({
      id: nextId,
      kind: "footstep-dust",
      layer: "midground",
      x: x + (r1.unit - 0.5) * 10,
      y: y + 4,
      vx: (r1.unit - 0.5) * 30 - facingDx * 18,
      vy: -10 - r2.unit * 16 - facingDy * 10,
      radiusPx: 3.5 + r2.unit * 2.5,
      maxRadiusPx: 9,
      rotationDeg: r1.unit * 360,
      angularVelDegPerSec: (r2.unit - 0.5) * 90,
      ageSec: 0,
      lifeSec: 0.42 + r1.unit * 0.22,
      opacity: 0.72,
      flutterPhaseRad: r2.unit * Math.PI * 2,
    });
    nextId += 1;
  }
  return appendParticlesCapped(system, added, nextId, rng);
}

/** 책상 머그컵 커피 스팀(전경 레이어)을 생성한다. */
export function spawnCoffeeSteamPlume(system: AtmosphereParticleSystem, x: number, y: number): AtmosphereParticleSystem {
  const r1 = advanceDeterministicRng(system.rngState);
  const r2 = advanceDeterministicRng(r1.nextSeed);
  const p: AtmosphereParticle = {
    id: system.nextParticleId,
    kind: "coffee-steam",
    layer: "foreground",
    x: x + (r1.unit - 0.5) * 6,
    y,
    vx: (r1.unit - 0.5) * 8,
    vy: -22 - r2.unit * 14,
    radiusPx: 4,
    maxRadiusPx: 14,
    rotationDeg: 0,
    angularVelDegPerSec: 0,
    ageSec: 0,
    lifeSec: 1.55 + r2.unit * 0.65,
    opacity: 0.55,
    flutterPhaseRad: r1.unit * Math.PI * 2,
  };
  return appendParticlesCapped(system, [p], system.nextParticleId + 1, r2.nextSeed);
}

/** 창가 사선 빗줄기(배경 레이어)를 생성한다. */
export function spawnWindowRainDrop(system: AtmosphereParticleSystem): AtmosphereParticleSystem {
  const r1 = advanceDeterministicRng(system.rngState);
  const r2 = advanceDeterministicRng(r1.nextSeed);
  const p: AtmosphereParticle = {
    id: system.nextParticleId,
    kind: "window-rain",
    layer: "background",
    x: r1.unit * (system.viewportWidth + 60) - 20,
    y: -12,
    vx: -48 - r2.unit * 18,
    vy: 245 + r1.unit * 85,
    radiusPx: 1.4,
    maxRadiusPx: 1.8,
    rotationDeg: -14,
    angularVelDegPerSec: 0,
    ageSec: 0,
    lifeSec: 1.15 + r2.unit * 0.35,
    opacity: 0.68,
    flutterPhaseRad: 0,
  };
  return appendParticlesCapped(system, [p], system.nextParticleId + 1, r2.nextSeed);
}

/** 벚꽃 잎(전경 레이어)을 생성한다. */
export function spawnCherryBlossomPetal(system: AtmosphereParticleSystem): AtmosphereParticleSystem {
  const r1 = advanceDeterministicRng(system.rngState);
  const r2 = advanceDeterministicRng(r1.nextSeed);
  const p: AtmosphereParticle = {
    id: system.nextParticleId,
    kind: "cherry-blossom",
    layer: "foreground",
    x: r1.unit * system.viewportWidth,
    y: -10,
    vx: 18 + r2.unit * 24,
    vy: 28 + r1.unit * 22,
    radiusPx: 4.5 + r2.unit * 2.2,
    maxRadiusPx: 7,
    rotationDeg: r1.unit * 360,
    angularVelDegPerSec: 75 + r2.unit * 95,
    ageSec: 0,
    lifeSec: 4.2 + r1.unit * 1.4,
    opacity: 0.88,
    flutterPhaseRad: r2.unit * Math.PI * 2,
  };
  return appendParticlesCapped(system, [p], system.nextParticleId + 1, r2.nextSeed);
}

/** 캐릭터 집중 오라 링(중경 레이어)을 생성한다. */
export function spawnFocusAuraRing(system: AtmosphereParticleSystem, x: number, y: number): AtmosphereParticleSystem {
  const p: AtmosphereParticle = {
    id: system.nextParticleId,
    kind: "focus-aura-ring",
    layer: "midground",
    x,
    y,
    vx: 0,
    vy: 0,
    radiusPx: 14,
    maxRadiusPx: 62,
    rotationDeg: 0,
    angularVelDegPerSec: 0,
    ageSec: 0,
    lifeSec: 1.35,
    opacity: 0.82,
    flutterPhaseRad: 0,
  };
  return appendParticlesCapped(system, [p], system.nextParticleId + 1, system.rngState);
}

/** 날씨·감정 프리셋에 따라 멀티레이어 파티클 시스템을 dtSec만큼 진행한다. */
export function stepAtmosphereParticles(
  system: AtmosphereParticleSystem,
  dtSec: number,
  anchors?: ParticleEmitterAnchors,
): AtmosphereParticleSystem {
  const dt = clampScalar(dtSec, 0.001, 0.1);
  const preset = WEATHER_MOOD_PRESETS[system.weatherPreset];
  const updated: AtmosphereParticle[] = [];

  for (const p of system.particles) {
    const nextAge = p.ageSec + dt;
    if (nextAge >= p.lifeSec) continue;
    const lifeRatio = clampScalar(nextAge / p.lifeSec, 0, 1);
    let vx = p.vx;
    let vy = p.vy;
    let x = p.x;
    let y = p.y;
    let radiusPx = p.radiusPx;
    let nextOpacity: number;

    if (p.kind === "footstep-dust") {
      vx *= Math.exp(-4.5 * dt);
      vy *= Math.exp(-3.5 * dt);
      x += vx * dt;
      y += vy * dt;
      radiusPx = p.radiusPx + (p.maxRadiusPx - p.radiusPx) * dt * 2.4;
      nextOpacity = Math.max(0, (1 - lifeRatio) * 0.72);
    } else if (p.kind === "coffee-steam") {
      x += (vx + Math.sin(nextAge * 3.8 + p.flutterPhaseRad) * 14) * dt;
      y += vy * dt;
      radiusPx = p.radiusPx + (p.maxRadiusPx - p.radiusPx) * dt * 0.9;
      nextOpacity = Math.sin(lifeRatio * Math.PI) * 0.56;
    } else if (p.kind === "window-rain") {
      x += (vx + preset.windPxPerSec * 0.25) * dt;
      y += vy * dt;
      nextOpacity = 0.68 * (1 - lifeRatio * 0.35);
      if (y > system.viewportHeight + 24) continue;
    } else if (p.kind === "cherry-blossom") {
      x += (vx + preset.windPxPerSec * 0.45 + Math.sin(nextAge * 2.9 + p.flutterPhaseRad) * 28) * dt;
      y += vy * dt;
      nextOpacity = Math.min(1, (1 - lifeRatio) * 1.3) * 0.88;
      if (y > system.viewportHeight + 20) continue;
    } else {
      radiusPx = 14 + (p.maxRadiusPx - 14) * lifeRatio;
      nextOpacity = Math.max(0, (1 - lifeRatio) * (1 - lifeRatio) * 0.85);
    }

    updated.push({
      ...p,
      x,
      y,
      vx,
      vy,
      radiusPx: Math.round(radiusPx * 100) / 100,
      rotationDeg: (p.rotationDeg + p.angularVelDegPerSec * dt) % 360,
      ageSec: nextAge,
      opacity: Math.round(clampScalar(nextOpacity, 0, 1) * 1000) / 1000,
    });
  }

  let nextSystem: AtmosphereParticleSystem = {
    ...system,
    particles: updated,
    elapsedSec: system.elapsedSec + dt,
    rainAccumulator: system.rainAccumulator + preset.rainRatePerSec * dt,
    blossomAccumulator: system.blossomAccumulator + preset.blossomRatePerSec * dt,
    steamAccumulator:
      anchors?.enableCoffeeSteam === false ? system.steamAccumulator : system.steamAccumulator + preset.coffeeSteamRatePerSec * dt,
    auraAccumulator:
      anchors?.enableFocusAura === false ? system.auraAccumulator : system.auraAccumulator + preset.focusAuraRatePerSec * dt,
  };

  while (nextSystem.rainAccumulator >= 1) {
    nextSystem = spawnWindowRainDrop({ ...nextSystem, rainAccumulator: nextSystem.rainAccumulator - 1 });
  }
  while (nextSystem.blossomAccumulator >= 1) {
    nextSystem = spawnCherryBlossomPetal({ ...nextSystem, blossomAccumulator: nextSystem.blossomAccumulator - 1 });
  }
  const mugPos = anchors?.coffeeMugPosition ?? { x: 430, y: 128 };
  while (nextSystem.steamAccumulator >= 1) {
    nextSystem = spawnCoffeeSteamPlume({ ...nextSystem, steamAccumulator: nextSystem.steamAccumulator - 1 }, mugPos.x, mugPos.y);
  }
  const focusPos = anchors?.focusCenterPosition ?? { x: 280, y: 164 };
  while (nextSystem.auraAccumulator >= 1) {
    nextSystem = spawnFocusAuraRing({ ...nextSystem, auraAccumulator: nextSystem.auraAccumulator - 1 }, focusPos.x, focusPos.y);
  }
  return nextSystem;
}

/** 레이어별·파티클 종류별 활성 개수를 집계한다. */
export function summarizeParticlesByLayer(particles: readonly AtmosphereParticle[]): ParticleLayerSummary {
  const byLayer: Record<ParticleDepthLayer, number> = { background: 0, midground: 0, foreground: 0 };
  const byKind: Record<AtmosphereParticleKind, number> = {
    "footstep-dust": 0,
    "coffee-steam": 0,
    "window-rain": 0,
    "cherry-blossom": 0,
    "focus-aura-ring": 0,
  };
  for (const p of particles) {
    byLayer[p.layer] += 1;
    byKind[p.kind] += 1;
  }
  return { total: particles.length, byLayer, byKind };
}

/** 북쪽(12시=0°) 기준 시계방향 각도를 8섹터 인덱스(0..7)로 수학 매핑한다. */
export function mapAngleDegToSectorIndex(angleFromNorthDeg: number): number {
  const normalized = ((angleFromNorthDeg % 360) + 360) % 360;
  return Math.floor(((normalized + 22.5) % 360) / 45) % 8;
}

/** 휠 중심 기준 포인터 상대 좌표 `(dx, dy)`를 8섹터 방사형 이모트 섹터로 매핑한다. */
export function mapPointerDeltaToRadialSector(
  dx: number,
  dy: number,
  deadZoneRadiusPx: number = 18,
): RadialSectorMappingResult {
  const distancePx = Math.hypot(dx, dy);
  if (distancePx < Math.max(0, deadZoneRadiusPx)) {
    return { inDeadZone: true, distancePx: Math.round(distancePx * 10) / 10, angleFromNorthDeg: 0, sectorIndex: null, sector: null };
  }
  const rawDeg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  const angleFromNorthDeg = Math.round((((rawDeg % 360) + 360) % 360) * 10) / 10;
  const sectorIndex = mapAngleDegToSectorIndex(angleFromNorthDeg);
  return {
    inDeadZone: false,
    distancePx: Math.round(distancePx * 10) / 10,
    angleFromNorthDeg,
    sectorIndex,
    sector: RADIAL_EMOTE_SECTORS[sectorIndex] ?? null,
  };
}

export function createEmoteWheelState(): EmoteWheelState {
  return { activeSectorIndex: null, lastTriggeredId: null, lastTriggeredAtMs: null, cooldownUntilMsById: {}, triggerCount: 0 };
}

export function getEmoteRemainingCooldownMs(wheelState: EmoteWheelState, emoteId: RadialEmoteId, nowMs: number): number {
  return Math.max(0, Math.ceil((wheelState.cooldownUntilMsById[emoteId] ?? 0) - nowMs));
}

/** 8섹터 이모트 발동과 쿨다운 검사를 수행한다. */
export function triggerRadialEmote(wheelState: EmoteWheelState, sectorIndex: number, nowMs: number): EmoteTriggerResult {
  const sector = RADIAL_EMOTE_SECTORS[sectorIndex] ?? null;
  if (!sector) {
    return { nextState: wheelState, accepted: false, reason: "invalid-sector", sector: null, remainingCooldownMs: 0, announcementKo: "유효하지 않은 이모트 섹터입니다." };
  }
  const remainingMs = getEmoteRemainingCooldownMs(wheelState, sector.id, nowMs);
  if (remainingMs > 0) {
    return {
      nextState: { ...wheelState, activeSectorIndex: sector.index },
      accepted: false,
      reason: "cooldown",
      sector,
      remainingCooldownMs: remainingMs,
      announcementKo: `${sector.labelKo} 쿨다운 진행 중 (${(remainingMs / 1000).toFixed(1)}초 남음)`,
    };
  }

  const nextState: EmoteWheelState = {
    activeSectorIndex: sector.index,
    lastTriggeredId: sector.id,
    lastTriggeredAtMs: nowMs,
    cooldownUntilMsById: { ...wheelState.cooldownUntilMsById, [sector.id]: nowMs + sector.cooldownSec * 1000 },
    triggerCount: wheelState.triggerCount + 1,
  };
  return {
    nextState,
    accepted: true,
    reason: "triggered",
    sector,
    remainingCooldownMs: 0,
    announcementKo: `${sector.labelKo} (${sector.clockPositionKo}) 이모트를 발동했습니다.`,
  };
}
