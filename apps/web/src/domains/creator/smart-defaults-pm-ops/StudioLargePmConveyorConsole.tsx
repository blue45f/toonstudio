/**
 * 빈칸 제로 스마트 기본값·의도 안내 UI + 대형 웹툰 스튜디오 PM 컨베이어·정산·사전 QC 통합 콘솔.
 *
 * - 탭 1: 빈칸 0% 스마트 기본값 체험 폼 + 원클릭 "내 의도 한 줄로 전체 기본값 자동 맞춤" (`StudioSmartFieldGuide`)
 * - 탭 2: 3~4화차 동시 로테이션 컨베이어 보드 + 도미노 지연 조기 경보 + 여유 인력 재배정
 * - 탭 3: 컷 난이도 가중치(0.8x/1.0x/1.4x/1.8x) × 3.3% 프리랜서/사업자 세금계산서 외주 정산기
 * - 탭 4: 네이버(690/1600px)·카카오·글로벌 플랫폼 사전 QC · 심의 자동 점검기
 */

import {
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  Layers,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  DEFAULT_PLATFORM_QC_INPUT,
  DEFAULT_SETTLEMENT_ENTRIES,
  DEFAULT_STUDIO_CONVEYOR_EPISODES,
  DEFAULT_STUDIO_STAFF_POOL,
  PLATFORM_QC_SPECS,
  applyReallocationProposal,
  calculateWeightedStudioSettlement,
  evaluateMultiEpisodeConveyor,
  runPlatformPreSubmissionQc,
  type ConveyorEpisodeSlot,
  type CutDifficultyGradeId,
  type PlatformPreSubmissionInput,
  type PlatformQcTargetId,
  type ReallocationProposal,
  type SettlementContractorEntry,
  type SettlementTaxMode,
  type StudioStaffMember,
} from "./large-studio-pm-conveyor-engine";
import {
  SMART_DEFAULT_SPRITE_PATHS,
  SMART_STAGE_ORDER,
  adaptSmartDefaultsFromIntentText,
  applySmartStagePreset,
  auditZeroBlankFields,
  buildAllSmartStageDefaults,
  updateSmartStageFieldValue,
  type SmartStageDefaultsBundle,
  type SmartStageId,
} from "./smart-defaults-intent-engine";
import {
  PmConveyorRotationTabView,
  PmPlatformQcTabView,
  PmWeightedSettlementTabView,
} from "./StudioLargePmConveyorTabs";
import { StudioSmartFieldGuide } from "./StudioSmartFieldGuide";

import "./smart-defaults-pm-ops.css";

export type PmConveyorConsoleTabId =
  | "smart-defaults"
  | "conveyor"
  | "settlement"
  | "platform-qc";

export interface StudioLargePmConveyorConsoleProps {
  readonly initialTab?: PmConveyorConsoleTabId;
  readonly studioTitleKo?: string;
}

const SAMPLE_INTENT_PROMPTS: readonly { readonly id: string; readonly labelKo: string; readonly text: string }[] = [
  {
    id: "intent-cyber-action",
    labelKo: "네온 액션 · 네이버 1600px",
    text: "사이버펑크 네온 야간 헌터 액션, 빠른 75컷 전개, 네이버 정식연재 1600px 출고",
  },
  {
    id: "intent-rofan-kakao",
    labelKo: "로판 궁정 · 카카오페이지",
    text: "로맨스 판타지 회귀 궁정물, 따뜻한 노을 조명, 감정선 중심 카카오페이지 연재",
  },
  {
    id: "intent-thriller-global",
    labelKo: "미스터리 스릴러 · 글로벌 800px",
    text: "도시 미스터리 공포 스릴러, 깊은 새벽 그림자, 느린 서스펜스 여백, 글로벌 800px 동시 연재",
  },
];

export function StudioLargePmConveyorConsole({
  initialTab = "smart-defaults",
  studioTitleKo = "툰스튜디오 스마트 기본값 · 대형 CP PM 통합 콘솔",
}: StudioLargePmConveyorConsoleProps) {
  const [activeTab, setActiveTab] = useState<PmConveyorConsoleTabId>(initialTab);
  const [statusNoticeKo, setStatusNoticeKo] = useState<string | null>(null);

  // 1) 빈칸 제로 스마트 기본값 상태
  const [selectedStageId, setSelectedStageId] = useState<SmartStageId>("planning");
  const [stageBundles, setStageBundles] = useState<
    Readonly<Record<SmartStageId, SmartStageDefaultsBundle>>
  >(() => buildAllSmartStageDefaults());
  const [intentInputText, setIntentInputText] = useState<string>(
    SAMPLE_INTENT_PROMPTS[0]?.text ?? "",
  );

  // 2) 3~4화차 동시 로테이션 컨베이어 상태
  const [episodes, setEpisodes] = useState<readonly ConveyorEpisodeSlot[]>(
    () => DEFAULT_STUDIO_CONVEYOR_EPISODES,
  );
  const [staffPool, setStaffPool] = useState<readonly StudioStaffMember[]>(
    () => DEFAULT_STUDIO_STAFF_POOL,
  );

  // 3) 난이도 가중치 정산 상태
  const [settlementEntries, setSettlementEntries] = useState<readonly SettlementContractorEntry[]>(
    () => DEFAULT_SETTLEMENT_ENTRIES,
  );

  // 4) 플랫폼 사전 QC 상태
  const [qcInput, setQcInput] = useState<PlatformPreSubmissionInput>(DEFAULT_PLATFORM_QC_INPUT);

  const zeroBlankAudit = useMemo(() => auditZeroBlankFields(stageBundles), [stageBundles]);
  const activeStageBundle = stageBundles[selectedStageId];

  const conveyorEval = useMemo(
    () => evaluateMultiEpisodeConveyor(episodes, staffPool),
    [episodes, staffPool],
  );
  const settlementReport = useMemo(
    () => calculateWeightedStudioSettlement(settlementEntries),
    [settlementEntries],
  );
  const qcReport = useMemo(() => runPlatformPreSubmissionQc(qcInput), [qcInput]);

  const handleApplyIntentLine = (rawText?: string) => {
    const query = rawText ?? intentInputText;
    if (rawText) setIntentInputText(rawText);
    const adapted = adaptSmartDefaultsFromIntentText(query, selectedStageId);
    setStageBundles(adapted.stages);
    setStatusNoticeKo(adapted.summaryKo);
  };

  const handleFieldChange = (fieldId: string, nextValue: string) => {
    setStageBundles((prev) => ({
      ...prev,
      [selectedStageId]: updateSmartStageFieldValue(prev[selectedStageId], fieldId, nextValue, {
        allowTemporaryEmpty: true,
      }),
    }));
  };

  const handleRestoreFieldRecommended = (fieldId: string) => {
    setStageBundles((prev) => {
      const bundle = prev[selectedStageId];
      const target = bundle.fields.find((item) => item.fieldId === fieldId);
      if (!target) return prev;
      return {
        ...prev,
        [selectedStageId]: updateSmartStageFieldValue(bundle, fieldId, target.recommendedValue),
      };
    });
    setStatusNoticeKo("선택한 입력칸을 검증된 추천 기본값으로 채웠습니다.");
  };

  const handleApplyStagePreset = (presetId: string) => {
    setStageBundles((prev) => ({
      ...prev,
      [selectedStageId]: applySmartStagePreset(prev[selectedStageId], presetId),
    }));
    setStatusNoticeKo(`${activeStageBundle.stageLabelKo} 단계 프리셋을 일괄 적용했습니다.`);
  };

  const handleAdjustEpisodeWorkHours = (episodeNumber: number, deltaHours: number) => {
    setEpisodes((prev) =>
      prev.map((ep) =>
        ep.episodeNumber === episodeNumber
          ? { ...ep, remainingWorkHours: Math.max(0, ep.remainingWorkHours + deltaHours) }
          : ep,
      ),
    );
    setStatusNoticeKo(
      `Ep.${episodeNumber} 잔여 작업 시간을 ${deltaHours > 0 ? `+${deltaHours}` : deltaHours}시간 조정해 도미노 영향을 재계산했습니다.`,
    );
  };

  const handleApplyReallocation = (proposal: ReallocationProposal) => {
    const updated = applyReallocationProposal(episodes, staffPool, proposal);
    setEpisodes(updated.episodes);
    setStaffPool(updated.staffPool);
    setStatusNoticeKo(
      `${proposal.staffNameKo} 유휴 ${proposal.allocatedHours}시간을 Ep.${proposal.targetEpisodeNumber}에 투입해 지연 ${proposal.recoveredDelayHours}시간을 회복했습니다.`,
    );
  };

  const handleResetConveyor = () => {
    setEpisodes(DEFAULT_STUDIO_CONVEYOR_EPISODES);
    setStaffPool(DEFAULT_STUDIO_STAFF_POOL);
    setStatusNoticeKo("3~4화차 기본 로테이션 컨베이어 상태로 복원했습니다.");
  };

  const handleUpdateCutCount = (
    entryId: string,
    grade: CutDifficultyGradeId,
    nextCount: number,
  ) => {
    const safeCount = Math.max(0, nextCount);
    setSettlementEntries((prev) =>
      prev.map((entry) => {
        if (entry.entryId !== entryId) return entry;
        return {
          ...entry,
          cuts: {
            ...entry.cuts,
            simple: grade === "simple" ? safeCount : entry.cuts.simple,
            standard: grade === "standard" ? safeCount : entry.cuts.standard,
            actionDetail: grade === "action-detail" ? safeCount : entry.cuts.actionDetail,
            crowdBg: grade === "crowd-bg" ? safeCount : entry.cuts.crowdBg,
          },
        };
      }),
    );
  };

  const handleToggleTaxMode = (entryId: string, nextMode: SettlementTaxMode) => {
    setSettlementEntries((prev) =>
      prev.map((entry) => (entry.entryId === entryId ? { ...entry, taxMode: nextMode } : entry)),
    );
    setStatusNoticeKo(
      nextMode === "freelancer-3.3"
        ? "정산 방식을 프리랜서 3.3% 원천징수로 전환했습니다."
        : "정산 방식을 사업자 세금계산서(부가세 10% 별도)로 전환했습니다.",
    );
  };

  const handleSelectPlatformQc = (platformId: PlatformQcTargetId) => {
    const spec = PLATFORM_QC_SPECS[platformId];
    setQcInput((prev) => ({
      ...prev,
      platformId,
      widthPx: spec.allowedWidthsPx[0] ?? prev.widthPx,
      maxSliceHeightPx: spec.maxSliceHeightPx,
      minFontSizePx: spec.minRecommendedFontPx,
      minVerticalGutterPx: spec.minVerticalGutterPx,
    }));
    setStatusNoticeKo(`${spec.labelKo} 기준으로 사전 QC 규격을 자동 전환했습니다.`);
  };

  const dominoBadgeTone =
    conveyorEval.domino.overallSeverity === "none"
      ? "good"
      : conveyorEval.domino.overallSeverity === "warning"
        ? "warn"
        : "bad";

  return (
    <section
      className="ts-pm-console"
      aria-label={studioTitleKo}
      data-testid="studio-large-pm-conveyor-console"
    >
      <header className="ts-pm-header">
        <div className="ts-pm-hero-id">
          <img
            src={SMART_DEFAULT_SPRITE_PATHS.production}
            alt=""
            aria-hidden="true"
            className="ts-pm-emblem"
            width={50}
            height={50}
          />
          <div>
            <h2 className="ts-pm-title">{studioTitleKo}</h2>
            <p className="ts-pm-subtitle">
              모든 입력칸에 의도 설명·빈칸 0% 스마트 기본값을 제공하고, 대형 스튜디오 3~4화차 로테이션·난이도 정산·플랫폼 사전 QC를 한 곳에서 관리합니다.
            </p>
          </div>
        </div>
        <div className="ts-pm-badge-row">
          <span
            className="ts-pm-pill"
            data-tone={zeroBlankAudit.isZeroBlankCompliant ? "good" : "warn"}
            data-testid="zero-blank-status-pill"
          >
            <CheckCircle2 size={14} aria-hidden="true" />
            빈칸 {zeroBlankAudit.blankCount}개 · {zeroBlankAudit.filledRatioPercent}% 채움
          </span>
          <span className="ts-pm-pill" data-tone={dominoBadgeTone}>
            로테이션 {conveyorEval.totalActiveEpisodes}화차 · 도미노 {conveyorEval.domino.alerts.length}건
          </span>
          <span
            className="ts-pm-pill"
            data-tone={
              qcReport.verdict === "ready-to-submit"
                ? "good"
                : qcReport.verdict === "needs-review"
                  ? "warn"
                  : "bad"
            }
          >
            QC {qcReport.verdictLabelKo}
          </span>
        </div>
      </header>

      <div className="ts-pm-tablist" role="tablist" aria-label="스마트 기본값 및 대형 스튜디오 PM 운영 탭">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "smart-defaults"}
          className="ts-pm-tab"
          onClick={() => setActiveTab("smart-defaults")}
        >
          <Sparkles size={15} aria-hidden="true" />
          빈칸 제로 스마트 기본값
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "conveyor"}
          className="ts-pm-tab"
          onClick={() => setActiveTab("conveyor")}
        >
          <Layers size={15} aria-hidden="true" />
          3~4화차 로테이션 컨베이어
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "settlement"}
          className="ts-pm-tab"
          onClick={() => setActiveTab("settlement")}
        >
          <Calculator size={15} aria-hidden="true" />
          난이도 가중치 정산 (3.3% / VAT)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "platform-qc"}
          className="ts-pm-tab"
          onClick={() => setActiveTab("platform-qc")}
        >
          <ClipboardCheck size={15} aria-hidden="true" />
          플랫폼 사전 QC · 심의
        </button>
      </div>

      {activeTab === "smart-defaults" ? (
        <div className="ts-pm-card" data-testid="smart-defaults-tab-panel">
          <div className="ts-pm-intent-bar">
            <div className="ts-pm-hero-id">
              <img
                src={SMART_DEFAULT_SPRITE_PATHS.aiCompass}
                alt=""
                aria-hidden="true"
                className="ts-pm-sprite-sm"
                width={24}
                height={24}
              />
              <div>
                <h3 className="ts-pm-card-title">내 의도 한 줄로 5단계 전체 기본값 자동 맞춤</h3>
                <p className="ts-pm-subtitle">
                  장르·분위기·플랫폼을 한 줄로 적으면 기획부터 출고까지 20개 항목을 빈칸 0%로 즉시 채웁니다.
                </p>
              </div>
            </div>
            <div className="ts-pm-intent-row">
              <input
                type="text"
                aria-label="창작 의도 한 줄 입력"
                className="ts-pm-input"
                value={intentInputText}
                onChange={(event) => setIntentInputText(event.target.value)}
              />
              <button
                type="button"
                className="ts-pm-btn"
                data-variant="primary"
                data-testid="adapt-intent-apply-btn"
                onClick={() => handleApplyIntentLine()}
              >
                <Wand2 size={15} aria-hidden="true" />
                전체 기본값 자동 맞춤
              </button>
            </div>
            <div className="ts-pm-badge-row">
              {SAMPLE_INTENT_PROMPTS.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  className="ts-pm-chip-btn"
                  onClick={() => handleApplyIntentLine(sample.text)}
                >
                  {sample.labelKo}
                </button>
              ))}
            </div>
          </div>

          <div className="ts-pm-badge-row" role="group" aria-label="창작 5단계 선택">
            {SMART_STAGE_ORDER.map((stageId) => (
              <button
                key={stageId}
                type="button"
                className="ts-pm-chip-btn"
                aria-pressed={selectedStageId === stageId}
                onClick={() => setSelectedStageId(stageId)}
              >
                {stageBundles[stageId].stageLabelKo}
              </button>
            ))}
          </div>

          <div className="ts-pm-card-head">
            <div>
              <h4 className="ts-pm-card-title">{activeStageBundle.stageLabelKo}</h4>
              <p className="ts-pm-subtitle">{activeStageBundle.stageGoalKo}</p>
            </div>
            <div className="ts-pm-badge-row">
              {activeStageBundle.stagePresets.map((preset) => (
                <button
                  key={preset.presetId}
                  type="button"
                  className="ts-pm-btn"
                  title={preset.summaryKo}
                  onClick={() => handleApplyStagePreset(preset.presetId)}
                >
                  {preset.labelKo}
                </button>
              ))}
            </div>
          </div>

          <div className="ts-pm-grid-2">
            {activeStageBundle.fields.map((field) => (
              <StudioSmartFieldGuide
                key={`${activeStageBundle.stageId}-${field.fieldId}`}
                field={field}
                onChange={(nextValue) => handleFieldChange(field.fieldId, nextValue)}
                onRestoreRecommended={() => handleRestoreFieldRecommended(field.fieldId)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {activeTab === "conveyor" ? (
        <PmConveyorRotationTabView
          evaluation={conveyorEval}
          onAdjustEpisodeWorkHours={handleAdjustEpisodeWorkHours}
          onApplyReallocation={handleApplyReallocation}
          onResetConveyor={handleResetConveyor}
        />
      ) : null}

      {activeTab === "settlement" ? (
        <PmWeightedSettlementTabView
          entries={settlementEntries}
          report={settlementReport}
          onUpdateCutCount={handleUpdateCutCount}
          onToggleTaxMode={handleToggleTaxMode}
        />
      ) : null}

      {activeTab === "platform-qc" ? (
        <PmPlatformQcTabView
          input={qcInput}
          report={qcReport}
          onChangeInput={(patch) => setQcInput((prev) => ({ ...prev, ...patch }))}
          onSelectPlatform={handleSelectPlatformQc}
        />
      ) : null}

      {statusNoticeKo ? (
        <p role="status" className="ts-pm-notice" data-testid="pm-console-status-notice">
          {statusNoticeKo}
        </p>
      ) : null}
    </section>
  );
}

export default StudioLargePmConveyorConsole;
