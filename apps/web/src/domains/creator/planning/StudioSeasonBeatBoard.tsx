/**
 * 시즌 비트 보드 표면 (P-2) — 행=회차, 열=캐릭터 매트릭스.
 *
 * - 데이터는 props 로만 받는다 (줄거리 표면 StudioEpisodeStoryPage 와 같은 경계).
 *   셀 도출·공백·과밀 판정은 studio-season-beat-board.ts 의 순수 모델이 맡는다.
 * - 공백 구간 셀은 data-gap + "공백" 표식으로, 몰린 회차는 행 머리 배지로 표시한다.
 *   색만으로 구분하지 않고 텍스트 표식을 함께 둔다.
 * - 회차 머리를 누르면 onSelectEpisode 로 줄거리 편집 대상을 바꾼다 (연결 콜백 선택).
 * - 회차 성과 오버레이(선택 prop `episodeMetrics`): 실집계가 연결된 경우에만
 *   회차 머리 옆에 조회·잔존 배지를 겹친다. 연결 전·로딩·실패 상태에서는
 *   숫자를 만들지 않고 상태 한 줄만 보여 주며, prop 이 없으면 기존 화면과
 *   완전히 동일하다 (studio-episode-metrics-overlay.ts 의 정직성 규칙).
 */
import { useMemo } from "react";
import { r3c04StatusText } from "../studio-r3c04-status-i18n";
import type { SeasonPlan } from "@toonstudio/core/production";
import type { StudioStoryCharacter } from "../studio-story-bible";
import type { StudioStoryBeat } from "../studio-storyboard-planner";
import type { EpisodePlanWithSynopsis } from "./studio-episode-synopsis";
import {
  buildSeasonBeatBoard,
  seasonBeatBoardHints,
  type SeasonBeatAssignment,
} from "./studio-season-beat-board";
import {
  buildEpisodeMetricsOverlay,
  episodeMetricsFeedbackHints,
  episodeMetricsStatusLine,
  formatEpisodeTrafficSummary,
  type EpisodeMetricsLoad,
} from "./studio-episode-metrics-overlay";

export interface StudioSeasonBeatBoardProps {
  readonly season: SeasonPlan;
  readonly plans: readonly EpisodePlanWithSynopsis[];
  readonly characters: readonly StudioStoryCharacter[];
  readonly assignments?: readonly SeasonBeatAssignment[];
  readonly beatsByEpisodeId?: Readonly<Record<string, readonly StudioStoryBeat[]>>;
  readonly onSelectEpisode?: (episodeId: string) => void;
  /**
   * 회차 성과(실집계) 입력. 호스트가 resolveEpisodeMetricsLoad 로 접어서 넘긴다.
   * 없거나 live 가 아니면 어떤 성과 숫자도 표시하지 않는다.
   */
  readonly episodeMetrics?: EpisodeMetricsLoad | null;
}

export function StudioSeasonBeatBoard({
  season,
  plans,
  characters,
  assignments,
  beatsByEpisodeId,
  onSelectEpisode,
  episodeMetrics,
}: StudioSeasonBeatBoardProps) {
  const board = useMemo(
    () => buildSeasonBeatBoard({ season, plans, characters, assignments, beatsByEpisodeId }),
    [season, plans, characters, assignments, beatsByEpisodeId],
  );
  const hints = useMemo(() => seasonBeatBoardHints(board), [board]);
  // 성과 오버레이는 선택 입력이다. 실패·연결 전이어도 보드 계산과 무관하게
  // 빈 오버레이로 접히므로 기존 기획 흐름을 깨지 않는다.
  const metricsOverlay = useMemo(
    () =>
      episodeMetrics
        ? buildEpisodeMetricsOverlay(board.rows, episodeMetrics)
        : null,
    [board.rows, episodeMetrics],
  );
  const metricsHints = useMemo(
    () => (metricsOverlay ? episodeMetricsFeedbackHints(metricsOverlay) : []),
    [metricsOverlay],
  );
  const metricsByEpisodeId = useMemo(
    () =>
      new Map(
        (metricsOverlay?.entries ?? []).map((entry) => [entry.episodeId, entry] as const),
      ),
    [metricsOverlay],
  );

  return (
    <section aria-label="시즌 비트 보드">
      <h2>시즌 비트 보드</h2>
      <p>회차마다 누가 어떤 비트를 맡는지 한눈에 봐요. 오래 비는 캐릭터와 비트가 몰린 회차가 바로 보여요.</p>
      {metricsOverlay && (
        <p role="status">{episodeMetricsStatusLine(metricsOverlay)}</p>
      )}
      {metricsOverlay && formatEpisodeTrafficSummary(metricsOverlay) && (
        <p data-episode-traffic="true">{formatEpisodeTrafficSummary(metricsOverlay)}</p>
      )}

      {characters.length === 0 ? (
        <p>{r3c04StatusText("studio.r3c04Status.planning.seasonBeat.noCharacters", "캐릭터가 아직 없어요. 캐릭터 시트에서 인물을 만들면 그 캐릭터가 열로 나타나요.")}</p>
      ) : board.rows.length === 0 ? (
        <p>{r3c04StatusText("studio.r3c04Status.planning.seasonBeat.emptyEpisodes", "아직 회차 줄거리가 없어요. 회차 줄거리를 적으면 그 회차가 행으로 나타나요.")}</p>
      ) : (
        <>
          {!board.hasStory && (
            <p>{r3c04StatusText("studio.r3c04Status.planning.seasonBeat.emptyBoard", "아직 적힌 줄거리가 없어서 보드가 비어 있어요. 회차 줄거리와 등장 캐릭터를 적으면 비트가 채워져요.")}</p>
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
                    {(() => {
                      const entry = metricsByEpisodeId.get(row.episodeId);
                      return entry?.badge ? (
                        <span data-episode-metrics={row.episodeNumber} title={entry.detail ?? undefined}>
                          {" · "}
                          {entry.badge}
                        </span>
                      ) : null;
                    })()}
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
          {metricsHints.length > 0 && (
            <ul aria-label="성과 피드백">
              {metricsHints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
