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
    <section
      aria-label="시즌 비트 보드"
      className="space-y-4 rounded-xl border border-line bg-panel p-4 text-fg sm:p-5"
    >
      <header className="space-y-1.5 border-b border-line pb-3">
        <h2 className="text-base font-semibold tracking-tight text-fg">시즌 비트 보드</h2>
        <p className="text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
          회차마다 누가 어떤 비트를 맡는지 한눈에 봐요. 오래 비는 캐릭터와 비트가 몰린 회차가 바로 보여요.
        </p>
        {(metricsOverlay || (metricsOverlay && formatEpisodeTrafficSummary(metricsOverlay))) && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {metricsOverlay && (
              <p
                role="status"
                className="rounded-lg border border-line bg-card px-2.5 py-1 text-xs text-fg-2"
              >
                {episodeMetricsStatusLine(metricsOverlay)}
              </p>
            )}
            {metricsOverlay && formatEpisodeTrafficSummary(metricsOverlay) && (
              <p
                data-episode-traffic="true"
                className="rounded-lg border border-accent/30 bg-accent-soft px-2.5 py-1 text-xs font-medium tabular-nums text-accent"
              >
                {formatEpisodeTrafficSummary(metricsOverlay)}
              </p>
            )}
          </div>
        )}
      </header>

      {characters.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-card/50 px-4 py-8 text-center text-sm text-fg-2">
          {r3c04StatusText("studio.r3c04Status.planning.seasonBeat.noCharacters", "캐릭터가 아직 없어요. 캐릭터 시트에서 인물을 만들면 그 캐릭터가 열로 나타나요.")}
        </p>
      ) : board.rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-card/50 px-4 py-8 text-center text-sm text-fg-2">
          {r3c04StatusText("studio.r3c04Status.planning.seasonBeat.emptyEpisodes", "아직 회차 줄거리가 없어요. 회차 줄거리를 적으면 그 회차가 행으로 나타나요.")}
        </p>
      ) : (
        <>
          {!board.hasStory && (
            <p className="rounded-lg border border-line bg-card px-3 py-2.5 text-xs leading-relaxed text-fg-2">
              {r3c04StatusText("studio.r3c04Status.planning.seasonBeat.emptyBoard", "아직 적힌 줄거리가 없어서 보드가 비어 있어요. 회차 줄거리와 등장 캐릭터를 적으면 비트가 채워져요.")}
            </p>
          )}
          <div className="overflow-x-auto rounded-xl border border-line bg-canvas">
            <table
              aria-label="회차별 캐릭터 비트"
              className="w-full min-w-[36rem] border-collapse text-left text-xs"
            >
              <thead>
                <tr className="border-b border-line bg-panel">
                  <th
                    scope="col"
                    className="sticky left-0 z-10 min-w-[11rem] border-r border-line bg-panel px-3 py-2.5 font-semibold text-fg-2"
                  >
                    회차
                  </th>
                  {board.columns.map((column) => (
                    <th
                      key={column.characterId}
                      scope="col"
                      className="min-w-[9.5rem] border-r border-line/60 px-3 py-2.5 font-semibold text-fg last:border-r-0"
                    >
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <span>{column.name}</span>
                        {column.gapRuns.length > 0 ? (
                          <span className="rounded-full border border-warn/35 bg-warn/10 px-2 py-0.5 text-xs font-medium tabular-nums text-warn">
                            · 공백 {column.longestGap}화
                          </span>
                        ) : null}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {board.rows.map((row) => {
                  const entry = metricsByEpisodeId.get(row.episodeId);
                  return (
                    <tr key={row.episodeId} className="transition-colors hover:bg-raised/40">
                      <th
                        scope="row"
                        className="sticky left-0 z-10 border-r border-line bg-panel px-3 py-2.5 align-top font-semibold text-fg"
                      >
                        <div className="flex flex-col items-start gap-1">
                          {onSelectEpisode ? (
                            <button
                              type="button"
                              onClick={() => onSelectEpisode(row.episodeId)}
                              className="inline-flex min-h-11 w-full items-center rounded-lg border border-transparent px-2 py-1 text-left text-xs font-semibold text-fg transition-colors hover:border-line hover:bg-raised hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            >
                              <span className="tabular-nums">{row.episodeNumber}화</span>
                              <span className="ml-1 truncate">{row.title}</span>
                            </button>
                          ) : (
                            <span className="inline-flex min-h-9 items-center px-1 text-xs font-semibold tabular-nums text-fg">
                              {row.episodeNumber}화 {row.title}
                            </span>
                          )}
                          {(row.crowded || row.bare || entry?.badge) && (
                            <div className="flex flex-wrap items-center gap-1 px-1">
                              {row.crowded ? (
                                <span className="rounded-full border border-warn/35 bg-warn/10 px-2 py-0.5 text-xs font-medium text-warn">
                                  · 비트 몰림
                                </span>
                              ) : null}
                              {row.bare ? (
                                <span className="rounded-full border border-line bg-raised px-2 py-0.5 text-xs font-medium text-fg-3">
                                  · 비트 없음
                                </span>
                              ) : null}
                              {entry?.badge ? (
                                <span
                                  data-episode-metrics={row.episodeNumber}
                                  title={entry.detail ?? undefined}
                                  className="rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-xs font-medium tabular-nums text-accent"
                                >
                                  {" · "}
                                  {entry.badge}
                                </span>
                              ) : null}
                            </div>
                          )}
                        </div>
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
                          className="border-r border-line/50 p-2 align-top last:border-r-0"
                        >
                          {cell.present ? (
                            <div className="rounded-lg border border-accent/35 bg-accent-soft px-2.5 py-2 text-xs leading-relaxed text-fg shadow-[inset_2px_0_0_var(--color-accent)] [word-break:keep-all]">
                              {cell.text}
                            </div>
                          ) : cell.inLongGap ? (
                            <span className="inline-flex w-full items-center justify-center rounded-lg border border-dashed border-warn/45 bg-warn/10 px-2.5 py-2 text-xs font-medium text-warn">
                              공백
                            </span>
                          ) : (
                            <span className="block py-2 text-center text-xs text-fg-3">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {hints.length > 0 && (
            <ul
              aria-label="배분 점검"
              className="space-y-1.5 rounded-xl border border-line bg-card p-3.5 text-xs leading-relaxed text-fg-2"
            >
              {hints.map((hint) => (
                <li key={hint} className="flex items-start gap-2">
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warn" />
                  <span>{hint}</span>
                </li>
              ))}
            </ul>
          )}
          {metricsHints.length > 0 && (
            <ul
              aria-label="성과 피드백"
              className="space-y-1.5 rounded-xl border border-accent/30 bg-accent-soft/50 p-3.5 text-xs leading-relaxed text-fg"
            >
              {metricsHints.map((hint) => (
                <li key={hint} className="flex items-start gap-2">
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                  <span>{hint}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
