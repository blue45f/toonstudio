import { useCallback, useEffect, useRef, useState } from "react";
import { Flame } from "lucide-react";

import { HorizontalScrollRail } from "@/shared/components/HorizontalScrollRail";
import type { HorizontalScrollController } from "@/shared/lib/horizontal-scroll-ergonomics";

import type { MaterialAsset } from "../material-atlas/model";
import { MATERIAL_KINDS, MATERIAL_PROVIDERS } from "../material-atlas/model";
import { prefersReducedMotion } from "./material-search-ux";
import "./material-discovery.css";

/**
 * 트렌딩 소재 캐러셀. 히어로 영역에 배치하는 시각적 하이라이트.
 * HorizontalScrollRail로 일반 마우스 휠 전환, 클릭-드래그 팬, 44×44px 스텝 버튼,
 * 모바일 터치 관성 스크롤을 함께 지원한다.
 */
export function MaterialTrendingCarousel({
  assets,
  onSelect,
}: {
  assets: readonly MaterialAsset[];
  onSelect: (asset: MaterialAsset) => void;
}) {
  const controllerRef = useRef<HorizontalScrollController | null>(null);
  const [paused, setPaused] = useState(false);
  const [dragging, setDragging] = useState(false);

  const handleControllerReady = useCallback((controller: HorizontalScrollController | null) => {
    controllerRef.current = controller;
  }, []);

  const autoAdvance = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    const metrics = controller.measure();
    if (!metrics.canScroll) return;
    if (!metrics.canScrollRight) {
      controller.scrollToEdge("start");
      return;
    }
    controller.scrollByStep(1, 0.8);
  }, []);

  useEffect(() => {
    if (paused || dragging || prefersReducedMotion()) return;
    const id = window.setInterval(autoAdvance, 4500);
    return () => window.clearInterval(id);
  }, [autoAdvance, dragging, paused]);

  if (!assets.length) return null;

  return (
    <section
      className="md-trending"
      aria-labelledby="md-trending-title"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
    >
      <HorizontalScrollRail
        trackRole="list"
        ariaLabel="트렌딩 소재 목록"
        prevLabel="이전 트렌딩 소재"
        nextLabel="다음 트렌딩 소재"
        hintText="마우스 휠·드래그 또는 버튼으로 좌우 탐색"
        controlsPlacement="header"
        keepButtonsMounted
        showProgress
        showHint
        onControllerReady={handleControllerReady}
        trackClassName="md-trending-track mt-1"
        onDraggingChange={setDragging}
        headerSlot={
          <h2 id="md-trending-title" className="flex items-center gap-2 text-lg font-bold">
            <Flame size={18} className="text-accent" aria-hidden="true" />
            지금 뜨는 소재
          </h2>
        }
      >
        {assets.map((assetItem, index) => (
          <div role="listitem" key={assetItem.id} className="md-trending-item">
            <button
              type="button"
              className="md-trending-card"
              onClick={() => onSelect(assetItem)}
              aria-label={`${assetItem.title} 소재 보기`}
            >
              <span className="md-trending-rank" aria-hidden="true">
                {index + 1}
              </span>
              {assetItem.thumbnailUrl ? (
                <img
                  src={assetItem.thumbnailUrl}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="grid aspect-[4/3] place-items-center text-3xl" aria-hidden="true">
                  ▧
                </span>
              )}
              <span className="md-trending-label">
                {assetItem.title}
                <br />
                <small className="font-normal opacity-80">
                  {MATERIAL_PROVIDERS[assetItem.provider].name} · {MATERIAL_KINDS[assetItem.kind]}
                </small>
              </span>
            </button>
          </div>
        ))}
      </HorizontalScrollRail>
    </section>
  );
}
