/**
 * 회차 횡단 타임라인·장면 시계 제약 솔버 및 캐릭터 상태머신 연속성 검증기.
 *
 * - 회차 간 장면들을 Allen 구간 대수(`before`, `meets`, `overlaps`, `during`, `simultaneous`)와
 *   차분 제약(`t_j - t_i in [minMinutes, maxMinutes]`) 그래프로 변환한다.
 * - Bellman-Ford 음수 사이클 탐지로 물리적으로 불가능한 이동 시간이나 시간대 역행 모순을 추출한다.
 * - 연재 공개 전 캐릭터별 소품(prop)·부상(injury)·복장(costume) 상태머신 전이 규칙을 검사한다.
 */

export type TimeOfDaySlot =
  | "midnight"
  | "dawn"
  | "morning"
  | "noon"
  | "afternoon"
  | "sunset"
  | "night";

export type ContinuityDomainCategory = "prop" | "injury" | "costume";

export type InjuryLifecycleState =
  | "healthy"
  | "fresh-wound"
  | "bandaged"
  | "scarred"
  | "healed";

export type PropLifecycleState =
  | "unowned"
  | "acquired"
  | "equipped"
  | "stored"
  | "dropped"
  | "consumed"
  | "destroyed";

export type CostumeLifecycleState = "intact" | "stained" | "torn" | "repaired" | "changed";

export interface SceneCharacterStateAssertion {
  readonly characterId: string;
  readonly category: ContinuityDomainCategory;
  readonly itemKey: string;
  readonly state: InjuryLifecycleState | PropLifecycleState | CostumeLifecycleState;
  readonly explicitRecoveryOrChange?: boolean;
}

export interface NarrativeSceneNode {
  readonly id: string;
  readonly episodeNumber: number;
  readonly cutOrder: number;
  readonly titleKo: string;
  readonly minDurationMinutes?: number;
  readonly maxDurationMinutes?: number;
  readonly storyDayIndex?: number;
  readonly timeOfDay?: TimeOfDaySlot;
  readonly customClockWindowMinutes?: readonly [number, number];
  readonly locationId?: string;
  readonly participatingCharacterIds?: readonly string[];
  readonly characterStates?: readonly SceneCharacterStateAssertion[];
  readonly isFlashback?: boolean;
}

export type AllenOrDifferenceKind =
  | "difference"
  | "allen-before"
  | "allen-meets"
  | "allen-overlaps"
  | "allen-during"
  | "allen-simultaneous";

export interface SceneTemporalConstraint {
  readonly id: string;
  readonly kind: AllenOrDifferenceKind;
  readonly fromSceneId: string;
  readonly toSceneId: string;
  readonly minMinutes?: number;
  readonly maxMinutes?: number;
  readonly anchor?: "start-to-start" | "end-to-start";
  readonly descriptionKo?: string;
}

export interface LocationTravelRule {
  readonly fromLocationId: string;
  readonly toLocationId: string;
  readonly minTravelMinutes: number;
  readonly bidirectional?: boolean;
}

export type ContradictionCategory =
  | "impossible-travel-time"
  | "time-of-day-regression"
  | "constraint-contradiction";

export interface ConstraintCycleEdgeWitness {
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly upperBoundMinutes: number;
  readonly reasonKind:
    | "scene-duration"
    | "time-of-day-window"
    | "explicit-constraint"
    | "character-travel-time"
    | "epoch-floor";
  readonly descriptionKo: string;
}

export interface TemporalContradiction {
  readonly category: ContradictionCategory;
  readonly totalCycleSlackMinutes: number;
  readonly involvedSceneIds: readonly string[];
  readonly cycleWitness: readonly ConstraintCycleEdgeWitness[];
  readonly messageKo: string;
}

export interface SolvedSceneSchedule {
  readonly sceneId: string;
  readonly episodeNumber: number;
  readonly earliestStartMinute: number;
  readonly latestStartMinute: number | null;
  readonly earliestEndMinute: number;
  readonly formattedEarliestClock: string;
}

export interface CharacterStateViolation {
  readonly characterId: string;
  readonly category: ContinuityDomainCategory;
  readonly itemKey: string;
  readonly fromSceneId: string;
  readonly toSceneId: string;
  readonly previousState: string;
  readonly nextState: string;
  readonly elapsedMinutes: number;
  readonly messageKo: string;
}

export interface NarrativeTimelineInput {
  readonly scenes: readonly NarrativeSceneNode[];
  readonly constraints?: readonly SceneTemporalConstraint[];
  readonly travelRules?: readonly LocationTravelRule[];
  readonly uniquePropKeys?: readonly string[];
}

export interface NarrativeTimelineSolveReport {
  readonly feasible: boolean;
  readonly publicationReady: boolean;
  readonly schedules: readonly SolvedSceneSchedule[];
  readonly temporalContradictions: readonly TemporalContradiction[];
  readonly stateViolations: readonly CharacterStateViolation[];
  readonly computeTimeMs: number;
}

export const TIME_OF_DAY_WINDOWS_MINUTES: Readonly<
  Record<TimeOfDaySlot, readonly [number, number]>
> = Object.freeze({
  midnight: [0, 300],
  dawn: [300, 420],
  morning: [420, 690],
  noon: [690, 840],
  afternoon: [840, 1050],
  sunset: [1050, 1170],
  night: [1170, 1439],
});

interface DirectedConstraintEdge {
  readonly id: number;
  readonly from: number;
  readonly to: number;
  readonly weight: number;
  readonly sceneIds: readonly string[];
  readonly reasonKind: ConstraintCycleEdgeWitness["reasonKind"];
  readonly descriptionKo: string;
}

function formatStoryMinuteToClock(totalMinutes: number): string {
  const rounded = Math.round(totalMinutes);
  const day = Math.floor(rounded / 1440);
  const rem = ((rounded % 1440) + 1440) % 1440;
  const hh = String(Math.floor(rem / 60)).padStart(2, "0");
  const mm = String(rem % 60).padStart(2, "0");
  return `D+${day} ${hh}:${mm}`;
}

function buildTravelLookup(rules: readonly LocationTravelRule[]): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  for (const rule of rules) {
    if (rule.fromLocationId === rule.toLocationId) continue;
    const minT = Math.max(0, rule.minTravelMinutes);
    const fwdKey = `${rule.fromLocationId}->${rule.toLocationId}`;
    map.set(fwdKey, Math.max(map.get(fwdKey) ?? 0, minT));
    if (rule.bidirectional !== false) {
      const revKey = `${rule.toLocationId}->${rule.fromLocationId}`;
      map.set(revKey, Math.max(map.get(revKey) ?? 0, minT));
    }
  }
  return map;
}

function detectNegativeCyclesBellmanFord(
  nodeCount: number,
  nodeLabels: readonly string[],
  edges: readonly DirectedConstraintEdge[],
): readonly TemporalContradiction[] {
  const dist = new Float64Array(nodeCount);
  const predEdge = new Int32Array(nodeCount).fill(-1);

  for (let iter = 0; iter < nodeCount - 1; iter += 1) {
    let changed = false;
    for (let eIdx = 0; eIdx < edges.length; eIdx += 1) {
      const edge = edges[eIdx]!;
      const cand = dist[edge.from]! + edge.weight;
      if (cand < dist[edge.to]! - 1e-9) {
        dist[edge.to] = cand;
        predEdge[edge.to] = eIdx;
        changed = true;
      }
    }
    if (!changed) return [];
  }

  const seenCycleSignatures = new Set<string>();
  const contradictions: TemporalContradiction[] = [];

  for (let eIdx = 0; eIdx < edges.length; eIdx += 1) {
    const triggerEdge = edges[eIdx]!;
    if (dist[triggerEdge.from]! + triggerEdge.weight < dist[triggerEdge.to]! - 1e-9) {
      predEdge[triggerEdge.to] = eIdx;
      let cursor = triggerEdge.to;
      for (let step = 0; step < nodeCount; step += 1) {
        const pe = predEdge[cursor]!;
        if (pe < 0) break;
        cursor = edges[pe]!.from;
      }

      const cycleEdgeIndices: number[] = [];
      const visitedInWalk = new Map<number, number>();
      let walk = cursor;
      while (!visitedInWalk.has(walk)) {
        visitedInWalk.set(walk, cycleEdgeIndices.length);
        const pe = predEdge[walk]!;
        if (pe < 0) break;
        cycleEdgeIndices.push(pe);
        walk = edges[pe]!.from;
      }

      const simpleReversed = cycleEdgeIndices.slice(visitedInWalk.get(walk) ?? 0);
      if (simpleReversed.length === 0) continue;

      const forwardCycle = [...simpleReversed].reverse();
      const sig = [...forwardCycle].sort((a, b) => a - b).join(",");
      if (seenCycleSignatures.has(sig)) continue;
      seenCycleSignatures.add(sig);

      let totalSlack = 0;
      const sceneSet = new Set<string>();
      let hasTravel = false;
      let hasTimeOfDay = false;
      const witness: ConstraintCycleEdgeWitness[] = [];

      for (const id of forwardCycle) {
        const ce = edges[id]!;
        totalSlack += ce.weight;
        for (const sid of ce.sceneIds) sceneSet.add(sid);
        if (ce.reasonKind === "character-travel-time") hasTravel = true;
        if (ce.reasonKind === "time-of-day-window") hasTimeOfDay = true;
        witness.push({
          fromLabel: nodeLabels[ce.from]!,
          toLabel: nodeLabels[ce.to]!,
          upperBoundMinutes: ce.weight,
          reasonKind: ce.reasonKind,
          descriptionKo: ce.descriptionKo,
        });
      }

      const category: ContradictionCategory = hasTravel
        ? "impossible-travel-time"
        : hasTimeOfDay
          ? "time-of-day-regression"
          : "constraint-contradiction";
      const involvedSceneIds = [...sceneSet];
      const deficit = Math.abs(Math.round(totalSlack));
      const messageKo =
        category === "impossible-travel-time"
          ? `장면 [${involvedSceneIds.join(" -> ")}] 사이 이동 시간이 최소 기준보다 ${deficit}분 부족합니다.`
          : category === "time-of-day-regression"
            ? `장면 [${involvedSceneIds.join(" -> ")}]의 시간대가 ${deficit}분 역행해 하루 시계 순서와 충돌합니다.`
            : `장면 [${involvedSceneIds.join(" -> ")}]의 시간 제약이 서로 충돌합니다(여유분 -${deficit}분).`;

      contradictions.push({
        category,
        totalCycleSlackMinutes: totalSlack,
        involvedSceneIds,
        cycleWitness: witness,
        messageKo,
      });
    }
  }
  return contradictions;
}

function solveSingleSourceShortestPaths(
  nodeCount: number,
  sourceNode: number,
  edges: readonly { readonly from: number; readonly to: number; readonly weight: number }[],
): Float64Array {
  const dist = new Float64Array(nodeCount).fill(Infinity);
  dist[sourceNode] = 0;
  for (let iter = 0; iter < nodeCount - 1; iter += 1) {
    let changed = false;
    for (let i = 0; i < edges.length; i += 1) {
      const e = edges[i]!;
      const dFrom = dist[e.from]!;
      if (!Number.isFinite(dFrom)) continue;
      const cand = dFrom + e.weight;
      if (cand < dist[e.to]! - 1e-9) {
        dist[e.to] = cand;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return dist;
}

function checkDomainTransitionRule(
  characterId: string,
  category: ContinuityDomainCategory,
  itemKey: string,
  prevState: string,
  nextState: string,
  elapsedMinutes: number,
): string | null {
  if (prevState === nextState) return null;

  if (category === "injury") {
    if (prevState === "scarred" && (nextState === "healthy" || nextState === "healed")) {
      return `'${characterId}'의 영구 흉터('${itemKey}')가 회상 장면 표시 없이 말끔한 상태로 되돌아갔습니다.`;
    }
    if (prevState === "fresh-wound" && nextState === "healthy") {
      return `'${characterId}'의 출혈 상처('${itemKey}')가 응급처치·회복 단계 없이 즉시 건강 상태로 바뀌었습니다.`;
    }
    if (prevState === "fresh-wound" && (nextState === "healed" || nextState === "scarred") && elapsedMinutes < 1440) {
      return `'${characterId}'의 상처('${itemKey}')가 ${Math.round(elapsedMinutes)}분 만에 완치/흉터화되었습니다(최소 1440분 필요).`;
    }
    if (prevState === "bandaged" && nextState === "healthy") {
      return `'${characterId}'의 붕대 감은 부상('${itemKey}')이 완치('healed') 전환 없이 즉시 무상처로 바뀌었습니다.`;
    }
    return null;
  }

  if (category === "prop") {
    if ((prevState === "destroyed" || prevState === "consumed") && nextState !== "destroyed" && nextState !== "consumed") {
      return `'${characterId}'의 이미 ${prevState === "destroyed" ? "파괴된" : "소모된"} 소품('${itemKey}')이 재획득 서사 없이 다시 '${nextState}' 상태로 등장했습니다.`;
    }
    if ((prevState === "unowned" || prevState === "dropped") && nextState === "equipped") {
      return `'${characterId}'이(가) 소유하지 않거나 떨어뜨린 소품('${itemKey}')을 획득 과정 없이 바로 장착했습니다.`;
    }
    return null;
  }

  if (prevState === "torn" && nextState === "intact") {
    return `'${characterId}'의 찢어진 의상('${itemKey}')이 수선·환복 표시 없이 온전한 상태로 복구되었습니다.`;
  }
  if (prevState === "stained" && nextState === "intact" && elapsedMinutes < 30) {
    return `'${characterId}'의 얼룩진 의상('${itemKey}')이 ${Math.round(elapsedMinutes)}분 만에 환복 없이 깨끗해졌습니다.`;
  }
  return null;
}

function validateCharacterStateTransitions(
  scenes: readonly NarrativeSceneNode[],
  scheduleBySceneId: ReadonlyMap<string, SolvedSceneSchedule>,
  uniquePropKeys: ReadonlySet<string>,
): readonly CharacterStateViolation[] {
  const orderedNonFlashback = scenes
    .filter((s) => !s.isFlashback)
    .slice()
    .sort((a, b) => {
      const sa = scheduleBySceneId.get(a.id)?.earliestStartMinute;
      const sb = scheduleBySceneId.get(b.id)?.earliestStartMinute;
      if (sa !== undefined && sb !== undefined && Math.abs(sa - sb) > 1e-6) return sa - sb;
      return a.episodeNumber !== b.episodeNumber ? a.episodeNumber - b.episodeNumber : a.cutOrder - b.cutOrder;
    });

  const lastStateMap = new Map<string, { sceneId: string; minute: number; state: string }>();
  const violations: CharacterStateViolation[] = [];

  for (const scene of orderedNonFlashback) {
    const currMinute =
      scheduleBySceneId.get(scene.id)?.earliestStartMinute ??
      (scene.episodeNumber - 1) * 1440 + scene.cutOrder * 10;

    for (const assertion of scene.characterStates ?? []) {
      const trackKey = `${assertion.characterId}::${assertion.category}::${assertion.itemKey}`;
      const prev = lastStateMap.get(trackKey);
      if (prev !== undefined && !assertion.explicitRecoveryOrChange) {
        const elapsed = Math.max(0, currMinute - prev.minute);
        const violationMsg = checkDomainTransitionRule(
          assertion.characterId,
          assertion.category,
          assertion.itemKey,
          prev.state,
          assertion.state,
          elapsed,
        );
        if (violationMsg !== null) {
          violations.push({
            characterId: assertion.characterId,
            category: assertion.category,
            itemKey: assertion.itemKey,
            fromSceneId: prev.sceneId,
            toSceneId: scene.id,
            previousState: prev.state,
            nextState: assertion.state,
            elapsedMinutes: elapsed,
            messageKo: violationMsg,
          });
        }
      }
      lastStateMap.set(trackKey, { sceneId: scene.id, minute: currMinute, state: assertion.state });
    }
  }

  if (uniquePropKeys.size > 0) {
    for (let i = 0; i < orderedNonFlashback.length; i += 1) {
      const sceneA = orderedNonFlashback[i]!;
      const schedA = scheduleBySceneId.get(sceneA.id);
      const statesA = sceneA.characterStates ?? [];
      if (!schedA || statesA.length === 0) continue;

      for (let j = i; j < orderedNonFlashback.length; j += 1) {
        const sceneB = orderedNonFlashback[j]!;
        const schedB = scheduleBySceneId.get(sceneB.id);
        const statesB = sceneB.characterStates ?? [];
        if (!schedB || statesB.length === 0) continue;

        const overlapsInTime =
          i === j ||
          (schedA.earliestStartMinute < schedB.earliestEndMinute &&
            schedB.earliestStartMinute < schedA.earliestEndMinute);
        if (!overlapsInTime) continue;

        for (let aIdx = 0; aIdx < statesA.length; aIdx += 1) {
          const aState = statesA[aIdx]!;
          if (
            aState.category !== "prop" ||
            !uniquePropKeys.has(aState.itemKey) ||
            (aState.state !== "equipped" && aState.state !== "acquired")
          ) {
            continue;
          }
          const bStart = i === j ? aIdx + 1 : 0;
          for (let bIdx = bStart; bIdx < statesB.length; bIdx += 1) {
            const bState = statesB[bIdx]!;
            if (
              bState.category === "prop" &&
              bState.itemKey === aState.itemKey &&
              bState.characterId !== aState.characterId &&
              (bState.state === "equipped" || bState.state === "acquired")
            ) {
              violations.push({
                characterId: `${aState.characterId},${bState.characterId}`,
                category: "prop",
                itemKey: aState.itemKey,
                fromSceneId: sceneA.id,
                toSceneId: sceneB.id,
                previousState: `${aState.characterId}:${aState.state}`,
                nextState: `${bState.characterId}:${bState.state}`,
                elapsedMinutes: 0,
                messageKo: `유일 소품 '${aState.itemKey}'을(를) 동시 시간대 장면(${sceneA.id}, ${sceneB.id})에서 '${aState.characterId}'와 '${bState.characterId}'가 동시에 소유하고 있습니다.`,
              });
            }
          }
        }
      }
    }
  }
  return violations;
}

/** 회차 횡단 장면 시간 제약을 풀고 음수 사이클 모순 및 캐릭터 연속성 위반을 반환한다. */
export function solveTemporalNarrativeTimeline(
  input: NarrativeTimelineInput,
): NarrativeTimelineSolveReport {
  const startMs = performance.now();
  const scenes = input.scenes;
  const sceneIndexById = new Map<string, number>();
  scenes.forEach((s, idx) => sceneIndexById.set(s.id, idx));

  const nodeCount = 1 + scenes.length * 2;
  const nodeLabels: string[] = ["EPOCH"];
  for (const scene of scenes) nodeLabels.push(`${scene.id}:start`, `${scene.id}:end`);

  const edges: DirectedConstraintEdge[] = [];
  const addBound = (
    u: number,
    v: number,
    minDiff: number | undefined,
    maxDiff: number | undefined,
    sceneIds: readonly string[],
    reasonKind: ConstraintCycleEdgeWitness["reasonKind"],
    descriptionKo: string,
  ): void => {
    if (maxDiff !== undefined && Number.isFinite(maxDiff)) {
      edges.push({ id: edges.length, from: u, to: v, weight: maxDiff, sceneIds, reasonKind, descriptionKo });
    }
    if (minDiff !== undefined && Number.isFinite(minDiff)) {
      edges.push({ id: edges.length, from: v, to: u, weight: -minDiff, sceneIds, reasonKind, descriptionKo });
    }
  };

  for (let i = 0; i < scenes.length; i += 1) {
    const scene = scenes[i]!;
    const sNode = 2 * i + 1;
    const eNode = 2 * i + 2;
    addBound(
      sNode,
      eNode,
      Math.max(0, scene.minDurationMinutes ?? 5),
      scene.maxDurationMinutes,
      [scene.id],
      "scene-duration",
      `장면 '${scene.titleKo}' 소요 시간`,
    );

    const clockRange =
      scene.customClockWindowMinutes ??
      (scene.timeOfDay !== undefined ? TIME_OF_DAY_WINDOWS_MINUTES[scene.timeOfDay] : undefined);
    if (clockRange !== undefined && scene.storyDayIndex !== undefined) {
      const dayBase = scene.storyDayIndex * 1440;
      addBound(
        0,
        sNode,
        dayBase + clockRange[0],
        dayBase + clockRange[1],
        [scene.id],
        "time-of-day-window",
        `장면 '${scene.titleKo}' D+${scene.storyDayIndex} 시간대 제약`,
      );
    }
  }

  for (const c of input.constraints ?? []) {
    const fromIdx = sceneIndexById.get(c.fromSceneId);
    const toIdx = sceneIndexById.get(c.toSceneId);
    if (fromIdx === undefined || toIdx === undefined) continue;
    const sFrom = 2 * fromIdx + 1;
    const eFrom = 2 * fromIdx + 2;
    const sTo = 2 * toIdx + 1;
    const eTo = 2 * toIdx + 2;
    const pairIds = [c.fromSceneId, c.toSceneId];
    const desc = c.descriptionKo ?? `${c.fromSceneId} -> ${c.toSceneId} (${c.kind})`;

    switch (c.kind) {
      case "difference":
        addBound(c.anchor === "end-to-start" ? eFrom : sFrom, sTo, c.minMinutes, c.maxMinutes, pairIds, "explicit-constraint", desc);
        break;
      case "allen-before":
        addBound(eFrom, sTo, Math.max(0, c.minMinutes ?? 0), c.maxMinutes, pairIds, "explicit-constraint", desc);
        break;
      case "allen-meets":
        addBound(eFrom, sTo, 0, 0, pairIds, "explicit-constraint", desc);
        break;
      case "allen-overlaps":
        addBound(sFrom, sTo, 1, undefined, pairIds, "explicit-constraint", desc);
        addBound(sTo, eFrom, 1, undefined, pairIds, "explicit-constraint", desc);
        addBound(eFrom, eTo, 1, undefined, pairIds, "explicit-constraint", desc);
        break;
      case "allen-during":
        addBound(sTo, sFrom, 0, undefined, pairIds, "explicit-constraint", desc);
        addBound(eFrom, eTo, 0, undefined, pairIds, "explicit-constraint", desc);
        break;
      case "allen-simultaneous":
        addBound(sFrom, sTo, 0, 0, pairIds, "explicit-constraint", desc);
        addBound(eFrom, eTo, 0, 0, pairIds, "explicit-constraint", desc);
        break;
    }
  }

  const travelLookup = buildTravelLookup(input.travelRules ?? []);
  if (travelLookup.size > 0) {
    const narrativeOrdered = scenes
      .map((scene, idx) => ({ scene, idx }))
      .filter((entry) => !entry.scene.isFlashback)
      .sort((a, b) =>
        a.scene.episodeNumber !== b.scene.episodeNumber
          ? a.scene.episodeNumber - b.scene.episodeNumber
          : a.scene.cutOrder - b.scene.cutOrder,
      );

    const lastAppearanceByChar = new Map<string, { scene: NarrativeSceneNode; idx: number }>();
    for (const entry of narrativeOrdered) {
      const chars = new Set<string>(entry.scene.participatingCharacterIds ?? []);
      for (const st of entry.scene.characterStates ?? []) chars.add(st.characterId);

      for (const charId of chars) {
        const prev = lastAppearanceByChar.get(charId);
        if (
          prev !== undefined &&
          prev.scene.locationId !== undefined &&
          entry.scene.locationId !== undefined &&
          prev.scene.locationId !== entry.scene.locationId
        ) {
          const minTravel = travelLookup.get(`${prev.scene.locationId}->${entry.scene.locationId}`);
          if (minTravel !== undefined && minTravel > 0) {
            addBound(
              2 * prev.idx + 2,
              2 * entry.idx + 1,
              minTravel,
              undefined,
              [prev.scene.id, entry.scene.id],
              "character-travel-time",
              `'${charId}' 이동 (${prev.scene.locationId} -> ${entry.scene.locationId}, 최소 ${minTravel}분)`,
            );
          }
        }
        lastAppearanceByChar.set(charId, entry);
      }
    }
  }

  const temporalContradictions = detectNegativeCyclesBellmanFord(nodeCount, nodeLabels, edges);
  const feasible = temporalContradictions.length === 0;
  const schedules: SolvedSceneSchedule[] = [];
  const scheduleBySceneId = new Map<string, SolvedSceneSchedule>();

  if (feasible && scenes.length > 0) {
    const scheduleEdges = edges.map((e) => ({ from: e.from, to: e.to, weight: e.weight }));
    const preRevDist = solveSingleSourceShortestPaths(
      nodeCount,
      0,
      scheduleEdges.map((e) => ({ from: e.to, to: e.from, weight: e.weight })),
    );
    for (let i = 0; i < scenes.length; i += 1) {
      if (!Number.isFinite(preRevDist[2 * i + 1]!)) {
        scheduleEdges.push({ from: 2 * i + 1, to: 0, weight: 0 });
      }
    }

    const revDist = solveSingleSourceShortestPaths(
      nodeCount,
      0,
      scheduleEdges.map((e) => ({ from: e.to, to: e.from, weight: e.weight })),
    );
    const fwdDist = solveSingleSourceShortestPaths(nodeCount, 0, scheduleEdges);

    for (let i = 0; i < scenes.length; i += 1) {
      const scene = scenes[i]!;
      const sNode = 2 * i + 1;
      const eNode = 2 * i + 2;
      const earliestStart = Number.isFinite(revDist[sNode]!) ? -revDist[sNode]! : 0;
      const earliestEnd = Number.isFinite(revDist[eNode]!)
        ? -revDist[eNode]!
        : earliestStart + (scene.minDurationMinutes ?? 5);
      const latestStart = Number.isFinite(fwdDist[sNode]!) ? fwdDist[sNode]! : null;
      const item: SolvedSceneSchedule = {
        sceneId: scene.id,
        episodeNumber: scene.episodeNumber,
        earliestStartMinute: earliestStart,
        latestStartMinute: latestStart,
        earliestEndMinute: earliestEnd,
        formattedEarliestClock: formatStoryMinuteToClock(earliestStart),
      };
      schedules.push(item);
      scheduleBySceneId.set(scene.id, item);
    }
  }

  const stateViolations = validateCharacterStateTransitions(
    scenes,
    scheduleBySceneId,
    new Set(input.uniquePropKeys ?? []),
  );

  return {
    feasible,
    publicationReady: feasible && stateViolations.length === 0,
    schedules,
    temporalContradictions,
    stateViolations,
    computeTimeMs: performance.now() - startMs,
  };
}
