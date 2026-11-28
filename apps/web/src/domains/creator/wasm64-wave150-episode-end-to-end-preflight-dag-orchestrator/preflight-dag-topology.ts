/**
 * Wave 150 마일스톤 — 9대 출고 품질 게이트 DAG 토폴로지 빌더, Kahn 위상 정렬 및 순환 의존성(CYCLE_DETECTED) 탐지기.
 *
 * - 표준 9대 게이트에 커스텀 게이트 확장·오버라이드를 병합한다.
 * - 결정론적 Kahn 위상 정렬을 수행하고, 순환·누락 의존성·중복 ID를 fail-closed로 차단한다.
 * - 각 게이트의 계층 깊이(layerDepth)와 전이 하류 파급 범위(transitiveDownstreamByGate)를 계산한다.
 */

import { sha256CanonicalPreflightPayload } from "./preflight-sha256-and-canonical";
import {
  STANDARD_PREFLIGHT_GATE_DEFINITIONS,
  STANDARD_PREFLIGHT_GATE_ORDER,
  type EpisodePreflightDagOptions,
  type PreflightDagValidationError,
  type PreflightGateDefinition,
  type PreflightTopologyPlan,
} from "./preflight-dag-types";

const STANDARD_GATE_RANK: Readonly<Record<string, number>> = (() => {
  const rankMap: Record<string, number> = {};
  for (let i = 0; i < STANDARD_PREFLIGHT_GATE_ORDER.length; i += 1) {
    const id = STANDARD_PREFLIGHT_GATE_ORDER[i];
    if (id !== undefined) rankMap[id] = i;
  }
  return rankMap;
})();

function compareGateOrder(leftId: string, rightId: string): number {
  const leftRank = STANDARD_GATE_RANK[leftId];
  const rightRank = STANDARD_GATE_RANK[rightId];
  if (leftRank !== undefined && rightRank !== undefined) {
    return leftRank - rightRank;
  }
  if (leftRank !== undefined) return -1;
  if (rightRank !== undefined) return 1;
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}

function normalizeGateList(
  options?: Pick<
    EpisodePreflightDagOptions,
    "customGates" | "overrideGates" | "replaceStandardGates"
  >,
): readonly PreflightGateDefinition[] {
  const baseGates: PreflightGateDefinition[] = options?.replaceStandardGates
    ? []
    : STANDARD_PREFLIGHT_GATE_DEFINITIONS.map((gate) => ({
        ...gate,
        dependsOn: [...gate.dependsOn],
      }));

  if (options?.overrideGates && options.overrideGates.length > 0) {
    const indexById = new Map<string, number>();
    for (let i = 0; i < baseGates.length; i += 1) {
      const gate = baseGates[i];
      if (gate) indexById.set(gate.gateId, i);
    }
    for (let i = 0; i < options.overrideGates.length; i += 1) {
      const override = options.overrideGates[i];
      if (!override) continue;
      const existingIdx = indexById.get(override.gateId);
      if (existingIdx !== undefined) {
        baseGates[existingIdx] = {
          ...override,
          dependsOn: [...override.dependsOn],
        };
      } else {
        baseGates.push({
          ...override,
          dependsOn: [...override.dependsOn],
        });
        indexById.set(override.gateId, baseGates.length - 1);
      }
    }
  }

  if (options?.customGates && options.customGates.length > 0) {
    for (let i = 0; i < options.customGates.length; i += 1) {
      const custom = options.customGates[i];
      if (!custom) continue;
      baseGates.push({
        ...custom,
        dependsOn: [...custom.dependsOn],
      });
    }
  }

  return baseGates;
}

function findDeterministicCyclePath(
  candidateGateIds: readonly string[],
  downstreamMap: Readonly<Record<string, readonly string[]>>,
): readonly string[] {
  const candidateSet = new Set<string>(candidateGateIds);
  const sortedCandidates = [...candidateGateIds].sort(compareGateOrder);
  const visitState = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];

  function dfs(current: string): readonly string[] | null {
    visitState.set(current, 1);
    stack.push(current);

    const neighbors = downstreamMap[current] ?? [];
    for (let i = 0; i < neighbors.length; i += 1) {
      const next = neighbors[i];
      if (next === undefined || !candidateSet.has(next)) continue;
      const state = visitState.get(next) ?? 0;
      if (state === 1) {
        const startIdx = stack.indexOf(next);
        if (startIdx >= 0) {
          return [...stack.slice(startIdx), next];
        }
        return [current, next];
      }
      if (state === 0) {
        const found = dfs(next);
        if (found) return found;
      }
    }

    stack.pop();
    visitState.set(current, 2);
    return null;
  }

  for (let i = 0; i < sortedCandidates.length; i += 1) {
    const start = sortedCandidates[i];
    if (start === undefined) continue;
    if ((visitState.get(start) ?? 0) === 0) {
      const found = dfs(start);
      if (found) return found;
    }
  }

  return sortedCandidates;
}

/**
 * 9대 표준 게이트 및 커스텀 확장 DAG를 검증하고 Kahn 위상 정렬 계획을 생성한다.
 */
export function planPreflightDagTopology(
  options?: Pick<
    EpisodePreflightDagOptions,
    "customGates" | "overrideGates" | "replaceStandardGates"
  >,
): PreflightTopologyPlan {
  const rawGates = normalizeGateList(options);
  const validationErrors: PreflightDagValidationError[] = [];
  const definitionsById: Record<string, PreflightGateDefinition> = {};
  const seenIds = new Set<string>();

  for (let i = 0; i < rawGates.length; i += 1) {
    const gate = rawGates[i];
    if (!gate) continue;
    const trimmedId = gate.gateId.trim();
    if (trimmedId.length === 0) {
      validationErrors.push({
        code: "EMPTY_GATE_ID",
        detailKo: "게이트 식별자(gateId)가 비어 있어 DAG를 구성할 수 없습니다.",
      });
      continue;
    }
    if (seenIds.has(trimmedId)) {
      validationErrors.push({
        code: "DUPLICATE_GATE_ID",
        gateId: trimmedId,
        detailKo: `게이트 '${trimmedId}'가 중복 정의되어 실행 계획을 중단했습니다.`,
      });
      continue;
    }
    seenIds.add(trimmedId);
    const dedupedDeps: string[] = [];
    const depSet = new Set<string>();
    for (let j = 0; j < gate.dependsOn.length; j += 1) {
      const dep = gate.dependsOn[j];
      if (dep === undefined) continue;
      const trimmedDep = dep.trim();
      if (trimmedDep.length === 0) continue;
      if (!depSet.has(trimmedDep)) {
        depSet.add(trimmedDep);
        dedupedDeps.push(trimmedDep);
      }
    }
    definitionsById[trimmedId] = {
      ...gate,
      gateId: trimmedId,
      dependsOn: dedupedDeps,
      estimatedComputeMs:
        Number.isFinite(gate.estimatedComputeMs) && gate.estimatedComputeMs >= 0
          ? Math.round(gate.estimatedComputeMs)
          : 100,
    };
  }

  const allGateIds = Object.keys(definitionsById).sort(compareGateOrder);
  let selfCyclePath: readonly string[] = [];

  for (let i = 0; i < allGateIds.length; i += 1) {
    const gateId = allGateIds[i];
    if (gateId === undefined) continue;
    const gate = definitionsById[gateId];
    if (!gate) continue;
    for (let j = 0; j < gate.dependsOn.length; j += 1) {
      const depId = gate.dependsOn[j];
      if (depId === undefined) continue;
      if (depId === gateId) {
        selfCyclePath = [gateId, gateId];
        validationErrors.push({
          code: "SELF_DEPENDENCY",
          gateId,
          relatedGateIds: [gateId],
          detailKo: `게이트 '${gateId}'가 자기 자신을 선행 의존으로 참조합니다.`,
        });
      } else if (!definitionsById[depId]) {
        validationErrors.push({
          code: "UNKNOWN_DEPENDENCY",
          gateId,
          relatedGateIds: [depId],
          detailKo: `게이트 '${gateId}'가 등록되지 않은 선행 게이트 '${depId}'를 참조합니다.`,
        });
      }
    }
  }

  const downstreamAdjacency: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};

  for (let i = 0; i < allGateIds.length; i += 1) {
    const gateId = allGateIds[i];
    if (gateId === undefined) continue;
    downstreamAdjacency[gateId] = [];
    inDegree[gateId] = 0;
  }

  for (let i = 0; i < allGateIds.length; i += 1) {
    const gateId = allGateIds[i];
    if (gateId === undefined) continue;
    const gate = definitionsById[gateId];
    if (!gate) continue;
    for (let j = 0; j < gate.dependsOn.length; j += 1) {
      const depId = gate.dependsOn[j];
      if (depId === undefined || !definitionsById[depId]) continue;
      const children = downstreamAdjacency[depId];
      if (children) children.push(gateId);
      inDegree[gateId] = (inDegree[gateId] ?? 0) + 1;
    }
  }

  for (let i = 0; i < allGateIds.length; i += 1) {
    const gateId = allGateIds[i];
    if (gateId === undefined) continue;
    const children = downstreamAdjacency[gateId];
    if (children) children.sort(compareGateOrder);
  }

  const readyQueue: string[] = [];
  for (let i = 0; i < allGateIds.length; i += 1) {
    const gateId = allGateIds[i];
    if (gateId !== undefined && (inDegree[gateId] ?? 0) === 0) {
      readyQueue.push(gateId);
    }
  }
  readyQueue.sort(compareGateOrder);

  const topologicalOrder: string[] = [];
  while (readyQueue.length > 0) {
    const current = readyQueue.shift();
    if (current === undefined) break;
    topologicalOrder.push(current);
    const children = downstreamAdjacency[current] ?? [];
    for (let i = 0; i < children.length; i += 1) {
      const childId = children[i];
      if (childId === undefined) continue;
      const nextDegree = (inDegree[childId] ?? 0) - 1;
      inDegree[childId] = nextDegree;
      if (nextDegree === 0) {
        readyQueue.push(childId);
        readyQueue.sort(compareGateOrder);
      }
    }
  }

  let cycleDetected = selfCyclePath.length > 0;
  let cyclePathGateIds: readonly string[] = selfCyclePath;

  if (topologicalOrder.length < allGateIds.length) {
    cycleDetected = true;
    const resolvedSet = new Set<string>(topologicalOrder);
    const unresolvedIds = allGateIds.filter((id) => !resolvedSet.has(id));
    if (cyclePathGateIds.length === 0) {
      cyclePathGateIds = findDeterministicCyclePath(unresolvedIds, downstreamAdjacency);
    }
    const alreadyHasCycleError = validationErrors.some((err) => err.code === "CYCLE_DETECTED");
    if (!alreadyHasCycleError) {
      validationErrors.push({
        code: "CYCLE_DETECTED",
        relatedGateIds: cyclePathGateIds,
        detailKo: `품질 게이트 의존성 순환이 감지되어 출고 파이프라인을 차단했습니다 (${cyclePathGateIds.join(" -> ")}).`,
      });
    }
  }

  const layerDepthByGate: Record<string, number> = {};
  const transitiveDownstreamByGate: Record<string, readonly string[]> = {};

  if (!cycleDetected && validationErrors.length === 0) {
    for (let i = 0; i < topologicalOrder.length; i += 1) {
      const gateId = topologicalOrder[i];
      if (gateId === undefined) continue;
      const gate = definitionsById[gateId];
      if (!gate || gate.dependsOn.length === 0) {
        layerDepthByGate[gateId] = 0;
        continue;
      }
      let maxParentDepth = 0;
      for (let j = 0; j < gate.dependsOn.length; j += 1) {
        const depId = gate.dependsOn[j];
        if (depId === undefined) continue;
        const depDepth = layerDepthByGate[depId] ?? 0;
        if (depDepth > maxParentDepth) maxParentDepth = depDepth;
      }
      layerDepthByGate[gateId] = maxParentDepth + 1;
    }

    for (let i = topologicalOrder.length - 1; i >= 0; i -= 1) {
      const gateId = topologicalOrder[i];
      if (gateId === undefined) continue;
      const reachable = new Set<string>();
      const directChildren = downstreamAdjacency[gateId] ?? [];
      for (let j = 0; j < directChildren.length; j += 1) {
        const childId = directChildren[j];
        if (childId === undefined) continue;
        reachable.add(childId);
        const childReachable = transitiveDownstreamByGate[childId] ?? [];
        for (let k = 0; k < childReachable.length; k += 1) {
          const grandChildId = childReachable[k];
          if (grandChildId !== undefined) reachable.add(grandChildId);
        }
      }
      transitiveDownstreamByGate[gateId] = Array.from(reachable).sort(compareGateOrder);
    }
  }

  const topologyDescriptor = allGateIds.map((gateId) => {
    const def = definitionsById[gateId];
    return {
      gateId,
      dependsOn: def ? [...def.dependsOn].sort(compareGateOrder) : [],
      artifactSliceKey: def?.artifactSliceKey ?? "",
      evaluatorVersion: def?.evaluatorVersion ?? "150.1.0",
    };
  });

  const topologySha256Hex = sha256CanonicalPreflightPayload(topologyDescriptor);
  const valid = !cycleDetected && validationErrors.length === 0;

  return {
    valid,
    cycleDetected,
    cyclePathGateIds,
    validationErrors,
    definitionsById,
    topologicalOrder: valid ? topologicalOrder : [],
    layerDepthByGate,
    downstreamAdjacency,
    transitiveDownstreamByGate,
    topologySha256Hex,
  };
}
