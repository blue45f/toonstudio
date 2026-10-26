/**
 * Frame.io / SyncSketch / ftrack Creative Review, Draw-Over Annotation Pin & Multi-Department Consensus Model
 *
 * Clean-room internalization of REA reverse-engineering evidence:
 * - Frame.io (`https://frame.io/`, capture `ev_ca7ea51fab576e4a7cf8fb19add5318ca436fb97008374d4e75e2c5b43d8212e`,
 *   AST `ev_6e1be2c6fe414d1bc1b796460035f810ade397e372aaf9fc1d47b686cad6182f`, 153,234 AST nodes,
 *   multi-resolution AVIF asset comparison, frame/cut-pinned draw-over annotations, version stacks, C2PA watermark links)
 * - Figma (`https://www.figma.com/`, AST `ev_a80571a33b32a20a10c311f732617d28a87a580fea1b50898be743fc6a921357`,
 *   canvas pin comments & multiplayer observation mode)
 */

export type DrawOverToolKind = "laser-stroke" | "rect-callout" | "perspective-grid" | "color-eyedropper";

export type ReviewPinSeverity = "must-fix" | "suggestion" | "approved-note";

export type ReviewerDepartment =
  | "directing_pd"
  | "lead_line_art"
  | "bg_3d_lead"
  | "color_vfx_lead"
  | "editorial_qc";

export type DepartmentVoteStatus = "approved" | "changes-requested" | "pending";

export interface CutDrawOverAnnotationPin {
  readonly id: string;
  readonly cutNumber: number;
  readonly versionTag: "v1" | "v2" | "v3";
  readonly xPct: number;
  readonly yPct: number;
  readonly tool: DrawOverToolKind;
  readonly department: ReviewerDepartment;
  readonly authorName: string;
  readonly severity: ReviewPinSeverity;
  readonly commentKo: string;
  readonly commentEn: string;
  readonly resolved: boolean;
}

export interface VersionStackSnapshot {
  readonly versionTag: "v1" | "v2" | "v3";
  readonly labelKo: string;
  readonly labelEn: string;
  readonly uploadedAt: string;
  readonly authorRoleKo: string;
  readonly authorRoleEn: string;
  readonly changedCutsCount: number;
  readonly avgDeltaEColorShift: number;
  readonly c2paWatermarkVerified: boolean;
}

export interface DepartmentConsensusVote {
  readonly department: ReviewerDepartment;
  readonly departmentLabelKo: string;
  readonly departmentLabelEn: string;
  readonly reviewerName: string;
  readonly requiredForPublish: boolean;
  readonly status: DepartmentVoteStatus;
  readonly slaHoursRemaining: number;
  readonly noteKo: string;
  readonly noteEn: string;
}

export interface CreativeReviewConsensusSummary {
  readonly quorumReached: boolean;
  readonly approvedRequiredCount: number;
  readonly totalRequiredCount: number;
  readonly unresolvedMustFixPins: number;
  readonly unresolvedSuggestionPins: number;
  readonly latestVersionTag: "v1" | "v2" | "v3";
  readonly c2paAllVerified: boolean;
  readonly publishReadinessScore: number;
  readonly statusBannerKo: string;
  readonly statusBannerEn: string;
}

export const DEFAULT_VERSION_STACK_SNAPSHOTS: readonly VersionStackSnapshot[] = [
  {
    versionTag: "v1",
    labelKo: "v1 · 1차 선화+3D배경 가합성본",
    labelEn: "v1 · Initial Line Art + 3D BG Rough Composite",
    uploadedAt: "2026-10-25 14:20",
    authorRoleKo: "선화·3D배경 분업팀",
    authorRoleEn: "Line & 3D BG Crew",
    changedCutsCount: 72,
    avgDeltaEColorShift: 4.8,
    c2paWatermarkVerified: true,
  },
  {
    versionTag: "v2",
    labelKo: "v2 · 밑색·명암 렌더링 + 1차 리테이크 반영",
    labelEn: "v2 · Flat/Shading Render + Retake Round 1",
    uploadedAt: "2026-10-26 18:45",
    authorRoleKo: "채색·명암 전담팀",
    authorRoleEn: "Color & Shading Crew",
    changedCutsCount: 28,
    avgDeltaEColorShift: 1.9,
    c2paWatermarkVerified: true,
  },
  {
    versionTag: "v3",
    labelKo: "v3 · 후보정 조명(LUT)·이펙트·식자 마스터",
    labelEn: "v3 · Compositing LUT, VFX & Lettering Master",
    uploadedAt: "2026-10-27 03:10",
    authorRoleKo: "후보정·식자 QC팀",
    authorRoleEn: "Compositing & Lettering QC",
    changedCutsCount: 11,
    avgDeltaEColorShift: 0.6,
    c2paWatermarkVerified: true,
  },
];

export const DEFAULT_CUT_DRAW_OVER_PINS: readonly CutDrawOverAnnotationPin[] = [
  {
    id: "pin-c19-1",
    cutNumber: 19,
    versionTag: "v3",
    xPct: 42,
    yPct: 34,
    tool: "laser-stroke",
    department: "directing_pd",
    authorName: "한연출 총괄PD",
    severity: "must-fix",
    commentKo: "C019 주인공 눈동자 하이라이트 레이어가 역광 림라이트와 겹쳐 시선이 분산됨 — 하이라이트 불투명도 65%로 조정 요망",
    commentEn: "C019 protagonist eye highlight clashes with rim light; reduce highlight opacity to 65%",
    resolved: false,
  },
  {
    id: "pin-c24-2",
    cutNumber: 24,
    versionTag: "v3",
    xPct: 68,
    yPct: 58,
    tool: "perspective-grid",
    department: "bg_3d_lead",
    authorName: "박배경 3D실장",
    severity: "approved-note",
    commentKo: "C024 마차 창틀 3점 투시 소실점과 인물 어깨선 정합 확인 완료 (v3에서 완벽 해결)",
    commentEn: "C024 carriage window 3-point perspective vanishing point aligned with character shoulders in v3",
    resolved: true,
  },
  {
    id: "pin-c41-3",
    cutNumber: 41,
    versionTag: "v3",
    xPct: 29,
    yPct: 71,
    tool: "color-eyedropper",
    department: "color_vfx_lead",
    authorName: "최보정 VFX팀장",
    severity: "suggestion",
    commentKo: "C041 야경 골목 그림자 채도를 #1E243B → #171C30으로 8% 낮추면 네온 이펙트 대비가 살아남",
    commentEn: "Lowering C041 alley shadow saturation (#1E243B -> #171C30) boosts neon VFX contrast",
    resolved: false,
  },
  {
    id: "pin-c58-4",
    cutNumber: 58,
    versionTag: "v3",
    xPct: 54,
    yPct: 22,
    tool: "rect-callout",
    department: "editorial_qc",
    authorName: "정편집 식자QC",
    severity: "must-fix",
    commentKo: "C058 모바일 세로 스크롤 뷰포트에서 두 번째 말풍선 꼬리가 캐릭터 입 위치와 24px 어긋남",
    commentEn: "C058 second balloon tail is offset by 24px from speaker mouth in mobile scroll viewport",
    resolved: false,
  },
];

export const DEFAULT_DEPARTMENT_CONSENSUS_VOTES: readonly DepartmentConsensusVote[] = [
  {
    department: "directing_pd",
    departmentLabelKo: "연출·스토리 총괄 PD",
    departmentLabelEn: "Directing & Story PD",
    reviewerName: "한연출 총괄PD",
    requiredForPublish: true,
    status: "changes-requested",
    slaHoursRemaining: 3,
    noteKo: "C019 시선 유도 하이라이트 수정 후 즉시 최종 승인 예정",
    noteEn: "Will sign off immediately once C019 eye highlight opacity is adjusted",
  },
  {
    department: "lead_line_art",
    departmentLabelKo: "메인 작화·선화 데스크",
    departmentLabelEn: "Lead Line Art Desk",
    reviewerName: "김선화 메인어시",
    requiredForPublish: true,
    status: "approved",
    slaHoursRemaining: 8,
    noteKo: "전 72컷 인체 데생·의상 디테일·벡터 펜선 규격 검수 통과",
    noteEn: "All 72 cuts anatomy, costume detail, and vector ink specs approved",
  },
  {
    department: "bg_3d_lead",
    departmentLabelKo: "3D 배경·소품 총괄",
    departmentLabelEn: "3D Background Lead",
    reviewerName: "박배경 3D실장",
    requiredForPublish: true,
    status: "approved",
    slaHoursRemaining: 10,
    noteKo: "황궁·마차 씬 카메라 투시 및 에셋 라이선스 검증 완료",
    noteEn: "Palace & carriage camera perspective and asset licenses verified",
  },
  {
    department: "color_vfx_lead",
    departmentLabelKo: "채색·후보정·VFX 데스크",
    departmentLabelEn: "Color & VFX Lead",
    reviewerName: "최보정 VFX팀장",
    requiredForPublish: true,
    status: "approved",
    slaHoursRemaining: 6,
    noteKo: "컬러 스크립트 일관성(ΔE 0.6) 및 광원 LUT 룩업 테이블 검증 완료",
    noteEn: "Color script consistency (Delta-E 0.6) and LUT grade verified",
  },
  {
    department: "editorial_qc",
    departmentLabelKo: "식자·모바일 가독성 QC",
    departmentLabelEn: "Lettering & Mobile QC",
    reviewerName: "정편집 식자QC",
    requiredForPublish: true,
    status: "changes-requested",
    slaHoursRemaining: 2,
    noteKo: "C058 말풍선 꼬리 정렬 수정 대기",
    noteEn: "Waiting on C058 speech balloon tail alignment fix",
  },
];

export function evaluateCreativeReviewConsensus(
  pins: readonly CutDrawOverAnnotationPin[],
  votes: readonly DepartmentConsensusVote[],
  versions: readonly VersionStackSnapshot[],
): CreativeReviewConsensusSummary {
  const requiredVotes = votes.filter((vote) => vote.requiredForPublish);
  const approvedRequiredCount = requiredVotes.filter((vote) => vote.status === "approved").length;
  const totalRequiredCount = requiredVotes.length;

  const unresolvedMustFixPins = pins.filter(
    (pin) => pin.severity === "must-fix" && !pin.resolved,
  ).length;
  const unresolvedSuggestionPins = pins.filter(
    (pin) => pin.severity === "suggestion" && !pin.resolved,
  ).length;

  const latestVersion = versions[versions.length - 1];
  const latestVersionTag = latestVersion ? latestVersion.versionTag : "v3";
  const c2paAllVerified = versions.every((v) => v.c2paWatermarkVerified);

  const quorumReached =
    totalRequiredCount > 0 &&
    approvedRequiredCount === totalRequiredCount &&
    unresolvedMustFixPins === 0;

  const voteRatio = totalRequiredCount > 0 ? approvedRequiredCount / totalRequiredCount : 1;
  const pinPenalty = unresolvedMustFixPins * 18 + unresolvedSuggestionPins * 4;
  const rawScore = Math.round(voteRatio * 85 + (c2paAllVerified ? 15 : 0) - pinPenalty);
  const publishReadinessScore = Math.max(0, Math.min(100, rawScore));

  return {
    quorumReached,
    approvedRequiredCount,
    totalRequiredCount,
    unresolvedMustFixPins,
    unresolvedSuggestionPins,
    latestVersionTag,
    c2paAllVerified,
    publishReadinessScore,
    statusBannerKo: quorumReached
      ? `5대 분업 데스크 전원 승인(${approvedRequiredCount}/${totalRequiredCount}) 및 필수 드로오버 핀 0건 — 연재 마스터 반출 가능`
      : `필수 데스크 승인 ${approvedRequiredCount}/${totalRequiredCount} · 미해결 필수 수정 핀 ${unresolvedMustFixPins}건 해결 시 최종 반출 잠금 해제`,
    statusBannerEn: quorumReached
      ? `All ${approvedRequiredCount}/${totalRequiredCount} department leads approved & 0 must-fix draw-over pins — ready for master release`
      : `${approvedRequiredCount}/${totalRequiredCount} department approvals · resolve ${unresolvedMustFixPins} must-fix draw-over pin(s) to unlock release`,
  };
}
