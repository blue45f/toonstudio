import { afterEach, describe, expect, it } from "vitest";

import { Studio3dGenerationService } from "./studio-3d-generation.service";
import { STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION } from "./studio-3d-generation-provider";
import {
  createTripo3dProvider,
  isTripo3dCreditsExhaustedError,
  selectTripo3dModelVersion,
  TRIPO_3D_CREDITS_EXHAUSTED_PROVIDER_CODE,
  TRIPO_3D_PROVIDER_ID,
  type Tripo3dFetch,
} from "./studio-tripo3d-provider";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function createValidGlbBytes(): Uint8Array {
  const buffer = new ArrayBuffer(28);
  const view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, 28, true);
  view.setUint32(12, 8, true);
  view.setUint32(16, 0x4e4f534a, true);
  const bytes = new Uint8Array(buffer);
  bytes.set(new TextEncoder().encode('{"a":1} '), 20);
  return bytes;
}

describe("Tripo3dProvider", () => {
  it("v3.1-20260211 / P1-20260311 / P2-20260801 모델 자동 라우팅을 수행한다", () => {
    expect(selectTripo3dModelVersion({ prompt: "detailed webtoon hero" })).toBe("v3.1-20260211");
    expect(selectTripo3dModelVersion({ prompt: "low-poly street bench" })).toBe("P1-20260311");
    expect(selectTripo3dModelVersion({ prompt: "low-poly street bench", quad: true })).toBe(
      "P2-20260801",
    );
  });

  it("text-to-3d 및 image-to-3d 제출·폴링·GLB 다운로드를 수행한다", async () => {
    const requests: Array<{ url: string; method: string; headers: Headers; bodyText?: string }> = [];
    const glbBytes = createValidGlbBytes();

    const fetchImpl: Tripo3dFetch = async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const bodyText = typeof init?.body === "string" ? init.body : undefined;
      requests.push({
        url,
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers),
        bodyText,
      });

      if (url.endsWith("/v2/openapi/upload/sts")) {
        return new Response(
          JSON.stringify({ code: 0, data: { image_token: "img_tok_tripo_1" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/v3/generation/image-to-model")) {
        return new Response(
          JSON.stringify({ code: 0, data: { task_id: "task-tripo-101" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/v2/openapi/task/task-tripo-101")) {
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              task_id: "task-tripo-101",
              status: "success",
              progress: 100,
              output: { pbr_model: "https://cdn.tripo3d.ai/models/task-tripo-101.glb" },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url === "https://cdn.tripo3d.ai/models/task-tripo-101.glb") {
        return new Response(new Uint8Array(glbBytes), {
          status: 200,
          headers: { "Content-Type": "model/gltf-binary" },
        });
      }
      return new Response("Not Found", { status: 404 });
    };

    const provider = createTripo3dProvider({
      apiKey: "tripo:tsk_test_tripo_key",
      fetchImpl,
      now: () => 1_760_000_000_000,
    });

    const caps = await provider.capabilities();
    expect(caps.providerId).toBe(TRIPO_3D_PROVIDER_ID);
    expect(caps.modes).toEqual(["text-to-3d", "image-to-3d", "multiview-to-3d", "texture-only"]);

    const signal = new AbortController().signal;
    const submission = await provider.submit(
      {
        schemaVersion: STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION,
        requestId: "studio-tripo-req-1",
        mode: "image-to-3d",
        images: [
          {
            filename: "hero.png",
            mimeType: "image/png",
            bytes: new Uint8Array([137, 80, 78, 71]),
          },
        ],
        options: {
          meshMode: "Quad",
          targetFaceCount: 40_000,
        },
      },
      signal,
    );

    expect(submission.taskUuid).toBe("task-tripo-101");
    expect(submission.subscriptionKey).toBe("v3.1-20260211");
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer tsk_test_tripo_key");

    const progress = await provider.poll(submission, signal);
    expect(progress.state).toBe("succeeded");

    const downloaded = await provider.download(submission, signal);
    expect(downloaded.bytes).toEqual(glbBytes);
  });

  it("크레딧 소진(코드 2010 / HTTP 402) 오류를 감지하고 Studio3dGenerationService와 통합 동작한다", async () => {
    delete process.env.DATABASE_URL;
    process.env.STUDIO_3D_JOB_SECRET = "test-secret-for-tripo-3d-provider-123456";
    const glbBytes = createValidGlbBytes();

    const exhaustedProvider = createTripo3dProvider({
      apiKey: "tsk_exhausted_key",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({ code: 2010, message: "You have exceeded your credit limit." }),
          { status: 402, headers: { "Content-Type": "application/json" } },
        ),
    });

    await expect(
      exhaustedProvider.submit(
        {
          schemaVersion: STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION,
          requestId: "req-402",
          mode: "text-to-3d",
          prompt: "castle tower",
        },
        new AbortController().signal,
      ),
    ).rejects.toSatisfy((err: unknown) => {
      expect(isTripo3dCreditsExhaustedError(err)).toBe(true);
      expect((err as { providerCode?: string }).providerCode).toBe(
        TRIPO_3D_CREDITS_EXHAUSTED_PROVIDER_CODE,
      );
      return true;
    });

    const service = new Studio3dGenerationService();
    service.setTripo3dFetchForTesting(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/v3/generation/text-to-model")) {
        return new Response(JSON.stringify({ code: 0, data: { task_id: "svc-tripo-99" } }), {
          status: 200,
        });
      }
      if (url.endsWith("/v2/openapi/task/svc-tripo-99")) {
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              task_id: "svc-tripo-99",
              status: "success",
              output: { pbr_model: "https://cdn.tripo3d.ai/models/svc-tripo-99.glb" },
            },
          }),
          { status: 200 },
        );
      }
      return new Response(new Uint8Array(glbBytes), { status: 200 });
    });

    expect(service.status().supportedProviders).toContain(TRIPO_3D_PROVIDER_ID);

    const created = await service.create(
      "user-tripo-1",
      "idem-tripo-1",
      {
        mode: "text-to-3d",
        prompt: "low-poly webtoon cafe exterior",
        transport: "byok",
        options: { provider: TRIPO_3D_PROVIDER_ID, pose: "T-Pose" },
      },
      "tsk_byok_tripo_key",
    );
    expect(created.request.provider).toBe(TRIPO_3D_PROVIDER_ID);
    expect(created.state).toBe("generating-geometry");

    const ready = await service.advance("user-tripo-1", created.id, "tsk_byok_tripo_key");
    expect(ready.state).toBe("ready");
    expect(ready.artifactRevision?.byteLength).toBe(glbBytes.byteLength);
  });
});
