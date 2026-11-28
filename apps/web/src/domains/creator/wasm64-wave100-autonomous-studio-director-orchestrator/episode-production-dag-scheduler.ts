/**
 * Wave 100 — 자율 에피소드 프로덕션 DAG 컴파일러, CPM 임계 경로 스케줄러, 재개 가능 체크포인트 런타임.
 *
 * - 순환 의존성을 DFS 경로 추적과 함께 즉시 차단(`ProductionDagCycleError`)하고,
 *   위상 정렬 병렬 웨이브 그룹핑과 정확한 CPM(Critical Path Method) 여유 시간(slack)을 계산한다.
 * - 마스터 에피소드 스냅샷을 깊은 복제·동결하여 스테이지 간 부수효과를 격리하며,
 *   성공한 스테이지 출력과 해시를 체크포인트로 직렬화해 차단 해소 후 캐시 재사용 재개를 지원한다.
 */

import {
  PipelineCheckpointIntegrityError,
  ProductionDagCycleError,
  ProductionDagValidationError,
  createCanonicalWebtoonProductionDag,
  createDefaultCanonicalStageOutcome,
  type CachedStageSnapshot,
  type CriticalPathSchedule,
  type CriticalPathStageTiming,
  type EpisodeMasterSnapshot,
  type EpisodeProductionRunReport,
  type ExecuteProductionPipelineRequest,
  type ParallelExecutionWave,
  type PipelineCheckpointSnapshot,
  type ProductionDagDefinition,
  type ProductionStageSpec,
  type ProductionStageStatus,
  type ResumeProductionPipelineRequest,
  type StageExecutionHandler,
  type StageExecutionRecord,
} from "./episode-production-dag-types-and-canonical";
import {
  canonicalizeWave100Json,
  computeWave100MerkleRootHex,
  sha256Wave100Hex,
} from "./wave100-sha256";

export * from "./episode-production-dag-types-and-canonical";

function deepCloneAndFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => deepCloneAndFreeze(item))) as unknown as T;
  }
  const source = value as Record<string, unknown>;
  const copy: Record<string, unknown> = {};
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i += 1) {
    copy[keys[i]] = deepCloneAndFreeze(source[keys[i]]);
  }
  return Object.freeze(copy) as T;
}

/** DAG 토폴로지 고유 SHA-256 해시를 계산한다. */
export function computeDagTopologySha256(dag: ProductionDagDefinition): string {
  return sha256Wave100Hex(
    canonicalizeWave100Json({
      dagId: dag.dagId,
      schemaVersion: dag.schemaVersion,
      stages: dag.stages.map((s) => ({
        id: s.id,
        phase: s.phase,
        dependsOn: s.dependsOn,
        estimatedDurationMs: s.estimatedDurationMs,
        criticalForRelease: s.criticalForRelease,
      })),
    }),
  );
}

function validateDagAndDetectCycles(dag: ProductionDagDefinition): {
  readonly stageById: Map<string, ProductionStageSpec>;
  readonly dependentsById: Map<string, string[]>;
} {
  if (dag.stages.length === 0) {
    throw new ProductionDagValidationError("프로덕션 DAG에는 최소 1개 이상의 스테이지가 필요합니다.");
  }

  const stageById = new Map<string, ProductionStageSpec>();
  const dependentsById = new Map<string, string[]>();

  for (let i = 0; i < dag.stages.length; i += 1) {
    const stage = dag.stages[i];
    if (!stage.id || stage.id.trim().length === 0) {
      throw new ProductionDagValidationError(`인덱스 ${i} 스테이지의 ID가 비어 있습니다.`);
    }
    if (stageById.has(stage.id)) {
      throw new ProductionDagValidationError(`중복된 스테이지 ID가 감지되었습니다: ${stage.id}`);
    }
    if (!Number.isFinite(stage.estimatedDurationMs) || stage.estimatedDurationMs < 0) {
      throw new ProductionDagValidationError(
        `스테이지 ${stage.id}의 예상 소요 시간(${String(stage.estimatedDurationMs)})이 유효하지 않습니다.`,
      );
    }
    stageById.set(stage.id, stage);
    dependentsById.set(stage.id, []);
  }

  for (let i = 0; i < dag.stages.length; i += 1) {
    const stage = dag.stages[i];
    for (let j = 0; j < stage.dependsOn.length; j += 1) {
      const depId = stage.dependsOn[j];
      if (!stageById.has(depId)) {
        throw new ProductionDagValidationError(
          `스테이지 ${stage.id}가 존재하지 않는 선행 스테이지(${depId})에 의존합니다.`,
        );
      }
      if (depId === stage.id) {
        throw new ProductionDagCycleError([stage.id, stage.id]);
      }
      dependentsById.get(depId)?.push(stage.id);
    }
  }

  // 3색 DFS(0: 미방문, 1: 탐색 중, 2: 완료)로 정확한 순환 경로를 검출한다.
  const visitState = new Map<string, number>();
  const stack: string[] = [];

  const dfs = (nodeId: string): void => {
    visitState.set(nodeId, 1);
    stack.push(nodeId);
    const dependents = dependentsById.get(nodeId) ?? [];
    for (let i = 0; i < dependents.length; i += 1) {
      const nextId = dependents[i];
      const nextState = visitState.get(nextId) ?? 0;
      if (nextState === 1) {
        throw new ProductionDagCycleError(stack.slice(stack.indexOf(nextId)).concat([nextId]));
      }
      if (nextState === 0) dfs(nextId);
    }
    stack.pop();
    visitState.set(nodeId, 2);
  };

  for (let i = 0; i < dag.stages.length; i += 1) {
    const id = dag.stages[i].id;
    if ((visitState.get(id) ?? 0) === 0) dfs(id);
  }

  return { stageById, dependentsById };
}

/** DAG를 위상 레벨(병렬 실행 가능 웨이브) 단위로 그룹핑한다. */
export function computeParallelExecutionWaves(
  dag: ProductionDagDefinition,
): readonly ParallelExecutionWave[] {
  const { stageById, dependentsById } = validateDagAndDetectCycles(dag);
  const inDegree = new Map<string, number>();
  const stageOrderIndex = new Map<string, number>();

  for (let i = 0; i < dag.stages.length; i += 1) {
    const stage = dag.stages[i];
    stageOrderIndex.set(stage.id, i);
    inDegree.set(stage.id, stage.dependsOn.length);
  }

  let currentWaveIds = dag.stages.filter((s) => s.dependsOn.length === 0).map((s) => s.id);
  const waves: ParallelExecutionWave[] = [];
  let waveIndex = 0;

  while (currentWaveIds.length > 0) {
    currentWaveIds.sort((a, b) => (stageOrderIndex.get(a) ?? 0) - (stageOrderIndex.get(b) ?? 0));
    let maxStageDurationMs = 0;
    const nextWaveSet = new Set<string>();

    for (let i = 0; i < currentWaveIds.length; i += 1) {
      const id = currentWaveIds[i];
      const stage = stageById.get(id);
      if (stage !== undefined && stage.estimatedDurationMs > maxStageDurationMs) {
        maxStageDurationMs = stage.estimatedDurationMs;
      }
      const dependents = dependentsById.get(id) ?? [];
      for (let j = 0; j < dependents.length; j += 1) {
        const depId = dependents[j];
        const remaining = (inDegree.get(depId) ?? 1) - 1;
        inDegree.set(depId, remaining);
        if (remaining === 0) nextWaveSet.add(depId);
      }
    }

    waves.push({
      waveIndex,
      stageIds: currentWaveIds.slice(),
      stageCount: currentWaveIds.length,
      maxStageDurationMs,
    });
    waveIndex += 1;
    currentWaveIds = Array.from(nextWaveSet);
  }

  return waves;
}

/** 정확한 CPM(Critical Path Method) 전진·후진 패스 스케줄과 병렬 가속비를 계산한다. */
export function computeCriticalPathSchedule(dag: ProductionDagDefinition): CriticalPathSchedule {
  const { stageById, dependentsById } = validateDagAndDetectCycles(dag);
  const parallelWaves = computeParallelExecutionWaves(dag);

  const topologicalOrder: string[] = [];
  const waveIndexById = new Map<string, number>();
  let maxConcurrentStages = 0;

  for (let w = 0; w < parallelWaves.length; w += 1) {
    const wave = parallelWaves[w];
    if (wave.stageCount > maxConcurrentStages) maxConcurrentStages = wave.stageCount;
    for (let i = 0; i < wave.stageIds.length; i += 1) {
      topologicalOrder.push(wave.stageIds[i]);
      waveIndexById.set(wave.stageIds[i], wave.waveIndex);
    }
  }

  // Forward Pass: ES, EF
  const earliestStart = new Map<string, number>();
  const earliestFinish = new Map<string, number>();
  let totalSerialMs = 0;
  let parallelWallClockMs = 0;

  for (let i = 0; i < topologicalOrder.length; i += 1) {
    const stage = stageById.get(topologicalOrder[i]);
    if (stage === undefined) continue;
    let es = 0;
    for (let j = 0; j < stage.dependsOn.length; j += 1) {
      const depEf = earliestFinish.get(stage.dependsOn[j]) ?? 0;
      if (depEf > es) es = depEf;
    }
    const ef = es + stage.estimatedDurationMs;
    earliestStart.set(stage.id, es);
    earliestFinish.set(stage.id, ef);
    totalSerialMs += stage.estimatedDurationMs;
    if (ef > parallelWallClockMs) parallelWallClockMs = ef;
  }

  // Backward Pass: LF, LS, Slack
  const latestStart = new Map<string, number>();
  const latestFinish = new Map<string, number>();

  for (let i = topologicalOrder.length - 1; i >= 0; i -= 1) {
    const stage = stageById.get(topologicalOrder[i]);
    if (stage === undefined) continue;
    const dependents = dependentsById.get(stage.id) ?? [];
    let lf = parallelWallClockMs;
    if (dependents.length > 0) {
      lf = Number.POSITIVE_INFINITY;
      for (let j = 0; j < dependents.length; j += 1) {
        const depLs = latestStart.get(dependents[j]) ?? parallelWallClockMs;
        if (depLs < lf) lf = depLs;
      }
    }
    latestFinish.set(stage.id, lf);
    latestStart.set(stage.id, lf - stage.estimatedDurationMs);
  }

  const stageTimings: Record<string, CriticalPathStageTiming> = {};
  const orderedTimings: CriticalPathStageTiming[] = [];
  const criticalPathStageIds: string[] = [];
  const nonCriticalStageIds: string[] = [];

  for (let i = 0; i < topologicalOrder.length; i += 1) {
    const stage = stageById.get(topologicalOrder[i]);
    if (stage === undefined) continue;
    const es = earliestStart.get(stage.id) ?? 0;
    const ef = earliestFinish.get(stage.id) ?? 0;
    const ls = latestStart.get(stage.id) ?? 0;
    const lf = latestFinish.get(stage.id) ?? 0;
    const slackMs = Math.max(0, Math.round((ls - es) * 1000) / 1000);
    const isCritical = slackMs === 0;

    const timing: CriticalPathStageTiming = {
      stageId: stage.id,
      phase: stage.phase,
      waveIndex: waveIndexById.get(stage.id) ?? 0,
      dependsOn: stage.dependsOn.slice(),
      durationMs: stage.estimatedDurationMs,
      earliestStartMs: es,
      earliestFinishMs: ef,
      latestStartMs: ls,
      latestFinishMs: lf,
      slackMs,
      isCritical,
    };
    stageTimings[stage.id] = timing;
    orderedTimings.push(timing);
    (isCritical ? criticalPathStageIds : nonCriticalStageIds).push(stage.id);
  }

  const parallelSpeedupRatio =
    parallelWallClockMs > 0 ? Math.round((totalSerialMs / parallelWallClockMs) * 10000) / 10000 : 1;

  return {
    dagId: dag.dagId,
    topologicalOrder,
    parallelWaves,
    maxConcurrentStages,
    stageTimings,
    orderedTimings,
    criticalPathStageIds,
    nonCriticalStageIds,
    totalSerialMs,
    parallelWallClockMs,
    parallelSpeedupRatio,
  };
}

function hashStageRecord(
  stageId: string,
  status: ProductionStageStatus,
  output: Readonly<Record<string, unknown>>,
  healedIssueCount: number,
  upstreamOutputHashes: Readonly<Record<string, string>>,
): string {
  return sha256Wave100Hex(
    canonicalizeWave100Json({ stageId, status, healedIssueCount, output, upstreamOutputHashes }),
  );
}

function collectWaveCoverage(dag: ProductionDagDefinition): readonly number[] {
  const waveSet = new Set<number>();
  for (let i = 0; i < dag.stages.length; i += 1) {
    for (let j = 0; j < dag.stages[i].sourceWaves.length; j += 1) {
      waveSet.add(dag.stages[i].sourceWaves[j]);
    }
  }
  return Array.from(waveSet).sort((a, b) => a - b);
}

function buildUnsignedCheckpointJson(
  payload: Omit<PipelineCheckpointSnapshot, "checkpointSha256">,
): string {
  return canonicalizeWave100Json({
    schemaVersion: payload.schemaVersion,
    checkpointId: payload.checkpointId,
    dagId: payload.dagId,
    dagTopologySha256: payload.dagTopologySha256,
    episodeId: payload.episodeId,
    episodeTitle: payload.episodeTitle,
    seriesId: payload.seriesId,
    masterRevision: payload.masterRevision,
    masterStateDigest: payload.masterStateDigest,
    exportedAtIso: payload.exportedAtIso,
    sourceRunId: payload.sourceRunId,
    cachedStages: payload.cachedStages,
    cachedStageOrder: payload.cachedStageOrder,
    blockedStageIdsAtExport: payload.blockedStageIdsAtExport,
  });
}

function runPipelineInternal(
  dag: ProductionDagDefinition,
  masterSnapshot: EpisodeMasterSnapshot,
  runId: string,
  executedAtIso: string,
  stageHandlers: Readonly<Partial<Record<string, StageExecutionHandler>>> | undefined,
  failFastOnBlock: boolean,
  checkpoint: PipelineCheckpointSnapshot | null,
  forceRerunStageIds: readonly string[],
): EpisodeProductionRunReport {
  const schedule = computeCriticalPathSchedule(dag);
  const dagTopologySha256 = computeDagTopologySha256(dag);
  const stageById = new Map<string, ProductionStageSpec>(dag.stages.map((s) => [s.id, s]));

  const masterDigestBefore = sha256Wave100Hex(canonicalizeWave100Json(masterSnapshot));
  const frozenMaster = deepCloneAndFreeze(masterSnapshot);
  const forceRerunSet = new Set<string>(forceRerunStageIds);

  const checkpointReusable =
    checkpoint !== null &&
    checkpoint.dagId === dag.dagId &&
    checkpoint.dagTopologySha256 === dagTopologySha256 &&
    checkpoint.episodeId === masterSnapshot.episodeId &&
    checkpoint.masterStateDigest === masterDigestBefore;

  const stages: StageExecutionRecord[] = [];
  const stagesById: Record<string, StageExecutionRecord> = {};
  const skippedCachedStages: string[] = [];
  const executedStageIds: string[] = [];
  const actualFinishMsById = new Map<string, number>();

  let passedStageCount = 0;
  let healedStageCount = 0;
  let blockedStageCount = 0;
  let skippedUpstreamBlockedCount = 0;
  let reusedCachedStageCount = 0;
  let actualSerialDurationMs = 0;
  let actualParallelWallClockMs = 0;
  let failFastTriggered = false;

  for (let i = 0; i < schedule.topologicalOrder.length; i += 1) {
    const stageId = schedule.topologicalOrder[i];
    const stage = stageById.get(stageId);
    const timing = schedule.stageTimings[stageId];
    if (stage === undefined || timing === undefined) continue;

    const upstreamBlockedBy: string[] = [];
    const upstreamOutputs: Record<string, Readonly<Record<string, unknown>>> = {};
    const upstreamOutputHashes: Record<string, string> = {};
    let upstreamFinishMaxMs = 0;

    for (let j = 0; j < stage.dependsOn.length; j += 1) {
      const depId = stage.dependsOn[j];
      const depRec = stagesById[depId];
      if (depRec === undefined || (depRec.status !== "passed" && depRec.status !== "healed-passed")) {
        upstreamBlockedBy.push(depId);
      } else {
        upstreamOutputs[depId] = depRec.output;
        upstreamOutputHashes[depId] = depRec.outputSha256;
        upstreamFinishMaxMs = Math.max(upstreamFinishMaxMs, actualFinishMsById.get(depId) ?? 0);
      }
    }

    const stageBase = {
      stageId: stage.id,
      phase: stage.phase,
      labelKo: stage.labelKo,
      waveIndex: timing.waveIndex,
      sourceWaves: stage.sourceWaves.slice(),
      estimatedDurationMs: stage.estimatedDurationMs,
      upstreamOutputHashes,
    };

    let record: StageExecutionRecord;

    if (upstreamBlockedBy.length > 0 || failFastTriggered) {
      const reasonIds = upstreamBlockedBy.length > 0 ? upstreamBlockedBy : ["fail-fast-halted"];
      const output = deepCloneAndFreeze({ skipped: true, blockedBy: reasonIds });
      record = {
        ...stageBase,
        status: "skipped-upstream-blocked",
        reusedFromCheckpoint: false,
        actualDurationMs: 0,
        healedIssueCount: 0,
        summaryKo: `선행 스테이지 차단(${reasonIds.join(", ")})으로 실행을 보류했습니다.`,
        output,
        outputSha256: hashStageRecord(stage.id, "skipped-upstream-blocked", output, 0, upstreamOutputHashes),
        blockingReasons: [],
        upstreamBlockedBy: reasonIds,
      };
      skippedUpstreamBlockedCount += 1;
      actualFinishMsById.set(stage.id, upstreamFinishMaxMs);
    } else {
      const cached =
        checkpointReusable && !forceRerunSet.has(stage.id)
          ? checkpoint?.cachedStages[stage.id]
          : undefined;
      const canReuseCache =
        cached !== undefined &&
        canonicalizeWave100Json(cached.upstreamOutputHashes) ===
          canonicalizeWave100Json(upstreamOutputHashes);

      if (cached !== undefined && canReuseCache) {
        record = {
          ...stageBase,
          status: cached.status,
          reusedFromCheckpoint: true,
          actualDurationMs: 0,
          healedIssueCount: cached.healedIssueCount,
          summaryKo: `[캐시 재사용] ${cached.summaryKo}`,
          output: deepCloneAndFreeze(cached.output),
          outputSha256: cached.outputSha256,
          blockingReasons: [],
          upstreamBlockedBy: [],
        };
        reusedCachedStageCount += 1;
        skippedCachedStages.push(stage.id);
        if (cached.status === "passed") passedStageCount += 1;
        else healedStageCount += 1;
        actualFinishMsById.set(stage.id, upstreamFinishMaxMs);
      } else {
        const handler = stageHandlers?.[stage.id] ?? createDefaultCanonicalStageOutcome;
        const outcome = handler({
          stage,
          masterSnapshot: frozenMaster,
          upstreamOutputs: deepCloneAndFreeze(upstreamOutputs),
          runId,
          attemptNumber: checkpoint === null ? 1 : 2,
        });
        const duration =
          outcome.actualDurationMs !== undefined && Number.isFinite(outcome.actualDurationMs) && outcome.actualDurationMs >= 0
            ? outcome.actualDurationMs
            : stage.estimatedDurationMs;
        const healedCount =
          outcome.healedIssueCount !== undefined && Number.isFinite(outcome.healedIssueCount) && outcome.healedIssueCount >= 0
            ? Math.floor(outcome.healedIssueCount)
            : 0;
        const frozenOutput = deepCloneAndFreeze(outcome.output ?? {});
        record = {
          ...stageBase,
          status: outcome.status,
          reusedFromCheckpoint: false,
          actualDurationMs: duration,
          healedIssueCount: healedCount,
          summaryKo: outcome.summaryKo,
          output: frozenOutput,
          outputSha256: hashStageRecord(stage.id, outcome.status, frozenOutput, healedCount, upstreamOutputHashes),
          blockingReasons: outcome.blockingReasons ? outcome.blockingReasons.slice() : [],
          upstreamBlockedBy: [],
        };
        executedStageIds.push(stage.id);
        actualSerialDurationMs += duration;
        const finishMs = upstreamFinishMaxMs + duration;
        actualFinishMsById.set(stage.id, finishMs);
        if (finishMs > actualParallelWallClockMs) actualParallelWallClockMs = finishMs;

        if (outcome.status === "passed") passedStageCount += 1;
        else if (outcome.status === "healed-passed") healedStageCount += 1;
        else {
          blockedStageCount += 1;
          if (failFastOnBlock) failFastTriggered = true;
        }
      }
    }

    stages.push(record);
    stagesById[stage.id] = record;
  }

  const masterDigestAfter = sha256Wave100Hex(canonicalizeWave100Json(masterSnapshot));
  const allStagesSucceeded =
    blockedStageCount === 0 &&
    skippedUpstreamBlockedCount === 0 &&
    passedStageCount + healedStageCount === stages.length;
  const allCriticalStagesSucceeded = dag.stages.every((spec) => {
    if (!spec.criticalForRelease) return true;
    const rec = stagesById[spec.id];
    return rec !== undefined && (rec.status === "passed" || rec.status === "healed-passed");
  });
  const merkleStageDigest = computeWave100MerkleRootHex(
    stages.map((s) => `${s.stageId}:${s.status}:${s.outputSha256}`),
  );
  const waveCoverage = collectWaveCoverage(dag);

  return {
    runId,
    dagId: dag.dagId,
    dagTopologySha256,
    episodeId: masterSnapshot.episodeId,
    episodeTitle: masterSnapshot.episodeTitle,
    seriesId: masterSnapshot.seriesId,
    masterRevision: masterSnapshot.masterRevision,
    masterStateDigest: masterDigestBefore,
    masterStateIsolated: masterDigestBefore === masterDigestAfter,
    executedAtIso,
    resumedFromCheckpointId: checkpoint !== null ? checkpoint.checkpointId : null,
    schedule,
    stageOrder: schedule.topologicalOrder,
    stages,
    stagesById,
    passedStageCount,
    healedStageCount,
    blockedStageCount,
    skippedUpstreamBlockedCount,
    reusedCachedStageCount,
    skippedCachedStages,
    executedStageIds,
    allStagesSucceeded,
    allCriticalStagesSucceeded,
    actualSerialDurationMs,
    actualParallelWallClockMs,
    merkleStageDigest,
    waveCoverage,
    waveCoverageCount: waveCoverage.length,
  };
}

/** 프로덕션 파이프라인을 위상 정렬 순서로 결정론적으로 실행한다. */
export function executeProductionPipeline(
  request: ExecuteProductionPipelineRequest,
): EpisodeProductionRunReport {
  const dag = request.dag ?? createCanonicalWebtoonProductionDag();
  const executedAtIso = request.executedAtIso ?? "2026-11-28T00:00:00Z";
  const runId =
    request.runId ??
    `run-${sha256Wave100Hex(`${dag.dagId}:${request.masterSnapshot.episodeId}:rev${request.masterSnapshot.masterRevision}:${executedAtIso}`).slice(0, 12)}`;
  return runPipelineInternal(
    dag,
    request.masterSnapshot,
    runId,
    executedAtIso,
    request.stageHandlers,
    request.failFastOnBlock === true,
    null,
    [],
  );
}

/** 완료된 스테이지 출력과 무결성 해시를 재개 가능한 체크포인트 스냅샷으로 내보낸다. */
export function exportPipelineCheckpoint(
  runReport: EpisodeProductionRunReport,
  exportedAtIso?: string,
): PipelineCheckpointSnapshot {
  const timestamp = exportedAtIso ?? runReport.executedAtIso;
  const cachedStages: Record<string, CachedStageSnapshot> = {};
  const cachedStageOrder: string[] = [];
  const blockedStageIdsAtExport: string[] = [];

  for (let i = 0; i < runReport.stages.length; i += 1) {
    const rec = runReport.stages[i];
    if (rec.status === "passed" || rec.status === "healed-passed") {
      cachedStageOrder.push(rec.stageId);
      cachedStages[rec.stageId] = {
        stageId: rec.stageId,
        phase: rec.phase,
        labelKo: rec.labelKo,
        waveIndex: rec.waveIndex,
        sourceWaves: rec.sourceWaves.slice(),
        status: rec.status,
        actualDurationMs: rec.actualDurationMs,
        estimatedDurationMs: rec.estimatedDurationMs,
        healedIssueCount: rec.healedIssueCount,
        summaryKo: rec.summaryKo.replace(/^\[캐시 재사용\] /, ""),
        output: deepCloneAndFreeze(rec.output),
        outputSha256: rec.outputSha256,
        upstreamOutputHashes: { ...rec.upstreamOutputHashes },
      };
    } else if (rec.status === "blocked") {
      blockedStageIdsAtExport.push(rec.stageId);
    }
  }

  const unsignedPayload: Omit<PipelineCheckpointSnapshot, "checkpointSha256"> = {
    schemaVersion: "wave100-checkpoint-v1",
    checkpointId: `ckpt-${sha256Wave100Hex(`${runReport.runId}:${runReport.merkleStageDigest}:${timestamp}`).slice(0, 12)}`,
    dagId: runReport.dagId,
    dagTopologySha256: runReport.dagTopologySha256,
    episodeId: runReport.episodeId,
    episodeTitle: runReport.episodeTitle,
    seriesId: runReport.seriesId,
    masterRevision: runReport.masterRevision,
    masterStateDigest: runReport.masterStateDigest,
    exportedAtIso: timestamp,
    sourceRunId: runReport.runId,
    cachedStages,
    cachedStageOrder,
    blockedStageIdsAtExport,
  };
  return {
    ...unsignedPayload,
    checkpointSha256: sha256Wave100Hex(buildUnsignedCheckpointJson(unsignedPayload)),
  };
}

/** 체크포인트 스냅샷의 SHA-256 무결성을 검증한다. */
export function verifyPipelineCheckpointIntegrity(checkpoint: PipelineCheckpointSnapshot): boolean {
  return sha256Wave100Hex(buildUnsignedCheckpointJson(checkpoint)) === checkpoint.checkpointSha256;
}

/** 체크포인트에서 파이프라인을 재개한다(위변조 시 fail-closed 차단, 유효 캐시 스테이지 건너뜀). */
export function resumeProductionPipelineFromCheckpoint(
  checkpoint: PipelineCheckpointSnapshot,
  request: ResumeProductionPipelineRequest,
): EpisodeProductionRunReport {
  if (!verifyPipelineCheckpointIntegrity(checkpoint)) {
    throw new PipelineCheckpointIntegrityError(
      `체크포인트(${checkpoint.checkpointId}) 무결성 서명이 일치하지 않습니다. 위변조 또는 손상된 스냅샷은 재개할 수 없습니다.`,
    );
  }
  const dag = request.dag ?? createCanonicalWebtoonProductionDag();
  const executedAtIso = request.executedAtIso ?? "2026-11-28T00:05:00Z";
  const runId =
    request.runId ??
    `resume-${sha256Wave100Hex(`${checkpoint.checkpointId}:${executedAtIso}`).slice(0, 12)}`;
  return runPipelineInternal(
    dag,
    request.masterSnapshot,
    runId,
    executedAtIso,
    request.stageHandlers,
    request.failFastOnBlock === true,
    checkpoint,
    request.forceRerunStageIds ?? [],
  );
}
