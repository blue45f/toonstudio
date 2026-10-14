/**
 * 스크롤 리듬 진단 표면 — 회차 스크롤을 축소한 띠 위에 구간 지표를 겹쳐 보여준다.
 *
 * 판정 문구는 쓰지 않는다. 표시되는 것은 수치·자기 평균 대비 배율·구간 위치뿐이며,
 * 띠나 구간 행을 누르면 해당 컷(비트)으로 이동만 한다.
 */
import { useMemo, type ReactElement } from "react";

import {
  deriveScrollRhythmReport,
  type ScrollRhythmEpisodeInput,
} from "./studio-scroll-rhythm";

import { cn } from "@/shared/lib/utils";

export interface StudioScrollRhythmPanelProps {
  episodes: readonly ScrollRhythmEpisodeInput[];
  episodeId: string;
  onSelectShot?: (episodeId: string, beatId: string) => void;
}

function percent(ratio: number | null): string {
  return ratio === null ? "—" : `${Math.round(ratio * 100)}%`;
}

function times(ratio: number | null): string {
  return ratio === null ? "—" : `${ratio.toFixed(1)}배`;
}

export function StudioScrollRhythmPanel({
  episodes,
  episodeId,
  onSelectShot,
}: StudioScrollRhythmPanelProps): ReactElement {
  const report = useMemo(() => deriveScrollRhythmReport(episodes), [episodes]);
  const episode = report.episodes.find((entry) => entry.episodeId === episodeId)
    ?? report.episodes[0];

  if (!episode) {
    return (
      <section aria-label="스크롤 리듬" className="rounded-2xl border border-line bg-card/40 p-3">
        <p className="text-xs text-fg-3">표시할 회차가 없습니다.</p>
      </section>
    );
  }

  if (episode.source !== "planner") {
    return (
      <section aria-label="스크롤 리듬" className="rounded-2xl border border-line bg-card/40 p-3">
        <h3 className="text-xs font-bold text-fg">스크롤 리듬 · {episode.label}</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-fg-3">
          이 회차는 콘티 플래너 데이터가 없어 구간 지표를 만들지 않습니다.
          {episode.source === "page-meta"
            ? ` 페이지 메타 기준 약식 지표만 표시합니다 — 컷 ${episode.shotCount}개 · 총 길이 ${episode.totalHeightPx.toLocaleString()}px.`
            : ""}
        </p>
      </section>
    );
  }

  const markedSegments = episode.segments.filter((segment) => segment.markers.length > 0);
  const maxTotalPx = Math.max(1, ...episode.shots.map((shot) => shot.totalPx));

  return (
    <section aria-label="스크롤 리듬" className="rounded-2xl border border-line bg-card/40 p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-xs font-bold text-fg">스크롤 리듬 · {episode.label}</h3>
        <p className="text-[11px] text-fg-3">
          {`컷 ${episode.shotCount}개 · 총 길이 ${episode.totalHeightPx.toLocaleString()}px · 대사 비율 평균 ${percent(episode.meanDialogueRatio)} · 컷 간격 평균 ${episode.meanGapPx === null ? "—" : `${Math.round(episode.meanGapPx)}px`} · 무대사 컷 ${episode.emptyCutCount}개 · 샷 사이즈 변화 ${percent(episode.shotSizeChangeRate)}`}
        </p>
      </div>

      {episode.baseline ? (
        <p className="mt-1 text-[11px] text-fg-3">
          {`지난 회차 평균 (${episode.baseline.episodeCount}개 회차) — 대사 비율 ${percent(episode.baseline.meanDialogueRatio)} · 컷 ${episode.baseline.meanShotCount}개 · 총 길이 ${episode.baseline.meanTotalHeightPx.toLocaleString()}px. 이 회차는 대사 비율 ${times(episode.dialogueRatioVsBaseline)} · 총 길이 ${times(episode.totalHeightVsBaseline)}.`}
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-fg-3">
          지난 회차 평균은 플래너를 거친 회차가 2개 이상일 때 함께 표시됩니다.
        </p>
      )}

      <div
        className="mt-3 flex h-14 w-full items-stretch gap-[2px]"
        role="group"
        aria-label="회차 스크롤 축소 띠 — 컷을 누르면 해당 컷으로 이동합니다"
      >
        {episode.shots.map((shot) => {
          const inEmptyRun = episode.emptyRuns.some(
            (run) => shot.order >= run.startOrder && shot.order <= run.endOrder,
          );
          return (
            <button
              key={shot.shotId}
              type="button"
              disabled={!onSelectShot}
              onClick={() => onSelectShot?.(episode.episodeId, shot.beatId)}
              title={`${shot.order + 1}컷 · 대사 비율 ${percent(shot.dialogueRatio)} · 높이 ${shot.heightPx}px · 간격 ${shot.gapAfterPx}px`}
              aria-label={`${shot.order + 1}컷으로 이동 — 대사 비율 ${percent(shot.dialogueRatio)}`}
              className={cn(
                "relative min-w-[4px] overflow-hidden rounded-sm border bg-raised/60",
                shot.emptyCut ? "border-dashed border-fg-3/60" : "border-line",
                onSelectShot && "cursor-pointer hover:border-accent/60",
              )}
              style={{ flexGrow: Math.max(1, shot.totalPx), flexBasis: 0 }}
            >
              <span
                aria-hidden
                className={cn("absolute inset-x-0 bottom-0", inEmptyRun ? "bg-fg-3/25" : "bg-accent/50")}
                style={{ height: `${Math.round((shot.dialogueRatio / 0.42) * 100)}%` }}
              />
              <span className="sr-only">{`${Math.round((shot.totalPx / maxTotalPx) * 100)}`}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[10px] text-fg-3">
        띠의 너비는 컷 높이+간격 비례, 채움 높이는 대사 비율 비례입니다. 점선 테두리는 대사가 없는 컷입니다.
      </p>

      {markedSegments.length > 0 || episode.emptyRuns.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {markedSegments
            .filter((segment) => segment.markers.includes("dialogue-above-average"))
            .map((segment) => (
              <li key={`dialogue:${segment.id}`}>
                <button
                  type="button"
                  disabled={!onSelectShot}
                  onClick={() => onSelectShot?.(episode.episodeId, segment.beatIds[0]!)}
                  className="flex min-h-11 w-full flex-wrap items-center gap-x-2 rounded-lg border border-line bg-panel/60 px-2.5 text-left text-[11px] text-fg-2 hover:border-accent/50 disabled:cursor-default"
                >
                  <strong className="font-bold text-fg">
                    {segment.startOrder + 1}–{segment.endOrder + 1}컷
                  </strong>
                  <span>
                    {`대사 비율 ${percent(segment.dialogueRatioMean)} · 회차 평균의 ${times(segment.dialogueRatioVsEpisodeMean)} · 길이 ${segment.totalPx.toLocaleString()}px`}
                  </span>
                </button>
              </li>
            ))}
          {episode.emptyRuns.map((run) => (
            <li key={`empty:${run.startOrder}`}>
              <button
                type="button"
                disabled={!onSelectShot}
                onClick={() => onSelectShot?.(episode.episodeId, run.beatIds[0]!)}
                className="flex min-h-11 w-full flex-wrap items-center gap-x-2 rounded-lg border border-line bg-panel/60 px-2.5 text-left text-[11px] text-fg-2 hover:border-accent/50 disabled:cursor-default"
              >
                <strong className="font-bold text-fg">
                  {run.startOrder + 1}–{run.endOrder + 1}컷
                </strong>
                <span>{`대사 없는 컷 ${run.length}개 연속`}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[11px] text-fg-3">
          회차 평균보다 대사 비율이 두드러진 구간이나, 대사 없는 컷의 연속 구간이 없습니다.
        </p>
      )}
    </section>
  );
}
