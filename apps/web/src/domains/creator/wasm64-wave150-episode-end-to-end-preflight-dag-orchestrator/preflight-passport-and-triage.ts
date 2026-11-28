/**
 * Wave 150 마일스톤 — 근본 차단 트리아지 랭커 및 FIPS 180-4 SHA-256 출고 여권 봉인·검증기.
 *
 * - 하류 차단 파급 범위(Downstream Blast Radius) × 심각도 순으로 수정 우선순위를 산출한다.
 * - 출고 여권 페이로드를 순수 ES2017 SHA-256으로 봉인하고, 1바이트 위변조 및 정책 모순을 탐지한다.
 */

import {
  constantTimeHexEquals,
  isValidSha256Hex,
  sha256CanonicalPreflightPayload,
  sha256PreflightUtf8Hex,
} from "./preflight-sha256-and-canonical";
import {
  EPISODE_RELEASE_PASSPORT_SCHEMA_VERSION,
  type CriticalBlockerTriageItem,
  type EpisodePreflightArtifactSnapshot,
  type EpisodePreflightDagResult,
  type EpisodeReleasePassport,
  type EpisodeReleasePassportPayload,
  type EpisodeReleaseScope,
  type PassportVerificationResult,
  type PreflightCacheEfficiencyMetrics,
  type PreflightDagCacheSnapshot,
  type PreflightDagValidationError,
  type PreflightFinding,
  type PreflightGateExecutionRecord,
  type PreflightTopologyPlan,
} from "./preflight-dag-types";

/**
 * 하류 차단 파급 범위(Downstream Blast Radius) × 심각도 순으로
 * 가장 먼저 고쳐야 할 근본 차단 항목을 결정론적으로 정렬한다.
 */
export function rankCriticalPreflightBlockers(
  gateResults: readonly PreflightGateExecutionRecord[],
  topology: PreflightTopologyPlan,
  strictZeroWarnings = false,
): readonly CriticalBlockerTriageItem[] {
  interface RawCandidate {
    readonly gateId: string;
    readonly gateLabelKo: string;
    readonly layerDepth: number;
    readonly finding: PreflightFinding;
    readonly severity: "blocker" | "warning";
    readonly promotedByStrictPolicy: boolean;
    readonly directDownstreamCount: number;
    readonly transitiveBlastRadius: number;
    readonly impactedGateIds: readonly string[];
    readonly priorityScore: number;
  }

  const candidates: RawCandidate[] = [];

  for (let i = 0; i < gateResults.length; i += 1) {
    const rec = gateResults[i];
    if (!rec || rec.status === "skipped-upstream-blocked") continue;

    const impacted = topology.transitiveDownstreamByGate[rec.gateId] ?? [];
    const directDownstream = topology.downstreamAdjacency[rec.gateId] ?? [];
    const blastRadius = impacted.length;

    for (let j = 0; j < rec.findings.length; j += 1) {
      const finding = rec.findings[j];
      if (!finding) continue;
      if (finding.severity === "blocker") {
        const score = Math.round(100 * (1 + blastRadius) * finding.impactWeight * 10) / 10;
        candidates.push({
          gateId: rec.gateId,
          gateLabelKo: rec.labelKo,
          layerDepth: rec.layerDepth,
          finding,
          severity: "blocker",
          promotedByStrictPolicy: false,
          directDownstreamCount: directDownstream.length,
          transitiveBlastRadius: blastRadius,
          impactedGateIds: impacted,
          priorityScore: score,
        });
      } else if (finding.severity === "warning" && strictZeroWarnings) {
        const score = Math.round(60 * (1 + blastRadius) * finding.impactWeight * 10) / 10;
        candidates.push({
          gateId: rec.gateId,
          gateLabelKo: rec.labelKo,
          layerDepth: rec.layerDepth,
          finding,
          severity: "warning",
          promotedByStrictPolicy: true,
          directDownstreamCount: directDownstream.length,
          transitiveBlastRadius: blastRadius,
          impactedGateIds: impacted,
          priorityScore: score,
        });
      }
    }
  }

  candidates.sort((left, right) => {
    const leftIsHard = left.severity === "blocker" ? 0 : 1;
    const rightIsHard = right.severity === "blocker" ? 0 : 1;
    if (leftIsHard !== rightIsHard) return leftIsHard - rightIsHard;
    if (right.priorityScore !== left.priorityScore) return right.priorityScore - left.priorityScore;
    if (right.transitiveBlastRadius !== left.transitiveBlastRadius) {
      return right.transitiveBlastRadius - left.transitiveBlastRadius;
    }
    if (left.layerDepth !== right.layerDepth) return left.layerDepth - right.layerDepth;
    if (left.gateId !== right.gateId) return left.gateId < right.gateId ? -1 : 1;
    return left.finding.findingId < right.finding.findingId
      ? -1
      : left.finding.findingId > right.finding.findingId
        ? 1
        : 0;
  });

  return candidates.map((item, idx) => ({
    rank: idx + 1,
    gateId: item.gateId,
    gateLabelKo: item.gateLabelKo,
    layerDepth: item.layerDepth,
    findingId: item.finding.findingId,
    code: item.finding.code,
    severity: item.severity,
    promotedByStrictPolicy: item.promotedByStrictPolicy,
    titleKo: item.finding.titleKo,
    detailKo: item.finding.detailKo,
    ...(item.finding.fixHintKo !== undefined ? { fixHintKo: item.finding.fixHintKo } : {}),
    ...(item.finding.cutIndex !== undefined ? { cutIndex: item.finding.cutIndex } : {}),
    ...(item.finding.assetRef !== undefined ? { assetRef: item.finding.assetRef } : {}),
    directDownstreamCount: item.directDownstreamCount,
    transitiveBlastRadius: item.transitiveBlastRadius,
    impactedGateIds: item.impactedGateIds,
    priorityScore: item.priorityScore,
  }));
}

/**
 * 출고 여권 페이로드를 순수 FIPS 180-4 SHA-256으로 봉인한다.
 */
export function sealEpisodeReleasePassport(
  payload: EpisodeReleasePassportPayload,
): EpisodeReleasePassport {
  return {
    ...payload,
    passportSha256Hex: sha256CanonicalPreflightPayload(payload),
  };
}

/**
 * 발급된 에피소드 출고 여권의 SHA-256 봉인 무결성과 정책 일관성을 검증한다.
 * 페이로드 또는 해시가 1바이트라도 변조되면 `valid: false`를 반환한다.
 */
export function verifyEpisodeReleasePassport(
  passport: EpisodeReleasePassport,
): PassportVerificationResult {
  const mismatchReasonsKo: string[] = [];

  if (passport.schemaVersion !== EPISODE_RELEASE_PASSPORT_SCHEMA_VERSION) {
    mismatchReasonsKo.push(
      `지원하지 않는 출고 여권 스키마 버전입니다(${String(passport.schemaVersion)}).`,
    );
  }

  const reconstructedPayload: EpisodeReleasePassportPayload = {
    schemaVersion: passport.schemaVersion,
    passportId: passport.passportId,
    episodeId: passport.episodeId,
    episodeTitleKo: passport.episodeTitleKo,
    revisionTag: passport.revisionTag,
    issuedAtIso: passport.issuedAtIso,
    releaseDecision: passport.releaseDecision,
    releaseApproved: passport.releaseApproved,
    strictZeroWarnings: passport.strictZeroWarnings,
    releaseScope: passport.releaseScope,
    dagTopologyDigest: passport.dagTopologyDigest,
    snapshotInputDigest: passport.snapshotInputDigest,
    gateDigestMap: passport.gateDigestMap,
    gateStatusMap: passport.gateStatusMap,
    passedGateCount: passport.passedGateCount,
    warningGateCount: passport.warningGateCount,
    blockedGateCount: passport.blockedGateCount,
    skippedGateCount: passport.skippedGateCount,
    cacheHitCount: passport.cacheHitCount,
    cacheMissCount: passport.cacheMissCount,
  };

  const expectedSha256Hex = sha256CanonicalPreflightPayload(reconstructedPayload);
  const actualSha256Hex =
    typeof passport.passportSha256Hex === "string" ? passport.passportSha256Hex : "";

  if (!isValidSha256Hex(actualSha256Hex)) {
    mismatchReasonsKo.push("출고 여권 SHA-256 봉인 해시 형식이 올바르지 않습니다.");
  } else if (!constantTimeHexEquals(expectedSha256Hex, actualSha256Hex)) {
    mismatchReasonsKo.push(
      "출고 여권 페이로드와 SHA-256 봉인 해시가 일치하지 않습니다(위변조 감지).",
    );
  }

  const expectedApproved = passport.releaseDecision === "approved";
  if (passport.releaseApproved !== expectedApproved) {
    mismatchReasonsKo.push(
      "출고 승인 플래그(releaseApproved)와 판정 상태(releaseDecision)가 모순됩니다.",
    );
  }

  const gateStatuses = Object.values(passport.gateStatusMap);
  if (gateStatuses.length > 0) {
    let passed = 0;
    let warning = 0;
    let blocked = 0;
    let skipped = 0;
    for (let i = 0; i < gateStatuses.length; i += 1) {
      const st = gateStatuses[i];
      if (st === "passed") passed += 1;
      else if (st === "warning") warning += 1;
      else if (st === "blocked") blocked += 1;
      else if (st === "skipped-upstream-blocked") skipped += 1;
    }
    if (
      passed !== passport.passedGateCount ||
      warning !== passport.warningGateCount ||
      blocked !== passport.blockedGateCount ||
      skipped !== passport.skippedGateCount
    ) {
      mismatchReasonsKo.push("게이트 상태 집계 수치가 게이트별 상태 맵과 일치하지 않습니다.");
    }
    if (passport.releaseDecision === "approved" && (blocked > 0 || skipped > 0 || warning > 0)) {
      mismatchReasonsKo.push("차단·생략·경고 게이트가 존재하는데 출고 승인 상태로 기록되었습니다.");
    }
    if (
      passport.releaseDecision === "conditional-pass" &&
      (blocked > 0 || skipped > 0 || passport.strictZeroWarnings)
    ) {
      mismatchReasonsKo.push("조건부 통과 판정이 차단 게이트 또는 엄격 무경고 정책과 충돌합니다.");
    }
  } else if (passport.releaseDecision !== "blocked") {
    mismatchReasonsKo.push("검증된 게이트 기록이 없는 여권은 출고 승인·조건부 통과가 될 수 없습니다.");
  }

  const valid = mismatchReasonsKo.length === 0;
  return {
    valid,
    expectedSha256Hex,
    actualSha256Hex,
    mismatchReasonsKo,
    releaseApproved: valid && passport.releaseApproved,
  };
}

/**
 * 토폴로지 순환 또는 입력 계약 위반 시 fail-closed 차단 결과와 봉인 여권을 생성한다.
 */
export function buildFailClosedPreflightResult(params: {
  readonly snapshot: EpisodePreflightArtifactSnapshot;
  readonly topology: PreflightTopologyPlan;
  readonly validationErrors: readonly PreflightDagValidationError[];
  readonly strictZeroWarnings: boolean;
  readonly evaluatedAtIso: string;
  readonly releaseScope: EpisodeReleaseScope;
}): EpisodePreflightDagResult {
  const { snapshot, topology, validationErrors, strictZeroWarnings, evaluatedAtIso, releaseScope } =
    params;
  const episodeId = snapshot.episodeId.trim() || "unknown-episode";
  const episodeTitleKo = snapshot.episodeTitleKo?.trim() || episodeId;
  const revisionTag = snapshot.revisionTag?.trim() || "rev-1";
  const snapshotInputDigest = sha256CanonicalPreflightPayload({
    episodeId,
    revisionTag,
    releaseScope,
    layersHash: snapshot.layersHash ?? "",
    continuityHash: snapshot.continuityHash ?? "",
    compositionHash: snapshot.compositionHash ?? "",
    dialogueHash: snapshot.dialogueHash ?? "",
    themeSettingsHash: snapshot.themeSettingsHash ?? "",
    rightsBomHash: snapshot.rightsBomHash ?? "",
    platformTargetsHash: snapshot.platformTargetsHash ?? "",
    watermarkPolicyHash: snapshot.watermarkPolicyHash ?? "",
    customArtifactHashes: snapshot.customArtifactHashes ?? {},
  });

  const passportId = `ERP-${sha256PreflightUtf8Hex(`${episodeId}:${revisionTag}:${topology.topologySha256Hex}:blocked`).slice(0, 12).toUpperCase()}`;

  const passport = sealEpisodeReleasePassport({
    schemaVersion: EPISODE_RELEASE_PASSPORT_SCHEMA_VERSION,
    passportId,
    episodeId,
    episodeTitleKo,
    revisionTag,
    issuedAtIso: evaluatedAtIso,
    releaseDecision: "blocked",
    releaseApproved: false,
    strictZeroWarnings,
    releaseScope,
    dagTopologyDigest: topology.topologySha256Hex,
    snapshotInputDigest,
    gateDigestMap: {},
    gateStatusMap: {},
    passedGateCount: 0,
    warningGateCount: 0,
    blockedGateCount: 0,
    skippedGateCount: 0,
    cacheHitCount: 0,
    cacheMissCount: 0,
  });

  const cacheMetrics: PreflightCacheEfficiencyMetrics = {
    totalGateCount: 0,
    cacheHitCount: 0,
    cacheMissCount: 0,
    skippedCount: 0,
    hitRateRatio: 0,
    estimatedFullDurationMs: 0,
    actualExecutedDurationMs: 0,
    savedDurationMs: 0,
    timeSavedRatio: 0,
  };

  const nextCache: PreflightDagCacheSnapshot = {
    schemaVersion: EPISODE_RELEASE_PASSPORT_SCHEMA_VERSION,
    topologySha256Hex: topology.topologySha256Hex,
    entries: {},
  };

  const dagRunSha256Hex = sha256CanonicalPreflightPayload({
    ok: false,
    cycleDetected: topology.cycleDetected,
    cyclePathGateIds: topology.cyclePathGateIds,
    validationErrors,
    passportSha256Hex: passport.passportSha256Hex,
  });

  return {
    ok: false,
    cycleDetected: topology.cycleDetected,
    cyclePathGateIds: topology.cyclePathGateIds,
    validationErrors,
    episodeId,
    episodeTitleKo,
    revisionTag,
    evaluatedAtIso,
    strictZeroWarnings,
    releaseDecision: "blocked",
    releaseApproved: false,
    topology,
    topologicalOrder: [],
    gateResults: [],
    gateById: {},
    cacheMetrics,
    criticalBlockers: [],
    passport,
    nextCache,
    dagRunSha256Hex,
  };
}
