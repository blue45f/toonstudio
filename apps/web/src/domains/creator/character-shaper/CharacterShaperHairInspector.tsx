/**
 * Character Shaper — 헤어 슬롯 정밀 조절.
 *
 * 앞머리 형태·길이, 팔레트(기본·끝 색 + 그라데이션 위치·경계), 하이라이트(브릿지·이너 컬러),
 * 형태(길이·볼륨·모발 굵기·컬·웨이브·윤기·삐침머리·묶음 높이), 원본 헤어 감추기.
 * 모든 변경은 `binding.commitHairParams` 한 번 = 되돌리기 한 단계이고, 포지 상태로 저장된다.
 */
import {
  AVATAR_FORGE_BANG_STYLE_OPTIONS,
  AVATAR_FORGE_HAIR_LIMITS,
  DEFAULT_AVATAR_FORGE_STATE,
} from "../vrm/studio-vrm-avatar-forge";
import {
  AVATAR_FORGE_DEFAULT_HAIR_ACCENT_COLOR,
  AVATAR_FORGE_HAIR_ACCENT_MODE_OPTIONS,
  AVATAR_FORGE_HAIR_GRADIENT_LIMITS,
  AVATAR_FORGE_TIED_HAIR_STYLES,
  resolveAvatarForgeHairGradient,
} from "../vrm/studio-vrm-avatar-forge-hair-color";

import { frozenStatus3Text } from "../studio-frozen3-status-i18n";
import { CHARACTER_HAIR_PALETTES } from "./character-shaper-catalog";
import { characterSlotSelection } from "./character-shaper-ui-model";
import { CharacterChipGroup, CharacterColorControl, CharacterRangeControl } from "./CharacterShaperControls";
import { InspectorNote, InspectorSection, InspectorToggleRow } from "./CharacterShaperInspectorParts";

import type { CharacterColorSwatch } from "./CharacterShaperControls";
import type { CharacterShaperInspectorProps } from "./character-shaper-ui-contract";
import type {
  AvatarForgeHairLimitKey,
  AvatarForgeHairParams,
  AvatarForgeState,
} from "../vrm/studio-vrm-avatar-forge";
import type { AvatarForgeHairAccentMode, AvatarForgeHairGradientKey } from "../vrm/studio-vrm-avatar-forge-hair-color";

/** 카탈로그의 "원본 유지" 헤어 항목(`hair:original`). 이 항목이면 절차형 헤어 조절은 보이지 않는다. */
const ORIGINAL_HAIR_ENTRY_ID = "hair:original";

/** 형태 슬라이더 순서. 묶음 높이는 묶는 스타일에서만 따로 보인다. */
const HAIR_SHAPE_KEYS: readonly AvatarForgeHairLimitKey[] = [
  "length",
  "volume",
  "strandWidth",
  "curl",
  "wave",
  "shine",
  "ahoge",
];

type HairSliderKey = AvatarForgeHairLimitKey | AvatarForgeHairGradientKey;

const HAIR_SLIDER_HINTS: Partial<Record<HairSliderKey, string>> = {
  strandWidth: "가닥 하나하나의 폭. 작게 하면 가늘고 날카로운 머리카락",
  ahoge: "정수리에서 튀어나온 한 가닥. 0이면 없음",
  tailHeight: "포니테일·트윈테일·번·땋은 머리가 묶이는 높이",
  fringe: "앞머리가 내려오는 길이. 눈을 덮을 만큼 길게도 짧게도",
  gradientPosition: "끝 색이 시작되는 지점. 0은 뿌리부터, 1은 끝만 물듭니다",
  gradientSoftness: "기본색과 끝 색의 경계. 0이면 또렷한 투톤, 1이면 부드러운 그라데이션",
};

/** 하이라이트 추천 색 — 애니풍 브릿지·이너 컬러에 자주 쓰는 밝은 색. */
const HAIR_ACCENT_SWATCHES: readonly CharacterColorSwatch[] = [
  { color: "#f2a7c3", label: "로즈" },
  { color: "#c4b5fd", label: "라벤더" },
  { color: "#7dd3fc", label: "스카이" },
  { color: "#5eead4", label: "민트" },
  { color: "#fde68a", label: "골드" },
  { color: "#fb923c", label: "오렌지" },
  { color: "#ef4444", label: "레드" },
  { color: "#f5f5f4", label: "실버 화이트" },
];

function HairRange({
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

export function CharacterShaperHairInspector({
  h,
  binding,
  locked,
}: Pick<CharacterShaperInspectorProps, "h" | "binding"> & { readonly locked: boolean }) {
  const forgeState = (h.avatarForgeState ?? null) as AvatarForgeState | null;
  const hair = forgeState?.hair ?? DEFAULT_AVATAR_FORGE_STATE.hair;
  const baseColor = binding.snapshot.hairBaseColor ?? hair.baseColor;
  const tipColor = binding.snapshot.hairTipColor ?? hair.tipColor;
  const activePalette = CHARACTER_HAIR_PALETTES.find(
    (palette) =>
      palette.baseColor.toLowerCase() === String(baseColor).toLowerCase() &&
      palette.tipColor.toLowerCase() === String(tipColor).toLowerCase(),
  );
  const replaceOriginal = binding.snapshot.hairReplaceOriginal ?? hair.replaceOriginal;
  const originalHairCount = binding.profile.originalHairMeshCount ?? 0;
  // 원본 헤어를 쓰는 동안 아래 설정은 절차형 헤어에만 반영되어 화면에 보이지 않는다. 먼저 알린다.
  const usingOriginalHair = characterSlotSelection(binding.recipe, "hair").includes(ORIGINAL_HAIR_ENTRY_ID);
  const accentMode: AvatarForgeHairAccentMode = hair.accentMode ?? "none";
  const accentColor = hair.accentColor ?? AVATAR_FORGE_DEFAULT_HAIR_ACCENT_COLOR;
  const tied = AVATAR_FORGE_TIED_HAIR_STYLES.has(hair.style);
  const commitNumber = (key: HairSliderKey, value: number, label: string) =>
    binding.commitHairParams({ [key]: value }, `헤어: ${label}`);

  return (
    <>
      {usingOriginalHair ? (
        <div className="px-3 pt-3" data-character-hair-original-note="true">
          <InspectorNote>
            지금은 모델의 원본 헤어를 쓰고 있어 앞머리·팔레트·형태 조절이 화면에 보이지 않습니다. 위에서 헤어 스타일 카드를 고르면 바로 적용됩니다.
          </InspectorNote>
        </div>
      ) : null}
      <InspectorSection title="앞머리" hint="스타일과 따로 조합합니다.">
        <CharacterChipGroup
          label="앞머리 형태"
          value={binding.snapshot.hairBangStyle ?? hair.bangStyle}
          disabled={locked}
          columns={3}
          options={AVATAR_FORGE_BANG_STYLE_OPTIONS.map((option) => ({
            id: option.id,
            label: option.label,
            hint: option.hint,
          }))}
          onSelect={(id) => binding.commitHairParams({ bangStyle: id }, `헤어: 앞머리 ${id}`)}
        />
        <HairRange hair={hair} limitKey="fringe" locked={locked} onCommit={commitNumber} />
      </InspectorSection>
      <InspectorSection title="헤어 팔레트">
        <CharacterChipGroup
          label="헤어 팔레트"
          appearance="swatches"
          value={activePalette?.id ?? null}
          disabled={locked}
          options={CHARACTER_HAIR_PALETTES.map((palette) => ({
            id: palette.id,
            label: palette.label,
            swatch: palette.baseColor,
            swatchTip: palette.tipColor,
          }))}
          onSelect={(id) => {
            const palette = CHARACTER_HAIR_PALETTES.find((item) => item.id === id);
            if (!palette) return;
            binding.commitHairParams(
              { baseColor: palette.baseColor, tipColor: palette.tipColor },
              `헤어: ${palette.label}`,
            );
          }}
        />
        <CharacterColorControl
          label="헤어 기본색"
          value={baseColor}
          disabled={locked}
          onCommit={(color) => {
            if (color === null) return;
            binding.commitHairParams({ baseColor: color }, "헤어: 기본색");
          }}
        />
        <CharacterColorControl
          label="모발 끝 색"
          value={tipColor}
          disabled={locked}
          onCommit={(color) => {
            if (color === null) return;
            binding.commitHairParams({ tipColor: color }, "헤어: 끝 색");
          }}
        />
        <HairRange hair={hair} limitKey="gradientPosition" locked={locked} onCommit={commitNumber} />
        <HairRange hair={hair} limitKey="gradientSoftness" locked={locked} onCommit={commitNumber} />
      </InspectorSection>
      <InspectorSection
        title="하이라이트·브릿지"
        hint="브릿지는 앞머리·옆머리 한 갈래와 가르마 쪽 줄무늬를, 이너 컬러는 겉머리 안쪽과 늘어진 머리 아래쪽을 물들입니다."
      >
        <CharacterChipGroup
          label="하이라이트 방식"
          value={accentMode}
          disabled={locked}
          columns={3}
          options={AVATAR_FORGE_HAIR_ACCENT_MODE_OPTIONS.map((option) => ({
            id: option.id,
            label: option.label,
            hint: option.hint,
          }))}
          onSelect={(id) => {
            const mode = id as AvatarForgeHairAccentMode;
            binding.commitHairParams(
              mode === "none"
                ? { accentMode: undefined }
                : { accentMode: mode, accentColor },
              `헤어: 하이라이트 ${AVATAR_FORGE_HAIR_ACCENT_MODE_OPTIONS.find((option) => option.id === mode)?.label ?? mode}`,
            );
          }}
        />
        <CharacterColorControl
          label="하이라이트 색"
          value={accentColor}
          swatches={HAIR_ACCENT_SWATCHES}
          disabled={locked || accentMode === "none"}
          hint={accentMode === "none" ? "방식을 고르면 이 색이 적용됩니다." : undefined}
          onCommit={(color) => {
            if (color === null) return;
            binding.commitHairParams({ accentColor: color }, "헤어: 하이라이트 색");
          }}
        />
      </InspectorSection>
      <InspectorSection title="헤어 형태">
        {HAIR_SHAPE_KEYS.map((key) => (
          <HairRange key={key} hair={hair} limitKey={key} locked={locked} onCommit={commitNumber} />
        ))}
        {tied ? (
          <HairRange hair={hair} limitKey="tailHeight" locked={locked} onCommit={commitNumber} />
        ) : (
          <InspectorNote>묶음 높이는 포니테일·트윈테일·번·땋은 머리·반묶음에서 조절할 수 있습니다.</InspectorNote>
        )}
        <InspectorToggleRow
          label="원본 헤어 감추기"
          hint={
            originalHairCount > 0
              ? `모델이 가진 헤어 메시 ${originalHairCount}개를 숨기고 절차형 헤어만 남깁니다.`
              : frozenStatus3Text("studio.frozenStatus3.shaper.noOriginalHairMesh", "이 모델에는 감출 원본 헤어 메시가 없습니다.")
          }
          checked={Boolean(replaceOriginal)}
          disabled={locked || originalHairCount === 0}
          onToggle={() =>
            binding.commitHairParams(
              { replaceOriginal: !replaceOriginal },
              replaceOriginal ? "헤어: 원본 헤어 표시" : "헤어: 원본 헤어 감추기",
            )}
        />
      </InspectorSection>
    </>
  );
}
