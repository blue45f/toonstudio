import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeStudioVrmExportGlb } from "../vrm/studio-vrm-export-glb-container";
import { exportStudioBg3dCurrentSceneGlb } from "./studio-bg3d-scene-glb-command";
import { StudioBg3dSceneGlbError } from "./studio-bg3d-scene-glb-source";
import { createSceneGlbFixture, deferredSceneGlb, disposeSceneGlbFixtures, emptySceneGlbFixtureBundleCatalog } from "./studio-bg3d-scene-glb.test-fixture";
import { resetStudioBg3dBundleThemePacksCache } from "./studio-bg3d-bundle-theme-packs";

import type { StudioBg3dSceneGlbArtifact } from "./studio-bg3d-scene-glb-artifact";
import type { StudioBg3dSceneGlbDownloadDependencies } from "./studio-bg3d-scene-glb-command";
import { readStudioBg3dEffectiveModelSourceRestriction } from "./studio-bg3d-model-source-restriction";

// 무거운 artifact 준비만 seam이다. source·최종 fence·Blob·명령 결과와 정리는 실제 구현이다.
const prepare = vi.hoisted(() => vi.fn<typeof import("./studio-bg3d-scene-glb-artifact")["createStudioBg3dSceneGlbArtifact"]>());
vi.mock("./studio-bg3d-scene-glb-artifact", () => ({ createStudioBg3dSceneGlbArtifact: prepare }));
function artifact(): StudioBg3dSceneGlbArtifact {
  return { bytes: writeStudioVrmExportGlb({ json: { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [] }] } }),
    fileName: "현재 장면.glb", contentHash: `sha256:${"a".repeat(64)}`, exportedNodeCount: 1, hiddenNodeCount: 0 };
}
function dependencies() {
  const createObjectUrl = vi.fn<StudioBg3dSceneGlbDownloadDependencies["createObjectUrl"]>(() => "blob:scene-snapshot");
  const revokeObjectUrl = vi.fn<StudioBg3dSceneGlbDownloadDependencies["revokeObjectUrl"]>();
  const triggerDownload = vi.fn<StudioBg3dSceneGlbDownloadDependencies["triggerDownload"]>();
  const scheduleRevoke = vi.fn<StudioBg3dSceneGlbDownloadDependencies["scheduleRevoke"]>();
  return { prepare, createObjectUrl, revokeObjectUrl, triggerDownload, scheduleRevoke };
}
const request = (signal = new AbortController().signal) => ({ name: "현재 장면", signal });
beforeEach(() => {
  resetStudioBg3dBundleThemePacksCache();
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response(JSON.stringify(emptySceneGlbFixtureBundleCatalog()))));
  prepare.mockReset().mockImplementation(async (_source, options) => { options.assertCurrent(); return artifact(); });
});
afterEach(() => { disposeSceneGlbFixtures(); resetStudioBg3dBundleThemePacksCache(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("현재 장면 GLB 다운로드 명령", () => {
  it.each(["service-only", "unknown"] as const)("표시 모델의 실제 %s 제한은 artifact·URL·download 전에 전체 요청을 거부한다", async (modelFileExport) => {
    const f = await createSceneGlbFixture();
    if (!f.record || !f.entry) throw Error("실제 검증 모델 fixture 필요");
    const record = { ...f.record, sourceRestriction: { ...readStudioBg3dEffectiveModelSourceRestriction(f.record), modelFileExport } };
    f.setStoredRecord(record);
    f.cache.set(record.id, { ...f.entry, record });
    const deps = { ...dependencies(), provenanceAuthority: f.authority };
    const result = await exportStudioBg3dCurrentSceneGlb(f.host, request(), deps);
    expect(result).toMatchObject({ ok: false, code: modelFileExport === "service-only" ? "rights-restricted" : "rights-unavailable" });
    expect(deps.prepare).not.toHaveBeenCalled();
    expect(deps.createObjectUrl).not.toHaveBeenCalled(); expect(deps.triggerDownload).not.toHaveBeenCalled();
    expect(f.commit).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled(); expect(f.entry.dispose).not.toHaveBeenCalled();
  });

  it("artifact 준비 중 durable 출처 제한이 바뀌면 이전 허가로 Blob·download를 만들지 않는다", async () => {
    const f = await createSceneGlbFixture();
    if (!f.record) throw Error("실제 검증 모델 fixture 필요");
    const gate = deferredSceneGlb<StudioBg3dSceneGlbArtifact>(), started = deferredSceneGlb<void>();
    const deps = { ...dependencies(), provenanceAuthority: f.authority };
    prepare.mockImplementation(async () => { started.resolve(undefined); return gate.promise; });
    const pending = exportStudioBg3dCurrentSceneGlb(f.host, request(), deps);
    await started.promise;
    f.setStoredRecord({ ...f.record, sourceRestriction: { ...readStudioBg3dEffectiveModelSourceRestriction(f.record), modelFileExport: "service-only" } });
    gate.resolve(artifact());
    expect(await pending).toMatchObject({ ok: false, code: "source-changed" });
    expect(deps.prepare).toHaveBeenCalledOnce(); expect(deps.createObjectUrl).not.toHaveBeenCalled(); expect(deps.triggerDownload).not.toHaveBeenCalled();
    expect(f.commit).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled();
  });

  it("클릭 시점의 실제 source를 준비에 넘기고 한 Blob을 한 번 다운로드하며 다음 task까지 URL을 유지한다", async () => {
    const f = await createSceneGlbFixture(false), deps = dependencies(), input = request();
    const runtime = f.runtime.current, document = structuredClone(runtime.document);
    const result = await exportStudioBg3dCurrentSceneGlb(f.host, input, deps);
    expect(result).toMatchObject({ ok: true, fileName: "현재 장면.glb", contentHash: artifact().contentHash, byteSize: artifact().bytes.byteLength, exportedNodeCount: 1 });
    expect(prepare).toHaveBeenCalledOnce(); expect(prepare.mock.calls[0][0].document.camera.position).toEqual([3, 4, 8]);
    expect(prepare.mock.calls[0][1]).toMatchObject({ name: input.name, signal: input.signal });
    expect(deps.createObjectUrl).toHaveBeenCalledOnce(); expect(deps.triggerDownload).toHaveBeenCalledExactlyOnceWith("blob:scene-snapshot", "현재 장면.glb");
    const blob = deps.createObjectUrl.mock.calls[0][0]; expect(blob.type).toBe("model/gltf-binary");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(artifact().bytes);
    expect(deps.revokeObjectUrl).not.toHaveBeenCalled(); expect(deps.scheduleRevoke).toHaveBeenCalledOnce();
    deps.scheduleRevoke.mock.calls[0][0](); expect(deps.revokeObjectUrl).toHaveBeenCalledExactlyOnceWith("blob:scene-snapshot");
    expect(f.runtime.current).toBe(runtime); expect(f.runtime.current.document).toEqual(document);
    expect(f.commit).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled(); expect(f.cache.size).toBe(0);
  });

  it.each(["scene", "framing", "unmount", "cancel"])("준비 대기 중 %s 변경은 파일·URL·history 없이 종료한다", async (kind) => {
    const f = await createSceneGlbFixture(false), deps = dependencies(), gate = deferredSceneGlb<StudioBg3dSceneGlbArtifact>(), controller = new AbortController();
    prepare.mockReturnValue(gate.promise);
    const pending = exportStudioBg3dCurrentSceneGlb(f.host, request(controller.signal), deps);
    expect(prepare).toHaveBeenCalledOnce();
    if (kind === "scene") f.runtime.current = { ...f.runtime.current, document: { ...f.runtime.current.document, meta: { name: "변경" } } };
    if (kind === "framing" && f.framing.current) f.framing.current = { ...f.framing.current, viewportAspect: 1 };
    if (kind === "unmount") f.host.open = false;
    if (kind === "cancel") controller.abort();
    gate.resolve(artifact());
    expect(await pending).toMatchObject({ ok: false, code: kind === "cancel" ? "aborted" : "source-changed" });
    expect(deps.createObjectUrl).not.toHaveBeenCalled(); expect(deps.triggerDownload).not.toHaveBeenCalled(); expect(deps.revokeObjectUrl).not.toHaveBeenCalled();
    expect(f.commit).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled();
  });

  it("URL 생성 직후에도 source를 다시 확인하고 새 URL만 즉시 정리한다", async () => {
    const f = await createSceneGlbFixture(false), deps = dependencies();
    deps.createObjectUrl.mockImplementation(() => { f.host.open = false; return "blob:owned-but-stale"; });
    expect(await exportStudioBg3dCurrentSceneGlb(f.host, request(), deps)).toMatchObject({ ok: false, code: "source-changed" });
    expect(deps.triggerDownload).not.toHaveBeenCalled(); expect(deps.scheduleRevoke).not.toHaveBeenCalled();
    expect(deps.revokeObjectUrl).toHaveBeenCalledExactlyOnceWith("blob:owned-but-stale");
  });

  it("Blob은 준비 결과의 bytes를 복사하여 이후 원본 배열 변경과 격리한다", async () => {
    const f = await createSceneGlbFixture(false), deps = dependencies(), prepared = artifact(), original = Uint8Array.from(prepared.bytes);
    prepare.mockResolvedValue(prepared);
    deps.createObjectUrl.mockImplementation(() => { prepared.bytes.fill(0); return "blob:copied"; });
    expect((await exportStudioBg3dCurrentSceneGlb(f.host, request(), deps)).ok).toBe(true);
    expect(new Uint8Array(await deps.createObjectUrl.mock.calls[0][0].arrayBuffer())).toEqual(original);
  });

  it.each(["prepare", "url", "click"])("%s 오류는 typed 실패이며 미완성 다운로드를 남기지 않는다", async (kind) => {
    const f = await createSceneGlbFixture(false), deps = dependencies();
    if (kind === "prepare") prepare.mockRejectedValue(new StudioBg3dSceneGlbError("asset-invalid", "원본 검증 실패"));
    if (kind === "url") deps.createObjectUrl.mockImplementation(() => { throw Error("URL 생성 실패"); });
    if (kind === "click") deps.triggerDownload.mockImplementation(() => { throw Error("파일 저장 실패"); });
    expect(await exportStudioBg3dCurrentSceneGlb(f.host, request(), deps)).toMatchObject({ ok: false, code: kind === "prepare" ? "asset-invalid" : "download-failed" });
    expect(deps.scheduleRevoke).not.toHaveBeenCalled(); expect(deps.revokeObjectUrl).toHaveBeenCalledTimes(kind === "click" ? 1 : 0);
    expect(f.commit).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled();
  });

  it("준비 전 취소·부재 상태는 무거운 준비와 URL을 시작하지 않는다", async () => {
    const f = await createSceneGlbFixture(false), deps = dependencies(), controller = new AbortController(); controller.abort();
    expect(await exportStudioBg3dCurrentSceneGlb(f.host, request(controller.signal), deps)).toMatchObject({ ok: false, code: "aborted" });
    f.host.hasPendingClone = true;
    expect(await exportStudioBg3dCurrentSceneGlb(f.host, request(), deps)).toMatchObject({ ok: false, code: "unavailable" });
    expect(prepare).not.toHaveBeenCalled(); expect(deps.createObjectUrl).not.toHaveBeenCalled();
  });

  it("알 수 없는 준비 오류를 성공으로 바꾸지 않으며 다음 명시적 재시도는 한 번 저장한다", async () => {
    const f = await createSceneGlbFixture(false), deps = dependencies(); prepare.mockRejectedValueOnce(Error("내보내기 중단"));
    expect(await exportStudioBg3dCurrentSceneGlb(f.host, request(), deps)).toMatchObject({ ok: false, code: "export-failed" });
    expect((await exportStudioBg3dCurrentSceneGlb(f.host, request(), deps)).ok).toBe(true); expect(deps.triggerDownload).toHaveBeenCalledOnce();
  });

  it("지연 URL 정리 예약이 실패하면 즉시 해제하되 완료한 다운로드를 실패로 되돌리지 않는다", async () => {
    const f = await createSceneGlbFixture(false), deps = dependencies(); deps.scheduleRevoke.mockImplementation(() => { throw Error("timer unavailable"); });
    expect((await exportStudioBg3dCurrentSceneGlb(f.host, request(), deps)).ok).toBe(true);
    expect(deps.revokeObjectUrl).toHaveBeenCalledExactlyOnceWith("blob:scene-snapshot");
  });

  it("정리 API가 예외를 내도 완료한 파일이나 원래 typed 실패를 promise rejection으로 덮지 않는다", async () => {
    const f = await createSceneGlbFixture(false), deps = dependencies();
    deps.triggerDownload.mockImplementation(() => { throw Error("click failed"); });
    deps.revokeObjectUrl.mockImplementation(() => { throw Error("revoke failed"); });
    await expect(exportStudioBg3dCurrentSceneGlb(f.host, request(), deps)).resolves.toMatchObject({ ok: false, code: "download-failed" });
  });
});
