// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPrimitive, type BgPrimitive } from "../studio-background-3d-primitives";

import { StudioBg3dReadinessBadge } from "./StudioBg3dReadinessBadge";
import {
  StudioBg3dSceneAssistantWorkspace,
  type StudioBg3dSceneAssistantHost,
} from "./StudioBg3dSceneAssistantWorkspace";
import {
  clearStudioBg3dUnappliedDraft,
  persistStudioBg3dUnappliedDraftFromHost,
  readStudioBg3dUnappliedDraft,
  resetStudioBg3dUnappliedDraftsForTests,
  resolveStudioBg3dPropsWithUnappliedDraft,
} from "./studio-bg3d-draft-session";
import { deriveStudioBg3dReadinessState } from "./studio-bg3d-readiness-state";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";
import { hydrateStudioBg3dDocumentToRuntime } from "./studio-bg3d-scene-runtime";

vi.mock("./StudioBg3dEditorViewport", () => ({
  StudioBg3dEditorViewport: () => <div data-testid="mock-scene-viewport" />,
}));

afterEach(() => {
  cleanup();
  resetStudioBg3dUnappliedDraftsForTests();
});

describe("BG3D isolated local dummy-data preset > LT preview > safe 2D return > explicit apply flow", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("격리 더미 데이터로 프리셋 > LT 미리보기 > 2D 복귀(초안·엔진 유지) > 재진입 > 명시적 적용 흐름을 검증한다", () => {
    const scopeKey = "isolated-local-dummy-cut-1:insert";
    const onInsert = vi.fn();
    let sceneDoc = DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT;
    let primitives: BgPrimitive[] = [];
    let lineArtPreview = false;
    let open = true;
    const explicitEnginePreference = "webgl2" as const;

    const readinessState = deriveStudioBg3dReadinessState({
      enginePhase: "ready",
      planStatus: "available",
      selectedBackend: explicitEnginePreference,
      hasModelRenderer: true,
      isRestoringScene: false,
      deviceLostMessage: null,
      planNotice: null,
    });

    const buildHost = (): StudioBg3dSceneAssistantHost => ({
      open,
      operation: "insert",
      primitives,
      customModels: [],
      sharedCharacterCaptureElementIds: [],
      selectedIds: new Set<string>(),
      setSelectedIds: vi.fn(),
      modelLibrary: [],
      genericModelClassifications: new Map(),
      transformMode: "translate",
      lineArtPreview,
      ltToneSettings: sceneDoc.output.tone,
      readinessState,
      engineRuntime: {
        preference: explicitEnginePreference,
        setPreference: vi.fn(),
      },
      placementActive: false,
      placementSession: { phase: "idle" },
      isCapturing: false,
      isRestoringScene: false,
      isUploadingModel: false,
      isBatchRenderingShots: false,
      applyingTemplateId: null,
      deletingModelId: null,
      insertBlocked: false,
      immersiveSceneActive: false,
      sharedStageUpdateBlockedReason: null,
      groundSelectionDisabledReason: null,
      focusSelectionDisabledReason: null,
      error: null,
      addSceneTemplate: vi.fn((templateId: string) => {
        if (!templateId) return false;
        primitives = [createPrimitive("box", 0), createPrimitive("cylinder", 1)];
        return true;
      }),
      addCustomModelToScene: vi.fn(),
      addPrimitive: vi.fn(),
      applyCameraPreset: vi.fn(),
      zoomCameraBy: vi.fn(),
      setTransformMode: vi.fn(),
      setLineArtPreview: vi.fn((next: boolean | ((current: boolean) => boolean)) => {
        lineArtPreview = typeof next === "function" ? next(lineArtPreview) : next;
      }),
      updateLtToneSettings: vi.fn((patch) => {
        sceneDoc = {
          ...sceneDoc,
          output: {
            ...sceneDoc.output,
            tone: {
              ...sceneDoc.output.tone,
              ...patch,
            },
          },
        };
      }),
      groundSelectedEntity: vi.fn(),
      focusSelectedEntity: vi.fn(),
      duplicateSelected: vi.fn(),
      deleteSelected: vi.fn(),
      handleSaveToLibrary: vi.fn(),
      handleInsert: vi.fn(() => {
        onInsert({
          kind: "separated",
          width: 640,
          height: 360,
          layers: [
            { kind: "line", label: "dummy-line", pngDataUrl: "data:image/png;base64,iVBORw0KGgo=" },
            { kind: "tone", label: "dummy-tone", pngDataUrl: "data:image/png;base64,iVBORw0KGgo=" },
          ],
          compositePngDataUrl: "data:image/png;base64,iVBORw0KGgo=",
          bg3dScene: sceneDoc,
        });
        clearStudioBg3dUnappliedDraft(scopeKey);
        open = false;
      }),
      requestUserClose: vi.fn(() => {
        persistStudioBg3dUnappliedDraftFromHost({
          unappliedDraftEligible: true,
          sharedStageSessionScopeKey: scopeKey,
          primitives,
          customModels: [],
          lineArtPreview,
          isRestoringScene: false,
          modelRenderer: { id: "dummy-webgl2" },
          sceneBaseDocument: sceneDoc,
        });
        open = false;
      }),
      setActivePanelTab: vi.fn(),
      setModelsPanelActivated: vi.fn(),
      setViewEditorSection: vi.fn(),
      setLtEditorSection: vi.fn(),
    });

    const view = render(
      <>
        <StudioBg3dReadinessBadge
          readiness={readinessState}
          onReturnTo2d={() => buildHost().requestUserClose?.()}
        />
        <StudioBg3dSceneAssistantWorkspace h={buildHost()} onOpenProfessional={vi.fn()} />
      </>,
    );

    // 0. 활성 엔진 배지(WebGL2 활성)와 초기 상태 확인
    const engineBadge = screen.getByTestId("studio-bg3d-active-engine-badge");
    expect(engineBadge.getAttribute("data-readiness")).toBe("ready");
    expect(engineBadge.getAttribute("data-active-engine")).toBe("webgl2");
    expect(engineBadge.textContent).toContain("WebGL2 활성");

    // 1. 프리셋 선택(교실)
    fireEvent.click(screen.getByRole("button", { name: /교실/ }));
    expect(primitives.length).toBeGreaterThan(0);

    view.rerender(
      <>
        <StudioBg3dReadinessBadge
          readiness={readinessState}
          onReturnTo2d={() => buildHost().requestUserClose?.()}
        />
        <StudioBg3dSceneAssistantWorkspace h={buildHost()} onOpenProfessional={vi.fn()} />
      </>,
    );

    // 2. 구도 잡기 -> 선화로 미리 보기(LT preview) 활성화
    fireEvent.click(screen.getByRole("button", { name: "3. 구도 잡기" }));
    fireEvent.click(screen.getByRole("button", { name: /선화로 미리 보기/ }));
    expect(lineArtPreview).toBe(true);
    expect(onInsert).not.toHaveBeenCalled();

    // 3. 작화 적용 단계로 이동 -> 톤 배경 스타일 선택(아직 2D 컷에 반영되지 않음)
    view.rerender(
      <>
        <StudioBg3dReadinessBadge
          readiness={readinessState}
          onReturnTo2d={() => buildHost().requestUserClose?.()}
        />
        <StudioBg3dSceneAssistantWorkspace h={buildHost()} onOpenProfessional={vi.fn()} />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "4. 작화 적용" }));
    fireEvent.click(screen.getByRole("button", { name: /톤 배경/ }));
    expect(sceneDoc.output.tone.type).toBe("grayscale");
    expect(onInsert).not.toHaveBeenCalled();

    // 4. 명시적 적용 전 2D 원고로 안전 복귀 -> 2D 원고 미변경 & 미적용 초안 보존
    fireEvent.click(screen.getByTestId("studio-bg3d-header-return-2d"));
    expect(open).toBe(false);
    expect(onInsert).not.toHaveBeenCalled();
    const savedDraft = readStudioBg3dUnappliedDraft(scopeKey);
    expect(savedDraft).not.toBeNull();
    expect(savedDraft?.lineArtPreview).toBe(true);

    // 5. /studio/bg3d 재진입 -> 저장된 미적용 초안 및 명시적 엔진(WebGL2) 복원 후 명시적 적용
    cleanup();
    open = true;
    const reopened = resolveStudioBg3dPropsWithUnappliedDraft({
      open: true,
      operation: "insert" as const,
      sharedStageSessionScopeKey: scopeKey,
    });
    expect(reopened.restoredDraft).not.toBeNull();
    const hydrated = hydrateStudioBg3dDocumentToRuntime({
      document: reopened.restoredDraft!.document,
      storageModelIdByAttachmentId: new Map(),
    });
    primitives = [...hydrated.primitives];
    sceneDoc = reopened.restoredDraft!.document;
    lineArtPreview = reopened.restoredDraft!.lineArtPreview;

    render(
      <>
        <StudioBg3dReadinessBadge
          readiness={readinessState}
          onReturnTo2d={() => buildHost().requestUserClose?.()}
        />
        <StudioBg3dSceneAssistantWorkspace h={buildHost()} onOpenProfessional={vi.fn()} />
      </>,
    );

    expect(screen.getByTestId("studio-bg3d-active-engine-badge").getAttribute("data-active-engine")).toBe("webgl2");
    fireEvent.click(screen.getByRole("button", { name: "4. 작화 적용" }));
    fireEvent.click(screen.getByRole("button", { name: "현재 컷에 적용" }));

    expect(onInsert).toHaveBeenCalledOnce();
    expect(readStudioBg3dUnappliedDraft(scopeKey)).toBeNull();
  });
});
