import { Palette } from "lucide-react";

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

const NANO_BANANA_SPACE_THEME_ART: Readonly<
  Record<StudioSpaceThemeKey, { readonly themeUrl: string; readonly castSpriteUrl: string }>
> = {
  "modern-office": {
    themeUrl: "/assets/virtual-studio/nano-banana-v11/themes/seoul-editorial-hq.webp",
    castSpriteUrl: "/assets/virtual-studio/nano-banana-v11/cast/chief-pd-work.webp",
  },
  "webtoon-atelier": {
    themeUrl: "/assets/virtual-studio/nano-banana-v10/studio-theme-floor-panorama.webp",
    castSpriteUrl: "/assets/virtual-studio/nano-banana-v11/cast/line-artist-work.webp",
  },
  "celestial-observatory": {
    themeUrl: "/assets/virtual-studio/nano-banana-v13/themes/magic-academy-astral-library.webp",
    castSpriteUrl: "/assets/virtual-studio/nano-banana-v12/cast/story-writer-work.webp",
  },
  "cinema-screening": {
    themeUrl: "/assets/virtual-studio/nano-banana-v13/themes/rooftop-sunset-screening-stage.webp",
    castSpriteUrl: "/assets/virtual-studio/nano-banana-v11/cast/colorist-work.webp",
  },
  "cozy-wood": {
    themeUrl: "/assets/virtual-studio/nano-banana-v11/themes/lofi-cat-storyhouse.webp",
    castSpriteUrl: "/assets/virtual-studio/nano-banana-v12/cast/studio-cat-mascot-work.webp",
  },
  "neon-night": {
    themeUrl: "/assets/virtual-studio/nano-banana-v11/themes/cyber-neon-lab.webp",
    castSpriteUrl: "/assets/virtual-studio/nano-banana-v11/cast/cgi-director-work.webp",
  },
  "garden-terrace": {
    themeUrl: "/assets/virtual-studio/nano-banana-v11/themes/hanok-botanical-atelier.webp",
    castSpriteUrl: "/assets/virtual-studio/nano-banana-v11/cast/colorist-idle.webp",
  },
  library: {
    themeUrl: "/assets/virtual-studio/nano-banana-v13/themes/abyssal-bioluminescent-worldlab.webp",
    castSpriteUrl: "/assets/virtual-studio/nano-banana-v12/cast/story-writer-idle.webp",
  },
  "sakura-campus": {
    themeUrl: "/assets/virtual-studio/nano-banana-v12/themes/romance-palace-conservatory.webp",
    castSpriteUrl: "/assets/virtual-studio/nano-banana-v11/cast/line-artist-idle.webp",
  },
  "sunset-harbor": {
    themeUrl: "/assets/virtual-studio/nano-banana-v13/themes/dolby-sound-dubbing-studio.webp",
    castSpriteUrl: "/assets/virtual-studio/nano-banana-v12/cast/sound-letterer-work.webp",
  },
};

/**
 * 공간 테마 선택 (트랙 H + 나노 바나나 2.5D 아이소메트릭 테마·캐릭터 하모니).
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
          const nanoArt = NANO_BANANA_SPACE_THEME_ART[theme.key];
          const selected = value === theme.key;
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
                  data-nano-banana-theme-preview={theme.key}
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
                <img
                  src={nanoArt.castSpriteUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  data-nano-banana-cast-preview={theme.key}
                  className="studio-theme-picker__nano-cast"
                />
              </span>
              <span className="studio-theme-picker__copy">
                <strong>{bt(theme.labelKo, theme.labelEn)}</strong>
                <small>{bt(theme.descriptionKo, theme.descriptionEn)}</small>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export default StudioVirtualSpaceThemePicker;
