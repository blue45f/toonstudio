/**
 * Wave 150 마일스톤 — 에피소드 종단간(End-to-End) 자율 출고 파이프라인 DAG 오케스트레이터.
 *
 * - 증분 입력 해시 캐시(`effectiveInputDigest = SHA256(ownArtifactSliceHash + sorted(parentEffectiveDigests))`)로
 *   수정된 입력 슬라이스에 영향받는 최소 서브그래프만 재실행한다.
 * - 상류 게이트 차단 시 하류 게이트를 `skipped-upstream-blocked`로 자동 전파해 fail-closed로 출고를 거부한다.
 * - 근본 차단 트리아지 랭커와 FIPS 180-4 SHA-256 출고 여권 발급·검증기를 함께 노출한다.
 */

import { planPreflightDagTopology } from "./preflight-dag-topology";
import {
  defaultEvaluatePreflightGate,
  normalizeFindings,
  normalizeReleaseScope,
  resolveOwnArtifactSlicePayload,
  validateSnapshotInputs,
} from "./preflight-gate-evaluator";
import {
  buildFailClosedPreflightResult,
  rankCriticalPreflightBlockers,
  sealEpisodeReleasePassport,
  verifyEpisodeReleasePassport,
} from "./preflight-passport-and-triage";
import {
  sha256CanonicalPreflightPayload,
  sha256PreflightUtf8Hex,
} from "./preflight-sha256-and-canonical";
import {
  DEFAULT_EVALUATED_AT_ISO,
  EPISODE_RELEASE_PASSPORT_SCHEMA_VERSION,
  type EpisodePreflightArtifactSnapshot,
  type EpisodePreflightDagOptions,
  type EpisodePreflightDagResult,
  type PreflightCacheEfficiencyMetrics,
  type PreflightDagCacheSnapshot,
  type PreflightGateCacheEntry,
  type PreflightGateEvaluationOutput,
  type PreflightGateExecutionRecord,
  type PreflightGateStatus,
  type PreflightReleaseDecision,
} from "./preflight-dag-types";

export { rankCriticalPreflightBlockers, verifyEpisodeReleasePassport };

function readPreviousCacheEntry(
  previousRunCache:
    | PreflightDagCacheSnapshot
    | ReadonlyMap<string, PreflightGateCacheEntry>
    | undefined,
  gateId: string,
  topologySha256Hex: string,
): PreflightGateCacheEntry | undefined {
  if (!previousRunCache) return undefined;
  if (previousRunCache instanceof Map) {
    return previousRunCache.get(gateId);
  }
  const snapshotCache = previousRunCache as PreflightDagCacheSnapshot;
  if (snapshotCache.topologySha256Hex !== topologySha256Hex) {
    return undefined;
  }
  return snapshotCache.entries[gateId];
}

/**
 * 순수 결정론 함수로 에피소드 9대 출고 품질 게이트 DAG를 증분 실행하고 SHA-256 출고 여권을 발급한다.
 */
export function runEpisodePreflightDag(
  snapshot: EpisodePreflightArtifactSnapshot,
  options?: EpisodePreflightDagOptions,
): EpisodePreflightDagResult {
  const strictZeroWarnings = options?.strictZeroWarnings === true;
  const evaluatedAtIso =
    options?.evaluatedAtIso ?? snapshot.evaluatedAtIso ?? DEFAULT_EVALUATED_AT_ISO;
  const releaseScope = normalizeReleaseScope(snapshot.releaseScope);

  const topology = planPreflightDagTopology(options);
  const allErrors = [...topology.validationErrors, ...validateSnapshotInputs(snapshot)];

  if (!topology.valid || allErrors.length > 0) {
    return buildFailClosedPreflightResult({
      snapshot,
      topology,
      validationErrors: allErrors,
      strictZeroWarnings,
      evaluatedAtIso,
      releaseScope,
    });
  }

  const episodeId = snapshot.episodeId.trim();
  const episodeTitleKo = snapshot.episodeTitleKo?.trim() || episodeId;
  const revisionTag = snapshot.revisionTag?.trim() || "rev-1";

  const gateResults: PreflightGateExecutionRecord[] = [];
  const gateById: Record<string, PreflightGateExecutionRecord> = {};
  const effectiveDigestByGate: Record<string, string> = {};
  const nextCacheEntries: Record<string, PreflightGateCacheEntry> = {};

  for (let topoIdx = 0; topoIdx < topology.topologicalOrder.length; topoIdx += 1) {
    const gateId = topology.topologicalOrder[topoIdx];
    if (gateId === undefined) continue;
    const gate = topology.definitionsById[gateId];
    if (!gate) continue;

    const ownArtifactSliceHash = sha256CanonicalPreflightPayload(
      resolveOwnArtifactSlicePayload(gate, snapshot, releaseScope, strictZeroWarnings),
    );

    const sortedParents = [...gate.dependsOn].sort();
    const parentEffectiveDigests: Record<string, string> = {};
    const parentDigestTokens: string[] = [];
    const parentRecords: PreflightGateExecutionRecord[] = [];
    const blockedByGateIds: string[] = [];
    const rootBlockerSet = new Set<string>();

    for (let p = 0; p < sortedParents.length; p += 1) {
      const parentId = sortedParents[p];
      if (parentId === undefined) continue;
      const parentDigest = effectiveDigestByGate[parentId] ?? "";
      parentEffectiveDigests[parentId] = parentDigest;
      parentDigestTokens.push(`${parentId}:${parentDigest}`);
      const parentRec = gateById[parentId];
      if (parentRec) {
        parentRecords.push(parentRec);
        if (parentRec.status === "blocked") {
          blockedByGateIds.push(parentId);
          rootBlockerSet.add(parentId);
        } else if (parentRec.status === "skipped-upstream-blocked") {
          blockedByGateIds.push(parentId);
          for (let r = 0; r < parentRec.rootBlockerGateIds.length; r += 1) {
            const rootId = parentRec.rootBlockerGateIds[r];
            if (rootId !== undefined) rootBlockerSet.add(rootId);
          }
        }
      }
    }

    const effectiveInputDigest = sha256PreflightUtf8Hex(
      `${ownArtifactSliceHash}|${parentDigestTokens.join(",")}`,
    );
    effectiveDigestByGate[gateId] = effectiveInputDigest;

    const layerDepth = topology.layerDepthByGate[gateId] ?? 0;
    const downstreamGateIds = topology.downstreamAdjacency[gateId] ?? [];
    const transitiveDownstreamCount = (topology.transitiveDownstreamByGate[gateId] ?? []).length;

    if (blockedByGateIds.length > 0) {
      const rootBlockerGateIds = Array.from(rootBlockerSet).sort();
      const skippedRecord: PreflightGateExecutionRecord = {
        gateId,
        labelKo: gate.labelKo,
        shortLabelKo: gate.shortLabelKo,
        categoryKo: gate.categoryKo,
        layerDepth,
        topologicalIndex: topoIdx,
        dependsOn: gate.dependsOn,
        downstreamGateIds,
        transitiveDownstreamCount,
        status: "skipped-upstream-blocked",
        cacheDisposition: "skipped-upstream-blocked",
        ownArtifactSliceHash,
        effectiveInputDigest,
        parentEffectiveDigests,
        baselineDurationMs: gate.estimatedComputeMs,
        computedDurationMs: 0,
        savedDurationMs: 0,
        metrics: { skippedByUpstreamBlock: true },
        findings: [],
        blockerCount: 0,
        warningCount: 0,
        blockedByGateIds,
        rootBlockerGateIds,
        summaryKo: `상류 게이트 차단(${rootBlockerGateIds.join(", ")})으로 실행을 자동 생략했습니다.`,
      };
      gateResults.push(skippedRecord);
      gateById[gateId] = skippedRecord;
      continue;
    }

    const cachedEntry = readPreviousCacheEntry(
      options?.previousRunCache,
      gateId,
      topology.topologySha256Hex,
    );

    if (cachedEntry && cachedEntry.effectiveInputDigest === effectiveInputDigest) {
      const hitRecord: PreflightGateExecutionRecord = {
        gateId,
        labelKo: gate.labelKo,
        shortLabelKo: gate.shortLabelKo,
        categoryKo: gate.categoryKo,
        layerDepth,
        topologicalIndex: topoIdx,
        dependsOn: gate.dependsOn,
        downstreamGateIds,
        transitiveDownstreamCount,
        status: cachedEntry.status,
        cacheDisposition: "cache-hit",
        ownArtifactSliceHash,
        effectiveInputDigest,
        parentEffectiveDigests,
        baselineDurationMs: cachedEntry.baselineDurationMs,
        computedDurationMs: 0,
        savedDurationMs: cachedEntry.baselineDurationMs,
        metrics: { ...cachedEntry.metrics },
        findings: cachedEntry.findings,
        blockerCount: cachedEntry.findings.filter((f) => f.severity === "blocker").length,
        warningCount: cachedEntry.findings.filter((f) => f.severity === "warning").length,
        blockedByGateIds: [],
        rootBlockerGateIds: [],
        summaryKo: cachedEntry.summaryKo,
      };
      gateResults.push(hitRecord);
      gateById[gateId] = hitRecord;
      nextCacheEntries[gateId] = cachedEntry;
      continue;
    }

    const signal = snapshot.gateSignals?.[gateId];
    const customEvaluator = options?.gateEvaluators?.[gateId];

    let evaluation: PreflightGateEvaluationOutput;
    if (customEvaluator) {
      try {
        evaluation = customEvaluator({
          gate,
          snapshot,
          signal,
          ownArtifactSliceHash,
          effectiveInputDigest,
          strictZeroWarnings,
          parentRecords,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        evaluation = {
          status: "blocked",
          metrics: { evaluatorException: true },
          findings: [
            {
              code: "GATE_EVALUATOR_EXCEPTION",
              severity: "blocker",
              titleKo: `${gate.labelKo} 평가기 실행 오류`,
              detailKo: `게이트 평가 중 예외가 발생해 fail-closed로 차단했습니다: ${message}`,
              fixHintKo: "게이트 입력 데이터와 평가기 구현을 점검한 뒤 재실행하세요.",
            },
          ],
          durationMs: gate.estimatedComputeMs,
          summaryKo: `${gate.labelKo} 평가기 예외로 출고 파이프라인을 차단했습니다.`,
        };
      }
    } else {
      evaluation = defaultEvaluatePreflightGate(gate, signal, strictZeroWarnings, gateResults);
    }

    const findings = normalizeFindings(gateId, evaluation.findings);
    const blockerCount = findings.filter((f) => f.severity === "blocker").length;
    const warningCount = findings.filter((f) => f.severity === "warning").length;
    const resolvedStatus: "passed" | "warning" | "blocked" =
      evaluation.status === "blocked" || blockerCount > 0
        ? "blocked"
        : evaluation.status === "warning" || warningCount > 0
          ? "warning"
          : "passed";
    const computedDurationMs = Math.max(
      0,
      Math.round(
        Number.isFinite(evaluation.durationMs ?? gate.estimatedComputeMs)
          ? (evaluation.durationMs ?? gate.estimatedComputeMs)
          : gate.estimatedComputeMs,
      ),
    );
    const metrics = evaluation.metrics ? { ...evaluation.metrics } : {};
    const summaryKo =
      evaluation.summaryKo?.trim() || `${gate.labelKo} 게이트 검증을 완료했습니다.`;

    const executedRecord: PreflightGateExecutionRecord = {
      gateId,
      labelKo: gate.labelKo,
      shortLabelKo: gate.shortLabelKo,
      categoryKo: gate.categoryKo,
      layerDepth,
      topologicalIndex: topoIdx,
      dependsOn: gate.dependsOn,
      downstreamGateIds,
      transitiveDownstreamCount,
      status: resolvedStatus,
      cacheDisposition: "cache-miss",
      ownArtifactSliceHash,
      effectiveInputDigest,
      parentEffectiveDigests,
      baselineDurationMs: computedDurationMs,
      computedDurationMs,
      savedDurationMs: 0,
      metrics,
      findings,
      blockerCount,
      warningCount,
      blockedByGateIds: [],
      rootBlockerGateIds: [],
      summaryKo,
    };

    gateResults.push(executedRecord);
    gateById[gateId] = executedRecord;
    nextCacheEntries[gateId] = {
      gateId,
      effectiveInputDigest,
      ownArtifactSliceHash,
      status: resolvedStatus,
      baselineDurationMs: computedDurationMs,
      metrics,
      findings,
      summaryKo,
    };
  }

  let passedGateCount = 0;
  let warningGateCount = 0;
  let blockedGateCount = 0;
  let skippedGateCount = 0;
  let cacheHitCount = 0;
  let cacheMissCount = 0;
  let estimatedFullDurationMs = 0;
  let actualExecutedDurationMs = 0;
  let savedDurationMs = 0;

  const gateDigestMap: Record<string, string> = {};
  const gateStatusMap: Record<string, PreflightGateStatus> = {};

  for (let i = 0; i < gateResults.length; i += 1) {
    const rec = gateResults[i];
    if (!rec) continue;
    gateDigestMap[rec.gateId] = rec.effectiveInputDigest;
    gateStatusMap[rec.gateId] = rec.status;
    estimatedFullDurationMs += rec.baselineDurationMs;
    actualExecutedDurationMs += rec.computedDurationMs;
    savedDurationMs += rec.savedDurationMs;

    if (rec.status === "passed") passedGateCount += 1;
    else if (rec.status === "warning") warningGateCount += 1;
    else if (rec.status === "blocked") blockedGateCount += 1;
    else skippedGateCount += 1;

    if (rec.cacheDisposition === "cache-hit") cacheHitCount += 1;
    else if (rec.cacheDisposition === "cache-miss") cacheMissCount += 1;
  }

  let releaseDecision: PreflightReleaseDecision = "approved";
  if (blockedGateCount > 0 || skippedGateCount > 0) {
    releaseDecision = "blocked";
  } else if (warningGateCount > 0) {
    releaseDecision = strictZeroWarnings ? "blocked" : "conditional-pass";
  }
  const releaseApproved = releaseDecision === "approved";

  const totalGateCount = gateResults.length;
  const cacheMetrics: PreflightCacheEfficiencyMetrics = {
    totalGateCount,
    cacheHitCount,
    cacheMissCount,
    skippedCount: skippedGateCount,
    hitRateRatio:
      totalGateCount > 0 ? Math.round((cacheHitCount / totalGateCount) * 10000) / 10000 : 0,
    estimatedFullDurationMs,
    actualExecutedDurationMs,
    savedDurationMs,
    timeSavedRatio:
      estimatedFullDurationMs > 0
        ? Math.round((savedDurationMs / estimatedFullDurationMs) * 10000) / 10000
        : 0,
  };

  const criticalBlockers = rankCriticalPreflightBlockers(
    gateResults,
    topology,
    strictZeroWarnings,
  );

  const snapshotInputDigest = sha256CanonicalPreflightPayload({
    episodeId,
    revisionTag,
    releaseScope,
    layersHash: snapshot.layersHash,
    continuityHash: snapshot.continuityHash,
    compositionHash: snapshot.compositionHash,
    dialogueHash: snapshot.dialogueHash,
    themeSettingsHash: snapshot.themeSettingsHash,
    rightsBomHash: snapshot.rightsBomHash,
    platformTargetsHash: snapshot.platformTargetsHash,
    watermarkPolicyHash: snapshot.watermarkPolicyHash,
    customArtifactHashes: snapshot.customArtifactHashes ?? {},
  });

  const passportId = `ERP-${sha256PreflightUtf8Hex(`${episodeId}:${revisionTag}:${snapshotInputDigest}:${releaseDecision}`).slice(0, 12).toUpperCase()}`;

  const passport = sealEpisodeReleasePassport({
    schemaVersion: EPISODE_RELEASE_PASSPORT_SCHEMA_VERSION,
    passportId,
    episodeId,
    episodeTitleKo,
    revisionTag,
    issuedAtIso: evaluatedAtIso,
    releaseDecision,
    releaseApproved,
    strictZeroWarnings,
    releaseScope,
    dagTopologyDigest: topology.topologySha256Hex,
    snapshotInputDigest,
    gateDigestMap,
    gateStatusMap,
    passedGateCount,
    warningGateCount,
    blockedGateCount,
    skippedGateCount,
    cacheHitCount,
    cacheMissCount,
  });

  const nextCache: PreflightDagCacheSnapshot = {
    schemaVersion: EPISODE_RELEASE_PASSPORT_SCHEMA_VERSION,
    topologySha256Hex: topology.topologySha256Hex,
    entries: nextCacheEntries,
  };

  const dagRunSha256Hex = sha256CanonicalPreflightPayload({
    ok: true,
    episodeId,
    revisionTag,
    evaluatedAtIso,
    releaseDecision,
    passportSha256Hex: passport.passportSha256Hex,
    cacheMetrics,
    criticalBlockerIds: criticalBlockers.map((item) => item.findingId),
  });

  return {
    ok: true,
    cycleDetected: false,
    cyclePathGateIds: [],
    validationErrors: [],
    episodeId,
    episodeTitleKo,
    revisionTag,
    evaluatedAtIso,
    strictZeroWarnings,
    releaseDecision,
    releaseApproved,
    topology,
    topologicalOrder: topology.topologicalOrder,
    gateResults,
    gateById,
    cacheMetrics,
    criticalBlockers,
    passport,
    nextCache,
    dagRunSha256Hex,
  };
}

/**
 * 에피소드 반복 검수 세션 동안 증분 입력 해시 캐시를 유지·재사용하는 상태 보유 DAG 오케스트레이터.
 */
export class EpisodePreflightDagOrchestrator {
  private readonly baseOptions: Omit<EpisodePreflightDagOptions, "previousRunCache">;
  private latestCache: PreflightDagCacheSnapshot | undefined;
  private runCount = 0;

  public constructor(options?: Omit<EpisodePreflightDagOptions, "previousRunCache">) {
    this.baseOptions = options ? { ...options } : {};
  }

  public run(
    snapshot: EpisodePreflightArtifactSnapshot,
    overrideOptions?: Partial<Omit<EpisodePreflightDagOptions, "previousRunCache">>,
  ): EpisodePreflightDagResult {
    const result = runEpisodePreflightDag(snapshot, {
      ...this.baseOptions,
      ...overrideOptions,
      previousRunCache: this.latestCache,
    });
    if (result.ok) {
      this.latestCache = result.nextCache;
    }
    this.runCount += 1;
    return result;
  }

  public getRunCount(): number {
    return this.runCount;
  }

  public exportCache(): PreflightDagCacheSnapshot | undefined {
    if (!this.latestCache) return undefined;
    const copiedEntries: Record<string, PreflightGateCacheEntry> = {};
    const keys = Object.keys(this.latestCache.entries);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (key === undefined) continue;
      const entry = this.latestCache.entries[key];
      if (entry) copiedEntries[key] = { ...entry };
    }
    return {
      schemaVersion: this.latestCache.schemaVersion,
      topologySha256Hex: this.latestCache.topologySha256Hex,
      entries: copiedEntries,
    };
  }

  public importCache(cacheSnapshot: PreflightDagCacheSnapshot | undefined): void {
    this.latestCache = cacheSnapshot;
  }

  public clearCache(): void {
    this.latestCache = undefined;
  }
}
