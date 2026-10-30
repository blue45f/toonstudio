/** 실제 codec·UV/chord 커널을 쓰는 미실행 전송 회귀. Worker realm/브라우저 성공 증거는 별도다. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStudioUnitCubeMesh, hashStudioEditableMesh, serializeStudioEditableMesh, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { decodeStudioMeshUvLayer, hashStudioMeshUvTopology } from "../mesh-uv/studio-mesh-uv-authority";
import { readStudioMeshFaceLoops } from "./studio-hybrid-dcc-face-modeling-mesh";
import { splitStudioEditableFaceBoundaryChordWithUv } from "./studio-hybrid-dcc-boundary-chord-uv";
import { packStudioHybridDccGlbExportInput, unpackStudioHybridDccGlbExportInput } from "./studio-hybrid-dcc-glb-export-packed-mesh";
import {
  createStudioBoundaryChordWorkerRequest, createStudioBoundaryChordWorkerResponse, isStudioBoundaryChordWorkerResponse,
  type StudioBoundaryChordWorkerInput, type StudioBoundaryChordWorkerRequest, type StudioBoundaryChordWorkerResponse,
} from "./studio-hybrid-dcc-boundary-chord-worker-protocol";
import { computeStudioHybridDccBoundaryChordInWorker, type StudioBoundaryChordWorkerLike } from "./studio-hybrid-dcc-boundary-chord-worker-client";

function need<T>(value: T | null | undefined): T { if (value === null || value === undefined) throw new Error("실제 회귀 입력이 없습니다."); return value; }
function fixture(uv = false): StudioBoundaryChordWorkerInput {
  const cube = createStudioUnitCubeMesh();
  const plain: StudioEditableMesh = uv ? cube : { ...cube, vertices: cube.vertices.map((vertex) => ({ ...vertex,
    position: { ...vertex.position, x: vertex.position.x + 0.123456789012345 } })) };
  const mesh: StudioEditableMesh = !uv ? plain : { ...plain, uvLayer: decodeStudioMeshUvLayer({ revision: 1,
    topologyHash: hashStudioMeshUvTopology(plain), corners: plain.halfEdges.map((edge) => {
      const position = need(plain.vertices[need(plain.halfEdges[edge.prev]).vertex]).position;
      return { halfEdgeId: edge.id, u: Math.fround(position.x + 0.5), v: Math.fround(position.z + 0.5) };
    }) }, plain) };
  const face = need(need(readStudioMeshFaceLoops(mesh)).find((loop) => loop.vertexIds.every((id) => need(mesh.vertices[id]).position.y === 0.5)));
  const meshHash = hashStudioEditableMesh(mesh), meshRevision = 17;
  return { assetId: "editable-cube", mesh, meshHash, meshRevision, generation: 3, request: { sourceMeshHash: meshHash, sourceMeshRevision: meshRevision,
    faceId: face.id, start: { kind: "edge", halfEdgeId: need(face.halfEdgeIds[0]), t: 0.5 }, end: { kind: "edge", halfEdgeId: need(face.halfEdgeIds[2]), t: 0.5 } } };
}
function compute(request: StudioBoundaryChordWorkerRequest): StudioBoundaryChordWorkerResponse {
  const input = need(unpackStudioHybridDccGlbExportInput(request.payload));
  return createStudioBoundaryChordWorkerResponse(request, splitStudioEditableFaceBoundaryChordWithUv({ mesh: input.mesh, meshHash: input.sourceHash, meshRevision: input.sourceRevision }, request.request));
}
type Listener = ((event: { readonly data: unknown }) => void) | ((event: { preventDefault?(): void }) => void);
function transport(auto = true, change: (response: StudioBoundaryChordWorkerResponse) => StudioBoundaryChordWorkerResponse = (value) => value) {
  const listeners = new Map<string, Set<Listener>>(); let posted: StudioBoundaryChordWorkerRequest | null = null, terminated = 0, throwTerminate = false;
  const emit = (type: string, data?: unknown) => { for (const listener of [...(listeners.get(type) ?? [])]) listener({ data, preventDefault() {} }); };
  const worker: StudioBoundaryChordWorkerLike = {
    postMessage(request, transfer) {
      posted = structuredClone(request, { transfer });
      if (auto) { const response = change(compute(posted)); queueMicrotask(() => emit("message", structuredClone(response, {
        transfer: response.kind === "result" && response.result.ok ? [response.result.payload.buffer] : [],
      }))); }
    },
    addEventListener(type: "message" | "error" | "messageerror", listener: Listener) { const set = listeners.get(type) ?? new Set<Listener>(); set.add(listener); listeners.set(type, set); },
    removeEventListener(type: "message" | "error" | "messageerror", listener: Listener) { listeners.get(type)?.delete(listener); },
    terminate() { terminated++; if (throwTerminate) throw new Error("정리 오류 fixture"); },
  };
  return { worker, emit, request: () => need(posted), terminated: () => terminated,
    listenerCount: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0), failTerminate: () => { throwTerminate = true; } };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("경계 chord 전용 Worker client 계약", () => {
  it("실제 f64 packed transfer·커널·전체 remap을 복원하며 원본을 변경하지 않는다", async () => {
    const input = fixture(), before = serializeStudioEditableMesh(input.mesh), fake = transport();
    const result = await computeStudioHybridDccBoundaryChordInWorker(input, { workerFactory: () => fake.worker });
    if (!result.ok) throw new Error(result.messageKo);
    expect(result.sourceMeshHash).toBe(input.meshHash); expect(result.sourceMeshRevision).toBe(17);
    expect(result.mesh.vertices).toHaveLength(10); expect(result.mesh.faces).toHaveLength(7);
    expect(result.faceRemap).toHaveLength(6); expect(result.halfEdgeRemap).toHaveLength(24);
    expect(result.mesh.vertices.slice(0, 8).map(({ position }) => position)).toEqual(input.mesh.vertices.map(({ position }) => position));
    expect(serializeStudioEditableMesh(input.mesh)).toEqual(before); expect(fake.request().generation).toBe(3);
    expect(fake.terminated()).toBe(1); expect(fake.listenerCount()).toBe(0);
  });
  it("UV 포함 packed 응답도 원본 코너·새 topology hash와 함께 복원한다", async () => {
    const input = fixture(true), before = serializeStudioEditableMesh(input.mesh), fake = transport();
    const result = await computeStudioHybridDccBoundaryChordInWorker(input, { workerFactory: () => fake.worker });
    if (!result.ok) throw new Error(result.messageKo);
    const layer = need(result.mesh.uvLayer); expect(layer.corners).toHaveLength(result.mesh.halfEdges.length);
    expect(layer.topologyHash).toBe(hashStudioMeshUvTopology(result.mesh)); expect(result.sourceMeshHash).toBe(input.meshHash);
    expect(serializeStudioEditableMesh(input.mesh)).toEqual(before);
  });
  it.each(["generation", "assetId", "sourceMeshRevision", "sourceMeshHash"] as const)("다른 %s 응답은 같은 requestId여도 거부한다", async (field) => {
    const fake = transport(true, (response) => {
      if (response.kind !== "result") throw new Error("실제 결과가 없습니다.");
      switch (field) {
        case "generation": return { ...response, generation: response.generation + 1 };
        case "assetId": return { ...response, assetId: "other" };
        case "sourceMeshRevision": return { ...response, sourceMeshRevision: response.sourceMeshRevision + 1 };
        case "sourceMeshHash": return { ...response, sourceMeshHash: "stale" };
      }
    });
    await expect(computeStudioHybridDccBoundaryChordInWorker(fixture(), { workerFactory: () => fake.worker })).rejects.toMatchObject({ code: "protocol" });
    expect(fake.terminated()).toBe(1); expect(fake.listenerCount()).toBe(0);
  });
  it("다시 checksum/hash를 만든 응답이라도 기존 정점을 옮기면 거부한다", async () => {
    const fake = transport(true, (response) => {
      if (response.kind !== "result" || !response.result.ok) throw new Error("실제 결과가 없습니다.");
      const original = need(unpackStudioHybridDccGlbExportInput(response.result.payload));
      const mesh: StudioEditableMesh = { ...original.mesh, vertices: original.mesh.vertices.map((vertex) => vertex.id === 0
        ? { ...vertex, position: { ...vertex.position, x: vertex.position.x + 0.25 } } : vertex) };
      const hash = hashStudioEditableMesh(mesh);
      return { ...response, result: { ...response.result, resultMeshHash: hash,
        payload: packStudioHybridDccGlbExportInput({ ...original, mesh, sourceHash: hash }) } };
    });
    await expect(computeStudioHybridDccBoundaryChordInWorker(fixture(), { workerFactory: () => fake.worker })).rejects.toMatchObject({ code: "protocol" });
  });
  it("전체 half-edge 대응을 누락한 결과는 게시하지 않는다", async () => {
    const fake = transport(true, (response) => {
      if (response.kind !== "result" || !response.result.ok) throw new Error("실제 결과가 없습니다.");
      return { ...response, result: { ...response.result, halfEdgeRemap: response.result.halfEdgeRemap.slice(1) } };
    });
    await expect(computeStudioHybridDccBoundaryChordInWorker(fixture(), { workerFactory: () => fake.worker })).rejects.toMatchObject({ code: "protocol" });
  });
  it("취소된 시작은 factory를 호출하지 않고 대기 중 취소는 즉시 종료한다", async () => {
    const input = fixture(), controller = new AbortController(), factory = vi.fn(() => transport().worker); controller.abort();
    await expect(computeStudioHybridDccBoundaryChordInWorker(input, { signal: controller.signal, workerFactory: factory })).rejects.toMatchObject({ name: "AbortError", code: "aborted" });
    expect(factory).not.toHaveBeenCalled();
    const pendingController = new AbortController(), fake = transport(false);
    const pending = computeStudioHybridDccBoundaryChordInWorker(input, { signal: pendingController.signal, workerFactory: () => fake.worker });
    pendingController.abort(); await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fake.terminated()).toBe(1); expect(fake.listenerCount()).toBe(0);
  });
  it("factory 내부 동기 취소도 방금 생성한 Worker를 남기지 않는다", async () => {
    const controller = new AbortController(), fake = transport(false);
    const pending = computeStudioHybridDccBoundaryChordInWorker(fixture(), { signal: controller.signal, workerFactory: () => { controller.abort(); return fake.worker; } });
    await expect(pending).rejects.toMatchObject({ code: "aborted" }); expect(fake.terminated()).toBe(1); expect(fake.listenerCount()).toBe(0);
  });
  it("기한 초과와 늦은 응답은 새 성공을 만들지 않는다", async () => {
    vi.useFakeTimers(); const fake = transport(false);
    const pending = computeStudioHybridDccBoundaryChordInWorker(fixture(), { timeoutMs: 100, workerFactory: () => fake.worker });
    const rejected = expect(pending).rejects.toMatchObject({ name: "TimeoutError", code: "timeout" });
    await vi.advanceTimersByTimeAsync(100); await rejected;
    fake.emit("message", compute(fake.request())); expect(fake.terminated()).toBe(1); expect(fake.listenerCount()).toBe(0);
  });
  it.each(["error", "messageerror"] as const)("%s 후 direct 재실행 없이 종료한다", async (type) => {
    const fake = transport(false), factory = vi.fn(() => fake.worker);
    const pending = computeStudioHybridDccBoundaryChordInWorker(fixture(), { workerFactory: factory }); fake.emit(type);
    await expect(pending).rejects.toMatchObject({ code: "worker-failed" }); expect(factory).toHaveBeenCalledTimes(1);
    expect(fake.terminated()).toBe(1); expect(fake.listenerCount()).toBe(0);
  });
  it("실제 결과가 있어도 종료 확인 실패는 성공으로 반환하지 않는다", async () => {
    const fake = transport(); fake.failTerminate();
    await expect(computeStudioHybridDccBoundaryChordInWorker(fixture(), { workerFactory: () => fake.worker })).rejects.toMatchObject({ code: "cleanup-failed", cleanupFailed: true });
  });
  it("실제 Worker entry는 packed source와 UV 커널 결과를 구조화 복제 가능한 DTO로 보낸다", async () => {
    let receive: ((event: MessageEvent<unknown>) => void) | null = null;
    const responses: StudioBoundaryChordWorkerResponse[] = [];
    vi.stubGlobal("self", {
      addEventListener(type: string, callback: (event: MessageEvent<unknown>) => void) { if (type === "message") receive = callback; },
      postMessage(response: StudioBoundaryChordWorkerResponse, options?: StructuredSerializeOptions) { responses.push(structuredClone(response, options)); },
    });
    vi.resetModules(); await import("./studio-hybrid-dcc-boundary-chord.worker");
    const request = need(createStudioBoundaryChordWorkerRequest(fixture(true), 7));
    const deliver = (event: MessageEvent<unknown>): void => { if (receive === null) throw new Error("실제 Worker entry listener가 없습니다."); receive(event); };
    deliver(new MessageEvent("message", { data: structuredClone(request, { transfer: [request.payload.buffer] }) }));
    expect(responses).toHaveLength(1); const response = need(responses[0]); expect(isStudioBoundaryChordWorkerResponse(response)).toBe(true);
    expect(response).toMatchObject({ kind: "result", requestId: 7, generation: 3, sourceMeshRevision: 17 });
    if (response.kind !== "result" || !response.result.ok) throw new Error("실제 Worker 계산이 성공하지 않았습니다.");
    expect(need(unpackStudioHybridDccGlbExportInput(response.result.payload)).mesh.uvLayer).toBeDefined();
  });
});
