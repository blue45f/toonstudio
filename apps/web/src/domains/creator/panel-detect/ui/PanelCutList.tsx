"use no memo";
// 문구는 usePanelT()(useT 를 감싼 훅)가 돌려주는 해소 함수 t 로 만든다. 같은 언어에서는 t 가 그대로라서 React Compiler 가 t 호출
// 결과를 캐시하면, 나중에 도착하는 런타임 번역(번역 번들 갱신)이 열려 있는 화면에 반영되지 않는다. 그래서 이 화면의 컴포넌트 파일은 메모이제이션에서 뺀다.

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

import { cn } from "@/shared/lib/utils";

import { confidenceLabel, panelWarningText, type PanelT } from "./panel-import-copy";
import { PANEL_FOCUS_RING, PANEL_HINT, PANEL_SMALL_BUTTON } from "./panel-import-styles";
import { usePanelT } from "./use-panel-t";

import type { ReactElement } from "react";
import type { EditablePanel } from "../panel-detect-edit";

interface PanelCutListProps {
  readonly panels: readonly EditablePanel[];
  readonly selectedId: string | null;
  readonly checkedIds: ReadonlySet<string>;
  readonly onSelect: (id: string) => void;
  readonly onToggleChecked: (id: string) => void;
  readonly onMove: (id: string, direction: -1 | 1) => void;
  readonly onDelete: (id: string) => void;
}

function qualityText(t: PanelT, panel: EditablePanel): string {
  if (panel.origin === "user") return t("panelImport.list.byYou");
  const confidence = panel.confidence ?? 0;
  return confidenceLabel(t, confidence >= 0.75 ? "high" : confidence >= 0.5 ? "medium" : "low");
}

/** 읽기 순서대로 나열한 컷 목록. 순서 바꾸기·삭제·합치기 선택을 키보드로도 할 수 있다. */
export function PanelCutList(props: PanelCutListProps): ReactElement {
  const t = usePanelT();
  const { panels } = props;
  if (panels.length === 0) {
    return (
      <p className={cn(PANEL_HINT, "rounded-xl border border-dashed border-line px-3 py-4 text-center")}>
        {t("panelImport.list.empty")}
      </p>
    );
  }
  return (
    <ol aria-label={t("panelImport.list.aria")} className="grid gap-1.5">
      {panels.map((panel, index) => {
        const selected = panel.id === props.selectedId;
        const order = index + 1;
        return (
          <li
            key={panel.id}
            data-selected={selected ? "true" : undefined}
            className={cn("flex items-center gap-1.5 rounded-xl border px-1.5 py-1", selected ? "border-accent/60 bg-accent-soft/60" : "border-line bg-card")}
          >
            <label className="grid min-h-11 min-w-11 cursor-pointer place-items-center">
              <input
                type="checkbox"
                checked={props.checkedIds.has(panel.id)}
                onChange={() => props.onToggleChecked(panel.id)}
                aria-label={t("panelImport.list.merge", { order })}
                className={cn("size-5 accent-accent", PANEL_FOCUS_RING)}
              />
            </label>
            <button
              type="button"
              onClick={() => props.onSelect(panel.id)}
              aria-pressed={selected}
              className={cn("min-h-11 min-w-0 flex-1 rounded-lg px-2 text-left", PANEL_FOCUS_RING)}
            >
              <span className="block truncate text-sm font-bold text-fg">
                {t("panelImport.list.item", { order })} <span className="font-normal text-fg-3">{panel.width}×{panel.height}</span>
              </span>
              <span className="block truncate text-[0.7rem] text-fg-3">
                {qualityText(t, panel)}
                {panel.warnings.length > 0 ? ` · ${panelWarningText(t, panel.warnings[0])}` : ""}
              </span>
            </button>
            <button
              type="button"
              onClick={() => props.onMove(panel.id, -1)}
              disabled={index === 0}
              aria-label={t("panelImport.list.moveEarlier", { order })}
              className={PANEL_SMALL_BUTTON}
            >
              <ArrowUp size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => props.onMove(panel.id, 1)}
              disabled={index === panels.length - 1}
              aria-label={t("panelImport.list.moveLater", { order })}
              className={PANEL_SMALL_BUTTON}
            >
              <ArrowDown size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => props.onDelete(panel.id)}
              aria-label={t("panelImport.list.delete", { order })}
              className={PANEL_SMALL_BUTTON}
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ol>
  );
}
