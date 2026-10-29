import { BoxGeometry, Color, DoubleSide, Euler, FrontSide, Group, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import { createStudioBg3dEditableThreeClone, measureStudioBg3dThreeMetrics } from "../studio-background-3d-model";
import { createStudioBg3dHistorySnapshot } from "./studio-bg3d-editor-derivations";
import { studioBg3dModelCacheKey, studioBg3dModelRuntimeVariant } from "./studio-bg3d-model-material-variant";
import { commitStudioBg3dHistoryTransition, resetStudioBg3dCommandHistory, stepStudioBg3dCommandHistory, type StudioBg3dHistoryCommandRefs } from "./studio-bg3d-history-command-adapter";
import { createDefaultStudioBg3dSceneDocument, STUDIO_BG3D_GLB_MIME } from "./studio-bg3d-scene-document";
import { tryAdaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";
import { captureStudioBg3dPrimitiveEditSource, type StudioBg3dPrimitiveEditRuntime } from "./studio-bg3d-primitive-edit-source";
import {
  createStudioBg3dPrimitiveEditMaterial,
  replaceStudioBg3dPrimitiveEditSource,
  type StudioBg3dPrimitiveEditReplacementAsset,
  type StudioBg3dPrimitiveEditReplacementHost,
} from "./studio-bg3d-primitive-edit-replacement";

function box(id = "source-box", patch: Partial<BgPrimitive> = {}): BgPrimitive {
  return { id, kind: "box", name: "원본 상자", color: "#c9a876", position: [2.25, 0.75, -3.5],
    rotation: [0.31, -0.63, 0.24], scale: [1.8, 0.6, 2.2], ...patch };
}

function asset(edited = true): StudioBg3dPrimitiveEditReplacementAsset {
  const root = new Group();
  // glTF의 무재질 기본값은 metalness=1이다. 실제 clone이 이를 primitive 기본값0으로 바꾸는지 검사한다.
  const geometry = edited ? new BoxGeometry(1, 1.25, 1).translate(0, 0.125, 0) : new BoxGeometry(1, 1, 1);
  root.add(new Mesh(geometry, new MeshStandardMaterial({ color: "#ffffff", metalness: 1, roughness: 1 })));
  const normalizationScale = edited ? 1.6 : 2;
  root.scale.setScalar(normalizationScale);
  const measured = measureStudioBg3dThreeMetrics([root], []);
  if (!measured.ok) throw Error(measured.code);
  const record: StudioBg3dPrimitiveEditReplacementAsset["record"] = {
    id: "private-edited-model", contentHash: `sha256:${"a".repeat(64)}`, byteSize: 3344, mime: STUDIO_BG3D_GLB_MIME,
    rights: { status: "owned", commercialUse: true, attributionRequired: false },
  };
  const attachment: StudioBg3dPrimitiveEditReplacementAsset["attachment"] = {
    id: "edited-scene-attachment", name: "편집한 상자.glb", byteSize: record.byteSize, hash: record.contentHash,
    mime: record.mime, source: "upload", rights: record.rights,
  };
  return { record, storageModelId: record.id, attachment,
    cache: { root, normalizationScale, record, metrics: measured.metrics, runtimeVariant: studioBg3dModelRuntimeVariant("webgl") } };
}

function fixture(source = box(), admitted = asset()) {
  const live: { current: StudioBg3dPrimitiveEditRuntime } = { current: {
    primitives: [source, box("other", { name: "보존할 다른 도형", position: [9, 0, 0] })], customModels: [],
    document: { ...createDefaultStudioBg3dSceneDocument(), meta: { name: "유지할 장면", memo: "기존 문서" },
      shots: [{ id: "shot", name: "컷", nodeVisibility: [{ nodeId: source.id, visible: false }] }] },
  } };
  const initial = tryAdaptStudioBg3dRuntimeToDocument({ primitives: live.current.primitives, customModels: [],
    baseDocument: { ...live.current.document, shots: undefined }, attachmentByStorageModelId: new Map() });
  if (!initial.ok) throw Error("초기 장면 생성 실패");
  live.current = { ...live.current, document: { ...initial.value.document, shots: live.current.document.shots } };
  const selectedIds = { current: new Set([source.id]) };
  const session: { current: object | null } = { current: {} };
  const attachments = new Map([[admitted.storageModelId, admitted.attachment]]);
  const cache = new Map([[studioBg3dModelCacheKey(admitted.storageModelId, "webgl"), admitted.cache]]);
  const history: StudioBg3dHistoryCommandRefs = {
    historyRef: { current: [] }, historyIndexRef: { current: -1 }, historyCommandTimelineRef: { current: null },
  };
  resetStudioBg3dCommandHistory(history, createStudioBg3dHistorySnapshot(live.current));
  const replace = vi.fn<StudioBg3dPrimitiveEditReplacementHost["replaceCanonicalDocumentState"]>((mutation) => {
    live.current = { primitives: mutation.primitives ?? live.current.primitives, customModels: mutation.customModels ?? live.current.customModels,
      document: mutation.document ?? live.current.document };
  });
  const commit = vi.fn<StudioBg3dPrimitiveEditReplacementHost["commitImmediateHistoryTransition"]>((primitives, customModels, document, before, options) => {
    commitStudioBg3dHistoryTransition(history, { before, after: createStudioBg3dHistorySnapshot({ primitives, customModels, document }), ...options });
  });
  let locked = false;
  const host: StudioBg3dPrimitiveEditReplacementHost = {
    open: true, selectedIdsRef: selectedIds, physicsRuntimeSourceRef: live, modalAssetSessionRef: session,
    attachmentByStorageModelIdRef: { current: attachments }, modelRootCacheRef: { current: cache },
    isPrimitiveEditInteractionLocked: () => locked,
    replaceCanonicalDocumentState: replace, commitImmediateHistoryTransition: commit,
  };
  const capture = () => {
    const result = captureStudioBg3dPrimitiveEditSource(host);
    if (!result.ok) throw Error(result.messageKo);
    return result.snapshot;
  };
  return { source, admitted, host, live, selectedIds, session, attachments, cache, history, replace, commit, capture, lock: () => { locked = true; } };
}

describe("primitive 직접 편집의 단일 원본 교체 명령", () => {
  it("같은 ID·이름·태그·선택을 유지하며 S/k로 교체하고 실제 history로 한 번씩 Undo/Redo한다", () => {
    const f = fixture(box("source-box", { tags: ["실내", "상자"], visible: true, locked: false, parentId: null }));
    const beforeOther = f.live.current.primitives[1];
    const beforeScene = f.live.current.document;
    const selectionIdentity = f.selectedIds.current;
    const before = createStudioBg3dHistorySnapshot(f.live.current);
    const result = replaceStudioBg3dPrimitiveEditSource(f.host, f.capture(), f.admitted);
    expect(result.ok).toBe(true);
    expect(f.replace).toHaveBeenCalledTimes(1);
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(f.replace.mock.calls[0]?.[0]).toHaveProperty("primitives");
    expect(f.replace.mock.calls[0]?.[0]).toHaveProperty("customModels");
    expect(f.replace.mock.calls[0]?.[0]).toHaveProperty("document");
    expect(f.selectedIds.current).toBe(selectionIdentity);
    expect([...f.selectedIds.current]).toEqual(["source-box"]);
    expect(f.live.current.primitives).toEqual([beforeOther]);
    const model = f.live.current.customModels[0];
    expect(model).toMatchObject({ id: "source-box", modelId: f.admitted.storageModelId, name: "원본 상자", position: f.source.position,
      rotation: f.source.rotation, visible: true, locked: false, parentId: null, tags: ["상자", "실내"] });
    expect(model?.scale[0]).toBeCloseTo(1.125, 14);
    expect(model?.scale[1]).toBeCloseTo(0.375, 14);
    expect(model?.scale[2]).toBeCloseTo(1.375, 14);
    expect(f.live.current.document.meta).toEqual(beforeScene.meta);
    expect(f.live.current.document.shots).toEqual(beforeScene.shots);
    expect(f.commit.mock.calls[0]?.[4]).toEqual({ commandId: "studio.bg3d.primitive-edit.replace", label: "상자 원본 직접 편집", source: "menu" });
    const after = createStudioBg3dHistorySnapshot(f.live.current);
    expect(stepStudioBg3dCommandHistory(f.history, "undo")?.state).toEqual(before);
    expect(stepStudioBg3dCommandHistory(f.history, "redo")?.state).toEqual(after);
  });

  it("원본 기본색·PBR 숫자값을 실제 editable clone에 보존하고 cache 재질은 바꾸지 않는다", async () => {
    const f = fixture();
    const result = replaceStudioBg3dPrimitiveEditSource(f.host, f.capture(), f.admitted);
    expect(result.ok).toBe(true);
    const clone = await createStudioBg3dEditableThreeClone(f.admitted.cache.root);
    try {
      clone.applyMaterialOverride(f.live.current.customModels[0]?.materialOverride);
      const materials: MeshStandardMaterial[] = [];
      clone.root.traverse((node) => {
        if (node instanceof Mesh && node.material instanceof MeshStandardMaterial) materials.push(node.material);
      });
      expect(materials).toHaveLength(1);
      const material = materials[0];
      expect(material?.color.getHexString()).toBe("c9a876");
      expect(material?.roughness).toBe(1);
      expect(material?.metalness).toBe(0);
      expect(material?.emissive.getHexString()).toBe("000000");
      expect(material?.emissiveIntensity).toBe(1);
      expect(material?.opacity).toBe(1);
      expect(material?.transparent).toBe(false);
      expect(material?.side).toBe(FrontSide);
      f.admitted.cache.root.traverse((node) => {
        if (node instanceof Mesh && node.material instanceof MeshStandardMaterial) {
          expect(node.material.color.getHexString()).toBe("ffffff");
          expect(node.material.metalness).toBe(1);
        }
      });
    } finally { clone.dispose(); }
  });

  it.each([false, true])("정규화 역배율이 월드 변환을 보존한다(edited=%s)", (edited) => {
    const f = fixture(box(), asset(edited));
    expect(replaceStudioBg3dPrimitiveEditSource(f.host, f.capture(), f.admitted).ok).toBe(true);
    const model = f.live.current.customModels[0];
    if (!model) throw Error("교체 모델 없음");
    const expected = new Matrix4().compose(new Vector3(...f.source.position), new Quaternion().setFromEuler(new Euler(...f.source.rotation, "XYZ")), new Vector3(...f.source.scale));
    const instance = new Matrix4().compose(new Vector3(...model.position), new Quaternion().setFromEuler(new Euler(...model.rotation, "XYZ")), new Vector3(...model.scale));
    const actual = instance.multiply(new Matrix4().compose(f.admitted.cache.root.position, f.admitted.cache.root.quaternion, f.admitted.cache.root.scale));
    expect(Math.max(...actual.elements.map((value, index) => Math.abs(value - (expected.elements[index] ?? Number.NaN))))).toBeLessThan(1e-12);
  });

  it("대기 중 선택·session·원본·잠금 변경은 어떤 commit도 발행하지 않는다", () => {
    for (const mutate of [
      (f: ReturnType<typeof fixture>) => { f.selectedIds.current = new Set(); },
      (f: ReturnType<typeof fixture>) => { f.session.current = {}; },
      (f: ReturnType<typeof fixture>) => { f.source.position[0] += 1; },
      (f: ReturnType<typeof fixture>) => { f.lock(); },
    ]) {
      const f = fixture(); const snapshot = f.capture(); mutate(f);
      expect(replaceStudioBg3dPrimitiveEditSource(f.host, snapshot, f.admitted).ok).toBe(false);
      expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
    }
  });

  it("cache identity·binding·record·실제 metrics 변조를 거부한다", () => {
    for (const mutate of [
      (f: ReturnType<typeof fixture>) => { f.cache.set(studioBg3dModelCacheKey(f.admitted.storageModelId, "webgl"), { ...f.admitted.cache }); },
      (f: ReturnType<typeof fixture>) => { f.attachments.delete(f.admitted.storageModelId); },
      (f: ReturnType<typeof fixture>) => { f.attachments.set(f.admitted.storageModelId, { ...f.admitted.attachment, hash: `sha256:${"b".repeat(64)}` }); },
      (f: ReturnType<typeof fixture>) => { f.admitted.cache.root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial())); },
    ]) {
      const f = fixture(); const snapshot = f.capture(); mutate(f);
      expect(replaceStudioBg3dPrimitiveEditSource(f.host, snapshot, f.admitted).ok).toBe(false);
      expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
    }
  });

  it("원점 이동·비균일 cache normalization·투명/양면 material을 거부한다", () => {
    for (const mutate of [
      (f: ReturnType<typeof fixture>) => { f.admitted.cache.root.position.x = 0.1; },
      (f: ReturnType<typeof fixture>) => { f.admitted.cache.root.scale.y *= 2; },
      (f: ReturnType<typeof fixture>) => { f.admitted.cache.root.traverse((node) => { if (node instanceof Mesh && node.material instanceof MeshStandardMaterial) node.material.side = DoubleSide; }); },
      (f: ReturnType<typeof fixture>) => { f.admitted.cache.root.traverse((node) => { if (node instanceof Mesh && node.material instanceof MeshStandardMaterial) node.material.transparent = true; }); },
    ]) {
      const f = fixture(); const snapshot = f.capture(); mutate(f);
      expect(replaceStudioBg3dPrimitiveEditSource(f.host, snapshot, f.admitted)).toMatchObject({ ok: false, code: "invalid-replacement" });
      expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
    }
  });

  it("S/k의 정본 scale 한도를 넘으면 clamp 없이 거부한다", () => {
    const f = fixture(box("source-box", { scale: [0.001, 1, 1] }), asset(false));
    expect(replaceStudioBg3dPrimitiveEditSource(f.host, f.capture(), f.admitted)).toMatchObject({ ok: false, code: "scale-out-of-range" });
    expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
    const smallCache = asset(false);
    smallCache.cache.root.scale.setScalar(0.5);
    const large = fixture(box("source-box", { scale: [1_000, 1, 1] }), { ...smallCache, cache: { ...smallCache.cache, normalizationScale: 0.5 } });
    expect(replaceStudioBg3dPrimitiveEditSource(large.host, large.capture(), large.admitted)).toMatchObject({ ok: false, code: "scale-out-of-range" });
    expect(large.replace).not.toHaveBeenCalled(); expect(large.commit).not.toHaveBeenCalled();
  });

  it("512개 경계에서도 한 노드를 교체하므로 노드를 추가한 것으로 세지 않는다", () => {
    const f = fixture();
    const snapshot = f.capture();
    f.live.current = { ...f.live.current, primitives: [f.source, ...Array.from({ length: 511 }, (_, index) => box(`other-${index}`))],
      document: { ...f.live.current.document, budgets: { ...f.live.current.document.budgets,
        complexity: { ...f.live.current.document.budgets.complexity, maxNodes: 512 } } } };
    expect(replaceStudioBg3dPrimitiveEditSource(f.host, snapshot, f.admitted).ok).toBe(true);
    expect(f.live.current.primitives).toHaveLength(511);
    expect(f.live.current.customModels).toHaveLength(1);
    expect(f.live.current.document.nodes).toHaveLength(512);
    expect(f.replace).toHaveBeenCalledTimes(1); expect(f.commit).toHaveBeenCalledTimes(1);
  });

  it("admission 후 최신 렌더 예산이 줄어들면 실제 metrics로 거부한다", () => {
    const f = fixture(); const snapshot = f.capture();
    f.live.current = { ...f.live.current, document: { ...f.live.current.document, budgets: {
      ...f.live.current.document.budgets, complexity: { ...f.live.current.document.budgets.complexity, maxTriangles: 1 },
    } } };
    expect(replaceStudioBg3dPrimitiveEditSource(f.host, snapshot, f.admitted).ok).toBe(false);
    expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
  });

  it("무관한 새 노드까지 최신 후보에 포함하고 미해결 모델을 조용히 버리지 않는다", () => {
    const f = fixture(); const snapshot = f.capture();
    f.live.current = { ...f.live.current, primitives: [...f.live.current.primitives, box("new-node")] };
    expect(replaceStudioBg3dPrimitiveEditSource(f.host, snapshot, f.admitted).ok).toBe(true);
    expect(f.live.current.primitives.map(({ id }) => id)).toEqual(["other", "new-node"]);
    const g = fixture(); const before = g.capture();
    g.live.current = { ...g.live.current, customModels: [{ id: "unresolved", modelId: "missing", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }] };
    expect(replaceStudioBg3dPrimitiveEditSource(g.host, before, g.admitted).ok).toBe(false);
    expect(g.replace).not.toHaveBeenCalled(); expect(g.commit).not.toHaveBeenCalled();
  });

  it("320KiB 직전의 실제 후보는 attachment/override 증가를 계산해 전체 거부한다", () => {
    const f = fixture();
    f.live.current = { ...f.live.current, document: { ...f.live.current.document, budgets: {
      ...f.live.current.document.budgets, complexity: { ...f.live.current.document.budgets.complexity, maxNodes: 512 },
    } } };
    const others = Array.from({ length: 500 }, (_, index) => box(`other-${index}`, {
      position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
      tags: Array.from({ length: 8 }, (_, tag) => `tag-${tag}-${"t".repeat(26)}`),
    }));
    let closest: readonly BgPrimitive[] | null = null;
    let size = 0;
    for (let padding = 0; padding <= 76; padding += 1) {
      const primitives = [f.source, ...others.map((other) => ({ ...other, name: `오브젝트${"나".repeat(padding)}` }))];
      const attempt = tryAdaptStudioBg3dRuntimeToDocument({ primitives, customModels: [], baseDocument: f.live.current.document, attachmentByStorageModelId: f.attachments });
      if (!attempt.ok) break;
      closest = primitives; size = new TextEncoder().encode(attempt.value.serialized).byteLength;
    }
    expect(closest).not.toBeNull();
    expect(320 * 1024 - size).toBeLessThan(2_000);
    f.live.current = { ...f.live.current, primitives: closest ?? [], document: { ...f.live.current.document,
      meta: { ...f.live.current.document.meta, memo: `${f.live.current.document.meta?.memo ?? ""}${"m".repeat(Math.max(0, 320 * 1024 - size - 200))}` } } };
    const snapshot = f.capture();
    expect(replaceStudioBg3dPrimitiveEditSource(f.host, snapshot, f.admitted).ok).toBe(false);
    expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
  });

  it("기본 재질 helper는 색을 multiply하지 않는다", () => {
    const material = createStudioBg3dPrimitiveEditMaterial("#c9a876");
    expect(material.colorMode).toBe("replace");
    expect(new Color(material.color).getHexString()).toBe("c9a876");
  });
});
