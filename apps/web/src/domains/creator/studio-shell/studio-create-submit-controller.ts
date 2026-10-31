export interface StudioCreateSubmitState {
  readonly creating: boolean;
  readonly titleReady: boolean;
  readonly sizeReady: boolean;
}

export interface StudioCreateSubmitActions {
  readonly state: () => StudioCreateSubmitState;
  /** 실제 생성과 화면 이동을 시작했을 때만 true. 실패 시 false로 재시도를 허용한다. */
  readonly create: () => boolean;
  readonly fixName: () => void;
  readonly fixSize: () => void;
}

/** 클릭·Enter·접근성 제출이 같은 검증과 중복 실행 방어를 사용한다. */
export function createStudioCreateSubmitController(actions: StudioCreateSubmitActions) {
  let composing = false;
  let submitted = false;

  function submit(event: Event): void {
    if (event.defaultPrevented) return;
    event.preventDefault();
    const state = actions.state();
    if (composing || submitted || state.creating) return;
    if (!state.titleReady) { actions.fixName(); return; }
    if (!state.sizeReady) { actions.fixSize(); return; }
    // React가 creating을 다시 그리기 전 같은 틱에 들어오는 제출도 막는다.
    submitted = true;
    try {
      submitted = actions.create();
    } catch (error) {
      submitted = false;
      throw error;
    }
  }

  function keyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.key !== "Enter") return;
    const input = event.target;
    // summary/select/button의 기본 키보드 동작과 textarea의 줄바꿈은 가로채지 않는다.
    if (!(input instanceof HTMLInputElement) || !["text", "number", "search"].includes(input.type)) return;
    // 조합 종료보다 keydown이 늦게 오는 IME도 keyCode 229로 방어한다.
    if (composing || event.isComposing || event.keyCode === 229 || event.repeat
      || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      event.preventDefault();
      return;
    }
    submit(event);
  }

  return {
    submit,
    keyDown,
    compositionStart: () => { composing = true; },
    compositionEnd: () => { composing = false; },
  };
}
