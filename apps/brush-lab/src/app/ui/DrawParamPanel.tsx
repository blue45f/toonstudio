import { useMemo } from "react";

import { useDrawSelector, useLab } from "../shell/lab-context";
import { lazyRadiusPx, resolveDrawProgram } from "../state/draw-program";
import { DRAW_PAPER_KINDS } from "../state/draw-store";
import { resolveProgram } from "../state/run-compare";

import { BrushParamFields } from "./BrushParamPanel";
import { DrawColorPicker } from "./DrawColorPicker";

import type { BrushParamBinding } from "./BrushParamPanel";
import type { DrawPaperKind, DrawStabilizerMode } from "../state/draw-store";
import type { LabOverrides } from "../state/lab-store";

function isPaperKind(value: string): value is DrawPaperKind {
  return DRAW_PAPER_KINDS.some((p) => p.id === value);
}

function isStabilizerMode(value: string): value is DrawStabilizerMode {
  return value === "one-euro" || value === "lazy-brush";
}

interface SliderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** 화면에 보이는 값 문구. */
  text: string;
  isDefault?: boolean;
  onChange: (value: number) => void;
}

function Slider({ id, label, value, min, max, step, text, isDefault, onChange }: SliderProps) {
  return (
    <div className="lab-field">
      <label htmlFor={id}>
        <span>
          {label}: <span className="lab-mono">{text}</span>
          {isDefault ? <span className="lab-muted"> (브러시 기본)</span> : null}
        </span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={text}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/**
 * 그리기 파라미터: 크기·불투명도·흐름·색·안정화(0~100)·종이 질감/종류·마우스 압력 시뮬레이션.
 * 값은 `BrushParamPanel`과 같은 프로그램 오버라이드(`applyOverrides`)로 적용되고 `normalizeProgram`이 범위를 검증한다.
 * 같은 오버라이드를 편집하는 고급 슬라이더(경도·간격·산포·팁 …)는 접이식으로 `BrushParamFields`를 재사용한다.
 */
export function DrawParamPanel() {
  const { drawActions } = useLab();
  const presetId = useDrawSelector((s) => s.presetId);
  const overrides = useDrawSelector((s) => s.overrides);
  const paperKind = useDrawSelector((s) => s.paperKind);
  const color = useDrawSelector((s) => s.color);
  const recentColors = useDrawSelector((s) => s.recentColors);
  const mode = useDrawSelector((s) => s.stabilizerMode);
  const pct = useDrawSelector((s) => s.stabilizerPct);
  const mouseSim = useDrawSelector((s) => s.mousePressureSim);
  const base = useMemo(() => resolveProgram({ presetId, overrides: {} }).program, [presetId]);
  const resolved = useMemo(
    () => resolveDrawProgram({ presetId, overrides, paperKind, stabilizerMode: mode, stabilizerPct: pct }),
    [presetId, overrides, paperKind, mode, pct],
  );

  const sizePx = overrides.sizePx ?? base?.tip.sizePx ?? 8;
  const opacity = overrides.opacity ?? base?.deposition.opacity ?? 1;
  const flow = overrides.flow ?? base?.deposition.flow ?? 1;
  const paperOn = overrides.grain ?? base?.paper.enabled ?? false;
  const set = (patch: LabOverrides): void => drawActions.setOverride(patch);

  const binding: BrushParamBinding = {
    presetId,
    overrides,
    disabled: false,
    setOverride: (patch) => drawActions.setOverride(patch),
    resetOverrides: () => drawActions.resetOverrides(),
  };

  return (
    <section className="lab-draw-section" aria-label="브러시 파라미터" data-testid="lab-draw-params">
      <h3>파라미터</h3>
      <Slider
        id="lab-draw-size"
        label="크기(px)"
        value={sizePx}
        min={0.5}
        max={200}
        step={0.5}
        text={String(sizePx)}
        isDefault={overrides.sizePx === undefined}
        onChange={(v) => set({ sizePx: v })}
      />
      <Slider
        id="lab-draw-opacity"
        label="불투명도"
        value={opacity}
        min={0}
        max={1}
        step={0.01}
        text={`${Math.round(opacity * 100)}%`}
        isDefault={overrides.opacity === undefined}
        onChange={(v) => set({ opacity: v })}
      />
      <Slider
        id="lab-draw-flow"
        label="흐름"
        value={flow}
        min={0}
        max={1}
        step={0.01}
        text={`${Math.round(flow * 100)}%`}
        isDefault={overrides.flow === undefined}
        onChange={(v) => set({ flow: v })}
      />
      <DrawColorPicker color={color} recentColors={recentColors} onChange={(hex) => drawActions.setColor(hex)} />
      <fieldset className="lab-draw-fieldset">
        <legend>입력 보정(안정화)</legend>
        <div className="lab-field">
          <label htmlFor="lab-draw-stab-mode">
            <span>보정 방식</span>
          </label>
          <select
            id="lab-draw-stab-mode"
            value={mode}
            onChange={(e) => {
              if (isStabilizerMode(e.target.value)) drawActions.setStabilizerMode(e.target.value);
            }}
          >
            <option value="one-euro">Sumi 1€ 필터 (기본)</option>
            <option value="lazy-brush">끈 당김(lazy-brush)</option>
          </select>
        </div>
        <Slider
          id="lab-draw-stab"
          label="안정화(0~100)"
          value={pct ?? (mode === "lazy-brush" ? 0 : 50)}
          min={0}
          max={100}
          step={1}
          text={pct === null ? (mode === "lazy-brush" ? "0(끈 없음)" : "브러시 기본") : String(pct)}
          isDefault={pct === null && mode === "one-euro"}
          onChange={(v) => drawActions.setStabilizerPct(v)}
        />
        <p className="lab-muted" data-testid="lab-draw-stab-help">
          {mode === "one-euro"
            ? "엔진 입력 파이프라인의 1€ 필터 강도(값이 클수록 매끈하지만 느리게 따라온다). 0.6 초과 구간도 같은 1€ 매핑을 쓴다."
            : `포인터와 붓 사이의 끈 길이 ${Math.round(lazyRadiusPx(pct))} px — 끈 안쪽의 떨림은 흡수되고 끝점이 포인터보다 늦는다. 엔진 1€ 필터는 브러시 기본값을 쓴다.`}
        </p>
        <p className="lab-muted">
          서비스 <code>applyStabilizer</code>는 경계 규칙(<code>@toonstudio/*</code>는 기준선 레인 파일에서만 import)상 이 화면에서 쓰지
          않는다.
        </p>
      </fieldset>
      <fieldset className="lab-draw-fieldset">
        <legend>종이</legend>
        <label className="lab-check">
          <input type="checkbox" checked={paperOn} onChange={(e) => set({ grain: e.target.checked })} />
          종이 질감 켜기
        </label>
        <div className="lab-field">
          <label htmlFor="lab-draw-paper-kind">
            <span>종이 종류</span>
          </label>
          <select
            id="lab-draw-paper-kind"
            value={paperKind}
            onChange={(e) => {
              if (!isPaperKind(e.target.value)) return;
              drawActions.setPaperKind(e.target.value);
              // 종류를 고르면 질감을 켠다(끄려면 위 스위치를 끈다).
              if (e.target.value !== "preset") set({ grain: true });
            }}
          >
            {DRAW_PAPER_KINDS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <p className="lab-muted">종이 질감은 건식 그레인·습식 번짐에 영향을 준다. 질감 요소가 없는 브러시(예: 일부 스탬프)는 변화가 작다.</p>
      </fieldset>
      <label className="lab-check">
        <input type="checkbox" checked={mouseSim} onChange={(e) => drawActions.setMousePressureSim(e.target.checked)} />
        마우스 압력 시뮬레이션(속도 기반)
      </label>
      <p className="lab-muted">
        마우스는 압력이 없어 느리게 그을수록 세게, 빠르게 그을수록 약하게 만든다. 펜·터치는 실제 압력(펜은 기울기도)을 쓴다.
      </p>
      {resolved.error ? (
        <p className="lab-draw-error" role="alert" data-testid="lab-draw-program-error">
          {resolved.error}
        </p>
      ) : (
        <p className="lab-muted" data-testid="lab-draw-config-hash">
          configHash(fnv1a64): <span className="lab-mono">{resolved.hash}</span>
        </p>
      )}
      <details className="lab-draw-details">
        <summary>고급 파라미터(경도·간격·산포·팁·필터·베타)</summary>
        <BrushParamFields binding={binding} idPrefix="draw" hideKeys={["sizePx", "opacity", "flow", "stabilizer"]} />
      </details>
      <div className="lab-button-row">
        <button
          type="button"
          className="lab-button"
          data-testid="lab-draw-reset-params"
          onClick={() => drawActions.resetOverrides()}
        >
          브러시 기본값으로
        </button>
      </div>
    </section>
  );
}
