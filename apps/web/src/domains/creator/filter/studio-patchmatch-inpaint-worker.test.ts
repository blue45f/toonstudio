import { describe, expect, it } from "vitest";

import {
  handlePatchMatchWorkerMessage,
  runPatchMatchInpaint,
  type PatchMatchWorkerResponse,
} from "./studio-patchmatch-inpaint-worker";

function makeCheckerOrSplitImage(width: number, height: number): {
  width: number;
  height: number;
  data: Uint8ClampedArray;
} {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      // 왼쪽 절반은 차분한 초록(30, 180, 90), 오른쪽 절반은 강렬한 빨강(240, 30, 30)
      if (x < width / 2) {
        data[idx] = 30;
        data[idx + 1] = 180;
        data[idx + 2] = 90;
      } else {
        data[idx] = 240;
        data[idx + 1] = 30;
        data[idx + 2] = 30;
      }
      data[idx + 3] = 255;
    }
  }
  return { width, height, data };
}

describe("studio-patchmatch-inpaint-worker", () => {
  it("4단계 가우시안 피라미드 코어스-투-파인 PatchMatch가 구멍을 주변 텍스처로 자연스럽게 복원한다", () => {
    // 64×64: 패치 반경 2(minDim=8)에서 4단계 피라미드(64 -> 32 -> 16 -> 8) 실행 가능
    const width = 64;
    const height = 64;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = (y * width + x) * 4;
        // 일정한 가로 줄무늬 패턴(주변 배경)
        const stripe = y % 4 < 2 ? 180 : 120;
        data[idx] = stripe;
        data[idx + 1] = stripe + 20;
        data[idx + 2] = 210;
        data[idx + 3] = 255;
      }
    }

    // 중앙 8×8 구멍을 마젠타 오염색으로 덮고 구멍 마스크 표시
    const holeMask = new Uint8Array(width * height);
    for (let y = 28; y < 36; y += 1) {
      for (let x = 28; x < 36; x += 1) {
        const p = y * width + x;
        holeMask[p] = 1;
        data[p * 4] = 255;
        data[p * 4 + 1] = 0;
        data[p * 4 + 2] = 255;
      }
    }

    const source = { width, height, data };
    const result = runPatchMatchInpaint(source, holeMask, undefined, {
      patchRadius: 2,
      pyramidLevels: 4,
      iterationsPerLevel: 5,
      poissonBlendIterations: 10,
      seed: 101,
    });

    expect(result.stats.pyramidLevelsExecuted).toBe(4);
    expect(result.stats.holePixelCount).toBe(64);
    expect(result.stats.fallbackUsed).toBe(false);
    // 입력 버퍼는 비파괴 불변
    expect(source.data[(32 * width + 32) * 4 + 1]).toBe(0);

    // 복원된 중앙 픽셀의 G 채널은 원래 오염(0)에서 배경 대역(130..210)으로 복원되어야 한다
    const restoredG = result.imageData.data[(32 * width + 32) * 4 + 1]!;
    expect(restoredG).toBeGreaterThan(100);
    expect(restoredG).toBeLessThan(230);
  });

  it("제외 마스크(excludeMask)로 지정한 영역은 샘플링 소스에서 철저히 배제한다", () => {
    const width = 28;
    const height = 28;
    const source = makeCheckerOrSplitImage(width, height);
    const holeMask = new Uint8Array(width * height);
    const excludeMask = new Uint8Array(width * height);

    // 구멍은 오른쪽 빨강 영역 안쪽(x=18..21, y=12..15)에 배치하고
    // 오른쪽 빨강 영역 전체를 excludeMask로 금지 -> 반드시 왼쪽 초록 영역에서만 채워져야 함!
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const p = y * width + x;
        if (x >= width / 2) excludeMask[p] = 1;
        if (x >= 18 && x < 22 && y >= 12 && y < 16) {
          holeMask[p] = 1;
          source.data[p * 4] = 0;
          source.data[p * 4 + 1] = 0;
          source.data[p * 4 + 2] = 0;
        }
      }
    }

    const result = runPatchMatchInpaint(source, holeMask, excludeMask, {
      patchRadius: 1,
      pyramidLevels: 2,
      iterationsPerLevel: 4,
      poissonBlendIterations: 0, // 순수 샘플링 색 검증을 위해 포아송 비활성
      seed: 7,
    });

    expect(result.stats.excludedPixelCount).toBeGreaterThan(0);
    expect(result.stats.fallbackUsed).toBe(false);
    // 구멍 중앙 픽셀이 제외된 빨강(240,30,30) 대신 허용된 초록(30,180,90)으로 채워져야 한다
    const centerIdx = (14 * width + 20) * 4;
    expect(result.imageData.data[centerIdx + 1]!).toBeGreaterThan(140);
    expect(result.imageData.data[centerIdx]!).toBeLessThan(80);
  });

  it("WebWorker 메시지 디스패처가 진행률 이벤트와 최종 결과를 순서대로 전달한다", () => {
    const width = 16;
    const height = 16;
    const rgba = new Uint8ClampedArray(width * height * 4).fill(200);
    const holeMask = new Uint8Array(width * height);
    holeMask[8 * width + 8] = 1;

    const responses: PatchMatchWorkerResponse[] = [];
    handlePatchMatchWorkerMessage(
      {
        type: "run",
        requestId: "req-1",
        width,
        height,
        rgba,
        holeMask,
        options: { patchRadius: 1, pyramidLevels: 2, iterationsPerLevel: 2 },
      },
      (res) => responses.push(res),
    );

    const progressEvents = responses.filter((r) => r.type === "progress");
    const resultEvent = responses.find((r) => r.type === "result");
    expect(progressEvents.length).toBeGreaterThan(0);
    expect(resultEvent).toBeDefined();
    if (resultEvent?.type === "result") {
      expect(resultEvent.requestId).toBe("req-1");
      expect(resultEvent.rgba.length).toBe(width * height * 4);
    }
  });
});
