/** 모바일 모달의 Tab 경계만 처리하고, 중간 이동은 브라우저에 맡긴다. */
export function studioQuickAccessTabBoundary(
  count: number,
  activeIndex: number,
  backwards: boolean,
): number | null {
  if (count === 0) return -1; // 조작할 수 있는 항목이 없으면 모달 자체에 초점을 둔다.
  if (activeIndex < 0 || activeIndex >= count) return backwards ? count - 1 : 0;
  if (backwards && activeIndex === 0) return count - 1;
  if (!backwards && activeIndex === count - 1) return 0;
  return null;
}

interface StudioQuickAccessKeyboardEvent {
  readonly defaultPrevented: boolean;
  readonly isComposing: boolean;
  readonly keyCode: number;
}

/** 조합 취소와 하위 편집기의 키 처리가 팔레트 닫기로 이어지지 않게 한다. */
export function studioQuickAccessKeyboardClaimed(event: StudioQuickAccessKeyboardEvent): boolean {
  return event.defaultPrevented || event.isComposing || event.keyCode === 229;
}

/** 양수 tabindex를 앞에 두되, 같은 순위에서는 문서 순서를 보존한다. */
export function compareStudioQuickAccessTabOrder(a: number, b: number): number {
  const left = a > 0 ? a : Number.MAX_SAFE_INTEGER;
  const right = b > 0 ? b : Number.MAX_SAFE_INTEGER;
  return left - right;
}
