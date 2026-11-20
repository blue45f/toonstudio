/**
 * 캐릭터 커버리지 맵 표면 (REPORT P-3).
 *
 * - 히트맵: 행=캐릭터, 열=회차. 셀 숫자는 그 회차의 컷 수, 진하기는 작품 내
 *   최대 컷 수 대비 비율이다. 기록이 아예 없는 회차 열은 "기록 없음"으로
 *   표시해 "등장 안 함"과 구분한다 (코어의 unknown 상태).
 * - 캐릭터를 고르면 아래에 "마지막 등장 요약"이 뜬다 — 마지막 등장 회차·
 *   그때의 의상·외형·대표 표정·컷 수와, 자주 입은 의상/표정 빈도.
 *   판정: 재등장 캐릭터 선택 시 마지막 등장 회차·모습 요약이 표시됨.
 * - 오래 안 나온 캐릭터는 상단에 따로 모아 보여준다 (기획 판단용).
 *
 * 데이터는 전부 props 다. 선택 상태는 controlled(selectedCharacterId)를
 * 우선하고, 없으면 내부 상태로 동작한다 (캐릭터 시트 패널이 선택을 공유할 때
 * controlled 로 붙는다).
 *
 * 회차 성과 오버레이(선택 prop `episodeMetrics`): 실집계가 연결된 경우에만
 * 회차 열 머리 아래에 조회·잔존 배지를 겹친다. 연결 전·로딩·실패에서는
 * 숫자를 만들지 않고 상태 한 줄만 보여 주며, prop 이 없으면 기존 화면과
 * 완전히 동일하다 (studio-episode-metrics-overlay.ts 의 정직성 규칙).
 */
import { useMemo, useState } from "react";
import { r3c04StatusText } from "../studio-r3c04-status-i18n";
import type { StudioStoryCharacter } from "../studio-story-bible";
import {
  buildCharacterCoverage,
  coverageGapAlerts,
  lastAppearanceSummaryLine,
  type CharacterAppearanceRecord,
  type CoverageEpisodeRef,
} from "./studio-character-coverage";
import {
  buildEpisodeMetricsOverlay,
  episodeMetricsStatusLine,
  formatEpisodeTrafficSummary,
  type EpisodeMetricsLoad,
} from "./studio-episode-metrics-overlay";

export interface StudioCharacterCoverageMapProps {
  readonly characters: readonly StudioStoryCharacter[];
  readonly episodes: readonly CoverageEpisodeRef[];
  readonly appearances: readonly CharacterAppearanceRecord[];
  /** 의상 id → 표시 이름. 없으면 id 를 그대로 보여준다. */
  readonly costumeLabels?: Readonly<Record<string, string>>;
  /** 외형 id → 표시 이름. 없으면 id 를 그대로 보여준다. */
  readonly appearanceLabels?: Readonly<Record<string, string>>;
  readonly selectedCharacterId?: string | null;
  readonly onSelectCharacter?: (characterId: string) => void;
  /** 회차 열/요약의 회차 링크. 없으면 링크를 만들지 않는다. */
  readonly onOpenEpisode?: (episodeId: string) => void;
  /** 이 회차 수 이상 기록에 없으면 "오래 안 나왔어요"로 모은다. 기본 5. */
  readonly gapThreshold?: number;
  /**
   * 회차 성과(실집계) 입력. 호스트가 resolveEpisodeMetricsLoad 로 접어서 넘긴다.
   * 없거나 live 가 아니면 어떤 성과 숫자도 표시하지 않는다.
   */
  readonly episodeMetrics?: EpisodeMetricsLoad | null;
}

export function StudioCharacterCoverageMap({
  characters,
  episodes,
  appearances,
  costumeLabels,
  appearanceLabels,
  selectedCharacterId,
  onSelectCharacter,
  onOpenEpisode,
  gapThreshold = 5,
  episodeMetrics,
}: StudioCharacterCoverageMapProps) {
  const coverage = useMemo(
    () => buildCharacterCoverage(characters, episodes, appearances),
    [characters, episodes, appearances],
  );
  // 성과 오버레이는 선택 입력이다. 실패·연결 전이어도 커버리지 계산과 무관하게
  // 빈 오버레이로 접히므로 기존 기획 흐름을 깨지 않는다.
  const metricsOverlay = useMemo(
    () =>
      episodeMetrics
        ? buildEpisodeMetricsOverlay(coverage.episodes, episodeMetrics)
        : null,
    [coverage.episodes, episodeMetrics],
  );
  const metricsByEpisodeId = useMemo(
    () =>
      new Map(
        (metricsOverlay?.entries ?? []).map((entry) => [entry.episodeId, entry] as const),
      ),
    [metricsOverlay],
  );
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(
    characters[0]?.id ?? null,
  );
  const effectiveSelectedId = selectedCharacterId !== undefined ? selectedCharacterId : internalSelectedId;
  const selectedRow =
    coverage.rows.find((row) => row.characterId === effectiveSelectedId) ?? null;
  const alerts = useMemo(() => coverageGapAlerts(coverage, gapThreshold), [coverage, gapThreshold]);
  const maxCuts = Math.max(1, ...coverage.rows.flatMap((row) => row.cells.map((cell) => cell.cutCount)));

  const select = (characterId: string) => {
    setInternalSelectedId(characterId);
    onSelectCharacter?.(characterId);
  };

  if (characters.length === 0 || episodes.length === 0) {
    return (
      <section
        aria-label="캐릭터 커버리지 맵"
        className="space-y-2 rounded-xl border border-line bg-panel p-4 text-fg sm:p-5"
      >
        <h2 className="text-base font-semibold text-fg">누가 언제 나왔나요</h2>
        <p className="text-xs leading-relaxed text-fg-2">
          캐릭터와 회차가 있어야 등장 기록을 모아 볼 수 있어요.
        </p>
        {metricsOverlay && (
          <p role="status" className="rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg-2">
            {episodeMetricsStatusLine(metricsOverlay)}
          </p>
        )}
      </section>
    );
  }

  const labelOf = (labels: Readonly<Record<string, string>> | undefined, id: string) =>
    labels?.[id] ?? id;
  const summary = selectedRow?.lastAppearance ?? null;

  return (
    <section
      aria-label="캐릭터 커버리지 맵"
      className="space-y-4 rounded-xl border border-line bg-panel p-4 text-fg sm:p-5"
    >
      <header className="space-y-1.5 border-b border-line pb-3">
        <h2 className="text-base font-semibold tracking-tight text-fg">누가 언제 나왔나요</h2>
        <p className="text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
          회차마다 누가 어떤 모습으로 나왔는지 모아 봤어요. 오래 안 나온 캐릭터를 다시
          그릴 때, 마지막 모습을 여기서 확인하세요.
        </p>
        {metricsOverlay && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <p role="status" className="rounded-lg border border-line bg-card px-2.5 py-1 text-xs text-fg-2">
              {episodeMetricsStatusLine(metricsOverlay)}
            </p>
            {formatEpisodeTrafficSummary(metricsOverlay) && (
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

      {coverage.latestRecordedEpisodeNumber === null && (
        <p className="rounded-lg border border-dashed border-line bg-card/50 px-3 py-3 text-xs text-fg-2">
          {r3c04StatusText("studio.r3c04Status.planning.coverage.emptyLatest", "아직 등장 기록이 없어요. 회차마다 등장 캐릭터를 태그하면 여기에 쌓여요.")}
        </p>
      )}
      {coverage.ignoredRecordCount > 0 && (
        <p className="rounded-lg border border-line bg-card px-3 py-2 text-xs tabular-nums text-fg-3">
          알 수 없는 캐릭터·회차를 가리키는 기록 {coverage.ignoredRecordCount}건은 빼고 집계했어요.
        </p>
      )}

      {(alerts.longAbsent.length > 0 || alerts.neverAppeared.length > 0) && (
        <section
          aria-label="오래 안 나온 캐릭터"
          className="space-y-2 rounded-xl border border-warn/35 bg-warn/10 p-3.5"
        >
          <h3 className="text-xs font-semibold text-warn">오래 안 나온 캐릭터</h3>
          <ul className="flex flex-wrap gap-2">
            {alerts.longAbsent.map((row) => (
              <li key={row.characterId}>
                <button
                  type="button"
                  onClick={() => select(row.characterId)}
                  className="min-h-11 rounded-lg border border-warn/40 bg-panel px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {row.name} — <span className="tabular-nums">{row.currentGap}회차째</span> 기록에 없어요
                </button>
              </li>
            ))}
            {alerts.neverAppeared.map((row) => (
              <li key={row.characterId}>
                <button
                  type="button"
                  onClick={() => select(row.characterId)}
                  className="min-h-11 rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-medium text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {row.name} — 아직 등장 기록이 없어요
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="overflow-x-auto rounded-xl border border-line bg-canvas">
        <table
          aria-label="회차별 등장 히트맵"
          className="w-full min-w-[34rem] border-collapse text-left text-xs"
        >
          <thead>
            <tr className="border-b border-line bg-panel">
              <th
                scope="col"
                className="sticky left-0 z-10 min-w-[8.5rem] border-r border-line bg-panel px-3 py-2.5 font-semibold text-fg-2"
              >
                캐릭터
              </th>
              {coverage.episodes.map((episode) => {
                const entry = metricsByEpisodeId.get(episode.episodeId);
                return (
                  <th
                    key={episode.episodeId}
                    scope="col"
                    className="min-w-[4.5rem] border-r border-line/50 px-2 py-2 text-center font-semibold tabular-nums text-fg-2"
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      {onOpenEpisode ? (
                        <button
                          type="button"
                          onClick={() => onOpenEpisode(episode.episodeId)}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-xs font-semibold text-fg transition-colors hover:bg-raised hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          {episode.episodeNumber}화
                        </button>
                      ) : (
                        <span className="py-1 text-fg">{episode.episodeNumber}화</span>
                      )}
                      {episode.hasAnyRecord ? null : (
                        <span className="text-xs font-normal text-fg-3"> (기록 없음)</span>
                      )}
                      {entry?.badge ? (
                        <span
                          data-episode-metrics={episode.episodeNumber}
                          title={entry.detail ?? undefined}
                          className="rounded-full bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent"
                        >
                          {" · "}
                          {entry.badge}
                        </span>
                      ) : null}
                    </div>
                  </th>
                );
              })}
              <th scope="col" className="min-w-[6.5rem] bg-panel px-3 py-2.5 text-right font-semibold text-fg-2">
                합계
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {coverage.rows.map((row) => {
              const isSelected = row.characterId === effectiveSelectedId;
              return (
                <tr key={row.characterId} className="transition-colors hover:bg-raised/35">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-r border-line bg-panel p-1.5 font-semibold text-fg"
                  >
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => select(row.characterId)}
                      className={`flex min-h-11 w-full items-center rounded-lg border px-2.5 text-left text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                        isSelected
                          ? "border-accent/55 bg-accent-soft text-fg shadow-[inset_2px_0_0_var(--color-accent)]"
                          : "border-transparent bg-transparent text-fg-2 hover:bg-raised hover:text-fg"
                      }`}
                    >
                      <span className="truncate">{row.name}</span>
                    </button>
                  </th>
                  {row.cells.map((cell) => {
                    const intensityPct = Math.round(18 + 44 * (cell.cutCount / maxCuts));
                    return (
                      <td
                        key={cell.episodeId}
                        style={
                          cell.state === "present"
                            ? {
                                backgroundColor: `color-mix(in oklch, var(--color-accent) ${intensityPct}%, var(--color-card))`,
                              }
                            : undefined
                        }
                        aria-label={
                          cell.state === "present"
                            ? `${row.name}, ${cell.episodeNumber}화 등장, ${cell.cutCount}컷`
                            : cell.state === "absent"
                              ? `${row.name}, ${cell.episodeNumber}화 등장 없음`
                              : `${row.name}, ${cell.episodeNumber}화 기록 없음`
                        }
                        className={`border-r border-line/40 px-2 py-2.5 text-center tabular-nums ${
                          cell.state === "present"
                            ? "font-semibold text-fg"
                            : "bg-card/30 text-fg-3"
                        }`}
                      >
                        {cell.state === "present" ? cell.cutCount : cell.state === "unknown" ? "?" : ""}
                      </td>
                    );
                  })}
                  <td className="bg-panel/60 px-3 py-2.5 text-right font-semibold tabular-nums text-fg-2">
                    {row.appearedEpisodeCount}회차 · {row.totalCuts}컷
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedRow && (
        <article
          aria-label={`${selectedRow.name} 마지막 등장 요약`}
          className="space-y-3 rounded-xl border border-line bg-card p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
            <h3 className="text-sm font-semibold text-fg">{selectedRow.name} — 마지막 등장 요약</h3>
            {summary && onOpenEpisode && (
              <button
                type="button"
                onClick={() => onOpenEpisode(summary.episodeId)}
                className="min-h-11 rounded-lg border border-accent/40 bg-accent-soft px-3.5 text-xs font-semibold text-accent transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                그 회차 열기
              </button>
            )}
          </div>
          {summary ? (
            <>
              <p className="text-xs leading-relaxed text-fg-2">
                {lastAppearanceSummaryLine(summary, { costumeLabels, appearanceLabels })}
              </p>
              <dl className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-lg border border-line bg-panel p-3">
                  <dt className="text-xs font-medium text-fg-3">마지막 등장</dt>
                  <dd className="mt-1 text-xs font-semibold tabular-nums text-fg">
                    {summary.episodeNumber}화{summary.episodeTitle ? ` 「${summary.episodeTitle}」` : ""}
                    {summary.episodesAgo > 0 ? ` · 기록 기준 ${summary.episodesAgo}회차 전` : " · 가장 최근 기록"}
                  </dd>
                </div>
                <div className="rounded-lg border border-line bg-panel p-3">
                  <dt className="text-xs font-medium text-fg-3">그때 의상</dt>
                  <dd className="mt-1 text-xs font-semibold text-fg">
                    {summary.costumeId ? labelOf(costumeLabels, summary.costumeId) : "기록 없음"}
                  </dd>
                </div>
                <div className="rounded-lg border border-line bg-panel p-3">
                  <dt className="text-xs font-medium text-fg-3">그때 외형</dt>
                  <dd className="mt-1 text-xs font-semibold text-fg">
                    {summary.appearanceId ? labelOf(appearanceLabels, summary.appearanceId) : "기록 없음"}
                  </dd>
                </div>
                <div className="rounded-lg border border-line bg-panel p-3">
                  <dt className="text-xs font-medium text-fg-3">대표 표정</dt>
                  <dd className="mt-1 text-xs font-semibold text-fg">
                    {summary.expression ?? "기록 없음"}
                  </dd>
                </div>
                <div className="rounded-lg border border-line bg-panel p-3">
                  <dt className="text-xs font-medium text-fg-3">등장 규모</dt>
                  <dd className="mt-1 text-xs font-semibold tabular-nums text-fg">
                    총 {selectedRow.appearedEpisodeCount}회차 · {selectedRow.totalCuts}컷
                    {selectedRow.firstEpisodeNumber !== null &&
                      ` · 첫 등장 ${selectedRow.firstEpisodeNumber}화`}
                  </dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-3 text-xs text-fg-2">
                {selectedRow.costumeFrequency.length > 0 && (
                  <p>
                    <strong className="font-semibold text-fg">자주 입은 의상:</strong>{" "}
                    {selectedRow.costumeFrequency
                      .slice(0, 3)
                      .map((entry) => `${labelOf(costumeLabels, entry.label)} ${entry.count}회`)
                      .join(", ")}
                  </p>
                )}
                {selectedRow.expressionFrequency.length > 0 && (
                  <p>
                    <strong className="font-semibold text-fg">자주 보인 표정:</strong>{" "}
                    {selectedRow.expressionFrequency
                      .slice(0, 3)
                      .map((entry) => `${entry.label} ${entry.count}회`)
                      .join(", ")}
                  </p>
                )}
              </div>
              {selectedRow.currentGap !== null && selectedRow.currentGap >= gapThreshold && (
                <p className="rounded-lg border border-warn/35 bg-warn/10 px-3 py-2 text-xs font-medium text-warn">
                  {selectedRow.currentGap}회차째 기록에 없어요. 다시 그릴 때는 위 마지막 모습을
                  기준으로 맞춰 주세요.
                </p>
              )}
            </>
          ) : (
            <p className="text-xs leading-relaxed text-fg-3">
              {r3c04StatusText("studio.r3c04Status.planning.coverage.emptySelected", "아직 등장 기록이 없어요. 처음 등장하는 회차에서 태그하면 다음부터 요약이 쌓여요.")}
            </p>
          )}
        </article>
      )}
    </section>
  );
}
