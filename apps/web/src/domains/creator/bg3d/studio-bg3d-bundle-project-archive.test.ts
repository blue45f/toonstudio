import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashStudioBg3dSixPassBundleManifest } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { createBg3dBundleProjectFixture, createBg3dBundleTestAuthority } from "./studio-bg3d-bundle-project.test-fixture";
import { buildStudioProjectArchive, importStudioProjectArchive, STUDIO_PROJECT_ARCHIVE_LIMITS } from "../studio-project-archive";
import { resolveStudioProjectArchiveLimits } from "../project/archive/studio-project-archive-limits";
import { prepareStudioBg3dSixPassProjectArchiveExport, restoreStudioBg3dSixPassProjectArchiveImport } from "../scene3d/bg3d-six-pass/studio-bg3d-six-pass-project-archive";
import { collectStudioBg3dSixPassProjectBundles } from "../scene3d/bg3d-six-pass/studio-bg3d-six-pass-project-contract";
import { prepareStudioLinked3dPassProjectArchiveExport, restoreStudioLinked3dPassProjectArchiveImport } from "../studio-linked-3d-pass-project-archive";
import { reconcileStudioLinked3dRenderDocumentAfterElementMutation } from "../studio-linked-3d-render-document";
import type { StudioProjectFile } from "../studio-project-file";
import type { StudioLinked3dRenderElementLike } from "../studio-linked-3d-render-document";
import type { StudioShared3dStagePersistedState } from "../studio-shared-3d-stage-collection";
import { parseStudioProjectFile } from "../studio-project-file";
import { buildStudioProjectDocumentSaveArtifact, parseStudioProjectDocument } from "../studio-project-document";
import { parseStudioAutosave, serializeStudioAutosave } from "../studio-autosave";

// 합성 native-interface 회귀의 디코더 이음매다. 실제 브라우저 픽셀 검증은 별도다.
beforeEach(() => vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1, height: 1, close: vi.fn() }))));
afterEach(() => vi.unstubAllGlobals());
const options = { crc32ExecutionMode: "direct-headless" as const };
const metadata = { documentId: "bundle-test", revision: 1, createdAt: "2026-11-05T00:00:00.000Z", updatedAt: "2026-11-05T00:00:00.000Z" };
const exclusive = async <T>(_owner: string, task: () => Promise<T>): Promise<T> => await task();
async function archiveFixture(retainPrevious = false) {
  const f = await createBg3dBundleProjectFixture(retainPrevious);
  const attachments = await prepareStudioLinked3dPassProjectArchiveExport({ project: f.project, authority: f.authority, bundleAuthority: f.authority });
  const built = await buildStudioProjectArchive({ project: f.project, attachments }, options);
  const imported = await importStudioProjectArchive(built.blob);
  return { ...f, attachments, built, imported };
}
describe("6패스 묶음 파일·ZIP·복구 경계", () => {
  it("raw·정본 envelope·별도 autosave wrapper가 retained revision과 사용자 표시 속성을 보존한다", async () => {
    const f = await createBg3dBundleProjectFixture(true);
    const artifact = await buildStudioProjectDocumentSaveArtifact(f.project, metadata);
    expect(artifact.project.version).toBe(5); expect(artifact.envelope.format.version).toBe(5);
    expect((await parseStudioProjectDocument(artifact.canonicalJson)).project).toEqual(f.project);
    const text = serializeStudioAutosave({ version: 5, savedAt: metadata.updatedAt, pagesList: f.project.pagesList });
    expect(JSON.parse(text)).toMatchObject({ kind: "studio-six-pass-bundle-autosave", version: 5 });
    expect(JSON.parse(text).pagesList).toBeUndefined();
    expect(parseStudioAutosave(text)?.pagesList).toEqual(f.project.pagesList);
  });
  it("6PNG+scene와 보존 과거 revision을 자기완결 ZIP으로 복원한 뒤에만 문서를 적용한다", async () => {
    const f = await archiveFixture(true); const target = createBg3dBundleTestAuthority();
    expect(f.built.isSelfContained).toBe(true); expect(f.imported.isSelfContained).toBe(true);
    expect(f.built.manifest.attachments).toHaveLength(13);
    expect(f.imported.project).toEqual(f.project);
    const apply = vi.fn(async (project: StudioProjectFile) => {
      for (const revision of f.state.bundles[0].revisions) {
        for (const hash of [...revision.layers.map((layer) => layer.artifact.contentHash), revision.scene.contentHash, hashStudioBg3dSixPassBundleManifest(revision)]) {
          expect(await target.get(hash, { verify: true })).not.toBeNull();
        }
        expect(await target.ownerRefs(`studio-bg3d-sixpass:page-1:bundle-1:${revision.renderRevisionId}`)).toHaveLength(8);
      }
      expect(project).toEqual(f.project); return "applied";
    });
    expect(await restoreStudioBg3dSixPassProjectArchiveImport({ archive: f.imported, authority: target, runOwnerExclusive: exclusive, apply })).toBe("applied");
    expect(apply).toHaveBeenCalledOnce();
  });
  it("현재 역할 삭제·숨김·불투명도·합성·변형 뒤에도 보존 7본문을 유지한다", async () => {
    const f = await createBg3dBundleProjectFixture();
    for (const elements of [f.project.pagesList[0].elements.slice(2), []]) {
      const page = f.project.pagesList[0];
      const linked3dRender = reconcileStudioLinked3dRenderDocumentAfterElementMutation({ value: page.linked3dRender,
        elements: elements as readonly StudioLinked3dRenderElementLike[], shared3dStage: page.shared3dStage as StudioShared3dStagePersistedState | undefined });
      const project = parseStudioProjectFile({ ...f.project, pagesList: [{ ...page, elements, linked3dRender }] });
      const attachments = await prepareStudioLinked3dPassProjectArchiveExport({ project, authority: f.authority, bundleAuthority: f.authority });
      const imported = await importStudioProjectArchive((await buildStudioProjectArchive({ project, attachments }, options)).blob);
      expect(imported.project.version).toBe(5); expect(imported.project.pagesList[0].elements).toEqual(elements);
      expect(imported.attachments.size).toBe(7); expect(imported.project.pagesList[0].bg3dLtBundles).toEqual(f.state);
    }
  });
  it("기존 제품 archive bridge도 묶음 전용 문서를 감지하고 두 권위 복원 후 한 번 적용한다", async () => {
    const f = await createBg3dBundleProjectFixture(); const legacy = f.authority;
    const attachments = await prepareStudioLinked3dPassProjectArchiveExport({ project: f.project, authority: legacy, bundleAuthority: f.authority });
    const imported = await importStudioProjectArchive((await buildStudioProjectArchive({ project: f.project, attachments }, options)).blob);
    const target = createBg3dBundleTestAuthority(); const apply = vi.fn(() => true);
    await restoreStudioLinked3dPassProjectArchiveImport({ archive: imported, authority: legacy, bundleAuthority: target, runBundleOwnerExclusive: exclusive, apply });
    expect(apply).toHaveBeenCalledOnce(); expect(await target.get(f.manifest.scene.contentHash)).not.toBeNull();
  });
  it("본문 누락·본문 변조·manifest 역할 결박·장면 hash 불일치는 적용 전에 거절한다", async () => {
    const f = await archiveFixture(); const apply = vi.fn(() => true);
    const missing = new Map(f.imported.attachments); missing.delete(f.manifest.layers[0].artifact.contentHash.slice(7));
    await expect(restoreStudioBg3dSixPassProjectArchiveImport({ archive: { ...f.imported, attachments: missing }, authority: createBg3dBundleTestAuthority(), runOwnerExclusive: exclusive, apply })).rejects.toThrow();
    const changed = new Map(f.imported.attachments); const key = f.manifest.layers[0].artifact.contentHash.slice(7); const original = changed.get(key)!;
    changed.set(key, { ...original, blob: new Blob([new Uint8Array(original.blob.size)]) });
    await expect(restoreStudioBg3dSixPassProjectArchiveImport({ archive: { ...f.imported, attachments: changed }, authority: createBg3dBundleTestAuthority(), runOwnerExclusive: exclusive, apply })).rejects.toThrow();
    const elements = f.project.pagesList[0].elements.map((element, index) => index ? element : {
      ...element, bg3dLtBundleReference: { ...element.bg3dLtBundleReference, elementId: "wrong-element" } });
    const corrupt = parseStudioProjectFile({ ...f.project, pagesList: [{ ...f.project.pagesList[0], elements }] });
    await expect(prepareStudioBg3dSixPassProjectArchiveExport({ project: corrupt, authority: f.authority })).rejects.toThrow(/결박/);
    expect(apply).not.toHaveBeenCalled();
  });
  it.each(["inactive-revision", "different-active-revision", "missing-group", "different-group", "removed-group", "merged-mode", "missing-mode", "main-line-reference-removed", "ordinary-source-downgrade", "reused-element-type"])("파일 입장에서 현재 6패스 %s 결박을 거절한다", async (operation) => {
    const f = await createBg3dBundleProjectFixture(true);
    const page = structuredClone(f.project.pagesList[0]);
    const image = page.elements[operation === "main-line-reference-removed" ? page.elements.length - 1 : 0];
    if (operation === "inactive-revision") page.bg3dLtBundles.bundles[0].activeRevisionId = null;
    if (operation === "different-active-revision") page.bg3dLtBundles.bundles[0].activeRevisionId = "rev-1";
    if (operation === "missing-group") Reflect.deleteProperty(image, "groupId");
    if (operation === "different-group") Reflect.set(image, "groupId", "different-group");
    if (operation === "removed-group") Reflect.set(page, "groups", []);
    if (operation === "merged-mode") Reflect.set(image, "bg3dLtRenderMode", "merged");
    if (operation === "missing-mode") Reflect.deleteProperty(image, "bg3dLtRenderMode");
    if (operation === "main-line-reference-removed") Reflect.deleteProperty(image, "bg3dLtBundleReference");
    if (operation === "ordinary-source-downgrade" || operation === "reused-element-type") {
      for (const key of ["bg3dLtBundleReference", "bg3dLtBundleId", "bg3dLtRole", "bg3dLtRenderMode"]) Reflect.deleteProperty(image, key);
      Reflect.set(image, "src", "data:image/png;base64,AA==");
      if (operation === "reused-element-type") Reflect.set(image, "type", "rect");
    }
    const project = { ...f.project, pagesList: [page] };
    await expect(collectStudioBg3dSixPassProjectBundles(project)).rejects.toThrow(/결박/);
    await expect(buildStudioProjectDocumentSaveArtifact(project, metadata)).rejects.toThrow(/결박|레이어 (?:배치|집합)/);
    await expect(parseStudioProjectDocument(JSON.stringify(project))).rejects.toThrow(/결박|레이어 (?:배치|집합)/);
    const get = vi.spyOn(f.authority, "get");
    await expect(prepareStudioLinked3dPassProjectArchiveExport({ project, authority: f.authority, bundleAuthority: f.authority })).rejects.toThrow(/결박/);
    expect(get).not.toHaveBeenCalled();
  });
  it("현재 레이어가 전부 삭제된 undo의 inactive 묶음도 보존 revision으로 저장한다", async () => {
    const f = await createBg3dBundleProjectFixture(true);
    const page = { ...f.project.pagesList[0], elements: [], groups: [], linked3dRender: undefined,
      bg3dLtBundles: { ...f.state, bundles: f.state.bundles.map((bundle) => ({ ...bundle, activeRevisionId: null })) } };
    const project = parseStudioProjectFile({ ...f.project, pagesList: [page] });
    const artifact = await buildStudioProjectDocumentSaveArtifact(project, metadata);
    expect((await parseStudioProjectDocument(artifact.canonicalJson)).project).toEqual(project);
    const attachments = await prepareStudioLinked3dPassProjectArchiveExport({ project, authority: f.authority, bundleAuthority: f.authority });
    expect(attachments).toHaveLength(13);
  });
  it("원고 적용 거부 시 owner 참조를 원상복구하고 성공으로 반환하지 않는다", async () => {
    const f = await archiveFixture(); const target = createBg3dBundleTestAuthority(); const owner = "studio-bg3d-sixpass:page-1:bundle-1:rev-1";
    await expect(restoreStudioBg3dSixPassProjectArchiveImport({ archive: f.imported, authority: target, runOwnerExclusive: exclusive, apply: () => false })).rejects.toThrow(/거부/);
    expect(await target.ownerRefs(owner)).toEqual([]);
  });
  it("새 묶음 v5에만 544/512 MiB 상한을 적용하고 기존 파일 상한은 유지한다", () => {
    expect(resolveStudioProjectArchiveLimits(undefined)).toEqual(STUDIO_PROJECT_ARCHIVE_LIMITS);
    expect(resolveStudioProjectArchiveLimits(undefined, true)).toMatchObject({ maxArchiveBytes: 544 * 1024 * 1024, maxTotalAttachmentBytes: 512 * 1024 * 1024 });
    expect(() => resolveStudioProjectArchiveLimits({ maxArchiveBytes: 280_000_001 })).toThrow();
    expect(() => resolveStudioProjectArchiveLimits({ maxArchiveBytes: 544 * 1024 * 1024 + 1 }, true)).toThrow();
  });
});


it("retained 합계 초과와 마지막 stat 실패는 기존 선화까지 포함해 첫 본문 get 전에 거절한다", async () => {
  const f = await createBg3dBundleProjectFixture(true);
  const get = vi.spyOn(f.authority, "get");
  await expect(prepareStudioLinked3dPassProjectArchiveExport({ project: f.project, authority: f.authority,
    bundleAuthority: f.authority, limits: { maxTotalAttachmentBytes: 1 } })).rejects.toThrow(/합계|한도/);
  expect(get).not.toHaveBeenCalled();
  const original = f.authority.stat.bind(f.authority);
  vi.spyOn(f.authority, "stat").mockImplementation(async (hash) => hash === f.manifest.scene.contentHash ? null : await original(hash));
  await expect(prepareStudioLinked3dPassProjectArchiveExport({ project: f.project, authority: f.authority, bundleAuthority: f.authority })).rejects.toThrow(/영수증/);
  expect(get).not.toHaveBeenCalled();
});
