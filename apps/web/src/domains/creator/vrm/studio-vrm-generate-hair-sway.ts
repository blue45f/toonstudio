/**
 * 생성형 VRM 의 **헤어 흔들림(스프링본) 조율**.
 *
 * 헤어 리그(studio-vrm-hair-rig)는 체인 길이에서 흔들림 세기를 자동으로 뽑는다 — 짧은 가닥은 굳게,
 * 긴 머리는 느슨하게. 이 모듈은 그 자동 값 위에 작가가 얹는 **배율**을 다룬다.
 *
 * VRoid Studio 공개 가이드의 흔들림 설정(헤어 묶음마다 단단함·중력·충돌 반경을 조정)과 같은
 * 작업 흐름을 따르되, 값은 절대값이 아니라 자동 조율에 곱하는 배율이다. VRoid Studio 제품 소개가
 * 밝히듯 흔들림은 헤어 덩어리마다 따로 정할 수 있어야 하므로, 전체 → 묶음 → 가닥(스프링 체인) 세 단계로
 * 곱한다. 그래야 같은 "찰랑찰랑"
 * 설정에서도 앞머리는 앞머리답게, 롱헤어는 롱헤어답게 흔들린다. 배율이 전부 1 이면 아무것도 바꾸지
 * 않으므로 조정하지 않은 생성 VRM 은 이전과 같다.
 */

import type { AvatarForgeHairPart } from "./studio-vrm-avatar-forge";

export const STUDIO_VRM_HAIR_SWAY_PARAM_KEYS = ["stiffness", "gravity", "drag"] as const;
export type StudioVrmHairSwayParamKey = (typeof STUDIO_VRM_HAIR_SWAY_PARAM_KEYS)[number];

/** 자동 조율 값에 곱하는 배율. 1 = 자동 그대로. */
export type StudioVrmHairSwayParams = Readonly<Record<StudioVrmHairSwayParamKey, number>>;
export type StudioVrmHairSwayPatch = Readonly<Partial<Record<StudioVrmHairSwayParamKey, number>>>;

export type StudioVrmHairSwayLimit = {
  readonly label: string;
  readonly hint: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
};

export const STUDIO_VRM_HAIR_SWAY_LIMITS: Readonly<Record<StudioVrmHairSwayParamKey, StudioVrmHairSwayLimit>> =
  Object.freeze({
    stiffness: { label: "단단함", hint: "높을수록 원래 모양으로 빨리 돌아옵니다", min: 0.3, max: 3, step: 0.05 },
    gravity: { label: "처짐", hint: "높을수록 아래로 늘어집니다", min: 0, max: 3, step: 0.05 },
    drag: { label: "공기 저항", hint: "높을수록 흔들림이 빨리 멎습니다", min: 0.4, max: 1.6, step: 0.05 },
  });

export const STUDIO_VRM_HAIR_SWAY_GROUP_IDS = ["bang", "side", "back", "tail", "ahoge"] as const;
export type StudioVrmHairSwayGroupId = (typeof STUDIO_VRM_HAIR_SWAY_GROUP_IDS)[number];

export const STUDIO_VRM_HAIR_SWAY_GROUPS: readonly {
  readonly id: StudioVrmHairSwayGroupId;
  readonly label: string;
}[] = Object.freeze([
  { id: "bang", label: "앞머리" },
  { id: "side", label: "옆머리" },
  { id: "back", label: "뒷머리" },
  { id: "tail", label: "묶음·땋은 머리" },
  { id: "ahoge", label: "삐침머리" },
]);

export type StudioVrmHairSwayPresetId = "auto" | "still" | "calm" | "bouncy" | "heavy";

export const STUDIO_VRM_HAIR_SWAY_PRESETS: readonly {
  readonly id: StudioVrmHairSwayPresetId;
  readonly label: string;
  readonly hint: string;
  readonly params: StudioVrmHairSwayParams;
}[] = Object.freeze([
  { id: "auto", label: "자동", hint: "가닥 길이에 맞춘 기본 흔들림", params: { stiffness: 1, gravity: 1, drag: 1 } },
  { id: "still", label: "거의 고정", hint: "정지 컷에서 머리가 흐트러지지 않게", params: { stiffness: 3, gravity: 0.4, drag: 1.6 } },
  { id: "calm", label: "차분하게", hint: "천천히 따라오는 묵직한 결", params: { stiffness: 1.5, gravity: 0.8, drag: 1.3 } },
  { id: "bouncy", label: "찰랑찰랑", hint: "가볍게 튀는 생기 있는 움직임", params: { stiffness: 0.6, gravity: 0.7, drag: 0.6 } },
  { id: "heavy", label: "무겁게", hint: "긴 생머리처럼 아래로 늘어짐", params: { stiffness: 0.8, gravity: 2.4, drag: 1.1 } },
]);

export type StudioVrmHairSwayAuthoring = {
  /** 모든 헤어 체인에 거는 배율. */
  readonly global?: StudioVrmHairSwayPatch;
  /** 묶음별 추가 배율. 전체 배율과 곱해진다. */
  readonly groups?: Readonly<Partial<Record<StudioVrmHairSwayGroupId, StudioVrmHairSwayPatch>>>;
  /** 가닥(헤어 리그 체인 id)별 추가 배율. 전체·묶음 배율 위에 한 번 더 곱해진다. */
  readonly chains?: Readonly<Record<string, StudioVrmHairSwayPatch>>;
};

/** 조율 범위: 전체, 묶음 하나, 또는 가닥 하나(`chain:<체인 id>`). */
export type StudioVrmHairSwayScope = "global" | StudioVrmHairSwayGroupId | `chain:${string}`;

/** 가닥별 조정을 둘 수 있는 최대 개수. 생성 헤어는 캐릭터당 체인이 10개 안팎이다. */
export const STUDIO_VRM_HAIR_SWAY_MAX_CHAINS = 32;
/** 헤어 리그 체인 id 모양(`bang-blunt-0`, `wolf-nape-center`). 장면 문서의 안전 키 규칙 안쪽이다. */
const CHAIN_ID_PATTERN = /^[a-z][a-z0-9-]{0,47}$/u;

export function studioVrmHairSwayChainScope(chainId: string): `chain:${string}` {
  return `chain:${chainId}`;
}

function chainIdOf(scope: StudioVrmHairSwayScope): string | null {
  return scope.startsWith("chain:") ? scope.slice("chain:".length) : null;
}

const NEUTRAL: StudioVrmHairSwayParams = Object.freeze({ stiffness: 1, gravity: 1, drag: 1 });
const VALUE_PRECISION = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizePatch(raw: unknown): StudioVrmHairSwayPatch | undefined {
  if (!isRecord(raw)) return undefined;
  const patch: Partial<Record<StudioVrmHairSwayParamKey, number>> = {};
  for (const key of STUDIO_VRM_HAIR_SWAY_PARAM_KEYS) {
    const value = raw[key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const limit = STUDIO_VRM_HAIR_SWAY_LIMITS[key];
    const bounded = Math.round(Math.min(limit.max, Math.max(limit.min, value)) * VALUE_PRECISION) / VALUE_PRECISION;
    if (bounded !== 1) patch[key] = bounded;
  }
  return Object.keys(patch).length > 0 ? patch : undefined;
}

/** 저장본을 정규화한다. 전부 기본값이면 `undefined`(조형 상태에 키를 만들지 않는다). */
export function sanitizeStudioVrmHairSwayAuthoring(raw: unknown): StudioVrmHairSwayAuthoring | undefined {
  if (!isRecord(raw)) return undefined;
  const global = sanitizePatch(raw.global);
  const groups: Partial<Record<StudioVrmHairSwayGroupId, StudioVrmHairSwayPatch>> = {};
  if (isRecord(raw.groups)) {
    for (const id of STUDIO_VRM_HAIR_SWAY_GROUP_IDS) {
      const patch = sanitizePatch(raw.groups[id]);
      if (patch) groups[id] = patch;
    }
  }
  const hasGroups = Object.keys(groups).length > 0;
  const chains: Record<string, StudioVrmHairSwayPatch> = {};
  if (isRecord(raw.chains)) {
    // 키를 정렬해 저장 순서와 무관하게 같은 문서가 된다.
    for (const id of Object.keys(raw.chains).sort()) {
      if (Object.keys(chains).length >= STUDIO_VRM_HAIR_SWAY_MAX_CHAINS || !CHAIN_ID_PATTERN.test(id)) continue;
      const patch = sanitizePatch(raw.chains[id]);
      if (patch) chains[id] = patch;
    }
  }
  const hasChains = Object.keys(chains).length > 0;
  if (!global && !hasGroups && !hasChains) return undefined;
  return {
    ...(global ? { global } : {}),
    ...(hasGroups ? { groups } : {}),
    ...(hasChains ? { chains } : {}),
  };
}

/** 한 범위(전체·묶음·가닥)의 현재 배율. 저장되지 않은 값은 1 이다. */
export function resolveStudioVrmHairSwayScope(
  authoring: StudioVrmHairSwayAuthoring | undefined,
  scope: StudioVrmHairSwayScope,
): StudioVrmHairSwayParams {
  const chainId = chainIdOf(scope);
  const patch = chainId !== null
    ? authoring?.chains?.[chainId]
    : scope === "global" ? authoring?.global : authoring?.groups?.[scope as StudioVrmHairSwayGroupId];
  return { ...NEUTRAL, ...patch };
}

/** 범위 하나의 배율 하나를 바꾼다. */
export function setStudioVrmHairSwayParam(
  authoring: StudioVrmHairSwayAuthoring | undefined,
  scope: StudioVrmHairSwayScope,
  key: StudioVrmHairSwayParamKey,
  value: number,
): StudioVrmHairSwayAuthoring | undefined {
  const current = resolveStudioVrmHairSwayScope(authoring, scope);
  const next = { ...current, [key]: value };
  const chainId = chainIdOf(scope);
  if (chainId !== null) return sanitizeStudioVrmHairSwayAuthoring({ ...authoring, chains: { ...authoring?.chains, [chainId]: next } });
  if (scope === "global") return sanitizeStudioVrmHairSwayAuthoring({ ...authoring, global: next });
  return sanitizeStudioVrmHairSwayAuthoring({ ...authoring, groups: { ...authoring?.groups, [scope]: next } });
}

/** 프리셋을 전체 배율로 적용한다. 묶음·가닥별 조정은 작가가 따로 만든 것이라 남긴다. */
export function applyStudioVrmHairSwayPreset(
  authoring: StudioVrmHairSwayAuthoring | undefined,
  presetId: StudioVrmHairSwayPresetId,
): StudioVrmHairSwayAuthoring | undefined {
  const preset = STUDIO_VRM_HAIR_SWAY_PRESETS.find((entry) => entry.id === presetId);
  if (!preset) return sanitizeStudioVrmHairSwayAuthoring(authoring);
  return sanitizeStudioVrmHairSwayAuthoring({ ...authoring, global: preset.params });
}

/** 범위 하나를 자동(1)으로 되돌린다. */
export function resetStudioVrmHairSwayScope(
  authoring: StudioVrmHairSwayAuthoring | undefined,
  scope: StudioVrmHairSwayScope,
): StudioVrmHairSwayAuthoring | undefined {
  const chainId = chainIdOf(scope);
  if (chainId !== null) {
    const chains = { ...authoring?.chains };
    delete chains[chainId];
    return sanitizeStudioVrmHairSwayAuthoring({ ...authoring, chains });
  }
  if (scope === "global") return sanitizeStudioVrmHairSwayAuthoring({ ...authoring, global: undefined });
  const groups = { ...authoring?.groups };
  delete groups[scope as StudioVrmHairSwayGroupId];
  return sanitizeStudioVrmHairSwayAuthoring({ ...authoring, groups });
}

/** 전체 배율이 프리셋과 같으면 그 프리셋 id. 직접 조정했다면 `null`. */
export function matchStudioVrmHairSwayPreset(
  authoring: StudioVrmHairSwayAuthoring | undefined,
): StudioVrmHairSwayPresetId | null {
  const global = resolveStudioVrmHairSwayScope(authoring, "global");
  const match = STUDIO_VRM_HAIR_SWAY_PRESETS.find((preset) =>
    STUDIO_VRM_HAIR_SWAY_PARAM_KEYS.every((key) => Math.abs(preset.params[key] - global[key]) < 1e-6));
  return match?.id ?? null;
}

/**
 * 헤어 파츠 역할 → 흔들림 묶음. 땋은 머리 체인은 파츠 id 가 아니라 접두사로 이름이 붙으므로
 * (`braid`, `braid-left`) 파츠 표에 없는 체인은 땋은 머리로 본다.
 */
export function studioVrmHairSwayGroupForRole(
  role: AvatarForgeHairPart["role"] | undefined,
): StudioVrmHairSwayGroupId {
  switch (role) {
    case "bang":
      return "bang";
    case "side":
      return "side";
    case "back":
    case "cap":
      return "back";
    case "ahoge":
      return "ahoge";
    default:
      return "tail";
  }
}

export type StudioVrmSpringTuning = {
  readonly stiffness: number;
  readonly gravityPower: number;
  readonly dragForce: number;
};

/**
 * 체인 하나의 자동 조율 값에 전체·묶음·가닥 배율을 곱한다. VRM 1.0 `dragForce` 는 0~1 이고
 * 다른 둘은 음수가 될 수 없으므로 범위를 지킨다.
 */
export function applyStudioVrmHairSway(
  base: StudioVrmSpringTuning,
  authoring: StudioVrmHairSwayAuthoring | undefined,
  group: StudioVrmHairSwayGroupId,
  chainId?: string,
): StudioVrmSpringTuning {
  if (!authoring) return base;
  const global = resolveStudioVrmHairSwayScope(authoring, "global");
  const local = resolveStudioVrmHairSwayScope(authoring, group);
  const own = chainId === undefined ? NEUTRAL : resolveStudioVrmHairSwayScope(authoring, studioVrmHairSwayChainScope(chainId));
  const stiffness = global.stiffness * local.stiffness * own.stiffness;
  const gravity = global.gravity * local.gravity * own.gravity;
  const drag = global.drag * local.drag * own.drag;
  if (stiffness === 1 && gravity === 1 && drag === 1) return base;
  return {
    stiffness: Math.min(8, Math.max(0, base.stiffness * stiffness)),
    gravityPower: Math.min(4, Math.max(0, base.gravityPower * gravity)),
    dragForce: Math.min(1, Math.max(0, base.dragForce * drag)),
  };
}

/** 조정한 범위 수(전체 + 묶음 + 가닥). 패널 요약 배지에 쓴다. */
export function countStudioVrmHairSwayScopes(authoring: StudioVrmHairSwayAuthoring | undefined): number {
  return (authoring?.global ? 1 : 0) + Object.keys(authoring?.groups ?? {}).length + Object.keys(authoring?.chains ?? {}).length;
}
