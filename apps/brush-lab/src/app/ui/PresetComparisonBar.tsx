import { useEffect, useMemo, useSyncExternalStore } from "react";

import { PRESET_CATALOG } from "../../engine/presets/catalog";
import { useLab, useLabSelector } from "../shell/lab-context";
import { findDescriptor } from "../state/lane-helpers";
import { resolveProgram } from "../state/run-compare";

import type { BrushProgram } from "../../engine/presets/program-schema";
import type { LaneId } from "../../lanes/lane";
import type { LabOverrides, LabStore } from "../state/lab-store";

export interface ParamDiffItem {
  key: string;
  label: string;
  valueA: string;
  valueB: string;
}

export interface CompareConfigSnapshot {
  presetId: string;
  comparePresetBId: string;
  overrides: LabOverrides;
  laneA: LaneId;
  laneB: LaneId;
}

interface CompareUiRecord {
  comparePresetBId: string;
  history: readonly CompareConfigSnapshot[];
  lastTracked: {
    presetId: string;
    overrides: LabOverrides;
    overridesJson: string;
    laneA: LaneId;
    laneB: LaneId;
  };
  listeners: Set<() => void>;
}

const compareUiMap = new WeakMap<LabStore, CompareUiRecord>();

function defaultPresetB(presetAId: string): string {
  return presetAId === "ink-g-pen" ? "pencil-hb" : "ink-g-pen";
}

function getCompareUiRecord(store: LabStore): CompareUiRecord {
  let rec = compareUiMap.get(store);
  if (!rec) {
    const s = store.get();
    rec = {
      comparePresetBId: defaultPresetB(s.presetId),
      history: [],
      lastTracked: {
        presetId: s.presetId,
        overrides: { ...s.overrides },
        overridesJson: JSON.stringify(s.overrides),
        laneA: s.laneA,
        laneB: s.laneB,
      },
      listeners: new Set(),
    };
    compareUiMap.set(store, rec);
  }
  return rec;
}

function notifyCompareUi(rec: CompareUiRecord): void {
  for (const fn of rec.listeners) fn();
}

export function setComparePresetB(store: LabStore, nextPresetBId: string): void {
  if (!nextPresetBId || !PRESET_CATALOG.some((p) => p.id === nextPresetBId)) return;
  const rec = getCompareUiRecord(store);
  if (rec.comparePresetBId === nextPresetBId) return;
  const s = store.get();
  const prevSnapshot: CompareConfigSnapshot = {
    presetId: s.presetId,
    comparePresetBId: rec.comparePresetBId,
    overrides: { ...s.overrides },
    laneA: s.laneA,
    laneB: s.laneB,
  };
  rec.history = [...rec.history.slice(-9), prevSnapshot];
  rec.comparePresetBId = nextPresetBId;
  notifyCompareUi(rec);
}

export function swapComparePresets(store: LabStore, setPresetA: (presetId: string) => void): void {
  const rec = getCompareUiRecord(store);
  const s = store.get();
  const prevA = s.presetId;
  const prevB = rec.comparePresetBId;
  const prevSnapshot: CompareConfigSnapshot = {
    presetId: prevA,
    comparePresetBId: prevB,
    overrides: { ...s.overrides },
    laneA: s.laneA,
    laneB: s.laneB,
  };
  rec.history = [...rec.history.slice(-9), prevSnapshot];
  rec.comparePresetBId = prevA;
  rec.lastTracked = {
    presetId: prevB,
    overrides: {},
    overridesJson: JSON.stringify({}),
    laneA: s.laneA,
    laneB: s.laneB,
  };
  setPresetA(prevB);
  notifyCompareUi(rec);
}

export function undoCompareConfig(store: LabStore): boolean {
  const rec = getCompareUiRecord(store);
  const last = rec.history.at(-1);
  if (!last) return false;
  rec.history = rec.history.slice(0, -1);
  rec.comparePresetBId = last.comparePresetBId;
  rec.lastTracked = {
    presetId: last.presetId,
    overrides: { ...last.overrides },
    overridesJson: JSON.stringify(last.overrides),
    laneA: last.laneA,
    laneB: last.laneB,
  };
  store.set({
    presetId: last.presetId,
    overrides: { ...last.overrides },
    laneA: last.laneA,
    laneB: last.laneB,
  });
  notifyCompareUi(rec);
  return true;
}

export function useCompareUiState(store: LabStore): {
  comparePresetBId: string;
  historyCount: number;
} {
  const rec = getCompareUiRecord(store);
  const s = useSyncExternalStore(
    (onStoreChange) => {
      rec.listeners.add(onStoreChange);
      const unsubStore = store.subscribe(() => {
        const cur = store.get();
        const curOverridesJson = JSON.stringify(cur.overrides);
        const prev = rec.lastTracked;
        if (
          cur.presetId !== prev.presetId ||
          curOverridesJson !== prev.overridesJson ||
          cur.laneA !== prev.laneA ||
          cur.laneB !== prev.laneB
        ) {
          rec.history = [
            ...rec.history.slice(-9),
            {
              presetId: prev.presetId,
              comparePresetBId: rec.comparePresetBId,
              overrides: { ...prev.overrides },
              laneA: prev.laneA,
              laneB: prev.laneB,
            },
          ];
          rec.lastTracked = {
            presetId: cur.presetId,
            overrides: { ...cur.overrides },
            overridesJson: curOverridesJson,
            laneA: cur.laneA,
            laneB: cur.laneB,
          };
        }
        onStoreChange();
      });
      return () => {
        rec.listeners.delete(onStoreChange);
        unsubStore();
      };
    },
    () => `${rec.comparePresetBId}:${rec.history.length}`,
  );
  const [comparePresetBId] = s.split(":");
  return {
    comparePresetBId: comparePresetBId ?? rec.comparePresetBId,
    historyCount: rec.history.length,
  };
}

interface ParamFieldExtractor {
  key: string;
  label: string;
  read: (p: BrushProgram) => string;
}

const PARAM_EXTRACTORS: readonly ParamFieldExtractor[] = [
  { key: "sizePx", label: "크기(px)", read: (p) => String(p.tip.sizePx) },
  { key: "hardness", label: "경도", read: (p) => String(p.tip.hardness) },
  { key: "spacing", label: "간격", read: (p) => String(p.deposition.spacing) },
  { key: "timeDabsPerSecond", label: "시간 dab(초당)", read: (p) => String(p.deposition.timeDabsPerSecond) },
  { key: "opacity", label: "불투명도", read: (p) => String(p.deposition.opacity) },
  { key: "flow", label: "흐름", read: (p) => String(p.deposition.flow) },
  { key: "scatterPx", label: "산포(px)", read: (p) => String(p.strokeDynamics.scatter.positionPx) },
  { key: "kind", label: "팁 텍스처", read: (p) => p.tip.kind },
  { key: "filter", label: "샘플링 필터", read: (p) => p.paper.filter },
  { key: "grain", label: "종이 그레인", read: (p) => (p.paper.enabled ? "켜짐" : "꺼짐") },
  { key: "wetBeta", label: "습식 베타", read: (p) => (p.wet !== null ? "켜짐" : "꺼짐") },
  { key: "kmBeta", label: "KM 혼색", read: (p) => (p.colorDynamics.kmMixing ? "켜짐" : "꺼짐") },
];

/** 두 브러시 프로그램의 실제 스키마 파라미터 차이를 추출한다(수치 추정 없음). */
export function computePresetParameterDiff(
  programA: BrushProgram | null,
  programB: BrushProgram | null,
): readonly ParamDiffItem[] {
  if (!programA || !programB) return [];
  const diffs: ParamDiffItem[] = [];
  for (const field of PARAM_EXTRACTORS) {
    const valA = field.read(programA);
    const valB = field.read(programB);
    if (valA !== valB) {
      diffs.push({ key: field.key, label: field.label, valueA: valA, valueB: valB });
    }
  }
  return diffs;
}

/**
 * A/B 비교 탭 상단: 동일 샘플 획 기준 프리셋 A/B 선택·비교 순서·파라미터 차이·설정 되돌리기·실험 결과 보존 안내.
 */
export function PresetComparisonBar() {
  const { store, actions, registry } = useLab();
  const presetId = useLabSelector((s) => s.presetId);
  const overrides = useLabSelector((s) => s.overrides);
  const laneA = useLabSelector((s) => s.laneA);
  const laneB = useLabSelector((s) => s.laneB);
  const fixtureId = useLabSelector((s) => s.fixtureId);
  const fixtureSource = useLabSelector((s) => s.fixtureSource);
  const captured = useLabSelector((s) => s.captured);
  const canvasSize = useLabSelector((s) => s.canvasSize);
  const seed = useLabSelector((s) => s.seed);
  const running = useLabSelector((s) => s.running);
  const results = useLabSelector((s) => s.results);
  const reports = useLabSelector((s) => s.reports);

  const { comparePresetBId, historyCount } = useCompareUiState(store);

  // 초기 마운트 시 현재 상태를 추적 기준점으로 동기화
  useEffect(() => {
    getCompareUiRecord(store);
  }, [store]);

  const baseProgramA = useMemo(() => resolveProgram({ presetId, overrides: {} }).program, [presetId]);
  const resolvedA = useMemo(() => resolveProgram({ presetId, overrides }), [presetId, overrides]);
  const programA = resolvedA.program ?? baseProgramA;
  const programB = useMemo(
    () => resolveProgram({ presetId: comparePresetBId, overrides: {} }).program,
    [comparePresetBId],
  );

  const presetDiffs = useMemo(() => computePresetParameterDiff(programA, programB), [programA, programB]);
  const overrideDiffs = useMemo(() => computePresetParameterDiff(baseProgramA, programA), [baseProgramA, programA]);

  const descA = findDescriptor(registry, laneA);
  const descB = findDescriptor(registry, laneB);
  const labelA = descA ? descA.label : laneA;
  const labelB = descB ? descB.label : laneB;
  const displaySize = fixtureSource === "captured" && captured ? captured.width : canvasSize;
  const sampleLabel =
    fixtureSource === "captured" && captured
      ? `캡처 획 (${captured.samples.length}표본 · ${captured.width}×${captured.height})`
      : `내장 ${fixtureId} (${displaySize}² · 시드 ${seed})`;

  const executedResult = results.a ?? results.b;
  const executedPreset = executedResult
    ? PRESET_CATALOG.find((p) => p.id === executedResult.presetId) ?? null
    : null;

  const swapLanes = (): void => {
    store.set({ laneA: laneB, laneB: laneA });
  };

  return (
    <div className="lab-compare-summary-card" data-testid="lab-preset-ab-compare">
      <div className="lab-compare-summary-header" data-testid="lab-compare-order-summary">
        <span className="lab-badge lab-badge--pass" data-testid="lab-compare-sample-badge">
          동일 샘플 획: {sampleLabel}
        </span>
        <span className="lab-badge" data-testid="lab-compare-preset-order">
          프리셋 순서: 기준 A [{programA?.name ?? presetId} ({presetId})] → 비교 B [{programB?.name ?? comparePresetBId} (
          {comparePresetBId})]
        </span>
        <span className="lab-badge" data-testid="lab-compare-lane-order">
          레인 순서: A [{labelA}] → B [{labelB}]
        </span>
      </div>

      <div className="lab-compare-controls-row">
        <div className="lab-field lab-compare-preset-b-field">
          <label htmlFor="lab-compare-preset-b">
            <span>비교 프리셋 B (동일 샘플 획 대조군)</span>
          </label>
          <select
            id="lab-compare-preset-b"
            aria-label="비교 프리셋 B"
            data-testid="lab-compare-preset-b-select"
            value={comparePresetBId}
            disabled={running}
            onChange={(e) => setComparePresetB(store, e.target.value)}
          >
            {PRESET_CATALOG.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.family} · {p.id})
              </option>
            ))}
          </select>
        </div>

        <div className="lab-button-row">
          <button
            type="button"
            className="lab-button lab-button--compact"
            data-testid="lab-preset-swap-ab"
            disabled={running}
            onClick={() => swapComparePresets(store, (id) => actions.setPreset(id))}
          >
            프리셋 A ↔ B 순서 바꾸기
          </button>
          <button
            type="button"
            className="lab-button lab-button--compact"
            data-testid="lab-lane-swap-ab"
            disabled={running}
            onClick={swapLanes}
          >
            레인 A ↔ B 순서 바꾸기
          </button>
          <button
            type="button"
            className="lab-button lab-button--compact"
            data-testid="lab-compare-undo-config"
            disabled={running || historyCount === 0}
            onClick={() => undoCompareConfig(store)}
          >
            이전 설정으로 되돌리기{historyCount > 0 ? ` (${historyCount})` : ""}
          </button>
        </div>
      </div>

      <div className="lab-compare-diff-box" data-testid="lab-preset-param-diff">
        <div className="lab-button-row">
          <strong>프리셋 A/B 파라미터 차이</strong>
          <span
            className={presetDiffs.length > 0 ? "lab-badge lab-badge--warn" : "lab-badge lab-badge--pass"}
            data-testid="lab-preset-diff-count"
          >
            {presetDiffs.length > 0 ? `차이 ${presetDiffs.length}개 항목` : "파라미터 동일 (차이 0개)"}
          </span>
          {overrideDiffs.length > 0 ? (
            <span className="lab-badge lab-badge--warn" data-testid="lab-override-diff-summary">
              기준 A 사용자 조정 {overrideDiffs.length}개:{" "}
              {overrideDiffs.map((d) => `${d.label} ${d.valueA}→${d.valueB}`).join(", ")}
            </span>
          ) : null}
        </div>
        {presetDiffs.length > 0 ? (
          <ul className="lab-compare-diff-chips" aria-label="프리셋 A/B 파라미터 차이 목록">
            {presetDiffs.map((d) => (
              <li key={d.key} className="lab-compare-diff-chip" data-testid={`lab-preset-diff-${d.key}`}>
                <span className="lab-muted">{d.label}:</span>{" "}
                <span className="lab-mono">
                  A {d.valueA} → B {d.valueB}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="lab-muted">기준 프리셋 A와 비교 프리셋 B의 스키마 파라미터가 동일합니다.</p>
        )}
      </div>

      {executedResult ? (
        <p className="lab-compare-preserved-note" role="status" data-testid="lab-compare-result-preserved">
          <strong>실험 결과 보존 중</strong> — 실행 프리셋:{" "}
          <span className="lab-mono">
            {executedPreset ? `${executedPreset.name} (${executedResult.presetId})` : executedResult.presetId}
          </span>{" "}
          · 샘플 획: <span className="lab-mono">{executedResult.fixtureId}</span> · 누적 세션 리포트 {reports.length}건
          {executedResult.presetId !== presetId
            ? ` (현재 선택 프리셋 '${programA?.name ?? presetId}'(으)로 변경·되돌리기 후에도 'A/B 실행' 또는 '결과 지우기' 전까지 이전 실험 결과는 소실되지 않습니다)`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
