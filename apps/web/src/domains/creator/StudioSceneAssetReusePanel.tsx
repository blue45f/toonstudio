/**
 * 장면 에셋 재사용 그래프 표면 (REPORT A-1).
 *
 * - 에셋별 대장: 사용 많은 순으로 에셋을 나열하고, 한 줄 요약
 *   (총 사용·회차·첫/마지막 회차·재사용 횟수)과 미사용 표시를 붙인다.
 * - 에셋을 고르면 아래에 "사용 이력"이 회차별로 펼쳐진다 — 회차마다
 *   쓰인 컷 칩과 컷 미지정 사용 수를 보여준다. 판정: 에셋 상세에서
 *   사용 이력이 확인됨.
 * - focusCut 이 있으면 "이 컷의 재사용 에셋"을 따로 보여준다 — 처음
 *   쓴 회차와 함께. 재사용이 아닌 에셋은 흐리게 구분한다.
 * - locationSetSuggestion 이 있으면 "지난 회차 세트 불러오기" 단축을
 *   보여준다 (적용 자체는 호출부 콜백 몫).
 *
 * 데이터는 전부 props 다. 선택 상태는 controlled(selectedAssetId)를
 * 우선하고, 없으면 내부 상태로 동작한다.
 */
import { r3c07StatusText } from "./studio-panel-status-i18n-r3c07";
import { History, Layers, MapPin, Repeat2 } from "lucide-react";
import { useState } from "react";

import {
  SCENE_ASSET_REUSE_KIND_LABELS,
  sceneAssetCutReuse,
  sceneAssetUsageHistoryForAsset,
  sceneAssetUsageSummaryLine,
  type SceneAssetLocationSetSuggestion,
  type SceneAssetReuseGraph,
} from "./studio-scene-asset-reuse-graph";

export interface StudioSceneAssetReusePanelProps {
  readonly graph: SceneAssetReuseGraph;
  readonly selectedAssetId?: string | null;
  readonly onSelectAsset?: (assetId: string) => void;
  /** 컷 단위 재사용 표시를 붙일 컷. 없으면 대장+이력만 보여준다. */
  readonly focusCut?: { readonly episodeId: string; readonly cutId: string } | null;
  readonly locationSetSuggestion?: SceneAssetLocationSetSuggestion | null;
  readonly locationSetLabel?: string | null;
  readonly onLoadLocationSet?: (
    suggestion: SceneAssetLocationSetSuggestion,
  ) => void;
  readonly onOpenEpisode?: (episodeId: string) => void;
}

const ROW_BUTTON =
  "flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 py-2 text-left text-xs text-fg-2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function StudioSceneAssetReusePanel({
  graph,
  selectedAssetId,
  onSelectAsset,
  focusCut = null,
  locationSetSuggestion = null,
  locationSetLabel = null,
  onLoadLocationSet,
  onOpenEpisode,
}: StudioSceneAssetReusePanelProps) {
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(
    null,
  );
  const effectiveSelectedId =
    selectedAssetId !== undefined ? selectedAssetId : internalSelectedId;
  const selectedHistory = effectiveSelectedId
    ? sceneAssetUsageHistoryForAsset(graph, effectiveSelectedId)
    : null;
  const cutReuse = focusCut
    ? sceneAssetCutReuse(graph, focusCut.episodeId, focusCut.cutId)
    : null;

  function handleSelect(assetId: string): void {
    if (selectedAssetId === undefined) setInternalSelectedId(assetId);
    onSelectAsset?.(assetId);
  }

  return (
    <section aria-label="장면 에셋 재사용" className="space-y-3">
      <header>
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
          <Repeat2 size={14} aria-hidden /> 에셋 재사용 대장
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-fg-3">
          어떤 에셋이 어느 회차·컷에 쓰였는지 모았습니다. 에셋을 고르면 사용
          이력이 펼쳐집니다.
        </p>
      </header>

      {locationSetSuggestion && (
        <div className="space-y-2 rounded-xl border border-accent/40 bg-card p-3">
          <p className="flex items-center gap-1.5 text-xs font-bold text-fg">
            <MapPin size={13} aria-hidden />
            {locationSetLabel ?? "이 장소"} — 지난 세트 불러오기
          </p>
          <p className="text-xs leading-relaxed text-fg-3">
            {locationSetSuggestion.episode.episodeNumber}화에 쓰인 에셋{" "}
            {locationSetSuggestion.assets.length}개가 있습니다:{" "}
            {locationSetSuggestion.assets.map((asset) => asset.name).join(", ")}
          </p>
          {onLoadLocationSet && (
            <button
              type="button"
              className="min-h-11 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              onClick={() => onLoadLocationSet(locationSetSuggestion)}
            >
              {locationSetSuggestion.episode.episodeNumber}화 세트 불러오기
            </button>
          )}
        </div>
      )}

      {graph.ledgers.length === 0 ? (
        <p className="py-4 text-center text-xs text-fg-3">
          {r3c07StatusText("studio.panelStatus.r3c07.sceneAssetReuse.assetsEmpty", "등록된 에셋이 없습니다.")}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {graph.ledgers.map((entry) => (
            <li key={entry.asset.id}>
              <button
                type="button"
                className={ROW_BUTTON}
                aria-pressed={effectiveSelectedId === entry.asset.id}
                onClick={() => handleSelect(entry.asset.id)}
              >
                <span className="min-w-0">
                  <span className="block truncate font-bold text-fg">
                    {entry.asset.name}
                    <span className="ml-1.5 font-normal text-fg-3">
                      {SCENE_ASSET_REUSE_KIND_LABELS[entry.asset.kind]}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-fg-3">
                    {sceneAssetUsageSummaryLine(entry)}
                  </span>
                </span>
                {entry.unused ? (
                  <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[0.65rem] text-fg-3">
                    미사용
                  </span>
                ) : entry.reuseUseCount > 0 ? (
                  <span className="shrink-0 rounded-full border border-accent/50 px-2 py-0.5 text-[0.65rem] font-semibold text-fg-2">
                    재사용 {entry.reuseUseCount}회
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedHistory && (
        <div
          role="region"
          aria-label={`${selectedHistory.asset.name} 사용 이력`}
          className="space-y-2 rounded-xl border border-line bg-card p-3"
        >
          <h4 className="flex items-center gap-1.5 text-xs font-bold text-fg">
            <History size={13} aria-hidden /> {selectedHistory.asset.name} 사용
            이력
          </h4>
          {selectedHistory.unused ? (
            <p className="text-xs text-fg-3">{r3c07StatusText("studio.panelStatus.r3c07.sceneAssetReuse.historyEmpty", "아직 사용 기록이 없어요.")}</p>
          ) : (
            <ul className="space-y-2">
              {selectedHistory.episodeUses.map((episodeUse) => (
                <li key={episodeUse.episode.episodeId} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-fg-2">
                      {episodeUse.episode.episodeNumber}화
                      {episodeUse.episode.title
                        ? ` 「${episodeUse.episode.title}」`
                        : ""}
                    </span>
                    {onOpenEpisode && (
                      <button
                        type="button"
                        className="text-fg-3 underline underline-offset-2 hover:text-fg-2"
                        onClick={() =>
                          onOpenEpisode(episodeUse.episode.episodeId)
                        }
                      >
                        회차 열기
                      </button>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {episodeUse.cutIds.map((cutId) => (
                      <span
                        key={cutId}
                        className="rounded-full bg-raised px-2 py-0.5 text-[0.65rem] text-fg-2"
                      >
                        컷 {cutId}
                      </span>
                    ))}
                    {episodeUse.unspecifiedCutCount > 0 && (
                      <span className="rounded-full bg-raised px-2 py-0.5 text-[0.65rem] text-fg-3">
                        컷 미지정 {episodeUse.unspecifiedCutCount}건
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {focusCut && (
        <div
          role="region"
          aria-label="이 컷의 재사용 에셋"
          className="space-y-2 rounded-xl border border-line bg-card p-3"
        >
          <h4 className="flex items-center gap-1.5 text-xs font-bold text-fg">
            <Layers size={13} aria-hidden /> 이 컷의 재사용 에셋
          </h4>
          {!cutReuse || cutReuse.assets.length === 0 ? (
            <p className="text-xs text-fg-3">
              {r3c07StatusText("studio.panelStatus.r3c07.sceneAssetReuse.cutUsageEmpty", "이 컷에 기록된 에셋 사용이 없습니다.")}
            </p>
          ) : cutReuse.reusedAssets.length === 0 ? (
            <p className="text-xs text-fg-3">
              이 컷의 에셋 {cutReuse.assets.length}개는 모두 처음 쓰였습니다.
            </p>
          ) : (
            <ul className="space-y-1">
              {cutReuse.reusedAssets.map((asset) => (
                <li
                  key={asset.assetId}
                  className="flex items-center justify-between gap-2 text-xs text-fg-2"
                >
                  <span className="min-w-0 truncate">{asset.name}</span>
                  <span className="shrink-0 text-fg-3">
                    {asset.firstEpisodeNumber}화부터 사용
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
