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
 * - `pointercancel`과 **`lostpointercapture`**(캡처를 뺏기거나 요소가 사라져 `pointerup` 없이 캡처가 풀린 경우)는 둘 다
 *   소유 포인터의 획을 `up` 표본으로 끝낸다. 세션은 이 두 이벤트를 합성 대신 중단(abort)으로 해석한다(`LiveStrokeSession.attach`).
 *   정상 `pointerup` 뒤에 따라오는 `lostpointercapture`는 이미 소유자가 없어 무시된다.
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
}

export const DEFAULT_PALM_REJECT_MS = 500;
export const DEFAULT_PALM_CONTACT_WIDTH_PX = 20;

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
    tMs: ev.timeStamp,
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

  const mapper: Mapper = {
    toLocal: (clientX, clientY) => {
      const rect = el.getBoundingClientRect();
      const w = opts.logicalSize?.width ?? rect.width;
      const h = opts.logicalSize?.height ?? rect.height;
      const sx = rect.width > 0 ? w / rect.width : 1;
      const sy = rect.height > 0 ? h / rect.height : 1;
      return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
    },
  };

  const previousTouchAction = el.style.touchAction;
  el.style.touchAction = "none";

  const notePen = (ev: PointerEvent): void => {
    if (ev.pointerType === "pen") lastPenTMs = ev.timeStamp;
  };

  const isPalm = (ev: PointerEvent): boolean => {
    if (ev.pointerType !== "touch") return false;
    if (ev.timeStamp - lastPenTMs < palmRejectMs) return true;
    if (typeof ev.width === "number" && ev.width >= palmWidth) return true;
    return false;
  };

  const onDown = (ev: PointerEvent): void => {
    notePen(ev);
    if (ownerId !== null) return;
    if (!ev.isPrimary) return;
    if (opts.primaryButtonOnly === true && ev.pointerType === "mouse" && ev.button !== 0) return;
    if (isPalm(ev)) return;
    ownerId = ev.pointerId;
    lastPressure = ev.pressure;
    if (typeof el.setPointerCapture === "function") {
      el.setPointerCapture(ev.pointerId);
    }
    ev.preventDefault();
    onSamples([sampleFromPointerEvent(ev, "down", "raw", mapper)]);
  };

  const onMove = (ev: PointerEvent): void => {
    notePen(ev);
    if (ownerId === null) {
      if (opts.onHover && ev.buttons === 0) {
        const p = mapper.toLocal(ev.clientX, ev.clientY);
        opts.onHover(p.x, p.y);
      }
      return;
    }
    if (ev.pointerId !== ownerId) return;
    const out: RawSample[] = [];
    if (!useRaw) {
      const coalesced = coalescedOf(ev);
      for (let i = 0; i < coalesced.length; i += 1) {
        const c = coalesced[i];
        if (!c) continue;
        const source: Source = i === coalesced.length - 1 ? "raw" : "coalesced";
        out.push(sampleFromPointerEvent(c, "move", source, mapper));
      }
      lastPressure = ev.pressure;
    }
    for (const p of predictedOf(ev)) {
      out.push(sampleFromPointerEvent(p, "move", "predicted", mapper));
    }
    if (out.length > 0) onSamples(out);
  };

  // `pointerrawupdate`는 HTMLElementEventMap에 없으므로 Event → PointerEvent 판별 후 처리한다.
  const onRawUpdate = (ev: Event): void => {
    if (!isPointerEvent(ev)) return;
    if (ownerId === null || ev.pointerId !== ownerId) return;
    lastPressure = ev.pressure;
    onSamples([sampleFromPointerEvent(ev, "move", "raw", mapper)]);
  };

  const finish = (ev: PointerEvent): void => {
    notePen(ev);
    if (ownerId === null || ev.pointerId !== ownerId) return;
    ownerId = null;
    if (
      typeof el.hasPointerCapture === "function" &&
      typeof el.releasePointerCapture === "function" &&
      el.hasPointerCapture(ev.pointerId)
    ) {
      el.releasePointerCapture(ev.pointerId);
    }
    // up 표본은 마지막 접촉 압력을 쓴다(브라우저는 up에서 0을 준다).
    const sample = sampleFromPointerEvent(ev, "up", "raw", mapper);
    sample.pressure = lastPressure;
    onSamples([sample]);
  };

  // 캡처가 풀렸는데 소유 포인터가 아직 눌려 있으면(pointerup/pointercancel 없이) 획을 끝낸다. 정상 종료 뒤에는 ownerId가 null이다.
  const onLostCapture = (ev: PointerEvent): void => {
    finish(ev);
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
  if (blockMenu) el.addEventListener("contextmenu", onContextMenu);
  if (useRaw) el.addEventListener("pointerrawupdate", onRawUpdate);

  return () => {
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", finish);
    el.removeEventListener("pointercancel", finish);
    el.removeEventListener("lostpointercapture", onLostCapture);
    if (blockMenu) el.removeEventListener("contextmenu", onContextMenu);
    if (useRaw) el.removeEventListener("pointerrawupdate", onRawUpdate);
    el.style.touchAction = previousTouchAction;
    ownerId = null;
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
