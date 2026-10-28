// @vitest-environment jsdom
import { Blob as NativeBlob, Buffer } from "node:buffer";
import { webcrypto } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { exportStudioHybridDccMeshGlb } from "../hybrid-dcc/studio-hybrid-dcc-glb-export";
import { collectStudioBg3dThreeJoints, collectStudioBg3dThreeMorphTargets, loadVerifiedStudioBg3dGlbWithThree, measureBg3dObjectSize } from "../studio-background-3d-model";
import { inspectStudioGeneric3dRuntimeHints } from "../studio-generic-3d-runtime-hints";
import { hashStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { applyStudioBg3dAuthoredModelEditWorkspace } from "./studio-bg3d-authored-model-edit-orchestrator";
import { resolveStudioBg3dDeviceQuality } from "./studio-bg3d-device-quality";
import { DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES, validateStudioBg3dGlb } from "./studio-bg3d-glb-validation";
import { resolveStudioBg3dModelNormalizationScale } from "./studio-bg3d-model-runtime-admission";
import { createStudioBg3dPrimitiveEditAuthoring } from "./studio-bg3d-primitive-edit-authoring";
import { writeStudioBg3dPrimitiveEditAuthoringToGlb } from "./studio-bg3d-primitive-edit-authoring-glb";
import { createStudioBg3dPrimitiveEditHostPorts } from "./studio-bg3d-primitive-edit-host";
import { writeStudioBg3dPrimitiveEditMaterialGlb } from "./studio-bg3d-primitive-edit-material";
import { convertStudioBg3dPrimitiveToEditableMesh } from "./studio-bg3d-primitive-edit-mesh";
import { createStudioBg3dPrimitiveEditMaterial } from "./studio-bg3d-primitive-edit-replacement";
import { createDefaultStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import { tryAdaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";
import { classifyStudioBg3dThreeSemanticMaterials } from "./studio-bg3d-three-semantic-materials";

import type { StudioHybridDccObjectTransform } from "../hybrid-dcc/studio-hybrid-dcc-object-transform";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { Bg3dVerifiedStoredRecord } from "./bg3d-model-library";
import type { StudioBg3dModelRootCacheEntry } from "./studio-bg3d-model-runtime-admission";
import type { StudioBg3dPrimitiveEditEditorHost } from "./studio-bg3d-primitive-edit-host";
import type { StudioBg3dPrimitiveEditOrchestratorHost } from "./studio-bg3d-primitive-edit-orchestrator";
import type { StudioBg3dPrimitiveEditRuntime } from "./studio-bg3d-primitive-edit-source";
import type { StudioBg3dModelAttachment } from "./studio-bg3d-scene-document-types";

type Library = typeof import("./bg3d-model-library");
const storage = vi.hoisted(() => ({ get: vi.fn<Library["getStoredBg3dModelV12"]>() }));
vi.mock("./studio-bg3d-model-library-loader", () => ({ getStoredBg3dModelV12: storage.get }));
vi.mock("./studio-bg3d-authored-model-edit-orchestrator", () => ({ applyStudioBg3dAuthoredModelEditWorkspace: vi.fn() }));
type MutableHost = { -readonly [Key in keyof StudioBg3dPrimitiveEditEditorHost]: StudioBg3dPrimitiveEditEditorHost[Key] };
const records = new Map<string, Bg3dVerifiedStoredRecord>(), disposals: (() => void)[] = [];
const HISTORICAL: StudioHybridDccObjectTransform = { revision: 1, position: [2.25, 0.75, -3.5], rotationEulerRad: [0.31, -0.63, 0.24], scale: [1.8, 0.6, 2.2] };

/** 실제 자산/reader/cache/workspace를 쓰며, 영구 저장 조회와 적용 명령만 seam이다. */
async function fixture() {
  const converted = convertStudioBg3dPrimitiveToEditableMesh({ id: "historical-box", kind: "box" });
  if (!converted.ok) throw Error(converted.detail);
  const mesh = converted.value.mesh, meshHash = hashStudioEditableMesh(mesh);
  const envelope = createStudioBg3dPrimitiveEditAuthoring({ assetId: "historical-box", revision: 2, mesh,
    objectTransformAtExport: HISTORICAL, colorSrgb: "#c9a876" });
  if (!envelope.ok) throw Error(envelope.messageKo);
  const exported = exportStudioHybridDccMeshGlb({ assetId: "historical-box", mesh, sourceHash: meshHash, sourceRevision: 2 });
  if (!exported.ok) throw Error("실제 GLB export 실패");
  const material = writeStudioBg3dPrimitiveEditMaterialGlb(exported.bytes, "#c9a876");
  if (!material.ok) throw Error(material.messageKo);
  const authored = writeStudioBg3dPrimitiveEditAuthoringToGlb(material.bytes, envelope.value.envelope);
  if (!authored.ok) throw Error(authored.messageKo);
  const bytes = authored.value;
  const hash: `sha256:${string}` = `sha256:${Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (value) => value.toString(16).padStart(2, "0")).join("")}`;
  const verification = await validateStudioBg3dGlb(bytes, { profile: "desktop", budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
    declared: { byteSize: bytes.byteLength, sha256: hash, mimeType: "model/gltf-binary" }, cumulative: { usedBytes: 0, maximumBytes: 100 * 1024 * 1024 } });
  if (!verification.ok) throw Error(verification.code);
  const document = createDefaultStudioBg3dSceneDocument();
  const loaded = await loadVerifiedStudioBg3dGlbWithThree(verification, document.budgets);
  if (!loaded.ok) throw Error(loaded.code);
  disposals.push(loaded.dispose);
  const record: Bg3dVerifiedStoredRecord = { id: "stored-model", name: "원본 보관.glb", format: "glb", storageVersion: 2, thumbnail: null,
    blob: new Blob([bytes], { type: "model/gltf-binary" }), createdAt: 1, updatedAt: 1, contentHash: hash, byteSize: bytes.byteLength,
    mime: "model/gltf-binary", validationVersion: 1, validatedAt: 1, validatorProfile: "desktop", validatorMetrics: verification.metrics,
    rights: { status: "licensed", commercialUse: true, attributionRequired: true, attribution: "원저작자", licenseName: "시험 사용권" } };
  records.set(record.id, record);
  const k = resolveStudioBg3dModelNormalizationScale(record.id, measureBg3dObjectSize(loaded.root)); loaded.root.scale.setScalar(k);
  const joints = collectStudioBg3dThreeJoints(loaded.root);
  const entry: StudioBg3dModelRootCacheEntry = { ...loaded, record, normalizationScale: k, admittedProfiles: new Set(["desktop"]), joints,
    morphTargets: collectStudioBg3dThreeMorphTargets(loaded.root), semanticMaterials: classifyStudioBg3dThreeSemanticMaterials(loaded.root),
    genericHints: inspectStudioGeneric3dRuntimeHints(loaded.root, joints) };
  const attachment: StudioBg3dModelAttachment = { id: "source-attachment", name: record.name, hash: record.contentHash, byteSize: record.byteSize,
    mime: record.mime, source: "upload", rights: record.rights };
  const model: BgCustomModelInstance = { id: "current-instance", modelId: record.id, name: "현재 모델", tags: ["실내"],
    position: [7, 0.75, -3.5], rotation: [0.31, 0.2, 0.24], scale: [0.9, 0.3, 1.3], materialOverride: createStudioBg3dPrimitiveEditMaterial("#2244aa") };
  const cache = new Map([[record.id, entry]]), attachments = new Map([[record.id, attachment]]), reverse = new Map([[attachment.id, record.id]]);
  const adapted = tryAdaptStudioBg3dRuntimeToDocument({ primitives: [], customModels: [model], baseDocument: document, attachmentByStorageModelId: attachments });
  if (!adapted.ok) throw Error("현재 정본 fixture 실패");
  const live: { current: StudioBg3dPrimitiveEditRuntime } = { current: { primitives: [], customModels: [model], document: adapted.value.document } };
  const session = { current: { epoch: 1 } }, selected = { current: new Set([model.id]) };
  const replace = vi.fn<StudioBg3dPrimitiveEditOrchestratorHost["replaceCanonicalDocumentState"]>();
  const commit = vi.fn<StudioBg3dPrimitiveEditOrchestratorHost["commitImmediateHistoryTransition"]>();
  const host: MutableHost = { open: true, selectedIds: new Set(["stale-render"]), selectedIdsRef: selected, physicsRuntimeSourceRef: live,
    modalAssetSessionRef: session, modelRootCacheRef: { current: cache }, attachmentByStorageModelIdRef: { current: attachments },
    storageModelIdByAttachmentIdRef: { current: reverse }, modelRenderer: { domElement: globalThis.document.createElement("canvas"), isWebGPURenderer: true, hasFeature: () => false },
    deviceQuality: resolveStudioBg3dDeviceQuality({ document, mode: "edit", preference: "desktop",
      signals: { cssWidth: 1440, cssHeight: 900, devicePixelRatio: 1, pointer: "fine", saveData: false, deviceMemoryGb: 8, hardwareConcurrency: 8 } }),
    addGeneratedParts: () => false, replaceCanonicalDocumentState: replace, commitImmediateHistoryTransition: commit };
  return { host, live, model, session, selected, entry, record, attachment, cache, attachments, reverse, k, meshHash, replace, commit };
}

async function begin(host: StudioBg3dPrimitiveEditEditorHost) {
  const command = createStudioBg3dPrimitiveEditHostPorts(host).onBeginPrimitiveEdit;
  if (!command) throw Error("실제 begin 필요");
  const result = await command();
  if (!result.ok) throw Error(result.messageKo);
  if (result.context.kind !== "authored-model") throw Error("실제 authored model context 필요");
  return result.context;
}

function deferred() {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

beforeEach(() => {
  // jsdom과 native WebCrypto 결과의 ArrayBuffer realm을 맞춘다. 실제 digest/validator는 대체하지 않는다.
  vi.stubGlobal("ArrayBuffer", Buffer.alloc(0).buffer.constructor);
  vi.stubGlobal("Blob", NativeBlob); vi.stubGlobal("crypto", webcrypto); records.clear();
  storage.get.mockReset().mockImplementation(async (id) => records.get(id) ?? null);
  vi.mocked(applyStudioBg3dAuthoredModelEditWorkspace).mockReset().mockResolvedValue({ ok: true, nodeId: "current-instance", storageModelId: "derived-model" });
});
afterEach(() => { disposals.splice(0).reverse().forEach((dispose) => dispose()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("실제 authored model source→workspace의 host 연결", () => {
  it("얇은 summary는 원본 I/O 없이 실제 cache Scene hint를 읽고 begin은 정확한 현재 model context를 만든다", async () => {
    const f = await fixture(), before = JSON.stringify(f.live.current), selected = f.selected.current;
    const ports = createStudioBg3dPrimitiveEditHostPorts(f.host);
    expect(ports.primitiveEditSelection).toEqual({ nodeId: f.model.id, name: f.model.name, blockedReason: null, sourceType: "authored-model" });
    expect(storage.get).not.toHaveBeenCalled();
    const context = await begin(f.host);
    expect(context.kind).toBe("authored-model"); expect(context.source.kind).toBe("authored-model");
    expect(context.assetId).toBe(f.model.id); expect(context.displayName).toBe(f.model.name);
    expect(context.source.authoring.envelope.source.assetId).toBe("historical-box");
    expect(context.initialMeshHash).toBe(f.meshHash);
    const local = context.workspace.session.state.geometry.records[context.assetId].mesh;
    expect(hashStudioEditableMesh(local)).toBe(f.meshHash); expect(local).not.toBe(context.source.authoring.mesh);
    expect(context.initialTransform).toEqual(context.source.objectTransform);
    expect(context.initialTransform.position).toEqual(context.source.canonicalNode.transform.position);
    expect(context.initialTransform.rotationEulerRad).toEqual(context.source.canonicalNode.transform.rotation);
    expect(context.initialTransform.scale).toEqual(f.model.scale.map((value) => value * f.k));
    expect(context.source.objectTransformBasis).toBe("current-instance"); expect(context.source.sourceColorSrgb).toBe("#2244aa");
    expect(context.source.authoring.envelope.sourceMaterialAtExport.colorSrgb).toBe("#c9a876");
    expect(storage.get).toHaveBeenCalledOnce(); expect(JSON.stringify(f.live.current)).toBe(before); expect(f.selected.current).toBe(selected);
    expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
  });

  it("optional signal을 생략해도 begin이 동작하며 선행 취소는 I/O 전에 거부한다", async () => {
    const f = await fixture(); await begin(f.host); storage.get.mockClear();
    const controller = new AbortController(); controller.abort();
    expect(await createStudioBg3dPrimitiveEditHostPorts(f.host).onBeginPrimitiveEdit?.(controller.signal)).toMatchObject({ ok: false });
    expect(storage.get).not.toHaveBeenCalled();
  });

  it.each(["transform", "model-id", "canonical-node", "cache", "root", "session", "selection", "port", "cancel"] as const)("첫 dynamic import microtask의 %s 변경은 Blob 읽기 전에 거부한다", async (change) => {
    const f = await fixture(), controller = new AbortController();
    const command = createStudioBg3dPrimitiveEditHostPorts(f.host).onBeginPrimitiveEdit;
    if (!command) throw Error("실제 begin 필요");
    const pending = command(controller.signal);
    if (change === "transform") f.model.position[0] += 1;
    if (change === "canonical-node") f.live.current = { ...f.live.current, document: { ...f.live.current.document,
      nodes: f.live.current.document.nodes.map((node) => ({ ...node, name: "import 대기 중 새 정본" })) } };
    if (change === "cache") f.cache.set(f.record.id, { ...f.entry });
    if (change === "root") Object.defineProperty(f.entry, "root", { value: f.entry.root.clone(true), configurable: true });
    if (change === "model-id") {
      const record = { ...f.record, id: "different-stored-model" }, attachment = { ...f.attachment, id: "different-attachment" };
      records.set(record.id, record); f.cache.set(record.id, { ...f.entry, record });
      f.attachments.set(record.id, attachment); f.reverse.set(attachment.id, record.id); f.model.modelId = record.id;
      f.live.current = { ...f.live.current, document: { ...f.live.current.document, attachments: [attachment],
        nodes: f.live.current.document.nodes.map((node) => node.kind === "model" ? { ...node, attachmentId: attachment.id } : node) } };
    }
    if (change === "session") f.session.current = { epoch: 2 };
    if (change === "selection") f.selected.current = new Set();
    if (change === "port") f.host.modelRootCacheRef = undefined;
    if (change === "cancel") controller.abort();
    expect(await pending).toMatchObject({ ok: false, messageKo: expect.any(String) });
    expect(storage.get).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
  });

  it.each(["session", "selection", "port", "cache", "root", "transform", "cancel"] as const)("실제 source read를 기다리는 동안 %s가 바뀌면 context를 발행하지 않는다", async (change) => {
    const f = await fixture(), gate = deferred(), controller = new AbortController();
    storage.get.mockImplementationOnce(async () => { await gate.promise; return f.record; });
    const pending = createStudioBg3dPrimitiveEditHostPorts(f.host).onBeginPrimitiveEdit?.(controller.signal);
    await vi.waitFor(() => expect(storage.get).toHaveBeenCalledOnce());
    if (change === "session") f.session.current = { epoch: 2 };
    if (change === "selection") f.selected.current = new Set();
    if (change === "port") f.host.attachmentByStorageModelIdRef = undefined;
    if (change === "cache") f.cache.set(f.record.id, { ...f.entry });
    if (change === "root") Object.defineProperty(f.entry, "root", { value: f.entry.root.clone(true), configurable: true });
    if (change === "transform") f.model.scale[1] += 0.1;
    if (change === "cancel") controller.abort();
    gate.release(); expect(await pending).toMatchObject({ ok: false });
    expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
  });

  it("같은 ports의 다음 begin은 최신 model/ref/session을 사용한다", async () => {
    const f = await fixture(), ports = createStudioBg3dPrimitiveEditHostPorts(f.host);
    const latest = { ...f.model, id: "latest-instance", name: "최신 모델" };
    const live = { current: { ...f.live.current, customModels: [latest] } }, session = { current: { epoch: 5 } };
    f.host.physicsRuntimeSourceRef = live; f.host.selectedIdsRef = { current: new Set([latest.id]) }; f.host.modalAssetSessionRef = session;
    const result = await ports.onBeginPrimitiveEdit?.();
    if (!result?.ok || result.context.kind !== "authored-model") throw Error("최신 actual context 필요");
    expect(result.context.assetId).toBe(latest.id); expect(result.context.source.model.name).toBe(latest.name);
    expect(result.context.source.modalSession).toBe(session.current); expect(f.replace).not.toHaveBeenCalled();
  });

  it("authored apply 분기는 실제 context/workspace/signal을 전달하고 취소·예외·port 소실을 거부한다", async () => {
    const f = await fixture(), context = await begin(f.host), ports = createStudioBg3dPrimitiveEditHostPorts(f.host), controller = new AbortController();
    expect(await ports.onApplyPrimitiveEdit?.(context, context.workspace, controller.signal)).toMatchObject({ ok: true });
    const apply = vi.mocked(applyStudioBg3dAuthoredModelEditWorkspace);
    expect(apply).toHaveBeenCalledOnce(); const [adapter, forwarded, workspace, forwardedSignal] = apply.mock.calls[0];
    expect(forwarded).toBe(context); expect(workspace).toBe(context.workspace); expect(forwardedSignal).toBe(controller.signal);
    expect(adapter.physicsRuntimeSourceRef).toBe(f.live);
    apply.mockRejectedValueOnce(new Error("apply wrapper failure"));
    expect(await ports.onApplyPrimitiveEdit?.(context, context.workspace, controller.signal)).toMatchObject({ ok: false, messageKo: expect.any(String) });
    controller.abort(); expect(await ports.onApplyPrimitiveEdit?.(context, context.workspace, controller.signal)).toMatchObject({ ok: false });
    f.host.modelRootCacheRef = undefined;
    expect(await ports.onApplyPrimitiveEdit?.(context, context.workspace, new AbortController().signal)).toMatchObject({ ok: false });
    expect(apply).toHaveBeenCalledTimes(2); expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
  });
});
