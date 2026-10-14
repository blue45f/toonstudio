/**
 * 시즌 비트 보드 표면 (P-2) — 행=회차, 열=캐릭터 매트릭스.
 *
 * - 데이터는 props 로만 받는다 (줄거리 표면 StudioEpisodeStoryPage 와 같은 경계).
 *   셀 도출·공백·과밀 판정은 studio-season-beat-board.ts 의 순수 모델이 맡는다.
 * - 공백 구간 셀은 data-gap + "공백" 표식으로, 몰린 회차는 행 머리 배지로 표시한다.
 *   색만으로 구분하지 않고 텍스트 표식을 함께 둔다.
 * - 회차 머리를 누르면 onSelectEpisode 로 줄거리 편집 대상을 바꾼다 (연결 콜백 선택).
 */
import { useMemo } from "react";
import type { SeasonPlan } from "@toonstudio/core/production";
import type { StudioStoryCharacter } from "../studio-story-bible";
import type { StudioStoryBeat } from "../studio-storyboard-planner";
import type { EpisodePlanWithSynopsis } from "./studio-episode-synopsis";
import {
  buildSeasonBeatBoard,
  seasonBeatBoardHints,
  type SeasonBeatAssignment,
} from "./studio-season-beat-board";

export interface StudioSeasonBeatBoardProps {
  readonly season: SeasonPlan;
  readonly plans: readonly EpisodePlanWithSynopsis[];
  readonly characters: readonly StudioStoryCharacter[];
  readonly assignments?: readonly SeasonBeatAssignment[];
  readonly beatsByEpisodeId?: Readonly<Record<string, readonly StudioStoryBeat[]>>;
  readonly onSelectEpisode?: (episodeId: string) => void;
}

export function StudioSeasonBeatBoard({
  season,
  plans,
  characters,
  assignments,
  beatsByEpisodeId,
  onSelectEpisode,
}: StudioSeasonBeatBoardProps) {
  const board = useMemo(
    () => buildSeasonBeatBoard({ season, plans, characters, assignments, beatsByEpisodeId }),
    [season, plans, characters, assignments, beatsByEpisodeId],
  );
  const hints = useMemo(() => seasonBeatBoardHints(board), [board]);

  return (
    <section aria-label="시즌 비트 보드">
      <h2>시즌 비트 보드</h2>
      <p>회차마다 누가 어떤 비트를 맡는지 한눈에 봐요. 오래 비는 캐릭터와 비트가 몰린 회차가 바로 보여요.</p>

      {characters.length === 0 ? (
        <p>캐릭터가 아직 없어요. 캐릭터 시트에서 인물을 만들면 그 캐릭터가 열로 나타나요.</p>
      ) : board.rows.length === 0 ? (
        <p>아직 회차 줄거리가 없어요. 회차 줄거리를 적으면 그 회차가 행으로 나타나요.</p>
      ) : (
        <>
          {!board.hasStory && (
            <p>아직 적힌 줄거리가 없어서 보드가 비어 있어요. 회차 줄거리와 등장 캐릭터를 적으면 비트가 채워져요.</p>
          )}
          <table aria-label="회차별 캐릭터 비트">
            <thead>
              <tr>
                <th scope="col">회차</th>
                {board.columns.map((column) => (
                  <th key={column.characterId} scope="col">
                    {column.name}
                    {column.gapRuns.length > 0 ? ` · 공백 ${column.longestGap}화` : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {board.rows.map((row) => (
                <tr key={row.episodeId}>
                  <th scope="row">
                    {onSelectEpisode ? (
                      <button type="button" onClick={() => onSelectEpisode(row.episodeId)}>
                        {row.episodeNumber}화 {row.title}
                      </button>
                    ) : (
                      <>{row.episodeNumber}화 {row.title}</>
                    )}
                    {row.crowded ? " · 비트 몰림" : ""}
                    {row.bare ? " · 비트 없음" : ""}
                  </th>
                  {row.cells.map((cell) => (
                    <td
                      key={cell.characterId}
                      data-gap={cell.inLongGap ? "true" : undefined}
                      aria-label={
                        cell.present
                          ? undefined
                          : cell.inLongGap
                            ? "공백 구간"
                            : "등장 없음"
                      }
                    >
                      {cell.present ? cell.text : cell.inLongGap ? "공백" : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {hints.length > 0 && (
            <ul aria-label="배분 점검">
              {hints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
