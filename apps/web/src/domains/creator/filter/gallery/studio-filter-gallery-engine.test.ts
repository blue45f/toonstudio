import { describe, expect, it } from "vitest";

import {
  STUDIO_FILTER_GALLERY_DIRECT_BUDGET,
  activeStudioFilterGalleryStack,
  applyStudioFilterGalleryStack,
  serializeStudioFilterGalleryStack,
  studioFilterGalleryKonvaFilter,
  studioFilterGalleryRequiresWorker,
} from "./studio-filter-gallery-engine";
import { blendWithOriginal } from "./studio-filter-gallery-kernel-utils";
import {
  STUDIO_FILTER_GALLERY_EFFECTS,
  defaultStudioFilterGalleryParams,
  findStudioFilterGalleryEffect,
  normalizeStudioFilterGalleryParams,
  normalizeStudioFilterGalleryStack,
  studioFilterGalleryStackCost,
} from "./studio-filter-gallery-registry";
import {
  STUDIO_FILTER_GALLERY_CATEGORIES,
  STUDIO_FILTER_GALLERY_MAX_ENTRIES,
  isStudioFilterGalleryEffectId,
} from "./studio-filter-gallery-types";
import { hasActiveStudioFilterGalleryCandidate } from "../../render/studio-konva-filter-fields";

import type { StudioFilterGalleryImage, StudioFilterGalleryStack } from "./studio-filter-gallery-types";

function gradient(width = 12, height = 8): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data.set([x * 20, y * 30, (x + y) * 10, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

const clone = (image: StudioFilterGalleryImage): StudioFilterGalleryImage =>
  ({ width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) });

const stackOf = (...entries: StudioFilterGalleryStack["entries"]): StudioFilterGalleryStack => ({ version: 1, seed: 3, entries });

describe("필터 갤러리 등록부", () => {
  it("모든 효과 id 가 형식에 맞고 겹치지 않으며 분류 순서대로 정렬돼 있다", () => {
    const ids = STUDIO_FILTER_GALLERY_EFFECTS.map((effect) => effect.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(isStudioFilterGalleryEffectId(id)).toBe(true);
    const order = STUDIO_FILTER_GALLERY_EFFECTS.map((effect) => STUDIO_FILTER_GALLERY_CATEGORIES.indexOf(effect.category));
    expect(order.every((value) => value >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((left, right) => left - right));
    for (const effect of STUDIO_FILTER_GALLERY_EFFECTS) {
      expect(effect.label.length).toBeGreaterThan(0);
      expect(effect.description.length).toBeGreaterThan(0);
      expect(effect.cost).toBeGreaterThan(0);
      expect(normalizeStudioFilterGalleryParams(effect, defaultStudioFilterGalleryParams(effect)))
        .toEqual(defaultStudioFilterGalleryParams(effect));
    }
  });

  it("매개변수를 스펙 범위·간격·선택지·형식으로 맞추고 모르는 키를 버린다", () => {
    const effect = findStudioFilterGalleryEffect("color.adaptive-threshold")!;
    expect(normalizeStudioFilterGalleryParams(effect, {
      radius: 1000, offset: 3.4, method: "median", inkColor: "#ABCDEF", transparentPaper: "yes", extra: 1,
    })).toEqual({ radius: 100, offset: 3, method: "mean", inkColor: "#abcdef", transparentPaper: false });
    const cdl = findStudioFilterGalleryEffect("color.slope-offset-power")!;
    expect(normalizeStudioFilterGalleryParams(cdl, { slope: 0.1 + 0.2 }).slope).toBe(0.3);
  });

  it("저장본을 정규화한다 — 모르는 id·잘못된 버전·초과 항목·불투명도를 다룬다", () => {
    expect(normalizeStudioFilterGalleryStack(null)).toBeNull();
    expect(normalizeStudioFilterGalleryStack([])).toBeNull();
    expect(normalizeStudioFilterGalleryStack({ version: 2, entries: [] })).toBeNull();
    const many = Array.from({ length: 12 }, () => ({ id: "color.value-invert", params: {} }));
    const normalized = normalizeStudioFilterGalleryStack({
      seed: -5.7,
      entries: [{ id: "future.effect", params: {} }, { id: "color.dodge-burn", params: { exposure: 50 }, opacity: 1.7 },
        { id: "color.channel-extreme", params: { mode: "minimize" }, opacity: 0.25, enabled: false }, 42, ...many],
    });
    expect(normalized?.seed).toBe(4294967291);
    expect(normalized?.entries).toHaveLength(STUDIO_FILTER_GALLERY_MAX_ENTRIES);
    expect(normalized?.entries[0]).toEqual({ id: "color.dodge-burn", params: { mode: "dodge", range: "midtones", exposure: 50 } });
    expect(normalized?.entries[1]).toEqual({ id: "color.channel-extreme", params: { mode: "minimize" }, opacity: 0.25, enabled: false });
  });

  it("작업량은 켜진 효과의 cost 합이다", () => {
    const stack = normalizeStudioFilterGalleryStack({
      entries: [{ id: "color.retinex" }, { id: "color.value-invert", enabled: false }, { id: "noise.hurl", opacity: 0 }],
    })!;
    expect(studioFilterGalleryStackCost(stack)).toBe(findStudioFilterGalleryEffect("color.retinex")!.cost);
  });
});

describe("필터 갤러리 실행 엔진", () => {
  it("가벼운 후보 판정과 엔진 판정이 켜진 효과 기준으로 일치한다", () => {
    const active = { filterGallery: { version: 1, seed: 1, entries: [{ id: "color.value-invert", params: {} }] } };
    const disabled = { filterGallery: { version: 1, seed: 1, entries: [{ id: "color.value-invert", params: {}, enabled: false }] } };
    const transparent = { filterGallery: { version: 1, seed: 1, entries: [{ id: "color.value-invert", params: {}, opacity: 0 }] } };
    expect(hasActiveStudioFilterGalleryCandidate(active.filterGallery)).toBe(true);
    expect(activeStudioFilterGalleryStack(active)).not.toBeNull();
    for (const inactive of [disabled, transparent, {}, { filterGallery: "broken" }]) {
      expect(hasActiveStudioFilterGalleryCandidate(inactive.filterGallery)).toBe(false);
      expect(activeStudioFilterGalleryStack(inactive)).toBeNull();
    }
  });

  it("위에서 아래 순서로 적용하고, 같은 효과를 두 번 쌓으면 되돌아온다", () => {
    const input = gradient();
    const once = clone(input);
    expect(applyStudioFilterGalleryStack(once, stackOf({ id: "color.dodge-burn", params: { mode: "burn", range: "highlights", exposure: 80 } }))).toBe("applied");
    expect(once.data).not.toEqual(input.data);
    const twice = clone(input);
    applyStudioFilterGalleryStack(twice, stackOf(
      { id: "color.channel-extreme", params: { mode: "maximize" } },
      { id: "color.channel-extreme", params: { mode: "maximize" } },
    ));
    const single = clone(input);
    applyStudioFilterGalleryStack(single, stackOf({ id: "color.channel-extreme", params: { mode: "maximize" } }));
    expect(twice.data).toEqual(single.data);
  });

  it("불투명도 0.5 는 원본과 결과의 중간이다", () => {
    const input = gradient();
    const full = clone(input);
    applyStudioFilterGalleryStack(full, stackOf({ id: "color.value-invert", params: {} }));
    const half = clone(input);
    applyStudioFilterGalleryStack(half, stackOf({ id: "color.value-invert", params: {}, opacity: 0.5 }));
    for (let index = 0; index < input.data.length; index += 1) {
      expect(Math.abs(half.data[index]! - (input.data[index]! + full.data[index]!) / 2)).toBeLessThanOrEqual(1);
    }
  });

  it("예산을 넘으면 픽셀을 바꾸지 않는다", () => {
    const input = gradient();
    const image = clone(input);
    expect(applyStudioFilterGalleryStack(image, stackOf({ id: "color.retinex", params: {} }), 10)).toBe("over-budget");
    expect(image.data).toEqual(input.data);
  });

  it("Konva 필터는 attrs 의 직렬화 스택만 적용하고 손상된 값은 무시한다", () => {
    const input = gradient();
    const stack = stackOf({ id: "color.value-invert", params: {} });
    const applied = clone(input);
    studioFilterGalleryKonvaFilter.call({ attrs: { filterGallery: serializeStudioFilterGalleryStack(stack) } }, applied);
    expect(applied.data).not.toEqual(input.data);
    for (const attrs of [{}, { filterGallery: "{not json" }, { filterGallery: 5 }]) {
      const untouched = clone(input);
      studioFilterGalleryKonvaFilter.call({ attrs }, untouched);
      expect(untouched.data).toEqual(input.data);
    }
    const noThis = clone(input);
    studioFilterGalleryKonvaFilter.call(undefined, noThis);
    expect(noThis.data).toEqual(input.data);
  });

  it("큰 이미지나 무거운 효과는 Worker 경로를 요구한다", () => {
    const el = { filterGallery: stackOf({ id: "color.retinex", params: {} }) };
    const cost = findStudioFilterGalleryEffect("color.retinex")!.cost;
    const side = Math.ceil(Math.sqrt(STUDIO_FILTER_GALLERY_DIRECT_BUDGET / cost)) + 1;
    expect(studioFilterGalleryRequiresWorker(el, 64, 64)).toBe(false);
    expect(studioFilterGalleryRequiresWorker(el, side, side)).toBe(true);
    expect(studioFilterGalleryRequiresWorker({}, side, side)).toBe(false);
  });
});

describe("필터 갤러리 · 겹 불투명도 섞기", () => {
  it("알파가 바뀐 픽셀에 원본의 숨은 색을 섞지 않고(어두운 테두리 없음), 알파가 같은 픽셀은 색을 반씩 섞는다", () => {
    const original = new Uint8ClampedArray([0, 0, 0, 0, 100, 100, 100, 200]);
    const image: StudioFilterGalleryImage = { width: 2, height: 1, data: new Uint8ClampedArray([255, 255, 255, 64, 200, 50, 0, 200]) };
    blendWithOriginal(image, original, 0.5);
    expect(Array.from(image.data)).toEqual([255, 255, 255, 32, 150, 75, 50, 200]);
  });

  it("완전히 투명한 두 픽셀은 알파 0 을 유지한다", () => {
    const image: StudioFilterGalleryImage = { width: 1, height: 1, data: new Uint8ClampedArray([10, 20, 30, 0]) };
    blendWithOriginal(image, new Uint8ClampedArray([50, 60, 70, 0]), 0.25);
    expect(image.data[3]).toBe(0);
  });
});
