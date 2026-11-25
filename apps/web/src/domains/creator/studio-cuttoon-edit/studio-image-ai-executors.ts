import type { Dispatch, SetStateAction } from "react";

import {
  colorizeLineArt,
  generateBackgroundImage,
  generateConsistentCharacterImage,
  type StudioAiImageSize,
  type StudioAiSettings,
} from "../ai/studio-ai-client-lazy";
import { addColorizeCandidate, type StudioAiColorizeCandidateSession } from "../ai/studio-ai-colorize-candidates";
import { captureStudioAiGeneratedAssetProvenance, type StudioAiGeneratedAssetProvenance } from "../ai/studio-ai-generated-asset-model";
import {
  parseStudioAiRequestedSize,
  studioImageAiProviderContext,
  type SettleStudioAiOperationOptions,
  type StudioAiObservableResult,
  type StudioAiPendingOperationInput,
} from "../ai/studio-ai-provenance-recorder";
import { CANVAS_W } from "../studio-assets";
import type { StudioEditorMutationTicket } from "../studio-editor-scope";
import type { El } from "../studio-element-model";
import { uid } from "../studio-id";
import { createCanvasImageElement } from "../studio-image-placement";
import { isEffectivelyLocked } from "../studio-layers";
import type { PageState } from "../studio-page-state";
import type { StudioPublishAiProvenance } from "../studio-publish-preflight";
import { runStudioInsertAiBackgroundImage } from "./studio-host-wave6-ai-generation-helpers";

interface StudioColorizeCandidateOutput {
  readonly session: StudioAiColorizeCandidateSession;
  readonly provenanceById: Map<string, StudioAiGeneratedAssetProvenance>;
  readonly setSession: (session: StudioAiColorizeCandidateSession) => void;
  readonly setTargetId: (id: string) => void;
  readonly setTargetPageId: (pageId: string) => void;
}

interface StudioImageAiExecutionContext {
  readonly currentPageIdRef: { readonly current: string };
  readonly readCurrentPages: () => readonly PageState[];
  readonly activePage: Pick<PageState, "id">;
  readonly selected: El | null;
  readonly elements: readonly El[];
  readonly canvasH: number;
  readonly aiSettings: StudioAiSettings;
  readonly t: (key: string, fallback: string) => string;
  readonly canApplyStudioMutation: (ticket: StudioEditorMutationTicket) => boolean;
  readonly beginTrackedStudioAiOperation: (
    scope: string,
    input: Omit<StudioAiPendingOperationInput, "id">,
  ) => string;
  readonly settleTrackedStudioAiOperation: (
    id: string, result: StudioAiObservableResult, options?: SettleStudioAiOperationOptions,
  ) => void;
  readonly addRenderedImage: (
    src: string, width: number, height: number, provenance: StudioPublishAiProvenance,
  ) => boolean;
  readonly patchImageElOnPage: (pageId: string, id: string, patch: { src: string; aiProvenance?: StudioPublishAiProvenance }) => boolean;
  readonly commit: (next: El[]) => boolean;
  readonly setSelectedId: Dispatch<SetStateAction<string | null>>;
  readonly setTool: (next: "select" | "draw") => void;
  readonly patchEl: (id: string, patch: Partial<El>) => boolean;
  readonly commitPages: (next: PageState[]) => boolean;
  readonly setFailure: (error: string | null) => void;
  readonly setMenu: (menu: null) => void;
}

export function createStudioImageAiExecutors({
  currentPageIdRef, readCurrentPages, activePage, selected, elements, canvasH, aiSettings, t,
  canApplyStudioMutation, beginTrackedStudioAiOperation, settleTrackedStudioAiOperation,
  addRenderedImage, patchImageElOnPage, patchEl, commitPages, commit, setSelectedId, setTool,
  setFailure, setMenu,
}: StudioImageAiExecutionContext) {
  async function requestImageResult<T extends StudioAiObservableResult>(
    operationId: string, ticket: StudioEditorMutationTicket, signal: AbortSignal, request: () => Promise<T>,
  ): Promise<T | null> {
    if (signal.aborted || !canApplyStudioMutation(ticket)) return null;
    const settleCancelled = () => {
      if (canApplyStudioMutation(ticket)) settleTrackedStudioAiOperation(operationId, { ok: false }, { aborted: true });
    };
    signal.addEventListener("abort", settleCancelled, { once: true });
    try {
      const result = await request();
      if (signal.aborted || !canApplyStudioMutation(ticket)) return null;
      settleTrackedStudioAiOperation(operationId, result);
      return result;
    } catch (error) {
      if (!signal.aborted && canApplyStudioMutation(ticket)) {
        settleTrackedStudioAiOperation(operationId, { ok: false, code: "network_error" });
      }
      throw error;
    } finally {
      signal.removeEventListener("abort", settleCancelled);
    }
  }

  // AI로 생성된 배경 이미지를 삽입 — addBgScene과 동일한 배치 정책(선택된 프레임이 있으면 그 칸만,
  // 프레임이 여럿이면 전부, 없으면 캔버스 전체 배경으로 맨 뒤에 새 요소 추가). width/height는
  // generateBackgroundImage가 요청한 size 문자열에서 그대로 파생한 값이라 이미지 로드 없이 동기적으로
  // 안다.
  function insertAiBackgroundImage(
    dataUrl: string,
    width: number,
    height: number,
    aiProvenance: StudioPublishAiProvenance,
    requestTarget?: { readonly pageId: string; readonly selectedFrameId: string | null },
  ): boolean {
    if (requestTarget && requestTarget.pageId !== currentPageIdRef.current) {
      const latestPages = readCurrentPages();
      const targetPage = latestPages.find((page) => page.id === requestTarget.pageId);
      if (!targetPage) return false;
      const targetFrames = targetPage.elements.filter((el) =>
        el.type === "frame" && (requestTarget.selectedFrameId === null || el.id === requestTarget.selectedFrameId),
      );
      if (requestTarget.selectedFrameId !== null && targetFrames.length === 0) return false;
      if (targetFrames.some((frame) => isEffectivelyLocked(frame, targetPage.groups ?? []))) return false;

      let nextElements: El[];
      if (targetFrames.length > 0) {
        const framesToUpdate = new Set(targetFrames);
        nextElements = targetPage.elements.map((el) =>
          framesToUpdate.has(el) ? { ...el, bg: dataUrl, aiProvenance, bundleSourceCredit: undefined } : el,
        );
      } else {
        const el = createCanvasImageElement({
          id: uid(), src: dataUrl, canvasWidth: CANVAS_W, canvasHeight: targetPage.canvasH,
          sourceWidth: width, sourceHeight: height, horizontalInset: 0, minY: 0,
        });
        nextElements = [{ ...el, aiProvenance }, ...targetPage.elements];
      }
      return commitPages(latestPages.map((page) => page === targetPage ? { ...page, elements: nextElements } : page));
    }
    return runStudioInsertAiBackgroundImage({
      dataUrl, width, height, aiProvenance, selected: selected ?? undefined, elements, canvasH,
      patchEl, commit, setSelectedId, setTool,
    });
  }

  // 배경 생성 실행 — 이미 runWithAiNotice로 게이팅된 상태에서만 호출된다. 실패해도 throw하지
  // 않는다(studio-ai-client.ts 계약) — result.ok만 분기하면 된다.
  async function executeAiBackgroundGenerate(
    prompt: string, size: StudioAiImageSize, mutationTicket: StudioEditorMutationTicket, controller: AbortController,
  ) {
    if (controller.signal.aborted || !canApplyStudioMutation(mutationTicket)) return;
    const requestPageId = activePage.id;
    const requestSelectedFrameId = selected?.type === "frame" ? selected.id : null;
    const provider = studioImageAiProviderContext(aiSettings);
    const requestProvenance = captureStudioAiGeneratedAssetProvenance(provider, "generated");
    const operationId = beginTrackedStudioAiOperation("background-image", {
      kind: "image",
      task: "background-image",
      provider: provider.provider,
      model: provider.model,
      transport: provider.transport,
      promptVersion: 1,
      prompt,
      target: {
        pageId: requestPageId,
        ...(requestSelectedFrameId ? { elementId: requestSelectedFrameId } : {}),
      },
      requestedSize: parseStudioAiRequestedSize(size),
      references: [],
    });
    const result = await requestImageResult(operationId, mutationTicket, controller.signal, () =>
      generateBackgroundImage(aiSettings, prompt, { size, signal: controller.signal }),
    );
    if (!result || controller.signal.aborted || !canApplyStudioMutation(mutationTicket)) return;
    if (!result.ok) {
      setFailure(result.error);
      return;
    }
    if (!insertAiBackgroundImage(
      result.data.dataUrl,
      result.data.width,
      result.data.height,
      requestProvenance,
      { pageId: requestPageId, selectedFrameId: requestSelectedFrameId },
    )) {
      setFailure(t("studio.hostStatus.bgApplyFailed", "배경 이미지는 생성됐지만 현재 원고에 적용하지 못했어요. 편집 잠금과 동기화 상태를 확인한 뒤 다시 시도해 주세요."));
      return;
    }
    setMenu(null); // 다른 "생성 후 팝오버 닫기" 흐름(addBgScene 등)과 동일 UX.
  }

  // AI 자동 채색 실행 — elId/srcAtRequestTime/pageId를 호출 시점에 캡처해 넘긴다(await 도중 컷이나 선택이
  // 바뀌어도 엉뚱한 요소를 덮어쓰지 않고 원래 컷의 이미지 레이어에 반영한다).
  async function executeAiColorize(
    elId: string, srcAtRequestTime: string, prompt: string,
    mutationTicket: StudioEditorMutationTicket, controller: AbortController,
    candidates?: StudioColorizeCandidateOutput,
  ) {
    if (controller.signal.aborted || !canApplyStudioMutation(mutationTicket)) return;
    const requestPageId = activePage.id;
    const provider = studioImageAiProviderContext(aiSettings);
    const requestProvenance = captureStudioAiGeneratedAssetProvenance(provider, "edited");
    const operationId = beginTrackedStudioAiOperation("colorize", {
      kind: "image",
      task: "colorize",
      provider: provider.provider,
      model: provider.model,
      transport: provider.transport,
      promptVersion: 1,
      prompt,
      target: { pageId: requestPageId, elementId: elId },
      references: [{ assetId: elId }],
    });
    const result = await requestImageResult(operationId, mutationTicket, controller.signal, () =>
      colorizeLineArt(aiSettings, srcAtRequestTime, prompt, { signal: controller.signal }),
    );
    if (!result || controller.signal.aborted || !canApplyStudioMutation(mutationTicket)) return;
    if (!result.ok) {
      setFailure(result.error);
      return;
    }
    const targetPage = readCurrentPages().find((page) => page.id === requestPageId);
    const target = targetPage?.elements.find((el) => el.id === elId);
    if (!target || target.type !== "image" || target.src !== srcAtRequestTime) {
      setFailure(t("studio.hostStatus.colorizeSourceLayerNotFound", "채색 결과를 적용할 원본 이미지 레이어를 찾지 못했어요. 레이어를 다시 선택한 뒤 재시도해 주세요."));
      return;
    }
    if (candidates) {
      const now = Date.now();
      const id = `candidate-${now}-${candidates.session.candidates.length}`;
      const added = addColorizeCandidate(candidates.session, {
        id, dataUrl: result.data.dataUrl, prompt, createdAt: now,
      });
      if (!added.ok) {
        setFailure("채색 후보 상한(3장)에 닿았어요. 후보를 비운 뒤 다시 모아 주세요.");
        return;
      }
      candidates.provenanceById.set(id, requestProvenance);
      candidates.setSession(added.session);
      candidates.setTargetId(elId);
      candidates.setTargetPageId(requestPageId);
      return;
    }
    const applyFailure = t("studio.hostStatus.colorizeApplyFailed", "채색 결과는 생성됐지만 이미지 레이어에 적용하지 못했어요. 레이어 잠금과 동기화 상태를 확인한 뒤 다시 시도해 주세요.");
    if (isEffectivelyLocked(target, targetPage?.groups ?? [])) {
      setFailure(applyFailure);
      return;
    }
    if (!patchImageElOnPage(requestPageId, elId, { src: result.data.dataUrl, aiProvenance: requestProvenance })) {
      setFailure(applyFailure);
      return;
    }
  }

  // AI 캐릭터 일관성 생성 실행(젠툰 벤치마크) — reference id/src/size를 호출 시점에 함께 캡처해
  // 넘긴다(await 도중 선택이 바뀌어도 엉뚱한 참고 이미지를 쓰지 않는다 — executeAiColorize와 동일
  // 관례). colorizeLineArt와 달리 기존 요소의 src를 덮어쓰지 않고, addRenderedImage로 캔버스에 새
  // 이미지 요소를 추가한다(참고 캐릭터의 온-캔버스 크기를 그대로 재사용 — studio-ai-client.ts
  // generateConsistentCharacterImage 주석 참고, 생성된 이미지를 다시 디코딩해 원본 픽셀 크기를
  // 알아낼 필요가 없다).
  async function executeAiCharacterConsistency(
    reference: { elementId: string; src: string; width: number; height: number },
    prompt: string,
    mutationTicket: StudioEditorMutationTicket,
    controller: AbortController,
  ) {
    if (controller.signal.aborted || !canApplyStudioMutation(mutationTicket)) return;
    const requestPageId = activePage.id;
    const provider = studioImageAiProviderContext(aiSettings);
    const requestProvenance = captureStudioAiGeneratedAssetProvenance(provider, "generated");
    const operationId = beginTrackedStudioAiOperation("character-image", {
      kind: "image",
      task: "character-image",
      provider: provider.provider,
      model: provider.model,
      transport: provider.transport,
      promptVersion: 1,
      prompt,
      target: { pageId: requestPageId },
      references: [{ assetId: reference.elementId }],
    });
    const result = await requestImageResult(operationId, mutationTicket, controller.signal, () =>
      generateConsistentCharacterImage(aiSettings, reference.src, prompt, { signal: controller.signal }),
    );
    if (!result || controller.signal.aborted || !canApplyStudioMutation(mutationTicket)) return;
    if (!result.ok) {
      setFailure(result.error);
      return;
    }
    const addedOk =
      requestPageId !== currentPageIdRef.current
        ? (() => {
            const latestPages = readCurrentPages();
            const targetPage = latestPages.find((page) => page.id === requestPageId);
            if (!targetPage) return false;
            const element = createCanvasImageElement({
              id: uid(), src: result.data.dataUrl, canvasWidth: CANVAS_W, canvasHeight: targetPage.canvasH,
              sourceWidth: reference.width, sourceHeight: reference.height,
            });
            return commitPages(
              latestPages.map((page) =>
                page.id === requestPageId
                  ? { ...page, elements: [...page.elements, { ...element, aiProvenance: requestProvenance }] }
                  : page,
              ),
            );
          })()
        : addRenderedImage(result.data.dataUrl, reference.width, reference.height, requestProvenance);
    if (!addedOk) {
      setFailure(t("studio.hostStatus.characterAddFailed", "캐릭터 이미지는 생성됐지만 현재 원고에 추가하지 못했어요. 편집 잠금과 동기화 상태를 확인한 뒤 다시 시도해 주세요."));
      return;
    }
    setMenu(null); // 다른 "생성 후 팝오버 닫기" 흐름(AI 배경 생성 등)과 동일 UX.
  }
  return {
    executeAiBackgroundGenerate,
    executeAiColorize,
    executeAiCharacterConsistency,
  };
}
