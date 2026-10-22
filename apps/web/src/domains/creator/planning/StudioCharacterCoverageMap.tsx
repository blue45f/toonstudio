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
      <section aria-label="캐릭터 커버리지 맵">
        <h2>누가 언제 나왔나요</h2>
        <p>캐릭터와 회차가 있어야 등장 기록을 모아 볼 수 있어요.</p>
        {metricsOverlay && (
          <p role="status">{episodeMetricsStatusLine(metricsOverlay)}</p>
        )}
      </section>
    );
  }

  const labelOf = (labels: Readonly<Record<string, string>> | undefined, id: string) =>
    labels?.[id] ?? id;
  const summary = selectedRow?.lastAppearance ?? null;

  return (
    <section aria-label="캐릭터 커버리지 맵">
      <header>
        <h2>누가 언제 나왔나요</h2>
        <p>
          회차마다 누가 어떤 모습으로 나왔는지 모아 봤어요. 오래 안 나온 캐릭터를 다시
          그릴 때, 마지막 모습을 여기서 확인하세요.
        </p>
        {metricsOverlay && (
          <p role="status">{episodeMetricsStatusLine(metricsOverlay)}</p>
        )}
        {metricsOverlay && formatEpisodeTrafficSummary(metricsOverlay) && (
          <p data-episode-traffic="true">{formatEpisodeTrafficSummary(metricsOverlay)}</p>
        )}
      </header>

      {coverage.latestRecordedEpisodeNumber === null && (
        <p>{r3c04StatusText("studio.r3c04Status.planning.coverage.emptyLatest", "아직 등장 기록이 없어요. 회차마다 등장 캐릭터를 태그하면 여기에 쌓여요.")}</p>
      )}
      {coverage.ignoredRecordCount > 0 && (
        <p>알 수 없는 캐릭터·회차를 가리키는 기록 {coverage.ignoredRecordCount}건은 빼고 집계했어요.</p>
      )}

      {(alerts.longAbsent.length > 0 || alerts.neverAppeared.length > 0) && (
        <section aria-label="오래 안 나온 캐릭터">
          <h3>오래 안 나온 캐릭터</h3>
          <ul>
            {alerts.longAbsent.map((row) => (
              <li key={row.characterId}>
                <button type="button" onClick={() => select(row.characterId)}>
                  {row.name} — {row.currentGap}회차째 기록에 없어요
                </button>
              </li>
            ))}
            {alerts.neverAppeared.map((row) => (
              <li key={row.characterId}>
                <button type="button" onClick={() => select(row.characterId)}>
                  {row.name} — 아직 등장 기록이 없어요
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <table aria-label="회차별 등장 히트맵">
        <thead>
          <tr>
            <th scope="col">캐릭터</th>
            {coverage.episodes.map((episode) => (
              <th key={episode.episodeId} scope="col">
                {onOpenEpisode ? (
                  <button type="button" onClick={() => onOpenEpisode(episode.episodeId)}>
                    {episode.episodeNumber}화
                  </button>
                ) : (
                  `${episode.episodeNumber}화`
                )}
                {episode.hasAnyRecord ? "" : " (기록 없음)"}
                {(() => {
                  const entry = metricsByEpisodeId.get(episode.episodeId);
                  return entry?.badge ? (
                    <span data-episode-metrics={episode.episodeNumber} title={entry.detail ?? undefined}>
                      {" · "}
                      {entry.badge}
                    </span>
                  ) : null;
                })()}
              </th>
            ))}
            <th scope="col">합계</th>
          </tr>
        </thead>
        <tbody>
          {coverage.rows.map((row) => (
            <tr key={row.characterId}>
              <th scope="row">
                <button
                  type="button"
                  aria-pressed={row.characterId === effectiveSelectedId}
                  onClick={() => select(row.characterId)}
                >
                  {row.name}
                </button>
              </th>
              {row.cells.map((cell) => (
                <td
                  key={cell.episodeId}
                  style={
                    cell.state === "present"
                      ? { backgroundColor: `rgba(80, 120, 255, ${0.15 + 0.75 * (cell.cutCount / maxCuts)})` }
                      : undefined
                  }
                  aria-label={
                    cell.state === "present"
                      ? `${row.name}, ${cell.episodeNumber}화 등장, ${cell.cutCount}컷`
                      : cell.state === "absent"
                        ? `${row.name}, ${cell.episodeNumber}화 등장 없음`
                        : `${row.name}, ${cell.episodeNumber}화 기록 없음`
                  }
                >
                  {cell.state === "present" ? cell.cutCount : cell.state === "unknown" ? "?" : ""}
                </td>
              ))}
              <td>
                {row.appearedEpisodeCount}회차 · {row.totalCuts}컷
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selectedRow && (
        <article aria-label={`${selectedRow.name} 마지막 등장 요약`}>
          <h3>{selectedRow.name} — 마지막 등장 요약</h3>
          {summary ? (
            <>
              <p>
                {lastAppearanceSummaryLine(summary, { costumeLabels, appearanceLabels })}
                {onOpenEpisode && (
                  <>
                    {" "}
                    <button type="button" onClick={() => onOpenEpisode(summary.episodeId)}>
                      그 회차 열기
                    </button>
                  </>
                )}
              </p>
              <dl>
                <div>
                  <dt>마지막 등장</dt>
                  <dd>
                    {summary.episodeNumber}화{summary.episodeTitle ? ` 「${summary.episodeTitle}」` : ""}
                    {summary.episodesAgo > 0 ? ` · 기록 기준 ${summary.episodesAgo}회차 전` : " · 가장 최근 기록"}
                  </dd>
                </div>
                <div>
                  <dt>그때 의상</dt>
                  <dd>{summary.costumeId ? labelOf(costumeLabels, summary.costumeId) : "기록 없음"}</dd>
                </div>
                <div>
                  <dt>그때 외형</dt>
                  <dd>{summary.appearanceId ? labelOf(appearanceLabels, summary.appearanceId) : "기록 없음"}</dd>
                </div>
                <div>
                  <dt>대표 표정</dt>
                  <dd>{summary.expression ?? "기록 없음"}</dd>
                </div>
                <div>
                  <dt>등장 규모</dt>
                  <dd>
                    총 {selectedRow.appearedEpisodeCount}회차 · {selectedRow.totalCuts}컷
                    {selectedRow.firstEpisodeNumber !== null &&
                      ` · 첫 등장 ${selectedRow.firstEpisodeNumber}화`}
                  </dd>
                </div>
              </dl>
              {selectedRow.costumeFrequency.length > 0 && (
                <p>
                  자주 입은 의상:{" "}
                  {selectedRow.costumeFrequency
                    .slice(0, 3)
                    .map((entry) => `${labelOf(costumeLabels, entry.label)} ${entry.count}회`)
                    .join(", ")}
                </p>
              )}
              {selectedRow.expressionFrequency.length > 0 && (
                <p>
                  자주 보인 표정:{" "}
                  {selectedRow.expressionFrequency
                    .slice(0, 3)
                    .map((entry) => `${entry.label} ${entry.count}회`)
                    .join(", ")}
                </p>
              )}
              {selectedRow.currentGap !== null && selectedRow.currentGap >= gapThreshold && (
                <p>
                  {selectedRow.currentGap}회차째 기록에 없어요. 다시 그릴 때는 위 마지막 모습을
                  기준으로 맞춰 주세요.
                </p>
              )}
            </>
          ) : (
            <p>{r3c04StatusText("studio.r3c04Status.planning.coverage.emptySelected", "아직 등장 기록이 없어요. 처음 등장하는 회차에서 태그하면 다음부터 요약이 쌓여요.")}</p>
          )}
        </article>
      )}
    </section>
  );
}
