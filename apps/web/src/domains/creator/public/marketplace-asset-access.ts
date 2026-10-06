/**
 * Creator 도메인이 다른 도메인(마켓 등)에 공개하는 CC0/마켓플레이스 에셋 접근 경계.
 *
 * market 도메인 컴포넌트가 creator 내부 모듈을 깊게 import 하던 레거시를
 * 공개 경계 하나로 모은다. 내부 구현은 creator에 남고, 소비자는 이 파일만 본다.
 */

export {
  studioMarketplaceCc0EntrySourceMatches,
} from "../studio-marketplace-cc0-provenance";
export {
  findStudioMarketplaceCc0Asset,
  studioMarketplaceCc0Reference,
} from "../studio-marketplace-cc0-catalog";
export {
  findGeneratedStudio2dAsset,
} from "../studio-2d-generated-backgrounds";
export {
  studioCc0AssetUrl,
  type StudioCc0Asset,
} from "../studio-cc0-asset-delivery";
export {
  findStudioOriginalFreeAsset,
} from "../studio-original-free-asset-packs";
export {
  resolveStudioMarketplaceCc0Entry,
} from "../studio-marketplace-cc0-assets";
export {
  resolveStudioMarketplaceAssetPreview,
  type StudioMarketplaceAssetPreview,
} from "../studio-marketplace-preview";
