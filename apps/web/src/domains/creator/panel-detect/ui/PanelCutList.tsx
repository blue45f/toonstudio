"use no memo";
// 문구가 전역 언어를 읽는 bi() 로 만들어져서, 언어를 바꾸면 열려 있는 화면도 바로 다시 그려야 한다.
// React Compiler 가 상수 인자의 bi() 결과를 캐시하면 이전 언어가 남으므로 이 파일은 메모이제이션에서 뺀다(panel-import-bi.ts 참고).

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

import { cn } from "@/shared/lib/utils";

import { bi, confidenceLabel, panelWarningText } from "./panel-import-copy";
import { PANEL_FOCUS_RING, PANEL_HINT, PANEL_SMALL_BUTTON } from "./panel-import-styles";

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

function qualityText(panel: EditablePanel): string {
  if (panel.origin === "user") return bi("직접 만든 컷", "Added by you");
  const confidence = panel.confidence ?? 0;
  return confidenceLabel(confidence >= 0.75 ? "high" : confidence >= 0.5 ? "medium" : "low");
}

/** 읽기 순서대로 나열한 컷 목록. 순서 바꾸기·삭제·합치기 선택을 키보드로도 할 수 있다. */
export function PanelCutList(props: PanelCutListProps): ReactElement {
  const { panels } = props;
  if (panels.length === 0) {
    return (
      <p className={cn(PANEL_HINT, "rounded-xl border border-dashed border-line px-3 py-4 text-center")}>
        {bi(
          "아직 컷이 없어요. ‘새 컷 그리기’ 도구로 이미지 위에 컷을 그리거나 ‘전체를 한 컷으로’ 단추로 시작해 주세요.",
          "No panels yet. Draw them on the image with the “Draw panel” tool, or start with the “Whole image as a panel” button.",
        )}
      </p>
    );
  }
  return (
    <ol aria-label={bi("컷 목록 (읽기 순서)", "Panels in reading order")} className="grid gap-1.5">
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
                aria-label={bi(`컷 ${order} 합치기에 포함`, `Include panel ${order} in merge`)}
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
                {bi(`${order}번 컷`, `Panel ${order}`)} <span className="font-normal text-fg-3">{panel.width}×{panel.height}</span>
              </span>
              <span className="block truncate text-[0.7rem] text-fg-3">
                {qualityText(panel)}
                {panel.warnings.length > 0 ? ` · ${panelWarningText(panel.warnings[0])}` : ""}
              </span>
            </button>
            <button
              type="button"
              onClick={() => props.onMove(panel.id, -1)}
              disabled={index === 0}
              aria-label={bi(`컷 ${order}을 앞으로`, `Move panel ${order} earlier`)}
              className={PANEL_SMALL_BUTTON}
            >
              <ArrowUp size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => props.onMove(panel.id, 1)}
              disabled={index === panels.length - 1}
              aria-label={bi(`컷 ${order}을 뒤로`, `Move panel ${order} later`)}
              className={PANEL_SMALL_BUTTON}
            >
              <ArrowDown size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => props.onDelete(panel.id)}
              aria-label={bi(`컷 ${order} 삭제`, `Delete panel ${order}`)}
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
