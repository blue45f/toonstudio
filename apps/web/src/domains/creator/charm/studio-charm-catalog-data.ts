/**
 * 참 카탈로그의 지연 데이터 경계.
 *
 * 효과·스티커·소품·효과음 SVG 는 용량이 크므로 첫 화면 번들에 넣지 않고, 참 바가 열려 해석이 필요한
 * 시점에만 기존 모듈을 `import()` 로 불러온다. 이 파일은 구현을 정적으로 가져오지 않는다.
 * 실패하면 캐시를 비우므로 같은 호출을 다시 하면 재시도된다.
 */

import { createStudioIntentLazyLoader } from "../studio-intent-lazy-loader";

import type { StudioCharmCatalogData } from "./studio-charm-descriptor";

const loader = createStudioIntentLazyLoader(async (): Promise<StudioCharmCatalogData> => {
  const [fxAssets, creatureAssets, propAssets, sfxPresets] = await Promise.all([
    import("../studio-fx-assets"),
    import("../studio-creature-stickers"),
    import("../studio-prop-stickers"),
    import("../studio-sfx-presets"),
  ]);
  return Object.freeze({
    fxOverlays: fxAssets.FX_OVERLAYS,
    comicStickers: fxAssets.COMIC_VECTOR_STICKERS,
    creatureStickers: creatureAssets.CREATURE_STICKERS,
    propStickers: propAssets.PROP_STICKERS,
    sfxPresets: sfxPresets.SFX_LIBRARY,
  });
});

export const loadStudioCharmCatalogData = loader.load;
export const preloadStudioCharmCatalogData = loader.preload;
