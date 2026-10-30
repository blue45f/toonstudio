import type { StudioBuildPlacedFixture } from "../studio-virtual-space-build-mode-vitality";
import type { StudioVirtualDecorationState } from "../studio-virtual-space-customization";
import { office2dObjectUrl, type Office2dImageSource, type Office2dSpriteStore } from "./office2d-sprite-catalog";
import { office2dPlacedDecorSpriteKeys } from "./office2d-stage-extensions";

export interface Office2dDecorAssetLoader {
  load(decorations: StudioVirtualDecorationState | undefined, placedFixtures: readonly StudioBuildPlacedFixture[] | undefined): Promise<number>;
  dispose(): void;
}

/** 같은 스테이지의 최초·후속 꾸미기를 기존 이미지 저장소에 보태고, 해제 뒤의 도착 알림은 막는다. */
export function createOffice2dDecorAssetLoader<TImage extends Office2dImageSource>(
  store: Pick<Office2dSpriteStore<TImage>, "loadAll">,
  timeoutMs: number,
  onImageLoaded: () => void,
): Office2dDecorAssetLoader {
  const requested = new Set<string>();
  let disposed = false;
  return {
    load(decorations, placedFixtures) {
      if (disposed) return Promise.resolve(0);
      const urls = office2dPlacedDecorSpriteKeys(decorations, placedFixtures)
        .map(office2dObjectUrl).filter((url) => !requested.has(url));
      if (urls.length === 0) return Promise.resolve(0);
      for (const url of urls) requested.add(url);
      return store.loadAll(urls, timeoutMs, () => {
        if (!disposed) onImageLoaded();
      });
    },
    dispose() { disposed = true; },
  };
}
