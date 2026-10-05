/**
 * 사무실 소품 생동감 (비주얼 웨이브 트랙 G + VS 120 웨이브 2 오브젝트 연출)
 *
 * 모니터 화면 빛 · 벽시계 바늘 · 네온 깜빡임 · 화분 흔들림처럼 저비용으로
 * 공간을 살아 있게 만드는 소품 애니메이션의 순수 계산 모듈.
 * 웨이브 2에서 램프 빛 호흡 · 정수기 기포 · 화이트보드 반짝임 · 화면 순환광을 더했다.
 *
 * - 모든 값은 시각(nowMs)과 시드의 결정적 함수다. 타이머·난수·렌더러 의존 없음.
 * - `reducedMotion`이면 움직임/깜빡임을 멈추고 정적 값을 돌려준다.
 * - 전면 오버레이·틴트는 만들지 않는다. 오브젝트 국소 효과 전용이다.
 *
 * 실제 적용은 호출 측(캠퍼스 런타임·빌드 모드)이 프레임 값을 스프라이트에 매핑한다.
 */

/** 사무실 소품 애니메이션 종류. */
export type StudioOfficePropKind =
  | "monitor-glow" | "wall-clock" | "neon-flicker" | "plant-sway"
  | "lamp-glow" | "cooler-bubbles" | "board-shimmer" | "screen-glow";

export const STUDIO_OFFICE_PROP_KINDS: readonly StudioOfficePropKind[] = Object.freeze([
  "monitor-glow", "wall-clock", "neon-flicker", "plant-sway",
  "lamp-glow", "cooler-bubbles", "board-shimmer", "screen-glow",
]);

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const TAU = Math.PI * 2;

function hash01(seed: string): number {
  let hash = 2166136261;
  for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return ((hash >>> 0) % 1000) / 1000;
}

function safeNow(nowMs: number): number {
  return Number.isFinite(nowMs) && nowMs > 0 ? nowMs : 0;
}

export interface StudioOfficeClockHands {
  /** 12시 방향이 0, 시계 방향이 양수인 라디안. */
  readonly hourAngle: number;
  readonly minuteAngle: number;
  readonly secondAngle: number;
  /** 초 바늘이 가리키는 정수 초 (0~59). 다시 그릴지 판단할 때 쓴다. */
  readonly second: number;
}

/**
 * 벽시계 바늘 각도. nowMs를 하루 경과 시간으로 해석한다.
 * 현지 시각을 보여 주려면 호출 측이 타임존 오프셋을 보정한 값을 넘긴다.
 * 초침은 부드럽게 흐르고 시·분침은 하위 단위를 반영해 천천히 이동한다.
 */
export function officeClockHands(nowMs: number): StudioOfficeClockHands {
  const now = safeNow(nowMs);
  const totalSeconds = now / 1000;
  const seconds = totalSeconds % 60;
  const minutes = (totalSeconds / 60) % 60;
  const hours = (totalSeconds / 3600) % 12;
  return Object.freeze({
    hourAngle: (hours / 12) * TAU,
    minuteAngle: (minutes / 60) * TAU,
    secondAngle: (seconds / 60) * TAU,
    second: Math.floor(seconds),
  });
}

/** 초 단위 버킷. 시계 바늘을 매 프레임 다시 그리지 않기 위한 비교 키. */
export function officeClockSecondBucket(nowMs: number): number {
  return Math.floor(safeNow(nowMs) / 1000);
}

/**
 * 모니터 화면 빛 강도 0~1.
 * 은은한 호흡 + 드문 미세 깜빡임. reducedMotion이면 고정 밝기.
 */
export function officeMonitorGlow(nowMs: number, seed: string, reducedMotion: boolean): number {
  if (reducedMotion) return 0.85;
  const now = safeNow(nowMs);
  const phase = hash01(seed) * TAU;
  const breath = 0.78 + 0.13 * Math.sin(now / 900 + phase);
  const bucket = Math.floor(now / 160);
  const flicker = hash01(`${seed}:monitor:${bucket}`) < 0.08 ? -0.1 : 0;
  return clamp01(breath + flicker);
}

/**
 * 네온 사인 빛 강도 0~1.
 * 대부분 켜져 있고 가끔 짧게 떨어지는 네온 특유의 깜빡임. reducedMotion이면 항상 켜짐.
 */
export function officeNeonFlicker(nowMs: number, seed: string, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  const now = safeNow(nowMs);
  const bucket = Math.floor(now / 90);
  const roll = hash01(`${seed}:neon:${bucket}`);
  if (roll < 0.05) return 0.3 + roll * 6;
  return clamp01(0.93 + 0.07 * Math.sin(now / 300 + hash01(seed) * TAU));
}

export interface StudioOfficePlantSway {
  /** 잎 흔들림 회전 (라디안, ±0.05 이내). */
  readonly rotation: number;
  /** 수평 오프셋 (px, ±2 이내). */
  readonly offsetX: number;
}

/** 화분 잎 흔들림. 느린 바람 + 짧은 떨림의 합성. reducedMotion이면 정지. */
export function officePlantSway(nowMs: number, seed: string, reducedMotion: boolean): StudioOfficePlantSway {
  if (reducedMotion) return Object.freeze({ rotation: 0, offsetX: 0 });
  const now = safeNow(nowMs);
  const phase = hash01(seed) * TAU;
  const sway = Math.sin(now / 1400 + phase);
  const tremble = Math.sin(now / 517 + phase * 2);
  return Object.freeze({
    rotation: 0.032 * sway + 0.012 * tremble,
    offsetX: 1.6 * sway,
  });
}

/**
 * 램프 빛 강도 0~1 (플로어 램프·촬영 소프트박스).
 * 모니터보다 느리고 깊은 호흡 + 아주 약한 전류 떨림. reducedMotion이면 고정 밝기.
 */
export function officeLampGlow(nowMs: number, seed: string, reducedMotion: boolean): number {
  if (reducedMotion) return 0.92;
  const now = safeNow(nowMs);
  const phase = hash01(seed) * TAU;
  const breath = 0.84 + 0.11 * Math.sin(now / 1500 + phase);
  const hum = 0.02 * Math.sin(now / 90 + phase * 3);
  return clamp01(breath + hum);
}

/**
 * 화면 순환광 (대형 스크린·자판기 진열창).
 * 느린 색 순환 위상(progress)과 함께 밝기가 천천히 오르내리고, 드물게 짧게 어두워진다.
 */
export function officeScreenGlow(nowMs: number, seed: string, reducedMotion: boolean): { readonly intensity: number; readonly progress: number } {
  const now = safeNow(nowMs);
  const phase = hash01(seed) * TAU;
  const progress = ((now / 9000) + hash01(seed)) % 1;
  if (reducedMotion) return Object.freeze({ intensity: 0.85, progress: 0 });
  const wave = 0.8 + 0.14 * Math.sin(now / 2600 + phase);
  const bucket = Math.floor(now / 240);
  const dip = hash01(`${seed}:screen:${bucket}`) < 0.04 ? -0.16 : 0;
  return Object.freeze({ intensity: clamp01(wave + dip), progress });
}

/**
 * 화이트보드 반짝임.
 * 긴 주기마다 한 번, 빛 반사가 보드를 왼쪽에서 오른쪽으로 가로지른다(sweep 0~1).
 * 반사가 없을 때 sweep는 -1이다. reducedMotion이면 반사 없음.
 */
export function officeBoardShimmer(nowMs: number, seed: string, reducedMotion: boolean): { readonly intensity: number; readonly sweep: number } {
  if (reducedMotion) return Object.freeze({ intensity: 0, sweep: -1 });
  const now = safeNow(nowMs);
  const cycleMs = 7000;
  const cycle = ((now + hash01(seed) * cycleMs) % cycleMs) / cycleMs;
  // 주기의 앞 45% 동안만 반사가 지나가고 나머지는 쉰다.
  if (cycle >= 0.45) return Object.freeze({ intensity: 0, sweep: -1 });
  const sweep = cycle / 0.45;
  const envelope = Math.sin(Math.PI * sweep);
  return Object.freeze({ intensity: envelope * envelope * 0.8, sweep });
}

export interface StudioOfficeCoolerBubble {
  /** 수조 안 수평 위치 (-1~1, 0이 가운데). */
  readonly offsetX: number;
  /** 떠오른 정도 0(바닥)~1(수면). */
  readonly rise: number;
  /** 기포 반지름 (px). */
  readonly radius: number;
}

/** 정수기 기포 한 묶음의 최대 개수. */
export const STUDIO_OFFICE_COOLER_BUBBLE_COUNT = 5;

/**
 * 정수기 수조 기포 필드.
 * 기포마다 속도와 시작 위상이 달라 결정적으로 떠오른다. reducedMotion이면
 * 시간과 무관한 정적 배치(위상 그대로)를 돌려준다.
 */
export function officeCoolerBubbleField(
  nowMs: number,
  seed: string,
  reducedMotion: boolean,
): readonly StudioOfficeCoolerBubble[] {
  const now = safeNow(nowMs);
  const bubbles: StudioOfficeCoolerBubble[] = [];
  for (let index = 0; index < STUDIO_OFFICE_COOLER_BUBBLE_COUNT; index += 1) {
    const offsetX = hash01(`${seed}:bubble-x:${index}`) * 1.4 - 0.7;
    const speed = 0.6 + hash01(`${seed}:bubble-speed:${index}`) * 0.7;
    const start = hash01(`${seed}:bubble-start:${index}`);
    const rise = reducedMotion ? start : (start + (now / 3600) * speed) % 1;
    const radius = 1.4 + hash01(`${seed}:bubble-radius:${index}`) * 1.8;
    bubbles.push(Object.freeze({ offsetX, rise, radius }));
  }
  return Object.freeze(bubbles);
}

/** 정수기 기포 주기 진행 0~1 (수조 빛 세기와 묶어 쓰는 값). */
export function officeCoolerCycle(nowMs: number, seed: string): number {
  return ((safeNow(nowMs) / 3600) + hash01(seed)) % 1;
}

export interface StudioOfficePropFrame {
  readonly kind: StudioOfficePropKind;
  /** 빛 강도 0~1 — monitor-glow · neon-flicker · lamp-glow · screen-glow · board-shimmer. */
  readonly intensity: number;
  /** 흔들림 회전 (라디안) — plant-sway. */
  readonly rotation: number;
  /** 흔들림 오프셋 (px) — plant-sway. */
  readonly offsetX: number;
  /** 주기 진행 0~1 — screen-glow(색 순환 위상) · cooler-bubbles(기포 주기). 그 외 0. */
  readonly progress: number;
  /** 반사 위치 0~1, 없으면 -1 — board-shimmer 전용. */
  readonly sweep: number;
  /** 시계 바늘 — wall-clock 전용, 그 외 종류는 null. */
  readonly clock: StudioOfficeClockHands | null;
}

/** 소품 종류별 통합 프레임 계산. */
export function officePropFrame(
  kind: StudioOfficePropKind,
  nowMs: number,
  seed: string,
  reducedMotion: boolean,
): StudioOfficePropFrame {
  switch (kind) {
    case "monitor-glow":
      return Object.freeze({ kind, intensity: officeMonitorGlow(nowMs, seed, reducedMotion), rotation: 0, offsetX: 0, progress: 0, sweep: -1, clock: null });
    case "neon-flicker":
      return Object.freeze({ kind, intensity: officeNeonFlicker(nowMs, seed, reducedMotion), rotation: 0, offsetX: 0, progress: 0, sweep: -1, clock: null });
    case "plant-sway": {
      const sway = officePlantSway(nowMs, seed, reducedMotion);
      return Object.freeze({ kind, intensity: 0, rotation: sway.rotation, offsetX: sway.offsetX, progress: 0, sweep: -1, clock: null });
    }
    case "wall-clock": {
      // reducedMotion이면 초침을 1초 단위로 끊어 움직인다 (부드러운 흐름 대신 틱).
      const clockNow = reducedMotion ? Math.floor(safeNow(nowMs) / 1000) * 1000 : nowMs;
      return Object.freeze({ kind, intensity: 0, rotation: 0, offsetX: 0, progress: 0, sweep: -1, clock: officeClockHands(clockNow) });
    }
    case "lamp-glow":
      return Object.freeze({ kind, intensity: officeLampGlow(nowMs, seed, reducedMotion), rotation: 0, offsetX: 0, progress: 0, sweep: -1, clock: null });
    case "screen-glow": {
      const screen = officeScreenGlow(nowMs, seed, reducedMotion);
      return Object.freeze({ kind, intensity: screen.intensity, rotation: 0, offsetX: 0, progress: screen.progress, sweep: -1, clock: null });
    }
    case "board-shimmer": {
      const shimmer = officeBoardShimmer(nowMs, seed, reducedMotion);
      return Object.freeze({ kind, intensity: shimmer.intensity, rotation: 0, offsetX: 0, progress: 0, sweep: shimmer.sweep, clock: null });
    }
    case "cooler-bubbles":
      return Object.freeze({ kind, intensity: 0.7 + 0.3 * Math.sin(officeCoolerCycle(nowMs, seed) * TAU), rotation: 0, offsetX: 0, progress: officeCoolerCycle(nowMs, seed), sweep: -1, clock: null });
  }
}

/**
 * 캠퍼스 오브젝트 kind → 소품 애니메이션 kind 매핑.
 * 해당 없으면 null (정적 오브젝트).
 */
export function officePropKindForCampusObject(objectKind: string): StudioOfficePropKind | null {
  switch (objectKind) {
    case "desk-monitor": return "monitor-glow";
    case "wall-clock": return "wall-clock";
    case "neon-sign": return "neon-flicker";
    case "whiteboard": return "board-shimmer";
    case "water-cooler": return "cooler-bubbles";
    case "vending-machine": return "screen-glow";
    case "softbox": return "lamp-glow";
    default: return null;
  }
}

/** 가구 카탈로그 kind → 소품 애니메이션 kind 매핑 (빌드 모드·구 월드용). */
export function officePropKindForFurniture(furnitureKind: string): StudioOfficePropKind | null {
  switch (furnitureKind) {
    case "desk-monitor": return "monitor-glow";
    case "wall-clock": return "wall-clock";
    case "neon-sign": return "neon-flicker";
    case "plant": return "plant-sway";
    case "floor-lamp": return "lamp-glow";
    case "water-cooler": return "cooler-bubbles";
    case "whiteboard": return "board-shimmer";
    case "display-screen": return "screen-glow";
    case "vending-machine": return "screen-glow";
    default: return null;
  }
}
