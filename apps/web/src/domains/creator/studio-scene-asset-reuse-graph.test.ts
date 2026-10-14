import { describe, expect, it } from "vitest";

import type { StudioCharacterContinuityState } from "./studio-story-bible";
import {
  buildSceneAssetReuseGraph,
  sceneAssetCatalogFromBg3dEnvironments,
  sceneAssetCatalogFromUnifiedItems,
  sceneAssetCutReuse,
  sceneAssetUsageHistoryForAsset,
  sceneAssetUsageSummaryLine,
  sceneAssetUsesFromContinuityStates,
  sceneAssetUsesFromMarketplaceUsageEntries,
  suggestSceneAssetLocationSet,
  type SceneAssetCatalogEntry,
  type SceneAssetEpisodeRef,
  type SceneAssetUseRecord,
} from "./studio-scene-asset-reuse-graph";

const ASSETS: readonly SceneAssetCatalogEntry[] = [
  { id: "bg-school", name: "학교 교실", kind: "bg3d-environment", locationId: "loc-school" },
  { id: "bg-cafe", name: "카페 내부", kind: "bg3d-environment", locationId: "loc-cafe" },
  { id: "prop-cup", name: "머그컵", kind: "prop", locationId: "loc-cafe" },
  { id: "costume-uniform", name: "교복", kind: "costume", locationId: null },
  { id: "bg-unused", name: "미사용 배경", kind: "background", locationId: null },
];

const EPISODES: readonly SceneAssetEpisodeRef[] = [
  { episodeId: "ep1", episodeNumber: 1, title: "시작" },
  { episodeId: "ep2", episodeNumber: 2, title: "전학" },
  { episodeId: "ep3", episodeNumber: 3, title: "축제" },
];

const USES: readonly SceneAssetUseRecord[] = [
  { assetId: "bg-school", episodeId: "ep1", cutId: "c1" },
  { assetId: "costume-uniform", episodeId: "ep1", cutId: "c1" },
  { assetId: "bg-school", episodeId: "ep1", cutId: "c2" },
  { assetId: "bg-cafe", episodeId: "ep2", cutId: "c1" },
  { assetId: "prop-cup", episodeId: "ep2", cutId: "c1" },
  { assetId: "bg-school", episodeId: "ep3", cutId: "c7" },
  { assetId: "costume-uniform", episodeId: "ep3", cutId: null },
  { assetId: "prop-cup", episodeId: "ep2", cutId: "c1" },
  // 모르는 에셋/회차 — 버려지되 카운터로 드러나야 한다.
  { assetId: "ghost", episodeId: "ep1", cutId: "c1" },
  { assetId: "bg-school", episodeId: "ep99", cutId: "c1" },
];

function buildGraph() {
  return buildSceneAssetReuseGraph({ assets: ASSETS, episodes: EPISODES, uses: USES });
}

describe("buildSceneAssetReuseGraph — 에셋별 대장", () => {
  it("회차·컷을 에셋별로 접고 첫/마지막 회차와 재사용 횟수를 센다", () => {
    const graph = buildGraph();
    const school = sceneAssetUsageHistoryForAsset(graph, "bg-school");
    expect(school).not.toBeNull();
    expect(school?.totalUses).toBe(3);
    expect(school?.episodeCount).toBe(2);
    expect(school?.firstEpisodeNumber).toBe(1);
    expect(school?.lastEpisodeNumber).toBe(3);
    expect(school?.reuseUseCount).toBe(2);
    expect(school?.episodeUses.map((use) => use.episode.episodeNumber)).toEqual([1, 3]);
    expect(school?.episodeUses[0]?.cutIds).toEqual(["c1", "c2"]);
  });

  it("컷 미지정 사용은 unspecifiedCutCount 로만 남는다", () => {
    const graph = buildGraph();
    const costume = sceneAssetUsageHistoryForAsset(graph, "costume-uniform");
    expect(costume?.totalUses).toBe(2);
    const ep3 = costume?.episodeUses.find((use) => use.episode.episodeNumber === 3);
    expect(ep3?.cutIds).toEqual([]);
    expect(ep3?.unspecifiedCutCount).toBe(1);
  });

  it("미사용 에셋도 unused 로 대장에 남는다", () => {
    const graph = buildGraph();
    const unused = sceneAssetUsageHistoryForAsset(graph, "bg-unused");
    expect(unused?.unused).toBe(true);
    expect(unused?.totalUses).toBe(0);
    expect(unused?.firstEpisodeNumber).toBeNull();
  });

  it("대장은 사용 많은 순으로 정렬된다", () => {
    const graph = buildGraph();
    expect(graph.ledgers[0]?.asset.id).toBe("bg-school");
    expect(graph.ledgers[graph.ledgers.length - 1]?.asset.id).toBe("bg-unused");
  });

  it("모르는 에셋·회차 사용은 버리고 카운터로 드러낸다", () => {
    const graph = buildGraph();
    expect(graph.ignoredUnknownAssetUseCount).toBe(1);
    expect(graph.ignoredUnknownEpisodeUseCount).toBe(1);
    expect(graph.recordedEpisodeIds).toEqual(new Set(["ep1", "ep2", "ep3"]));
  });

  it("카탈로그에 없는 에셋 이력은 null 이다", () => {
    expect(sceneAssetUsageHistoryForAsset(buildGraph(), "nope")).toBeNull();
  });
});

describe("컷별 재사용 에셋", () => {
  it("처음 쓰는 컷은 재사용이 아니고, 뒤 회차 컷은 재사용이다", () => {
    const graph = buildGraph();
    const first = sceneAssetCutReuse(graph, "ep1", "c1");
    expect(first?.assets.map((asset) => asset.assetId).sort()).toEqual([
      "bg-school",
      "costume-uniform",
    ]);
    expect(first?.reusedAssets).toEqual([]);

    const later = sceneAssetCutReuse(graph, "ep3", "c7");
    expect(later?.reusedAssets).toHaveLength(1);
    expect(later?.reusedAssets[0]).toMatchObject({
      assetId: "bg-school",
      isReuse: true,
      firstEpisodeNumber: 1,
    });
  });

  it("같은 컷에 같은 에셋이 두 번 기록돼도 한 번만 나온다", () => {
    const graph = buildGraph();
    const cut = sceneAssetCutReuse(graph, "ep2", "c1");
    expect(cut?.assets.map((asset) => asset.assetId).sort()).toEqual([
      "bg-cafe",
      "prop-cup",
    ]);
  });

  it("기록 없는 컷은 null 이다", () => {
    expect(sceneAssetCutReuse(buildGraph(), "ep1", "c99")).toBeNull();
  });
});

describe("sceneAssetUsageSummaryLine", () => {
  it("사용 이력을 한 줄로 요약한다", () => {
    const graph = buildGraph();
    const school = sceneAssetUsageHistoryForAsset(graph, "bg-school");
    expect(school && sceneAssetUsageSummaryLine(school)).toBe(
      "총 3회 사용 · 2개 회차 · 첫 1화 · 마지막 3화 · 재사용 2회",
    );
  });

  it("미사용이면 기록이 없다고 말한다", () => {
    const graph = buildGraph();
    const unused = sceneAssetUsageHistoryForAsset(graph, "bg-unused");
    expect(unused && sceneAssetUsageSummaryLine(unused)).toBe(
      "아직 사용 기록이 없어요",
    );
  });
});

describe("suggestSceneAssetLocationSet", () => {
  it("기준 회차보다 앞선 가장 최근 회차의 장소 에셋 묶음을 제안한다", () => {
    const graph = buildGraph();
    const suggestion = suggestSceneAssetLocationSet(graph, "loc-cafe", 3);
    expect(suggestion?.episode.episodeNumber).toBe(2);
    expect(suggestion?.assets.map((asset) => asset.id).sort()).toEqual([
      "bg-cafe",
      "prop-cup",
    ]);
  });

  it("지난 사용이 없으면 null 이다", () => {
    const graph = buildGraph();
    expect(suggestSceneAssetLocationSet(graph, "loc-school", 1)).toBeNull();
    expect(suggestSceneAssetLocationSet(graph, "loc-nowhere", 9)).toBeNull();
  });
});

describe("어댑터", () => {
  it("소재 사용 대장 항목을 접는다 — 컷 위치만 컷 id가 되고 회차 없으면 건너뛴다", () => {
    const result = sceneAssetUsesFromMarketplaceUsageEntries([
      { logicalPackId: "pack-a", locationId: "layer-1", locationKind: "canvas-layer", episodeId: "ep1" },
      { logicalPackId: "pack-a", locationId: "slot-1", locationKind: "tool-slot", episodeId: "ep2" },
      { logicalPackId: "pack-b", locationId: "node-1", locationKind: "scene-node", episodeId: null },
    ]);
    expect(result.skippedCount).toBe(1);
    expect(result.uses).toEqual([
      { assetId: "pack-a", episodeId: "ep1", cutId: "layer-1" },
      { assetId: "pack-a", episodeId: "ep2", cutId: null },
    ]);
  });

  it("bg3d 환경 카탈로그를 bg3d-environment 항목으로 만든다", () => {
    expect(
      sceneAssetCatalogFromBg3dEnvironments([{ id: "env-1", name: "교실" }]),
    ).toEqual([
      { id: "env-1", name: "교실", kind: "bg3d-environment", locationId: null },
    ]);
  });

  it("통합 카탈로그 source 종류를 재사용 종류로 매핑한다", () => {
    const entries = sceneAssetCatalogFromUnifiedItems([
      { id: "u1", title: "배경", source: { kind: "background" } },
      { id: "u2", title: "템플릿", source: { kind: "scene-template" } },
      { id: "u3", title: "소품", source: { kind: "object-3d" } },
      { id: "u4", title: "로컬", source: { kind: "local" } },
    ]);
    expect(entries.map((entry) => entry.kind)).toEqual([
      "background",
      "scene-template",
      "prop",
      "other",
    ]);
  });

  it("연속성 상태에서 의상·소품 사용과 카탈로그를 뽑고 매핑 없는 장면은 센다", () => {
    const states: readonly StudioCharacterContinuityState[] = [
      {
        sceneId: "s1",
        sequence: 1,
        characterId: "hero",
        costumeId: "uniform",
        appearanceId: null,
        injuryIds: [],
        propIds: ["cup", "bag"],
        knownFactIds: [],
        locationId: "loc-cafe",
      },
      {
        sceneId: "sX",
        sequence: 2,
        characterId: "hero",
        costumeId: "uniform",
        appearanceId: null,
        injuryIds: [],
        propIds: [],
        knownFactIds: [],
        locationId: null,
      },
    ];
    const result = sceneAssetUsesFromContinuityStates(states, { s1: "ep2" });
    expect(result.skippedCount).toBe(1);
    expect(result.uses).toHaveLength(3);
    expect(result.uses[0]).toMatchObject({ assetId: "uniform", episodeId: "ep2", cutId: null });
    expect(
      result.catalogEntries.map((entry) => `${entry.id}:${entry.kind}`).sort(),
    ).toEqual(["bag:prop", "cup:prop", "uniform:costume"]);
    const uniform = result.catalogEntries.find((entry) => entry.id === "uniform");
    expect(uniform?.locationId).toBe("loc-cafe");
  });
});
