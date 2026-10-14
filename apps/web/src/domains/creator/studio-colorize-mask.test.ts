import { describe, expect, it } from "vitest";

import type { AdvancedFillImageDataLike, AdvancedFillRgba } from "./studio-advanced-fill";
import {
  appendColorizeHintStroke,
  applyStudioColorizeMask,
  canColorizeMask,
  colorizeHexToRgba,
  colorizeHintPalette,
  colorizeMaskRevision,
  createColorizeMaskState,
  hasColorizeMask,
  isColorizeMaskStale,
  markColorizeMaskBaked,
  normalizeColorizeParams,
  removeColorizeHintStroke,
  shouldApplyColorizeMask,
  withColorizeMaskParams,
  COLORIZE_MASK_DEFAULT_PARAMS,
  type ColorizeHintStroke,
} from "./studio-colorize-mask";

const WHITE: AdvancedFillRgba = [255, 255, 255, 255];
const BLACK: AdvancedFillRgba = [0, 0, 0, 255];
const RED: AdvancedFillRgba = [255, 0, 0, 255];
const BLUE: AdvancedFillRgba = [0, 0, 255, 255];
const TRANSPARENT: AdvancedFillRgba = [0, 0, 0, 0];

function imageFromRows(rows: readonly string[]): AdvancedFillImageDataLike {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) => {
    [...row].forEach((key, x) => {
      data.set(key === "B" ? BLACK : WHITE, (y * width + x) * 4);
    });
  });
  return { data, width, height };
}

/** 세로선(x=10)으로 나뉜 21×9 선화 — 왼쪽/오른쪽 두 영역. 기본 틈 메우기(8px→반경 4)
 * 팽창에도 영역이 남을 만큼 충분히 크게 잡는다. */
const SPLIT_ROWS = Array.from({ length: 9 }, () => "WWWWWWWWWWBWWWWWWWWWW");

function pixelAt(image: AdvancedFillImageDataLike, x: number, y: number): AdvancedFillRgba {
  const offset = (y * image.width + x) * 4;
  return [image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!, image.data[offset + 3]!];
}

function hint(id: string, colorHex: string, x: number, y: number, extra?: Partial<ColorizeHintStroke>): ColorizeHintStroke {
  return { id, colorHex, points: [{ x, y }], radiusPx: 1, ...extra };
}

describe("colorize mask params", () => {
  it("기본값을 채우고 범위 밖 값을 거절한다", () => {
    const ok = normalizeColorizeParams({});
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.params).toEqual(COLORIZE_MASK_DEFAULT_PARAMS);
    expect(normalizeColorizeParams({ gapCloseHintPx: 65 }).ok).toBe(false);
    expect(normalizeColorizeParams({ edgeDetectionPx: 9 }).ok).toBe(false);
    expect(normalizeColorizeParams({ cleanupPercent: 101 }).ok).toBe(false);
  });

  it("hex를 RGBA로 바꾸고 잘못된 형식은 거절한다", () => {
    expect(colorizeHexToRgba("#ff0000")).toEqual(RED);
    expect(colorizeHexToRgba("red")).toBeNull();
    expect(colorizeHexToRgba("#fff")).toBeNull();
  });
});

describe("colorize mask state", () => {
  it("힌트 추가·삭제가 원본 상태를 건드리지 않는다", () => {
    const empty = createColorizeMaskState();
    const withHint = appendColorizeHintStroke(empty, hint("h1", "#ff0000", 1, 2));
    expect(empty.hints).toHaveLength(0);
    expect(withHint.hints).toHaveLength(1);
    const removed = removeColorizeHintStroke(withHint, "h1");
    expect(removed.hints).toHaveLength(0);
  });

  it("힌트를 고치면 리비전이 바뀌어 stale이 된다", () => {
    const state = appendColorizeHintStroke(createColorizeMaskState(), hint("h1", "#ff0000", 1, 2));
    const baked = markColorizeMaskBaked(state, colorizeMaskRevision(state));
    expect(isColorizeMaskStale(baked)).toBe(false);
    const edited = appendColorizeHintStroke(baked, hint("h1", "#0000ff", 1, 2));
    expect(isColorizeMaskStale(edited)).toBe(true);
  });

  it("파라미터 변경은 검증을 거친다", () => {
    const state = createColorizeMaskState();
    const changed = withColorizeMaskParams(state, { gapCloseHintPx: 12 });
    expect(changed.ok).toBe(true);
    if (changed.ok) expect(changed.state.params.gapCloseHintPx).toBe(12);
    expect(withColorizeMaskParams(state, { gapCloseHintPx: 999 }).ok).toBe(false);
  });

  it("술어: image 요소 + 상태 + 켜짐 + 힌트 1개 이상일 때만 적용한다", () => {
    const state = appendColorizeHintStroke(createColorizeMaskState(), hint("h1", "#ff0000", 1, 2));
    expect(canColorizeMask({ type: "image" })).toBe(true);
    expect(canColorizeMask({ type: "text" })).toBe(false);
    expect(hasColorizeMask({ type: "image", colorizeMask: state })).toBe(true);
    expect(shouldApplyColorizeMask({ type: "image", colorizeMask: state })).toBe(true);
    expect(shouldApplyColorizeMask({ type: "image", colorizeMask: state, colorizeMaskEnabled: false })).toBe(false);
    expect(shouldApplyColorizeMask({ type: "image", colorizeMask: createColorizeMaskState() })).toBe(false);
    expect(shouldApplyColorizeMask({ type: "image" })).toBe(false);
  });

  it("힌트 팔레트는 색별로 획 수를 집계한다", () => {
    const palette = colorizeHintPalette([
      hint("a", "#ff0000", 0, 0),
      hint("b", "#ff0000", 1, 1),
      hint("c", "#0000ff", 2, 2, { transparent: true }),
    ]);
    expect(palette[0]).toEqual({ colorHex: "#ff0000", transparent: false, strokeCount: 2 });
    expect(palette[1]).toEqual({ colorHex: "#0000ff", transparent: true, strokeCount: 1 });
  });
});

describe("applyStudioColorizeMask (배선)", () => {
  it("힌트 몇 획으로 나뉜 영역이 각 힌트 색으로 채워지고 선화는 무손상이다", () => {
    const lineArt = imageFromRows(SPLIT_ROWS);
    const lineArtBefore = new Uint8ClampedArray(lineArt.data);
    const state = createColorizeMaskState([
      hint("left", "#ff0000", 2, 4),
      hint("right", "#0000ff", 18, 4),
    ]);
    const result = applyStudioColorizeMask({ lineArt, state });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(pixelAt(result.imageData, 0, 0)).toEqual(RED);
    expect(pixelAt(result.imageData, 9, 8)).toEqual(RED);
    expect(pixelAt(result.imageData, 20, 0)).toEqual(BLUE);
    // 경계(선) 픽셀은 채색 버퍼에서 투명으로 남는다 — 선은 선화 레이어가 보여준다.
    expect(pixelAt(result.imageData, 10, 4)).toEqual(TRANSPARENT);
    expect(result.paintedRegionCount).toBe(2);
    expect(result.paintedPixelCount).toBe(180);
    // 비파괴: 입력 선화 버퍼가 한 바이트도 바뀌지 않았다.
    expect(lineArt.data).toEqual(lineArtBefore);
  });

  it("힌트를 고쳐 다시 구우면 결과가 갱신된다", () => {
    const lineArt = imageFromRows(SPLIT_ROWS);
    const state = createColorizeMaskState([hint("left", "#ff0000", 2, 4)]);
    const first = applyStudioColorizeMask({ lineArt, state });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(pixelAt(first.imageData, 0, 0)).toEqual(RED);

    const edited = appendColorizeHintStroke(state, hint("left", "#0000ff", 2, 4));
    const second = applyStudioColorizeMask({ lineArt, state: edited });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(pixelAt(second.imageData, 0, 0)).toEqual(BLUE);
    expect(second.revision).not.toBe(first.revision);
  });

  it("투명 힌트가 닿은 영역은 칠하지 않고 투명으로 남긴다", () => {
    const lineArt = imageFromRows(SPLIT_ROWS);
    const state = createColorizeMaskState([
      hint("left", "#ff0000", 2, 4),
      hint("right", "#0000ff", 18, 4, { transparent: true }),
    ]);
    const result = applyStudioColorizeMask({ lineArt, state });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(pixelAt(result.imageData, 0, 0)).toEqual(RED);
    expect(pixelAt(result.imageData, 20, 0)).toEqual(TRANSPARENT);
    expect(result.paintedRegionCount).toBe(1);
  });

  it("힌트 없는 영역은 기본 정리 강도(30%)에서 건드리지 않는다", () => {
    const lineArt = imageFromRows(SPLIT_ROWS);
    const state = createColorizeMaskState([hint("left", "#ff0000", 2, 4)]);
    const result = applyStudioColorizeMask({ lineArt, state });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(pixelAt(result.imageData, 20, 0)).toEqual(TRANSPARENT);
  });

  it("틈이 벌어진 선은 gapCloseHintPx만큼 키워야 새지 않는다", () => {
    // 가운데 행(y=2)에만 1px 틈이 있는 세로선.
    const gapRows = Array.from({ length: 9 }, (_, y) =>
      y === 4 ? "WWWWWWWWWWWWWWWWWWWWW" : "WWWWWWWWWWBWWWWWWWWWW",
    );
    const lineArt = imageFromRows(gapRows);
    const hints = [hint("left", "#ff0000", 2, 4)];

    const leaky = applyStudioColorizeMask({
      lineArt,
      state: createColorizeMaskState(hints, { ...COLORIZE_MASK_DEFAULT_PARAMS, gapCloseHintPx: 0 }),
    });
    expect(leaky.ok).toBe(true);
    if (!leaky.ok) return;
    // 틈을 못 막으면 오른쪽까지 같은 영역이라 빨강이 샌다.
    expect(pixelAt(leaky.imageData, 20, 0)).toEqual(RED);

    const sealed = applyStudioColorizeMask({
      lineArt,
      state: createColorizeMaskState(hints, { ...COLORIZE_MASK_DEFAULT_PARAMS, gapCloseHintPx: 8 }),
    });
    expect(sealed.ok).toBe(true);
    if (!sealed.ok) return;
    expect(pixelAt(sealed.imageData, 0, 0)).toEqual(RED);
    expect(pixelAt(sealed.imageData, 20, 0)).toEqual(TRANSPARENT);
  });

  it("힌트 없음·잘못된 색은 fail-closed로 거절한다", () => {
    const lineArt = imageFromRows(SPLIT_ROWS);
    expect(applyStudioColorizeMask({ lineArt, state: createColorizeMaskState() }).ok).toBe(false);
    const bad = createColorizeMaskState([hint("x", "not-a-color", 2, 4)]);
    expect(applyStudioColorizeMask({ lineArt, state: bad }).ok).toBe(false);
  });
});
