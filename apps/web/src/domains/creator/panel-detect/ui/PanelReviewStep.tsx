"use no memo";
// 문구는 usePanelT()(useT 를 감싼 훅)가 돌려주는 해소 함수 t 로 만든다. 같은 언어에서는 t 가 그대로라서 React Compiler 가 t("…")
// 결과를 캐시하면, 나중에 도착하는 런타임 번역(번역 번들 갱신)이 열려 있는 화면에 반영되지 않는다. 그래서 이 화면의 컴포넌트 파일은 메모이제이션에서 뺀다.

import { ArrowRight, Combine, Maximize, MousePointer2, Redo2, Scissors, SquarePlus, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, type Dispatch, type ReactElement } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import {
  addPanel,
  applyReadingOrder,
  mergePanels,
  movePanelBy,
  movePanelInOrder,
  removePanel,
  setPanelRect,
  splitPanel,
  type PanelEditState,
} from "../panel-detect-edit";
import {
  PANEL_ZOOM_STEPS,
  canRedoPanelEdit,
  canUndoPanelEdit,
  hasPanelEdits,
  type PanelEditSelect,
  type PanelEditTool,
  type PanelEditorAction,
  type PanelEditorState,
} from "../panel-editor-state";

import { PanelCanvasEditor } from "./PanelCanvasEditor";
import { PanelCutInspector } from "./PanelCutInspector";
import { PanelCutList } from "./PanelCutList";
import { PanelDetectControls } from "./PanelDetectControls";
import { PanelNotice } from "./PanelNotice";
import { confidenceLabel, detectWarningText } from "./panel-import-copy";
import { PANEL_FOCUS_RING, PANEL_HEADING, PANEL_HINT, PANEL_SMALL_BUTTON, PANEL_SURFACE, panelChipClass } from "./panel-import-styles";
import { usePanelT } from "./use-panel-t";
import { useStepHeadingFocus } from "./use-step-heading-focus";

import type { PanelDetectResult, PanelDetectSensitivity, PanelRect, PanelReadingOrder } from "../panel-detect-types";

interface PanelReviewStepProps {
  readonly imageUrl: string;
  readonly result: PanelDetectResult;
  readonly editor: PanelEditorState;
  readonly dispatch: Dispatch<PanelEditorAction>;
  readonly sensitivity: PanelDetectSensitivity;
  readonly detectBusy: boolean;
  readonly tightenBusy: boolean;
  readonly onSensitivity: (value: PanelDetectSensitivity) => void;
  readonly onRerun: () => void;
  readonly onTighten: (id: string) => void;
  readonly onNext: () => void;
}

const TOOLS: ReadonlyArray<{ readonly tool: PanelEditTool; readonly labelKey: string; readonly Icon: typeof MousePointer2 }> = [
  { tool: "select", labelKey: "panelImport.tool.select", Icon: MousePointer2 },
  { tool: "draw", labelKey: "panelImport.tool.draw", Icon: SquarePlus },
  { tool: "split-horizontal", labelKey: "panelImport.tool.splitHorizontal", Icon: Scissors },
  { tool: "split-vertical", labelKey: "panelImport.tool.splitVertical", Icon: Scissors },
];

function newPanelId(next: PanelEditState, previous: PanelEditState): string | null {
  const known = new Set(previous.panels.map((panel) => panel.id));
  return next.panels.find((panel) => !known.has(panel.id))?.id ?? null;
}

/** 2단계 — 컷 후보를 이미지 위에서 확인하고 추가·삭제·끌기·순서 편집으로 고친다. */
export function PanelReviewStep(props: PanelReviewStepProps): ReactElement {
  const t = usePanelT();
  const { result, editor, dispatch } = props;
  const headingRef = useStepHeadingFocus<HTMLHeadingElement>();
  const state = editor.history.present;
  const image = useMemo(() => ({ width: state.imageWidth, height: state.imageHeight }), [state.imageWidth, state.imageHeight]);
  const selected = state.panels.find((panel) => panel.id === editor.selectedId) ?? null;
  const selectedOrder = selected ? state.panels.indexOf(selected) + 1 : 0;
  const suggestions = selected?.warnings.includes("bridged-gutter-suspected")
    ? result.suggestions.filter((suggestion) => suggestion.panelId === selected.id)
    : [];

  const edit = (
    apply: (current: PanelEditState) => PanelEditState,
    announce: string,
    select?: PanelEditSelect,
  ): void => dispatch({ type: "edit", apply, announce, select });

  const addedSelection = (next: PanelEditState, previous: PanelEditState): string | null => newPanelId(next, previous);

  const onSetRect = (id: string, rect: PanelRect): void =>
    edit((current) => setPanelRect(current, id, rect), t("panelImport.review.announce.rectChanged"));
  const onSplit = (id: string, orientation: "horizontal" | "vertical", position: number): void =>
    edit((current) => splitPanel(current, id, orientation, position), t("panelImport.review.announce.split"), (next, previous) => newPanelId(next, previous));
  const onDelete = (id: string): void => {
    const order = state.panels.findIndex((panel) => panel.id === id) + 1;
    edit((current) => removePanel(current, id), t("panelImport.review.announce.deleted", { order }));
  };
  const onMoveInOrder = (id: string, direction: -1 | 1): void => {
    const order = state.panels.findIndex((panel) => panel.id === id) + 1;
    edit((current) => movePanelInOrder(current, id, direction), t(direction < 0 ? "panelImport.review.announce.movedEarlier" : "panelImport.review.announce.movedLater", { order }));
  };
  // 끌기 없이도(키보드·보조 기기) 컷을 만들 수 있게, 이미지 전체를 한 컷으로 시작하는 길을 둔다. 만든 뒤 숫자로 고치거나 선으로 나눈다.
  const onAddWhole = (): void =>
    edit(
      (current) => addPanel(current, { x: 0, y: 0, width: current.imageWidth, height: current.imageHeight }),
      t("panelImport.review.announce.addedWhole"),
      addedSelection,
    );
  const onAdopt = (rect: PanelRect): void =>
    edit((current) => addPanel(current, rect), t("panelImport.review.announce.adopted"), addedSelection);
  const onMerge = (): void => {
    const ids = [...editor.checkedIds];
    edit((current) => mergePanels(current, ids), t("panelImport.review.announce.merged", { count: ids.length }), addedSelection);
  };
  const onReadingOrder = (order: PanelReadingOrder): void =>
    edit((current) => applyReadingOrder(current, order), t("panelImport.review.announce.reordered"));

  // 되돌리기/다시하기 단축키(Ctrl/⌘+Z, Shift 포함·Y). 글자 입력칸 안에서는 입력칸의 되돌리기를 방해하지 않는다.
  // 키보드 이벤트는 이 구역 안에서만 듣고 떠날 때 해제한다(DOM 이벤트 동기화).
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return undefined;
    const onShortcut = (event: KeyboardEvent): void => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        dispatch({ type: "undo", announce: t("panelImport.review.announce.undone") });
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        dispatch({ type: "redo", announce: t("panelImport.review.announce.redone") });
      }
    };
    node.addEventListener("keydown", onShortcut);
    return () => { node.removeEventListener("keydown", onShortcut); };
  }, [dispatch, t]);

  const zoomIndex = PANEL_ZOOM_STEPS.findIndex((step) => step === editor.zoom);
  const zoomBy = (delta: number): void => {
    const next = PANEL_ZOOM_STEPS[Math.max(0, Math.min(PANEL_ZOOM_STEPS.length - 1, (zoomIndex < 0 ? 0 : zoomIndex) + delta))];
    dispatch({ type: "set-zoom", zoom: next });
  };
  const level = result.panels.length === 0 ? null : result.level;
  const mergeReady = editor.checkedIds.length >= 2;

  return (
    <section ref={sectionRef} className={PANEL_SURFACE} aria-labelledby="panel-review-title">
      <h3 ref={headingRef} id="panel-review-title" className={PANEL_HEADING} data-panel-step-heading="review" tabIndex={-1}>
        {t("panelImport.review.title")}
      </h3>
      <p className="mt-1 text-sm text-fg-2" role="status">
        {state.panels.length === 0
          ? t("panelImport.review.none")
          : t("panelImport.review.count", { count: state.panels.length })}
        {level ? ` · ${t("panelImport.review.confidence", { level: confidenceLabel(t, level), percent: Math.round(result.confidence * 100) })}` : ""}
      </p>
      {result.warnings.length > 0 ? (
        <ul className="mt-2 grid gap-1.5">
          {result.warnings.map((warning) => (
            <li key={warning}><PanelNotice tone={warning === "downsampled" ? "info" : "warn"} live="off">{detectWarningText(t, warning)}</PanelNotice></li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1.5" role="toolbar" aria-label={t("panelImport.review.toolbar")}>
        {TOOLS.map(({ tool, labelKey, Icon }) => (
          <button
            key={tool}
            type="button"
            aria-pressed={editor.tool === tool}
            onClick={() => dispatch({ type: "set-tool", tool })}
            className={panelChipClass(editor.tool === tool)}
          >
            <Icon size={14} className={tool === "split-vertical" ? "rotate-90" : undefined} aria-hidden="true" />
            {t(labelKey)}
          </button>
        ))}
        <button type="button" onClick={onAddWhole} className={PANEL_SMALL_BUTTON}>
          <Maximize size={14} aria-hidden="true" />
          {t("panelImport.review.wholeImage")}
        </button>
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
        <button type="button" onClick={() => dispatch({ type: "undo", announce: t("panelImport.review.announce.undone") })} disabled={!canUndoPanelEdit(editor)} className={PANEL_SMALL_BUTTON}>
          <Undo2 size={14} aria-hidden="true" />{t("panelImport.review.undo")}
        </button>
        <button type="button" onClick={() => dispatch({ type: "redo", announce: t("panelImport.review.announce.redone") })} disabled={!canRedoPanelEdit(editor)} className={PANEL_SMALL_BUTTON}>
          <Redo2 size={14} aria-hidden="true" />{t("panelImport.review.redo")}
        </button>
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
        <button type="button" onClick={() => zoomBy(-1)} disabled={zoomIndex <= 0} aria-label={t("panelImport.review.zoomOut")} className={PANEL_SMALL_BUTTON}>
          <ZoomOut size={14} aria-hidden="true" />
        </button>
        <span className="min-w-12 text-center text-xs font-bold tabular-nums text-fg-2" aria-label={t("panelImport.review.zoomLabel", { percent: Math.round(editor.zoom * 100) })}>{Math.round(editor.zoom * 100)}%</span>
        <button type="button" onClick={() => zoomBy(1)} disabled={zoomIndex === PANEL_ZOOM_STEPS.length - 1} aria-label={t("panelImport.review.zoomIn")} className={PANEL_SMALL_BUTTON}>
          <ZoomIn size={14} aria-hidden="true" />
        </button>
      </div>
      <p className={cn(PANEL_HINT, "mt-1.5")}>
        {editor.tool === "select"
          ? t("panelImport.review.hint.select")
          : editor.tool === "draw"
            ? t("panelImport.review.hint.draw")
            : t("panelImport.review.hint.split")}
      </p>

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <PanelCanvasEditor
          imageUrl={props.imageUrl}
          image={image}
          panels={state.panels}
          selectedId={editor.selectedId}
          tool={editor.tool}
          undetectable={result.undetectable}
          ignored={result.ignored}
          zoom={editor.zoom}
          onSelect={(id) => dispatch({ type: "select", id })}
          onSetRect={onSetRect}
          onMoveBy={(id, dx, dy) => edit((current) => movePanelBy(current, id, dx, dy), t("panelImport.review.announce.moved"))}
          onDraw={(rect) => edit((current) => addPanel(current, rect), t("panelImport.review.announce.drawn"), addedSelection)}
          onSplit={onSplit}
          onDelete={onDelete}
          onAdopt={onAdopt}
        />
        <div className="grid min-w-0 content-start gap-3">
          <PanelDetectControls
            readingOrder={state.readingOrder}
            sensitivity={props.sensitivity}
            hasEdits={hasPanelEdits(editor)}
            busy={props.detectBusy}
            onReadingOrder={onReadingOrder}
            onSensitivity={props.onSensitivity}
            onRerun={props.onRerun}
          />
          <PanelCutInspector
            panel={selected}
            order={selectedOrder}
            suggestions={suggestions}
            busy={props.tightenBusy}
            onSetRect={onSetRect}
            onTighten={props.onTighten}
            onSplit={onSplit}
          />
          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-black text-fg">{t("panelImport.review.listTitle")}</h4>
              <button type="button" disabled={!mergeReady} onClick={onMerge} className={PANEL_SMALL_BUTTON}>
                <Combine size={14} aria-hidden="true" />
                {t("panelImport.review.merge")}
              </button>
            </div>
            <PanelCutList
              panels={state.panels}
              selectedId={editor.selectedId}
              checkedIds={new Set(editor.checkedIds)}
              onSelect={(id) => dispatch({ type: "select", id })}
              onToggleChecked={(id) => dispatch({ type: "toggle-checked", id })}
              onMove={onMoveInOrder}
              onDelete={onDelete}
            />
          </div>
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite" data-panel-announcer="true">{editor.announcement}</p>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        {state.panels.length === 0 ? (
          <p className={PANEL_HINT}>{t("panelImport.review.needOne")}</p>
        ) : null}
        <button
          type="button"
          disabled={state.panels.length === 0}
          onClick={props.onNext}
          className={cn(buttonClass({ size: "lg" }), PANEL_FOCUS_RING)}
        >
          {t("panelImport.review.next")}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
