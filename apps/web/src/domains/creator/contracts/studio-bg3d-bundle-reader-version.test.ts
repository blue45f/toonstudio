import { describe, expect, it } from "vitest";

import { minimumStudioProjectFileVersion, resolveStudioProjectFileVersion } from "../studio-project-version";
import { parseStudioAutosave, serializeStudioAutosave, assertStudioAutosaveReaderSupported } from "../studio-autosave";
import { buildStudioProjectDocumentSaveArtifact, parseStudioProjectDocument } from "../studio-project-document";
import { parseStudioProjectFile } from "../studio-project-file";

const emptyPages = [{ id: "page-1", elements: [], bg: "#ffffff", bgGrad: null, canvasH: 1080 }];
const metadata = { documentId: "bundle-reader", revision: 1, createdAt: "2026-11-05T00:00:00.000Z", updatedAt: "2026-11-05T00:00:00.000Z" };

describe("6패스 묶음의 조건부 project reader", () => {
  it("활성 요소를 지웠어도 보존 revision 표식이 있으면 reader5를 요구한다", () => {
    // reader 탐지는 검증 전에도 새 계약을 낮은 버전으로 쓰지 않는 경계다. 본문 검증과 별도다.
    const bg3dLtBundles = { contract: "toonstudio.bg3d-sixpass-bundles.v1", bundles: [{ activeRevisionId: null, revisions: [{}] }] };
    expect(minimumStudioProjectFileVersion([{ ...emptyPages[0], bg3dLtBundles }], undefined)).toBe(5);
    expect(minimumStudioProjectFileVersion(emptyPages, { bg3dLtBundles })).toBe(5);
    expect(minimumStudioProjectFileVersion([{ ...emptyPages[0], bg3dLtBundles: { ...bg3dLtBundles, bundles: [] } }], undefined)).toBe(2);
    expect(resolveStudioProjectFileVersion(emptyPages, undefined, 5)).toBe(5);
  });

  it.each([2, 3, 4] as const)("기존 version%d envelope는 재저장 바이트와 reader 버전을 유지한다", async (version) => {
    const original = await buildStudioProjectDocumentSaveArtifact({ version, pagesList: emptyPages }, metadata);
    const loaded = await parseStudioProjectDocument(original.canonicalJson);
    const saved = await buildStudioProjectDocumentSaveArtifact(loaded.project, metadata);
    expect(saved.envelope.format.version).toBe(version);
    expect(saved.canonicalJson).toBe(original.canonicalJson);
  });

  it("이미 reader5로 저장한 파일·envelope·복구는 빈 상태에서도 reader를 낮추지 않는다", async () => {
    const source = { version: 5, pagesList: emptyPages };
    expect(parseStudioProjectFile(source).version).toBe(5);
    const artifact = await buildStudioProjectDocumentSaveArtifact(source, metadata);
    expect(artifact.envelope.format.version).toBe(5);
    expect((await parseStudioProjectDocument(artifact.canonicalJson)).project.version).toBe(5);
    const raw = serializeStudioAutosave({ version: 5, savedAt: metadata.updatedAt, pagesList: emptyPages });
    expect(JSON.parse(raw)).toMatchObject({ kind: "studio-six-pass-bundle-autosave", version: 5 });
    expect(JSON.parse(raw).pagesList).toBeUndefined();
    expect(parseStudioAutosave(raw)?.version).toBe(5);
  });

  it("기존 wrapper의 모르는 버전과 새 wrapper의 미래 버전은 거부한다", () => {
    const wrongOldWrapper = JSON.stringify({ kind: "studio-six-pass-lt-autosave", version: 5, payload: { version: 5, pagesList: emptyPages } });
    const futureWrapper = JSON.stringify({ kind: "studio-six-pass-bundle-autosave", version: 6, payload: { version: 6, pagesList: emptyPages } });
    expect(() => assertStudioAutosaveReaderSupported(wrongOldWrapper)).toThrow(/업데이트/);
    expect(() => assertStudioAutosaveReaderSupported(futureWrapper)).toThrow(/업데이트/);
    expect(parseStudioAutosave(wrongOldWrapper)).toBeNull();
    expect(parseStudioAutosave(futureWrapper)).toBeNull();
  });
});


it("고아 새 locator를 구 reader 파일·자동저장으로 쓰지 않고 원본 보존 대상으로 처리한다", () => {
  const pagesList = [{ ...emptyPages[0], elements: [{ id: "orphan", type: "image", src: `bg3d-lt-artifact://sha256/${"a".repeat(64)}` }] }];
  expect(() => parseStudioProjectFile({ version: 2, pagesList })).toThrow(/v5 manifest/);
  expect(() => serializeStudioAutosave({ version: 2, savedAt: metadata.updatedAt, pagesList })).toThrow(/복구 계약/);
  expect(() => assertStudioAutosaveReaderSupported(JSON.stringify({ version: 2, savedAt: metadata.updatedAt, pagesList }))).toThrow();
});
