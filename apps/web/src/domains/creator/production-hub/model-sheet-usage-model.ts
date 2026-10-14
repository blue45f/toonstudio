/**
 * 모델 시트 사용량 자동 집계 — 순수 모델 (모델 시트 동결 게이트 후속).
 *
 * 문제: 동결 게이트의 영향 분석(deriveModelSheetImpact)은 회차별
 * "캐릭터 등장 컷 수 + 그 회차를 그린 기준 리비전(drawnRevision)"을
 * 입력(usage)으로 받는데, 지금까지는 호스트가 이 값을 손으로 집계해야
 * 했다. 손 집계는 빠지기 쉽고, 빠진 회차는 영향 경고에서 조용히 사라진다.
 * 이 모델이 그 집계를 컷·장면·연속성 상태·회차 작화 상태에서 자동으로
 * 도출해, 영향 분석이 그대로 받는 ModelSheetUsageEpisode 목록을 만든다.
 *
 * 입력 계약은 전부 실측한 실제 레코드의 구조적 부분집합이다:
 * - 컷: core CutPlan { episodeId, sceneId, cutId, characterRefs, status }.
 * - 장면: core ScenePlan { episodeId, sceneId, characterRefs }.
 * - 연속성: StudioCharacterContinuityState { sceneId, characterId, … } +
 *   장면→회차 매핑(sceneEpisode) — 커버리지 맵·등장 역조회와 같은 계약.
 * - 작화 상태: core EpisodeCollaboration { episodeId, state, updatedAt }.
 * - 명시 스탬프: 작화 시작 시점에 기준 리비전을 찍어 둔 기록이 있으면
 *   그것이 최우선이다(호스트가 남길 수 있는 가장 정확한 근거).
 *
 * 정직성 규칙 (기존 레인들과 동일 — 숫자를 지어내지 않는다):
 * - 컷 수 이중계상 금지: 컷 기록이 있는 회차×캐릭터는 컷만으로 센다.
 *   장면은 컷이 없을 때만 폴백으로 쓰고, 그때 cutCount는 "컷 수"가 아니라
 *   "등장 장면 수"이며 cutSource: "scenes"로 출처를 드러낸다
 *   (커버리지 맵의 연속성 어댑터와 같은 고지 방식).
 * - status가 superseded/archived인 컷은 이미 폐기된 컷이라 세지 않고
 *   excludedCutCount로 드러낸다. 같은 cutId가 중복 기록되면 1컷이다.
 * - drawnRevision을 단정할 수 없으면 지어내지 않는다:
 *   · 작화 단계에 닿지 않은 회차는 null + "not-drawn" (영향 분석이
 *     "새 기준본을 처음부터 적용"으로 올바르게 제외한다).
 *   · 작화에는 닿았지만 근거(시각·시트 이력)가 없어 판정 불가면
 *     null + "indeterminate"로 분리해 집계 결과와 요약 문구에 드러낸다.
 *     영향 분석 입력에서는 not-drawn과 겉모양이 같아지므로, 표면은
 *     indeterminateEpisodeIds를 반드시 함께 보여 줘야 한다.
 *   · 동결 전에 그려진 회차는 drawnRevision 0 + "pre-freeze"다.
 *     기준본 없이 그렸다는 뜻이며 영향 분석(0 < frozenRevision)이
 *     영향 회차로 잡는 것이 맞다.
 * - 타임라인 근사: 시트에 동결 시각은 최신 동결분(frozenAt)만 남는다.
 *   변경 이력(changes)이 있으면 변경 시각들로 구간을 나누고, 첫 변경
 *   이전 구간은 리비전 생성 시각(createdAt)부터 그 리비전이 동결돼
 *   있었다고 본다. 생성 전에 그려졌으면 pre-freeze다. 이 근사는
 *   drawnRevisionSource: "timeline"으로 출처를 드러낸다.
 * - 모르는 회차를 가리키는 기록은 버리되 ignoredRecordCount로 드러낸다.
 *   모르는 캐릭터를 가리키는 컷·장면 기록은 그 캐릭터의 집계에서만
 *   빠진다(남의 기록을 "버려진 것"으로 세지 않는 등장 역조회와 동일).
 */
import type { StudioCharacterContinuityState } from "../studio-story-bible";

import {
  deriveModelSheetImpact,
  type CharacterModelSheet,
  type ModelSheetImpact,
  type ModelSheetUsageEpisode,
} from "./model-sheet-freeze-model";

/* ------------------------------------------------------------------ */
/* 입력 계약 — 실제 레코드의 구조적 부분집합                             */
/* ------------------------------------------------------------------ */

/** 집계가 열로 삼는 회차 최소 참조. core EpisodePlan이 구조적으로 만족한다. */
export interface ModelSheetUsageEpisodeRef {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly title: string;
}

/** 컷 1개. core CutPlan이 구조적으로 만족한다. */
export interface ModelSheetUsageCutRecord {
  readonly episodeId: string;
  readonly sceneId: string;
  readonly cutId: string;
  readonly characterRefs: readonly string[];
  /** PlanningDocumentStatus 문자열. superseded/archived는 폐기된 컷으로 제외한다. */
  readonly status: string;
}

/** 장면 1개. core ScenePlan이 구조적으로 만족한다. */
export interface ModelSheetUsageSceneRecord {
  readonly episodeId: string;
  readonly sceneId: string;
  readonly characterRefs: readonly string[];
}

/** 회차 작화 진척 근거. core EpisodeCollaboration이 구조적으로 만족한다. */
export interface ModelSheetUsageArtEvidence {
  readonly episodeId: string;
  /** EpisodeCollaborationState 문자열. */
  readonly state: string;
  /** 마지막 갱신 시각(ISO). 작화에 닿은 회차의 "그린 시점" 근사로 쓴다. */
  readonly updatedAt: string | null;
}

/**
 * 명시 스탬프 — 작화를 시작할 때 기준으로 삼은 모델 시트 리비전을
 * 호스트가 찍어 둔 기록. 있으면 타임라인 추정보다 항상 우선한다.
 */
export interface ModelSheetUsageRevisionStamp {
  readonly episodeId: string;
  readonly characterId: string;
  readonly drawnRevision: number;
  /** 스탬프를 찍은 시각(ISO). 같은 회차×캐릭터에 여럿이면 가장 최근 것을 쓴다. */
  readonly stampedAt: string | null;
}

export interface ModelSheetUsageSources {
  readonly episodes: readonly ModelSheetUsageEpisodeRef[];
  readonly cuts: readonly ModelSheetUsageCutRecord[];
  readonly scenes: readonly ModelSheetUsageSceneRecord[];
  readonly continuityStates: readonly StudioCharacterContinuityState[];
  /** 장면 id → 회차 id. 연속성 상태를 회차로 접는 데 필요하다. */
  readonly sceneEpisode: Readonly<Record<string, string>>;
  readonly artEvidence: readonly ModelSheetUsageArtEvidence[];
  readonly stamps: readonly ModelSheetUsageRevisionStamp[];
}

export const EMPTY_MODEL_SHEET_USAGE_SOURCES: ModelSheetUsageSources = Object.freeze({
  episodes: Object.freeze([]),
  cuts: Object.freeze([]),
  scenes: Object.freeze([]),
  continuityStates: Object.freeze([]),
  sceneEpisode: Object.freeze({}),
  artEvidence: Object.freeze([]),
  stamps: Object.freeze([]),
});

/* ------------------------------------------------------------------ */
/* 작화 도달 판정                                                       */
/* ------------------------------------------------------------------ */

/**
 * "이 회차는 (선화 기준본으로) 그려지기 시작했다"고 말할 수 있는 협업 상태.
 * thumbnail-locked까지는 콘티 단계라 아직 그리지 않은 것으로 본다 —
 * 동결 게이트가 지키는 것은 선화 이후 수정 비용이기 때문이다.
 * cancelled는 진척을 말할 수 없어 제외한다(production-episode-stage와 동일).
 */
export const MODEL_SHEET_ART_REACHED_STATES: ReadonlySet<string> = new Set([
  "final-art-production",
  "lettering-and-integration",
  "joint-proof",
  "publish-ready",
  "published",
]);

export function episodeArtReached(state: string): boolean {
  return MODEL_SHEET_ART_REACHED_STATES.has(state);
}

/* ------------------------------------------------------------------ */
/* 집계 결과                                                            */
/* ------------------------------------------------------------------ */

export type ModelSheetCutSource = "cuts" | "scenes" | "stamp-only";

export type ModelSheetDrawnRevisionSource =
  | "stamp"
  | "timeline"
  | "pre-freeze"
  | "not-drawn"
  | "indeterminate";

/**
 * 회차×캐릭터 사용량 1건. ModelSheetUsageEpisode를 그대로 확장하므로
 * deriveModelSheetImpact에 추가 변환 없이 넘길 수 있다.
 */
export interface ModelSheetUsageEntry extends ModelSheetUsageEpisode {
  readonly episodeNumber: number;
  /** cutCount의 출처. "scenes"면 cutCount는 컷 수가 아니라 등장 장면 수다. */
  readonly cutSource: ModelSheetCutSource;
  /** 등장 장면 수(컷·장면·연속성 합집합 기준). 근거가 없으면 0. */
  readonly sceneCount: number;
  readonly drawnRevisionSource: ModelSheetDrawnRevisionSource;
  /** drawnRevision 판정에 쓴 그린 시점(스탬프 시각 또는 작화 갱신 시각). 없으면 null. */
  readonly drawnAt: string | null;
}

export interface CharacterModelSheetUsage {
  readonly characterId: string;
  /** episodeNumber 오름차순. 등장 근거가 있는 회차만 들어간다. */
  readonly episodes: readonly ModelSheetUsageEntry[];
  /** 컷 기록으로 센 컷 수 합계 (cutSource "cuts"인 회차만). */
  readonly totalCutCount: number;
  /** 장면 폴백으로 센 장면 수 합계 (cutSource "scenes"인 회차만). */
  readonly totalSceneFallbackCount: number;
  /** 작화에 닿아 drawnRevision이 확정된 회차 수 (stamp/timeline/pre-freeze). */
  readonly drawnEpisodeCount: number;
  /** 판정 불가(indeterminate) 회차 id들 — 표면이 숨기지 말고 보여 줄 것. */
  readonly indeterminateEpisodeIds: readonly string[];
  /** 이 캐릭터를 가리키지만 모르는 회차를 참조해 버려진 기록 수. */
  readonly ignoredRecordCount: number;
  /** 폐기 상태(superseded/archived)라 세지 않은, 이 캐릭터가 걸린 컷 수. */
  readonly excludedCutCount: number;
  /** 회차 매핑이 없어 접지 못한, 이 캐릭터의 연속성 상태 수. */
  readonly unmappedContinuityCount: number;
}

export interface ModelSheetUsageAggregation {
  /** sheets 순서와 같은 순서의 캐릭터별 집계. */
  readonly usages: readonly CharacterModelSheetUsage[];
  /** deriveModelSheetImpact 결과 — 패널·게이트가 그대로 받는 영향 분석 입력. */
  readonly impacts: ReadonlyMap<string, ModelSheetImpact>;
  /** 전체 캐릭터 합산 버려진 기록 수. */
  readonly ignoredRecordCount: number;
}

/* ------------------------------------------------------------------ */
/* drawnRevision 타임라인 도출                                          */
/* ------------------------------------------------------------------ */

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 시각 t에 동결돼 있던 리비전을 시트 이력만으로 복원한다.
 * - 동결된 적 없으면 null이 아니라 0(pre-freeze) — 기준본 없이 그린 것이다.
 *   단, 시트 레코드 자체가 없으면(sheet null) 이력 자체를 모르므로 판정 불가.
 * - 변경이 있으면 변경 시각이 구간 경계다. 첫 변경 이전은 fromRevision
 *   구간이되, 그 리비전이 만들어지기도 전이면 pre-freeze(0)다.
 */
function revisionFrozenAt(
  sheet: CharacterModelSheet,
  atMs: number,
): { readonly revision: number; readonly source: "timeline" | "pre-freeze" } | null {
  if (sheet.frozenRevision === null) {
    // 동결 이력이 전혀 없다. 리비전이 하나라도 있었던 시트면 "동결 없이
    // 그렸다"고 말할 수 있지만, 빈 시트뿐이면 그린 시점에 시트가 있었는지
    // 자체를 모른다 — 그래도 작화 근거가 있는 이상 기준본 없이 그린
    // 것으로 보는 편이 경고를 숨기지 않는다.
    return { revision: 0, source: "pre-freeze" };
  }
  const changes = [...sheet.changes].sort(
    (a, b) => (parseTime(a.changedAt) ?? 0) - (parseTime(b.changedAt) ?? 0),
  );
  const firstChange = changes[0];
  if (firstChange) {
    const firstChangeMs = parseTime(firstChange.changedAt);
    if (firstChangeMs !== null && atMs < firstChangeMs) {
      const fromRevision = sheet.revisions.find(
        (revision) => revision.revision === firstChange.fromRevision,
      );
      const createdMs = fromRevision ? parseTime(fromRevision.createdAt) : null;
      if (createdMs !== null && atMs < createdMs) return { revision: 0, source: "pre-freeze" };
      return { revision: firstChange.fromRevision, source: "timeline" };
    }
    let current = firstChange.toRevision;
    for (const change of changes) {
      const changeMs = parseTime(change.changedAt);
      if (changeMs !== null && atMs >= changeMs) current = change.toRevision;
    }
    return { revision: current, source: "timeline" };
  }
  const frozenMs = parseTime(sheet.frozenAt);
  if (frozenMs === null) return null; // 동결됐다는데 시각이 없다 — 판정 불가.
  if (atMs < frozenMs) return { revision: 0, source: "pre-freeze" };
  return { revision: sheet.frozenRevision, source: "timeline" };
}

function deriveDrawnRevision(
  sheet: CharacterModelSheet | null,
  episodeId: string,
  characterId: string,
  sources: ModelSheetUsageSources,
  artByEpisode: ReadonlyMap<string, ModelSheetUsageArtEvidence>,
): Pick<ModelSheetUsageEntry, "drawnRevision" | "drawnRevisionSource" | "drawnAt"> {
  // 1) 명시 스탬프가 최우선. 같은 회차×캐릭터에 여럿이면 최근 스탬프.
  let stamp: ModelSheetUsageRevisionStamp | null = null;
  let stampMs = Number.NEGATIVE_INFINITY;
  for (const candidate of sources.stamps) {
    if (candidate.episodeId !== episodeId || candidate.characterId !== characterId) continue;
    const ms = parseTime(candidate.stampedAt) ?? Number.NEGATIVE_INFINITY;
    if (!stamp || ms >= stampMs) {
      stamp = candidate;
      stampMs = ms;
    }
  }
  if (stamp) {
    const revision =
      Number.isFinite(stamp.drawnRevision) && stamp.drawnRevision >= 0
        ? Math.floor(stamp.drawnRevision)
        : null;
    if (revision !== null) {
      return { drawnRevision: revision, drawnRevisionSource: "stamp", drawnAt: stamp.stampedAt };
    }
  }

  // 2) 작화 상태로 "그렸는가"를 먼저 가른다.
  const art = artByEpisode.get(episodeId);
  if (!art || !episodeArtReached(art.state)) {
    return { drawnRevision: null, drawnRevisionSource: "not-drawn", drawnAt: null };
  }

  // 3) 그렸다면 그린 시점 × 시트 이력으로 리비전을 복원한다.
  const drawnMs = parseTime(art.updatedAt);
  if (drawnMs === null || !sheet) {
    return { drawnRevision: null, drawnRevisionSource: "indeterminate", drawnAt: art.updatedAt };
  }
  const restored = revisionFrozenAt(sheet, drawnMs);
  if (!restored) {
    return { drawnRevision: null, drawnRevisionSource: "indeterminate", drawnAt: art.updatedAt };
  }
  return {
    drawnRevision: restored.revision,
    drawnRevisionSource: restored.source,
    drawnAt: art.updatedAt,
  };
}

/* ------------------------------------------------------------------ */
/* 캐릭터 1명 집계                                                      */
/* ------------------------------------------------------------------ */

export function buildModelSheetUsageForCharacter(
  characterId: string,
  sheet: CharacterModelSheet | null,
  sources: ModelSheetUsageSources,
): CharacterModelSheetUsage {
  const episodeById = new Map(sources.episodes.map((episode) => [episode.episodeId, episode]));
  const artByEpisode = new Map(sources.artEvidence.map((evidence) => [evidence.episodeId, evidence]));
  let ignoredRecordCount = 0;
  let excludedCutCount = 0;
  let unmappedContinuityCount = 0;

  // 컷: 회차별 cutId 집합으로 중복을 접는다.
  const cutIdsByEpisode = new Map<string, Set<string>>();
  const sceneIdsByEpisode = new Map<string, Set<string>>();
  const addScene = (episodeId: string, sceneId: string) => {
    const set = sceneIdsByEpisode.get(episodeId) ?? new Set<string>();
    set.add(sceneId);
    sceneIdsByEpisode.set(episodeId, set);
  };

  for (const cut of sources.cuts) {
    if (!cut.characterRefs.includes(characterId)) continue;
    if (!episodeById.has(cut.episodeId)) {
      ignoredRecordCount += 1;
      continue;
    }
    if (cut.status === "superseded" || cut.status === "archived") {
      excludedCutCount += 1;
      continue;
    }
    const set = cutIdsByEpisode.get(cut.episodeId) ?? new Set<string>();
    set.add(cut.cutId);
    cutIdsByEpisode.set(cut.episodeId, set);
    if (cut.sceneId) addScene(cut.episodeId, cut.sceneId);
  }

  for (const scene of sources.scenes) {
    if (!scene.characterRefs.includes(characterId)) continue;
    if (!episodeById.has(scene.episodeId)) {
      ignoredRecordCount += 1;
      continue;
    }
    addScene(scene.episodeId, scene.sceneId);
  }

  for (const state of sources.continuityStates) {
    if (state.characterId !== characterId) continue;
    const episodeId = sources.sceneEpisode[state.sceneId];
    if (!episodeId) {
      unmappedContinuityCount += 1;
      continue;
    }
    if (!episodeById.has(episodeId)) {
      ignoredRecordCount += 1;
      continue;
    }
    addScene(episodeId, state.sceneId);
  }

  // 스탬프만 있고 등장 근거가 없는 회차도 "그렸다"는 사실 자체는 사용량이다.
  const stampEpisodeIds = new Set<string>();
  for (const stamp of sources.stamps) {
    if (stamp.characterId !== characterId) continue;
    if (!episodeById.has(stamp.episodeId)) {
      ignoredRecordCount += 1;
      continue;
    }
    stampEpisodeIds.add(stamp.episodeId);
  }

  const presentEpisodeIds = new Set<string>([
    ...cutIdsByEpisode.keys(),
    ...sceneIdsByEpisode.keys(),
    ...stampEpisodeIds,
  ]);

  const entries: ModelSheetUsageEntry[] = [...presentEpisodeIds]
    .map((episodeId) => {
      const episode = episodeById.get(episodeId) as ModelSheetUsageEpisodeRef;
      const cutCountFromCuts = cutIdsByEpisode.get(episodeId)?.size ?? 0;
      const sceneCount = sceneIdsByEpisode.get(episodeId)?.size ?? 0;
      const hasCuts = cutCountFromCuts > 0;
      const drawn = deriveDrawnRevision(sheet, episodeId, characterId, sources, artByEpisode);
      return Object.freeze({
        episodeId,
        episodeLabel: episode.title.trim()
          ? `${episode.episodeNumber}화 「${episode.title.trim()}」`
          : `${episode.episodeNumber}화`,
        episodeNumber: episode.episodeNumber,
        cutCount: hasCuts ? cutCountFromCuts : sceneCount,
        cutSource: hasCuts
          ? ("cuts" as const)
          : sceneCount > 0
            ? ("scenes" as const)
            : ("stamp-only" as const),
        sceneCount,
        drawnRevision: drawn.drawnRevision,
        drawnRevisionSource: drawn.drawnRevisionSource,
        drawnAt: drawn.drawnAt,
      });
    })
    .sort((a, b) => a.episodeNumber - b.episodeNumber || a.episodeId.localeCompare(b.episodeId));

  return Object.freeze({
    characterId,
    episodes: Object.freeze(entries),
    totalCutCount: entries
      .filter((entry) => entry.cutSource === "cuts")
      .reduce((sum, entry) => sum + entry.cutCount, 0),
    totalSceneFallbackCount: entries
      .filter((entry) => entry.cutSource === "scenes")
      .reduce((sum, entry) => sum + entry.cutCount, 0),
    drawnEpisodeCount: entries.filter(
      (entry) => entry.drawnRevisionSource === "stamp"
        || entry.drawnRevisionSource === "timeline"
        || entry.drawnRevisionSource === "pre-freeze",
    ).length,
    indeterminateEpisodeIds: Object.freeze(
      entries
        .filter((entry) => entry.drawnRevisionSource === "indeterminate")
        .map((entry) => entry.episodeId),
    ),
    ignoredRecordCount,
    excludedCutCount,
    unmappedContinuityCount,
  });
}

/* ------------------------------------------------------------------ */
/* 전 캐릭터 집계 + 영향 분석 입력                                      */
/* ------------------------------------------------------------------ */

/**
 * 시트 전원에 대해 사용량을 자동 집계하고, 그 결과를 그대로
 * deriveModelSheetImpact에 넣어 캐릭터별 영향 분석까지 만든다.
 * 패널(ModelSheetFreezePanel)의 impacts와 선화 게이트의 입력이
 * 이 반환값 하나로 채워진다 — 호스트의 손 집계가 사라지는 지점이다.
 */
export function aggregateModelSheetUsage(
  sheets: readonly CharacterModelSheet[],
  sources: ModelSheetUsageSources,
): ModelSheetUsageAggregation {
  const usages = sheets.map((sheet) =>
    buildModelSheetUsageForCharacter(sheet.characterId, sheet, sources),
  );
  const impacts = new Map<string, ModelSheetImpact>();
  for (const [index, sheet] of sheets.entries()) {
    const usage = usages[index];
    if (usage) impacts.set(sheet.characterId, deriveModelSheetImpact(sheet, usage.episodes));
  }
  return Object.freeze({
    usages: Object.freeze(usages),
    impacts,
    ignoredRecordCount: usages.reduce((sum, usage) => sum + usage.ignoredRecordCount, 0),
  });
}

/** 집계 요약 한 줄 — 출처와 판정 불가를 숨기지 않는 문구가 판정 기준이다. */
export function modelSheetUsageSummaryLine(usage: CharacterModelSheetUsage): string {
  if (usage.episodes.length === 0) return "등장 기록이 없어 사용량을 집계할 회차가 없어요.";
  const parts: string[] = [`${usage.episodes.length}개 회차 등장`];
  if (usage.totalCutCount > 0) parts.push(`컷 ${usage.totalCutCount}개`);
  if (usage.totalSceneFallbackCount > 0) {
    parts.push(`컷 기록이 없는 회차는 장면 ${usage.totalSceneFallbackCount}개로 셌어요`);
  }
  parts.push(`그린 회차 ${usage.drawnEpisodeCount}개`);
  if (usage.indeterminateEpisodeIds.length > 0) {
    parts.push(
      `기준 리비전을 판정할 수 없는 회차 ${usage.indeterminateEpisodeIds.length}개가 있어요 — 영향에서 빠졌을 수 있으니 확인해 주세요`,
    );
  }
  if (usage.excludedCutCount > 0) parts.push(`폐기된 컷 ${usage.excludedCutCount}개는 세지 않았어요`);
  return `${parts.join(" · ")}.`;
}
