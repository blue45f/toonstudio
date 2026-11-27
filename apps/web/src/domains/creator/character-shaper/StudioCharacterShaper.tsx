/**
 * Character Shaper — the mounted surface (`/studio/character`).
 *
 * It builds the existing poser runtime (`useStudioVrmPoserController`) and the Shaper binding in
 * the *same commit* as the dialog: the shell installs its key layer on mount and reads
 * `binding.busyReason` on its first render, so a Suspense boundary between controller and dialog
 * would leave the workshop keyboard-dead for a frame. The lazy boundary therefore lives outside
 * this component (`StudioThreeDPreviewPanelStack`), exactly as it does for `StudioVrmPoser`.
 *
 * 고급 편집 swaps the whole dialog for the legacy builder over the same host — no second scene, no
 * reload — and portals a "셰이퍼로 돌아가기" button *into* the legacy dialog element so the poser's
 * own Tab trap keeps it reachable.
 */

import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { CharacterRuntimeThumbnailRecorder } from "../character-platform/thumbnail/character-runtime-thumbnail-store";
import { useCharacterAuthoringInputs } from "../character-platform/ui/use-character-authoring-inputs";
import { useCharacterPlatformWorkbench } from "../character-platform/ui/use-character-platform-workbench";
import { CharacterPlatformWorkbench } from "../character-platform/ui/CharacterPlatformWorkbench";
import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { StudioSurfaceErrorBoundary } from "../StudioSurfaceErrorBoundary";
import { preserveUneditedCutPose } from "../vrm/studio-vrm-linked-cut-frame";
import { StudioVrmPoserViewport } from "../vrm/StudioVrmPoserViewport";
import { StudioVrmPoserDialog } from "../vrm/StudioVrmPoserDialog";
import { useStudioVrmPoserController } from "../vrm/useStudioVrmPoserController";

import { syncCustomAttachmentQuality } from "./character-shaper-custom-quality";
import { applyShaperMtoonUniformsToVrm } from "./character-shaper-mtoon-uniforms";
import { useCharacterShaperMaterialSettings } from "./character-shaper-session-settings";
import { isCharacterShaperTypingTarget, pushCharacterShaperKeyLayer } from "./character-shaper-ui-model";
import { CharacterShaperSessionSettingsProvider } from "./CharacterShaperSessionSettingsProvider";
import { StudioCharacterShaperDialog } from "./StudioCharacterShaperDialog";
import { sceneUsesCharacterModel, type StudioCharacterAsset } from "./studio-character-asset-library";
import { useLinkedCutCapture, type LinkedCutCaptureRequest } from "./use-linked-cut-capture";
import { useStudioCharacterAssets } from "./use-studio-character-assets";
import { useCharacterShaperBinding } from "./useCharacterShaperBinding";

import type { CharacterShaperOutputTarget } from "./character-shaper-ui-contract";
import type { StudioVrmPoserProps } from "../vrm/StudioVrmPoserTypes";
import type { VrmLibraryEntry } from "../vrm/vrm-library";
import type { RefObject } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export type { StudioVrmPoserProps } from "../vrm/StudioVrmPoserTypes";

const RETURN_BUTTON_CLASS = cn(
  "absolute bottom-3 left-3 z-[60] inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-accent/55 bg-panel/95 px-3 text-[0.75rem] font-semibold text-accent shadow-lg backdrop-blur",
  "transition-colors hover:bg-accent-soft motion-reduce:transition-none",
  STUDIO_FOCUS_RING,
);

export type StudioCharacterShaperProps = StudioVrmPoserProps & {
  readonly linkedCutCapture?: LinkedCutCaptureRequest;
  readonly onInsertLtLayers?: import("../lt-convert/studio-lt-raster-output").StudioLtInsertLayers;
  /** Hosts without a Studio document (the character landing) save files instead of inserting. */
  readonly outputTarget?: CharacterShaperOutputTarget;
  /**
   * 3D 화면을 그리다 실패하면(그래픽 가속 꺼짐·메모리 부족) 편집기 전체가 아니라 이 작업실만 닫고
   * 이유를 알린다. 이미 자체 복구 화면을 가진 호스트(소개 페이지의 단독 편집기)는 끈다.
   */
  readonly recoverFromRenderFailure?: boolean;
};

/**
 * 스튜디오 안에서 캐릭터 셰이퍼를 여는 표면. 렌더 실패는 [StudioSurfaceErrorBoundary]가 받아
 * 원고와 편집 기록을 그대로 둔 채 "계속 열 수 없습니다" 안내와 다시 시도·닫기를 보인다.
 * 경계는 열림 여부와 상관없이 항상 같은 자리에 있어(트리 모양 불변) 닫혔다 다시 열어도 런타임 상태가 남는다.
 */
export function StudioCharacterShaper({ recoverFromRenderFailure = true, ...props }: StudioCharacterShaperProps) {
  const bt = useBilingual("StudioCharacterShaper");
  if (!recoverFromRenderFailure) return <StudioCharacterShaperSurface {...props} />;
  return (
    <StudioSurfaceErrorBoundary
      surfaceLabel={bt("캐릭터 셰이퍼", "Character Shaper")}
      detail={bt(
        "3D 화면을 그리는 중 문제가 생겨 캐릭터 셰이퍼만 닫았습니다. 그래픽 가속(WebGL)이 꺼져 있거나 메모리가 부족하면 이렇게 될 수 있습니다. 현재 원고와 편집 기록은 그대로 보존되어 있습니다.",
        "Something went wrong while drawing the 3D view, so only Character Shaper was closed. This can happen when graphics acceleration (WebGL) is off or memory is low. Your page and edit history are untouched.",
      )}
      exitLabel={bt("원고로 돌아가기", "Back to the page")}
      retryLabel={bt("다시 시도", "Try again")}
      onExit={props.onClose}
      resetKey="character-shaper"
    >
      <StudioCharacterShaperSurface {...props} />
    </StudioSurfaceErrorBoundary>
  );
}

function CharacterShaperMaterialSyncBridge({ h, interactive = true }: { readonly h: ReturnType<typeof useStudioVrmPoserController>; readonly interactive?: boolean }) {
  const { shaperMaterial, setShaperMaterial } = useCharacterShaperMaterialSettings();
  const { vrm, captureRef, invalidateViewport } = h;
  useEffect(() => {
    const runSync = () => {
      const hostScene = (captureRef?.current as { readonly scene?: import("three").Object3D } | null | undefined)?.scene;
      applyShaperMtoonUniformsToVrm(vrm, shaperMaterial);
      syncCustomAttachmentQuality([vrm?.scene, hostScene], shaperMaterial);
      invalidateViewport?.();
    };
    runSync();
    // 절차형 헤어·워드로브·소품이 비동기 마운트된 직후 프레임에도 본체 MToon 톤과 100% 일치시킨다.
    const raf = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame(runSync)
      : null;
    return () => {
      if (raf !== null && typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(raf);
      }
    };
  }, [vrm, captureRef, invalidateViewport, shaperMaterial, h.captureSceneGeneration, h.avatarForgeState,
    h.avatarForgeReferencePreviewActive, h.wardrobeState, h.wardrobeSurfaceReceipts, h.vrmPropItems, h.costumeState]);

  // SHAPER Space 단축키(`MaterialData::ToggleShader`): 웹툰 툰 ↔ 모델링 입체 셰이더 즉시 전환
  useEffect(() => {
    if (!interactive) return;
    return pushCharacterShaperKeyLayer((event) => {
      if (
        event.key !== " "
        || event.code !== "Space"
        || event.repeat
        || event.isComposing
        || event.ctrlKey
        || event.metaKey
        || event.altKey
        || isCharacterShaperTypingTarget(event.target)
      ) return false;
      const target = event.target as HTMLElement | null;
      if (target && target.closest("button, a, [role='button'], [role='switch'], [role='checkbox']")) return false;
      event.preventDefault();
      setShaperMaterial((prev) => ({
        ...prev,
        shaderMode: prev.shaderMode === "modeling" ? "toon" : "modeling",
      }));
      return true;
    }, window);
  }, [interactive, setShaperMaterial]);

  return null;
}

function StudioCharacterShaperSurface({ outputTarget = "canvas", onInsertLtLayers, linkedCutCapture, ...props }: Omit<StudioCharacterShaperProps, "recoverFromRenderFailure">) {
  const { open } = props;
  const [selection, setSelection] = useState<{
    origin: StudioVrmPoserProps["initialScene"]; asset: StudioCharacterAsset | null;
  }>();
  const selected = selection?.origin === props.initialScene ? selection?.asset : undefined;
  const setSelected = (asset: StudioCharacterAsset | null) => setSelection({ origin: props.initialScene, asset });
  // 캡처가 PNG 인코딩을 기다리는 동안 같은 모델의 다른 캐릭터나 다른 컷이 열릴 수 있다.
  const captureScope = useMemo(() => ({ open, scene: props.initialScene, selected }), [open, props.initialScene, selected]);
  const place = useRef<{ scope: typeof captureScope; insert: StudioVrmPoserProps["onInsert"] } | null>(null);
  const onInsert = useCallback<StudioVrmPoserProps["onInsert"]>((result) =>
    place.current?.scope === captureScope ? place.current.insert(result) : false, [captureScope]);
  const h = useStudioVrmPoserController(open ? { ...props, onInsert } : props);
  const models: readonly VrmLibraryEntry[] = Array.isArray(h.libraryEntries) ? h.libraryEntries : [];
  const activeModel = models.find(entry => entry.id === h.activeModelId);
  const placement = props.initialScene && sceneUsesCharacterModel(props.initialScene.model, activeModel) ? props.initialScene : undefined;
  const documentId = selected === undefined ? placement?.characterDocumentId
    : selected && selected.modelId === h.activeModelId ? selected.documentId : undefined;
  const [advanced, setAdvanced] = useState(false);
  const runtimeBinding = useCharacterShaperBinding(h, { runtimeOnly: true });
  const controller = useCharacterPlatformWorkbench(h, runtimeBinding, {
    documentAuthority: true, legacyEditing: advanced, readOnlyCapture: Boolean(linkedCutCapture), documentId,
    placementScene: placement?.characterDocumentId === documentId ? placement : undefined,
  });
  const linked = useLinkedCutCapture({ request: linkedCutCapture, scene: props.initialScene, src: props.initialDataUrl, documentId, h, controller });
  const assets = useStudioCharacterAssets(h, controller.authoring, documentId, setSelected, open);
  const deliver = props.onInsert;
  const { admitOutput } = linked;
  useLayoutEffect(() => {
    place.current = { scope: captureScope, insert: async result => {
      if (!linkedCutCapture) {
        const scene = placement && documentId && placement.characterDocumentId === documentId
          ? preserveUneditedCutPose(placement, result.scene) : result.scene;
        return assets.insert({ ...result, scene }, deliver);
      }
      if (!await admitOutput() || place.current?.scope !== captureScope) return false;
      return deliver({ ...result, scene: { ...result.scene, characterDocumentId: linkedCutCapture.documentId } });
    } };
    return () => { place.current = null; };
  }, [admitOutput, assets, captureScope, deliver, documentId, linkedCutCapture, placement]);
  const binding = controller.binding;
  const cutFingers = placement && documentId && placement.characterDocumentId === documentId
    ? placement.pose.fingerOverrides : undefined;
  const inputHost = useCharacterAuthoringInputs(h, controller.authoring, !advanced, cutFingers);
  const variantHost = {
    ...inputHost,
    loadModelFromLibraryEntry: (entry: VrmLibraryEntry) => {
      setSelected(null);
      return h.loadModelFromLibraryEntry(entry);
    },
    vrmCreativeReadOnly: inputHost.vrmCreativeReadOnly || !controller.authoring.hydrated,
    handleSaveFullLocal: () => controller.authoring.hydrated && h.handleSaveFullLocal(controller.authoring.exportJson()),
    handleLoadFullLocal: async (name: string) => {
      const variant = h.savedFullStates?.[name];
      if (!variant || !controller.authoring.hydrated || (variant.modelId && variant.modelId !== h.activeModelId)) return false;
      if (typeof variant.characterDocumentV3 === "string") return controller.authoring.importJson(variant.characterDocumentV3);
      if (h.handleLoadFullLocal(name) !== true) return false;
      setAdvanced(true);
      return true;
    },
  };
  const cancelPreview = binding.cancelPreview;
  const [advancedRoot, setAdvancedRoot] = useState<HTMLElement | null>(null);
  const dialogRef = h.dialogRef as RefObject<HTMLElement | null> | undefined;

  useEffect(() => {
    if (!open) {
      setSelection(undefined);
      cancelPreview?.();
      setAdvanced(false);
    }
  }, [cancelPreview, open]);

  // The legacy dialog owns the element; read it after its commit so the return button can be
  // portaled inside the poser's focus trap.
  useEffect(() => {
    if (!advanced) {
      setAdvancedRoot(null);
      return;
    }
    setAdvancedRoot(dialogRef?.current ?? null);
  }, [advanced, dialogRef]);

  if (!open) return null;
  if (linkedCutCapture) return (
    <CharacterShaperSessionSettingsProvider gazeAvailable={false} locked>
      <CharacterShaperMaterialSyncBridge h={h} interactive={false} />
      <div inert aria-hidden className="pointer-events-none fixed inset-0 -z-10 grid">
        <StudioVrmPoserViewport h={{ ...h, onLinkedCutPropStatus: linked.onLinkedCutPropStatus, onLinkedCutWardrobeStatus: linked.onLinkedCutWardrobeStatus }} presentation="shaper" />
      </div>
    </CharacterShaperSessionSettingsProvider>
  );

  return (
    <CharacterShaperSessionSettingsProvider gazeAvailable={Boolean(h.vrm?.lookAt) && !h.webcamActive} locked={advanced || Boolean(h.isCapturing || h.isSharingPose || h.isThumbnailCapturing)}>
      <CharacterShaperMaterialSyncBridge h={h} />
      {advanced ? (
        <>
          <StudioVrmPoserDialog h={h} />
          {advancedRoot
            ? createPortal(
                <button
                  type="button"
                  data-character-shaper-return="true"
                  onClick={() => setAdvanced(false)}
                  className={RETURN_BUTTON_CLASS}
                >
                  <ArrowLeft size={15} aria-hidden />
                  셰이퍼로 돌아가기
                </button>,
                advancedRoot,
              )
            : null}
        </>
      ) : (
        <>
          <StudioCharacterShaperDialog assets={assets} onInsertLtLayers={onInsertLtLayers} h={variantHost} binding={binding} outputTarget={outputTarget} onOpenAdvanced={() => setAdvanced(true)} />
          <CharacterRuntimeThumbnailRecorder h={h} binding={binding} documentId={controller.authoring.hydrated ? documentId : undefined} />
          <CharacterPlatformWorkbench h={inputHost} binding={binding} controller={controller} />
        </>
      )}
    </CharacterShaperSessionSettingsProvider>
  );
}
