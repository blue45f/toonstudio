import { Pause, Play, RotateCcw, ShieldAlert, Workflow } from "lucide-react";
import { useMemo, useState } from "react";

import { StudioWritingPolishPanel } from "../writing-polish/StudioWritingPolishPanel";
import type { WritingPolishDocument } from "../writing-polish/studio-writing-polish";
import type { HyperAutomationPipelineRun } from "./automation-spectrum-pipeline-engine";
import {
  buildConditionalBatchMacro,
  createBatchMacroCutsFromStoryboard,
  executeEpisodeBatchMacro,
  resumeEpisodeBatchMacro,
  type CutAssetIntegrity,
  type EpisodeBatchMacroReport,
  type MacroCommitPolicy,
} from "./conditional-episode-batch-macro";

export interface HyperAutoBatchMacroSectionProps {
  readonly run: HyperAutomationPipelineRun;
}

type FaultSimulationMode = "none" | "corrupted-cut-37" | "locked-cut-42";

function buildFaultMap(mode: FaultSimulationMode): Readonly<Record<number, CutAssetIntegrity>> {
  if (mode === "corrupted-cut-37") return { 37: "corrupted-image" };
  if (mode === "locked-cut-42") return { 42: "permission-locked" };
  return {};
}

/**
 * 축 30 · 조건 분기 60컷 배치 매크로 & 체크포인트 중단/재개 · 실패 격리 vs 원자적 롤백 섹션 (#146–#150).
 */
export function HyperAutoBatchMacroSection({ run }: HyperAutoBatchMacroSectionProps) {
  const [blurOnlyOn3dCuts, setBlurOnlyOn3dCuts] = useState(true);
  const [excludeSilentCutsForTone, setExcludeSilentCutsForTone] = useState(true);
  const [commitPolicy, setCommitPolicy] = useState<MacroCommitPolicy>("isolate-failures");
  const [faultMode, setFaultMode] = useState<FaultSimulationMode>("corrupted-cut-37");
  const [report, setReport] = useState<EpisodeBatchMacroReport | null>(null);
  const [polishedOverrides, setPolishedOverrides] = useState<Readonly<Record<string, string>>>({});

  const polishDocuments = useMemo<readonly WritingPolishDocument[]>(
    () => [
      {
        id: `${run.runId}-logline`,
        label: "에피소드 로그라인",
        kind: "synopsis",
        text: polishedOverrides[`${run.runId}-logline`] ?? run.logline,
      },
      ...run.cuts.slice(0, 4).map((cut) => {
        const docId = `${run.runId}-cut-${cut.cutIndex}`;
        return {
          id: docId,
          label: `${cut.cutIndex}컷 대사`,
          kind: "dialogue" as const,
          characterId: cut.cutIndex % 2 === 1 ? "char-seojun" : "char-yuna",
          bubbleVariant: "speech" as const,
          text: polishedOverrides[docId] ?? cut.dialogueLine,
        };
      }),
    ],
    [polishedOverrides, run.cuts, run.logline, run.runId],
  );

  const activeMacro = useMemo(
    () =>
      buildConditionalBatchMacro({
        blurOnlyOn3dCuts,
        excludeSilentCutsForTone,
        includeLineTintAllCuts: false,
      }),
    [blurOnlyOn3dCuts, excludeSilentCutsForTone],
  );

  const batchCuts = useMemo(
    () => createBatchMacroCutsFromStoryboard(run.cuts, 60, buildFaultMap(faultMode)),
    [faultMode, run.cuts],
  );

  const handleRunFull60 = () => {
    setReport(
      executeEpisodeBatchMacro({
        cuts: batchCuts,
        macro: activeMacro,
        commitPolicy,
      }),
    );
  };

  const handleRunWithCheckpoint = () => {
    setReport(
      executeEpisodeBatchMacro({
        cuts: batchCuts,
        macro: activeMacro,
        commitPolicy,
        pauseAfterCount: 30,
      }),
    );
  };

  const handleResumeCheckpoint = () => {
    if (!report?.checkpoint) return;
    setReport(
      resumeEpisodeBatchMacro(report.checkpoint, {
        commitPolicy,
      }),
    );
  };

  return (
    <section
      className="hyper-auto-os__panel-box"
      data-testid="hyper-auto-batch-macro-section"
      aria-label="조건 분기 60컷 배치 매크로 및 실패 격리 커밋"
    >
      <div className="hyper-auto-os__section-head">
        <h4>
          <Workflow size={15} aria-hidden="true" style={{ display: "inline", marginRight: 6 }} />
          조건 분기 60컷 배치 매크로 · 체크포인트 중단/재개 · 실패 격리 커밋
        </h4>
        <small>대상 60컷 · ₩0 온디바이스 실행</small>
      </div>

      <div className="hyper-auto-os__preset-chips" role="group" aria-label="매크로 조건 분기 토글">
        <button
          type="button"
          className="hyper-auto-os__btn"
          aria-pressed={blurOnlyOn3dCuts}
          data-testid="batch-macro-cond-3d"
          onClick={() => setBlurOnlyOn3dCuts((prev) => !prev)}
        >
          3D 컷에만 블러 적용: {blurOnlyOn3dCuts ? "켬" : "전 컷"}
        </button>
        <button
          type="button"
          className="hyper-auto-os__btn"
          aria-pressed={excludeSilentCutsForTone}
          data-testid="batch-macro-cond-silent"
          onClick={() => setExcludeSilentCutsForTone((prev) => !prev)}
        >
          대사 없는 컷 제외: {excludeSilentCutsForTone ? "켬" : "전 컷"}
        </button>
      </div>

      <div className="hyper-auto-os__optional-grid">
        <div className="hyper-auto-os__field">
          <span className="hyper-auto-os__dna-label">오류 발생 시 커밋 정책 (#150)</span>
          <div className="hyper-auto-os__preset-chips" role="radiogroup" aria-label="배치 커밋 정책">
            <button
              type="button"
              role="radio"
              aria-checked={commitPolicy === "isolate-failures"}
              className="hyper-auto-os__btn"
              data-testid="batch-macro-policy-isolate"
              onClick={() => setCommitPolicy("isolate-failures")}
            >
              실패 격리 커밋 (정상 59컷 반영)
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={commitPolicy === "atomic-rollback"}
              className="hyper-auto-os__btn"
              data-testid="batch-macro-policy-rollback"
              onClick={() => setCommitPolicy("atomic-rollback")}
            >
              전체 원자적 롤백 (0컷 반영)
            </button>
          </div>
        </div>

        <div className="hyper-auto-os__field">
          <label htmlFor="batch-macro-fault-sim">60컷 오류 시뮬레이션 검증</label>
          <select
            id="batch-macro-fault-sim"
            data-testid="batch-macro-fault-select"
            value={faultMode}
            onChange={(event) => setFaultMode(event.target.value as FaultSimulationMode)}
          >
            <option value="none">정상 60컷 (오류 없음)</option>
            <option value="corrupted-cut-37">37컷 손상 이미지 오류 주입</option>
            <option value="locked-cut-42">42컷 권한 잠금 오류 주입</option>
          </select>
        </div>
      </div>

      <div className="hyper-auto-os__actions">
        <button
          type="button"
          className="hyper-auto-os__btn hyper-auto-os__btn--primary"
          data-testid="batch-macro-run-60-btn"
          onClick={handleRunFull60}
        >
          <Play size={14} aria-hidden="true" />
          60컷 조건 분기 일괄 실행
        </button>
        <button
          type="button"
          className="hyper-auto-os__btn"
          data-testid="batch-macro-pause-30-btn"
          onClick={handleRunWithCheckpoint}
        >
          <Pause size={14} aria-hidden="true" />
          30컷 체크포인트 중단 실행
        </button>
        <button
          type="button"
          className="hyper-auto-os__btn"
          disabled={!report?.checkpoint}
          data-testid="batch-macro-resume-btn"
          onClick={handleResumeCheckpoint}
        >
          <RotateCcw size={14} aria-hidden="true" />
          체크포인트 이어서 재개
        </button>
      </div>

      {report ? (
        <div className="hyper-auto-os__cut-frame" data-testid="batch-macro-report-box">
          <strong data-testid="batch-macro-status-text">{report.summaryKo}</strong>
          <div className="hyper-auto-os__metrics">
            <span className="hyper-auto-os__metric-chip" data-testid="batch-macro-processed">
              처리 {report.processedCount}/{report.totalCuts}컷
            </span>
            <span className="hyper-auto-os__metric-chip" data-testid="batch-macro-committed">
              커밋 {report.committedCount}컷
            </span>
            <span className="hyper-auto-os__metric-chip" data-testid="batch-macro-skipped">
              조건 제외 {report.skippedCount}컷
            </span>
            <span className="hyper-auto-os__metric-chip" data-testid="batch-macro-failed">
              실패 격리 {report.failedCount}컷
            </span>
            <span className="hyper-auto-os__metric-chip" data-testid="batch-macro-rolledback">
              원자적 롤백: {report.rolledBack ? "예 (원본 100% 복원)" : "아니오"}
            </span>
          </div>
          {report.failures.length > 0 ? (
            <div className="hyper-auto-os__alert" role="status" data-testid="batch-macro-failure-detail">
              <ShieldAlert size={14} aria-hidden="true" style={{ display: "inline", marginRight: 6 }} />
              {report.failures[0]?.messageKo} — {report.failures[0]?.remediationKo}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="hyper-auto-os__status-note">
          3D 컷 필터·대사 컷 조건 분기와 체크포인트 중단/재개, 1컷 오류 시 59컷 격리 커밋 또는 60컷 전체 롤백을 바로 검증할 수 있습니다.
        </p>
      )}

      <details className="hyper-auto-os__disclosure" data-testid="hyper-auto-dialogue-polish-disclosure">
        <summary>대사 말투 일관성 · 모바일 390px 말풍선 호흡 · 의성어 문화권 사전 검수</summary>
        <div style={{ paddingTop: 10 }}>
          <StudioWritingPolishPanel
            documents={polishDocuments}
            onApplyDocument={(docId, nextText) =>
              setPolishedOverrides((prev) => ({ ...prev, [docId]: nextText }))
            }
          />
        </div>
      </details>
    </section>
  );
}
