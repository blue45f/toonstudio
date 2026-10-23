/**
 * 요소 이동 요청 — 편집 동작 뒤에 새로 생기거나 바뀐 입력 칸으로 초점을 옮긴다.
 *
 * 요청은 상태에 담고 효과가 그리기 뒤에 요소를 찾아 초점을 둔다(상태 갱신과 요소 생성이 같은 이벤트에서 한 번에 그려진다).
 * 같은 요소를 연속으로 요청해도 매번 새 요청 객체라 효과가 다시 돈다. 요소가 없으면 아무것도 하지 않는다.
 */
import { useEffect, useState } from "react";

interface FocusRequest {
  readonly id: string;
  readonly sequence: number;
}

export function useFocusRequest(): (domId: string) => void {
  const [request, setRequest] = useState<FocusRequest | null>(null);
  useEffect(() => {
    if (request) document.getElementById(request.id)?.focus();
  }, [request]);
  return (domId: string) => setRequest((current) => ({ id: domId, sequence: (current?.sequence ?? 0) + 1 }));
}
