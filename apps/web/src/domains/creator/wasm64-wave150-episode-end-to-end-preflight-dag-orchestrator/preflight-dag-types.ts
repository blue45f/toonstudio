/**
 * Wave 150 마일스톤 — 9대 에피소드 출고 품질 게이트 DAG 계약 및 출고 여권 타입 정의.
 *
 * - 작화 완료 이후 멀티 플랫폼 출고 직전까지 거쳐야 하는 9대 표준 스튜디오 게이트의 의존성과 입력 슬라이스를 규정한다.
 * - 커스텀 게이트 확장, 증분 캐시 무효화, 차단 전파, 근본 차단 트리아지, SHA-256 출고 여권 계약을 모두 순수 타입으로 선언한다.
 */

export const STANDARD_PREFLIGHT_GATE_ORDER = [
  "layer-hygiene-vram",
  "wardrobe-timeline-continuity",
  "eyeline-gaze-composition",
  "dialogue-typeset-tails",
  "oled-dual-theme-contrast",
  "rights-bom-clearance",
  "multiplatform-smart-slice",
  "forensic-watermark-shield",
  "episode-release-passport",
] as const;

export type StandardPreflightGateId = (typeof STANDARD_PREFLIGHT_GATE_ORDER)[number];

/**
 * 표준 9대 게이트 또는 스튜디오 확장 커스텀 게이트 식별자.
 */
export type PreflightGateId =
  | StandardPreflightGateId
  | (string & { readonly __customPreflightGateBrand?: never });

export const ARTIFACT_HASH_KEYS = [
  "layersHash",
  "continuityHash",
  "compositionHash",
  "dialogueHash",
  "themeSettingsHash",
  "rightsBomHash",
  "platformTargetsHash",
  "watermarkPolicyHash",
] as const;

export type PreflightArtifactHashKey = (typeof ARTIFACT_HASH_KEYS)[number];

export type PreflightSliceKey =
  | PreflightArtifactHashKey
  | "releaseScope"
  | (string & { readonly __customSliceKeyBrand?: never });

export type PreflightIssueSeverity = "blocker" | "warning" | "info";

export type PreflightGateStatus =
  | "passed"
  | "warning"
  | "blocked"
  | "skipped-upstream-blocked";

export type PreflightCacheDisposition =
  | "cache-hit"
  | "cache-miss"
  | "skipped-upstream-blocked";

export type PreflightReleaseDecision = "approved" | "conditional-pass" | "blocked";

export type PreflightDagValidationErrorCode =
  | "CYCLE_DETECTED"
  | "UNKNOWN_DEPENDENCY"
  | "DUPLICATE_GATE_ID"
  | "EMPTY_GATE_ID"
  | "SELF_DEPENDENCY"
  | "MISSING_EPISODE_ID"
  | "INVALID_HASH_VALUE";

export interface PreflightGateDefinition {
  readonly gateId: PreflightGateId;
  readonly labelKo: string;
  readonly shortLabelKo: string;
  readonly categoryKo: string;
  readonly descriptionKo: string;
  readonly dependsOn: readonly PreflightGateId[];
  readonly artifactSliceKey: PreflightSliceKey;
  readonly estimatedComputeMs: number;
  readonly evaluatorVersion?: string;
}

export const STANDARD_PREFLIGHT_GATE_DEFINITIONS: readonly PreflightGateDefinition[] = [
  {
    gateId: "layer-hygiene-vram",
    labelKo: "레이어·VRAM 정규화",
    shortLabelKo: "레이어·VRAM",
    categoryKo: "기반 무결성",
    descriptionKo: "빈 레이어·숨김 고아 레이어 정리 및 VRAM 텍스처 예산 상한을 검증한다.",
    dependsOn: [],
    artifactSliceKey: "layersHash",
    estimatedComputeMs: 420,
    evaluatorVersion: "150.1.0",
  },
  {
    gateId: "wardrobe-timeline-continuity",
    labelKo: "의상·연표 연속성",
    shortLabelKo: "의상·연표",
    categoryKo: "서사 일관성",
    descriptionKo: "인물 복장·소품·상처 상태와 회차 간 시간선 모순 여부를 대조한다.",
    dependsOn: ["layer-hygiene-vram"],
    artifactSliceKey: "continuityHash",
    estimatedComputeMs: 580,
    evaluatorVersion: "150.1.0",
  },
  {
    gateId: "eyeline-gaze-composition",
    labelKo: "180도 시선·동선",
    shortLabelKo: "시선·동선",
    categoryKo: "연출 구도",
    descriptionKo: "대화 컷 180도 축 반전, 시선 매칭, 시선 유도 동선 이탈을 점검한다.",
    dependsOn: ["layer-hygiene-vram"],
    artifactSliceKey: "compositionHash",
    estimatedComputeMs: 510,
    evaluatorVersion: "150.1.0",
  },
  {
    gateId: "dialogue-typeset-tails",
    labelKo: "다국어 식자·꼬리 교차",
    shortLabelKo: "식자·말풍선",
    categoryKo: "식자·현지화",
    descriptionKo: "다국어 말풍선 오버플로, 화자 꼬리 교차 및 가독 폰트 크기를 검사한다.",
    dependsOn: ["eyeline-gaze-composition"],
    artifactSliceKey: "dialogueHash",
    estimatedComputeMs: 640,
    evaluatorVersion: "150.1.0",
  },
  {
    gateId: "oled-dual-theme-contrast",
    labelKo: "OLED·라이트 대비 점검",
    shortLabelKo: "OLED·대비",
    categoryKo: "시각 가독성",
    descriptionKo: "다크 OLED 및 라이트 뷰어 양면 대비비와 백색 눈부심 한계를 확인한다.",
    dependsOn: ["layer-hygiene-vram", "dialogue-typeset-tails"],
    artifactSliceKey: "themeSettingsHash",
    estimatedComputeMs: 490,
    evaluatorVersion: "150.1.0",
  },
  {
    gateId: "rights-bom-clearance",
    labelKo: "권리 BOM·라이선스 승인",
    shortLabelKo: "권리 BOM",
    categoryKo: "저작권 준수",
    descriptionKo: "폰트·브러시·3D 배경·2차 저작물 라이선스와 상업 연재 범위를 대조한다.",
    dependsOn: [],
    artifactSliceKey: "rightsBomHash",
    estimatedComputeMs: 360,
    evaluatorVersion: "150.1.0",
  },
  {
    gateId: "multiplatform-smart-slice",
    labelKo: "5플랫폼 절단 제로 슬라이스",
    shortLabelKo: "스마트 슬라이스",
    categoryKo: "플랫폼 패키징",
    descriptionKo: "말풍선·인물 얼굴 절단 없이 5대 연재 플랫폼 규격으로 자동 분할한다.",
    dependsOn: ["oled-dual-theme-contrast", "wardrobe-timeline-continuity"],
    artifactSliceKey: "platformTargetsHash",
    estimatedComputeMs: 880,
    evaluatorVersion: "150.1.0",
  },
  {
    gateId: "forensic-watermark-shield",
    labelKo: "8×8 DCT 워터마크·C2PA",
    shortLabelKo: "워터마크·C2PA",
    categoryKo: "유출 방어",
    descriptionKo: "8×8 DCT 포렌식 워터마크 삽입 및 AI 학습 차단 TDM·C2PA 서명을 검증한다.",
    dependsOn: ["multiplatform-smart-slice", "rights-bom-clearance"],
    artifactSliceKey: "watermarkPolicyHash",
    estimatedComputeMs: 760,
    evaluatorVersion: "150.1.0",
  },
  {
    gateId: "episode-release-passport",
    labelKo: "출고 여권 최종 봉인",
    shortLabelKo: "출고 여권",
    categoryKo: "최종 출고",
    descriptionKo: "전체 게이트 결과와 입력 지문을 합산해 FIPS 180-4 SHA-256 출고 여권을 발급한다.",
    dependsOn: ["forensic-watermark-shield"],
    artifactSliceKey: "releaseScope",
    estimatedComputeMs: 140,
    evaluatorVersion: "150.1.0",
  },
];

export const EPISODE_RELEASE_PASSPORT_SCHEMA_VERSION = "toonstudio.episode-release-passport.v1" as const;

export const DEFAULT_EVALUATED_AT_ISO = "2026-11-28T00:00:00.000Z";

export interface PreflightFindingInput {
  readonly findingId?: string;
  readonly code: string;
  readonly severity: PreflightIssueSeverity;
  readonly titleKo: string;
  readonly detailKo: string;
  readonly cutIndex?: number;
  readonly assetRef?: string;
  readonly fixHintKo?: string;
  readonly impactWeight?: number;
}

export interface PreflightFinding {
  readonly findingId: string;
  readonly gateId: string;
  readonly code: string;
  readonly severity: PreflightIssueSeverity;
  readonly titleKo: string;
  readonly detailKo: string;
  readonly cutIndex?: number;
  readonly assetRef?: string;
  readonly fixHintKo?: string;
  readonly impactWeight: number;
}

export interface GateSignalInput {
  readonly metrics?: Readonly<Record<string, number | string | boolean>>;
  readonly findings?: readonly PreflightFindingInput[];
  readonly forcedStatus?: "passed" | "warning" | "blocked";
  readonly simulatedDurationMs?: number;
  readonly summaryKo?: string;
}

export interface EpisodeReleaseScope {
  readonly platforms: readonly string[];
  readonly locales: readonly string[];
  readonly distributionTierKo?: string;
}

export interface EpisodePreflightArtifactSnapshot {
  readonly episodeId: string;
  readonly episodeTitleKo?: string;
  readonly revisionTag?: string;
  readonly evaluatedAtIso?: string;
  readonly releaseScope?: EpisodeReleaseScope;
  readonly layersHash: string;
  readonly continuityHash: string;
  readonly compositionHash: string;
  readonly dialogueHash: string;
  readonly themeSettingsHash: string;
  readonly rightsBomHash: string;
  readonly platformTargetsHash: string;
  readonly watermarkPolicyHash: string;
  readonly customArtifactHashes?: Readonly<Record<string, string>>;
  readonly gateSignals?: Readonly<Record<string, GateSignalInput>>;
}

export interface PreflightDagValidationError {
  readonly code: PreflightDagValidationErrorCode;
  readonly gateId?: string;
  readonly relatedGateIds?: readonly string[];
  readonly detailKo: string;
}

export interface PreflightTopologyPlan {
  readonly valid: boolean;
  readonly cycleDetected: boolean;
  readonly cyclePathGateIds: readonly string[];
  readonly validationErrors: readonly PreflightDagValidationError[];
  readonly definitionsById: Readonly<Record<string, PreflightGateDefinition>>;
  readonly topologicalOrder: readonly string[];
  readonly layerDepthByGate: Readonly<Record<string, number>>;
  readonly downstreamAdjacency: Readonly<Record<string, readonly string[]>>;
  readonly transitiveDownstreamByGate: Readonly<Record<string, readonly string[]>>;
  readonly topologySha256Hex: string;
}

export interface PreflightGateEvaluationOutput {
  readonly status: "passed" | "warning" | "blocked";
  readonly metrics?: Readonly<Record<string, number | string | boolean>>;
  readonly findings?: readonly PreflightFindingInput[];
  readonly durationMs?: number;
  readonly summaryKo?: string;
}

export interface PreflightGateEvaluatorContext {
  readonly gate: PreflightGateDefinition;
  readonly snapshot: EpisodePreflightArtifactSnapshot;
  readonly signal: GateSignalInput | undefined;
  readonly ownArtifactSliceHash: string;
  readonly effectiveInputDigest: string;
  readonly strictZeroWarnings: boolean;
  readonly parentRecords: readonly PreflightGateExecutionRecord[];
}

export type PreflightGateEvaluator = (
  context: PreflightGateEvaluatorContext,
) => PreflightGateEvaluationOutput;

export interface PreflightGateExecutionRecord {
  readonly gateId: string;
  readonly labelKo: string;
  readonly shortLabelKo: string;
  readonly categoryKo: string;
  readonly layerDepth: number;
  readonly topologicalIndex: number;
  readonly dependsOn: readonly string[];
  readonly downstreamGateIds: readonly string[];
  readonly transitiveDownstreamCount: number;
  readonly status: PreflightGateStatus;
  readonly cacheDisposition: PreflightCacheDisposition;
  readonly ownArtifactSliceHash: string;
  readonly effectiveInputDigest: string;
  readonly parentEffectiveDigests: Readonly<Record<string, string>>;
  readonly baselineDurationMs: number;
  readonly computedDurationMs: number;
  readonly savedDurationMs: number;
  readonly metrics: Readonly<Record<string, number | string | boolean>>;
  readonly findings: readonly PreflightFinding[];
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly blockedByGateIds: readonly string[];
  readonly rootBlockerGateIds: readonly string[];
  readonly summaryKo: string;
}

export interface PreflightGateCacheEntry {
  readonly gateId: string;
  readonly effectiveInputDigest: string;
  readonly ownArtifactSliceHash: string;
  readonly status: "passed" | "warning" | "blocked";
  readonly baselineDurationMs: number;
  readonly metrics: Readonly<Record<string, number | string | boolean>>;
  readonly findings: readonly PreflightFinding[];
  readonly summaryKo: string;
}

export interface PreflightDagCacheSnapshot {
  readonly schemaVersion: typeof EPISODE_RELEASE_PASSPORT_SCHEMA_VERSION;
  readonly topologySha256Hex: string;
  readonly entries: Readonly<Record<string, PreflightGateCacheEntry>>;
}

export interface CriticalBlockerTriageItem {
  readonly rank: number;
  readonly gateId: string;
  readonly gateLabelKo: string;
  readonly layerDepth: number;
  readonly findingId: string;
  readonly code: string;
  readonly severity: "blocker" | "warning";
  readonly promotedByStrictPolicy: boolean;
  readonly titleKo: string;
  readonly detailKo: string;
  readonly fixHintKo?: string;
  readonly cutIndex?: number;
  readonly assetRef?: string;
  readonly directDownstreamCount: number;
  readonly transitiveBlastRadius: number;
  readonly impactedGateIds: readonly string[];
  readonly priorityScore: number;
}

export interface EpisodeReleasePassportPayload {
  readonly schemaVersion: typeof EPISODE_RELEASE_PASSPORT_SCHEMA_VERSION;
  readonly passportId: string;
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly revisionTag: string;
  readonly issuedAtIso: string;
  readonly releaseDecision: PreflightReleaseDecision;
  readonly releaseApproved: boolean;
  readonly strictZeroWarnings: boolean;
  readonly releaseScope: EpisodeReleaseScope;
  readonly dagTopologyDigest: string;
  readonly snapshotInputDigest: string;
  readonly gateDigestMap: Readonly<Record<string, string>>;
  readonly gateStatusMap: Readonly<Record<string, PreflightGateStatus>>;
  readonly passedGateCount: number;
  readonly warningGateCount: number;
  readonly blockedGateCount: number;
  readonly skippedGateCount: number;
  readonly cacheHitCount: number;
  readonly cacheMissCount: number;
}

export interface EpisodeReleasePassport extends EpisodeReleasePassportPayload {
  readonly passportSha256Hex: string;
}

export interface PassportVerificationResult {
  readonly valid: boolean;
  readonly expectedSha256Hex: string;
  readonly actualSha256Hex: string;
  readonly mismatchReasonsKo: readonly string[];
  readonly releaseApproved: boolean;
}

export interface PreflightCacheEfficiencyMetrics {
  readonly totalGateCount: number;
  readonly cacheHitCount: number;
  readonly cacheMissCount: number;
  readonly skippedCount: number;
  readonly hitRateRatio: number;
  readonly estimatedFullDurationMs: number;
  readonly actualExecutedDurationMs: number;
  readonly savedDurationMs: number;
  readonly timeSavedRatio: number;
}

export interface EpisodePreflightDagOptions {
  readonly customGates?: readonly PreflightGateDefinition[];
  readonly overrideGates?: readonly PreflightGateDefinition[];
  readonly replaceStandardGates?: boolean;
  readonly strictZeroWarnings?: boolean;
  readonly previousRunCache?:
    | PreflightDagCacheSnapshot
    | ReadonlyMap<string, PreflightGateCacheEntry>;
  readonly gateEvaluators?: Readonly<Record<string, PreflightGateEvaluator>>;
  readonly evaluatedAtIso?: string;
}

export interface EpisodePreflightDagResult {
  readonly ok: boolean;
  readonly cycleDetected: boolean;
  readonly cyclePathGateIds: readonly string[];
  readonly validationErrors: readonly PreflightDagValidationError[];
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly revisionTag: string;
  readonly evaluatedAtIso: string;
  readonly strictZeroWarnings: boolean;
  readonly releaseDecision: PreflightReleaseDecision;
  readonly releaseApproved: boolean;
  readonly topology: PreflightTopologyPlan;
  readonly topologicalOrder: readonly string[];
  readonly gateResults: readonly PreflightGateExecutionRecord[];
  readonly gateById: Readonly<Record<string, PreflightGateExecutionRecord>>;
  readonly cacheMetrics: PreflightCacheEfficiencyMetrics;
  readonly criticalBlockers: readonly CriticalBlockerTriageItem[];
  readonly passport: EpisodeReleasePassport;
  readonly nextCache: PreflightDagCacheSnapshot;
  readonly dagRunSha256Hex: string;
}

export interface PreflightDagSvgOptions {
  readonly titleKo?: string;
  readonly widthPx?: number;
  readonly showDigestPrefix?: boolean;
}
