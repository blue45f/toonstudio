/** 같은 실제 pointer release에서 파생된 click만 소수 offset으로 계산한다. 이벤트·편집 권위는 바꾸지 않는다. */
export interface StudioHybridDccPointerSample {
  readonly type: string;
  readonly trusted: boolean;
  readonly target: object | null;
  readonly pointerId: number | null;
  readonly pointerType: string | null;
  readonly primary: boolean;
  readonly button: number;
  readonly buttons: number;
  readonly detail: number;
  readonly timeStamp: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly clientX: number;
  readonly clientY: number;
}

export interface StudioHybridDccPointerFrame {
  readonly canvas: object;
  readonly camera: object;
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly cameraWorld: readonly number[];
  readonly cameraProjection: readonly number[];
}

export interface StudioHybridDccPreciseClickOffset {
  readonly offsetX: number;
  readonly offsetY: number;
}

interface PointerStart {
  readonly event: StudioHybridDccPointerSample;
  readonly frame: StudioHybridDccPointerFrame;
}

const MAX_CLICK_DELAY_MS = 250;
const MAX_POINTER_TRAVEL_CSS_PX = 2;
const nativeRound = (value: number) => value < 0 ? -Math.round(-value) : Math.round(value);

function validPoint(event: StudioHybridDccPointerSample, frame: StudioHybridDccPointerFrame): boolean {
  return event.trusted && event.target === frame.canvas
    && [event.offsetX, event.offsetY, event.clientX, event.clientY, event.timeStamp,
      frame.width, frame.height, frame.left, frame.top].every(Number.isFinite)
    && event.timeStamp >= 0 && frame.width > 0 && frame.height > 0
    && event.offsetX >= 0 && event.offsetY >= 0 && event.offsetX <= frame.width && event.offsetY <= frame.height;
}

function snapshot(frame: StudioHybridDccPointerFrame): StudioHybridDccPointerFrame {
  return { ...frame, cameraWorld: [...frame.cameraWorld], cameraProjection: [...frame.cameraProjection] };
}

function sameFrame(before: StudioHybridDccPointerFrame, after: StudioHybridDccPointerFrame): boolean {
  return before.canvas === after.canvas && before.camera === after.camera
    && before.width === after.width && before.height === after.height && before.left === after.left && before.top === after.top
    && before.cameraWorld.length === 16 && after.cameraWorld.length === 16
    && before.cameraProjection.length === 16 && after.cameraProjection.length === 16
    && before.cameraWorld.every((value, index) => Number.isFinite(value) && value === after.cameraWorld[index])
    && before.cameraProjection.every((value, index) => Number.isFinite(value) && value === after.cameraProjection[index]);
}

function samePointer(a: StudioHybridDccPointerSample, b: StudioHybridDccPointerSample): boolean {
  return a.pointerId !== null && a.pointerId > 0 && a.pointerId === b.pointerId
    && a.pointerType !== null && a.pointerType === b.pointerType;
}

/** 취소·이동·다중 입력·카메라 변경 뒤에는 원래 R3F 계산을 사용한다. 대기나 재클릭을 만들지 않는다. */
export function createStudioHybridDccClickPrecisionTracker() {
  const activePointers = new Set<number>();
  let down: PointerStart | null = null;
  let released: PointerStart | null = null;
  let blockedByMultiplePointers = false;
  const clearGesture = () => { down = null; released = null; };
  const reset = () => { clearGesture(); activePointers.clear(); blockedByMultiplePointers = false; };

  return {
    reset,
    sample(event: StudioHybridDccPointerSample, frame: StudioHybridDccPointerFrame): StudioHybridDccPreciseClickOffset | null {
      if (["pointercancel", "pointerleave", "pointerout", "contextmenu", "wheel", "dblclick"].includes(event.type)) {
        reset(); return null;
      }
      if (event.type === "pointerdown") {
        released = null;
        if (!validPoint(event, frame) || event.pointerId === null || !Number.isSafeInteger(event.pointerId) || event.pointerId <= 0) {
          reset(); return null;
        }
        if (activePointers.size > 0) blockedByMultiplePointers = true;
        activePointers.add(event.pointerId);
        if (blockedByMultiplePointers || !event.primary || event.button !== 0 || event.buttons !== 1) {
          clearGesture(); return null;
        }
        down = { event: { ...event }, frame: snapshot(frame) };
        return null;
      }
      if (event.type === "pointermove") {
        if (down && (!validPoint(event, frame) || !samePointer(down.event, event) || event.buttons !== 1
          || !sameFrame(down.frame, frame)
          || Math.hypot(event.offsetX - down.event.offsetX, event.offsetY - down.event.offsetY) > MAX_POINTER_TRAVEL_CSS_PX)) clearGesture();
        return null;
      }
      if (event.type === "pointerup") {
        const start = down;
        const onlyPointer = event.pointerId !== null && activePointers.size === 1 && activePointers.has(event.pointerId);
        if (event.pointerId !== null) activePointers.delete(event.pointerId);
        clearGesture();
        if (!blockedByMultiplePointers && onlyPointer && start && validPoint(event, frame)
          && event.primary && event.button === 0 && event.buttons === 0 && samePointer(start.event, event)
          && event.timeStamp >= start.event.timeStamp && sameFrame(start.frame, frame)
          && event.clientX - event.offsetX === start.event.clientX - start.event.offsetX
          && event.clientY - event.offsetY === start.event.clientY - start.event.offsetY
          && Math.hypot(event.offsetX - start.event.offsetX, event.offsetY - start.event.offsetY) <= MAX_POINTER_TRAVEL_CSS_PX) {
          released = { event: { ...event }, frame: snapshot(frame) };
        }
        if (activePointers.size === 0) blockedByMultiplePointers = false;
        return null;
      }
      if (event.type !== "click") return null;
      const previous = released;
      clearGesture();
      if (!previous || blockedByMultiplePointers || activePointers.size !== 0 || !validPoint(event, frame)
        || event.detail <= 0 || event.button !== 0 || event.buttons !== 0 || !samePointer(previous.event, event)
        || event.timeStamp < previous.event.timeStamp || event.timeStamp - previous.event.timeStamp > MAX_CLICK_DELAY_MS
        || !sameFrame(previous.frame, frame)
        || event.offsetX !== nativeRound(previous.event.offsetX) || event.offsetY !== nativeRound(previous.event.offsetY)
        || event.clientX !== Math.floor(previous.event.clientX) || event.clientY !== Math.floor(previous.event.clientY)) return null;
      return { offsetX: previous.event.offsetX, offsetY: previous.event.offsetY };
    },
  };
}
