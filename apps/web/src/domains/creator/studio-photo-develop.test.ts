import { describe, expect, it } from "vitest";

import {
  STUDIO_PHOTO_DEVELOP_DEFAULT_SETTINGS,
  STUDIO_PHOTO_DEVELOP_PRESETS,
  applyStudioPhotoDevelop,
  estimateStudioPhotoDevelopWhiteBalanceGains,
  isIdentityStudioPhotoDevelop,
  normalizeStudioPhotoDevelopSettings,
  resolveStudioPhotoDevelopPreset,
} from "./studio-photo-develop";

import type { StudioImageDataLike } from "./studio-filters";

/** [r,g,b,a] 픽셀 배열로 StudioImageDataLike 생성. */
function makeImage(
  width: number,
  height: number,
  pixels: number[][],
): StudioImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  pixels.forEach((px, i) => data.set(px, i * 4));
  return { data, width, height };
}

function pixelAt(img: StudioImageDataLike, index: number): number[] {
  return Array.from(img.data.slice(index * 4, index * 4 + 4));
}

describe("normalizeStudioPhotoDevelopSettings / isIdentity", () => {
  it("기본값은 항등이다", () => {
    expect(STUDIO_PHOTO_DEVELOP_DEFAULT_SETTINGS).toEqual({
      contrast: 0,
      dehaze: 0,
      whiteBalance: "off",
    });
    expect(isIdentityStudioPhotoDevelop(STUDIO_PHOTO_DEVELOP_DEFAULT_SETTINGS)).toBe(true);
    expect(normalizeStudioPhotoDevelopSettings()).toEqual(
      STUDIO_PHOTO_DEVELOP_DEFAULT_SETTINGS,
    );
    expect(normalizeStudioPhotoDevelopSettings(null)).toEqual(
      STUDIO_PHOTO_DEVELOP_DEFAULT_SETTINGS,
    );
  });

  it("범위 밖 값은 클램프하고 무효 모드는 off로 떨어진다", () => {
    expect(
      normalizeStudioPhotoDevelopSettings({ contrast: 250, dehaze: -3 }),
    ).toEqual({ contrast: 100, dehaze: 0, whiteBalance: "off" });
    expect(
      normalizeStudioPhotoDevelopSettings({ contrast: Number.NaN }).contrast,
    ).toBe(0);
    expect(
      normalizeStudioPhotoDevelopSettings({
        whiteBalance: "bogus" as never,
      }).whiteBalance,
    ).toBe("off");
  });

  it("어느 한 축이라도 켜지면 항등이 아니다", () => {
    expect(
      isIdentityStudioPhotoDevelop({
        contrast: 1,
        dehaze: 0,
        whiteBalance: "off",
      }),
    ).toBe(false);
    expect(
      isIdentityStudioPhotoDevelop({
        contrast: 0,
        dehaze: 0,
        whiteBalance: "auto",
      }),
    ).toBe(false);
  });
});

describe("STUDIO_PHOTO_DEVELOP_PRESETS / resolve", () => {
  it("첫 프리셋은 원본 그대로(항등)이고 id가 유일하다", () => {
    expect(STUDIO_PHOTO_DEVELOP_PRESETS[0]!.id).toBe("none");
    expect(
      isIdentityStudioPhotoDevelop(STUDIO_PHOTO_DEVELOP_PRESETS[0]!.settings),
    ).toBe(true);
    const ids = STUDIO_PHOTO_DEVELOP_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of STUDIO_PHOTO_DEVELOP_PRESETS.slice(1)) {
      expect(isIdentityStudioPhotoDevelop(preset.settings)).toBe(false);
    }
  });

  it("알 수 없는 id는 원본 그대로로 fail-soft 한다", () => {
    expect(resolveStudioPhotoDevelopPreset("nope").id).toBe("none");
    expect(resolveStudioPhotoDevelopPreset(undefined).id).toBe("none");
    expect(resolveStudioPhotoDevelopPreset("dehaze").id).toBe("dehaze");
  });
});

describe("estimateStudioPhotoDevelopWhiteBalanceGains", () => {
  it("off는 중립, 프리셋은 고정 게인", () => {
    const img = makeImage(1, 1, [[128, 128, 128, 255]]);
    expect(estimateStudioPhotoDevelopWhiteBalanceGains(img, "off")).toEqual({
      r: 1,
      g: 1,
      b: 1,
    });
    expect(
      estimateStudioPhotoDevelopWhiteBalanceGains(img, "tungsten"),
    ).toEqual({ r: 0.82, g: 0.96, b: 1.24 });
  });

  it("auto는 노란 캐스트에서 빨강 게인을 내리고 파랑 게인을 올린다", () => {
    const warm = makeImage(2, 1, [
      [200, 150, 100, 255],
      [200, 150, 100, 255],
    ]);
    const gains = estimateStudioPhotoDevelopWhiteBalanceGains(warm, "auto");
    expect(gains.r).toBeLessThan(1);
    expect(gains.b).toBeGreaterThan(1);
    // 평균 150 기준: r=150/200=0.75, b=150/100=1.5→클램프 1.33.
    expect(gains.r).toBeCloseTo(0.75, 5);
    expect(gains.b).toBeCloseTo(1.33, 5);
  });

  it("auto는 회색 이미지에서 중립에 가깝다", () => {
    const gray = makeImage(1, 1, [[120, 120, 120, 255]]);
    expect(estimateStudioPhotoDevelopWhiteBalanceGains(gray, "auto")).toEqual({
      r: 1,
      g: 1,
      b: 1,
    });
  });
});

describe("applyStudioPhotoDevelop", () => {
  it("항등 설정이어도 입력과 다른 새 버퍼를 반환하고 입력은 불변이다", () => {
    const src = makeImage(1, 1, [[10, 20, 30, 255]]);
    const out = applyStudioPhotoDevelop(
      src,
      STUDIO_PHOTO_DEVELOP_DEFAULT_SETTINGS,
    );
    expect(out.data).not.toBe(src.data);
    expect(pixelAt(out, 0)).toEqual([10, 20, 30, 255]);
    expect(pixelAt(src, 0)).toEqual([10, 20, 30, 255]);
  });

  it("비항등 적용에서도 입력 버퍼는 변하지 않는다(비파괴)", () => {
    const src = makeImage(2, 1, [
      [100, 110, 120, 255],
      [140, 150, 160, 200],
    ]);
    const before = Array.from(src.data);
    applyStudioPhotoDevelop(src, {
      contrast: 50,
      dehaze: 50,
      whiteBalance: "tungsten",
    });
    expect(Array.from(src.data)).toEqual(before);
  });

  it("대비는 중간점 기준으로 어두운 픽셀을 더 어둡게, 밝은 픽셀을 더 밝게 한다", () => {
    const src = makeImage(2, 1, [
      [64, 64, 64, 255],
      [192, 192, 192, 255],
    ]);
    const out = applyStudioPhotoDevelop(src, {
      contrast: 100,
      dehaze: 0,
      whiteBalance: "off",
    });
    // factor 2: (64-128)*2+128=0, (192-128)*2+128=256→255.
    expect(pixelAt(out, 0)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(out, 1)).toEqual([255, 255, 255, 255]);
  });

  it("안개 제거는 좁은 명암 구간의 양끝을 펴고 알파를 보존한다", () => {
    // 휘도 100..155 구간에 몰린 뿌연 이미지 20픽셀.
    const pixels: number[][] = [];
    for (let i = 0; i < 20; i += 1) {
      const v = 100 + i * 3; // 100..157
      pixels.push([v, v, v, 255]);
    }
    const src = makeImage(20, 1, pixels);
    const out = applyStudioPhotoDevelop(src, {
      contrast: 0,
      dehaze: 100,
      whiteBalance: "off",
    });
    const values = pixels.map((_, i) => pixelAt(out, i)[0]!);
    expect(Math.min(...values)).toBeLessThan(100);
    expect(Math.max(...values)).toBeGreaterThan(157);
    expect(pixelAt(out, 0)[3]).toBe(255);
  });

  it("화이트밸런스 tungsten은 노란 픽셀의 파랑을 올리고 빨강을 내린다", () => {
    const src = makeImage(1, 1, [[200, 160, 80, 255]]);
    const out = applyStudioPhotoDevelop(src, {
      contrast: 0,
      dehaze: 0,
      whiteBalance: "tungsten",
    });
    const [r, , b] = pixelAt(out, 0);
    expect(r!).toBeLessThan(200);
    expect(b!).toBeGreaterThan(80);
  });
});
