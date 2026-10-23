import { useEffect, useState, type ReactElement } from "react";

import { registerModalStatusSlot } from "@/shared/lib/modal-status-slot";

/**
 * 모달이 서비스 상태 알림을 받을 자리. 열려 있는 동안 등록되고 닫히면 해제된다.
 * 비어 있을 때는 아무것도 그리지 않으므로(빈 div) 레이아웃을 차지하지 않는다.
 */
export function ModalStatusSlot({ className }: { readonly className?: string }): ReactElement {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  useEffect(() => (element ? registerModalStatusSlot(element) : undefined), [element]);
  return <div ref={setElement} data-modal-status-slot="true" className={className} />;
}
