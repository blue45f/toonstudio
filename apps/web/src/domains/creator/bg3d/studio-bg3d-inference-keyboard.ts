/**
 * 추론 세션의 키보드 연결 — 창 수준 캡처 리스너와 "이 키를 누가 소유하는가" 판정.
 *
 * 세션 리듀서(`studio-bg3d-inference-session.ts`)는 키 이벤트를 순수하게 해석한다. 이 모듈은 그 앞단에서
 *  - 입력창·탭 목록·슬라이더처럼 방향키를 스스로 쓰는 위젯의 키를 가로채지 않도록 맥락을 계산하고,
 *  - 다른 텍스트 입력에서 치는 글자는 아예 건드리지 않으며(한글 IME 조합 중에도 그대로 둔다),
 *  - 처리한 키만 `preventDefault`·전파 차단해 Esc가 모달 닫기로, Backspace가 선택 삭제로 새지 않게 한다.
 * DOM 타입에 느슨하게 의존해(구조적 타이핑) jsdom 없이도 가짜 대상으로 단위 테스트할 수 있다.
 */

import type {
  StudioBg3dInferenceKeyEvent,
  StudioBg3dInferenceReduction,
} from "./studio-bg3d-inference-session";

/** 입력창(VCB)에 붙이는 표식 — 키보드 라우팅이 "자기 입력창"을 알아본다. */
export const STUDIO_BG3D_INFERENCE_VCB_ATTRIBUTE = "data-bg3d-inference-vcb";

export interface StudioBg3dInferenceKeyTargetLike {
  readonly tagName?: string;
  readonly isContentEditable?: boolean;
  readonly type?: string;
  readonly readOnly?: boolean;
  getAttribute?(name: string): string | null;
  closest?(selector: string): unknown;
}

export interface StudioBg3dInferenceKeyContext {
  /** 우리 입력창(VCB)에서 발생한 키인가. */
  readonly fromVcb: boolean;
  /** 다른 텍스트 입력(이름 바꾸기 등)에서 발생한 키인가 — 이때는 아무것도 가로채지 않는다. */
  readonly foreignEditable: boolean;
  /** 이 키(방향키)를 위젯이 소유하는가. */
  readonly widgetOwnsArrows: boolean;
}

const TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  "",
  "text",
  "search",
  "email",
  "url",
  "tel",
  "password",
  "number",
]);

/** 방향키가 위젯 고유 동작(항목 이동·값 조절)인 입력 종류. */
const ARROW_INPUT_TYPES: ReadonlySet<string> = new Set([
  "range",
  "radio",
  "date",
  "datetime-local",
  "month",
  "time",
  "week",
]);

/** 방향키를 소유하는 ARIA 위젯. 이 안의 키는 가로채지 않는다. */
const ARROW_OWNER_SELECTOR = [
  '[role="tablist"]',
  '[role="tab"]',
  '[role="radiogroup"]',
  '[role="radio"]',
  '[role="listbox"]',
  '[role="option"]',
  '[role="menu"]',
  '[role="menubar"]',
  '[role="menuitem"]',
  '[role="menuitemradio"]',
  '[role="menuitemcheckbox"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="scrollbar"]',
  // 포커스를 받는 분할선(패널 폭 조절 핸들)은 ←/→ 로 폭을 바꾼다 — 줄자 세션 중에도 그대로 둔다.
  '[role="separator"]',
  '[role="tree"]',
  '[role="treeitem"]',
  '[role="grid"]',
  '[role="combobox"]',
  '[role="textbox"]',
  '[role="searchbox"]',
  "[data-bg3d-arrow-owner]",
].join(",");

const HORIZONTAL_ARROWS: ReadonlySet<string> = new Set(["ArrowLeft", "ArrowRight"]);

function tagOf(target: StudioBg3dInferenceKeyTargetLike): string {
  return (target.tagName ?? "").toUpperCase();
}

function isVcbTarget(target: StudioBg3dInferenceKeyTargetLike): boolean {
  if (target.getAttribute?.(STUDIO_BG3D_INFERENCE_VCB_ATTRIBUTE) === "true") return true;
  return Boolean(target.closest?.(`[${STUDIO_BG3D_INFERENCE_VCB_ATTRIBUTE}="true"]`));
}

function isTextEditable(target: StudioBg3dInferenceKeyTargetLike): boolean {
  if (target.isContentEditable) return true;
  const tag = tagOf(target);
  if (tag === "TEXTAREA") return true;
  if (tag !== "INPUT") return false;
  return TEXT_INPUT_TYPES.has((target.type ?? "text").toLowerCase());
}

function ownsArrowsByRole(target: StudioBg3dInferenceKeyTargetLike): boolean {
  const tag = tagOf(target);
  if (tag === "SELECT" || tag === "TEXTAREA") return true;
  if (tag === "INPUT" && ARROW_INPUT_TYPES.has((target.type ?? "").toLowerCase())) return true;
  return Boolean(target.closest?.(ARROW_OWNER_SELECTOR));
}

/**
 * 키 이벤트의 대상으로부터 라우팅 맥락을 구한다.
 *
 * 우리 입력창에서는 ↑/↓ 가 항상 잠금 키이고, ←/→ 는 입력이 비어 있을 때만 잠금 키다. 입력에 글자가
 * 있으면 ←/→ 는 커서 이동(스크린리더 사용자가 입력 내용을 한 글자씩 확인하는 방법)에 쓴다.
 */
export function resolveStudioBg3dInferenceKeyContext(
  target: StudioBg3dInferenceKeyTargetLike | null | undefined,
  key: string,
  vcbText: string,
): StudioBg3dInferenceKeyContext {
  if (!target) return { fromVcb: false, foreignEditable: false, widgetOwnsArrows: false };
  if (isVcbTarget(target)) {
    return {
      fromVcb: true,
      foreignEditable: false,
      widgetOwnsArrows: HORIZONTAL_ARROWS.has(key) && vcbText !== "",
    };
  }
  const editable = isTextEditable(target);
  return {
    fromVcb: false,
    foreignEditable: editable,
    widgetOwnsArrows: editable || ownsArrowsByRole(target),
  };
}

export interface StudioBg3dInferenceKeyboardEventLike {
  readonly key: string;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly repeat?: boolean;
  /** 한글 등 IME 조합 중인지. 조합 중에는 어떤 키도 가로채지 않는다. */
  readonly isComposing?: boolean;
  readonly target?: EventTarget | StudioBg3dInferenceKeyTargetLike | null;
  preventDefault(): void;
  stopPropagation(): void;
}

export interface StudioBg3dInferenceKeyboardService {
  getVcbText(): string;
  /** 세션이 활성이고 키보드 라우팅을 쓰는 도구인지. */
  isKeyboardActive(): boolean;
  handleKey(
    phase: "key-down" | "key-up",
    event: StudioBg3dInferenceKeyEvent,
  ): Pick<StudioBg3dInferenceReduction, "handled">;
  resetModifiers(): void;
}

export interface StudioBg3dInferenceKeyboardWindowLike {
  addEventListener(type: string, listener: EventListener, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(type: string, listener: EventListener, options?: boolean | EventListenerOptions): void;
}

export interface AttachStudioBg3dInferenceKeyboardOptions {
  readonly window: StudioBg3dInferenceKeyboardWindowLike;
  /** 가시성 변화(탭 전환)를 감지하는 문서. 생략하면 창 blur만 쓴다. */
  readonly document?: StudioBg3dInferenceKeyboardWindowLike;
  readonly service: StudioBg3dInferenceKeyboardService;
}

function toKeyEvent(
  event: StudioBg3dInferenceKeyboardEventLike,
  context: StudioBg3dInferenceKeyContext,
): StudioBg3dInferenceKeyEvent {
  return {
    key: event.key,
    ...(event.shiftKey === undefined ? {} : { shiftKey: event.shiftKey }),
    ...(event.altKey === undefined ? {} : { altKey: event.altKey }),
    ...(event.ctrlKey === undefined ? {} : { ctrlKey: event.ctrlKey }),
    ...(event.metaKey === undefined ? {} : { metaKey: event.metaKey }),
    ...(event.repeat === undefined ? {} : { repeat: event.repeat }),
    fromVcb: context.fromVcb,
    widgetOwnsArrows: context.widgetOwnsArrows,
  };
}

/**
 * 창에 캡처 단계 키 리스너를 붙인다. 모달의 Esc 처리(문서 캡처)와 전역 단축키(창 버블)보다 먼저 실행되어
 * 세션이 처리한 키만 소비한다. 반환값을 호출하면 모두 해제한다.
 */
export function attachStudioBg3dInferenceKeyboard(
  options: AttachStudioBg3dInferenceKeyboardOptions,
): () => void {
  const { service } = options;
  const onKeyDown = ((event: StudioBg3dInferenceKeyboardEventLike) => {
    if (!service.isKeyboardActive() || event.isComposing) return;
    const context = resolveStudioBg3dInferenceKeyContext(
      event.target as StudioBg3dInferenceKeyTargetLike | null | undefined,
      event.key,
      service.getVcbText(),
    );
    // 다른 입력창에서 글자를 치는 중에는 숫자·Backspace·Esc를 포함해 아무것도 가로채지 않는다.
    if (context.foreignEditable) return;
    const outcome = service.handleKey("key-down", toKeyEvent(event, context));
    if (outcome.handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  }) as unknown as EventListener;
  const onKeyUp = ((event: StudioBg3dInferenceKeyboardEventLike) => {
    if (!service.isKeyboardActive()) return;
    // Shift·Alt를 뗀 것은 입력창 안이든 밖이든 반영해야 "유지"가 풀린다.
    service.handleKey("key-up", toKeyEvent(event, { fromVcb: false, foreignEditable: false, widgetOwnsArrows: false }));
  }) as unknown as EventListener;
  const onBlur: EventListener = () => service.resetModifiers();
  const onVisibility: EventListener = () => service.resetModifiers();

  options.window.addEventListener("keydown", onKeyDown, true);
  options.window.addEventListener("keyup", onKeyUp, true);
  options.window.addEventListener("blur", onBlur, true);
  options.document?.addEventListener("visibilitychange", onVisibility);
  return () => {
    options.window.removeEventListener("keydown", onKeyDown, true);
    options.window.removeEventListener("keyup", onKeyUp, true);
    options.window.removeEventListener("blur", onBlur, true);
    options.document?.removeEventListener("visibilitychange", onVisibility);
  };
}
