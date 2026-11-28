/**
 * Wasm64 Wave 118 공개 배럴 진입점 (`wasm64-wave118-anatomy-foreshortening-and-silhouette-solver`).
 *
 * - `anatomy-rig-and-foreshortening`: 4종 웹툰 등신대 · 17관절 3D 정규 뼈대 · 5종 액션 포즈 ·
 *   ROM 역꺾임 감사/클램핑 · 핀홀 3D 원근 단축 투영 및 원통 겹침 링 계산
 * - `balance-and-silhouette-auditor`: Winter 인체 질량 분포 무게중심(CoM) 균형 분류 ·
 *   실루엣 파묻힘/접선 충돌 감사 · 단조 개선 자동 교정 포즈 생성
 * - `anatomy-foreshortening-svg-and-report`: 인쇄 안전 순수 OKLCH 좌/우 대조 SVG 및 한국어 작화 디렉터 브리프
 */

export {
  ANATOMY_JOINT_IDS,
  WEBTOON_POSE_PRESETS,
  WEBTOON_PROPORTION_PROFILES,
  auditJointRangeOfMotion,
  buildWebtoonAnatomyPose,
  mergePoseAngles,
  projectAnatomyForeshortening,
  type AnatomyBoneDefinition,
  type AnatomyBoneId,
  type AnatomyForeshorteningProjection,
  type AnatomyJointId,
  type AnatomyPoseAngleOverrides,
  type AnatomyPoseAngles,
  type CameraDistanceMode,
  type ForeshorteningCameraInput,
  type ForeshorteningOverlapRing,
  type JointRomAuditResult,
  type JointRomViolation,
  type LimbBallJointAngles,
  type ProjectedJoint2D,
  type ProjectedLimbSegment,
  type RomViolationKind,
  type Vec2,
  type Vec3,
  type WebtoonAnatomyPose,
  type WebtoonAnatomyPoseInput,
  type WebtoonPosePreset,
  type WebtoonProportionPreset,
  type WebtoonProportionProfile,
} from "./anatomy-rig-and-foreshortening";

export {
  TANGENT_CLASH_THRESHOLD_PX,
  TUCKED_LIMB_CLEARANCE_THRESHOLD_PX,
  WINTER_SEGMENT_MASS_SPECS,
  auditPoseBalanceAndSilhouette,
  suggestSilhouetteRefinementPose,
  type BalanceClassification,
  type CenterOfMassBalanceAudit,
  type PoseBalanceAndSilhouetteAudit,
  type SilhouetteAuditIssue,
  type SilhouetteIssueKind,
  type SilhouetteRefinementResult,
  type WinterSegmentMassSpec,
} from "./balance-and-silhouette-auditor";

export {
  escapeAnatomyXmlText,
  renderAnatomyForeshorteningSvg,
  summarizeAnatomyForeshorteningKo,
  type AnatomyAuditVerdict,
  type AnatomyForeshorteningReportKo,
  type AnatomyForeshorteningSvgOptions,
  type AnatomySvgTheme,
} from "./anatomy-foreshortening-svg-and-report";
