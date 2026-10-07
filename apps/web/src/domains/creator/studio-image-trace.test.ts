// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_IMAGE_TRACE_PRESETS,
  buildStudioImageTraceLayers,
  buildStudioImageTraceSvg,
  studioImageTracePreset,
  traceContoursToPieces,
  tracePathVerbsToContours,
  tracePieceToSvgPathData,
  traceStudioRasterImage,
} from "./studio-image-trace";
import type { El } from "./studio-element-model";

const selection = vi.hoisted(() => ({
  maskToPathIR: vi.fn(async (
    _mask: Uint8Array | Uint8ClampedArray,
    _width: number,
    _height: number,
    _simplifyEps?: number,
  ) => ({
    path: {
      verbs: [
        { v: "M" as const, x: 0.5, y: 0.5 },
        { v: "L" as const, x: 1.5, y: 0.5 },
        { v: "L" as const, x: 1.5, y: 1.5 },
        { v: "L" as const, x: 0.5, y: 1.5 },
        { v: "Z" as const },
      ],
    },
    fillRule: "evenodd" as const,
    contourCount: 1,
    holeCount: 0,
  })),
}));

vi.mock("./studio-opencv-selection", () => selection);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  selection.maskToPathIR.mockClear();
});

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
const BLUE = [0, 0, 255, 255] as const;
const CLEAR = [0, 0, 0, 0] as const;

describe("STUDIO_IMAGE_TRACE_PRESETS 카탈로그", () => {
  it("선화·로고·포스터 3종이 있고 id 가 유일하다", () => {
    const ids = STUDIO_IMAGE_TRACE_PRESETS.map((preset) => preset.id);
    expect(ids).toEqual(["lineart", "logo", "poster"]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of STUDIO_IMAGE_TRACE_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.maxColors).toBeGreaterThan(0);
    }
    expect(studioImageTracePreset("logo").maxColors).toBe(4);
  });
});

describe("buildStudioImageTraceLayers — 선화", () => {
  it("어두운 픽셀만 단색 레이어로 잡고 평균색을 낸다", () => {
    const data = rgba([BLACK, WHITE, BLACK, WHITE]);
    const layers = buildStudioImageTraceLayers(data, 2, 2, studioImageTracePreset("lineart"));
    expect(layers).toHaveLength(1);
    expect([...layers[0]!.mask]).toEqual([255, 0, 255, 0]);
    expect(layers[0]!.pixelCount).toBe(2);
    expect(layers[0]!.color).toBe("#000000");
  });

  it("잉크가 없으면 빈 배열이다", () => {
    const data = rgba([WHITE, WHITE, WHITE, WHITE]);
    expect(buildStudioImageTraceLayers(data, 2, 2, studioImageTracePreset("lineart"))).toEqual([]);
  });
});

describe("buildStudioImageTraceLayers — 다색 양자화", () => {
  it("두 색 이미지는 두 레이어로 나뉘고 투명 픽셀은 어디에도 속하지 않는다", () => {
    // 6x3: 빨강 9, 파랑 8, 투명 1
    const data = rgba([
      RED, RED, RED, BLUE, BLUE, BLUE,
      RED, RED, RED, BLUE, BLUE, BLUE,
      RED, RED, RED, BLUE, BLUE, CLEAR,
    ]);
    const layers = buildStudioImageTraceLayers(data, 6, 3, studioImageTracePreset("logo"));
    expect(layers).toHaveLength(2);
    const byColor = new Map(layers.map((layer) => [layer.color, layer]));
    expect(byColor.get("#ff0000")?.pixelCount).toBe(9);
    expect(byColor.get("#0000ff")?.pixelCount).toBe(8);
    const totalMasked = layers.reduce(
      (sum, layer) => sum + layer.mask.reduce((acc, value) => acc + (value === 255 ? 1 : 0), 0),
      0,
    );
    expect(totalMasked).toBe(17);
  });

  it("색이 프리셋 상한보다 많으면 레이어 수가 상한을 넘지 않고 모든 불투명 픽셀이 배정된다", () => {
    const colors = [
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
      [255, 255, 0, 255],
      [0, 255, 255, 255],
      [255, 0, 255, 255],
    ] as const;
    // 각 색 10픽셀씩 60픽셀 (10x6)
    const pixels = colors.flatMap((color) => Array.from({ length: 10 }, () => color));
    const data = rgba(pixels);
    const layers = buildStudioImageTraceLayers(data, 10, 6, studioImageTracePreset("logo"));
    expect(layers.length).toBeLessThanOrEqual(4);
    const totalMasked = layers.reduce((sum, layer) => sum + layer.pixelCount, 0);
    expect(totalMasked).toBe(60);
  });

  it("같은 입력은 항상 같은 출력이다(결정성)", () => {
    const data = rgba([RED, BLUE, RED, BLUE, BLUE, RED, CLEAR, RED]);
    const first = buildStudioImageTraceLayers(data, 4, 2, studioImageTracePreset("poster"));
    const second = buildStudioImageTraceLayers(data, 4, 2, studioImageTracePreset("poster"));
    expect(first.map((layer) => layer.color)).toEqual(second.map((layer) => layer.color));
    expect(first.map((layer) => [...layer.mask])).toEqual(second.map((layer) => [...layer.mask]));
  });
});

describe("tracePathVerbsToContours", () => {
  it("M/L/Z 서브패스를 닫힌 contour 로 나누고 Q/C 끝점을 잇는다", () => {
    const contours = tracePathVerbsToContours([
      { v: "M", x: 0, y: 0 },
      { v: "L", x: 10, y: 0 },
      { v: "Q", cx: 10, cy: 5, x: 10, y: 10 },
      { v: "Z" },
      { v: "M", x: 20, y: 20 },
      { v: "C", c1x: 25, c1y: 20, c2x: 30, c2y: 25, x: 30, y: 20 },
      { v: "L", x: 30, y: 30 },
      { v: "L", x: 20, y: 30 },
      { v: "Z" },
    ]);
    expect(contours).toHaveLength(2);
    expect(contours[0]).toEqual({ points: [0, 0, 10, 0, 10, 10], closed: true });
    expect(contours[1]!.points).toEqual([20, 20, 30, 20, 30, 30, 20, 30]);
  });

  it("점이 3개 미만인 서브패스는 버린다", () => {
    const contours = tracePathVerbsToContours([
      { v: "M", x: 0, y: 0 },
      { v: "L", x: 5, y: 5 },
      { v: "Z" },
    ]);
    expect(contours).toEqual([]);
  });
});

describe("traceContoursToPieces — 구멍(키홀) 처리", () => {
  it("바깥 사각형+안쪽 사각형은 구멍 1개짜리 조각 1개가 된다", () => {
    const result = traceContoursToPieces([
      { points: [0, 0, 100, 0, 100, 100, 0, 100], closed: true },
      { points: [25, 25, 75, 25, 75, 75, 25, 75], closed: true },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pieces).toHaveLength(1);
    const piece = result.pieces[0]!;
    expect(piece.holeCount).toBe(1);
    // 키홀: 바깥 링 4정점보다 길고, 첫 정점이 끝에 반복돼 닫힌다.
    expect(piece.points.length).toBeGreaterThan(10);
    expect(piece.points[0]).toBe(piece.points[piece.points.length - 2]);
    expect(piece.points[1]).toBe(piece.points[piece.points.length - 1]);
    expect(piece.bounds).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });

  it("빈 contour 는 사유와 함께 실패한다", () => {
    const result = traceContoursToPieces([]);
    expect(result.ok).toBe(false);
  });
});

describe("SVG 조립", () => {
  it("조각 → path data 는 M 으로 시작해 Z 로 닫힌다", () => {
    const traced = traceContoursToPieces([
      { points: [0, 0, 10, 0, 10, 10, 0, 10], closed: true },
    ]);
    expect(traced.ok).toBe(true);
    if (!traced.ok) return;
    const pathData = tracePieceToSvgPathData(traced.pieces[0]!);
    expect(pathData.startsWith("M ")).toBe(true);
    expect(pathData.endsWith("Z")).toBe(true);
    expect(pathData).toContain("L ");
  });

  it("buildStudioImageTraceSvg 는 레이어 색을 fill 로 가진 svg 문서를 만든다", () => {
    const svg = buildStudioImageTraceSvg(
      [{ color: "#ff0000", pathData: "M 0 0 L 10 0 L 10 10 Z" }],
      { x: 0, y: 0, width: 10, height: 10 },
    );
    expect(svg).toContain("<svg");
    expect(svg).toContain('viewBox="0 0 10 10"');
    expect(svg).toContain('fill="#ff0000"');
  });
});

describe("traceStudioRasterImage 브리지", () => {
  it("레이어마다 maskToPathIR 를 호출하고 채움 DrawEl 과 SVG 를 돌려준다", async () => {
    class ImageMock {
      decoding = "";
      crossOrigin: string | null = null;
      naturalWidth = 8;
      naturalHeight = 4;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("Image", ImageMock);

    // 8x4: 왼쪽 절반 검정 16px + 오른쪽 절반 흰색 16px
    const pixels = new Uint8ClampedArray(8 * 4 * 4);
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const offset = (y * 8 + x) * 4;
        const value = x < 4 ? 0 : 255;
        pixels[offset] = value;
        pixels[offset + 1] = value;
        pixels[offset + 2] = value;
        pixels[offset + 3] = 255;
      }
    }
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: pixels })),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((
      ((kind: string) => kind === "2d" ? context : null) as typeof HTMLCanvasElement.prototype.getContext
    ));

    const image = {
      id: "image-9",
      type: "image",
      src: "data:image/png;base64,AA==",
      x: 10,
      y: 20,
      width: 200,
      height: 100,
      rotation: 0,
      opacity: 0.9,
      name: "로고 원본",
    } as Extract<El, { type: "image" }>;

    const result = await traceStudioRasterImage(image.src, image, "logo");
    // 로고 프리셋: 검정·흰색 2레이어 → 레이어당 1회씩 호출.
    expect(selection.maskToPathIR).toHaveBeenCalledTimes(2);
    expect(result.layerCount).toBe(2);
    expect(result.elements.length).toBeGreaterThanOrEqual(2);
    const fills = result.elements.map((element) => element.fill);
    expect(fills).toContain("#000000");
    expect(fills).toContain("#ffffff");
    for (const element of result.elements) {
      expect(element).toMatchObject({ type: "draw", kind: "freehand", mode: "pen", opacity: 0.9 });
      expect(element.name).toContain("트레이싱 로고");
    }
    expect(result.svg).toContain("<svg");
    expect(result.svg).toContain('fill="#000000"');
  });
});
