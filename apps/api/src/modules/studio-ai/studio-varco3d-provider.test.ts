import { afterEach, describe, expect, it } from "vitest";

import { Studio3dGenerationService } from "./studio-3d-generation.service";
import { STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION } from "./studio-3d-generation-provider";
import {
  createVarco3dProvider,
  isVarco3dCreditsExhaustedError,
  VARCO_3D_CREDITS_EXHAUSTED_PROVIDER_CODE,
  VARCO_3D_PROVIDER_ID,
  type Varco3dFetch,
} from "./studio-varco3d-provider";

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

describe("Varco3dProvider", () => {
  it("submits, polls, and downloads via NC AI OpenAPI surface", async () => {
    const requests: Array<{ url: string; method: string; headers: Headers }> = [];
    const glbBytes = createValidGlbBytes();

    const fetchImpl: Varco3dFetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      requests.push({
        url,
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers),
      });

      if (url.endsWith("/3d/varco/v1/image-to-3d")) {
        return new Response(
          JSON.stringify({ requestId: "req-nc-101", status: "COMPLETED" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/inference/result/req-nc-101")) {
        return new Response(
          JSON.stringify({
            requestId: "req-nc-101",
            status: "COMPLETED",
            model_url: "https://cdn.varco.ai/models/req-nc-101.glb",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url === "https://cdn.varco.ai/models/req-nc-101.glb") {
        return new Response(new Uint8Array(glbBytes), {
          status: 200,
          headers: { "Content-Type": "model/gltf-binary" },
        });
      }
      return new Response("Not Found", { status: 404 });
    };

    const provider = createVarco3dProvider({
      apiKey: "varco:test-nc-openapi-key",
      surface: "nc-openapi",
      fetchImpl,
      now: () => 1_760_000_000_000,
    });

    const caps = await provider.capabilities();
    expect(caps.providerId).toBe(VARCO_3D_PROVIDER_ID);
    expect(caps.modes).toEqual(["image-to-3d", "multiview-to-3d"]);

    const signal = new AbortController().signal;
    const submission = await provider.submit(
      {
        schemaVersion: STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION,
        requestId: "studio-req-1",
        mode: "image-to-3d",
        images: [
          {
            filename: "character.png",
            mimeType: "image/png",
            bytes: new Uint8Array([137, 80, 78, 71]),
          },
        ],
        options: {
          meshMode: "Quad",
          targetFaceCount: 150_000,
          seed: 42,
        },
      },
      signal,
    );

    expect(submission).toEqual({
      schemaVersion: STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION,
      providerId: VARCO_3D_PROVIDER_ID,
      requestId: "studio-req-1",
      taskUuid: "req-nc-101",
      subscriptionKey: "nc-openapi",
      jobUuids: ["req-nc-101"],
      consumedCredits: null,
      submittedAt: new Date(1_760_000_000_000).toISOString(),
    });
    expect(requests[0]?.headers.get("openapi_key")).toBe("test-nc-openapi-key");

    const progress = await provider.poll(submission, signal);
    expect(progress.state).toBe("succeeded");
    expect(progress.jobs[0]?.status).toBe("Completed");

    const downloaded = await provider.download(submission, signal);
    expect(downloaded.bytes).toEqual(glbBytes);
    expect(downloaded.mimeType).toBe("model/gltf-binary");
    expect(downloaded.filename).toBe("req-nc-101.glb");
  });

  it("supports multiview-to-3d via VARCO 3D Studio API surface", async () => {
    const requests: string[] = [];
    const glbBytes = createValidGlbBytes();

    const fetchImpl: Varco3dFetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      requests.push(url);
      if (url.endsWith("/v1/mv/generate")) {
        return new Response(JSON.stringify({ taskId: "mv-task-202" }), { status: 200 });
      }
      if (url.endsWith("/v1/mv/tasks/mv-task-202")) {
        return new Response(JSON.stringify({ taskId: "mv-task-202", status: "COMPLETED" }), { status: 200 });
      }
      if (url.endsWith("/v2/tasks/mv-task-202/download-glb")) {
        return new Response(
          JSON.stringify({ glbUrl: "https://cdn.varco.ai/models/mv-task-202.glb" }),
          { status: 200 },
        );
      }
      if (url === "https://cdn.varco.ai/models/mv-task-202.glb") {
        return new Response(new Uint8Array(glbBytes), { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    };

    const provider = createVarco3dProvider({
      apiKey: "studio-token-xyz",
      surface: "studio",
      fetchImpl,
    });
    const signal = new AbortController().signal;
    const submission = await provider.submit(
      {
        schemaVersion: STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION,
        requestId: "studio-req-mv",
        mode: "multiview-to-3d",
        images: [
          { filename: "front.png", mimeType: "image/png", bytes: new Uint8Array([1, 2]) },
          { filename: "back.png", mimeType: "image/png", bytes: new Uint8Array([3, 4]) },
        ],
      },
      signal,
    );

    expect(submission.subscriptionKey).toBe("studio-mv");
    expect(submission.taskUuid).toBe("mv-task-202");

    const progress = await provider.poll(submission, signal);
    expect(progress.state).toBe("succeeded");

    const artifact = await provider.download(submission, signal);
    expect(artifact.bytes).toEqual(glbBytes);
    expect(requests).toEqual([
      "https://3d.varco.ai/api/external-api/v1/mv/generate",
      "https://3d.varco.ai/api/external-api/v1/mv/tasks/mv-task-202",
      "https://3d.varco.ai/api/external-api/v2/tasks/mv-task-202/download-glb",
      "https://cdn.varco.ai/models/mv-task-202.glb",
    ]);
  });

  it("integrates end-to-end with Studio3dGenerationService for varco-3d jobs", async () => {
    process.env.NODE_ENV = "test";
    process.env.STUDIO_3D_JOB_SECRET = "test-studio-3d-job-secret-value-123456";
    delete process.env.DATABASE_URL;

    const glbBytes = createValidGlbBytes();
    const fetchImpl: Varco3dFetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith("/3d/varco/v1/image-to-3d")) {
        return new Response(JSON.stringify({ requestId: "varco-job-777" }), { status: 200 });
      }
      if (url.endsWith("/inference/result/varco-job-777")) {
        return new Response(
          JSON.stringify({
            requestId: "varco-job-777",
            status: "COMPLETED",
            model_url: "https://cdn.varco.ai/models/varco-job-777.glb",
          }),
          { status: 200 },
        );
      }
      if (url === "https://cdn.varco.ai/models/varco-job-777.glb") {
        return new Response(new Uint8Array(glbBytes), { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    };

    const service = new Studio3dGenerationService();
    service.setVarco3dFetchForTesting(fetchImpl);

    expect(service.status().supportedProviders).toEqual(["hyper3d-rodin", "varco-3d"]);

    const created = await service.create(
      "user-varco-1",
      "idem-varco-1",
      {
        mode: "image-to-3d",
        images: [
          {
            filename: "hero.png",
            mimeType: "image/png",
            dataBase64: Buffer.from([137, 80, 78, 71]).toString("base64"),
          },
        ],
        options: {
          provider: "varco-3d",
          targetFaceCount: 200_000,
        },
        transport: "byok",
      },
      "varco:user-supplied-openapi-key",
    );

    expect(created.state).toBe("generating-geometry");
    expect(created.request.provider).toBe("varco-3d");
    expect(created.providerTaskId).toBe("varco-job-777");

    const ready = await service.advance(
      "user-varco-1",
      created.id,
      "varco:user-supplied-openapi-key",
    );

    expect(ready.state).toBe("ready");
    expect(ready.artifactRevision).toBeDefined();

    const stored = await service.artifact("user-varco-1", ready.artifactRevision!.id);
    expect(stored.bytes).toEqual(glbBytes);
    expect(stored.revision.mimeType).toBe("model/gltf-binary");
  });

  it("maps HTTP 402 No available credits to non-retryable credits-exhausted error", async () => {
    const fetchImpl: Varco3dFetch = async () =>
      new Response(
        JSON.stringify({
          statusCode: 402,
          error: "No available credits to process the request",
        }),
        { status: 402, headers: { "Content-Type": "application/json" } },
      );

    const provider = createVarco3dProvider({
      apiKey: "varco:credit-depleted-key",
      surface: "nc-openapi",
      fetchImpl,
    });

    let caught: unknown = null;
    try {
      await provider.submit(
        {
          schemaVersion: STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION,
          requestId: "req-402",
          mode: "image-to-3d",
          images: [
            {
              filename: "prop.png",
              mimeType: "image/png",
              bytes: new Uint8Array([137, 80, 78, 71]),
            },
          ],
        },
        new AbortController().signal,
      );
    } catch (err) {
      caught = err;
    }

    expect(isVarco3dCreditsExhaustedError(caught)).toBe(true);
    expect(caught).toMatchObject({
      code: "provider-rejected",
      retryable: false,
      responseStatus: 402,
      providerCode: VARCO_3D_CREDITS_EXHAUSTED_PROVIDER_CODE,
    });
  });
});
