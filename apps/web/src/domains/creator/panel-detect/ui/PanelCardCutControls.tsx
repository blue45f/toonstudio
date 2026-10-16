"use no memo";
// 문구가 전역 언어를 읽는 bi() 로 만들어져서, 언어를 바꾸면 열려 있는 화면도 바로 다시 그려야 한다.
// React Compiler 가 상수 인자의 bi() 결과를 캐시하면 이전 언어가 남으므로 이 파일은 메모이제이션에서 뺀다(panel-import-bi.ts 참고).

import { AlertTriangle, CheckCircle2, Magnet, Minus, Plus } from "lucide-react";

import { cn } from "@/shared/lib/utils";

import { cardCutBounds } from "../panel-card-slice";

import { bi, cutKindText } from "./panel-import-copy";
import { PANEL_FOCUS_RING, PANEL_SMALL_BUTTON } from "./panel-import-styles";

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
  const cut = plan.cuts[cutIndex];
  const bounds = cardCutBounds(plan, cutIndex);
  if (!cut) return null;
  const clean = cut.kind === "clean";
  const Icon = cut.kind === "content" ? AlertTriangle : CheckCircle2;
  const label = bi(`카드 ${cutIndex + 1}과 ${cutIndex + 2} 사이 절단선`, `Cut between card ${cutIndex + 1} and ${cutIndex + 2}`);
  const status = cutKindText(cut.kind);
  return (
    <div role="group" aria-label={label} className="grid gap-2 rounded-xl border border-line bg-panel/55 p-2.5">
      <p className={cn("flex items-start gap-1.5 text-xs font-bold", cut.kind === "content" ? "text-warn" : "text-fg-2")}>
        <Icon size={14} className={cn("mt-px shrink-0", clean ? "text-good" : undefined)} aria-hidden="true" />
        <span>
          {status}
          {cut.manual ? bi(" · 직접 옮김", " · moved by you") : ""}
        </span>
      </p>
      {bounds ? (
        <>
          <label className="grid gap-1">
            <span className="text-[0.7rem] text-fg-3">{bi(`절단 위치: 원본 ${cut.y.toLocaleString("ko-KR")}행`, `Cut position: source row ${cut.y.toLocaleString("en-US")}`)}</span>
            <input
              type="range"
              min={bounds.min}
              max={bounds.max}
              step={1}
              value={cut.y}
              disabled={disabled}
              onChange={(event) => onMove(cutIndex, Number(event.currentTarget.value))}
              aria-label={label}
              aria-valuetext={bi(`원본 ${cut.y}행, ${status}`, `source row ${cut.y}, ${status}`)}
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
                aria-label={bi(`절단선을 ${Math.abs(step)}행 ${step < 0 ? "위로" : "아래로"}`, `Move the cut ${Math.abs(step)} row(s) ${step < 0 ? "up" : "down"}`)}
                className={PANEL_SMALL_BUTTON}
              >
                {step < 0 ? <Minus size={12} aria-hidden="true" /> : <Plus size={12} aria-hidden="true" />}
                {Math.abs(step)}
              </button>
            ))}
            <button type="button" disabled={disabled} onClick={() => onSnap(cutIndex)} className={PANEL_SMALL_BUTTON}>
              <Magnet size={13} aria-hidden="true" />
              {bi("가까운 여백으로", "Snap to nearest gutter")}
            </button>
          </div>
        </>
      ) : (
        <p className="text-xs text-fg-3">{bi("이 절단선은 더 옮길 수 없어요.", "This cut cannot be moved further.")}</p>
      )}
    </div>
  );
}
