import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

import { afterEach, describe, expect, it, vi } from "vitest";

import { calculateStudioCrc32 } from "../studio-crc32";
import {
  STUDIO_PRODUCTION_JOB_LIMITS,
  type StudioProductionJob,
  type StudioProductionJobInput,
} from "../toolchain/studio-production-jobs";
import { studioProductionTool } from "../toolchain/studio-production-toolchain";
import { StudioToonBridgeClient, type StudioToonBridgeStatus } from "../toolchain/studio-toonbridge-client";
import {
  isStudioBlenderLoopbackUrl, isStudioBlenderServiceRevision, runStudioBlenderJob,
  STUDIO_BLENDER_SERVICE_REVISION, type BlenderBridgeOperation,
} from "./studio-bg3d-blender-bridge";

type Stage = "create" | "upload" | "start" | "poll" | "cancel";
const source = new Uint8Array([66, 76, 69, 78, 68, 69, 82]);
const remoteId = "job_remote_12345678";
const hash = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const supportedStatus: StudioToonBridgeStatus = {
  protocol: "toonstudio.production-toolchain", version: 2,
  serviceVersion: STUDIO_BLENDER_SERVICE_REVISION, activeJobs: 0, retainedJobs: 0,
};

function glb(json = '{"asset":{"version":"2.0"}}'): Uint8Array<ArrayBuffer> {
  const padded = json.padEnd(Math.ceil(json.length / 4) * 4, " ");
  const content = new TextEncoder().encode(padded);
  const bytes = new Uint8Array(20 + content.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, content.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(content, 20);
  return bytes;
}

function pngChunk(kind: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(12 + data.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.byteLength);
  bytes.set(new TextEncoder().encode(kind), 4);
  bytes.set(data, 8);
  view.setUint32(8 + data.byteLength, calculateStudioCrc32(bytes.subarray(4, 8 + data.byteLength)));
  return bytes;
}

function concat(...chunks: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
function pngHeader(width = 1): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, 1);
  header.set([8, 6, 0, 0, 0], 8);
  return pngChunk("IHDR", header);
}
const pngData = () => pngChunk("IDAT", deflateSync(new Uint8Array([0, 255, 0, 0, 255])));
const pngEnd = () => pngChunk("IEND", new Uint8Array());
const png = () => concat(pngSignature, pngHeader(), pngData(), pngEnd());

function fixture(options: {
  readonly operation?: BlenderBridgeOperation;
  readonly bytes?: Uint8Array;
  readonly change?: (job: StudioProductionJob, stage: Stage) => StudioProductionJob;
} = {}) {
  const operation = options.operation ?? "export-glb";
  const bytes = options.bytes ?? (operation === "export-glb" ? glb() : png());
  const mime = operation === "export-glb" ? "model/gltf-binary" : "image/png";
  const result = new Blob([Uint8Array.from(bytes)], { type: mime });
  const tool = studioProductionTool("blender");
  if (!tool) throw new Error("Blender 도구 fixture가 없습니다.");
  let base: StudioProductionJob | null = null;
  let uploaded = false;
  const snapshot = (status: StudioProductionJob["status"]): StudioProductionJob => {
    if (!base) throw new Error("작업 생성 전 응답 fixture");
    return {
      ...base, status, inputs: base.inputs.map((input) => ({ ...input, uploaded })),
      failure: status === "failed" ? { code: "BLENDER_FAILED", message: "카메라가 없습니다.", retryable: false } : null,
      outputs: status === "completed" ? [{
        id: "result", name: operation === "export-glb" ? "scene.glb" : "render.png",
        mime, bytes: result.size, sha256: hash(bytes), href: "/v2/result",
      }] : [],
      receipt: status === "completed" ? {
        toolId: "blender", operationId: operation, toolVersion: "Blender 5.2.0",
        license: tool.license, source: tool.source,
        commandDigest: `sha256:${"0".repeat(64)}`, inputDigests: [hash(source)], outputDigests: [hash(bytes)],
        startedAt: base.createdAt, finishedAt: base.updatedAt,
      } : null,
    };
  };
  const response = (status: StudioProductionJob["status"], stage: Stage) => {
    const job = snapshot(status);
    return options.change?.(job, stage) ?? job;
  };
  const client = {
    settings: { baseUrl: "http://127.0.0.1:49631", token: "fixture-token-not-a-real-credential" },
    status: vi.fn(async (_signal?: AbortSignal) => supportedStatus),
    createJob: vi.fn(async (job: StudioProductionJob, _signal?: AbortSignal) => {
      // 실제 v2 서버는 클라이언트 ID를 보존하지 않고 ID를 발급한다.
      uploaded = false;
      base = { ...job, id: remoteId, remoteId };
      return response("preparing", "create");
    }),
    uploadInput: vi.fn(async (_id: string, _input: StudioProductionJobInput, _bytes: Blob, _signal?: AbortSignal) => {
      uploaded = true;
      return response("queued", "upload");
    }),
    startJob: vi.fn(async (_id: string, _signal?: AbortSignal) => response("completed", "start")),
    getJob: vi.fn(async (_id: string, _signal?: AbortSignal) => response("completed", "poll")),
    cancelJob: vi.fn(async (_id: string, _signal?: AbortSignal) => response("cancelled", "cancel")),
    downloadOutput: vi.fn(async (_id: string, _output: string, _signal?: AbortSignal) => result),
  };
  const file = new File([source], "배경.blend", { type: "application/x-blender" });
  const controller = new AbortController();
  const request = { client, projectId: "project-a", file, operation, signal: controller.signal };
  return { client, snapshot, response, request, controller, result };
}

afterEach(() => vi.useRealTimers());

describe("BG3D 로컬 Blender 단일 작업", () => {
  it("Blender 바이너리 버전과 분리된 실행기 revision 문자열만 정확히 허용한다", () => {
    expect(STUDIO_BLENDER_SERVICE_REVISION).toBe("0.2.0");
    expect(isStudioBlenderServiceRevision("0.2.0")).toBe(true);
    for (const value of [undefined, null, 0.2, {}, [], "", "0.1.0", "0.2", "v0.2.0", " 0.2.0 ", "0.2.0-beta.1", "0.2.0+local", "0.2.1", "Blender 5.2.0"]) {
      expect(isStudioBlenderServiceRevision(value)).toBe(false);
    }
  });

  it.each(["0.1.0", "unknown", "0.2.0-beta.1", "0.2.0+local", "0.2.1"])("실행 직전 %s 실행기면 파일 읽기와 원격 작업 없이 업데이트를 안내한다", async (serviceVersion) => {
    const { client, request } = fixture();
    client.status.mockResolvedValue({ ...supportedStatus, serviceVersion });
    const read = vi.spyOn(request.file, "arrayBuffer");
    await expect(runStudioBlenderJob(request)).rejects.toThrow(/0\.2\.0으로 업데이트하고 다시 연결/u);
    expect(client.status).toHaveBeenCalledExactlyOnceWith(request.signal);
    expect(read).not.toHaveBeenCalled();
    expect(client.createJob).not.toHaveBeenCalled();
    expect(client.uploadInput).not.toHaveBeenCalled();
    expect(client.startJob).not.toHaveBeenCalled();
    expect(client.cancelJob).not.toHaveBeenCalled();
  });

  it("명시적 실행마다 버전을 다시 읽으므로 같은 연결이 구 실행기로 바뀌어도 원본을 읽지 않는다", async () => {
    const { client, request } = fixture();
    const read = vi.spyOn(request.file, "arrayBuffer");
    await runStudioBlenderJob(request);
    expect(client.status).toHaveBeenCalledExactlyOnceWith(request.signal);
    expect(client.status.mock.invocationCallOrder[0]).toBeLessThan(read.mock.invocationCallOrder[0] ?? 0);
    expect(read.mock.invocationCallOrder[0]).toBeLessThan(client.createJob.mock.invocationCallOrder[0] ?? 0);
    client.status.mockResolvedValue({ ...supportedStatus, serviceVersion: "0.1.0" });
    await expect(runStudioBlenderJob(request)).rejects.toThrow(/업데이트/u);
    expect(client.status).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledTimes(1);
    expect(client.createJob).toHaveBeenCalledTimes(1);
    expect(client.uploadInput).toHaveBeenCalledTimes(1);
    expect(client.startJob).toHaveBeenCalledTimes(1);
  });

  it("상태 확인 실패는 원본을 읽거나 자동 재시도하지 않고 원인과 연결 안내를 보존한다", async () => {
    const { client, request } = fixture();
    const cause = new Error("실행기 연결 단절");
    client.status.mockRejectedValue(cause);
    const read = vi.spyOn(request.file, "arrayBuffer");
    await expect(runStudioBlenderJob(request)).rejects.toMatchObject({ cause, message: expect.stringContaining("업데이트하고 다시 연결") });
    expect(client.status).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
    expect(client.createJob).not.toHaveBeenCalled();
    expect(client.uploadInput).not.toHaveBeenCalled();
    expect(client.startJob).not.toHaveBeenCalled();
    expect(client.cancelJob).not.toHaveBeenCalled();
  });

  it.each([
    ["잘못된 JSON", "{broken"],
    ["null 상태", "null"],
    ["누락 revision", JSON.stringify({ protocol: supportedStatus.protocol, version: 2, activeJobs: 0, retainedJobs: 0 })],
    ["숫자 revision", JSON.stringify({ ...supportedStatus, serviceVersion: 0.2 })],
    ["빈 revision", JSON.stringify({ ...supportedStatus, serviceVersion: "" })],
    ["다른 protocol", JSON.stringify({ ...supportedStatus, protocol: "unknown" })],
  ])("실제 client의 %s 응답도 타입 우회 없이 파일 읽기 전에 거부한다", async (_label, body) => {
    const { client, request } = fixture();
    const realClient = new StudioToonBridgeClient(client.settings);
    const fetchStatus = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body, { status: 200 }));
    const create = vi.spyOn(realClient, "createJob");
    const read = vi.spyOn(request.file, "arrayBuffer");
    try {
      await expect(runStudioBlenderJob({ ...request, client: realClient })).rejects.toThrow(/실행기 버전을 확인하지 못했습니다/u);
      expect(fetchStatus).toHaveBeenCalledExactlyOnceWith(`${client.settings.baseUrl}/v2/status`, expect.objectContaining({ signal: request.signal }));
      expect(read).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    } finally {
      fetchStatus.mockRestore();
      create.mockRestore();
    }
  });

  it.each(["abort-resolve", "abort-reject", "owner-resolve", "owner-reject"] as const)("상태 확인 중 %s이면 업데이트 안내보다 취소를 우선하고 입력을 읽지 않는다", async (boundary) => {
    const { client, request, controller } = fixture();
    let current = true;
    client.status.mockImplementation(async () => {
      if (boundary.startsWith("abort")) controller.abort();
      else current = false;
      if (boundary.endsWith("reject")) throw new Error("늦은 상태 확인 실패");
      return supportedStatus;
    });
    const read = vi.spyOn(request.file, "arrayBuffer");
    await expect(runStudioBlenderJob({ ...request, isCurrent: () => current })).rejects.toMatchObject({ name: "AbortError" });
    expect(client.status).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
    expect(client.createJob).not.toHaveBeenCalled();
    expect(client.uploadInput).not.toHaveBeenCalled();
    expect(client.startJob).not.toHaveBeenCalled();
    expect(client.cancelJob).not.toHaveBeenCalled();
  });

  it.each(["http://127.0.0.1:49631", "http://localhost:49631", "http://[::1]:49631", "https://localhost"])("%s loopback 실행기만 허용한다", (baseUrl) => {
    expect(isStudioBlenderLoopbackUrl(baseUrl)).toBe(true);
  });

  it.each(["https://bridge.example.com", "https://127.0.0.1.example.com", "http://192.168.0.2:49631", "http://localhost:49631/path", "http://localhost:49631?token=x", "file:///tmp/local", "invalid"])("%s 원격·잘못된 실행기로 파일을 보내지 않는다", async (baseUrl) => {
    const { client, request } = fixture();
    client.settings.baseUrl = baseUrl;
    const read = vi.spyOn(request.file, "arrayBuffer");
    expect(isStudioBlenderLoopbackUrl(baseUrl)).toBe(false);
    await expect(runStudioBlenderJob(request)).rejects.toThrow(/로컬 ToonBridge/u);
    expect(read).not.toHaveBeenCalled();
    expect(client.createJob).not.toHaveBeenCalled();
  });

  it("서버 발급 ID·프로젝트·입력 해시에 결합하여 한 번만 실행하고 검증된 GLB를 반환한다", async () => {
    const { client, request } = fixture();
    const onProgress = vi.fn();
    const result = await runStudioBlenderJob({ ...request, onProgress });
    expect(result.name).toBe("배경.glb");
    expect(result.type).toBe("model/gltf-binary");
    expect(client.createJob).toHaveBeenCalledTimes(1);
    expect(client.createJob.mock.calls[0]?.[0]).toMatchObject({
      projectId: "project-a", toolId: "blender", operationId: "export-glb",
      inputs: [{ id: "blend_source", name: "source.blend", sha256: hash(source), uploaded: false }],
    });
    expect(client.createJob.mock.calls[0]?.[0].id).not.toBe(remoteId);
    expect(client.uploadInput).toHaveBeenCalledExactlyOnceWith(remoteId, expect.objectContaining({ sha256: hash(source) }), request.file, request.signal);
    expect(client.startJob).toHaveBeenCalledExactlyOnceWith(remoteId, request.signal);
    expect(client.downloadOutput).toHaveBeenCalledExactlyOnceWith(remoteId, "result", request.signal);
    expect(client.cancelJob).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ status: "completed" }));
  });

  it("프로젝트 없는 초안도 명시적 null에 결합하고 문자열 프로젝트는 정규화한다", async () => {
    const { client, request } = fixture();
    await runStudioBlenderJob({ ...request, projectId: null });
    expect(client.createJob.mock.calls[0]?.[0].projectId).toBeNull();
    await runStudioBlenderJob({ ...request, projectId: " project-b " });
    expect(client.createJob.mock.calls[1]?.[0].projectId).toBe("project-b");
  });

  it.each(["render-scene", "line-art"] as const)("%s는 구조가 유효한 PNG에 원본명과 패스명을 붙인다", async (operation) => {
    const { request } = fixture({ operation });
    const file = await runStudioBlenderJob(request);
    expect(file.name).toBe(operation === "line-art" ? "배경-line-art.png" : "배경-render.png");
    expect(file.type).toBe("image/png");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(png());
  });

  it("GLB의 JSON 뒤 BIN 청크도 정확한 길이로 검증한다", async () => {
    const json = glb();
    const bytes = concat(json, new Uint8Array([4, 0, 0, 0, 66, 73, 78, 0, 1, 2, 3, 4]));
    new DataView(bytes.buffer).setUint32(8, bytes.length, true);
    const { request } = fixture({ bytes });
    expect((await runStudioBlenderJob(request)).size).toBe(bytes.length);
  });

  it.each([
    ["빈 파일", new File([], "empty.blend")],
    ["다른 확장자", new File(["x"], "script.py")],
  ] as const)("%s은 생성하지 않는다", async (_label, file) => {
    const { client, request } = fixture();
    await expect(runStudioBlenderJob({ ...request, file })).rejects.toThrow(/\.blend/u);
    expect(client.createJob).not.toHaveBeenCalled();
  });

  it("2 GiB 초과·빈 프로젝트·이미 취소된 요청은 파일을 읽거나 생성하지 않는다", async () => {
    const { client, request, controller } = fixture();
    const read = vi.spyOn(request.file, "arrayBuffer");
    Object.defineProperty(request.file, "size", { value: STUDIO_PRODUCTION_JOB_LIMITS.fileBytes + 1, configurable: true });
    await expect(runStudioBlenderJob(request)).rejects.toThrow(/2 GiB/u);
    await expect(runStudioBlenderJob({ ...request, projectId: " " })).rejects.toThrow(/프로젝트/u);
    controller.abort();
    await expect(runStudioBlenderJob(request)).rejects.toMatchObject({ name: "AbortError" });
    expect(read).not.toHaveBeenCalled();
    expect(client.createJob).not.toHaveBeenCalled();
  });

  it.each(["create", "upload", "start"] as const)("%s 응답의 다른 프로젝트를 거부하고 이후 단계를 실행하지 않는다", async (stage) => {
    const { client, request } = fixture({ change: (job, at) => at === stage ? { ...job, projectId: "project-b" } : job });
    await expect(runStudioBlenderJob(request)).rejects.toThrow(stage === "create" ? /생성·중단 여부/u : /다른 Blender 작업/u);
    expect(client.createJob).toHaveBeenCalledTimes(1);
    expect(client.downloadOutput).not.toHaveBeenCalled();
    if (stage === "create") {
      expect(client.uploadInput).not.toHaveBeenCalled();
      expect(client.cancelJob).not.toHaveBeenCalled();
    } else {
      expect(client.cancelJob.mock.calls[0]?.[0]).toBe(remoteId);
      if (stage === "upload") expect(client.startJob).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["id", (job: StudioProductionJob) => ({ ...job, id: "job_someone_else" })],
    ["remoteId", (job: StudioProductionJob) => ({ ...job, remoteId: "job_someone_else" })],
    ["tool", (job: StudioProductionJob) => ({ ...job, toolId: "inkscape" })],
    ["operation", (job: StudioProductionJob) => ({ ...job, operationId: "render-scene" })],
    ["profile", (job: StudioProductionJob) => ({ ...job, profile: "community-gpl" as const })],
    ["options", (job: StudioProductionJob) => ({ ...job, options: { execute: "other" } })],
    ["createdAt", (job: StudioProductionJob) => ({ ...job, createdAt: "2020-01-01T00:00:00.000Z" })],
  ] as const)("후속 응답이 %s를 바꾸면 처음 결합한 작업만 취소한다", async (_label, change) => {
    const { client, request } = fixture({ change: (job, stage) => stage === "start" ? change(job) : job });
    await expect(runStudioBlenderJob(request)).rejects.toThrow(/다른 Blender 작업/u);
    expect(client.cancelJob.mock.calls[0]?.[0]).toBe(remoteId);
    expect(client.downloadOutput).not.toHaveBeenCalled();
  });

  it.each([
    ["id", { id: "other_input" }], ["name", { name: "other.blend" }],
    ["mime", { mime: "application/octet-stream" }], ["bytes", { bytes: source.length + 1 }],
    ["hash", { sha256: `sha256:${"f".repeat(64)}` }], ["uploaded", { uploaded: false }],
  ] as const)("업로드 응답의 입력 %s 불일치면 실행하지 않는다", async (_label, change) => {
    const { client, request } = fixture({ change: (job, stage) => stage === "upload"
      ? { ...job, inputs: job.inputs.map((input) => ({ ...input, ...change })) } : job });
    await expect(runStudioBlenderJob(request)).rejects.toThrow(/입력 파일/u);
    expect(client.startJob).not.toHaveBeenCalled();
    expect(client.cancelJob).toHaveBeenCalledTimes(1);
  });

  it("추가 입력·잘못된 단계 상태·조기 출력을 거부한다", async () => {
    const changes: readonly ((job: StudioProductionJob) => StudioProductionJob)[] = [
      (job) => ({ ...job, inputs: [...job.inputs, { id: "extra", name: "extra.py", mime: "text/plain", bytes: 1, sha256: null, uploaded: false }] }),
      (job) => ({ ...job, status: "running" }),
      (job) => ({ ...job, outputs: [{ id: "result", name: "wrong.glb", mime: "model/gltf-binary", bytes: 1, sha256: hash(source), href: "/wrong" }] }),
    ];
    for (const change of changes) {
      const { client, request } = fixture({ change: (job, stage) => stage === "upload" ? change(job) : job });
      await expect(runStudioBlenderJob(request)).rejects.toThrow();
      expect(client.startJob).not.toHaveBeenCalled();
      expect(client.downloadOutput).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["missing", (job: StudioProductionJob) => ({ ...job, receipt: null })],
    ["tool", (job: StudioProductionJob) => ({ ...job, receipt: job.receipt && { ...job.receipt, toolId: "other" } })],
    ["operation", (job: StudioProductionJob) => ({ ...job, receipt: job.receipt && { ...job.receipt, operationId: "line-art" } })],
    ["license", (job: StudioProductionJob) => ({ ...job, receipt: job.receipt && { ...job.receipt, license: "unknown" } })],
    ["source", (job: StudioProductionJob) => ({ ...job, receipt: job.receipt && { ...job.receipt, source: "https://example.invalid/" } })],
    ["input", (job: StudioProductionJob) => ({ ...job, receipt: job.receipt && { ...job.receipt, inputDigests: [] } })],
    ["output", (job: StudioProductionJob) => ({ ...job, receipt: job.receipt && { ...job.receipt, outputDigests: [hash(source)] } })],
    ["time", (job: StudioProductionJob) => ({ ...job, receipt: job.receipt && { ...job.receipt, finishedAt: "2020-01-01T00:00:00.000Z" } })],
  ] as const)("영수증의 %s 불일치는 다운로드 전에 거부한다", async (_label, change) => {
    const { client, request } = fixture({ change: (job, stage) => stage === "start" ? change(job) : job });
    await expect(runStudioBlenderJob(request)).rejects.toThrow(/영수증/u);
    expect(client.downloadOutput).not.toHaveBeenCalled();
    expect(client.startJob).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["id", { id: "other_output" }], ["mime", { mime: "image/png" }], ["empty", { bytes: 0 }],
  ] as const)("결과 descriptor %s가 다르면 다운로드하지 않는다", async (_label, change) => {
    const { client, request } = fixture({ change: (job, stage) => stage === "start"
      ? { ...job, outputs: job.outputs.map((output) => ({ ...output, ...change })) } : job });
    await expect(runStudioBlenderJob(request)).rejects.toThrow(/영수증/u);
    expect(client.downloadOutput).not.toHaveBeenCalled();
  });

  it("다운로드 MIME·크기·SHA-256을 독립적으로 확인한다", async () => {
    const variants = [
      new Blob([glb()], { type: "text/plain" }),
      new Blob([new Uint8Array(1)], { type: "model/gltf-binary" }),
      new Blob([new Uint8Array(glb().length).fill(1)], { type: "model/gltf-binary" }),
    ];
    for (const blob of variants) {
      const { client, request } = fixture();
      client.downloadOutput.mockResolvedValue(blob);
      await expect(runStudioBlenderJob(request)).rejects.toThrow(/MIME·크기|SHA-256/u);
      expect(client.startJob).toHaveBeenCalledTimes(1);
    }
  });

  it.each([
    ["signature", () => { const bytes = glb(); bytes[0] = 0; return bytes; }],
    ["version", () => { const bytes = glb(); bytes[4] = 1; return bytes; }],
    ["total length", () => { const bytes = glb(); new DataView(bytes.buffer).setUint32(8, bytes.length + 4, true); return bytes; }],
    ["chunk length", () => { const bytes = glb(); new DataView(bytes.buffer).setUint32(12, bytes.length, true); return bytes; }],
    ["JSON type", () => { const bytes = glb(); bytes[16] = 0; return bytes; }],
    ["JSON content", () => glb("{invalid JSON}")],
    ["asset version", () => glb('{"asset":{"version":"1.0"}}')],
    ["trailing bytes", () => concat(glb(), new Uint8Array([0]))],
  ] as const)("올바른 해시가 있어도 GLB %s 오류를 거부한다", async (_label, bytes) => {
    const { request } = fixture({ bytes: bytes() });
    await expect(runStudioBlenderJob(request)).rejects.toThrow(/GLB/u);
  });

  it.each([
    ["signature only", () => pngSignature],
    ["CRC", () => { const bytes = png(); bytes[29] = (bytes[29] ?? 0) ^ 1; return bytes; }],
    ["IHDR missing", () => concat(pngSignature, pngData(), pngEnd())],
    ["zero dimension", () => concat(pngSignature, pngHeader(0), pngData(), pngEnd())],
    ["IDAT missing", () => concat(pngSignature, pngHeader(), pngEnd())],
    ["IEND missing", () => concat(pngSignature, pngHeader(), pngData())],
    ["trailing bytes", () => concat(png(), new Uint8Array([0]))],
    ["critical chunk", () => concat(pngSignature, pngHeader(), pngChunk("FAKE", new Uint8Array()), pngData(), pngEnd())],
    ["animation", () => concat(pngSignature, pngHeader(), pngChunk("acTL", new Uint8Array(8)), pngData(), pngEnd())],
    ["interrupted IDAT", () => concat(pngSignature, pngHeader(), pngData(), pngChunk("tEXt", new Uint8Array()), pngData(), pngEnd())],
  ] as const)("올바른 해시가 있어도 PNG %s 오류를 거부한다", async (_label, bytes) => {
    const { request } = fixture({ operation: "render-scene", bytes: bytes() });
    await expect(runStudioBlenderJob(request)).rejects.toThrow(/PNG/u);
  });

  it("실행 실패·실행기 취소는 결과나 자동 재실행으로 바꾸지 않는다", async () => {
    for (const status of ["failed", "cancelled"] as const) {
      const { client, request, snapshot } = fixture();
      client.startJob.mockImplementation(async () => snapshot(status));
      await expect(runStudioBlenderJob(request)).rejects.toThrow(status === "failed" ? /카메라/u : /취소/u);
      expect(client.startJob).toHaveBeenCalledTimes(1);
      expect(client.downloadOutput).not.toHaveBeenCalled();
      expect(client.cancelJob).not.toHaveBeenCalled();
    }
  });

  it("생성 응답 유실은 ID를 추측하여 취소하거나 새 작업을 만들지 않는다", async () => {
    const { client, request } = fixture();
    client.createJob.mockRejectedValue(new Error("응답 단절"));
    await expect(runStudioBlenderJob(request)).rejects.toThrow(/생성·중단 여부가 불명확/u);
    expect(client.createJob).toHaveBeenCalledTimes(1);
    expect(client.uploadInput).not.toHaveBeenCalled();
    expect(client.cancelJob).not.toHaveBeenCalled();
  });

  it("실행 응답 유실이면 같은 서버 작업만 취소하고 자동 재실행하지 않는다", async () => {
    const { client, request } = fixture();
    client.startJob.mockRejectedValue(new Error("실행 응답 단절"));
    await expect(runStudioBlenderJob(request)).rejects.toThrow("실행 응답 단절");
    expect(client.startJob).toHaveBeenCalledTimes(1);
    expect(client.cancelJob.mock.calls[0]?.[0]).toBe(remoteId);
    expect(client.cancelJob.mock.calls[0]?.[1]?.aborted).toBe(false);
    expect(client.downloadOutput).not.toHaveBeenCalled();
  });

  it.each(["lost", "running", "other-project", "other-id"] as const)("취소 %s 응답이면 중단 성공을 주장하지 않는다", async (variant) => {
    const { client, request, snapshot } = fixture();
    client.startJob.mockRejectedValue(new Error("실행 응답 단절"));
    client.cancelJob.mockImplementation(async () => {
      if (variant === "lost") throw new Error("취소 응답 단절");
      const cancelled = snapshot(variant === "running" ? "running" : "cancelled");
      return variant === "other-project" ? { ...cancelled, projectId: "project-b" }
        : variant === "other-id" ? { ...cancelled, id: "job_someone_else" } : cancelled;
    });
    await expect(runStudioBlenderJob(request)).rejects.toThrow(/중단 여부를 확인하지 못했습니다/u);
    expect(client.createJob).toHaveBeenCalledTimes(1);
    expect(client.startJob).toHaveBeenCalledTimes(1);
  });

  it("파일 읽기 뒤 대상 변경은 작업을 만들기 전에 차단한다", async () => {
    const { client, request } = fixture();
    let current = true;
    vi.spyOn(request.file, "arrayBuffer").mockImplementation(async () => { current = false; return source.slice().buffer; });
    await expect(runStudioBlenderJob({ ...request, isCurrent: () => current })).rejects.toMatchObject({ name: "AbortError" });
    expect(client.createJob).not.toHaveBeenCalled();
  });

  it.each(["create", "upload", "start"] as const)("%s 응답 뒤 scope가 바뀌면 다음 동작·성공 전달을 차단한다", async (changedStage) => {
    let current = true;
    const { client, request } = fixture({ change: (job, stage) => {
      if (stage === changedStage) current = false;
      return job;
    } });
    const onProgress = vi.fn();
    await expect(runStudioBlenderJob({ ...request, isCurrent: () => current, onProgress })).rejects.toMatchObject({ name: "AbortError" });
    expect(client.downloadOutput).not.toHaveBeenCalled();
    if (changedStage === "create") expect(client.uploadInput).not.toHaveBeenCalled();
    if (changedStage !== "start") expect(client.cancelJob).toHaveBeenCalledTimes(1);
    expect(onProgress).not.toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
  });

  it("진행 콜백의 취소도 업로드 전에 확인하고 생성한 작업만 중단한다", async () => {
    const { client, request, controller } = fixture();
    await expect(runStudioBlenderJob({ ...request, onProgress: () => controller.abort() })).rejects.toMatchObject({ name: "AbortError" });
    expect(client.uploadInput).not.toHaveBeenCalled();
    expect(client.cancelJob).toHaveBeenCalledTimes(1);
  });

  it("다운로드와 바이트 읽기 뒤 취소를 확인하여 파일을 반환하지 않는다", async () => {
    for (const boundary of ["download", "read"] as const) {
      const { client, request, controller, result } = fixture();
      if (boundary === "download") client.downloadOutput.mockImplementation(async () => { controller.abort(); return result; });
      else vi.spyOn(result, "arrayBuffer").mockImplementation(async () => { controller.abort(); return glb().buffer; });
      await expect(runStudioBlenderJob(request)).rejects.toMatchObject({ name: "AbortError" });
      expect(client.cancelJob).not.toHaveBeenCalled();
      expect(client.startJob).toHaveBeenCalledTimes(1);
    }
  });

  it("활성 작업은 1초 후 조회하고 다른 프로젝트의 poll 응답을 거부한다", async () => {
    const { client, request, snapshot } = fixture();
    vi.useFakeTimers();
    client.startJob.mockImplementation(async () => snapshot("running"));
    client.getJob.mockImplementation(async () => ({ ...snapshot("completed"), projectId: "project-b" }));
    const pending = runStudioBlenderJob(request);
    const assertion = expect(pending).rejects.toThrow(/다른 Blender 작업/u);
    await vi.waitFor(() => expect(client.startJob).toHaveBeenCalledTimes(1));
    expect(client.getJob).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    expect(client.getJob).toHaveBeenCalledTimes(1);
    expect(client.cancelJob.mock.calls[0]?.[0]).toBe(remoteId);
    expect(client.downloadOutput).not.toHaveBeenCalled();
  });

  it("poll 대기 중 취소하면 요청을 더 보내지 않고 원래 작업만 중단한다", async () => {
    const { client, request, controller, snapshot } = fixture();
    vi.useFakeTimers();
    client.startJob.mockImplementation(async () => snapshot("running"));
    const pending = runStudioBlenderJob(request);
    const assertion = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(client.startJob).toHaveBeenCalledTimes(1));
    controller.abort();
    await assertion;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(client.getJob).not.toHaveBeenCalled();
    expect(client.cancelJob).toHaveBeenCalledTimes(1);
  });
});
