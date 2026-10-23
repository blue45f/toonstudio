/**
 * 포지 헤어의 색 확장 — 그라데이션 위치·경계와 하이라이트(브릿지·이너 컬러). 순수 코어.
 *
 * 하위호환 계약(studio-vrm-avatar-forge.ts 상단과 같다): 새 필드는 전부 **선택 필드**이고 기본값일
 * 때는 상태에도 파츠 계획에도 키를 만들지 않는다. 그래서 v1~v4 문서의 파츠 계획 JSON 은 바이트
 * 단위로 그대로이고(V1_GEOMETRY_DIGESTS), 정점 색도 예전 선형 그라데이션(끝 색 최대 58%) 그대로다.
 *
 * - 그라데이션: `gradientPosition`(끝 색이 시작되는 길이 비율, 기본 0.5)과 `gradientSoftness`
 *   (경계 폭, 기본 1). 기본값 (0.5, 1) 은 예전 식 `t × 0.58` 과 정확히 같고, 경계를 0 으로
 *   좁히면 끝 색이 100% 까지 올라가는 또렷한 투톤이 된다.
 * - 하이라이트: `accentMode` 가 "streak"(브릿지 — 가르마 쪽 앞머리·옆머리 한 갈래 + 캡 줄무늬)
 *   또는 "inner"(이너 컬러 — 늘어진 머리의 안쪽 면과 아래쪽)일 때 `accentColor` 로 물들인다.
 */
import type { AvatarForgeHairParams, AvatarForgeHairPart, AvatarForgeNumericLimit } from "./studio-vrm-avatar-forge";

export type AvatarForgeHairAccentMode = "none" | "streak" | "inner";

export const AVATAR_FORGE_DEFAULT_HAIR_ACCENT_COLOR = "#f2a7c3";

export const AVATAR_FORGE_HAIR_ACCENT_MODE_OPTIONS: ReadonlyArray<{
  readonly id: AvatarForgeHairAccentMode;
  readonly label: string;
  readonly hint: string;
}> = [
  { id: "none", label: "없음", hint: "기본색에서 끝 색으로만 흐릅니다." },
  { id: "streak", label: "브릿지", hint: "가르마 쪽 앞머리·옆머리 한 갈래와 정수리 줄무늬에 하이라이트 색" },
  { id: "inner", label: "이너 컬러", hint: "늘어진 머리의 안쪽 면과 아래쪽에 하이라이트 색" },
];

export type AvatarForgeHairGradientKey = "gradientPosition" | "gradientSoftness";

export const AVATAR_FORGE_HAIR_GRADIENT_LIMITS: Readonly<Record<AvatarForgeHairGradientKey, AvatarForgeNumericLimit>> = {
  gradientPosition: { label: "끝 색 시작 위치", min: 0, max: 1, step: 0.01 },
  gradientSoftness: { label: "경계 부드러움", min: 0, max: 1, step: 0.01 },
};

/** 기본값(v1 선형 그라데이션과 같은 결과). 이 값과 같으면 상태·파츠에 키를 남기지 않는다. */
export const AVATAR_FORGE_HAIR_GRADIENT_DEFAULTS = Object.freeze({ position: 0.5, softness: 1 });

/** 묶음 높이(`tailHeight`)가 실제로 쓰이는 스타일. 나머지 스타일에서는 슬라이더가 효과가 없다. */
export const AVATAR_FORGE_TIED_HAIR_STYLES: ReadonlySet<AvatarForgeHairParams["style"]> = new Set([
  "ponytail",
  "twintail",
  "bun",
  "braid",
  "twin-braid",
  "half-up",
]);

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function bounded(value: unknown, limit: AvatarForgeNumericLimit): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.min(limit.max, Math.max(limit.min, numeric));
}

/** 헤어 원본(record)에서 색 확장 필드만 정리한다. 기본값·잘못된 값은 키를 만들지 않는다. */
export function sanitizeAvatarForgeHairColorExtras(raw: Readonly<Record<string, unknown>>): Partial<Pick<
  AvatarForgeHairParams,
  "accentMode" | "accentColor" | "gradientPosition" | "gradientSoftness"
>> {
  const out: {
    accentMode?: Exclude<AvatarForgeHairAccentMode, "none">;
    accentColor?: string;
    gradientPosition?: number;
    gradientSoftness?: number;
  } = {};
  if (raw.accentMode === "streak" || raw.accentMode === "inner") out.accentMode = raw.accentMode;
  if (typeof raw.accentColor === "string" && HEX_COLOR.test(raw.accentColor)) out.accentColor = raw.accentColor.toLowerCase();
  const position = bounded(raw.gradientPosition, AVATAR_FORGE_HAIR_GRADIENT_LIMITS.gradientPosition);
  if (position !== null && Math.abs(position - AVATAR_FORGE_HAIR_GRADIENT_DEFAULTS.position) >= 0.0001) {
    out.gradientPosition = position;
  }
  const softness = bounded(raw.gradientSoftness, AVATAR_FORGE_HAIR_GRADIENT_LIMITS.gradientSoftness);
  if (softness !== null && Math.abs(softness - AVATAR_FORGE_HAIR_GRADIENT_DEFAULTS.softness) >= 0.0001) {
    out.gradientSoftness = softness;
  }
  return out;
}

/** 슬라이더가 보여 줄 실효 그라데이션 값(생략 = 기본값). */
export function resolveAvatarForgeHairGradient(
  hair: Pick<AvatarForgeHairParams, "gradientPosition" | "gradientSoftness">,
): { readonly position: number; readonly softness: number } {
  return {
    position: hair.gradientPosition ?? AVATAR_FORGE_HAIR_GRADIENT_DEFAULTS.position,
    softness: hair.gradientSoftness ?? AVATAR_FORGE_HAIR_GRADIENT_DEFAULTS.softness,
  };
}

/**
 * 끝 색이 섞이는 비율(0~1). 그라데이션 필드가 없는 파츠는 예전 식 `t × 0.58` 을 **그대로** 쓴다.
 * 필드가 있으면 `position` 을 중심으로 폭 `softness` 인 선형 경사이고, 최대 비율은 경계가
 * 좁을수록 1 에 가까워진다(0.5·1 → 예전 식과 같은 값).
 */
export function avatarForgeHairTipMix(
  part: Pick<AvatarForgeHairPart, "gradientPosition" | "gradientSoftness">,
  t: number,
): number {
  const progress = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  if (part.gradientPosition === undefined && part.gradientSoftness === undefined) return progress * 0.58;
  const position = part.gradientPosition ?? AVATAR_FORGE_HAIR_GRADIENT_DEFAULTS.position;
  const softness = part.gradientSoftness ?? AVATAR_FORGE_HAIR_GRADIENT_DEFAULTS.softness;
  const width = Math.max(0.02, softness);
  const ramp = Math.min(1, Math.max(0, (progress - (position - width / 2)) / width));
  return ramp * (1 - 0.42 * softness);
}

/** 브릿지(streak)를 받는 가닥. 가르마 쪽(단위 공간 x<0) 대표 앞머리 한 갈래와 옆·묶음 머리 한 갈래. */
const STREAK_PART_IDS: ReadonlySet<string> = new Set([
  "bang-center",
  "bang-split-left",
  "bang-sweep-main",
  "bang-curtain-left",
  "bang-blunt-1",
  "short-left",
  "side-left",
  "wavy-side-left",
  "hime-lock-left",
  "wolf-side-left",
  "halfup-side-left",
  "pixie-sideburn-left",
  "bun-wisp-left",
  "twin-left",
  "pony-tail",
  "wolf-nape-left",
]);

/** 이너 컬러를 받는 역할: 늘어진 머리(옆·뒤·묶음·땋음). 캡·앞머리·번·삐침머리는 겉머리로 둔다. */
const INNER_ROLES: ReadonlySet<AvatarForgeHairPart["role"]> = new Set(["side", "back", "tail", "braid"]);

function streakTarget(part: AvatarForgeHairPart): boolean {
  if (part.role === "cap") return true;
  if (STREAK_PART_IDS.has(part.id)) return true;
  // 땋은 머리는 왼쪽(혹은 외갈래) 마디 전체가 한 갈래다.
  return part.role === "braid" && (part.id.startsWith("braid-left-seg-") || part.id.startsWith("braid-seg-"));
}

/**
 * 파츠 계획에 색 확장 필드를 붙인다. 상태에 확장이 없으면 **같은 배열을 그대로** 돌려준다
 * (파츠 JSON 바이트 동일 계약).
 */
export function decorateAvatarForgeHairParts(
  parts: AvatarForgeHairPart[],
  hair: AvatarForgeHairParams,
): AvatarForgeHairPart[] {
  const gradient = {
    ...(hair.gradientPosition !== undefined ? { gradientPosition: hair.gradientPosition } : {}),
    ...(hair.gradientSoftness !== undefined ? { gradientSoftness: hair.gradientSoftness } : {}),
  };
  const mode = hair.accentMode;
  const accentColor = hair.accentColor ?? AVATAR_FORGE_DEFAULT_HAIR_ACCENT_COLOR;
  if (Object.keys(gradient).length === 0 && !mode) return parts;
  return parts.map((part) => {
    const accented = mode === "streak" ? streakTarget(part) : mode === "inner" ? INNER_ROLES.has(part.role) : false;
    return {
      ...part,
      ...gradient,
      ...(accented && mode ? { accentMode: mode, accentColor } : {}),
    };
  });
}
