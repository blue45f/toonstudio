/**
 * Studio BG3D 환경광(IBL) 설정 — 순수 데이터 모듈 재수출 창구.
 * 정본 계약과 정규화는 `../contracts/studio-bg3d-environment-settings` 에 두어
 * 문서 파서가 HDRI 에셋 카탈로그를 초기 정적 그래프에 끌어오지 않도록 격리한다.
 */

export {
  STUDIO_BG3D_DEFAULT_ENVIRONMENT_SETTINGS,
  STUDIO_BG3D_ENVIRONMENT_INTENSITY_MAX,
  STUDIO_BG3D_ENVIRONMENT_INTENSITY_MIN,
  STUDIO_BG3D_HDRI_ENVIRONMENT_ASSET_IDS,
  isStudioBg3dHdriEnvironmentActive,
  isStudioBg3dHdriEnvironmentAssetId,
  normalizeStudioBg3dEnvironmentSettings,
  resolveStudioBg3dEnvironmentSettings,
  type StudioBg3dEnvironmentSettings,
  type StudioBg3dEnvironmentSource,
  type StudioBg3dHdriEnvironmentAssetId,
} from "../contracts/studio-bg3d-environment-settings";
