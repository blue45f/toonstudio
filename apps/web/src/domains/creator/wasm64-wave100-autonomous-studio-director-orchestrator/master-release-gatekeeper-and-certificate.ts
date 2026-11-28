/**
 * Wave 100 — Fail-Closed 마스터 에피소드 출고 게이트키퍼 & 암호학적 마스터 출고 인증서.
 *
 * - 7대 필수 출고 불변식(권리 BOM, 권역 심의, 야간 QA 하드 블로커 0건, 색각안전/접근성,
 *   연속성 바이블, 100년 C2PA 금고 봉인, 모든 임계 스테이지 통과)을 fail-closed 방식으로 평가한다.
 * - 5개 멀티 서피스 출고 대상별 승인/차단 판정(`RELEASE_APPROVED` / `RELEASE_BLOCKED`)과
 *   구체적인 한국어 시정 조치를 생성한다.
 * - 1문자 위변조도 즉시 검출하는 FIPS 180-4 SHA-256 마스터 출고 인증서(`MasterReleaseCertificate`)를 발급·검증한다.
 */

import type { EpisodeProductionRunReport, StageExecutionRecord } from "./episode-production-dag-scheduler";
import { canonicalizeWave100Json, sha256Wave100Hex } from "./wave100-sha256";

export { canonicalizeWave100Json, sha256Wave100Hex };

export const RELEASE_SURFACE_TARGETS = [
  "vertical-webtoon-strip",
  "tstudio-live-reactive",
  "print-b5-cmyk",
  "webxr-spatial-theater",
  "centennial-c2pa-vault",
] as const;

export type ReleaseSurfaceTarget = (typeof RELEASE_SURFACE_TARGETS)[number];

export type SurfaceReleaseDecision = "RELEASE_APPROVED" | "RELEASE_BLOCKED";

export type MasterReleaseDecision = "APPROVED" | "BLOCKED";

export const MASTER_RELEASE_INVARIANT_IDS = [
  "rightsBomCleared",
  "geoComplianceCleared",
  "overnightQaZeroHardBlockers",
  "accessibilityAndCvdPassed",
  "continuityAndCanonPassed",
  "centennialVaultSealed",
  "allCriticalStagesSucceeded",
] as const;

export type MasterReleaseInvariantId = (typeof MASTER_RELEASE_INVARIANT_IDS)[number];

export interface MasterReleaseInvariantMap {
  readonly rightsBomCleared: boolean;
  readonly geoComplianceCleared: boolean;
  readonly overnightQaZeroHardBlockers: boolean;
  readonly accessibilityAndCvdPassed: boolean;
  readonly continuityAndCanonPassed: boolean;
  readonly centennialVaultSealed: boolean;
  readonly allCriticalStagesSucceeded: boolean;
}

export interface ReleaseSurfaceProfile {
  readonly target: ReleaseSurfaceTarget;
  readonly labelKo: string;
  readonly isCommercial: boolean;
  readonly requiredInvariants: readonly MasterReleaseInvariantId[];
  readonly requiredStageIds: readonly string[];
}

export const RELEASE_SURFACE_PROFILES: Readonly<Record<ReleaseSurfaceTarget, ReleaseSurfaceProfile>> = {
  "vertical-webtoon-strip": {
    target: "vertical-webtoon-strip",
    labelKo: "세로 스크롤 웹툰 스트립",
    isCommercial: true,
    requiredInvariants: ["rightsBomCleared", "geoComplianceCleared", "overnightQaZeroHardBlockers", "accessibilityAndCvdPassed", "continuityAndCanonPassed", "allCriticalStagesSucceeded"],
    requiredStageIds: ["causal-ink-and-kinematic-cleanup", "cvd-mobile-readability-audit", "geo-compliance-and-rights-bom", "multi-format-packager"],
  },
  "tstudio-live-reactive": {
    target: "tstudio-live-reactive",
    labelKo: "T-Studio 라이브 리액티브",
    isCommercial: true,
    requiredInvariants: ["rightsBomCleared", "geoComplianceCleared", "overnightQaZeroHardBlockers", "accessibilityAndCvdPassed", "continuityAndCanonPassed", "allCriticalStagesSucceeded"],
    requiredStageIds: ["fluid-relief-and-relighting", "saliency-and-audio-pacing", "geo-compliance-and-rights-bom", "multi-format-packager"],
  },
  "print-b5-cmyk": {
    target: "print-b5-cmyk",
    labelKo: "B5 단행본 인쇄 CMYK",
    isCommercial: true,
    requiredInvariants: ["rightsBomCleared", "geoComplianceCleared", "overnightQaZeroHardBlockers", "continuityAndCanonPassed", "allCriticalStagesSucceeded"],
    requiredStageIds: ["causal-ink-and-kinematic-cleanup", "geo-compliance-and-rights-bom", "multi-format-packager"],
  },
  "webxr-spatial-theater": {
    target: "webxr-spatial-theater",
    labelKo: "WebXR 공간 시어터",
    isCommercial: true,
    requiredInvariants: ["rightsBomCleared", "geoComplianceCleared", "overnightQaZeroHardBlockers", "accessibilityAndCvdPassed", "continuityAndCanonPassed", "allCriticalStagesSucceeded"],
    requiredStageIds: ["fluid-relief-and-relighting", "saliency-and-audio-pacing", "geo-compliance-and-rights-bom", "multi-format-packager"],
  },
  "centennial-c2pa-vault": {
    target: "centennial-c2pa-vault",
    labelKo: "100년 보존 C2PA 금고",
    isCommercial: false,
    requiredInvariants: ["overnightQaZeroHardBlockers", "continuityAndCanonPassed", "centennialVaultSealed", "allCriticalStagesSucceeded"],
    requiredStageIds: ["multi-format-packager", "centennial-c2pa-vault-seal"],
  },
};

export interface MasterReleaseInvariantCheck {
  readonly id: MasterReleaseInvariantId;
  readonly labelKo: string;
  readonly passed: boolean;
  readonly sourceStageId: string;
  readonly detailKo: string;
  readonly remediationKo: string | null;
}

export interface SurfaceReleaseEvaluation {
  readonly target: ReleaseSurfaceTarget;
  readonly labelKo: string;
  readonly isCommercial: boolean;
  readonly decision: SurfaceReleaseDecision;
  readonly failedInvariants: readonly MasterReleaseInvariantId[];
  readonly missingPackagedArtifact: boolean;
  readonly blockingReasonsKo: readonly string[];
}

export interface ReleaseRemediationAction {
  readonly invariantId: MasterReleaseInvariantId;
  readonly stageId: string;
  readonly affectedSurfaces: readonly ReleaseSurfaceTarget[];
  readonly actionKo: string;
}

export interface MasterReleaseGateSignalOverrides {
  readonly rightsBomCleared?: boolean;
  readonly geoComplianceCleared?: boolean;
  readonly unresolvedGeoBlockers?: number;
  readonly overnightQaZeroHardBlockers?: boolean;
  readonly unhealedHardQaBlockers?: number;
  readonly accessibilityAndCvdPassed?: boolean;
  readonly continuityAndCanonPassed?: boolean;
  readonly continuityContradictions?: number;
  readonly centennialVaultSealed?: boolean;
}

export interface EvaluateMasterReleaseGateOptions {
  readonly targetSurfaces?: readonly ReleaseSurfaceTarget[];
  readonly issuedAtIso?: string;
  readonly signalOverrides?: MasterReleaseGateSignalOverrides;
}

export interface MasterReleaseCertificate {
  readonly schemaVersion: "wave100-master-cert-v1";
  readonly certificateId: string;
  readonly episodeId: string;
  readonly episodeTitle: string;
  readonly seriesId: string;
  readonly masterRevision: number;
  readonly runId: string;
  readonly issuedAtIso: string;
  readonly masterDecision: MasterReleaseDecision;
  readonly invariants: MasterReleaseInvariantMap;
  readonly surfaceDecisions: Readonly<Record<ReleaseSurfaceTarget, SurfaceReleaseDecision>>;
  readonly approvedSurfaceCount: number;
  readonly totalSurfaceCount: number;
  readonly merkleStageDigest: string;
  readonly masterStateDigest: string;
  readonly waveCoverage: readonly number[];
  readonly waveCoverageCount: number;
  readonly remediationCount: number;
  readonly certificateSha256: string;
}

export interface MasterReleaseGateEvaluation {
  readonly episodeId: string;
  readonly runId: string;
  readonly masterDecision: MasterReleaseDecision;
  readonly invariants: MasterReleaseInvariantMap;
  readonly invariantChecks: readonly MasterReleaseInvariantCheck[];
  readonly passedInvariantCount: number;
  readonly totalInvariantCount: number;
  readonly surfaceDecisions: Readonly<Record<ReleaseSurfaceTarget, SurfaceReleaseDecision>>;
  readonly surfaceEvaluations: Readonly<Record<ReleaseSurfaceTarget, SurfaceReleaseEvaluation>>;
  readonly approvedSurfaces: readonly ReleaseSurfaceTarget[];
  readonly blockedSurfaces: readonly ReleaseSurfaceTarget[];
  readonly remediationActions: readonly ReleaseRemediationAction[];
  readonly certificate: MasterReleaseCertificate;
}

export interface MasterReleaseCertificateIntegrityResult {
  readonly valid: boolean;
  readonly expectedSha256: string;
  readonly actualSha256: string;
  readonly violations: readonly string[];
  readonly reasonKo: string;
}

function isStagePassed(rec: StageExecutionRecord | undefined): boolean {
  return rec !== undefined && (rec.status === "passed" || rec.status === "healed-passed");
}

function readBoolField(rec: StageExecutionRecord | undefined, key: string): boolean | undefined {
  if (rec === undefined) return undefined;
  const val = rec.output[key];
  return typeof val === "boolean" ? val : undefined;
}

function readNumberField(rec: StageExecutionRecord | undefined, key: string): number | undefined {
  if (rec === undefined) return undefined;
  const val = rec.output[key];
  return typeof val === "number" && Number.isFinite(val) ? val : undefined;
}

function readStringField(rec: StageExecutionRecord | undefined, key: string): string | undefined {
  if (rec === undefined) return undefined;
  const val = rec.output[key];
  return typeof val === "string" && val.trim().length > 0 ? val : undefined;
}

function readPackagedSurfaces(rec: StageExecutionRecord | undefined): ReadonlySet<string> | null {
  if (rec === undefined) return null;
  const raw = rec.output["packagedSurfaces"];
  if (!Array.isArray(raw)) return null;
  const set = new Set<string>();
  for (let i = 0; i < raw.length; i += 1) {
    if (typeof raw[i] === "string") {
      set.add(raw[i]);
    }
  }
  return set;
}

function evaluateSevenInvariants(
  runReport: EpisodeProductionRunReport,
  overrides: MasterReleaseGateSignalOverrides | undefined,
): {
  readonly invariants: MasterReleaseInvariantMap;
  readonly checks: readonly MasterReleaseInvariantCheck[];
} {
  const geoRec = runReport.stagesById["geo-compliance-and-rights-bom"];
  const qaRec = runReport.stagesById["overnight-self-healing-qa"];
  const cvdRec = runReport.stagesById["cvd-mobile-readability-audit"];
  const canonRec = runReport.stagesById["continuity-bible-check"];
  const vaultRec = runReport.stagesById["centennial-c2pa-vault-seal"];

  // 1. Rights BOM
  const expiredLicenses = readNumberField(geoRec, "expiredLicenseCount") ?? 0;
  const territoryViolations = readNumberField(geoRec, "territoryViolationCount") ?? 0;
  const rightsBomFlag = readBoolField(geoRec, "rightsBomCleared") === true;
  const rightsBomCleared =
    isStagePassed(geoRec) &&
    rightsBomFlag &&
    expiredLicenses === 0 &&
    territoryViolations === 0 &&
    overrides?.rightsBomCleared !== false;

  // 2. Geo Compliance
  const geoBlockersFromStage = readNumberField(geoRec, "unresolvedGeoBlockers");
  const geoBlockers = overrides?.unresolvedGeoBlockers ?? geoBlockersFromStage ?? 1;
  const geoFlag = readBoolField(geoRec, "geoComplianceCleared") === true;
  const geoComplianceCleared =
    isStagePassed(geoRec) &&
    geoFlag &&
    geoBlockers === 0 &&
    overrides?.geoComplianceCleared !== false;

  // 3. Overnight Self-Healing QA (0 hard blockers)
  const hardQaFromStage = readNumberField(qaRec, "unhealedHardQaBlockers");
  const unhealedHardQa = overrides?.unhealedHardQaBlockers ?? hardQaFromStage ?? 1;
  const overnightQaZeroHardBlockers =
    isStagePassed(qaRec) &&
    unhealedHardQa === 0 &&
    overrides?.overnightQaZeroHardBlockers !== false;

  // 4. Accessibility & CVD
  const cvdPassed = readBoolField(cvdRec, "cvdAuditPassed") === true;
  const reducedMotionSafe = readBoolField(cvdRec, "reducedMotionSafe") === true;
  const accessibilityAndCvdPassed =
    isStagePassed(cvdRec) &&
    cvdPassed &&
    reducedMotionSafe &&
    overrides?.accessibilityAndCvdPassed !== false;

  // 5. Continuity & Canon
  const contradictionsFromStage = readNumberField(canonRec, "continuityContradictions");
  const continuityContradictions =
    overrides?.continuityContradictions ?? contradictionsFromStage ?? 1;
  const continuityAndCanonPassed =
    isStagePassed(canonRec) &&
    continuityContradictions === 0 &&
    overrides?.continuityAndCanonPassed !== false;

  // 6. Centennial C2PA Vault Seal
  const vaultSealValid = readBoolField(vaultRec, "c2paVaultSealValid") === true;
  const vaultManifestHash = readStringField(vaultRec, "vaultManifestSha256");
  const centennialVaultSealed =
    isStagePassed(vaultRec) &&
    vaultSealValid &&
    vaultManifestHash !== undefined &&
    overrides?.centennialVaultSealed !== false;

  // 7. All Critical Stages Succeeded (+ Master State Isolation)
  const allCriticalStagesSucceeded =
    runReport.allCriticalStagesSucceeded &&
    runReport.allStagesSucceeded &&
    runReport.masterStateIsolated;

  const invariants: MasterReleaseInvariantMap = {
    rightsBomCleared,
    geoComplianceCleared,
    overnightQaZeroHardBlockers,
    accessibilityAndCvdPassed,
    continuityAndCanonPassed,
    centennialVaultSealed,
    allCriticalStagesSucceeded,
  };

  const checks: readonly MasterReleaseInvariantCheck[] = [
    {
      id: "rightsBomCleared",
      labelKo: "권리 BOM 상업·권역 라이선스 검증",
      passed: rightsBomCleared,
      sourceStageId: "geo-compliance-and-rights-bom",
      detailKo: rightsBomCleared
        ? "모든 폰트·소품·브러시·오디오 상업 라이선스와 권역 권한이 유효합니다."
        : `권리 BOM 미승인 (만료 ${expiredLicenses}건, 권역 위반 ${territoryViolations}건 또는 스테이지 차단).`,
      remediationKo: rightsBomCleared
        ? null
        : "만료·권역 제한 에셋을 승인 라이선스로 교체한 뒤 geo-compliance-and-rights-bom 단계부터 체크포인트를 재개하세요.",
    },
    {
      id: "geoComplianceCleared",
      labelKo: "글로벌 권역 심의 차단 0건",
      passed: geoComplianceCleared,
      sourceStageId: "geo-compliance-and-rights-bom",
      detailKo: geoComplianceCleared
        ? "대상 권역 심의 미해결 차단 항목이 0건입니다."
        : `권역 심의 미해결 차단 ${geoBlockers}건이 남아 있습니다.`,
      remediationKo: geoComplianceCleared
        ? null
        : "권역별 비파괴 변형 레이어를 적용해 미해결 심의 차단을 0건으로 만든 뒤 재검증하세요.",
    },
    {
      id: "overnightQaZeroHardBlockers",
      labelKo: "야간 자가치유 QA 하드 블로커 0건",
      passed: overnightQaZeroHardBlockers,
      sourceStageId: "overnight-self-healing-qa",
      detailKo: overnightQaZeroHardBlockers
        ? "미치유 하드 QA 블로커가 0건입니다."
        : `미치유 하드 QA 블로커 ${unhealedHardQa}건이 남아 있습니다.`,
      remediationKo: overnightQaZeroHardBlockers
        ? null
        : "자동 치유 실패 패널의 선화 결손·말풍선 잘림을 수동 보정한 뒤 overnight-self-healing-qa를 재실행하세요.",
    },
    {
      id: "accessibilityAndCvdPassed",
      labelKo: "색각안전(CVD)·WCAG 대비·저감 모션 검증",
      passed: accessibilityAndCvdPassed,
      sourceStageId: "cvd-mobile-readability-audit",
      detailKo: accessibilityAndCvdPassed
        ? "색각이상 가독성·모바일 대비·저감 모션 안전 기준을 충족했습니다."
        : "색각안전 또는 저감 모션 안전 검증을 통과하지 못했습니다.",
      remediationKo: accessibilityAndCvdPassed
        ? null
        : "대비 미달 텍스트·과도한 점멸 모션을 보정한 뒤 cvd-mobile-readability-audit를 재실행하세요.",
    },
    {
      id: "continuityAndCanonPassed",
      labelKo: "서사·설정 연속성 바이블 모순 0건",
      passed: continuityAndCanonPassed,
      sourceStageId: "continuity-bible-check",
      detailKo: continuityAndCanonPassed
        ? "연속성 바이블 대조 결과 모순이 0건입니다."
        : `연속성 바이블 모순 ${continuityContradictions}건이 검출되었습니다.`,
      remediationKo: continuityAndCanonPassed
        ? null
        : "의상·소품·대사 연속성 충돌을 수정하거나 바이블 기준을 갱신한 뒤 파이프라인을 재실행하세요.",
    },
    {
      id: "centennialVaultSealed",
      labelKo: "100년 보존 C2PA 금고 비트-정확 봉인",
      passed: centennialVaultSealed,
      sourceStageId: "centennial-c2pa-vault-seal",
      detailKo: centennialVaultSealed
        ? `100년 C2PA 금고 봉인 유효 (${(vaultManifestHash ?? "").slice(0, 12)}).`
        : "100년 C2PA 금고 봉인이 생성되지 않았거나 검증에 실패했습니다.",
      remediationKo: centennialVaultSealed
        ? null
        : "선행 패키징 차단 사유를 해소한 뒤 centennial-c2pa-vault-seal 단계를 완료해 C2PA 봉인을 발급하세요.",
    },
    {
      id: "allCriticalStagesSucceeded",
      labelKo: "전체 DAG 임계 스테이지 통과 및 마스터 격리",
      passed: allCriticalStagesSucceeded,
      sourceStageId: "multi-format-packager",
      detailKo: allCriticalStagesSucceeded
        ? `전체 ${runReport.stages.length}개 스테이지가 통과했고 마스터 원본 격리가 유지되었습니다.`
        : `미완료·차단 스테이지 ${runReport.blockedStageCount + runReport.skippedUpstreamBlockedCount}건 또는 마스터 상태 변형이 감지되었습니다.`,
      remediationKo: allCriticalStagesSucceeded
        ? null
        : "차단된 선행 스테이지를 수정한 뒤 체크포인트에서 재개해 모든 임계 경로 스테이지를 완료하세요.",
    },
  ];

  return { invariants, checks };
}

function buildUnsignedCertificatePayload(
  cert: Omit<MasterReleaseCertificate, "certificateSha256">,
): string {
  return canonicalizeWave100Json({
    schemaVersion: cert.schemaVersion,
    certificateId: cert.certificateId,
    episodeId: cert.episodeId,
    episodeTitle: cert.episodeTitle,
    seriesId: cert.seriesId,
    masterRevision: cert.masterRevision,
    runId: cert.runId,
    issuedAtIso: cert.issuedAtIso,
    masterDecision: cert.masterDecision,
    invariants: cert.invariants,
    surfaceDecisions: cert.surfaceDecisions,
    approvedSurfaceCount: cert.approvedSurfaceCount,
    totalSurfaceCount: cert.totalSurfaceCount,
    merkleStageDigest: cert.merkleStageDigest,
    masterStateDigest: cert.masterStateDigest,
    waveCoverage: cert.waveCoverage,
    waveCoverageCount: cert.waveCoverageCount,
    remediationCount: cert.remediationCount,
  });
}

/** Fail-Closed 7대 불변식과 5개 멀티 서피스 출고 게이트를 평가하고 마스터 인증서를 발급한다. */
export function evaluateMasterEpisodeReleaseGate(
  runReport: EpisodeProductionRunReport,
  options?: EvaluateMasterReleaseGateOptions,
): MasterReleaseGateEvaluation {
  const issuedAtIso = options?.issuedAtIso ?? runReport.executedAtIso;
  const targetSurfaces = options?.targetSurfaces ?? RELEASE_SURFACE_TARGETS;
  const { invariants, checks } = evaluateSevenInvariants(runReport, options?.signalOverrides);

  const checkById = new Map<MasterReleaseInvariantId, MasterReleaseInvariantCheck>();
  let passedInvariantCount = 0;
  for (let i = 0; i < checks.length; i += 1) {
    checkById.set(checks[i].id, checks[i]);
    if (checks[i].passed) {
      passedInvariantCount += 1;
    }
  }

  const packagerRec = runReport.stagesById["multi-format-packager"];
  const packagedSurfaces = readPackagedSurfaces(packagerRec);

  const surfaceDecisionsMutable: Record<ReleaseSurfaceTarget, SurfaceReleaseDecision> = {
    "vertical-webtoon-strip": "RELEASE_BLOCKED",
    "tstudio-live-reactive": "RELEASE_BLOCKED",
    "print-b5-cmyk": "RELEASE_BLOCKED",
    "webxr-spatial-theater": "RELEASE_BLOCKED",
    "centennial-c2pa-vault": "RELEASE_BLOCKED",
  };
  const surfaceEvaluationsMutable: Partial<Record<ReleaseSurfaceTarget, SurfaceReleaseEvaluation>> =
    {};

  const approvedSurfaces: ReleaseSurfaceTarget[] = [];
  const blockedSurfaces: ReleaseSurfaceTarget[] = [];

  for (let i = 0; i < RELEASE_SURFACE_TARGETS.length; i += 1) {
    const target = RELEASE_SURFACE_TARGETS[i];
    const profile = RELEASE_SURFACE_PROFILES[target];
    const failedInvariants: MasterReleaseInvariantId[] = [];
    const blockingReasonsKo: string[] = [];

    for (let j = 0; j < profile.requiredInvariants.length; j += 1) {
      const invId = profile.requiredInvariants[j];
      if (!invariants[invId]) {
        failedInvariants.push(invId);
        const check = checkById.get(invId);
        if (check !== undefined) {
          blockingReasonsKo.push(check.detailKo);
        }
      }
    }

    for (let j = 0; j < profile.requiredStageIds.length; j += 1) {
      const reqStageId = profile.requiredStageIds[j];
      const rec = runReport.stagesById[reqStageId];
      if (!isStagePassed(rec)) {
        blockingReasonsKo.push(`필수 스테이지 ${reqStageId} 미통과.`);
      }
    }

    const missingPackagedArtifact =
      packagedSurfaces !== null && !packagedSurfaces.has(target);
    if (missingPackagedArtifact) {
      blockingReasonsKo.push(`${profile.labelKo} 배포 산출물이 패키저 출력에 누락되었습니다.`);
    }

    const decision: SurfaceReleaseDecision =
      failedInvariants.length === 0 && blockingReasonsKo.length === 0
        ? "RELEASE_APPROVED"
        : "RELEASE_BLOCKED";

    surfaceDecisionsMutable[target] = decision;
    surfaceEvaluationsMutable[target] = {
      target,
      labelKo: profile.labelKo,
      isCommercial: profile.isCommercial,
      decision,
      failedInvariants,
      missingPackagedArtifact,
      blockingReasonsKo,
    };

    if (targetSurfaces.indexOf(target) !== -1) {
      if (decision === "RELEASE_APPROVED") {
        approvedSurfaces.push(target);
      } else {
        blockedSurfaces.push(target);
      }
    }
  }

  const surfaceEvaluations = surfaceEvaluationsMutable as Readonly<
    Record<ReleaseSurfaceTarget, SurfaceReleaseEvaluation>
  >;

  const remediationActions: ReleaseRemediationAction[] = [];
  for (let i = 0; i < checks.length; i += 1) {
    const check = checks[i];
    if (check.passed || check.remediationKo === null) continue;
    const affected: ReleaseSurfaceTarget[] = [];
    for (let j = 0; j < RELEASE_SURFACE_TARGETS.length; j += 1) {
      const target = RELEASE_SURFACE_TARGETS[j];
      if (RELEASE_SURFACE_PROFILES[target].requiredInvariants.indexOf(check.id) !== -1) {
        affected.push(target);
      }
    }
    remediationActions.push({
      invariantId: check.id,
      stageId: check.sourceStageId,
      affectedSurfaces: affected,
      actionKo: check.remediationKo,
    });
  }

  const masterDecision: MasterReleaseDecision =
    passedInvariantCount === MASTER_RELEASE_INVARIANT_IDS.length &&
    blockedSurfaces.length === 0
      ? "APPROVED"
      : "BLOCKED";

  const certificateId = `w100-cert-${sha256Wave100Hex(
    `${runReport.episodeId}:rev${runReport.masterRevision}:${runReport.runId}:${runReport.merkleStageDigest}:${issuedAtIso}`,
  ).slice(0, 16)}`;

  const unsignedCert: Omit<MasterReleaseCertificate, "certificateSha256"> = {
    schemaVersion: "wave100-master-cert-v1",
    certificateId,
    episodeId: runReport.episodeId,
    episodeTitle: runReport.episodeTitle,
    seriesId: runReport.seriesId,
    masterRevision: runReport.masterRevision,
    runId: runReport.runId,
    issuedAtIso,
    masterDecision,
    invariants,
    surfaceDecisions: { ...surfaceDecisionsMutable },
    approvedSurfaceCount: approvedSurfaces.length,
    totalSurfaceCount: targetSurfaces.length,
    merkleStageDigest: runReport.merkleStageDigest,
    masterStateDigest: runReport.masterStateDigest,
    waveCoverage: runReport.waveCoverage.slice(),
    waveCoverageCount: runReport.waveCoverageCount,
    remediationCount: remediationActions.length,
  };

  const certificateSha256 = sha256Wave100Hex(buildUnsignedCertificatePayload(unsignedCert));

  const certificate: MasterReleaseCertificate = {
    ...unsignedCert,
    certificateSha256,
  };

  return {
    episodeId: runReport.episodeId,
    runId: runReport.runId,
    masterDecision,
    invariants,
    invariantChecks: checks,
    passedInvariantCount,
    totalInvariantCount: MASTER_RELEASE_INVARIANT_IDS.length,
    surfaceDecisions: surfaceDecisionsMutable,
    surfaceEvaluations,
    approvedSurfaces,
    blockedSurfaces,
    remediationActions,
    certificate,
  };
}

/** 마스터 출고 인증서의 SHA-256 무결성과 내부 일관성을 1문자 단위까지 검증한다. */
export function verifyMasterReleaseCertificateIntegrity(
  certificate: MasterReleaseCertificate,
): MasterReleaseCertificateIntegrityResult {
  const violations: string[] = [];

  if (certificate.schemaVersion !== "wave100-master-cert-v1") {
    violations.push("지원하지 않는 인증서 스키마 버전");
  }
  if (!/^[0-9a-f]{64}$/.test(certificate.certificateSha256)) {
    violations.push("SHA-256 서명 형식 오류");
  }
  if (certificate.waveCoverageCount !== certificate.waveCoverage.length) {
    violations.push("waveCoverageCount와 waveCoverage 길이 불일치");
  }

  let actualApprovedCount = 0;
  for (let i = 0; i < RELEASE_SURFACE_TARGETS.length; i += 1) {
    const target = RELEASE_SURFACE_TARGETS[i];
    if (certificate.surfaceDecisions[target] === "RELEASE_APPROVED") {
      actualApprovedCount += 1;
    }
  }
  if (
    certificate.totalSurfaceCount === RELEASE_SURFACE_TARGETS.length &&
    certificate.approvedSurfaceCount !== actualApprovedCount
  ) {
    violations.push("approvedSurfaceCount와 surfaceDecisions 불일치");
  }

  if (certificate.masterDecision === "APPROVED") {
    for (let i = 0; i < MASTER_RELEASE_INVARIANT_IDS.length; i += 1) {
      const invId = MASTER_RELEASE_INVARIANT_IDS[i];
      if (!certificate.invariants[invId]) {
        violations.push(`APPROVED 판정이나 필수 불변식(${invId})이 false`);
      }
    }
    if (certificate.approvedSurfaceCount !== certificate.totalSurfaceCount) {
      violations.push("APPROVED 판정이나 모든 대상 서피스가 승인되지 않음");
    }
  }

  const expectedSha256 = sha256Wave100Hex(buildUnsignedCertificatePayload(certificate));
  if (expectedSha256 !== certificate.certificateSha256) {
    violations.push("인증서 본문 SHA-256 해시 불일치(위변조 감지)");
  }

  const valid = violations.length === 0;
  return {
    valid,
    expectedSha256,
    actualSha256: certificate.certificateSha256,
    violations,
    reasonKo: valid
      ? "마스터 출고 인증서 SHA-256 서명과 내부 불변식이 모두 일치합니다."
      : `인증서 무결성 검증 실패: ${violations.join("; ")}`,
  };
}
