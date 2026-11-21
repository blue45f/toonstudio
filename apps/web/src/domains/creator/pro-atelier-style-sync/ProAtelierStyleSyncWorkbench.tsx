import { CheckCircle2, Layers, RotateCcw } from "lucide-react";
import { useId, useMemo, useState } from "react";

import {
  DEFAULT_ASSISTANT_SUBMISSION_CUTS,
  DEFAULT_MASTER_CUT_DNA,
  STYLE_SYNC_DELTA_E_TARGET,
  STYLE_SYNC_STROKE_ERROR_TARGET_PX,
  analyzeCutStyleDrift,
  formatCutSwatchCss,
  harmonizeCrossCutStyles,
  harmonizeSingleCutToMaster,
  type CutArtStyleDna,
  type StyleDriftGrade,
} from "./cross-cut-style-harmonizer-engine";

function buildLutPolyline(lut: readonly number[]): string {
  return lut
    .map((val, idx) => {
      const x = 6 + (idx / Math.max(1, lut.length - 1)) * 148;
      const y = 44 - val * 38;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function gradeBadgeTone(grade: StyleDriftGrade): "good" | "warn" | "bad" {
  if (grade === "matched") return "good";
  if (grade === "minor-drift") return "warn";
  return "bad";
}

function gradeLabelKo(grade: StyleDriftGrade): string {
  if (grade === "matched") return "화풍 일치";
  if (grade === "minor-drift") return "미세 편차";
  return "이질감 보정 필요";
}

/** 컷-대-컷 실시간 화풍 일체화 엔진 워크벤치 */
export function ProAtelierStyleSyncWorkbench() {
  const baseId = useId();
  const [masterStrokePx, setMasterStrokePx] = useState(
    DEFAULT_MASTER_CUT_DNA.averageStrokeWidthPx,
  );
  const [syncStrength, setSyncStrength] = useState(1);
  const [harmonizedAll, setHarmonizedAll] = useState(false);
  const [syncedCutIds, setSyncedCutIds] = useState<readonly string[]>([]);

  const activeMaster = useMemo<CutArtStyleDna>(
    () => ({
      ...DEFAULT_MASTER_CUT_DNA,
      averageStrokeWidthPx: masterStrokePx,
    }),
    [masterStrokePx],
  );

  const batchReport = useMemo(
    () => harmonizeCrossCutStyles(activeMaster, DEFAULT_ASSISTANT_SUBMISSION_CUTS, syncStrength),
    [activeMaster, syncStrength],
  );

  const toggleSingleCutSync = (cutId: string) => {
    setSyncedCutIds((prev) =>
      prev.includes(cutId) ? prev.filter((id) => id !== cutId) : [...prev, cutId],
    );
  };

  return (
    <div className="pas-body" style={{ padding: 0 }}>
      <div className="pas-card">
        <div className="pas-cut-head">
          <div>
            <h3 className="pas-card-title">
              <CheckCircle2 size={16} aria-hidden="true" />
              원작자 마스터 컷 DNA ({activeMaster.cutLabel})
            </h3>
            <p className="pas-card-desc">
              선폭 {activeMaster.averageStrokeWidthPx.toFixed(2)}px · 명암 대비{" "}
              {activeMaster.contrastRatio}:1 · 하이라이트 채도 {activeMaster.highlightChroma}
            </p>
          </div>
          <div className="pas-control-row">
            <button
              type="button"
              data-variant="primary"
              data-testid="pas-harmonize-apply-btn"
              className="pas-btn"
              onClick={() => {
                setHarmonizedAll(true);
                setSyncedCutIds(DEFAULT_ASSISTANT_SUBMISSION_CUTS.map((cut) => cut.cutId));
              }}
            >
              <Layers size={15} aria-hidden="true" />
              1클릭 전 컷 화풍 일체화
            </button>
            <button
              type="button"
              data-testid="pas-harmonize-reset-btn"
              className="pas-btn"
              onClick={() => {
                setHarmonizedAll(false);
                setSyncedCutIds([]);
              }}
            >
              <RotateCcw size={15} aria-hidden="true" />
              원본 비교로 되돌리기
            </button>
          </div>
        </div>

        <div className="pas-workbench-split">
          <div className="pas-field">
            <label htmlFor={`${baseId}-master-stroke`}>
              마스터 기준 평균 선폭:{" "}
              <strong className="pas-num">{masterStrokePx.toFixed(2)}px</strong>
            </label>
            <input
              id={`${baseId}-master-stroke`}
              type="range"
              min={1.4}
              max={3.4}
              step={0.1}
              value={masterStrokePx}
              onChange={(e) => setMasterStrokePx(Number(e.currentTarget.value))}
              className="pas-range"
            />
          </div>
          <div className="pas-field">
            <label htmlFor={`${baseId}-sync-strength`}>
              화풍 일체화 보정 강도:{" "}
              <strong className="pas-num">{Math.round(syncStrength * 100)}%</strong>
            </label>
            <input
              id={`${baseId}-sync-strength`}
              type="range"
              min={0.2}
              max={1}
              step={0.1}
              value={syncStrength}
              onChange={(e) => setSyncStrength(Number(e.currentTarget.value))}
              className="pas-range"
            />
          </div>
        </div>

        <div className="pas-metrics-grid">
          <div className="pas-metric-box">
            <span className="pas-metric-label">최대 색차 ΔE (목표 ≤ {STYLE_SYNC_DELTA_E_TARGET})</span>
            <strong className="pas-metric-value pas-num" data-testid="pas-sync-max-delta-e">
              {harmonizedAll ? batchReport.afterMaxDeltaE : batchReport.beforeMaxDeltaE}
            </strong>
          </div>
          <div className="pas-metric-box">
            <span className="pas-metric-label">
              최대 선폭 오차 (목표 ≤ {STYLE_SYNC_STROKE_ERROR_TARGET_PX}px)
            </span>
            <strong className="pas-metric-value pas-num" data-testid="pas-sync-max-stroke-error">
              {harmonizedAll
                ? batchReport.afterMaxStrokeErrorPx
                : batchReport.beforeMaxStrokeErrorPx}
              px
            </strong>
          </div>
          <div className="pas-metric-box">
            <span className="pas-metric-label">평균 이질감 점수 (0~100)</span>
            <strong className="pas-metric-value pas-num">
              {harmonizedAll
                ? batchReport.afterAverageInconsistency
                : batchReport.beforeAverageInconsistency}
            </strong>
          </div>
          <div className="pas-metric-box">
            <span className="pas-metric-label">전 컷 수렴 검증</span>
            <strong className="pas-metric-value" data-testid="pas-sync-convergence-badge">
              {harmonizedAll && batchReport.convergencePassed
                ? "통과 (ΔE≤2.0 · 선폭≤0.15px)"
                : "보정 대기 중"}
            </strong>
          </div>
        </div>
      </div>

      <div className="pas-cut-grid">
        {batchReport.results.map((entry) => {
          const isCutSynced = harmonizedAll || syncedCutIds.includes(entry.originalCut.cutId);
          const singleEntry = harmonizeSingleCutToMaster(
            activeMaster,
            entry.originalCut,
            isCutSynced ? syncStrength : 0,
          );
          const liveMetrics = analyzeCutStyleDrift(activeMaster, singleEntry.harmonizedCut);
          const swatches = [
            ["선화", entry.originalCut.lineInkOklch, singleEntry.harmonizedCut.lineInkOklch],
            ["피부", entry.originalCut.skinOklch, singleEntry.harmonizedCut.skinOklch],
            ["헤어", entry.originalCut.hairOklch, singleEntry.harmonizedCut.hairOklch],
            ["의상", entry.originalCut.outfitOklch, singleEntry.harmonizedCut.outfitOklch],
          ] as const;

          return (
            <article key={entry.originalCut.cutId} className="pas-cut-card">
              <div className="pas-cut-head">
                <div>
                  <strong className="pas-card-title">{entry.originalCut.cutLabel}</strong>
                  <p className="pas-metric-label">
                    {entry.originalCut.contributorName} · {entry.originalCut.roleLabel}
                  </p>
                </div>
                <span className="pas-badge" data-tone={gradeBadgeTone(liveMetrics.grade)}>
                  {gradeLabelKo(liveMetrics.grade)} · {liveMetrics.inconsistencyScore}점
                </span>
              </div>

              <div className="pas-mini-swatches">
                {swatches.map(([label, origColor, nextColor]) => (
                  <div key={label} className="pas-mini-swatch">
                    <span>{label}</span>
                    <div className="pas-mini-swatch-pair">
                      <span style={{ backgroundColor: formatCutSwatchCss(origColor) }} />
                      <span style={{ backgroundColor: formatCutSwatchCss(nextColor) }} />
                    </div>
                  </div>
                ))}
              </div>

              <p className="pas-card-desc pas-num">
                선폭 {singleEntry.harmonizedCut.averageStrokeWidthPx.toFixed(2)}px (배율 ×
                {entry.correction.strokeWidthMultiplier.toFixed(2)}) · 최대 ΔE{" "}
                {liveMetrics.maxColorDeltaE} · 명암 감마 {entry.correction.contrastGamma}
              </p>

              <svg viewBox="0 0 160 50" className="pas-lut-svg" aria-label="명암 커브 LUT">
                <polyline
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  points={buildLutPolyline(entry.correction.contrastCurveLut)}
                />
              </svg>

              <button
                type="button"
                className="pas-chip-btn"
                aria-pressed={isCutSynced}
                onClick={() => toggleSingleCutSync(entry.originalCut.cutId)}
              >
                {isCutSynced ? "개별 화풍 보정 적용됨" : "이 컷만 화풍 일체화"}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
