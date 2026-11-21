import { Mouse } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import "@/shared/components/horizontal-scroll-rail.css";
import {
  attachHorizontalScrollErgonomics,
  type HorizontalScrollController,
  type HorizontalScrollMetrics,
} from "@/shared/lib/horizontal-scroll-ergonomics";
import { cn } from "@/shared/lib/utils";

type ScrollRegionProps = Pick<ComponentProps<"div">, "aria-label" | "aria-labelledby" | "children" | "className">;

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

/**
 * 가상 스튜디오 표·목록 스크롤 영역.
 * 가로 오버플로가 생길 때만 일반 휠 마우스 가로 전환, 드래그 팬, 44×44px 좌/우 스텝 버튼,
 * 페이드 마스크, 클릭 가능한 슬림 진행 바를 활성화해 세로 전용 목록에는 간섭하지 않는다.
 */
export function StudioSpaceScrollRegion({
  children,
  className,
  ...ariaProps
}: ScrollRegionProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<HorizontalScrollController | null>(null);
  const [metrics, setMetrics] = useState<HorizontalScrollMetrics>(INITIAL_METRICS);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const controller = attachHorizontalScrollErgonomics(element, {
      onMetricsChange: setMetrics,
    });
    controllerRef.current = controller;

    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.measure();
  }, [children]);

  const handleStep = useCallback((direction: -1 | 1) => {
    controllerRef.current?.scrollByStep(direction);
  }, []);

  const handleProgressClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    controllerRef.current?.scrollToProgress((event.clientX - rect.left) / rect.width);
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

  const thumbWidthPct =
    metrics.canScroll && metrics.scrollWidth > 0
      ? Math.min(100, Math.max(16, (metrics.clientWidth / metrics.scrollWidth) * 100))
      : 100;
  const thumbLeftPct = (100 - thumbWidthPct) * metrics.scrollProgress;
  const progressPercent = Math.round(metrics.scrollProgress * 100);

  return (
    <div className="ts-hscroll-root min-w-0">
      {metrics.canScroll ? (
        <div className="ts-hscroll-header">
          <p className="ts-hscroll-hint" aria-label="마우스 휠·드래그 또는 버튼으로 가로 이동">
            <Mouse size={13} aria-hidden="true" />
            <span>마우스 휠·드래그 또는 버튼으로 가로 이동</span>
          </p>
          <div className="ts-hscroll-header-controls">
            <button
              type="button"
              className="ts-hscroll-btn ts-hscroll-btn-header"
              aria-label="이전 열로 가로 스크롤"
              disabled={!metrics.canScrollLeft}
              onClick={() => handleStep(-1)}
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button
              type="button"
              className="ts-hscroll-btn ts-hscroll-btn-header"
              aria-label="다음 열로 가로 스크롤"
              disabled={!metrics.canScrollRight}
              onClick={() => handleStep(1)}
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
        </div>
      ) : null}

      <div
        className="ts-hscroll-viewport"
        data-fade-left={metrics.canScrollLeft ? "true" : "false"}
        data-fade-right={metrics.canScrollRight ? "true" : "false"}
      >
        <div
          ref={scrollRef}
          {...ariaProps}
          role="region"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- 표와 목록이 넘칠 때 키보드로 스크롤할 수 있도록 이름 있는 영역 자체가 포커스를 받는다.
          tabIndex={0}
          className={cn(className, metrics.canScroll && "ts-hscroll-track")}
        >
          {children}
        </div>
      </div>

      {metrics.canScroll ? (
        <div className="ts-hscroll-footer">
          <div
            role="slider"
            tabIndex={0}
            aria-label="가로 스크롤 진행 위치"
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
        </div>
      ) : null}
    </div>
  );
}
