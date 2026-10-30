import { afterEach, describe, expect, it } from "vitest";

import { createDefaultStudioBg3dSceneDocument, DEFAULT_STUDIO_BG3D_ANIMATION_PLAYBACK, serializeStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import { studioBg3dModalOperationCoordinator } from "./studio-bg3d-modal-operation-coordinator";
import { readStudioBg3dModelCacheEntry, studioBg3dModelCacheKey, studioBg3dModelRuntimeVariant } from "./studio-bg3d-model-material-variant";
import { assertStudioBg3dSceneGlbSourceCurrent, captureStudioBg3dSceneGlbSource, isStudioBg3dSceneGlbExportAvailable } from "./studio-bg3d-scene-glb-source";
import { createSceneGlbFixture, disposeSceneGlbFixtures } from "./studio-bg3d-scene-glb.test-fixture";

import type { StudioBg3dSceneGlbExportHost } from "./studio-bg3d-scene-glb-source";

const signal = () => new AbortController().signal;
function rejected(work: () => unknown, code: string): void {
  let error: unknown; try { work(); } catch (cause) { error = cause; } expect(error).toMatchObject({ code });
}
afterEach(disposeSceneGlbFixtures);

describe("현재 장면 GLB source의 읽기 권위", () => {
  it("실제 정본·live framing·verified cache를 읽고 현재 licensed 권리와 원본 metadata를 독립 snapshot으로 보존한다", async () => {
    const f = await createSceneGlbFixture(), before = serializeStudioBg3dSceneDocument(f.runtime.current.document);
    if (!f.record || !f.entry) throw Error("실제 캐시 필요");
    const source = captureStudioBg3dSceneGlbSource(f.host, signal());
    expect(source.canonicalFingerprint).toBe(before); expect(source.document.camera.position).toEqual([3, 4, 8]);
    expect(source.document.camera).toMatchObject({ target: [0.5, 1, 0], orthographicHeight: 8, zoom: 2 });
    const asset = source.assets.get("attachment-scene-model");
    expect(asset?.entry).toBe(f.entry); expect(asset?.root).toBe(f.entry.root); expect(asset?.storageId).toBe(f.record.id);
    expect(asset?.attachment.rights).toEqual(f.record.rights); expect(asset?.attachment.rights.status).toBe("licensed");
    expect(asset?.attachment).not.toBe(f.attachments.get(f.record.id));
    expect(f.entry.normalizationScale).toBe(2); expect(f.entry.root.scale.toArray()).toEqual([2, 2, 2]);
    if (!f.framing.current) throw Error("실제 framing 필요");
    f.framing.current = { ...f.framing.current, viewportAspect: 1 };
    expect(source.framing.viewportAspect).toBe(16 / 9);
    expect(serializeStudioBg3dSceneDocument(f.runtime.current.document)).toBe(before);
    expect(f.commit).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled(); expect(f.entry.dispose).not.toHaveBeenCalled();
  });

  it("공유 attachment는 한 번 캡처하며 숨김 부모/태그는 제외하고 locked 노드는 내보낸다", async () => {
    const f = await createSceneGlbFixture();
    f.runtime.current = { ...f.runtime.current, customModels: [...f.models, { ...f.models[0], id: "second-instance", position: [6, 0, 0] }] }; f.refresh();
    const source = captureStudioBg3dSceneGlbSource(f.host, signal()); expect(source.assets.size).toBe(1);
    expect(source.document.nodes.find(({ id }) => id === f.primitive.id)?.locked).toBe(true);
    f.runtime.current = { ...f.runtime.current, customModels: f.runtime.current.customModels.map((model) => ({ ...model, tags: ["보이지않음"] })),
      document: { ...f.runtime.current.document, meta: { hiddenTags: ["보이지않음"] } } }; f.refresh();
    f.cache.clear(); f.attachments.clear(); f.reverse.clear();
    expect(captureStudioBg3dSceneGlbSource(f.host, signal()).assets.size).toBe(0);
  });

  it("canonical 전용 그림자·미사용 attachment를 runtime adapter의 손실로 오인하지 않는다", async () => {
    const f = await createSceneGlbFixture();
    const attachment = f.runtime.current.document.attachments[0];
    f.runtime.current = { ...f.runtime.current, document: { ...f.runtime.current.document,
      nodes: f.runtime.current.document.nodes.map((node) => ({ ...node, castsShadow: false, receivesShadow: false })),
      attachments: [...f.runtime.current.document.attachments, { ...attachment, id: "unreferenced", name: "미사용 원본.glb", hash: `sha256:${"b".repeat(64)}` }] } };
    const source = captureStudioBg3dSceneGlbSource(f.host, signal());
    expect(source.document.nodes.every((node) => !node.castsShadow && !node.receivesShadow)).toBe(true);
    expect(source.document.attachments.some(({ id }) => id === "unreferenced")).toBe(true); expect(source.assets.size).toBe(1);
  });

  const unavailable: readonly Partial<StudioBg3dSceneGlbExportHost>[] = [
    { modelRenderer: {} }, { materialBackend: "webgpu" },
    { open: false }, { modelRenderer: null }, { isRestoringScene: true }, { isCapturing: true }, { isBatchRenderingShots: true },
    { physicsInteractionLocked: true }, { isUploadingModel: true }, { hasPendingClone: true }, { hasCloneFailure: true },
    { captureInFlightRef: { current: true } }, { cameraLensInteractionLocked: () => true }, { viewportApiRef: { current: null } },
    { deviceQuality: undefined }, { modelRootCacheRef: undefined }, { attachmentByStorageModelIdRef: undefined }, { isMaterialBackendCurrent: () => false },
  ];
  it.each(unavailable)("준비되지 않은 host %j는 framing·자산 읽기 전에 중단한다", async (patch) => {
    const f = await createSceneGlbFixture(false); Object.assign(f.host, patch);
    expect(isStudioBg3dSceneGlbExportAvailable(f.host)).toBe(false);
    rejected(() => captureStudioBg3dSceneGlbSource(f.host, signal()), "unavailable"); expect(f.readFramingState).not.toHaveBeenCalled();
  });

  it("이미 취소·끝난 실제 modal session·실제 framing 누락·빈 visible 장면을 성공으로 바꾸지 않는다", async () => {
    const f = await createSceneGlbFixture(false), controller = new AbortController(); controller.abort();
    rejected(() => captureStudioBg3dSceneGlbSource(f.host, controller.signal), "aborted"); expect(f.readFramingState).not.toHaveBeenCalled();
    if (!f.session.current) throw Error("세션 필요"); studioBg3dModalOperationCoordinator.endSession(f.session.current);
    rejected(() => captureStudioBg3dSceneGlbSource(f.host, signal()), "unavailable");
    f.session.current = studioBg3dModalOperationCoordinator.beginSession(); f.framing.current = null;
    rejected(() => captureStudioBg3dSceneGlbSource(f.host, signal()), "unavailable");
    f.runtime.current = { primitives: [], customModels: [], document: createDefaultStudioBg3dSceneDocument() };
    f.framing.current = { view: f.runtime.current.document.camera, viewportAspect: 1 };
    rejected(() => captureStudioBg3dSceneGlbSource(f.host, signal()), "unsupported-scene");
  });

  it.each(["reverse", "forward", "rights", "record-id", "root-k", "missing-k", "root-position", "root-rotation"])("%s 원본 연결·캐시 손상은 현재 파일의 권위가 될 수 없다", async (kind) => {
    const f = await createSceneGlbFixture(); if (!f.entry || !f.record) throw Error("실제 모델 필요");
    const attachment = f.attachments.get(f.record.id); if (!attachment) throw Error("첨부 필요");
    if (kind === "reverse") f.reverse.set(attachment.id, "다른-record");
    if (kind === "forward") f.attachments.delete(f.record.id);
    if (kind === "rights") f.attachments.set(f.record.id, { ...attachment, rights: { status: "owned", commercialUse: true, attributionRequired: false } });
    if (kind === "record-id") Object.defineProperty(f.entry, "record", { value: { ...f.record, id: "다른-record" } });
    if (kind === "root-k") f.entry.root.scale.x *= 2;
    if (kind === "missing-k") Object.defineProperty(f.entry, "normalizationScale", { value: undefined });
    if (kind === "root-position") f.entry.root.position.x = 1;
    if (kind === "root-rotation") f.entry.root.rotation.y = 0.2;
    rejected(() => captureStudioBg3dSceneGlbSource(f.host, signal()), kind === "reverse" ? "source-changed" : "asset-invalid");
    expect(f.commit).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled();
  });

  it.each(["document", "framing", "session", "cache", "root-transform", "rights"])("비동기 작업 중 %s 변경은 최종 source fence에서 거부한다", async (kind) => {
    const f = await createSceneGlbFixture(), source = captureStudioBg3dSceneGlbSource(f.host, signal());
    if (!f.record || !f.entry || !f.framing.current) throw Error("실제 모델·framing 필요");
    if (kind === "document") f.runtime.current = { ...f.runtime.current, document: { ...f.runtime.current.document, meta: { name: "새 장면" } } };
    if (kind === "framing") f.framing.current = { ...f.framing.current, viewportAspect: 1 };
    if (kind === "session") f.session.current = studioBg3dModalOperationCoordinator.beginSession();
    if (kind === "cache") f.cache.set(studioBg3dModelCacheKey(f.record.id, f.backend), { ...f.entry });
    if (kind === "root-transform") f.entry.root.scale.x *= 2;
    if (kind === "rights") Object.defineProperty(f.entry, "record", { value: { ...f.record, rights: { ...f.record.rights, attribution: "바뀐 권리" } } });
    rejected(() => assertStudioBg3dSceneGlbSourceCurrent(f.host, source, signal()), "source-changed");
  });

  it.each(["position", "color", "kind"])("runtime의 현재 %s가 정본과 다르면 이전 장면을 export하지 않는다", async (kind) => {
    const f = await createSceneGlbFixture(false);
    if (kind === "position") f.primitive.position[0] += 1;
    if (kind === "color") f.primitive.color = "#112233";
    if (kind === "kind") f.primitive.kind = "sphere";
    rejected(() => captureStudioBg3dSceneGlbSource(f.host, signal()), "source-changed");
  });

  it("검사 뒤 runtime transform만 바뀌어도 source fingerprint가 같다는 이유로 파일을 내보내지 않는다", async () => {
    const f = await createSceneGlbFixture(false), source = captureStudioBg3dSceneGlbSource(f.host, signal());
    f.primitive.position[0] += 1;
    rejected(() => assertStudioBg3dSceneGlbSourceCurrent(f.host, source, signal()), "source-changed");
  });

  it.each([false, true])("실제 renderer engine=%s를 캡처하고 renderer 교체를 최종 fence에서 거부한다", async (webgpu) => {
    const f = await createSceneGlbFixture(false, webgpu ? "webgpu" : "webgl");
    const source = captureStudioBg3dSceneGlbSource(f.host, signal());
    expect(source.rendererEngine).toBe(webgpu ? "webgpu" : "webgl"); expect(source.rendererRefSnapshot).toBe(f.host.modelRenderer);
    f.host.modelRenderer = { isWebGLRenderer: !webgpu, isWebGPURenderer: webgpu };
    rejected(() => assertStudioBg3dSceneGlbSourceCurrent(f.host, source, signal()), "source-changed");
  });

  it.each(["webgl", "webgpu"] as const)("같은 저장 ID의 실제 두 variant 가운데 %s root만 선택한다", async (backend) => {
    const f = await createSceneGlbFixture(true, backend);
    if (!f.entry || !f.record) throw Error("실제 모델 필요");
    const otherBackend = backend === "webgl" ? "webgpu" : "webgl";
    const other = await f.addModelVariant(otherBackend);
    expect(other.root).not.toBe(f.entry.root); expect(other.runtimeVariant).not.toBe(f.entry.runtimeVariant);
    expect(f.cache.size).toBe(2); expect(f.cache.has(f.record.id)).toBe(false);
    const source = captureStudioBg3dSceneGlbSource(f.host, signal());
    expect(source.materialBackend).toBe(backend); expect(source.rendererEngine).toBe(backend);
    expect(source.assets.get("attachment-scene-model")?.entry).toBe(readStudioBg3dModelCacheEntry(f.cache, f.record.id, backend));
    expect(source.assets.get("attachment-scene-model")?.entry).toBe(f.entry);
    expect(source.assets.get("attachment-scene-model")?.root).not.toBe(other.root);
    f.cache.delete(studioBg3dModelCacheKey(f.record.id, otherBackend));
    expect(() => assertStudioBg3dSceneGlbSourceCurrent(f.host, source, signal())).not.toThrow();
    expect(f.commit).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled();
  });

  it.each(["missing", "raw-alias", "missing-stamp", "wrong-stamp"] as const)("%s인 요청 variant를 다른 backend 캐시로 대신하지 않는다", async (boundary) => {
    const f = await createSceneGlbFixture(); if (!f.entry || !f.record) throw Error("실제 모델 필요");
    const other = await f.addModelVariant("webgpu"), key = studioBg3dModelCacheKey(f.record.id, f.backend);
    f.cache.delete(key);
    if (boundary === "raw-alias") f.cache.set(f.record.id, f.entry);
    if (boundary === "missing-stamp") {
      const unstamped = { ...f.entry }; Reflect.deleteProperty(unstamped, "runtimeVariant"); f.cache.set(key, unstamped);
    }
    if (boundary === "wrong-stamp") f.cache.set(key, { ...f.entry, runtimeVariant: studioBg3dModelRuntimeVariant("webgpu") });
    rejected(() => captureStudioBg3dSceneGlbSource(f.host, signal()), "asset-invalid");
    expect(readStudioBg3dModelCacheEntry(f.cache, f.record.id, "webgpu")).toBe(other);
    expect(f.commit).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled(); expect(other.dispose).not.toHaveBeenCalled();
  });

  it("backend를 생략한 unknown host도 실제 GPU renderer로 variant를 선택한다", async () => {
    const f = await createSceneGlbFixture(true, "webgpu");
    await f.addModelVariant("webgl"); f.host.materialBackend = undefined;
    const source = captureStudioBg3dSceneGlbSource(f.host, signal());
    expect(source.materialBackend).toBe("webgpu"); expect(source.assets.get("attachment-scene-model")?.entry).toBe(f.entry);
  });

  it("캡처 뒤 요청 variant의 stamp가 바뀌면 동일 root·저장 record라도 최종 fence에서 거부한다", async () => {
    const f = await createSceneGlbFixture(); if (!f.entry) throw Error("실제 모델 필요");
    const source = captureStudioBg3dSceneGlbSource(f.host, signal());
    Object.defineProperty(f.entry, "runtimeVariant", { value: studioBg3dModelRuntimeVariant("webgpu") });
    rejected(() => assertStudioBg3dSceneGlbSourceCurrent(f.host, source, signal()), "source-changed");
    expect(f.commit).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled();
  });

  it("동일 renderer/backend로 돌아와도 이전 opaque lease 함수는 새 true guard로 대체할 수 없다", async () => {
    const f = await createSceneGlbFixture(false); let originalCurrent = true;
    const originalGuard = () => originalCurrent; f.host.isMaterialBackendCurrent = originalGuard;
    const source = captureStudioBg3dSceneGlbSource(f.host, signal());
    expect(source.isMaterialBackendCurrent).toBe(originalGuard);
    const renderer = f.host.modelRenderer; originalCurrent = false;
    f.host.isMaterialBackendCurrent = () => true;
    expect(f.host.modelRenderer).toBe(renderer); expect(isStudioBg3dSceneGlbExportAvailable(f.host)).toBe(true);
    rejected(() => assertStudioBg3dSceneGlbSourceCurrent(f.host, source, signal()), "source-changed");
    expect(f.commit).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled();
  });

  it("같은 회전의 2π 표현·권리 property 순서는 source 변경으로 오인하지 않는다", async () => {
    const f = await createSceneGlbFixture(); f.primitive.rotation[0] += 2 * Math.PI;
    const source = captureStudioBg3dSceneGlbSource(f.host, signal()); if (!f.entry || !f.record) throw Error("실제 record 필요");
    const rights = f.record.rights;
    Object.defineProperty(f.entry, "record", { value: { ...f.record, rights: { licenseName: rights.licenseName, attribution: rights.attribution,
      attributionRequired: rights.attributionRequired, commercialUse: rights.commercialUse, status: rights.status } } });
    expect(() => assertStudioBg3dSceneGlbSourceCurrent(f.host, source, signal())).not.toThrow();
  });

  it("재생 시간은 캡처 순간의 값으로 고정하며 실제 playhead 진행을 stale 문서로 오인하지 않는다", async () => {
    const f = await createSceneGlbFixture(); f.models[0].animation = { ...DEFAULT_STUDIO_BG3D_ANIMATION_PLAYBACK, playing: true }; f.refresh();
    let time = 0.625; f.host.modelAnimationTimeReadersRef = { current: new Map([[f.models[0].id, () => time]]) };
    const source = captureStudioBg3dSceneGlbSource(f.host, signal()); expect(source.animationTimeSecondsByNodeId.get(f.models[0].id)).toBe(0.625);
    time = 0.75; expect(() => assertStudioBg3dSceneGlbSourceCurrent(f.host, source, signal())).not.toThrow();
    expect(source.animationTimeSecondsByNodeId.get(f.models[0].id)).toBe(0.625);
  });

  it("과대·비정규 document와 잘못된 live camera를 손실 있게 보정해 받지 않는다", async () => {
    const f = await createSceneGlbFixture(false), document = f.runtime.current.document;
    f.runtime.current = { ...f.runtime.current, document: { ...document, nodes: Array.from({ length: 513 }, (_, index) => ({ ...document.nodes[0], id: `over-${index}` })) } };
    rejected(() => captureStudioBg3dSceneGlbSource(f.host, signal()), "unsupported-scene");
    f.runtime.current = { ...f.runtime.current, document };
    if (!f.framing.current) throw Error("framing 필요");
    f.framing.current = { ...f.framing.current, view: { ...f.framing.current.view, fovDegrees: Number.NaN } };
    rejected(() => captureStudioBg3dSceneGlbSource(f.host, signal()), "unsupported-scene");
  });
});
