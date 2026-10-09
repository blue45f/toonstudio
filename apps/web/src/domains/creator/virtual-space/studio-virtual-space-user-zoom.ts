/**
 * 사용자 줌: 자동 카메라 줌(뷰포트 맞춤·속도·대화 연출)에 곱하는 배율.
 *
 * 카메라는 화면 크기에 맞춰 줌을 스스로 정하므로(게더타운의 Smart Zoom에 해당) 사용자가 더 가까이 보거나 더 넓게 볼
 * 방법이 없었다. 이 모듈은 단계·휠·부드러운 전환·저장을 순수 함수와 작은 저장소로 제공하고, 캔버스는 매 프레임
 * `sample()`이 돌려주는 배율만 곱한다.
 */

export const STUDIO_USER_ZOOM_STORAGE_KEY = "toonspectrum:virtual-space-user-zoom:v1";

/** 키보드·메뉴가 오가는 배율 단계(1이 자동 줌 그대로). */
export const STUDIO_USER_ZOOM_STEPS: readonly number[] = Object.freeze([0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2]);
export const STUDIO_USER_ZOOM_DEFAULT = 1;
export const STUDIO_USER_ZOOM_MIN = STUDIO_USER_ZOOM_STEPS[0] ?? 0.6;
export const STUDIO_USER_ZOOM_MAX = STUDIO_USER_ZOOM_STEPS[STUDIO_USER_ZOOM_STEPS.length - 1] ?? 2;

export type StudioUserZoomAction = "in" | "out" | "reset";

/** 휠 한 칸(약 100px)이 곱하는 배율. 트랙패드의 작은 delta는 비례해서 줄어든다. */
const WHEEL_STEP_RATIO = 1.12;
/** 트랙패드 핀치는 ctrlKey가 붙은 휠로 오며 delta가 작아, 같은 손동작에 더 크게 반응하도록 키운다. */
const PINCH_GAIN = 4;
/** 전환이 목표에 이만큼 가까워지면 붙여서 끝낸다. */
const SNAP_EPSILON = 0.002;
/** 전환 속도(1/초). 클수록 빠르다. */
const EASE_RATE = 12;

const finiteOr = (value: number, fallback: number): number => (Number.isFinite(value) ? value : fallback);

/** 하한(floor)을 단계 범위 안으로 맞춘다. 최소 배율보다 낮아지지 않고, 1을 넘지 못해 확대를 강요하지 않는다. */
export function studioUserZoomLowerBound(floor: number): number {
  return Math.min(1, Math.max(STUDIO_USER_ZOOM_MIN, finiteOr(floor, STUDIO_USER_ZOOM_MIN)));
}

/** 배율을 허용 범위로 맞춘다. floor는 화면이 월드 밖을 비추지 않게 하는 하한(화면·월드 크기에서 온다). */
export function studioUserZoomClamp(level: number, floor = STUDIO_USER_ZOOM_MIN): number {
  return Math.min(STUDIO_USER_ZOOM_MAX, Math.max(studioUserZoomLowerBound(floor), finiteOr(level, STUDIO_USER_ZOOM_DEFAULT)));
}

/** 현재 배율에서 한 단계 확대·축소한 단계 값. 단계 사이에 있으면 가장 가까운 다음 단계로 간다. */
export function studioUserZoomStep(level: number, direction: 1 | -1): number {
  const current = studioUserZoomClamp(level);
  if (direction > 0) return STUDIO_USER_ZOOM_STEPS.find((step) => step > current + 1e-6) ?? STUDIO_USER_ZOOM_MAX;
  for (let index = STUDIO_USER_ZOOM_STEPS.length - 1; index >= 0; index -= 1) {
    const step = STUDIO_USER_ZOOM_STEPS[index];
    if (step !== undefined && step < current - 1e-6) return step;
  }
  return STUDIO_USER_ZOOM_MIN;
}

export function studioUserZoomApply(level: number, action: StudioUserZoomAction): number {
  if (action === "reset") return STUDIO_USER_ZOOM_DEFAULT;
  return studioUserZoomStep(level, action === "in" ? 1 : -1);
}

/** 휠 입력으로 바뀐 목표 배율. 위로 굴리면(deltaY < 0) 확대한다. */
export function studioUserZoomFromWheel(
  level: number,
  event: { readonly deltaY: number; readonly deltaMode: number; readonly ctrlKey: boolean },
): number {
  const lineHeight = 16;
  const pageHeight = 800;
  const delta = finiteOr(event.deltaY, 0) * (event.deltaMode === 1 ? lineHeight : event.deltaMode === 2 ? pageHeight : 1);
  const gain = event.ctrlKey ? PINCH_GAIN : 1;
  const notches = Math.max(-6, Math.min(6, (-delta * gain) / 100));
  return studioUserZoomClamp(level * WHEEL_STEP_RATIO ** notches);
}

/** 목표 배율로 지수 접근하는 한 걸음. 프레임 간격에 관계없이 같은 속도감을 낸다. */
export function studioUserZoomEase(current: number, target: number, deltaSeconds: number): number {
  const gap = target - current;
  if (Math.abs(gap) < SNAP_EPSILON) return target;
  const dt = Math.min(0.1, Math.max(0, finiteOr(deltaSeconds, 0)));
  const next = current + gap * (1 - Math.exp(-EASE_RATE * dt));
  return Math.abs(target - next) < SNAP_EPSILON ? target : next;
}

/**
 * 화면이 월드 밖의 빈 띠를 비추지 않는 최소 배율. 자동 줌(baseZoom) 위에서 더 줄이면 화면이 월드보다 커지는 지점을 넘지
 * 못하게 한다. 월드가 화면보다 작아 이미 그런 상태면 1(더 줄일 수 없음)을 돌려준다.
 */
export function studioUserZoomFloor(
  baseZoom: number,
  view: { readonly cssWidth: number; readonly cssHeight: number; readonly ratio: number },
  world: { readonly width: number; readonly height: number },
): number {
  if (!(baseZoom > 0) || !(world.width > 0) || !(world.height > 0)) return STUDIO_USER_ZOOM_MIN;
  const cover = Math.max(view.cssWidth / world.width, view.cssHeight / world.height) * view.ratio;
  return studioUserZoomLowerBound(cover / baseZoom);
}

export interface StudioUserZoomStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const defaultStorage = (): StudioUserZoomStorage | null => {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
};

export function readStudioUserZoom(storage: StudioUserZoomStorage | null = defaultStorage()): number {
  try {
    const raw = storage?.getItem(STUDIO_USER_ZOOM_STORAGE_KEY);
    if (raw === null || raw === undefined) return STUDIO_USER_ZOOM_DEFAULT;
    const value = Number(raw);
    return Number.isFinite(value) ? studioUserZoomClamp(value) : STUDIO_USER_ZOOM_DEFAULT;
  } catch {
    return STUDIO_USER_ZOOM_DEFAULT;
  }
}

export interface StudioUserZoomSnapshot {
  /** 지금 적용되는 배율: 사용자가 고른 값을 이 화면에서 내릴 수 있는 하한 안으로 맞춘 것. 버튼·메뉴에 보이는 값이다. */
  readonly level: number;
  /** 이 화면·월드에서 내릴 수 있는 가장 작은 배율. 큰 화면에서는 단계 하한(60%)보다 클 수 있다. */
  readonly min: number;
  /** 지금 카메라가 줌을 받을 수 있는지(고정 프레임 장소에서는 false). */
  readonly available: boolean;
}

/**
 * 사용자 줌 목표 저장소. HUD(버튼·메뉴·단축키)와 캔버스(휠·매 프레임 전환)가 같은 값을 보게 하고, 값이 바뀔 때만 저장한다.
 * 저장소가 막혀 있어도(비공개 창 등) 이번 방문 동안은 그대로 동작한다. React에서는 useSyncExternalStore로 구독한다.
 *
 * 화면이 월드보다 훨씬 큰 곳(초광폭·4K 100%)에서는 월드 밖을 비추지 않는 하한이 단계 하한보다 높다. 이때 고른 값이 하한 아래로
 * 쌓여 화면 표시와 실제 카메라가 어긋나지 않도록, 보이는 값(level)은 하한 안으로 맞추고 사용자가 고른 값(preference)은
 * 따로 보관한다. 창이 다시 작아져 하한이 내려가면 고른 값으로 돌아온다.
 */
export class StudioUserZoomStore {
  /** 사용자가 마지막으로 고른 값(저장되는 쪽). */
  private preference: number;
  private floor = STUDIO_USER_ZOOM_MIN;
  private available = true;
  private state: StudioUserZoomSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly storage: StudioUserZoomStorage | null = defaultStorage()) {
    this.preference = readStudioUserZoom(storage);
    this.state = this.snapshot();
  }

  /** 지금 적용되는 배율(하한 안). */
  get(): number {
    return this.state.level;
  }

  /** 값이 바뀔 때만 새 객체가 되는 스냅샷(useSyncExternalStore 계약). */
  getSnapshot(): StudioUserZoomSnapshot {
    return this.state;
  }

  set(level: number): void {
    const next = studioUserZoomClamp(level, this.floor);
    if (next === this.preference) return;
    this.preference = next;
    try {
      this.storage?.setItem(STUDIO_USER_ZOOM_STORAGE_KEY, String(Math.round(next * 1000) / 1000));
    } catch { /* 저장 실패는 이번 방문의 동작에 영향이 없다 */ }
    this.refresh();
  }

  apply(action: StudioUserZoomAction): void {
    this.set(studioUserZoomApply(this.state.level, action));
  }

  /** 캔버스가 카메라 모드를 알려 준다. 줌을 받지 못하는 장소에서는 HUD가 버튼을 숨긴다. */
  setAvailable(available: boolean): void {
    this.available = available;
    this.refresh();
  }

  /** 화면·월드 크기에서 온 하한을 알린다. 보이는 값과 HUD의 "더 줄일 수 없음" 판단이 이 하한을 따른다. */
  setFloor(floor: number): void {
    this.floor = studioUserZoomLowerBound(floor);
    this.refresh();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private snapshot(): StudioUserZoomSnapshot {
    return Object.freeze({
      level: studioUserZoomClamp(this.preference, this.floor),
      min: studioUserZoomLowerBound(this.floor),
      available: this.available,
    });
  }

  /** 보이는 스냅샷이 실제로 달라졌을 때만 새로 만들고 알린다. */
  private refresh(): void {
    const next = this.snapshot();
    const { level, min, available } = this.state;
    if (next.level === level && next.min === min && next.available === available) return;
    this.state = next;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/**
 * 캔버스가 매 프레임 쓰는 전환 상태. 목표는 저장소에서 읽고 하한(floor)은 화면·월드 크기로 정해진다.
 * 줌을 받지 못하는 카메라(고정 프레임)에서는 언제나 1이다.
 */
export class StudioUserZoomRuntime {
  private shown: number;
  private floor = STUDIO_USER_ZOOM_MIN;
  private available = true;

  constructor(private readonly store: StudioUserZoomStore) {
    this.shown = store.get();
  }

  /** 지금 화면에 적용 중인 배율(글자 해상도 같은 파생 값이 쓴다). */
  get current(): number {
    return this.available ? this.shown : STUDIO_USER_ZOOM_DEFAULT;
  }

  /** 자동 줌·화면·월드 크기·카메라 모드가 바뀔 때 부른다. 하한을 다시 정하고 HUD에 줌 가능 여부를 알린다. */
  setView(
    baseZoom: number,
    view: { readonly cssWidth: number; readonly cssHeight: number; readonly ratio: number },
    world: { readonly width: number; readonly height: number },
    available: boolean,
  ): void {
    this.available = available;
    this.floor = studioUserZoomFloor(baseZoom, view, world);
    this.store.setFloor(this.floor);
    this.store.setAvailable(available);
    this.shown = studioUserZoomClamp(this.shown, this.floor);
  }

  /** 이번 프레임에 곱할 배율. instant(모션 줄이기)면 전환 없이 바로 목표로 간다. */
  sample(deltaSeconds: number, instant = false): number {
    if (!this.available) return STUDIO_USER_ZOOM_DEFAULT;
    const target = studioUserZoomClamp(this.store.get(), this.floor);
    this.shown = studioUserZoomClamp(instant ? target : studioUserZoomEase(this.shown, target, deltaSeconds), this.floor);
    return this.shown;
  }
}

/** 캔버스에 휠 줌을 연결한다. 해제 함수를 돌려준다. */
export function bindStudioUserZoomWheel(
  target: Pick<HTMLElement, "addEventListener" | "removeEventListener">,
  store: StudioUserZoomStore,
  canWheelZoom: () => boolean,
): () => void {
  const onWheel = (event: Event) => {
    const wheel = event as WheelEvent;
    if (!canWheelZoom()) return;
    event.preventDefault();
    store.set(studioUserZoomFromWheel(store.get(), wheel));
  };
  // 휠로 페이지가 스크롤되지 않도록 passive가 아니어야 한다.
  target.addEventListener("wheel", onWheel, { passive: false });
  return () => target.removeEventListener("wheel", onWheel);
}
