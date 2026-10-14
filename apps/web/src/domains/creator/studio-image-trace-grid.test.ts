import { describe, expect, it } from "vitest";

import {
  buildStudioImageTraceLuminanceGrid,
  computeStudioImageTraceGridJob,
  studioImageTraceLuma,
} from "./studio-image-trace-grid";
import { studioImageTracePreset } from "./studio-image-trace";

function rgba(pixels: ReadonlyArray<readonly [number, number, number, number]>): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b, a], index) => {
    data[index * 4] = r;
    data[index * 4 + 1] = g;
    data[index * 4 + 2] = b;
    data[index * 4 + 3] = a;
  });
  return data;
}

const BLACK = [0, 0, 0, 255] as const;
const WHITE = [255, 255, 255, 255] as const;
const RED = [255, 0, 0, 255] as const;
const GREEN = [0, 255, 0, 255] as const;
const BLUE = [0, 0, 255, 255] as const;

describe("studioImageTraceLuma — BT.709 계수", () => {
  it("원색 휘도가 트레이스 모듈의 레이어 판정과 같은 값이다", () => {
    expect(Math.round(studioImageTraceLuma(255, 0, 0))).toBe(54);
    expect(Math.round(studioImageTraceLuma(0, 255, 0))).toBe(182);
    expect(Math.round(studioImageTraceLuma(0, 0, 255))).toBe(18);
    expect(Math.round(studioImageTraceLuma(255, 255, 255))).toBe(255);
    expect(Math.round(studioImageTraceLuma(0, 0, 0))).toBe(0);
  });
});

describe("buildStudioImageTraceLuminanceGrid", () => {
  it("RGBA 를 행 우선 명도 격자로 바꾼다", () => {
    const grid = buildStudioImageTraceLuminanceGrid(rgba([RED, GREEN, BLUE, WHITE]), 2, 2);
    expect(grid).not.toBeNull();
    expect(grid!.width).toBe(2);
    expect(grid!.height).toBe(2);
    expect([...grid!.luminance]).toEqual([54, 182, 18, 255]);
  });

  it("알파는 휘도에 반영하지 않는다", () => {
    const grid = buildStudioImageTraceLuminanceGrid(rgba([[255, 255, 255, 0]]), 1, 1);
    expect(grid!.luminance[0]).toBe(255);
  });

  it("차원이 0 이하이거나 버퍼가 부족하면 null 이다", () => {
    expect(buildStudioImageTraceLuminanceGrid(rgba([BLACK]), 0, 1)).toBeNull();
    expect(buildStudioImageTraceLuminanceGrid(rgba([BLACK]), 1, 0)).toBeNull();
    expect(buildStudioImageTraceLuminanceGrid(rgba([BLACK]), 2, 2)).toBeNull();
  });

  it("입력 배열을 변형하지 않는다", () => {
    const data = rgba([RED, BLUE]);
    const before = [...data];
    buildStudioImageTraceLuminanceGrid(data, 2, 1);
    expect([...data]).toEqual(before);
  });
});

describe("computeStudioImageTraceGridJob — 격자 + 레이어 한 패스", () => {
  it("선화 프리셋: 어두운 픽셀만 단색 레이어가 되고 격자와 정합한다", () => {
    const job = computeStudioImageTraceGridJob(
      rgba([BLACK, WHITE, BLACK, WHITE]),
      2,
      2,
      studioImageTracePreset("lineart"),
    );
    expect(job).not.toBeNull();
    expect([...job!.grid.luminance]).toEqual([0, 255, 0, 255]);
    expect(job!.layers).toHaveLength(1);
    expect([...job!.layers[0]!.mask]).toEqual([255, 0, 255, 0]);
    expect(job!.layers[0]!.color).toBe("#000000");
  });

  it("로고 프리셋: 두 색이 두 레이어로 나뉜다", () => {
    // 레이어당 8px — 최소 레이어 픽셀 수(STUDIO_IMAGE_TRACE_MIN_LAYER_PIXELS) 이상.
    const pixels = [
      ...Array.from({ length: 8 }, () => RED),
      ...Array.from({ length: 8 }, () => BLUE),
    ];
    const job = computeStudioImageTraceGridJob(
      rgba(pixels),
      4,
      4,
      studioImageTracePreset("logo"),
    );
    expect(job!.layers.map((layer) => layer.color).sort()).toEqual(["#0000ff", "#ff0000"]);
  });

  it("격자를 만들 수 없는 입력이면 null 이다", () => {
    expect(
      computeStudioImageTraceGridJob(rgba([BLACK]), 4, 4, studioImageTracePreset("logo")),
    ).toBeNull();
  });

  it("트레이싱할 영역이 없으면 레이어만 빈 배열이다(격자는 정상)", () => {
    const job = computeStudioImageTraceGridJob(
      rgba([WHITE, WHITE, WHITE, WHITE]),
      2,
      2,
      studioImageTracePreset("lineart"),
    );
    expect(job).not.toBeNull();
    expect(job!.layers).toEqual([]);
  });
});
