/**
 * Studio 3D 데생 인형 — Magic Poser 벤치마크: 라이팅 스튜디오 (MP3).
 *
 * 데생 인형 장면의 조명을 웹툰 명암 레퍼런스 용도로 다룹니다.
 * Directional/Spot/Point 3종, 장면당 최대 4개(웹 성능 고려)입니다.
 * 시간대 프리셋(새벽/정오/황혼/밤)과 그림자 on/off를 제공하고,
 * LT 변환과 연동할 때 조명 기반 명암 양자화 힌트를 뽑을 수 있습니다.
 *
 * Three.js 조명 객체를 직접 다루지 않는 순수 데이터+로직 모듈입니다.
 * 실제 씬 반영은 `resolveStudioMannequinLightingPlan`이 만든 계획을
 * `studio-mannequin-scene.ts`의 `setLightingRig`가 Three.js 조명으로 마운트합니다.
 */

import type { StudioMannequinVec3 } from "./studio-mannequin-model";

/** 장면당 최대 조명 수(웹 성능 예산). */
export const STUDIO_MANNEQUIN_MAX_LIGHTS = 4 as const;

export type StudioMannequinLightKind = "directional" | "spot" | "point";

export interface StudioMannequinLight {
  readonly id: string;
  readonly kind: StudioMannequinLightKind;
  /** 밝기 0~10. */
  readonly intensity: number;
  /** 16진 색상 문자열(#rrggbb). */
  readonly color: string;
  /** 조명 위치(모델 기준 미터). */
  readonly position: StudioMannequinVec3;
  /** spot 전용: 조사각(rad). */
  readonly angle?: number;
  /** point/spot 전용: 도달 반경(m). */
  readonly distance?: number;
}

export interface StudioMannequinLightingRig {
  readonly lights: readonly StudioMannequinLight[];
  /** 그림자 렌더링 여부. */
  readonly shadowsEnabled: boolean;
  /** 시간대 (낮/밤 등). */
  readonly timeOfDay: StudioMannequinTimeOfDay;
}

export type StudioMannequinTimeOfDay = "dawn" | "noon" | "dusk" | "night";

export const STUDIO_MANNEQUIN_TIME_OF_DAY_LABELS: Record<StudioMannequinTimeOfDay, string> =
  Object.freeze({
    dawn: "새벽",
    noon: "정오",
    dusk: "황혼",
    night: "밤",
  });

export interface StudioMannequinTimeOfDayUi {
  readonly labelEn: string;
  /** 한 줄 설명(10초 이해용). */
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  /** 호버 툴팁. */
  readonly tooltipKo: string;
  readonly tooltipEn: string;
  /** lucide 아이콘 이름 힌트(실제 아이콘 매핑은 뷰 컴포넌트 담당). */
  readonly icon: "sunrise" | "sun" | "sunset" | "moon";
}

/** 시간대 프리셋 UI 메타데이터(ko/en, 아이콘+한줄설명+툴팁). */
export const STUDIO_MANNEQUIN_TIME_OF_DAY_UI: Readonly<
  Record<StudioMannequinTimeOfDay, StudioMannequinTimeOfDayUi>
> = Object.freeze({
  dawn: Object.freeze({
    labelEn: "Dawn",
    descriptionKo: "차가운 파란 보조광과 따뜻한 아침 햇살의 대비.",
    descriptionEn: "Cool blue fill against warm morning sunlight.",
    tooltipKo: "새벽 — 낮은 주황빛 키 라이트와 파란 보조광. 그림자는 길고 부드럽게.",
    tooltipEn: "Dawn — low warm key light with blue fill. Long, soft shadows.",
    icon: "sunrise",
  }),
  noon: Object.freeze({
    labelEn: "Noon",
    descriptionKo: "머리 위 직사광선. 형태와 색이 가장 또렷하게 읽힘.",
    descriptionEn: "Overhead sunlight. Shapes and colors read most clearly.",
    tooltipKo: "정오 — 위에서 내리쬐는 강한 키 라이트. 짧고 선명한 그림자.",
    tooltipEn: "Noon — strong overhead key light. Short, crisp shadows.",
    icon: "sun",
  }),
  dusk: Object.freeze({
    labelEn: "Dusk",
    descriptionKo: "낮게 깔리는 주황빛 사광선. 감성적인 역광 연출.",
    descriptionEn: "Low orange raking light. Emotional backlight mood.",
    tooltipKo: "황혼 — 옆에서 낮게 비추는 따뜻한 스폿 보조광 포함.",
    tooltipEn: "Dusk — includes a warm low spot from the side.",
    icon: "sunset",
  }),
  night: Object.freeze({
    labelEn: "Night",
    descriptionKo: "차가운 달빛과 낮은 환경광. 그림자는 기본 off.",
    descriptionEn: "Cold moonlight and low ambient. Shadows off by default.",
    tooltipKo: "밤 — 차가운 포인트 달빛. 성능과 분위기를 위해 그림자 off.",
    tooltipEn: "Night — cold point moonlight. Shadows off for mood and speed.",
    icon: "moon",
  }),
});

export class StudioMannequinLightingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudioMannequinLightingError";
  }
}

function clampIntensity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.min(10, Math.max(0, value));
}

function normalizeColor(value: unknown): string {
  if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  return "#ffffff";
}

let lightSequence = 0;

function nextLightId(): string {
  lightSequence += 1;
  return `light-${lightSequence}`;
}

/** 빈 라이팅 릭을 만듭니다. */
export function createStudioMannequinLightingRig(): StudioMannequinLightingRig {
  return { lights: [], shadowsEnabled: true, timeOfDay: "noon" };
}

/** 조명을 추가합니다. 4개를 초과하면 오류를 던집니다. */
export function addStudioMannequinLight(
  rig: StudioMannequinLightingRig,
  spec: Omit<StudioMannequinLight, "id"> & { readonly id?: string },
): StudioMannequinLightingRig {
  if (rig.lights.length >= STUDIO_MANNEQUIN_MAX_LIGHTS) {
    throw new StudioMannequinLightingError(
      `조명은 최대 ${STUDIO_MANNEQUIN_MAX_LIGHTS}개까지 추가할 수 있습니다.`,
    );
  }
  const light: StudioMannequinLight = {
    id: spec.id ?? nextLightId(),
    kind: spec.kind,
    intensity: clampIntensity(spec.intensity),
    color: normalizeColor(spec.color),
    position: spec.position,
    ...(spec.angle !== undefined ? { angle: spec.angle } : {}),
    ...(spec.distance !== undefined ? { distance: spec.distance } : {}),
  };
  return { ...rig, lights: [...rig.lights, light] };
}

/** 조명을 제거합니다. 없는 ID면 그대로 돌립니다. */
export function removeStudioMannequinLight(
  rig: StudioMannequinLightingRig,
  id: string,
): StudioMannequinLightingRig {
  return { ...rig, lights: rig.lights.filter((light) => light.id !== id) };
}

/** 조명 파라미터를 부분 업데이트합니다. */
export function updateStudioMannequinLight(
  rig: StudioMannequinLightingRig,
  id: string,
  patch: Partial<Omit<StudioMannequinLight, "id">>,
): StudioMannequinLightingRig {
  return {
    ...rig,
    lights: rig.lights.map((light) =>
      light.id === id
        ? {
            ...light,
            ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
            ...(patch.intensity !== undefined ? { intensity: clampIntensity(patch.intensity) } : {}),
            ...(patch.color !== undefined ? { color: normalizeColor(patch.color) } : {}),
            ...(patch.position !== undefined ? { position: patch.position } : {}),
            ...(patch.angle !== undefined ? { angle: patch.angle } : {}),
            ...(patch.distance !== undefined ? { distance: patch.distance } : {}),
          }
        : light,
    ),
  };
}

/** 그림자를 켜거나 끕니다. */
export function setStudioMannequinShadows(
  rig: StudioMannequinLightingRig,
  enabled: boolean,
): StudioMannequinLightingRig {
  return { ...rig, shadowsEnabled: enabled };
}

/**
 * 시간대 프리셋으로 릭을 통째로 교체합니다.
 * 웹툰 명암 레퍼런스용 대표 조명 배치입니다.
 * 반환 릭의 `timeOfDay`는 반드시 요청한 프리셋과 같습니다 — 스튜디오 UI의
 * 활성 프리셋 표시와 씬 핸들(`setLightingRig`) 동기화가 이 필드를 기준으로 합니다.
 */
export function applyStudioMannequinTimeOfDay(
  preset: StudioMannequinTimeOfDay,
): StudioMannequinLightingRig {
  const base = createStudioMannequinLightingRig();
  switch (preset) {
    case "dawn":
      return {
        ...addStudioMannequinLight(
          addStudioMannequinLight(base, {
            kind: "directional",
            intensity: 2.2,
            color: "#ffb37a",
            position: [-3, 1.5, 4],
          }),
          { kind: "point", intensity: 0.6, color: "#7a9bff", position: [2, 2, -2], distance: 8 },
        ),
        shadowsEnabled: true,
        timeOfDay: preset,
      };
    case "noon":
      return {
        ...addStudioMannequinLight(base, {
          kind: "directional",
          intensity: 3.5,
          color: "#ffffff",
          position: [0.5, 5, 1],
        }),
        shadowsEnabled: true,
        timeOfDay: preset,
      };
    case "dusk":
      return {
        ...addStudioMannequinLight(
          addStudioMannequinLight(base, {
            kind: "directional",
            intensity: 2.8,
            color: "#ff7a4d",
            position: [-4, 1, 2],
          }),
          { kind: "spot", intensity: 1.2, color: "#ffd9a0", position: [3, 2.5, 3], angle: 0.5, distance: 10 },
        ),
        shadowsEnabled: true,
        timeOfDay: preset,
      };
    case "night":
      return {
        ...addStudioMannequinLight(
          addStudioMannequinLight(base, {
            kind: "point",
            intensity: 1.5,
            color: "#9db8ff",
            position: [1.5, 2.5, 2],
            distance: 6,
          }),
          { kind: "directional", intensity: 0.4, color: "#33415e", position: [0, 4, -3] },
        ),
        shadowsEnabled: false,
        timeOfDay: preset,
      };
  }
}

/** 씬 마운트용 조명 1개의 계획(Three.js 비의존 순수 데이터). */
export interface StudioMannequinSceneLightPlan {
  readonly kind: StudioMannequinLightKind;
  /** Three.js 조명 intensity로 그대로 쓴다(스펙 0~10 스케일과 동일). */
  readonly intensity: number;
  /** 16진 색상 문자열(#rrggbb). */
  readonly color: string;
  readonly position: StudioMannequinVec3;
  /** spot 전용: 조사각(rad). */
  readonly angle?: number;
  /** spot 전용: 부드러운 가장자리 0~1. */
  readonly penumbra?: number;
  /** point/spot 전용: 도달 반경(m). 0이면 무한. */
  readonly distance?: number;
  /** 그림자를 만드는 조명인지(계획당 최대 1개 — 섀도맵 예산). */
  readonly castShadow: boolean;
}

/** 씬 마운트용 라이팅 계획 전체. */
export interface StudioMannequinLightingPlan {
  /** 환경 보조광(헤미스피어). null이면 만들지 않는다. */
  readonly hemisphere: {
    readonly skyColor: string;
    readonly groundColor: string;
    readonly intensity: number;
  } | null;
  readonly lights: readonly StudioMannequinSceneLightPlan[];
  readonly shadowsEnabled: boolean;
  /** rig가 비어 있어 기존 고정 3점 리그로 폴백한 계획인지. */
  readonly isDefault: boolean;
}

/**
 * 기존 고정 3점 리그와 픽셀 단위로 같은 기본 계획입니다.
 * rig를 한 번도 적용하지 않은 씬, 그리고 빈 rig(조명 0개)는 이 계획을 씁니다 —
 * 라이팅 스튜디오를 열기 전 화면이 예전과 달라지면 안 되기 때문입니다.
 */
export const STUDIO_MANNEQUIN_DEFAULT_LIGHTING_PLAN: StudioMannequinLightingPlan = Object.freeze({
  hemisphere: Object.freeze({ skyColor: "#fff4e6", groundColor: "#38322b", intensity: 0.95 }),
  lights: Object.freeze([
    Object.freeze({
      kind: "directional",
      intensity: 1.45,
      color: "#ffffff",
      position: [2.4, 4.2, 3.1] as const,
      castShadow: true,
    }),
    Object.freeze({
      kind: "directional",
      intensity: 0.42,
      color: "#ffe9d4",
      position: [-2.2, 1.6, -2.4] as const,
      castShadow: false,
    }),
    Object.freeze({
      kind: "directional",
      intensity: 0.28,
      color: "#cfe8ff",
      position: [-1.6, 2.8, 3.5] as const,
      castShadow: false,
    }),
  ]),
  shadowsEnabled: true,
  isDefault: true,
});

/**
 * 기본 3점 리그에서 그림자만 끈 계획. 빈 릭(조명 0개)은 "기본 조명"을 뜻하므로, 그 릭의
 * 그림자 끔도 기본 조명 그대로 그림자만 빼는 것으로 존중한다(예전에는 무시돼 토글이 먹지 않았다).
 */
const STUDIO_MANNEQUIN_DEFAULT_LIGHTING_PLAN_WITHOUT_SHADOWS: StudioMannequinLightingPlan = Object.freeze({
  ...STUDIO_MANNEQUIN_DEFAULT_LIGHTING_PLAN,
  lights: Object.freeze(
    STUDIO_MANNEQUIN_DEFAULT_LIGHTING_PLAN.lights.map((light) => Object.freeze({ ...light, castShadow: false })),
  ),
  shadowsEnabled: false,
});

/**
 * 라이팅 릭을 씬 마운트 계획으로 변환합니다(순수 함수 — WebGL 없이 테스트 가능).
 *
 * - rig가 null이거나 조명이 0개면 기본 계획(기존 고정 3점 리그)을 돌립니다. 빈 릭의
 *   `shadowsEnabled: false`는 기본 조명에서 그림자만 끈 계획으로 존중합니다.
 * - 그림자는 `shadowsEnabled`일 때 directional/spot 중 첫 번째 조명만 만듭니다.
 *   point 조명은 큐브 섀도맵 비용이 커서 그림자를 만들지 않습니다.
 * - rig가 있을 때는 형태가 완전히 어두워지지 않도록 약한 헤미스피어 보조광을 둡니다.
 */
export function resolveStudioMannequinLightingPlan(
  rig: StudioMannequinLightingRig | null | undefined,
): StudioMannequinLightingPlan {
  if (!rig || rig.lights.length === 0) {
    return rig && !rig.shadowsEnabled
      ? STUDIO_MANNEQUIN_DEFAULT_LIGHTING_PLAN_WITHOUT_SHADOWS
      : STUDIO_MANNEQUIN_DEFAULT_LIGHTING_PLAN;
  }
  let shadowAssigned = false;
  const lights = rig.lights.map((light): StudioMannequinSceneLightPlan => {
    const castShadow =
      rig.shadowsEnabled && !shadowAssigned && light.kind !== "point";
    if (castShadow) shadowAssigned = true;
    return {
      kind: light.kind,
      intensity: light.intensity,
      color: light.color,
      position: light.position,
      ...(light.kind === "spot"
        ? { angle: light.angle ?? 0.5, penumbra: 0.45 }
        : {}),
      ...(light.kind !== "directional"
        ? { distance: light.distance ?? 0 }
        : {}),
      castShadow,
    };
  });
  return {
    hemisphere: { skyColor: "#fff4e6", groundColor: "#38322b", intensity: 0.3 },
    lights,
    shadowsEnabled: rig.shadowsEnabled,
    isDefault: false,
  };
}

export interface StudioMannequinToneHint {
  /** 주광 방향(정규화 벡터). */
  readonly keyLightDirection: StudioMannequinVec3;
  /** 명암 대비 0~1. */
  readonly contrast: number;
  /** 그림자 사용 여부. */
  readonly shadows: boolean;
}

/**
 * LT 변환 연동용 명암 양자화 힌트를 뽑습니다.
 * 가장 밝은 directional/spot을 주광으로 간주합니다.
 */
export function studioMannequinLightingToToneHint(
  rig: StudioMannequinLightingRig,
): StudioMannequinToneHint {
  const key = [...rig.lights]
    .filter((light) => light.kind !== "point")
    .sort((a, b) => b.intensity - a.intensity)[0];
  const total = rig.lights.reduce((sum, light) => sum + light.intensity, 0);
  const keyIntensity = key?.intensity ?? 0;
  const contrast = total <= 0 ? 0 : Math.min(1, keyIntensity / total);
  const position = key?.position ?? [0, 1, 0];
  const length = Math.hypot(position[0], position[1], position[2]) || 1;
  return {
    keyLightDirection: [position[0] / length, position[1] / length, position[2] / length],
    contrast: Math.round(contrast * 100) / 100,
    shadows: rig.shadowsEnabled,
  };
}

/** 라이팅 스튜디오 표시값 — 패널이 "지금 뷰포트에 실제로 켜진 조명"을 보여 주는 근거. */
export interface StudioMannequinLightingReadout {
  /** 실제로 마운트되는 조명 수(기본 3점 리그면 3). */
  readonly lightCount: number;
  readonly maxLights: number;
  /** 릭을 적용하지 않았거나 빈 릭이라 기본 3점 리그를 쓰는지. */
  readonly usesDefaultRig: boolean;
  /** 주광 명암(가장 밝은 directional/spot ÷ 전체 밝기) 백분율. */
  readonly contrastPercent: number;
  readonly shadowsEnabled: boolean;
  /** 시간대 프리셋 릭일 때만 그 시간대. 기본 3점 리그면 어떤 시간대도 켜져 있지 않다. */
  readonly activeTimeOfDay: StudioMannequinTimeOfDay | null;
}

/**
 * 릭(없으면 null)을 표시값으로 바꿉니다. 빈 릭을 "조명 0개·명암 0%"로 읽으면 화면은 기본
 * 3점 리그로 밝은데 패널은 조명이 없다고 말하게 된다. 그래서 씬과 같은 계획
 * (resolveStudioMannequinLightingPlan)에서 읽어 패널과 뷰포트가 같은 사실을 말하게 한다.
 */
export function describeStudioMannequinLightingReadout(
  rig: StudioMannequinLightingRig | null | undefined,
): StudioMannequinLightingReadout {
  const plan = resolveStudioMannequinLightingPlan(rig);
  const key = plan.lights
    .filter((light) => light.kind !== "point")
    .reduce<StudioMannequinSceneLightPlan | null>(
      (best, light) => (best === null || light.intensity > best.intensity ? light : best),
      null,
    );
  const total = plan.lights.reduce((sum, light) => sum + light.intensity, 0);
  const contrast = key && total > 0 ? Math.min(1, key.intensity / total) : 0;
  return {
    lightCount: plan.lights.length,
    maxLights: STUDIO_MANNEQUIN_MAX_LIGHTS,
    usesDefaultRig: plan.isDefault,
    contrastPercent: Math.round(contrast * 100),
    shadowsEnabled: plan.shadowsEnabled,
    activeTimeOfDay: plan.isDefault || !rig ? null : rig.timeOfDay,
  };
}
