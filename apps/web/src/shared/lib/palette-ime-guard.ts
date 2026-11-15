import { useEffect, useRef } from "react";

export interface MinimalKeyboardEventLike {
  readonly key?: string;
  readonly isComposing?: boolean;
  readonly keyCode?: number;
  readonly which?: number;
  readonly repeat?: boolean;
  readonly defaultPrevented?: boolean;
  readonly nativeEvent?: {
    readonly isComposing?: boolean;
    readonly keyCode?: number;
    readonly which?: number;
  };
}

const IME_COMMIT_OR_CANCEL_KEYS = new Set([
  "Enter",
  "Escape",
  "ArrowDown",
  "ArrowUp",
  "Backspace",
]);

/**
 * 표준 `isComposing` 뿐 아니라 Chromium/WebKit 하이브리드 IME의 `keyCode === 229`
 * (`Process`) 이벤트까지 조합 중 키 입력으로 판별한다.
 */
export function isImeKeyboardEvent(event: MinimalKeyboardEventLike): boolean {
  if (event.isComposing === true || event.nativeEvent?.isComposing === true) {
    return true;
  }
  const keyCode = event.keyCode ?? event.nativeEvent?.keyCode;
  const which = event.which ?? event.nativeEvent?.which;
  if (keyCode === 229 || which === 229) {
    return true;
  }
  return event.key === "Process";
}

export interface PaletteImeController {
  readonly onCompositionStart: () => void;
  readonly onCompositionEnd: () => void;
  readonly isComposingNow: () => boolean;
  /**
   * 조합 중이거나 `compositionend` 직후 동일 틱에 따라붙는 조합 확정/취소용
   * `Enter`·`Escape`·방향키, 또는 `Enter` 키 반복(`repeat`)이면 `true`를 반환한다.
   */
  readonly shouldIgnoreKeyDown: (event: MinimalKeyboardEventLike) => boolean;
  /**
   * 실제 명령 선택 실행권을 획득한다.
   * - `closesSurface: true`(기본값): 팔레트 열림 세션당 단 1회만 허용한다.
   * - `closesSurface: false`: 동일 마이크로태스크 틱 내 중복 실행만 차단한다.
   */
  readonly claimExecution: (options?: { readonly closesSurface?: boolean }) => boolean;
  readonly markSurfaceClosing: () => void;
  readonly reset: () => void;
}

export function createPaletteImeController(): PaletteImeController {
  let composing = false;
  let postCompositionEndTick = false;
  let clearTickTimer: ReturnType<typeof setTimeout> | null = null;
  let closedSessionClaimed = false;
  let sameTickClaimed = false;

  const clearPostCompositionTimer = () => {
    if (clearTickTimer !== null) {
      clearTimeout(clearTickTimer);
      clearTickTimer = null;
    }
  };

  return {
    onCompositionStart() {
      clearPostCompositionTimer();
      composing = true;
      postCompositionEndTick = false;
    },
    onCompositionEnd() {
      composing = false;
      postCompositionEndTick = true;
      clearPostCompositionTimer();
      clearTickTimer = setTimeout(() => {
        postCompositionEndTick = false;
        clearTickTimer = null;
      }, 0);
    },
    isComposingNow() {
      return composing || postCompositionEndTick;
    },
    shouldIgnoreKeyDown(event) {
      if (isImeKeyboardEvent(event)) {
        return true;
      }
      const key = event.key ?? "";
      if (composing && IME_COMMIT_OR_CANCEL_KEYS.has(key)) {
        return true;
      }
      if (postCompositionEndTick && IME_COMMIT_OR_CANCEL_KEYS.has(key)) {
        postCompositionEndTick = false;
        clearPostCompositionTimer();
        return true;
      }
      if (key === "Enter" && event.repeat === true) {
        return true;
      }
      return false;
    },
    claimExecution(options) {
      const closesSurface = options?.closesSurface ?? true;
      if (closedSessionClaimed || sameTickClaimed) {
        return false;
      }
      sameTickClaimed = true;
      queueMicrotask(() => {
        sameTickClaimed = false;
      });
      if (closesSurface) {
        closedSessionClaimed = true;
      }
      return true;
    },
    markSurfaceClosing() {
      closedSessionClaimed = true;
    },
    reset() {
      clearPostCompositionTimer();
      composing = false;
      postCompositionEndTick = false;
      closedSessionClaimed = false;
      sameTickClaimed = false;
    },
  };
}

/**
 * 팔레트·검색 표면이 열려 있는 동안 문서 캡처 단계에서 한글 IME 조합 시작·종료를 추적하고,
 * 표면 재개방 시 단일 실행 잠금을 초기화한다.
 */
export function usePaletteImeGuard(active = true): PaletteImeController {
  const controllerRef = useRef<PaletteImeController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createPaletteImeController();
  }
  const controller = controllerRef.current;

  useEffect(() => {
    controller.reset();
    if (!active || typeof document === "undefined") {
      return () => {
        controller.reset();
      };
    }
    const handleStart = () => controller.onCompositionStart();
    const handleEnd = () => controller.onCompositionEnd();
    document.addEventListener("compositionstart", handleStart, true);
    document.addEventListener("compositionend", handleEnd, true);
    return () => {
      document.removeEventListener("compositionstart", handleStart, true);
      document.removeEventListener("compositionend", handleEnd, true);
      controller.reset();
    };
  }, [active, controller]);

  return controller;
}
