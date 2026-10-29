import { beforeEach, describe, expect, it, vi } from "vitest";

import { STUDIO_BG3D_CAPTURE_PROFILE_RGBA8_DEPTH_V1 } from "./studio-bg3d-capture-adapter";
import { acquireStudioBg3dCaptureEnvironmentReceipt, assertStudioBg3dCaptureEnvironmentCurrent,
  attachStudioBg3dCaptureEnvironmentReceipt, publishStudioBg3dCaptureEnvironment } from "./studio-bg3d-capture-environment-receipt";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";
import { STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES } from "./studio-bg3d-shot-batch";
import { buildStudioBg3dTiledImages } from "./studio-bg3d-tiled-artifact-client";
import { buildStudioBg3dTiledShotArtifacts } from "./studio-bg3d-tiled-shot-artifacts";

vi.mock("./studio-bg3d-tiled-artifact-client", () => ({
  buildStudioBg3dTiledImages: vi.fn(),
}));

function input(): Parameters<typeof buildStudioBg3dTiledShotArtifacts>[0] {
  return {
    shot: {
      shotId: "shot-1",
      shotName: "첫 컷",
      shotIndex: 0,
      capture: {
        width: 256, height: 256, requestedHeight: 256, wasReduced: false,
        includeDepth: false, shadows: false, shadowMapSize: 0,
        background: { color: "#ffffff", alpha: 1 },
      },
      files: [],
    },
    adapter: {
      backend: "three-webgl", engineId: "three", engineVersion: "184",
      implementationRevision: "fixture-v1", graphicsApi: "webgl2",
      profileId: STUDIO_BG3D_CAPTURE_PROFILE_RGBA8_DEPTH_V1,
      getSourceSize: () => ({ width: 256, height: 256 }),
      capture: async () => { throw new Error("타일 클라이언트 mock 밖의 캡처는 허용하지 않습니다."); },
    },
    settings: {
      line: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.line,
      tone: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.tone,
    },
    passes: ["beauty"],
    includeLayeredPsd: false,
    committedArtifactBytes: 0,
    includeNormals: false,
    assertCurrent: () => undefined,
  };
}

const png = new Blob([new Uint8Array(57)], { type: "image/png" });
const result = { images: [{ pass: "beauty" as const, png }], skipped: [] };

function deferred<T>() {
  let complete: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => { complete = resolve; });
  return { promise, resolve(value: T) {
    if (!complete) throw new Error("지연 입력이 아직 준비되지 않았습니다.");
    complete(value);
  } };
}

beforeEach(() => {
  vi.mocked(buildStudioBg3dTiledImages).mockReset().mockResolvedValue(result);
});

describe("타일 컷 artifact의 취소와 누적 예산", () => {
  it("타일 PNG 완료 대기 중 환경이 바뀌면 최종 artifact로 인계하지 않는다", async () => {
    const scene = {}, renderer = {};
    const owner = publishStudioBg3dCaptureEnvironment(scene, renderer, {
      fingerprint: "tile-A", ready: Promise.resolve(true), isApplied: () => true,
    });
    const receipt = await acquireStudioBg3dCaptureEnvironmentReceipt(scene, renderer);
    const output = { images: [...result.images], skipped: [] };
    attachStudioBg3dCaptureEnvironmentReceipt(output, receipt);
    const finished = deferred<typeof output>();
    vi.mocked(buildStudioBg3dTiledImages).mockImplementationOnce(() => finished.promise);
    const pending = buildStudioBg3dTiledShotArtifacts({ ...input(), expectedEnvironmentFingerprint: "tile-A" });
    const rejected = expect(pending).rejects.toMatchObject({ code: "superseded" });
    const replacement = publishStudioBg3dCaptureEnvironment(scene, renderer, {
      fingerprint: "tile-B", ready: Promise.resolve(true), isApplied: () => true,
    });
    try {
      finished.resolve(output);
      await rejected;
      expect(output.images[0]?.png).toBe(png);
    } finally { replacement.dispose(); owner.dispose(); }
  });

  it("타일 result의 영수증을 shot artifact에 승계하고 expected 의도도 보존한다", async () => {
    const scene = {}, renderer = {};
    const owner = publishStudioBg3dCaptureEnvironment(scene, renderer, {
      fingerprint: "tile-current", ready: Promise.resolve(true), isApplied: () => true,
    });
    try {
      const receipt = await acquireStudioBg3dCaptureEnvironmentReceipt(scene, renderer);
      const output = { images: [...result.images], skipped: [] };
      attachStudioBg3dCaptureEnvironmentReceipt(output, receipt);
      vi.mocked(buildStudioBg3dTiledImages).mockResolvedValueOnce(output);
      const artifacts = await buildStudioBg3dTiledShotArtifacts({ ...input(), expectedEnvironmentFingerprint: "tile-current" });
      expect(() => assertStudioBg3dCaptureEnvironmentCurrent(artifacts, "tile-current")).not.toThrow();
      expect(() => assertStudioBg3dCaptureEnvironmentCurrent(artifacts, "different-document")).toThrow(expect.objectContaining({ code: "fingerprint-mismatch" }));
      owner.dispose();
      expect(() => assertStudioBg3dCaptureEnvironmentCurrent(artifacts)).toThrow(expect.objectContaining({ code: "disposed" }));
    } finally { owner.dispose(); }
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5, STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES + 1])(
    "누적 예산 %s가 잘못되면 GPU와 Worker 실행 전에 거부한다",
    async (committedArtifactBytes) => {
      await expect(buildStudioBg3dTiledShotArtifacts({
        ...input(), committedArtifactBytes,
      })).rejects.toBeInstanceOf(RangeError);
      expect(buildStudioBg3dTiledImages).not.toHaveBeenCalled();
    },
  );

  it("타일 완료와 취소가 겹치면 결과를 recovery에 넘기지 않는다", async () => {
    const controller = new AbortController();
    vi.mocked(buildStudioBg3dTiledImages).mockImplementationOnce(async () => {
      controller.abort();
      return result;
    });
    await expect(buildStudioBg3dTiledShotArtifacts({
      ...input(), signal: controller.signal,
    })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("이전 완료 컷과 새 PNG 합계가 예산을 넘으면 원본 완료 컷을 수정하지 않는다", async () => {
    const request = { ...input(), committedArtifactBytes: STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES - 56 };
    await expect(buildStudioBg3dTiledShotArtifacts(request)).rejects.toBeInstanceOf(RangeError);
    expect(request.committedArtifactBytes).toBe(STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES - 56);
  });

  it("정확한 PNG 예산은 허용하고 미지원 타일 PSD는 명시적인 fallback으로 기록한다", async () => {
    const output = await buildStudioBg3dTiledShotArtifacts({
      ...input(), includeLayeredPsd: true,
      committedArtifactBytes: STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES - 57,
    });
    expect(output.artifactBytes).toBe(57);
    expect(output.images[0]?.png).toBe(png);
    expect(output.layeredPsds).toEqual([]);
    expect(output.psdFallbacks).toEqual([{ shotId: "shot-1", shotName: "첫 컷", reason: "budget" }]);
  });
});
