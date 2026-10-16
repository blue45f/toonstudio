"use no memo";
// 문구가 전역 언어를 읽는 bi() 로 만들어져서, 언어를 바꾸면 열려 있는 화면도 바로 다시 그려야 한다.
// React Compiler 가 상수 인자의 bi() 결과를 캐시하면 이전 언어가 남으므로 이 파일은 메모이제이션에서 뺀다(panel-import-bi.ts 참고).

import { Scissors, Wand2 } from "lucide-react";

import { cn } from "@/shared/lib/utils";

import { bi, panelWarningText } from "./panel-import-copy";
import { PANEL_HINT, PANEL_INPUT, PANEL_LABEL, PANEL_SMALL_BUTTON, PANEL_SUBSURFACE } from "./panel-import-styles";

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

const FIELDS: ReadonlyArray<{ readonly key: Field; readonly ko: string; readonly en: string }> = [
  { key: "x", ko: "X (왼쪽)", en: "X (left)" },
  { key: "y", ko: "Y (위)", en: "Y (top)" },
  { key: "width", ko: "너비", en: "Width" },
  { key: "height", ko: "높이", en: "Height" },
];

/** 선택한 컷의 위치·크기를 숫자로 고치고, 내용에 맞추거나 선 하나로 나눈다. 끌기가 어려운 환경의 키보드 대안이기도 하다. */
export function PanelCutInspector(props: PanelCutInspectorProps): ReactElement {
  const { panel, order } = props;
  if (!panel) {
    return (
      <p className={cn(PANEL_HINT, PANEL_SUBSURFACE)}>
        {bi("컷을 선택하면 위치와 크기를 숫자로 고치거나 선 하나로 나눌 수 있어요.", "Select a panel to edit its position and size numerically, or split it with a line.")}
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
      <p className="text-sm font-black text-fg">{bi(`${order}번 컷 정보`, `Panel ${order}`)}</p>
      {/* 값이 바뀌면(끌기·되돌리기) 입력칸을 새 값으로 다시 만든다 — 상태 복제 없이 항상 현재 컷과 일치한다. */}
      <div key={`${panel.id}:${panel.x}:${panel.y}:${panel.width}:${panel.height}`} className="grid grid-cols-2 gap-2">
        {FIELDS.map((field) => (
          <label key={field.key} className="block">
            <span className={PANEL_LABEL}>{bi(field.ko, field.en)}</span>
            <input
              type="number"
              inputMode="numeric"
              min={field.key === "width" || field.key === "height" ? 8 : 0}
              step={1}
              defaultValue={panel[field.key]}
              aria-label={bi(`${order}번 컷 ${field.ko} (픽셀)`, `Panel ${order} ${field.en} (px)`)}
              onBlur={(event) => commit(field.key, event.currentTarget)}
              onKeyDown={(event) => onKey(event, field.key)}
              className={cn(PANEL_INPUT, "mt-1")}
            />
          </label>
        ))}
      </div>
      <p className={PANEL_HINT}>{bi("숫자를 고친 뒤 Enter 를 누르거나 다른 곳을 누르면 적용돼요. 단위는 원본 이미지 픽셀이에요.", "Press Enter or leave the field to apply. Units are source-image pixels.")}</p>

      {panel.warnings.length > 0 ? (
        <ul className="grid gap-1 text-xs text-warn">
          {panel.warnings.map((warning) => <li key={warning}>{panelWarningText(warning)}</li>)}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={props.busy} onClick={() => props.onTighten(panel.id)} className={PANEL_SMALL_BUTTON}>
          <Wand2 size={14} aria-hidden="true" />
          {props.busy ? bi("맞추는 중…", "Fitting…") : bi("내용에 맞추기", "Fit to content")}
        </button>
        <button type="button" onClick={() => props.onSplit(panel.id, "horizontal", center("horizontal"))} className={PANEL_SMALL_BUTTON}>
          <Scissors size={14} aria-hidden="true" />
          {bi("가로선으로 나누기", "Split horizontally")}
        </button>
        <button type="button" onClick={() => props.onSplit(panel.id, "vertical", center("vertical"))} className={PANEL_SMALL_BUTTON}>
          <Scissors size={14} className="rotate-90" aria-hidden="true" />
          {bi("세로선으로 나누기", "Split vertically")}
        </button>
      </div>

      {props.suggestions.length > 0 ? (
        <div className="grid gap-2">
          <p className="text-xs font-bold text-fg-2">
            {bi("여기서 나뉘었을 수 있어요", "This panel may be two panels")}
          </p>
          {props.suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => props.onSplit(panel.id, suggestion.orientation, suggestion.position)}
              className={cn(PANEL_SMALL_BUTTON, "justify-start text-left")}
            >
              {suggestion.orientation === "horizontal"
                ? bi(`제안: 가로선(Y ${suggestion.position})에서 나누기`, `Suggestion: split at horizontal line (Y ${suggestion.position})`)
                : bi(`제안: 세로선(X ${suggestion.position})에서 나누기`, `Suggestion: split at vertical line (X ${suggestion.position})`)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
