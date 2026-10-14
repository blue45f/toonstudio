import { describe, expect, it } from "vitest";

import {
  DEFAULT_SHADING_ASSIST_OPTIONS,
  buildStudioShadingAssistDraft,
  normalizeShadingAssistOptions,
  shadingAssistLightVector,
} from "./studio-shading-assist";

import type { StudioImageDataLike } from "./studio-filters";

function makeImage(width: number, height: number, fill: number[]): StudioImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) data.set(fill, i * 4);
  return { data, width, height };
}

function maskAlphaAt(img: StudioImageDataLike, x: number, y: number): number {
  return img.data[(y * img.width + x) * 4 + 3]!;
}

describe("normalizeShadingAssistOptions", () => {
  it("기본값은 왼쪽 위 광원·2단 음영", () => {
    expect(normalizeShadingAssistOptions()).toEqual(DEFAULT_SHADING_ASSIST_OPTIONS);
    expect(DEFAULT_SHADING_ASSIST_OPTIONS.azimuthDeg).toBe(315);
    expect(DEFAULT_SHADING_ASSIST_OPTIONS.toneSteps).toBe(2);
  });

  it("범위를 벗어난 값은 클램프하고 방위각은 360으로 나눈 나머지로 만든다", () => {
    const opts = normalizeShadingAssistOptions({ strength: 250, coverage: -5, azimuthDeg: 450 });
    expect(opts.strength).toBe(100);
    expect(opts.coverage).toBe(0);
    expect(opts.azimuthDeg).toBe(90);
  });
});

describe("shadingAssistLightVector", () => {
  it("0°는 위, 90°는 오른쪽을 가리킨다(화면 공간)", () => {
    expect(shadingAssistLightVector(0)).toEqual([0, -1]);
    const [dx, dy] = shadingAssistLightVector(90);
    expect(dx).toBeCloseTo(1, 6);
    expect(dy).toBeCloseTo(0, 6);
  });
});

describe("buildStudioShadingAssistDraft", () => {
  it("왼쪽 광원이면 오른쪽 끝에 음영이 걸리고 왼쪽 끝은 걸리지 않는다", () => {
    const source = makeImage(8, 1, [200, 180, 160, 255]);
    const draft = buildStudioShadingAssistDraft(source, {
      azimuthDeg: 270,
      strength: 100,
      coverage: 50,
      softness: 0,
      toneSteps: 0,
    });
    expect(draft.status).toBe("created");
    if (draft.status !== "created") return;
    expect(maskAlphaAt(draft.mask, 0, 0)).toBe(0);
    expect(maskAlphaAt(draft.mask, 7, 0)).toBeGreaterThan(0);
    expect(draft.opaquePixelCount).toBe(8);
    expect(draft.coverageRatio).toBeGreaterThan(0);
    expect(draft.coverageRatio).toBeLessThanOrEqual(1);
  });

  it("위쪽 광원이면 아래쪽 행에 음영이 걸린다", () => {
    const source = makeImage(1, 8, [200, 180, 160, 255]);
    const draft = buildStudioShadingAssistDraft(source, {
      azimuthDeg: 0,
      strength: 100,
      coverage: 50,
      softness: 0,
      toneSteps: 0,
    });
    expect(draft.status).toBe("created");
    if (draft.status !== "created") return;
    expect(maskAlphaAt(draft.mask, 0, 0)).toBe(0);
    expect(maskAlphaAt(draft.mask, 0, 7)).toBeGreaterThan(0);
  });

  it("2단 음영에서는 마스크 알파가 0 또는 최대값만 나온다", () => {
    const source = makeImage(16, 1, [200, 180, 160, 255]);
    const draft = buildStudioShadingAssistDraft(source, {
      azimuthDeg: 270,
      strength: 80,
      toneSteps: 2,
    });
    expect(draft.status).toBe("created");
    if (draft.status !== "created") return;
    const alphas = new Set<number>();
    for (let x = 0; x < 16; x += 1) alphas.add(maskAlphaAt(draft.mask, x, 0));
    const max = Math.round(0.8 * 255);
    for (const a of alphas) expect(a === 0 || a === max).toBe(true);
  });

  it("투명 픽셀은 마스크 알파 0이고 미리보기에서도 원본 그대로다", () => {
    const source = makeImage(4, 1, [200, 180, 160, 255]);
    source.data[3] = 0; // 첫 픽셀 투명
    const draft = buildStudioShadingAssistDraft(source, { azimuthDeg: 270 });
    expect(draft.status).toBe("created");
    if (draft.status !== "created") return;
    expect(maskAlphaAt(draft.mask, 0, 0)).toBe(0);
    expect(Array.from(draft.preview.data.slice(0, 4))).toEqual([200, 180, 160, 0]);
    expect(draft.opaquePixelCount).toBe(3);
  });

  it("입력을 변형하지 않는다", () => {
    const source = makeImage(4, 4, [120, 130, 140, 255]);
    const before = Array.from(source.data);
    buildStudioShadingAssistDraft(source, { azimuthDeg: 90 });
    expect(Array.from(source.data)).toEqual(before);
  });

  it("전부 투명하면 no-opaque-pixels로 거부한다", () => {
    const draft = buildStudioShadingAssistDraft(makeImage(2, 2, [0, 0, 0, 0]));
    expect(draft.status).toBe("refused");
    if (draft.status === "refused") expect(draft.reason).toBe("no-opaque-pixels");
  });

  it("깨진 소스는 invalid-source로 거부한다", () => {
    const draft = buildStudioShadingAssistDraft({ data: new Uint8ClampedArray(4), width: 0, height: 0 });
    expect(draft.status).toBe("refused");
    if (draft.status === "refused") expect(draft.reason).toBe("invalid-source");
  });
});
