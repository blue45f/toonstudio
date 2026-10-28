import { useEffect, useRef } from "react";

import { registerModalStatusSlot } from "@/shared/lib/modal-status-slot";

/**
 * 몰입형 가상 스튜디오의 서비스 상태 자리.
 *
 * 전역 서비스 상태 배너(app/service-state/ServiceDegradedBanner)는 몰입 화면에서 하단 도크 바로 위에 떠서(z-90)
 * 상호작용 프롬프트(E 키)·채팅 힌트·NPC 안내를 덮었다. 이 자리를 등록하면 배너는 떠 있지 않고 위치 칩 아래에
 * 한 줄 칩(다시 확인 버튼 포함)으로 들어가므로, 알림은 계속 보이면서 월드 조작을 가리지 않는다.
 * 비어 있으면 CSS(:empty)로 접혀 자리를 차지하지 않는다.
 */
export function SpaceServiceStatusSlot() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    return registerModalStatusSlot(element);
  }, []);
  return <div ref={ref} className="space-status-slot" data-space-interactive="true" />;
}
