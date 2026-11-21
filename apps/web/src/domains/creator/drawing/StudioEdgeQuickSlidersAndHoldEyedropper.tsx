import { Droplet, Pipette, SlidersVertical } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import {
  computeStylusHoverCursorProjection,
  evaluateEdgeQuickSlider,
  TouchHoldEyedropperController,
  type StylusHoverCursorProjection,
} from "./studio-hover-eyedropper-and-assist";
import { StudioTouchGestureGuard } from "./studio-touch-gesture-guard";

import { cn } from "@/shared/lib/utils";

export interface StudioEdgeQuickSlidersAndHoldEyedropperProps {
  readonly visible: boolean;
  readonly strokeWidth: number;
  /** 0.05 ~ 1 */
  readonly brushOpacity: number;
  readonly currentColor: string;
  readonly handedness?: "left" | "right";
  readonly palmRejectionEnabled?: boolean;
  readonly holdDelayMs?: number;
  readonly canvasHostRef: RefObject<HTMLElement | null>;
  readonly onStrokeWidthChange: (next: number) => void;
  readonly onOpacityChange: (next: number) => void;
  readonly onPickColor: (hex: string) => void;
  readonly onUndo?: () => void;
  readonly onRedo?: () => void;
  /** 테스트 또는 커스텀 스테이지용 픽셀 샘플러 (미지정 시 호스트 내부 canvas에서 직접 채집). */
  readonly sampleColorAtClientPoint?: (clientX: number, clientY: number) => string | null;
}

interface ActiveEdgeDrag {
  readonly kind: "brush-size" | "brush-opacity";
  readonly pointerId: number;
  readonly startY: number;
  readonly baseValue: number;
}

interface SamplingOverlayState {
  readonly x: number;
  readonly y: number;
  readonly sampledColor: string;
}

function rgbToHex(r: number, g: number, b: number): string {
  const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function sampleCanvasColorAt(host: HTMLElement | null, clientX: number, clientY: number): string | null {
  if (!host) return null;
  const canvases = Array.from(host.querySelectorAll("canvas"));
  for (let i = canvases.length - 1; i >= 0; i -= 1) {
    const canvas = canvases[i]!;
    const rect = canvas.getBoundingClientRect();
    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      continue;
    }
    try {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) continue;
      const sx = Math.floor(((clientX - rect.left) / rect.width) * canvas.width);
      const sy = Math.floor(((clientY - rect.top) / rect.height) * canvas.height);
      const pixel = ctx.getImageData(
        Math.max(0, Math.min(canvas.width - 1, sx)),
        Math.max(0, Math.min(canvas.height - 1, sy)),
        1,
        1,
      ).data;
      if ((pixel[3] ?? 0) > 0) {
        return rgbToHex(pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0);
      }
    } catch {
      // 보안 오염 캔버스 또는 모의 환경은 안전하게 폴백
    }
  }
  return null;
}

/**
 * 모바일/태블릿 Procreate급 드로잉 엣지 오버레이 (T1 · T4 · T5 · T12):
 * - T12: 화면 가장자리 굵기(1~200px 비선형)/불투명도(5~100%) 퀵 슬라이더 (`evaluateEdgeQuickSlider`)
 * - T12: 400ms 터치-홀드 스포이드 루페 (`TouchHoldEyedropperController`)
 * - T1/T5: 2/3손가락 탭·홀드 스크럽 Undo/Redo + 팜 리젝션 가드 (`StudioTouchGestureGuard`)
 * - T4: 펜촉 호버 각도·기울기 커서 투영 (`computeStylusHoverCursorProjection`)
 */
export function StudioEdgeQuickSlidersAndHoldEyedropper({
  visible,
  strokeWidth,
  brushOpacity,
  currentColor,
  handedness = "right",
  palmRejectionEnabled = true,
  holdDelayMs = 400,
  canvasHostRef,
  onStrokeWidthChange,
  onOpacityChange,
  onPickColor,
  onUndo,
  onRedo,
  sampleColorAtClientPoint,
}: StudioEdgeQuickSlidersAndHoldEyedropperProps) {
  const dragRef = useRef<ActiveEdgeDrag | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const scrubTimerRef = useRef<number | null>(null);
  const hudClearTimerRef = useRef<number | null>(null);
  const eyedropperRef = useRef(new TouchHoldEyedropperController({ holdDelayMs, maxJitterPx: 10 }));
  const gestureGuardRef = useRef(new StudioTouchGestureGuard());

  const [draggingKind, setDraggingKind] = useState<"brush-size" | "brush-opacity" | null>(null);
  const [sampling, setSampling] = useState<SamplingOverlayState | null>(null);
  const [hoverCursor, setHoverCursor] = useState<StylusHoverCursorProjection | null>(null);
  const [gestureHud, setGestureHud] = useState<string | null>(null);

  const showGestureHud = useCallback((message: string) => {
    setGestureHud(message);
    if (hudClearTimerRef.current !== null) {
      globalThis.clearTimeout(hudClearTimerRef.current);
    }
    hudClearTimerRef.current = globalThis.setTimeout(() => {
      setGestureHud(null);
      hudClearTimerRef.current = null;
    }, 1400);
  }, []);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current !== null) {
      globalThis.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const clearScrubTimer = useCallback(() => {
    if (scrubTimerRef.current !== null) {
      globalThis.clearInterval(scrubTimerRef.current);
      scrubTimerRef.current = null;
    }
  }, []);

  const resolveSampleColor = useCallback(
    (clientX: number, clientY: number): string => {
      const custom = sampleColorAtClientPoint?.(clientX, clientY);
      if (custom) return custom;
      return sampleCanvasColorAt(canvasHostRef.current, clientX, clientY) ?? currentColor;
    },
    [canvasHostRef, currentColor, sampleColorAtClientPoint],
  );

  // T1(2/3손가락 탭+홀드 스크럽) + T4(펜 호버 투영) + T5(팜 리젝션) + T12(400ms 터치-홀드 스포이드)
  useEffect(() => {
    if (!visible) {
      clearHoldTimer();
      clearScrubTimer();
      setSampling(null);
      setHoverCursor(null);
      return;
    }
    const host = canvasHostRef.current;
    if (!host) return;
    eyedropperRef.current = new TouchHoldEyedropperController({ holdDelayMs, maxJitterPx: 10 });
    const guard = gestureGuardRef.current;
    const activeTouchIds = new Set<number>();

    const readMonotonicNowMs = (): number =>
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest("[data-studio-edge-quick-sliders], button, input, [role='dialog']")) {
        return;
      }
      const pointerType =
        event.pointerType === "pen" || event.pointerType === "touch" ? event.pointerType : "mouse";
      const nowMs = readMonotonicNowMs();
      const sample = {
        pointerId: event.pointerId,
        pointerType,
        x: event.clientX,
        y: event.clientY,
        width: event.width,
        height: event.height,
        timestampMs: nowMs,
      };
      const decision = guard.onPointerDown(sample);
      if (palmRejectionEnabled && decision.rejected) {
        showGestureHud("손바닥 터치를 무시했습니다");
        return;
      }
      if (pointerType === "pen") {
        setHoverCursor(null);
        return;
      }
      if (pointerType !== "touch") return;

      activeTouchIds.add(event.pointerId);
      if (activeTouchIds.size === 1) {
        eyedropperRef.current.beginTouch(event.clientX, event.clientY, nowMs);
        clearHoldTimer();
        holdTimerRef.current = globalThis.setTimeout(() => {
          const state = eyedropperRef.current.updateTouch(
            event.clientX,
            event.clientY,
            readMonotonicNowMs(),
          );
          if (state.phase === "sampling") {
            setSampling({
              x: state.x,
              y: state.y,
              sampledColor: resolveSampleColor(state.x, state.y),
            });
          }
        }, holdDelayMs);
      } else {
        // 멀티터치(2~3손가락) 진입 시 단일 터치 스포이드 취소 및 홀드 스크럽 폴링 시작
        // 모든 이벤트와 폴링이 동일한 단일 시계(readMonotonicNowMs)를 사용해 DOMHighResTimeStamp vs Epoch 불일치를 차단한다.
        clearHoldTimer();
        eyedropperRef.current.endTouch();
        setSampling(null);
        if (scrubTimerRef.current === null) {
          scrubTimerRef.current = globalThis.setInterval(() => {
            const action = guard.pollHoldScrub(readMonotonicNowMs());
            if (action.type === "undo") {
              onUndo?.();
              showGestureHud("연속 실행 취소");
            } else if (action.type === "redo") {
              onRedo?.();
              showGestureHud("연속 다시 실행");
            }
          }, 120);
        }
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "pen" && event.buttons === 0) {
        setHoverCursor(
          computeStylusHoverCursorProjection({
            x: event.clientX,
            y: event.clientY,
            brushDiameterPx: strokeWidth,
            tiltXDeg: event.tiltX,
            tiltYDeg: event.tiltY,
            twistDeg: event.twist,
          }),
        );
        return;
      }
      if (event.pointerType !== "touch") return;
      const nowMs = readMonotonicNowMs();
      guard.onPointerMove({
        pointerId: event.pointerId,
        pointerType: "touch",
        x: event.clientX,
        y: event.clientY,
        timestampMs: nowMs,
      });
      if (activeTouchIds.size === 1) {
        const state = eyedropperRef.current.updateTouch(event.clientX, event.clientY, nowMs);
        if (state.phase === "idle") {
          clearHoldTimer();
          setSampling(null);
        } else if (state.phase === "sampling") {
          setSampling({
            x: state.x,
            y: state.y,
            sampledColor: resolveSampleColor(state.x, state.y),
          });
        }
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      const pointerType =
        event.pointerType === "pen" || event.pointerType === "touch" ? event.pointerType : "mouse";
      const nowMs = readMonotonicNowMs();
      const action = guard.onPointerUp({
        pointerId: event.pointerId,
        pointerType,
        x: event.clientX,
        y: event.clientY,
        timestampMs: nowMs,
      });
      if (pointerType === "touch") {
        activeTouchIds.delete(event.pointerId);
        if (activeTouchIds.size < 2) clearScrubTimer();
        clearHoldTimer();
        const prevEyedropper = eyedropperRef.current.endTouch();
        if (prevEyedropper.phase === "sampling") {
          const picked = resolveSampleColor(prevEyedropper.x, prevEyedropper.y);
          onPickColor(picked);
          setSampling(null);
          showGestureHud(`스포이드 채집 ${picked.toUpperCase()}`);
        } else {
          setSampling(null);
        }
      }
      if (action.type === "undo") {
        onUndo?.();
        showGestureHud("두 손가락 실행 취소");
      } else if (action.type === "redo") {
        onRedo?.();
        showGestureHud("세 손가락 다시 실행");
      }
    };

    const onPointerCancel = (event: PointerEvent) => {
      guard.onPointerCancel(event.pointerId);
      activeTouchIds.delete(event.pointerId);
      clearHoldTimer();
      clearScrubTimer();
      eyedropperRef.current.endTouch();
      setSampling(null);
    };

    const onPointerLeave = () => {
      setHoverCursor(null);
    };

    host.addEventListener("pointerdown", onPointerDown);
    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerup", onPointerUp);
    host.addEventListener("pointercancel", onPointerCancel);
    host.addEventListener("pointerleave", onPointerLeave);
    return () => {
      clearHoldTimer();
      clearScrubTimer();
      if (hudClearTimerRef.current !== null) globalThis.clearTimeout(hudClearTimerRef.current);
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerup", onPointerUp);
      host.removeEventListener("pointercancel", onPointerCancel);
      host.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [
    canvasHostRef,
    clearHoldTimer,
    clearScrubTimer,
    holdDelayMs,
    onPickColor,
    onRedo,
    onUndo,
    palmRejectionEnabled,
    resolveSampleColor,
    showGestureHud,
    strokeWidth,
    visible,
  ]);

  if (!visible) return null;

  const opacityPercent = Math.round(Math.max(0.05, Math.min(1, brushOpacity)) * 100);
  const sizeRatio = Math.sqrt(Math.max(0, strokeWidth - 1) / 199);

  const beginEdgeDrag = (
    kind: "brush-size" | "brush-opacity",
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      kind,
      pointerId: event.pointerId,
      startY: event.clientY,
      baseValue: kind === "brush-size" ? strokeWidth : brushOpacity,
    };
    setDraggingKind(kind);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // jsdom 안전 폴백
    }
  };

  const moveEdgeDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = dragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    const next = evaluateEdgeQuickSlider({
      kind: active.kind,
      baseValue: active.baseValue,
      dragDeltaY: event.clientY - active.startY,
      trackHeightPx: 140,
    });
    if (active.kind === "brush-size") {
      onStrokeWidthChange(next);
    } else {
      onOpacityChange(next);
    }
  };

  const endEdgeDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDraggingKind(null);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // 안전 해제
    }
  };

  const handleSliderKeyDown = (
    kind: "brush-size" | "brush-opacity",
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    const stepDelta = event.shiftKey ? 28 : 12;
    let deltaY: number;
    if (event.key === "ArrowUp" || event.key === "ArrowRight") deltaY = -stepDelta;
    else if (event.key === "ArrowDown" || event.key === "ArrowLeft") deltaY = stepDelta;
    else if (event.key === "Home") {
      event.preventDefault();
      if (kind === "brush-size") onStrokeWidthChange(1);
      else onOpacityChange(0.05);
      return;
    } else if (event.key === "End") {
      event.preventDefault();
      if (kind === "brush-size") onStrokeWidthChange(200);
      else onOpacityChange(1);
      return;
    } else {
      return;
    }
    event.preventDefault();
    const next = evaluateEdgeQuickSlider({
      kind,
      baseValue: kind === "brush-size" ? strokeWidth : brushOpacity,
      dragDeltaY: deltaY,
      trackHeightPx: 140,
    });
    if (kind === "brush-size") onStrokeWidthChange(next);
    else onOpacityChange(next);
  };

  return (
    <>
      {/* T12: 화면 가장자리 굵기 · 불투명도 퀵 슬라이더 */}
      <aside
        aria-label="가장자리 브러시 퀵 슬라이더"
        data-studio-edge-quick-sliders="true"
        className={cn(
          "pointer-events-auto absolute top-1/2 z-[32] flex -translate-y-1/2 flex-col items-center gap-2 rounded-2xl border border-line bg-panel/90 p-1.5 shadow-[var(--atelier-elevation-dock)] backdrop-blur-sm",
          handedness === "left" ? "right-2" : "left-2",
        )}
      >
        <div
          role="slider"
          tabIndex={0}
          aria-label="가장자리 브러시 굵기 슬라이더"
          aria-orientation="vertical"
          aria-valuemin={1}
          aria-valuemax={200}
          aria-valuenow={Math.round(strokeWidth)}
          aria-valuetext={`${Math.round(strokeWidth)}px`}
          data-studio-edge-slider="brush-size"
          onPointerDown={(event) => beginEdgeDrag("brush-size", event)}
          onPointerMove={moveEdgeDrag}
          onPointerUp={endEdgeDrag}
          onPointerCancel={endEdgeDrag}
          onKeyDown={(event) => handleSliderKeyDown("brush-size", event)}
          className={cn(
            "relative flex h-28 w-11 cursor-ns-resize touch-none flex-col items-center justify-between rounded-xl border px-1 py-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            draggingKind === "brush-size"
              ? "border-accent bg-accent-soft text-accent"
              : "border-line bg-card/90 text-fg-2 hover:border-line-strong hover:text-fg",
          )}
        >
          <SlidersVertical size={12} aria-hidden="true" />
          <div className="relative h-14 w-1.5 overflow-hidden rounded-full bg-raised">
            <div
              className="absolute inset-x-0 bottom-0 rounded-full bg-[linear-gradient(0deg,var(--color-accent),var(--color-accent-2))]"
              style={{ height: `${Math.round(sizeRatio * 100)}%` }}
            />
          </div>
          <span className="text-[0.6rem] font-bold tabular-nums">{Math.round(strokeWidth)}px</span>
        </div>

        <div
          role="slider"
          tabIndex={0}
          aria-label="가장자리 브러시 불투명도 슬라이더"
          aria-orientation="vertical"
          aria-valuemin={5}
          aria-valuemax={100}
          aria-valuenow={opacityPercent}
          aria-valuetext={`${opacityPercent}%`}
          data-studio-edge-slider="brush-opacity"
          onPointerDown={(event) => beginEdgeDrag("brush-opacity", event)}
          onPointerMove={moveEdgeDrag}
          onPointerUp={endEdgeDrag}
          onPointerCancel={endEdgeDrag}
          onKeyDown={(event) => handleSliderKeyDown("brush-opacity", event)}
          className={cn(
            "relative flex h-28 w-11 cursor-ns-resize touch-none flex-col items-center justify-between rounded-xl border px-1 py-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            draggingKind === "brush-opacity"
              ? "border-accent bg-accent-soft text-accent"
              : "border-line bg-card/90 text-fg-2 hover:border-line-strong hover:text-fg",
          )}
        >
          <Droplet size={12} aria-hidden="true" />
          <div className="relative h-14 w-1.5 overflow-hidden rounded-full bg-raised">
            <div
              className="absolute inset-x-0 bottom-0 rounded-full bg-[linear-gradient(0deg,var(--color-cool),var(--color-accent))]"
              style={{ height: `${opacityPercent}%` }}
            />
          </div>
          <span className="text-[0.6rem] font-bold tabular-nums">{opacityPercent}%</span>
        </div>
      </aside>

      {/* T12: 400ms 터치-홀드 스포이드 루페 오버레이 */}
      {sampling ? (
        <div
          role="status"
          aria-live="polite"
          data-studio-touch-hold-eyedropper="true"
          style={{ left: `${sampling.x}px`, top: `${Math.max(56, sampling.y - 68)}px` }}
          className="pointer-events-none fixed z-[90] flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border-2 border-line-strong bg-panel/95 px-3 py-1.5 text-xs font-semibold text-fg shadow-[var(--atelier-elevation-floating)]"
        >
          <span
            aria-hidden="true"
            className="size-6 rounded-full border border-line-strong"
            style={{ backgroundColor: sampling.sampledColor }}
          />
          <span className="flex flex-col leading-tight">
            <span className="inline-flex items-center gap-1 text-[0.62rem] text-fg-3">
              <Pipette size={11} aria-hidden="true" />
              스포이드
            </span>
            <span className="font-mono text-[0.68rem] uppercase tabular-nums">
              {sampling.sampledColor}
            </span>
          </span>
          <span
            aria-hidden="true"
            className="size-4 rounded-full border border-line"
            style={{ backgroundColor: currentColor }}
            title="이전 색"
          />
        </div>
      ) : null}

      {/* T4: 스타일러스 호버 기울기·각도 미리보기 커서 */}
      {hoverCursor ? (
        <div
          aria-hidden="true"
          data-studio-stylus-hover-cursor="true"
          style={{
            left: `${hoverCursor.cx}px`,
            top: `${hoverCursor.cy}px`,
            width: `${hoverCursor.majorAxisPx}px`,
            height: `${hoverCursor.minorAxisPx}px`,
            transform: `translate(-50%, -50%) rotate(${hoverCursor.rotationDeg}deg)`,
          }}
          className="pointer-events-none fixed z-[45] rounded-full border border-accent/80 bg-accent/10"
        />
      ) : null}

      {/* T1/T5 제스처 피드백 배지 */}
      {gestureHud ? (
        <div
          role="status"
          aria-live="polite"
          data-studio-touch-gesture-hud="true"
          className="pointer-events-none fixed bottom-20 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-line-strong bg-panel/95 px-3.5 py-1.5 text-xs font-semibold text-fg shadow-[var(--atelier-elevation-dock)] break-keep"
        >
          {gestureHud}
        </div>
      ) : null}
    </>
  );
}
