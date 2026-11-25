/**
 * Legacy public seam for the Studio scenario surface.
 *
 * The implementation now lives in the focused AI comic director domain while the existing lazy
 * registry and parent-owned scenario orchestration keep the same component and prop contract.
 *
 * The old host applies every entry in `item.bubbles` as a normal Studio element after its frame.
 * Until every legacy host is migrated, this seam injects reviewed foreground/background image
 * layers into that apply-only decoration stream. The preview is restored immediately when a commit
 * is rejected, while a successful commit clears the scenario result as before. This keeps actual
 * PNG layers and native balloons in one existing undo transaction without silently flattening art.
 */
import { useRef } from "react";
import { flushSync } from "react-dom";

import { useUserAi, userAiLegacySettings } from "@/shared/ai/user-ai-store";

import { StudioAiComicDirectorPanel } from "./ai/StudioAiComicDirectorPanel";
import { isStudioAiConfigured } from "./ai/studio-ai-client";
import { scenarioImageCandidates } from "./ai/studio-scenario-candidate-workflow";

import type { StudioAiComicDirectorPanelProps } from "./ai/StudioAiComicDirectorPanel";
import type { DialogueBubbleSeed } from "./studio-dialogue";
import type { StudioScenarioApplyLayerImage } from "./studio-cuttoon-edit/studio-host-canvas-element-helpers";
import type { ScenarioPreviewItem } from "./studio-scenario-layout";
import type { ReactElement } from "react";

export type StudioScenarioAutoLayoutPanelProps = StudioAiComicDirectorPanelProps;

const TRANSPARENT_FRAME_BACKGROUND =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";
const APPLY_KEY_PREFIX = "toonspectrum:studio-ai-comic-director:committed:";

type LegacyScenarioApplyDecoration = DialogueBubbleSeed | StudioScenarioApplyLayerImage;

function nativeBubbles(item: ScenarioPreviewItem): DialogueBubbleSeed[] {
  return item.bubbles.filter(
    (candidate): candidate is DialogueBubbleSeed => candidate.type === "bubble",
  );
}

function layerApplyDecorations(item: ScenarioPreviewItem): LegacyScenarioApplyDecoration[] | null {
  const manifest = item.layerManifest;
  if (!manifest?.editable || !manifest.layers.length || !item.imageDataUrl) return null;
  if (item.selectedImageCandidateId && item.selectedImageCandidateId !== manifest.sourceCandidateId) return null;
  const hasSource = scenarioImageCandidates(item).some((candidate) =>
    candidate.id === manifest.sourceCandidateId && candidate.imageDataUrl === item.imageDataUrl);
  if (!hasSource || manifest.layers.some((layer) =>
    layer.sourceCandidateId !== manifest.sourceCandidateId || !layer.imageDataUrl.trim())) return null;
  // 각 원고 객체의 ID는 호스트가 적용 시점에 발급한다.
  const layerElements: StudioScenarioApplyLayerImage[] = manifest.layers.map((layer) => ({
    type: "image",
    src: layer.imageDataUrl,
    x: item.frame.x,
    y: item.frame.y,
    width: item.frame.width,
    height: item.frame.height,
    rotation: 0,
    lockAspect: true,
    name: layer.name,
    ...(item.imageProvenance ? { aiProvenance: item.imageProvenance } : {}),
  }));
  return [...layerElements, ...nativeBubbles(item)];
}

function applyFingerprint(
  props: StudioScenarioAutoLayoutPanelProps,
  items: readonly ScenarioPreviewItem[],
): string {
  const serialized = JSON.stringify({
    sessionId: props.sessionId ?? "legacy",
    target: props.applyTarget,
    baseDocumentRevision: props.baseDocumentRevision ?? null,
    panels: items.map((item, index) => ({
      index,
      candidateId: item.selectedImageCandidateId ?? null,
      candidateFingerprint: item.imageCandidates?.find(
        (candidate) => candidate.id === item.selectedImageCandidateId,
      )?.inputFingerprint ?? null,
      dialogue: item.dialogue,
      layerSource: item.layerManifest?.sourceCandidateId ?? null,
      layerMethod: item.layerManifest?.method ?? null,
    })),
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function StudioScenarioAutoLayoutPanel(
  props: StudioScenarioAutoLayoutPanelProps,
): ReactElement | null {
  const applyRef = useRef(props.onApply);
  const previewRef = useRef(props.preview);
  const changeSceneRef = useRef(props.onChangeScene);
  applyRef.current = props.onApply;
  previewRef.current = props.preview;
  changeSceneRef.current = props.onChangeScene;

  // AI 설정의 유일한 진실 공급원은 통합 BYOK 스토어다. 부모가 명시 전달한 설정이
  // 없으면 통합 스토어의 이미지 경로를 사용하고, 레거시 평문 저장소는 읽지 않는다.
  // 이 심(seam)이 전달하는 설정은 마스크 영역 수리(이미지 편집) 전용이므로
  // 이미지 모델이 있는 경로만 사용한다.
  const unifiedAi = useUserAi();
  const unifiedAiSettings = userAiLegacySettings(unifiedAi.configuration);
  const unifiedImageSettings = isStudioAiConfigured(unifiedAiSettings)
    && unifiedAiSettings.imageModel.trim()
    ? unifiedAiSettings
    : undefined;
  const configuredSettings = props.aiSettings ?? unifiedImageSettings;

  const applyWithEditableLayers = () => {
    const sourceItems = previewRef.current;
    if (!sourceItems) return false;
    const commitKey = `${APPLY_KEY_PREFIX}${applyFingerprint(props, sourceItems)}`;
    if (globalThis.sessionStorage?.getItem(commitKey)) return false;

    const restore = sourceItems.map((item) => ({
      bubbles: item.bubbles,
      imageDataUrl: item.imageDataUrl,
    }));
    const decorations = sourceItems.map(layerApplyDecorations);
    const hasEditableLayers = decorations.some(Boolean);
    if (hasEditableLayers) {
      flushSync(() => {
        decorations.forEach((layers, index) => {
          if (!layers) return;
          changeSceneRef.current(index, {
            // Keep the frame slot truthful but transparent; the actual artwork follows as ordinary
            // Studio image elements in background → foreground order.
            imageDataUrl: TRANSPARENT_FRAME_BACKGROUND,
            bubbles: layers as unknown as ScenarioPreviewItem["bubbles"],
          });
        });
      });
    }

    // flushSync rerenders the wrapper, so this ref now points at the host closure that sees the
    // apply-only decorations rather than the stale pre-transform preview.
    if (applyRef.current() === false) {
      if (hasEditableLayers) {
        flushSync(() => restore.forEach((snapshot, index) => {
          changeSceneRef.current(index, snapshot);
        }));
      }
      return false;
    }
    globalThis.sessionStorage?.setItem(commitKey, new Date().toISOString());
    return true;
  };

  return (
    <StudioAiComicDirectorPanel
      {...props}
      aiSettings={configuredSettings}
      onApply={applyWithEditableLayers}
    />
  );
}
