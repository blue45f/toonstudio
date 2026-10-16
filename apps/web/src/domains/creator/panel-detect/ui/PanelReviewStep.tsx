"use no memo";
// 문구가 전역 언어를 읽는 bi() 로 만들어져서, 언어를 바꾸면 열려 있는 화면도 바로 다시 그려야 한다.
// React Compiler 가 상수 인자의 bi() 결과를 캐시하면 이전 언어가 남으므로 이 파일은 메모이제이션에서 뺀다(panel-import-bi.ts 참고).

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
import { bi, confidenceLabel, detectWarningText } from "./panel-import-copy";
import { PANEL_FOCUS_RING, PANEL_HEADING, PANEL_HINT, PANEL_SMALL_BUTTON, PANEL_SURFACE, panelChipClass } from "./panel-import-styles";

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

const TOOLS: ReadonlyArray<{ readonly tool: PanelEditTool; readonly ko: string; readonly en: string; readonly Icon: typeof MousePointer2 }> = [
  { tool: "select", ko: "선택·이동", en: "Select / move", Icon: MousePointer2 },
  { tool: "draw", ko: "새 컷 그리기", en: "Draw panel", Icon: SquarePlus },
  { tool: "split-horizontal", ko: "가로선으로 나누기", en: "Split horizontally", Icon: Scissors },
  { tool: "split-vertical", ko: "세로선으로 나누기", en: "Split vertically", Icon: Scissors },
];

function newPanelId(next: PanelEditState, previous: PanelEditState): string | null {
  const known = new Set(previous.panels.map((panel) => panel.id));
  return next.panels.find((panel) => !known.has(panel.id))?.id ?? null;
}

/** 2단계 — 컷 후보를 이미지 위에서 확인하고 추가·삭제·끌기·순서 편집으로 고친다. */
export function PanelReviewStep(props: PanelReviewStepProps): ReactElement {
  const { result, editor, dispatch } = props;
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
    edit((current) => setPanelRect(current, id, rect), bi("컷의 위치와 크기를 바꿨어요.", "Panel position and size changed."));
  const onSplit = (id: string, orientation: "horizontal" | "vertical", position: number): void =>
    edit((current) => splitPanel(current, id, orientation, position), bi("컷을 둘로 나눴어요.", "Panel split in two."), (next, previous) => newPanelId(next, previous));
  const onDelete = (id: string): void => {
    const order = state.panels.findIndex((panel) => panel.id === id) + 1;
    edit((current) => removePanel(current, id), bi(`${order}번 컷을 삭제했어요.`, `Panel ${order} deleted.`));
  };
  const onMoveInOrder = (id: string, direction: -1 | 1): void => {
    const order = state.panels.findIndex((panel) => panel.id === id) + 1;
    edit((current) => movePanelInOrder(current, id, direction), bi(`${order}번 컷을 ${direction < 0 ? "앞으로" : "뒤로"} 옮겼어요.`, `Panel ${order} moved ${direction < 0 ? "earlier" : "later"}.`));
  };
  // 끌기 없이도(키보드·보조 기기) 컷을 만들 수 있게, 이미지 전체를 한 컷으로 시작하는 길을 둔다. 만든 뒤 숫자로 고치거나 선으로 나눈다.
  const onAddWhole = (): void =>
    edit(
      (current) => addPanel(current, { x: 0, y: 0, width: current.imageWidth, height: current.imageHeight }),
      bi("이미지 전체를 한 컷으로 추가했어요. 숫자로 고치거나 선으로 나눌 수 있어요.", "Added the whole image as one panel. Adjust it numerically or split it with a line."),
      addedSelection,
    );
  const onAdopt = (rect: PanelRect): void =>
    edit((current) => addPanel(current, rect), bi("영역을 컷으로 추가했어요.", "Region added as a panel."), addedSelection);
  const onMerge = (): void => {
    const ids = [...editor.checkedIds];
    edit((current) => mergePanels(current, ids), bi(`컷 ${ids.length}개를 하나로 합쳤어요.`, `Merged ${ids.length} panels into one.`), addedSelection);
  };
  const onReadingOrder = (order: PanelReadingOrder): void =>
    edit((current) => applyReadingOrder(current, order), bi("읽기 순서를 다시 정렬했어요.", "Reading order re-sorted."));

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
        dispatch({ type: "undo", announce: bi("되돌렸어요.", "Undone.") });
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        dispatch({ type: "redo", announce: bi("다시 적용했어요.", "Redone.") });
      }
    };
    node.addEventListener("keydown", onShortcut);
    return () => { node.removeEventListener("keydown", onShortcut); };
  }, [dispatch]);

  const zoomIndex = PANEL_ZOOM_STEPS.findIndex((step) => step === editor.zoom);
  const zoomBy = (delta: number): void => {
    const next = PANEL_ZOOM_STEPS[Math.max(0, Math.min(PANEL_ZOOM_STEPS.length - 1, (zoomIndex < 0 ? 0 : zoomIndex) + delta))];
    dispatch({ type: "set-zoom", zoom: next });
  };
  const level = result.panels.length === 0 ? null : result.level;
  const mergeReady = editor.checkedIds.length >= 2;

  return (
    <section ref={sectionRef} className={PANEL_SURFACE} aria-labelledby="panel-review-title">
      <h3 id="panel-review-title" className={PANEL_HEADING} data-panel-step-heading="review" tabIndex={-1}>
        {bi("2. 컷 확인과 고치기", "2. Review and fix panels")}
      </h3>
      <p className="mt-1 text-sm text-fg-2" role="status">
        {state.panels.length === 0
          ? bi("컷이 없어요.", "No panels.")
          : bi(`컷 ${state.panels.length}개`, `${state.panels.length} panel(s)`)}
        {level ? bi(` · 자동 감지 전체 신뢰도 ${confidenceLabel(level)}(${Math.round(result.confidence * 100)}%)`, ` · overall detection confidence: ${confidenceLabel(level)} (${Math.round(result.confidence * 100)}%)`) : ""}
      </p>
      {result.warnings.length > 0 ? (
        <ul className="mt-2 grid gap-1.5">
          {result.warnings.map((warning) => (
            <li key={warning}><PanelNotice tone={warning === "downsampled" ? "info" : "warn"} live="off">{detectWarningText(warning)}</PanelNotice></li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1.5" role="toolbar" aria-label={bi("컷 편집 도구", "Panel editing tools")}>
        {TOOLS.map(({ tool, ko, en, Icon }) => (
          <button
            key={tool}
            type="button"
            aria-pressed={editor.tool === tool}
            onClick={() => dispatch({ type: "set-tool", tool })}
            className={panelChipClass(editor.tool === tool)}
          >
            <Icon size={14} className={tool === "split-vertical" ? "rotate-90" : undefined} aria-hidden="true" />
            {bi(ko, en)}
          </button>
        ))}
        <button type="button" onClick={onAddWhole} className={PANEL_SMALL_BUTTON}>
          <Maximize size={14} aria-hidden="true" />
          {bi("전체를 한 컷으로", "Whole image as a panel")}
        </button>
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
        <button type="button" onClick={() => dispatch({ type: "undo", announce: bi("되돌렸어요.", "Undone.") })} disabled={!canUndoPanelEdit(editor)} className={PANEL_SMALL_BUTTON}>
          <Undo2 size={14} aria-hidden="true" />{bi("되돌리기", "Undo")}
        </button>
        <button type="button" onClick={() => dispatch({ type: "redo", announce: bi("다시 적용했어요.", "Redone.") })} disabled={!canRedoPanelEdit(editor)} className={PANEL_SMALL_BUTTON}>
          <Redo2 size={14} aria-hidden="true" />{bi("다시하기", "Redo")}
        </button>
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
        <button type="button" onClick={() => zoomBy(-1)} disabled={zoomIndex <= 0} aria-label={bi("축소", "Zoom out")} className={PANEL_SMALL_BUTTON}>
          <ZoomOut size={14} aria-hidden="true" />
        </button>
        <span className="min-w-12 text-center text-xs font-bold tabular-nums text-fg-2" aria-label={bi(`확대 ${Math.round(editor.zoom * 100)}%`, `Zoom ${Math.round(editor.zoom * 100)}%`)}>{Math.round(editor.zoom * 100)}%</span>
        <button type="button" onClick={() => zoomBy(1)} disabled={zoomIndex === PANEL_ZOOM_STEPS.length - 1} aria-label={bi("확대", "Zoom in")} className={PANEL_SMALL_BUTTON}>
          <ZoomIn size={14} aria-hidden="true" />
        </button>
      </div>
      <p className={cn(PANEL_HINT, "mt-1.5")}>
        {editor.tool === "select"
          ? bi("컷을 끌어 옮기고 가장자리를 끌어 크기를 바꿔요. 컷에 포커스를 두고 방향키(Shift 는 1픽셀, Alt 는 크기)로도 고칠 수 있어요.", "Drag a panel to move it and drag its edges to resize. With a panel focused, arrow keys also work (Shift = 1 px, Alt = resize).")
          : editor.tool === "draw"
            ? bi("이미지 위를 끌어 새 컷을 그려요.", "Drag over the image to draw a new panel.")
            : bi("나눌 컷 위에서 선을 놓을 자리를 눌러요.", "Press on a panel where the dividing line should go.")}
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
          onMoveBy={(id, dx, dy) => edit((current) => movePanelBy(current, id, dx, dy), bi("컷을 옮겼어요.", "Panel moved."))}
          onDraw={(rect) => edit((current) => addPanel(current, rect), bi("새 컷을 추가했어요.", "New panel added."), addedSelection)}
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
              <h4 className="text-sm font-black text-fg">{bi("컷 목록", "Panels")}</h4>
              <button type="button" disabled={!mergeReady} onClick={onMerge} className={PANEL_SMALL_BUTTON}>
                <Combine size={14} aria-hidden="true" />
                {bi("체크한 컷 합치기", "Merge checked")}
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
          <p className={PANEL_HINT}>{bi("컷이 하나 이상 있어야 다음으로 갈 수 있어요.", "You need at least one panel to continue.")}</p>
        ) : null}
        <button
          type="button"
          disabled={state.panels.length === 0}
          onClick={props.onNext}
          className={cn(buttonClass({ size: "lg" }), PANEL_FOCUS_RING)}
        >
          {bi("다음: 세로 재배열 설정", "Next: vertical strip settings")}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
