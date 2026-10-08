import { useMemo } from "react";

import { PRESET_CATALOG } from "../../engine/presets/catalog";
import { TIP_KINDS } from "../../engine/presets/program-schema";
import { SAMPLING_FILTERS } from "../../engine/texture/sampling";
import { useLab, useLabSelector } from "../shell/lab-context";
import { STABILIZER_BACKEND_LIMIT } from "../state/apply-overrides";
import { resolveProgram } from "../state/run-compare";

import type { TipKind } from "../../engine/core/types";
import type { BrushProgram } from "../../engine/presets/program-schema";
import type { SamplingFilter } from "../../engine/texture/sampling";
import type { LabOverrides } from "../state/lab-store";

export type NumericKey =
  | "sizePx"
  | "hardness"
  | "spacing"
  | "timeDabsPerSecond"
  | "opacity"
  | "flow"
  | "scatterPx"
  | "stabilizer";

interface NumericField {
  key: NumericKey;
  label: string;
  min: number;
  max: number;
  step: number;
  /** 오버라이드가 없을 때 보여줄 프리셋 값. */
  base: (p: BrushProgram) => number;
}

const NUMERIC_FIELDS: readonly NumericField[] = [
  { key: "sizePx", label: "크기(px)", min: 0.5, max: 200, step: 0.5, base: (p) => p.tip.sizePx },
  { key: "hardness", label: "경도", min: 0, max: 1, step: 0.01, base: (p) => p.tip.hardness },
  { key: "spacing", label: "간격(반경 배율)", min: 0.01, max: 4, step: 0.01, base: (p) => p.deposition.spacing },
  // 시간 기반 dab(초당): 정지·저속에서 잉크 고임·에어브러시 누적. 0이면 거리 기반만.
  { key: "timeDabsPerSecond", label: "시간 dab(초당)", min: 0, max: 240, step: 1, base: (p) => p.deposition.timeDabsPerSecond },
  { key: "opacity", label: "불투명도", min: 0, max: 1, step: 0.01, base: (p) => p.deposition.opacity },
  { key: "flow", label: "흐름", min: 0, max: 1, step: 0.01, base: (p) => p.deposition.flow },
  { key: "scatterPx", label: "산포(px)", min: 0, max: 50, step: 0.5, base: (p) => p.strokeDynamics.scatter.positionPx },
  // 안정화 강도는 프리셋에 직접 대응하는 값이 없다(1€ 파라미터로 매핑). 미설정이면 0.5를 표시한다.
  { key: "stabilizer", label: "안정화 강도", min: 0, max: 1, step: 0.01, base: () => 0.5 },
];

function isTipKind(v: string): v is TipKind {
  return (TIP_KINDS as readonly string[]).includes(v);
}

function isSamplingFilter(v: string): v is SamplingFilter {
  return (SAMPLING_FILTERS as readonly string[]).includes(v);
}

/**
 * 파라미터 패널이 읽고 쓰는 값. A/B 비교는 `lab-store`에, 그리기 화면은 `draw-store`에 연결한다
 * (두 화면이 서로의 프리셋·오버라이드를 건드리지 않는다).
 */
export interface BrushParamBinding {
  presetId: string;
  overrides: LabOverrides;
  /** 실행 중 등으로 편집을 잠글 때 true. */
  disabled: boolean;
  /** 없으면 프리셋 선택기를 그리지 않는다(그리기 화면은 별도 브러시 선택기를 쓴다). */
  setPreset?: (presetId: string) => void;
  setOverride: (patch: LabOverrides) => void;
  resetOverrides: () => void;
}

export interface BrushParamFieldsProps {
  binding: BrushParamBinding;
  /** DOM id·data-testid 접두사. 같은 문서에 두 패널이 있어도 id가 겹치지 않게 한다. 기본 "lab". */
  idPrefix?: string;
  /** 숨길 숫자 슬라이더(다른 곳에서 편집하는 값). */
  hideKeys?: readonly NumericKey[];
}

/**
 * 최소 브러시 파라미터 패널. 값은 프리셋 위에 오버라이드로 얹히고 `normalizeProgram`으로 재검증된다.
 * 범위 밖 값은 해시 대신 오류로 표시한다(무음 보정 없음).
 */
export function BrushParamFields({ binding, idPrefix = "lab", hideKeys = [] }: BrushParamFieldsProps) {
  const { presetId, overrides, disabled: running, setPreset } = binding;
  const base = useMemo(() => resolveProgram({ presetId, overrides: {} }).program, [presetId]);
  const resolved = useMemo(() => resolveProgram({ presetId, overrides }), [presetId, overrides]);
  const set = (patch: LabOverrides): void => binding.setOverride(patch);
  const stabilizer = overrides.stabilizer;
  return (
    <div className="lab-form-grid" data-testid={`${idPrefix}-param-panel`}>
      {setPreset ? (
        <div className="lab-field">
          <label htmlFor={`${idPrefix}-preset`}>
            <span>프리셋</span>
          </label>
          <select id={`${idPrefix}-preset`} value={presetId} disabled={running} onChange={(e) => setPreset(e.target.value)}>
            {PRESET_CATALOG.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.family})
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {NUMERIC_FIELDS.filter((f) => !hideKeys.includes(f.key)).map((f) => {
        const current = overrides[f.key] ?? (base ? f.base(base) : f.min);
        const id = `${idPrefix}-param-${f.key}`;
        return (
          <div className="lab-field" key={f.key}>
            <label htmlFor={id}>
              <span>
                {f.label}: <span className="lab-mono">{current}</span>
                {overrides[f.key] === undefined ? <span className="lab-muted"> (프리셋 기본)</span> : null}
              </span>
            </label>
            <input
              id={id}
              type="range"
              min={f.min}
              max={f.max}
              step={f.step}
              value={current}
              disabled={running}
              aria-valuetext={String(current)}
              onChange={(e) => set({ [f.key]: Number(e.target.value) })}
            />
          </div>
        );
      })}
      {!hideKeys.includes("stabilizer") && stabilizer !== undefined && stabilizer > STABILIZER_BACKEND_LIMIT ? (
        <p className="lab-muted">
          안정화 {STABILIZER_BACKEND_LIMIT} 초과 구간은 설계상 spring 팔로워 백엔드 대상이며 이 랩에서는 같은 1€ 매핑을
          쓴다.
        </p>
      ) : null}
      <div className="lab-field">
        <label htmlFor={`${idPrefix}-param-kind`}>
          <span>팁 텍스처</span>
        </label>
        <select
          id={`${idPrefix}-param-kind`}
          value={overrides.kind ?? base?.tip.kind ?? "round"}
          disabled={running}
          onChange={(e) => {
            if (isTipKind(e.target.value)) set({ kind: e.target.value });
          }}
        >
          {TIP_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>
      <div className="lab-field">
        <label htmlFor={`${idPrefix}-param-filter`}>
          <span>샘플링 필터</span>
        </label>
        <select
          id={`${idPrefix}-param-filter`}
          value={overrides.filter ?? base?.paper.filter ?? "trilinear"}
          disabled={running}
          onChange={(e) => {
            if (isSamplingFilter(e.target.value)) set({ filter: e.target.value });
          }}
        >
          {SAMPLING_FILTERS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>
      <label className="lab-check">
        <input
          type="checkbox"
          checked={overrides.grain ?? base?.paper.enabled ?? false}
          disabled={running}
          onChange={(e) => set({ grain: e.target.checked })}
        />
        종이 그레인
      </label>
      <label className="lab-check">
        <input
          type="checkbox"
          checked={overrides.wetBeta ?? (base ? base.wet !== null : false)}
          disabled={running}
          onChange={(e) => set({ wetBeta: e.target.checked })}
        />
        습식(젖음·번짐) 베타
      </label>
      <label className="lab-check">
        <input
          type="checkbox"
          checked={overrides.kmBeta ?? base?.colorDynamics.kmMixing ?? false}
          disabled={running}
          onChange={(e) => set({ kmBeta: e.target.checked })}
        />
        Kubelka-Munk 혼색 베타
      </label>
      <div className="lab-button-row">
        <button type="button" className="lab-button" disabled={running} onClick={() => binding.resetOverrides()}>
          오버라이드 초기화
        </button>
        <span className="lab-muted" data-testid={`${idPrefix}-config-hash`}>
          configHash(fnv1a64):{" "}
          {resolved.hash ? <span className="lab-mono">{resolved.hash}</span> : <span role="alert">{resolved.error}</span>}
        </span>
      </div>
    </div>
  );
}

/** A/B 비교 탭용: `lab-store`에 연결한 패널(프리셋 선택기 포함). */
export function BrushParamPanel() {
  const { actions } = useLab();
  const presetId = useLabSelector((s) => s.presetId);
  const overrides = useLabSelector((s) => s.overrides);
  const running = useLabSelector((s) => s.running);
  const binding: BrushParamBinding = {
    presetId,
    overrides,
    disabled: running,
    setPreset: (id) => actions.setPreset(id),
    setOverride: (patch) => actions.setOverride(patch),
    resetOverrides: () => actions.resetOverrides(),
  };
  return <BrushParamFields binding={binding} />;
}
