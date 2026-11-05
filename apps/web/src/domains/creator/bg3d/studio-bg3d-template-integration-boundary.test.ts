import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { readStudioBg3dEditorSource } from "./read-studio-bg3d-editor-source";

const editorSource = readStudioBg3dEditorSource();
const admissionSource = readFileSync(
  new URL("./studio-bg3d-model-runtime-admission.ts", import.meta.url),
  "utf8",
);
// 2026-08-21 intentional change: handleUploadModelFiles and handleDeleteModelFromLibrary moved
// out of StudioBackground3D.tsx into studio-bg3d-editor-model-import-actions.ts (editor split).
// Their markers resolve in that module now; the module tail replaces the old end marker.
const modelImportActionsSource = readFileSync(
  new URL("./studio-bg3d-editor-model-import-actions.ts", import.meta.url),
  "utf8",
);
const measurementTemplateSource = readFileSync(
  new URL("./studio-bg3d-measurement-template.ts", import.meta.url), "utf8",
);
const MODEL_IMPORT_ACTIONS_TAIL =
  "return { handleDeleteModelFromLibrary, handleUploadModelFiles, importModelFiles };";

function sourceBetweenIn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function sourceBetween(startMarker: string, endMarker: string): string {
  return sourceBetweenIn(editorSource, startMarker, endMarker);
}

function expectInOrder(source: string, needles: readonly string[]): void {
  let previous = -1;
  for (const needle of needles) {
    const index = source.indexOf(needle, previous + 1);
    expect(index, `소유권 처리 순서: ${needle}`).toBeGreaterThan(previous); previous = index;
  }
}

describe("Studio BG3D user-template integration boundary", () => {
  it("saves only a lossless canonical runtime adapter document", () => {
    const save = sourceBetween(
      "const handleSaveSceneAsTemplate = async (",
      "const handleDeleteTemplate = async",
    );

    expectInOrder(save, [
      "const snapshot = physicsRuntimeSourceRef.current",
      "if (!hasStudioBg3dTemplateContent(snapshot)) return false",
      "adapted = prepareStudioBg3dTemplateSave({",
      "camera: viewportApiRef.current?.readView() ?? snapshot.document.camera",
      "attachmentByStorageModelId: attachmentByStorageModelIdRef.current",
      "setIsSavingTemplate(true)",
      "await saveBg3dTemplate({",
    ]);
    const lossless = sourceBetweenIn(measurementTemplateSource,
      "function losslessTemplateDocument(", "export function prepareStudioBg3dTemplateSave(");
    expect(lossless).toContain("tryAdaptStudioBg3dRuntimeToDocument(input)");
    expect(lossless).toContain("if (!attempt.ok) rejectTemplate()");
    expect(lossless).toContain("const result = attempt.value");
    expect(lossless).toContain("result.diagnostics.length !== 0");
    expect(lossless).toContain("result.omittedDiagnosticCount !== 0");
    expect(lossless).toContain("result.counts.droppedPrimitives !== 0");
    expect(lossless).toContain("result.counts.droppedCustomModels !== 0");
    expect(measurementTemplateSource).toContain("return losslessTemplateDocument({");
    expect(save).toContain("document: adapted.document");
    expect(save).toContain("setTemplateLibraryNotice(null)");
    expect(save).not.toContain("commercialUse: true");
    expect(save).not.toContain("modelId:");
  });

  it("resolves every attachment by hash and commits hydrated placements only after all checks", () => {
    const apply = sourceBetween(
      "async function applyUserTemplate(",
      "function reportLtUserPresetMutationFailure(",
    );
    const mutationStart = apply.indexOf("runSceneMutation(");
    const instantiate = apply.indexOf("instantiateBg3dTemplateDocument(");
    const hashLookup = apply.indexOf("resolveBg3dModelHash(attachment.hash,");
    const exactMatch = apply.indexOf("attachmentMatchesRecord(attachment, record)");
    const admission = apply.indexOf("await admitAndCacheModel({");
    const stagedBinding = apply.indexOf("attachmentByStorageModelId: nextAttachmentByStorageId");
    const hydration = apply.indexOf("hydrateStudioBg3dDocumentToRuntime({");
    const canonicalCommit = apply.indexOf("replaceCanonicalDocumentState({");

    expect(mutationStart).toBeGreaterThanOrEqual(0);
    expect(instantiate).toBeGreaterThan(mutationStart);
    expect(hashLookup).toBeGreaterThan(instantiate);
    expect(exactMatch).toBeGreaterThan(hashLookup);
    expect(admission).toBeGreaterThan(exactMatch);
    expect(stagedBinding).toBeGreaterThan(admission);
    expect(hydration).toBeGreaterThan(stagedBinding);
    expect(canonicalCommit).toBeGreaterThan(hydration);
    expectInOrder(apply, [
      "assertStudioBg3dTemplateHydration(instantiated.document, hydrated)",
      "const next = prepareStudioBg3dMeasurementTemplateInsertion({",
      "current, template: prepared.templateDocument",
      "insertedPrimitives: prepared.primitives, insertedModels: prepared.customModels",
      "replaceCanonicalDocumentState({",
      "primitives: next.primitives",
      "customModels: next.customModels",
    ]);
    expect(apply).not.toContain("physicsRuntimeSourceRef.current =");
    expect(apply).not.toContain("setPrimitives(nextPrimitives)");
    expect(apply).not.toContain("setCustomModels(nextCustomModels)");
    expect(apply).toContain("throw new Error(\"template-attachment-missing\")");
    expect(apply).toContain('templateFailure.message === "template-attachment-missing"');
    expect(apply).toContain("현재 기기에서 찾을 수 없습니다");
    expect(apply).toContain("모델 라이브러리에서 원본을 다시 가져온 뒤 재시도해 주세요");
    const hydrationGuard = sourceBetweenIn(measurementTemplateSource,
      "export function assertStudioBg3dTemplateHydration(", "export function mergeStudioBg3dTemplateAttachmentMaps(");
    expect(hydrationGuard).toContain("!hydrated.ok || hydrated.diagnostics.length !== 0");
    expect(hydrationGuard).toContain("hydrated.omittedDiagnosticCount !== 0");
    expect(hydrationGuard).toContain("hydrated.counts.droppedPrimitives !== 0");
    expect(hydrationGuard).toContain("hydrated.counts.droppedCustomModels !== 0");
    expect(apply).toContain("if (!committed)");
    expect(apply).toContain("ownedEntry.dispose()");
  });

  it("cleans only cache entries created by this queued template and never live scene entries", () => {
    const cacheAdmission = sourceBetweenIn(
      admissionSource,
      "type StudioBg3dModelAdmissionArgs = {",
      "export function disposeStudioBg3dModelCache(",
    );
    const apply = sourceBetween(
      "async function applyUserTemplate(",
      "function reportLtUserPresetMutationFailure(",
    );

    expect(cacheAdmission).toContain("readonly onCacheEntryCreated?:");
    expect(cacheAdmission).toContain("args: StudioBg3dModelAdmissionArgs,");
    expect(cacheAdmission).toContain("const cacheKey = studioBg3dModelCacheKey(args.record.id, backend)");
    const cacheInsert = cacheAdmission.indexOf("args.cache.set(cacheKey, entry)");
    const creationCallback = cacheAdmission.indexOf("args.onCacheEntryCreated?.(args.record.id, entry)");
    expect(cacheInsert).toBeGreaterThanOrEqual(0);
    expect(creationCallback).toBeGreaterThan(cacheInsert);
    expect(apply).not.toContain("cacheIdsBefore");
    expect(apply).toContain("const templateOwnedCacheEntries = new Map<string, ModelRootCacheEntry>()");
    // 배치 호스트의 타입 있는 콜백과 현재 렌더러·재질 백엔드 전달을 함께 검증한다.
    expect(apply).toContain("onCacheEntryCreated: (storageId: string, cacheEntry: ModelRootCacheEntry) =>");
    expect(apply).toContain("renderer: modelRenderer, materialBackend");
    expect(apply).toContain("physicsRuntimeSourceRef.current.customModels.map((model: BgCustomModelInstance) => model.modelId)");
    expect(apply).toContain("if (liveStorageIds.has(storageId)) continue;");
    expectInOrder(apply, [
      "if (!R.isStudioBg3dOwnedModelCacheEntry(modelRootCacheRef.current, storageId, ownedEntry)) continue;",
      "ownedEntry.dispose()", "R.deleteStudioBg3dOwnedModelCacheEntry(modelRootCacheRef.current, storageId, ownedEntry)",
    ]);
    expect(apply).toContain("if (!committed) cleanupUncommittedTemplateCache();");
  });

  it("does not let a slow upload cleanup dispose cache committed by an earlier scene mutation", () => {
    const upload = sourceBetweenIn(
      modelImportActionsSource,
      "async function handleUploadModelFiles(",
      "async function handleDeleteModelFromLibrary(",
    );

    expect(upload).not.toContain("cacheIdsBefore");
    expect(upload).not.toContain("for (const [id, entry] of modelRootCacheRef.current)");
    expect(upload).toContain("const uploadOwnedCacheEntries = new Map<string, ModelRootCacheEntry>()");
    expect(upload).toContain("onCacheEntryCreated: (storageId, cacheEntry) =>");
    expect(upload).toContain("physicsRuntimeSourceRef.current.customModels.map((model) => model.modelId)");
    expect(upload).toContain("if (liveStorageIds.has(storageId)) continue;");
    expectInOrder(upload, [
      "if (!isStudioBg3dOwnedModelCacheEntry(modelRootCacheRef.current, storageId, ownedEntry)) continue;",
      "ownedEntry.dispose()", "deleteStudioBg3dOwnedModelCacheEntry(modelRootCacheRef.current, storageId, ownedEntry)",
    ]);
    expect(upload).toContain("if (!uploadCommitted) cleanupUncommittedUploadCache();");
  });

  it("fences every user-dismiss path while persistent model deletion is active", () => {
    const deletion = sourceBetweenIn(
      modelImportActionsSource,
      "async function handleDeleteModelFromLibrary(",
      MODEL_IMPORT_ACTIONS_TAIL,
    );
    const dismiss = sourceBetween(
      "function requestUserClose()",
      "async function handleSaveToLibrary()",
    );

    expect(deletion.indexOf("destructiveMutationGuardRef.current.begin()")).toBeLessThan(
      deletion.indexOf("preflightAndDeleteStudioBg3dPersistedModel({"),
    );
    expect(deletion.indexOf("deleteStoredBg3dModel(storageModelId, { signal: lease.signal })")).toBeLessThan(
      deletion.indexOf("destructiveMutationGuardRef.current.finish(destructiveLease)"),
    );
    expect(dismiss).toContain("if (destructiveMutationGuardRef.current.blocksClose) return;");
    expect(editorSource).toContain("aria-disabled={deletingModelId !== null || undefined}");
  });
});
