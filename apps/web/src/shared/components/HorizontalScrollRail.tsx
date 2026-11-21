import { Mouse } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import {
  attachHorizontalScrollErgonomics,
  type HorizontalScrollController,
  type HorizontalScrollMetrics,
} from "@/shared/lib/horizontal-scroll-ergonomics";
import { cn } from "@/shared/lib/utils";
import "./horizontal-scroll-rail.css";

const INITIAL_METRICS: HorizontalScrollMetrics = {
  scrollLeft: 0,
  scrollWidth: 0,
  clientWidth: 0,
  maxScrollLeft: 0,
  canScroll: false,
  canScrollLeft: false,
  canScrollRight: false,
  scrollProgress: 0,
};

export interface HorizontalScrollRailProps {
  readonly children: ReactNode;
  readonly ariaLabel?: string;
  readonly ariaLabelledBy?: string;
  readonly trackRole?: "region" | "list" | "group";
  readonly prevLabel?: string;
  readonly nextLabel?: string;
  readonly hintText?: string;
  readonly progressLabel?: string;
  readonly showHint?: boolean;
  readonly showProgress?: boolean;
  readonly controlsPlacement?: "overlay" | "header";
  readonly headerSlot?: ReactNode;
  readonly keepButtonsMounted?: boolean;
  readonly onControllerReady?: (controller: HorizontalScrollController | null) => void;
  readonly className?: string;
  readonly trackClassName?: string;
  readonly stepRatio?: number;
  readonly dragToScroll?: boolean;
  readonly wheelToHorizontal?: boolean;
  readonly testId?: string;
  readonly trackTestId?: string;
  readonly onMetricsChange?: (metrics: HorizontalScrollMetrics) => void;
  readonly onDraggingChange?: (dragging: boolean) => void;
}

/**
 * 일반 휠 마우스(비-매직마우스) 세로 휠 가로 전환, 클릭-드래그 팬(관성 감속),
 * 44×44px 좌/우 스텝 버튼, 동적 페이드 마스크, 클릭 가능한 슬림 진행 바,
 * 모바일 터치 관성 스크롤을 통합 제공하는 공용 가로 스크롤 레일 컴포넌트.
 */
export function HorizontalScrollRail({
  children,
  ariaLabel,
  ariaLabelledBy,
  trackRole = "region",
  prevLabel = "이전 항목으로 가로 스크롤",
  nextLabel = "다음 항목으로 가로 스크롤",
  hintText = "마우스 휠·드래그 또는 버튼으로 좌우 이동",
  progressLabel = "가로 스크롤 진행 위치",
  showHint = true,
  showProgress = true,
  controlsPlacement = "overlay",
  headerSlot,
  keepButtonsMounted = false,
  onControllerReady,
  className,
  trackClassName,
  stepRatio = 0.78,
  dragToScroll = true,
  wheelToHorizontal = true,
  testId,
  trackTestId,
  onMetricsChange,
  onDraggingChange,
}: HorizontalScrollRailProps) {
  const internalTrackRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<HorizontalScrollController | null>(null);
  const [metrics, setMetrics] = useState<HorizontalScrollMetrics>(INITIAL_METRICS);

  useEffect(() => {
    const element = internalTrackRef.current;
    if (!element) return;

    const controller = attachHorizontalScrollErgonomics(element, {
      stepRatio,
      dragToScroll,
      wheelToHorizontal,
      onMetricsChange: (next) => {
        setMetrics(next);
        onMetricsChange?.(next);
      },
      onDraggingChange,
    });
    controllerRef.current = controller;
    onControllerReady?.(controller);

    return () => {
      onControllerReady?.(null);
      controller.destroy();
      controllerRef.current = null;
    };
  }, [dragToScroll, onControllerReady, onDraggingChange, onMetricsChange, stepRatio, wheelToHorizontal]);

  useEffect(() => {
    controllerRef.current?.measure();
  }, [children]);

  const handleStep = useCallback((direction: -1 | 1) => {
    controllerRef.current?.scrollByStep(direction);
  }, []);

  const handleProgressClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    controllerRef.current?.scrollToProgress(ratio);
  }, []);

  const handleProgressKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      controllerRef.current?.scrollByStep(-1, 0.35);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      controllerRef.current?.scrollByStep(1, 0.35);
    } else if (event.key === "Home") {
      event.preventDefault();
      controllerRef.current?.scrollToEdge("start");
    } else if (event.key === "End") {
      event.preventDefault();
      controllerRef.current?.scrollToEdge("end");
    }
  }, []);

  const showOverlayButtons = controlsPlacement === "overlay" && (metrics.canScroll || keepButtonsMounted);
  const showHeaderButtons = controlsPlacement === "header" && (metrics.canScroll || keepButtonsMounted);
  const showHeaderRow = Boolean(headerSlot) || showHeaderButtons;
  const showFooterRow = metrics.canScroll && (showProgress || showHint);

  const thumbWidthPct =
    metrics.canScroll && metrics.scrollWidth > 0
      ? Math.min(100, Math.max(16, (metrics.clientWidth / metrics.scrollWidth) * 100))
      : 100;
  const thumbLeftPct = (100 - thumbWidthPct) * metrics.scrollProgress;
  const progressPercent = Math.round(metrics.scrollProgress * 100);

  const prevDisabled = metrics.canScroll ? !metrics.canScrollLeft : !keepButtonsMounted;
  const nextDisabled = metrics.canScroll ? !metrics.canScrollRight : !keepButtonsMounted;

  return (
    <div className={cn("ts-hscroll-root", className)} data-testid={testId}>
      {showHeaderRow ? (
        <div className="ts-hscroll-header">
          {headerSlot ? <div className="ts-hscroll-header-slot">{headerSlot}</div> : null}
          {showHeaderButtons ? (
            <div className="ts-hscroll-header-controls">
              <button
                type="button"
                className="ts-hscroll-btn ts-hscroll-btn-header"
                aria-label={prevLabel}
                disabled={metrics.canScroll ? !metrics.canScrollLeft : false}
                onClick={() => handleStep(-1)}
              >
                <span aria-hidden="true">‹</span>
              </button>
              <button
                type="button"
                className="ts-hscroll-btn ts-hscroll-btn-header"
                aria-label={nextLabel}
                disabled={metrics.canScroll ? !metrics.canScrollRight : false}
                onClick={() => handleStep(1)}
              >
                <span aria-hidden="true">›</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="ts-hscroll-stage">
        {showOverlayButtons ? (
          <button
            type="button"
            className="ts-hscroll-btn ts-hscroll-btn-overlay"
            data-direction="prev"
            data-edge-hidden={metrics.canScrollLeft ? "false" : "true"}
            aria-label={prevLabel}
            disabled={prevDisabled}
            onClick={() => handleStep(-1)}
          >
            <span aria-hidden="true">‹</span>
          </button>
        ) : null}

        <div
          className="ts-hscroll-viewport"
          data-fade-left={metrics.canScrollLeft ? "true" : "false"}
          data-fade-right={metrics.canScrollRight ? "true" : "false"}
        >
          <div
            ref={internalTrackRef}
            role={trackRole}
            aria-label={ariaLabel ?? (ariaLabelledBy ? undefined : "가로 스크롤 영역")}
            aria-labelledby={ariaLabelledBy}
            tabIndex={0}
            className={cn("ts-hscroll-track", trackClassName)}
            data-testid={trackTestId}
          >
            {children}
          </div>
        </div>

        {showOverlayButtons ? (
          <button
            type="button"
            className="ts-hscroll-btn ts-hscroll-btn-overlay"
            data-direction="next"
            data-edge-hidden={metrics.canScrollRight ? "false" : "true"}
            aria-label={nextLabel}
            disabled={nextDisabled}
            onClick={() => handleStep(1)}
          >
            <span aria-hidden="true">›</span>
          </button>
        ) : null}
      </div>

      {showFooterRow ? (
        <div className="ts-hscroll-footer">
          {showProgress ? (
            <div
              role="slider"
              tabIndex={0}
              aria-label={progressLabel}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
              className="ts-hscroll-progress"
              onClick={handleProgressClick}
              onKeyDown={handleProgressKeyDown}
            >
              <div className="ts-hscroll-progress-bar">
                <span
                  className="ts-hscroll-progress-thumb"
                  style={{ width: `${thumbWidthPct}%`, left: `${thumbLeftPct}%` }}
                />
              </div>
            </div>
          ) : null}
          {showHint ? (
            <p className="ts-hscroll-hint" aria-label={hintText}>
              <Mouse size={13} aria-hidden="true" />
              <span>{hintText}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
