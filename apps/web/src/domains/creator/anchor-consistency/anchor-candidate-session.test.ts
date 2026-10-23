import { describe, expect, it } from "vitest";

import { AnchorCaptureError } from "./anchor-capture-session";
import {
  analyzeAnchorImageFile,
  anchorFailureOf,
  extractAnchorSetFeatures,
  runAnchorCandidateQueue,
  type AnchorCandidateDeps,
  type AnchorCandidatePatch,
} from "./anchor-candidate-session";
import { extractAnchorFeatures } from "./anchor-image-features";
import { AnchorFeatureError, type AnchorRaster } from "./anchor-raster";
import { FIGURE_STYLE_A, FIGURE_STYLE_B, figureRaster } from "./anchor-synthetic-raster";
import { fakeCapturedFrame, fakePngFile } from "./anchor-test-kit";

/** 호출 순서대로 미리 정한 래스터를 돌려주는 가짜 디코더와 직접 계산하는 추출기. */
function depsFrom(rasters: readonly (AnchorRaster | Error)[]): AnchorCandidateDeps & { readonly decodeCalls: () => number } {
  const queue = [...rasters];
  let calls = 0;
  return {
    decode: async () => {
      calls += 1;
      const next = queue.shift();
      if (!next) throw new Error("준비된 래스터가 없어요");
      if (next instanceof Error) throw next;
      return next;
    },
    extract: async (raster, options) => {
      if (options.signal.aborted) throw new AnchorFeatureError("cancelled");
      return extractAnchorFeatures(raster);
    },
    decodeCalls: () => calls,
  };
}

const figureA = (): AnchorRaster => figureRaster({ style: FIGURE_STYLE_A });
const figureB = (): AnchorRaster => figureRaster({ style: FIGURE_STYLE_B });

function collect(): { readonly updates: [string, AnchorCandidatePatch][]; readonly onUpdate: (id: string, patch: AnchorCandidatePatch) => void } {
  const updates: [string, AnchorCandidatePatch][] = [];
  return { updates, onUpdate: (id, patch) => { updates.push([id, patch]); } };
}

const statusesOf = (updates: readonly [string, AnchorCandidatePatch][], id: string): string[] =>
  updates.filter(([key]) => key === id).map(([, patch]) => patch.status);

describe("anchorFailureOf", () => {
  it("캡처 오류와 분석 오류의 코드를 그대로 쓴다", () => {
    expect(anchorFailureOf(new AnchorCaptureError("file-too-large", { params: { bytes: 9, max: 8 } }), false))
      .toEqual({ code: "file-too-large", params: { bytes: 9, max: 8 } });
    expect(anchorFailureOf(new AnchorFeatureError("raster-too-small"), false)).toEqual({ code: "raster-too-small", params: {} });
  });

  it("알 수 없는 오류는 source-failed, 취소 중이면 cancelled 다", () => {
    expect(anchorFailureOf(new Error("?"), false).code).toBe("source-failed");
    expect(anchorFailureOf(new Error("?"), true).code).toBe("cancelled");
  });
});

describe("analyzeAnchorImageFile", () => {
  it("파일을 읽고 풀어 특징과 크기를 돌려준다", async () => {
    const deps = depsFrom([figureA()]);
    const result = await analyzeAnchorImageFile(fakePngFile("후보.png", 640, 960), deps, new AbortController().signal);
    expect(result.width).toBe(640);
    expect(result.height).toBe(960);
    expect(result.byteLength).toBeGreaterThan(0);
    expect(result.features.palette.length).toBeGreaterThan(0);
  });

  it("이미지가 아닌 파일은 풀기 전에 거절한다", async () => {
    const deps = depsFrom([figureA()]);
    const file = new File([new Uint8Array(64)], "메모.png", { type: "image/png" });
    await expect(analyzeAnchorImageFile(file, deps, new AbortController().signal)).rejects.toMatchObject({ code: "unsupported-format" });
    expect(deps.decodeCalls()).toBe(0);
  });

  it("너무 큰 파일은 풀기 전에 거절한다", async () => {
    const deps = depsFrom([figureA()]);
    const file = fakePngFile("큰파일.png", 800, 1200, 1, 8 * 1024 * 1024 + 1);
    await expect(analyzeAnchorImageFile(file, deps, new AbortController().signal)).rejects.toMatchObject({ code: "file-too-large" });
    expect(deps.decodeCalls()).toBe(0);
  });

  it("픽셀 수가 한도를 넘는 이미지는 풀기 전에 거절한다", async () => {
    const deps = depsFrom([figureA()]);
    const failure = await analyzeAnchorImageFile(fakePngFile("거대.png", 4096, 4096 + 1), deps, new AbortController().signal).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AnchorCaptureError);
    expect(deps.decodeCalls()).toBe(0);
  });

  it("디코더 오류는 그대로 전달한다", async () => {
    const deps = depsFrom([new AnchorCaptureError("decode-failed")]);
    await expect(analyzeAnchorImageFile(fakePngFile("깨짐.png"), deps, new AbortController().signal)).rejects.toMatchObject({ code: "decode-failed" });
  });

  it("너무 작은 래스터는 분석 단계에서 이유를 알린다", async () => {
    const deps = depsFrom([figureRaster({ width: 8, height: 8 })]);
    const deps2: AnchorCandidateDeps = { ...deps, extract: async (raster) => extractAnchorFeatures(raster) };
    await expect(analyzeAnchorImageFile(fakePngFile("작은그림.png"), deps2, new AbortController().signal)).rejects.toMatchObject({ code: "raster-too-small" });
  });
});

describe("extractAnchorSetFeatures", () => {
  it("프레임마다 특징을 계산하고 같은 해시는 캐시를 쓴다", async () => {
    const front = fakeCapturedFrame("front");
    const back = fakeCapturedFrame("back");
    const deps = depsFrom([figureA(), figureB()]);
    const cache = new Map();
    const first = await extractAnchorSetFeatures([front, back], deps, new AbortController().signal, cache);
    expect(first.features.map((item) => item.angleId)).toEqual(["front", "back"]);
    expect(first.failed).toEqual([]);
    expect(cache.size).toBe(2);
    const again = await extractAnchorSetFeatures([front, back], deps, new AbortController().signal, cache);
    expect(again.features).toHaveLength(2);
    expect(deps.decodeCalls()).toBe(2);
  });

  it("한 각도가 실패해도 나머지는 계산하고 실패한 각도와 이유를 돌려준다", async () => {
    const deps = depsFrom([new AnchorCaptureError("decode-failed"), figureB()]);
    const result = await extractAnchorSetFeatures([fakeCapturedFrame("front"), fakeCapturedFrame("left")], deps, new AbortController().signal);
    expect(result.features.map((item) => item.angleId)).toEqual(["left"]);
    expect(result.failed).toEqual([{ angleId: "front", failure: { code: "decode-failed", params: {} } }]);
  });

  it("취소하면 cancelled 로 끝난다", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(extractAnchorSetFeatures([fakeCapturedFrame("front")], depsFrom([figureA()]), controller.signal))
      .rejects.toMatchObject({ code: "cancelled" });
  });
});

describe("runAnchorCandidateQueue", () => {
  it("후보를 큐 순서대로 한 장씩 분석한다", async () => {
    const { updates, onUpdate } = collect();
    const deps = depsFrom([figureA(), figureB()]);
    await runAnchorCandidateQueue({
      jobs: [{ id: "c1", file: fakePngFile("하나.png") }, { id: "c2", file: fakePngFile("둘.png", 700, 1000, 2) }],
      deps,
      onUpdate,
    });
    expect(updates.map(([id, patch]) => `${id}:${patch.status}`)).toEqual(["c1:analyzing", "c1:done", "c2:analyzing", "c2:done"]);
    const done = updates.find(([id, patch]) => id === "c2" && patch.status === "done");
    expect(done?.[1].width).toBe(700);
    expect(done?.[1].features).toBeDefined();
  });

  it("한 장이 실패해도 나머지를 계속하고 실패 이유를 남긴다", async () => {
    const { updates, onUpdate } = collect();
    await runAnchorCandidateQueue({
      jobs: [
        { id: "bad", file: new File([new Uint8Array(40)], "엉망.png", { type: "image/png" }) },
        { id: "ok", file: fakePngFile("정상.png") },
      ],
      deps: depsFrom([figureA()]),
      onUpdate,
    });
    expect(statusesOf(updates, "bad")).toEqual(["analyzing", "failed"]);
    expect(updates.find(([id, patch]) => id === "bad" && patch.status === "failed")?.[1].errorCode).toBe("unsupported-format");
    expect(statusesOf(updates, "ok")).toEqual(["analyzing", "done"]);
  });

  it("알 수 없는 오류는 source-failed 로 알린다", async () => {
    const { updates, onUpdate } = collect();
    await runAnchorCandidateQueue({ jobs: [{ id: "x", file: fakePngFile("x.png") }], deps: depsFrom([new Error("예상 밖")]), onUpdate });
    expect(updates.at(-1)?.[1]).toMatchObject({ status: "failed", errorCode: "source-failed" });
  });

  it("처리 중 취소하면 지금 후보와 남은 후보가 cancelled 가 되고 끝난 후보는 그대로다", async () => {
    const controller = new AbortController();
    const { updates, onUpdate } = collect();
    const inner = depsFrom([figureA(), figureB(), figureA()]);
    const deps: AnchorCandidateDeps = {
      ...inner,
      extract: async (raster, options) => {
        const features = await inner.extract(raster, options);
        if (inner.decodeCalls() === 2) controller.abort();
        return features;
      },
    };
    await runAnchorCandidateQueue({
      jobs: [1, 2, 3].map((n) => ({ id: `c${n}`, file: fakePngFile(`${n}.png`, 640, 960, n) })),
      deps,
      signal: controller.signal,
      onUpdate,
    });
    expect(statusesOf(updates, "c1")).toEqual(["analyzing", "done"]);
    expect(statusesOf(updates, "c2")).toEqual(["analyzing", "cancelled"]);
    expect(statusesOf(updates, "c3")).toEqual(["cancelled"]);
  });

  it("시간 상한을 넘기면 그 후보만 timeout 으로 실패한다", async () => {
    const { updates, onUpdate } = collect();
    const hanging: AnchorCandidateDeps = {
      decode: () => new Promise<AnchorRaster>(() => undefined),
      extract: async (raster) => extractAnchorFeatures(raster),
    };
    await runAnchorCandidateQueue({ jobs: [{ id: "slow", file: fakePngFile("느림.png") }], deps: hanging, perCandidateTimeoutMs: 20, onUpdate });
    expect(updates.at(-1)?.[1]).toMatchObject({ status: "failed", errorCode: "timeout" });
  });

  it("실패한 후보를 다시 큐에 넣으면 이번에는 끝난다", async () => {
    const { updates, onUpdate } = collect();
    const job = { id: "retry", file: fakePngFile("재시도.png") };
    await runAnchorCandidateQueue({ jobs: [job], deps: depsFrom([new AnchorCaptureError("decode-failed")]), onUpdate });
    expect(updates.at(-1)?.[1].status).toBe("failed");
    await runAnchorCandidateQueue({ jobs: [job], deps: depsFrom([figureA()]), onUpdate });
    expect(updates.at(-1)?.[1].status).toBe("done");
  });
});
