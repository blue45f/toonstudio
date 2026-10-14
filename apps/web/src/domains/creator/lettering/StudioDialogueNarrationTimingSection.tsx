// 콘티 낭독 타이밍 섹션 — 대사량 기반 회차 예상 읽기 시간과 지난 회차 비교를
// 대사 패널 안에서 보여주는 표시 전용 표면. 계산은 전부
// studio-dialogue-narration-timing 순수 코어가 하고, 여기서는 고르거나
// 수정하는 동작 없이 "이번 회차가 얼마나 길게 느껴질지"만 알려준다.
import { Timer } from "lucide-react";

import {
  formatNarrationDelta,
  formatNarrationDeltaPercent,
  formatNarrationDuration,
  type EpisodeNarrationTiming,
  type NarrationTimingComparison,
} from "./studio-dialogue-narration-timing";

export type StudioDialogueNarrationTimingSectionProps = {
  /** 이번 회차 추정(패널의 pages 기준). */
  timing: EpisodeNarrationTiming;
  /**
   * 시리즈 순서(과거→현재) 비교. 마지막 행이 이번 회차다.
   * 지난 회차 자료가 없으면 null — 그 경우 비교 대신 안내만 표시한다.
   */
  comparison: NarrationTimingComparison | null;
};

function longerOrShorter(deltaMs: number): string {
  if (Math.round(Math.abs(deltaMs) / 1_000) === 0) return "비슷해요";
  return deltaMs > 0 ? "길어요" : "짧아요";
}

function deltaDetail(deltaMs: number | null, deltaPercent: number | null): string {
  if (deltaMs == null) return "";
  const percent = formatNarrationDeltaPercent(deltaPercent);
  const delta = formatNarrationDelta(deltaMs);
  return percent === "—" ? delta : `${percent} (${delta})`;
}

export function StudioDialogueNarrationTimingSection({
  timing,
  comparison,
}: StudioDialogueNarrationTimingSectionProps) {
  const rows = comparison?.rows ?? [];
  const currentRow = rows.length > 0 ? rows[rows.length - 1] : undefined;
  const previousRows = rows.slice(0, -1);

  return (
    <section
      aria-label="콘티 낭독 타이밍"
      className="space-y-2 border-b border-line/60 px-3 py-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold text-fg-2">
          <Timer size={14} aria-hidden />
          콘티 낭독 타이밍
        </p>
        <span className="shrink-0 text-[0.68rem] font-semibold tabular-nums text-fg">
          {formatNarrationDuration(timing.totalMs)}
        </span>
      </div>

      <p className="text-[0.62rem] leading-snug text-fg-3">
        대사 낭독 {formatNarrationDuration(timing.speechMs)} · 컷 체류{" "}
        {formatNarrationDuration(timing.dwellMs)}
      </p>
      <p className="text-[0.58rem] leading-snug text-fg-4">
        대사 {timing.dialogueCount}개 · 컷 {timing.cutCount}개 · {timing.pageCount}
        페이지 기준 추정치예요. 실제 읽는 속도와 다를 수 있어요.
      </p>

      {currentRow && previousRows.length > 0 ? (
        <div className="space-y-1.5">
          {currentRow.deltaFromPreviousMs != null ? (
            <p role="status" className="rounded-md bg-accent-soft/40 px-2 py-1.5 text-[0.62rem] leading-snug text-fg-2">
              직전 회차({previousRows[previousRows.length - 1]!.label})보다{" "}
              {longerOrShorter(currentRow.deltaFromPreviousMs)}
              {" · "}
              {deltaDetail(currentRow.deltaFromPreviousMs, currentRow.deltaFromPreviousPercent)}
              {currentRow.deltaFromPreviousAverageMs != null ? (
                <>
                  {" · "}지난 회차 평균보다{" "}
                  {longerOrShorter(currentRow.deltaFromPreviousAverageMs)}
                  {" · "}
                  {deltaDetail(
                    currentRow.deltaFromPreviousAverageMs,
                    currentRow.deltaFromPreviousAveragePercent
                  )}
                </>
              ) : null}
            </p>
          ) : null}
          <ul className="space-y-1">
            {previousRows.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-2 text-[0.62rem] text-fg-3"
              >
                <span>{row.label}</span>
                <span className="tabular-nums">{formatNarrationDuration(row.timing.totalMs)}</span>
              </li>
            ))}
            <li className="flex items-center justify-between gap-2 text-[0.62rem] font-semibold text-fg">
              <span>이번 회차</span>
              <span className="tabular-nums">{formatNarrationDuration(timing.totalMs)}</span>
            </li>
          </ul>
        </div>
      ) : (
        <p className="text-[0.58rem] leading-snug text-fg-4">
          지난 회차 자료가 연결되면 여기에서 회차 간 예상 시간을 비교할 수 있어요.
        </p>
      )}
    </section>
  );
}
