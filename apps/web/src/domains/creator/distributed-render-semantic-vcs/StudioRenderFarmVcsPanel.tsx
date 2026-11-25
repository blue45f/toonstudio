/**
 * 원클릭 6패스 분산 렌더팜 스케줄러·초저지연 에지 진단 + 컷·레이어·말풍선 시맨틱 VCS 2탭 패널 (Wave 40D).
 * Calm Atelier 시맨틱 토큰 전용(원시 색상 0건) · Props 없이 단독 렌더링 지원 · 100% 온디바이스 결정론 연산.
 */

import {
  Activity, AlertTriangle, CheckCircle2, Cpu, GitBranch, GitCommitHorizontal,
  GitMerge, HardDrive, Layers, MessageSquare, Play, RefreshCw, RotateCcw,
  Server, ShieldCheck, Sparkles, Zap,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  computeRenderFarmTelemetry, createRenderCheckpoint, createRenderFarmPlan,
  DEFAULT_COMPUTE_NODES, DEFAULT_RENDER_FARM_JOB, injectNodeFailure,
  recoverComputeNode, resumeFromCheckpoint, runOneClickSixPassRender,
  stepRenderFarmTick, validateRenderPassDag,
  type BackpressureLevel, type EdgeReadinessGrade, type NodeHealthStatus,
  type RenderFarmState, type RenderFarmTelemetry,
} from "./distributed-render-scheduler";
import {
  commitSemanticSnapshot, computeSemanticDiff, createDefaultComicVcsRepository,
  createSemanticBranch, getBranchHeadCommit, getBranchHistory,
  planThreeWaySemanticMerge, resolveMergeConflictsAndCommit,
  rollbackBranchToCommit, switchSemanticBranch,
  type ConflictResolutionInput, type MergeResolutionChoice,
  type SemanticChangeKind, type SemanticEntityKind, type SemanticVcsRepository,
} from "./semantic-comic-vcs";

export type RenderFarmVcsTabId = "render-farm" | "semantic-vcs";

export interface StudioRenderFarmVcsPanelProps {
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly initialTab?: RenderFarmVcsTabId;
  readonly initialMemoryBudgetMb?: number;
  readonly onRenderTelemetryChange?: (telemetry: RenderFarmTelemetry) => void;
  readonly onRepositoryChange?: (repo: SemanticVcsRepository) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const TAB_BTN = `inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const ACTION_BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const ACTIVE_TONE = "border-accent bg-accent-soft text-accent";
const IDLE_TONE = "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";
const PRIMARY_TONE = "border-accent bg-accent text-on-accent hover:bg-accent-2";

function gradeTone(grade: EdgeReadinessGrade): string {
  if (grade === "S" || grade === "A") return "border-good bg-good-soft text-good";
  return grade === "B" ? "border-line bg-warning-soft text-warn" : "border-bad bg-bad-soft text-bad";
}

function pressureTone(level: BackpressureLevel): string {
  if (level === "nominal") return "border-good bg-good-soft text-good";
  if (level === "elevated") return "border-line bg-info-soft text-cool";
  return level === "high" ? "border-line bg-warning-soft text-warn" : "border-bad bg-bad-soft text-bad";
}

function nodeStatusTone(status: NodeHealthStatus): string {
  if (status === "healthy") return "border-good bg-good-soft text-good";
  if (status === "offline") return "border-bad bg-bad-soft text-bad";
  return "border-line bg-warning-soft text-warn";
}

function diffChangeTone(kind: SemanticChangeKind): string {
  if (kind === "added") return "border-good bg-good-soft text-good";
  return kind === "removed" ? "border-bad bg-bad-soft text-bad" : "border-line bg-warning-soft text-warn";
}

function formatEtaMs(etaMs: number, isKo: boolean): string {
  if (etaMs < 0) return isKo ? "노드 오프라인" : "Nodes Offline";
  if (etaMs === 0) return isKo ? "완료" : "Done";
  return `${(etaMs / 1000).toFixed(1)}s`;
}

/** 원클릭 6패스 분산 렌더팜 · 초저지연 에지 진단 · 컷/레이어/말풍선 시맨틱 VCS 2탭 워크벤치. */
export function StudioRenderFarmVcsPanel(props: StudioRenderFarmVcsPanelProps): ReactElement {
  const {
    locale, className, initialTab = "render-farm", initialMemoryBudgetMb = DEFAULT_RENDER_FARM_JOB.globalMemoryBudgetMb,
    onRenderTelemetryChange, onRepositoryChange,
  } = props;

  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [activeTab, setActiveTab] = useState<RenderFarmVcsTabId>(initialTab);
  const [memoryBudgetMb, setMemoryBudgetMb] = useState<number>(initialMemoryBudgetMb);
  const [farmState, setFarmState] = useState<RenderFarmState>(() =>
    createRenderFarmPlan({ ...DEFAULT_RENDER_FARM_JOB, globalMemoryBudgetMb: initialMemoryBudgetMb }, DEFAULT_COMPUTE_NODES),
  );
  const [repo, setRepo] = useState<SemanticVcsRepository>(() => createDefaultComicVcsRepository());
  const [compareBranch, setCompareBranch] = useState<string>("editor-revision");
  const [newBranchName, setNewBranchName] = useState<string>("");
  const [resolutionChoices, setResolutionChoices] = useState<Readonly<Record<string, MergeResolutionChoice>>>({});
  const [manualTexts, setManualTexts] = useState<Readonly<Record<string, string>>>({});
  const [vcsNotice, setVcsNotice] = useState<string | null>(null);

  const dagValidation = useMemo(() => validateRenderPassDag(), []);
  const telemetry = useMemo<RenderFarmTelemetry>(() => computeRenderFarmTelemetry(farmState), [farmState]);

  const branchNames = useMemo(() => Object.keys(repo.branches), [repo.branches]);
  const effectiveCompareBranch = useMemo(() => {
    if (repo.branches[compareBranch] && compareBranch !== repo.activeBranch) return compareBranch;
    return branchNames.find((name) => name !== repo.activeBranch) ?? repo.activeBranch;
  }, [branchNames, compareBranch, repo.activeBranch, repo.branches]);

  const activeHead = useMemo(() => getBranchHeadCommit(repo, repo.activeBranch), [repo]);
  const compareHead = useMemo(() => getBranchHeadCommit(repo, effectiveCompareBranch), [repo, effectiveCompareBranch]);
  const activeHistory = useMemo(() => getBranchHistory(repo, repo.activeBranch), [repo]);

  const diffReport = useMemo(() => {
    if (!activeHead || !compareHead) return null;
    return computeSemanticDiff(activeHead.snapshot, compareHead.snapshot);
  }, [activeHead, compareHead]);

  const mergePlan = useMemo(() => {
    if (!repo.branches[effectiveCompareBranch] || effectiveCompareBranch === repo.activeBranch) return null;
    return planThreeWaySemanticMerge(repo, effectiveCompareBranch, repo.activeBranch);
  }, [effectiveCompareBranch, repo]);

  const updateFarm = (next: RenderFarmState): void => {
    setFarmState(next);
    onRenderTelemetryChange?.(computeRenderFarmTelemetry(next));
  };

  const updateRepo = (next: SemanticVcsRepository, noticeText: string): void => {
    setRepo(next);
    setVcsNotice(noticeText);
    onRepositoryChange?.(next);
  };

  const handleBudgetMode = (budgetMb: number): void => {
    setMemoryBudgetMb(budgetMb);
    updateFarm(createRenderFarmPlan({ ...DEFAULT_RENDER_FARM_JOB, globalMemoryBudgetMb: budgetMb }, DEFAULT_COMPUTE_NODES));
  };

  const handleRunSixPass = (): void => updateFarm(runOneClickSixPassRender(farmState));
  const handleStepTick = (): void => updateFarm(stepRenderFarmTick(farmState));
  const handleSaveCheckpoint = (): void => updateFarm(createRenderCheckpoint(farmState));
  const handleResetFarm = (): void =>
    updateFarm(createRenderFarmPlan({ ...DEFAULT_RENDER_FARM_JOB, globalMemoryBudgetMb: memoryBudgetMb }, DEFAULT_COMPUTE_NODES));
  const handleResumeCheckpoint = (cpId: string): void => updateFarm(resumeFromCheckpoint(farmState, cpId));

  const handleToggleNode = (nodeId: string, status: NodeHealthStatus): void => {
    const next = status === "offline" ? recoverComputeNode(farmState, nodeId) : injectNodeFailure(farmState, nodeId);
    updateFarm(next);
  };

  const handleCreateBranch = (): void => {
    const trimmed = newBranchName.trim();
    if (!trimmed) return;
    const next = createSemanticBranch(repo, trimmed, {
      fromBranch: repo.activeBranch,
      description: pick(`${repo.activeBranch}에서 분기된 사용자 작업 브랜치`, `Branch forked from ${repo.activeBranch}`),
      switchToNew: true,
    });
    if (next === repo) {
      setVcsNotice(pick("이미 존재하거나 유효하지 않은 브랜치 이름입니다.", "Branch already exists or name is invalid."));
      return;
    }
    setNewBranchName("");
    updateRepo(next, pick(`브랜치 '${next.activeBranch}' 생성 및 전환 완료`, `Created and switched to branch '${next.activeBranch}'`));
  };

  const handleQuickCommit = (): void => {
    if (!activeHead) return;
    const nextCutCount = activeHead.snapshot.cuts.length + 1;
    const revised = {
      ...activeHead.snapshot,
      cuts: activeHead.snapshot.cuts.map((cut, idx) =>
        idx === 0
          ? { ...cut, layers: cut.layers.map((l, lIdx) => (lIdx === 0 ? { ...l, strokeDigest: `${l.strokeDigest}-r${repo.commitOrder.length + 1}` } : l)) }
          : cut,
      ),
    };
    const committed = commitSemanticSnapshot(repo, revised, {
      branchName: repo.activeBranch,
      message: pick(`컷 1 선화 폴리싱 스냅샷 (#${nextCutCount})`, `Cut 1 lineart polish snapshot (#${nextCutCount})`),
    });
    updateRepo(committed.repo, pick(`스냅샷 커밋 ${committed.commit.id} 기록됨`, `Recorded snapshot commit ${committed.commit.id}`));
  };

  const handleApplyMerge = (): void => {
    if (!mergePlan) return;
    const resolutions: ConflictResolutionInput[] = mergePlan.conflicts.map((conflict) => {
      const choice: MergeResolutionChoice = resolutionChoices[conflict.conflictId] ?? "ours";
      const fallbackManual = conflict.oursBalloon?.text ?? conflict.theirsBalloon?.text ?? pick("병합 수정 대사", "Merged line");
      const manualText = manualTexts[conflict.conflictId]?.trim() || fallbackManual;
      return { conflictId: conflict.conflictId, choice, manualText };
    });
    const merged = resolveMergeConflictsAndCommit(repo, mergePlan, resolutions);
    setResolutionChoices({});
    setManualTexts({});
    updateRepo(
      merged.repo,
      pick(
        `${mergePlan.sourceBranch} → ${mergePlan.targetBranch} 병합 커밋 ${merged.commit.id} 완료`,
        `Merged ${mergePlan.sourceBranch} → ${mergePlan.targetBranch} as ${merged.commit.id}`,
      ),
    );
  };

  const handleRollback = (targetCommitId: string): void => {
    const rolled = rollbackBranchToCommit(repo, repo.activeBranch, targetCommitId, { mode: "revert-commit" });
    updateRepo(
      rolled.repo,
      pick(
        `브랜치 '${repo.activeBranch}'를 ${targetCommitId} 스냅샷으로 결정론적 롤백 완료`,
        `Deterministically rolled back '${repo.activeBranch}' to ${targetCommitId}`,
      ),
    );
  };

  const entityLabel = (kind: SemanticEntityKind): string => {
    if (kind === "cut") return pick("컷", "Cut");
    return kind === "layer" ? pick("레이어", "Layer") : pick("말풍선", "Balloon");
  };

  const changeLabel = (kind: SemanticChangeKind): string => {
    if (kind === "added") return pick("추가", "Added");
    return kind === "removed" ? pick("삭제", "Removed") : pick("수정", "Modified");
  };

  const tabs: readonly { readonly id: RenderFarmVcsTabId; readonly label: string; readonly icon: ReactElement }[] = [
    { id: "render-farm", label: pick("6패스 분산 렌더팜 · 장애복구", "6-Pass Render Farm & Failover"), icon: <Cpu className="h-3.5 w-3.5" aria-hidden="true" /> },
    { id: "semantic-vcs", label: pick("시맨틱 브랜치 · 컷 Diff · 3-Way 병합", "Semantic Branch · Cut Diff · 3-Way Merge"), icon: <GitBranch className="h-3.5 w-3.5" aria-hidden="true" /> },
  ];

  return (
    <section
      data-testid="renderfarm-semantic-vcs-panel"
      aria-label={pick("원클릭 6패스 분산 렌더팜 스케줄러 및 웹툰 시맨틱 버전 제어", "One-Click 6-Pass Distributed Render Farm & Semantic Comic VCS")}
      className={`space-y-4 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-fg">
              {pick("분산 6패스 렌더팜 · 에지 헬스 진단 · 컷·말풍선 시맨틱 VCS", "6-Pass Distributed Render Farm · Edge Health · Semantic Cut VCS")}
            </h2>
          </div>
          <p className="text-xs text-fg-2">
            {pick(
              "선화→밑색→그림자→조명→특수효과→식자 6패스 DAG를 작업 훔치기와 메모리 백프레셔로 분산 렌더링하고, 컷·레이어·말풍선 단위 3-Way 병합과 결정론적 롤백을 수행합니다.",
              "Run 6-pass DAG rendering with work-stealing, memory backpressure, checkpoint failover, and cut/layer/balloon 3-way semantic version control.",
            )}
          </p>
        </div>
        <span
          data-testid="badge-cluster-vcs-status"
          className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${gradeTone(telemetry.edgeHealth.grade)}`}
        >
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {pick(`에지 ${telemetry.edgeHealth.grade}등급 · ${repo.activeBranch}`, `Edge ${telemetry.edgeHealth.grade} · ${repo.activeBranch}`)}
        </span>
      </header>

      <div role="tablist" aria-label={pick("렌더팜 및 시맨틱 VCS 탭", "Render farm and semantic VCS tabs")} className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id} type="button" role="tab" id={`${uid}-tab-${tab.id}`}
            aria-selected={activeTab === tab.id} aria-controls={`${uid}-panel-${tab.id}`}
            data-testid={`tab-${tab.id}`} onClick={() => setActiveTab(tab.id)}
            className={`${TAB_BTN} ${activeTab === tab.id ? ACTIVE_TONE : IDLE_TONE}`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === "render-farm" && (
        <div role="tabpanel" id={`${uid}-panel-render-farm`} aria-labelledby={`${uid}-tab-render-farm`} data-testid="panel-render-farm" className="space-y-4">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-xs text-fg-3">{pick("6패스 전체 진행률 / ETA", "6-Pass Progress / ETA")}</div>
              <div data-testid="farm-progress-pct" className="mt-1 text-base font-bold text-fg tabular-nums">
                {telemetry.overallProgressPct}% · {formatEtaMs(telemetry.estimatedRemainingMs, isKo)}
              </div>
              <div className="mt-1 text-xs text-fg-2 tabular-nums">
                {pick(`완료 ${telemetry.completedChunks}/${telemetry.totalChunks} 청크`, `${telemetry.completedChunks}/${telemetry.totalChunks} chunks`)}
              </div>
            </div>

            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-xs text-fg-3">{pick("처리량 · 작업 훔치기", "Throughput · Work-Steals")}</div>
              <div data-testid="farm-throughput" className="mt-1 text-base font-bold text-fg tabular-nums">
                {telemetry.throughputChunksPerSec} {pick("청크/초", "ch/s")}
              </div>
              <div data-testid="farm-steal-count" className="mt-1 text-xs text-fg-2 tabular-nums">
                {pick(`훔치기 ${telemetry.totalSteals}회 · 장애복구 ${telemetry.failoverRecoveries}건`, `${telemetry.totalSteals} steals · ${telemetry.failoverRecoveries} failovers`)}
              </div>
            </div>

            <div className="rounded-lg border border-line bg-card p-3">
              <div className="flex items-center justify-between gap-1 text-xs text-fg-3">
                <span>{pick("메모리 예산 · 백프레셔", "Memory · Backpressure")}</span>
                <span data-testid="farm-backpressure-badge" className={`rounded border px-1.5 py-0.5 text-xs font-semibold ${pressureTone(telemetry.backpressureLevel)}`}>
                  {telemetry.backpressureLevel}
                </span>
              </div>
              <div data-testid="farm-memory-usage" className="mt-1 text-base font-bold text-fg tabular-nums">
                {telemetry.memoryUsedMb} / {telemetry.globalMemoryBudgetMb} MB
              </div>
              <div className="mt-1 text-xs text-fg-2 tabular-nums">
                {pick(`점유율 ${telemetry.memoryUtilizationPct}% · 억제 ${farmState.backpressureEvents.length}회`, `${telemetry.memoryUtilizationPct}% · ${farmState.backpressureEvents.length} throttles`)}
              </div>
            </div>

            <div className="rounded-lg border border-line bg-card p-3">
              <div className="flex items-center justify-between gap-1 text-xs text-fg-3">
                <span>{pick("초저지연 에지 진단", "Ultra-Low Edge Health")}</span>
                <span data-testid="edge-grade-badge" className={`rounded border px-1.5 py-0.5 text-xs font-semibold ${gradeTone(telemetry.edgeHealth.grade)}`}>
                  {telemetry.edgeHealth.grade}
                </span>
              </div>
              <div data-testid="edge-p95-rtt" className="mt-1 text-base font-bold text-fg tabular-nums">
                p95 {telemetry.edgeHealth.p95RttMs}ms
              </div>
              <div className="mt-1 text-xs text-fg-2 tabular-nums">
                {pick(`정상 ${telemetry.edgeHealth.healthyNodeCount} · 오프라인 ${telemetry.edgeHealth.offlineNodeCount}`, `${telemetry.edgeHealth.healthyNodeCount} healthy · ${telemetry.edgeHealth.offlineNodeCount} offline`)}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" data-testid="btn-run-six-pass" onClick={handleRunSixPass} className={`${ACTION_BTN} ${PRIMARY_TONE}`}>
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("원클릭 6패스 실행", "One-Click 6-Pass Run")}</span>
            </button>
            <button type="button" data-testid="btn-step-tick" onClick={handleStepTick} className={`${ACTION_BTN} ${IDLE_TONE}`}>
              <Zap className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("1틱 스케줄링", "Step 1 Tick")}</span>
            </button>
            <button type="button" data-testid="btn-save-checkpoint" onClick={handleSaveCheckpoint} className={`${ACTION_BTN} ${IDLE_TONE}`}>
              <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("체크포인트 저장", "Save Checkpoint")}</span>
            </button>
            <button type="button" data-testid="btn-reset-farm" onClick={handleResetFarm} className={`${ACTION_BTN} ${IDLE_TONE}`}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("큐 초기화", "Reset Queue")}</span>
            </button>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <button
                type="button" data-testid="btn-budget-standard"
                onClick={() => handleBudgetMode(2048)}
                className={`${ACTION_BTN} ${memoryBudgetMb >= 1536 ? ACTIVE_TONE : IDLE_TONE}`}
              >
                <span className="tabular-nums">{pick("표준 예산 2048MB", "Standard 2048MB")}</span>
              </button>
              <button
                type="button" data-testid="btn-budget-tight"
                onClick={() => handleBudgetMode(512)}
                className={`${ACTION_BTN} ${memoryBudgetMb < 1536 ? ACTIVE_TONE : IDLE_TONE}`}
              >
                <span className="tabular-nums">{pick("긴축 백프레셔 512MB", "Tight Backpressure 512MB")}</span>
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-card p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Activity className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>{pick("6패스 DAG 파이프라인 (임계 경로 검증됨)", "6-Pass Render DAG Pipeline")}</span>
              </div>
              <span data-testid="dag-critical-path" className="text-xs text-fg-2 tabular-nums">
                {pick(
                  `위상 ${dagValidation.valid ? "정상" : "오류"} · 임계 경로 ${dagValidation.criticalPathMs}ms`,
                  `DAG ${dagValidation.valid ? "Valid" : "Invalid"} · Critical Path ${dagValidation.criticalPathMs}ms`,
                )}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
              {telemetry.stageProgress.map((stage) => (
                <div key={stage.stage} data-testid={`dag-stage-${stage.stage}`} className="rounded-md border border-line bg-raised p-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-1 text-xs font-semibold text-fg">
                    <span className="truncate">{isKo ? stage.labelKo : stage.labelEn}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel">
                    <div
                      className={`h-full transition-all motion-reduce:transition-none ${stage.status === "completed" ? "bg-good" : "bg-accent"}`}
                      style={{ width: `${stage.progressPct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-fg-2 tabular-nums">
                    <span>{stage.completed}/{stage.total}</span>
                    <span>{stage.progressPct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Server className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>{pick("분산 WebGPU · 에지 노드 헬스 진단 및 장애 주입", "Distributed WebGPU & Edge Node Diagnostics")}</span>
              </h3>
              <span className="text-xs text-fg-3 tabular-nums">
                {pick(`평균 지터 ${telemetry.edgeHealth.avgJitterMs}ms`, `Avg Jitter ${telemetry.edgeHealth.avgJitterMs}ms`)}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {farmState.nodes.map((node) => {
                const diag = telemetry.edgeHealth.nodeDiagnostics.find((d) => d.nodeId === node.id);
                return (
                  <div key={node.id} data-testid={`node-card-${node.id}`} className="flex flex-col justify-between gap-2.5 rounded-lg border border-line bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-fg">{isKo ? node.nameKo : node.nameEn}</div>
                        <div className="text-xs text-fg-3 tabular-nums">
                          {node.kind} · {node.region} · RTT {diag?.rttMs ?? node.rttMs}ms
                        </div>
                      </div>
                      <span data-testid={`node-status-${node.id}`} className={`rounded border px-2 py-0.5 text-xs font-semibold ${nodeStatusTone(node.status)}`}>
                        {node.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-2 tabular-nums">
                      <span>VRAM {node.memoryUsedMb}/{node.memoryBudgetMb}MB</span>
                      <span>{pick(`완료 ${node.completedChunks} · 훔침 ${node.stolenChunks}`, `Done ${node.completedChunks} · Stolen ${node.stolenChunks}`)}</span>
                    </div>
                    <button
                      type="button" data-testid={`btn-toggle-node-${node.id}`}
                      onClick={() => handleToggleNode(node.id, node.status)}
                      className={`${ACTION_BTN} w-full ${node.status === "offline" ? ACTIVE_TONE : IDLE_TONE}`}
                    >
                      {node.status === "offline" ? <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
                      <span>{node.status === "offline" ? pick("노드 복구", "Recover Node") : pick("장애 주입 (Failover 테스트)", "Inject Failure (Failover)")}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-card p-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-fg">
              <span>{pick("결정론적 체크포인트 및 재개 지점", "Deterministic Checkpoints & Resume")}</span>
              <span data-testid="checkpoint-count" className="text-fg-2 tabular-nums">
                {farmState.checkpoints.length}{pick("개 저장됨", " saved")}
              </span>
            </div>
            {farmState.checkpoints.length === 0 ? (
              <p className="text-xs text-fg-3">
                {pick("패스가 완료되거나 '체크포인트 저장'을 누르면 결정론 해시 기반 재개 스냅샷이 기록됩니다.", "Complete a pass or save a checkpoint to record a deterministic resume snapshot.")}
              </p>
            ) : (
              <div className="space-y-1.5">
                {farmState.checkpoints.slice(-3).map((cp) => (
                  <div key={cp.checkpointId} data-testid={`checkpoint-row-${cp.checkpointId}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-raised px-2.5 py-2 text-xs">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-fg">{isKo ? cp.labelKo : cp.labelEn}</div>
                      <div className="text-fg-3 tabular-nums">
                        {cp.checkpointId} · hash {cp.integrityHash.slice(0, 8)} · {cp.completedChunkIds.length}/{farmState.chunks.length}
                      </div>
                    </div>
                    <button
                      type="button" data-testid={`btn-resume-checkpoint-${cp.checkpointId}`}
                      onClick={() => handleResumeCheckpoint(cp.checkpointId)}
                      className={`${ACTION_BTN} ${IDLE_TONE}`}
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{pick("이 체크포인트로 재개", "Resume Here")}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "semantic-vcs" && (
        <div role="tabpanel" id={`${uid}-panel-semantic-vcs`} aria-labelledby={`${uid}-tab-semantic-vcs`} data-testid="panel-semantic-vcs" className="space-y-4">
          {vcsNotice && (
            <div data-testid="vcs-notice-banner" role="status" className="flex items-center gap-2 rounded-lg border border-good bg-good-soft px-3 py-2 text-xs font-semibold text-good">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{vcsNotice}</span>
            </div>
          )}

          <div className="rounded-lg border border-line bg-card p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <GitBranch className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>{pick("시맨틱 브랜치 전환 및 분기", "Semantic Branches")}</span>
              </span>
              <span data-testid="vcs-active-head" className="text-xs text-fg-2 tabular-nums">
                HEAD {activeHead?.id ?? "-"} · {activeHead?.snapshot.cuts.length ?? 0}{pick("컷", " cuts")}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {branchNames.map((name) => {
                const ref = repo.branches[name];
                const isActive = name === repo.activeBranch;
                return (
                  <button
                    key={name} type="button" data-testid={`btn-branch-${name}`}
                    onClick={() => updateRepo(switchSemanticBranch(repo, name), pick(`브랜치 '${name}'로 전환함`, `Switched to branch '${name}'`))}
                    className={`${ACTION_BTN} ${isActive ? ACTIVE_TONE : IDLE_TONE}`}
                  >
                    <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{name}</span>
                    <span className="text-fg-3 tabular-nums">({ref?.headCommitId.slice(0, 6)})</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={`${uid}-new-branch`} className="sr-only">
                {pick("새 브랜치 이름", "New branch name")}
              </label>
              <input
                id={`${uid}-new-branch`} data-testid="input-new-branch" type="text" value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder={pick("새 브랜치 이름 (예: director-cut)", "New branch (e.g. director-cut)")}
                className={`min-h-11 min-w-48 flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-xs text-fg placeholder:text-fg-3 ${FOCUS_RING}`}
              />
              <button type="button" data-testid="btn-create-branch" onClick={handleCreateBranch} disabled={!newBranchName.trim()} className={`${ACTION_BTN} ${IDLE_TONE}`}>
                <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pick("브랜치 분기", "Fork Branch")}</span>
              </button>
              <button type="button" data-testid="btn-quick-commit" onClick={handleQuickCommit} className={`${ACTION_BTN} ${IDLE_TONE}`}>
                <GitCommitHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{pick("스냅샷 커밋", "Commit Snapshot")}</span>
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-card p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>{pick("구조적 Diff · 3-Way 시맨틱 병합 비교 대상", "Structural Diff & 3-Way Merge Target")}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {branchNames
                  .filter((name) => name !== repo.activeBranch)
                  .map((name) => (
                    <button
                      key={name} type="button" data-testid={`btn-compare-${name}`}
                      onClick={() => setCompareBranch(name)}
                      className={`${ACTION_BTN} ${effectiveCompareBranch === name ? ACTIVE_TONE : IDLE_TONE}`}
                    >
                      <span>{name} → {repo.activeBranch}</span>
                    </button>
                  ))}
              </div>
            </div>

            {diffReport && (
              <div className="space-y-2">
                <div data-testid="diff-summary-row" className="flex flex-wrap gap-2 text-xs tabular-nums">
                  <span className="rounded border border-line bg-raised px-2 py-1 text-fg">
                    {pick("컷", "Cuts")} +{diffReport.summary.cutsAdded}/~{diffReport.summary.cutsModified}/-{diffReport.summary.cutsRemoved}
                  </span>
                  <span className="rounded border border-line bg-raised px-2 py-1 text-fg">
                    {pick("레이어", "Layers")} +{diffReport.summary.layersAdded}/~{diffReport.summary.layersModified}/-{diffReport.summary.layersRemoved}
                  </span>
                  <span className="rounded border border-line bg-raised px-2 py-1 text-fg">
                    {pick("말풍선", "Balloons")} +{diffReport.summary.balloonsAdded}/~{diffReport.summary.balloonsModified}/-{diffReport.summary.balloonsRemoved}
                  </span>
                </div>
                <div data-testid="diff-entry-list" className="space-y-1.5">
                  {diffReport.entries.map((entry) => (
                    <div key={entry.id} className="rounded-md border border-line bg-raised px-2.5 py-2 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`rounded border px-1.5 py-0.5 font-semibold ${diffChangeTone(entry.changeKind)}`}>
                          {changeLabel(entry.changeKind)}
                        </span>
                        <span className="rounded border border-line bg-panel px-1.5 py-0.5 text-fg-2">{entityLabel(entry.entityKind)}</span>
                        <span className="font-semibold text-fg">{entry.label}</span>
                        <span className="text-fg-3">{entry.path}</span>
                      </div>
                      <div className="mt-1 space-y-0.5 text-fg-2">
                        {entry.changedFields.slice(0, 2).map((field) => (
                          <div key={field.field}>
                            {field.field}: {field.before} → {field.after}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {mergePlan && (
              <div data-testid="merge-workbench" className="space-y-2.5 border-t border-line pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                    <GitMerge className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                    <span>
                      {pick(
                        `3-Way 병합 분석 (공통 조상 ${mergePlan.baseCommitId})`,
                        `3-Way Merge Plan (LCA ${mergePlan.baseCommitId})`,
                      )}
                    </span>
                  </div>
                  <span
                    data-testid="merge-conflict-count"
                    className={`rounded border px-2 py-0.5 text-xs font-semibold tabular-nums ${mergePlan.canAutoMerge ? "border-good bg-good-soft text-good" : "border-bad bg-bad-soft text-bad"}`}
                  >
                    {mergePlan.canAutoMerge
                      ? pick("충돌 0건 · 자동 병합 가능", "0 Conflicts · Auto-Merge Ready")
                      : pick(`충돌 ${mergePlan.conflicts.length}건 핀포인트`, `${mergePlan.conflicts.length} Conflict(s) Pinpointed`)}
                  </span>
                </div>

                {mergePlan.conflicts.map((conflict) => {
                  const chosen = resolutionChoices[conflict.conflictId] ?? "ours";
                  const manualValue = manualTexts[conflict.conflictId] ?? conflict.oursBalloon?.text ?? "";
                  return (
                    <div key={conflict.conflictId} data-testid={`conflict-card-${conflict.conflictId}`} className="rounded-lg border border-bad bg-bad-soft p-3 space-y-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-1.5 font-semibold text-bad">
                        <span className="flex items-center gap-1.5">
                          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                          {conflict.label} ({conflict.path})
                        </span>
                        <span>{conflict.conflictedFields.join(", ")}</span>
                      </div>
                      <div className="grid grid-cols-1 gap-1.5 md:grid-cols-3 text-fg">
                        <div className="rounded border border-line bg-panel p-2">
                          <div className="text-fg-3">Base</div>
                          <div className="mt-0.5">{conflict.baseSummary}</div>
                        </div>
                        <div className="rounded border border-line bg-panel p-2">
                          <div className="text-fg-3">{pick(`현재 (${mergePlan.targetBranch})`, `Ours (${mergePlan.targetBranch})`)}</div>
                          <div className="mt-0.5">{conflict.oursSummary}</div>
                        </div>
                        <div className="rounded border border-line bg-panel p-2">
                          <div className="text-fg-3">{pick(`대상 (${mergePlan.sourceBranch})`, `Theirs (${mergePlan.sourceBranch})`)}</div>
                          <div className="mt-0.5">{conflict.theirsSummary}</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(["ours", "theirs", "manual"] as const).map((choice) => (
                          <button
                            key={choice} type="button" data-testid={`btn-resolve-${conflict.conflictId}-${choice}`}
                            onClick={() => setResolutionChoices((prev) => ({ ...prev, [conflict.conflictId]: choice }))}
                            className={`${ACTION_BTN} ${chosen === choice ? ACTIVE_TONE : IDLE_TONE}`}
                          >
                            {choice === "ours" ? pick("현재 유지 (ours)", "Keep Ours") : choice === "theirs" ? pick("대상 채택 (theirs)", "Take Theirs") : pick("직접 병합 (manual)", "Manual Edit")}
                          </button>
                        ))}
                      </div>
                      {chosen === "manual" && (
                        <div>
                          <label htmlFor={`${uid}-manual-${conflict.conflictId}`} className="sr-only">
                            {pick("수동 병합 대사 입력", "Manual merged dialogue")}
                          </label>
                          <input
                            id={`${uid}-manual-${conflict.conflictId}`}
                            data-testid={`input-manual-${conflict.conflictId}`}
                            type="text" value={manualValue}
                            onChange={(e) => setManualTexts((prev) => ({ ...prev, [conflict.conflictId]: e.target.value }))}
                            className={`min-h-11 w-full rounded-lg border border-line bg-panel px-3 py-2 text-xs text-fg ${FOCUS_RING}`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}

                <button type="button" data-testid="btn-apply-merge" onClick={handleApplyMerge} className={`${ACTION_BTN} ${PRIMARY_TONE}`}>
                  <GitMerge className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {mergePlan.canAutoMerge
                      ? pick("무충돌 3-Way 자동 병합 커밋", "Commit Clean 3-Way Auto-Merge")
                      : pick("선택한 해결안으로 병합 커밋", "Commit Resolved 3-Way Merge")}
                  </span>
                </button>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-line bg-card p-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-fg">
              <span>{pick(`커밋 이력 및 결정론적 롤백 (${repo.activeBranch})`, `Commit History & Deterministic Rollback (${repo.activeBranch})`)}</span>
              <span data-testid="vcs-history-count" className="text-fg-2 tabular-nums">
                {activeHistory.length}{pick("개 커밋", " commits")}
              </span>
            </div>
            <div className="space-y-1.5">
              {activeHistory.map((commit, idx) => (
                <div key={commit.id} data-testid={`commit-row-${commit.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-raised px-2.5 py-2 text-xs">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 font-semibold text-fg">
                      <span className="tabular-nums">{commit.id}</span>
                      {commit.parentIds.length > 1 && (
                        <span className="rounded border border-accent bg-accent-soft px-1.5 py-0.5 text-accent">
                          {pick("병합 커밋", "Merge")}
                        </span>
                      )}
                      <span>{commit.message}</span>
                    </div>
                    <div className="text-fg-3 tabular-nums">
                      {commit.author} · tree {commit.treeHash.slice(0, 8)} · {commit.snapshot.cuts.length}{pick("컷", " cuts")}
                    </div>
                  </div>
                  {idx > 0 && (
                    <button
                      type="button" data-testid={`btn-rollback-${commit.id}`}
                      onClick={() => handleRollback(commit.id)}
                      className={`${ACTION_BTN} ${IDLE_TONE}`}
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{pick("이 시점으로 롤백", "Rollback Here")}</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
