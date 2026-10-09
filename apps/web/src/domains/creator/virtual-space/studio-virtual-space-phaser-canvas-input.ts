/**
 * 월드 캔버스의 키보드·초점·가시성 이벤트 연결 (캔버스에서 분리).
 *
 * 캔버스는 이동 정지·배치 취소처럼 장면 상태를 만지는 동작만 콜백으로 넘기고, 여기서는 어떤 이벤트가 그 동작을
 * 부르는지만 정한다. 이벤트 등록과 해제를 한 쌍으로 묶어 정리 누락이 생기지 않게 한다.
 */
import { STUDIO_GHOST_TOGGLE_KEY } from "./studio-virtual-space-ghost-mode";
import { STUDIO_INTERACT_KEY_CODES } from "./studio-virtual-space-interact-prompt";
import { WORLD_KEY_CODES, studioWorldShouldReclaimFocus } from "./studio-virtual-space-phaser-canvas-model";
import { studioWorldHasModalBlocker } from "./studio-virtual-space-runtime-policy";

export interface StudioCanvasInputOptions {
  readonly canvas: HTMLElement;
  /** Phaser 키보드 플러그인. 캔버스에 초점이 있을 때만 켜서 다른 입력 칸의 타자를 가로채지 않는다. */
  readonly keyboard: () => { enabled: boolean } | null | undefined;
  readonly heldKeys: Set<string>;
  readonly reducedMotion: Pick<MediaQueryList, "addEventListener" | "removeEventListener">;
  readonly isSceneReady: () => boolean;
  readonly isInputBlocked: () => boolean;
  readonly focusCanvas: () => void;
  readonly stopMovement: () => void;
  /** Escape: 배치 모드가 먼저 받고, 아니면 안내 투어를 끊고 이동을 멈춘다. */
  readonly onEscape: () => void;
  /** 상호작용 키(화면 안내의 E, 별칭 X)를 처음 눌렀다(자동 반복 제외). */
  readonly onInteractKey: () => void;
  /** 고스트 모드 토글 키를 처음 눌렀다(자동 반복 제외). */
  readonly onGhostToggle: () => void;
  /** 탭이 숨겨졌다. */
  readonly onHidden: () => void;
  readonly onReducedMotionChange: () => void;
  /** 모달·대화상자가 열리거나 닫혀 입력 차단 여부를 다시 읽어야 한다. */
  readonly onModalBlockerChange: (blocked: boolean) => void;
}

/** 이벤트 연결을 만들고 해제 함수를 돌려준다. */
export function bindStudioCanvasInput(options: StudioCanvasInputOptions): () => void {
  const { canvas, heldKeys, reducedMotion, isSceneReady, isInputBlocked, focusCanvas, stopMovement } = options;
  // Capture only canvas-owned keys before preventing browser scrolling. Phaser's
  // window keyboard handler ignores defaultPrevented events from focused elements.
  const handleCanvasKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") { options.onEscape(); return; }
    if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey || isInputBlocked()) return;
    if (!WORLD_KEY_CODES.has(event.code)) return;
    heldKeys.add(event.code);
    if (STUDIO_INTERACT_KEY_CODES.has(event.code) && !event.repeat) options.onInteractKey();
    // 고스트 모드 토글: 반투명 + 장애물 통과 이동 (대규모 이벤트 끼임 해소)
    if (event.code === STUDIO_GHOST_TOGGLE_KEY && !event.repeat) options.onGhostToggle();
    event.preventDefault();
  };
  const preventGameScrolling = (event: KeyboardEvent) => {
    if (event.target !== canvas) return;
    handleCanvasKey(event);
  };
  // 닫은 배너·토스트처럼 초점이 있던 요소가 사라지면 초점이 <body>로 떨어지고, 캔버스가 초점을 가질 때만 키를 받는 월드는
  // 이동 키에 아무 반응이 없다. 어디에도 초점이 없을 때 이동 키를 누르면 월드가 초점을 되찾아 그 키를 바로 받는다.
  const reclaimFocusForMovement = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.target === canvas || !isSceneReady()) return;
    if (!studioWorldShouldReclaimFocus({
      active: document.activeElement,
      root: document,
      code: event.code,
      modified: event.metaKey || event.ctrlKey || event.altKey,
      composing: event.isComposing,
      blocked: isInputBlocked(),
    })) return;
    focusCanvas();
    handleCanvasKey(event);
  };
  const releaseKey = (event: KeyboardEvent) => { heldKeys.delete(event.code); };
  const promptHasFocus = () => document.activeElement?.matches('[data-interact-prompt="true"]') ?? false;
  const refocus = () => {
    const keyboard = options.keyboard();
    if (keyboard) keyboard.enabled = document.activeElement === canvas;
    if (document.activeElement !== canvas && !promptHasFocus()) stopMovement();
  };
  const visibility = () => { if (document.hidden) options.onHidden(); };
  canvas.addEventListener("pointerdown", focusCanvas);
  canvas.addEventListener("keydown", preventGameScrolling);
  globalThis.addEventListener("keydown", reclaimFocusForMovement, true);
  globalThis.addEventListener("keyup", releaseKey);
  document.addEventListener("focusin", refocus);
  document.addEventListener("visibilitychange", visibility);
  globalThis.addEventListener("blur", stopMovement);
  reducedMotion.addEventListener("change", options.onReducedMotionChange);
  const modalObserver = new MutationObserver(() => {
    options.onModalBlockerChange(studioWorldHasModalBlocker(document));
  });
  modalObserver.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["open", "role", "aria-modal", "aria-hidden", "hidden", "data-state", "data-presentation", "data-studio-input-blocker"],
  });
  return () => {
    canvas.removeEventListener("pointerdown", focusCanvas);
    canvas.removeEventListener("keydown", preventGameScrolling);
    globalThis.removeEventListener("keydown", reclaimFocusForMovement, true);
    globalThis.removeEventListener("keyup", releaseKey);
    document.removeEventListener("focusin", refocus);
    document.removeEventListener("visibilitychange", visibility);
    globalThis.removeEventListener("blur", stopMovement);
    reducedMotion.removeEventListener("change", options.onReducedMotionChange);
    modalObserver.disconnect();
  };
}
