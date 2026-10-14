// 과정 리플레이 패널 — 편집 과정을 시간순으로 재생한다(Drawpile 세션 재생 방식).
// 순수 재생 로직은 studio-process-replay(타임라인·상태 기계·성능 상한), 이 파일은
// 타이머 구동과 표시만 담당한다. 재생 커서는 보기 전용: 이동할 때마다 대상 이벤트의
// historyIndex 를 호스트의 기존 히스토리 점프 경로(onJumpTo)로 전달할 뿐 저널을 쓰지 않는다.
// 자체완결 플로팅 패널: StudioHistoryPanel 과 같은 자리(캔버스 우측 상단)에 뜨고 Esc 로 닫힌다.
import { Flag, Pause, Play, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  advanceProcessReplay,
  createProcessReplayState,
  filterProcessReplayEvents,
  formatProcessReplayClock,
  pauseProcessReplay,
  playProcessReplay,
  processReplayProgress,
  seekProcessReplay,
  setProcessReplaySegment,
  setProcessReplaySpeed,
  PROCESS_REPLAY_MAX_EVENTS,
  PROCESS_REPLAY_SPEEDS,
  type ProcessReplayState,
  type ProcessReplayTimeline,
} from "./studio-process-replay";

import { cx } from "@/shared/lib/cx";

export type StudioProcessReplayPanelProps = {
  /** 재생 타임라인 — 호스트가 buildProcessReplayTimeline 으로 만들어 넘긴다(불변). */
  timeline: ProcessReplayTimeline;
  /** 커서 이동 → 해당 스냅샷 인덱스로 점프(StudioHistoryPanel 의 onJumpTo 와 같은 좌표계). */
  onJumpTo: (historyIndex: number) => void;
  onClose: () => void;
};

/** 타이머 틱 간격(ms) — 간격 소비는 advance 가 담당하므로 틱은 짧게 유지한다. */
const REPLAY_TICK_MS = 50;

export function StudioProcessReplayPanel({
  timeline,
  onJumpTo,
  onClose,
}: StudioProcessReplayPanelProps) {
  // 페이지 필터 — null 이면 전체 과정, 아니면 그 페이지를 건드린 단계만.
  const [pageFilter, setPageFilter] = useState<string | null>(null);
  const events = useMemo(
    () => filterProcessReplayEvents(timeline, pageFilter),
    [timeline, pageFilter]
  );
  const [state, setState] = useState<ProcessReplayState>(() =>
    createProcessReplayState(events.length)
  );
  const eventsRef = useRef(events);
  eventsRef.current = events;
  // 호스트 콜백은 렌더마다 최신으로 유지하고 효과에서는 ref로만 부른다
  // (의존성에 넣으면 호스트 리렌더가 재생 상태를 되돌리는 일이 생긴다).
  const onJumpToRef = useRef(onJumpTo);
  onJumpToRef.current = onJumpTo;

  // 필터가 바뀌면 재생을 처음으로 되돌리고 호스트 화면도 처음 상태로 맞춘다.
  useEffect(() => {
    const fresh = createProcessReplayState(events.length);
    setState(fresh);
    const first = events[0];
    if (first) onJumpToRef.current(first.historyIndex);
  }, [events]);

  // 커서 위치가 바뀔 때마다 호스트에 점프를 알린다(재생·수동 이동 공통).
  const posRef = useRef(state.pos);
  useEffect(() => {
    if (posRef.current === state.pos) return;
    posRef.current = state.pos;
    const event = eventsRef.current[state.pos];
    if (event) onJumpToRef.current(event.historyIndex);
  }, [state.pos]);

  // 재생 타이머 — playing 일 때만 돌고, 경과 시간은 순수 상태 기계가 소비한다.
  useEffect(() => {
    if (!state.playing) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now - last;
      last = now;
      setState((prev) => advanceProcessReplay(prev, eventsRef.current, elapsed));
    }, REPLAY_TICK_MS);
    return () => window.clearInterval(timer);
  }, [state.playing]);

  // Esc 로 닫기 — 입력 필드 안의 Esc 는 각 필드의 몫(히스토리 패널과 동일 규약).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.tagName === "SELECT" || target.isContentEditable)) {
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const progress = processReplayProgress(state, events);
  const current = progress.current;
  const startAt = timeline.events[0]?.at ?? null;
  const segment = state.segment;

  const togglePlay = () => {
    setState((prev) =>
      prev.playing ? pauseProcessReplay(prev) : playProcessReplay(prev, events.length)
    );
  };
  const seek = (pos: number) => setState((prev) => seekProcessReplay(prev, events.length, pos));
  const markSegmentStart = () =>
    setState((prev) =>
      setProcessReplaySegment(prev, events.length, {
        startPos: prev.pos,
        endPos: segment?.endPos ?? events.length - 1,
      })
    );
  const markSegmentEnd = () =>
    setState((prev) =>
      setProcessReplaySegment(prev, events.length, {
        startPos: segment?.startPos ?? 0,
        endPos: prev.pos,
      })
    );
  const clearSegment = () =>
    setState((prev) => setProcessReplaySegment(prev, events.length, null));

  return (
    <section
      aria-label="과정 리플레이"
      className="absolute right-3 top-3 z-40 flex max-h-[calc(100%-5rem)] w-[min(19rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-xl border border-line bg-panel/95 shadow-xl backdrop-blur"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line/60 px-3 py-2">
        <p className="flex items-center gap-1.5 text-xs font-bold text-fg">
          <Play size={13} className="shrink-0 text-fg-3" aria-hidden />
          과정 리플레이
          <span className="font-medium text-fg-3">{progress.total}단계</span>
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="과정 리플레이 닫기"
          className="grid size-6 place-items-center rounded-lg border border-line text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X size={13} />
        </button>
      </div>

      <div className="space-y-2.5 px-3 py-2.5">
        {/* 현재 단계 — 재생 중 무엇이 보이는지 항상 문자로도 알린다. */}
        <div aria-live="polite" className="min-h-8">
          <p className="truncate text-[0.8rem] font-semibold text-fg">
            {current ? current.label : "기록된 과정이 없어요"}
          </p>
          <p className="text-[0.72rem] tabular-nums text-fg-3">
            {current
              ? `${progress.pos + 1} / ${progress.total}단계 · ${formatProcessReplayClock(current.at, startAt)}`
              : "편집 기록이 쌓이면 여기서 과정을 재생할 수 있어요"}
            {current && current.changedPageIds.length > 0 &&
              ` · 바뀐 페이지 ${current.changedPageIds.length}개`}
            {current && current.elementDelta !== 0 &&
              ` · 요소 ${current.elementDelta > 0 ? "+" : ""}${current.elementDelta}`}
          </p>
        </div>

        {/* 구간 이동 슬라이더 */}
        <input
          type="range"
          min={0}
          max={Math.max(0, progress.total - 1)}
          step={1}
          value={progress.pos}
          disabled={progress.total <= 1}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="재생 위치"
          className="w-full accent-accent disabled:opacity-40"
        />

        {/* 재생·속도 컨트롤 */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={togglePlay}
            disabled={progress.total <= 1}
            aria-label={state.playing ? "일시정지" : state.ended ? "처음부터 재생" : "재생"}
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-accent/60 bg-accent-soft/40 text-fg transition-colors hover:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {state.playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <div role="group" aria-label="재생 속도" className="flex overflow-hidden rounded-lg border border-line">
            {PROCESS_REPLAY_SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                onClick={() => setState((prev) => setProcessReplaySpeed(prev, speed))}
                aria-pressed={state.speed === speed}
                className={cx(
                  "px-2 py-1.5 text-[0.72rem] tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                  state.speed === speed
                    ? "bg-accent text-on-accent font-semibold"
                    : "bg-card/45 text-fg-2 hover:bg-raised hover:text-fg"
                )}
              >
                {speed}배
              </button>
            ))}
          </div>
          <label className="ml-auto flex min-w-0 items-center gap-1 text-[0.72rem] text-fg-3">
            <span className="shrink-0">페이지</span>
            <select
              value={pageFilter ?? ""}
              onChange={(e) => setPageFilter(e.target.value === "" ? null : e.target.value)}
              aria-label="페이지별 필터"
              className="min-w-0 max-w-28 truncate rounded-lg border border-line bg-card/45 px-1.5 py-1.5 text-fg-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <option value="">전체 과정</option>
              {timeline.pageIds.map((pageId, index) => (
                <option key={pageId} value={pageId}>
                  {index + 1}번째 페이지
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* 구간 지정 — 현재 위치를 시작/끝으로 찍어 그 구간만 재생한다. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={markSegmentStart}
            disabled={progress.total <= 1}
            className="flex items-center gap-1 rounded-lg border border-line bg-card/45 px-2 py-1 text-[0.72rem] text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"
          >
            <Flag size={11} aria-hidden /> 구간 시작
          </button>
          <button
            type="button"
            onClick={markSegmentEnd}
            disabled={progress.total <= 1}
            className="flex items-center gap-1 rounded-lg border border-line bg-card/45 px-2 py-1 text-[0.72rem] text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"
          >
            <Flag size={11} aria-hidden /> 구간 끝
          </button>
          {segment && (
            <>
              <span className="text-[0.72rem] tabular-nums text-accent">
                구간 {segment.startPos + 1}~{segment.endPos + 1}단계
              </span>
              <button
                type="button"
                onClick={clearSegment}
                className="rounded-lg border border-line px-2 py-1 text-[0.72rem] text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                구간 해제
              </button>
            </>
          )}
        </div>

        {timeline.truncatedCount > 0 && (
          <p className="text-[0.72rem] leading-snug text-fg-3">
            과정이 길어 최근 {PROCESS_REPLAY_MAX_EVENTS}단계만 재생해요 (앞부분{" "}
            {timeline.truncatedCount}단계 생략).
          </p>
        )}
      </div>

      <p className="border-t border-line/60 px-3 py-1.5 text-[0.72rem] leading-snug text-fg-3">
        재생은 보기 전용이에요 — 실제 편집을 시작하면 리플레이가 닫혀요 · 속도 조절과
        구간 지정으로 원하는 부분만 다시 볼 수 있어요
      </p>
    </section>
  );
}
