import { Copy } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { useT } from "@/shared/lib/i18n";

import { parseSketchUpArrayInput, SKETCHUP_ARRAY_MAX_COUNT } from "./studio-bg3d-sketchup-direct-modeling";
import type {
  StudioBg3dExecuteSelectionArray,
  StudioBg3dSelectionArrayRequest,
  StudioBg3dSelectionArrayResult,
  StudioBg3dSelectionArraySummary,
} from "./studio-bg3d-selection-array";

export interface StudioBg3dSelectionArrayPanelProps {
  readonly disabled?: boolean;
  readonly selection?: StudioBg3dSelectionArraySummary;
  readonly onExecuteSelectionArray?: StudioBg3dExecuteSelectionArray;
}

type ArrayAxis = "x" | "y" | "z";
type ArrayMode = "linear" | "radial";
const AXES: readonly ArrayAxis[] = ["x", "y", "z"];

function parseFiniteInput(raw: string): number | null {
  const value = Number(raw);
  return raw.trim() !== "" && Number.isFinite(value) ? value : null;
}

/** 선택한 도형의 복제 명령을 현재 장면의 편집 경계로 보낸다. */
export function StudioBg3dSelectionArrayPanel({
  disabled = false,
  selection,
  onExecuteSelectionArray,
}: StudioBg3dSelectionArrayPanelProps) {
  const t = useT();
  const inputId = useId();
  const composingRef = useRef(false);
  const [mode, setMode] = useState<ArrayMode>("linear");
  const [axis, setAxis] = useState<ArrayAxis>("x");
  const [token, setToken] = useState("*3");
  const [distanceText, setDistanceText] = useState("1");
  const [angleText, setAngleText] = useState("45");
  const [pivotText, setPivotText] = useState<Record<ArrayAxis, string>>({ x: "0", y: "0", z: "0" });
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const command = parseSketchUpArrayInput(token);
  const distance = parseFiniteInput(distanceText);
  const angle = parseFiniteInput(angleText);
  const pivotX = parseFiniteInput(pivotText.x);
  const pivotY = parseFiniteInput(pivotText.y);
  const pivotZ = parseFiniteInput(pivotText.z);
  const selectedCount = selection?.selectedPrimitiveCount ?? 0;
  const addedNodeCount = command.ok ? selectedCount * command.count : 0;
  const unavailableReason = disabled
    ? t("studio.bg3d.selectionArray.editLocked", "현재 장면의 편집이 잠겨 있어 반복 배치할 수 없습니다.")
    : !selection || !onExecuteSelectionArray
      ? t("studio.bg3d.selectionArray.noScene", "편집 가능한 3D 배경 장면을 열어 주세요.")
      : selection.blockedReason ?? (selectedCount === 0
        ? t("studio.bg3d.selectionArray.noSelection", "장면에서 반복 배치할 도형을 선택하세요.")
        : null);
  const validationError = !command.ok
    ? t("studio.bg3d.selectionArray.invalidToken", { max: SKETCHUP_ARRAY_MAX_COUNT }, "명령은 *N, Nx, /N 형식으로 입력하세요. N은 1~{max} 사이의 정수입니다.")
    : mode === "linear" && (distance === null || distance === 0)
      ? t("studio.bg3d.selectionArray.invalidDistance", "간격 또는 전체 거리에 0이 아닌 숫자를 입력하세요. 음수로 반대 방향을 지정할 수 있습니다.")
      : mode === "radial" && (angle === null || angle === 0)
        ? t("studio.bg3d.selectionArray.invalidAngle", "각도에 0이 아닌 숫자를 입력하세요. 음수로 반대 방향을 지정할 수 있습니다.")
        : mode === "radial" && (pivotX === null || pivotY === null || pivotZ === null)
          ? t("studio.bg3d.selectionArray.invalidPivot", "회전 중심 X/Y/Z에 유효한 숫자를 입력하세요.")
          : selection && addedNodeCount > selection.availableNodeCount
            ? t("studio.bg3d.selectionArray.overBudget", { count: addedNodeCount, available: selection.availableNodeCount }, "사본 {count}개는 현재 추가 가능한 도형 {available}개를 초과합니다. 복제 수를 줄이거나 장면을 정리하세요.")
            : null;

  const execute = () => {
    if (disabled || composingRef.current || unavailableReason || validationError || !onExecuteSelectionArray || !command.ok) return;
    let request: StudioBg3dSelectionArrayRequest;
    if (mode === "linear") {
      if (distance === null || distance === 0) return;
      request = {
        mode: "linear", token: command.normalizedToken,
        delta: axis === "x" ? [distance, 0, 0] : axis === "y" ? [0, distance, 0] : [0, 0, distance],
      };
    } else {
      if (angle === null || angle === 0 || pivotX === null || pivotY === null || pivotZ === null) return;
      request = { mode: "radial", token: command.normalizedToken, axis, angleDegrees: angle, pivot: [pivotX, pivotY, pivotZ] };
    }
    let result: StudioBg3dSelectionArrayResult;
    try {
      result = onExecuteSelectionArray(request);
    } catch {
      setActionMessage(t("studio.bg3d.selectionArray.executeError", "반복 배치하지 못했습니다. 장면 상태를 확인한 뒤 다시 시도하세요."));
      return;
    }
    setActionMessage(result.ok
      ? t("studio.bg3d.selectionArray.executed", { copies: result.copyCount, count: result.addedNodeCount }, "사본 {copies}묶음, 도형 {count}개를 현재 장면에 추가했습니다.")
      : result.messageKo);
  };
  const handleCommandKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (event.nativeEvent.isComposing || event.keyCode === 229 || composingRef.current) return;
    execute();
  };
  const selectMode = (next: ArrayMode) => {
    if (mode === next) return;
    setMode(next);
    setAxis(next === "linear" ? "x" : "y");
  };
  const inputClass = "min-h-11 w-full min-w-0 rounded-lg border border-line bg-panel px-2 text-xs text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50";

  return (
    <section data-testid="bg3d-selection-array-panel" aria-label={t("studio.bg3d.selectionArray.title", "선택 도형 반복 배치")} className="space-y-3 rounded-xl border border-line bg-card p-3 text-xs text-fg">
      <h3 className="flex items-center gap-1.5 text-sm font-bold"><Copy className="size-4 text-accent" aria-hidden />{t("studio.bg3d.selectionArray.title", "선택 도형 반복 배치")}</h3>
      <p className="text-fg-2">{t("studio.bg3d.selectionArray.description", "장면에서 선택한 도형을 선형 또는 원형으로 복제합니다. 원본은 그대로 유지합니다.")}</p>
      <p data-testid="bg3d-array-selection-summary" className="text-fg-2">{t("studio.bg3d.selectionArray.selectedCount", { count: selectedCount, available: selection?.availableNodeCount ?? 0 }, "선택 도형 {count}개 · 추가 가능한 도형 {available}개")}</p>
      {unavailableReason ? <p data-testid="bg3d-array-selection-blocked" role="status" className="text-fg-2">{unavailableReason}</p> : null}
      <form aria-label={t("studio.bg3d.selectionArray.form", "반복 배치 설정")} onSubmit={(event) => { event.preventDefault(); execute(); }} className="space-y-3">
        <div role="group" aria-label={t("studio.bg3d.selectionArray.mode", "반복 배치 방식")} className="grid grid-cols-2 gap-2">
          <button type="button" disabled={disabled} aria-pressed={mode === "linear"} onClick={() => selectMode("linear")}
            className={`min-h-11 rounded-lg border px-2 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${mode === "linear" ? "border-accent bg-accent/15 text-accent" : "border-line bg-panel text-fg-2"}`}>
            {t("studio.bg3d.selectionArray.linear", "선형 배열")}
          </button>
          <button type="button" disabled={disabled} aria-pressed={mode === "radial"} onClick={() => selectMode("radial")}
            className={`min-h-11 rounded-lg border px-2 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${mode === "radial" ? "border-accent bg-accent/15 text-accent" : "border-line bg-panel text-fg-2"}`}>
            {t("studio.bg3d.selectionArray.radial", "원형 배열")}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label htmlFor={`${inputId}-token`} className="space-y-1 text-fg-2"><span>{t("studio.bg3d.selectionArray.token", "복제 명령")}</span>
            <input id={`${inputId}-token`} type="text" value={token} disabled={disabled} placeholder="*3, 3x, /4"
              aria-describedby={!command.ok ? `${inputId}-syntax ${inputId}-error` : `${inputId}-syntax`} aria-invalid={!command.ok} onChange={(event) => setToken(event.target.value)}
              onCompositionStart={() => { composingRef.current = true; }} onCompositionEnd={() => { composingRef.current = false; }}
              onKeyDown={handleCommandKeyDown} className={inputClass} />
          </label>
          <label htmlFor={`${inputId}-axis`} className="space-y-1 text-fg-2"><span>{t("studio.bg3d.selectionArray.axis", "장면 기준 축")}</span>
            <select id={`${inputId}-axis`} value={axis} disabled={disabled} onChange={(event) => {
              const next = event.target.value;
              if (next === "x" || next === "y" || next === "z") setAxis(next);
            }} className={inputClass}>{AXES.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select>
          </label>
        </div>
        <p id={`${inputId}-syntax`} className="text-fg-2">{t("studio.bg3d.selectionArray.syntax", "*N 또는 Nx는 간격마다 N개 사본을 만듭니다. /N은 전체 거리·각도를 N등분해 끝점까지 N개 사본을 만듭니다.")}</p>
        {mode === "linear" ? (
          <label htmlFor={`${inputId}-distance`} className="block space-y-1 text-fg-2"><span>{command.mode === "divide"
            ? t("studio.bg3d.selectionArray.spanMeters", "전체 거리 (m)")
            : t("studio.bg3d.selectionArray.stepMeters", "배치 간격 (m)")}</span>
            <input id={`${inputId}-distance`} type="number" step="any" value={distanceText} disabled={disabled}
              aria-invalid={distance === null || distance === 0} aria-describedby={distance === null || distance === 0 ? `${inputId}-error` : undefined}
              onChange={(event) => setDistanceText(event.target.value)} className={inputClass} />
          </label>
        ) : (
          <div className="space-y-2">
            <label htmlFor={`${inputId}-angle`} className="block space-y-1 text-fg-2"><span>{command.mode === "divide"
              ? t("studio.bg3d.selectionArray.spanDegrees", "전체 회전 각도 (도)")
              : t("studio.bg3d.selectionArray.stepDegrees", "회전 간격 (도)")}</span>
              <input id={`${inputId}-angle`} type="number" step="any" value={angleText} disabled={disabled}
                aria-invalid={angle === null || angle === 0} aria-describedby={angle === null || angle === 0 ? `${inputId}-error` : undefined}
                onChange={(event) => setAngleText(event.target.value)} className={inputClass} />
            </label>
            <div className="grid grid-cols-3 gap-2">{AXES.map((item) => (
              <label key={item} htmlFor={`${inputId}-pivot-${item}`} className="space-y-1 text-fg-2"><span>{t("studio.bg3d.selectionArray.pivot", { axis: item.toUpperCase() }, "회전 중심 {axis} (m)")}</span>
                <input id={`${inputId}-pivot-${item}`} type="number" step="any" value={pivotText[item]} disabled={disabled}
                  aria-invalid={parseFiniteInput(pivotText[item]) === null}
                  aria-describedby={parseFiniteInput(pivotText[item]) === null ? `${inputId}-error` : undefined}
                  onChange={(event) => { const value = event.target.value; setPivotText((previous) => ({ ...previous, [item]: value })); }} className={inputClass} />
              </label>
            ))}</div>
            <p className="text-fg-2">{t("studio.bg3d.selectionArray.radialOverlap", "원본과 겹치는 회전은 실행할 수 없습니다. 원본을 포함해 8개를 배치하려면 *7과 45도를 입력하세요.")}</p>
          </div>
        )}
        <p data-testid="bg3d-array-node-preview" className="text-fg-2">{t("studio.bg3d.selectionArray.preview", { copies: command.ok ? command.count : 0, count: addedNodeCount }, "추가 사본 {copies}묶음 · 도형 총 {count}개")}</p>
        {validationError ? <p id={`${inputId}-error`} role="alert" className="text-danger">{validationError}</p> : null}
        <button type="submit" data-testid="bg3d-array-execute" disabled={Boolean(unavailableReason || validationError)}
          className="min-h-11 rounded-lg bg-accent px-3 font-bold text-on-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50">
          {t("studio.bg3d.selectionArray.execute", "선택 도형 반복 배치")}
        </button>
      </form>
      {actionMessage ? <p data-testid="bg3d-array-result" role="status" aria-live="polite" className="text-fg-2">{actionMessage}</p> : null}
    </section>
  );
}
