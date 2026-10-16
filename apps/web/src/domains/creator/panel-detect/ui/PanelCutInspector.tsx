"use no memo";
// 문구는 usePanelT()(useT 를 감싼 훅)가 돌려주는 해소 함수 t 로 만든다. 같은 언어에서는 t 가 그대로라서 React Compiler 가 t("…")
// 결과를 캐시하면, 나중에 도착하는 런타임 번역(번역 번들 갱신)이 열려 있는 화면에 반영되지 않는다. 그래서 이 화면의 컴포넌트 파일은 메모이제이션에서 뺀다.

import { Scissors, Wand2 } from "lucide-react";

import { cn } from "@/shared/lib/utils";

import { panelWarningText } from "./panel-import-copy";
import { PANEL_HINT, PANEL_INPUT, PANEL_LABEL, PANEL_SMALL_BUTTON, PANEL_SUBSURFACE } from "./panel-import-styles";
import { usePanelT } from "./use-panel-t";

import type { KeyboardEvent, ReactElement } from "react";
import type { EditablePanel } from "../panel-detect-edit";
import type { PanelRect, SplitSuggestion } from "../panel-detect-types";

interface PanelCutInspectorProps {
  readonly panel: EditablePanel | null;
  readonly order: number;
  readonly suggestions: readonly SplitSuggestion[];
  readonly busy: boolean;
  readonly onSetRect: (id: string, rect: PanelRect) => void;
  readonly onTighten: (id: string) => void;
  readonly onSplit: (id: string, orientation: "horizontal" | "vertical", position: number) => void;
}

type Field = "x" | "y" | "width" | "height";

const FIELDS: ReadonlyArray<{ readonly key: Field; readonly labelKey: string }> = [
  { key: "x", labelKey: "panelImport.inspector.field.x" },
  { key: "y", labelKey: "panelImport.inspector.field.y" },
  { key: "width", labelKey: "panelImport.inspector.field.width" },
  { key: "height", labelKey: "panelImport.inspector.field.height" },
];

/** 선택한 컷의 위치·크기를 숫자로 고치고, 내용에 맞추거나 선 하나로 나눈다. 끌기가 어려운 환경의 키보드 대안이기도 하다. */
export function PanelCutInspector(props: PanelCutInspectorProps): ReactElement {
  const t = usePanelT();
  const { panel, order } = props;
  if (!panel) {
    return (
      <p className={cn(PANEL_HINT, PANEL_SUBSURFACE)}>
        {t("panelImport.inspector.empty")}
      </p>
    );
  }

  const commit = (field: Field, input: HTMLInputElement): void => {
    const value = Number(input.value);
    if (input.value.trim() !== "" && Number.isFinite(value)) {
      props.onSetRect(panel.id, { x: panel.x, y: panel.y, width: panel.width, height: panel.height, [field]: value });
    }
    // 컷이 바뀌면 이 칸은 아래 key 가 달라져 새 값으로 다시 만들어진다. 바뀌지 않았다면(빈 칸·숫자가 아님·최소 크기 미만으로
    // 거절됨, 같은 값) 화면에 남은 입력이 실제 컷과 어긋나지 않게 현재 컷의 값으로 되돌린다.
    input.value = String(panel[field]);
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>, field: Field): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit(field, event.currentTarget);
    }
  };
  const center = (orientation: "horizontal" | "vertical"): number =>
    orientation === "horizontal" ? panel.y + panel.height / 2 : panel.x + panel.width / 2;

  return (
    <div className={cn(PANEL_SUBSURFACE, "grid gap-3")}>
      <p className="text-sm font-black text-fg">{t("panelImport.inspector.title", { order })}</p>
      {/* 값이 바뀌면(끌기·되돌리기) 입력칸을 새 값으로 다시 만든다 — 상태 복제 없이 항상 현재 컷과 일치한다. */}
      <div key={`${panel.id}:${panel.x}:${panel.y}:${panel.width}:${panel.height}`} className="grid grid-cols-2 gap-2">
        {FIELDS.map((field) => (
          <label key={field.key} className="block">
            <span className={PANEL_LABEL}>{t(field.labelKey)}</span>
            <input
              type="number"
              inputMode="numeric"
              min={field.key === "width" || field.key === "height" ? 8 : 0}
              step={1}
              defaultValue={panel[field.key]}
              aria-label={t("panelImport.inspector.fieldAria", { order, field: t(field.labelKey) })}
              onBlur={(event) => commit(field.key, event.currentTarget)}
              onKeyDown={(event) => onKey(event, field.key)}
              className={cn(PANEL_INPUT, "mt-1")}
            />
          </label>
        ))}
      </div>
      <p className={PANEL_HINT}>{t("panelImport.inspector.hint")}</p>

      {panel.warnings.length > 0 ? (
        <ul className="grid gap-1 text-xs text-warn">
          {panel.warnings.map((warning) => <li key={warning}>{panelWarningText(t, warning)}</li>)}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={props.busy} onClick={() => props.onTighten(panel.id)} className={PANEL_SMALL_BUTTON}>
          <Wand2 size={14} aria-hidden="true" />
          {props.busy ? t("panelImport.inspector.fitting") : t("panelImport.inspector.fit")}
        </button>
        <button type="button" onClick={() => props.onSplit(panel.id, "horizontal", center("horizontal"))} className={PANEL_SMALL_BUTTON}>
          <Scissors size={14} aria-hidden="true" />
          {t("panelImport.tool.splitHorizontal")}
        </button>
        <button type="button" onClick={() => props.onSplit(panel.id, "vertical", center("vertical"))} className={PANEL_SMALL_BUTTON}>
          <Scissors size={14} className="rotate-90" aria-hidden="true" />
          {t("panelImport.tool.splitVertical")}
        </button>
      </div>

      {props.suggestions.length > 0 ? (
        <div className="grid gap-2">
          <p className="text-xs font-bold text-fg-2">
            {t("panelImport.inspector.suggestTitle")}
          </p>
          {props.suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => props.onSplit(panel.id, suggestion.orientation, suggestion.position)}
              className={cn(PANEL_SMALL_BUTTON, "justify-start text-left")}
            >
              {t(suggestion.orientation === "horizontal" ? "panelImport.inspector.suggestHorizontal" : "panelImport.inspector.suggestVertical", { position: suggestion.position })}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
