import type { StudioSkiaCameraSource } from "../render/studio-skia-camera-source";
import { Suspense, useState } from "react";
import { useT } from "@/shared/lib/i18n";

import "../studio-brush-canvas-status-i18n";

import { StudioSkiaDocumentSurface } from "../render/StudioSkiaDocumentSurface";
import { CANVAS_W } from "../studio-assets";
import {
  StudioCanonicalVNextDryMediaCanvas,
  StudioLiveDynamicBrushOverlayHost,
  StudioLiveInkOverlayHost,
  StudioLiveInkPredictionHost,
  StudioLiveRetainedMediaOverlayHost,
  StudioLiveStampOverlayHost,
  StudioLiveWetInkOverlayHost,
  StudioReferenceOverlay,
  StudioWebGpuCanvas,
} from "../studio-page-lazy-ui";
import { StudioInkMeshLivePreviewHost } from "../StudioInkMeshLivePreviewHost";
import { StudioPixiSceneOverlayHost } from "../StudioPixiSceneOverlayHost";

import type { StudioCanvasViewportLiveSurfaces } from "./studio-canvas-viewport-live-surfaces";
import type { StudioLiveTransformDraftStore } from "../studio-live-transform-draft-store";
import type {
  StudioCanvasViewportHandlers,
  StudioCanvasViewportProps,
} from "./StudioCanvasViewportTypes";

export interface StudioCanvasViewportDomOverlaysProps {
  skiaCameraSource: StudioSkiaCameraSource;
  beforeSkiaPublish: (signal: AbortSignal) => Promise<void>;
  canSkiaDocumentPublishOverSettledInk: StudioCanvasViewportHandlers["canSkiaDocumentPublishOverSettledInk"];
  onSkiaDocumentAuthorityChange: StudioCanvasViewportHandlers["onSkiaDocumentAuthorityChange"];
  onSkiaDocumentVisiblePresentation: StudioCanvasViewportHandlers["onSkiaDocumentVisiblePresentation"];
  liveTransformDraftStore: StudioLiveTransformDraftStore;
  liveTransformDraftScope: string;
  acceleratedSceneSelectedIds: StudioCanvasViewportLiveSurfaces["acceleratedSceneSelectedIds"];
  canonicalDryMediaCanvasVisible: StudioCanvasViewportLiveSurfaces["canonicalDryMediaCanvasVisible"];
  canonicalDryMediaCandidate: StudioCanvasViewportLiveSurfaces["canonicalDryMediaCandidate"];
  canonicalDryMediaLayoutKey: string;
  paperSurfaceForPreview?: StudioCanvasViewportLiveSurfaces["paperSurfaceForPreview"];
  canvasFlipH: StudioCanvasViewportProps["canvasFlipH"];
  canvasH: StudioCanvasViewportProps["canvasH"];
  webtoonTheme: StudioCanvasViewportProps["webtoonTheme"];
  velloHubAuthority: StudioCanvasViewportLiveSurfaces["velloHubAuthority"];
  velloDocumentSurfaceEnabled: StudioCanvasViewportLiveSurfaces["velloDocumentSurfaceEnabled"];
  effScale: StudioCanvasViewportProps["effScale"];
  elements: StudioCanvasViewportProps["elements"];
  hokusaiLiveCanvasRef: StudioCanvasViewportLiveSurfaces["hokusaiLiveCanvasRef"];
  inkMeshLivePreviewRuntime: StudioCanvasViewportProps["inkMeshLivePreviewRuntime"];
  liveDynamicBrushOverlayRenderer: StudioCanvasViewportProps["liveDynamicBrushOverlayRenderer"];
  liveInkOverlayRenderer: StudioCanvasViewportProps["liveInkOverlayRenderer"];
  liveInkPredictionRenderer: StudioCanvasViewportProps["liveInkPredictionRenderer"];
  liveRetainedMediaOverlayRenderer: StudioCanvasViewportProps["liveRetainedMediaOverlayRenderer"];
  liveStampOverlayRenderer: StudioCanvasViewportProps["liveStampOverlayRenderer"];
  liveWetInkOverlayRenderer: StudioCanvasViewportProps["liveWetInkOverlayRenderer"];
  livingInkCanvasRef: StudioCanvasViewportLiveSurfaces["livingInkCanvasRef"];
  onWebGpuBackendChange: StudioCanvasViewportHandlers["onWebGpuBackendChange"];
  onWebGpuDeviceLost: StudioCanvasViewportHandlers["onWebGpuDeviceLost"];
  onWebGpuFrameInvalid: StudioCanvasViewportHandlers["onWebGpuFrameInvalid"];
  onWebGpuFrameReady: StudioCanvasViewportHandlers["onWebGpuFrameReady"];
  onWebGpuFrameRequest: StudioCanvasViewportHandlers["onWebGpuFrameRequest"];
  pixiMountParent: HTMLDivElement | null;
  pixiSceneDocumentTransform: StudioCanvasViewportLiveSurfaces["pixiSceneDocumentTransform"];
  velloSceneDocumentTransform: StudioCanvasViewportLiveSurfaces["velloSceneDocumentTransform"];
  velloSceneRevision: StudioCanvasViewportLiveSurfaces["velloSceneRevision"];
  velloSurfaceDpr: StudioCanvasViewportLiveSurfaces["velloSurfaceDpr"];
  readVelloHubPenDown: StudioCanvasViewportLiveSurfaces["readVelloHubPenDown"];
  setCanonicalDryMediaCanvasAuthority: StudioCanvasViewportLiveSurfaces["setCanonicalDryMediaCanvasAuthority"];
  setVelloHubAuthority: StudioCanvasViewportLiveSurfaces["setVelloHubAuthority"];
  setWebGpuCanvasHandle: StudioCanvasViewportHandlers["setWebGpuCanvasHandle"];
  stageViewLayout: StudioCanvasViewportLiveSurfaces["stageViewLayout"];
  transientPenInkSurfaceEnabled: StudioCanvasViewportProps["transientPenInkSurfaceEnabled"];
  /**
   * 플로팅 3D 레퍼런스 오버레이(B-5) 옵트인. true일 때만
   * `StudioReferenceOverlay`를 최상위 레이어에 마운트한다.
   */
  referenceOverlayEnabled?: boolean;
  velloHubCapability: StudioCanvasViewportLiveSurfaces["velloHubCapability"];
  webGpuPreviewAuthorized: StudioCanvasViewportProps["webGpuPreviewAuthorized"];
  webGpuPreviewStrokes: StudioCanvasViewportProps["webGpuPreviewStrokes"];
  webGpuViewportSurface: StudioCanvasViewportProps["webGpuViewportSurface"];
}

export function StudioCanvasViewportDomOverlays({
  beforeSkiaPublish,
  canSkiaDocumentPublishOverSettledInk,
  onSkiaDocumentAuthorityChange,
  onSkiaDocumentVisiblePresentation,
  liveTransformDraftStore,
  liveTransformDraftScope,
  skiaCameraSource,
  acceleratedSceneSelectedIds,
  canonicalDryMediaCanvasVisible,
  canonicalDryMediaCandidate,
  canonicalDryMediaLayoutKey,
  paperSurfaceForPreview,
  canvasFlipH,
  canvasH,
  webtoonTheme,
  velloHubAuthority,
  velloDocumentSurfaceEnabled,
  effScale,
  elements,
  hokusaiLiveCanvasRef,
  inkMeshLivePreviewRuntime,
  liveDynamicBrushOverlayRenderer,
  liveInkOverlayRenderer,
  liveInkPredictionRenderer,
  liveRetainedMediaOverlayRenderer,
  liveStampOverlayRenderer,
  liveWetInkOverlayRenderer,
  livingInkCanvasRef,
  onWebGpuBackendChange,
  onWebGpuDeviceLost,
  onWebGpuFrameInvalid,
  onWebGpuFrameReady,
  onWebGpuFrameRequest,
  pixiMountParent,
  pixiSceneDocumentTransform,
  velloSceneDocumentTransform,
  velloSceneRevision,
  velloSurfaceDpr,
  readVelloHubPenDown,
  setCanonicalDryMediaCanvasAuthority,
  setVelloHubAuthority,
  setWebGpuCanvasHandle,
  stageViewLayout,
  transientPenInkSurfaceEnabled,
  referenceOverlayEnabled = false,
  velloHubCapability,
  webGpuPreviewAuthorized,
  webGpuPreviewStrokes,
  webGpuViewportSurface,
}: StudioCanvasViewportDomOverlaysProps) {
  const t = useT();
  const [rendererAttempt, setRendererAttempt] = useState(0);
  return (
    <>
          <Suspense fallback={null}>
            {webGpuViewportSurface ? (
              <StudioLiveInkOverlayHost
                renderer={liveInkOverlayRenderer}
                left={webGpuViewportSurface.surface.left}
                top={webGpuViewportSurface.surface.top}
                width={webGpuViewportSurface.surface.width}
                height={webGpuViewportSurface.surface.height}
                documentScale={effScale}
                documentWidth={CANVAS_W}
                flipX={canvasFlipH}
              />
            ) : null}
            {webGpuViewportSurface ? (
              <StudioLiveStampOverlayHost
                renderer={liveStampOverlayRenderer}
                left={webGpuViewportSurface.surface.left}
                top={webGpuViewportSurface.surface.top}
                width={webGpuViewportSurface.surface.width}
                height={webGpuViewportSurface.surface.height}
                documentScale={effScale}
                documentWidth={CANVAS_W}
                flipX={canvasFlipH}
              />
            ) : null}
            {webGpuViewportSurface ? (
              <StudioLiveDynamicBrushOverlayHost
                renderer={liveDynamicBrushOverlayRenderer}
                left={webGpuViewportSurface.surface.left}
                top={webGpuViewportSurface.surface.top}
                width={webGpuViewportSurface.surface.width}
                height={webGpuViewportSurface.surface.height}
                documentScale={effScale}
                documentWidth={CANVAS_W}
                flipX={canvasFlipH}
              />
            ) : null}
            {webGpuViewportSurface ? (
              <StudioLiveRetainedMediaOverlayHost
                renderer={liveRetainedMediaOverlayRenderer}
                left={webGpuViewportSurface.surface.left}
                top={webGpuViewportSurface.surface.top}
                width={webGpuViewportSurface.surface.width}
                height={webGpuViewportSurface.surface.height}
                documentScale={effScale}
                documentWidth={CANVAS_W}
                flipX={canvasFlipH}
              />
            ) : null}
            {webGpuViewportSurface ? (
              <StudioLiveWetInkOverlayHost
                renderer={liveWetInkOverlayRenderer}
                left={webGpuViewportSurface.surface.left}
                top={webGpuViewportSurface.surface.top}
                width={webGpuViewportSurface.surface.width}
                height={webGpuViewportSurface.surface.height}
                documentScale={effScale}
                documentWidth={CANVAS_W}
                flipX={canvasFlipH}
              />
            ) : null}
            {transientPenInkSurfaceEnabled && webGpuViewportSurface ? (
              <StudioLiveInkPredictionHost
                renderer={liveInkPredictionRenderer}
                left={webGpuViewportSurface.surface.left}
                top={webGpuViewportSurface.surface.top}
                width={webGpuViewportSurface.surface.width}
                height={webGpuViewportSurface.surface.height}
                documentScale={effScale}
                documentWidth={CANVAS_W}
                flipX={canvasFlipH}
              />
            ) : null}
            {transientPenInkSurfaceEnabled && webGpuViewportSurface && inkMeshLivePreviewRuntime ? (
              <StudioInkMeshLivePreviewHost
                runtime={inkMeshLivePreviewRuntime}
                left={webGpuViewportSurface.surface.left}
                top={webGpuViewportSurface.surface.top}
                width={webGpuViewportSurface.surface.width}
                height={webGpuViewportSurface.surface.height}
                documentScale={effScale}
                documentWidth={CANVAS_W}
                flipX={canvasFlipH}
              />
            ) : null}
          </Suspense>
          <StudioSkiaDocumentSurface
            key={rendererAttempt}
            frameTheme={webtoonTheme}
            liveTransformDraftStore={liveTransformDraftStore}
            liveTransformDraftScope={liveTransformDraftScope}
            beforePublish={beforeSkiaPublish}
            cameraSource={skiaCameraSource}
            visible={velloHubAuthority.status === "active" && velloHubAuthority.sceneRevision === velloSceneRevision}
            enabled={velloDocumentSurfaceEnabled}
            mountParent={pixiMountParent}
            width={stageViewLayout.width}
            height={stageViewLayout.height}
            dpr={velloSurfaceDpr}
            documentTransform={velloSceneDocumentTransform}
            documentWidth={CANVAS_W}
            documentHeight={canvasH}
            elements={elements}
            sceneRevision={velloSceneRevision}
            isPenDown={readVelloHubPenDown}
            canPublishOverSettledInk={canSkiaDocumentPublishOverSettledInk}
            onVisiblePresentation={onSkiaDocumentVisiblePresentation}
            onAuthorityChange={(authority) => {
              setVelloHubAuthority(authority);
              onSkiaDocumentAuthorityChange?.(authority);
            }}
          />
          {velloHubAuthority.status === "unavailable" ? (
            <div
              role="alert"
              aria-live="assertive"
              aria-atomic="true"
              data-studio-vello-unavailable="true"
              className="absolute inset-x-4 top-4 z-[30] rounded-md border border-bad/50 bg-panel/95 px-4 py-3 text-sm font-medium text-bad shadow-lg"
            >
              <strong className="block">{t("studio.brushCanvasStatus.canvas.gpuPrepareFailed", "작업 화면을 표시하지 못했어요")}</strong>
              {velloHubAuthority.visibleCanvasCount === 1
                ? t("studio.brushCanvasStatus.canvas.gpuKeptFrame", "화면을 업데이트하지 못해 마지막으로 표시한 그림을 유지하고 있어요. 아래 버튼으로 다시 시도해 주세요.")
                : t("studio.brushCanvasStatus.canvas.gpuNotSwitched", "이 브라우저에서 작업 화면을 열지 못했어요. 아래 버튼으로 다시 시도해 주세요.")}
              <button type="button" className="mt-2 min-h-11 rounded-md border border-current px-3 focus-visible:outline focus-visible:outline-2"
                onClick={() => setRendererAttempt((value) => value + 1)}>{t("studio.brushCanvasStatus.canvas.gpuRetry", "작업 화면 다시 열기")}</button>
            </div>
          ) : null}
          <StudioPixiSceneOverlayHost
            enabled={
              !velloHubCapability.enabled
              || velloHubAuthority.status === "legacy"
            }
            mountParent={pixiMountParent}
            // Mixed/unsupported pages are an explicit legacy boundary. A Vello
            // runtime failure never re-enables Pixi as a pixel fallback.
            width={stageViewLayout.hostWidth}
            height={stageViewLayout.hostHeight}
            documentTransform={pixiSceneDocumentTransform}
            documentWidth={CANVAS_W}
            documentHeight={canvasH}
            elements={elements}
            selectedIds={acceleratedSceneSelectedIds}
          />
          {webGpuViewportSurface ? (
            <canvas
              ref={livingInkCanvasRef}
              aria-hidden="true"
              data-studio-living-ink-overlay="true"
              className="pointer-events-none absolute z-[13] mix-blend-multiply"
              style={{
                left: webGpuViewportSurface.surface.left,
                top: webGpuViewportSurface.surface.top,
                width: webGpuViewportSurface.surface.width,
                height: webGpuViewportSurface.surface.height,
              }}
            />
          ) : null}
          {webGpuViewportSurface ? (
            <canvas
              ref={hokusaiLiveCanvasRef}
              aria-hidden="true"
              data-studio-hokusai-live-overlay="true"
              className="pointer-events-none absolute z-[12]"
              style={{
                left: webGpuViewportSurface.surface.left,
                top: webGpuViewportSurface.surface.top,
                width: webGpuViewportSurface.surface.width,
                height: webGpuViewportSurface.surface.height,
              }}
            />
          ) : null}
          {webGpuViewportSurface ? (
            <Suspense fallback={null}>
              <StudioCanonicalVNextDryMediaCanvas
                element={canonicalDryMediaCandidate}
                layoutKey={canonicalDryMediaLayoutKey}
                paperSurface={paperSurfaceForPreview}
                visible={canonicalDryMediaCanvasVisible}
                surfaceBounds={webGpuViewportSurface.surface}
                documentWidth={CANVAS_W}
                documentHeight={canvasH}
                documentScale={effScale}
                flipX={canvasFlipH}
                onAuthorityChange={setCanonicalDryMediaCanvasAuthority}
              />
            </Suspense>
          ) : null}
          {webGpuViewportSurface ? (
            <Suspense fallback={null}>
              <StudioWebGpuCanvas
                className="pointer-events-none z-10"
                width={CANVAS_W}
                height={canvasH}
                surfaceBounds={webGpuViewportSurface.surface}
                scaleX={webGpuViewportSurface.transform.scaleX}
                scaleY={webGpuViewportSurface.transform.scaleY}
                offsetX={webGpuViewportSurface.transform.offsetX}
                offsetY={webGpuViewportSurface.transform.offsetY}
                flipX={webGpuViewportSurface.transform.flipX}
                ref={setWebGpuCanvasHandle}
                strokes={webGpuPreviewStrokes}
                frameAuthorized={webGpuPreviewAuthorized}
                eagerInitialize
                onBackendChange={onWebGpuBackendChange}
                onDeviceLost={onWebGpuDeviceLost}
                onFrameInvalid={onWebGpuFrameInvalid}
                onFrameRequest={onWebGpuFrameRequest}
                onFrameReady={onWebGpuFrameReady}
              />
            </Suspense>
          ) : null}
          {/* 플로팅 3D 레퍼런스 오버레이(B-5) — 옵트인일 때만 최상위 레이어(z-40)에
              마운트. 레이어는 pointer-events-none, 패널만 pointer-events-auto라
              패널 바깥의 캔버스 드로잉과 간섭하지 않는다. */}
          {referenceOverlayEnabled ? <Suspense fallback={null}><StudioReferenceOverlay /></Suspense> : null}
    </>
  );
}
