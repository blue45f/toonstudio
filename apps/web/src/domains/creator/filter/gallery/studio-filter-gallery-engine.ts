/**
 * 필터 갤러리 실행 엔진 — 정규화된 스택을 이미지 픽셀에 차례로 적용한다.
 *
 * Konva 캐시 필터와 이미지 필터 Worker 가 같은 함수를 쓴다(studio-konva-filters 가 F.FilterGallery 로 등록).
 * Konva attrs 는 숫자·문자열만 실을 수 있어 스택을 JSON 문자열 하나로 넘기고, 같은 문자열을 다시 파싱하지 않도록
 * 마지막 한 개만 기억한다. 작업량이 예산을 넘으면 아무것도 바꾸지 않는다(부분 적용으로 결과가 뒤바뀌지 않게).
 */
import { blendWithOriginal, hash2 } from "./studio-filter-gallery-kernel-utils";
import {
  findStudioFilterGalleryEffect,
  isStudioFilterGalleryEntryActive,
  normalizeStudioFilterGalleryStack,
  studioFilterGalleryStackCost,
} from "./studio-filter-gallery-registry";
import { STUDIO_FILTER_GALLERY_WORK_BUDGET } from "./studio-filter-gallery-types";

import type { StudioFilterGalleryImage, StudioFilterGalleryStack } from "./studio-filter-gallery-types";

/** 메인 스레드에서 바로 돌려도 되는 작업량 상한(픽셀 수 × cost). 넘으면 Worker 경로를 쓴다. */
export const STUDIO_FILTER_GALLERY_DIRECT_BUDGET = 1024 * 1024 * 6;

export type StudioFilterGalleryRunResult = "applied" | "inactive" | "over-budget";

/** 활성 효과가 하나라도 있는 정규화 스택. 없으면 null. */
export function activeStudioFilterGalleryStack(el: { readonly filterGallery?: unknown }): StudioFilterGalleryStack | null {
  const stack = normalizeStudioFilterGalleryStack(el.filterGallery);
  return stack && stack.entries.some(isStudioFilterGalleryEntryActive) ? stack : null;
}

export function studioFilterGalleryWork(stack: StudioFilterGalleryStack, width: number, height: number): number {
  return studioFilterGalleryStackCost(stack) * Math.max(0, width) * Math.max(0, height);
}

export function studioFilterGalleryRequiresWorker(
  el: { readonly filterGallery?: unknown },
  width: number,
  height: number,
): boolean {
  const stack = activeStudioFilterGalleryStack(el);
  return !!stack && studioFilterGalleryWork(stack, width, height) > STUDIO_FILTER_GALLERY_DIRECT_BUDGET;
}

/**
 * 스택을 위에서 아래 순서로 적용한다. 효과마다 시드는 스택 시드와 순번을 섞어 정하므로 같은 효과를 두 번 쌓아도
 * 서로 다른 무늬가 나오고, 같은 문서는 어디서 그려도 같은 픽셀이 된다.
 */
export function applyStudioFilterGalleryStack(
  image: StudioFilterGalleryImage,
  stack: StudioFilterGalleryStack,
  budget = STUDIO_FILTER_GALLERY_WORK_BUDGET,
): StudioFilterGalleryRunResult {
  if (image.width <= 0 || image.height <= 0 || image.data.length < image.width * image.height * 4) return "inactive";
  if (!stack.entries.some(isStudioFilterGalleryEntryActive)) return "inactive";
  if (studioFilterGalleryWork(stack, image.width, image.height) > budget) return "over-budget";
  stack.entries.forEach((entry, order) => {
    if (!isStudioFilterGalleryEntryActive(entry)) return;
    const effect = findStudioFilterGalleryEffect(entry.id);
    if (!effect) return;
    const context = { seed: Math.floor(hash2(order, stack.seed, 0x5eed) * 0x7fffffff), scale: 1 };
    const opacity = entry.opacity ?? 1;
    if (opacity >= 1) {
      effect.apply(image, entry.params, context);
      return;
    }
    const original = image.data.slice();
    effect.apply(image, entry.params, context);
    blendWithOriginal(image, original, opacity);
  });
  return "applied";
}

let lastSerialized = "";
let lastStack: StudioFilterGalleryStack | null = null;

function parseSerializedStack(serialized: string): StudioFilterGalleryStack | null {
  if (serialized === lastSerialized) return lastStack;
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    parsed = null;
  }
  lastSerialized = serialized;
  lastStack = normalizeStudioFilterGalleryStack(parsed);
  return lastStack;
}

/** buildImageFilters 가 attrs.filterGallery 에 싣는 직렬화 문자열. */
export function serializeStudioFilterGalleryStack(stack: StudioFilterGalleryStack): string {
  return JSON.stringify(stack);
}

/** Konva 필터 — this.attrs.filterGallery(JSON 문자열)를 읽어 적용한다. */
export function studioFilterGalleryKonvaFilter(
  this: { attrs?: Record<string, unknown> } | undefined,
  imageData: StudioFilterGalleryImage,
): void {
  const serialized = this?.attrs?.filterGallery;
  if (typeof serialized !== "string" || serialized.length === 0) return;
  const stack = parseSerializedStack(serialized);
  if (stack) applyStudioFilterGalleryStack(imageData, stack);
}
