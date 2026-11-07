import type { PointerKind, RawSample } from "../engine/core/types";

/**
 * PointerEvent → `RawSample[]` 브라우저 어댑터(브러시 보충 설계 §2 입력 파이프라인).
 *
 * - `pointermove`의 `getCoalescedEvents()`만 정본으로 누적한다(부모 이벤트 중복 누적 금지).
 *   coalesced 표본은 `source: "coalesced"`, 마지막 표본만 `"raw"`로 태깅한다.
 * - `getPredictedEvents()`는 `source: "predicted"`로 넘기며 표시 전용이다. 엔진 입력 파이프라인은
 *   predicted 표본을 폐기하므로 정본 스트림에 들어가지 않는다.
 * - `pointerdown`·`pointerup`(또는 `pointercancel`)은 phase `down`/`up` 표본 1개씩이다.
 * - `useRawUpdate` 옵션이 켜지고 브라우저가 `pointerrawupdate`를 지원하면 rawupdate가 정본 표본을
 *   공급하고 `pointermove`는 예측 표본만 공급한다(중복 누적 금지).
 * - 팜 리젝션: pen 이벤트 후 500 ms 이내 touch 무시, touch 접촉폭 ≥ 20 px 무시.
 * - primary 포인터 하나만 획을 소유하며 호버(버튼 없음)는 `onHover` 콜백으로만 전달한다.
 * - `pointercancel`은 phase `up` 표본 1개로 끝낸다(취소 표시는 세션이 `pointercancel` 리스너로 구분한다).
 * - **`lostpointercapture`는 표본을 만들지 않고 소유자를 유지한다**: 포인터가 아직 눌려 있으면 이후
 *   move/up이 정상 경로로 이어져 획이 끊기지 않는다. 정말 끝난 획(창 밖 up 분실)은 다음 down이
 *   `STALE_TAKEOVER_MS` 뒤에 오면 합성 up으로 끝내고 새로 시작한다. 정상 종료 뒤의 것은 무시된다.
 * - `blockContextMenu`: 그리기 표면에서 우클릭·길게 누르기 메뉴(`contextmenu`)를 막는다.
 * - `primaryButtonOnly`: 마우스는 주 버튼(왼쪽)으로만 획을 시작한다(우클릭·가운데 버튼이 점을 찍지 않는다).
 */

export interface PointerCaptureOptions {
  /** `pointerrawupdate`를 정본 표본 소스로 사용(지원 브라우저에서만). */
  useRawUpdate?: boolean;
  /** 요소 CSS 크기와 다른 논리 캔버스 크기(문서 px). 생략 시 요소 크기. */
  logicalSize?: { width: number; height: number };
  /** 호버(접촉 없음) 위치 콜백. 커서 미리보기 전용. */
  onHover?: (x: number, y: number) => void;
  /** pen 이후 touch를 무시하는 시간(ms). */
  palmRejectMs?: number;
  /** 이 접촉폭(px) 이상 touch는 손바닥으로 보고 무시. */
  palmContactWidthPx?: number;
  /** 요소 위 `contextmenu`(우클릭·터치 길게 누르기)를 막는다. 기본 false(기존 동작 유지). */
  blockContextMenu?: boolean;
  /** 마우스의 보조 버튼(우클릭·가운데)으로는 획을 시작하지 않는다. 펜·터치는 영향 없음. 기본 false(기존 동작 유지). */
  primaryButtonOnly?: boolean;
  /**
   * `setPointerCapture`가 던졌을 때(비활성 포인터 등) 호출된다. 생략하면 획을 시작하지 않고 조용히 무시한다.
   * 핸들러 안에서 던지면 브라우저 콘솔로만 가므로, 원인 규명이 필요하면 여기서 notice·로그로 남긴다.
   */
  onCaptureFailure?: (info: { pointerId: number; reason: string }) => void;
}

export const DEFAULT_PALM_REJECT_MS = 500;
export const DEFAULT_PALM_CONTACT_WIDTH_PX = 20;
/**
 * 소유자가 있는데 새 down이 온 경우, 마지막 소유자 이벤트에서 이 시간(ms)이 지났으면
 * 예전 획은 끝난 것으로 보고 합성 종료한다(창 밖에서 뗀 up을 놓친 경우).
 * 그 전에는 멀티터치 두 번째 손가락으로 보고 무시한다.
 */
export const STALE_TAKEOVER_MS = 2000;
/**
 * 문서 좌표 절대값 안전 상한(px, `MAX_DOCUMENT_SIDE_PX = 2048`의 8배).
 * `1e20`·`1e308` 같은 극단 유한 좌표가 `StepGenerator`의 dab 수 예산을 넘기거나 `±Infinity`로 번지는 것을 막되,
 * 캔버스 밖 수천 px 드래그는 그대로 통과시킨다.
 */
export const MAX_SAFE_DOCUMENT_COORD_PX = 16384;
/** `getBoundingClientRect` 변 길이 최소 유효값(px). `1e-300` 같은 비정상 미소값의 배율 폭주를 막는다. */
export const MIN_VALID_RECT_SIDE_PX = 1e-3;

export type SurfaceRectInvalidReason = "surface-hidden" | "non-finite-rect" | "negative-rect" | "zero-rect";

export interface SurfaceMappingState {
  readonly valid: boolean;
  readonly reason: SurfaceRectInvalidReason | null;
  readonly left: number;
  readonly top: number;
  readonly rectWidth: number;
  readonly rectHeight: number;
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly scaleX: number;
  readonly scaleY: number;
  toLocal: (clientX: number, clientY: number) => { x: number; y: number } | null;
}

type Phase = RawSample["phase"];
type Source = RawSample["source"];

/** 요소 좌표계 변환(getBoundingClientRect 기반). */
interface Mapper {
  toLocal: (clientX: number, clientY: number) => { x: number; y: number };
}

/** 브라우저(또는 jsdom)가 제공하지 않는 숫자 필드는 기본값으로 메운다. */
function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampDocumentCoord(value: number): number {
  const clamped = Math.max(-MAX_SAFE_DOCUMENT_COORD_PX, Math.min(MAX_SAFE_DOCUMENT_COORD_PX, value));
  return clamped === 0 ? 0 : clamped;
}

/**
 * 요소의 현재 레이아웃 사각형(`getBoundingClientRect`)과 논리 문서 크기(`logicalSize`)로부터
 * 클라이언트 CSS px → 문서 논리 px 변환 상태를 계산한다.
 *
 * - 숨김(`hidden`, `display: none`, `visibility: hidden`), 비유한(`NaN`/`±Infinity`), 음수 크기, `0×0`(또는 `< 1e-3` 미소 크기)
 *   상태에서는 `valid: false`와 `reason`을 돌려주고 `toLocal`은 `null`을 반환한다.
 * - `allowUnlaidOutZeroRect === true`일 때만 jsdom 단위 테스트의 미배치 기본 요소(`0,0,0,0`, 자체 `getBoundingClientRect` 미정의)를
 *   1:1 배율로 허용한다. 한 번이라도 양수 사각형이 관측된 뒤 `0×0`으로 붕괴하면 `zero-rect`로 거부한다.
 */
export function resolveSurfaceMapping(
  el: HTMLElement,
  logicalSize?: { width: number; height: number },
  allowUnlaidOutZeroRect = false,
): SurfaceMappingState {
  const rect = el.getBoundingClientRect();
  const rawLeft = rect.left;
  const rawTop = rect.top;
  const rawW = rect.width;
  const rawH = rect.height;
  const fallbackLogicalW = logicalSize !== undefined ? logicalSize.width : rawW;
  const fallbackLogicalH = logicalSize !== undefined ? logicalSize.height : rawH;

  const invalid = (reason: SurfaceRectInvalidReason): SurfaceMappingState => ({
    valid: false,
    reason,
    left: rawLeft,
    top: rawTop,
    rectWidth: rawW,
    rectHeight: rawH,
    logicalWidth: fallbackLogicalW,
    logicalHeight: fallbackLogicalH,
    scaleX: 1,
    scaleY: 1,
    toLocal: () => null,
  });

  if (el.hidden === true || el.style?.display === "none" || el.style?.visibility === "hidden") {
    return invalid("surface-hidden");
  }
  if (!Number.isFinite(rawLeft) || !Number.isFinite(rawTop) || !Number.isFinite(rawW) || !Number.isFinite(rawH)) {
    return invalid("non-finite-rect");
  }
  if (rawW < 0 || rawH < 0) {
    return invalid("negative-rect");
  }
  if (rawW < MIN_VALID_RECT_SIDE_PX || rawH < MIN_VALID_RECT_SIDE_PX) {
    const isJsdomUnlaidOut =
      allowUnlaidOutZeroRect &&
      rawW === 0 &&
      rawH === 0 &&
      rawLeft === 0 &&
      rawTop === 0 &&
      !Object.prototype.hasOwnProperty.call(el, "getBoundingClientRect") &&
      el.style?.width !== "0px" &&
      el.style?.height !== "0px" &&
      typeof navigator !== "undefined" &&
      navigator.userAgent.includes("jsdom");
    if (!isJsdomUnlaidOut) {
      return invalid("zero-rect");
    }
  }

  let logicalWidth = rawW;
  let logicalHeight = rawH;
  if (logicalSize !== undefined) {
    if (!Number.isFinite(logicalSize.width) || !Number.isFinite(logicalSize.height)) {
      return invalid("non-finite-rect");
    }
    if (logicalSize.width < 0 || logicalSize.height < 0) {
      return invalid("negative-rect");
    }
    if (logicalSize.width < MIN_VALID_RECT_SIDE_PX || logicalSize.height < MIN_VALID_RECT_SIDE_PX) {
      return invalid("zero-rect");
    }
    logicalWidth = logicalSize.width;
    logicalHeight = logicalSize.height;
  }

  const scaleX = rawW >= MIN_VALID_RECT_SIDE_PX ? logicalWidth / rawW : 1;
  const scaleY = rawH >= MIN_VALID_RECT_SIDE_PX ? logicalHeight / rawH : 1;
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY)) {
    return invalid("non-finite-rect");
  }

  return {
    valid: true,
    reason: null,
    left: rawLeft,
    top: rawTop,
    rectWidth: rawW,
    rectHeight: rawH,
    logicalWidth,
    logicalHeight,
    scaleX,
    scaleY,
    toLocal: (clientX: number, clientY: number) => {
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
      const rawX = (clientX - rawLeft) * scaleX;
      const rawY = (clientY - rawTop) * scaleY;
      if (Number.isNaN(rawX) || Number.isNaN(rawY)) return null;
      return {
        x: clampDocumentCoord(rawX),
        y: clampDocumentCoord(rawY),
      };
    },
  };
}

function pointerKindOf(type: string): PointerKind {
  if (type === "pen" || type === "touch") return type;
  return "mouse";
}

/** PointerEvent 1개 → RawSample. 좌표는 `mapper`로 요소·논리 좌표계로 변환한다. */
export function sampleFromPointerEvent(
  ev: PointerEvent,
  phase: Phase,
  source: Source,
  mapper: Mapper,
): RawSample {
  const p = mapper.toLocal(ev.clientX, ev.clientY);
  const sample: RawSample = {
    x: p.x,
    y: p.y,
    tMs: numberOr(ev.timeStamp, 0),
    pressure: numberOr(ev.pressure, 0),
    tiltXDeg: numberOr(ev.tiltX, 0),
    tiltYDeg: numberOr(ev.tiltY, 0),
    twistDeg: numberOr(ev.twist, 0),
    pointerType: pointerKindOf(ev.pointerType),
    phase,
    source,
  };
  if (typeof ev.tangentialPressure === "number") sample.tangentialPressure = ev.tangentialPressure;
  if (typeof ev.width === "number") sample.contactWidth = ev.width;
  if (typeof ev.height === "number") sample.contactHeight = ev.height;
  if (typeof ev.buttons === "number") sample.buttons = ev.buttons;
  return sample;
}

function isPointerEvent(ev: Event): ev is PointerEvent {
  return "pointerId" in ev && "pressure" in ev;
}

function coalescedOf(ev: PointerEvent): PointerEvent[] {
  if (typeof ev.getCoalescedEvents === "function") {
    const list = ev.getCoalescedEvents();
    if (list.length > 0) return list;
  }
  return [ev];
}

function predictedOf(ev: PointerEvent): PointerEvent[] {
  if (typeof ev.getPredictedEvents === "function") {
    return ev.getPredictedEvents();
  }
  return [];
}

/** 브라우저가 `pointerrawupdate`를 지원하는지(요소 속성 존재로 판정). */
export function supportsPointerRawUpdate(el: HTMLElement): boolean {
  return "onpointerrawupdate" in el;
}

/**
 * 포인터 캡처를 붙이고 해제 함수를 돌려준다. `onSamples`는 이벤트마다 1회 호출되며
 * 프레임 단위 배치는 `FrameScheduler`가 담당한다.
 */
export function attachPointerCapture(
  el: HTMLElement,
  onSamples: (raw: RawSample[]) => void,
  opts: PointerCaptureOptions = {},
): () => void {
  const palmRejectMs = opts.palmRejectMs ?? DEFAULT_PALM_REJECT_MS;
  const palmWidth = opts.palmContactWidthPx ?? DEFAULT_PALM_CONTACT_WIDTH_PX;
  const useRaw = opts.useRawUpdate === true && supportsPointerRawUpdate(el);

  let ownerId: number | null = null;
  let lastPressure = 0;
  let lastPenTMs = Number.NEGATIVE_INFINITY;
  let lastX = 0;
  let lastY = 0;
  let lastTMs = 0;
  let lastPointerType: PointerKind = "mouse";
  let detached = false;
  let hasSeenPositiveRect = false;

  const currentMapping = (): SurfaceMappingState => {
    const state = resolveSurfaceMapping(el, opts.logicalSize, !hasSeenPositiveRect);
    if (
      state.rectWidth >= MIN_VALID_RECT_SIDE_PX &&
      state.rectHeight >= MIN_VALID_RECT_SIDE_PX &&
      Number.isFinite(state.rectWidth) &&
      Number.isFinite(state.rectHeight)
    ) {
      hasSeenPositiveRect = true;
    }
    return state;
  };

  const previousTouchAction = el.style.touchAction;
  el.style.touchAction = "none";

  const notePen = (ev: PointerEvent): void => {
    if (ev.pointerType === "pen" && Number.isFinite(ev.timeStamp)) {
      lastPenTMs = Math.max(lastPenTMs, ev.timeStamp);
    }
  };

  const isPalm = (ev: PointerEvent): boolean => {
    if (ev.pointerType !== "touch") return false;
    if (ev.timeStamp - lastPenTMs < palmRejectMs) return true;
    if (typeof ev.width === "number" && ev.width >= palmWidth) return true;
    return false;
  };

  const track = (ev: PointerEvent, pt: { x: number; y: number }, kind: PointerKind, resetTime = false): void => {
    lastX = pt.x;
    lastY = pt.y;
    if (Number.isFinite(ev.timeStamp)) {
      lastTMs = resetTime ? ev.timeStamp : Math.max(lastTMs, ev.timeStamp);
    }
    lastPointerType = kind;
  };

  const releaseCapture = (id: number): void => {
    try {
      if (
        typeof el.hasPointerCapture === "function" &&
        typeof el.releasePointerCapture === "function" &&
        el.hasPointerCapture(id)
      ) {
        el.releasePointerCapture(id);
      }
    } catch {
      // 이미 해제되었거나 비활성 포인터여서 브라우저가 던져도 무시한다.
    }
  };

  const onDown = (ev: PointerEvent): void => {
    if (detached) return;
    notePen(ev);
    if (ownerId !== null && !(ev.timeStamp - lastTMs > STALE_TAKEOVER_MS)) {
      // 얼마 안 된 down은 멀티터치 두 번째 손가락으로 보고 무시한다(보조 버튼은 기본 동작만 막는다).
      if (ev.pointerType === "mouse" && ev.button !== 0) ev.preventDefault();
      return;
    }
    if (!ev.isPrimary) {
      if (ownerId !== null && ev.pointerType === "mouse" && ev.button !== 0) ev.preventDefault();
      return;
    }
    if (opts.primaryButtonOnly === true && ev.pointerType === "mouse" && ev.button !== 0) {
      ev.preventDefault();
      return;
    }
    if (isPalm(ev)) return;
    const mapping = currentMapping();
    const localPt = mapping.toLocal(ev.clientX, ev.clientY);
    if (!mapping.valid || localPt === null) return;
    try {
      if (typeof el.setPointerCapture === "function") {
        el.setPointerCapture(ev.pointerId);
      }
      // 호출이 성공해도 캡처가 실제로 걸렸는지 동기 확인한다. 걸리지 않은 채로 획을 시작하면
      // 창 밖에서 뗀 포인터를 놓쳐 유령 획이 남는다.
      if (
        typeof el.hasPointerCapture === "function" &&
        typeof el.setPointerCapture === "function" &&
        !el.hasPointerCapture(ev.pointerId)
      ) {
        throw new Error("pointer capture not acquired");
      }
    } catch (error) {
      // 캡처 실패 상태로 획을 시작하면 바깥으로 나간 포인터를 놓쳐 유령 획이 남는다. 시작하지 않고 사유를 알린다.
      if (opts.onCaptureFailure) {
        opts.onCaptureFailure({ pointerId: ev.pointerId, reason: error instanceof Error ? error.message : String(error) });
      }
      return;
    }
    if (ownerId !== null) {
      // 예전 획이 조용히 끝난 뒤(창 밖 up 분실 등) 한참 뒤의 유효한 새 down이고 캡처도 확보됐으므로
      // 예전 획을 합성 종료한 뒤 새 획을 시작한다.
      const prevOwner = ownerId;
      if (prevOwner !== ev.pointerId) releaseCapture(prevOwner);
      ownerId = null;
      const upTMs = Math.max(lastTMs, Number.isFinite(ev.timeStamp) ? ev.timeStamp : lastTMs);
      onSamples([
        {
          x: lastX,
          y: lastY,
          tMs: upTMs,
          pressure: lastPressure,
          tiltXDeg: 0,
          tiltYDeg: 0,
          twistDeg: 0,
          pointerType: lastPointerType,
          phase: "up",
          source: "raw",
        },
      ]);
      if (detached) {
        releaseCapture(ev.pointerId);
        return;
      }
    }
    ownerId = ev.pointerId;
    lastPressure = numberOr(ev.pressure, 0);
    track(ev, localPt, pointerKindOf(ev.pointerType), true);
    ev.preventDefault();
    onSamples([sampleFromPointerEvent(ev, "down", "raw", { toLocal: () => localPt })]);
  };

  const onMove = (ev: PointerEvent): void => {
    if (detached) return;
    notePen(ev);
    const mapping = currentMapping();
    if (ownerId === null) {
      if (opts.onHover && ev.buttons === 0 && mapping.valid) {
        const p = mapping.toLocal(ev.clientX, ev.clientY);
        if (p !== null) opts.onHover(p.x, p.y);
      }
      return;
    }
    if (ev.pointerId !== ownerId || !mapping.valid) return;
    const out: RawSample[] = [];
    if (!useRaw) {
      const kind = pointerKindOf(ev.pointerType);
      const coalesced = coalescedOf(ev);
      const validCoalesced: { ev: PointerEvent; pt: { x: number; y: number } }[] = [];
      for (const c of coalesced) {
        if (!c) continue;
        const pt = mapping.toLocal(c.clientX, c.clientY);
        if (pt !== null) validCoalesced.push({ ev: c, pt });
      }
      for (let i = 0; i < validCoalesced.length; i += 1) {
        const item = validCoalesced[i]!;
        track(item.ev, item.pt, kind);
        lastPressure = numberOr(item.ev.pressure, 0);
        const source: Source = i === validCoalesced.length - 1 ? "raw" : "coalesced";
        out.push(sampleFromPointerEvent(item.ev, "move", source, { toLocal: () => item.pt }));
      }
      const parentPt = mapping.toLocal(ev.clientX, ev.clientY);
      if (parentPt !== null) {
        track(ev, parentPt, kind);
        lastPressure = numberOr(ev.pressure, 0);
      }
    }
    for (const p of predictedOf(ev)) {
      const pt = mapping.toLocal(p.clientX, p.clientY);
      if (pt !== null) {
        out.push(sampleFromPointerEvent(p, "move", "predicted", { toLocal: () => pt }));
      }
    }
    if (out.length > 0) onSamples(out);
  };

  // `pointerrawupdate`는 HTMLElementEventMap에 없으므로 Event → PointerEvent 판별 후 처리한다.
  const onRawUpdate = (ev: Event): void => {
    if (detached || !isPointerEvent(ev)) return;
    notePen(ev);
    if (ownerId === null || ev.pointerId !== ownerId) return;
    const mapping = currentMapping();
    if (!mapping.valid) return;
    const localPt = mapping.toLocal(ev.clientX, ev.clientY);
    if (localPt === null) return;
    lastPressure = numberOr(ev.pressure, 0);
    track(ev, localPt, pointerKindOf(ev.pointerType));
    onSamples([sampleFromPointerEvent(ev, "move", "raw", { toLocal: () => localPt })]);
  };

  const finish = (ev: PointerEvent): void => {
    if (detached) return;
    notePen(ev);
    if (ownerId === null || ev.pointerId !== ownerId) return;
    ownerId = null;
    releaseCapture(ev.pointerId);
    const mapping = currentMapping();
    const localPt = mapping.valid ? mapping.toLocal(ev.clientX, ev.clientY) : null;
    const endPt = localPt ?? { x: lastX, y: lastY };
    // up 표본은 마지막 접촉 압력을 쓴다(브라우저는 up에서 0을 준다). 표면이 획 도중 0×0·숨김으로 무너졌으면 마지막 유효 좌표로 닫는다.
    const sample = sampleFromPointerEvent(ev, "up", "raw", { toLocal: () => endPt });
    if (!Number.isFinite(ev.timeStamp)) sample.tMs = lastTMs;
    sample.pressure = lastPressure;
    onSamples([sample]);
  };

  // 캡처를 잃어도 소유자는 유지한다: 포인터가 아직 눌려 있으면 이후 move/up이 정상 경로로 이어져
  // 획이 끊기지 않고, 정말 끝난 획(창 밖 up 분실)은 다음 down의 stale takeover가 합성 종료한다.
  // 정상 종료 뒤의 lostpointercapture는 ownerId가 null이라 무시된다.
  const onLostCapture = (ev: PointerEvent): void => {
    if (ownerId === null || ev.pointerId !== ownerId) return;
  };
  const onContextMenu = (ev: Event): void => {
    ev.preventDefault();
  };
  const blockMenu = opts.blockContextMenu === true;

  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", finish);
  el.addEventListener("pointercancel", finish);
  el.addEventListener("lostpointercapture", onLostCapture);
  // 캡처가 없거나 놓친 경우의 그물망: 창 밖에서 뗀 up을 요소가 못 받으면 소유자가 영구히 남아
  // 이후 획이 전부 무시되는 유령 상태가 된다. finish는 소유자 일치 때만 동작해 중복 호출이 안전하다.
  // pointercancel은 요소 경로로만 처리한다: window에서 잡은 cancel은 취소 표시(mark)가 없어
  // 합성으로 둔갑하므로 듣지 않는다(리마운트+취소 겹침은 다음 down의 stale takeover가 버린다).
  const onWindowEnd = (ev: Event): void => {
    if (!isPointerEvent(ev)) return;
    if (ownerId === null || ev.pointerId !== ownerId) return;
    finish(ev);
  };
  window.addEventListener("pointerup", onWindowEnd);
  if (blockMenu) el.addEventListener("contextmenu", onContextMenu);
  if (useRaw) el.addEventListener("pointerrawupdate", onRawUpdate);

  return () => {
    if (detached) return;
    detached = true;
    if (ownerId !== null) {
      releaseCapture(ownerId);
      ownerId = null;
    }
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", finish);
    el.removeEventListener("pointercancel", finish);
    el.removeEventListener("lostpointercapture", onLostCapture);
    window.removeEventListener("pointerup", onWindowEnd);
    if (blockMenu) el.removeEventListener("contextmenu", onContextMenu);
    if (useRaw) el.removeEventListener("pointerrawupdate", onRawUpdate);
    el.style.touchAction = previousTouchAction;
  };
}

/** 정본 표본(raw·coalesced)과 표시 전용 예측 표본을 분리한다. */
export function splitPredicted(samples: readonly RawSample[]): {
  canonical: RawSample[];
  predicted: RawSample[];
} {
  const canonical: RawSample[] = [];
  const predicted: RawSample[] = [];
  for (const s of samples) {
    if (s.source === "predicted") predicted.push(s);
    else canonical.push(s);
  }
  return { canonical, predicted };
}
