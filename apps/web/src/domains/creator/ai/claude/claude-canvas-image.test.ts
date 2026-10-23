import { describe, expect, it, vi } from "vitest";

import { ART_DIRECTOR_MAX_PIXELS } from "./claude-art-director-image";
import { canvasToImageFile, type CanvasImageDeps } from "./claude-canvas-image";

type ToBlob = (callback: (blob: Blob | null) => void, type?: string, quality?: number) => void;

function fakeCanvas(width: number, height: number, toBlob: ToBlob): HTMLCanvasElement {
  const context = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
  return { width, height, toBlob, getContext: () => context } as unknown as HTMLCanvasElement;
}

function blobOf(bytes: number, type: string): Blob {
  return new Blob([new Uint8Array(bytes)], { type });
}

function deps(): CanvasImageDeps & { created: HTMLCanvasElement[] } {
  const created: HTMLCanvasElement[] = [];
  return {
    created,
    createCanvas: () => {
      const canvas = fakeCanvas(0, 0, (callback, type) => callback(blobOf(1_000, type ?? "image/png")));
      created.push(canvas);
      return canvas;
    },
  };
}

describe("canvasToImageFile", () => {
  it("작은 캔버스는 PNG로 만들고 쓴 캔버스를 비운다", async () => {
    const canvas = fakeCanvas(800, 1200, (callback, type) => callback(blobOf(50_000, type ?? "image/png")));

    const file = await canvasToImageFile(canvas, "page", deps());

    expect(file.name).toBe("page.png");
    expect(file.type).toBe("image/png");
    expect(canvas.width).toBe(1);
    expect(canvas.height).toBe(1);
  });

  it("PNG가 파일 한도에 가깝게 크면 흰 바탕에 올려 JPEG로 낮춘다", async () => {
    const environment = deps();
    const canvas = fakeCanvas(800, 1200, (callback, type) => callback(blobOf(type === "image/png" ? 11 * 1024 * 1024 : 400_000, type ?? "image/png")));

    const file = await canvasToImageFile(canvas, "page", environment);

    expect(file.type).toBe("image/jpeg");
    expect(file.name).toBe("page.jpg");
    const flat = environment.created.at(-1);
    expect(flat).toBeDefined();
    const context = (flat as unknown as { getContext: () => { fillStyle: string; fillRect: ReturnType<typeof vi.fn> } }).getContext();
    expect(context.fillStyle).toBe("#ffffff");
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 800, 1200);
  });

  it("픽셀 수가 상한을 넘으면 비율을 지켜 줄인 사본을 인코딩한다", async () => {
    const environment = deps();
    const encoded: Array<[number, number]> = [];
    const source = fakeCanvas(8_000, 16_000, () => { throw new Error("원본은 인코딩하지 않는다"); });
    const original = environment.createCanvas;
    environment.createCanvas = () => {
      const copy = original();
      (copy as unknown as { toBlob: ToBlob }).toBlob = (callback, type) => {
        encoded.push([copy.width, copy.height]);
        callback(blobOf(80_000, type ?? "image/png"));
      };
      return copy;
    };

    const file = await canvasToImageFile(source, "page", environment);

    expect(file.type).toBe("image/png");
    const [width, height] = encoded[0] ?? [0, 0];
    expect(width * height).toBeLessThanOrEqual(ART_DIRECTOR_MAX_PIXELS);
    expect(width / height).toBeCloseTo(0.5, 2);
  });

  it("인코딩할 수 없으면 던지고 그래도 캔버스는 비운다", async () => {
    const canvas = fakeCanvas(100, 100, (callback) => callback(null));
    const environment: CanvasImageDeps = { createCanvas: () => fakeCanvas(0, 0, (callback) => callback(null)) };

    await expect(canvasToImageFile(canvas, "page", environment)).rejects.toThrow("encode-failed");
    expect(canvas.width).toBe(1);
  });

  it("크기가 0인 캔버스는 만들지 않는다", async () => {
    await expect(canvasToImageFile(fakeCanvas(0, 0, (callback) => callback(blobOf(1, "image/png"))), "page", deps())).rejects.toThrow("empty-canvas");
  });
});
