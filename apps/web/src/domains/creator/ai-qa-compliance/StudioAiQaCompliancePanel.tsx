import "./ai-qa-compliance.css";

import {
  Compass,
  Globe2,
  Mic,
  Paintbrush2,
  ShieldAlert,
  ShieldCheck,
  SpellCheck,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  ContinuityTabView,
  GrammarRegisterTabView,
  RegionalComplianceTabView,
} from "./AiQaContinuityTabs";
import {
  CommercialRightsGateTabView,
  MultilingualBalloonTabView,
  PixelHunterTabView,
  VoicePinWipeTabView,
} from "./AiQaPixelLicenseVoiceTabs";
import {
  SAMPLE_COMPLIANCE_CUTS,
  SAMPLE_CONTINUITY_CUTS,
  SAMPLE_DIALOGUE_BALLOONS,
  SAMPLE_SPEECH_CONTRACTS,
  applyComplianceRemediationPatch,
  auditEyeLineAndPropContinuity,
  auditKoreanGrammarAndSpeechRegister,
  scanRegionalComplianceAndBrands,
  type AgeRatingTier,
  type ComplianceRegion,
} from "./webtoon-ai-qa-continuity-engine";
import {
  SAMPLE_EPISODE_ASSET_USAGES,
  SAMPLE_MULTILINGUAL_BALLOONS,
  auditMultilingualBalloonOverflow,
  createSampleWebtoonPixelGrid,
  parseVoiceQaFeedbackToPin,
  replaceBlockedAssetWithSafeAlternative,
  scanPixelArtifactsAndCleanup,
  transitionVoicePinApproval,
  verifyCommercialRightsGate,
  type EpisodeAssetUsage,
  type PixelQaGridInput,
  type SupportedQaLocale,
  type VoiceQaFeedbackPinTicket,
} from "./webtoon-pixel-license-voice-qa-engine";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

type AiQaTabId =
  | "compliance"
  | "grammar"
  | "continuity"
  | "pixel"
  | "multilingual"
  | "rights"
  | "voice";

export interface StudioAiQaCompliancePanelProps {
  readonly episodeLabel?: string;
}

/**
 * 7대 웹툰 AI 자동 검수(QA) 및 글로벌 심의·라이선스 컴플라이언스 관제판
 * (100% 무과금 ₩0 · 결정론적 로컬 엔진)
 */
export function StudioAiQaCompliancePanel({
  episodeLabel = "EP.01 멈춘 시계탑",
}: StudioAiQaCompliancePanelProps = {}) {
  const bt = useBilingual("StudioAiQaCompliancePanel");
  const [activeTab, setActiveTab] = useState<AiQaTabId>("compliance");
  const [statusMessage, setStatusMessage] = useState<string>("");

  // 1) 국가별 심의 & 상표권 로고 스캐너 상태
  const [region, setRegion] = useState<ComplianceRegion>("KR");
  const [rating, setRating] = useState<AgeRatingTier>("12+");
  const [appliedRemediationIds, setAppliedRemediationIds] = useState<readonly string[]>([]);

  const complianceReport = useMemo(
    () => scanRegionalComplianceAndBrands({ region, targetRating: rating, cuts: SAMPLE_COMPLIANCE_CUTS }),
    [region, rating],
  );
  const compliancePatch = useMemo(
    () => applyComplianceRemediationPatch(complianceReport, appliedRemediationIds),
    [complianceReport, appliedRemediationIds],
  );

  // 2) 한국어 맞춤법 + 캐릭터 말투 일관성
  const [appliedBalloonIds, setAppliedBalloonIds] = useState<readonly string[]>([]);
  const grammarReport = useMemo(
    () => auditKoreanGrammarAndSpeechRegister(SAMPLE_SPEECH_CONTRACTS, SAMPLE_DIALOGUE_BALLOONS),
    [],
  );

  // 3) 180도 시선 법칙 & 소품 좌우 연속성
  const continuityReport = useMemo(() => auditEyeLineAndPropContinuity(SAMPLE_CONTINUITY_CUTS), []);

  // 4) 픽셀 빈틈·넘침·잔여물 헌터
  const [pixelGrid, setPixelGrid] = useState<PixelQaGridInput>(() => createSampleWebtoonPixelGrid());
  const [pixelCleaned, setPixelCleaned] = useState(false);
  const pixelReport = useMemo(() => scanPixelArtifactsAndCleanup(pixelGrid), [pixelGrid]);

  // 5) 7개국어 번역 말풍선 교정
  const [selectedLocale, setSelectedLocale] = useState<SupportedQaLocale | "all">("all");
  const multilingualReport = useMemo(
    () => auditMultilingualBalloonOverflow(SAMPLE_MULTILINGUAL_BALLOONS),
    [],
  );

  // 6) 상업 라이선스 차단 게이트 (Fail-Closed)
  const [assetUsages, setAssetUsages] = useState<readonly EpisodeAssetUsage[]>(SAMPLE_EPISODE_ASSET_USAGES);
  const rightsReport = useMemo(
    () =>
      verifyCommercialRightsGate({
        episodeId: episodeLabel,
        checkDateIso: "2026-11-22",
        usedAssets: assetUsages,
      }),
    [episodeLabel, assetUsages],
  );

  // 7) PD/AD 음성 피드백 컷 핀 + 와이프 승인
  const [transcriptInput, setTranscriptInput] = useState("14컷 주인공 눈빛 더 날카롭게");
  const [voiceTickets, setVoiceTickets] = useState<readonly VoiceQaFeedbackPinTicket[]>(() => [
    parseVoiceQaFeedbackToPin({
      transcript: "14컷 주인공 눈빛 더 날카롭게",
      speakerRole: "PD",
      ticketSeq: 1,
    }),
  ]);
  const [activeTicketId, setActiveTicketId] = useState<string>("vpin-c14-1");

  const handleToggleRemediation = (findingId: string) => {
    setAppliedRemediationIds((prev) =>
      prev.includes(findingId) ? prev.filter((id) => id !== findingId) : [...prev, findingId],
    );
    setStatusMessage("심의 가림·상표 대체 레이어 상태를 갱신했습니다.");
  };

  const handleApplyAllRemediations = () => {
    const allIds = complianceReport.findings.map((item) => item.id);
    setAppliedRemediationIds(allIds);
    setStatusMessage(`심의·상표 탐지 ${allIds.length}건에 모자이크/대체 레이어를 일괄 적용했습니다.`);
  };

  const handleApplyAllGrammarFixes = () => {
    setAppliedBalloonIds(SAMPLE_DIALOGUE_BALLOONS.map((b) => b.balloonId));
    setStatusMessage("맞춤법·말투 교정안을 모든 말풍선에 반영했습니다.");
  };

  const handleRunPixelCleanup = () => {
    setPixelGrid((prev) => ({ ...prev, colorRgba: pixelReport.cleanedRgba }));
    setPixelCleaned(true);
    setStatusMessage(`픽셀 결함 ${pixelReport.artifacts.length}건(${pixelReport.totalAffectedPixels}px)을 일괄 클린업했습니다.`);
  };

  const handleResetPixelSample = () => {
    setPixelGrid(createSampleWebtoonPixelGrid());
    setPixelCleaned(false);
    setStatusMessage("샘플 원고 픽셀 격자를 초기 상태로 복원했습니다.");
  };

  const handleSwapAsset = (assetId: string, alternativeId: string) => {
    setAssetUsages((prev) => replaceBlockedAssetWithSafeAlternative(prev, assetId, alternativeId));
    setStatusMessage("차단된 에셋을 검증된 상업 무료(CC0/OFL) 대체 소재로 교체했습니다.");
  };

  const handleSwapAllSafeAssets = () => {
    setAssetUsages((prev) => {
      let next = prev;
      for (const violation of rightsReport.violations) {
        const firstAlt = violation.recommendedAlternatives[0];
        if (firstAlt) {
          next = replaceBlockedAssetWithSafeAlternative(next, violation.assetId, firstAlt.alternativeId);
        }
      }
      return next;
    });
    setStatusMessage("모든 차단 에셋을 검증된 CC0/상업 무료 소재로 교체해 출판 게이트를 통과했습니다.");
  };

  const handleCreateVoicePin = (transcript: string, role: "PD" | "AD" = "PD") => {
    const trimmed = transcript.trim();
    if (!trimmed) return;
    const nextTicket = parseVoiceQaFeedbackToPin({
      transcript: trimmed,
      speakerRole: role,
      ticketSeq: voiceTickets.length + 1,
    });
    setVoiceTickets((prev) => [nextTicket, ...prev]);
    setActiveTicketId(nextTicket.ticketId);
    setStatusMessage(`${nextTicket.cutNumber}컷 (${nextTicket.regionLabelKo}) 자동 핀 티켓을 생성했습니다.`);
  };

  const handleUpdateTicket = (ticketId: string, updater: (ticket: VoiceQaFeedbackPinTicket) => VoiceQaFeedbackPinTicket) => {
    setVoiceTickets((prev) => prev.map((item) => (item.ticketId === ticketId ? updater(item) : item)));
  };

  const approvedTicketCount = voiceTickets.filter((t) => t.status === "approved").length;

  return (
    <div className="qa-shell" data-testid="studio-ai-qa-compliance-panel">
      <header className="qa-header">
        <div>
          <span className="qa-eyebrow">
            <ShieldCheck size={14} aria-hidden />
            {bt("100% 로컬 무과금(₩0) 자동 검수 관제판", "100% Local Zero-Fee Automated QA Suite")}
          </span>
          <h2 className="qa-title">
            {bt("7대 웹툰 AI 자동 검수 · 글로벌 심의 · 라이선스 게이트", "7-Suite Webtoon AI QA & Global Compliance Gate")}
          </h2>
          <p className="qa-subtitle">
            {episodeLabel} · KR/JP/SEA/US 심의, 맞춤법·말투, 180도 시선·소품, 픽셀 헌터, 7개국어 말풍선, 상업 라이선스, 음성 핀 승인을 한 곳에서 점검합니다.
          </p>
        </div>
      </header>

      <div className="qa-kpi-grid">
        <div className="qa-kpi-card">
          <div className="qa-kpi-label">{bt("글로벌 심의·상표", "Regional Compliance")}</div>
          <div
            className="qa-kpi-value"
            data-tone={compliancePatch.updatedVerdict === "BLOCKED" ? "bad" : compliancePatch.updatedVerdict === "REVIEW" ? "warn" : "good"}
          >
            {compliancePatch.updatedVerdict} ({region} {rating})
          </div>
        </div>
        <div className="qa-kpi-card">
          <div className="qa-kpi-label">{bt("맞춤법·말투 / 연속성", "Grammar / Continuity")}</div>
          <div className="qa-kpi-value" data-tone={continuityReport.verdict === "BLOCKED" ? "warn" : "good"}>
            {grammarReport.consistencyScore}점 / {continuityReport.continuityScore}점
          </div>
        </div>
        <div className="qa-kpi-card">
          <div className="qa-kpi-label">{bt("픽셀 헌터 · 7개국어", "Pixels · 7-Lang")}</div>
          <div className="qa-kpi-value" data-tone={pixelReport.artifacts.length === 0 ? "good" : "warn"}>
            결함 {pixelReport.artifacts.length}건 · 자동교정 {multilingualReport.autoFixedCount}건
          </div>
        </div>
        <div className="qa-kpi-card">
          <div className="qa-kpi-label">{bt("상업 라이선스 · 음성 핀", "Rights Gate · Voice")}</div>
          <div className="qa-kpi-value" data-tone={rightsReport.canPublish ? "good" : "bad"}>
            {rightsReport.verdict} · 승인 {approvedTicketCount}/{voiceTickets.length}
          </div>
        </div>
      </div>

      <div role="tablist" aria-label={bt("7대 웹툰 AI 자동 검수 모듈", "7 QA Compliance Modules")} className="qa-tablist">
        <button type="button" role="tab" className="qa-tab" aria-selected={activeTab === "compliance"} data-testid="qa-tab-compliance" onClick={() => setActiveTab("compliance")}>
          <ShieldAlert size={15} aria-hidden /> 심의·상표
        </button>
        <button type="button" role="tab" className="qa-tab" aria-selected={activeTab === "grammar"} data-testid="qa-tab-grammar" onClick={() => setActiveTab("grammar")}>
          <SpellCheck size={15} aria-hidden /> 맞춤법·말투
        </button>
        <button type="button" role="tab" className="qa-tab" aria-selected={activeTab === "continuity"} data-testid="qa-tab-continuity" onClick={() => setActiveTab("continuity")}>
          <Compass size={15} aria-hidden /> 시선·소품
        </button>
        <button type="button" role="tab" className="qa-tab" aria-selected={activeTab === "pixel"} data-testid="qa-tab-pixel" onClick={() => setActiveTab("pixel")}>
          <Paintbrush2 size={15} aria-hidden /> 픽셀 헌터
        </button>
        <button type="button" role="tab" className="qa-tab" aria-selected={activeTab === "multilingual"} data-testid="qa-tab-multilingual" onClick={() => setActiveTab("multilingual")}>
          <Globe2 size={15} aria-hidden /> 7개국어
        </button>
        <button type="button" role="tab" className="qa-tab" aria-selected={activeTab === "rights"} data-testid="qa-tab-rights" onClick={() => setActiveTab("rights")}>
          <ShieldCheck size={15} aria-hidden /> 라이선스
        </button>
        <button type="button" role="tab" className="qa-tab" aria-selected={activeTab === "voice"} data-testid="qa-tab-voice" onClick={() => setActiveTab("voice")}>
          <Mic size={15} aria-hidden /> 음성 핀
        </button>
      </div>

      {statusMessage ? (
        <div role="status" aria-live="polite" className="qa-status-banner" data-testid="qa-status-banner">
          {statusMessage}
        </div>
      ) : null}

      <div role="tabpanel">
        {activeTab === "compliance" ? (
          <RegionalComplianceTabView
            region={region}
            rating={rating}
            report={complianceReport}
            patchResult={compliancePatch}
            appliedIds={appliedRemediationIds}
            onSelectRegion={(next) => {
              setRegion(next);
              setAppliedRemediationIds([]);
            }}
            onSelectRating={(next) => {
              setRating(next);
              setAppliedRemediationIds([]);
            }}
            onToggleRemediation={handleToggleRemediation}
            onApplyAllRemediations={handleApplyAllRemediations}
          />
        ) : activeTab === "grammar" ? (
          <GrammarRegisterTabView
            contracts={SAMPLE_SPEECH_CONTRACTS}
            balloons={SAMPLE_DIALOGUE_BALLOONS}
            report={grammarReport}
            appliedBalloonIds={appliedBalloonIds}
            onApplyAllFixes={handleApplyAllGrammarFixes}
          />
        ) : activeTab === "continuity" ? (
          <ContinuityTabView report={continuityReport} />
        ) : activeTab === "pixel" ? (
          <PixelHunterTabView
            grid={pixelGrid}
            report={pixelReport}
            isCleaned={pixelCleaned}
            onRunCleanup={handleRunPixelCleanup}
            onResetSample={handleResetPixelSample}
          />
        ) : activeTab === "multilingual" ? (
          <MultilingualBalloonTabView
            selectedLocale={selectedLocale}
            report={multilingualReport}
            onSelectLocale={setSelectedLocale}
          />
        ) : activeTab === "rights" ? (
          <CommercialRightsGateTabView
            report={rightsReport}
            onSwapAsset={handleSwapAsset}
            onSwapAllSafe={handleSwapAllSafeAssets}
          />
        ) : (
          <VoicePinWipeTabView
            transcriptInput={transcriptInput}
            tickets={voiceTickets}
            activeTicketId={activeTicketId}
            onChangeTranscript={setTranscriptInput}
            onCreatePinFromTranscript={handleCreateVoicePin}
            onSelectTicket={setActiveTicketId}
            onChangeWipe={(ticketId, pct) =>
              handleUpdateTicket(ticketId, (t) => transitionVoicePinApproval(t, { type: "set-wipe", wipePositionPct: pct }))
            }
            onSubmitFix={(ticketId) => {
              handleUpdateTicket(ticketId, (t) =>
                transitionVoicePinApproval(t, {
                  type: "submit-fix",
                  afterSummaryKo: `${t.cutNumber}컷 ${t.regionLabelKo} 수정본 반영 완료`,
                }),
              );
              setStatusMessage("수정본을 제출했습니다. 와이프 슬라이더로 비교 후 승인하세요.");
            }}
            onApproveTicket={(ticketId) => {
              handleUpdateTicket(ticketId, (t) =>
                transitionVoicePinApproval(t, { type: "approve", reviewerName: "담당 PD" }),
              );
              setStatusMessage("Before/After 와이프 비교 확인 후 최종 승인했습니다.");
            }}
            onRequestRevision={(ticketId) => {
              handleUpdateTicket(ticketId, (t) =>
                transitionVoicePinApproval(t, {
                  type: "request-revision",
                  reviewerName: "담당 PD",
                  noteKo: "선화 강약 대비를 조금 더 보강해 주세요.",
                }),
              );
              setStatusMessage("재수정 요청을 티켓 이력에 기록했습니다.");
            }}
          />
        )}
      </div>
    </div>
  );
}
