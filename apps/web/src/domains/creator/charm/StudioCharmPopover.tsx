/**
 * 참 바 팝오버 껍데기. 포털로 문서 맨 위에 고정 배치해 좁은 레일이나 스크롤 영역에 잘리지 않는다.
 * 비모달 대화상자이며 포커스 가두기는 하지 않는다(캔버스를 계속 볼 수 있어야 한다). 닫기는 Esc·바깥 클릭이고,
 * 키보드로 가장자리를 벗어나는 Tab(맨 끝에서 Tab, 맨 앞에서 Shift+Tab)도 닫고 트리거로 돌려보낸다(`onTabOut`).
 * 문서 맨 위(body)로 포털되어 바 본체의 단축키 경계 밖이므로, 팝오버 자신도 단축키 경계로 표시한다.
 * 그렇지 않으면 팝오버 안에서 누른 Delete·Shift+방향키가 선택한 캔버스 요소를 지우거나 옮긴다.
 */

import { createPortal } from "react-dom";

import type { KeyboardEvent, ReactNode } from "react";
import type { StudioCharmPopoverPlan } from "./studio-charm-popover-layout";

export interface StudioCharmPopoverProps {
  readonly plan: StudioCharmPopoverPlan | null;
  readonly label: string;
  readonly id?: string;
  /** 키보드로 팝오버 가장자리를 벗어나려 할 때(Tab·Shift+Tab). 보통 닫고 트리거로 포커스를 돌려보낸다. */
  readonly onTabOut?: () => void;
  /** 팝오버 안에서 누른 키(예: 메뉴의 방향키 이동). Tab 가장자리 처리가 먼저 일어난다. */
  readonly onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  readonly children: ReactNode;
}

/** 키보드 포커스를 받을 수 있는 요소. 꺼진 컨트롤과 `tabindex="-1"` 은 Tab 으로 닿지 않는다. */
const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function leavesAtEdge(event: KeyboardEvent<HTMLDivElement>): boolean {
  if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return false;
  const stops = [...event.currentTarget.querySelectorAll<HTMLElement>(TABBABLE)].filter(
    (element) => element.getAttribute("aria-hidden") !== "true",
  );
  const edge = event.shiftKey ? stops[0] : stops.at(-1);
  return edge !== undefined && event.target === edge;
}

export function StudioCharmPopover({ plan, label, id, onTabOut, onKeyDown, children }: StudioCharmPopoverProps) {
  if (!plan || typeof document === "undefined") return null;
  return createPortal(
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- 비모달 대화상자 구간이 안의 네이티브 버튼·입력의 Tab 가장자리 닫기와 방향키 포커스 이동을 받는다. 항목 자체는 네이티브 포커스·활성화를 그대로 쓴다.
    <div
      id={id}
      role="dialog"
      aria-label={label}
      aria-modal="false"
      data-studio-charm-popover=""
      data-studio-shortcut-boundary="true"
      data-studio-charm-popover-placement={plan.placement}
      style={{ left: plan.left, top: plan.top, width: plan.width, maxHeight: plan.maxHeight }}
      className="fixed z-[72] flex min-h-0 flex-col overflow-hidden rounded-xl border border-line-strong bg-panel text-fg shadow-xl"
      onKeyDown={(event) => {
        if (onTabOut && leavesAtEdge(event)) {
          event.preventDefault();
          onTabOut();
          return;
        }
        onKeyDown?.(event);
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
