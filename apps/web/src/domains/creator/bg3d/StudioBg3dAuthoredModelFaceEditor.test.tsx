// @vitest-environment jsdom
/** 저장 조회와 WebGL 면 클릭 표면만 대체하고 정밀 원본·작업공간·도구·커널은 실제로 연결한다. */
import { Blob as NativeBlob, Buffer } from "node:buffer";
import { webcrypto } from "node:crypto";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { exportStudioHybridDccMeshGlb } from "../hybrid-dcc/studio-hybrid-dcc-glb-export";
import { pushPullStudioEditableMeshFaces } from "../hybrid-dcc/studio-hybrid-dcc-face-pushpull";
import { collectStudioBg3dThreeJoints, collectStudioBg3dThreeMorphTargets, loadVerifiedStudioBg3dGlbWithThree, measureBg3dObjectSize } from "../studio-background-3d-model";
import { inspectStudioGeneric3dRuntimeHints } from "../studio-generic-3d-runtime-hints";
import { hashStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { captureStudioBg3dAuthoredModelEditSource } from "./studio-bg3d-authored-model-edit-source";
import { createStudioBg3dAuthoredModelEditWorkspace } from "./studio-bg3d-authored-model-edit-workspace";
import { DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES, validateStudioBg3dGlb } from "./studio-bg3d-glb-validation";
import { resolveStudioBg3dModelNormalizationScale } from "./studio-bg3d-model-runtime-admission";
import { createStudioBg3dPrimitiveEditAuthoring } from "./studio-bg3d-primitive-edit-authoring";
import { writeStudioBg3dPrimitiveEditAuthoringToGlb } from "./studio-bg3d-primitive-edit-authoring-glb";
import { writeStudioBg3dPrimitiveEditMaterialGlb } from "./studio-bg3d-primitive-edit-material";
import { convertStudioBg3dPrimitiveToEditableMesh } from "./studio-bg3d-primitive-edit-mesh";
import { createStudioBg3dPrimitiveEditMaterial } from "./studio-bg3d-primitive-edit-replacement";
import { createDefaultStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import { tryAdaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";
import { classifyStudioBg3dThreeSemanticMaterials } from "./studio-bg3d-three-semantic-materials";
import { StudioBg3dPrimitiveFaceEditor } from "./StudioBg3dPrimitiveFaceEditor";

import type { StudioHybridDccViewportProps } from "../hybrid-dcc/StudioHybridDccViewportCore";
import type { StudioHybridDccObjectTransform } from "../hybrid-dcc/studio-hybrid-dcc-object-transform";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { Bg3dVerifiedStoredRecord } from "./bg3d-model-library";
import type { StudioBg3dModelRootCacheEntry } from "./studio-bg3d-model-runtime-admission";
import type { StudioBg3dAuthoredModelEditSourceHost } from "./studio-bg3d-authored-model-edit-source";
import type { StudioBg3dAuthoredModelEditWorkspace } from "./studio-bg3d-authored-model-edit-workspace";
import type { StudioBg3dModelAttachment } from "./studio-bg3d-scene-document-types";
import type { StudioBg3dPrimitiveFaceApplyResult, StudioBg3dPrimitiveFaceEditorProps } from "./StudioBg3dPrimitiveFaceEditor";

type Library = typeof import("./bg3d-model-library");
const storage = vi.hoisted(() => ({ get: vi.fn<Library["getStoredBg3dModelV12"]>(), source: vi.fn<Library["readStudioBg3dModelSourceSnapshotV12"]>() }));
vi.mock("./bg3d-model-library", async (original) => ({ ...(await original<Library>()), readStudioBg3dModelSourceSnapshotV12: storage.source }));
vi.mock("./studio-bg3d-model-library-loader", () => ({ getStoredBg3dModelV12: storage.get }));
vi.mock("../hybrid-dcc/StudioHybridDccViewportCore", () => ({
  StudioHybridDccViewport: (props: StudioHybridDccViewportProps) => {
    const id = props.workspace.activeAssetId, record = id ? props.workspace.session.state.geometry.records[id] : undefined;
    return <div aria-label="저장 모델의 면 클릭 표면">
      <button type="button" disabled={props.editingDisabled} onClick={() => { if (id) props.onSelectComponent?.(id, "face", 2, "replace"); }}>보관된 면 2 선택</button>
      <output data-testid="authored-mesh-hash">{record?.meshHash}</output>
      <output data-testid="authored-mesh">{record ? JSON.stringify(record.mesh) : "missing"}</output>
      <output data-testid="authored-transform">{id ? JSON.stringify(props.workspace.session.state.objectTransforms[id]) : "missing"}</output>
      <output data-testid="authored-selection">{props.componentSelection?.elementIds.join(",")}</output>
    </div>;
  },
}));

const records = new Map<string, Bg3dVerifiedStoredRecord>(), disposals: (() => void)[] = [];
const HISTORICAL: StudioHybridDccObjectTransform = { revision: 1, position: [2.25, 0.75, -3.5],
  rotationEulerRad: [0.31, -0.63, 0.24], scale: [1.8, 0.6, 2.2] };

async function context() {
  const converted = convertStudioBg3dPrimitiveToEditableMesh({ id: "historical-plain-box", kind: "box" });
  if (!converted.ok) throw Error(converted.detail);
  const pushed = pushPullStudioEditableMeshFaces(converted.value.mesh, [2], 0.12345678901234566);
  if (!pushed.ok) throw Error(pushed.detail);
  const mesh = pushed.value.mesh, meshHash = hashStudioEditableMesh(mesh);
  const authoring = createStudioBg3dPrimitiveEditAuthoring({ assetId: "historical-plain-box", revision: 2, mesh,
    objectTransformAtExport: HISTORICAL, colorSrgb: "#c9a876" });
  if (!authoring.ok) throw Error(authoring.messageKo);
  const exported = exportStudioHybridDccMeshGlb({ assetId: "historical-plain-box", mesh, sourceHash: meshHash, sourceRevision: 2 });
  if (!exported.ok) throw Error("실제 정밀 메시 GLB가 필요합니다.");
  const material = writeStudioBg3dPrimitiveEditMaterialGlb(exported.bytes, "#c9a876");
  if (!material.ok) throw Error(material.messageKo);
  const authored = writeStudioBg3dPrimitiveEditAuthoringToGlb(material.bytes, authoring.value.envelope);
  if (!authored.ok) throw Error(authored.messageKo);
  const bytes = authored.value;
  const hash: `sha256:${string}` = `sha256:${Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (value) => value.toString(16).padStart(2, "0")).join("")}`;
  const validated = await validateStudioBg3dGlb(bytes, { profile: "desktop", budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
    declared: { byteSize: bytes.byteLength, sha256: hash, mimeType: "model/gltf-binary" }, cumulative: { usedBytes: 0, maximumBytes: 100 * 1024 * 1024 } });
  if (!validated.ok) throw Error(validated.code);
  const document = createDefaultStudioBg3dSceneDocument(), loaded = await loadVerifiedStudioBg3dGlbWithThree(validated, document.budgets);
  if (!loaded.ok) throw Error(loaded.code);
  disposals.push(loaded.dispose);
  const record: Bg3dVerifiedStoredRecord = { id: "stored-authored-model", name: "원본 편집 보관.glb", format: "glb", storageVersion: 2,
    blob: new Blob([bytes], { type: "model/gltf-binary" }), thumbnail: null, createdAt: 1, updatedAt: 1, contentHash: hash, byteSize: bytes.byteLength,
    mime: "model/gltf-binary", validationVersion: 1, validatedAt: 1, validatorProfile: "desktop", validatorMetrics: validated.metrics,
    rights: { status: "licensed", commercialUse: true, attributionRequired: true, attribution: "원저작자", licenseName: "시험 사용권" } };
  records.set(record.id, record);
  const k = resolveStudioBg3dModelNormalizationScale(record.id, measureBg3dObjectSize(loaded.root)); loaded.root.scale.setScalar(k);
  const joints = collectStudioBg3dThreeJoints(loaded.root);
  const entry: StudioBg3dModelRootCacheEntry = { ...loaded, record, normalizationScale: k, admittedProfiles: new Set(["desktop"]), joints,
    morphTargets: collectStudioBg3dThreeMorphTargets(loaded.root), semanticMaterials: classifyStudioBg3dThreeSemanticMaterials(loaded.root),
    genericHints: inspectStudioGeneric3dRuntimeHints(loaded.root, joints) };
  const model: BgCustomModelInstance = { id: "current-model-instance", modelId: record.id, name: "이름과 배치를 바꾼 현재 모델", tags: ["실내"],
    position: [7.25, 1.125, -2.5], rotation: [0.21, -0.4, 0.72], scale: [0.9, 0.3, 1.3], materialOverride: createStudioBg3dPrimitiveEditMaterial("#2244aa") };
  const attachment: StudioBg3dModelAttachment = { id: "authored-source-attachment", name: record.name, hash: record.contentHash,
    byteSize: record.byteSize, mime: record.mime, source: "upload", rights: record.rights };
  const attachments = new Map([[record.id, attachment]]);
  const canonical = tryAdaptStudioBg3dRuntimeToDocument({ primitives: [], customModels: [model], baseDocument: document, attachmentByStorageModelId: attachments });
  if (!canonical.ok) throw Error("실제 현재 모델 정본이 필요합니다.");
  const host: StudioBg3dAuthoredModelEditSourceHost = { open: true, selectedIdsRef: { current: new Set([model.id]) },
    modalAssetSessionRef: { current: {} }, isPrimitiveEditInteractionLocked: () => false,
    physicsRuntimeSourceRef: { current: { primitives: [], customModels: [model], document: canonical.value.document } },
    modelRootCacheRef: { current: new Map([[record.id, entry]]) }, attachmentByStorageModelIdRef: { current: attachments },
    storageModelIdByAttachmentIdRef: { current: new Map([[attachment.id, record.id]]) } };
  const captured = await captureStudioBg3dAuthoredModelEditSource(host, new AbortController().signal);
  if (!captured.ok) throw Error(captured.messageKo);
  const prepared = createStudioBg3dAuthoredModelEditWorkspace(captured.snapshot);
  if (!prepared.ok) throw Error(prepared.messageKo);
  return { prepared: prepared.value, mesh, meshHash, model, entry, k, host, originalState: JSON.stringify(host.physicsRuntimeSourceRef.current) };
}

function renderEditor(prepared: StudioBg3dAuthoredModelEditWorkspace,
  onApply: StudioBg3dPrimitiveFaceEditorProps["onApply"] = async () => ({ ok: true })) {
  const applied = vi.fn<StudioBg3dPrimitiveFaceEditorProps["onApply"]>(onApply), closed = vi.fn();
  function Host() {
    const [open, setOpen] = useState(false);
    return <><button type="button" onClick={() => setOpen(true)}>현재 모델 면 편집 열기</button>
      {open ? <StudioBg3dPrimitiveFaceEditor context={prepared} onApply={applied} onClose={() => { closed(); setOpen(false); }} /> : null}</>;
  }
  const view = render(<Host />), opener = screen.getByRole("button", { name: "현재 모델 면 편집 열기" });
  opener.focus(); fireEvent.click(opener);
  return { applied, closed, view, opener };
}
function applyButton(): HTMLButtonElement { return screen.getByRole("button", { name: "배경 원본에 반영" }); }
function beginPreview() {
  fireEvent.click(screen.getByRole("button", { name: "보관된 면 2 선택" }));
  expect(screen.getByTestId("authored-selection").textContent).toBe("2");
  fireEvent.click(screen.getByRole("button", { name: /^면 모델링 · 밀기\/당기기/u }));
  const input = screen.getByRole("textbox", { name: "거리 (m)" }); fireEvent.change(input, { target: { value: "0.25" } }); return input;
}
async function commitPreview() {
  fireEvent.click(screen.getByRole("button", { name: "적용" })); await waitFor(() => expect(applyButton().disabled).toBe(false));
}
function deferred() {
  let finish: (result: StudioBg3dPrimitiveFaceApplyResult) => void = () => undefined;
  const promise = new Promise<StudioBg3dPrimitiveFaceApplyResult>((resolve) => { finish = resolve; }); return { promise, finish };
}
beforeEach(() => {
  // 실제 WebCrypto의 결과와 jsdom 검증기의 ArrayBuffer realm을 맞춘다. digest·validator는 대체하지 않는다.
  vi.stubGlobal("ArrayBuffer", Buffer.alloc(0).buffer.constructor); vi.stubGlobal("Blob", NativeBlob); vi.stubGlobal("crypto", webcrypto);
  records.clear(); storage.get.mockReset().mockImplementation(async (id) => records.get(id) ?? null);
  storage.source.mockReset().mockImplementation(async (id) => {
    const record = records.get(id);
    return record ? { record, sourceKind: "local-library", manifestRevision: 1, catalogIdentity: null } : null;
  });
  const rectangle = new DOMRect(0, 0, 120, 30);
  const rectangles: DOMRectList = { 0: rectangle, length: 1, item: (index) => index === 0 ? rectangle : null,
    [Symbol.iterator]: () => [rectangle][Symbol.iterator]() };
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue(rectangles);
});
afterEach(() => { cleanup(); disposals.splice(0).reverse().forEach((dispose) => dispose()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("저장된 모델의 정밀 메시→공통 면 편집 화면", () => {
  it("authored-model 제목·현재 이름/배치로 열고 보관된 double 메시의 지문·8정점·6면을 그대로 전달한다", async () => {
    const f = await context(), ui = renderEditor(f.prepared);
    const dialog = screen.getByRole("dialog", { name: "선택한 편집 모델 면 편집" });
    expect(within(dialog).getByText(f.model.name || "")).toBeTruthy();
    expect(f.prepared.kind).toBe("authored-model"); expect(f.prepared.displayName).toBe(f.model.name);
    expect(f.prepared.source.authoring.envelope.source.assetId).not.toBe(f.prepared.assetId);
    expect(f.mesh.vertices).toHaveLength(8); expect(f.mesh.faces).toHaveLength(6);
    expect(f.mesh.vertices.some(({ position }) => Math.fround(position.y) !== position.y)).toBe(true);
    expect(screen.getByTestId("authored-mesh-hash").textContent).toBe(f.meshHash);
    expect(screen.getByTestId("authored-mesh").textContent).toBe(JSON.stringify(f.mesh));
    expect(f.prepared.source.objectTransformBasis).toBe("current-instance");
    expect(f.prepared.initialTransform.position).toEqual(f.prepared.source.canonicalNode.transform.position);
    expect(f.prepared.initialTransform.rotationEulerRad).toEqual(f.prepared.source.canonicalNode.transform.rotation);
    expect(f.prepared.initialTransform.scale).toEqual(f.model.scale.map((value) => value * f.k));
    expect(f.prepared.initialTransform).not.toEqual(HISTORICAL);
    expect(screen.getByTestId("authored-transform").textContent).toBe(JSON.stringify(f.prepared.initialTransform));
    expect(applyButton().disabled).toBe(true); expect(storage.get).toHaveBeenCalledOnce();
    expect(ui.applied).not.toHaveBeenCalled(); expect(JSON.stringify(f.host.physicsRuntimeSourceRef.current)).toBe(f.originalState);
  });

  it("실제 면 클릭·Push/Pull 확정 후에만 같은 authored context와 변경 메시·현재 TRS를 반영 callback에 보낸다", async () => {
    const f = await context(), ui = renderEditor(f.prepared), before = JSON.stringify(f.prepared.source.authoring);
    beginPreview(); expect(screen.getByTestId("authored-mesh-hash").textContent).not.toBe(f.meshHash);
    expect(applyButton().disabled).toBe(true); fireEvent.click(applyButton()); expect(ui.applied).not.toHaveBeenCalled();
    await commitPreview(); fireEvent.click(applyButton()); await waitFor(() => expect(ui.closed).toHaveBeenCalledOnce());
    const [received, workspace, signal] = ui.applied.mock.calls[0];
    expect(received).toBe(f.prepared); expect(received.kind).toBe("authored-model"); expect(signal.aborted).toBe(false);
    const record = workspace.session.state.geometry.records[f.prepared.assetId];
    expect(record.meshHash).not.toBe(f.meshHash); expect(record.mesh.vertices).toHaveLength(8); expect(record.mesh.faces).toHaveLength(6);
    expect(Math.max(...record.mesh.vertices.map(({ position }) => position.y)) - Math.max(...f.mesh.vertices.map(({ position }) => position.y))).toBeCloseTo(0.25, 12);
    expect(workspace.session.state.objectTransforms[f.prepared.assetId]).toEqual(f.prepared.initialTransform);
    expect(JSON.stringify(f.prepared.source.authoring)).toBe(before); expect(JSON.stringify(f.host.physicsRuntimeSourceRef.current)).toBe(f.originalState);
  });

  it("로컬 Undo는 정확한 원본 double 메시를 복원하고 Redo는 확정 결과를 돌려주며 배경은 반영하지 않는다", async () => {
    const f = await context(), ui = renderEditor(f.prepared); beginPreview(); await commitPreview();
    const editedHash = screen.getByTestId("authored-mesh-hash").textContent;
    fireEvent.click(screen.getByRole("button", { name: "면 편집 실행 취소" }));
    expect(screen.getByTestId("authored-mesh-hash").textContent).toBe(f.meshHash);
    expect(screen.getByTestId("authored-mesh").textContent).toBe(JSON.stringify(f.mesh)); expect(applyButton().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "면 편집 다시 실행" }));
    expect(screen.getByTestId("authored-mesh-hash").textContent).toBe(editedHash); expect(applyButton().disabled).toBe(false);
    expect(screen.getByTestId("authored-transform").textContent).toBe(JSON.stringify(f.prepared.initialTransform));
    expect(ui.applied).not.toHaveBeenCalled(); expect(JSON.stringify(f.host.physicsRuntimeSourceRef.current)).toBe(f.originalState);
  });

  it("미리보기 취소는 보관된 정밀 메시로 돌아가고 닫기는 원래 opener focus를 복원한다", async () => {
    const f = await context(), ui = renderEditor(f.prepared), input = beginPreview();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.getByTestId("authored-mesh-hash").textContent).toBe(f.meshHash);
    expect(screen.getByTestId("authored-mesh").textContent).toBe(JSON.stringify(f.mesh)); expect(ui.closed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "면 편집 닫기" }));
    expect(ui.closed).toHaveBeenCalledOnce(); expect(document.activeElement).toBe(ui.opener); expect(ui.applied).not.toHaveBeenCalled();
    expect(JSON.stringify(f.host.physicsRuntimeSourceRef.current)).toBe(f.originalState);
  });

  it("반영 거부 후 같은 model context·확정 메시를 새 signal로 재시도하고 성공 뒤에만 닫는다", async () => {
    const f = await context(); let attempts = 0;
    const ui = renderEditor(f.prepared, async () => ++attempts === 1 ? { ok: false, messageKo: "저장 모델 원본이 바뀌었습니다. 다시 확인하세요." } : { ok: true });
    beginPreview(); await commitPreview(); const editedHash = screen.getByTestId("authored-mesh-hash").textContent;
    fireEvent.click(applyButton()); await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("저장 모델 원본이 바뀌었습니다"));
    expect(ui.closed).not.toHaveBeenCalled(); expect(screen.getByTestId("authored-mesh-hash").textContent).toBe(editedHash);
    fireEvent.click(applyButton()); await waitFor(() => expect(ui.closed).toHaveBeenCalledOnce());
    expect(ui.applied).toHaveBeenCalledTimes(2);
    expect(ui.applied.mock.calls[0][0]).toBe(f.prepared); expect(ui.applied.mock.calls[1][0]).toBe(f.prepared);
    expect(ui.applied.mock.calls[0][1]).toBe(ui.applied.mock.calls[1][1]); expect(ui.applied.mock.calls[0][2]).not.toBe(ui.applied.mock.calls[1][2]);
  });

  it("authored 반영 대기 중 unmount는 실제 signal을 취소하고 늦은 성공을 닫기/추가 반영으로 사용하지 않는다", async () => {
    const f = await context(), pending = deferred(), ui = renderEditor(f.prepared, () => pending.promise);
    beginPreview(); await commitPreview(); fireEvent.click(applyButton());
    const signal = ui.applied.mock.calls[0][2]; expect(signal.aborted).toBe(false);
    ui.view.unmount(); expect(signal.aborted).toBe(true);
    await act(async () => { pending.finish({ ok: true }); await pending.promise; });
    expect(ui.applied).toHaveBeenCalledOnce(); expect(ui.closed).not.toHaveBeenCalled();
    expect(JSON.stringify(f.host.physicsRuntimeSourceRef.current)).toBe(f.originalState);
  });
});
