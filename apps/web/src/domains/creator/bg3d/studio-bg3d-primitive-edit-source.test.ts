import { describe, expect, it } from "vitest";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import { createDefaultStudioBg3dSceneDocument, DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE, serializeStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import { hydrateStudioBg3dDocumentToRuntime, tryAdaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";
import type { StudioBg3dModelAttachment } from "./studio-bg3d-scene-document-types";
import {
  captureStudioBg3dPrimitiveEditSource,
  inspectStudioBg3dPrimitiveEditSource,
  revalidateStudioBg3dPrimitiveEditSource,
  type StudioBg3dPrimitiveEditRuntime,
  type StudioBg3dPrimitiveEditSourceHost,
} from "./studio-bg3d-primitive-edit-source";

function box(patch: Partial<BgPrimitive> = {}): BgPrimitive {
  return { id: "source-box", kind: "box", name: "원본 상자", position: [2.25, 0.75, -3.5],
    rotation: [0.31, -0.63, 0.24], scale: [1.8, 0.6, 2.2], color: "#c9a876", ...patch };
}

function fixture(primitive = box()) {
  const source: { current: StudioBg3dPrimitiveEditRuntime } = { current: {
    primitives: [primitive], customModels: [], document: createDefaultStudioBg3dSceneDocument(),
  } };
  const selection = { current: new Set([primitive.id]) };
  const session: { current: object | null } = { current: {} };
  let locked = false;
  const host: StudioBg3dPrimitiveEditSourceHost = {
    open: true, selectedIds: new Set(["stale-render"]), selectedIdsRef: selection,
    physicsRuntimeSourceRef: source, modalAssetSessionRef: session,
    attachmentByStorageModelIdRef: { current: new Map() }, isPrimitiveEditInteractionLocked: () => locked,
  };
  return { host, source, selection, session, primitive, lock: () => { locked = true; } };
}

function canonicalFixture() {
  const f = fixture();
  const canonical = tryAdaptStudioBg3dRuntimeToDocument({ primitives: [f.primitive, box({ id: "other" })],
    customModels: [], baseDocument: f.source.current.document, attachmentByStorageModelId: new Map() });
  if (!canonical.ok) throw Error("정본 fixture 생성 실패");
  const hydrated = hydrateStudioBg3dDocumentToRuntime({ document: canonical.value.document, storageModelIdByAttachmentId: new Map() });
  if (!hydrated.ok) throw Error("정본 fixture 복원 실패");
  f.source.current = { primitives: hydrated.primitives, customModels: hydrated.customModels, document: canonical.value.document };
  return f;
}

const ATTACHMENT: StudioBg3dModelAttachment = { id: "existing-attachment", name: "기존 모델.glb", byteSize: 64,
  hash: `sha256:${"b".repeat(64)}`, mime: "model/gltf-binary", source: "upload",
  rights: { status: "owned", commercialUse: true, attributionRequired: false } };

describe("기본 상자 직접 편집 원본 경계", () => {
  it("최신 선택 ref를 쓰고 session·정본 지문과 독립 사본을 보존한다", () => {
    const f = fixture(box({ tags: ["실내"] }));
    const result = captureStudioBg3dPrimitiveEditSource(f.host);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.modalSession).toBe(f.session.current);
    expect(result.snapshot.canonicalNode).toMatchObject({ id: "source-box", kind: "primitive", primitiveKind: "box", tags: ["실내"] });
    expect(result.snapshot.primitive).not.toBe(f.primitive);
    expect(result.snapshot.primitive.position).not.toBe(f.primitive.position);
    expect(Object.isFrozen(result.snapshot.primitive.position)).toBe(true);
    expect(Object.isFrozen(result.snapshot.primitive)).toBe(true);
    expect(revalidateStudioBg3dPrimitiveEditSource(f.host, result.snapshot).ok).toBe(true);
  });

  it("원본의 in-place 변경을 감지하고 무관한 노드·카메라 변경은 허용한다", () => {
    const f = fixture();
    const captured = captureStudioBg3dPrimitiveEditSource(f.host);
    if (!captured.ok) throw Error(captured.messageKo);
    f.source.current = { ...f.source.current, primitives: [...f.source.current.primitives, box({ id: "other", position: [9, 0, 0] })],
      document: { ...f.source.current.document, camera: { ...f.source.current.document.camera, position: [4, 5, 6] } } };
    expect(revalidateStudioBg3dPrimitiveEditSource(f.host, captured.snapshot).ok).toBe(true);
    f.primitive.position[0] = 7;
    expect(revalidateStudioBg3dPrimitiveEditSource(f.host, captured.snapshot)).toMatchObject({ ok: false, code: "source-changed" });
    expect(captured.snapshot.primitive.position[0]).toBe(2.25);
  });

  it.each(["source-box", "other"])("strict 정본→hydrate의 %s에 꺼진 그림자 설정이 있으면 편집을 거부한다", (nodeId) => {
    for (const flags of [{ castsShadow: false }, { receivesShadow: false }]) {
      const f = canonicalFixture();
      const document = { ...f.source.current.document, nodes: f.source.current.document.nodes.map((node) =>
        node.id === nodeId ? { ...node, ...flags } : node) };
      expect(serializeStudioBg3dSceneDocument(document)).toBeTruthy();
      const hydrated = hydrateStudioBg3dDocumentToRuntime({ document, storageModelIdByAttachmentId: new Map() });
      expect(hydrated.ok).toBe(true); expect(hydrated.diagnostics).toEqual([]);
      expect(hydrated.counts.droppedPrimitives).toBe(0);
      f.source.current = { primitives: hydrated.primitives, customModels: hydrated.customModels, document };
      expect(captureStudioBg3dPrimitiveEditSource(f.host)).toMatchObject({ ok: false, code: "document-rejected",
        messageKo: expect.stringContaining("그림자 투사 또는 수신") });
      expect(f.source.current.document).toBe(document);
    }
  });

  it.each(["source-box", "other"])("편집 대기 중 %s의 그림자 설정이 꺼지면 최신 정본 재검증에서 취소한다", (nodeId) => {
    const f = canonicalFixture();
    const captured = captureStudioBg3dPrimitiveEditSource(f.host);
    if (!captured.ok) throw Error(captured.messageKo);
    const document = { ...f.source.current.document, nodes: f.source.current.document.nodes.map((node) =>
      node.id === nodeId ? { ...node, castsShadow: false } : node) };
    expect(serializeStudioBg3dSceneDocument(document)).toBeTruthy();
    f.source.current = { ...f.source.current, document };
    expect(revalidateStudioBg3dPrimitiveEditSource(f.host, captured.snapshot)).toMatchObject({ ok: false, code: "document-rejected" });
  });

  it("strict 정본의 미사용 attachment도 버리지 않고 capture·재검증을 거부한다", () => {
    const f = canonicalFixture();
    const captured = captureStudioBg3dPrimitiveEditSource(f.host);
    if (!captured.ok) throw Error(captured.messageKo);
    const document = { ...f.source.current.document, attachments: [ATTACHMENT] };
    expect(serializeStudioBg3dSceneDocument(document)).toBeTruthy();
    const hydrated = hydrateStudioBg3dDocumentToRuntime({ document, storageModelIdByAttachmentId: new Map() });
    expect(hydrated.ok).toBe(true); expect(hydrated.diagnostics).toEqual([]);
    f.source.current = { primitives: hydrated.primitives, customModels: hydrated.customModels, document };
    expect(captureStudioBg3dPrimitiveEditSource(f.host)).toMatchObject({ ok: false, code: "document-rejected",
      messageKo: expect.stringContaining("기존 모델 원본 연결") });
    expect(revalidateStudioBg3dPrimitiveEditSource(f.host, captured.snapshot)).toMatchObject({ ok: false, code: "document-rejected" });
    expect(f.source.current.document).toBe(document);
  });

  it("동일한 정본 attachment는 키 순서와 무관하게 허용하고 binding의 DTO 변경은 거부한다", () => {
    const f = fixture();
    const { rights, ...attachmentFields } = ATTACHMENT;
    const bindings = new Map([["stored-model", { rights, ...attachmentFields }]]);
    const runtime = { primitives: [f.primitive], customModels: [{ id: "model", modelId: "stored-model", name: "모델",
      position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } satisfies BgCustomModelInstance] };
    const canonical = tryAdaptStudioBg3dRuntimeToDocument({ ...runtime, baseDocument: f.source.current.document, attachmentByStorageModelId: bindings });
    if (!canonical.ok) throw Error("정본 fixture 생성 실패");
    f.source.current = { ...runtime, document: canonical.value.document };
    const host = { ...f.host, attachmentByStorageModelIdRef: { current: bindings } };
    const captured = captureStudioBg3dPrimitiveEditSource(host);
    expect(captured.ok).toBe(true);
    if (!captured.ok) return;
    bindings.set("stored-model", { ...ATTACHMENT, name: "다른 원본 이름.glb" });
    expect(captureStudioBg3dPrimitiveEditSource(host)).toMatchObject({ ok: false, code: "document-rejected" });
    expect(revalidateStudioBg3dPrimitiveEditSource(host, captured.snapshot)).toMatchObject({ ok: false, code: "document-rejected" });
  });

  it("비동기 대기 뒤 session 변경·선택 변경·잠금을 다시 검사한다", () => {
    const f = fixture();
    const captured = captureStudioBg3dPrimitiveEditSource(f.host);
    if (!captured.ok) throw Error(captured.messageKo);
    const old = f.session.current;
    f.session.current = {};
    expect(revalidateStudioBg3dPrimitiveEditSource(f.host, captured.snapshot)).toMatchObject({ ok: false, code: "session-changed" });
    f.session.current = old;
    f.selection.current = new Set();
    expect(revalidateStudioBg3dPrimitiveEditSource(f.host, captured.snapshot)).toMatchObject({ ok: false, code: "invalid-selection" });
    f.selection.current = new Set([f.primitive.id]);
    f.lock();
    expect(revalidateStudioBg3dPrimitiveEditSource(f.host, captured.snapshot)).toMatchObject({ ok: false, code: "selection-unavailable" });
  });

  it.each([
    ["숨김", { visible: false }], ["잠금", { locked: true }], ["부모", { parentId: "parent" }],
    ["컴포넌트", { componentRef: { id: "component", name: "컴포넌트" } }], ["연결 복제", { linkedSourceId: "source" }],
    ["비지원 도형", { kind: "sphere" }],
  ] satisfies readonly (readonly [string, Partial<BgPrimitive>])[])("%s 원본을 거부한다", (_name, patch) => {
    const f = fixture(box(patch));
    expect(captureStudioBg3dPrimitiveEditSource(f.host).ok).toBe(false);
    expect(inspectStudioBg3dPrimitiveEditSource(f.host).blockedReason).toBeTruthy();
  });

  it("자식이나 나를 참조하는 follower가 있으면 원본 종류를 바꾸지 않는다", () => {
    for (const related of [box({ id: "child", parentId: "source-box" }), box({ id: "follower", linkedSourceId: "source-box" })]) {
      const f = fixture();
      f.source.current = { ...f.source.current, primitives: [...f.source.current.primitives, related] };
      expect(captureStudioBg3dPrimitiveEditSource(f.host)).toMatchObject({ ok: false, code: "unsupported-source" });
    }
  });

  it("숨긴 태그와 외부 모델·혼합·중복 ID 선택을 거부한다", () => {
    const f = fixture(box({ tags: ["지붕"] }));
    f.source.current = { ...f.source.current, document: { ...f.source.current.document, meta: { hiddenTags: ["지붕"] } } };
    expect(captureStudioBg3dPrimitiveEditSource(f.host)).toMatchObject({ ok: false, code: "selection-unavailable" });
    f.source.current = { ...f.source.current, document: createDefaultStudioBg3dSceneDocument() };
    f.selection.current = new Set(["source-box", "another"]);
    expect(captureStudioBg3dPrimitiveEditSource(f.host)).toMatchObject({ ok: false, code: "invalid-selection" });
    const model: BgCustomModelInstance = { id: "model", modelId: "stored", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
    f.source.current = { ...f.source.current, customModels: [model] };
    f.selection.current = new Set([model.id]);
    expect(captureStudioBg3dPrimitiveEditSource(f.host)).toMatchObject({ ok: false, code: "unsupported-source" });
    f.selection.current = new Set(["source-box"]);
    f.source.current = { ...f.source.current, primitives: [f.primitive, { ...f.primitive }] };
    expect(captureStudioBg3dPrimitiveEditSource(f.host)).toMatchObject({ ok: false, code: "invalid-source" });
  });

  it("페인트·PBR surface·재질 조정을 거부하고 기본 neutral override만 허용한다", () => {
    const neutral = fixture(box({ materialOverride: { ...DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE } }));
    expect(captureStudioBg3dPrimitiveEditSource(neutral.host).ok).toBe(true);
    for (const materialOverride of [
      { ...DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE, roughness: 0.2 },
      { ...DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE, surfaceMaterialId: "wood" },
      { ...DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE, colorMode: "replace" as const },
    ]) expect(captureStudioBg3dPrimitiveEditSource(fixture(box({ materialOverride })).host))
      .toMatchObject({ ok: false, code: "unsupported-material" });
    expect(captureStudioBg3dPrimitiveEditSource(fixture(box({ texturePaint: { version: 1, strokes: [] } })).host))
      .toMatchObject({ ok: false, code: "unsupported-material" });
  });

  it("원본 변환을 정규화로 잘라 받지 않는다", () => {
    for (const patch of [{ scale: [0.0009, 1, 1] }, { scale: [1_001, 1, 1] }, { position: [10_001, 0, 0] },
      { rotation: [Math.PI + 0.001, 0, 0] }, { scale: [Number.NaN, 1, 1] }] satisfies Partial<BgPrimitive>[]) {
      expect(captureStudioBg3dPrimitiveEditSource(fixture(box(patch)).host)).toMatchObject({ ok: false, code: "invalid-source" });
    }
  });

  it("이름·태그 정규화가 선택 원본을 조용히 바꾸는 경우 거부한다", () => {
    for (const patch of [{ name: "가".repeat(81) }, { tags: ["가".repeat(33)] }, { tags: ["중복", "중복"] }]) {
      expect(captureStudioBg3dPrimitiveEditSource(fixture(box(patch)).host)).toMatchObject({ ok: false, code: "invalid-source" });
    }
  });

  it("다른 모델 binding 누락·512 초과·복제한 snapshot을 성공으로 취급하지 않는다", () => {
    const f = fixture();
    const captured = captureStudioBg3dPrimitiveEditSource(f.host);
    if (!captured.ok) throw Error(captured.messageKo);
    expect(revalidateStudioBg3dPrimitiveEditSource(f.host, { ...captured.snapshot })).toMatchObject({ ok: false, code: "source-changed" });
    f.source.current = { ...f.source.current, customModels: [{ id: "other", modelId: "unbound", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }] };
    expect(captureStudioBg3dPrimitiveEditSource(f.host)).toMatchObject({ ok: false, code: "document-rejected" });
    f.source.current = { ...f.source.current, customModels: [], primitives: Array.from({ length: 513 }, (_, index) => box({ id: index === 0 ? "source-box" : `box-${index}` })) };
    expect(captureStudioBg3dPrimitiveEditSource(f.host)).toMatchObject({ ok: false, code: "invalid-source" });
  });
});
