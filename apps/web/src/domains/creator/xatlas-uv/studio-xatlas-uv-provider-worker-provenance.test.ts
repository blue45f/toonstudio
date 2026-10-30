/** 미실행 초안: 실제 WASM 대신 명시적 Worker 경계 메시지와 전송 소유권을 검사한다. */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_XATLAS_UV_PROVIDER_VERSION,
  type StudioXAtlasUvArtifact,
  type StudioXAtlasUvExecution,
  type StudioXAtlasUvProviderLimits,
  type StudioXAtlasUvRequest,
} from "./studio-xatlas-uv-provider";
import {
  isStudioXAtlasUvResult,
  isStudioXAtlasUvWorkerInboundMessage,
  isStudioXAtlasUvWorkerOutboundMessage,
  STUDIO_XATLAS_UV_WORKER_PROTOCOL_VERSION,
  studioXAtlasUvRequestHash,
  studioXAtlasUvResultHash,
  studioXAtlasUvResultTransfers,
  type StudioXAtlasUvWorkerExecuteMessage,
  type StudioXAtlasUvWorkerInboundMessage,
  type StudioXAtlasUvWorkerResultMessage,
} from "./studio-xatlas-uv-provider-protocol";
import { createStudioXAtlasUvWorkerClient, type StudioXAtlasUvWorkerLike } from "./studio-xatlas-uv-provider-worker-client";

function at<T>(values: ArrayLike<T>, index: number): T {
  const value = values[index];
  if (value === undefined) throw new Error(`테스트 입력의 ${index} 항목이 없습니다.`);
  return value;
}

function request(twoMeshes = false): StudioXAtlasUvRequest {
  const first = { id: "first", positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint16Array([0, 1, 2]) };
  return { operation: "unwrap-atlas", requestEpoch: 3, documentEpoch: 9,
    meshes: twoMeshes ? [first, {
      id: "second", positions: new Float32Array([2, 0, 0, 3, 0, 0, 3, 1, 0, 2, 1, 0]),
      indices: new Uint32Array([0, 2, 3]),
    }] : [first] };
}

function artifactFor(candidate: StudioXAtlasUvRequest): StudioXAtlasUvArtifact {
  const vertexCount = candidate.meshes.reduce((sum, mesh) => sum + mesh.positions.length / 3, 0);
  const indexCount = candidate.meshes.reduce((sum, mesh) => sum + mesh.indices.length, 0);
  const positions = new Float32Array(vertexCount * 3);
  const uv = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(indexCount);
  const originalInputVertexIndices = new Uint32Array(vertexCount);
  let vertexOffset = 0;
  let indexOffset = 0;
  const meshes = candidate.meshes.map((mesh) => {
    const count = mesh.positions.length / 3;
    positions.set(mesh.positions, vertexOffset * 3);
    for (let vertex = 0; vertex < count; vertex += 1) {
      originalInputVertexIndices[vertexOffset + vertex] = vertex;
      uv[(vertexOffset + vertex) * 2] = vertex % 2;
      uv[(vertexOffset + vertex) * 2 + 1] = Math.floor(vertex / 2) / 2;
    }
    for (let index = 0; index < mesh.indices.length; index += 1) {
      indices[indexOffset + index] = at(mesh.indices, index) + vertexOffset;
    }
    const range = { id: mesh.id, sourceVertexCount: count, vertexOffset, vertexCount: count,
      indexOffset, indexCount: mesh.indices.length,
      atlasSegments: [{ indexOffset, indexCount: mesh.indices.length, atlasIndex: 0 }] };
    vertexOffset += count;
    indexOffset += mesh.indices.length;
    return range;
  });
  return { kind: "studio-xatlas-uv-atlas", version: STUDIO_XATLAS_UV_PROVIDER_VERSION,
    positions, uv, indices, originalInputVertexIndices, meshes,
    atlas: { width: 64, height: 64, count: 1, texelsPerUnit: 16 },
    receipt: { packageName: "xatlasjs", packageVersion: "0.2.0-worker-fixture", runtimeSource: "injected",
      intendedHost: "dedicated-worker", executionTopology: "single-dedicated-worker", rendererNeutral: true,
      defensiveInputCopy: true, defensiveOutputCopy: true, originalInputPreserved: true,
      nativeHandlesReturned: false, mainThreadFallback: false, atlasCleanup: "direct-destroyAtlas-finally",
      geometryCleanup: "release-typed-array-snapshots", wasmCleanup: "dedicated-worker-termination" } };
}

function messageFor(execute: StudioXAtlasUvWorkerExecuteMessage, artifact = artifactFor(execute.request)): StudioXAtlasUvWorkerResultMessage {
  const result = { ok: true, artifact } as const;
  return { type: "studio-xatlas-uv/result", version: STUDIO_XATLAS_UV_WORKER_PROTOCOL_VERSION,
    requestId: execute.requestId, result, binding: { requestEpoch: execute.request.requestEpoch,
      documentEpoch: execute.request.documentEpoch, requestHash: studioXAtlasUvRequestHash(execute.request),
      resultHash: studioXAtlasUvResultHash(result) } };
}

interface WireEvent { readonly data: unknown; preventDefault?(): void }
interface ErrorEvent { preventDefault?(): void }
type WireListener = (event: WireEvent) => void;

class ControlledWorker implements StudioXAtlasUvWorkerLike {
  readonly inbound: StudioXAtlasUvWorkerInboundMessage[] = [];
  readonly listeners = { message: new Set<WireListener>(), error: new Set<WireListener>(), messageerror: new Set<WireListener>() };
  terminated = false;

  addEventListener(type: "message" | "error" | "messageerror", listener: WireListener | ((event: ErrorEvent) => void)): void {
    this.listeners[type].add(listener);
  }

  removeEventListener(type: "message" | "error" | "messageerror", listener: WireListener | ((event: ErrorEvent) => void)): void {
    this.listeners[type].delete(listener);
  }

  postMessage(message: StudioXAtlasUvWorkerInboundMessage, transfer: Transferable[] = []): void {
    // 실제 transfer처럼 client의 전송용 복사본을 detach하며 caller 배열에는 접근하지 않는다.
    const received = structuredClone(message, { transfer });
    this.inbound.push(received);
    if (received.type === "studio-xatlas-uv/configure") queueMicrotask(() => this.emit({
      type: "studio-xatlas-uv/ready", version: STUDIO_XATLAS_UV_WORKER_PROTOCOL_VERSION,
    }));
  }

  executeMessage(): StudioXAtlasUvWorkerExecuteMessage {
    const execute = this.inbound.find((message) => message.type === "studio-xatlas-uv/execute");
    if (!execute || execute.type !== "studio-xatlas-uv/execute") throw new Error("Worker execute 메시지가 없습니다.");
    return execute;
  }

  emit(data: unknown): void {
    for (const listener of this.listeners.message) listener({ data });
  }

  terminate(): void { this.terminated = true; }
}

const clients: Array<ReturnType<typeof createStudioXAtlasUvWorkerClient>> = [];
afterEach(() => { for (const client of clients.splice(0)) client.dispose(); vi.restoreAllMocks(); });

async function admit(candidate = request(), limits?: StudioXAtlasUvProviderLimits, execution: StudioXAtlasUvExecution = {}) {
  const worker = new ControlledWorker();
  const client = createStudioXAtlasUvWorkerClient({ requestEpoch: 3, documentEpoch: 9, workerFactory: () => worker,
    ...(limits === undefined ? {} : { limits }) });
  clients.push(client);
  const pending = client.execute(candidate, execution);
  await vi.waitFor(() => expect(worker.inbound.some((message) => message.type === "studio-xatlas-uv/execute")).toBe(true));
  return { worker, client, pending, execute: worker.executeMessage() };
}

describe("xatlas 원본 정점 대응의 Worker 전파", () => {
  it("provider artifact와 Worker 메시지의 별도 버전을 각각 2로 고정한다", () => {
    expect(STUDIO_XATLAS_UV_PROVIDER_VERSION).toBe(2);
    expect(STUDIO_XATLAS_UV_WORKER_PROTOCOL_VERSION).toBe(2);
    expect(isStudioXAtlasUvWorkerInboundMessage({ type: "studio-xatlas-uv/cancel", version: 1, requestId: "old" })).toBe(false);
  });

  it("원본 정점 대응 배열을 hash와 네 번째 전송 버퍼에 포함하고 실제 transfer한다", () => {
    const candidate = request();
    const artifact = artifactFor(candidate);
    const result = { ok: true, artifact } as const;
    expect(isStudioXAtlasUvResult(result)).toBe(true);
    const hash = studioXAtlasUvResultHash(result);
    artifact.originalInputVertexIndices[0] = 1;
    expect(studioXAtlasUvResultHash(result)).not.toBe(hash);
    artifact.originalInputVertexIndices[0] = 0;
    const transfers = studioXAtlasUvResultTransfers(result);
    expect(transfers).toEqual([artifact.positions.buffer, artifact.uv.buffer,
      artifact.indices.buffer, artifact.originalInputVertexIndices.buffer]);
    const received = structuredClone(result, { transfer: transfers });
    expect(artifact.originalInputVertexIndices.byteLength).toBe(0);
    expect(Array.from(received.artifact.originalInputVertexIndices)).toEqual([0, 1, 2]);
    expect(isStudioXAtlasUvResult(received)).toBe(true);
  });

  it.each(["old-protocol", "old-artifact", "missing-map", "short-map", "extra-map", "wrong-map-type", "shared-map",
    "masquerading-map", "extra-field", "prototype", "accessor", "shadow-length", "shadow-bytes", "shadow-iterator", "symbol", "callback"])(
    "%s 메시지를 getter 호출이나 타입 추측으로 수용하지 않는다", (kind) => {
      const execute: StudioXAtlasUvWorkerExecuteMessage = { type: "studio-xatlas-uv/execute",
        version: STUDIO_XATLAS_UV_WORKER_PROTOCOL_VERSION, requestId: "fixture", request: request() };
      const message = messageFor(execute);
      if (!message.result.ok) throw new Error("성공 fixture가 필요합니다.");
      const artifact = message.result.artifact;
      const getter = vi.fn(() => new Uint32Array([0, 1, 2]));
      if (kind === "old-protocol") Object.defineProperty(message, "version", { value: 1, enumerable: true });
      if (kind === "old-artifact") Object.defineProperty(artifact, "version", { value: 1, enumerable: true });
      if (kind === "missing-map") Reflect.deleteProperty(artifact, "originalInputVertexIndices");
      if (kind === "short-map") Object.defineProperty(artifact, "originalInputVertexIndices", { value: new Uint32Array([0, 1]), enumerable: true });
      if (kind === "extra-map") Object.defineProperty(artifact, "originalInputVertexIndices", { value: new Uint32Array([0, 1, 2, 0]), enumerable: true });
      if (kind === "wrong-map-type") Object.defineProperty(artifact, "originalInputVertexIndices", { value: new Uint16Array([0, 1, 2]), enumerable: true });
      if (kind === "shared-map") {
        if (typeof SharedArrayBuffer === "undefined") throw new Error("SharedArrayBuffer 경계 검사를 지원하는 테스트 환경이 필요합니다.");
        Object.defineProperty(artifact, "originalInputVertexIndices", { value: new Uint32Array(new SharedArrayBuffer(12)), enumerable: true });
      }
      if (kind === "masquerading-map") {
        const view = new Uint16Array([0, 1, 2]);
        Object.setPrototypeOf(view, Uint32Array.prototype);
        Object.defineProperty(artifact, "originalInputVertexIndices", { value: view, enumerable: true });
      }
      if (kind === "extra-field") Object.defineProperty(artifact, "extra", { value: new Uint32Array(10), enumerable: true });
      if (kind === "prototype") Object.setPrototypeOf(artifact, { inherited: true });
      if (kind === "accessor") Object.defineProperty(artifact, "originalInputVertexIndices", { get: getter, enumerable: true });
      if (kind === "shadow-length") Object.defineProperty(artifact.originalInputVertexIndices, "length", { get: getter });
      if (kind === "shadow-bytes") Object.defineProperty(artifact.originalInputVertexIndices, "byteLength", { get: getter });
      if (kind === "shadow-iterator") Object.defineProperty(artifact.originalInputVertexIndices, Symbol.iterator, { get: getter });
      if (kind === "symbol") Object.defineProperty(artifact, Symbol("extra"), { value: true, enumerable: true });
      if (kind === "callback") Object.defineProperty(artifact, "callback", { value: getter, enumerable: true });
      expect(isStudioXAtlasUvWorkerOutboundMessage(message)).toBe(false);
      expect(getter).not.toHaveBeenCalled();
    },
  );

  it("전송한 입력이 detach돼도 별도 승인 위치 사본으로 검사하고 caller 원본을 보존한다", async () => {
    const candidate = request(true);
    const before = candidate.meshes.map((mesh) => ({ positions: mesh.positions.slice(), indices: mesh.indices.slice() }));
    const { worker, execute, pending } = await admit(candidate);
    const artifact = artifactFor(execute.request);
    expect(Array.from(artifact.originalInputVertexIndices)).toEqual([0, 1, 2, 0, 1, 2, 3]);
    worker.emit(messageFor(execute, artifact));
    const result = await pending;
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.detail);
    expect(result.artifact.originalInputVertexIndices).toEqual(artifact.originalInputVertexIndices);
    candidate.meshes.forEach((mesh, index) => {
      expect(mesh.positions.byteLength).toBeGreaterThan(0);
      expect(mesh.positions).toEqual(at(before, index).positions);
      expect(mesh.indices).toEqual(at(before, index).indices);
    });
  });

  it.each(["map-range", "map-position", "wrong-position", "cross-mesh-index", "cross-mesh-map",
    "source-count", "nan-uv", "infinite-uv", "infinite-position"])(
    "올바른 resultHash로 보낸 %s 위조도 승인 원본과 대조해 거절한다", async (kind) => {
      const { worker, execute, pending, client } = await admit(request(true));
      const base = artifactFor(execute.request);
      let artifact = base;
      if (kind === "map-range") base.originalInputVertexIndices[0] = 3;
      if (kind === "map-position") base.originalInputVertexIndices[0] = 1;
      if (kind === "wrong-position") base.positions[0] = 0.25;
      if (kind === "cross-mesh-index") base.indices[0] = at(base.meshes, 1).vertexOffset;
      if (kind === "cross-mesh-map") base.originalInputVertexIndices[at(base.meshes, 1).vertexOffset] = 3;
      if (kind === "source-count") artifact = { ...base,
        meshes: base.meshes.map((range, index) => index === 0 ? { ...range, sourceVertexCount: range.sourceVertexCount + 1 } : range) };
      if (kind === "nan-uv") base.uv[0] = NaN;
      if (kind === "infinite-uv") base.uv[0] = Infinity;
      if (kind === "infinite-position") base.positions[0] = Infinity;
      const message = messageFor(execute, artifact);
      expect(isStudioXAtlasUvWorkerOutboundMessage(message)).toBe(true);
      worker.emit(message);
      await expect(pending).resolves.toMatchObject({ ok: false, reason: "invalid-provider-output" });
      expect(worker.terminated).toBe(true);
      expect(client.getDiagnostics()).toMatchObject({ phase: "cold", pendingRequestCount: 0, admittedRequestCount: 0 });
    },
  );

  it("추가 map 바이트까지 maxOutputBytes에 포함한다", async () => {
    const candidate = request();
    const artifact = artifactFor(candidate);
    const oldBytes = artifact.positions.byteLength + artifact.uv.byteLength + artifact.indices.byteLength;
    expect(oldBytes).toBe(72);
    expect(oldBytes + artifact.originalInputVertexIndices.byteLength).toBe(84);
    const { worker, execute, pending } = await admit(candidate, { maxOutputBytes: oldBytes });
    worker.emit(messageFor(execute));
    await expect(pending).resolves.toMatchObject({ ok: false, reason: "invalid-provider-output" });
    expect(worker.terminated).toBe(true);
  });

  it("유효한 map·위치를 가진 결과라도 해시가 다르면 거절한다", async () => {
    const { worker, execute, pending } = await admit();
    const message = messageFor(execute);
    if (!message.binding) throw new Error("결과 binding이 필요합니다.");
    worker.emit({ ...message, binding: { ...message.binding, resultHash: `sha256:${"0".repeat(64)}` } });
    await expect(pending).resolves.toMatchObject({ ok: false, reason: "invalid-provider-output" });
    expect(worker.terminated).toBe(true);
  });

  it.each(["request-epoch", "document-epoch", "request-hash"] as const)("유효한 결과의 %s binding 위조를 거절한다", async (field) => {
    const { worker, execute, pending } = await admit();
    const message = messageFor(execute);
    if (!message.binding) throw new Error("결과 binding이 필요합니다.");
    const binding = { ...message.binding,
      ...(field === "request-epoch" ? { requestEpoch: message.binding.requestEpoch + 1 } : {}),
      ...(field === "document-epoch" ? { documentEpoch: message.binding.documentEpoch + 1 } : {}),
      ...(field === "request-hash" ? { requestHash: `sha256:${"0".repeat(64)}` as const } : {}) };
    worker.emit({ ...message, binding });
    await expect(pending).resolves.toMatchObject({ ok: false, reason: "invalid-provider-output" });
    expect(worker.terminated).toBe(true);
  });

  it("progress 중 caller 입력과 callback 필드가 바뀌어도 승인 사본과 최초 callback을 유지한다", async () => {
    const candidate = request();
    const replacement = vi.fn(() => { throw new Error("바뀐 callback을 실행하면 안 됩니다."); });
    const original = vi.fn(() => { at(candidate.meshes, 0).positions[0] = 99; });
    const execution: { onProgress: NonNullable<StudioXAtlasUvExecution["onProgress"]> } = { onProgress: original };
    const { worker, execute, pending } = await admit(candidate, undefined, execution);
    execution.onProgress = replacement;
    worker.emit({ type: "studio-xatlas-uv/progress", version: STUDIO_XATLAS_UV_WORKER_PROTOCOL_VERSION,
      requestId: execute.requestId, sequence: 1, mode: "pack", progress: 0.5 });
    expect(original).toHaveBeenCalledTimes(1);
    expect(replacement).not.toHaveBeenCalled();
    expect(at(execute.request.meshes, 0).positions[0]).toBe(0);
    worker.emit(messageFor(execute));
    const result = await pending;
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.detail);
    expect(result.artifact.positions[0]).toBe(0);
  });

  it.each(["cancel", "request-epoch", "document-epoch"] as const)("%s 이후 도착한 map 결과는 원래 승인을 되살리지 않는다", async (kind) => {
    const controller = new AbortController();
    const { worker, execute, pending, client } = await admit(request(), undefined, { signal: controller.signal });
    const late = messageFor(execute);
    if (kind === "cancel") controller.abort();
    if (kind === "request-epoch") expect(client.advanceEpochs(4, 9)).toBe(true);
    if (kind === "document-epoch") expect(client.advanceEpochs(3, 10)).toBe(true);
    worker.emit(late);
    await expect(pending).resolves.toMatchObject({ ok: false,
      reason: kind === "cancel" ? "cancelled" : kind === "request-epoch" ? "stale-request-epoch" : "stale-document-epoch" });
    expect(worker.terminated).toBe(true);
    expect(client.getDiagnostics().pendingRequestCount).toBe(0);
  });

  it("dispose가 진행 중 승인 위치 사본의 pending 소유권과 타이머를 끝낸다", async () => {
    const { worker, pending, client } = await admit();
    client.dispose();
    await expect(pending).resolves.toMatchObject({ ok: false, reason: "disposed" });
    expect(worker.terminated).toBe(true);
    expect(client.getDiagnostics()).toMatchObject({ phase: "disposed", pendingRequestCount: 0, admittedRequestCount: 0 });
  });
});
