import { describe, expect, it } from "vitest";
import { createDefaultStudioBg3dSceneDocument, normalizeStudioBg3dSceneDocument, serializeStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import { DEFAULT_STUDIO_BG3D_SIX_PASS_LT_SETTINGS } from "../contracts/studio-bg3d-six-pass-settings";
import { minimumStudioProjectFileVersion } from "../studio-project-version";
import { parseStudioProjectFile, serializeStudioProjectFile } from "../studio-project-file";
import { buildStudioProjectDocumentSaveArtifact, parseStudioProjectDocument } from "../studio-project-document";
import { parseStudioAutosave, serializeStudioAutosave, readStudioAutosave, writeStudioLifecycleAutosave, StudioAutosaveUnsupportedVersionError } from "../studio-autosave";

const metadata = { documentId: "six-pass-project", revision: 1, createdAt: "2026-11-04T00:00:00.000Z", updatedAt: "2026-11-04T00:00:00.000Z" };
function fixture() {
  const previous = createDefaultStudioBg3dSceneDocument();
  const scene = normalizeStudioBg3dSceneDocument({ ...previous, output: { ...previous.output, sixPassLt: DEFAULT_STUDIO_BG3D_SIX_PASS_LT_SETTINGS } });
  const pagesList = [{ id: "p1", bg: "#ffffff", bgGrad: null, canvasH: 1080, elements: [{ id: "bg", type: "image", bg3dLtRole: "shadow", bg3dScene: scene }] }];
  return { version: 2, title: "6패스 원고", pagesList };
}

describe("6패스 프로젝트 reader 경계", () => {
  it("6패스가 없는 프로젝트·장면은 기존 버전과 직렬화 바이트를 보존한다", async () => {
    const scene = createDefaultStudioBg3dSceneDocument();
    const sceneBytes = serializeStudioBg3dSceneDocument(scene);
    const project = { ...fixture(), pagesList: [{ ...fixture().pagesList[0], elements: [] }] };
    const artifact = await buildStudioProjectDocumentSaveArtifact(project, metadata);
    expect(artifact.project.version).toBe(2);
    expect(artifact.envelope.format.version).toBe(2);
    const restored = await parseStudioProjectDocument(artifact.canonicalJson);
    expect(restored.project.version).toBe(2);
    expect(serializeStudioBg3dSceneDocument(scene)).toBe(sceneBytes);
    expect(scene.version).toBe(3);
  });

  it("기존 version3 envelope를 reader4가 읽고 다시 저장해도 version3을 유지한다", async () => {
    const source = { ...fixture(), version: 3, pagesList: [{ ...fixture().pagesList[0], elements: [] }] };
    const original = await buildStudioProjectDocumentSaveArtifact(source, metadata);
    expect(original.project.version).toBe(3);
    expect(original.envelope.format.version).toBe(3);
    const restored = await parseStudioProjectDocument(original.canonicalJson);
    const saved = await buildStudioProjectDocumentSaveArtifact(restored.project, metadata);
    expect(saved.envelope.format.version).toBe(3);
    expect(saved.canonicalJson).toBe(original.canonicalJson);
  });

  it("실제 6패스 장면·레이어는 raw·envelope·복구 파일에 version4와 설정을 보존한다", async () => {
    const source = fixture();
    expect(minimumStudioProjectFileVersion(source.pagesList, null)).toBe(4);
    const raw = parseStudioProjectFile(JSON.parse(serializeStudioProjectFile(source)));
    expect(raw.version).toBe(4);
    expect(raw.pagesList[0].elements).toEqual(source.pagesList[0].elements);
    const artifact = await buildStudioProjectDocumentSaveArtifact(source, metadata);
    expect(artifact.envelope.format.version).toBe(4);
    const restored = await parseStudioProjectDocument(artifact.canonicalJson);
    expect(restored.project).toEqual(raw);
    const autosave = { version: 4 as const, savedAt: metadata.updatedAt, pagesList: source.pagesList };
    const bytes = serializeStudioAutosave(autosave);
    expect(JSON.parse(bytes)).toMatchObject({ kind: "studio-six-pass-lt-autosave", version: 4 });
    expect(JSON.parse(bytes).pagesList).toBeUndefined();
    expect(parseStudioAutosave(bytes)?.pagesList).toEqual(source.pagesList);
    const lowerEnvelope = { ...artifact.envelope, format: { ...artifact.envelope.format, version: 3 } };
    await expect(parseStudioProjectDocument(lowerEnvelope)).rejects.toMatchObject({ diagnostic: { code: "INVALID_ENVELOPE" } });
  });

  it("미지원 미래 복구 문서를 빈 문서로 취급하거나 덮어쓰지 않는다", () => {
    const values = new Map<string, string>();
    const future = JSON.stringify({ kind: "studio-six-pass-lt-autosave", version: 5, payload: { version: 5 } });
    values.set("draft", future);
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    expect(() => readStudioAutosave(storage, "draft")).toThrow(StudioAutosaveUnsupportedVersionError);
    writeStudioLifecycleAutosave(storage, "draft", { version: 4, savedAt: metadata.updatedAt, pagesList: fixture().pagesList }, { preservePrimary: false });
    expect(values.get("draft")).toBe(future);
    expect(values.has("draft:lifecycle")).toBe(true);
  });
});
