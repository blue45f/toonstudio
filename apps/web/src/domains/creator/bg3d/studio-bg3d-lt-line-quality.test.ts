/**
 * 선화 품질(S7) 시험: 연속 선 폭, 가려진 선 제거, 내부선 억제.
 *
 * 입력은 모두 작은 합성 배열(ImageData 와 같은 RGBA 바이트, Float32 깊이)이고 실시계에 의존하지 않는다.
 * 정의와 한계는 docs/features/bg3d-lineart-quality.md 에 있다.
 */
import { describe, expect, it } from "vitest";

import { STUDIO_BG3D_LT_LINE_RECEPTIVE_FIELD_PX } from "./studio-bg3d-lt-line-response";
import {
  renderStudioBg3dLtLayers,
  type StudioBg3dLtRasterInput,
  type StudioBg3dLtRenderResult,
  type StudioBg3dLtRenderSettings,
} from "./studio-bg3d-lt-render";
import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  type StudioBg3dLineOutputSettings,
} from "./studio-bg3d-scene-document";
import { STUDIO_BG3D_TILE_HALO } from "./studio-bg3d-tile-plan";

/**
 * 선만 보이도록 베이스를 끄고, 응답이 포화하도록 강도·정밀도를 최대로 둔 기본 설정. 폭은 문서 기본값이 바뀌어도 이 시험의
 * 고정 픽셀 수치가 흔들리지 않도록 1px 로 못 박는다(폭을 시험하는 곳은 `widthPx` 를 직접 준다).
 */
function settings(line: Partial<StudioBg3dLineOutputSettings> = {}): StudioBg3dLtRenderSettings {
  return {
    line: {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.line,
      widthPx: 1,
      strength: 1,
      accuracy: 1,
      smoothing: 0,
      textureLineEnabled: false,
      ...line,
    },
    tone: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.tone, mode: "none", type: "grayscale" },
  };
}

function layer(result: StudioBg3dLtRenderResult, role: "main-line" | "texture-line") {
  return result.layers.find((candidate) => candidate.role === role);
}

function alphaRow(data: Uint8ClampedArray, width: number, row: number): number[] {
  return Array.from({ length: width }, (_, x) => data[(row * width + x) * 4 + 3]!);
}

/** 한 행의 잉크 합(px) = 그 행을 가로지르는 선의 두께. */
function thickness(data: Uint8ClampedArray, width: number, row: number): number {
  return alphaRow(data, width, row).reduce((sum, alpha) => sum + alpha / 255, 0);
}

const WIDE = 41;
const TALL = 21;

function pixels(
  width: number,
  height: number,
  sample: (x: number, y: number) => readonly [number, number, number, number]
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) rgba.set(sample(x, y), (y * width + x) * 4);
  }
  return rgba;
}

/** 휘도 계단: 왼쪽 어두움, 오른쪽 밝음. 가운데 열(20)에서 갈린다. */
function luminanceStep(): StudioBg3dLtRasterInput {
  return {
    width: WIDE,
    height: TALL,
    rgba: pixels(WIDE, TALL, (x) => (x < 20 ? [16, 16, 16, 255] : [240, 240, 240, 255])),
  };
}

/** 알파 윤곽: 왼쪽은 투명, 오른쪽은 단색 불투명. 휘도 경계는 없다. */
function silhouetteStep(): StudioBg3dLtRasterInput {
  return {
    width: WIDE,
    height: TALL,
    rgba: pixels(WIDE, TALL, (x) => [128, 128, 128, x < 20 ? 0 : 255]),
  };
}

/** 깊이 윤곽: 색은 단색이고 깊이만 20 열에서 갈린다(왼쪽이 가깝다). */
function depthStep(): StudioBg3dLtRasterInput {
  const depth = new Float32Array(WIDE * TALL);
  for (let y = 0; y < TALL; y += 1) {
    for (let x = 0; x < WIDE; x += 1) depth[y * WIDE + x] = x < 20 ? 0.25 : 0.75;
  }
  return {
    width: WIDE,
    height: TALL,
    rgba: pixels(WIDE, TALL, () => [128, 128, 128, 255]),
    depth,
  };
}

const THICKNESS_CASES = [
  { name: "휘도 경계", input: luminanceStep, line: {} },
  { name: "알파 윤곽(물체 안쪽으로만 그려진다)", input: silhouetteStep, line: {} },
  {
    name: "깊이 윤곽",
    input: depthStep,
    line: { depthEnabled: true, depthOutlineOnly: true, depthStrength: 1, exteriorOutlineStrength: 0 },
  },
] as const;

describe("선 폭: 슬라이더 값이 곧 픽셀 두께다", () => {
  it.each(THICKNESS_CASES)(
    "$name 의 평균 선 두께가 1.0/1.5/2.0/3.0px 에서 단조 증가하고 설정값과 같다",
    ({ input, line }) => {
      const widths = [1, 1.5, 2, 3] as const;
      const measured = widths.map((widthPx) => {
        const main = layer(renderStudioBg3dLtLayers(input(), settings({ widthPx, ...line })), "main-line");
        expect(main).toBeDefined();
        // 모든 행이 같다(축 정렬 경계라 행마다 두께가 흔들리지 않는다).
        const middle = thickness(main!.data, WIDE, 10);
        for (const row of [3, 7, 14, 17]) expect(thickness(main!.data, WIDE, row)).toBeCloseTo(middle, 6);
        return middle;
      });
      for (let index = 1; index < measured.length; index += 1) {
        expect(measured[index]!).toBeGreaterThan(measured[index - 1]!);
      }
      // 허용오차 ±0.05px: 가장자리 픽셀 농도를 0..255 정수로 양자화하는 오차만 남는다.
      widths.forEach((widthPx, index) => expect(measured[index]!).toBeCloseTo(widthPx, 1));
    }
  );

  it.each(THICKNESS_CASES)(
    "$name: 폭을 0.1px 씩 올리면 두께가 매번 늘어난다(예전에는 5단계로 끊겼다)",
    ({ input, line }) => {
      const grid = Array.from({ length: 21 }, (_, step) => Math.round((1 + step * 0.1) * 10) / 10);
      const measured = grid.map((widthPx) =>
        thickness(
          layer(renderStudioBg3dLtLayers(input(), settings({ widthPx, ...line })), "main-line")!.data,
          WIDE,
          10
        )
      );
      for (let index = 1; index < measured.length; index += 1) {
        expect(measured[index]!).toBeGreaterThan(measured[index - 1]!);
        // 한 칸(0.1px) 사이 두께 변화도 0.1px 근처다. 정수 단계로 도약하지 않는다.
        expect(measured[index]! - measured[index - 1]!).toBeLessThan(0.16);
      }
    }
  );

  it("1px 미만도 결과를 바꾼다: 선이 얇아지는 대신 옅어진다", () => {
    const thicknessAt = (widthPx: number) =>
      thickness(
        layer(renderStudioBg3dLtLayers(luminanceStep(), settings({ widthPx })), "main-line")!.data,
        WIDE,
        10
      );
    expect(thicknessAt(0.25)).toBeCloseTo(0.25, 1);
    expect(thicknessAt(0.5)).toBeCloseTo(0.5, 1);
    expect(thicknessAt(0.75)).toBeCloseTo(0.75, 1);
    const half = layer(renderStudioBg3dLtLayers(luminanceStep(), settings({ widthPx: 0.5 })), "main-line")!;
    // 위치는 그대로(휘도 계단 19|20 의 다음 픽셀, 20 열)이고 농도만 폭에 비례한다.
    expect(alphaRow(half.data, WIDE, 10).filter((alpha) => alpha > 0)).toEqual([128]);
    expect(half.data[(10 * WIDE + 20) * 4 + 3]).toBe(128);
  });

  it("pins the exact cross-section pixels of a hard luminance step", () => {
    const section = (widthPx: number) =>
      alphaRow(
        layer(renderStudioBg3dLtLayers(luminanceStep(), settings({ widthPx })), "main-line")!.data,
        WIDE,
        10
      ).slice(18, 25);
    // 19|20 열 사이 경계의 능선은 20 열(동점은 다음 픽셀)이고, 열 18..24 의 값이다.
    expect(section(1)).toEqual([0, 0, 255, 0, 0, 0, 0]);
    expect(section(1.5)).toEqual([0, 64, 255, 64, 0, 0, 0]);
    expect(section(2)).toEqual([0, 128, 255, 128, 0, 0, 0]);
    expect(section(3)).toEqual([0, 255, 255, 255, 0, 0, 0]);
    expect(section(4)).toEqual([128, 255, 255, 255, 128, 0, 0]);
  });

  it("draws an alpha silhouette inward so its visible thickness equals the setting", () => {
    const main = (widthPx: number) =>
      layer(renderStudioBg3dLtLayers(silhouetteStep(), settings({ widthPx })), "main-line")!;
    // 투명 쪽(0..19 열)은 비어 있고 불투명 첫 열(20)부터 안쪽으로만 그려진다.
    expect(alphaRow(main(1).data, WIDE, 10).slice(18, 24)).toEqual([0, 0, 255, 0, 0, 0]);
    expect(alphaRow(main(3).data, WIDE, 10).slice(18, 25)).toEqual([0, 0, 255, 255, 255, 0, 0]);
    expect(alphaRow(main(2.5).data, WIDE, 10).slice(18, 25)).toEqual([0, 0, 255, 255, 128, 0, 0]);
    for (const widthPx of [1, 2, 3, 5, 8]) {
      expect(thickness(main(widthPx).data, WIDE, 10)).toBeCloseTo(widthPx, 1);
      expect(alphaRow(main(widthPx).data, WIDE, 10).slice(0, 20).every((alpha) => alpha === 0)).toBe(true);
    }
  });

  describe("안티앨리어싱된 알파 윤곽: 실제 캡처의 가장자리는 1~2픽셀 경사다", () => {
    /** 20 열부터 `ramp` 의 알파(0..1)가 이어지고 그 뒤는 불투명이다. 왼쪽은 투명. */
    function rampSilhouette(ramp: readonly number[]): StudioBg3dLtRasterInput {
      return {
        width: WIDE,
        height: TALL,
        rgba: pixels(WIDE, TALL, (x) => {
          const offset = x - 20;
          const alpha = offset < 0 ? 0 : offset < ramp.length ? ramp[offset]! : 1;
          return [128, 128, 128, Math.round(alpha * 255)];
        }),
      };
    }

    function ink(ramp: readonly number[], widthPx: number): number {
      const main = layer(renderStudioBg3dLtLayers(rampSilhouette(ramp), settings({ widthPx })), "main-line");
      return main ? thickness(main.data, WIDE, 10) : 0;
    }

    // 변경 전 알고리즘은 경사 반응을 포화시켜 경사가 넓을수록 선이 굵어졌다: 폭 1 에서 경계 알파 0.5 이면 1.50px,
    // 2픽셀 경사면 2.00px, 3픽셀 경사면 2.50px. 반응을 경사에 비례하게 쓰면 (반응 × 불투명도)의 합이 경사 모양과
    // 무관하게 정확히 폭이 된다.
    it.each([0.2, 0.5, 0.8])("경사 1px(경계 알파 %s)에서 폭 0.5/1/2/3/5 의 두께가 설정과 같다", (edgeAlpha) => {
      for (const widthPx of [0.5, 1, 2, 3, 5]) {
        expect(ink([edgeAlpha], widthPx), `a=${edgeAlpha} w=${widthPx}`).toBeCloseTo(widthPx, 1);
      }
    });

    it("keeps fractional widths within a quarter pixel below the setting on a one pixel ramp", () => {
      for (const edgeAlpha of [0.2, 0.5, 0.8]) {
        for (const widthPx of [1.5, 2.5]) {
          const measured = ink([edgeAlpha], widthPx);
          expect(measured, `a=${edgeAlpha} w=${widthPx}`).toBeLessThanOrEqual(widthPx + 0.02);
          expect(measured, `a=${edgeAlpha} w=${widthPx}`).toBeGreaterThanOrEqual(widthPx - 0.25);
        }
      }
    });

    it("is exact at width 1 for ramps of any shape and never exceeds the setting on wider ones", () => {
      const ramps = [[0.3, 0.7], [0.5, 0.9], [0.25, 0.5, 0.75]] as const;
      for (const ramp of ramps) {
        expect(ink(ramp, 1), `ramp=${ramp.join("/")}`).toBeCloseTo(1, 1);
        for (const widthPx of [2, 3]) {
          const measured = ink(ramp, widthPx);
          expect(measured, `ramp=${ramp.join("/")} w=${widthPx}`).toBeLessThanOrEqual(widthPx + 0.02);
        }
      }
      // 한계: 경사가 2픽셀이면 설정의 75% 이상, 3픽셀이면 폭이 커질수록 더 얇아진다(폭 3 에서 2.00px).
      expect(ink([0.3, 0.7], 3)).toBeGreaterThanOrEqual(0.75 * 3);
      expect(ink([0.3, 0.7], 2)).toBeGreaterThanOrEqual(0.75 * 2);
      expect(ink([0.25, 0.5, 0.75], 3)).toBeCloseTo(2, 1);
    });

    it("grows with the width on every ramp (continuous and monotonic)", () => {
      for (const ramp of [[0.5], [0.3, 0.7], [0.25, 0.5, 0.75]] as const) {
        const grid = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];
        const measured = grid.map((widthPx) => ink(ramp, widthPx));
        for (let index = 1; index < measured.length; index += 1) {
          expect(measured[index]!, `ramp=${ramp.join("/")}`).toBeGreaterThan(measured[index - 1]!);
        }
      }
    });
  });

  describe("비스듬한 경계(축 정렬이 아닌 선): 두께가 설정보다 얼마나 더 나오는가", () => {
    const SIZE = 160;
    const MARGIN = 30;

    /** 이미지 중앙을 지나는 반평면 계단(안티앨리어싱 없음). `degrees` 는 경계선의 방향이다. */
    function obliqueStep(degrees: number): StudioBg3dLtRasterInput {
      const radians = (degrees * Math.PI) / 180;
      const normalX = Math.sin(radians);
      const normalY = -Math.cos(radians);
      const center = SIZE / 2;
      return {
        width: SIZE,
        height: SIZE,
        rgba: pixels(SIZE, SIZE, (x, y) =>
          (x - center) * normalX + (y - center) * normalY > 0 ? [240, 240, 240, 255] : [16, 16, 16, 255]
        ),
      };
    }

    /**
     * 이미지 중앙을 지나는 반평면 알파 실루엣(4x4 슈퍼샘플로 안티앨리어싱, 색은 단색이라 휘도 경계는 없다). 실제 캡처의
     * 가장자리처럼 알파가 1~2픽셀 경사다.
     */
    function obliqueAlphaSilhouette(degrees: number): StudioBg3dLtRasterInput {
      const radians = (degrees * Math.PI) / 180;
      const normalX = Math.sin(radians);
      const normalY = -Math.cos(radians);
      const center = SIZE / 2;
      const samples = 4;
      return {
        width: SIZE,
        height: SIZE,
        rgba: pixels(SIZE, SIZE, (x, y) => {
          let covered = 0;
          for (let sy = 0; sy < samples; sy += 1) {
            for (let sx = 0; sx < samples; sx += 1) {
              const px = x + (sx + 0.5) / samples - 0.5;
              const py = y + (sy + 0.5) / samples - 0.5;
              if ((px - center) * normalX + (py - center) * normalY > 0) covered += 1;
            }
          }
          return [128, 128, 128, Math.round((255 * covered) / (samples * samples))];
        }),
      };
    }

    /** 가장자리 영향을 피해 중앙 창 안의 잉크 합을 그 창을 지나는 경계선 길이로 나눈 평균 두께. */
    function meanThickness(
      degrees: number,
      widthPx: number,
      source: (degrees: number) => StudioBg3dLtRasterInput = obliqueStep
    ): number {
      const radians = (degrees * Math.PI) / 180;
      const data = layer(renderStudioBg3dLtLayers(source(degrees), settings({ widthPx })), "main-line")!.data;
      let ink = 0;
      for (let y = MARGIN; y < SIZE - MARGIN; y += 1) {
        for (let x = MARGIN; x < SIZE - MARGIN; x += 1) ink += data[(y * SIZE + x) * 4 + 3]! / 255;
      }
      const half = SIZE / 2 - MARGIN;
      const reach = Math.min(
        Math.abs(Math.cos(radians)) < 1e-9 ? Infinity : half / Math.abs(Math.cos(radians)),
        Math.abs(Math.sin(radians)) < 1e-9 ? Infinity : half / Math.abs(Math.sin(radians))
      );
      return ink / (2 * reach);
    }

    // 한 픽셀 중심선(비최대 억제)이 비스듬한 경계에서는 계단 모양이 되어 축 정렬보다 굵다. 초과량의 상한을 고정한다.
    // 측정값(2026-10-16, 이 합성 계단): 22.5° +0.11~+0.22px, 30° +0.22~+0.43px, 45° +0.58~+0.78px.
    // 같은 입력에서 변경 전 렌더러는 폭 1 설정에서 22.5° 2.61px, 45° 2.80px 였다.
    it.each([
      { degrees: 0, maxExcess: 0.02 },
      { degrees: 90, maxExcess: 0.02 },
      { degrees: 22.5, maxExcess: 0.3 },
      { degrees: 30, maxExcess: 0.5 },
      { degrees: 45, maxExcess: 0.9 },
    ])("$degrees° 경계의 두께는 설정 이상이고 초과량이 $maxExcess px 이내다", ({ degrees, maxExcess }) => {
      for (const widthPx of [1, 1.5, 2, 3]) {
        const measured = meanThickness(degrees, widthPx);
        expect(measured, `${degrees}° w=${widthPx}`).toBeGreaterThanOrEqual(widthPx - 0.02);
        expect(measured, `${degrees}° w=${widthPx}`).toBeLessThanOrEqual(widthPx + maxExcess);
      }
    });

    // 안티앨리어싱된 알파 실루엣은 사선에서도 부풀지 않는다: 알파 경사에 비례하는 반응의 (반응 × 불투명도) 합이 경사 모양과
    // 무관하게 폭이기 때문이다. 측정값(2026-10-16): 폭 1 → 1.00~1.05, 폭 2 → 1.90~2.00, 폭 3 → 2.90~3.03.
    // 변경 전 렌더러는 같은 입력에서 폭 1 → 1.41~1.64, 폭 2·3 → 2.50~3.01 이었다.
    it("keeps the thickness within a tenth of a pixel on slanted anti-aliased alpha silhouettes", () => {
      for (const degrees of [0, 10, 22.5, 30, 45, 60, 67.5, 90]) {
        for (const widthPx of [1, 2, 3]) {
          const measured = meanThickness(degrees, widthPx, obliqueAlphaSilhouette);
          expect(measured, `${degrees}° w=${widthPx}`).toBeGreaterThanOrEqual(widthPx - 0.15);
          expect(measured, `${degrees}° w=${widthPx}`).toBeLessThanOrEqual(widthPx + 0.1);
        }
      }
    });

    it("keeps the width monotonic on the worst-case 45° edge", () => {
      const widths = [1, 1.5, 2, 3, 4, 5];
      const measured = widths.map((widthPx) => meanThickness(45, widthPx));
      for (let index = 1; index < measured.length; index += 1) {
        expect(measured[index]!).toBeGreaterThan(measured[index - 1]!);
      }
    });
  });

  it("changes the layer when the width changes by a fraction of a pixel", () => {
    const at = (widthPx: number) =>
      layer(renderStudioBg3dLtLayers(luminanceStep(), settings({ widthPx })), "main-line")!.data;
    expect(at(1.0)).not.toEqual(at(1.1));
    expect(at(2.0)).not.toEqual(at(2.1));
    expect(at(3.0)).not.toEqual(at(3.1));
    expect(at(7.9)).not.toEqual(at(8));
  });

  it("keeps texture lines unchanged up to 3px and about two pixels thinner than the main line beyond", () => {
    // 대비가 낮은 점 두 개: 재질선만 반응하고 주선은 나오지 않는다.
    const dots: StudioBg3dLtRasterInput = {
      width: 21,
      height: 21,
      rgba: pixels(21, 21, (x, y) => {
        const dot = (x === 6 && y === 6) || (x === 14 && y === 12);
        const value = dot ? 142 : 128;
        return [value, value, value, 255];
      }),
    };
    const textureAt = (widthPx: number) => {
      const result = renderStudioBg3dLtLayers(
        dots,
        settings({ widthPx, textureLineEnabled: true, textureLineStrength: 1, creaseAngleDegrees: 0 })
      );
      expect(layer(result, "main-line")).toBeUndefined();
      return layer(result, "texture-line")!.data;
    };
    const inkSum = (data: Uint8ClampedArray) =>
      data.reduce((sum, value, index) => sum + (index % 4 === 3 ? value : 0), 0);
    // 폭 3 이하는 칠하지 않는다(이전 버전과 같은 결과).
    expect(textureAt(3)).toEqual(textureAt(1));
    expect(textureAt(0.5)).toEqual(textureAt(1));
    // 폭 3 을 넘으면 (폭 - 2)로 연속 증가한다.
    const sums = [3, 3.5, 4, 5, 6, 8].map((widthPx) => inkSum(textureAt(widthPx)));
    for (let index = 1; index < sums.length; index += 1) {
      expect(sums[index]!).toBeGreaterThan(sums[index - 1]!);
    }
  });
});

describe("가려진 선 제거(hiddenLineRemoval)", () => {
  const width = 12;
  const height = 7;

  /** 휘도·깊이 경계가 5|6 열 사이에 겹친다. `nearLeft` 이면 왼쪽이 앞 물체다. */
  function occlusionScene(nearLeft: boolean): StudioBg3dLtRasterInput {
    const depth = new Float32Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        depth[y * width + x] = (x < 6) === nearLeft ? 0.2 : 0.8;
      }
    }
    return {
      width,
      height,
      rgba: pixels(width, height, (x) => (x < 6 ? [40, 40, 40, 255] : [220, 220, 220, 255])),
      depth,
    };
  }

  const depthLine = { depthEnabled: true, depthOutlineOnly: true } as const;
  /**
   * 깊이 캡처의 맨 위·아래 행(0, height-1)은 깊이 이웃이 없어 가려진 면을 알 수 없고, 그 옆 행(1, height-2)에는
   * 한 칸 어긋난 선의 대각 안티앨리어싱이 번진다. 그래서 가운데 행만 비교한다.
   */
  const interiorRows = [2, 3, 4];

  it("moves the far-side line onto the occluder so the contour is one line, not two", () => {
    const on = layer(
      renderStudioBg3dLtLayers(occlusionScene(true), settings({ ...depthLine, hiddenLineRemoval: true })),
      "main-line"
    )!;
    const off = layer(
      renderStudioBg3dLtLayers(occlusionScene(true), settings({ ...depthLine, hiddenLineRemoval: false })),
      "main-line"
    )!;
    for (const row of interiorRows) {
      // 끔: 앞 물체 쪽 깊이 윤곽(5 열, 128) + 먼 쪽 휘도 능선(6 열, 255) = 이웃한 두 줄.
      expect(alphaRow(off.data, width, row).slice(4, 8)).toEqual([0, 128, 255, 0]);
      // 켬: 먼 쪽 선이 앞 물체 쪽(5 열)으로 합쳐져 한 줄만 남는다.
      expect(alphaRow(on.data, width, row).slice(4, 8)).toEqual([0, 255, 0, 0]);
    }
  });

  it("leaves a boundary alone when the nearer surface already owns the line", () => {
    const on = renderStudioBg3dLtLayers(occlusionScene(false), settings({ ...depthLine, hiddenLineRemoval: true }));
    const off = renderStudioBg3dLtLayers(occlusionScene(false), settings({ ...depthLine, hiddenLineRemoval: false }));
    expect(layer(on, "main-line")!.data).toEqual(layer(off, "main-line")!.data);
    for (const row of interiorRows) {
      expect(alphaRow(layer(on, "main-line")!.data, width, row).slice(4, 8)).toEqual([0, 0, 255, 0]);
    }
  });

  it("has no effect without a depth capture", () => {
    const scene = occlusionScene(true);
    const noDepth: StudioBg3dLtRasterInput = { width, height, rgba: scene.rgba };
    const on = renderStudioBg3dLtLayers(noDepth, settings({ ...depthLine, hiddenLineRemoval: true }));
    const off = renderStudioBg3dLtLayers(noDepth, settings({ ...depthLine, hiddenLineRemoval: false }));
    expect(layer(on, "main-line")!.data).toEqual(layer(off, "main-line")!.data);
  });

  it("has no effect when the line settings do not ask for depth (depth passes must not change the main line)", () => {
    const scene = occlusionScene(true);
    const withoutDepth: StudioBg3dLtRasterInput = { width, height, rgba: scene.rgba };
    const plain = layer(
      renderStudioBg3dLtLayers(withoutDepth, settings({ depthEnabled: false, hiddenLineRemoval: true })),
      "main-line"
    )!;
    // 깊이 패스를 함께 내보내려고 깊이가 같이 들어와도 주선은 바뀌지 않는다.
    for (const hiddenLineRemoval of [true, false]) {
      const withDepth = layer(
        renderStudioBg3dLtLayers(scene, settings({ depthEnabled: false, hiddenLineRemoval })),
        "main-line"
      )!;
      expect(withDepth.data).toEqual(plain.data);
    }
  });

  it("also drops the far-side texture speckle next to the boundary", () => {
    const w = 16;
    const h = 9;
    const depth = new Float32Array(w * h);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) depth[y * w + x] = x < 6 ? 0.2 : 0.8;
    const input: StudioBg3dLtRasterInput = {
      width: w,
      height: h,
      rgba: pixels(w, h, (x, y) => {
        const value = x < 6 ? 120 : (x + y) % 2 === 0 ? 140 : 100;
        return [value, value, value, 255];
      }),
      depth,
    };
    const textureRow = (hiddenLineRemoval: boolean) =>
      alphaRow(
        layer(
          renderStudioBg3dLtLayers(
            input,
            settings({
              ...depthLine,
              hiddenLineRemoval,
              textureLineEnabled: true,
              textureLineStrength: 1,
              creaseAngleDegrees: 0,
            })
          ),
          "texture-line"
        )!.data,
        w,
        3
      );
    expect(textureRow(false).slice(5, 9)).toEqual([39, 146, 255, 255]);
    expect(textureRow(true).slice(5, 9)).toEqual([39, 0, 255, 255]);
  });
});

describe("내부선 억제(interiorSuppression)", () => {
  const width = 30;
  const height = 14;

  /**
   * 투명 배경 위 불투명 사각형(3..26 열, 2..11 행). 안쪽 휘도 경계가 `edgeX | edgeX + 1` 에 있다.
   * 투명 픽셀의 색을 가장자리 색과 같게 두어 윤곽 밖에서 휘도 경계가 생기지 않는다.
   */
  function rectangle(edgeX: number): StudioBg3dLtRasterInput {
    return {
      width,
      height,
      rgba: pixels(width, height, (x, y) => {
        const inside = x >= 3 && x <= 26 && y >= 2 && y <= 11;
        const value = x <= edgeX ? 60 : 200;
        return inside ? [value, value, value, 255] : [60, 60, 60, 0];
      }),
    };
  }

  function mainRow(
    edgeX: number,
    suppression: Partial<StudioBg3dLineOutputSettings> | null
  ): number[] {
    const result = renderStudioBg3dLtLayers(rectangle(edgeX), settings(suppression ?? {}));
    return alphaRow(layer(result, "main-line")!.data, width, 6);
  }

  it("keeps the alpha outline untouched and scales a far interior line by one minus the strength", () => {
    const off = mainRow(14, null);
    expect(off[3]).toBe(255); // 왼쪽 윤곽
    expect(off[26]).toBe(255); // 오른쪽 윤곽
    expect(off[15]).toBe(255); // 안쪽 휘도 경계(오른쪽 픽셀)
    expect(off.filter((alpha) => alpha > 0)).toHaveLength(3);

    const mid = mainRow(14, { interiorSuppressionEnabled: true, interiorSuppressionStrength: 0.6 });
    expect([mid[3], mid[15], mid[26]]).toEqual([255, 102, 255]); // 255 × (1 - 0.6)

    const full = mainRow(14, { interiorSuppressionEnabled: true, interiorSuppressionStrength: 1 });
    expect([full[3], full[15], full[26]]).toEqual([255, 0, 255]);
    expect(full.filter((alpha) => alpha > 0)).toHaveLength(2);
  });

  it("keeps interior lines that touch the outline, fading linearly over the three pixel band", () => {
    // 휘도 경계가 윤곽(3 열)에서 1·2·3·4·5px 떨어진 곳(능선은 경계의 오른쪽 픽셀)에 있다.
    const full = { interiorSuppressionEnabled: true, interiorSuppressionStrength: 1 } as const;
    expect(mainRow(3, full)[4]).toBe(191); //  거리 1 → 근접도 191/255
    expect(mainRow(4, full)[5]).toBe(128); //  거리 2
    expect(mainRow(5, full)[6]).toBe(64); //   거리 3
    expect(mainRow(6, full)[7]).toBe(0); //    거리 4: 밴드 밖
    expect(mainRow(7, full)[8]).toBe(0);
    const partial = { interiorSuppressionEnabled: true, interiorSuppressionStrength: 0.6 } as const;
    // 255 × (1 - 0.6 × (1 - 근접도/255)), 근접도 191/128/64
    expect(mainRow(3, partial)[4]).toBe(217);
    expect(mainRow(4, partial)[5]).toBe(179);
    expect(mainRow(5, partial)[6]).toBe(140);
    expect(mainRow(6, partial)[7]).toBe(102);
    // 억제를 끄면 어디서나 255 다.
    expect(mainRow(3, null)[4]).toBe(255);
    expect(mainRow(5, null)[6]).toBe(255);
  });

  it("treats a missing field, enabled=false, and strength 0 exactly like the previous behavior", () => {
    const baseline = renderStudioBg3dLtLayers(rectangle(14), settings());
    expect("interiorSuppressionEnabled" in settings().line).toBe(false);
    const variants: Partial<StudioBg3dLineOutputSettings>[] = [
      { interiorSuppressionEnabled: false },
      { interiorSuppressionEnabled: false, interiorSuppressionStrength: 1 },
      { interiorSuppressionEnabled: true, interiorSuppressionStrength: 0 },
      { interiorSuppressionStrength: 0.9 },
    ];
    for (const variant of variants) {
      expect(renderStudioBg3dLtLayers(rectangle(14), settings(variant))).toEqual(baseline);
    }
  });

  it("defaults the strength to 0.6 when only the switch is stored", () => {
    const explicit = renderStudioBg3dLtLayers(
      rectangle(14),
      settings({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 0.6 })
    );
    const implicit = renderStudioBg3dLtLayers(rectangle(14), settings({ interiorSuppressionEnabled: true }));
    expect(implicit).toEqual(explicit);
  });

  it("uses depth occlusion contours as outline evidence on an opaque capture", () => {
    // 불투명 장면: 8 열에서 깊이가 갈리고(왼쪽이 가깝다) 휘도 경계도 거기에 있다. 22 열에는 깊이 변화 없는 휘도 경계.
    const w = 30;
    const h = 12;
    const depth = new Float32Array(w * h);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) depth[y * w + x] = x < 9 ? 0.2 : 0.8;
    const input: StudioBg3dLtRasterInput = {
      width: w,
      height: h,
      rgba: pixels(w, h, (x) => {
        const value = x < 9 ? 40 : x < 22 ? 120 : 220;
        return [value, value, value, 255];
      }),
      depth,
    };
    const line = (extra: Partial<StudioBg3dLineOutputSettings>) =>
      alphaRow(
        layer(renderStudioBg3dLtLayers(input, settings(extra)), "main-line")!.data,
        w,
        6
      );
    const off = line({});
    // 깊이를 요구하지 않는 설정에서는 휘도 능선이 동점 규칙대로 먼 쪽(9 열)에 앉는다.
    expect([off[8], off[9], off[22]]).toEqual([0, 255, 255]);
    const suppressed = line({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 1 });
    // 억제를 켜면 깊이도 쓰므로 선이 앞 물체 쪽(8 열)의 깊이 윤곽 위로 모이고(가려진 선 제거) 그대로 남는다.
    // 깊이 근거가 없는 안쪽 휘도선(22 열)은 사라진다.
    expect([suppressed[8], suppressed[9], suppressed[22]]).toEqual([255, 0, 0]);
  });

  it("attenuates every interior line uniformly when there is no outline evidence at all", () => {
    // 윤곽 근거(투명 픽셀·깊이)가 전혀 없으면 구분할 방법이 없어 모든 안쪽 선이 (1 - s) 배가 된다.
    const opaqueOnly: StudioBg3dLtRasterInput = {
      width,
      height,
      rgba: pixels(width, height, (x) => (x <= 14 ? [60, 60, 60, 255] : [200, 200, 200, 255])),
    };
    const row = (extra: Partial<StudioBg3dLineOutputSettings>) =>
      alphaRow(layer(renderStudioBg3dLtLayers(opaqueOnly, settings(extra)), "main-line")!.data, width, 6);
    expect(row({})[15]).toBe(255);
    expect(row({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 0.6 })[15]).toBe(102);
    // 강도 1 이면 남는 선이 없어 주선 레이어 자체가 만들어지지 않는다.
    expect(
      layer(
        renderStudioBg3dLtLayers(
          opaqueOnly,
          settings({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 1 })
        ),
        "main-line"
      )
    ).toBeUndefined();
  });

  it("scales the texture-line layer by one minus the strength and removes it at full strength", () => {
    const checker: StudioBg3dLtRasterInput = {
      width: 15,
      height: 15,
      rgba: pixels(15, 15, (x, y) => ((x + y) % 2 === 0 ? [48, 48, 48, 255] : [208, 208, 208, 255])),
    };
    const textureAlpha = (extra: Partial<StudioBg3dLineOutputSettings>) => {
      const result = renderStudioBg3dLtLayers(
        checker,
        settings({ textureLineEnabled: true, textureLineStrength: 1, creaseAngleDegrees: 0, ...extra })
      );
      return layer(result, "texture-line");
    };
    const base = textureAlpha({})!;
    const half = textureAlpha({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 0.5 })!;
    let compared = 0;
    for (let index = 3; index < base.data.length; index += 4) {
      const expected = base.data[index]! * 0.5;
      // 정수 반올림이 두 단계를 거치므로 ±1 안에서 같다.
      expect(Math.abs(half.data[index]! - expected)).toBeLessThanOrEqual(1);
      if (base.data[index]! > 0) compared += 1;
    }
    expect(compared).toBeGreaterThan(50);
    expect(textureAlpha({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 1 })).toBeUndefined();
  });

  it("is deterministic and never mutates the caller's raster or settings", () => {
    const input = rectangle(5);
    const options = settings({ interiorSuppressionEnabled: true, interiorSuppressionStrength: 0.8 });
    const rgbaBefore = input.rgba.slice();
    const settingsBefore = structuredClone(options);
    const first = renderStudioBg3dLtLayers(input, options);
    const second = renderStudioBg3dLtLayers(input, options);
    expect(first).toEqual(second);
    expect(input.rgba).toEqual(rgbaBefore);
    expect(options).toEqual(settingsBefore);
  });

  it("rejects malformed suppression fields while accepting their absence", () => {
    const input = rectangle(14);
    expect(() =>
      renderStudioBg3dLtLayers(input, settings({ interiorSuppressionStrength: 1.5 }))
    ).toThrow(/interiorSuppressionStrength/u);
    expect(() =>
      renderStudioBg3dLtLayers(input, settings({ interiorSuppressionStrength: Number.NaN }))
    ).toThrow(/interiorSuppressionStrength/u);
    expect(() =>
      renderStudioBg3dLtLayers(
        input,
        settings({ interiorSuppressionEnabled: "yes" as unknown as boolean })
      )
    ).toThrow(/interiorSuppressionEnabled/u);
    expect(() => renderStudioBg3dLtLayers(input, settings())).not.toThrow();
  });
});

describe("기본 문서의 호환", () => {
  it("renders an old line object (no suppression keys) the same as an explicit off switch", () => {
    const old = DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.line;
    expect(Object.keys(old)).not.toContain("interiorSuppressionEnabled");
    expect(Object.keys(old)).not.toContain("interiorSuppressionStrength");
    const input = luminanceStep();
    const tone = settings().tone;
    const withoutKeys = renderStudioBg3dLtLayers(input, { line: old, tone });
    const withOffSwitch = renderStudioBg3dLtLayers(input, {
      line: { ...old, interiorSuppressionEnabled: false },
      tone,
    });
    expect(withoutKeys).toEqual(withOffSwitch);
  });
});

describe("타일 경계 예산", () => {
  it("keeps the line receptive field inside the 12px tile halo (tiles must equal the full frame)", () => {
    // 단계(흐림·Sobel·비최대 억제·가려진 선 이동·칠하기)를 더하면 이 값이 늘어난다. 헤일로를 넘으면 큰 내보내기에서
    // 타일 이음매가 보이므로 먼저 이 예산을 다시 계산해야 한다. 현재 최악(재질선)은 12다.
    expect(STUDIO_BG3D_LT_LINE_RECEPTIVE_FIELD_PX).toBe(12);
    expect(STUDIO_BG3D_LT_LINE_RECEPTIVE_FIELD_PX).toBeLessThanOrEqual(STUDIO_BG3D_TILE_HALO);
  });
});
