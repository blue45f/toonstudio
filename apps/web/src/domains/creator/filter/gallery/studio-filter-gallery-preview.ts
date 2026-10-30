/**
 * 필터 갤러리 대화상자 안 결과 미리보기의 계획과 실행 순서.
 *
 * 대화상자가 넓어 뒤 캔버스(캔버스 미리보기)를 대부분 가리므로 대화상자 안에서도 결과를 보인다.
 *
 * - 캔버스와 같은 결과를 계산한다. 캔버스(Konva 캐시·이미지 필터 Worker)는 요소의 문서 크기(반올림한 width×height, 갤러리가
 *   켜지면 밀도 1) 스냅샷에 요소의 필터 필드 전체를 적용한다. 미리보기도 같은 크기·같은 필드(요소 필드 위에 초안 스택 패치)로
 *   계산한다. 커널의 크기 매개변수는 이미지 px 단위라(context.scale 을 쓰지 않는다) 축소본으로는 같은 모습이 나오지 않는다.
 * - 캔버스가 필터를 끄는 크기(인터랙티브 상한 초과)는 계산하지 않는다. 갤러리 작업량 상한을 넘는 스택은 캔버스처럼 엔진이
 *   건너뛰므로 계산은 그대로 하되(요소의 다른 필터는 적용된다) 스택이 빠졌다고 알린다.
 * - 실행은 한 번에 하나만 한다. 실행 중에 들어온 요청은 마지막 것 하나만 남겨 끝나는 즉시 이어 돌린다. 끌기 중에도 중간
 *   결과가 보이고 마지막 값으로 수렴한다(상주 Worker 는 취소해도 돌던 계산을 끝까지 하므로 취소로 얻는 것이 없다).
 */
import { studioFilterDraftToPatch } from "../studio-filter-menu";

import { studioFilterGalleryWork } from "./studio-filter-gallery-engine";
import { STUDIO_FILTER_GALLERY_WORK_BUDGET } from "./studio-filter-gallery-types";

import type { StudioFilterGalleryStack } from "./studio-filter-gallery-types";
import type { ImageFilterFields } from "../../render/studio-konva-filter-fields";

/** 캔버스 이미지 노드가 필터를 계산하는 최대 픽셀 수(StudioKonvaImageNode 의 IMAGE_FILTER_INTERACTIVE_MAX_PIXELS 와 같은 값). */
export const STUDIO_FILTER_GALLERY_PREVIEW_MAX_PIXELS = 16 * 1024 * 1024;

/** 마지막 변경 뒤 계산을 시작하기까지 기다리는 시간(ms). 슬라이더를 끄는 동안 칸마다 계산을 쌓지 않는다. */
export const STUDIO_FILTER_GALLERY_PREVIEW_DEBOUNCE_MS = 120;

export type StudioFilterGalleryPreviewPlan =
  | { readonly kind: "unsized" }
  | { readonly kind: "too-large"; readonly width: number; readonly height: number }
  | {
      readonly kind: "ready";
      readonly width: number;
      readonly height: number;
      /** 갤러리 작업량 상한을 넘어 엔진이 스택을 건너뛴다(캔버스도 같다). */
      readonly stackSkipped: boolean;
    };

/** 요소의 문서 크기와 스택으로 미리보기를 계산할지, 어떤 크기로 계산할지 정한다(캔버스 이미지 노드와 같은 반올림). */
export function planStudioFilterGalleryPreview(
  size: { readonly width?: number | undefined; readonly height?: number | undefined },
  stack: StudioFilterGalleryStack,
): StudioFilterGalleryPreviewPlan {
  const { width: rawWidth, height: rawHeight } = size;
  if (typeof rawWidth !== "number" || typeof rawHeight !== "number" || !Number.isFinite(rawWidth) || !Number.isFinite(rawHeight)) {
    return { kind: "unsized" };
  }
  if (rawWidth <= 0 || rawHeight <= 0) return { kind: "unsized" };
  const width = Math.max(1, Math.round(rawWidth));
  const height = Math.max(1, Math.round(rawHeight));
  if (width * height > STUDIO_FILTER_GALLERY_PREVIEW_MAX_PIXELS) return { kind: "too-large", width, height };
  return {
    kind: "ready",
    width,
    height,
    stackSkipped: studioFilterGalleryWork(stack, width, height) > STUDIO_FILTER_GALLERY_WORK_BUDGET,
  };
}

/** 캔버스 미리보기와 같은 필드: 요소 필드 위에 초안 스택 패치를 얹는다(빈 스택이면 갤러리 필드를 지운다). */
export function studioFilterGalleryPreviewFields(
  image: ImageFilterFields,
  stack: StudioFilterGalleryStack,
): ImageFilterFields {
  return { ...image, ...studioFilterDraftToPatch({ kind: "filter-gallery", stack }) };
}

export interface StudioFilterGalleryPreviewSchedulerOptions<TRequest, TResult> {
  readonly run: (request: TRequest, signal: AbortSignal) => Promise<TResult>;
  /** latest: 이 결과를 낸 요청 뒤로 기다리는 요청이 없다. */
  readonly onResult: (result: TResult, request: TRequest, latest: boolean) => void;
  readonly onError: (error: unknown, request: TRequest) => void;
  /** 기다리거나 도는 요청이 있으면 true. */
  readonly onBusyChange?: (busy: boolean) => void;
  readonly debounceMs?: number;
}

export interface StudioFilterGalleryPreviewScheduler<TRequest> {
  request(request: TRequest): void;
  dispose(): void;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { readonly name?: unknown }).name === "AbortError";
}

/** 디바운스 뒤 한 번에 하나씩, 마지막 요청으로 수렴하는 실행 순서. */
export function createStudioFilterGalleryPreviewScheduler<TRequest, TResult>(
  options: StudioFilterGalleryPreviewSchedulerOptions<TRequest, TResult>,
): StudioFilterGalleryPreviewScheduler<TRequest> {
  const debounceMs = options.debounceMs ?? STUDIO_FILTER_GALLERY_PREVIEW_DEBOUNCE_MS;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { readonly request: TRequest } | null = null;
  let running = false;
  let busy = false;
  let disposed = false;

  const setBusy = (next: boolean) => {
    if (busy === next) return;
    busy = next;
    options.onBusyChange?.(next);
  };

  const start = () => {
    if (disposed || running || !pending) return;
    const { request } = pending;
    pending = null;
    running = true;
    let task: Promise<TResult>;
    try {
      task = options.run(request, controller.signal);
    } catch (error) {
      task = Promise.reject(error);
    }
    task.then(
      (result) => {
        if (!disposed) options.onResult(result, request, pending === null);
      },
      (error: unknown) => {
        if (!disposed && !isAbortError(error)) options.onError(error, request);
      },
    ).finally(() => {
      running = false;
      if (disposed) return;
      if (pending) {
        // 기다리던 요청의 디바운스가 이미 끝났으면 바로 잇고, 아직이면 타이머가 시작한다.
        if (timer === null) start();
      } else {
        setBusy(false);
      }
    });
  };

  return {
    request(request) {
      if (disposed) return;
      pending = { request };
      setBusy(true);
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        start();
      }, debounceMs);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pending = null;
      controller.abort();
    },
  };
}
