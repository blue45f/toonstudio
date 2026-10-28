import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { create as createSkpBuilder } from "openskp";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { createBgCustomModelInstance, type BgCustomModelInstance } from "../studio-background-3d-model";
import { attachStudioBg3dEditorPlacementHost } from "./studio-bg3d-editor-placement-host";
import { loadStudioBg3dMetricAttachment, resolveStudioBg3dMetricPlacementScale } from "./studio-bg3d-model-metric-placement";
import { StudioBg3dModelMetricPolicyError } from "./studio-bg3d-model-metric-policy";
import { convertStudioBg3dModelFilesToGlb } from "./studio-bg3d-model-import";
import { StudioBg3dModelPlacementAdmissionError, assertStudioBg3dModelAttachmentAdmission } from "./studio-bg3d-model-placement-admission";
import { computeStudioBg3dAutoFitScale } from "./studio-bg3d-model-scale-contract";
import { createStudioBg3dPlacementSession, transitionStudioBg3dPlacementSession } from "./studio-bg3d-placement-session";
import { createDefaultStudioBg3dSceneDocument, STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS, STUDIO_BG3D_GLB_MIME, normalizeStudioBg3dGlbAttachment } from "./studio-bg3d-scene-document";
import { adaptStudioBg3dRuntimeToDocument, hydrateStudioBg3dDocumentToRuntime } from "./studio-bg3d-scene-runtime";
import { readStudioBg3dSkpMetricImport } from "./studio-bg3d-skp-metric-provenance";

vi.mock("./studio-bg3d-editor-runtime-bindings", () => ({}));
afterEach(() => { vi.unstubAllGlobals(); });

class MetricFileReader {
  result: ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob): void {
    void blob.arrayBuffer().then((buffer) => { this.result = buffer; this.onloadend?.(); }, () => this.onerror?.());
  }
}

async function convertedSkpCache(extentInches: number) {
  vi.stubGlobal("FileReader", MetricFileReader);
  const builder = createSkpBuilder();
  builder.addFace([[0, 0, 0], [extentInches, 0, 0], [extentInches, extentInches, 0], [0, extentInches, 0]]);
  builder.addFace([[0, 0, extentInches], [extentInches, 0, extentInches], [extentInches, extentInches, extentInches], [0, extentInches, extentInches]]);
  const bytes = new Uint8Array(builder.toBytes());
  const converted = await convertStudioBg3dModelFilesToGlb([new File([bytes], "room.skp")], {
    executionBackend: "direct", skp: { resolveUnit: async () => ({ kind: "keep" }) },
  });
  const loaded = await new GLTFLoader().parseAsync(await converted[0].arrayBuffer(), "");
  const authoredSize = new THREE.Box3().setFromObject(loaded.scene, true).getSize(new THREE.Vector3());
  const normalizationScale = computeStudioBg3dAutoFitScale([authoredSize.x, authoredSize.y, authoredSize.z]);
  loaded.scene.scale.setScalar(normalizationScale);
  return { cached: { root: loaded.scene, normalizationScale }, authoredSize };
}

function modelAttachment(metricPolicy?: "authored-metres") {
  const attachment = normalizeStudioBg3dGlbAttachment({
    id: "metric-attachment", name: "방.glb", hash: `sha256:${"a".repeat(64)}`,
    mime: STUDIO_BG3D_GLB_MIME, byteSize: 1024, source: "upload", metricPolicy,
    rights: { status: "owned", commercialUse: true, attributionRequired: false },
  });
  if (!attachment) throw new Error("모델 연결 정보가 올바르지 않습니다.");
  return attachment;
}

function host(instanceScale?: readonly [number, number, number]) {
  const begun = transitionStudioBg3dPlacementSession(createStudioBg3dPlacementSession(), {
    type: "begin", assetId: "metric-asset", storageId: "storage-model", placementToken: "metric-placement",
    sourceKind: "asset-library", floorPoint: [0, 0],
  });
  if (!begun.ok) throw new Error("배치 세션을 시작하지 못했습니다.");
  const replace = vi.fn<(mutation: { customModels: readonly BgCustomModelInstance[] }) => void>();
  const history = vi.fn();
  const error = vi.fn();
  const bag: Record<string, unknown> = {
    THREE, createBgCustomModelInstance, transitionStudioBg3dPlacementSession, assertStudioBg3dModelAttachmentAdmission,
    StudioBg3dModelPlacementAdmissionError, STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS,
    placementSessionRef: { current: begun.state }, canAdmitSceneNodes: () => true,
    placementPreviewAsset: { modelId: "storage-model", name: "방", size: [20, 12, 8], localInsertionPoint: [3, -2, 5], instanceScale },
    physicsRuntimeSourceRef: { current: { primitives: [], customModels: [], document: createDefaultStudioBg3dSceneDocument() } },
    attachmentByStorageModelIdRef: { current: new Map([["storage-model", modelAttachment("authored-metres")]]) },
    commitImmediateHistoryTransition: history, replaceCanonicalDocumentState: replace, setError: error,
    setPlacementSession: vi.fn(), setSelectedIds: vi.fn(), setRefTick: vi.fn(), setPlacementPreviewAsset: vi.fn(), setSurfaceSnapStatus: vi.fn(),
  };
  attachStudioBg3dEditorPlacementHost(bag);
  return { bag, replace, history, error };
}

function callHost(bag: Record<string, unknown>, name: string, ...args: readonly unknown[]) {
  const callback = bag[name];
  if (typeof callback !== "function") throw new Error(`호스트 함수가 없습니다: ${name}`);
  callback(...args);
}

describe("에디터의 원본 미터 모델 배치", () => {
  const cases: readonly { readonly scale?: readonly [number, number, number] }[] = [{ scale: [10, 10, 10] }, {}];
  it.each(cases)("최종 배율 $scale를 실제 포인터 배치·즉시 이력·문서 변경에 전달한다", ({ scale }) => {
    const { bag, replace, history, error } = host(scale);
    callHost(bag, "rotateCustomModelPlacement", 90);
    callHost(bag, "commitCustomModelPlacement", { floorPoint: [30, 40] }, false);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(history).toHaveBeenCalledTimes(1);
    const placed = replace.mock.calls[0]?.[0].customModels[0];
    if (!placed) throw new Error("배치한 모델이 없습니다.");
    expect(placed.scale).toEqual(scale ?? [1, 1, 1]);
    const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...placed.rotation));
    const insertionPoint = new THREE.Vector3(3, -2, 5).applyQuaternion(orientation).add(new THREE.Vector3(...placed.position));
    expect(insertionPoint.distanceTo(new THREE.Vector3(30, 0.01, 40))).toBeLessThan(1e-10);
    expect(error).toHaveBeenLastCalledWith(null);
  });

  it("잘못된 미리보기 배율은 클릭해도 이력이나 실제 장면을 변경하지 않는다", () => {
    const { bag, replace, history, error } = host([1001, 1001, 1001]);
    callHost(bag, "commitCustomModelPlacement", { floorPoint: [30, 40] }, false);
    expect(replace).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("배율 범위"));
  });

  it("실제 SKP 바이트→GLB→공유 캐시→문서 복원 후 원본 2.54m 형상을 유지한다", async () => {
    const { cached, authoredSize } = await convertedSkpCache(100);
    expect(readStudioBg3dSkpMetricImport(cached.root)).toBe("authored-metres");
    expect(authoredSize.toArray()).toEqual([expect.closeTo(2.54, 5), expect.closeTo(2.54, 5), expect.closeTo(2.54, 5)]);
    const base = modelAttachment();
    const attachment = await loadStudioBg3dMetricAttachment(base, undefined, base.hash, cached);
    const scale = resolveStudioBg3dMetricPlacementScale(attachment, cached);
    const saved = adaptStudioBg3dRuntimeToDocument({ primitives: [], customModels: [createBgCustomModelInstance("storage-model", 0, scale)], attachmentByStorageModelId: new Map([["storage-model", attachment]]) });
    const restored = hydrateStudioBg3dDocumentToRuntime({ document: saved.document, storageModelIdByAttachmentId: new Map([[attachment.id, "restored-model"]]) });
    const instance = restored.customModels[0];
    if (!instance) throw new Error("원본 미터 모델을 복원하지 못했습니다.");
    const instanceRoot = new THREE.Group();
    instanceRoot.scale.fromArray(instance.scale);
    instanceRoot.add(cached.root);
    const finalSize = new THREE.Box3().setFromObject(instanceRoot, true).getSize(new THREE.Vector3());
    expect(finalSize.distanceTo(authoredSize)).toBeLessThan(1e-10);
  });

  it("배치 실패 후 남은 실제 SKP GLB도 편의 메타데이터 없이 정책을 읽어 2m 재배치를 거부한다", async () => {
    const { cached, authoredSize } = await convertedSkpCache(100_000);
    expect(authoredSize.x).toBeCloseTo(2540, 3);
    expect(() => resolveStudioBg3dMetricPlacementScale(modelAttachment("authored-metres"), cached)).toThrow(StudioBg3dModelMetricPolicyError);
    const base = modelAttachment();
    const retryAttachment = await loadStudioBg3dMetricAttachment(base, undefined, base.hash, cached);
    expect(retryAttachment.metricPolicy).toBe("authored-metres");
    expect(() => resolveStudioBg3dMetricPlacementScale(retryAttachment, cached)).toThrow(StudioBg3dModelMetricPolicyError);
  });
});
