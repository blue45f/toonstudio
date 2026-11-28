/**
 * Wasm64 Wave 113 공개 배럴 진입점 (`wasm64-wave113-3d-background-npr-line-and-gi-bake-solver`).
 *
 * - `npr-mesh-edge-and-hlr-extractor`: 3D 배경 프리셋 3종(한국 교실·서울 골목·카페 내부),
 *   핀홀 3D 카메라 투영 및 정면/후면 판정, 공유 하프에지 기반 실루엣·하드 크리즈·재질 경계선 분류
 *   (공면 대각 잡선 `0`건 억제), 원근 보정 은선 제거(HLR), 근경-원경 손그림 필압 감쇠
 * - `radiosity-one-bounce-gi-and-wgsl`: 에너지 보존 1-바운스 패치 형태계수 색번짐 GI 솔버,
 *   2D 캐릭터 깊이 평면 뒤 명암 완화·안개 조화기, WebGPU WGSL NPR+GI 셰이더 생성·검증기
 * - `background-npr-svg-and-audit`: 인쇄 호환 고대비 OKLCH SVG 렌더러(원시 hex/rgb 금지) 및
 *   자연스러운 한국어 배경 감독 QA 브리프 생성기
 */

export {
  add3,
  buildCameraBasis3d,
  clamp,
  createParametricBackgroundPreset,
  cross3,
  dot3,
  extract3dBackgroundNprLines,
  length3,
  lerp3,
  normalize3,
  projectMesh3dToCamera,
  scale3,
  sub3,
  type BackgroundFaceInput,
  type BackgroundMesh3d,
  type BackgroundPresetId,
  type CameraBasis3d,
  type NprDepthAttenuationSummary,
  type NprEdgeClass,
  type NprEdgeCountSummary,
  type NprExtractionOptions,
  type NprExtractionResult,
  type PinholeCamera3d,
  type ProjectedMesh3dResult,
  type ProjectedTriangle2d,
  type RgbLinear,
  type ScreenBbox2d,
  type Vec2,
  type Vec3,
  type VisibleNprEdgeClass,
  type VisibleNprLineSegment,
} from "./npr-mesh-edge-and-hlr-extractor";

export {
  bakeBackgroundColorBleedGi,
  buildBackgroundNprGiWgsl,
  harmonizeBackgroundFor2dCharacterDepth,
  validateBackgroundNprGiWgsl,
  type BackgroundGiBakeResult,
  type BackgroundNprGiWgslArtifact,
  type BackgroundNprGiWgslOptions,
  type BackgroundNprGiWgslValidation,
  type BakedGiPatch,
  type CharacterDepthHarmonizeOptions,
  type GiBakeOptions,
  type GiEnergyConservationAudit,
  type HarmonizedBackgroundGiResult,
  type HarmonizedGiPatch,
  type WgslBindingDescriptor,
} from "./radiosity-one-bounce-gi-and-wgsl";

export {
  escapeNprSvgXml,
  linearRgbToOklchCss,
  render3dBackgroundNprSvg,
  summarizeBackgroundNprBakeKo,
  type BackgroundNprBakeAuditKo,
  type BackgroundNprSvgOptions,
} from "./background-npr-svg-and-audit";
