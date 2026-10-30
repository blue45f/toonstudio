import { Dices, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualAvatarProfile } from "./studio-virtual-space-model";
import type { StudioSpriteDirection } from "./studio-virtual-space-sprite";
import { StudioVirtualAvatarFigure } from "./StudioVirtualAvatarFigure";
import { StudioVirtualSpriteSheetCustomizer } from "./StudioVirtualSpriteSheetCustomizer";
import {
  STUDIO_AVATAR_ACCESSORY_OPTIONS,
  STUDIO_AVATAR_EXPRESSION_OPTIONS,
  STUDIO_AVATAR_HAIR_COLOR_OPTIONS,
  STUDIO_AVATAR_HAIR_STYLE_OPTIONS,
  STUDIO_AVATAR_OUTFIT_COLOR_OPTIONS,
  STUDIO_AVATAR_OUTFIT_STYLE_OPTIONS,
  STUDIO_AVATAR_SKIN_OPTIONS,
} from "./studio-virtual-space-avatar-options";
import {
  randomStudioVirtualAvatarProfile,
  useStudioVirtualAvatarProfile,
} from "./studio-virtual-space-avatar-store";
import {
  STUDIO_CHARACTER_PART_PRESETS,
  studioCharacterPartPreset,
} from "./studio-virtual-space-character-parts";
import {
  proceduralPaletteFromAvatarProfile,
  proceduralPartsFromAvatarProfile,
  renderProceduralCharacterPreview,
} from "./studio-virtual-space-character-procedural";

/**
 * 아바타 커스터마이저
 *
 * 파츠 선택(피부·헤어·의상·액세서리·표정) + 실시간 미리보기(SVG 피규어 8방향 +
 * 프로시저럴 스프라이트 셀) + 랜덤/프리셋/초기화 버튼. 선택 즉시
 * `useStudioVirtualAvatarProfile` 저장소(이 기기)에 저장된다. Office2D는 내 캐릭터의
 * 액세서리와 강조색을 반영한다. 피부·헤어·의상은 미리보기에서만 바뀌며,
 * 월드 캐릭터 전체 모습은 캐릭터 선택으로 바꾼다.
 */

type Bilingual = (ko: string, en: string) => string;

const DIRECTIONS: readonly { readonly key: StudioSpriteDirection; readonly ko: string; readonly en: string; readonly arrow: string }[] = [
  { key: "down", ko: "아래", en: "Down", arrow: "↓" },
  { key: "down-left", ko: "왼쪽 아래", en: "Bottom left", arrow: "↙" },
  { key: "left", ko: "왼쪽", en: "Left", arrow: "←" },
  { key: "up-left", ko: "왼쪽 위", en: "Top left", arrow: "↖" },
  { key: "up", ko: "위", en: "Up", arrow: "↑" },
  { key: "up-right", ko: "오른쪽 위", en: "Top right", arrow: "↗" },
  { key: "right", ko: "오른쪽", en: "Right", arrow: "→" },
  { key: "down-right", ko: "오른쪽 아래", en: "Bottom right", arrow: "↘" },
];

const ILLUSTRATED_DIRECTIONAL_WALK_SPRITES: Readonly<
  Record<StudioSpriteDirection, string>
> = {
  down: "/assets/virtual-studio/studio-art-v14/walk/creator-walk-down.webp",
  "down-left": "/assets/virtual-studio/studio-art-v14/walk/creator-walk-left.webp",
  left: "/assets/virtual-studio/studio-art-v14/walk/creator-walk-left.webp",
  "up-left": "/assets/virtual-studio/studio-art-v14/walk/creator-walk-left.webp",
  up: "/assets/virtual-studio/studio-art-v14/walk/creator-walk-up.webp",
  "up-right": "/assets/virtual-studio/studio-art-v14/walk/creator-walk-right.webp",
  right: "/assets/virtual-studio/studio-art-v14/walk/creator-walk-right.webp",
  "down-right":
    "/assets/virtual-studio/studio-art-v14/walk/creator-walk-right.webp",
};

function ColorSwatchGroup({ legend, options, value, onSelect, bt }: {
  readonly legend: string;
  readonly options: readonly { readonly value: string; readonly labelKo: string; readonly labelEn: string }[];
  readonly value: string;
  readonly onSelect: (value: string) => void;
  readonly bt: Bilingual;
}) {
  return (
    <fieldset className="avatar-customizer__group">
      <legend>{legend}</legend>
      <div className="avatar-customizer__options">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className="avatar-customizer__swatch"
              aria-pressed={selected}
              aria-label={bt(option.labelKo, option.labelEn)}
              title={bt(option.labelKo, option.labelEn)}
              // 색 견본 자체가 데이터라 배경만 인라인으로 둔다.
              style={{ background: option.value }}
              onClick={() => onSelect(option.value)}
            />
          );
        })}
      </div>
    </fieldset>
  );
}

function ChipGroup<T extends string>({ legend, options, value, onSelect, bt }: {
  readonly legend: string;
  readonly options: readonly { readonly key: T; readonly labelKo: string; readonly labelEn: string }[];
  readonly value: T;
  readonly onSelect: (key: T) => void;
  readonly bt: Bilingual;
}) {
  return (
    <fieldset className="avatar-customizer__group">
      <legend>{legend}</legend>
      <div className="avatar-customizer__options">
        {options.map((option) => {
          const selected = value === option.key;
          return (
            <button
              key={option.key}
              type="button"
              className="avatar-customizer__chip"
              aria-pressed={selected}
              onClick={() => onSelect(option.key)}
            >
              {bt(option.labelKo, option.labelEn)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function StudioVirtualAvatarCustomizer({ identity }: { readonly identity: string }) {
  const bt = useBilingual("StudioVirtualAvatarCustomizer");
  const { profile, save, reset } = useStudioVirtualAvatarProfile(identity);
  const [direction, setDirection] = useState<StudioSpriteDirection>("down");
  const [animated, setAnimated] = useState(true);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);

  // 프로시저럴 스프라이트 미리보기 (캔버스 미지원 환경에서는 조용히 생략).
  useEffect(() => {
    try {
      const preview = renderProceduralCharacterPreview(
        proceduralPaletteFromAvatarProfile(profile),
        proceduralPartsFromAvatarProfile(profile),
      );
      setSheetUrl(preview.dataUrl);
    } catch {
      setSheetUrl(null);
    }
  }, [profile]);

  const update = (patch: Partial<StudioVirtualAvatarProfile>) => {
    save({ ...profile, ...patch });
  };

  const applyRandom = () => {
    save(randomStudioVirtualAvatarProfile());
  };

  const applyPreset = (presetKey: string) => {
    const preset = studioCharacterPartPreset(presetKey);
    if (!preset) return;
    // 프리셋 색상은 아바타 옵션 카탈로그의 값만 사용한다 (저장소 검증 통과 보장).
    const hair = STUDIO_AVATAR_HAIR_COLOR_OPTIONS.find((option) => option.value === preset.hair);
    if (!hair || hair.highlight !== preset.hairHighlight) return;
    save({
      skin: preset.skin,
      hair: preset.hair,
      hairHighlight: preset.hairHighlight,
      outfit: preset.outfit,
      accent: preset.accent,
      hairStyle: preset.hairStyle,
      outfitStyle: preset.outfitStyle,
      accessory: preset.accessory,
      expression: profile.expression,
    });
  };

  return (
    <section aria-label={bt("아바타 꾸미기", "Customize avatar")} className="studio-vspace-avatar-customizer avatar-customizer">
      <h2 className="avatar-customizer__title">{bt("내 아바타 꾸미기", "Customize my avatar")}</h2>
      <p className="avatar-customizer__note">
        {bt(
          "선택은 이 기기에 바로 저장돼요. 2D 공간에서는 내 캐릭터의 액세서리와 강조색에 반영돼요. 피부·헤어·의상은 미리보기에서만 바뀌며, 월드 캐릭터 전체 모습은 위의 캐릭터 선택으로 바꿔요.",
          "Picks save on this device instantly. Accessories and the accent color apply to your character in the 2D space. Skin, hair and outfit changes appear only in the preview; use the character picker above to change your world character's overall look.",
        )}
      </p>

      <div className="avatar-customizer__preview">
        <div className="avatar-customizer__figure">
          <StudioVirtualAvatarFigure
            profile={profile}
            direction={direction}
            animated={animated}
            title={bt("아바타 미리보기", "Avatar preview")}
            className="avatar-customizer__svg"
          />
          <div className="avatar-customizer__directions" role="group" aria-label={bt("미리보기 방향", "Preview direction")}>
            {DIRECTIONS.map((item) => (
              <button
                key={item.key}
                type="button"
                className="avatar-customizer__direction"
                aria-pressed={direction === item.key}
                aria-label={bt(`미리보기 방향: ${item.ko}`, `Preview direction: ${item.en}`)}
                title={bt(item.ko, item.en)}
                onClick={() => setDirection(item.key)}
              >
                <span aria-hidden>{item.arrow}</span>
              </button>
            ))}
          </div>
          <label className="avatar-customizer__toggle">
            <input
              type="checkbox"
              checked={animated}
              onChange={(event) => setAnimated(event.target.checked)}
            />
            {bt("걷기 애니메이션", "Walk animation")}
          </label>
        </div>

        {sheetUrl ? (
          <figure className="avatar-customizer__sprite">
            <img
              src={sheetUrl}
              alt={bt("프로시저럴 스프라이트 미리보기", "Procedural sprite preview")}
              width={96}
              height={112}
              draggable={false}
            />
            <figcaption>{bt("픽셀 스프라이트", "Pixel sprite")}</figcaption>
          </figure>
        ) : null}

        <figure className="avatar-customizer__sprite" data-testid="avatar-customizer-illustrated-walk-figure">
          <svg
            width={96}
            height={112}
            viewBox="0 0 96 112"
            role="img"
            aria-label={bt("웹툰 작가 4방향 보행 스프라이트 미리보기", "Webtoon creator 4-direction walk sprite preview")}
            data-testid="avatar-customizer-illustrated-walk-svg"
            data-walk-direction={direction}
          >
            <image
              href={ILLUSTRATED_DIRECTIONAL_WALK_SPRITES[direction]}
              x="4"
              y="8"
              width="88"
              height="96"
              preserveAspectRatio="xMidYMid meet"
              data-testid="avatar-customizer-illustrated-walk-image"
            />
          </svg>
          <figcaption>{bt("2.5D 보행 스프라이트", "2.5D walk sprite")}</figcaption>
        </figure>
      </div>

      <fieldset className="avatar-customizer__group avatar-customizer__group--boxed">
        <legend>{bt("프리셋", "Presets")}</legend>
        <div className="avatar-customizer__options">
          {STUDIO_CHARACTER_PART_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className="avatar-customizer__chip"
              onClick={() => applyPreset(preset.key)}
            >
              {bt(preset.labelKo, preset.labelEn)}
            </button>
          ))}
        </div>
      </fieldset>

      <ColorSwatchGroup
        legend={bt("피부색", "Skin tone")}
        options={STUDIO_AVATAR_SKIN_OPTIONS}
        value={profile.skin}
        onSelect={(skin) => update({ skin })}
        bt={bt}
      />
      <ChipGroup
        legend={bt("헤어스타일", "Hairstyle")}
        options={STUDIO_AVATAR_HAIR_STYLE_OPTIONS}
        value={profile.hairStyle}
        onSelect={(hairStyle) => update({ hairStyle })}
        bt={bt}
      />
      <ColorSwatchGroup
        legend={bt("헤어 색상", "Hair color")}
        options={STUDIO_AVATAR_HAIR_COLOR_OPTIONS}
        value={profile.hair}
        onSelect={(hair) => {
          const found = STUDIO_AVATAR_HAIR_COLOR_OPTIONS.find((option) => option.value === hair);
          update({ hair, hairHighlight: found?.highlight ?? profile.hairHighlight });
        }}
        bt={bt}
      />
      <ChipGroup
        legend={bt("의상", "Outfit")}
        options={STUDIO_AVATAR_OUTFIT_STYLE_OPTIONS}
        value={profile.outfitStyle ?? "tee"}
        onSelect={(outfitStyle) => update({ outfitStyle })}
        bt={bt}
      />
      <ColorSwatchGroup
        legend={bt("의상 색상", "Outfit color")}
        options={STUDIO_AVATAR_OUTFIT_COLOR_OPTIONS}
        value={profile.outfit}
        onSelect={(outfit) => update({ outfit })}
        bt={bt}
      />
      <ChipGroup
        legend={bt("액세서리", "Accessory")}
        options={STUDIO_AVATAR_ACCESSORY_OPTIONS}
        value={profile.accessory}
        onSelect={(accessory) => update({ accessory })}
        bt={bt}
      />
      <ChipGroup
        legend={bt("표정", "Expression")}
        options={STUDIO_AVATAR_EXPRESSION_OPTIONS}
        value={profile.expression}
        onSelect={(expression) => update({ expression })}
        bt={bt}
      />

      <div className="avatar-customizer__options avatar-customizer__footer">
        <button type="button" className="avatar-customizer__chip" onClick={applyRandom} aria-label={bt("랜덤 아바타 만들기", "Create a random avatar")}>
          <Dices size={15} aria-hidden /> {bt("랜덤", "Random")}
        </button>
        <button type="button" className="avatar-customizer__chip" onClick={reset} aria-label={bt("아바타 꾸미기 초기화", "Reset avatar customization")}>
          <RotateCcw size={15} aria-hidden /> {bt("초기화", "Reset")}
        </button>
      </div>

      <StudioVirtualSpriteSheetCustomizer profile={profile} onSave={save} />
    </section>
  );
}
