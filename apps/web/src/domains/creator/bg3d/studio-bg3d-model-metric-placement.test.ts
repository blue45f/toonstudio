import { beforeEach, describe, expect, it, vi } from "vitest";
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from "three";

import { createBgCustomModelInstance, type BgCustomModelInstance } from "../studio-background-3d-model";
import { computeStudioBg3dAutoFitScale } from "./studio-bg3d-model-scale-contract";
import {
  loadStudioBg3dMetricAttachment,
  resolveStudioBg3dMetricPlacementScale,
  scaleStudioBg3dMetricPlacementAsset,
} from "./studio-bg3d-model-metric-placement";
import { resolveStudioBg3dMetricInstanceScale, StudioBg3dModelMetricPolicyError } from "./studio-bg3d-model-metric-policy";
import { markStudioBg3dSkpMetricImport, readStudioBg3dSkpMetricImport } from "./studio-bg3d-skp-metric-provenance";
import {
  normalizeStudioBg3dGlbAttachment,
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
  STUDIO_BG3D_GLB_MIME,
} from "./studio-bg3d-scene-document";
import { adaptStudioBg3dRuntimeToDocument, hydrateStudioBg3dDocumentToRuntime } from "./studio-bg3d-scene-runtime";

import type { BgPrimitive } from "../studio-background-3d-primitives";

const metadata = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("./studio-bg3d-asset-metadata-store", () => ({ getStudioBg3dAssetMetadata: metadata.get }));

function attachment(metricPolicy?: "authored-metres") {
  const result = normalizeStudioBg3dGlbAttachment({
    id: "metric-model", name: "방.glb", mime: STUDIO_BG3D_GLB_MIME,
    hash: `sha256:${"a".repeat(64)}`, byteSize: 1024, source: "upload", metricPolicy,
    rights: { status: "owned", commercialUse: true, attributionRequired: false },
  });
  if (!result) throw new Error("치수 테스트 연결 정보가 올바르지 않습니다.");
  return result;
}

function cachedModel(normalizationScale = computeStudioBg3dAutoFitScale([20, 12, 8])) {
  const root = new Group();
  const mesh = new Mesh(new BoxGeometry(20, 12, 8), new MeshBasicMaterial());
  mesh.position.set(3, 4, 5);
  root.add(mesh);
  root.scale.setScalar(normalizationScale);
  root.updateWorldMatrix(true, true);
  return { root, normalizationScale };
}

beforeEach(() => { metadata.get.mockReset(); });

describe("SKP 원본 미터 배치 정책", () => {
  it("새로 기록된 SKP만 정책을 읽고 기존 SKP 자산과 기존 장면은 자동 맞춤을 유지한다", async () => {
    const original = attachment();
    metadata.get.mockResolvedValue({ format: "skp", skpImport: { metricPolicy: "authored-metres" } });
    const authored = await loadStudioBg3dMetricAttachment(original, undefined, original.hash);
    expect(authored.metricPolicy).toBe("authored-metres");
    expect(resolveStudioBg3dMetricPlacementScale(authored, cachedModel())).toEqual([10, 10, 10]);
    expect(await loadStudioBg3dMetricAttachment(original, original, original.hash)).toBe(original);
    expect(metadata.get).toHaveBeenCalledTimes(1);
    metadata.get.mockResolvedValue({ format: "skp", skpImport: { coordinates: { outputUnit: "meter" } } });
    expect(await loadStudioBg3dMetricAttachment(original, undefined, original.hash)).toBe(original);
    metadata.get.mockResolvedValue({ format: "glb", skpImport: { metricPolicy: "authored-metres" } });
    expect(await loadStudioBg3dMetricAttachment(original, undefined, original.hash)).toBe(original);
    expect(resolveStudioBg3dMetricPlacementScale(original, cachedModel())).toEqual([1, 1, 1]);
  });

  it("정책 저장소 오류를 원본 미터 정책 누락으로 바꾸지 않는다", async () => {
    metadata.get.mockRejectedValue(new Error("storage-unavailable"));
    await expect(loadStudioBg3dMetricAttachment(attachment(), undefined, attachment().hash)).rejects.toThrow("storage-unavailable");
  });

  it("GLB에 함께 등록된 SKP 출처는 메타데이터 오류와 독립이며 혼합 자식으로 전파하지 않는다", async () => {
    const cached = cachedModel();
    markStudioBg3dSkpMetricImport(cached);
    metadata.get.mockRejectedValue(new Error("storage-unavailable"));
    const base = attachment();
    expect((await loadStudioBg3dMetricAttachment(base, undefined, base.hash, cached)).metricPolicy).toBe("authored-metres");
    expect(metadata.get).not.toHaveBeenCalled();
    const mixed = new Group();
    mixed.add(cached.root, new Group());
    expect(readStudioBg3dSkpMetricImport(mixed)).toBeUndefined();
  });

  it("고스트 치수와 접지 기준점을 최종 인스턴스 배율과 함께 보정한다", () => {
    const cached = cachedModel();
    const bounds = new Box3().setFromObject(cached.root, true);
    const preview = scaleStudioBg3dMetricPlacementAsset({
      modelId: "storage-model", name: "방", size: [2, 1.2, 0.8],
      localInsertionPoint: [bounds.getCenter(new Vector3()).x, bounds.min.y, bounds.getCenter(new Vector3()).z],
    }, attachment("authored-metres"), cached);
    expect(preview.size).toEqual([20, 12, 8]);
    expect(preview.localInsertionPoint[0]).toBeCloseTo(3);
    expect(preview.localInsertionPoint[1]).toBeCloseTo(-2);
    expect(preview.localInsertionPoint[2]).toBeCloseTo(5);
    expect(preview.instanceScale).toEqual([10, 10, 10]);
  });

  it.each([0.001, 1000])("배율 경계 %s를 실제 문서 저장·복원에서 잘라내지 않는다", (inverse) => {
    const scale = resolveStudioBg3dMetricInstanceScale("authored-metres", cachedModel(1 / inverse));
    const source = attachment("authored-metres");
    const saved = adaptStudioBg3dRuntimeToDocument({
      primitives: [], customModels: [createBgCustomModelInstance("storage-model", 0, scale)],
      attachmentByStorageModelId: new Map([["storage-model", source]]),
    });
    const parsed = parseStudioBg3dSceneDocument(serializeStudioBg3dSceneDocument(saved.document) ?? "");
    if (!parsed) throw new Error("저장한 미터 배율 문서를 읽지 못했습니다.");
    expect(parsed?.attachments[0]?.metricPolicy).toBe("authored-metres");
    const restored = hydrateStudioBg3dDocumentToRuntime({ document: parsed, storageModelIdByAttachmentId: new Map([[source.id, "restored-model"]]) });
    expect(restored.ok).toBe(true);
    expect(restored.customModels[0]?.scale).toEqual([inverse, inverse, inverse]);
  });

  it.each([0.000999, 1000.001, 0, Number.NaN, Number.POSITIVE_INFINITY])("문서 범위 밖 역배율 %s를 조용히 보정하지 않고 거부한다", (inverse) => {
    expect(() => resolveStudioBg3dMetricInstanceScale("authored-metres", cachedModel(1 / inverse))).toThrow(StudioBg3dModelMetricPolicyError);
  });

  it("캐시 부재·비균일 정규화·좌표 한도 초과를 거부하고 기존 배치는 캐시 없이도 1배를 유지한다", () => {
    expect(resolveStudioBg3dMetricInstanceScale(undefined, undefined)).toEqual([1, 1, 1]);
    expect(() => resolveStudioBg3dMetricInstanceScale("authored-metres", undefined)).toThrow(StudioBg3dModelMetricPolicyError);
    const cached = cachedModel();
    cached.root.scale.y = 0.2;
    expect(() => resolveStudioBg3dMetricPlacementScale(attachment("authored-metres"), cached)).toThrow(StudioBg3dModelMetricPolicyError);
    cached.root.scale.y = 0.1;
    cached.root.position.x = 2000;
    expect(() => resolveStudioBg3dMetricPlacementScale(attachment("authored-metres"), cached)).toThrow(StudioBg3dModelMetricPolicyError);
  });

  const policies: readonly ("authored-metres" | undefined)[] = [undefined, "authored-metres"];
  it.each(policies)("정책 %s의 저장 후 부모·월드 변환과 실제 형상 크기를 유지한다", (policy) => {
    const cached = cachedModel();
    const scale = resolveStudioBg3dMetricPlacementScale(attachment(policy), cached);
    const parent: BgPrimitive = { id: "parent", kind: "box", color: "#aabbcc", position: [7, 8, 9], rotation: [0.2, 0.7, 0.1], scale: [2, 1.5, 0.75] };
    const model: BgCustomModelInstance = { ...createBgCustomModelInstance("storage-model", 0, scale), parentId: parent.id, position: [2, 3, 4], rotation: [0.4, -0.2, 0.3] };
    const source = attachment(policy);
    const saved = adaptStudioBg3dRuntimeToDocument({ primitives: [parent], customModels: [model], attachmentByStorageModelId: new Map([[model.modelId, source]]) });
    const parsed = parseStudioBg3dSceneDocument(serializeStudioBg3dSceneDocument(saved.document) ?? "");
    if (!parsed) throw new Error("저장한 부모 변환 문서를 읽지 못했습니다.");
    expect(parsed?.attachments[0]?.metricPolicy).toBe(policy);
    const restored = hydrateStudioBg3dDocumentToRuntime({ document: parsed, storageModelIdByAttachmentId: new Map([[source.id, model.modelId]]) });
    expect(restored.ok).toBe(true);
    const actualModel = restored.customModels[0];
    const actualParent = restored.primitives[0];
    if (!actualModel || !actualParent) throw new Error("복원한 부모와 모델이 없습니다.");
    expect(actualModel.scale).toEqual(scale);
    expect(actualModel.parentId).toBe(parent.id);
    const parentGroup = new Group();
    parentGroup.position.fromArray(actualParent.position);
    parentGroup.rotation.set(...actualParent.rotation);
    parentGroup.scale.fromArray(actualParent.scale);
    const instanceGroup = new Group();
    instanceGroup.position.fromArray(actualModel.position);
    instanceGroup.rotation.set(...actualModel.rotation);
    instanceGroup.scale.fromArray(actualModel.scale);
    instanceGroup.add(cached.root);
    parentGroup.add(instanceGroup);
    parentGroup.updateWorldMatrix(true, true);
    const expectedRoot = cached.root.clone();
    expectedRoot.scale.setScalar(policy ? 1 : cached.normalizationScale);
    instanceGroup.scale.setScalar(1);
    instanceGroup.add(expectedRoot);
    parentGroup.updateWorldMatrix(true, true);
    const expected = new Vector3(10, 6, 4).applyMatrix4(expectedRoot.children[0].matrixWorld);
    instanceGroup.scale.fromArray(actualModel.scale);
    parentGroup.updateWorldMatrix(true, true);
    const actual = new Vector3(10, 6, 4).applyMatrix4(cached.root.children[0].matrixWorld);
    expect(actual.distanceTo(expected)).toBeLessThan(1e-10);
  });
});
