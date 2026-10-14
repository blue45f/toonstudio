import { useState, type DragEvent } from "react";

/** 호버 카드와 카드 내 세로 위치 비율로 드롭 슬롯을 계산한다. */
export function computeDropSlot(targetIndex: number, offsetRatio: number): number {
  if (targetIndex < 0) return 0;
  return offsetRatio < 0.5 ? targetIndex : targetIndex + 1;
}

/** 자기 앞·뒤 슬롯은 순서 변화가 없는 드롭이다. */
export function isNoopDropSlot(fromIndex: number, slot: number): boolean {
  return slot === fromIndex || slot === fromIndex + 1;
}

/** 카드 사이 슬롯을 제거 후 삽입 의미의 reorder 대상 index로 바꾼다. */
export function dropSlotToReorderTarget(fromIndex: number, slot: number): number {
  return slot > fromIndex ? slot - 1 : slot;
}

/** 현재 카드에 표시할 삽입선 위치를 계산한다. */
export function dropIndicatorFor(
  index: number,
  count: number,
  dragIndex: number | null,
  dropSlot: number | null
): "before" | "after" | null {
  if (dragIndex === null || dropSlot === null) return null;
  if (isNoopDropSlot(dragIndex, dropSlot)) return null;
  if (dropSlot === index) return "before";
  if (index === count - 1 && dropSlot === count) return "after";
  return null;
}

export interface StudioPageDndItemProps {
  draggable: boolean;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}

/** 드롭 슬롯을 재는 축. 세로 목록은 "vertical"(위/아래 절반), 가로로 흐르는 조망 그리드는 "horizontal"(왼쪽/오른쪽 절반). */
export type StudioPageDndAxis = "vertical" | "horizontal";

export interface StudioPageDnd {
  /** 드래그 중인 카드 index(스타일 흐리기용). 드래그 없으면 null. */
  dragIndex: number | null;
  /** 현재 드롭 슬롯(카드 사이 틈 0..count). 드래그 없으면 null. */
  dropSlot: number | null;
  /**
   * 각 페이지 카드에 스프레드할 DnD props.
   * axis 기본값은 "vertical"(페이지 목록·스트립). 행 우선으로 흐르는 그리드(스토리보드
   * 조망)는 "horizontal"을 넘겨야 옆 카드와의 앞/뒤가 포인터 위치와 일치한다 —
   * 세로 비율로 재면 오른쪽 절반에 놓아도 위쪽 절반이라는 이유로 앞에 끼어든다.
   */
  itemProps: (index: number, axis?: StudioPageDndAxis) => StudioPageDndItemProps;
  /** index 카드에 그릴 삽입선. */
  indicatorFor: (index: number) => "before" | "after" | null;
}

const PAGE_DND_MIME = "application/x-toonstudio-studio-page";

/**
 * 페이지 스트립 HTML5 드래그 재배열 훅(PPT 방식).
 *
 * 썸네일 SVG와 분리해 이 작은 입력 훅만 Studio 초기 그래프에 남긴다. 무거운 미리보기
 * 렌더러는 별도 청크로 로드되므로 캔버스 필기 런타임의 초기 번들 예산을 침범하지 않는다.
 */
export function useStudioPageDnd(
  count: number,
  onReorder: (fromIndex: number, toIndex: number) => void
): StudioPageDnd {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropSlot, setDropSlot] = useState<number | null>(null);

  const reset = () => {
    setDragIndex(null);
    setDropSlot(null);
  };

  const slotFromEvent = (index: number, event: DragEvent<HTMLElement>, axis: StudioPageDndAxis): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = axis === "horizontal"
      ? rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0
      : rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0;
    return computeDropSlot(index, ratio);
  };

  const itemProps = (index: number, axis: StudioPageDndAxis = "vertical"): StudioPageDndItemProps => ({
    draggable: true,
    onDragStart: (event) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(PAGE_DND_MIME, String(index));
      event.dataTransfer.setData("text/plain", String(index));
      setDragIndex(index);
      setDropSlot(null);
    },
    onDragOver: (event) => {
      if (dragIndex === null) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const slot = slotFromEvent(index, event, axis);
      setDropSlot((previous) => (previous === slot ? previous : slot));
    },
    onDrop: (event) => {
      if (dragIndex === null) return;
      event.preventDefault();
      const slot = slotFromEvent(index, event, axis);
      if (!isNoopDropSlot(dragIndex, slot)) {
        onReorder(dragIndex, dropSlotToReorderTarget(dragIndex, slot));
      }
      reset();
    },
    onDragEnd: reset,
  });

  return {
    dragIndex,
    dropSlot,
    itemProps,
    indicatorFor: (index: number) => dropIndicatorFor(index, count, dragIndex, dropSlot),
  };
}
