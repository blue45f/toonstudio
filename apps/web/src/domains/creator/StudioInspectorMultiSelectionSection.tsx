import { r3c07StatusText } from "./studio-panel-status-i18n-r3c07";
import { useId, useMemo, useState } from "react";

import { collectStudioDocumentColors } from "./studio-document-colors";
import { isEffectivelyLocked } from "./studio-layers";
import {
  applyStudioMultiSelectionStrokeColor,
  applyStudioMultiSelectionStrokeWidth,
  resolveStudioMultiSelectionStrokeColor,
  resolveStudioMultiSelectionStrokeWidth,
  STUDIO_MULTI_SELECTION_STROKE_WIDTH_MIN,
  STUDIO_MULTI_SELECTION_STROKE_WIDTH_STEP,
} from "./studio-multi-selection-color";
import { StudioColorField } from "./StudioColorField";
import { StudioInspectorBatchRenameSection } from "./StudioInspectorBatchRenameSection";
import { StudioInspectorSelectionActions } from "./StudioInspectorOrderAlignSection";
import { StudioInspectorMutationLockNotice } from "./StudioInspectorUtilityPanels";

import type { El } from "./studio-element-model";
import type { StudioInspectorAsideModel } from "./useStudioInspectorAsideModel";

/**
 * Multi-selection Inspector body.
 *
 * Representative-only appearance/text controls stay hidden, but selection-wide commands no longer
 * disappear with them. The same handlers used by the canvas and single-selection Inspector are
 * surfaced here under one mutation gate, so lock/session policy and undo semantics remain shared.
 */
export function StudioInspectorMultiSelectionSection({
  model,
}: {
  model: StudioInspectorAsideModel;
}) {
  const {
    alignSelected,
    announceDrawingShortcut,
    commit,
    commitCoalesced,
    elements,
    ensureRecentColorsLoaded,
    finishPatchElCoalescing,
    groups,
    disarmAllPixelTools,
    duplicateSelected,
    inspectorInteractionPolicy,
    inspectorTransientOwners,
    marqueeIds,
    recentColors,
    rememberColor,
    removeSelected,
    reorder,
    requestInspectorColorSample,
  } = model;
  const documentColors = useMemo(
    () => collectStudioDocumentColors(elements),
    [elements],
  );
  // 잠긴 요소(자기 자신 또는 소속 그룹이 잠김)는 정렬·이동처럼 일괄 스타일에서도 바뀌지 않는다.
  // 인스펙터 잠금 게이트는 단일 선택만 보므로 여기서 대상에서 뺀다.
  const targetOptions = useMemo(
    () => ({ isLocked: (element: El) => isEffectivelyLocked(element, groups) }),
    [groups],
  );
  const strokeColorState = useMemo(
    () => resolveStudioMultiSelectionStrokeColor(elements, marqueeIds, targetOptions),
    [elements, marqueeIds, targetOptions],
  );
  const strokeWidthState = useMemo(
    () => resolveStudioMultiSelectionStrokeWidth(elements, marqueeIds, targetOptions),
    [elements, marqueeIds, targetOptions],
  );
  const selectionKey = [...marqueeIds].sort().join(",");
  // 슬라이더 위쪽 끝은 선택이 바뀔 때(또는 더 굵은 선이 생길 때)만 올려 잡는다. 끌 때마다 "지금 가장 굵은 선"으로 다시
  // 계산하면 끄는 동안 값이 줄어드는 것을 따라 위쪽 끝도 줄어, 굵은 선이 의도보다 가늘어지고 다시 올릴 수도 없게 된다.
  const [sliderCap, setSliderCap] = useState({ key: selectionKey, max: strokeWidthState.max });
  let sliderMax = sliderCap.max;
  if (sliderCap.key !== selectionKey || strokeWidthState.max > sliderCap.max) {
    sliderMax = sliderCap.key !== selectionKey ? strokeWidthState.max : Math.max(sliderCap.max, strokeWidthState.max);
    setSliderCap({ key: selectionKey, max: sliderMax });
  }
  const strokeWidthId = useId();
  const strokeColorHistoryKey = `color:multi:${selectionKey}:stroke`;
  const strokeWidthHistoryKey = `width:multi:${selectionKey}:stroke`;
  const applyStrokeWidth = (width: number): void => {
    const next = applyStudioMultiSelectionStrokeWidth(elements, marqueeIds, width, sliderMax, targetOptions);
    if (next.every((element, index) => element === elements[index])) return;
    if (commitCoalesced) {
      commitCoalesced(next, strokeWidthHistoryKey);
      return;
    }
    commit(next);
  };
  const applyStrokeColor = (color: string | null, preview: boolean): void => {
    const next = applyStudioMultiSelectionStrokeColor(elements, marqueeIds, color, targetOptions);
    if (next.every((element, index) => element === elements[index])) return;
    if (preview && commitCoalesced) {
      commitCoalesced(next, strokeColorHistoryKey);
      return;
    }
    commit(next);
  };

  if (marqueeIds.length < 2) return null;

  return (
    <section
      data-testid="studio-inspector-context-multi-selection"
      data-studio-multi-selection-count={marqueeIds.length}
      aria-label={`${marqueeIds.length}개 선택 묶음 작업`}
      className="rounded-xl border border-line bg-panel/40 p-3"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-extrabold tracking-tight text-fg">선택 묶음 작업</p>
          <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-fg-3">
            공통 선 색상과 배치·순서·이름 작업을 선택 전체에 한 번에 적용합니다.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[0.6875rem] font-bold tabular-nums text-accent">
          {marqueeIds.length}개
        </span>
      </div>

      <StudioInspectorMutationLockNotice
        gate={inspectorInteractionPolicy.selection}
        hasActiveSession={inspectorTransientOwners.length > 0}
        onExit={disarmAllPixelTools}
      />

      <fieldset
        disabled={inspectorInteractionPolicy.selection.disabled}
        title={inspectorInteractionPolicy.selection.reason}
        className="m-0 min-w-0 border-0 p-0 disabled:[&_button]:cursor-not-allowed disabled:[&_button]:opacity-50"
      >
        <legend className="sr-only">다중 선택 공통 스타일과 빠른 작업</legend>
        {strokeColorState.targets.length > 0 ? (
          <div
            className="mb-3 space-y-1.5 rounded-xl border border-line/55 bg-card/55 p-2.5"
            data-testid="studio-multi-selection-stroke-color"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[0.66rem] font-semibold uppercase tracking-wider text-fg-3">
                공통 선 스타일
              </p>
              <span className="text-[0.6rem] tabular-nums text-fg-3">
                {strokeColorState.targets.length}개 요소
              </span>
            </div>
            <StudioColorField
              label="선 색상"
              value={strokeColorState.value}
              purpose="stroke"
              recentColors={recentColors}
              documentColors={documentColors}
              allowNone
              noneLabel="선 없음"
              mixed={strokeColorState.mixed}
              onChange={(color) => applyStrokeColor(color, false)}
              onPreview={(color) => applyStrokeColor(color, true)}
              onUseColor={rememberColor}
              onLoadRecentColors={ensureRecentColorsLoaded}
              onInteractionEnd={finishPatchElCoalescing}
              onRequestCanvasEyedropper={
                requestInspectorColorSample
                  ? () =>
                      requestInspectorColorSample((color) => {
                        applyStrokeColor(color, false);
                        rememberColor(color);
                      })
                  : undefined
              }
            />
            {strokeWidthState.value !== null ? (
              <div
                className="flex min-h-11 items-center justify-between gap-2"
                data-testid="studio-multi-selection-stroke-width"
              >
                <label htmlFor={strokeWidthId} className="text-xs font-semibold text-fg-2">
                  선 두께
                </label>
                <span className="flex items-center gap-2">
                  <input
                    id={strokeWidthId}
                    type="range"
                    min={STUDIO_MULTI_SELECTION_STROKE_WIDTH_MIN}
                    max={sliderMax}
                    step={STUDIO_MULTI_SELECTION_STROKE_WIDTH_STEP}
                    value={Math.min(sliderMax, strokeWidthState.value)}
                    aria-valuetext={
                      strokeWidthState.mixed
                        ? "서로 다른 두께"
                        : strokeWidthState.implicit
                          ? "기본 두께"
                          : `${strokeWidthState.value.toFixed(1)}픽셀`
                    }
                    onChange={(event) => applyStrokeWidth(Number(event.target.value))}
                    onPointerUp={finishPatchElCoalescing}
                    onKeyUp={finishPatchElCoalescing}
                    onBlur={finishPatchElCoalescing}
                    className="h-2 w-24 cursor-pointer accent-accent sm:w-28"
                  />
                  <output htmlFor={strokeWidthId} className="w-14 text-right text-xs tabular-nums text-fg-3">
                    {strokeWidthState.mixed ? "섞임" : strokeWidthState.implicit ? "기본" : `${strokeWidthState.value.toFixed(1)}px`}
                  </output>
                </span>
              </div>
            ) : null}
            <p className="text-[0.6rem] leading-snug text-fg-3">
              {strokeColorState.mixed
                ? "서로 다른 선 상태입니다. 새 색을 고르면 선택한 요소에 동일하게 적용됩니다."
                : strokeColorState.includesNone
                  ? "선이 없는 요소들입니다. 색을 고르면 선 두께 3px로 시작합니다."
                  : "선 색상을 선택 묶음 전체에서 함께 변경합니다."}
            </p>
            {strokeColorState.lockedCount > 0 ? (
              <p className="text-[0.6rem] leading-snug text-fg-3" data-testid="studio-multi-selection-locked-note">
                잠긴 요소 {strokeColorState.lockedCount}개는 선 스타일이 바뀌지 않아요. 잠금을 풀면 함께 바꿀 수 있어요.
              </p>
            ) : null}
          </div>
        ) : strokeColorState.lockedCount > 0 ? (
          <p className="mb-3 text-[0.6rem] leading-snug text-fg-3" data-testid="studio-multi-selection-locked-note">
            {r3c07StatusText("studio.panelStatus.r3c07.inspectorMultiSelection.lockedNote", "선택한 선 요소가 모두 잠겨 있어 선 스타일을 바꿀 수 없어요. 잠금을 풀면 바꿀 수 있어요.")}
          </p>
        ) : null}
        <StudioInspectorSelectionActions
          selectionCount={marqueeIds.length}
          reorder={reorder}
          alignSelected={alignSelected}
          duplicateSelected={duplicateSelected}
          removeSelected={removeSelected}
        />
        <StudioInspectorBatchRenameSection
          elements={elements}
          selectedIds={marqueeIds}
          groups={groups}
          commit={(next) => !inspectorInteractionPolicy.selection.disabled && commit(next)}
          announce={announceDrawingShortcut}
        />
      </fieldset>
    </section>
  );
}
