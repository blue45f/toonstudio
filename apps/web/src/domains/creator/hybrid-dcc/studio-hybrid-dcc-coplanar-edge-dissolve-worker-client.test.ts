/** 실제 치유 커널·packed codec의 전송 회귀다. 전송 대역의 검사는 브라우저 Worker·화면 증거와 구분한다. */
import { afterEach, describe, expect, it, vi } from "vitest";

import { decodeStudioMeshUvLayer, hashStudioMeshUvTopology } from "../mesh-uv/studio-mesh-uv-authority";
import {
  createStudioEditableMeshFromPolygons, createStudioUnitCubeMesh, hashStudioEditableMesh,
  serializeStudioEditableMesh, type StudioEditableMesh,
} from "../studio-editable-half-edge-mesh";

import {
  dissolveStudioHybridDccCoplanarEdges,
  type StudioCoplanarEdgeDissolveRequest, type StudioCoplanarEdgeDissolveSource,
} from "./studio-hybrid-dcc-coplanar-edge-dissolve";
import {
  computeStudioHybridDccCoplanarEdgeDissolveInWorker,
  type StudioCoplanarEdgeDissolveWorkerLike,
} from "./studio-hybrid-dcc-coplanar-edge-dissolve-worker-client";
import {
  createStudioCoplanarEdgeDissolveWorkerRequest, createStudioCoplanarEdgeDissolveWorkerResponse,
  isStudioCoplanarEdgeDissolveWorkerRequest, isStudioCoplanarEdgeDissolveWorkerResponse,
  type StudioCoplanarEdgeDissolveWorkerRequest, type StudioCoplanarEdgeDissolveWorkerResponse,
} from "./studio-hybrid-dcc-coplanar-edge-dissolve-worker-protocol";
import { readStudioMeshFaceLoops } from "./studio-hybrid-dcc-face-modeling-mesh";
import { unpackStudioHybridDccGlbExportInput } from "./studio-hybrid-dcc-glb-export-packed-mesh";

function need<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error("실제 치유 전송 fixture의 값이 없습니다.");
  return value;
}
function changedDigest(value: string): string { return value.slice(0, -1) + (value.endsWith("0") ? "1" : "0"); }
function fixture(uv = true) {
  const cube = createStudioUnitCubeMesh(), loops = need(readStudioMeshFaceLoops(cube));
  const plain = createStudioEditableMeshFromPolygons(
    cube.vertices.map(({ position }) => ({ ...position, x: position.x + 2 ** -40 })),
    [...loops.map((loop) => loop.id === 1 ? [4, 5, 6] : loop.vertexIds), [4, 6, 7]],
  );
  const outer = need(plain.halfEdges.find((edge) => plain.halfEdges[edge.prev]?.vertex === 4 && edge.vertex === 5));
  const attributed: StudioEditableMesh = { ...plain,
    vertices: plain.vertices.map((vertex) => ({ ...vertex, crease: vertex.id === 4 ? 0.375 : 0 })),
    halfEdges: plain.halfEdges.map((edge) => ({ ...edge,
      crease: edge.id === outer.id ? 0.25 : edge.id === outer.twin ? 0.5 : 0,
    })),
    faces: plain.faces.map((face) => ({ ...face, smooth: false,
      materialSlot: face.id === 1 || face.id === 6 ? 7 : face.id + 10,
    })),
  };
  const mesh: StudioEditableMesh = !uv ? attributed : { ...attributed,
    uvLayer: decodeStudioMeshUvLayer({ revision: 1, topologyHash: hashStudioMeshUvTopology(attributed),
      corners: attributed.halfEdges.map((edge) => {
        const position = need(attributed.vertices[need(attributed.halfEdges[edge.prev]).vertex]).position;
        return { halfEdgeId: edge.id, u: Math.fround(position.x + 0.5), v: Math.fround(position.y + 0.5) };
      }),
    }, attributed),
  };
  const source: StudioCoplanarEdgeDissolveSource = { mesh, meshHash: hashStudioEditableMesh(mesh), meshRevision: 17 };
  const seam = need(mesh.halfEdges.find((edge) => mesh.halfEdges[edge.prev]?.vertex === 4 && edge.vertex === 6));
  const request: StudioCoplanarEdgeDissolveRequest = {
    sourceMeshHash: source.meshHash, sourceMeshRevision: source.meshRevision, halfEdgeIds: [seam.id],
  };
  return { source, request, options: { assetId: "coplanar-worker-cube", generation: 0 } };
}
function compute(request: StudioCoplanarEdgeDissolveWorkerRequest): StudioCoplanarEdgeDissolveWorkerResponse {
  const source = need(unpackStudioHybridDccGlbExportInput(request.payload));
  return createStudioCoplanarEdgeDissolveWorkerResponse(request, dissolveStudioHybridDccCoplanarEdges({
    mesh: source.mesh, meshHash: source.sourceHash, meshRevision: source.sourceRevision,
  }, request.request));
}
type Listener = ((event: { readonly data: unknown }) => void) | ((event: { preventDefault?(): void }) => void);
function transport(auto = true, change: (response: StudioCoplanarEdgeDissolveWorkerResponse) => unknown = (response) => response) {
  const listeners = new Map<string, Set<Listener>>();
  let posted: StudioCoplanarEdgeDissolveWorkerRequest | null = null, sentBuffer: ArrayBuffer | null = null;
  let terminated = 0, posts = 0, throwTerminate = false;
  const emit = (type: string, data?: unknown): void => {
    for (const listener of [...(listeners.get(type) ?? [])]) listener({ data, preventDefault() {} });
  };
  const worker: StudioCoplanarEdgeDissolveWorkerLike = {
    postMessage(request, transfer) {
      posts++; sentBuffer = request.payload.buffer; posted = structuredClone(request, { transfer });
      if (!auto) return;
      const response = compute(posted);
      const cloned = structuredClone(response, {
        transfer: response.kind === "result" && response.result.ok ? [response.result.payload.buffer] : [],
      });
      queueMicrotask(() => emit("message", change(cloned)));
    },
    addEventListener(type: "message" | "error" | "messageerror", listener: Listener) {
      const current = listeners.get(type) ?? new Set<Listener>(); current.add(listener); listeners.set(type, current);
    },
    removeEventListener(type: "message" | "error" | "messageerror", listener: Listener) { listeners.get(type)?.delete(listener); },
    terminate() { terminated++; if (throwTerminate) throw new Error("치유 Worker 종료 실패 fixture"); },
  };
  return { worker, emit, request: () => need(posted), sentBuffer: () => need(sentBuffer), posts: () => posts,
    terminated: () => terminated, listenerCount: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
    failTerminate: () => { throwTerminate = true; } };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("공유 모서리 치유 Worker의 원본·전송·수명 계약", () => {
  it("generation 0의 f64·UV 사본을 전송해도 원본과 전체 remap·속성을 보존한다", async () => {
    const f = fixture(), before = serializeStudioEditableMesh(f.source.mesh), fake = transport();
    const result = await computeStudioHybridDccCoplanarEdgeDissolveInWorker(f.source, f.request, { ...f.options, workerFactory: () => fake.worker });
    if (!result.ok) throw new Error(result.detail);
    expect(fake.sentBuffer().byteLength).toBe(0);
    expect(fake.request().payload.buffer.byteLength).toBeGreaterThan(0);
    expect(fake.request().generation).toBe(0); expect(fake.request().kind).toBe("coplanar-edge-dissolve");
    expect(result.sourceMeshHash).toBe(f.source.meshHash); expect(result.sourceMeshRevision).toBe(17);
    expect(result.resultMeshHash).toBe(hashStudioEditableMesh(result.mesh));
    expect(result.mesh.vertices).toHaveLength(8); expect(result.mesh.faces).toHaveLength(6); expect(result.mesh.halfEdges).toHaveLength(24);
    expect(result.sourceFaceIds).toEqual([1, 6]); expect(result.mergedFaceId).toBe(1);
    expect(result.vertexRemap).toHaveLength(8); expect(result.faceRemap).toHaveLength(7); expect(result.halfEdgeRemap).toHaveLength(26);
    expect(result.vertexRemap.map(({ sourceVertexId }) => sourceVertexId)).toEqual(f.source.mesh.vertices.map(({ id }) => id));
    for (const mapping of result.vertexRemap) expect(mapping.resultVertexIds).toEqual([mapping.sourceVertexId]);
    expect(result.mesh.vertices.map(({ id }) => id)).toEqual(f.source.mesh.vertices.map(({ id }) => id));
    for (const mapping of result.faceRemap) for (const id of mapping.resultFaceIds) {
      const original = need(f.source.mesh.faces[mapping.sourceFaceId]), next = need(result.mesh.faces[id]);
      expect([next.materialSlot, next.smooth]).toEqual([original.materialSlot, original.smooth]);
    }
    expect(result.mesh.vertices.map(({ position, crease }) => ({ position, crease })))
      .toEqual(f.source.mesh.vertices.map(({ position, crease }) => ({ position, crease })));
    expect(result.mesh.vertices.some(({ position }) => Math.fround(position.x) !== position.x)).toBe(true);
    const beforeUv = need(f.source.mesh.uvLayer), afterUv = need(result.mesh.uvLayer);
    expect(afterUv.topologyHash).toBe(hashStudioMeshUvTopology(result.mesh));
    for (const mapping of result.halfEdgeRemap) for (const id of mapping.resultHalfEdgeIds) {
      const old = need(beforeUv.corners[mapping.sourceHalfEdgeId]), next = need(afterUv.corners[id]);
      expect([next.u, next.v]).toEqual([old.u, old.v]);
      expect(need(result.mesh.halfEdges[id]).crease).toBe(need(f.source.mesh.halfEdges[mapping.sourceHalfEdgeId]).crease);
    }
    expect(serializeStudioEditableMesh(f.source.mesh)).toEqual(before);
    expect(hashStudioEditableMesh(f.source.mesh)).toBe(f.source.meshHash);
    expect(fake.posts()).toBe(1); expect(fake.terminated()).toBe(1); expect(fake.listenerCount()).toBe(0);
  });

  it("무UV 입력에 UV 채널을 새로 만들지 않는다", async () => {
    const f = fixture(false), fake = transport();
    const result = await computeStudioHybridDccCoplanarEdgeDissolveInWorker(f.source, f.request, { ...f.options, workerFactory: () => fake.worker });
    if (!result.ok) throw new Error(result.detail);
    expect(result.mesh.uvLayer).toBeUndefined(); expect(result.resultMeshHash).toBe(hashStudioEditableMesh(result.mesh));
  });

  it("호출자가 원래 선택 배열을 바꿔도 이미 보낸 개인 요청은 바뀌지 않는다", async () => {
    const f = fixture(), ids = [...f.request.halfEdgeIds], originalId = need(ids[0]), fake = transport(false);
    const request: StudioCoplanarEdgeDissolveRequest = { ...f.request, halfEdgeIds: ids };
    const pending = computeStudioHybridDccCoplanarEdgeDissolveInWorker(f.source, request, { ...f.options, workerFactory: () => fake.worker });
    ids[0] = 0;
    expect(fake.request().request.halfEdgeIds).toEqual([originalId]);
    fake.emit("message", compute(fake.request()));
    const result = await pending;
    if (!result.ok) throw new Error(result.detail);
    expect(result.sourceFaceIds).toEqual([1, 6]); expect(fake.terminated()).toBe(1);
  });

  it("원본 hash·revision·요청 hash·scope·잘못된 edge ID는 factory 전에 거부한다", async () => {
    const f = fixture(), factory = vi.fn(() => transport().worker), before = serializeStudioEditableMesh(f.source.mesh);
    const cases = [
      { source: { ...f.source, meshHash: "stale" }, request: f.request, options: f.options },
      { source: { ...f.source, meshRevision: 0 }, request: f.request, options: f.options },
      { source: f.source, request: { ...f.request, sourceMeshHash: "stale" }, options: f.options },
      { source: f.source, request: { ...f.request, sourceMeshRevision: 18 }, options: f.options },
      { source: f.source, request: { ...f.request, halfEdgeIds: [0.5] }, options: f.options },
      { source: f.source, request: f.request, options: { ...f.options, assetId: "" } },
      { source: f.source, request: f.request, options: { ...f.options, generation: -1 } },
    ];
    for (const current of cases) await expect(computeStudioHybridDccCoplanarEdgeDissolveInWorker(current.source, current.request, {
      ...current.options, workerFactory: factory,
    })).rejects.toMatchObject({ code: "invalid-input" });
    expect(factory).not.toHaveBeenCalled(); expect(serializeStudioEditableMesh(f.source.mesh)).toEqual(before);
  });

  type ScopeField = "requestId" | "requestDigest" | "generation" | "assetId" | "sourceMeshHash" | "sourceMeshRevision";
  const scopeFields: readonly ScopeField[] = ["requestId", "requestDigest", "generation", "assetId", "sourceMeshHash", "sourceMeshRevision"];
  it.each(scopeFields)("같은 계산 payload라도 다른 %s scope는 성공시키지 않는다", async (field) => {
    const f = fixture(), fake = transport(true, (response) => {
      if (response.kind !== "result") throw new Error("실제 치유 결과 scope가 없습니다.");
      switch (field) {
        case "requestId": return { ...response, requestId: response.requestId + 1 };
        case "requestDigest": return { ...response, requestDigest: changedDigest(response.requestDigest) };
        case "generation": return { ...response, generation: response.generation + 1 };
        case "assetId": return { ...response, assetId: "other" };
        case "sourceMeshHash": return { ...response, sourceMeshHash: changedDigest(response.sourceMeshHash) };
        case "sourceMeshRevision": return { ...response, sourceMeshRevision: response.sourceMeshRevision + 1 };
      }
    });
    await expect(computeStudioHybridDccCoplanarEdgeDissolveInWorker(f.source, f.request, { ...f.options, workerFactory: () => fake.worker })).rejects.toMatchObject({ code: "protocol" });
    expect(fake.terminated()).toBe(1); expect(fake.listenerCount()).toBe(0);
  });

  it("getter·extra key·바뀐 packed checksum은 일반 wire 데이터로 수용하지 않는다", () => {
    const f = fixture(), request = need(createStudioCoplanarEdgeDissolveWorkerRequest(f.source, f.request, f.options, 9));
    expect(isStudioCoplanarEdgeDissolveWorkerRequest(request)).toBe(true);
    expect(isStudioCoplanarEdgeDissolveWorkerRequest({ ...request, requestDigest: changedDigest(request.requestDigest) })).toBe(false);
    expect(isStudioCoplanarEdgeDissolveWorkerRequest({ ...request, request: { ...request.request, halfEdgeIds: [0] } })).toBe(false);
    let getterCalls = 0;
    const getter = { ...request };
    Object.defineProperty(getter, "payload", { enumerable: true, get() { getterCalls++; return request.payload; } });
    expect(isStudioCoplanarEdgeDissolveWorkerRequest(getter)).toBe(false); expect(getterCalls).toBe(0);
    expect(isStudioCoplanarEdgeDissolveWorkerRequest({ ...request, extra: true })).toBe(false);
    const corrupt = structuredClone(request), bytes = new DataView(corrupt.payload.buffer);
    bytes.setUint8(0, bytes.getUint8(0) ^ 1);
    expect(isStudioCoplanarEdgeDissolveWorkerRequest(corrupt)).toBe(false);
    const response = compute(request);
    expect(isStudioCoplanarEdgeDissolveWorkerResponse(response)).toBe(true);
    expect(isStudioCoplanarEdgeDissolveWorkerResponse({ ...response, extra: true })).toBe(false);
    const corruptResponse = structuredClone(response);
    if (corruptResponse.kind !== "result" || !corruptResponse.result.ok) throw new Error("변조할 실제 치유 결과가 없습니다.");
    expect(isStudioCoplanarEdgeDissolveWorkerResponse({ ...corruptResponse, result: { ...corruptResponse.result, ok: "true" } })).toBe(false);
    const outputBytes = new DataView(corruptResponse.result.payload.buffer);
    outputBytes.setUint8(0, outputBytes.getUint8(0) ^ 1);
    expect(isStudioCoplanarEdgeDissolveWorkerResponse(corruptResponse)).toBe(false);
    const badResponse = { ...response };
    Object.defineProperty(badResponse, "kind", { enumerable: true, get() { getterCalls++; return "result"; } });
    expect(isStudioCoplanarEdgeDissolveWorkerResponse(badResponse)).toBe(false); expect(getterCalls).toBe(0);
  });

  it("전송된 결과 hash와 실제 복원 바이트가 다르면 거부한다", async () => {
    const f = fixture(), fake = transport(true, (response) => {
      if (response.kind !== "result" || !response.result.ok) throw new Error("실제 치유 성공 결과가 없습니다.");
      return { ...response, result: { ...response.result, resultMeshHash: f.source.meshHash } };
    });
    await expect(computeStudioHybridDccCoplanarEdgeDissolveInWorker(f.source, f.request, { ...f.options, workerFactory: () => fake.worker })).rejects.toMatchObject({ code: "protocol" });
  });

  it("실제 커널의 비공면 거부는 typed 결과와 원본 detail로 반환한다", async () => {
    const f = fixture(), request = { ...f.request, halfEdgeIds: [0] }, fake = transport();
    const expected = dissolveStudioHybridDccCoplanarEdges(f.source, request);
    expect(expected.ok).toBe(false);
    if (expected.ok) throw new Error("비공면 입력이 실제 커널에서 성공했습니다.");
    expect(expected.code).toBe("non-coplanar");
    const result = await computeStudioHybridDccCoplanarEdgeDissolveInWorker(f.source, request, { ...f.options, workerFactory: () => fake.worker });
    expect(result).toEqual(expected); expect(fake.terminated()).toBe(1);
  });

  it.each(["uvLayers", "normalLayer"])("%s를 가진 원본·결과는 pack으로 채널을 버리기 전에 거부한다", async (channel) => {
    const f = fixture(), extra = { revision: 1 };
    const mesh: StudioEditableMesh & Readonly<Record<string, unknown>> = { ...f.source.mesh, [channel]: extra };
    const factory = vi.fn(() => transport().worker);
    // 정본 hash가 추가 채널을 표현하지 않아도 실제 요청 경계가 손실을 허용하지 않아야 한다.
    expect(hashStudioEditableMesh(mesh)).toBe(f.source.meshHash);
    await expect(computeStudioHybridDccCoplanarEdgeDissolveInWorker({ ...f.source, mesh }, f.request, {
      ...f.options, workerFactory: factory,
    })).rejects.toMatchObject({ code: "invalid-input" });
    expect(factory).not.toHaveBeenCalled(); expect(mesh[channel]).toBe(extra);
    const request = need(createStudioCoplanarEdgeDissolveWorkerRequest(f.source, f.request, f.options, 19));
    const computed = dissolveStudioHybridDccCoplanarEdges(f.source, f.request);
    if (!computed.ok) throw new Error("추가 채널 거부를 확인할 실제 치유 결과가 없습니다.");
    const resultMesh: StudioEditableMesh & Readonly<Record<string, unknown>> = { ...computed.mesh, [channel]: extra };
    expect(() => createStudioCoplanarEdgeDissolveWorkerResponse(request, { ...computed, mesh: resultMesh }))
      .toThrow("추가 메시 채널");
    expect(resultMesh[channel]).toBe(extra);
  });

  it("시작 전 취소는 factory를 호출하지 않고 대기 중 취소는 소유 Worker를 종료한다", async () => {
    const f = fixture(), controller = new AbortController(), factory = vi.fn(() => transport().worker); controller.abort();
    await expect(computeStudioHybridDccCoplanarEdgeDissolveInWorker(f.source, f.request, { ...f.options, signal: controller.signal, workerFactory: factory })).rejects.toMatchObject({ code: "aborted", name: "AbortError" });
    expect(factory).not.toHaveBeenCalled();
    const pendingController = new AbortController(), fake = transport(false);
    const pending = computeStudioHybridDccCoplanarEdgeDissolveInWorker(f.source, f.request, { ...f.options, signal: pendingController.signal, workerFactory: () => fake.worker });
    pendingController.abort(); await expect(pending).rejects.toMatchObject({ code: "aborted" });
    fake.emit("message", compute(fake.request()));
    expect(fake.posts()).toBe(1); expect(fake.terminated()).toBe(1); expect(fake.listenerCount()).toBe(0);
  });

  it.each([false, true])("factory 동기 취소의 정리 실패 %s를 보존하고 전송하지 않는다", async (cleanupFails) => {
    const f = fixture(), controller = new AbortController(), fake = transport(false);
    if (cleanupFails) fake.failTerminate();
    const pending = computeStudioHybridDccCoplanarEdgeDissolveInWorker(f.source, f.request, {
      ...f.options, signal: controller.signal, workerFactory: () => { controller.abort(); return fake.worker; },
    });
    await expect(pending).rejects.toMatchObject({ code: "aborted", name: "AbortError", cleanupFailed: cleanupFails });
    expect(fake.posts()).toBe(0); expect(fake.terminated()).toBe(1); expect(fake.listenerCount()).toBe(0);
  });

  it("timeout 뒤 늦은 결과는 재발행하지 않고 Worker와 listener를 정리한다", async () => {
    vi.useFakeTimers(); const f = fixture(), fake = transport(false);
    const pending = computeStudioHybridDccCoplanarEdgeDissolveInWorker(f.source, f.request, { ...f.options, timeoutMs: 100, workerFactory: () => fake.worker });
    const rejected = expect(pending).rejects.toMatchObject({ code: "timeout", name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(100); await rejected;
    fake.emit("message", compute(fake.request()));
    expect(fake.posts()).toBe(1); expect(fake.terminated()).toBe(1); expect(fake.listenerCount()).toBe(0);
  });

  const failures: readonly ("error" | "messageerror")[] = ["error", "messageerror"];
  it.each(failures)("%s는 main 커널 fallback 없이 한 Worker만 종료한다", async (type) => {
    const f = fixture(), fake = transport(false), factory = vi.fn(() => fake.worker);
    const pending = computeStudioHybridDccCoplanarEdgeDissolveInWorker(f.source, f.request, { ...f.options, workerFactory: factory });
    fake.emit(type); await expect(pending).rejects.toMatchObject({ code: "worker-failed" });
    expect(factory).toHaveBeenCalledTimes(1); expect(fake.terminated()).toBe(1); expect(fake.listenerCount()).toBe(0);
  });

  it("실제 성공 결과가 있어도 terminate 실패는 성공으로 반환하지 않는다", async () => {
    const f = fixture(), fake = transport(); fake.failTerminate();
    await expect(computeStudioHybridDccCoplanarEdgeDissolveInWorker(f.source, f.request, { ...f.options, workerFactory: () => fake.worker })).rejects.toMatchObject({ code: "cleanup-failed", cleanupFailed: true });
  });

  it("취소가 우선 원인이면 정리 실패를 별도 flag로 보존한다", async () => {
    const f = fixture(), controller = new AbortController(), fake = transport(false); fake.failTerminate();
    const pending = computeStudioHybridDccCoplanarEdgeDissolveInWorker(f.source, f.request, { ...f.options, signal: controller.signal, workerFactory: () => fake.worker });
    controller.abort(); await expect(pending).rejects.toMatchObject({ code: "aborted", cleanupFailed: true });
    expect(fake.terminated()).toBe(1); expect(fake.listenerCount()).toBe(0);
  });

  it("Worker 없음·생성 예외·잘못된 timeout은 계산 fallback이나 재시도를 하지 않는다", async () => {
    const f = fixture(), unavailable = vi.fn(() => null), failed = vi.fn(() => { throw new Error("factory 실패 fixture"); });
    await expect(computeStudioHybridDccCoplanarEdgeDissolveInWorker(f.source, f.request, { ...f.options, workerFactory: unavailable })).rejects.toMatchObject({ code: "worker-unavailable" });
    await expect(computeStudioHybridDccCoplanarEdgeDissolveInWorker(f.source, f.request, { ...f.options, workerFactory: failed })).rejects.toMatchObject({ code: "worker-failed" });
    const factory = vi.fn(() => transport().worker);
    for (const timeoutMs of [0, 99, 120_001, Number.NaN]) await expect(computeStudioHybridDccCoplanarEdgeDissolveInWorker(f.source, f.request, { ...f.options, timeoutMs, workerFactory: factory })).rejects.toMatchObject({ code: "invalid-input" });
    expect(unavailable).toHaveBeenCalledTimes(1); expect(failed).toHaveBeenCalledTimes(1); expect(factory).not.toHaveBeenCalled();
  });

  it("실제 entry는 packed 치유를 한 번 처리하고 같은 요청의 재실행을 거부한다", async () => {
    let receive: ((event: MessageEvent<unknown>) => void) | null = null;
    const responses: StudioCoplanarEdgeDissolveWorkerResponse[] = [];
    vi.stubGlobal("self", {
      addEventListener(type: string, callback: (event: MessageEvent<unknown>) => void) { if (type === "message") receive = callback; },
      postMessage(response: StudioCoplanarEdgeDissolveWorkerResponse, options?: StructuredSerializeOptions) { responses.push(structuredClone(response, options)); },
    });
    vi.resetModules(); await import("./studio-hybrid-dcc-coplanar-edge-dissolve.worker");
    const f = fixture(), request = need(createStudioCoplanarEdgeDissolveWorkerRequest(f.source, f.request, f.options, 11));
    const wire = structuredClone(request, { transfer: [request.payload.buffer] });
    const deliver = (data: unknown): void => {
      if (receive === null) throw new Error("실제 치유 Worker entry listener가 없습니다.");
      receive(new MessageEvent("message", { data }));
    };
    deliver(wire);
    expect(responses).toHaveLength(1); const response = need(responses[0]);
    expect(isStudioCoplanarEdgeDissolveWorkerResponse(response)).toBe(true);
    expect(response).toMatchObject({ kind: "result", requestId: 11, generation: 0, sourceMeshHash: f.source.meshHash, sourceMeshRevision: 17 });
    if (response.kind !== "result" || !response.result.ok) throw new Error("실제 entry의 치유 결과가 성공하지 않았습니다.");
    const restored = need(unpackStudioHybridDccGlbExportInput(response.result.payload));
    expect(restored.mesh.faces).toHaveLength(6); expect(restored.mesh.uvLayer).toBeDefined();
    deliver(wire); expect(responses).toHaveLength(2);
    expect(responses[1]).toMatchObject({ kind: "error", requestId: 11, generation: 0, code: "protocol" });
  });
});
