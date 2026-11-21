/** 헤어 형태·그라데이션의 공통 범위 제어와 색상 견본. */
import { AVATAR_FORGE_HAIR_LIMITS, DEFAULT_AVATAR_FORGE_STATE } from "../vrm/studio-vrm-avatar-forge";
import { AVATAR_FORGE_HAIR_GRADIENT_LIMITS, resolveAvatarForgeHairGradient } from "../vrm/studio-vrm-avatar-forge-hair-color";
import { CharacterRangeControl } from "./CharacterShaperControls";

import type { AvatarForgeHairLimitKey, AvatarForgeHairParams } from "../vrm/studio-vrm-avatar-forge";
import type { AvatarForgeHairGradientKey } from "../vrm/studio-vrm-avatar-forge-hair-color";

export type HairSliderKey = AvatarForgeHairLimitKey | AvatarForgeHairGradientKey;

const HAIR_SLIDER_HINTS: Partial<Record<HairSliderKey, string>> = {
  strandWidth: "가닥 하나하나의 폭. 작게 하면 가늘고 날카로운 머리카락",
  ahoge: "정수리에서 튀어나온 한 가닥. 0이면 없음",
  tailHeight: "포니테일·트윈테일·번·땋은 머리가 묶이는 높이",
  fringe: "앞머리가 내려오는 길이. 눈을 덮을 만큼 길게도 짧게도",
  gradientPosition: "끝 색이 시작되는 지점. 0은 뿌리부터, 1은 끝만 물듭니다",
  gradientSoftness: "기본색과 끝 색의 경계. 0이면 또렷한 투톤, 1이면 부드러운 그라데이션",
};

export function HairRange({
  hair,
  limitKey,
  locked,
  onCommit,
}: {
  readonly hair: AvatarForgeHairParams;
  readonly limitKey: HairSliderKey;
  readonly locked: boolean;
  readonly onCommit: (key: HairSliderKey, value: number, label: string) => void;
}) {
  const gradient = resolveAvatarForgeHairGradient(hair);
  const isGradient = limitKey === "gradientPosition" || limitKey === "gradientSoftness";
  const limit = isGradient ? AVATAR_FORGE_HAIR_GRADIENT_LIMITS[limitKey] : AVATAR_FORGE_HAIR_LIMITS[limitKey];
  const fallback = limitKey === "gradientPosition" ? 0.5
    : limitKey === "gradientSoftness" ? 1
      : DEFAULT_AVATAR_FORGE_STATE.hair[limitKey];
  const value = limitKey === "gradientPosition" ? gradient.position
    : limitKey === "gradientSoftness" ? gradient.softness
      : hair[limitKey];
  return (
    <CharacterRangeControl
      label={limit.label}
      hint={HAIR_SLIDER_HINTS[limitKey]}
      value={typeof value === "number" ? value : fallback}
      min={limit.min}
      max={limit.max}
      step={limit.step}
      unit={limit.unit}
      defaultValue={fallback}
      disabled={locked}
      onCommit={(next) => onCommit(limitKey, next, limit.label)}
    />
  );
}

