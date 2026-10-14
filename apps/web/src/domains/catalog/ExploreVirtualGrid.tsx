import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { Title } from "@/shared/lib/types";

import { TitleCard } from "@/shared/components/title-card";

/**
 * 탐색 결과 그리드 윈도잉 — @tanstack/react-virtual (window 스크롤).
 *
 * 이전에는 `shown`이 늘어날 때마다 전체 결과가 DOM에 누적됐다(발견 4).
 * 이제 화면 근처 행만 마운트하므로 끝까지 스크롤해도 DOM 노드 수가
 * 뷰포트 분량 + overscan으로 상한이 유지된다. 데이터 흐름(shown 증가·
 * 센티넬·더 보기)은 ExplorePage가 그대로 소유하고, 이 컴포넌트는
 * 렌더링 윈도잉만 담당한다.
 *
 * 행 단위 가상화: 행 내부는 기존과 동일한 반응형 그리드 클래스를 쓰므로
 * 열 수·간격·카드 크기는 CSS가 정하고, JS는 같은 브레이크포인트
 * (640/1024/1280)로 행당 개수만 맞춘다. 행 높이는 measureElement가
 * 실측해 보정하므로 estimateSize는 초기 추정치로 충분하다.
 */

const GRID_CLASS =
  "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

function columnCount(): number {
  if (typeof window === "undefined") return 2;
  if (window.matchMedia("(min-width: 1280px)").matches) return 5;
  if (window.matchMedia("(min-width: 1024px)").matches) return 4;
  if (window.matchMedia("(min-width: 640px)").matches) return 3;
  return 2;
}

function useColumnCount(): number {
  const [cols, setCols] = useState<number>(columnCount);
  useEffect(() => {
    const queries = [
      window.matchMedia("(min-width: 640px)"),
      window.matchMedia("(min-width: 1024px)"),
      window.matchMedia("(min-width: 1280px)"),
    ];
    const update = () => setCols(columnCount());
    queries.forEach((q) => q.addEventListener("change", update));
    update();
    return () => queries.forEach((q) => q.removeEventListener("change", update));
  }, []);
  return cols;
}

// 브러시 가상화(studio-brush-virtual.tsx)와 같은 폴백 계약:
// jsdom 등 레이아웃 측정이 없는 환경에서는 가상화를 건너뛰고 전체를 그린다.
function isUnmeasurableEnv(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return (globalThis as Record<string, unknown>)["vi"] !== undefined;
  } catch {
    return false;
  }
}

export function ExploreVirtualGrid({ titles }: { titles: Title[] }) {
  const cols = useColumnCount();
  const parentRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  // 그리드 상단의 문서 기준 오프셋 — 위쪽 콘텐츠(필터 패널 등)가
  // 열리고 닫혀도 어긋나지 않게 커밋마다 다시 잰다(같은 값이면 React가 무시).
  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const next = el.getBoundingClientRect().top + window.scrollY;
    setScrollMargin((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
  });

  const rowCount = Math.ceil(titles.length / cols);
  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => {
      const cardWidth = Math.min(window.innerWidth, 1536) / cols;
      // 포스터 3:4 + 제목·메타 블록 + 행 하단 간격(pb-8) 추정치. 실측으로 보정된다.
      return Math.round((cardWidth * 4) / 3 + 132);
    },
    overscan: 3,
    scrollMargin,
  });

  if (isUnmeasurableEnv()) {
    return (
      <div className={`${GRID_CLASS} gap-y-8`}>
        {titles.map((title) => (
          <TitleCard key={title.id} title={title} />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="relative w-full"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((vrow) => {
        const rowTitles = titles.slice(vrow.index * cols, vrow.index * cols + cols);
        return (
          <div
            key={vrow.key}
            data-index={vrow.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 top-0 w-full"
            style={{ transform: `translateY(${vrow.start - scrollMargin}px)` }}
          >
            {/* pb-8 = 기존 그리드의 gap-y-8(행 간격)을 행 내부에서 흡수 */}
            <div className={`${GRID_CLASS} pb-8`}>
              {rowTitles.map((title) => (
                <TitleCard key={title.id} title={title} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
