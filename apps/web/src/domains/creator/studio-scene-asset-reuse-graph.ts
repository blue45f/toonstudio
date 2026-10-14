/**
 * 장면 에셋 재사용 그래프 (REPORT A-1, 게임 에셋 레지스트리).
 *
 * 소재·배경·의상·소품 에셋이 "어느 회차·어느 컷에 쓰였나"를 하나의
 * 관계 그래프로 접는다. 이 모듈은 순수 집계만 한다 — 저장·계측은
 * 호출부(소재 사용 대장·연속성 상태·bg3d 메타)가 맡고, 여기서는
 * 이미 쌓인 사용 기록을 에셋별 대장과 컷별 재사용 목록으로 바꾼다.
 *
 * 데이터 공유 설계 (체크리스트 판정 메모):
 * - 소재 lockfile 항목의 사용 대장(creator-marketplace-usage-ledger)과
 *   같은 사용 사실을 본다. 대장 항목은 어댑터
 *   `sceneAssetUsesFromMarketplaceUsageEntries` 로 그대로 들어온다 —
 *   대장이 핀(버전 고정)을 담당하고, 이 그래프는 사용 관계를 담당한다.
 * - P-4 설정 변경 영향 알림과도 같은 관계 그래프를 공유한다: 영향
 *   분석이 "이 에셋을 참조하는 곳"을 물을 때 이 대장이 답이 된다.
 *
 * 정직성 규칙:
 * - 카탈로그에 없는 에셋·회차 id 를 참조하는 사용 기록은 버리되
 *   ignored 카운터로 드러낸다 (없는 사용을 지어내지 않는다).
 * - cutId 가 null 인 기록은 "회차 단위 사용(컷 미지정)"으로 대장에만
 *   남고 컷 인덱스에는 넣지 않는다 — 컷을 모르면 컷이라 말하지 않는다.
 * - 사용 기록이 없는 에셋도 대장에 unused 로 남는다 (재사용 후보 발굴이
 *   목적이라 "한 번도 안 쓴 에셋"도 정보다).
 */

import type { StudioCharacterContinuityState } from "./studio-story-bible";

export type SceneAssetReuseKind =
  | "marketplace"
  | "bg3d-environment"
  | "background"
  | "scene-template"
  | "prop"
  | "costume"
  | "other";

export const SCENE_ASSET_REUSE_KIND_LABELS: Readonly<
  Record<SceneAssetReuseKind, string>
> = Object.freeze({
  marketplace: "소재",
  "bg3d-environment": "3D 배경",
  background: "2D 배경",
  "scene-template": "장면 템플릿",
  prop: "소품",
  costume: "의상",
  other: "기타",
});

export interface SceneAssetCatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly kind: SceneAssetReuseKind;
  /** 이 에셋이 속한 장소(바이블 location id). 장소 세트 제안의 근거. */
  readonly locationId?: string | null;
}

export interface SceneAssetEpisodeRef {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly title?: string | null;
}

export interface SceneAssetUseRecord {
  readonly assetId: string;
  readonly episodeId: string;
  /** 컷(페이지/패널) id. null 이면 회차 단위 사용으로만 안다. */
  readonly cutId: string | null;
  readonly sceneId?: string | null;
}

export interface SceneAssetEpisodeUse {
  readonly episode: SceneAssetEpisodeRef;
  /** 이 회차에서의 사용 기록 (입력 순서 유지). */
  readonly uses: readonly SceneAssetUseRecord[];
  /** 컷이 지정된 사용의 컷 id (중복 제거, 등장 순서). */
  readonly cutIds: readonly string[];
  /** 컷 미지정 사용 수. */
  readonly unspecifiedCutCount: number;
}

export interface SceneAssetReuseLedgerEntry {
  readonly asset: SceneAssetCatalogEntry;
  readonly totalUses: number;
  readonly episodeUses: readonly SceneAssetEpisodeUse[];
  readonly episodeCount: number;
  readonly firstEpisodeNumber: number | null;
  readonly lastEpisodeNumber: number | null;
  /** 첫 사용을 제외한 사용 수 — "재사용"으로 센 횟수. */
  readonly reuseUseCount: number;
  readonly unused: boolean;
}

export interface SceneAssetCutAssetReuse {
  readonly assetId: string;
  readonly name: string;
  readonly kind: SceneAssetReuseKind;
  /** 이 컷의 사용이 에셋의 첫 사용이 아니면 true. */
  readonly isReuse: boolean;
  /** 에셋이 처음 쓰인 회차 번호. */
  readonly firstEpisodeNumber: number;
}

export interface SceneAssetCutReuse {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly cutId: string;
  readonly assets: readonly SceneAssetCutAssetReuse[];
  /** assets 중 isReuse 인 것만. "이 컷의 재사용 에셋" 표시용. */
  readonly reusedAssets: readonly SceneAssetCutAssetReuse[];
}

export interface SceneAssetReuseGraph {
  /** 사용 많은 순 → 이름순 → id순. 미사용 에셋도 포함. */
  readonly ledgers: readonly SceneAssetReuseLedgerEntry[];
  readonly ledgerByAssetId: ReadonlyMap<string, SceneAssetReuseLedgerEntry>;
  /** 회차 번호순 → 컷 id순. 컷이 지정된 사용만 인덱싱된다. */
  readonly cuts: readonly SceneAssetCutReuse[];
  readonly cutByKey: ReadonlyMap<string, SceneAssetCutReuse>;
  /** 사용 기록이 1건이라도 있는 회차 id 집합. */
  readonly recordedEpisodeIds: ReadonlySet<string>;
  readonly ignoredUnknownAssetUseCount: number;
  readonly ignoredUnknownEpisodeUseCount: number;
}

export interface BuildSceneAssetReuseGraphInput {
  readonly assets: readonly SceneAssetCatalogEntry[];
  readonly episodes: readonly SceneAssetEpisodeRef[];
  readonly uses: readonly SceneAssetUseRecord[];
}

const CUT_KEY_SEPARATOR = "\u0000";

export function sceneAssetCutKey(episodeId: string, cutId: string): string {
  return `${episodeId}${CUT_KEY_SEPARATOR}${cutId}`;
}

interface OrderedUse {
  readonly record: SceneAssetUseRecord;
  readonly episode: SceneAssetEpisodeRef;
  readonly inputIndex: number;
  /** 정렬된 전체 사용 중 이 에셋의 첫 사용인가. */
  isFirstUseOfAsset: boolean;
}

export function buildSceneAssetReuseGraph(
  input: BuildSceneAssetReuseGraphInput,
): SceneAssetReuseGraph {
  const assetById = new Map<string, SceneAssetCatalogEntry>();
  for (const asset of input.assets) {
    if (!assetById.has(asset.id)) assetById.set(asset.id, asset);
  }
  const episodeById = new Map<string, SceneAssetEpisodeRef>();
  for (const episode of input.episodes) {
    if (!episodeById.has(episode.episodeId)) {
      episodeById.set(episode.episodeId, episode);
    }
  }

  let ignoredUnknownAssetUseCount = 0;
  let ignoredUnknownEpisodeUseCount = 0;
  const ordered: OrderedUse[] = [];
  input.uses.forEach((record, inputIndex) => {
    if (!assetById.has(record.assetId)) {
      ignoredUnknownAssetUseCount += 1;
      return;
    }
    const episode = episodeById.get(record.episodeId);
    if (!episode) {
      ignoredUnknownEpisodeUseCount += 1;
      return;
    }
    ordered.push({ record, episode, inputIndex, isFirstUseOfAsset: false });
  });
  ordered.sort(
    (a, b) =>
      a.episode.episodeNumber - b.episode.episodeNumber ||
      a.inputIndex - b.inputIndex,
  );

  const seenAssetIds = new Set<string>();
  const firstEpisodeNumberByAssetId = new Map<string, number>();
  for (const use of ordered) {
    if (!seenAssetIds.has(use.record.assetId)) {
      seenAssetIds.add(use.record.assetId);
      use.isFirstUseOfAsset = true;
      firstEpisodeNumberByAssetId.set(
        use.record.assetId,
        use.episode.episodeNumber,
      );
    }
  }

  // 에셋별 대장.
  const usesByAssetId = new Map<string, OrderedUse[]>();
  const recordedEpisodeIds = new Set<string>();
  for (const use of ordered) {
    recordedEpisodeIds.add(use.episode.episodeId);
    const list = usesByAssetId.get(use.record.assetId);
    if (list) list.push(use);
    else usesByAssetId.set(use.record.assetId, [use]);
  }

  const ledgers: SceneAssetReuseLedgerEntry[] = [];
  const ledgerByAssetId = new Map<string, SceneAssetReuseLedgerEntry>();
  for (const asset of assetById.values()) {
    const assetUses = usesByAssetId.get(asset.id) ?? [];
    const byEpisode = new Map<string, OrderedUse[]>();
    for (const use of assetUses) {
      const list = byEpisode.get(use.episode.episodeId);
      if (list) list.push(use);
      else byEpisode.set(use.episode.episodeId, [use]);
    }
    const episodeUses: SceneAssetEpisodeUse[] = [];
    for (const episodeUseList of byEpisode.values()) {
      const first = episodeUseList[0];
      if (!first) continue;
      const cutIds: string[] = [];
      const seenCutIds = new Set<string>();
      let unspecifiedCutCount = 0;
      for (const use of episodeUseList) {
        if (use.record.cutId === null) {
          unspecifiedCutCount += 1;
        } else if (!seenCutIds.has(use.record.cutId)) {
          seenCutIds.add(use.record.cutId);
          cutIds.push(use.record.cutId);
        }
      }
      episodeUses.push({
        episode: first.episode,
        uses: episodeUseList.map((use) => use.record),
        cutIds,
        unspecifiedCutCount,
      });
    }
    const firstEpisodeNumber =
      assetUses.length > 0
        ? Math.min(...assetUses.map((use) => use.episode.episodeNumber))
        : null;
    const lastEpisodeNumber =
      assetUses.length > 0
        ? Math.max(...assetUses.map((use) => use.episode.episodeNumber))
        : null;
    const entry: SceneAssetReuseLedgerEntry = {
      asset,
      totalUses: assetUses.length,
      episodeUses,
      episodeCount: episodeUses.length,
      firstEpisodeNumber,
      lastEpisodeNumber,
      reuseUseCount: Math.max(0, assetUses.length - 1),
      unused: assetUses.length === 0,
    };
    ledgers.push(entry);
    ledgerByAssetId.set(asset.id, entry);
  }
  ledgers.sort(
    (a, b) =>
      b.totalUses - a.totalUses ||
      a.asset.name.localeCompare(b.asset.name) ||
      a.asset.id.localeCompare(b.asset.id),
  );

  // 컷별 인덱스 (컷 지정 사용만).
  const cutMap = new Map<
    string,
    {
      episodeId: string;
      episodeNumber: number;
      cutId: string;
      byAssetId: Map<string, { containsFirstUse: boolean }>;
    }
  >();
  for (const use of ordered) {
    if (use.record.cutId === null) continue;
    const key = sceneAssetCutKey(use.episode.episodeId, use.record.cutId);
    let bucket = cutMap.get(key);
    if (!bucket) {
      bucket = {
        episodeId: use.episode.episodeId,
        episodeNumber: use.episode.episodeNumber,
        cutId: use.record.cutId,
        byAssetId: new Map(),
      };
      cutMap.set(key, bucket);
    }
    const existing = bucket.byAssetId.get(use.record.assetId);
    if (existing) {
      existing.containsFirstUse =
        existing.containsFirstUse || use.isFirstUseOfAsset;
    } else {
      bucket.byAssetId.set(use.record.assetId, {
        containsFirstUse: use.isFirstUseOfAsset,
      });
    }
  }
  const cuts: SceneAssetCutReuse[] = [];
  const cutByKey = new Map<string, SceneAssetCutReuse>();
  for (const [key, bucket] of cutMap) {
    const assets: SceneAssetCutAssetReuse[] = [];
    for (const [assetId, info] of bucket.byAssetId) {
      const asset = assetById.get(assetId);
      const firstEpisodeNumber = firstEpisodeNumberByAssetId.get(assetId);
      if (!asset || firstEpisodeNumber === undefined) continue;
      assets.push({
        assetId,
        name: asset.name,
        kind: asset.kind,
        isReuse: !info.containsFirstUse,
        firstEpisodeNumber,
      });
    }
    assets.sort(
      (a, b) =>
        Number(b.isReuse) - Number(a.isReuse) ||
        a.name.localeCompare(b.name) ||
        a.assetId.localeCompare(b.assetId),
    );
    const cut: SceneAssetCutReuse = {
      episodeId: bucket.episodeId,
      episodeNumber: bucket.episodeNumber,
      cutId: bucket.cutId,
      assets,
      reusedAssets: assets.filter((asset) => asset.isReuse),
    };
    cuts.push(cut);
    cutByKey.set(key, cut);
  }
  cuts.sort(
    (a, b) =>
      a.episodeNumber - b.episodeNumber || a.cutId.localeCompare(b.cutId),
  );

  return {
    ledgers,
    ledgerByAssetId,
    cuts,
    cutByKey,
    recordedEpisodeIds,
    ignoredUnknownAssetUseCount,
    ignoredUnknownEpisodeUseCount,
  };
}

/** 에셋 상세의 "사용 이력" — 없으면 null (카탈로그에 없는 에셋). */
export function sceneAssetUsageHistoryForAsset(
  graph: SceneAssetReuseGraph,
  assetId: string,
): SceneAssetReuseLedgerEntry | null {
  return graph.ledgerByAssetId.get(assetId) ?? null;
}

/** 컷 패널의 "이 컷의 재사용 에셋" — 컷 기록이 없으면 null. */
export function sceneAssetCutReuse(
  graph: SceneAssetReuseGraph,
  episodeId: string,
  cutId: string,
): SceneAssetCutReuse | null {
  return graph.cutByKey.get(sceneAssetCutKey(episodeId, cutId)) ?? null;
}

export interface SceneAssetLocationSetSuggestion {
  readonly locationId: string;
  /** 세트를 가져올 가장 최근의 지난 회차. */
  readonly episode: SceneAssetEpisodeRef;
  readonly assets: readonly SceneAssetCatalogEntry[];
}

/**
 * 같은 장소 세트 단축 (REPORT A-1): 새 회차에서 장소를 고르면, 그 장소에서
 * 쓰인 에셋 묶음을 가장 최근 지난 회차 기준으로 제안한다. 세트의 버전
 * 관리 자체는 A-4(같은 장소 세트 패키지) 몫이라 여기서는 제안까지만 한다.
 */
export function suggestSceneAssetLocationSet(
  graph: SceneAssetReuseGraph,
  locationId: string,
  beforeEpisodeNumber: number,
): SceneAssetLocationSetSuggestion | null {
  let bestEpisode: SceneAssetEpisodeRef | null = null;
  const bestAssets: SceneAssetCatalogEntry[] = [];
  for (const ledger of graph.ledgers) {
    if (ledger.asset.locationId !== locationId) continue;
    for (const episodeUse of ledger.episodeUses) {
      if (episodeUse.episode.episodeNumber >= beforeEpisodeNumber) continue;
      if (
        bestEpisode === null ||
        episodeUse.episode.episodeNumber > bestEpisode.episodeNumber
      ) {
        bestEpisode = episodeUse.episode;
        bestAssets.length = 0;
        bestAssets.push(ledger.asset);
      } else if (episodeUse.episode.episodeNumber === bestEpisode.episodeNumber) {
        bestAssets.push(ledger.asset);
      }
    }
  }
  if (bestEpisode === null) return null;
  return {
    locationId,
    episode: bestEpisode,
    assets: [...bestAssets].sort(
      (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    ),
  };
}

/** 에셋 상세에 붙는 한 줄 요약. 기록이 없으면 없다고 말한다. */
export function sceneAssetUsageSummaryLine(
  entry: SceneAssetReuseLedgerEntry,
): string {
  if (entry.unused || entry.firstEpisodeNumber === null) {
    return "아직 사용 기록이 없어요";
  }
  const parts = [
    `총 ${entry.totalUses}회 사용`,
    `${entry.episodeCount}개 회차`,
    `첫 ${entry.firstEpisodeNumber}화`,
  ];
  if (
    entry.lastEpisodeNumber !== null &&
    entry.lastEpisodeNumber !== entry.firstEpisodeNumber
  ) {
    parts.push(`마지막 ${entry.lastEpisodeNumber}화`);
  }
  if (entry.reuseUseCount > 0) parts.push(`재사용 ${entry.reuseUseCount}회`);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// 어댑터 — 기존 데이터 소스를 그래프 입력으로 접는다.
// ---------------------------------------------------------------------------

/**
 * 소재 사용 대장(lockfile 항목) 항목의 구조적 부분집합.
 * `CreatorMarketplaceAssetUsageEntry` 가 그대로 들어온다.
 */
export interface SceneAssetMarketplaceUsageEntryLike {
  readonly logicalPackId: string;
  readonly locationId: string;
  readonly locationKind: string;
  readonly episodeId: string | null;
}

export interface SceneAssetAdapterResult {
  readonly uses: readonly SceneAssetUseRecord[];
  /** 회차 미지정 등 그래프에 넣을 수 없어 건너뛴 건수. */
  readonly skippedCount: number;
}

/**
 * 대장 항목 → 사용 기록. 컷 위치(canvas-layer·scene-node)의 locationId 를
 * 컷 식별자로 삼고, 그 외 위치(tool-slot·project-library)는 회차 단위
 * 사용으로만 기록한다. episodeId 가 없는 항목은 건너뛰되 수로 드러낸다.
 */
export function sceneAssetUsesFromMarketplaceUsageEntries(
  entries: readonly SceneAssetMarketplaceUsageEntryLike[],
): SceneAssetAdapterResult {
  const uses: SceneAssetUseRecord[] = [];
  let skippedCount = 0;
  for (const entry of entries) {
    if (entry.episodeId === null) {
      skippedCount += 1;
      continue;
    }
    const cutId =
      entry.locationKind === "canvas-layer" ||
      entry.locationKind === "scene-node"
        ? entry.locationId
        : null;
    uses.push({ assetId: entry.logicalPackId, episodeId: entry.episodeId, cutId });
  }
  return { uses, skippedCount };
}

/** bg3d 환경 카탈로그 에셋 → 카탈로그 항목. */
export function sceneAssetCatalogFromBg3dEnvironments(
  assets: readonly { readonly id: string; readonly name: string }[],
): readonly SceneAssetCatalogEntry[] {
  return assets.map((asset) => ({
    id: asset.id,
    name: asset.name,
    kind: "bg3d-environment" as const,
    locationId: null,
  }));
}

const UNIFIED_SOURCE_KIND_MAP: Readonly<Record<string, SceneAssetReuseKind>> =
  Object.freeze({
    background: "background",
    "scene-template": "scene-template",
    "object-3d": "prop",
  });

/** 통합 소재 카탈로그(StudioUnifiedAssetItem) → 카탈로그 항목. */
export function sceneAssetCatalogFromUnifiedItems(
  items: readonly {
    readonly id: string;
    readonly title: string;
    readonly source: { readonly kind: string };
  }[],
): readonly SceneAssetCatalogEntry[] {
  return items.map((item) => ({
    id: item.id,
    name: item.title,
    kind: UNIFIED_SOURCE_KIND_MAP[item.source.kind] ?? "other",
    locationId: null,
  }));
}

export interface SceneAssetContinuityAdapterResult extends SceneAssetAdapterResult {
  /** 의상·소품 id 로 만든 카탈로그 항목 (이름은 id — 표시명은 호출부가 덮을 수 있다). */
  readonly catalogEntries: readonly SceneAssetCatalogEntry[];
}

/**
 * 연속성 상태(장면별 의상·소품) → 사용 기록 + 카탈로그 항목.
 * 장면→회차 매핑이 없는 장면은 건너뛰고 skippedCount 로 드러낸다.
 * 의상·소품은 컷이 아니라 장면 단위 기록이라 cutId 는 null 이다.
 */
export function sceneAssetUsesFromContinuityStates(
  states: readonly StudioCharacterContinuityState[],
  sceneEpisodeId: ReadonlyMap<string, string> | Readonly<Record<string, string>>,
): SceneAssetContinuityAdapterResult {
  const lookup = (sceneId: string): string | undefined =>
    sceneEpisodeId instanceof Map
      ? sceneEpisodeId.get(sceneId)
      : (sceneEpisodeId as Readonly<Record<string, string>>)[sceneId];
  const uses: SceneAssetUseRecord[] = [];
  const catalogById = new Map<string, SceneAssetCatalogEntry>();
  let skippedCount = 0;
  const addCatalog = (
    id: string,
    kind: SceneAssetReuseKind,
    locationId: string | null,
  ): void => {
    if (!catalogById.has(id)) {
      catalogById.set(id, { id, name: id, kind, locationId });
    }
  };
  for (const state of states) {
    const episodeId = lookup(state.sceneId);
    if (!episodeId) {
      skippedCount += 1;
      continue;
    }
    if (state.costumeId !== null) {
      addCatalog(state.costumeId, "costume", state.locationId);
      uses.push({
        assetId: state.costumeId,
        episodeId,
        cutId: null,
        sceneId: state.sceneId,
      });
    }
    for (const propId of state.propIds) {
      addCatalog(propId, "prop", state.locationId);
      uses.push({
        assetId: propId,
        episodeId,
        cutId: null,
        sceneId: state.sceneId,
      });
    }
  }
  return { uses, catalogEntries: [...catalogById.values()], skippedCount };
}
