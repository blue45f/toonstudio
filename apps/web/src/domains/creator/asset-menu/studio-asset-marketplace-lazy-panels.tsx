import { createStudioIntentLazyLoader } from "../studio-intent-lazy-loader";

import { lazyRetry } from "@/shared/lib/lazy-retry";

const studioCc0AssetLibraryLoader = createStudioIntentLazyLoader(() =>
  import("../StudioCc0AssetLibraryPanel").then((module) => ({
    default: module.StudioCc0AssetLibraryPanel,
  }))
);

const studioBundleAssetLibraryLoader = createStudioIntentLazyLoader(() =>
  import("../StudioBundleAssetLibraryPanel").then((module) => ({
    default: module.StudioBundleAssetLibraryPanel,
  }))
);

const studioOriginalAssetMarketplaceLoader = createStudioIntentLazyLoader(() =>
  import("../StudioOriginalAssetMarketplacePanel").then((module) => ({
    default: module.StudioOriginalAssetMarketplacePanel,
  }))
);
const studioCreatorPackMarketplaceLoader = createStudioIntentLazyLoader(() =>
  import("../StudioCreatorPackMarketplacePanel").then((module) => ({
    default: module.StudioCreatorPackMarketplacePanel,
  }))
);
const studioCommunityMarketplaceLoader = createStudioIntentLazyLoader(() =>
  import("../StudioCommunityMarketplacePanel").then((module) => ({
    default: module.StudioCommunityMarketplacePanel,
  }))
);

export const LazyStudioCc0AssetLibraryPanel = lazyRetry(
  studioCc0AssetLibraryLoader.load,
  "StudioCc0AssetLibraryPanel"
);

export const LazyStudioBundleAssetLibraryPanel = lazyRetry(
  studioBundleAssetLibraryLoader.load,
  "StudioBundleAssetLibraryPanel"
);

export const LazyStudioOriginalAssetMarketplacePanel = lazyRetry(
  studioOriginalAssetMarketplaceLoader.load,
  "StudioOriginalAssetMarketplacePanel"
);
export const LazyStudioCreatorPackMarketplacePanel = lazyRetry(
  studioCreatorPackMarketplaceLoader.load,
  "StudioCreatorPackMarketplacePanel"
);
export const LazyStudioCommunityMarketplacePanel = lazyRetry(
  studioCommunityMarketplaceLoader.load,
  "StudioCommunityMarketplacePanel"
);

export function preloadStudioAssetMarketplacePanels(): void {
  studioCc0AssetLibraryLoader.preload();
  studioBundleAssetLibraryLoader.preload();
  studioOriginalAssetMarketplaceLoader.preload();
  studioCreatorPackMarketplaceLoader.preload();
  studioCommunityMarketplaceLoader.preload();
}
