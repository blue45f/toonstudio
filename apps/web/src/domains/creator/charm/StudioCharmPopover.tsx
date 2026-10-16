/**
 * 참 바 팝오버 껍데기. 포털로 문서 맨 위에 고정 배치해 좁은 레일이나 스크롤 영역에 잘리지 않는다.
 * 비모달 대화상자이며 포커스 가두기는 하지 않는다(캔버스를 계속 볼 수 있어야 한다). 닫기는 Esc·바깥 클릭이다.
 */

import { createPortal } from "react-dom";

import type { ReactNode } from "react";
import type { StudioCharmPopoverPlan } from "./studio-charm-popover-layout";

export interface StudioCharmPopoverProps {
  readonly plan: StudioCharmPopoverPlan | null;
  readonly label: string;
  readonly id?: string;
  readonly children: ReactNode;
}

export function StudioCharmPopover({ plan, label, id, children }: StudioCharmPopoverProps) {
  if (!plan || typeof document === "undefined") return null;
  return createPortal(
    <div
      id={id}
      role="dialog"
      aria-label={label}
      aria-modal="false"
      data-studio-charm-popover=""
      data-studio-charm-popover-placement={plan.placement}
      style={{ left: plan.left, top: plan.top, width: plan.width, maxHeight: plan.maxHeight }}
      className="fixed z-[72] flex min-h-0 flex-col overflow-hidden rounded-xl border border-line-strong bg-panel text-fg shadow-xl"
    >
      {children}
    </div>,
    document.body,
  );
}
