/**
 * Wasm64 Wave 20 Grand Finale — 온디바이스 초격차 그래픽스·기구학·통합 출고 게이트 공개 진입점.
 *
 * - `disocclusion-inpaint-3dsfx-handgrasp`:
 *   다중 평면 패럴랙스 가림 해제 고속 전진(Telea Eikonal) 홀 필링 솔버,
 *   3D 투시 돌출·베벨 한글 효과음(`콰아앙`, `번쩍`) 수밀 2-다양체 메쉬 빌더,
 *   해부학 15-DOF(`DIP ≈ 0.67 * PIP` 힘줄 연동) 손 파지 및 표면 접촉 IK 솔버
 * - `omnichannel-master-release-gate`:
 *   웹툰 스크롤 · 인쇄 CMYK · 모션툰 · 오디오툰 · 글로벌 현지화 · 개인정보/C2PA-WOTS+ 봉인을
 *   단일 패스로 감사해 0~100점 출고 준비 인증서를 발급하는 통합 마스터 게이트
 * - `depth-mask-stylized-shading`:
 *   가이드 필터 + 결합 양방향 정밀 밀착 기반 전경·중경·배경 소프트 매트 추출기 및
 *   양자화 셀 밴드 + 휘도 크로스해칭 + 과슈 포스터 에지 림 스타일 셰이더 커널
 *
 * 주의: Studio 초기 진입 그래프에서 정적 import하지 않고 온디맨드로 지연 로드한다(초기 번들 영향 0B, 서버 비용 ₩0).
 */

export {
  buildPerspectiveSfx3dMesh,
  createPresetKoreanSfxContours,
  DISTAL_TENDON_COUPLING_RATIO,
  evaluatePrimitiveSdf,
  HAND_TOTAL_ACTUATED_DOF,
  inpaintParallaxDisocclusion,
  projectParallaxWithDisocclusionMask,
  solveAnatomicalHandGraspIk,
  verifyWatertightTwoManifold,
  type DigitSolvedKinematics,
  type GraspTargetPrimitive,
  type HandDigitName,
  type HandGraspSolveInput,
  type HandGraspSolveResult,
  type ManifoldVerificationReport,
  type ParallaxDisocclusionInput,
  type ParallaxDisocclusionOptions,
  type ParallaxDisocclusionResult,
  type ParallaxProjectionFrame,
  type ParallaxProjectionInput,
  type Point2D,
  type Sfx3dExtrudedMesh,
  type Sfx3dExtrudeInput,
  type SfxGlyphContour2D,
  type SfxMeshFaceRole,
  type Vec3,
} from "./disocclusion-inpaint-3dsfx-handgrasp";

export {
  computeDeterministicHash256Hex,
  countStrayPixelDustClusters,
  createWotsPlusProvenanceSeal,
  runOmnichannelMasterReleaseGate,
  scanLinearPiiAndSecrets,
  verifyWotsPlusProvenanceSeal,
  type AudioToonAuditInput,
  type GlobalLocalizationAuditInput,
  type LocalizedBalloonEntry,
  type MotionToonAuditInput,
  type OmnichannelReleaseAuditInput,
  type OmnichannelReleaseCertificate,
  type OmnichannelReleaseMetrics,
  type PiiFinding,
  type PrintCmykAuditInput,
  type ReleaseChannelKind,
  type ReleaseGateCheckItem,
  type ReleaseGateSeverity,
  type ReleaseVerdict,
  type WebtoonScrollAuditInput,
  type WotsPlusProvenanceSeal,
} from "./omnichannel-master-release-gate";

export {
  extractDepthGuidedSoftMattes,
  renderStylizedArtDirectionShader,
  type DepthGuidedSoftMatteInput,
  type DepthGuidedSoftMatteOptions,
  type DepthGuidedSoftMatteResult,
  type StylizedArtDirectionShaderInput,
  type StylizedArtDirectionShaderResult,
  type StylizedArtDirectionShaderStats,
} from "./depth-mask-stylized-shading";
