/**
 * 카메라 둘러보기: 아바타를 따라가는 카메라를 끌어서 옮겨 보고(게더타운의 '끌어서 이동') 내 위치로 돌아온다.
 *
 * - 끌기: 마우스 오른쪽·가운데 버튼, Space를 누른 채 왼쪽 버튼, 터치 두 손가락. 왼쪽 버튼은 누르는 순간 걷기 시작하는
 *   '클릭 이동'이 쓰므로 일반 왼쪽 끌기는 받지 않는다. 끌기 버튼을 누를 때 pointerdown의 기본 동작을 취소하면 브라우저가
 *   이어서 보내는 호환 마우스 이벤트(Phaser는 mousedown을 듣는다)가 오지 않아 끌기가 걷기를 시작시키지 않는다.
 * - 돌아오기: L 키·칩 버튼, 아바타가 걷기 시작할 때, 방 전환·대화 연출처럼 디렉터가 카메라를 이끄는 동안.
 * - 화면이 월드 밖의 빈 띠를 비추지 않도록 카메라가 갈 수 있는 범위 안으로 제한한다.
 *
 * 저장소(HUD·입력이 쓴다)와 런타임(매 프레임 오프셋을 계산한다)을 나눠, React는 저장소만 구독한다.
 */
import { bindStudioUserZoomGestures, type StudioUserZoomStore } from "./studio-virtual-space-user-zoom";

/** 시점이 이만큼(월드 px) 이상 떨어져야 '시점을 옮겼다'고 보고 안내 칩을 띄운다. */
export const STUDIO_CAMERA_PANNED_THRESHOLD_PX = 32;
/** 돌아올 때 오프셋이 줄어드는 속도(1/초). 클수록 빠르다. */
const RETURN_RATE = 9;
/** 이 거리(월드 px)보다 가까우면 0으로 붙여 끝낸다. */
const SNAP_EPSILON_PX = 0.5;

const finite = (value: number): boolean => Number.isFinite(value);

export interface StudioCameraPanSnapshot {
  /** 카메라가 아바타를 따라가는 장소인지(전체가 고정으로 보이는 장소에서는 false). */
  readonly available: boolean;
  /** 시점이 아바타에서 눈에 띄게 떨어져 있는지. HUD 칩이 이 값을 본다. */
  readonly panned: boolean;
}

/**
 * 끌기 입력과 돌아오기 요청을 모아 두는 저장소. 입력은 화면 기준(CSS px)으로 쌓고, 월드 거리로 바꾸는 일은 화면 배율을 아는
 * 런타임이 다음 프레임에 한다. 스냅샷은 값이 바뀔 때만 새 객체다(useSyncExternalStore 계약).
 */
export class StudioCameraPanStore {
  private dragX = 0;
  private dragY = 0;
  private recenterRequested = false;
  private state: StudioCameraPanSnapshot = Object.freeze({ available: true, panned: false });
  private readonly listeners = new Set<() => void>();

  /** 화면에서 끈 거리(CSS px, 오른쪽·아래가 +). 새로 끌면 돌아오기 요청은 취소한다. */
  drag(dxCss: number, dyCss: number): void {
    if (!finite(dxCss) || !finite(dyCss)) return;
    this.dragX += dxCss;
    this.dragY += dyCss;
    this.recenterRequested = false;
  }

  /** 내 위치로 돌아오게 한다. 아직 반영하지 않은 끌기는 버린다. */
  recenter(): void {
    this.dragX = 0;
    this.dragY = 0;
    this.recenterRequested = true;
  }

  /** 런타임 전용. 쌓인 끌기를 꺼내 비운다. 없으면 null. */
  consumeDrag(): { readonly x: number; readonly y: number } | null {
    if (this.dragX === 0 && this.dragY === 0) return null;
    const drag = { x: this.dragX, y: this.dragY };
    this.dragX = 0;
    this.dragY = 0;
    return drag;
  }

  /** 런타임 전용. 돌아오기 요청이 있었는지 꺼내 비운다. */
  consumeRecenter(): boolean {
    const requested = this.recenterRequested;
    this.recenterRequested = false;
    return requested;
  }

  setAvailable(available: boolean): void {
    this.update({ available });
  }

  setPanned(panned: boolean): void {
    this.update({ panned });
  }

  getSnapshot(): StudioCameraPanSnapshot {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private update(patch: Partial<StudioCameraPanSnapshot>): void {
    const next = { ...this.state, ...patch };
    if (next.available === this.state.available && next.panned === this.state.panned) return;
    this.state = Object.freeze(next);
    for (const listener of this.listeners) listener();
  }
}

export interface StudioCameraPanFrame {
  readonly deltaSeconds: number;
  /** 카메라가 아바타를 따라가는 장소인가. 아니면 둘러보기를 쓰지 않는다. */
  readonly available: boolean;
  /** 방 전환·대화 연출처럼 디렉터가 카메라를 이끄는 동안. 새 끌기는 받지 않고 오프셋을 돌려보낸다. */
  readonly directed: boolean;
  /** 순간 이동·포털처럼 카메라가 한 번에 건너뛰는 프레임. 오프셋을 바로 비운다. */
  readonly snap: boolean;
  /** 모션 줄이기. 돌아올 때 전환 없이 바로 돌아온다. */
  readonly reducedMotion: boolean;
  /** 아바타가 걷고 있는가. 걷기 시작하는 순간 자동으로 돌아온다. */
  readonly moving: boolean;
  /** 화면 1 CSS px가 월드 몇 px인가(렌더 배율 ÷ 카메라 줌). */
  readonly cssToWorld: number;
  /** 아바타를 따라가는 기준점(데드존을 거친 카메라 목표). */
  readonly base: { readonly x: number; readonly y: number };
  /**
   * 카메라가 지금 실제로 서 있는 중심. 추종 불감대 안에서는 기준점과 어긋나 있을 수 있다.
   * 끌기를 시작할 때 이 자리에서 이어받아야 첫 프레임에 화면이 기준점 쪽으로 튀지 않는다.
   */
  readonly center: { readonly x: number; readonly y: number };
  /** 지금 화면이 비추는 월드 크기. */
  readonly view: { readonly width: number; readonly height: number };
  readonly world: { readonly width: number; readonly height: number };
}

export interface StudioCameraPanSample {
  /** 카메라 목표에 더할 값(월드 px). 옮기지 않았으면 0이라 기존 카메라 동작이 그대로다. */
  readonly x: number;
  readonly y: number;
  /**
   * 이번 프레임에 사용자가 끌었거나 옮겨 둔 시점이 돌아오는 걸음을 밟았으면 true. 이때 카메라는 목표에 바로 맞춰야 한다.
   * Phaser 카메라는 추종 목표가 데드존(불감대) 안이면 움직이지 않고, 끄는 방향을 바꾸면 불감대만큼 늦게 반응해 손에 붙지 않는다.
   */
  readonly direct: boolean;
}

const NO_PAN: StudioCameraPanSample = Object.freeze({ x: 0, y: 0, direct: false });

/** 한 축에서 카메라 중심이 갈 수 있는 범위. 화면이 월드보다 크면 null이라 그 축은 움직이지 않는다. */
function centerRange(view: number, world: number): { readonly low: number; readonly high: number } | null {
  if (!(world > view) || !(view > 0)) return null;
  return { low: view / 2, high: world - view / 2 };
}

/**
 * 오프셋을 재는 원점: 기준점을 카메라가 갈 수 있는 범위 안으로 끌어온 중심.
 * 아바타가 월드 가장자리에 붙어 기준점이 범위 밖에 있어도 오프셋은 범위 안의 가장 가까운 중심에서 잰다.
 * (그렇지 않으면 가장자리에서 끌기가 한참 반응하지 않는 구간이 생긴다.)
 */
function anchorOf(base: number, view: number, world: number): number {
  const range = centerRange(view, world);
  return range ? Math.min(range.high, Math.max(range.low, base)) : base;
}

/** 한 축에서 오프셋을 카메라가 갈 수 있는 범위로 제한하고, 기준점 대비 실제로 옮길 거리(shift)를 돌려준다. */
function clampAxis(base: number, offset: number, view: number, world: number): { readonly offset: number; readonly shift: number } {
  const range = centerRange(view, world);
  if (!range || !finite(offset)) return { offset: 0, shift: 0 };
  const anchor = anchorOf(base, view, world);
  const next = Math.min(range.high - anchor, Math.max(range.low - anchor, offset));
  return { offset: next, shift: next === 0 ? 0 : anchor + next - base };
}

/** 매 프레임 둘러보기 오프셋을 계산한다. 끈 만큼 바로 반영하고, 돌아올 때만 부드럽게 줄인다. */
export class StudioCameraPanRuntime {
  private x = 0;
  private y = 0;
  private returning = false;
  private wasMoving = false;

  constructor(private readonly store: StudioCameraPanStore) {}

  sample(frame: StudioCameraPanFrame): StudioCameraPanSample {
    this.store.setAvailable(frame.available);
    const drag = this.store.consumeDrag();
    const recenter = this.store.consumeRecenter();
    const startedMoving = frame.moving && !this.wasMoving;
    this.wasMoving = frame.moving;
    const { base } = frame;
    if (!frame.available || frame.snap || !finite(base.x) || !finite(base.y) || !(frame.cssToWorld > 0)) {
      return this.reset();
    }
    let direct = false;
    if (drag && !frame.directed) {
      if (this.x === 0 && this.y === 0 && finite(frame.center.x) && finite(frame.center.y)) {
        this.x = frame.center.x - anchorOf(base.x, frame.view.width, frame.world.width);
        this.y = frame.center.y - anchorOf(base.y, frame.view.height, frame.world.height);
      }
      // 손가락·포인터를 따라 월드가 움직이므로 카메라 중심은 반대로 간다.
      this.x -= drag.x * frame.cssToWorld;
      this.y -= drag.y * frame.cssToWorld;
      this.returning = false;
      direct = true;
    }
    if (recenter || frame.directed || (startedMoving && (this.x !== 0 || this.y !== 0))) this.returning = true;
    if (this.returning) {
      // 돌아오는 걸음은 마지막 걸음(0에 닿는 프레임)까지 목표에 바로 맞춘다. 옮긴 게 없으면 연출 구간 내내 직접 이끌 이유가 없다.
      if (this.x !== 0 || this.y !== 0) direct = true;
      if (frame.reducedMotion) {
        this.x = 0;
        this.y = 0;
      } else {
        const keep = Math.exp(-RETURN_RATE * Math.min(0.1, Math.max(0, finite(frame.deltaSeconds) ? frame.deltaSeconds : 0)));
        this.x *= keep;
        this.y *= keep;
        if (Math.hypot(this.x, this.y) < SNAP_EPSILON_PX) {
          this.x = 0;
          this.y = 0;
        }
      }
      if (this.x === 0 && this.y === 0) this.returning = false;
    }
    const horizontal = clampAxis(base.x, this.x, frame.view.width, frame.world.width);
    const vertical = clampAxis(base.y, this.y, frame.view.height, frame.world.height);
    this.x = horizontal.offset;
    this.y = vertical.offset;
    this.store.setPanned(Math.hypot(this.x, this.y) >= STUDIO_CAMERA_PANNED_THRESHOLD_PX);
    return { x: horizontal.shift, y: vertical.shift, direct };
  }

  private reset(): StudioCameraPanSample {
    this.x = 0;
    this.y = 0;
    this.returning = false;
    this.store.setPanned(false);
    return NO_PAN;
  }
}

type PanPointerTarget = Pick<HTMLElement, "addEventListener" | "removeEventListener" | "setAttribute" | "removeAttribute">
  & Partial<Pick<HTMLElement, "setPointerCapture" | "releasePointerCapture">>;
type KeyTarget = Pick<Window, "addEventListener" | "removeEventListener">;

/**
 * 마우스로 둘러보기를 연결한다: 오른쪽·가운데 버튼, 또는 Space를 누른 채 왼쪽 버튼. 터치는 두 손가락 끌기가 맡는다.
 * 끌기를 시작하는 pointerdown의 기본 동작을 취소해 클릭 이동(Phaser의 mousedown)이 같은 누름으로 걷기를 시작하지 않게 한다.
 * 캔버스 속성 `data-camera-pan-ready`(Space를 누른 상태)와 `data-camera-panning`(끄는 중)은 손 모양 커서를 위한 것이다.
 */
export function bindStudioCameraPan(
  target: PanPointerTarget,
  store: Pick<StudioCameraPanStore, "drag">,
  canPan: () => boolean,
  keys: KeyTarget = globalThis,
): () => void {
  let spaceHeld = false;
  let drag: { readonly pointerId: number; x: number; y: number } | null = null;

  const syncReady = () => {
    if (spaceHeld && canPan()) target.setAttribute("data-camera-pan-ready", "true");
    else target.removeAttribute("data-camera-pan-ready");
  };
  const endDrag = () => {
    if (!drag) return;
    try { target.releasePointerCapture?.(drag.pointerId); } catch { /* 이미 풀린 캡처는 무시한다 */ }
    drag = null;
    target.removeAttribute("data-camera-panning");
  };
  const onKeyDown = (event: Event) => {
    if ((event as KeyboardEvent).code !== "Space") return;
    spaceHeld = true;
    syncReady();
  };
  const onKeyUp = (event: Event) => {
    if ((event as KeyboardEvent).code !== "Space") return;
    spaceHeld = false;
    syncReady();
  };
  const onBlur = () => {
    spaceHeld = false;
    syncReady();
    endDrag();
  };
  const onDown = (event: Event) => {
    const pointer = event as PointerEvent;
    if (pointer.pointerType === "touch" || drag || !canPan()) return;
    if (!(pointer.button === 1 || pointer.button === 2 || (pointer.button === 0 && spaceHeld))) return;
    pointer.preventDefault();
    drag = { pointerId: pointer.pointerId, x: pointer.clientX, y: pointer.clientY };
    try { target.setPointerCapture?.(pointer.pointerId); } catch { /* 캡처가 막혀도 끌기는 된다 */ }
    target.setAttribute("data-camera-panning", "true");
  };
  const onMove = (event: Event) => {
    const pointer = event as PointerEvent;
    if (!drag || pointer.pointerId !== drag.pointerId) return;
    store.drag(pointer.clientX - drag.x, pointer.clientY - drag.y);
    drag.x = pointer.clientX;
    drag.y = pointer.clientY;
  };
  const onUp = (event: Event) => {
    if (drag && (event as PointerEvent).pointerId === drag.pointerId) endDrag();
  };
  // 오른쪽 버튼을 놓을 때 뜨는 브라우저 메뉴가 끌기를 끊지 않게 한다.
  const onContextMenu = (event: Event) => {
    if (canPan()) event.preventDefault();
  };

  keys.addEventListener("keydown", onKeyDown);
  keys.addEventListener("keyup", onKeyUp);
  keys.addEventListener("blur", onBlur);
  target.addEventListener("pointerdown", onDown);
  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", onUp);
  target.addEventListener("pointercancel", onUp);
  target.addEventListener("contextmenu", onContextMenu);
  return () => {
    keys.removeEventListener("keydown", onKeyDown);
    keys.removeEventListener("keyup", onKeyUp);
    keys.removeEventListener("blur", onBlur);
    target.removeEventListener("pointerdown", onDown);
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", onUp);
    target.removeEventListener("pointercancel", onUp);
    target.removeEventListener("contextmenu", onContextMenu);
    spaceHeld = false;
    endDrag();
    target.removeAttribute("data-camera-pan-ready");
  };
}

export interface StudioCameraGestureOptions {
  readonly zoom: StudioUserZoomStore;
  readonly pan: Pick<StudioCameraPanStore, "drag">;
  readonly canZoom: () => boolean;
  readonly canPan: () => boolean;
  /** 두 손가락이 닿아 핀치가 시작될 때(첫 손가락이 시작시킨 걷기를 멈추는 데 쓴다). */
  readonly onPinchStart?: () => void;
}

/**
 * 캔버스의 시점 제스처 한 묶음: 휠·핀치 줌, 두 손가락 끌기(핀치와 함께), 마우스 둘러보기.
 * 두 손가락 끌기는 핀치와 같은 손동작이라 줌과 이동이 동시에 일어난다(지도 앱과 같은 방식).
 */
export function bindStudioCameraGestures(
  target: PanPointerTarget,
  options: StudioCameraGestureOptions,
): () => void {
  const releaseZoom = bindStudioUserZoomGestures(target, options.zoom, options.canZoom, options.onPinchStart,
    (dx, dy) => { if (options.canPan()) options.pan.drag(dx, dy); });
  const releasePan = bindStudioCameraPan(target, options.pan, options.canPan);
  return () => {
    releaseZoom();
    releasePan();
  };
}
