"use no memo";
// 문구는 usePanelT()(useT 를 감싼 훅)가 돌려주는 해소 함수 t 로 만든다. 같은 언어에서는 t 가 그대로라서 React Compiler 가 t 호출
// 결과를 캐시하면, 나중에 도착하는 런타임 번역(번역 번들 갱신)이 열려 있는 화면에 반영되지 않는다. 그래서 이 화면의 컴포넌트 파일은 메모이제이션에서 뺀다.

import { AlertTriangle, CheckCircle2, Magnet, Minus, Plus } from "lucide-react";

import { cn } from "@/shared/lib/utils";

import { cardCutBounds } from "../panel-card-slice";

import { cutKindText, formatPanelNumber } from "./panel-import-copy";
import { PANEL_FOCUS_RING, PANEL_SMALL_BUTTON } from "./panel-import-styles";
import { usePanelT } from "./use-panel-t";

import type { ReactElement } from "react";
import type { CardSlicePlan } from "../panel-card-slice-types";

interface PanelCardCutControlsProps {
  readonly plan: CardSlicePlan;
  /** 카드 index 와 index+1 사이의 컷. */
  readonly cutIndex: number;
  readonly disabled: boolean;
  readonly onMove: (cutIndex: number, y: number) => void;
  readonly onSnap: (cutIndex: number) => void;
}

const STEPS = [-10, -1, 1, 10] as const;

/** 카드 사이 절단선을 손으로 옮긴다: 슬라이더(키보드 포함)·±1/±10 행 버튼·가까운 여백으로 붙이기. */
export function PanelCardCutControls({ plan, cutIndex, disabled, onMove, onSnap }: PanelCardCutControlsProps): ReactElement | null {
  const t = usePanelT();
  const cut = plan.cuts[cutIndex];
  const bounds = cardCutBounds(plan, cutIndex);
  if (!cut) return null;
  const clean = cut.kind === "clean";
  const Icon = cut.kind === "content" ? AlertTriangle : CheckCircle2;
  const label = t("panelImport.cut.group", { first: cutIndex + 1, second: cutIndex + 2 });
  const status = cutKindText(t, cut.kind);
  return (
    <div role="group" aria-label={label} className="grid gap-2 rounded-xl border border-line bg-panel/55 p-2.5">
      <p className={cn("flex items-start gap-1.5 text-xs font-bold", cut.kind === "content" ? "text-warn" : "text-fg-2")}>
        <Icon size={14} className={cn("mt-px shrink-0", clean ? "text-good" : undefined)} aria-hidden="true" />
        <span>
          {status}
          {cut.manual ? ` · ${t("panelImport.cut.movedByYou")}` : ""}
        </span>
      </p>
      {bounds ? (
        <>
          <label className="grid gap-1">
            <span className="text-[0.7rem] text-fg-3">{t("panelImport.cut.position", { row: formatPanelNumber(cut.y) })}</span>
            <input
              type="range"
              min={bounds.min}
              max={bounds.max}
              step={1}
              value={cut.y}
              disabled={disabled}
              onChange={(event) => onMove(cutIndex, Number(event.currentTarget.value))}
              aria-label={label}
              aria-valuetext={t("panelImport.cut.valueText", { row: cut.y, status })}
              className={cn("h-6 w-full accent-accent pointer-coarse:h-11", PANEL_FOCUS_RING)}
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {STEPS.map((step) => (
              <button
                key={step}
                type="button"
                disabled={disabled}
                onClick={() => onMove(cutIndex, cut.y + step)}
                aria-label={t(step < 0 ? "panelImport.cut.stepUp" : "panelImport.cut.stepDown", { rows: Math.abs(step) })}
                className={PANEL_SMALL_BUTTON}
              >
                {step < 0 ? <Minus size={12} aria-hidden="true" /> : <Plus size={12} aria-hidden="true" />}
                {Math.abs(step)}
              </button>
            ))}
            <button type="button" disabled={disabled} onClick={() => onSnap(cutIndex)} className={PANEL_SMALL_BUTTON}>
              <Magnet size={13} aria-hidden="true" />
              {t("panelImport.cut.snap")}
            </button>
          </div>
        </>
      ) : (
        <p className="text-xs text-fg-3">{t("panelImport.cut.immovable")}</p>
      )}
    </div>
  );
}
