import { describe, expect, it } from "vitest";

import {
  StudioSmartObjectRuntime,
  decodePsdPlacedLayerDescriptor,
  encodePsdPlacedLayerDescriptor,
  projectSmartObjectUvToCanvas,
} from "./studio-smart-object-runtime";

describe("studio-smart-object-runtime", () => {
  it("1개 원본 서브도큐먼트 갱신 시 모든 링크드 인스턴스가 각자의 비파괴 워프를 유지한 채 일괄 동기화된다", () => {
    const runtime = new StudioSmartObjectRuntime();
    const doc = runtime.createSubDocument({
      name: "로고 심볼",
      width: 200,
      height: 100,
      payloadBase64: "AQIDBA==",
      nowIso: "2026-11-20T09:00:00.000Z",
    });
    expect(doc.opfsPath).toMatch(/^opfs:\/\/smart-objects\/[0-9a-f]{16}\.tsdoc$/u);

    const instA = runtime.placeInstance({
      layerId: "layer-1",
      subDocId: doc.subDocId,
      transform: { x: 100, y: 50, scaleX: 1, scaleY: 1, rotationDeg: 0 },
    });
    const instB = runtime.duplicateAsLinkedInstance(instA.instanceId, "layer-2");
    runtime.patchInstanceWarpControlPoint(instB.instanceId, 1, 1, { x: 0.45, y: 0.55 });

    const { subDoc, updatedInstances } = runtime.updateSubDocumentAndPropagate(doc.subDocId, {
      payloadBase64: "AQIDBAUGBwg=",
      nowIso: "2026-11-20T09:05:00.000Z",
    });
    expect(subDoc.revision).toBe(2);
    expect(subDoc.contentHash).not.toBe(doc.contentHash);
    expect(updatedInstances).toHaveLength(2);
    expect(updatedInstances.every((i) => i.syncedRevision === 2 && i.syncedContentHash === subDoc.contentHash)).toBe(true);

    // instB의 개별 워프 제어점이 원본 수정 후에도 그대로 보존되어야 한다.
    const afterB = runtime.getInstance(instB.instanceId)!;
    const stride = afterB.warpMesh.cols + 1;
    expect(afterB.warpMesh.controlPoints[1 * stride + 1]).toEqual({ x: 0.45, y: 0.55 });
  });

  it("독립 복제(New Smart Object via Copy)와 고아 서브도큐먼트 참조 카운트 정리가 정확하다", () => {
    const runtime = new StudioSmartObjectRuntime();
    const doc = runtime.createSubDocument({ name: "배경 간판", width: 300, height: 120, payloadBase64: "AAAA" });
    const origin = runtime.placeInstance({ layerId: "l1", subDocId: doc.subDocId });
    const copy = runtime.duplicateAsIndependentCopy(origin.instanceId, "l2");

    expect(copy.subDoc.subDocId).not.toBe(doc.subDocId);
    runtime.updateSubDocumentAndPropagate(doc.subDocId, { payloadBase64: "BBBB" });
    expect(runtime.getInstance(copy.instance.instanceId)?.syncedRevision).toBe(1);

    const pruned = runtime.removeInstance(origin.instanceId);
    expect(pruned.removed).toBe(true);
    expect(pruned.prunedSubDocIds).toEqual([doc.subDocId]);
    expect(runtime.getSubDocument(copy.subDoc.subDocId)).toBeDefined();
  });

  it("PSD SoLd 디스크립터로 직렬화·역직렬화할 때 회전·스케일·워프 격자가 보존된다", () => {
    const runtime = new StudioSmartObjectRuntime();
    const doc = runtime.createSubDocument({ name: "포스터", width: 200, height: 400, payloadBase64: "CCCC" });
    const inst = runtime.placeInstance({
      layerId: "l-poster",
      subDocId: doc.subDocId,
      transform: { x: 120, y: 80, scaleX: 1.5, scaleY: 0.75, rotationDeg: 30 },
    });
    const pt = projectSmartObjectUvToCanvas(inst, doc, 0, 0);
    expect(pt).toEqual({ x: 120, y: 80 });

    const desc = encodePsdPlacedLayerDescriptor(inst, doc);
    expect(desc.signature).toBe("SoLd");
    const restored = decodePsdPlacedLayerDescriptor(desc, "l-poster-restored");
    expect(restored.subDocId).toBe(doc.subDocId);
    expect(restored.transform.x).toBeCloseTo(120, 3);
    expect(restored.transform.y).toBeCloseTo(80, 3);
    expect(restored.transform.scaleX).toBeCloseTo(1.5, 3);
    expect(restored.transform.scaleY).toBeCloseTo(0.75, 3);
    expect(restored.transform.rotationDeg).toBeCloseTo(30, 2);
    expect(restored.warpMesh.controlPoints).toHaveLength(inst.warpMesh.controlPoints.length);
  });
});
