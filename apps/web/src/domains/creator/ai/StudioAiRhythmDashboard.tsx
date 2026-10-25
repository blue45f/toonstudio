/**
 * StudioAiRhythmDashboard.tsx — 연재 리듬 요약 대시보드 (서버 호출 없음).
 *
 * 계산 모듈(studio-ai-rhythm.ts)과 일정 행 매핑 모듈
 * (studio-ai-rhythm-mapping.ts)을 화면에 붙이는 골격이다. 데이터 공급처는
 * 아직 확정되지 않았으므로, 일정 행은 rows prop으로 주입받는다.
 * rows가 비어 있으면 요약 대신 주입 안내를 보여준다.
 */

import { useMemo } from "react";

import {
  mapScheduleRowsToEpisodeProgress,
  type StudioAiScheduleRow,
} from "./studio-ai-rhythm-mapping";
import { summarizeEpisodeRhythm } from "./studio-ai-rhythm";

function formatDue(dueAt: number | null): string {
  if (dueAt === null) return "마감 없음";
  try {
    return new Date(dueAt).toLocaleDateString();
  } catch {
    return "마감 없음";
  }
}

export function StudioAiRhythmDashboard({
  rows,
}: {
  readonly rows: readonly StudioAiScheduleRow[];
}) {
  const mapped = useMemo(() => mapScheduleRowsToEpisodeProgress(rows), [rows]);
  const summary = useMemo(
    () => summarizeEpisodeRhythm(mapped.episodes),
    [mapped.episodes],
  );

  return (
    <section
      className="space-y-3 rounded-xl border border-line bg-panel/50 p-3"
      aria-label="연재 리듬 대시보드"
      data-studio-ai-rhythm-dashboard="true"
    >
      <h3 className="text-sm font-bold text-fg">연재 리듬</h3>
      {rows.length === 0 ? (
        <p className="text-xs leading-relaxed text-fg-2">
          아직 연결된 연재 일정이 없어요. 연재 캘린더·일정 데이터가 정해지면
          일정 행을 rows로 주입하면 진행률·마감 임박·다음 할 일이 여기에
          표시돼요.
        </p>
      ) : (
        <>
          <p className="text-xs leading-relaxed text-fg-2">
            전체 {summary.total}회 · 완료 {summary.done}회 · 검토 중{" "}
            {summary.inReview}회 · 초안 {summary.draft}회 · 전체 진행률{" "}
            {Math.round(summary.overallProgress * 100)}%
            {mapped.dropped > 0
              ? ` · 제외된 일정 행 ${mapped.dropped}건`
              : ""}
          </p>
          {summary.overdue.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-bad">
                마감 초과 {summary.overdue.length}회
              </p>
              <ul className="mt-1 space-y-1">
                {summary.overdue.map((episode) => (
                  <li key={episode.episodeId} className="text-xs text-fg-2">
                    {episode.title} · {formatDue(episode.dueAt)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {summary.dueSoon.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-fg">
                3일 이내 마감 {summary.dueSoon.length}회
              </p>
              <ul className="mt-1 space-y-1">
                {summary.dueSoon.map((episode) => (
                  <li key={episode.episodeId} className="text-xs text-fg-2">
                    {episode.title} · {formatDue(episode.dueAt)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {summary.nextActions.length > 0 && (
            <p className="text-xs leading-relaxed text-fg-2">
              다음 할 일 {summary.nextActions.length}건:{" "}
              {summary.nextActions
                .map((action) =>
                  action.kind === "overdue"
                    ? "마감 초과 회차 처리"
                    : action.kind === "due-soon"
                      ? "임박 회차 마무리"
                      : "검토 중 회차 확인",
                )
                .join(" · ")}
            </p>
          )}
        </>
      )}
    </section>
  );
}
