import { isStudioOfficeEnvironmentKey, studioOfficeEnvironment, type StudioOfficeEnvironmentKey } from "./studio-virtual-space-office-environments";
import { Palette } from "lucide-react";
import { StudioVirtualCharacterPreview } from "./StudioVirtualCharacterPreview";
import { STUDIO_CHARACTER_SKINS, studioCharacterSkinForArtStyle } from "./studio-virtual-space-character-skins";

import "./studio-virtual-space-theme-picker.css";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  STUDIO_SPACE_THEMES,
  studioSpaceThemeSwatch,
  type StudioSpaceThemeKey,
} from "./studio-virtual-space-theme";

export interface StudioVirtualSpaceThemePickerProps {
  readonly value: StudioSpaceThemeKey;
  readonly onChange: (value: StudioSpaceThemeKey) => void;
}

const ILLUSTRATED_SPACE_THEME_ART: Readonly<
  Record<Exclude<StudioSpaceThemeKey, StudioOfficeEnvironmentKey>, { readonly themeUrl: string }>
> = {
  "modern-office": {
    themeUrl: "/assets/virtual-studio/studio-art-v11/themes/seoul-editorial-hq.webp",
  },
  "webtoon-atelier": {
    themeUrl: "/assets/virtual-studio/studio-art-v10/studio-theme-floor-panorama.webp",
  },
  "celestial-observatory": {
    themeUrl: "/assets/virtual-studio/studio-art-v13/themes/magic-academy-astral-library.webp",
  },
  "cinema-screening": {
    themeUrl: "/assets/virtual-studio/studio-art-v13/themes/rooftop-sunset-screening-stage.webp",
  },
  "cozy-wood": {
    themeUrl: "/assets/virtual-studio/studio-art-v11/themes/lofi-cat-storyhouse.webp",
  },
  "neon-night": {
    themeUrl: "/assets/virtual-studio/studio-art-v11/themes/cyber-neon-lab.webp",
  },
  "garden-terrace": {
    themeUrl: "/assets/virtual-studio/studio-art-v11/themes/hanok-botanical-atelier.webp",
  },
  library: {
    themeUrl: "/assets/virtual-studio/studio-art-v13/themes/abyssal-bioluminescent-worldlab.webp",
  },
  "sakura-campus": {
    themeUrl: "/assets/virtual-studio/studio-art-v12/themes/romance-palace-conservatory.webp",
  },
  "sunset-harbor": {
    themeUrl: "/assets/virtual-studio/studio-art-v13/themes/dolby-sound-dubbing-studio.webp",
  },
};

function officeEnvironmentArt(key: StudioOfficeEnvironmentKey) {
  const environment = studioOfficeEnvironment(key);
  if (!environment) throw new Error(`Missing office environment: ${key}`);
  return { themeUrl: environment.previewUrl };
}

/**
 * 공간 테마 선택 (트랙 H + 2.5D 아이소메트릭 테마·캐릭터 하모니).
 * 선택 즉시 공간에 적용되고 이 브라우저에 저장돼 재입장 시 유지된다.
 */
export function StudioVirtualSpaceThemePicker({ value, onChange }: StudioVirtualSpaceThemePickerProps) {
  const bt = useBilingual("domains.creator.virtual-space.StudioVirtualSpaceThemePicker");
  return (
    <fieldset className="studio-theme-picker">
      <legend>
        <Palette size={13} aria-hidden />
        {bt("공간 테마", "Space theme")}
      </legend>
      <p className="studio-theme-picker__note">
        {bt("바닥·벽·배경의 스타일을 통째로 바꿉니다. 이 기기에 저장돼 다시 들어와도 유지돼요.",
          "Restyles floors, walls and the backdrop as one set. Saved on this device and kept when you return.")}
      </p>
      <div className="studio-theme-picker__grid">
        {STUDIO_SPACE_THEMES.map((theme) => {
          const swatch = studioSpaceThemeSwatch(theme);
          const nanoArt = isStudioOfficeEnvironmentKey(theme.key)
            ? officeEnvironmentArt(theme.key)
            : ILLUSTRATED_SPACE_THEME_ART[theme.key];
          const selected = value === theme.key;
          const recommended = theme.recommendedCharacterKeys.flatMap((key) => {
            const skin = STUDIO_CHARACTER_SKINS.find((item) => item.key === key);
            return skin ? [skin] : [];
          });
          const representative = recommended[0];
          return (
            <button
              key={theme.key}
              type="button"
              aria-pressed={selected}
              data-space-theme={theme.key}
              onClick={() => onChange(theme.key)}
            >
              <span
                className="studio-theme-picker__thumb"
                data-floor-pattern={swatch.floorPattern}
                style={{ background: swatch.gradientCss }}
                aria-hidden
              >
                <img
                  src={nanoArt.themeUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  data-atelier-theme-preview={theme.key}
                  className="studio-theme-picker__nano-art"
                />
                <span className="studio-theme-picker__window" />
                <span className="studio-theme-picker__badge">
                  {bt(theme.badgeKo, theme.badgeEn)}
                </span>
                <span className="studio-theme-picker__wall" style={{ background: swatch.wall }} />
                <span
                  className="studio-theme-picker__floor"
                  style={{
                    backgroundColor: swatch.floor,
                    backgroundImage: `repeating-linear-gradient(90deg, transparent 0 10px, ${swatch.floorAccent}33 10px 12px)`,
                  }}
                />
                <span
                  className="studio-theme-picker__desk"
                  style={{ background: swatch.desk, borderColor: swatch.accent }}
                />
                <span className="studio-theme-picker__accent" style={{ background: swatch.accent }} />
                {representative ? <span className="studio-theme-picker__nano-cast" data-atelier-cast-preview={theme.key}>
                  <StudioVirtualCharacterPreview skin={studioCharacterSkinForArtStyle(representative, theme.recommendedArtStyle)} />
                </span> : null}
              </span>
              <span className="studio-theme-picker__copy">
                <strong>{bt(theme.labelKo, theme.labelEn)}</strong>
                <small>{bt(theme.descriptionKo, theme.descriptionEn)}</small>
                {recommended.length ? <small className="studio-theme-picker__characters">{bt("추천 캐릭터", "Suggested characters")} · {recommended.slice(0, 2).map((skin) => bt(skin.labelKo, skin.labelEn)).join(" · ")}</small> : null}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export default StudioVirtualSpaceThemePicker;
