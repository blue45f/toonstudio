/**
 * Wave 128 — 멀티스피커 성우 씬 공존 간섭 그래프 컬러링 캐스팅 & 성대 피로 보호 부스 스케줄러.
 *
 * - 같은 씬에 동시 등장하는 캐릭터 간 간섭 그래프를 구축하고 DSATUR + 백트래킹으로 무충돌 배정한다.
 * - 성우 부족·고정 주연 충돌 등 불가능 케이스는 임의로 중복 배정하지 않고 fail-closed로 보고한다.
 * - 성우별 연속 외침 대사가 상한(`maxConsecutiveShoutLines`, 기본 3회)을 초과하면
 *   성대 보호 수분 휴식(`hydrationBreakEvents`)을 삽입하고 부스 시간·비용 추정치를 산출한다.
 */

import {
  buildSceneInterferenceGraph,
  collectCharacterDialogueStats,
  detectSameSceneDoubleCastCollisions,
  estimateExtraActorsNeeded,
  runExactDsaturBacktracking,
  runGreedyDsaturColoring,
  type NormalizedVoiceActor,
} from "./scene-interference-graph-coloring";
import { computeVoiceManifestSha256Hex } from "./voice-script-sha256";
import type {
  BoothActorSession,
  CastAssignmentMode,
  CharacterCastAssignment,
  CompiledVoiceProsodyScript,
  HydrationBreakEvent,
  ResolvedVoiceCastScheduleOptions,
  VoiceActorProfile,
  VoiceCastAndBoothSchedule,
  VoiceCastScheduleOptions,
} from "./voice-script-types";

export { buildSceneInterferenceGraph } from "./scene-interference-graph-coloring";

export const DEFAULT_MAX_CONSECUTIVE_SHOUT_LINES = 3;
export const DEFAULT_HYDRATION_BREAK_DURATION_MS = 90000;
export const DEFAULT_TAKE_RETAKE_MULTIPLIER = 2.4;
export const DEFAULT_BOOTH_SETUP_MINUTES_PER_ACTOR = 15;
export const DEFAULT_DIRECTION_MINUTES_PER_LINE = 0.45;
export const DEFAULT_MINIMUM_BILLABLE_HOURS_PER_ACTOR = 1.0;

function sanitizeFinite(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** 부스 스케줄 옵션을 안전한 유한 경계값으로 정규화한다. */
export function resolveVoiceCastScheduleOptions(
  options?: VoiceCastScheduleOptions,
): ResolvedVoiceCastScheduleOptions {
  return {
    defaultMaxConsecutiveShoutLines: Math.round(
      sanitizeFinite(
        options?.defaultMaxConsecutiveShoutLines,
        DEFAULT_MAX_CONSECUTIVE_SHOUT_LINES,
        1,
        20,
      ),
    ),
    hydrationBreakDurationMs: Math.round(
      sanitizeFinite(
        options?.hydrationBreakDurationMs,
        DEFAULT_HYDRATION_BREAK_DURATION_MS,
        10000,
        600000,
      ),
    ),
    takeRetakeMultiplier: roundTo(
      sanitizeFinite(options?.takeRetakeMultiplier, DEFAULT_TAKE_RETAKE_MULTIPLIER, 1.0, 6.0),
      2,
    ),
    boothSetupMinutesPerActor: roundTo(
      sanitizeFinite(
        options?.boothSetupMinutesPerActor,
        DEFAULT_BOOTH_SETUP_MINUTES_PER_ACTOR,
        0,
        120,
      ),
      1,
    ),
    directionMinutesPerLine: roundTo(
      sanitizeFinite(options?.directionMinutesPerLine, DEFAULT_DIRECTION_MINUTES_PER_LINE, 0, 5),
      2,
    ),
    minimumBillableHoursPerActor: roundTo(
      sanitizeFinite(
        options?.minimumBillableHoursPerActor,
        DEFAULT_MINIMUM_BILLABLE_HOURS_PER_ACTOR,
        0.5,
        8,
      ),
      2,
    ),
  };
}

function normalizeActors(
  actors: readonly VoiceActorProfile[],
  defaultMaxShout: number,
): readonly NormalizedVoiceActor[] {
  const seen = new Set<string>();
  const out: NormalizedVoiceActor[] = [];

  for (let i = 0; i < actors.length; i += 1) {
    const actor = actors[i];
    if (!actor) continue;
    const actorId = actor.actorId.trim();
    if (actorId.length === 0 || seen.has(actorId)) continue;
    seen.add(actorId);

    const fixedSet = new Set<string>();
    const fixedList: string[] = [];
    if (actor.fixedLeadCharacterIds) {
      for (let j = 0; j < actor.fixedLeadCharacterIds.length; j += 1) {
        const charId = actor.fixedLeadCharacterIds[j]?.trim() ?? "";
        if (charId.length > 0 && !fixedSet.has(charId)) {
          fixedSet.add(charId);
          fixedList.push(charId);
        }
      }
    }
    fixedList.sort();

    out.push({
      actorId,
      nameKo: actor.nameKo.trim() || actorId,
      vocalTier: actor.vocalTier,
      fixedLeadCharacterIds: fixedList,
      maxConsecutiveShoutLines: Math.round(
        sanitizeFinite(actor.maxConsecutiveShoutLines, defaultMaxShout, 1, 20),
      ),
      hourlyRateKrw: Math.round(sanitizeFinite(actor.hourlyRateKrw, 0, 0, 100000000)),
    });
  }

  return out;
}

/**
 * 씬 공존 간섭 그래프 기반 성우 더블캐스팅 무충돌 배정 및 성대 피로 보호 부스 스케줄을 산출한다.
 */
export function assignVoiceActorsWithoutSceneCollision(
  script: CompiledVoiceProsodyScript,
  actorsInput: readonly VoiceActorProfile[],
  options?: VoiceCastScheduleOptions,
): VoiceCastAndBoothSchedule {
  const resolved = resolveVoiceCastScheduleOptions(options);
  const actors = normalizeActors(actorsInput, resolved.defaultMaxConsecutiveShoutLines);
  const actorById = new Map<string, NormalizedVoiceActor>();
  for (let i = 0; i < actors.length; i += 1) {
    const actor = actors[i];
    if (actor) actorById.set(actor.actorId, actor);
  }

  const statsMap = collectCharacterDialogueStats(script);
  const episodeCharacterSet = new Set<string>(script.characterIds);
  const { adjacency, edges, maxSceneCliqueSize } = buildSceneInterferenceGraph(script);

  const fixedAssigned = new Map<string, string>();
  const fixedLeadConflictIssues: string[] = [];

  for (let i = 0; i < actors.length; i += 1) {
    const actor = actors[i];
    if (!actor) continue;
    for (let j = 0; j < actor.fixedLeadCharacterIds.length; j += 1) {
      const charId = actor.fixedLeadCharacterIds[j];
      if (!charId || !episodeCharacterSet.has(charId)) continue;
      const existingActor = fixedAssigned.get(charId);
      if (existingActor && existingActor !== actor.actorId) {
        fixedLeadConflictIssues.push(
          `캐릭터 '${charId}'가 성우 '${existingActor}'와 '${actor.actorId}'에 중복 고정됨`,
        );
        continue;
      }
      fixedAssigned.set(charId, actor.actorId);
    }
  }

  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i];
    if (!edge) continue;
    const actorA = fixedAssigned.get(edge.characterA);
    const actorB = fixedAssigned.get(edge.characterB);
    if (actorA && actorB && actorA === actorB) {
      fixedLeadConflictIssues.push(
        `고정 성우 '${actorA}'가 동일 씬(${edge.sharedSceneIds.join(", ")}) 공존 캐릭터 '${edge.characterA}'·'${edge.characterB}'에 동시 지정됨`,
      );
    }
  }

  const hasFixedConflict = fixedLeadConflictIssues.length > 0;
  let finalAssigned: Map<string, string>;
  let unassignableChars: string[] = [];

  if (!hasFixedConflict) {
    const greedy = runGreedyDsaturColoring(
      script.characterIds,
      actors,
      fixedAssigned,
      adjacency,
      statsMap,
    );
    if (greedy.unassignable.length === 0) {
      finalAssigned = greedy.assigned;
    } else {
      const exact = runExactDsaturBacktracking(
        script.characterIds,
        actors,
        fixedAssigned,
        adjacency,
        statsMap,
      );
      if (exact) {
        finalAssigned = exact;
      } else {
        finalAssigned = greedy.assigned;
        unassignableChars = greedy.unassignable;
      }
    }
  } else {
    const partial = runGreedyDsaturColoring(
      script.characterIds,
      actors,
      fixedAssigned,
      adjacency,
      statsMap,
    );
    finalAssigned = partial.assigned;
    unassignableChars = partial.unassignable;
  }

  const sameSceneCollisions = detectSameSceneDoubleCastCollisions(script, finalAssigned);
  const sameSceneDoubleCastCollisionCount = sameSceneCollisions.length;

  let shortageActorCount = 0;
  if (unassignableChars.length > 0 || actors.length < maxSceneCliqueSize) {
    const extraEstimated = estimateExtraActorsNeeded(
      script.characterIds,
      actors,
      fixedAssigned,
      adjacency,
      statsMap,
    );
    shortageActorCount = Math.max(
      Math.max(0, maxSceneCliqueSize - actors.length),
      extraEstimated,
      unassignableChars.length > 0 ? 1 : 0,
    );
  }

  const chromaticLowerBound = Math.max(
    maxSceneCliqueSize,
    shortageActorCount > 0 ? actors.length + shortageActorCount : maxSceneCliqueSize,
  );

  const castFeasible =
    !hasFixedConflict &&
    unassignableChars.length === 0 &&
    sameSceneDoubleCastCollisionCount === 0 &&
    shortageActorCount === 0;

  let feasibilityReasonKo: string;
  if (script.characterIds.length === 0) {
    feasibilityReasonKo = "대사가 포함된 화자가 없어 캐스팅 충돌이 없습니다.";
  } else if (castFeasible) {
    feasibilityReasonKo = `전체 ${script.characterIds.length}명 화자를 ${actors.length}명 성우 풀에 동일 씬 중복 없이 배정했습니다.`;
  } else if (hasFixedConflict) {
    feasibilityReasonKo = `고정 주연 배정 제약 충돌 ${fixedLeadConflictIssues.length}건이 감지되어 배치를 차단했습니다.`;
  } else {
    feasibilityReasonKo = `성우 인원이 부족해 동일 씬 중복 없이 배정할 수 없습니다(최소 ${shortageActorCount}명 추가 필요).`;
  }

  const assignments: CharacterCastAssignment[] = [];
  const characterToActorId: Record<string, string | null> = {};

  for (let i = 0; i < script.characterIds.length; i += 1) {
    const charId = script.characterIds[i];
    if (!charId) continue;
    const stats = statsMap.get(charId);
    const assignedActorId = finalAssigned.get(charId) ?? null;
    const actor = assignedActorId ? actorById.get(assignedActorId) : undefined;
    let mode: CastAssignmentMode;
    if (assignedActorId === null) {
      mode = "unassigned-shortage";
    } else if (fixedAssigned.get(charId) === assignedActorId) {
      mode = "fixed-lead";
    } else {
      mode = "graph-colored";
    }
    characterToActorId[charId] = assignedActorId;
    assignments.push({
      characterId: charId,
      characterNameKo: stats?.characterNameKo ?? charId,
      actorId: assignedActorId,
      actorNameKo: actor ? actor.nameKo : "미배정(성우 부족)",
      assignmentMode: mode,
      lineCount: stats?.lineCount ?? 0,
      shoutLineCount: stats?.shoutLineCount ?? 0,
      sceneIds: stats?.sceneIds ?? [],
      interferenceDegree: adjacency.get(charId)?.size ?? 0,
    });
  }

  const hydrationBreakEvents: HydrationBreakEvent[] = [];
  const actorShoutRun = new Map<string, number>();
  const actorRawShoutRun = new Map<string, number>();
  const actorMaxRawShout = new Map<string, number>();
  const actorPrevLine = new Map<string, { readonly lineId: string; readonly endMs: number }>();
  const actorActiveSpeechMs = new Map<string, number>();
  const actorLineCount = new Map<string, number>();
  const actorShoutCount = new Map<string, number>();
  const actorBreakCount = new Map<string, number>();

  for (let i = 0; i < script.lines.length; i += 1) {
    const line = script.lines[i];
    if (!line) continue;
    const actorId = finalAssigned.get(line.characterId);
    if (!actorId) continue;
    const actor = actorById.get(actorId);
    if (!actor) continue;

    actorActiveSpeechMs.set(actorId, (actorActiveSpeechMs.get(actorId) ?? 0) + line.estimatedDurationMs);
    actorLineCount.set(actorId, (actorLineCount.get(actorId) ?? 0) + 1);

    if (line.deliveryStyle === "shout") {
      actorShoutCount.set(actorId, (actorShoutCount.get(actorId) ?? 0) + 1);
      const rawRun = (actorRawShoutRun.get(actorId) ?? 0) + 1;
      actorRawShoutRun.set(actorId, rawRun);
      if (rawRun > (actorMaxRawShout.get(actorId) ?? 0)) {
        actorMaxRawShout.set(actorId, rawRun);
      }

      const nextRun = (actorShoutRun.get(actorId) ?? 0) + 1;
      if (nextRun > actor.maxConsecutiveShoutLines) {
        const prev = actorPrevLine.get(actorId);
        const breakIndex = hydrationBreakEvents.length + 1;
        hydrationBreakEvents.push({
          breakId: `hydration-break-${breakIndex}`,
          actorId,
          actorNameKo: actor.nameKo,
          afterLineId: prev ? prev.lineId : line.lineId,
          beforeLineId: line.lineId,
          sceneId: line.sceneId,
          consecutiveShoutRun: nextRun,
          maxAllowedConsecutiveShouts: actor.maxConsecutiveShoutLines,
          breakStartMs: prev ? prev.endMs : line.startMs,
          breakDurationMs: resolved.hydrationBreakDurationMs,
          reasonKo: `${actor.nameKo} 성우 연속 외침 ${nextRun}회(상한 ${actor.maxConsecutiveShoutLines}회 초과)로 성대 보호 수분 휴식 삽입`,
        });
        actorBreakCount.set(actorId, (actorBreakCount.get(actorId) ?? 0) + 1);
        actorShoutRun.set(actorId, 1);
      } else {
        actorShoutRun.set(actorId, nextRun);
      }
    } else {
      actorShoutRun.set(actorId, 0);
      actorRawShoutRun.set(actorId, 0);
    }

    actorPrevLine.set(actorId, { lineId: line.lineId, endMs: line.endMs });
  }

  const actorAssignedChars = new Map<string, string[]>();
  for (let i = 0; i < assignments.length; i += 1) {
    const item = assignments[i];
    if (!item || !item.actorId) continue;
    let list = actorAssignedChars.get(item.actorId);
    if (!list) {
      list = [];
      actorAssignedChars.set(item.actorId, list);
    }
    list.push(item.characterId);
  }

  const actorSessions: BoothActorSession[] = [];
  let totalBoothDurationMinutes = 0;
  let totalHydrationBreakMinutes = 0;
  let estimatedTotalStudioCostKrw = 0;

  for (let i = 0; i < actors.length; i += 1) {
    const actor = actors[i];
    if (!actor) continue;
    const assignedChars = actorAssignedChars.get(actor.actorId) ?? [];
    const lineCount = actorLineCount.get(actor.actorId) ?? 0;
    const shoutLineCount = actorShoutCount.get(actor.actorId) ?? 0;
    const activeSpeechMs = actorActiveSpeechMs.get(actor.actorId) ?? 0;
    const hydrationBreakCount = actorBreakCount.get(actor.actorId) ?? 0;
    const breakMinutes = (hydrationBreakCount * resolved.hydrationBreakDurationMs) / 60000;

    if (lineCount === 0 && assignedChars.length === 0) continue;

    const rawBoothMinutes =
      resolved.boothSetupMinutesPerActor +
      (activeSpeechMs * resolved.takeRetakeMultiplier) / 60000 +
      lineCount * resolved.directionMinutesPerLine +
      breakMinutes;
    const estimatedBoothMinutes = roundTo(rawBoothMinutes, 1);
    const billableHours = Math.max(
      resolved.minimumBillableHoursPerActor,
      Math.ceil((estimatedBoothMinutes / 60) * 2) / 2,
    );
    const estimatedCostKrw = Math.round(billableHours * actor.hourlyRateKrw);

    totalBoothDurationMinutes = roundTo(totalBoothDurationMinutes + estimatedBoothMinutes, 1);
    totalHydrationBreakMinutes = roundTo(totalHydrationBreakMinutes + breakMinutes, 2);
    estimatedTotalStudioCostKrw += estimatedCostKrw;

    actorSessions.push({
      actorId: actor.actorId,
      actorNameKo: actor.nameKo,
      vocalTier: actor.vocalTier,
      assignedCharacterIds: assignedChars,
      lineCount,
      shoutLineCount,
      maxConsecutiveShoutObserved: actorMaxRawShout.get(actor.actorId) ?? 0,
      hydrationBreakCount,
      activeSpeechMs,
      estimatedBoothMinutes,
      billableHours,
      hourlyRateKrw: actor.hourlyRateKrw,
      estimatedCostKrw,
      costEstimationBasisKo: `추정치(세팅 ${resolved.boothSetupMinutesPerActor}분 + 리테이크 ${resolved.takeRetakeMultiplier}배 + 대사당 디렉팅 ${resolved.directionMinutesPerLine}분 + 성대 휴식 반영, 30분 단위 올림·최소 ${resolved.minimumBillableHoursPerActor}시간)`,
    });
  }

  const costEstimateDisclaimerKo =
    "스튜디오 소요 시간과 녹음 비용은 리테이크 배수·성대 휴식 기준을 적용한 추정치이며, 실제 계약 단가와 부스 대관 조건에 따라 달라질 수 있습니다.";

  const scriptManifestSha256Hex = computeVoiceManifestSha256Hex({
    version: "wave128-voice-cast-manifest-v1",
    prosodyScriptSha256Hex: script.prosodyScriptSha256Hex,
    options: resolved,
    actors,
    castFeasible,
    shortageActorCount,
    sameSceneDoubleCastCollisionCount,
    assignments,
    hydrationBreakEvents,
    actorSessions,
  });

  return {
    castFeasible,
    feasibilityReasonKo,
    shortageActorCount,
    maxSceneCliqueSize,
    chromaticLowerBound,
    availableActorCount: actors.length,
    sameSceneDoubleCastCollisionCount,
    sameSceneCollisions,
    fixedLeadConflictIssues,
    interferenceEdges: edges,
    assignments,
    characterToActorId,
    hydrationBreakEvents,
    actorSessions,
    totalBoothDurationMinutes,
    totalHydrationBreakMinutes,
    estimatedTotalStudioCostKrw,
    isCostEstimate: true,
    costEstimateDisclaimerKo,
    scriptManifestSha256Hex,
  };
}
