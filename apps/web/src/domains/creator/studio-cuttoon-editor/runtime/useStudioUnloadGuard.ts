import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import { installStudioUnloadGuard, type StudioUnloadGuardOptions } from "../../studio-unsaved-work-guard";

/** 이탈 방지는 입력 task에서 바로 무장하고, 이를 위해 편집기 전체를 다시 렌더하지 않는다. */
export function useStudioUnloadGuard({ target, hasUnsavedWork }: StudioUnloadGuardOptions): (armed: boolean) => void {
  const armedRef = useRef(false);
  const mountedRef = useRef(false);
  const detachRef = useRef<(() => void) | null>(null);
  const setArmed = useCallback((armed: boolean): void => {
    if (!mountedRef.current) return;
    armedRef.current = armed;
    if (armed) detachRef.current ??= installStudioUnloadGuard({ target, hasUnsavedWork });
    else {
      detachRef.current?.();
      detachRef.current = null;
    }
  }, [target, hasUnsavedWork]);

  useLayoutEffect(() => {
    mountedRef.current = true;
    // StrictMode 재연결이나 대상 변경 뒤에도 이미 무장한 가드의 수명을 이어간다.
    if (armedRef.current) setArmed(true);
    return () => {
      mountedRef.current = false;
      detachRef.current?.();
      detachRef.current = null;
    };
  }, [setArmed]);

  // 획 이외의 편집은 커밋된 권위 신호를 확인한다. 파생 UI 상태를 추가하지 않는다.
  useEffect(() => {
    if (hasUnsavedWork()) setArmed(true);
  });
  return setArmed;
}
