interface ExportExperimentSummaryProps {
  readonly sourceLabel: string;
  readonly poseLabel: string;
  readonly digest: string;
  readonly onNavigate: (target: "package" | "pose") => void;
}

/** 현재 내보낼 실험 상태와 단계 이동을 표시한다. 포커스 이동은 ExportPanel이 처리한다. */
export function ExportExperimentSummary({ sourceLabel, poseLabel, digest, onNavigate }: ExportExperimentSummaryProps) {
  return (
    <div className="cl-export-experiment-summary" role="region" aria-label="현재 실험 상태 및 빠른 이동" data-testid="export-experiment-summary">
      <div className="cl-export-experiment-meta">
        <span className="cl-export-experiment-source" data-testid="export-active-source">
          활성 소스: {sourceLabel}
        </span>
        <span className="cl-export-experiment-pose" data-testid="export-active-pose">
          실험 포즈: {poseLabel} · 레시피 #{digest}
        </span>
      </div>
      <div className="cl-export-nav-actions" role="group" aria-label="실험 단계 이동">
        <button type="button" className="cl-button cl-export-nav-btn" data-testid="export-switch-to-package-tab" onClick={() => onNavigate("package")}>
          패키지 선택 탭으로
        </button>
        <button type="button" className="cl-button cl-export-nav-btn" data-testid="export-switch-to-pose-tab" onClick={() => onNavigate("pose")}>
          포즈 실험 탭으로
        </button>
      </div>
    </div>
  );
}
