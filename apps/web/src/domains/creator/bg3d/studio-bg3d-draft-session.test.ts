import { afterEach, describe, expect, it } from "vitest";

import { createPrimitive } from "../studio-background-3d-primitives";

import {
  clearStudioBg3dUnappliedDraft,
  persistStudioBg3dUnappliedDraftFromHost,
  readStudioBg3dUnappliedDraft,
  resetStudioBg3dUnappliedDraftsForTests,
  resolveStudioBg3dPropsWithUnappliedDraft,
} from "./studio-bg3d-draft-session";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";
import { hydrateStudioBg3dDocumentToRuntime } from "./studio-bg3d-scene-runtime";

afterEach(() => {
  resetStudioBg3dUnappliedDraftsForTests();
});

describe("studio-bg3d-draft-session", () => {
  it("2D 원고로 복귀할 때 미적용 insert 초안과 LT 미리보기 상태를 보존하고 재진입 시 동일 참조로 복원한다", () => {
    const scopeKey = "local-dummy-page-1:insert";
    const desk = createPrimitive("box", 0);
    const modifiedDoc = {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      output: {
        ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output,
        tone: {
          ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.tone,
          enabled: true,
        },
      },
    };

    persistStudioBg3dUnappliedDraftFromHost({
      unappliedDraftEligible: true,
      sharedStageSessionScopeKey: scopeKey,
      primitives: [desk],
      customModels: [],
      lineArtPreview: true,
      isRestoringScene: false,
      modelRenderer: { id: "dummy-webgl2" },
      sceneBaseDocument: modifiedDoc,
    });

    const firstRead = readStudioBg3dUnappliedDraft(scopeKey);
    const secondRead = readStudioBg3dUnappliedDraft(scopeKey);
    expect(firstRead).not.toBeNull();
    expect(secondRead).toBe(firstRead);
    expect(firstRead?.lineArtPreview).toBe(true);

    const reopened = resolveStudioBg3dPropsWithUnappliedDraft({
      open: true,
      operation: "insert" as const,
      sharedStageSessionScopeKey: scopeKey,
    });
    expect(reopened.unappliedDraftEligible).toBe(true);
    expect(reopened.restoredDraft).toBe(firstRead);
    expect((reopened.effectiveProps as { initialScene?: unknown }).initialScene).toBe(
      firstRead?.document,
    );

    const hydrated = hydrateStudioBg3dDocumentToRuntime({
      document: firstRead!.document,
      storageModelIdByAttachmentId: new Map(),
    });
    expect(hydrated.primitives).toHaveLength(1);
    expect(hydrated.primitives[0]?.kind).toBe("box");
  });

  it("렌더러가 시작되지 못했거나 장면 복원 중일 때 닫으면 기존 미적용 초안을 지우지 않는다", () => {
    const scopeKey = "local-dummy-page-2:insert";
    persistStudioBg3dUnappliedDraftFromHost({
      unappliedDraftEligible: true,
      sharedStageSessionScopeKey: scopeKey,
      primitives: [createPrimitive("cylinder", 0)],
      customModels: [],
      lineArtPreview: false,
      isRestoringScene: false,
      modelRenderer: { id: "dummy-webgl2" },
      sceneBaseDocument: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    });

    // GPU 오류(modelRenderer === null)로 초기 수화 전에 바로 2D 복귀한 경우
    persistStudioBg3dUnappliedDraftFromHost({
      unappliedDraftEligible: true,
      sharedStageSessionScopeKey: scopeKey,
      primitives: [],
      customModels: [],
      lineArtPreview: false,
      isRestoringScene: false,
      modelRenderer: null,
      sceneBaseDocument: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    });
    expect(readStudioBg3dUnappliedDraft(scopeKey)).not.toBeNull();

    // 정상 렌더러 위에서 사용자가 모든 오브젝트를 비운 경우에만 초안을 정리한다
    persistStudioBg3dUnappliedDraftFromHost({
      unappliedDraftEligible: true,
      sharedStageSessionScopeKey: scopeKey,
      primitives: [],
      customModels: [],
      lineArtPreview: false,
      isRestoringScene: false,
      modelRenderer: { id: "dummy-webgl2" },
      sceneBaseDocument: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    });
    expect(readStudioBg3dUnappliedDraft(scopeKey)).toBeNull();
  });

  it("명시적 적용(clear) 이후와 기존 레이어 update 모드에서는 미적용 초안을 주입하지 않는다", () => {
    const scopeKey = "local-dummy-page-3:insert";
    persistStudioBg3dUnappliedDraftFromHost({
      unappliedDraftEligible: true,
      sharedStageSessionScopeKey: scopeKey,
      primitives: [createPrimitive("sphere", 0)],
      customModels: [],
      lineArtPreview: true,
      isRestoringScene: false,
      modelRenderer: { id: "dummy-webgl2" },
      sceneBaseDocument: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    });

    const furnitureInsert = resolveStudioBg3dPropsWithUnappliedDraft({
      open: true, operation: "insert", sharedStageSessionScopeKey: scopeKey, seedModelSourceId: "chair_v8",
    });
    expect(furnitureInsert.restoredDraft).toBeNull();
    expect(furnitureInsert.unappliedDraftEligible).toBe(false);

    const updateMode = resolveStudioBg3dPropsWithUnappliedDraft({
      open: true,
      operation: "update" as const,
      sharedStageSessionScopeKey: scopeKey,
    });
    expect(updateMode.unappliedDraftEligible).toBe(false);
    expect(updateMode.restoredDraft).toBeNull();

    clearStudioBg3dUnappliedDraft(scopeKey);
    expect(readStudioBg3dUnappliedDraft(scopeKey)).toBeNull();
  });
});
