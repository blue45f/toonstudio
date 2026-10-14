/**
 * 플롯라인 타임라인 표면 — 행=플롯라인, 열=회차인 카드 타임라인.
 *
 * - 데이터는 props로만 받는다 (StudioEpisodeStoryPage와 같은 경계).
 *   순서·템플릿·필터 판정은 studio-plotline-timeline.ts 순수 모델이 맡는다.
 * - 카드 이동은 두 경로 모두 같은 movePlotlineCard를 탄다:
 *   ① 드래그(HTML5 drag) — 셀에 드롭하면 그 셀 끝에, 카드 위에 드롭하면 그 앞에
 *   ② 카드의 "이전 화/다음 화" 버튼 — 키보드만으로도 재배열 가능
 *   이동 결과는 onCardsChange로 올라가고, 회차 플랜 반영은 호출자가
 *   applyTimelineToEpisodePlans로 수행한다.
 * - 구조 템플릿은 선택한 플롯라인 트랙에 적용한다. 이미 같은 비트가 있으면
 *   mergeTemplateCards가 중복을 막아 재적용해도 카드가 늘지 않는다.
 * - 캐릭터·장소 필터는 모델의 필터 규칙으로 트랙 자체를 좁힌다.
 */
import { useMemo, useState } from "react";
import type { SeasonPlan } from "@toonstudio/core/production";
import type { StudioStoryCharacter, StudioStoryLocation } from "../studio-story-bible";
import type { EpisodePlanWithSynopsis } from "./studio-episode-synopsis";
import {
  STRUCTURE_TEMPLATES,
  applyStructureTemplate,
  buildPlotlineTimeline,
  mergeTemplateCards,
  movePlotlineCard,
  plotlineTimelineHints,
  type PlotlineCard,
  type PlotlineTrack,
} from "./studio-plotline-timeline";

export interface StudioPlotlineTimelineProps {
  readonly season: SeasonPlan;
  readonly plans: readonly EpisodePlanWithSynopsis[];
  readonly tracks: readonly PlotlineTrack[];
  readonly cards: readonly PlotlineCard[];
  readonly characters?: readonly StudioStoryCharacter[];
  readonly locations?: readonly StudioStoryLocation[];
  readonly onCardsChange: (cards: readonly PlotlineCard[]) => void;
  readonly onSelectEpisode?: (episodeId: string) => void;
}

export function StudioPlotlineTimeline({
  season,
  plans,
  tracks,
  cards,
  characters,
  locations,
  onCardsChange,
  onSelectEpisode,
}: StudioPlotlineTimelineProps) {
  const [templateId, setTemplateId] = useState(STRUCTURE_TEMPLATES[0]?.id ?? "three-act");
  const [templateTrackId, setTemplateTrackId] = useState(tracks[0]?.id ?? "");
  const [characterFilterId, setCharacterFilterId] = useState<string>("");
  const [locationFilterId, setLocationFilterId] = useState<string>("");
  const [dragCardId, setDragCardId] = useState<string | null>(null);

  const timeline = useMemo(
    () =>
      buildPlotlineTimeline({
        season,
        plans,
        tracks,
        cards,
        characterFilterId: characterFilterId || null,
        locationFilterId: locationFilterId || null,
      }),
    [season, plans, tracks, cards, characterFilterId, locationFilterId],
  );
  const hints = useMemo(() => plotlineTimelineHints(timeline), [timeline]);
  const episodeIndexById = useMemo(
    () => new Map(timeline.episodes.map((episode, index) => [episode.episodeId, index])),
    [timeline.episodes],
  );

  const applyTemplate = () => {
    const track = tracks.find((candidate) => candidate.id === templateTrackId) ?? tracks[0];
    if (!track) return;
    const episodeIds = timeline.episodes.map((episode) => episode.episodeId);
    const existingCountsByEpisodeId: Record<string, number> = {};
    for (const card of cards) {
      if (card.plotlineId === track.id) {
        existingCountsByEpisodeId[card.episodeId] = (existingCountsByEpisodeId[card.episodeId] ?? 0) + 1;
      }
    }
    const templateCards = applyStructureTemplate({
      templateId,
      plotlineId: track.id,
      episodeIds,
      characterIds: track.characterId ? [track.characterId] : [],
      existingCountsByEpisodeId,
    });
    const merged = mergeTemplateCards(cards, templateCards);
    if (merged !== cards) onCardsChange(merged);
  };

  const dropOnCell = (episodeId: string, beforeCardId?: string) => {
    if (!dragCardId) return;
    const dragCard = cards.find((card) => card.id === dragCardId);
    if (!dragCard) return;
    const cellCards = cards
      .filter((card) => card.plotlineId === dragCard.plotlineId && card.episodeId === episodeId)
      .sort((a, b) => a.order - b.order);
    const targetIndex = beforeCardId
      ? Math.max(0, cellCards.findIndex((card) => card.id === beforeCardId))
      : cellCards.length;
    onCardsChange(movePlotlineCard(cards, dragCardId, episodeId, targetIndex));
    setDragCardId(null);
  };

  const moveByButton = (card: PlotlineCard, direction: -1 | 1) => {
    const currentIndex = episodeIndexById.get(card.episodeId);
    if (currentIndex === undefined) return;
    const target = timeline.episodes[currentIndex + direction];
    if (!target) return;
    const targetCellCount = cards.filter(
      (candidate) => candidate.plotlineId === card.plotlineId && candidate.episodeId === target.episodeId,
    ).length;
    onCardsChange(movePlotlineCard(cards, card.id, target.episodeId, targetCellCount));
  };

  return (
    <section aria-label="플롯라인 타임라인">
      <h2>플롯라인 타임라인</h2>
      <p>줄거리 흐름을 플롯라인마다 회차 위에 펼쳐 봐요. 카드를 끌어 옮기면 회차 순서에 그대로 반영돼요.</p>

      <div aria-label="구조 템플릿">
        <label>
          구조 템플릿
          <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
            {STRUCTURE_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {template.label} ({template.beats.length}비트)
              </option>
            ))}
          </select>
        </label>
        <label>
          넣을 플롯라인
          <select value={templateTrackId} onChange={(event) => setTemplateTrackId(event.target.value)}>
            {tracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={applyTemplate} disabled={tracks.length === 0 || timeline.episodes.length === 0}>
          템플릿으로 비트 채우기
        </button>
      </div>

      <div aria-label="타임라인 필터">
        <label>
          캐릭터
          <select value={characterFilterId} onChange={(event) => setCharacterFilterId(event.target.value)}>
            <option value="">전체 캐릭터</option>
            {(characters ?? []).map((character) => (
              <option key={character.id} value={character.id}>
                {character.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          장소
          <select value={locationFilterId} onChange={(event) => setLocationFilterId(event.target.value)}>
            <option value="">전체 장소</option>
            {(locations ?? []).map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {timeline.episodes.length === 0 ? (
        <p>아직 회차 줄거리가 없어요. 회차 줄거리를 적으면 그 회차가 열로 나타나요.</p>
      ) : timeline.rows.length === 0 ? (
        <p>이 필터에 맞는 플롯라인이 없어요. 필터를 풀면 전체 타임라인이 보여요.</p>
      ) : (
        <table aria-label="플롯라인별 회차 카드">
          <thead>
            <tr>
              <th scope="col">플롯라인</th>
              {timeline.episodes.map((episode) => (
                <th key={episode.episodeId} scope="col">
                  {onSelectEpisode ? (
                    <button type="button" onClick={() => onSelectEpisode(episode.episodeId)}>
                      {episode.episodeNumber}화 {episode.title}
                    </button>
                  ) : (
                    <>{episode.episodeNumber}화 {episode.title}</>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeline.rows.map((row) => (
              <tr key={row.track.id}>
                <th scope="row">{row.track.label}</th>
                {row.cells.map((cell) => (
                  <td
                    key={cell.episodeId}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      dropOnCell(cell.episodeId);
                    }}
                  >
                    {cell.cards.length === 0 ? (
                      "—"
                    ) : (
                      <ol>
                        {cell.cards.map((card) => (
                          <li
                            key={card.id}
                            draggable
                            onDragStart={() => setDragCardId(card.id)}
                            onDragEnd={() => setDragCardId(null)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              dropOnCell(cell.episodeId, card.id);
                            }}
                          >
                            <strong>{card.title}</strong>
                            {card.summary && <p>{card.summary}</p>}
                            <button type="button" onClick={() => moveByButton(card, -1)} aria-label={`${card.title} 이전 화로 이동`}>
                              이전 화
                            </button>
                            <button type="button" onClick={() => moveByButton(card, 1)} aria-label={`${card.title} 다음 화로 이동`}>
                              다음 화
                            </button>
                          </li>
                        ))}
                      </ol>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {hints.length > 0 && (
        <ul aria-label="타임라인 점검">
          {hints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
