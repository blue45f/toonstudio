"use no memo";
// 문구가 전역 언어를 읽는 bi() 로 만들어져서, 언어를 바꾸면 열려 있는 화면도 바로 다시 그려야 한다.
// React Compiler 가 상수 인자의 bi() 결과를 캐시하면 이전 언어가 남으므로 이 파일은 메모이제이션에서 뺀다(panel-import-bi.ts 참고).

import { RefreshCw } from "lucide-react";
import { useState, type ReactElement } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import { PANEL_DETECT_SENSITIVITIES, PANEL_READING_ORDERS, type PanelDetectSensitivity, type PanelReadingOrder } from "../panel-detect-types";

import { PanelNotice } from "./PanelNotice";
import { bi, readingOrderLabel, sensitivityLabel } from "./panel-import-copy";
import { PANEL_HINT, PANEL_SUBSURFACE, panelChipClass } from "./panel-import-styles";

interface PanelDetectControlsProps {
  readonly readingOrder: PanelReadingOrder;
  readonly sensitivity: PanelDetectSensitivity;
  /** 사용자가 고친 내용이 있는가. 있으면 다시 찾기 전에 한 번 더 묻는다. */
  readonly hasEdits: boolean;
  readonly busy: boolean;
  /** 읽기 순서는 다시 찾지 않고 현재 컷을 바로 다시 정렬한다. */
  readonly onReadingOrder: (value: PanelReadingOrder) => void;
  readonly onSensitivity: (value: PanelDetectSensitivity) => void;
  readonly onRerun: () => void;
}

/** 읽기 순서(즉시 적용)와 여백 민감도(다시 찾기로 적용). */
export function PanelDetectControls(props: PanelDetectControlsProps): ReactElement {
  const [confirming, setConfirming] = useState(false);
  const rerun = (): void => {
    if (props.hasEdits && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    props.onRerun();
  };
  return (
    <div className={cn(PANEL_SUBSURFACE, "grid gap-3")}>
      <fieldset>
        <legend className="mb-1.5 text-xs font-bold text-fg-2">{bi("읽기 순서", "Reading order")}</legend>
        <div className="flex flex-wrap gap-1.5">
          {PANEL_READING_ORDERS.map((order) => (
            <label key={order} className={panelChipClass(props.readingOrder === order)}>
              <input
                type="radio"
                name="panel-reading-order"
                value={order}
                checked={props.readingOrder === order}
                onChange={() => props.onReadingOrder(order)}
                className="sr-only"
              />
              {readingOrderLabel(order)}
            </label>
          ))}
        </div>
        <p className={cn(PANEL_HINT, "mt-1.5")}>{bi("바꾸면 지금 컷을 바로 다시 정렬해요. 순서를 직접 옮긴 것은 사라져요.", "Changing it re-sorts the current panels at once. Manual reordering is reset.")}</p>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-xs font-bold text-fg-2">{bi("여백 민감도", "Gutter sensitivity")}</legend>
        <div className="flex flex-wrap gap-1.5">
          {PANEL_DETECT_SENSITIVITIES.map((level) => (
            <label key={level} className={panelChipClass(props.sensitivity === level)}>
              <input
                type="radio"
                name="panel-sensitivity"
                value={level}
                checked={props.sensitivity === level}
                onChange={() => { setConfirming(false); props.onSensitivity(level); }}
                className="sr-only"
              />
              {sensitivityLabel(level)}
            </label>
          ))}
        </div>
        <button type="button" disabled={props.busy} onClick={rerun} className={cn(buttonClass({ variant: "outline", size: "sm" }), "mt-2")}>
          <RefreshCw size={14} aria-hidden="true" />
          {bi("이 설정으로 다시 찾기", "Detect again with this setting")}
        </button>
      </fieldset>

      {confirming ? (
        <PanelNotice
          tone="warn"
          live="alert"
          actions={
            <>
              <button type="button" onClick={rerun} className={buttonClass({ size: "sm" })}>{bi("다시 찾기", "Detect again")}</button>
              <button type="button" onClick={() => setConfirming(false)} className={buttonClass({ variant: "outline", size: "sm" })}>{bi("취소", "Cancel")}</button>
            </>
          }
        >
          {bi("고친 내용이 모두 사라져요. 계속할까요?", "Everything you edited will be lost. Continue?")}
        </PanelNotice>
      ) : null}
    </div>
  );
}
