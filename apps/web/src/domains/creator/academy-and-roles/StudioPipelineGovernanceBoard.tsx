/**
 * 8단계 웹툰 분업 파이프라인 · 컷 단위 바통 터치 게이트 · 규모별 스튜디오 거버넌스 보드.
 *
 * - `mode="pipeline"`: 8단계 릴레이, 5대 자동 검수 게이트, 원클릭 인계(이전 공정 Read-Only 잠금 & 하위 공정 열림)
 * - `mode="governance"`: 7단계 거버넌스(`solo`~`cross-studio-federation`), 5계층 워크스페이스,
 *   6역할 RBAC, 외주 3~5컷 샌드박스·워터마크·반입 검증, 컷당 정산 원장 & 마감 SLA 병목 감지기
 */

import { AlertTriangle, ArrowRight, CheckCircle2, Lock, ShieldCheck, Unlock, Wallet } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import {
  GOVERNANCE_TIER_ORDER,
  KOREAN_10STAGE_WEBTOON_PIPELINE,
  RBAC_ACTION_LABELS,
  SAMPLE_CUT_PAYOUT_ENTRIES,
  SAMPLE_KOREAN_10STAGE_CUT_RECORDS,
  SAMPLE_SLA_WORKLOAD_CUTS,
  STUDIO_GOVERNANCE_TIERS,
  STUDIO_RBAC_ROLES,
  WEBTOON_8_STAGE_PIPELINE,
  WORKSPACE_HIERARCHY_LEVELS,
  applyCut10StageHandoff,
  calculateCutPayoutLedger,
  createOutsourceSandboxPackage,
  detectPipelineBottlenecks,
  evaluateCut10StageHandoff,
  evaluateRbacPermission,
  evaluateStageHandoffGate,
  executeCutBatonHandoff,
  getKorean10StageSpec,
  getPipelineStageSpec,
  verifyOutsourceReturnBundle,
  type CutHandoffRecord,
  type CutPipelineRuntimeState,
  type Korean10StageId,
  type PipelineStageId,
  type StudioGovernanceTierId,
  type StudioRbacActionId,
  type StudioRbacRoleId,
} from "./studio-pipeline-governance-engine";

export interface StudioPipelineGovernanceBoardProps {
  readonly mode: "pipeline" | "governance";
  readonly initialTierId?: StudioGovernanceTierId;
  readonly selectedCutId?: string;
}

const RBAC_ROLE_ORDER: readonly StudioRbacRoleId[] = Object.freeze([
  "ep-pd", "ad-lead", "main-author", "stage-assist", "outsource-guest", "client-reviewer",
]);

const RBAC_DISPLAY_ACTIONS: readonly StudioRbacActionId[] = Object.freeze([
  "manage-org", "manage-billing-payout", "approve-final-bom", "assign-cuts",
  "edit-all-layers", "edit-assigned-stage-only", "view-full-episode",
  "view-sandbox-cuts-only", "leave-pin-review", "export-commercial-master", "manage-federation-canon",
]);

const SANDBOX_CANDIDATE_CUTS: readonly string[] = Object.freeze([
  "CUT-12-014", "CUT-12-015", "CUT-12-016", "CUT-12-017", "CUT-12-018", "CUT-12-019",
]);

const formatKrw = (amount: number): string => `${Math.round(amount).toLocaleString("ko-KR")}원`;

function severityPillClass(severity: "healthy" | "watch" | "warning" | "critical"): string {
  if (severity === "critical") return "arc-pill arc-pill-bad";
  if (severity === "warning") return "arc-pill arc-pill-warn";
  if (severity === "watch") return "arc-pill arc-pill-accent";
  return "arc-pill arc-pill-good";
}

function severityLabelKo(severity: "healthy" | "watch" | "warning" | "critical"): string {
  if (severity === "critical") return "심각 병목";
  if (severity === "warning") return "SLA 주의";
  if (severity === "watch") return "대기열 관찰";
  return "정상 흐름";
}

export function StudioPipelineGovernanceBoard({
  mode,
  initialTierId = "studio-8",
  selectedCutId = "CUT-12-014",
}: StudioPipelineGovernanceBoardProps): ReactElement {
  const [pipelineStandard, setPipelineStandard] = useState<"8stage" | "10stage">("8stage");
  const [cut10Record, setCut10Record] = useState<CutHandoffRecord>(
    () => SAMPLE_KOREAN_10STAGE_CUT_RECORDS[0],
  );
  const [cutState, setCutState] = useState<CutPipelineRuntimeState>(() => ({
    cutId: selectedCutId,
    currentStageId: "lineart",
    lockedReadOnlyStageIds: ["conti", "bg3d-vrm"],
    unlockedStageId: "lineart",
    handoffHistory: [
      { fromStageId: "conti", toStageId: "bg3d-vrm", handedOffAtIso: "2026-11-23T09:10:00Z", noteKo: "콘티 Read-Only 잠금 → 3D/VRM 즉시 개방" },
      { fromStageId: "bg3d-vrm", toStageId: "lineart", handedOffAtIso: "2026-11-23T10:40:00Z", noteKo: "3D/VRM Read-Only 잠금 → 선화 즉시 개방" },
    ],
  }));

  const [namingValid, setNamingValid] = useState(true);
  const [highResValid, setHighResValid] = useState(true);
  const [closedRegionsValid, setClosedRegionsValid] = useState(true);
  const [biblePaletteValid, setBiblePaletteValid] = useState(true);
  const [zeroMissingBom, setZeroMissingBom] = useState(true);

  const currentStageSpec = getPipelineStageSpec(cutState.currentStageId);
  const gateInput = useMemo(
    () => ({
      cutId: cutState.cutId,
      currentStageId: cutState.currentStageId,
      layerNames: namingValid
        ? [`${currentStageSpec.requiredLayerPrefix}MAIN`, `${currentStageSpec.requiredLayerPrefix}REF`]
        : ["레이어 1"],
      widthPx: highResValid ? 1600 : 1080,
      dpi: highResValid ? 350 : 150,
      openLineGapCount: closedRegionsValid ? 0 : 3,
      biblePaletteMatchPercent: biblePaletteValid ? 98 : 79,
      missingRightsBomCount: zeroMissingBom ? 0 : 2,
    }),
    [biblePaletteValid, closedRegionsValid, currentStageSpec.requiredLayerPrefix, cutState.currentStageId, cutState.cutId, highResValid, namingValid, zeroMissingBom],
  );
  const gateEval = useMemo(() => evaluateStageHandoffGate(gateInput), [gateInput]);
  const current10StageSpec = getKorean10StageSpec(cut10Record.currentStageId);
  const effectiveCut10Record = useMemo<CutHandoffRecord>(() => {
    const activeLayerName = namingValid
      ? `${current10StageSpec.requiredLayerPrefix}MAIN`
      : "레이어 1";
    const others = cut10Record.layers.filter((l) => l.stageId !== cut10Record.currentStageId);
    return {
      ...cut10Record,
      layers: [
        ...others,
        {
          layerId: `layer-${cut10Record.currentStageId}`,
          layerName: activeLayerName,
          stageId: cut10Record.currentStageId,
          locked: false,
          lockMode: "editable",
        },
      ],
      widthPx: highResValid ? 1600 : 1080,
      dpi: highResValid ? 350 : 150,
      openLineGapCount: closedRegionsValid ? 0 : 3,
      biblePaletteMatchPercent: biblePaletteValid ? 98 : 79,
      rightsBomPassed: zeroMissingBom,
      missingRightsBomCount: zeroMissingBom ? 0 : 2,
    };
  }, [biblePaletteValid, closedRegionsValid, current10StageSpec.requiredLayerPrefix, cut10Record, highResValid, namingValid, zeroMissingBom]);
  const cut10Eval = useMemo(
    () => evaluateCut10StageHandoff(effectiveCut10Record),
    [effectiveCut10Record],
  );

  const [tierId, setTierId] = useState<StudioGovernanceTierId>(initialTierId);
  const [rbacRoleId, setRbacRoleId] = useState<StudioRbacRoleId>("outsource-guest");
  const [sandboxCutIds, setSandboxCutIds] = useState<readonly string[]>(["CUT-12-014", "CUT-12-015", "CUT-12-016", "CUT-12-017"]);
  const [returnMissingBom, setReturnMissingBom] = useState(false);

  const activeTier = STUDIO_GOVERNANCE_TIERS[tierId];
  const activeRbacRole = STUDIO_RBAC_ROLES[rbacRoleId];
  const sandboxPackage = useMemo(
    () => createOutsourceSandboxPackage({
      episodeId: "episode-12", totalEpisodeCuts: 62, requestedCutIds: sandboxCutIds,
      stageId: "flatting", contractorHandle: "ext_flat_studio", sessionCode: "EP12A",
    }),
    [sandboxCutIds],
  );
  const returnVerification = useMemo(
    () => verifyOutsourceReturnBundle(sandboxPackage, {
      returnedCutIds: sandboxPackage.exposedCutIds, watermarkSignature: sandboxPackage.sessionWatermarkSignature,
      minDetectedWidthPx: 1600, missingRightsBomCount: returnMissingBom ? 1 : 0, layerNamingCompliant: true,
    }),
    [returnMissingBom, sandboxPackage],
  );
  const payoutLedger = useMemo(() => calculateCutPayoutLedger(SAMPLE_CUT_PAYOUT_ENTRIES), []);
  const bottleneckReport = useMemo(() => detectPipelineBottlenecks(SAMPLE_SLA_WORKLOAD_CUTS, { stageWipCapacity: 2 }), []);

  const handleOneClickBatonTouch = (): void => {
    const result = executeCutBatonHandoff(cutState, gateInput, "2026-11-23T12:15:00Z");
    if (result.transitioned) setCutState(result.nextState);
  };

  const handleSelectStagePreview = (stageId: PipelineStageId): void => {
    setCutState((prev) => ({ ...prev, currentStageId: stageId, unlockedStageId: stageId }));
  };

  const toggleSandboxCut = (cutId: string): void => {
    setSandboxCutIds((current) =>
      current.includes(cutId)
        ? current.length > 1 ? current.filter((id) => id !== cutId) : current
        : [...current, cutId],
    );
  };

  const handleOneClick10StageHandoff = (): void => {
    const result = applyCut10StageHandoff(effectiveCut10Record, "2026-11-23T12:20:00Z");
    if (result.transitioned) setCut10Record(result.nextRecord);
  };

  const handleSelect10StagePreview = (stageId: Korean10StageId): void => {
    setCut10Record((prev) => ({ ...prev, currentStageId: stageId }));
  };

  if (mode === "pipeline") {
    if (pipelineStandard === "10stage") {
      return (
        <div data-testid="academy-pipeline-board" className="arc-grid-2">
          <article className="arc-card" style={{ gridColumn: "1 / -1" }}>
            <div className="arc-section-head">
              <div>
                <h3 className="arc-section-title">한국 실무 10단계 컷 분업 파이프라인 · 바통 게이트</h3>
                <p className="arc-meta">
                  현재 컷 <strong className="arc-num">{effectiveCut10Record.cutId}</strong> — 선화 열린 틈새 0건·Rights BOM 통과 시
                  이전 공정 레이어가 자동 잠금(`locked: true`)되고 외주 3.3%(10원 미만 절사) 원고료가 확정됩니다.
                </p>
              </div>
              <div className="arc-chip-row" role="group" aria-label="파이프라인 공정 기준 선택">
                <button type="button" data-testid="pipeline-mode-8stage" className="arc-chip" aria-pressed={false} onClick={() => setPipelineStandard("8stage")}>8단계 표준</button>
                <button type="button" data-testid="pipeline-mode-10stage" className="arc-chip" aria-pressed={true} onClick={() => setPipelineStandard("10stage")}>한국 실무 10단계</button>
              </div>
            </div>
            <div className="arc-stage-strip" role="list" aria-label="한국 웹툰 10단계 컷 공정">
              {KOREAN_10STAGE_WEBTOON_PIPELINE.map((stage) => {
                const isCurrent = cut10Record.currentStageId === stage.id;
                const isLocked = cut10Record.layers.some((l) => l.stageId === stage.id && l.locked);
                const state = isCurrent ? "active" : isLocked ? "locked" : "queued";
                return (
                  <button
                    key={stage.id}
                    type="button"
                    data-testid={`pipeline-10stage-${stage.id}`}
                    data-stage-state={state}
                    onClick={() => handleSelect10StagePreview(stage.id)}
                    className="arc-stage-node"
                  >
                    <span className="arc-section-head">
                      <img src={stage.spritePath} alt="" width={24} height={24} aria-hidden="true" className="arc-sprite-sm" />
                      <span className="arc-pill arc-num">{isLocked ? "잠금" : isCurrent ? "열림" : `SLA ${stage.defaultSlaHours}h`}</span>
                    </span>
                    <strong className="arc-num">{stage.labelKo}</strong>
                    <span className="arc-meta">{stage.handoffSummaryKo}</span>
                  </button>
                );
              })}
            </div>
          </article>

          <article className="arc-card" data-testid="pipeline-10stage-gate-panel">
            <div className="arc-section-head">
              <div>
                <h3 className="arc-section-title">10단계 바통 인계 검수 ({current10StageSpec.labelKo})</h3>
                <p className="arc-meta">{cut10Eval.summaryKo}</p>
              </div>
              <span data-testid="pipeline-10stage-score" className={cut10Eval.passed ? "arc-pill arc-pill-good arc-num" : "arc-pill arc-pill-bad arc-num"}>
                {cut10Eval.passed ? "인계 가능" : "차단됨"} · {cut10Eval.scorePercent}%
              </span>
            </div>
            <div className="arc-chip-row" role="group" aria-label="10단계 검수 조건 토글">
              <button type="button" className="arc-chip" aria-pressed={namingValid} onClick={() => setNamingValid((v) => !v)}>표준 레이어명</button>
              <button type="button" className="arc-chip" aria-pressed={closedRegionsValid} onClick={() => setClosedRegionsValid((v) => !v)}>선화 틈새 0건</button>
              <button type="button" className="arc-chip" aria-pressed={zeroMissingBom} onClick={() => setZeroMissingBom((v) => !v)}>Rights BOM 통과</button>
              <button type="button" className="arc-chip" aria-pressed={biblePaletteValid} onClick={() => setBiblePaletteValid((v) => !v)}>바이블 팔레트</button>
            </div>
            <ul className="arc-list">
              {cut10Eval.checks.map((check) => (
                <li key={check.checkId} className="arc-subcard">
                  <div className="arc-section-head">
                    <strong>{check.labelKo}</strong>
                    <span className={check.passed ? "arc-pill arc-pill-good" : "arc-pill arc-pill-bad"}>{check.passed ? "통과" : "차단"}</span>
                  </div>
                  <p className="arc-meta">{check.detailKo}</p>
                </li>
              ))}
            </ul>
            <div className="arc-actions">
              <button type="button" data-testid="pipeline-10stage-handoff-btn" disabled={!cut10Eval.canHandoff} onClick={handleOneClick10StageHandoff} className="arc-btn arc-btn-primary">
                <CheckCircle2 size={16} aria-hidden="true" />
                원클릭 10단계 바통 인계
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          </article>

          <article className="arc-card" data-testid="pipeline-10stage-payout-panel">
            <h3 className="arc-section-title">자동 레이어 잠금 & 컷당 3.3% 원천징수 정산</h3>
            <div className="arc-grid-3">
              <div className="arc-subcard"><span className="arc-meta">컷 세전 원고료</span><strong className="arc-num">{formatKrw(cut10Eval.payout.grossKrw)}</strong></div>
              <div className="arc-subcard"><span className="arc-meta">3.3% 절사 세액</span><strong className="arc-num">-{formatKrw(cut10Eval.payout.totalWithholdingTaxKrw)}</strong></div>
              <div className="arc-subcard"><span className="arc-meta">실수령 예상액</span><strong className="arc-num">{formatKrw(cut10Eval.payout.netPayableKrw)}</strong></div>
            </div>
            <ul className="arc-list" aria-label="10단계 레이어 잠금 예정 목록">
              {cut10Eval.updatedLayers.map((layer) => (
                <li key={layer.layerId} className="arc-subcard">
                  <div className="arc-section-head">
                    <strong className="arc-num">{layer.layerName}</strong>
                    <span className={layer.locked ? "arc-pill arc-pill-good" : "arc-pill"}>{layer.locked ? "locked: true (읽기 전용)" : "편집 가능"}</span>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        </div>
      );
    }

    return (
      <div data-testid="academy-pipeline-board" className="arc-grid-2">
        <article className="arc-card" style={{ gridColumn: "1 / -1" }}>
          <div className="arc-section-head">
            <div>
              <h3 className="arc-section-title">8단계 웹툰 표준 분업 파이프라인 · 컷 바통 터치</h3>
              <p className="arc-meta">
                현재 컷 <strong className="arc-num">{cutState.cutId}</strong> — 공정을 통과하면 이전 공정 레이어는
                Read-Only 자동 잠금되고 다음 담당 공정만 즉시 개방됩니다.
              </p>
            </div>
            <div className="arc-chip-row" role="group" aria-label="파이프라인 공정 기준 선택">
              <button type="button" data-testid="pipeline-mode-8stage" className="arc-chip" aria-pressed={true} onClick={() => setPipelineStandard("8stage")}>8단계 표준</button>
              <button type="button" data-testid="pipeline-mode-10stage" className="arc-chip" aria-pressed={false} onClick={() => setPipelineStandard("10stage")}>한국 실무 10단계</button>
              <span className="arc-pill arc-pill-accent arc-num">
                잠금 완료 {cutState.lockedReadOnlyStageIds.length} / {WEBTOON_8_STAGE_PIPELINE.length}공정
              </span>
            </div>
          </div>
          <div className="arc-stage-strip" role="list" aria-label="8단계 웹툰 분업 공정">
            {WEBTOON_8_STAGE_PIPELINE.map((stage) => {
              const isLocked = cutState.lockedReadOnlyStageIds.includes(stage.id);
              const isCurrent = cutState.currentStageId === stage.id;
              const stageState = isCurrent ? "active" : isLocked ? "locked" : "queued";
              return (
                <button
                  key={stage.id}
                  type="button"
                  data-testid={`pipeline-stage-${stage.id}`}
                  data-stage-state={stageState}
                  onClick={() => handleSelectStagePreview(stage.id)}
                  className="arc-stage-node"
                >
                  <span className="arc-section-head">
                    <img src={stage.spritePath} alt="" width={26} height={26} aria-hidden="true" className="arc-sprite-sm" />
                    <span className="arc-pill arc-num">
                      {isLocked ? (<><Lock size={12} aria-hidden="true" /> 잠금</>) : isCurrent ? (<><Unlock size={12} aria-hidden="true" /> 열림</>) : `SLA ${stage.defaultSlaHours}h`}
                    </span>
                  </span>
                  <strong className="arc-num">{stage.labelKo}</strong>
                  <span className="arc-meta">{stage.handoffSummaryKo}</span>
                </button>
              );
            })}
          </div>
        </article>

        <article className="arc-card" data-testid="pipeline-gate-panel">
          <div className="arc-section-head">
            <div>
              <h3 className="arc-section-title">자동 검수 게이트 ({currentStageSpec.labelKo})</h3>
              <p className="arc-meta">레이어 명명·해상도·닫힌 영역·바이블 팔레트·Rights BOM 0건이 모두 통과해야 인계됩니다.</p>
            </div>
            <span data-testid="pipeline-gate-score" className={gateEval.passed ? "arc-pill arc-pill-good arc-num" : "arc-pill arc-pill-bad arc-num"}>
              {gateEval.passed ? "인계 가능" : "차단됨"} · {gateEval.scorePercent}%
            </span>
          </div>
          <div className="arc-chip-row" role="group" aria-label="검수 조건 시뮬레이션 토글">
            <button type="button" className="arc-chip" aria-pressed={namingValid} onClick={() => setNamingValid((v) => !v)}>레이어 명명 규칙</button>
            <button type="button" className="arc-chip" aria-pressed={highResValid} onClick={() => setHighResValid((v) => !v)}>1600px · 350DPI</button>
            <button type="button" className="arc-chip" aria-pressed={closedRegionsValid} onClick={() => setClosedRegionsValid((v) => !v)}>닫힌 영역 0틈새</button>
            <button type="button" className="arc-chip" aria-pressed={biblePaletteValid} onClick={() => setBiblePaletteValid((v) => !v)}>바이블 팔레트 98%</button>
            <button type="button" className="arc-chip" aria-pressed={zeroMissingBom} onClick={() => setZeroMissingBom((v) => !v)}>Rights BOM 누락 0건</button>
          </div>
          <ul className="arc-list">
            {gateEval.checks.map((check) => (
              <li key={check.checkId} className="arc-subcard">
                <div className="arc-section-head">
                  <strong>{check.labelKo}</strong>
                  <span className={check.passed ? "arc-pill arc-pill-good" : "arc-pill arc-pill-bad"}>{check.passed ? "통과" : "차단"}</span>
                </div>
                <p className="arc-meta">{check.detailKo}</p>
              </li>
            ))}
          </ul>
          <div className="arc-actions">
            <button type="button" data-testid="pipeline-oneclick-handoff-btn" disabled={!gateEval.canOneClickHandoff} onClick={handleOneClickBatonTouch} className="arc-btn arc-btn-primary">
              <CheckCircle2 size={16} aria-hidden="true" />
              원클릭 바통 터치 인계
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
        </article>

        <article className="arc-card">
          <h3 className="arc-section-title">이전 공정 Read-Only 잠금 & 인계 감사 이력</h3>
          <div className="arc-subcard">
            <div className="arc-section-head">
              <strong>이전 공정 잠금 정책</strong>
              <span className={gateEval.previousStageLayerLock.locked ? "arc-pill arc-pill-good" : "arc-pill arc-pill-warn"}>
                {gateEval.previousStageLayerLock.locked ? "Read-Only 자동 잠금 예정" : "편집 유지"}
              </span>
            </div>
            <p className="arc-meta">{gateEval.previousStageLayerLock.reasonKo}</p>
            <p className="arc-meta">
              다음 개방 대상:{" "}
              <strong>
                {gateEval.downstreamStageUnlocked.stageId
                  ? `${getPipelineStageSpec(gateEval.downstreamStageUnlocked.stageId).labelKo} (${gateEval.downstreamStageUnlocked.notifiedAssigneeKo})`
                  : "최종 BOM 출고 확정"}
              </strong>
            </p>
          </div>
          <ul className="arc-list" aria-label="컷 바통 터치 이력">
            {cutState.handoffHistory.map((item, index) => (
              <li key={`${item.fromStageId}-${index}`} className="arc-subcard">
                <div className="arc-section-head">
                  <strong className="arc-num">#{index + 1} 바통 인계</strong>
                  <span className="arc-meta arc-num">{item.handedOffAtIso.slice(0, 16).replace("T", " ")}</span>
                </div>
                <p className="arc-meta">{item.noteKo}</p>
              </li>
            ))}
          </ul>
        </article>
      </div>
    );
  }

  return (
    <div data-testid="academy-governance-board" className="arc-grid-2">
      <article className="arc-card" style={{ gridColumn: "1 / -1" }}>
        <div className="arc-section-head">
          <div>
            <h3 className="arc-section-title">7단계 규모별 워크스페이스 · 팀 · 클래스 · 연합 거버넌스</h3>
            <p className="arc-meta">1인 솔로부터 동아리 릴레이·학원 클래스·30인+ 에이전시·스튜디오 간 연합 룸까지 조직 규모에 맞춰 권한과 UI 복잡도를 자동 조율합니다.</p>
          </div>
          <span className="arc-pill arc-pill-accent">{activeTier.headcountLabelKo}</span>
        </div>
        <div className="arc-chip-row" role="group" aria-label="거버넌스 규모 티어 선택">
          {GOVERNANCE_TIER_ORDER.map((id) => (
            <button key={id} type="button" data-testid={`gov-tier-${id}`} aria-pressed={tierId === id} onClick={() => setTierId(id)} className="arc-chip">
              {STUDIO_GOVERNANCE_TIERS[id].labelKo}
            </button>
          ))}
        </div>
        <div className="arc-subcard">
          <div className="arc-section-head">
            <strong>{activeTier.labelKo}</strong>
            <span className="arc-pill arc-pill-good arc-num">활성 공정 {activeTier.enabledPipelineStages.length} / 8단계</span>
          </div>
          <p className="arc-meta">{activeTier.summaryKo}</p>
          <div className="arc-hierarchy-bar" aria-label="워크스페이스 5계층">
            {WORKSPACE_HIERARCHY_LEVELS.map((level) => (
              <span key={level.id} className="arc-hierarchy-node" data-active={activeTier.activeHierarchyLevels.includes(level.id)}>
                <span className="arc-num">L{level.depth}</span>
                <span>{level.labelKo.split(" ")[0]}</span>
              </span>
            ))}
          </div>
          <ul className="arc-list">
            {activeTier.signatureFeaturesKo.map((feat) => (<li key={feat} className="arc-meta">• {feat}</li>))}
          </ul>
        </div>
      </article>

      <article className="arc-card">
        <div className="arc-section-head">
          <h3 className="arc-section-title">6역할 세밀 RBAC 권한 제어</h3>
          <ShieldCheck size={16} aria-hidden="true" />
        </div>
        <div className="arc-chip-row" role="group" aria-label="RBAC 역할 선택">
          {RBAC_ROLE_ORDER.map((id) => (
            <button key={id} type="button" data-testid={`rbac-role-${id}`} aria-pressed={rbacRoleId === id} onClick={() => setRbacRoleId(id)} className="arc-chip">
              {STUDIO_RBAC_ROLES[id].labelKo}
            </button>
          ))}
        </div>
        <p className="arc-meta">{activeRbacRole.scopeSummaryKo}</p>
        <ul className="arc-list">
          {RBAC_DISPLAY_ACTIONS.map((actionId) => {
            const decision = evaluateRbacPermission(rbacRoleId, actionId);
            return (
              <li key={actionId} className="arc-subcard">
                <div className="arc-section-head">
                  <span>{RBAC_ACTION_LABELS[actionId]}</span>
                  <span className={decision.allowed ? "arc-pill arc-pill-good" : "arc-pill"}>{decision.allowed ? "허용" : "차단"}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </article>

      <article className="arc-card" data-testid="outsource-sandbox-panel">
        <div className="arc-section-head">
          <h3 className="arc-section-title">외주 반출 샌드박스 (3~5컷 격리 · 워터마크)</h3>
          <span className="arc-pill arc-pill-accent arc-num">노출 {sandboxPackage.exposedCutIds.length}컷 · 비공개 {sandboxPackage.hiddenOtherCutCount}컷</span>
        </div>
        <p className="arc-meta">{sandboxPackage.noticeKo}</p>
        <div className="arc-chip-row" role="group" aria-label="외주 반출 컷 선택">
          {SANDBOX_CANDIDATE_CUTS.map((cutId) => (
            <button key={cutId} type="button" aria-pressed={sandboxCutIds.includes(cutId)} onClick={() => toggleSandboxCut(cutId)} className="arc-chip arc-num">{cutId}</button>
          ))}
        </div>
        <div className="arc-subcard">
          <p className="arc-meta">세션 포렌식 워터마크: <strong className="arc-num">{sandboxPackage.sessionWatermarkSignature}</strong></p>
          <p className="arc-meta">
            상류 공정 잠금: <strong>{sandboxPackage.upstreamLayersReadOnlyLocked ? "Read-Only 보호" : "미잠금"}</strong> ·
            최소 반입 해상도: <strong className="arc-num">{sandboxPackage.minReturnWidthPx}px</strong>
          </p>
          <div className="arc-actions">
            <button type="button" className="arc-chip" aria-pressed={returnMissingBom} onClick={() => setReturnMissingBom((v) => !v)}>
              {returnMissingBom ? "반입 BOM 누락 1건 시뮬레이션" : "반입 BOM 0누락 정상 상태"}
            </button>
          </div>
          <p data-testid="outsource-return-status" className={returnVerification.accepted ? "arc-pill arc-pill-good" : "arc-pill arc-pill-bad"}>
            {returnVerification.summaryKo}
          </p>
        </div>
      </article>

      <article className="arc-card" data-testid="payout-ledger-panel">
        <div className="arc-section-head">
          <div>
            <h3 className="arc-section-title">컷당 · 공정당 원고료 자동 정산 원장 (합성 예시)</h3>
            <p className="arc-meta">게이트 승인 완료 지급액과 검수 대기액을 분리 집계합니다.</p>
          </div>
          <Wallet size={16} aria-hidden="true" />
        </div>
        <div className="arc-grid-3">
          <div className="arc-subcard"><span className="arc-meta">승인 확정 지급액</span><strong className="arc-num">{formatKrw(payoutLedger.totalApprovedPayableKrw)}</strong></div>
          <div className="arc-subcard"><span className="arc-meta">검수 대기액</span><strong className="arc-num">{formatKrw(payoutLedger.totalPendingReviewKrw)}</strong></div>
          <div className="arc-subcard"><span className="arc-meta">회차 총 정산 예정</span><strong className="arc-num">{formatKrw(payoutLedger.grandTotalKrw)}</strong></div>
        </div>
        <div className="arc-table-wrap">
          <table className="arc-table">
            <thead><tr><th>담당자</th><th>컷 수</th><th>승인 확정</th><th>검수 대기</th></tr></thead>
            <tbody>
              {payoutLedger.byAssignee.map((row) => (
                <tr key={row.assigneeId}>
                  <td>{row.assigneeNameKo}</td>
                  <td className="arc-num">{row.cutCount}컷</td>
                  <td className="arc-num">{formatKrw(row.approvedPayableKrw)}</td>
                  <td className="arc-num">{formatKrw(row.pendingReviewKrw)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="arc-card" data-testid="sla-bottleneck-panel">
        <div className="arc-section-head">
          <div>
            <h3 className="arc-section-title">마감 SLA 병목 감지기 (합성 예시)</h3>
            <p className="arc-meta">감시 {bottleneckReport.totalMonitoredCuts}컷 · SLA 초과 {bottleneckReport.totalOverdueCuts}컷 · 최대 지연 +{bottleneckReport.maxEstimatedDelayHours}h</p>
          </div>
          <span className={severityPillClass(bottleneckReport.overallSeverity)}>
            <AlertTriangle size={12} aria-hidden="true" />{severityLabelKo(bottleneckReport.overallSeverity)}
          </span>
        </div>
        <ul className="arc-list">
          {bottleneckReport.stageAlerts.map((alert) => (
            <li key={alert.stageId} className="arc-subcard">
              <div className="arc-section-head">
                <strong>{alert.stageLabelKo}</strong>
                <span className={severityPillClass(alert.severity)}>{severityLabelKo(alert.severity)} · WIP {alert.wipCutCount}</span>
              </div>
              <p className="arc-meta">{alert.prescriptionKo}</p>
            </li>
          ))}
        </ul>
      </article>
    </div>
  );
}
