import { create, parseSkp } from "openskp";
import { Box3, Group, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { convertStudioBg3dModelFilesToGlb } from "./studio-bg3d-model-import";
import { convertStudioBg3dSkpBytes, isOpenSkpModuleLike } from "./studio-bg3d-skp-conversion-core";
import { readStudioBg3dSkpMetricImport } from "./studio-bg3d-skp-metric-provenance";
import { extractStudioBg3dSkpSceneManifest } from "./studio-bg3d-skp-scene-manifest";
import { readStudioBg3dSkpSceneSource } from "./studio-bg3d-skp-scene-provenance";
import { createStudioBg3dSkpSceneSourceMfcBytes, createStudioBg3dSkpSceneSourceVffBytes } from "./studio-bg3d-skp-scene-source.test-fixture";
import { isStudioBg3dSkpWorkerResponse } from "./studio-bg3d-skp-worker-protocol";

import type { StudioBg3dSkpWorkerLike } from "./studio-bg3d-skp-worker-client";
import type { StudioBg3dSkpWorkerRequest, StudioBg3dSkpWorkerResponse } from "./studio-bg3d-skp-worker-protocol";
import type { StudioBg3dSkpRuntimeOptions } from "./studio-bg3d-skp-worker-runtime";
import type { StudioBg3dSkpUnitResolver } from "./studio-bg3d-skp-import";

type Listener = (event: { readonly data: unknown; preventDefault?(): void }) => void;

class PipelineFileReader {
  result: ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob): void {
    void blob.arrayBuffer().then((buffer) => { this.result = buffer; this.onloadend?.(); }, () => this.onerror?.());
  }
}

/** 실제 Worker 진입점과 client를 구조화 복제·transfer로 잇는다. 변환과 manifest 추출은 가짜로 바꾸지 않는다. */
async function installWorkerBridge() {
  let workerListener: Listener | undefined;
  const workers: BridgeWorker[] = [];
  const posted: StudioBg3dSkpWorkerResponse[] = [];
  class BridgeWorker implements StudioBg3dSkpWorkerLike {
    readonly listeners: Record<"message" | "error" | "messageerror", Set<Listener>> = { message: new Set(), error: new Set(), messageerror: new Set() };
    terminated = false;
    constructor() { workers.push(this); }
    postMessage(message: StudioBg3dSkpWorkerRequest, transfer: Transferable[] = []): void {
      if (!workerListener) throw new Error("Worker 진입점이 없습니다.");
      workerListener({ data: structuredClone(message, { transfer }) });
    }
    addEventListener(type: "message" | "error" | "messageerror", listener: Listener): void { this.listeners[type].add(listener); }
    removeEventListener(type: "message" | "error" | "messageerror", listener: Listener): void { this.listeners[type].delete(listener); }
    terminate(): void { this.terminated = true; }
    deliver(data: unknown): void { for (const listener of [...this.listeners.message]) listener({ data }); }
  }
  vi.stubGlobal("self", {
    addEventListener: (type: string, listener: Listener): void => { if (type === "message") workerListener = listener; },
    postMessage: (message: unknown, transfer: Transferable[] = []): void => {
      const delivered: unknown = structuredClone(message, { transfer });
      if (!isStudioBg3dSkpWorkerResponse(delivered)) throw new Error("Worker 응답 계약이 올바르지 않습니다.");
      posted.push(delivered);
      workers.at(-1)?.deliver(delivered);
    },
  });
  vi.stubGlobal("Worker", BridgeWorker);
  vi.stubGlobal("FileReader", PipelineFileReader);
  vi.resetModules();
  await import("./studio-bg3d-skp.worker");
  return { posted, terminated: () => workers.at(-1)?.terminated };
}

afterEach(() => {
  vi.doUnmock("./studio-bg3d-skp-worker-runtime");
  vi.unstubAllGlobals();
});

function exactBuffer(bytes: Uint8Array): ArrayBuffer { return new Uint8Array(bytes).buffer; }

describe("실제 SKP 원본 장면의 Worker→최종 GLB 파이프라인", () => {
  const cases = [
    { name: "MFC", bytes: createStudioBg3dSkpSceneSourceMfcBytes },
    { name: "VFF", bytes: createStudioBg3dSkpSceneSourceVffBytes },
  ];
  it.each(cases)("$name 원본 manifest가 실제 Worker와 최종 GLTFExporter·재로딩 뒤 동일하다", async ({ bytes: makeBytes }) => {
    const bytes = makeBytes();
    const expected = extractStudioBg3dSkpSceneManifest(parseSkp(exactBuffer(bytes)));
    if (!expected.ok) throw new Error(expected.detail);
    const bridge = await installWorkerBridge();
    const outputs = await convertStudioBg3dModelFilesToGlb([new File([exactBuffer(bytes)], "background.skp")], { executionBackend: "worker" });
    expect(bridge.terminated()).toBe(true);
    const workerResult = bridge.posted.find((response) => response.kind === "result");
    expect(workerResult?.sceneSource).toMatchObject({ status: "available", manifest: expected.value });
    const loaded = await new GLTFLoader().parseAsync(await outputs[0].arrayBuffer(), "");
    const read = readStudioBg3dSkpSceneSource(loaded.scene);
    if (!read.ok || read.value.status !== "available") throw new Error("최종 GLB의 원본 manifest를 검증하지 못했습니다.");
    expect(read.value.manifest).toEqual(expected.value);
    expect(read.value.geometryTransform).toMatchObject({ status: "known", axisMapping: "x,z,-y", appliedUnit: "inch", unitScaleFactor: 1, userSelectedUnit: false, metersPerSourceUnit: 0.0254 });
    expect(readStudioBg3dSkpMetricImport(loaded.scene)).toBe("authored-metres");
    expect(read.value.manifest.definitions.sourceTotal).toBeNull();
    expect(read.value.manifest.pages.items.every((page) => page.fovBasis === "not-exposed")).toBe(true);
  });

  it("실제 사용자 단위 보정 뒤에도 원본 인치 manifest를 보존하고 형상과 일치하는 축·배율을 기록한다", async () => {
    const builder = create();
    builder.addFace([[0.1, 0.2, 0.3], [0.3, 0.2, 0.3], [0.1, 0.4, 0.5]]);
    const bytes = builder.toBytes();
    const expected = extractStudioBg3dSkpSceneManifest(parseSkp(exactBuffer(bytes)));
    if (!expected.ok) throw new Error(expected.detail);
    await installWorkerBridge();
    const resolveUnit = vi.fn<StudioBg3dSkpUnitResolver>(async () => ({ kind: "unit", unit: "m" }));
    const outputs = await convertStudioBg3dModelFilesToGlb([new File([exactBuffer(bytes)], "tiny.skp")], { executionBackend: "worker", skp: { resolveUnit } });
    expect(resolveUnit).toHaveBeenCalledTimes(1);
    const loaded = await new GLTFLoader().parseAsync(await outputs[0].arrayBuffer(), "");
    const read = readStudioBg3dSkpSceneSource(loaded.scene);
    if (!read.ok || read.value.status !== "available") throw new Error("단위를 보정한 출처가 없습니다.");
    expect(read.value.manifest).toEqual(expected.value);
    expect(read.value.geometryTransform).toMatchObject({ appliedUnit: "m", userSelectedUnit: true, unitScaleFactor: 1 / 0.0254, metersPerSourceUnit: 0.0254 * (1 / 0.0254) });
    const bounds = new Box3().setFromObject(loaded.scene, true);
    expect(bounds.min.distanceTo(new Vector3(0.1, 0.3, -0.4))).toBeLessThan(1e-6);
    expect(bounds.max.distanceTo(new Vector3(0.3, 0.5, -0.2))).toBeLessThan(1e-6);
  });

  it("2차 원본 파싱 실패는 실제 형상 변환을 유지하고 unavailable 원인을 최종 GLB에 남긴다", async () => {
    const openskp = await import("openskp");
    vi.doMock("./studio-bg3d-skp-worker-runtime", () => ({
      runStudioBg3dSkpConversion: (bytes: ArrayBuffer | Uint8Array, options: StudioBg3dSkpRuntimeOptions) => convertStudioBg3dSkpBytes(bytes, {
        ...options, loadModule: async () => {
          const module: unknown = { buildScene: openskp.buildScene, toGLB: openskp.toGLB, parseSkp: () => { throw new Error("metadata parse failure"); } };
          if (!isOpenSkpModuleLike(module)) throw new Error("테스트 OpenSKP 모듈이 올바르지 않습니다.");
          return module;
        },
      }),
    }));
    await installWorkerBridge();
    const outputs = await convertStudioBg3dModelFilesToGlb([new File([exactBuffer(createStudioBg3dSkpSceneSourceMfcBytes())], "geometry-only.skp")], { executionBackend: "worker" });
    const loaded = await new GLTFLoader().parseAsync(await outputs[0].arrayBuffer(), "");
    expect(new Box3().setFromObject(loaded.scene, true).isEmpty()).toBe(false);
    expect(readStudioBg3dSkpSceneSource(loaded.scene)).toMatchObject({ ok: true, value: { status: "unavailable", reason: "metadata-parse-failed", manifest: null, geometryTransform: { status: "known" } } });
    expect(readStudioBg3dSkpSceneSource(new Group())).toMatchObject({ ok: true, value: { status: "legacy", geometryTransform: { status: "unknown" } } });
  });
});
