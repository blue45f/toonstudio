/**
 * 프리뷰 컷 페이지 위에 독자·어시스턴트 피드백 핀 마커를 표시하고,
 * 핀 배치 모드에서 클릭한 위치의 정규화 좌표 (x, y)를 수집하는 오버레이.
 */

import type { MouseEvent, ReactElement } from "react";

import {
  clampNormalizedCoordinate,
  READER_FEEDBACK_PIN_CATEGORY_LABELS,
  type ReaderFeedbackPin,
  type ReaderFeedbackPinCategory,
} from "./reader-feedback-pins-model";

import { cn } from "@/shared/lib/utils";

export interface StudioReaderFeedbackPinOverlayProps {
  readonly pageId: string;
  readonly pageLabel: string;
  readonly pins: readonly ReaderFeedbackPin[];
  readonly activePinId: string | null;
  readonly placementMode: boolean;
  readonly onSelectPin: (pin: ReaderFeedbackPin) => void;
  readonly onPickCoordinate: (pageId: string, x: number, y: number) => void;
}

function categoryBadgeClass(category: ReaderFeedbackPinCategory, resolved: boolean): string {
  if (resolved) {
    return "border-good/60 bg-good/85 text-white";
  }
  switch (category) {
    case "typo":
      return "border-danger/80 bg-danger text-white";
    case "art-fix":
      return "border-amber-500 bg-amber-500 text-neutral-950";
    case "balloon":
      return "border-sky-500 bg-sky-600 text-white";
    case "direction":
      return "border-accent bg-accent text-on-accent";
  }
}

export function StudioReaderFeedbackPinOverlay({
  pageId,
  pageLabel,
  pins,
  activePinId,
  placementMode,
  onSelectPin,
  onPickCoordinate,
}: StudioReaderFeedbackPinOverlayProps): ReactElement | null {
  if (!placementMode && pins.length === 0) return null;

  function handlePlacementClick(event: MouseEvent<HTMLButtonElement>): void {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.width > 0 ? clampNormalizedCoordinate((event.clientX - rect.left) / rect.width) : 0.5;
    const y = rect.height > 0 ? clampNormalizedCoordinate((event.clientY - rect.top) / rect.height) : 0.5;
    onPickCoordinate(pageId, x, y);
  }

  return (
    <div
      data-reader-pin-overlay={pageId}
      className="pointer-events-none absolute inset-0 z-30"
    >
      {placementMode ? (
        <button
          type="button"
          onClick={handlePlacementClick}
          aria-label={`${pageLabel}에 피드백 핀 위치 지정`}
          className="pointer-events-auto absolute inset-0 cursor-crosshair rounded-lg border-2 border-dashed border-accent/75 bg-accent/10 transition-colors hover:bg-accent/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-accent/50 bg-panel/95 px-2.5 py-1 text-[0.66rem] font-semibold text-accent shadow-sm">
            클릭해 핀 좌표 지정
          </span>
        </button>
      ) : null}

      {pins.map((pin, index) => {
        const isActive = pin.id === activePinId;
        const resolved = pin.status === "resolved";
        const categoryLabel = READER_FEEDBACK_PIN_CATEGORY_LABELS[pin.category];
        return (
          <button
            key={pin.id}
            type="button"
            data-feedback-pin-marker={pin.id}
            onClick={() => onSelectPin(pin)}
            aria-label={`${pageLabel} ${pin.cutIndex}컷 ${categoryLabel} 핀: ${pin.comment}`}
            aria-pressed={isActive}
            style={{
              left: `${Math.round(pin.x * 1000) / 10}%`,
              top: `${Math.round(pin.y * 1000) / 10}%`,
            }}
            className={cn(
              "pointer-events-auto absolute grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
              isActive && "z-40",
            )}
          >
            <span
              className={cn(
                "grid size-7 place-items-center rounded-full border-2 text-[0.68rem] font-black shadow-md transition-transform",
                categoryBadgeClass(pin.category, resolved),
                isActive && "scale-125 ring-2 ring-white ring-offset-1 ring-offset-panel",
              )}
            >
              {index + 1}
            </span>
          </button>
        );
      })}
    </div>
  );
}
