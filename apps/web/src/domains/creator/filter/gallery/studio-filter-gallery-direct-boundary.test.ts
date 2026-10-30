import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createStudioImageFilterResidentWorkerSession,
  createStudioImageFilterWorkerSession,
  runStudioImageFilterWorker,
  studioImageFilterRequiresWorker,
} from "../../studio-image-filter-worker-client";

import { applyStudioFilterGalleryStack } from "./studio-filter-gallery-engine";
import { findStudioFilterGalleryEffect } from "./studio-filter-gallery-registry";

import type { StudioFilterGalleryStack } from "./studio-filter-gallery-types";

const STACK: StudioFilterGalleryStack = {
  version: 1, seed: 19, entries: [{ id: "artistic.dry-brush", params: {} }],
};

function source(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set([83, 127, 199, 255], offset);
  return { width, height, data };
}

afterEach(() => vi.restoreAllMocks());

describe("갤러리의 공통 direct 실행 경계", () => {
  it.each(["one-shot", "session", "resident"] as const)("%s는 Worker 판정과 같은 큰 스택을 커널 실행 전에 거부한다", async (kind) => {
    const imageData = source(512, 256);
    const original = imageData.data.slice();
    const el = { filterGallery: STACK };
    expect(studioImageFilterRequiresWorker(el, imageData.width, imageData.height)).toBe(true);
    const effect = findStudioFilterGalleryEffect("artistic.dry-brush");
    if (!effect) throw new Error("드라이 브러시 등록이 필요합니다.");
    const apply = vi.spyOn(effect, "apply");
    const session = kind === "session" ? createStudioImageFilterWorkerSession({ executionMode: "direct" }) : null;
    const resident = kind === "resident" ? createStudioImageFilterResidentWorkerSession({ executionMode: "direct" }) : null;
    try {
      const request = { imageData, el };
      const pending = resident
        ? resident.run(request, { sourceRevision: 1 })
        : session
          ? session.run(request)
          : runStudioImageFilterWorker(request, { executionMode: "direct" });
      await expect(pending).rejects.toMatchObject({
        name: "StudioFilterGalleryWorkerRequiredError", code: "STUDIO_FILTER_GALLERY_WORKER_REQUIRED",
      });
      expect(apply).not.toHaveBeenCalled();
      expect(imageData.data).toEqual(original);
    } finally {
      session?.dispose();
      resident?.dispose();
    }
  });

  it("경량 direct는 같은 갤러리 결과를 내고 상주 원본을 보존한다", async () => {
    const imageData = source(8, 8);
    const original = imageData.data.slice();
    const expected = source(8, 8);
    expect(studioImageFilterRequiresWorker({ filterGallery: STACK }, 8, 8)).toBe(false);
    expect(applyStudioFilterGalleryStack(expected, STACK)).toBe("applied");
    const session = createStudioImageFilterResidentWorkerSession({ executionMode: "direct" });
    try {
      const result = await session.run({ imageData, el: { filterGallery: STACK } }, { sourceRevision: 2 });
      expect(result.execution).toBe("direct");
      expect(result.imageData.data).toEqual(expected.data);
      expect(imageData.data).toEqual(original);
    } finally {
      session.dispose();
    }
  });

  it.each([{ enabled: false }, { opacity: 0 }])("비활성 겹 %j는 크기만으로 direct를 막지 않는다", async (inactive) => {
    const filterGallery: StudioFilterGalleryStack = { ...STACK, entries: STACK.entries.map((entry) => ({ ...entry, ...inactive })) };
    const imageData = source(512, 256);
    const original = imageData.data.slice();
    expect(studioImageFilterRequiresWorker({ filterGallery }, 512, 256)).toBe(false);
    const result = await runStudioImageFilterWorker({ imageData, el: { filterGallery } }, { executionMode: "direct" });
    expect(result.execution).toBe("direct");
    expect(result.imageData.data).toEqual(original);
  });
});
