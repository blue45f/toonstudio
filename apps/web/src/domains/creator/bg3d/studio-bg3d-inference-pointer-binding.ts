/**
 * 포인터 이벤트 → 추론 서비스 연결 (DOM 리스너 + 프레임 스로틀 + 머무름 기준점).
 *
 * R3F 컨트롤러(`StudioBg3dInferenceController`)가 얇게 감싸는 로직이다. 카메라·사각형·객체 레지스트리를
 * 함수로 받아 three.js 카메라와 합성 메시만으로 단위 테스트할 수 있다.
 *
 *  - pointermove: 프레임 게이트(기본 16ms)로 쿼리를 묶고, 보류된 마지막 샘플은 다음 프레임에 반드시 처리한다.
 *  - pointerdown: 게이트를 건너뛰고 즉시 해석한다 — 곧이어 오는 클릭이 방금 위치의 추론 점을 쓰게 한다.
 *    (터치는 hover가 없으므로 pointerdown이 마커를 보여 주는 첫 신호다.)
 *  - 보조 포인터(멀티터치의 둘째 손가락)와 뷰포트 컨트롤 위의 이벤트는 무시한다.
 *  - 끝점·중간점·중심·교차점 위에 머무르면 "기준점에서 연장"용 호버 기준점으로 등록한다.
 *  - 포인터가 뷰포트를 벗어나면 마커가 남지 않게 결과를 비운다.
 */

import {
  STUDIO_BG3D_INFERENCE_RAYCAST_IGNORE_KEY,
  buildStudioBg3dInferenceRayCursor,
  createStudioBg3dInferenceRayScratch,
} from "./studio-bg3d-inference-pointer";
import { createStudioBg3dInferenceFrameGate } from "./studio-bg3d-inference-timing";

import type { Camera, Object3D } from "three";

import type { StudioBg3dInferenceViewportRect } from "./studio-bg3d-inference-pointer";
import type { StudioBg3dInferenceService } from "./studio-bg3d-inference-service";
import type { StudioBg3dInferencePointerKind, StudioBg3dInferenceResult } from "./studio-bg3d-inference-types";

export { STUDIO_BG3D_INFERENCE_RAYCAST_IGNORE_KEY };

export const STUDIO_BG3D_INFERENCE_DWELL_MS = 700;

export interface StudioBg3dInferencePointerTargetLike {
  addEventListener(type: string, listener: EventListener, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(type: string, listener: EventListener, options?: boolean | EventListenerOptions): void;
}

export interface StudioBg3dInferencePointerEventLike {
  readonly clientX: number;
  readonly clientY: number;
  readonly pointerType?: string;
  readonly isPrimary?: boolean;
  readonly target?: EventTarget | null;
}

export type StudioBg3dInferencePointerService = Pick<
  StudioBg3dInferenceService,
  "isActive" | "resolve" | "publishResult" | "addHoverReference" | "getIndex" | "getResult"
>;

export interface AttachStudioBg3dInferencePointerOptions {
  readonly target: StudioBg3dInferencePointerTargetLike;
  readonly service: StudioBg3dInferencePointerService;
  readonly getCamera: () => Camera | null;
  readonly getRect: () => StudioBg3dInferenceViewportRect;
  readonly getRoots: () => ReadonlyMap<string, Object3D> | null;
  readonly groundY: number | null;
  /** 뷰포트 위의 DOM 컨트롤(툴바 버튼 등)에서 발생한 이벤트인지. */
  readonly isControlTarget?: (target: EventTarget | null) => boolean;
  readonly now?: () => number;
  /** 지연 실행. 취소 함수를 돌려준다. */
  readonly schedule?: (callback: () => void, delayMs: number) => () => void;
  readonly dwellMs?: number;
  readonly minIntervalMs?: number;
}

export interface StudioBg3dInferencePointerBinding {
  detach(): void;
  /** 테스트·진단용: 처리한 쿼리 수, 게이트 통계, 지금 적용 중인 최소 간격(ms). */
  readonly stats: () => {
    readonly queries: number;
    readonly offered: number;
    readonly dropped: number;
    readonly intervalMs: number;
  };
}

interface PointerSample {
  readonly clientX: number;
  readonly clientY: number;
  readonly pointerType: StudioBg3dInferencePointerKind;
}

const POINT_CLASS_KINDS: ReadonlySet<StudioBg3dInferenceResult["kind"]> = new Set([
  "endpoint",
  "midpoint",
  "center",
  "intersection",
]);

function toPointerKind(value: string | undefined): StudioBg3dInferencePointerKind {
  return value === "pen" || value === "touch" ? value : "mouse";
}

function defaultSchedule(callback: () => void, delayMs: number): () => void {
  const handle = setTimeout(callback, delayMs);
  return () => clearTimeout(handle);
}

export function attachStudioBg3dInferencePointer(
  options: AttachStudioBg3dInferencePointerOptions,
): StudioBg3dInferencePointerBinding {
  const { service, target } = options;
  const now = options.now ?? (() => performance.now());
  const schedule = options.schedule ?? defaultSchedule;
  const dwellMs = options.dwellMs ?? STUDIO_BG3D_INFERENCE_DWELL_MS;
  const gate = createStudioBg3dInferenceFrameGate<PointerSample>(options.minIntervalMs);
  const scratch = createStudioBg3dInferenceRayScratch();

  let queries = 0;
  let cancelFlush: (() => void) | null = null;
  let cancelDwell: (() => void) | null = null;
  let dwellKey: string | null = null;

  const labelOf = (sourceId: string): string | null => service.getIndex().source.labels.get(sourceId) ?? null;

  const trackDwell = (result: StudioBg3dInferenceResult | null) => {
    const key = result && POINT_CLASS_KINDS.has(result.kind)
      ? `${result.kind}:${result.point.map((value) => value.toFixed(5)).join(",")}`
      : null;
    if (key === dwellKey) return;
    cancelDwell?.();
    cancelDwell = null;
    dwellKey = key;
    if (key === null || !result) return;
    const point = result.point;
    cancelDwell = schedule(() => {
      cancelDwell = null;
      if (dwellKey === key && service.isActive()) service.addHoverReference(point);
    }, dwellMs);
  };

  const run = (sample: PointerSample) => {
    if (!service.isActive()) return;
    const camera = options.getCamera();
    if (!camera) return;
    // 표면 레이캐스트는 장면의 삼각형 수에 비례하므로 후보 수 상한만으로는 비용을 묶을 수 없다.
    // 실제로 걸린 시간을 게이트에 알려, 느린 장면에서는 간격이 늘어 추론이 프레임을 독점하지 않게 한다.
    const startedAt = now();
    const built = buildStudioBg3dInferenceRayCursor({
      camera,
      rect: options.getRect(),
      clientX: sample.clientX,
      clientY: sample.clientY,
      roots: options.getRoots(),
      groundY: options.groundY,
      sourceLabel: labelOf,
      scratch,
    });
    if (!built) return;
    queries += 1;
    service.resolve({ cursor: built.cursor, pointer: sample.pointerType });
    trackDwell(service.getResult());
    gate.recordCost(now() - startedAt);
  };

  const ignores = (event: StudioBg3dInferencePointerEventLike): boolean =>
    event.isPrimary === false || Boolean(options.isControlTarget?.(event.target ?? null));

  const flushLater = () => {
    if (cancelFlush) return;
    const delay = gate.nextDelayMs(now());
    if (delay === null) return;
    cancelFlush = schedule(() => {
      cancelFlush = null;
      const pending = gate.takePending(now());
      if (pending) run(pending);
      // 아직 간격이 안 지났다면 한 번 더 예약한다.
      else flushLater();
    }, delay + 1);
  };

  const toSample = (event: StudioBg3dInferencePointerEventLike): PointerSample => ({
    clientX: event.clientX,
    clientY: event.clientY,
    pointerType: toPointerKind(event.pointerType),
  });

  const onMove = (event: StudioBg3dInferencePointerEventLike) => {
    if (!service.isActive() || ignores(event)) return;
    const sample = toSample(event);
    if (gate.offer(sample, now()) === "run") run(sample);
    else flushLater();
  };

  const onDown = (event: StudioBg3dInferencePointerEventLike) => {
    if (!service.isActive() || ignores(event)) return;
    // 즉시 해석한다: 같은 위치에서 이어질 클릭이 이 결과를 쓴다. 게이트를 초기화해 보류 샘플이 덮어쓰지 않게 한다.
    gate.reset();
    run(toSample(event));
  };

  const onLeave = () => {
    gate.reset();
    cancelFlush?.();
    cancelFlush = null;
    trackDwell(null);
    if (service.isActive()) service.publishResult(null);
  };

  const moveListener = onMove as unknown as EventListener;
  const downListener = onDown as unknown as EventListener;
  const leaveListener: EventListener = onLeave;
  target.addEventListener("pointermove", moveListener, { capture: true, passive: true });
  target.addEventListener("pointerdown", downListener, { capture: true, passive: true });
  target.addEventListener("pointerleave", leaveListener, true);

  return {
    detach() {
      target.removeEventListener("pointermove", moveListener, true);
      target.removeEventListener("pointerdown", downListener, true);
      target.removeEventListener("pointerleave", leaveListener, true);
      cancelFlush?.();
      cancelFlush = null;
      cancelDwell?.();
      cancelDwell = null;
      dwellKey = null;
    },
    stats: () => {
      const { offered, dropped } = gate.stats();
      return { queries, offered, dropped, intervalMs: gate.intervalMs() };
    },
  };
}
