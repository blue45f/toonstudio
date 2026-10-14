/**
 * Studio stroke stabilizer presets.
 *
 * Lazy Nezumi Pro의 프리셋 체계(Subtle/Massive/Pulled String/Weighted/Speed Smooth)와
 * SAI의 단계식 보정을, studio-stroke-stabilizer의 모드 위에 얹는 "목적별 이름 + 파라미터 묶음" 층.
 *
 * 프리셋의 정체성은 (mode, strength) 쌍이다. 새 영속 상태를 만들지 않으므로 브러시 라이브러리
 * 스냅샷(stabilizer, stabilizerMode)만으로 프리셋 선택이 그대로 저장·복원되고, 패널과 그리기
 * 경로는 같은 쌍을 보고 활성 프리셋을 도출한다. 속도 게이트가 있는 프리셋(speed-smooth)은
 * 그리기 경로가 resolveStudioStabilizerPresetOptions로 옵션을 만들 때만 게이트가 붙는다.
 *
 * 강도는 엔진 스케일(0..STABILIZER_MAX)로 환산해 둔다. 초안 amount 0..1 기준:
 * subtle 0.18→1.8, pulled-string 0.72→7.2, massive 0.9→9, weighted 0.6→6,
 * speed-smooth 0.55→5.5, precision-ink 0.85→8.5.
 */

import { STABILIZER_MAX } from "../studio-brush";
import {
  normalizeStudioStabilizerMode,
  type StudioStabilizerMode,
  type StudioStabilizerSpeedGate,
  type StudioStrokeStabilizerOptions,
} from "./studio-stroke-stabilizer";

export const STUDIO_STABILIZER_PRESET_IDS = [
  "subtle",
  "pulled-string",
  "massive",
  "weighted",
  "speed-smooth",
  "precision-ink",
] as const;

export type StudioStabilizerPresetId = (typeof STUDIO_STABILIZER_PRESET_IDS)[number];

export interface StudioStabilizerPreset {
  readonly id: StudioStabilizerPresetId;
  readonly label: string;
  readonly description: string;
  /** 엔진 모드. weighted는 엔진의 신규 물리 모드를 그대로 쓴다. */
  readonly mode: StudioStabilizerMode;
  /** 엔진 스케일 강도(0..STABILIZER_MAX). */
  readonly strength: number;
  /** 이 구간(CSS px/ms)에서만 보정을 적용한다. 없으면 상시 적용. */
  readonly speedGate?: StudioStabilizerSpeedGate;
}

function presetStrength(amount: number): number {
  return Math.round(amount * STABILIZER_MAX * 10) / 10;
}

export const STUDIO_STABILIZER_PRESETS: readonly StudioStabilizerPreset[] = [
  {
    id: "subtle",
    label: "은은하게",
    description: "항상 켜 둬도 지연이 느껴지지 않는 최소 보정입니다.",
    mode: "standard",
    strength: presetStrength(0.18),
  },
  {
    id: "pulled-string",
    label: "긴 선화",
    description: "펜 끝이 끈에 매달린 듯 따라와 천천히 긴 곡선을 그리기 좋습니다.",
    mode: "precision",
    strength: presetStrength(0.72),
  },
  {
    id: "massive",
    label: "큰 획",
    description: "후행이 크지만 멈추면 따라잡습니다. 굵고 표현적인 선에 적합합니다.",
    mode: "standard",
    strength: presetStrength(0.9),
  },
  {
    id: "weighted",
    label: "무게 추",
    description: "물리 관성으로 따라오고, 속도에서 필압을 도출해 획 끝이 자연스럽게 가늘어집니다.",
    mode: "weighted",
    strength: presetStrength(0.6),
  },
  {
    id: "speed-smooth",
    label: "느릴 때만",
    description: "천천히 그릴 때만 보정을 걸고 빠른 플릭은 그대로 둡니다.",
    mode: "adaptive",
    strength: presetStrength(0.55),
    // 초안의 정규화 속도 상한 0.35를 엔진 스케일로 환산: 엔진 적응 모드의
    // 고속 기준 1.8 CSS px/ms × 0.35 ≈ 0.63 → 0.6으로 둔다.
    speedGate: { minSpeed: 0, maxSpeed: 0.6 },
  },
  {
    id: "precision-ink",
    label: "펜 정밀",
    description: "SAI식 강한 단계 보정입니다. 마감 선화 전용으로 권합니다.",
    mode: "precision",
    strength: presetStrength(0.85),
  },
];

export function isStudioStabilizerPresetId(
  value: unknown
): value is StudioStabilizerPresetId {
  return STUDIO_STABILIZER_PRESET_IDS.some((id) => id === value);
}

export function resolveStudioStabilizerPreset(
  id: StudioStabilizerPresetId
): StudioStabilizerPreset {
  return STUDIO_STABILIZER_PRESETS.find((preset) => preset.id === id)
    ?? STUDIO_STABILIZER_PRESETS[0]!;
}

export function normalizeStudioStabilizerPresetId(
  value: unknown,
  fallback: StudioStabilizerPresetId = "subtle"
): StudioStabilizerPresetId {
  return isStudioStabilizerPresetId(value) ? value : fallback;
}

/**
 * 프리셋을 엔진 호출 옵션으로 변환한다. coordinateScale은 호출자가 자기 좌표계에 맞게 채운다.
 * 게이트가 있는 프리셋은 여기서만 게이트가 붙으므로, 그리기 경로는 반드시 이 함수를 거쳐야
 * "느릴 때만" 같은 게이트 프리셋이 의도대로 동작한다.
 */
export function resolveStudioStabilizerPresetOptions(
  preset: StudioStabilizerPreset,
  coordinateScale?: number
): StudioStrokeStabilizerOptions {
  return {
    mode: preset.mode,
    strength: preset.strength,
    ...(coordinateScale !== undefined ? { coordinateScale } : {}),
    ...(preset.speedGate ? { speedGate: preset.speedGate } : {}),
  };
}

/**
 * 현재 (mode, strength) 상태와 일치하는 프리셋을 찾는다. 패널의 활성 프리셋 표시와,
 * 게이트 프리셋을 별도 상태 없이 복원하는 용도다. strength는 소수 첫째 자리까지 비교한다.
 */
export function findActiveStudioStabilizerPreset(
  mode: unknown,
  strength: unknown
): StudioStabilizerPreset | null {
  const normalizedMode = normalizeStudioStabilizerMode(mode, "adaptive");
  const numericStrength = typeof strength === "number" && Number.isFinite(strength)
    ? Math.round(strength * 10) / 10
    : Number.NaN;
  return STUDIO_STABILIZER_PRESETS.find(
    (preset) => preset.mode === normalizedMode && preset.strength === numericStrength
  ) ?? null;
}

/**
 * 그리기 경로용: 현재 상태가 게이트 프리셋과 일치하면 게이트를 붙인 엔진 옵션을 돌려준다.
 * 일치하지 않으면 게이트 없는 기본 옵션이므로 수동 설정 사용자는 기존 동작 그대로다.
 */
export function resolveStudioStabilizerOptionsForState(
  mode: unknown,
  strength: number,
  coordinateScale?: number
): StudioStrokeStabilizerOptions {
  const active = findActiveStudioStabilizerPreset(mode, strength);
  if (active) return resolveStudioStabilizerPresetOptions(active, coordinateScale);
  return {
    mode: normalizeStudioStabilizerMode(mode, "adaptive"),
    strength,
    ...(coordinateScale !== undefined ? { coordinateScale } : {}),
  };
}
