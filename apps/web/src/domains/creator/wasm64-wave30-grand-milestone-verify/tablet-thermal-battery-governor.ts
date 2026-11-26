/**
 * 팬리스 태블릿 · 노트북 발열 및 배터리 인지형 스튜디오 실시간 품질 거버너.
 *
 * - 기기 발열 단계(`nominal` · `fair` · `serious` · `critical`), 배터리 잔량(`0..1`),
 *   충전 여부(`isCharging`), 지수 이동평균 프레임 시간(`frameTimeEwmaMs`),
 *   펜 접촉 상태(`isStylusDown`)를 입력받아 뷰포트 배율·그림자 캐스케이드·환경 파티클·
 *   유휴 백그라운드 예산·목표 캔버스 주사율을 실시간 산출한다.
 * - 비대칭 데드밴드(Deadband)와 유지 틱(Hold Dwell) 히스테리시스를 결합해
 *   경계 구간 노이즈로 인한 화면 깜빡임과 설정 진동을 원천 차단한다.
 * - 절대 불변식(Sacred Stylus Invariant): 어떤 극한 발열·저전력 상태에서도
 *   펜촉 원시 병합 샘플링(`stylusSamplingUnthrottled === true`)은 절대 감쇠하거나 누락하지 않는다.
 */

export const THERMAL_STATES = Object.freeze([
  "nominal",
  "fair",
  "serious",
  "critical",
] as const);
export type ThermalState = (typeof THERMAL_STATES)[number];

export const GOVERNOR_PRESSURE_LEVELS = Object.freeze([0, 1, 2, 3] as const);
export type GovernorPressureLevel = (typeof GOVERNOR_PRESSURE_LEVELS)[number];

export const GOVERNOR_PROFILE_IDS = Object.freeze([
  "atelier-peak",
  "balanced-studio",
  "thermal-saver",
  "critical-survival",
] as const);
export type GovernorProfileId = (typeof GOVERNOR_PROFILE_IDS)[number];

export type ShadowCascadeCount = 0 | 1 | 2 | 4;
export type TargetCanvasHz = 30 | 60 | 90 | 120;

export interface ThermalBatteryTelemetryInput {
  readonly thermalState: ThermalState;
  /** 배터리 잔량 (`0..1`, 범위 밖 입력은 안전하게 `0..1`로 고정). */
  readonly batteryLevel: number;
  readonly isCharging: boolean;
  /** 최근 프레임 시간 지수 이동평균 (`ms`). */
  readonly frameTimeEwmaMs: number;
  /** 현재 아티스트가 펜촉을 캔버스에 대고 드로잉 중인지 여부. */
  readonly isStylusDown: boolean;
}

export interface GovernorPolicyConfig {
  readonly deviceMaxPixelRatio?: number;
  readonly deviceMaxCanvasHz?: 60 | 120;
  /** 프레임 시간·배터리 수치 지터에 의한 상향 감축 확정 연속 틱 수 (기본 `2`). */
  readonly metricEscalationConfirmTicks?: number;
  /** 발열·부하 완화 후 고화질 복귀까지 요구되는 연속 안정 틱 수 (기본 `3`). */
  readonly recoveryHoldTicks?: number;
}

export interface GovernorInternalState {
  readonly activeLevel: GovernorPressureLevel;
  readonly pendingMetricEscalationTicks: number;
  readonly consecutiveCalmRecoveryTicks: number;
  readonly totalEvaluations: number;
  readonly levelTransitionCount: number;
}

export interface StudioQualityBudget {
  readonly pressureLevel: GovernorPressureLevel;
  readonly profileId: GovernorProfileId;
  readonly profileLabelKo: string;
  readonly viewportPixelRatio: number;
  readonly shadowCascadeCount: ShadowCascadeCount;
  readonly ambientParticleScale: number;
  /** 유휴 프레임 백그라운드 작업 허용 시간 (`ms`, `critical` 시 정확히 `0`). */
  readonly idleBackgroundBudgetMs: number;
  readonly targetCanvasHz: TargetCanvasHz;
  /** 절대 불변식: 모든 발열·배터리 단계에서 펜 병합 포인터 샘플링 무감쇠 보장 (`true`). */
  readonly stylusSamplingUnthrottled: true;
  readonly coalescedPointerCaptureActive: true;
  readonly droppedStylusSampleCount: 0;
  readonly hysteresisHoldActive: boolean;
  readonly midStrokeResolutionLocked: boolean;
  readonly levelTransitionCount: number;
  readonly reasonKo: string;
}

export interface GovernorStepResult {
  readonly state: GovernorInternalState;
  readonly budget: StudioQualityBudget;
}

interface LevelPreset {
  readonly profileId: GovernorProfileId;
  readonly profileLabelKo: string;
  readonly pixelRatioCap: number;
  readonly shadowCascadeCount: ShadowCascadeCount;
  readonly ambientParticleScale: number;
  readonly baseIdleBudgetMs: number;
  readonly stylusDownIdleBudgetMs: number;
  readonly targetCanvasHz120: TargetCanvasHz;
  readonly targetCanvasHz60: TargetCanvasHz;
}

const LEVEL_PRESETS: Readonly<Record<GovernorPressureLevel, LevelPreset>> = Object.freeze({
  0: {
    profileId: "atelier-peak",
    profileLabelKo: "최고 화질 · 풀 프레임 아틀리에 모드",
    pixelRatioCap: 2.0,
    shadowCascadeCount: 4,
    ambientParticleScale: 1.0,
    baseIdleBudgetMs: 2.0,
    stylusDownIdleBudgetMs: 0.5,
    targetCanvasHz120: 120,
    targetCanvasHz60: 60,
  },
  1: {
    profileId: "balanced-studio",
    profileLabelKo: "균형 절전 · 저발열 스튜디오 모드",
    pixelRatioCap: 1.5,
    shadowCascadeCount: 2,
    ambientParticleScale: 0.6,
    baseIdleBudgetMs: 1.1,
    stylusDownIdleBudgetMs: 0.2,
    targetCanvasHz120: 90,
    targetCanvasHz60: 60,
  },
  2: {
    profileId: "thermal-saver",
    profileLabelKo: "발열 억제 · 백그라운드 감축 모드",
    pixelRatioCap: 1.25,
    shadowCascadeCount: 1,
    ambientParticleScale: 0.25,
    baseIdleBudgetMs: 0.35,
    stylusDownIdleBudgetMs: 0,
    targetCanvasHz120: 60,
    targetCanvasHz60: 60,
  },
  3: {
    profileId: "critical-survival",
    profileLabelKo: "비상 발열 방어 · 백그라운드 전면 차단 모드",
    pixelRatioCap: 1.0,
    shadowCascadeCount: 0,
    ambientParticleScale: 0,
    baseIdleBudgetMs: 0,
    stylusDownIdleBudgetMs: 0,
    targetCanvasHz120: 30,
    targetCanvasHz60: 30,
  },
});

const THERMAL_TO_LEVEL: Readonly<Record<ThermalState, GovernorPressureLevel>> = Object.freeze({
  nominal: 0,
  fair: 1,
  serious: 2,
  critical: 3,
});

// 상향 진입 임계값과 하향 복귀 임계값 사이에 명확한 데드밴드를 둔다.
const BATTERY_ESCALATE_L1 = 0.30;
const BATTERY_ESCALATE_L2 = 0.16;
const BATTERY_ESCALATE_L3 = 0.06;
const BATTERY_RECOVER_DEADBAND = 0.06;

const FRAME_MS_ESCALATE_L1 = 14.0;
const FRAME_MS_ESCALATE_L2 = 20.0;
const FRAME_MS_ESCALATE_L3 = 30.0;
const FRAME_MS_RECOVER_DEADBAND = 2.2;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function sanitizeFrameTimeMs(rawMs: number): number {
  if (!Number.isFinite(rawMs) || rawMs < 0) {
    return 8.33;
  }
  return Math.min(rawMs, 250);
}

function asPressureLevel(n: number): GovernorPressureLevel {
  if (n <= 0) {
    return 0;
  }
  if (n === 1) {
    return 1;
  }
  if (n === 2) {
    return 2;
  }
  return 3;
}

function computeBatteryPressure(battery: number, isCharging: boolean): GovernorPressureLevel {
  if (isCharging) {
    return 0;
  }
  if (battery < BATTERY_ESCALATE_L3) {
    return 3;
  }
  if (battery < BATTERY_ESCALATE_L2) {
    return 2;
  }
  if (battery < BATTERY_ESCALATE_L1) {
    return 1;
  }
  return 0;
}

function computeFrameTimePressure(frameTimeMs: number): GovernorPressureLevel {
  if (frameTimeMs > FRAME_MS_ESCALATE_L3) {
    return 3;
  }
  if (frameTimeMs > FRAME_MS_ESCALATE_L2) {
    return 2;
  }
  if (frameTimeMs > FRAME_MS_ESCALATE_L1) {
    return 1;
  }
  return 0;
}

/**
 * 현재 활성 압력 단계(`currentLevel`)에서 한 단계 아래(`currentLevel - 1`)로 복귀하기 위한
 * 데드밴드 여유 조건을 충족하는지 판정한다.
 */
function satisfiesRecoveryDeadband(
  currentLevel: GovernorPressureLevel,
  thermalLevel: GovernorPressureLevel,
  battery: number,
  isCharging: boolean,
  frameTimeMs: number,
): boolean {
  const targetDownLevel = asPressureLevel(currentLevel - 1);
  if (thermalLevel > targetDownLevel) {
    return false;
  }

  if (!isCharging) {
    const requiredBattery =
      targetDownLevel === 0
        ? BATTERY_ESCALATE_L1 + BATTERY_RECOVER_DEADBAND
        : targetDownLevel === 1
          ? BATTERY_ESCALATE_L2 + BATTERY_RECOVER_DEADBAND
          : BATTERY_ESCALATE_L3 + BATTERY_RECOVER_DEADBAND;
    if (battery < requiredBattery) {
      return false;
    }
  }

  const maxAllowedFrameMs =
    targetDownLevel === 0
      ? FRAME_MS_ESCALATE_L1 - FRAME_MS_RECOVER_DEADBAND
      : targetDownLevel === 1
        ? FRAME_MS_ESCALATE_L2 - FRAME_MS_RECOVER_DEADBAND
        : FRAME_MS_ESCALATE_L3 - FRAME_MS_RECOVER_DEADBAND;

  return frameTimeMs <= maxAllowedFrameMs;
}

export function createInitialGovernorState(
  initialLevel: GovernorPressureLevel = 0,
): GovernorInternalState {
  return Object.freeze({
    activeLevel: initialLevel,
    pendingMetricEscalationTicks: 0,
    consecutiveCalmRecoveryTicks: 0,
    totalEvaluations: 0,
    levelTransitionCount: 0,
  });
}

/**
 * 순수 상태 전이 함수 — 이전 거버너 상태와 최신 기기 텔레메트리를 받아
 * 히스테리시스가 반영된 다음 상태 및 스튜디오 품질 예산을 반환한다.
 */
export function stepThermalBatteryGovernor(
  prevState: GovernorInternalState,
  telemetry: ThermalBatteryTelemetryInput,
  config: GovernorPolicyConfig = {},
): GovernorStepResult {
  const maxDpr = Math.max(1.0, Math.min(config.deviceMaxPixelRatio ?? 2.0, 3.0));
  const maxHz = config.deviceMaxCanvasHz ?? 120;
  const metricConfirmTicks = Math.max(1, Math.trunc(config.metricEscalationConfirmTicks ?? 2));
  const recoveryHoldTicks = Math.max(2, Math.trunc(config.recoveryHoldTicks ?? 3));

  const battery = clamp01(telemetry.batteryLevel);
  const frameTimeMs = sanitizeFrameTimeMs(telemetry.frameTimeEwmaMs);
  const thermalLevel = THERMAL_TO_LEVEL[telemetry.thermalState];
  const batteryLevelPressure = computeBatteryPressure(battery, telemetry.isCharging);
  const frameLevelPressure = computeFrameTimePressure(frameTimeMs);
  const rawMetricLevel = asPressureLevel(Math.max(batteryLevelPressure, frameLevelPressure));
  const rawCombinedLevel = asPressureLevel(Math.max(thermalLevel, rawMetricLevel));

  let nextLevel = prevState.activeLevel;
  let nextMetricTicks = prevState.pendingMetricEscalationTicks;
  let nextCalmTicks = prevState.consecutiveCalmRecoveryTicks;
  let hysteresisHoldActive = false;
  let midStrokeResolutionLocked = false;

  if (rawCombinedLevel === 3 || thermalLevel > prevState.activeLevel) {
    // OS 발열 센서 상승 또는 비상(critical) 진입은 지체 없이 즉시 감축해 강제 종료를 예방한다.
    nextLevel = rawCombinedLevel;
    nextMetricTicks = 0;
    nextCalmTicks = 0;
  } else if (rawCombinedLevel > prevState.activeLevel) {
    // 프레임 시간·배터리 경계 흔들림은 연속 확인 틱을 거쳐야만 단계가 올라간다.
    nextMetricTicks += 1;
    nextCalmTicks = 0;
    if (nextMetricTicks >= metricConfirmTicks) {
      nextLevel = rawCombinedLevel;
      nextMetricTicks = 0;
    } else {
      hysteresisHoldActive = true;
    }
  } else if (rawCombinedLevel < prevState.activeLevel) {
    nextMetricTicks = 0;
    const deadbandCleared = satisfiesRecoveryDeadband(
      prevState.activeLevel,
      thermalLevel,
      battery,
      telemetry.isCharging,
      frameTimeMs,
    );

    if (!deadbandCleared) {
      nextCalmTicks = 0;
      hysteresisHoldActive = true;
    } else if (telemetry.isStylusDown) {
      // 펜 스트로크 도중에는 뷰포트 해상도 재할당 끊김을 막기 위해 복귀를 펜 뗌 이후로 보류한다.
      midStrokeResolutionLocked = true;
      hysteresisHoldActive = true;
    } else {
      nextCalmTicks += 1;
      if (nextCalmTicks >= recoveryHoldTicks) {
        nextLevel = asPressureLevel(prevState.activeLevel - 1);
        nextCalmTicks = 0;
      } else {
        hysteresisHoldActive = true;
      }
    }
  } else {
    nextMetricTicks = 0;
    nextCalmTicks = 0;
  }

  const levelChanged = nextLevel !== prevState.activeLevel;
  const levelTransitionCount = prevState.levelTransitionCount + (levelChanged ? 1 : 0);
  const preset = LEVEL_PRESETS[nextLevel];

  const viewportPixelRatio = Math.round(Math.min(maxDpr, preset.pixelRatioCap) * 100) / 100;
  const idleBackgroundBudgetMs =
    nextLevel === 3
      ? 0
      : telemetry.isStylusDown
        ? preset.stylusDownIdleBudgetMs
        : preset.baseIdleBudgetMs;
  const targetCanvasHz: TargetCanvasHz =
    maxHz === 120 ? preset.targetCanvasHz120 : preset.targetCanvasHz60;

  const reasonParts: string[] = [
    `발열(${telemetry.thermalState})`,
    `배터리(${Math.round(battery * 100)}%${telemetry.isCharging ? "·충전중" : ""})`,
    `프레임(${frameTimeMs.toFixed(1)}ms)`,
  ];
  if (midStrokeResolutionLocked) {
    reasonParts.push("펜 드로잉 중 해상도 복귀 보류");
  } else if (hysteresisHoldActive) {
    reasonParts.push("히스테리시스 진동 억제 유지");
  }
  reasonParts.push("펜 원시 샘플링 무감쇠 유지");

  const nextState: GovernorInternalState = Object.freeze({
    activeLevel: nextLevel,
    pendingMetricEscalationTicks: nextMetricTicks,
    consecutiveCalmRecoveryTicks: nextCalmTicks,
    totalEvaluations: prevState.totalEvaluations + 1,
    levelTransitionCount,
  });

  const budget: StudioQualityBudget = Object.freeze({
    pressureLevel: nextLevel,
    profileId: preset.profileId,
    profileLabelKo: preset.profileLabelKo,
    viewportPixelRatio,
    shadowCascadeCount: preset.shadowCascadeCount,
    ambientParticleScale: preset.ambientParticleScale,
    idleBackgroundBudgetMs,
    targetCanvasHz,
    stylusSamplingUnthrottled: true as const,
    coalescedPointerCaptureActive: true as const,
    droppedStylusSampleCount: 0 as const,
    hysteresisHoldActive,
    midStrokeResolutionLocked,
    levelTransitionCount,
    reasonKo: `${preset.profileLabelKo} — ${reasonParts.join(" · ")}`,
  });

  return Object.freeze({
    state: nextState,
    budget,
  });
}

/**
 * 스튜디오 뷰포트 루프에 연결해 사용하는 상태 보유형 발열·배터리 품질 거버너.
 */
export class TabletThermalBatteryGovernor {
  private currentState: GovernorInternalState;
  private readonly policy: GovernorPolicyConfig;

  public constructor(policy: GovernorPolicyConfig = {}, initialLevel: GovernorPressureLevel = 0) {
    this.policy = Object.freeze({ ...policy });
    this.currentState = createInitialGovernorState(initialLevel);
  }

  public getState(): GovernorInternalState {
    return this.currentState;
  }

  public reset(initialLevel: GovernorPressureLevel = 0): void {
    this.currentState = createInitialGovernorState(initialLevel);
  }

  public evaluate(telemetry: ThermalBatteryTelemetryInput): StudioQualityBudget {
    const stepped = stepThermalBatteryGovernor(this.currentState, telemetry, this.policy);
    this.currentState = stepped.state;
    return stepped.budget;
  }
}
