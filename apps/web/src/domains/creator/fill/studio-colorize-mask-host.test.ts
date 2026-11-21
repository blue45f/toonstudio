// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  COLORIZE_MASK_DEFAULT_PARAMS,
  createColorizeMaskState,
  isColorizeMaskStale,
  type ColorizeHintStroke,
} from "../studio-colorize-mask";

import {
  bakeStudioColorizeMaskWithSmartGap,
  createColorizeHintStrokeFromPoints,
  createStudioColorizeMaskHostCommands,
  normalizeHintColorHex,
  StudioColorizeMaskHostSection,
  type StudioColorizeImageEl,
} from "./studio-colorize-mask-host";

import type { AdvancedFillImageDataLike, AdvancedFillRgba } from "../studio-advanced-fill";
import type { El } from "../studio-element-model";

const WHITE: AdvancedFillRgba = [255, 255, 255, 255];
const BLACK: AdvancedFillRgba = [0, 0, 0, 255];
const RED: AdvancedFillRgba = [255, 0, 0, 255];
const BLUE: AdvancedFillRgba = [0, 0, 255, 255];
const TRANSPARENT: AdvancedFillRgba = [0, 0, 0, 0];

function pixelAt(image: AdvancedFillImageDataLike, x: number, y: number): AdvancedFillRgba {
  const off = (y * image.width + x) * 4;
  return [image.data[off]!, image.data[off + 1]!, image.data[off + 2]!, image.data[off + 3]!];
}

function makeDiagonalGapLineArt(): AdvancedFillImageDataLike {
  const width = 14;
  const height = 14;
  const data = new Uint8ClampedArray(width * height * 4);
  const setBlack = (x: number, y: number) => {
    const off = (y * width + x) * 4;
    data[off] = 0;
    data[off + 1] = 0;
    data[off + 2] = 0;
    data[off + 3] = 255;
  };
  // 다이아몬드 형태 윤곽선 — (6, 3)에 45° 대각선 1px 틈을 남김
  for (let x = 2; x <= 5; x += 1) setBlack(x, 2);
  setBlack(7, 4);
  setBlack(8, 5);
  for (let y = 5; y <= 10; y += 1) setBlack(8, y);
  for (let x = 2; x <= 8; x += 1) setBlack(x, 10);
  for (let y = 2; y <= 10; y += 1) setBlack(2, y);
  return { width, height, data };
}

function makeSplitBoxWithPinhole(): AdvancedFillImageDataLike {
  const width = 14;
  const height = 12;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data.set(WHITE, (y * width + x) * 4);
    }
  }
  // 외곽 테두리 + 세로 분리선(x=7)
  for (let x = 1; x <= 12; x += 1) {
    data.set(BLACK, (1 * width + x) * 4);
    data.set(BLACK, (10 * width + x) * 4);
  }
  for (let y = 1; y <= 10; y += 1) {
    data.set(BLACK, (y * width + 1) * 4);
    data.set(BLACK, (y * width + 7) * 4);
    data.set(BLACK, (y * width + 12) * 4);
  }
  // 왼쪽 영역 내부에 허용 오차를 넘지만 선화는 아닌 2px 미세 구멍(핀홀) 배치
  for (const px of [4, 5]) {
    const off = (5 * width + px) * 4;
    data[off] = 240;
    data[off + 1] = 240;
    data[off + 2] = 240;
    data[off + 3] = 170;
  }
  return { width, height, data };
}

function hint(
  id: string,
  colorHex: string,
  x: number,
  y: number,
  extra?: Partial<ColorizeHintStroke>,
): ColorizeHintStroke {
  return { id, colorHex, points: [{ x, y }], radiusPx: 1, ...extra };
}

function makeSelectedLineArtEl(extra?: Partial<StudioColorizeImageEl>): StudioColorizeImageEl {
  return {
    id: "lineart-1",
    type: "image",
    src: "data:image/png;base64,lineart",
    x: 10,
    y: 20,
    width: 14,
    height: 14,
    rotation: 0,
    opacity: 1,
    name: "선화",
    ...extra,
  };
}

describe("bakeStudioColorizeMaskWithSmartGap — 8방향 대각선 갭 밀폐 + 핀홀 흡수", () => {
  it("45° 대각선 틈이 있는 선화에서 외부로 새지 않고 내부만 정확히 채색하며 원본 선화를 변경하지 않는다", () => {
    const lineArt = makeDiagonalGapLineArt();
    const before = new Uint8ClampedArray(lineArt.data);
    const state = createColorizeMaskState(
      [hint("inside", "#ff0000", 4, 6)],
      { ...COLORIZE_MASK_DEFAULT_PARAMS, gapCloseHintPx: 3 },
    );

    const baked = bakeStudioColorizeMaskWithSmartGap({
      lineArt,
      state,
      smartGap: {
        enableDiagonalGapSeal: true,
        expandPx: 0,
        fillIsolatedPinholesMaxArea: 0,
      },
    });

    expect(baked.ok).toBe(true);
    if (!baked.ok) return;
    expect(baked.sealedGapCount).toBeGreaterThan(0);
    expect(pixelAt(baked.imageData, 4, 6)).toEqual(RED);
    // 외부 모서리 (0,0)은 8방향 대각선 갭 밀폐 덕분에 새지 않는다.
    expect(pixelAt(baked.imageData, 0, 0)).toEqual(TRANSPARENT);
    // 원본 선화 버퍼 불변 보장
    expect(lineArt.data).toEqual(before);
  });

  it("두 영역을 각 힌트 색으로 칠하고 내부 고립 미세 구멍(pinhole)을 자동 흡수한다", () => {
    const lineArt = makeSplitBoxWithPinhole();
    const state = createColorizeMaskState(
      [
        hint("left", "#ff0000", 3, 4),
        hint("right", "#0000ff", 10, 4),
      ],
      { ...COLORIZE_MASK_DEFAULT_PARAMS, gapCloseHintPx: 2 },
    );

    const baked = bakeStudioColorizeMaskWithSmartGap({
      lineArt,
      state,
      smartGap: {
        enableDiagonalGapSeal: true,
        fillIsolatedPinholesMaxArea: 8,
        expandPx: 0,
        colorTolerance: 10,
      },
    });

    expect(baked.ok).toBe(true);
    if (!baked.ok) return;
    expect(baked.paintedRegionCount).toBe(2);
    expect(baked.absorbedPinholeCount).toBe(2);
    expect(pixelAt(baked.imageData, 4, 5)).toEqual(RED);
    expect(pixelAt(baked.imageData, 10, 4)).toEqual(BLUE);
    expect(pixelAt(baked.imageData, 7, 4)).toEqual(TRANSPARENT);
    expect(isColorizeMaskStale(baked.nextMaskState)).toBe(false);
  });

  it("투명 힌트 획은 해당 영역을 비우고, 힌트가 없으면 fail-closed로 거절한다", () => {
    const lineArt = makeSplitBoxWithPinhole();
    const emptyRes = bakeStudioColorizeMaskWithSmartGap({
      lineArt,
      state: createColorizeMaskState(),
    });
    expect(emptyRes.ok).toBe(false);

    const withTransparent = createColorizeMaskState(
      [
        hint("left", "#ff0000", 3, 4),
        hint("right-clear", "#0000ff", 10, 4, { transparent: true }),
      ],
      { ...COLORIZE_MASK_DEFAULT_PARAMS, gapCloseHintPx: 2 },
    );
    const baked = bakeStudioColorizeMaskWithSmartGap({
      lineArt,
      state: withTransparent,
      smartGap: { expandPx: 0 },
    });
    expect(baked.ok).toBe(true);
    if (!baked.ok) return;
    expect(pixelAt(baked.imageData, 3, 4)).toEqual(RED);
    expect(pixelAt(baked.imageData, 10, 4)).toEqual(TRANSPARENT);
  });
});

describe("createStudioColorizeMaskHostCommands — 호스트 문서 커맨드 배선", () => {
  it("마스크 추가·힌트 기록·굽기 시 선화 위 새 채색 레이어를 원자 커밋하고 선택한다", async () => {
    const lineArt = makeDiagonalGapLineArt();
    let selected: StudioColorizeImageEl = makeSelectedLineArtEl();
    let elements: El[] = [selected];
    const patchEl = vi.fn((id: string, patch: Partial<El>) => {
      if (id === selected.id) {
        selected = { ...selected, ...patch } as StudioColorizeImageEl;
        elements = [selected];
      }
    });
    const commit = vi.fn((next: El[]) => {
      elements = next;
      return true;
    });
    const setSelectedId = vi.fn();

    const makeHost = () =>
      createStudioColorizeMaskHostCommands({
        selected,
        elements,
        patchEl,
        commit,
        setSelectedId,
        createId: () => "baked-layer-99",
        decodeSource: vi.fn(async () => lineArt),
        encodePng: vi.fn(() => "data:image/png;base64,baked-mask-png"),
      });

    makeHost().addMask();
    expect(selected.colorizeMask).toBeDefined();
    expect(selected.colorizeMaskEnabled).toBe(true);

    const stroke = createColorizeHintStrokeFromPoints([{ x: 4, y: 6 }], {
      id: "stroke-1",
      colorHex: normalizeHintColorHex("#f00"),
      radiusPx: 2,
    });
    expect(stroke).not.toBeNull();
    makeHost().appendHintStroke(stroke!);
    expect(selected.colorizeMask?.hints).toHaveLength(1);

    const bakeRes = await makeHost().bakeMask(selected.src, {
      enableDiagonalGapSeal: true,
      expandPx: 0,
    });
    expect(bakeRes.ok).toBe(true);
    if (!bakeRes.ok) return;
    expect(bakeRes.createdElementId).toBe("baked-layer-99");
    expect(bakeRes.sealedGapCount).toBeGreaterThan(0);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(elements).toHaveLength(2);
    expect(elements[1]?.id).toBe("baked-layer-99");
    expect(elements[1]?.type).toBe("image");
    expect(elements[1]?.name).toBe("선화 채색 마스크");
    expect(setSelectedId).toHaveBeenCalledWith("baked-layer-99");
    // 원본 선화 레이어 src는 무손상이고 colorizeMask bakedRevision이 갱신됨
    const updatedLineArt = elements[0] as StudioColorizeImageEl;
    expect(updatedLineArt.src).toBe("data:image/png;base64,lineart");
    expect(isColorizeMaskStale(updatedLineArt.colorizeMask!)).toBe(false);
  });
});

describe("StudioColorizeMaskHostSection — 인스펙터 마운트 & 캔버스 힌트 연동", () => {
  afterEach(() => {
    cleanup();
  });

  it("마스크 추가 → 캔버스 시드 수신 → 채색하기 버튼으로 새 채색 레이어를 커밋한다", async () => {
    const lineArt = makeDiagonalGapLineArt();
    const initialEl = makeSelectedLineArtEl({
      colorizeMask: createColorizeMaskState([], { ...COLORIZE_MASK_DEFAULT_PARAMS, gapCloseHintPx: 3 }),
      colorizeMaskEnabled: true,
    });

    const patchEl = vi.fn<(id: string, patch: Partial<El>) => void>();
    const commit = vi.fn(() => true);
    const setSelectedId = vi.fn();
    const onArmCanvasHints = vi.fn();
    const onCanvasSeedHitConsumed = vi.fn();

    const decodeSource = vi.fn(async () => lineArt);
    const encodePng = vi.fn(() => "data:image/png;base64,section-baked");

    const { rerender } = render(
      createElement(StudioColorizeMaskHostSection, {
        selected: initialEl,
        imageSrc: initialEl.src,
        activeColor: "#ff0000",
        elements: [initialEl],
        patchEl,
        commit,
        setSelectedId,
        canvasArmed: false,
        onArmCanvasHints,
        onCanvasSeedHitConsumed,
        decodeSource,
        encodePng,
      }),
    );

    // 힌트 그리기 토글 무장
    fireEvent.click(screen.getByRole("button", { name: /힌트 그리기/u }));
    expect(onArmCanvasHints).toHaveBeenCalledWith(true);

    // 캔버스에서 시드 히트가 도착하면 힌트 획을 colorizeMask에 기록
    rerender(
      createElement(StudioColorizeMaskHostSection, {
        selected: initialEl,
        imageSrc: initialEl.src,
        activeColor: "#ff0000",
        elements: [initialEl],
        patchEl,
        commit,
        setSelectedId,
        canvasArmed: true,
        onArmCanvasHints,
        canvasSeedHit: { x: 4, y: 6, nonce: 1 },
        onCanvasSeedHitConsumed,
        decodeSource,
        encodePng,
      }),
    );

    await waitFor(() => {
      expect(patchEl).toHaveBeenCalled();
    });
    expect(onCanvasSeedHitConsumed).toHaveBeenCalledTimes(1);

    // 기록된 힌트가 반영된 상태로 재렌더 후 '채색하기' 실행
    const patchedState = patchEl.mock.calls[0]![1].colorizeMask;
    const withHintEl: StudioColorizeImageEl = { ...initialEl, colorizeMask: patchedState };
    rerender(
      createElement(StudioColorizeMaskHostSection, {
        selected: withHintEl,
        imageSrc: withHintEl.src,
        activeColor: "#ff0000",
        elements: [withHintEl],
        patchEl,
        commit,
        setSelectedId,
        canvasArmed: true,
        onArmCanvasHints,
        onCanvasSeedHitConsumed,
        decodeSource,
        encodePng,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "채색하기" }));
    await waitFor(() => {
      expect(commit).toHaveBeenCalledTimes(1);
    });
    expect(setSelectedId).toHaveBeenCalledTimes(1);
  });
});
