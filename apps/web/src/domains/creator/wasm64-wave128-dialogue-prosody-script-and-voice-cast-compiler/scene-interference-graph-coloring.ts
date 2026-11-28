/**
 * Wave 128 — 씬 공존 간섭 그래프 구축 및 DSATUR + 결정론적 백트래킹 그래프 컬러링 커널.
 *
 * - 같은 씬에 동시 등장하는 캐릭터 쌍을 무방향 간선으로 연결한다.
 * - DSATUR 우선순위와 제한 노드 백트래킹으로 동일 씬 1인 2역 충돌 0건 배정을 탐색한다.
 */

import type {
  CompiledVoiceProsodyScript,
  SameSceneDoubleCastCollision,
  SceneInterferenceEdge,
  VoiceActorTier,
} from "./voice-script-types";

const MAX_BACKTRACK_SEARCH_NODES = 24000;

export interface NormalizedVoiceActor {
  readonly actorId: string;
  readonly nameKo: string;
  readonly vocalTier: VoiceActorTier;
  readonly fixedLeadCharacterIds: readonly string[];
  readonly maxConsecutiveShoutLines: number;
  readonly hourlyRateKrw: number;
}

export interface CharacterDialogueStats {
  readonly characterId: string;
  readonly characterNameKo: string;
  readonly lineCount: number;
  readonly shoutLineCount: number;
  readonly narrationOnly: boolean;
  readonly sceneIds: readonly string[];
}

/** 대본 내 캐릭터별 대사·외침·등장 씬 통계를 집계한다. */
export function collectCharacterDialogueStats(
  script: CompiledVoiceProsodyScript,
): ReadonlyMap<string, CharacterDialogueStats> {
  const map = new Map<
    string,
    {
      characterNameKo: string;
      lineCount: number;
      shoutLineCount: number;
      nonNarrationCount: number;
      sceneSet: Set<string>;
      sceneOrder: string[];
    }
  >();

  for (let i = 0; i < script.lines.length; i += 1) {
    const line = script.lines[i];
    if (!line) continue;
    let row = map.get(line.characterId);
    if (!row) {
      row = {
        characterNameKo: line.characterNameKo,
        lineCount: 0,
        shoutLineCount: 0,
        nonNarrationCount: 0,
        sceneSet: new Set<string>(),
        sceneOrder: [],
      };
      map.set(line.characterId, row);
    }
    row.lineCount += 1;
    if (line.deliveryStyle === "shout") row.shoutLineCount += 1;
    if (line.deliveryStyle !== "narration") row.nonNarrationCount += 1;
    if (!row.sceneSet.has(line.sceneId)) {
      row.sceneSet.add(line.sceneId);
      row.sceneOrder.push(line.sceneId);
    }
  }

  const result = new Map<string, CharacterDialogueStats>();
  for (let i = 0; i < script.characterIds.length; i += 1) {
    const charId = script.characterIds[i];
    if (!charId) continue;
    const row = map.get(charId);
    if (!row) continue;
    result.set(charId, {
      characterId: charId,
      characterNameKo: row.characterNameKo,
      lineCount: row.lineCount,
      shoutLineCount: row.shoutLineCount,
      narrationOnly: row.lineCount > 0 && row.nonNarrationCount === 0,
      sceneIds: row.sceneOrder,
    });
  }
  return result;
}

/**
 * 씬 공존 간섭 그래프를 구축한다.
 * 같은 씬에 함께 등장하는 모든 캐릭터 쌍을 무방향 간선으로 연결한다.
 */
export function buildSceneInterferenceGraph(script: CompiledVoiceProsodyScript): {
  readonly adjacency: ReadonlyMap<string, ReadonlySet<string>>;
  readonly edges: readonly SceneInterferenceEdge[];
  readonly maxSceneCliqueSize: number;
} {
  const adjacency = new Map<string, Set<string>>();
  for (let i = 0; i < script.characterIds.length; i += 1) {
    const charId = script.characterIds[i];
    if (charId) adjacency.set(charId, new Set<string>());
  }

  const edgeScenes = new Map<string, Set<string>>();
  let maxSceneCliqueSize = 0;

  for (let s = 0; s < script.scenes.length; s += 1) {
    const scene = script.scenes[s];
    if (!scene) continue;
    if (scene.characterIds.length > maxSceneCliqueSize) {
      maxSceneCliqueSize = scene.characterIds.length;
    }

    for (let i = 0; i < scene.characterIds.length; i += 1) {
      const a = scene.characterIds[i];
      if (!a) continue;
      for (let j = i + 1; j < scene.characterIds.length; j += 1) {
        const b = scene.characterIds[j];
        if (!b || a === b) continue;
        const left = a < b ? a : b;
        const right = a < b ? b : a;
        adjacency.get(left)?.add(right);
        adjacency.get(right)?.add(left);
        const key = `${left}\u0000${right}`;
        let shared = edgeScenes.get(key);
        if (!shared) {
          shared = new Set<string>();
          edgeScenes.set(key, shared);
        }
        shared.add(scene.sceneId);
      }
    }
  }

  const edgeKeys = Array.from(edgeScenes.keys()).sort();
  const edges: SceneInterferenceEdge[] = [];
  for (let i = 0; i < edgeKeys.length; i += 1) {
    const key = edgeKeys[i];
    if (!key) continue;
    const parts = key.split("\u0000");
    const characterA = parts[0] ?? "";
    const characterB = parts[1] ?? "";
    const shared = edgeScenes.get(key);
    edges.push({
      characterA,
      characterB,
      sharedSceneIds: shared ? Array.from(shared).sort() : [],
    });
  }

  return { adjacency, edges, maxSceneCliqueSize };
}

function scoreActorCandidate(
  actor: NormalizedVoiceActor,
  charStats: CharacterDialogueStats,
  actorLineLoad: ReadonlyMap<string, number>,
  actorRoleCount: ReadonlyMap<string, number>,
): number {
  const lines = actorLineLoad.get(actor.actorId) ?? 0;
  const roles = actorRoleCount.get(actor.actorId) ?? 0;

  let tierPenalty: number;
  if (charStats.narrationOnly) {
    tierPenalty = actor.vocalTier === "narrator" ? -40 : actor.vocalTier === "lead" ? 15 : 0;
  } else if (charStats.lineCount >= 4 || charStats.shoutLineCount >= 2) {
    tierPenalty =
      actor.vocalTier === "lead"
        ? -20
        : actor.vocalTier === "supporting"
          ? 0
          : actor.vocalTier === "ensemble"
            ? 12
            : 25;
  } else {
    tierPenalty =
      actor.vocalTier === "supporting" || actor.vocalTier === "ensemble"
        ? -10
        : actor.vocalTier === "narrator"
          ? 18
          : 4;
  }

  return roles * 120 + lines * 8 + tierPenalty;
}

function selectNextDsaturVertex(
  uncolored: ReadonlySet<string>,
  assigned: ReadonlyMap<string, string>,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  statsMap: ReadonlyMap<string, CharacterDialogueStats>,
): string | null {
  let bestChar: string | null = null;
  let bestSat = -1;
  let bestDeg = -1;
  let bestLines = -1;

  const candidates = Array.from(uncolored).sort();
  for (let i = 0; i < candidates.length; i += 1) {
    const charId = candidates[i];
    if (!charId) continue;
    const neighbors = adjacency.get(charId);
    const neighborColors = new Set<string>();
    let deg = 0;
    if (neighbors) {
      deg = neighbors.size;
      neighbors.forEach((nb) => {
        const actorId = assigned.get(nb);
        if (actorId) neighborColors.add(actorId);
      });
    }
    const sat = neighborColors.size;
    const lines = statsMap.get(charId)?.lineCount ?? 0;

    if (
      sat > bestSat ||
      (sat === bestSat && deg > bestDeg) ||
      (sat === bestSat && deg === bestDeg && lines > bestLines) ||
      (sat === bestSat &&
        deg === bestDeg &&
        lines === bestLines &&
        (bestChar === null || charId < bestChar))
    ) {
      bestChar = charId;
      bestSat = sat;
      bestDeg = deg;
      bestLines = lines;
    }
  }
  return bestChar;
}

/** DSATUR 휴리스틱 기반 탐욕 그래프 컬러링을 수행한다. */
export function runGreedyDsaturColoring(
  characters: readonly string[],
  actors: readonly NormalizedVoiceActor[],
  fixedAssigned: ReadonlyMap<string, string>,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  statsMap: ReadonlyMap<string, CharacterDialogueStats>,
): { readonly assigned: Map<string, string>; readonly unassignable: string[] } {
  const assigned = new Map<string, string>(fixedAssigned);
  const actorLineLoad = new Map<string, number>();
  const actorRoleCount = new Map<string, number>();

  assigned.forEach((actorId, charId) => {
    actorLineLoad.set(
      actorId,
      (actorLineLoad.get(actorId) ?? 0) + (statsMap.get(charId)?.lineCount ?? 0),
    );
    actorRoleCount.set(actorId, (actorRoleCount.get(actorId) ?? 0) + 1);
  });

  const uncolored = new Set<string>();
  for (let i = 0; i < characters.length; i += 1) {
    const charId = characters[i];
    if (charId && !assigned.has(charId)) uncolored.add(charId);
  }

  const unassignable: string[] = [];

  while (uncolored.size > 0) {
    const nextChar = selectNextDsaturVertex(uncolored, assigned, adjacency, statsMap);
    if (!nextChar) break;
    uncolored.delete(nextChar);

    const neighbors = adjacency.get(nextChar);
    const forbidden = new Set<string>();
    if (neighbors) {
      neighbors.forEach((nb) => {
        const used = assigned.get(nb);
        if (used) forbidden.add(used);
      });
    }

    const charStats = statsMap.get(nextChar);
    const available: NormalizedVoiceActor[] = [];
    for (let i = 0; i < actors.length; i += 1) {
      const actor = actors[i];
      if (actor && !forbidden.has(actor.actorId)) {
        available.push(actor);
      }
    }

    if (available.length === 0 || !charStats) {
      unassignable.push(nextChar);
      continue;
    }

    available.sort((a, b) => {
      const diff =
        scoreActorCandidate(a, charStats, actorLineLoad, actorRoleCount) -
        scoreActorCandidate(b, charStats, actorLineLoad, actorRoleCount);
      if (diff !== 0) return diff;
      return a.actorId.localeCompare(b.actorId);
    });

    const chosen = available[0];
    if (!chosen) {
      unassignable.push(nextChar);
      continue;
    }
    assigned.set(nextChar, chosen.actorId);
    actorLineLoad.set(chosen.actorId, (actorLineLoad.get(chosen.actorId) ?? 0) + charStats.lineCount);
    actorRoleCount.set(chosen.actorId, (actorRoleCount.get(chosen.actorId) ?? 0) + 1);
  }

  return { assigned, unassignable };
}

/** 탐욕 DSATUR가 막힌 희소·고차 간섭 그래프에서 정확한 K-컬러링을 백트래킹 탐색한다. */
export function runExactDsaturBacktracking(
  characters: readonly string[],
  actors: readonly NormalizedVoiceActor[],
  fixedAssigned: ReadonlyMap<string, string>,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  statsMap: ReadonlyMap<string, CharacterDialogueStats>,
): Map<string, string> | null {
  if (actors.length === 0) return null;
  const assigned = new Map<string, string>(fixedAssigned);
  const uncolored = new Set<string>();
  for (let i = 0; i < characters.length; i += 1) {
    const charId = characters[i];
    if (charId && !assigned.has(charId)) uncolored.add(charId);
  }

  let visitedNodes = 0;

  function dfs(): boolean {
    if (uncolored.size === 0) return true;
    if (visitedNodes >= MAX_BACKTRACK_SEARCH_NODES) return false;
    visitedNodes += 1;

    const nextChar = selectNextDsaturVertex(uncolored, assigned, adjacency, statsMap);
    if (!nextChar) return true;

    const neighbors = adjacency.get(nextChar);
    const forbidden = new Set<string>();
    if (neighbors) {
      neighbors.forEach((nb) => {
        const used = assigned.get(nb);
        if (used) forbidden.add(used);
      });
    }

    uncolored.delete(nextChar);
    for (let i = 0; i < actors.length; i += 1) {
      const actor = actors[i];
      if (!actor || forbidden.has(actor.actorId)) continue;
      assigned.set(nextChar, actor.actorId);
      if (dfs()) return true;
      assigned.delete(nextChar);
    }
    uncolored.add(nextChar);
    return false;
  }

  return dfs() ? assigned : null;
}

/** 성우 부족 시 최소 추가로 필요한 성우 인원 수를 추정한다. */
export function estimateExtraActorsNeeded(
  characters: readonly string[],
  actors: readonly NormalizedVoiceActor[],
  fixedAssigned: ReadonlyMap<string, string>,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  statsMap: ReadonlyMap<string, CharacterDialogueStats>,
): number {
  const assigned = new Map<string, string>(fixedAssigned);
  const uncolored = new Set<string>();
  for (let i = 0; i < characters.length; i += 1) {
    const charId = characters[i];
    if (charId && !assigned.has(charId)) uncolored.add(charId);
  }

  const baseColorIds = actors.map((actor) => actor.actorId);
  let extraCount = 0;

  while (uncolored.size > 0) {
    const nextChar = selectNextDsaturVertex(uncolored, assigned, adjacency, statsMap);
    if (!nextChar) break;
    uncolored.delete(nextChar);

    const neighbors = adjacency.get(nextChar);
    const forbidden = new Set<string>();
    if (neighbors) {
      neighbors.forEach((nb) => {
        const used = assigned.get(nb);
        if (used) forbidden.add(used);
      });
    }

    let picked: string | null = null;
    for (let i = 0; i < baseColorIds.length; i += 1) {
      const id = baseColorIds[i];
      if (id && !forbidden.has(id)) {
        picked = id;
        break;
      }
    }
    if (!picked) {
      for (let v = 0; v < extraCount; v += 1) {
        const virtualId = `__shortage_actor_${v + 1}`;
        if (!forbidden.has(virtualId)) {
          picked = virtualId;
          break;
        }
      }
    }
    if (!picked) {
      extraCount += 1;
      picked = `__shortage_actor_${extraCount}`;
    }
    assigned.set(nextChar, picked);
  }

  return extraCount;
}

/** 배정 결과에 동일 씬 1인 2역 충돌이 있는지 독립 전수 검사한다. */
export function detectSameSceneDoubleCastCollisions(
  script: CompiledVoiceProsodyScript,
  assigned: ReadonlyMap<string, string>,
): readonly SameSceneDoubleCastCollision[] {
  const collisions: SameSceneDoubleCastCollision[] = [];

  for (let s = 0; s < script.scenes.length; s += 1) {
    const scene = script.scenes[s];
    if (!scene) continue;
    const actorChars = new Map<string, string[]>();
    for (let i = 0; i < scene.characterIds.length; i += 1) {
      const charId = scene.characterIds[i];
      if (!charId) continue;
      const actorId = assigned.get(charId);
      if (!actorId) continue;
      let list = actorChars.get(actorId);
      if (!list) {
        list = [];
        actorChars.set(actorId, list);
      }
      list.push(charId);
    }

    const sortedActors = Array.from(actorChars.keys()).sort();
    for (let i = 0; i < sortedActors.length; i += 1) {
      const actorId = sortedActors[i];
      if (!actorId) continue;
      const chars = actorChars.get(actorId);
      if (chars && chars.length >= 2) {
        collisions.push({
          sceneId: scene.sceneId,
          actorId,
          characterIds: chars.slice().sort(),
        });
      }
    }
  }

  return collisions;
}
