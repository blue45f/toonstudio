import { describe, expect, it } from "vitest";

import {
  applyStudioBlendKernelWithReferLayers,
  composeBlendReferLayerSample,
} from "./studio-blend-refer-layer";

describe("studio-blend-refer-layer", () => {
  it("흐리기(blur) 브러시가 고주파 격자 패턴의 픽셀 분산을 실제로 낮춘다", () => {
    const width = 8;
    const height = 8;
    const data = new Uint8ClampedArray(width * height * 4);
    const mask = new Uint8ClampedArray(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = (y * width + x) * 4;
        const v = (x + y) % 2 === 0 ? 240 : 20;
        data[idx] = v;
        data[idx + 1] = v;
        data[idx + 2] = v;
        data[idx + 3] = 255;
        mask[y * width + x] = 255;
      }
    }

    const beforeDiff = Math.abs(data[0]! - data[4]!);
    const blurred = applyStudioBlendKernelWithReferLayers({
      targetLayer: { width, height, data },
      brushMask: { width, height, data: mask },
      mode: "blur",
      radiusPx: 2,
      strengthNormalized: 1,
    });
    const centerIdx = (3 * width + 3) * 4;
    const neighborIdx = (3 * width + 4) * 4;
    const afterDiff = Math.abs(blurred.data[centerIdx]! - blurred.data[neighborIdx]!);
    expect(afterDiff).toBeLessThan(beforeDiff * 0.4);
  });

  it("타 레이어 참조 활성화 시 아래 레이어의 색을 끌어오되 원본 아래 레이어 데이터는 절대 수정하지 않는다", () => {
    const width = 4;
    const height = 4;
    const underData = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < underData.length; i += 4) {
      underData[i] = 220;
      underData[i + 1] = 40;
      underData[i + 2] = 60;
      underData[i + 3] = 255;
    }
    const underCopy = new Uint8ClampedArray(underData);
    const emptyTarget = { width, height, data: new Uint8ClampedArray(width * height * 4) };
    const mask = new Uint8ClampedArray(width * height).fill(255);

    const composite = composeBlendReferLayerSample(
      emptyTarget,
      [
        { id: "under", visible: true, image: { width, height, data: underData } },
        { id: "draft", visible: true, isDraft: true, image: { width, height, data: new Uint8ClampedArray(width * height * 4).fill(255) } },
      ],
      { referVisibleLayers: true, excludeDraftLayers: true },
    );
    expect(composite.data[0]).toBe(220);

    const painted = applyStudioBlendKernelWithReferLayers({
      targetLayer: emptyTarget,
      brushMask: { width, height, data: mask },
      layerStackBottomToTop: [{ id: "under", visible: true, image: { width, height, data: underData } }],
      mode: "blur",
      radiusPx: 1,
      strengthNormalized: 0.8,
    });

    expect(painted.data[0]).toBeGreaterThan(150);
    expect(painted.data[3]).toBeGreaterThan(150);
    expect(underData).toEqual(underCopy);
  });
});
