"use no memo";
// 문구는 usePanelT()(useT 를 감싼 훅)가 돌려주는 해소 함수 t 로 만든다. 같은 언어에서는 t 가 그대로라서 React Compiler 가 t 호출
// 결과를 캐시하면, 나중에 도착하는 런타임 번역(번역 번들 갱신)이 열려 있는 화면에 반영되지 않는다. 그래서 이 화면의 컴포넌트 파일은 메모이제이션에서 뺀다.

import { RefreshCw } from "lucide-react";
import { useState, type ReactElement } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import { PANEL_DETECT_SENSITIVITIES, PANEL_READING_ORDERS, type PanelDetectSensitivity, type PanelReadingOrder } from "../panel-detect-types";

import { PanelNotice } from "./PanelNotice";
import { readingOrderLabel, sensitivityLabel } from "./panel-import-copy";
import { PANEL_HINT, PANEL_SUBSURFACE, panelChipClass } from "./panel-import-styles";
import { usePanelT } from "./use-panel-t";

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
  const t = usePanelT();
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
        <legend className="mb-1.5 text-xs font-bold text-fg-2">{t("panelImport.controls.readingOrder")}</legend>
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
              {readingOrderLabel(t, order)}
            </label>
          ))}
        </div>
        <p className={cn(PANEL_HINT, "mt-1.5")}>{t("panelImport.controls.readingOrderHint")}</p>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-xs font-bold text-fg-2">{t("panelImport.controls.sensitivity")}</legend>
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
              {sensitivityLabel(t, level)}
            </label>
          ))}
        </div>
        <button type="button" disabled={props.busy} onClick={rerun} className={cn(buttonClass({ variant: "outline", size: "sm" }), "mt-2")}>
          <RefreshCw size={14} aria-hidden="true" />
          {t("panelImport.controls.rerun")}
        </button>
      </fieldset>

      {confirming ? (
        <PanelNotice
          tone="warn"
          live="alert"
          actions={
            <>
              <button type="button" onClick={rerun} className={buttonClass({ size: "sm" })}>{t("panelImport.controls.confirmRerun")}</button>
              <button type="button" onClick={() => setConfirming(false)} className={buttonClass({ variant: "outline", size: "sm" })}>{t("panelImport.common.cancel")}</button>
            </>
          }
        >
          {t("panelImport.controls.confirmText")}
        </PanelNotice>
      ) : null}
    </div>
  );
}
