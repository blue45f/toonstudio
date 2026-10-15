/**
 * StudioAnimClipExposure — 타임라인 패널의 클립 한 줄 아래에 붙는 "노출 구간" 편집기.
 *
 * 클립의 시작과 길이를 숫자 입력(키보드·터치의 기준 경로)과 노출 막대(포인터 드래그 보조)로
 * 함께 편집한다. 두 경로 모두 studio-anim-tracks 의 순수 연산 하나씩만 거친다.
 *  - 막대 본체 드래그·시작 입력: moveTimelineClip (길이를 유지한 채 이동)
 *  - 막대 왼쪽 손잡이: setTimelineClipStart (끝 고정, 길이가 함께 변함)
 *  - 막대 오른쪽 손잡이·길이 입력: setTimelineClipDuration (시작 고정)
 * 타임라인 밖으로 나가거나 길이가 1 아래로 줄지 않게 하는 보정은 전부 모델의 몫이다.
 *
 * 패널의 무상태 규약을 지키려고 React 상태·ref 를 두지 않는다. 드래그 중의 기준값(시작 시점의
 * 문서와 클립)은 이벤트 핸들러 클로저가 들고, 매 이동을 그 기준에서 다시 계산한다 — 부모가
 * 문서를 바꿔 렌더가 반복돼도 누적 오차가 생기지 않는다.
 * 노출 막대는 마우스·터치 보조 표현이라 보조기기에는 감춘다(aria-hidden). 같은 조작은 숫자 입력으로
 * 모두 할 수 있어 드래그 말고도 되는 방법이 항상 있다(WCAG 2.5.7).
 */
import {
  activeClipExposureFrameIndices,
  moveTimelineClip,
  setTimelineClipDuration,
  setTimelineClipStart,
  timelineClipDurationFrames,
  type AnimationTimelineDoc,
  type StudioAnimClipRange,
} from "./studio-anim-tracks";

import type { PointerEvent as ReactPointerEvent, ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

type ExposureDragMode = "move" | "start" | "end";

const FIELD_LABEL =
  "inline-flex items-center gap-1.5 text-[0.72rem] text-fg-2 pointer-coarse:text-[0.8125rem]";
const NUMBER_INPUT =
  "w-14 rounded-md border border-line bg-canvas px-2 py-1 text-right text-xs tabular-nums text-fg outline-none focus:border-accent/50 pointer-coarse:h-11";
const HANDLE =
  "absolute inset-y-0 w-1.5 cursor-ew-resize bg-line-strong/70 pointer-coarse:w-3";

/** 드래그 시작 시점의 클립을 기준으로, 프레임 이동량만큼 옮긴 새 문서를 만든다. 순수. */
function applyExposureDrag(
  doc: AnimationTimelineDoc,
  clip: StudioAnimClipRange,
  mode: ExposureDragMode,
  deltaFrames: number,
): AnimationTimelineDoc {
  switch (mode) {
    case "move":
      return moveTimelineClip(doc, clip.id, clip.startFrame + deltaFrames);
    case "start":
      return setTimelineClipStart(doc, clip.id, clip.startFrame + deltaFrames);
    case "end":
      return setTimelineClipDuration(doc, clip.id, timelineClipDurationFrames(clip) + deltaFrames);
  }
}

export interface StudioAnimClipExposureProps {
  readonly doc: AnimationTimelineDoc;
  readonly clip: StudioAnimClipRange;
  readonly onDocChange: (next: AnimationTimelineDoc) => void;
}

export function StudioAnimClipExposure({
  doc,
  clip,
  onDocChange,
}: StudioAnimClipExposureProps): ReactElement {
  const duration = timelineClipDurationFrames(clip);
  const isActive = doc.activeClipId === clip.id;
  const summary = isActive
    ? `활성 노출 ${activeClipExposureFrameIndices(doc).length}프레임`
    : `노출 ${duration}프레임`;

  // 숫자 입력은 모델이 범위를 보정한 결과가 그대로일 때(예: 이미 끝에 닿아 더 못 늘림) 문서를 바꾸지 않는다.
  const commit = (next: AnimationTimelineDoc) => {
    if (next !== doc) onDocChange(next);
  };

  const beginDrag = (event: ReactPointerEvent<HTMLElement>, mode: ExposureDragMode) => {
    if (event.button !== 0) return;
    const target = event.currentTarget;
    const track = target.closest<HTMLElement>('[data-clip-bar-track="true"]');
    const trackWidth = track ? track.getBoundingClientRect().width : 0;
    if (trackWidth <= 0) return;
    // 손잡이에서 시작한 드래그가 바깥 막대 본체의 이동 드래그로 겹쳐 시작되지 않게 한다.
    event.stopPropagation();
    event.preventDefault();
    if (typeof target.setPointerCapture === "function") target.setPointerCapture(event.pointerId);

    const originDoc = doc;
    const originClip = clip;
    const originX = event.clientX;
    const framesPerPx = originDoc.frameCount / trackWidth;
    let lastDelta = 0;

    const onMove = (move: PointerEvent) => {
      const delta = Math.round((move.clientX - originX) * framesPerPx);
      if (delta === lastDelta) return;
      lastDelta = delta;
      onDocChange(applyExposureDrag(originDoc, originClip, mode, delta));
    };
    const finish = () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", finish);
      target.removeEventListener("pointercancel", finish);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", finish);
    target.addEventListener("pointercancel", finish);
  };

  const leftPercent = (clip.startFrame / doc.frameCount) * 100;
  const widthPercent = (duration / doc.frameCount) * 100;

  return (
    <div className="basis-full space-y-1.5 pt-0.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <label className={FIELD_LABEL}>
          시작
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={Math.max(1, doc.frameCount - duration + 1)}
            step={1}
            value={clip.startFrame + 1}
            aria-label={`${clip.name} 시작 프레임`}
            data-testid={`timeline-clip-start-${clip.id}`}
            onChange={(event) => {
              const raw = Number(event.target.value);
              if (Number.isFinite(raw)) commit(moveTimelineClip(doc, clip.id, raw - 1));
            }}
            className={NUMBER_INPUT}
          />
        </label>
        <label className={FIELD_LABEL}>
          길이
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={Math.max(1, doc.frameCount - clip.startFrame)}
            step={1}
            value={duration}
            aria-label={`${clip.name} 노출 길이(프레임)`}
            data-testid={`timeline-clip-duration-${clip.id}`}
            onChange={(event) => {
              const raw = Number(event.target.value);
              if (Number.isFinite(raw)) commit(setTimelineClipDuration(doc, clip.id, raw));
            }}
            className={NUMBER_INPUT}
          />
          프레임
        </label>
        <p className="text-[0.62rem] tabular-nums text-fg-3">
          {`${summary} · ${clip.startFrame + 1}–${clip.endFrame + 1}f`}
        </p>
      </div>

      <div
        aria-hidden="true"
        data-clip-bar-track="true"
        className="relative h-6 touch-none select-none overflow-hidden rounded-md border border-line/60 bg-canvas"
      >
        <div
          data-testid={`timeline-clip-bar-${clip.id}`}
          onPointerDown={(event) => beginDrag(event, "move")}
          className={cn(
            "absolute inset-y-0.5 cursor-grab rounded-[0.3rem] active:cursor-grabbing",
            isActive ? "bg-accent/70" : "bg-line-strong/50",
          )}
          style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
        >
          <span
            onPointerDown={(event) => beginDrag(event, "start")}
            className={cn(HANDLE, "left-0 rounded-l-[0.3rem]")}
          />
          <span
            onPointerDown={(event) => beginDrag(event, "end")}
            className={cn(HANDLE, "right-0 rounded-r-[0.3rem]")}
          />
        </div>
      </div>
    </div>
  );
}
