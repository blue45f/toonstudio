/**
 * Wave 150 마일스톤 — 스냅샷 입력 정규화·검증, 입력 슬라이스 해석 및 기본 게이트 평가기.
 *
 * - 8대 스냅샷 해시와 에피소드 식별자를 fail-closed로 검증한다.
 * - 게이트별 입력 슬라이스와 신호(gateSignals)를 결정론적 구조로 변환하고 기본 품질 판정을 산출한다.
 */

import {
  ARTIFACT_HASH_KEYS,
  type EpisodePreflightArtifactSnapshot,
  type EpisodeReleaseScope,
  type GateSignalInput,
  type PreflightArtifactHashKey,
  type PreflightDagValidationError,
  type PreflightFinding,
  type PreflightFindingInput,
  type PreflightGateDefinition,
  type PreflightGateEvaluationOutput,
  type PreflightGateExecutionRecord,
} from "./preflight-dag-types";

const DEFAULT_RELEASE_SCOPE: EpisodeReleaseScope = {
  platforms: ["naver-webtoon", "kakao-webtoon", "ridi", "webtoon-global", "tapas"],
  locales: ["ko-KR"],
  distributionTierKo: "정기 연재 본편",
};

const ARTIFACT_KEY_SET: ReadonlySet<string> = new Set<string>(ARTIFACT_HASH_KEYS);

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function normalizeReleaseScope(scope?: EpisodeReleaseScope): EpisodeReleaseScope {
  const rawPlatforms = scope?.platforms ?? DEFAULT_RELEASE_SCOPE.platforms;
  const rawLocales = scope?.locales ?? DEFAULT_RELEASE_SCOPE.locales;
  const platforms = Array.from(
    new Set(rawPlatforms.map((item) => item.trim()).filter((item) => item.length > 0)),
  ).sort();
  const locales = Array.from(
    new Set(rawLocales.map((item) => item.trim()).filter((item) => item.length > 0)),
  ).sort();
  return {
    platforms: platforms.length > 0 ? platforms : [...DEFAULT_RELEASE_SCOPE.platforms],
    locales: locales.length > 0 ? locales : [...DEFAULT_RELEASE_SCOPE.locales],
    distributionTierKo:
      scope?.distributionTierKo && scope.distributionTierKo.trim().length > 0
        ? scope.distributionTierKo.trim()
        : DEFAULT_RELEASE_SCOPE.distributionTierKo,
  };
}

export function validateSnapshotInputs(
  snapshot: EpisodePreflightArtifactSnapshot,
): readonly PreflightDagValidationError[] {
  const errors: PreflightDagValidationError[] = [];
  if (typeof snapshot.episodeId !== "string" || snapshot.episodeId.trim().length === 0) {
    errors.push({
      code: "MISSING_EPISODE_ID",
      detailKo: "에피소드 식별자(episodeId)가 비어 있어 출고 파이프라인을 실행할 수 없습니다.",
    });
  }
  for (let i = 0; i < ARTIFACT_HASH_KEYS.length; i += 1) {
    const key = ARTIFACT_HASH_KEYS[i];
    if (key === undefined) continue;
    const rawValue = snapshot[key];
    if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
      errors.push({
        code: "INVALID_HASH_VALUE",
        detailKo: `입력 스냅샷 해시 '${key}'가 비어 있어 무결성 검증을 중단했습니다.`,
      });
    }
  }
  return errors;
}

export function resolveOwnArtifactSlicePayload(
  gate: PreflightGateDefinition,
  snapshot: EpisodePreflightArtifactSnapshot,
  releaseScope: EpisodeReleaseScope,
  strictZeroWarnings: boolean,
): unknown {
  const sliceKey = gate.artifactSliceKey;
  let sliceValue: unknown;

  if (sliceKey === "releaseScope") {
    sliceValue = {
      episodeId: snapshot.episodeId.trim(),
      revisionTag: (snapshot.revisionTag ?? "rev-1").trim(),
      releaseScope,
      strictZeroWarnings,
    };
  } else if (ARTIFACT_KEY_SET.has(sliceKey)) {
    const key = sliceKey as PreflightArtifactHashKey;
    sliceValue = snapshot[key];
  } else {
    sliceValue = snapshot.customArtifactHashes?.[sliceKey] ?? "";
  }

  return {
    gateId: gate.gateId,
    evaluatorVersion: gate.evaluatorVersion ?? "150.1.0",
    artifactSliceKey: sliceKey,
    sliceValue,
    signal: snapshot.gateSignals?.[gate.gateId] ?? null,
  };
}

export function normalizeFindings(
  gateId: string,
  rawFindings: readonly PreflightFindingInput[] | undefined,
): readonly PreflightFinding[] {
  if (!rawFindings || rawFindings.length === 0) return [];
  const normalized: PreflightFinding[] = [];
  for (let i = 0; i < rawFindings.length; i += 1) {
    const item = rawFindings[i];
    if (!item) continue;
    normalized.push({
      findingId:
        item.findingId && item.findingId.trim().length > 0
          ? item.findingId.trim()
          : `${gateId}:${item.code}:${i + 1}`,
      gateId,
      code: item.code.trim(),
      severity: item.severity,
      titleKo: item.titleKo.trim(),
      detailKo: item.detailKo.trim(),
      impactWeight: clampNumber(item.impactWeight ?? 1.0, 0.5, 3.0, 1.0),
      ...(item.cutIndex !== undefined ? { cutIndex: item.cutIndex } : {}),
      ...(item.assetRef !== undefined ? { assetRef: item.assetRef } : {}),
      ...(item.fixHintKo !== undefined ? { fixHintKo: item.fixHintKo } : {}),
    });
  }
  return normalized;
}

export function defaultEvaluatePreflightGate(
  gate: PreflightGateDefinition,
  signal: GateSignalInput | undefined,
  strictZeroWarnings: boolean,
  alreadyEvaluatedRecords: readonly PreflightGateExecutionRecord[],
): PreflightGateEvaluationOutput {
  const signalFindings: PreflightFindingInput[] = signal?.findings ? [...signal.findings] : [];
  const baseMetrics: Record<string, number | string | boolean> = signal?.metrics
    ? { ...signal.metrics }
    : {};

  if (gate.gateId === "episode-release-passport") {
    let upstreamWarningCount = 0;
    const warningGateIds: string[] = [];
    for (let i = 0; i < alreadyEvaluatedRecords.length; i += 1) {
      const rec = alreadyEvaluatedRecords[i];
      if (rec && rec.status === "warning") {
        upstreamWarningCount += Math.max(1, rec.warningCount);
        warningGateIds.push(rec.gateId);
      }
    }
    const ownBlockers = signalFindings.filter((item) => item.severity === "blocker").length;
    const ownWarnings = signalFindings.filter((item) => item.severity === "warning").length;
    const totalWarnings = upstreamWarningCount + ownWarnings;

    baseMetrics.upstreamWarningGateCount = warningGateIds.length;
    baseMetrics.totalWarningCount = totalWarnings;
    baseMetrics.strictZeroWarnings = strictZeroWarnings;

    if (signal?.forcedStatus === "blocked" || ownBlockers > 0) {
      if (ownBlockers === 0) {
        signalFindings.push({
          code: "PASSPORT_FORCED_BLOCK",
          severity: "blocker",
          titleKo: "출고 여권 정책 차단",
          detailKo: "최종 출고 여권 게이트가 수동 차단 상태로 지정되었습니다.",
          fixHintKo: "출고 여권 차단 사유를 해소한 뒤 재검증하세요.",
        });
      }
      return {
        status: "blocked",
        metrics: baseMetrics,
        findings: signalFindings,
        durationMs: signal?.simulatedDurationMs ?? gate.estimatedComputeMs,
        summaryKo: signal?.summaryKo ?? "출고 여권 게이트에서 치명 오류가 감지되어 출고를 차단했습니다.",
      };
    }

    if (totalWarnings > 0 && strictZeroWarnings) {
      signalFindings.push({
        code: "STRICT_ZERO_WARNINGS_VIOLATION",
        severity: "blocker",
        titleKo: "엄격 무경고 정책 위반으로 출고 차단",
        detailKo: `경고 게이트 ${warningGateIds.length}건(${warningGateIds.join(", ") || "출고 여권"})이 남아 있어 엄격 무경고 정책에 따라 출고를 거부했습니다.`,
        fixHintKo: "모든 상류 경고를 해소하거나 표준 조건부 통과 정책으로 전환하세요.",
      });
      return {
        status: "blocked",
        metrics: baseMetrics,
        findings: signalFindings,
        durationMs: signal?.simulatedDurationMs ?? gate.estimatedComputeMs,
        summaryKo: `엄격 무경고 정책 적용 중 경고 ${totalWarnings}건이 남아 출고를 차단했습니다.`,
      };
    }

    if (signal?.forcedStatus === "warning" || totalWarnings > 0) {
      return {
        status: "warning",
        metrics: baseMetrics,
        findings: signalFindings,
        durationMs: signal?.simulatedDurationMs ?? gate.estimatedComputeMs,
        summaryKo:
          signal?.summaryKo ??
          `치명 차단 없이 경고 ${totalWarnings}건이 확인되어 조건부 통과 여권을 봉인했습니다.`,
      };
    }

    return {
      status: "passed",
      metrics: baseMetrics,
      findings: signalFindings,
      durationMs: signal?.simulatedDurationMs ?? gate.estimatedComputeMs,
      summaryKo: signal?.summaryKo ?? "전 게이트 무결점 통과를 확인하고 출고 여권을 봉인했습니다.",
    };
  }

  const blockerCount = signalFindings.filter((item) => item.severity === "blocker").length;
  const warningCount = signalFindings.filter((item) => item.severity === "warning").length;

  let status: "passed" | "warning" | "blocked" = "passed";
  if (signal?.forcedStatus === "blocked" || blockerCount > 0) {
    status = "blocked";
    if (blockerCount === 0) {
      signalFindings.push({
        code: `${gate.gateId.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_BLOCKED`,
        severity: "blocker",
        titleKo: `${gate.labelKo} 게이트 차단`,
        detailKo: `${gate.labelKo} 품질 기준을 충족하지 못해 출고 파이프라인을 차단했습니다.`,
        fixHintKo: `${gate.labelKo} 항목을 수정하고 증분 재검증을 실행하세요.`,
      });
    }
  } else if (signal?.forcedStatus === "warning" || warningCount > 0) {
    status = "warning";
    if (warningCount === 0) {
      signalFindings.push({
        code: `${gate.gateId.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_WARNING`,
        severity: "warning",
        titleKo: `${gate.labelKo} 품질 경고`,
        detailKo: `${gate.labelKo} 검수에서 경미한 주의 항목이 감지되었습니다.`,
        fixHintKo: "출고 전 총괄 PD 확인 후 필요 시 보정하세요.",
      });
    }
  }

  const defaultSummaryKo =
    status === "passed"
      ? `${gate.labelKo} 검수를 이상 없이 통과했습니다.`
      : status === "warning"
        ? `${gate.labelKo} 검수에서 경고 ${Math.max(1, warningCount)}건이 보고되었습니다.`
        : `${gate.labelKo} 검수에서 치명 차단 ${Math.max(1, blockerCount)}건이 감지되었습니다.`;

  return {
    status,
    metrics: baseMetrics,
    findings: signalFindings,
    durationMs: signal?.simulatedDurationMs ?? gate.estimatedComputeMs,
    summaryKo: signal?.summaryKo ?? defaultSummaryKo,
  };
}
