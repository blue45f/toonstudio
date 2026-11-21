/**
 * 워크 에셋 REST 클라이언트(`studio-work-asset-client`)의 지연 경계.
 * 실제 업로드·다운로드·미참조 정리가 실행될 때만 HTTP/검증 클라이언트를 로드한다.
 */
import { createStudioIntentLazyLoader } from "./studio-intent-lazy-loader";

export type { DownloadedStudioWorkAsset } from "./studio-work-asset-client";

type StudioWorkAssetClientModule = typeof import("./studio-work-asset-client");

const workAssetClientLoader = createStudioIntentLazyLoader<StudioWorkAssetClientModule>(
  () => import("./studio-work-asset-client"),
);

export const downloadStudioWorkAsset: StudioWorkAssetClientModule["downloadStudioWorkAsset"] = async (...args) =>
  (await workAssetClientLoader.load()).downloadStudioWorkAsset(...args);

export const uploadStudioWorkAsset: StudioWorkAssetClientModule["uploadStudioWorkAsset"] = async (...args) =>
  (await workAssetClientLoader.load()).uploadStudioWorkAsset(...args);

export const deleteUnreferencedStudioWorkAssetUpload: StudioWorkAssetClientModule["deleteUnreferencedStudioWorkAssetUpload"] = async (...args) =>
  (await workAssetClientLoader.load()).deleteUnreferencedStudioWorkAssetUpload(...args);
