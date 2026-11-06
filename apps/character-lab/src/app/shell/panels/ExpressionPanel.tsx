/**
 * ExpressionPanel: 표정 프리셋 12 카드 + 프리셋 세기 + FACS 16 슬라이더 + 초기화·길항(모순 유닛) 완화.
 *
 * - 카드 클릭 = `slot/apply`(expression) 1회(레시피 표정을 프리셋 가중치로 교체·슬롯 기록).
 * - 슬라이더 변경 = `expression/set`(merge: true, 해당 유닛만) — 슬라이더가 프리셋보다 우선(blendExpression 규칙).
 * - 프리셋 세기 = blendExpressionPresets([{프리셋 가중치, 세기}])에 이 패널에서 만진 유닛을 덮어(blendExpression)
 *   `expression/set`(merge: false)로 교체. 프리셋을 바꾸면 세기·덮어쓰기 목록을 초기화한다.
 * - 모순 유닛 완화 = relaxAntagonists(현재 표정)로 교체(바뀌는 것이 없으면 비활성). 초기화 = 빈 표정.
 * - 슬라이더 드래그는 `expression/set`에 `coalesceKey: unit`을 실어 같은 유닛의 연속 변경을 history 1단계로 병합한다
 *   (`param/set`과 같은 규칙, state/lab-store가 처리). 프리셋 카드·세기·초기화·완화는 각각 1단계다.
 * - 스타일 접두 `cl-expression-`(core의 character-lab.css가 정의).
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { blendExpression, blendExpressionPresets, expressionToMorphWeights, relaxAntagonists } from "../../../animation/expression-blend";
import { EXPRESSION_PRESETS } from "../../../animation/presets";
import { DEFAULT_EYE_GAZE, EYE_GAZE_LIMIT_DEG, FACS_LABELS_KO, FACS_UNITS, clampExpression } from "../../../contracts";
import { useApplyPlan, useDispatch, useEngineSession, useLabState } from "../lab-store-context";

import type { EyeGaze, ExpressionPreset, ExpressionWeights, FacsUnit } from "../../../contracts";
/** 두 표정이 클램프 후 같은지(없는 유닛 = 0) */
export function expressionsEqual(a: ExpressionWeights, b: ExpressionWeights): boolean {
  const ca = clampExpression(a);
  const cb = clampExpression(b);
  return FACS_UNITS.every((unit) => (ca[unit] ?? 0) === (cb[unit] ?? 0));
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function ExpressionPanel() {
  const { recipe, capabilities } = useLabState();
  const dispatch = useDispatch();
  const plan = useApplyPlan();
  const ids = useId();
  /** 이 패널에서 슬라이더로 만진 유닛(프리셋 세기 변경 시 보존) */
  const [overrides, setOverrides] = useState<ExpressionWeights>({});
  const [influence, setInfluence] = useState(1);
  const prevSlotRef = useRef(recipe.slots.expression);
  const prevExpressionRef = useRef(recipe.expression);

  useEffect(() => {
    if (recipe.slots.expression !== prevSlotRef.current) {
      prevSlotRef.current = recipe.slots.expression;
      prevExpressionRef.current = recipe.expression;
      setOverrides({});
      setInfluence(1);
      return;
    }
    if (recipe.expression !== prevExpressionRef.current) {
      prevExpressionRef.current = recipe.expression;
      const hasAnyActive = FACS_UNITS.some((unit) => (recipe.expression[unit] ?? 0) > 0);
      if (!hasAnyActive) {
        setOverrides({});
        setInfluence(1);
        return;
      }
      setOverrides((previous) => {
        const keys = Object.keys(previous) as FacsUnit[];
        if (keys.length === 0) return previous;
        let changed = false;
        const next: Partial<Record<FacsUnit, number>> = {};
        for (const unit of keys) {
          const currentVal = recipe.expression[unit] ?? 0;
          if (Math.abs(currentVal - (previous[unit] ?? 0)) < 1e-6) {
            next[unit] = previous[unit];
          } else {
            changed = true;
          }
        }
        return changed ? next : previous;
      });
    }
  }, [recipe.slots.expression, recipe.expression]);

  const session = useEngineSession();
  const eyeGaze = recipe.eyeGaze ?? DEFAULT_EYE_GAZE;
  const editableGaze: EyeGaze = { mode: eyeGaze.mode, symmetry: eyeGaze.symmetry, left: eyeGaze.left, right: eyeGaze.right };
  const eyeReading = session.engine()?.eyeGaze?.();
  const eyesDisabled = eyeReading?.status !== "available";
  const eyeReason = eyeReading?.status === "unavailable" ? eyeReading.reasonKo : "안구 본을 확인할 렌더 엔진이 준비되지 않았습니다.";
  const setGaze = (gaze: EyeGaze, coalesceKey?: string): void => {
    dispatch({ type: "eye-gaze/set", gaze, ...(coalesceKey ? { coalesceKey } : {}) });
  };
  const freezeGaze = useCallback((): boolean => {
    const current = session.engine()?.eyeGaze?.();
    if (current?.status !== "available") return false;
    dispatch({ type: "eye-gaze/set", gaze: { mode: "manual", symmetry: false, left: current.left, right: current.right, frozenPose: current.frozenPose } });
    return true;
  }, [dispatch, session]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "F10" || event.repeat || event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select")) return;
      const editable = target?.closest("[contenteditable]");
      if (editable && editable.getAttribute("contenteditable") !== "false") return;
      if (freezeGaze()) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [freezeGaze]);

  const capability = capabilities.expression;
  const disabled = capability.status === "unavailable";
  const unsupported = plan?.unsupported.find((item) => item.slot === "expression");
  const currentPreset = EXPRESSION_PRESETS.find((preset) => preset.id === recipe.slots.expression);
  const relaxed = relaxAntagonists(recipe.expression);
  const canRelax = !expressionsEqual(relaxed, recipe.expression);
  const activeUnits = FACS_UNITS.filter((unit) => (recipe.expression[unit] ?? 0) > 0);
  const morphCount = Object.keys(expressionToMorphWeights(recipe.expression)).length;

  const applyPreset = (preset: ExpressionPreset): void => {
    setOverrides({});
    setInfluence(1);
    dispatch({ type: "slot/apply", slot: "expression", presetId: preset.id });
  };

  const setUnit = (unit: FacsUnit, value: number): void => {
    setOverrides((previous) => ({ ...previous, [unit]: value }));
    dispatch({ type: "expression/set", weights: { [unit]: value }, merge: true, coalesceKey: unit });
  };

  const setPresetInfluence = (value: number): void => {
    setInfluence(value);
    const base = blendExpressionPresets([{ weights: currentPreset?.weights ?? {}, influence: value }]);
    dispatch({ type: "expression/set", weights: blendExpression(base, overrides), merge: false });
  };

  const reset = (): void => {
    setOverrides({});
    setInfluence(1);
    dispatch({ type: "expression/set", weights: {}, merge: false });
  };

  const relax = (): void => {
    setOverrides((previous) => {
      const next: Partial<Record<FacsUnit, number>> = {};
      for (const unit of Object.keys(previous) as FacsUnit[]) {
        const relaxedVal = relaxed[unit];
        if (relaxedVal !== undefined) next[unit] = relaxedVal;
      }
      return next;
    });
    dispatch({ type: "expression/set", weights: relaxed, merge: false });
  };

  return (
    <section className="cl-expression-panel" aria-label="표정">
      <h2 className="cl-expression-title">표정</h2>
      {capability.status !== "available" ? (
        <p className="cl-expression-reason" role="note">
          표정 슬롯 {capability.status === "partial" ? "부분 지원" : "미지원"}: {capability.reasonKo ?? "사유 없음"}
        </p>
      ) : null}
      {unsupported ? (
        <p className="cl-expression-reason" role="status">
          현재 표정이 적용되지 않았습니다: {unsupported.reasonKo}
        </p>
      ) : null}

      <div className="cl-expression-grid" role="group" aria-label="표정 프리셋">
        {EXPRESSION_PRESETS.map((preset) => {
          const selected = recipe.slots.expression === preset.id;
          const unitCount = FACS_UNITS.filter((unit) => (preset.weights[unit] ?? 0) > 0).length;
          return (
            <button
              key={preset.id}
              type="button"
              className={`cl-expression-card${selected ? " cl-expression-card--selected" : ""}`}
              aria-pressed={selected}
              disabled={disabled}
              title={capability.reasonKo}
              data-preset-id={preset.id}
              onClick={() => applyPreset(preset)}
            >
              <span className="cl-expression-card-label">{preset.labelKo}</span>
              <span className="cl-expression-card-meta">유닛 {unitCount}개</span>
            </button>
          );
        })}
      </div>

      <div className="cl-expression-row">
        <label htmlFor={`${ids}-influence`}>프리셋 세기</label>
        <input
          id={`${ids}-influence`}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={influence}
          disabled={disabled || !currentPreset}
          onChange={(event) => setPresetInfluence(Number(event.target.value))}
        />
        <output htmlFor={`${ids}-influence`}>{percent(influence)}</output>
      </div>

      <div
        className="cl-expression-actions"
        role="group"
        aria-label="프리셋 빠른 강도"
        data-testid="expression-quick-intensity"
      >
        {[
          { label: "은은하게 35%", value: 0.35 },
          { label: "자연스럽게 70%", value: 0.7 },
          { label: "최대 100%", value: 1 },
        ].map((preset) => (
          <button
            key={preset.label}
            type="button"
            disabled={disabled || !currentPreset}
            aria-pressed={Math.abs(influence - preset.value) < 0.01}
            onClick={() => setPresetInfluence(preset.value)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="cl-expression-sliders" role="group" aria-label="FACS 슬라이더">
        {FACS_UNITS.map((unit) => {
          const value = recipe.expression[unit] ?? 0;
          return (
            <div key={unit} className="cl-expression-row">
              <label htmlFor={`${ids}-${unit}`}>{FACS_LABELS_KO[unit]}</label>
              <input id={`${ids}-${unit}`} type="range" min={0} max={1} step={0.01} value={value} disabled={disabled} onChange={(event) => setUnit(unit, Number(event.target.value))} />
              <output htmlFor={`${ids}-${unit}`}>{percent(value)}</output>
            </div>
          );
        })}
      </div>

      <div className="cl-expression-actions">
        <button type="button" onClick={reset} disabled={disabled}>
          표정 초기화
        </button>
        <button type="button" onClick={relax} disabled={disabled || !canRelax}>
          모순 유닛 완화
        </button>
      </div>
      <p className="cl-expression-status">
        활성 유닛 {activeUnits.length}개 · morph {morphCount}개{currentPreset ? ` · 프리셋 ${currentPreset.labelKo}` : ""}
      </p>

      <div
        className="cl-expression-shaper-eyeball"
        data-testid="shaper-expression-headpart-section"
      >
        <h3>안구 시선</h3>
        {eyesDisabled && <p role="status">{eyeReason}</p>}
        <fieldset className="cl-expression-row" disabled={eyesDisabled}>
          <legend>실제 안구 본 제어</legend>
          <label htmlFor={`${ids}-fix-eyeball-cam`}>카메라 응시</label>
          <input id={`${ids}-fix-eyeball-cam`} type="checkbox" checked={eyeGaze.mode === "camera"}
            onChange={(event) => event.target.checked ? setGaze({ ...editableGaze, mode: "camera" }) : freezeGaze()} />
          <button type="button" onClick={freezeGaze}>현재 시선 고정 (F10)</button>
          <label htmlFor={`${ids}-eyeball-symmetry`}>좌우 안구 대칭 회전</label>
          <input id={`${ids}-eyeball-symmetry`} type="checkbox" checked={eyeGaze.symmetry}
            disabled={eyeGaze.mode === "camera"} onChange={(event) => setGaze({ ...editableGaze, symmetry: event.target.checked })} />
          {(["left", "right"] as const).map((side) => (["yawDeg", "pitchDeg"] as const).map((axis) => {
            const id = `${ids}-${side}-${axis}`;
            const label = `${side === "left" ? "좌측" : "우측"} 안구 ${axis === "yawDeg" ? "수평 시선 (Yaw°)" : "수직 시선 (Pitch°)"}`;
            return <div className="cl-expression-row" key={id}>
              <label htmlFor={id}>{label}</label>
              <input id={id} type="range" min={-EYE_GAZE_LIMIT_DEG} max={EYE_GAZE_LIMIT_DEG} step={1}
                value={side === "right" && eyeGaze.symmetry ? (axis === "yawDeg" ? -eyeGaze.left.yawDeg : eyeGaze.left.pitchDeg) : eyeGaze[side][axis]}
                disabled={eyeGaze.mode === "camera" || (side === "right" && eyeGaze.symmetry)}
                onChange={(event) => setGaze({ ...editableGaze, mode: "manual", [side]: { ...eyeGaze[side], [axis]: Number(event.target.value) } }, `eye-${side}-${axis}`)} />
            </div>;
          }))}
        </fieldset>
        <p className="cl-expression-footer">카메라 응시는 실제 뷰포트 카메라를 따라갑니다. 고정하면 현재 본 회전을 저장하며, 캡처 중에는 시선을 유지합니다. 시선 조정 범위는 ±25°입니다.</p>
        <fieldset disabled className="cl-expression-row">
          <legend>하이라이트 기준 변경 · 미지원</legend>
          {["안구 고정 (fix)", "카메라 추적 (cam)", "조명 반사 (light)", "월드 고정 (world)"].map((label) => <label key={label}><input type="radio" name={`${ids}-highlight-unavailable`} />{label}</label>)}
        </fieldset>
        <p className="cl-expression-footer">독립 하이라이트 방향 제어는 현재 렌더러가 지원하지 않습니다. 현재 재질의 반사·메시에 포함된 하이라이트를 유지합니다.</p>
      </div>

      <p className="cl-expression-footer">같은 슬라이더의 연속 드래그는 되돌리기 1단계로 병합되고, 프리셋 카드·세기·초기화는 각각 1단계입니다.</p>
    </section>
  );
}
