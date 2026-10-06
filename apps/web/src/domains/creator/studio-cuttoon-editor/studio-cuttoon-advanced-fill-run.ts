/*
 * 고급 채우기(Advanced Fill) 실행 어댑터 — 기준점·프레임으로 채우기 계획을 실행한다.
 * StudioCuttoonEditorHost에서 추출한 어댑터 — 호스트가 상태·핸들러 가방을 넘기고,
 * 이 모듈은 그 가방에만 의존한다(추출 전 클로저와 동일 의미).
 */
import { shouldClipToExistingAlpha } from "../studio-alpha-lock";
import { collectOverlappingStudioFillReferenceLayers, composeStudioFillReferenceImageWithPageReferences } from "../studio-fill-reference";
import type { StudioFillPageReference } from "../studio-fill-reference";
import { flipNormalizedPoint } from "../studio-magic-wand";
import { canvasPointToNormalized } from "../studio-selection-tools";
import type { SelectionFrame } from "../studio-selection-tools";
import { describeStudioAdvancedFillVectorReferenceExclusion, planStudioAdvancedFillVectorTarget, renderStudioAdvancedFillVectorReference } from "../studio-vector-fill-reference";

// The host is a mutable runtime bag by design; keep the dynamic seam isolated to this adapter.
type StudioAdvancedFillRunHost = Record<string, unknown>;

export function bindStudioAdvancedFillRun(h: StudioAdvancedFillRunHost) {
  // This adapter intentionally preserves the host's runtime bag typing across the extraction seam.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const host = h as Record<string, any>;
  const {
    advancedFillAbortRef,
    advancedFillBusy,
    advancedFillArmed,
    advancedFillRasterArmed,
    selected,
    advancedFillVirtualTarget,
    setAdvancedFillStatus,
    captureStudioMutationTicket,
    pagesHiRef,
    advancedFillPreview,
    advancedFillRunIdRef,
    setAdvancedFillBusy,
    currentAdvancedFillVectorInput,
    setAdvancedFillVirtualTarget,
    advancedFillVirtualReferenceRef,
    advancedFillSettings,
    advancedFillRasterLayers,
    color,
    createAdvancedFillSelectionMask,
    canApplyStudioMutation,
    activeElementsRef,
    setError,
    setAdvancedFillPreview,
    setAdvancedFillActive,
  } = host;
  return async function runAdvancedFillAt(pos: { x: number; y: number }, frame: SelectionFrame) {
    if (advancedFillAbortRef.current || advancedFillBusy || !advancedFillArmed) return;
    const rasterTarget = advancedFillRasterArmed && selected?.type === "image" ? selected : null;
    let vectorTarget = rasterTarget ? null : advancedFillVirtualTarget;
    if (!rasterTarget && !vectorTarget) return;
    const targetFrame = vectorTarget?.frame ?? frame;
    const displayPoint = canvasPointToNormalized(pos.x, pos.y, targetFrame);
    if (displayPoint.x < 0 || displayPoint.x > 1 || displayPoint.y < 0 || displayPoint.y > 1) {
      setAdvancedFillStatus(
        vectorTarget
          ? vectorTarget.sourceElementCount > 0
            ? "페이지 안쪽의 닫힌 선화 영역을 탭하세요."
            : "페이지 안쪽을 탭하세요."
          : "선택한 래스터 레이어 안쪽을 탭하세요.",
      );
      return;
    }
    const mutationTicket = captureStudioMutationTicket();
    const historyIndex = pagesHiRef.current;
    const sourcePoint = rasterTarget
      ? flipNormalizedPoint(displayPoint, rasterTarget.flipped ?? false, rasterTarget.flippedY ?? false)
      : displayPoint;
    const targetId = rasterTarget?.id ?? vectorTarget!.id;
    const originalSrc = rasterTarget?.src ?? vectorTarget!.blankSrc;
    const previousPreview =
      advancedFillPreview?.targetId === targetId &&
      advancedFillPreview.originalSrc === originalSrc &&
      advancedFillPreview.historyIndex === historyIndex &&
      (!vectorTarget || advancedFillPreview.virtualTarget?.sourceFingerprint === vectorTarget.sourceFingerprint)
        ? advancedFillPreview
        : null;
    const workingSrc = previousPreview?.resultSrc ?? originalSrc;
    const runId = ++advancedFillRunIdRef.current;
    const controller = new AbortController();
    advancedFillAbortRef.current = controller;
    setAdvancedFillBusy(true);
    setAdvancedFillStatus("경계와 누수 가능성을 분석하고 있어요…");
    try {
      // The browser raster engine is only needed after an explicit fill gesture. Start loading it
      // beside the busy-state paint/reference preparation instead of charging every Studio launch.
      const advancedFillBrowserModulePromise = import("../studio-advanced-fill-browser");
      // Give React one paint opportunity so large source scans do not hide the busy state.
      await new Promise<void>((resolve) => globalThis.requestAnimationFrame(() => resolve()));
      if (
        runId !== advancedFillRunIdRef.current ||
        controller.signal.aborted ||
        pagesHiRef.current !== historyIndex
      ) return;
      let referenceSrc: string | undefined;
      // 래스터 경로에서 벡터 선화 참조를 빼고 진행했을 때 결과 문구 뒤에 붙일 사유.
      let vectorReferenceExclusion: string | null = null;
      const withVectorExclusionNotice = (message: string) =>
        vectorReferenceExclusion === null ? message : `${message} · ${vectorReferenceExclusion}`;
      if (vectorTarget) {
        const vectorInput = currentAdvancedFillVectorInput();
        const vectorPlan = planStudioAdvancedFillVectorTarget(vectorInput);
        if (!vectorPlan.ok) throw new Error(vectorPlan.reason);
        vectorTarget = vectorPlan.target;
        setAdvancedFillVirtualTarget(vectorTarget);
        const cachedReference = advancedFillVirtualReferenceRef.current;
        if (cachedReference?.fingerprint === vectorTarget.sourceFingerprint) {
          referenceSrc = cachedReference.dataUrl;
        } else {
          setAdvancedFillStatus("벡터 선화를 채우기 경계로 변환하고 있어요…");
          const renderedReference = await renderStudioAdvancedFillVectorReference(vectorInput, {
            rasterExecutionBackend: "offscreen-worker",
            signal: controller.signal,
          });
          if (renderedReference.fingerprint !== vectorTarget.sourceFingerprint) {
            throw new Error("벡터 선화가 변환 중 바뀌었습니다. 캔버스를 다시 탭해 주세요.");
          }
          advancedFillVirtualReferenceRef.current = {
            fingerprint: renderedReference.fingerprint,
            dataUrl: renderedReference.dataUrl,
          };
          referenceSrc = renderedReference.dataUrl;
        }
      } else if (rasterTarget && advancedFillSettings.referenceScope !== "current") {
        const referenceScope = advancedFillSettings.referenceScope;
        const layers = advancedFillRasterLayers.map((layer) =>
          layer.id === rasterTarget.id ? { ...layer, src: workingSrc } : layer
        );
        const vectorInput = currentAdvancedFillVectorInput();
        const vectorPlan = planStudioAdvancedFillVectorTarget(vectorInput);
        const pageReferences: StudioFillPageReference[] = [];
        if (vectorPlan.ok && vectorPlan.target.sourceElementCount > 0) {
          const cachedReference = advancedFillVirtualReferenceRef.current;
          let vectorReferenceSrc: string;
          if (cachedReference?.fingerprint === vectorPlan.target.sourceFingerprint) {
            vectorReferenceSrc = cachedReference.dataUrl;
          } else {
            setAdvancedFillStatus("래스터와 벡터 선화를 하나의 채우기 경계로 합성하고 있어요…");
            const renderedReference = await renderStudioAdvancedFillVectorReference(vectorInput, {
              rasterExecutionBackend: "offscreen-worker",
              signal: controller.signal,
            });
            if (renderedReference.fingerprint !== vectorPlan.target.sourceFingerprint) {
              throw new Error("벡터 선화가 변환 중 바뀌었습니다. 캔버스를 다시 탭해 주세요.");
            }
            advancedFillVirtualReferenceRef.current = {
              fingerprint: renderedReference.fingerprint,
              dataUrl: renderedReference.dataUrl,
            };
            vectorReferenceSrc = renderedReference.dataUrl;
          }
          pageReferences.push({
            id: `advanced-fill-page-reference-${vectorPlan.target.sourceFingerprint}`,
            name: "표시 벡터 선화",
            src: vectorReferenceSrc,
            pageWidth: vectorInput.width,
            pageHeight: vectorInput.height,
            fillReference: true,
          });
        } else if (!vectorPlan.ok) {
          // 여기서 벡터 선화 참조는 래스터 경계 위에 얹는 추가 경계일 뿐이다. 구조 손상,
          // 미지원 합성 또는 예산 초과로 참조를 못 만든 경우에도 채우기 전체를 막지 않는다.
          // 참조만 빼고 진행하고 무엇을 왜 뺐는지 결과에 붙인다. 적용 전까지는 미리보기라
          // 경계 하나 빠진 결과를 눈으로 확인할 수 있다.
          vectorReferenceExclusion = describeStudioAdvancedFillVectorReferenceExclusion(vectorPlan);
        }
        const scopedRasterReferences = collectOverlappingStudioFillReferenceLayers(
          layers,
          rasterTarget.id,
          referenceScope,
        );
        if (pageReferences.length === 0 && scopedRasterReferences.length === 0) {
          // 합성할 참조가 하나도 남지 않았다. 이 상태로 합성기를 부르면 "참조할 표시 래스터
          // 레이어가 없습니다"로 던져 채우기가 그대로 멈추고, 정작 벡터 선화를 왜 뺐는지는
          // catch 로 흘러가 사라진다 — 축소해서 진행한다는 계약이 무너진다.
          //
          // 참조가 비는 건 대상 하나만 있는 페이지에서 흔하다. 참조 범위는 대상 자신을 늘
          // 제외하므로(studio-fill-reference.ts `collectStudioFillReferenceLayers`), 선화가
          // 유일한 참조였다가 빠지면 곧바로 0이 된다. 대상 레이어 자체를 경계로 삼아
          // 진행하고(현재 레이어 범위와 같은 동작) 두 사실을 모두 문구에 싣는다.
          referenceSrc = undefined;
          const emptyReferenceNotice = "참조로 남은 레이어가 없어 대상 레이어만 경계로 사용했어요.";
          vectorReferenceExclusion = vectorReferenceExclusion === null
            ? emptyReferenceNotice
            : `${vectorReferenceExclusion} ${emptyReferenceNotice}`;
        } else {
          const projectedLayerIds = new Set([
            rasterTarget.id,
            ...scopedRasterReferences.map(({ id }) => id),
          ]);
          const { withStudioRasterSourceProjection } = await import("../render/studio-raster-source-projection"
          );
          const composed = await withStudioRasterSourceProjection({
            consumer: "studio-advanced-fill-reference",
            signal: controller.signal,
            values: layers.filter(({ id }) => projectedLayerIds.has(id)),
            run: async (projectedLayers) => {
              const projectedById = new Map(
                projectedLayers.map((layer) => [layer.id, layer] as const),
              );
              return composeStudioFillReferenceImageWithPageReferences(
                layers.map((layer) => projectedById.get(layer.id) ?? layer),
                rasterTarget.id,
                referenceScope,
                pageReferences,
                undefined,
                controller.signal,
              );
            },
          });
          referenceSrc = composed.dataUrl;
        }
      }
      if (
        runId !== advancedFillRunIdRef.current ||
        controller.signal.aborted ||
        pagesHiRef.current !== historyIndex
      ) return;
      const {
        runStudioAdvancedFillInBrowser,
        studioAdvancedFillResultMessage,
        summarizeStudioAdvancedFillPreview,
      } = await advancedFillBrowserModulePromise;
      if (
        runId !== advancedFillRunIdRef.current ||
        controller.signal.aborted ||
        pagesHiRef.current !== historyIndex
      ) return;
      const result = await runStudioAdvancedFillInBrowser({
        targetSrc: workingSrc,
        referenceSrc,
        alphaLockSrc: rasterTarget && shouldClipToExistingAlpha(rasterTarget) ? rasterTarget.src : undefined,
        intentionalWholeCanvasFill: vectorTarget?.sourceElementCount === 0,
        xRatio: sourcePoint.x,
        yRatio: sourcePoint.y,
        fillColor: color,
        settings: advancedFillSettings,
        createSelectionMask: rasterTarget
          ? (width, height) => createAdvancedFillSelectionMask(rasterTarget, width, height)
          : undefined,
        abort: controller.signal,
      });
      if (
        runId !== advancedFillRunIdRef.current ||
        controller.signal.aborted ||
        pagesHiRef.current !== historyIndex
      ) return;
      if (!canApplyStudioMutation(mutationTicket)) return;
      if (rasterTarget) {
        const current = activeElementsRef.current.find((element) => element.id === rasterTarget.id);
        if (!current || current.type !== "image" || current.src !== rasterTarget.src) return;
      } else if (vectorTarget) {
        const currentPlan = planStudioAdvancedFillVectorTarget(currentAdvancedFillVectorInput());
        if (
          !currentPlan.ok ||
          currentPlan.target.pageId !== vectorTarget.pageId ||
          currentPlan.target.sourceFingerprint !== vectorTarget.sourceFingerprint ||
          currentPlan.target.id !== vectorTarget.id
        ) return;
      }
      const message = studioAdvancedFillResultMessage(result);
      if (!result.changed) {
        // 빠진 경계가 곧 누수 보호가 막은 이유일 수 있다 — 배너에도 사유를 함께 싣는다.
        const blockedMessage = withVectorExclusionNotice(message);
        setAdvancedFillStatus(blockedMessage);
        if (result.blockedReason) setError(blockedMessage);
        return;
      }
      const diagnostics = result.diagnostics;
      const previewSummary = summarizeStudioAdvancedFillPreview(message, diagnostics, previousPreview);
      // 누적 미리보기는 요약 문구가 원본 문구를 대체하므로 제외 사유는 요약 뒤에 붙인다.
      // 앞이 아니라 뒤인 것도 계약이다 — 패널이 "누적 미리보기" 접두사로 누적 여부를 읽는다.
      const previewMessage = withVectorExclusionNotice(previewSummary.message);
      setAdvancedFillPreview({
        targetId: rasterTarget?.id ?? vectorTarget!.id,
        originalSrc: rasterTarget?.src ?? vectorTarget!.blankSrc,
        historyIndex,
        resultSrc: result.dataUrl,
        diagnostics,
        message: previewMessage,
        paintedPixelCount: previewSummary.paintedPixelCount,
        regionCount: previewSummary.regionCount,
        ...(vectorTarget ? { virtualTarget: vectorTarget } : null),
      });
      setAdvancedFillStatus(previewMessage);
      if (!advancedFillSettings.continuousFill) setAdvancedFillActive(false);
      setError(null);
    } catch (err) {
      if (runId !== advancedFillRunIdRef.current || controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : "고급 채우기에 실패했습니다.";
      setAdvancedFillStatus(message);
      setError(message);
    } finally {
      if (runId === advancedFillRunIdRef.current) {
        setAdvancedFillBusy(false);
        advancedFillAbortRef.current = null;
      }
    }
  }
}
