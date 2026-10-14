import { describe, expect, it } from "vitest";

import {
  addModelSheetRevision,
  freezeModelSheet,
  reviseFrozenModelSheet,
  type CharacterModelSheet,
  type ModelSheetRevisionInput,
} from "./model-sheet-freeze-model";
import {
  aggregateModelSheetUsage,
  buildModelSheetUsageForCharacter,
  episodeArtReached,
  modelSheetUsageSummaryLine,
  EMPTY_MODEL_SHEET_USAGE_SOURCES,
  type ModelSheetUsageSources,
} from "./model-sheet-usage-model";

/**
 * 실측 대조 테스트.
 *
 * 픽스처는 실제 레코드 모양(core CutPlan/ScenePlan/EpisodeCollaboration,
 * 바이블 연속성 상태)을 구조적으로 본뜬 것이고, 기대값 표(EXPECTED)는
 * 집계 코드를 보지 않고 손으로 센 대조표다. 집계 결과가 대조표와
 * 어긋나면 코드가 아니라 대조표와 함께 다시 실측해야 한다.
 *
 * 시나리오: 주인공(char-1) 모델 시트 —
 * - 리비전 1: 2026-09-01 생성, 2026-09-02 동결.
 * - 리비전 2: 2026-10-05 동결 변경(사유 있음). 이후 기준본은 2.
 */

function revisionInput(partial: Partial<ModelSheetRevisionInput> = {}): ModelSheetRevisionInput {
  return {
    expressionRef: "asset-expression-1",
    poseRef: "asset-pose-1",
    assetRefs: [],
    note: "",
    authorId: "artist-1",
    authorName: "작가",
    createdAt: "2026-09-01T08:00:00.000Z",
    ...partial,
  };
}

function changedSheet(): CharacterModelSheet {
  const drafted = addModelSheetRevision(
    { characterId: "char-1", status: "draft", revisions: [], frozenRevision: null, frozenById: null, frozenByName: null, frozenAt: null, changes: [] },
    revisionInput(),
  ).sheet;
  const frozen = freezeModelSheet(drafted, {
    byId: "lead-1",
    byName: "리드",
    at: "2026-09-02T09:00:00.000Z",
  }).sheet;
  return reviseFrozenModelSheet(frozen, {
    ...revisionInput({ expressionRef: "asset-expression-2", createdAt: "2026-10-05T08:00:00.000Z" }),
    reason: "표정을 더 날카롭게",
  }).sheet;
}

const SOURCES: ModelSheetUsageSources = {
  episodes: [
    { episodeId: "ep-1", episodeNumber: 1, title: "시작" },
    { episodeId: "ep-2", episodeNumber: 2, title: "" },
    { episodeId: "ep-3", episodeNumber: 3, title: "전환" },
    { episodeId: "ep-4", episodeNumber: 4, title: "" },
    { episodeId: "ep-5", episodeNumber: 5, title: "" },
  ],
  cuts: [
    // 1화: 유효 컷 3개(a 중복 기록 1건 포함) + 폐기 컷 1개 + 남의 컷 1개.
    { episodeId: "ep-1", sceneId: "s1", cutId: "cut-a", characterRefs: ["char-1"], status: "approved" },
    { episodeId: "ep-1", sceneId: "s1", cutId: "cut-b", characterRefs: ["char-1", "char-2"], status: "approved" },
    { episodeId: "ep-1", sceneId: "s2", cutId: "cut-c", characterRefs: ["char-1"], status: "locked" },
    { episodeId: "ep-1", sceneId: "s1", cutId: "cut-a", characterRefs: ["char-1"], status: "approved" },
    { episodeId: "ep-1", sceneId: "s2", cutId: "cut-d", characterRefs: ["char-1"], status: "superseded" },
    { episodeId: "ep-1", sceneId: "s1", cutId: "cut-z", characterRefs: ["char-2"], status: "approved" },
    // 3화: 유효 컷 2개(같은 장면).
    { episodeId: "ep-3", sceneId: "s5", cutId: "cut-e", characterRefs: ["char-1"], status: "approved" },
    { episodeId: "ep-3", sceneId: "s5", cutId: "cut-f", characterRefs: ["char-1"], status: "draft" },
    // 5화: 유효 컷 1개.
    { episodeId: "ep-5", sceneId: "s7", cutId: "cut-g", characterRefs: ["char-1"], status: "approved" },
    // 모르는 회차를 가리키는 컷 — 버리되 센다.
    { episodeId: "ep-999", sceneId: "s9", cutId: "cut-h", characterRefs: ["char-1"], status: "approved" },
  ],
  scenes: [
    // 2화는 컷 기록이 없어 장면이 폴백 근거가 된다.
    { episodeId: "ep-2", sceneId: "s3", characterRefs: ["char-1"] },
    { episodeId: "ep-2", sceneId: "s4", characterRefs: ["char-2"] },
  ],
  continuityStates: [
    // 2화의 또 다른 장면 s4에 주인공이 있었다(연속성 상태 근거).
    { sceneId: "s4", sequence: 3, characterId: "char-1", costumeId: null, appearanceId: null, injuryIds: [], propIds: [], knownFactIds: [], locationId: null },
    // 회차 매핑이 없는 장면 — 접지 못하고 센다.
    { sceneId: "sX", sequence: 1, characterId: "char-1", costumeId: null, appearanceId: null, injuryIds: [], propIds: [], knownFactIds: [], locationId: null },
  ],
  sceneEpisode: { s3: "ep-2", s4: "ep-2" },
  artEvidence: [
    { episodeId: "ep-1", state: "published", updatedAt: "2026-09-10T10:00:00.000Z" },
    { episodeId: "ep-2", state: "final-art-production", updatedAt: "2026-08-20T10:00:00.000Z" },
    { episodeId: "ep-3", state: "lettering-and-integration", updatedAt: "2026-10-08T10:00:00.000Z" },
    { episodeId: "ep-4", state: "published", updatedAt: "2026-10-10T10:00:00.000Z" },
    { episodeId: "ep-5", state: "final-art-production", updatedAt: null },
  ],
  stamps: [
    // 4화는 등장 근거가 스탬프뿐이고, 스탬프(리비전 1)가 타임라인 추정(2)보다 우선한다.
    { episodeId: "ep-4", characterId: "char-1", drawnRevision: 1, stampedAt: "2026-09-20T10:00:00.000Z" },
  ],
};

/** 손으로 센 대조표 — 집계 코드와 독립적으로 작성한 기대값. */
const EXPECTED = [
  { episodeId: "ep-1", cutCount: 3, cutSource: "cuts", sceneCount: 2, drawnRevision: 1, drawnRevisionSource: "timeline" },
  { episodeId: "ep-2", cutCount: 2, cutSource: "scenes", sceneCount: 2, drawnRevision: 0, drawnRevisionSource: "pre-freeze" },
  { episodeId: "ep-3", cutCount: 2, cutSource: "cuts", sceneCount: 1, drawnRevision: 2, drawnRevisionSource: "timeline" },
  { episodeId: "ep-4", cutCount: 0, cutSource: "stamp-only", sceneCount: 0, drawnRevision: 1, drawnRevisionSource: "stamp" },
  { episodeId: "ep-5", cutCount: 1, cutSource: "cuts", sceneCount: 1, drawnRevision: null, drawnRevisionSource: "indeterminate" },
] as const;

describe("model sheet usage auto aggregation — 실측 대조", () => {
  it("matches the hand-counted table for cuts, scene fallback, and drawn revisions", () => {
    const usage = buildModelSheetUsageForCharacter("char-1", changedSheet(), SOURCES);
    expect(
      usage.episodes.map((entry) => ({
        episodeId: entry.episodeId,
        cutCount: entry.cutCount,
        cutSource: entry.cutSource,
        sceneCount: entry.sceneCount,
        drawnRevision: entry.drawnRevision,
        drawnRevisionSource: entry.drawnRevisionSource,
      })),
    ).toEqual(EXPECTED);
    expect(usage.episodes[0]?.episodeLabel).toBe("1화 「시작」");
    expect(usage.episodes[1]?.episodeLabel).toBe("2화");
  });

  it("reports totals and every dropped/excluded record — nothing vanishes silently", () => {
    const usage = buildModelSheetUsageForCharacter("char-1", changedSheet(), SOURCES);
    expect(usage.totalCutCount).toBe(6); // 3 + 2 + 1 (컷 출처만)
    expect(usage.totalSceneFallbackCount).toBe(2); // 2화 장면 폴백
    expect(usage.drawnEpisodeCount).toBe(4); // 1·2·3·4화 확정, 5화는 판정 불가
    expect(usage.indeterminateEpisodeIds).toEqual(["ep-5"]);
    expect(usage.ignoredRecordCount).toBe(1); // ep-999 컷
    expect(usage.excludedCutCount).toBe(1); // superseded cut-d
    expect(usage.unmappedContinuityCount).toBe(1); // sX
    expect(modelSheetUsageSummaryLine(usage)).toContain("판정할 수 없는 회차 1개");
  });

  it("feeds deriveModelSheetImpact directly — affected episodes match the hand-derived set", () => {
    const sheet = changedSheet();
    const { usages, impacts, ignoredRecordCount } = aggregateModelSheetUsage([sheet], SOURCES);
    expect(usages).toHaveLength(1);
    expect(ignoredRecordCount).toBe(1);
    const impact = impacts.get("char-1");
    // 기준본 2보다 옛것으로 그린 회차: 1화(리비전 1)·2화(동결 전)·4화(스탬프 1).
    // 3화는 리비전 2로 그렸고, 5화는 판정 불가라 영향에도 넣지 않는다(요약이 따로 드러낸다).
    expect(impact?.affectedEpisodes.map((episode) => episode.episodeId)).toEqual(["ep-1", "ep-2", "ep-4"]);
    expect(impact?.affectedCutCount).toBe(5); // 3 + 2 + 0
    expect(impact?.unacknowledgedEpisodeIds).toEqual(["ep-1", "ep-2", "ep-4"]);
  });
});

describe("model sheet usage — honesty edges", () => {
  it("treats episodes before final art as not drawn, even with many cuts", () => {
    const sources: ModelSheetUsageSources = {
      ...EMPTY_MODEL_SHEET_USAGE_SOURCES,
      episodes: [{ episodeId: "ep-1", episodeNumber: 1, title: "" }],
      cuts: [{ episodeId: "ep-1", sceneId: "s1", cutId: "cut-a", characterRefs: ["char-1"], status: "draft" }],
      artEvidence: [{ episodeId: "ep-1", state: "thumbnailing", updatedAt: "2026-09-10T10:00:00.000Z" }],
    };
    const usage = buildModelSheetUsageForCharacter("char-1", changedSheet(), sources);
    expect(usage.episodes[0]).toMatchObject({ cutCount: 1, drawnRevision: null, drawnRevisionSource: "not-drawn" });
    expect(episodeArtReached("thumbnail-locked")).toBe(false);
    expect(episodeArtReached("final-art-production")).toBe(true);
    expect(episodeArtReached("published")).toBe(true);
    expect(episodeArtReached("cancelled")).toBe(false);
  });

  it("marks drawnRevision indeterminate when the sheet record itself is missing", () => {
    const sources: ModelSheetUsageSources = {
      ...EMPTY_MODEL_SHEET_USAGE_SOURCES,
      episodes: [{ episodeId: "ep-1", episodeNumber: 1, title: "" }],
      cuts: [{ episodeId: "ep-1", sceneId: "s1", cutId: "cut-a", characterRefs: ["char-1"], status: "approved" }],
      artEvidence: [{ episodeId: "ep-1", state: "published", updatedAt: "2026-09-10T10:00:00.000Z" }],
    };
    const usage = buildModelSheetUsageForCharacter("char-1", null, sources);
    expect(usage.episodes[0]).toMatchObject({ drawnRevision: null, drawnRevisionSource: "indeterminate" });
    expect(usage.indeterminateEpisodeIds).toEqual(["ep-1"]);
  });

  it("uses the latest stamp when several stamps exist for one episode", () => {
    const sources: ModelSheetUsageSources = {
      ...EMPTY_MODEL_SHEET_USAGE_SOURCES,
      episodes: [{ episodeId: "ep-1", episodeNumber: 1, title: "" }],
      stamps: [
        { episodeId: "ep-1", characterId: "char-1", drawnRevision: 1, stampedAt: "2026-09-03T10:00:00.000Z" },
        { episodeId: "ep-1", characterId: "char-1", drawnRevision: 2, stampedAt: "2026-10-06T10:00:00.000Z" },
      ],
    };
    const usage = buildModelSheetUsageForCharacter("char-1", changedSheet(), sources);
    expect(usage.episodes[0]).toMatchObject({ drawnRevision: 2, drawnRevisionSource: "stamp", cutSource: "stamp-only" });
  });

  it("returns an empty usage (not invented rows) when there are no records at all", () => {
    const usage = buildModelSheetUsageForCharacter("char-1", changedSheet(), EMPTY_MODEL_SHEET_USAGE_SOURCES);
    expect(usage.episodes).toEqual([]);
    expect(usage.totalCutCount).toBe(0);
    expect(modelSheetUsageSummaryLine(usage)).toContain("등장 기록이 없어");
  });
});
