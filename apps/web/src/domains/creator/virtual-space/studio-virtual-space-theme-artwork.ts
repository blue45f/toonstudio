import { isStudioOfficeEnvironmentKey, STUDIO_OFFICE_ENVIRONMENTS, studioOfficeEnvironment, type StudioOfficeEnvironmentKey } from "./studio-virtual-space-office-environments";
import type { StudioSpaceThemeKey } from "./studio-virtual-space-theme";

/** 선택 카드와 실제 2D 월드가 공유하는 기존 배경 원화 원장. */
const SPACE_THEME_ARTWORK: Readonly<Record<Exclude<StudioSpaceThemeKey, StudioOfficeEnvironmentKey>, string>> = Object.freeze({
  "webtoon-atelier": "/assets/virtual-studio/studio-art-v11/themes/seoul-editorial-hq.webp",
  "modern-office": "/assets/virtual-studio/studio-art-v14/rooms/global-ip-pitch-boardroom.webp",
  "cozy-wood": "/assets/virtual-studio/studio-art-v11/themes/lofi-cat-storyhouse.webp",
  "neon-night": "/assets/virtual-studio/studio-art-v11/themes/cyber-neon-lab.webp",
  "garden-terrace": "/assets/virtual-studio/studio-art-v12/themes/murim-bamboo-pavilion.webp",
  "sakura-campus": "/assets/virtual-studio/studio-art-v12/themes/romance-palace-conservatory.webp",
  "sunset-harbor": "/assets/virtual-studio/studio-art-v13/themes/rooftop-sunset-screening-stage.webp",
  library: "/assets/virtual-studio/studio-art-v13/themes/magic-academy-astral-library.webp",
  "celestial-observatory": "/assets/virtual-studio/studio-art-v12/themes/scifi-orbital-command.webp",
  "cinema-screening": "/assets/virtual-studio/studio-art-v13/themes/rooftop-sunset-screening-stage.webp",
});

export function studioSpaceThemeArtworkUrl(key: StudioSpaceThemeKey): string {
  if (!isStudioOfficeEnvironmentKey(key)) return SPACE_THEME_ARTWORK[key];
  const environment = studioOfficeEnvironment(key);
  if (!environment) throw new Error(`Missing office environment: ${key}`);
  return environment.previewUrl;
}

export function studioSpaceThemeArtworkUrls(): readonly string[] {
  return [...new Set([...Object.values(SPACE_THEME_ARTWORK), ...STUDIO_OFFICE_ENVIRONMENTS.map((environment) => environment.previewUrl)])];
}
