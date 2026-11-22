/**
 * 3D 배경 컷 적용 범위 시각화 · 다중 컷 1줄 확인 바 · 외부 4K~8K 텍스처 기기별 로컬 다운샘플러 통합 진입점.
 */

export {
  BG3D_EDIT_ACTION_CATALOG,
  applyBg3dMultiCutResolution,
  classifyBg3dEditAction,
  detachStoryboardCutBackground,
  evaluateBg3dCutScope,
  extractCutLinksFromStoryboardCuts,
  isCutOnlyBg3dAction,
  isSharedBackgroundBg3dAction,
} from "./bg3d-cut-scope-policy";

export type {
  ApplyBg3dMultiCutResolutionInput,
  Bg3dCutLinkRef,
  Bg3dCutOnlyActionKind,
  Bg3dCutScopeBadgeMode,
  Bg3dCutScopeDecision,
  Bg3dCutScopeEvaluationInput,
  Bg3dEditActionKind,
  Bg3dEditActionSpec,
  Bg3dEditScope,
  Bg3dImmediatePassReason,
  Bg3dMultiCutResolutionMode,
  Bg3dMultiCutResolutionResult,
  Bg3dSharedBackgroundActionKind,
} from "./bg3d-cut-scope-policy";

export { StudioBg3dCutScopeBanner } from "./StudioBg3dCutScopeBanner";
export type { StudioBg3dCutScopeBannerProps } from "./StudioBg3dCutScopeBanner";

export {
  BG3D_TEXTURE_DEVICE_PROFILES,
  BG3D_TEXTURE_MAX_SUPPORTED_EDGE_PX,
  BG3D_TEXTURE_MIN_EDGE_PX,
  computeDownsampledTextureDimensions,
  detectBg3dTextureDeviceProfile,
  downsampleBg3dTexture,
  downsampleRgbaBoxFilter,
  estimateTextureVramBytes,
  floorPowerOfTwo,
  isPowerOfTwo,
  nearestPowerOfTwo,
  planBg3dTextureBatchDownsample,
  planBg3dTextureDownsample,
} from "./bg3d-texture-device-downsampler";

export type {
  Bg3dComputedTextureDimensions,
  Bg3dDownsampledTextureResult,
  Bg3dExternalTextureFormat,
  Bg3dPowerOfTwoBoundaryMode,
  Bg3dTextureBatchDownsamplePlan,
  Bg3dTextureChannelKind,
  Bg3dTextureDeviceProfile,
  Bg3dTextureDeviceProfileId,
  Bg3dTextureDeviceSignals,
  Bg3dTextureDownsamplePlan,
  Bg3dTextureDownsamplePlanOptions,
  Bg3dTextureSourceMetadata,
  DownsampleBg3dTextureInput,
  RgbaBoxFilterInput,
} from "./bg3d-texture-device-downsampler";
