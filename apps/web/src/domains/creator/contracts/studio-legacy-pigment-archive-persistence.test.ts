import { describe, expect, it } from "vitest";
import { createBrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6MaterialReceipt } from "../brush-lab/brush-studio-v6-material-receipt";
import { parseStudioProjectFile, serializeStudioProjectFile } from "../studio-project-file";
import { buildStudioProjectDocumentSaveArtifact, parseStudioProjectDocument } from "../studio-project-document";
import { buildStudioProjectArchive, importStudioProjectArchive } from "../studio-project-archive";
import { assertStudioAutosaveReaderSupported, parseStudioAutosave, serializeStudioAutosave, serializeStudioAutosaveBackup, type StudioAutosavePayload } from "../studio-autosave";
import { hasStudioSixPassBundleProjectContent, minimumStudioProjectFileVersion } from "../studio-project-version";

const metadata = { documentId: "archive-test", revision: 1, createdAt: "2026-11-05T00:00:00.000Z", updatedAt: "2026-11-05T00:00:00.000Z" };
function archive() {
  const material = createBrushStudioV6MaterialReceipt(createBrushStudioV6Program("mixbox-pigment-spray"));
  return { id: "archive-id", type: "draw", kind: "freehand", points: [1, 2, 3, 4], stroke: "#123456", strokeWidth: 3,
    hidden: true, groupId: "archive-group", clipBelow: true, name: "기존 이름", originalOpaque: { value: ["원본", 7] },
    legacyPigmentArchive: { version: 1, sourceElementId: "source-id", sourceIndex: 2, sourceHidden: false, sourceGroupId: "original-group" },
    brushEnginePrograms: { version: 1, material: { version: 1, seed: material.seed, slots: material.slots, input: material.input, tuning: material.tuning } } };
}
function project(elements: unknown[]) {
  return { version: 2, title: "원본 보관 프로젝트", pagesList: [{ id: "page-1", elements,
    groups: [{ id: "archive-group", name: "보관 원본", hidden: true, locked: true }], bg: "#fff", bgGrad: null, canvasH: 900 }] };
}

describe("외부 혼색 원본의 파일·ZIP·자동복구 보존", () => {
  it("원본 body·숨김·출처를 raw JSON과 정본 envelope v6으로 보존한다", async () => {
    const original = archive(), source = project([original]), before = JSON.stringify(source);
    const saved = serializeStudioProjectFile(source), parsed = parseStudioProjectFile(JSON.parse(saved));
    expect(parsed.version).toBe(6);
    expect(parsed.pagesList[0].elements).toEqual([original]);
    expect(JSON.stringify(parsed.pagesList[0].elements[0])).toBe(JSON.stringify(original));
    expect(serializeStudioProjectFile(parsed)).toBe(saved);
    const artifact = await buildStudioProjectDocumentSaveArtifact(source, metadata);
    expect(artifact.envelope.format.version).toBe(6);
    expect((await parseStudioProjectDocument(artifact.canonicalJson)).project).toEqual(artifact.project);
    expect(JSON.stringify(source)).toBe(before);
    const downgrade = { ...artifact.envelope, format: { ...artifact.envelope.format, version: 5 } };
    await expect(parseStudioProjectDocument(downgrade)).rejects.toMatchObject({ diagnostic: { code: "INVALID_ENVELOPE" }, preservedEnvelope: downgrade });
  });
  it("기존 PSD·힌트 마스크·3D 보정 필드를 보관 v6 JSON/envelope에서 삭제하거나 활성 3D 참조로 해석하지 않는다", async () => {
    const fields = {
      psdGroupId: "original-psd-folder", psdRasterSourceId: "original-psd-layer",
      psdSource: { version: 1, hash: `sha256:${"a".repeat(64)}`, name: "원본.psd", bytes: 26 },
      psdFolderPath: [{ id: "original-psd-folder", name: "원래 폴더" }],
      colorizeMask: { hints: [], params: { gapCloseHintPx: 8, edgeDetectionPx: 0, cleanupPercent: 30, limitToLayerBounds: true }, bakedRevision: null },
      colorizeMaskEnabled: false,
      linked3dCorrection: { kind: "toonstudio.linked-3d-correction", version: 1, bundleId: "original-3d-bundle", pass: "line", sourcePassRevision: 1,
        sourceHash: `sha256:${"a".repeat(64)}`, baseGeometryHash: `sha256:${"b".repeat(64)}`, topologyHash: `sha256:${"c".repeat(64)}`,
        objectIdentityHash: `sha256:${"d".repeat(64)}`, basePassRootHash: `sha256:${"e".repeat(64)}` },
    };
    const original = { ...archive(), ...fields }, source = project([original]);
    const saved = serializeStudioProjectFile(source);
    expect(parseStudioProjectFile(JSON.parse(saved)).pagesList[0].elements).toEqual([original]);
    const artifact = await buildStudioProjectDocumentSaveArtifact(source, metadata);
    expect((await parseStudioProjectDocument(artifact.canonicalJson)).project.pagesList[0].elements).toEqual([original]);
    const damaged = { ...original, linked3dCorrection: { ...fields.linked3dCorrection, version: 99 } };
    expect(() => parseStudioProjectFile(project([damaged]))).toThrow("3D 보정 출처");
  });
  it("실제 자기완결 ZIP을 다시 열어 외부 원본의 모든 필드를 보존한다", async () => {
    const original = archive(), source = project([original]);
    const built = await buildStudioProjectArchive({ project: source }, { crc32ExecutionMode: "direct-headless" });
    const loaded = await importStudioProjectArchive(built.blob);
    expect(built.canonicalProject.version).toBe(6);
    expect(loaded.project.pagesList[0].elements).toEqual([original]);
    expect(loaded.project.pagesList[0].groups).toEqual(source.pagesList[0].groups);
    expect(loaded.isSelfContained).toBe(true);
  });
  it("복구 wrapper v6·백업은 원본을 보존하고 현재 reader는 미래 v7 쓰기를 막는다", () => {
    const original = archive();
    const payload: StudioAutosavePayload = { ...project([original]), version: 2, savedAt: metadata.updatedAt };
    const text = serializeStudioAutosave(payload), wrapped = JSON.parse(text);
    expect(wrapped).toMatchObject({ kind: "studio-legacy-pigment-archive-autosave", version: 6 });
    expect(wrapped.pagesList).toBeUndefined();
    expect(parseStudioAutosave(text)?.pagesList[0].elements).toEqual([original]);
    expect(parseStudioProjectFile(JSON.parse(serializeStudioAutosaveBackup(payload))).pagesList[0].elements).toEqual([original]);
    expect(() => assertStudioAutosaveReaderSupported(text)).not.toThrow();
    expect(() => assertStudioAutosaveReaderSupported(JSON.stringify({ ...wrapped, version: 7 }))).toThrow();
    expect(parseStudioAutosave(JSON.stringify({ ...wrapped, version: 7 }))).toBeNull();
  });
  it("문서 마스터도 원본 출처를 보존하고 일반 문서의 저장 버전은 유지한다", () => {
    const original = archive(); Reflect.deleteProperty(original, "groupId");
    const source = { ...project([]), master: { enabled: true, elements: [original] } };
    const saved = parseStudioProjectFile(source);
    expect(saved.version).toBe(6); expect(saved.master).toEqual(source.master);
    expect(parseStudioProjectFile(project([])).version).toBe(2);
    expect(parseStudioProjectFile({ ...project([]), version: 5 }).version).toBe(5);
    expect(parseStudioProjectFile({ ...project([]), version: 6 }).version).toBe(6);
    expect(hasStudioSixPassBundleProjectContent(source.pagesList, source.master)).toBe(false);
  });
  it("다른 feature의 전용 안전 한도를 archive v6만으로 올리지 않으며 복합문서도 감지한다", () => {
    const page = { ...project([archive()]).pagesList[0], bg3dLtBundles: { contract: "toonstudio.bg3d-sixpass-bundles.v1", bundles: [{ revisions: [{}] }] } };
    expect(minimumStudioProjectFileVersion([page], null)).toBe(6);
    expect(hasStudioSixPassBundleProjectContent([page], null)).toBe(true);
  });
  it.each(["unknown-version", "extra-key", "visible", "wrong-type", "source-index"])("손상된 원본 보관 metadata는 import와 복구에서 필드 삭제 없이 거부한다: %s", (change) => {
    const original = archive();
    if (change === "unknown-version") Reflect.set(original.legacyPigmentArchive, "version", 2);
    if (change === "extra-key") Reflect.set(original.legacyPigmentArchive, "future", true);
    if (change === "visible") original.hidden = false;
    if (change === "wrong-type") original.type = "image";
    if (change === "source-index") original.legacyPigmentArchive.sourceIndex = -1;
    const source = project([original]);
    expect(() => parseStudioProjectFile(source)).toThrow("보관 출처");
    expect(parseStudioAutosave(JSON.stringify({ ...source, savedAt: metadata.updatedAt }))).toBeNull();
    expect(() => serializeStudioAutosave({ ...source, version: 2, savedAt: metadata.updatedAt })).toThrow("보관 출처");
  });
});
