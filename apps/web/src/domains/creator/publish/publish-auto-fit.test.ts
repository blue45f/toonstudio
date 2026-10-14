import { describe, it, expect } from "vitest";

import {
  applyPublishAutoFitToPages,
  planPublishAutoFit,
} from "./publish-auto-fit";
import { findPublishSpecPreset } from "./spec-validator";
import type { UploadPage } from "./studio-upload-page-model";

const toonstudioPreset = findPublishSpecPreset("toonstudio");

function page(overrides: Partial<UploadPage>): UploadPage {
  return {
    id: "p1",
    src: "data:image/png;base64,AAAA",
    width: 800,
    height: 1000,
    name: "원고.png",
    ...overrides,
  };
}

describe("planPublishAutoFit", () => {
  it("규격에 맞는 페이지는 유지로 계획한다", () => {
    const plan = planPublishAutoFit([page({})], toonstudioPreset);
    expect(plan.pages[0]?.action).toBe("keep");
    expect(plan.outputPageCount).toBe(1);
    expect(plan.changedPageCount).toBe(0);
    expect(plan.summary).toBe("모든 이미지가 게시 규격에 맞아요.");
  });

  it("긴 이미지는 규격 높이(1280) 단위 슬라이스로 계획한다", () => {
    const plan = planPublishAutoFit([page({ height: 3000 })], toonstudioPreset);
    expect(plan.pages[0]?.action).toBe("slice");
    expect(plan.pages[0]?.slices.map((box) => box.height)).toEqual([1280, 1280, 440]);
    expect(plan.outputPageCount).toBe(3);
    expect(plan.slicedPageCount).toBe(1);
  });

  it("넓은 이미지는 규격 폭으로 줄이고 비율을 유지한다", () => {
    const plan = planPublishAutoFit(
      [page({ width: 1600, height: 2560 })],
      toonstudioPreset
    );
    expect(plan.pages[0]?.targetWidth).toBe(800);
    expect(plan.pages[0]?.targetHeight).toBe(1280);
    expect(plan.pages[0]?.action).toBe("resize");
  });

  it("넓고 긴 이미지는 resize-slice로 계획한다", () => {
    const plan = planPublishAutoFit(
      [page({ width: 1600, height: 5120 })],
      toonstudioPreset
    );
    expect(plan.pages[0]?.action).toBe("resize-slice");
    expect(plan.pages[0]?.outputCount).toBe(2);
  });

  it("분할 뒤 장수가 한도를 넘으면 exceedsPageLimit와 안내 문구를 낸다", () => {
    const pages = Array.from({ length: 40 }, (_, index) =>
      page({ id: `p${index}`, height: 3000 })
    );
    const plan = planPublishAutoFit(pages, toonstudioPreset);
    expect(plan.outputPageCount).toBe(120);
    expect(plan.exceedsPageLimit).toBe(true);
    expect(plan.summary).toContain("40장");
  });

  it("크기를 읽을 수 없는 페이지는 원본 유지로 취급한다", () => {
    const plan = planPublishAutoFit([page({ width: 0, height: 0 })], toonstudioPreset);
    expect(plan.pages[0]?.action).toBe("keep");
    expect(plan.pages[0]?.slices).toEqual([]);
    expect(plan.outputPageCount).toBe(1);
  });
});

class FakeCanvas2DContext {
  fillStyle = "#ffffff";
  imageSmoothingEnabled = true;
  imageSmoothingQuality: ImageSmoothingQuality = "high";
  drawImage(..._args: unknown[]): void {
    // noop
  }
  fillRect(..._args: unknown[]): void {
    // noop
  }
}

class FakeCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext(): FakeCanvas2DContext {
    return new FakeCanvas2DContext();
  }
}

const fakeCreateCanvas = (width: number, height: number): HTMLCanvasElement =>
  new FakeCanvas(width, height) as unknown as HTMLCanvasElement;

const fakeEncode = async (
  _canvas: HTMLCanvasElement,
  _mime: string,
  _quality: number | undefined
): Promise<Blob> => new Blob([new Uint8Array(1024)]);

function fakeImage(width: number, height: number): HTMLImageElement {
  return {
    naturalWidth: width,
    naturalHeight: height,
    width,
    height,
  } as unknown as HTMLImageElement;
}

describe("applyPublishAutoFitToPages", () => {
  it("바뀔 페이지가 없으면 이미지를 다시 읽지 않고 원본을 돌려준다", async () => {
    let loads = 0;
    const pages = [page({})];
    const result = await applyPublishAutoFitToPages(pages, toonstudioPreset, {
      loadImage: async () => {
        loads += 1;
        return fakeImage(800, 1000);
      },
      blobToDataUrl: async () => "data:image/jpeg;base64,BBBB",
      createCanvas: fakeCreateCanvas,
      encode: fakeEncode,
    });
    expect(loads).toBe(0);
    expect(result).toEqual(pages);
  });

  it("긴 이미지를 게시 직전에 3장으로 나누고 첫 조각은 원본 id를 잇는다", async () => {
    const pages = [page({ height: 3000 })];
    const result = await applyPublishAutoFitToPages(pages, toonstudioPreset, {
      loadImage: async () => fakeImage(800, 3000),
      blobToDataUrl: async () => "data:image/jpeg;base64,BBBB",
      createCanvas: fakeCreateCanvas,
      encode: fakeEncode,
    });
    expect(result.map((item) => item.height)).toEqual([1280, 1280, 440]);
    expect(result.every((item) => item.width === 800)).toBe(true);
    expect(result[0]?.id).toBe("p1");
    expect(result[1]?.id).not.toBe("p1");
    expect(result[0]?.name).toContain("slice1of3");
    expect(result[2]?.name).toContain("slice3of3");
  });

  it("한 장으로 끝나는 리사이즈는 원본 이름을 유지한다", async () => {
    const pages = [page({ width: 1600, height: 2560 })];
    const result = await applyPublishAutoFitToPages(pages, toonstudioPreset, {
      loadImage: async () => fakeImage(1600, 2560),
      blobToDataUrl: async () => "data:image/jpeg;base64,BBBB",
      createCanvas: fakeCreateCanvas,
      encode: fakeEncode,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.width).toBe(800);
    expect(result[0]?.height).toBe(1280);
    expect(result[0]?.name).toBe("원고.png");
  });

  it("분할 뒤 한도를 넘으면 부분 적용하지 않고 중단한다", async () => {
    const pages = Array.from({ length: 40 }, (_, index) =>
      page({ id: `p${index}`, height: 3000 })
    );
    await expect(
      applyPublishAutoFitToPages(pages, toonstudioPreset, {
        loadImage: async () => fakeImage(800, 3000),
        blobToDataUrl: async () => "data:image/jpeg;base64,BBBB",
        createCanvas: fakeCreateCanvas,
        encode: fakeEncode,
      })
    ).rejects.toThrow("40장");
  });
});
