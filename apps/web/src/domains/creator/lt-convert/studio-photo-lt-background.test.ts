import { describe, expect, it } from "vitest";

import { convertStudioLtImage, StudioLtConvertError } from "./studio-lt-convert";
import {
  buildStudioPhotoLtBackgroundPlacement,
  planStudioPhotoLtBackground,
  resolveStudioPhotoLtBackgroundPreset,
  studioPhotoLtBackgroundBaseName,
  STUDIO_PHOTO_LT_BACKGROUND_PRESETS,
} from "./studio-photo-lt-background";

// node 환경에는 ImageData가 없으므로 최소 스텁을 제공한다.
if (typeof globalThis.ImageData === "undefined") {
  class TestImageData {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  }
  globalThis.ImageData = TestImageData as unknown as typeof ImageData;
}

function makeSource(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = x < width / 2 ? 30 : 220;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

const CANVAS = { canvasWidth: 720, canvasHeight: 1080 } as const;

describe("STUDIO_PHOTO_LT_BACKGROUND_PRESETS", () => {
  it("프리셋 5종의 옵션은 전부 엔진 허용 범위 안에 있다", () => {
    expect(STUDIO_PHOTO_LT_BACKGROUND_PRESETS).toHaveLength(5);
    const ids = new Set(STUDIO_PHOTO_LT_BACKGROUND_PRESETS.map((preset) => preset.id));
    expect(ids.size).toBe(5);
    for (const preset of STUDIO_PHOTO_LT_BACKGROUND_PRESETS) {
      expect(preset.options.toneDensity).toBeGreaterThanOrEqual(2);
      expect(preset.options.toneDensity).toBeLessThanOrEqual(8);
      expect(preset.options.lineThickness).toBeGreaterThanOrEqual(1);
      expect(preset.options.lineThickness).toBeLessThanOrEqual(5);
      expect(preset.options.lineThreshold).toBeGreaterThanOrEqual(0);
      expect(preset.options.lineThreshold).toBeLessThanOrEqual(1);
    }
  });

  it("알 수 없는 프리셋 id는 기본(clean)으로 해석한다", () => {
    expect(resolveStudioPhotoLtBackgroundPreset("nope").id).toBe("clean");
    expect(resolveStudioPhotoLtBackgroundPreset(undefined).id).toBe("clean");
    expect(resolveStudioPhotoLtBackgroundPreset("line-only").includeTone).toBe(false);
  });
});

describe("studioPhotoLtBackgroundBaseName", () => {
  it("확장자를 떼고, 이름이 없으면 기본 이름을 쓴다", () => {
    expect(studioPhotoLtBackgroundBaseName("cafe-photo.jpg")).toBe("cafe-photo");
    expect(studioPhotoLtBackgroundBaseName(" 골목.PNG ")).toBe("골목");
    expect(studioPhotoLtBackgroundBaseName("")).toBe("사진 배경");
    expect(studioPhotoLtBackgroundBaseName(undefined)).toBe("사진 배경");
  });
});

describe("planStudioPhotoLtBackground", () => {
  it("cover(기본)는 캔버스를 꽉 채우고 가운데에서 넘친 만큼 잘라 낸다", () => {
    const plan = planStudioPhotoLtBackground({
      ...CANVAS,
      sourceWidth: 2048,
      sourceHeight: 1024,
      sourceName: "street.jpg",
    });
    // scale = max(720/2048, 1080/1024) = 1.0546875 → 2160×1080
    expect(plan.fit).toBe("cover");
    expect(plan.layers).toHaveLength(2);
    const [tone, line] = plan.layers;
    expect(tone?.kind).toBe("lt-convert-tone");
    expect(tone?.stackIndex).toBe(0);
    expect(line?.kind).toBe("lt-convert-line");
    expect(line?.stackIndex).toBe(1);
    expect(line?.width).toBe(2160);
    expect(line?.height).toBe(1080);
    expect(line?.x).toBe(-720);
    expect(line?.y).toBe(0);
    expect(line?.name).toBe("street 배경 선화");
    expect(tone?.name).toBe("street 배경 톤");
    expect(plan.needsWhiteBacking).toBe(false);
  });

  it("contain은 사진 전체가 캔버스 안에 들어간다", () => {
    const plan = planStudioPhotoLtBackground({
      ...CANVAS,
      sourceWidth: 2048,
      sourceHeight: 1024,
      fit: "contain",
    });
    const line = plan.layers[plan.layers.length - 1];
    // scale = min(720/2048, 1080/1024) = 0.3515625 → 720×360
    expect(line?.width).toBe(720);
    expect(line?.height).toBe(360);
    expect(line?.x).toBe(0);
    expect(line?.y).toBe(360);
  });

  it("선만(line-only·includeTone=false)이면 선화 1장과 흰 바탕 필요를 보고한다", () => {
    const plan = planStudioPhotoLtBackground({
      ...CANVAS,
      sourceWidth: 800,
      sourceHeight: 600,
      presetId: "line-only",
    });
    expect(plan.includeTone).toBe(false);
    expect(plan.needsWhiteBacking).toBe(true);
    expect(plan.layers).toHaveLength(1);
    expect(plan.layers[0]?.kind).toBe("lt-convert-line");
    expect(plan.layers[0]?.stackIndex).toBe(0);
  });

  it("옵션 덮어쓰기는 엔진 정규화를 거친다", () => {
    const plan = planStudioPhotoLtBackground({
      ...CANVAS,
      sourceWidth: 100,
      sourceHeight: 100,
      options: { lineThickness: 99 },
    });
    expect(plan.options.lineThickness).toBe(5);
  });

  it("잘못된 크기는 invalid-input 오류를 던진다", () => {
    expect(() =>
      planStudioPhotoLtBackground({ ...CANVAS, sourceWidth: 0, sourceHeight: 10 }),
    ).toThrowError(StudioLtConvertError);
    try {
      planStudioPhotoLtBackground({
        canvasWidth: 720.5,
        canvasHeight: 1080,
        sourceWidth: 10,
        sourceHeight: 10,
      });
      expect.unreachable("오류가 발생해야 한다");
    } catch (error) {
      expect((error as StudioLtConvertError).code).toBe("invalid-input");
    }
  });
});

describe("buildStudioPhotoLtBackgroundPlacement", () => {
  it("톤(아래)→선화(위) 순서로 직렬화된 레이어를 만든다", () => {
    const source = makeSource(16, 16);
    const result = convertStudioLtImage(source, {
      toneDensity: 4,
      lineThickness: 2,
      lineThreshold: 0.1,
    });
    const serialized: ImageData[] = [];
    const placement = buildStudioPhotoLtBackgroundPlacement(
      result,
      { ...CANVAS, sourceWidth: 16, sourceHeight: 16, sourceName: "room.png" },
      (imageData) => {
        serialized.push(imageData);
        return `data:image/png;stub-${serialized.length}`;
      },
    );
    expect(placement.layers).toHaveLength(2);
    expect(placement.layers[0]?.kind).toBe("lt-convert-tone");
    expect(placement.layers[0]?.src).toBe("data:image/png;stub-1");
    expect(placement.layers[1]?.kind).toBe("lt-convert-line");
    expect(placement.layers[1]?.src).toBe("data:image/png;stub-2");
    expect(serialized[0]).toBe(result.toneLayer);
    expect(serialized[1]).toBe(result.lineLayer);
    expect(placement.layers[0]?.sourceWidth).toBe(16);
    expect(placement.plan.baseName).toBe("room");
  });

  it("톤을 빼면 선화만 직렬화한다", () => {
    const source = makeSource(8, 8);
    const result = convertStudioLtImage(source, {
      toneDensity: 4,
      lineThickness: 2,
      lineThreshold: 0.1,
    });
    const placement = buildStudioPhotoLtBackgroundPlacement(
      result,
      { ...CANVAS, sourceWidth: 8, sourceHeight: 8, includeTone: false },
      () => "data:image/png;stub",
    );
    expect(placement.layers).toHaveLength(1);
    expect(placement.layers[0]?.role).toBe("background-line");
  });
});
