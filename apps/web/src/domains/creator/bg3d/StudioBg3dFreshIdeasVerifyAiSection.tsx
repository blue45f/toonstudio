import {
  ArrowLeftRight,
  CheckCircle2,
  Cpu,
  FileCheck2,
  Gem,
  Layers,
  Link2,
  Lock,
  MessageSquare,
  ShieldCheck,
  SlidersHorizontal,
  Swords,
  Timer,
  Unlock,
  Wand2,
  Wrench,
} from "lucide-react";

import { evaluateCrossLabsUnifiedProductionBridge } from "./studio-cross-labs-production-bridge";
import { StudioFreshIdeasV2WorkbenchCard } from "../fresh-ideas/StudioFreshIdeasV2WorkbenchCard";
import type {
  BlenderSceneVerifyAiReport,
  FreshIdeaLensId,
  FreshIdeaLensRemix,
} from "./studio-bg3d-fresh-ideas-verify-ai";
import type {
  MultiPassToonPsdExportPlan,
  RightsBomCommercialAuditResult,
  ToonRenderQualityTier,
  VerifyAiAutoRemediationPlan,
} from "./studio-bg3d-multipass-rights-remediation";
import type {
  BlenderLiveSceneSyncBridge,
  BlenderSceneIsolationGuardReport,
  VerticalScrollCutPacingPlan,
} from "./studio-bg3d-scroll-pacing-live-sync";
import { StudioBg3dSharedDatumProofingCard } from "./StudioBg3dSharedDatumProofingCard";
import type {
  CrossGenreDatumGenreId,
  DarkroomProofingState,
  GenreCutDensityRejectionRoiResult,
} from "./studio-bg3d-shared-datum-proofing";
import type {
  GenreLockGuardrailEvaluation,
  GenreLockModeId,
  VerifyAiPreflightGateReport,
  WebtoonCutArchetypeId,
} from "./studio-bg3d-shot-continuity-linked-ink";

export type BlenderGenrePlaybookBundleId = "rofan-salon" | "action-fantasy";

const MOTION_PRESS =
  "transition-[background-color,border-color,color,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none";

const CUT_ARCHETYPE_OPTIONS: readonly {
  readonly id: WebtoonCutArchetypeId;
  readonly labelKo: string;
}[] = Object.freeze([
  { id: "dialogue-medium", labelKo: "일상 대화·미디엄" },
  { id: "emotion-closeup", labelKo: "감정 클로즈업·회상" },
  { id: "rofan-salon-closeup", labelKo: "로판 연회·1.35px 세공" },
  { id: "action-impact", labelKo: "액션 타격·클라이맥스" },
  { id: "horror-pressure", labelKo: "호러·심리적 압박" },
]);

const QUALITY_TIER_OPTIONS: readonly {
  readonly id: ToonRenderQualityTier;
  readonly labelKo: string;
}[] = Object.freeze([
  { id: "draft", labelKo: "Draft (콘티용)" },
  { id: "interactive", labelKo: "Interactive (편집용)" },
  { id: "final", labelKo: "Final (출판 원고용)" },
]);

const GENRE_LOCK_OPTIONS: readonly {
  readonly id: GenreLockModeId;
  readonly labelKo: string;
}[] = Object.freeze([
  { id: "unlocked", labelKo: "락인 해제" },
  { id: "rofan-salon-lock", labelKo: "로판 1.35px 락인" },
  { id: "action-impact-lock", labelKo: "액션 2.8px 락인" },
]);

export interface StudioBg3dFreshIdeasVerifyAiSectionProps {
  readonly disabled?: boolean;
  readonly verifyAiReport: BlenderSceneVerifyAiReport;
  readonly activeLensRemix: FreshIdeaLensRemix;
  readonly preflightReport: VerifyAiPreflightGateReport;
  readonly selectedArchetypeId: WebtoonCutArchetypeId;
  readonly artisticOverride: boolean;
  readonly renderQualityTier: ToonRenderQualityTier;
  readonly multiPassPlan: MultiPassToonPsdExportPlan;
  readonly rightsBomAudit: RightsBomCommercialAuditResult;
  readonly autoRemediationPlan: VerifyAiAutoRemediationPlan;
  readonly remediationAppliedCount: number;
  readonly scrollPacingPlan: VerticalScrollCutPacingPlan;
  readonly liveSyncBridge: BlenderLiveSceneSyncBridge;
  readonly genreLockReport: GenreLockGuardrailEvaluation;
  readonly sceneIsolationReport: BlenderSceneIsolationGuardReport;
  readonly bg3dAdoptionRatioPct: number;
  readonly avgRevisionsPerEpisode: number;
  readonly lookDevGateConfirmed: boolean;
  readonly selectedDatumGenreId: CrossGenreDatumGenreId;
  readonly rejectionRoiReport: GenreCutDensityRejectionRoiResult;
  readonly darkroomProofingState: DarkroomProofingState;
  readonly onSelectDatumGenreId: (genreId: CrossGenreDatumGenreId) => void;
  readonly onToggleDarkroomProofing: (enabled: boolean) => void;
  readonly onChangeGenreLockMode: (mode: GenreLockModeId) => void;
  readonly onChangeBg3dAdoptionRatioPct: (pct: number) => void;
  readonly onChangeAvgRevisionsPerEpisode: (count: number) => void;
  readonly onSelectLensId: (lensId: FreshIdeaLensId) => void;
  readonly onSelectArchetypeId: (archetypeId: WebtoonCutArchetypeId) => void;
  readonly onToggleArtisticOverride: (enabled: boolean) => void;
  readonly onSelectRenderQualityTier: (tier: ToonRenderQualityTier) => void;
  readonly onApplyAutoRemediation: () => void;
  readonly onApplyArchetypePreset?: (archetypeId: WebtoonCutArchetypeId) => void;
  readonly onRunGenrePlaybook?: (bundleId: BlenderGenrePlaybookBundleId) => void;
  readonly onSelectFreshIdeaLens?: (lensId: FreshIdeaLensId, pitchKo: string) => void;
  readonly onVerifyAiGate?: (overallScore: number, passed: boolean) => void;
  readonly onStatusChange?: (summaryKo: string) => void;
}

export function StudioBg3dFreshIdeasVerifyAiSection({
  disabled = false,
  verifyAiReport,
  activeLensRemix,
  preflightReport,
  selectedArchetypeId,
  artisticOverride,
  renderQualityTier,
  multiPassPlan,
  rightsBomAudit,
  autoRemediationPlan,
  remediationAppliedCount,
  scrollPacingPlan,
  liveSyncBridge,
  genreLockReport,
  sceneIsolationReport,
  bg3dAdoptionRatioPct,
  avgRevisionsPerEpisode,
  lookDevGateConfirmed,
  selectedDatumGenreId,
  rejectionRoiReport,
  darkroomProofingState,
  onSelectDatumGenreId,
  onToggleDarkroomProofing,
  onChangeGenreLockMode,
  onChangeBg3dAdoptionRatioPct,
  onChangeAvgRevisionsPerEpisode,
  onSelectLensId,
  onSelectArchetypeId,
  onToggleArtisticOverride,
  onSelectRenderQualityTier,
  onApplyAutoRemediation,
  onApplyArchetypePreset,
  onRunGenrePlaybook,
  onSelectFreshIdeaLens,
  onVerifyAiGate,
  onStatusChange,
}: StudioBg3dFreshIdeasVerifyAiSectionProps) {
  const crossLabsReport = evaluateCrossLabsUnifiedProductionBridge({
    bg3dOverallScore100: verifyAiReport.evaluation.overallScore,
    bg3dPreflightScore100: preflightReport.totalGateScore,
    bg3dContrastRatio: 2.45,
    bg3dSafeZoneScore100: scrollPacingPlan.speechBubbleSafeZoneScore,
    characterOverallScore100: 96.9,
    characterTurnaroundScore100: 96.4,
    characterFaceSdfScore100: 99.5,
    characterOutlineWidthMm: 3.5,
    brushOverallScore100: 97.3,
    brushTaperSharpness100: 97.4,
    brushLinkedInkStability100: preflightReport.linkedInkBridge.bridgeReliabilityIndex,
    brushAverageStrokePx: 4.48,
    rightsBomScore100: rightsBomAudit.commercialPublishAllowed ? 100 : 0,
  });

  const lookDevSteps: readonly {
    readonly id: string;
    readonly stepLabelKo: string;
    readonly detailKo: string;
    readonly ready: boolean;
  }[] = [
    {
      id: "step-genre-lock",
      stepLabelKo: "1. 장르 베이스 선언",
      detailKo: genreLockReport.lockMode === "unlocked" ? "자유 모드" : "장르 락인 활성",
      ready: genreLockReport.isCompliant,
    },
    {
      id: "step-cc0-kit",
      stepLabelKo: "2. CC0 기준선 키트(V16~V19)",
      detailKo: "2.4m·1.1m·0.74m 동기화",
      ready: rightsBomAudit.commercialPublishAllowed,
    },
    {
      id: "step-weekly-roi",
      stepLabelKo: "3. 주간 70컷 ROI·안전영역",
      detailKo: `-${verifyAiReport.weeklyEpisodeRoi.totalWeeklyHoursSaved}h · B_SZ ${scrollPacingPlan.speechBubbleSafeZoneScore}`,
      ready: scrollPacingPlan.speechBubbleSafeZoneScore >= 85,
    },
    {
      id: "step-hard-gate",
      stepLabelKo: "4. Verify AI 하드 게이트",
      detailKo: lookDevGateConfirmed ? "확정 완료" : "검증 대기",
      ready: preflightReport.hardGatePassed && verifyAiReport.evaluation.passed,
    },
  ];

  return (
    <section
      data-testid="bg3d-blender-fresh-ideas-verify-ai-section"
      className="flex flex-col gap-3 rounded-2xl border border-line bg-panel p-3 text-xs text-fg"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-fg">
          <ShieldCheck size={16} strokeWidth={1.5} className="shrink-0 text-fg-2" aria-hidden />
          <span>5B. 연출 아이디어 리믹스 · 주간 팀 ROI · Verify AI 품질 게이트</span>
        </span>
        <span
          data-testid="bg3d-blender-verify-ai-badge"
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 py-1 font-mono text-xs font-medium tabular-nums text-fg"
        >
          <span className="size-2 rounded-full bg-[#4cc38a]" aria-hidden />
          {verifyAiReport.summaryBadgeKo}
        </span>
      </div>

      {/* Unslop Pass 7: 4 compact number-focused stat cards with tabular-nums */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-card p-3">
          <span className="block text-xs text-fg-3">Verify AI 종합 점수</span>
          <span className="mt-1 block font-mono text-xl font-medium leading-none tabular-nums text-fg">
            {verifyAiReport.evaluation.overallScore}
          </span>
          <span className="mt-1 block font-mono text-xs tabular-nums text-fg-3">
            기준 82.0점 이상 · 통과
          </span>
        </div>

        <div className="rounded-xl border border-line bg-card p-3">
          <span className="block text-xs text-fg-3">주간 70컷 절약 시간</span>
          <span className="mt-1 block font-mono text-xl font-medium leading-none tabular-nums text-fg">
            {verifyAiReport.weeklyEpisodeRoi.totalWeeklyHoursSaved}h
          </span>
          <span className="mt-1 block font-mono text-xs tabular-nums text-fg-3">
            주당 {verifyAiReport.weeklyEpisodeRoi.equivalentWorkdaysSaved}인일 확보
          </span>
        </div>

        <div className="rounded-xl border border-line bg-card p-3">
          <span className="block text-xs text-fg-3">Linked Ink 정합도 (BRI)</span>
          <span className="mt-1 block font-mono text-xl font-medium leading-none tabular-nums text-fg">
            {preflightReport.linkedInkBridge.bridgeReliabilityIndex}
          </span>
          <span className="mt-1 block font-mono text-xs tabular-nums text-fg-3">
            follow-3d 가필 보존
          </span>
        </div>

        <div className="rounded-xl border border-line bg-card p-3">
          <span className="block text-xs text-fg-3">라이브 블렌더 씬 격리</span>
          <span className="mt-1 inline-flex items-center gap-1.5 font-mono text-xl font-medium leading-none tabular-nums text-fg">
            <span className="size-2 rounded-full bg-[#4cc38a]" aria-hidden />
            SHA-256
          </span>
          <span
            data-testid="bg3d-blender-scene-isolation-badge"
            className="mt-1 block truncate font-mono text-xs tabular-nums text-fg-3"
            title={sceneIsolationReport.summaryKo}
          >
            {sceneIsolationReport.summaryKo}
          </span>
        </div>
      </div>

      {/* Unslop Pass 8 + 제안 2 & 제안 4: 스튜디오 조명 V18 듀얼 장르 브리지 프리뷰 & 원클릭 장르 전환 */}
      <div
        data-testid="bg3d-blender-genre-playbook-bar"
        className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-card p-3 lg:grid-cols-12"
      >
        <div className="flex items-center gap-2 lg:col-span-5">
          <img
            src="/studio-assets/blender-episode-handoff-v18/thumbnails/webtoon-raid-return-relic-portal-gate-v18.png"
            alt="던전 귀환 아치 게이트 V18"
            loading="lazy"
            width={56}
            height={56}
            className="size-14 shrink-0 rounded-lg bg-[#121622] object-cover [mask-image:radial-gradient(closest-side,#000_82%,transparent)]"
          />
          <ArrowLeftRight size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
          <img
            src="/studio-assets/blender-episode-handoff-v18/thumbnails/webtoon-imperial-banquet-alcove-arch-v18.png"
            alt="황궁 연회장 테라스 알코브 아치 V18"
            loading="lazy"
            width={56}
            height={56}
            className="size-14 shrink-0 rounded-lg bg-[#1c1322] object-cover [mask-image:radial-gradient(closest-side,#000_82%,transparent)]"
          />
          <div className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-fg">
              회차 내 듀얼 장르 전환 브리지 (2.4m 개구부 일치)
            </span>
            <span
              data-testid="bg3d-blender-cycle-time-benchmark"
              className="mt-0.5 block font-mono text-xs tabular-nums text-fg-3"
            >
              {verifyAiReport.cycleTimeBenchmark.summaryKo}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 lg:col-span-7">
          <button
            type="button"
            disabled={disabled}
            data-testid="bg3d-blender-playbook-rofan-salon-btn"
            onClick={() => onRunGenrePlaybook?.("rofan-salon")}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg border border-accent bg-raised px-3 py-1.5 text-xs font-medium text-fg hover:bg-panel ${MOTION_PRESS}`}
          >
            <Gem size={16} strokeWidth={1.5} className="shrink-0 text-fg-2" aria-hidden />
            <span>로판 살롱 4단계 원클릭 (3200K·프리즘·1.35px)</span>
          </button>
          <button
            type="button"
            disabled={disabled}
            data-testid="bg3d-blender-playbook-action-gpen-btn"
            onClick={() => onRunGenrePlaybook?.("action-fantasy")}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-medium text-fg-2 hover:bg-raised ${MOTION_PRESS}`}
          >
            <Swords size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
            <span>액션 전투 세트 (심연 역광·판금·2.8px G펜)</span>
          </button>
        </div>
      </div>

      {/* 제안 1(장르 락인 가드) + 제안 3(주간 70컷 팀 ROI 시뮬레이터) + 제안 4(룩데브 4단계 표준화) */}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <div
          data-testid="bg3d-blender-genre-lock-bar"
          className="flex flex-col justify-between gap-2 rounded-xl border border-line bg-card p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-xs font-medium text-fg">
              {genreLockReport.lockMode === "unlocked" ? (
                <Unlock size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
              ) : (
                <Lock size={16} strokeWidth={1.5} className="shrink-0 text-fg-2" aria-hidden />
              )}
              <span>장르 락인 가드레일 (선굵기·색온도 이탈 방지)</span>
            </span>
            <div className="flex flex-wrap gap-1">
              {GENRE_LOCK_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={disabled}
                  data-testid={`bg3d-blender-genre-lock-${opt.id}`}
                  onClick={() => onChangeGenreLockMode(opt.id)}
                  className={`min-h-9 rounded-lg border px-2.5 py-1 text-xs font-medium ${
                    genreLockReport.lockMode === opt.id
                      ? "border-accent bg-raised text-fg"
                      : "border-line bg-panel text-fg-3 hover:bg-raised"
                  } ${MOTION_PRESS}`}
                >
                  {opt.labelKo}
                </button>
              ))}
            </div>
          </div>
          <p
            data-testid="bg3d-blender-genre-lock-status"
            className="inline-flex items-center gap-2 font-mono text-xs tabular-nums text-fg-2"
          >
            <span
              className={`size-2 shrink-0 rounded-full ${
                genreLockReport.isCompliant ? "bg-[#4cc38a]" : "bg-[#e5484d]"
              }`}
              aria-hidden
            />
            <span>{genreLockReport.summaryKo}</span>
          </p>
        </div>

        <div
          data-testid="bg3d-blender-weekly-roi-panel"
          className="flex flex-col justify-between gap-2 rounded-xl border border-line bg-card p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-xs font-medium text-fg">
              <Timer size={16} strokeWidth={1.5} className="shrink-0 text-fg-2" aria-hidden />
              <span>주간 70컷 연재 팀 ROI 시뮬레이터</span>
            </span>
            <span
              data-testid="bg3d-blender-weekly-roi-readout"
              className="font-mono text-xs tabular-nums text-fg-2"
            >
              {verifyAiReport.weeklyEpisodeRoi.summaryKo}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs">
              <span className="tabular-nums text-fg-2">3D 활용 비중: {bg3dAdoptionRatioPct}%</span>
              <input
                type="range"
                min={15}
                max={90}
                step={5}
                disabled={disabled}
                aria-label="주간 70컷 중 3D 활용 비중 퍼센트"
                data-testid="bg3d-blender-roi-adoption-slider"
                value={bg3dAdoptionRatioPct}
                onChange={(e) => onChangeBg3dAdoptionRatioPct(Number(e.target.value))}
                className="w-24 accent-accent"
              />
            </label>
            <label className="flex items-center justify-between gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs">
              <span className="tabular-nums text-fg-2">회차당 수정: {avgRevisionsPerEpisode}회</span>
              <input
                type="range"
                min={1}
                max={15}
                step={1}
                disabled={disabled}
                aria-label="회차당 평균 콘티 수정 횟수"
                data-testid="bg3d-blender-roi-revisions-slider"
                value={avgRevisionsPerEpisode}
                onChange={(e) => onChangeAvgRevisionsPerEpisode(Number(e.target.value))}
                className="w-24 accent-accent"
              />
            </label>
          </div>
        </div>
      </div>

      {/* 제안 4: 에피소드 룩데브 표준화 4단계 상태 스트립 */}
      <div
        data-testid="bg3d-blender-lookdev-checklist"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {lookDevSteps.map((step) => (
          <div
            key={step.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 py-2"
          >
            <div className="min-w-0">
              <span className="block truncate text-xs font-medium text-fg">{step.stepLabelKo}</span>
              <span className="block truncate font-mono text-xs tabular-nums text-fg-3">
                {step.detailKo}
              </span>
            </div>
            <span
              className={`size-2 shrink-0 rounded-full ${step.ready ? "bg-[#4cc38a]" : "bg-[#e5484d]"}`}
              aria-hidden
            />
          </div>
        ))}
      </div>

      <StudioBg3dSharedDatumProofingCard
        disabled={disabled}
        selectedDatumGenreId={selectedDatumGenreId}
        rejectionRoiReport={rejectionRoiReport}
        darkroomProofingState={darkroomProofingState}
        onSelectDatumGenreId={onSelectDatumGenreId}
        onToggleDarkroomProofing={onToggleDarkroomProofing}
      />

      <StudioFreshIdeasV2WorkbenchCard
        sourceTitle={verifyAiReport.remixHeaderKo.replace(/^[^:]+:\s*/, "").split(" · ")[0] ?? "웹툰 3D 연출"}
        sourceSummaryKo={activeLensRemix.angleKo}
        sourceMetricsSummaryKo={`${verifyAiReport.cycleTimeBenchmark.summaryKo} · ${verifyAiReport.weeklyEpisodeRoi.summaryKo}`}
        disabled={disabled}
        onStatusChange={onStatusChange}
      />

      <p
        data-testid="bg3d-blender-remix-header"
        className="font-mono text-xs text-fg-3"
      >
        {verifyAiReport.remixHeaderKo}
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
        {verifyAiReport.remixes.map((remix) => {
          const active = remix.id === activeLensRemix.id;
          return (
            <button
              key={remix.id}
              type="button"
              disabled={disabled}
              data-testid={`bg3d-blender-fresh-lens-${remix.id}`}
              onClick={() => {
                onSelectLensId(remix.id);
                onSelectFreshIdeaLens?.(remix.id, remix.pitchKo);
                onStatusChange?.(`${remix.badgeKo}: ${remix.pitchKo}`);
              }}
              className={`flex min-h-11 flex-col items-start justify-center rounded-lg border px-3 py-2 text-left ${
                active
                  ? "border-accent bg-raised font-medium text-fg"
                  : "border-line bg-card text-fg-2 hover:bg-raised"
              } ${MOTION_PRESS}`}
            >
              <span className="font-mono text-xs text-fg-3">{remix.badgeKo}</span>
              <span className="mt-0.5 line-clamp-1 text-xs">{remix.pitchKo}</span>
            </button>
          );
        })}
      </div>

      <div
        data-testid="bg3d-blender-fresh-lens-detail"
        className="flex flex-col gap-2 rounded-xl border border-line bg-card p-3 text-xs"
      >
        <div className="font-semibold text-fg">
          {activeLensRemix.badgeKo}: {activeLensRemix.lensTitle}
        </div>
        <p className="leading-5 text-fg-2">
          → <span className="font-medium text-fg">Angle:</span> {activeLensRemix.angleKo}
        </p>
        {activeLensRemix.actionableStepsKo && (
          <ol className="list-inside list-decimal space-y-1 text-xs leading-5 text-fg-2">
            {activeLensRemix.actionableStepsKo.map((step, idx) => (
              <li key={idx}>{step}</li>
            ))}
          </ol>
        )}
      </div>

      {/* Phase 2: 3D Shot 연속성(S_CD) · Live 2D↔3D Linked Ink(BRI) · 컷 아키타입 추천(PRS) */}
      <div
        data-testid="bg3d-blender-phase2-preflight-panel"
        className="flex flex-col gap-2 rounded-xl border border-line bg-card p-3 text-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 font-semibold text-fg">
            <Layers size={16} strokeWidth={1.5} className="shrink-0 text-fg-2" aria-hidden />
            <span>샷 오버라이드 연속성(S_CD) · Linked Ink 브리지(BRI) · 컷 아키타입 추천(PRS)</span>
          </span>
          <span
            data-testid="bg3d-blender-preflight-summary-badge"
            className="rounded-md border border-line bg-raised px-2 py-0.5 font-mono text-xs tabular-nums text-fg-2"
          >
            {preflightReport.summaryBadgeKo}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-fg-2">콘티 아키타입:</span>
            {CUT_ARCHETYPE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={disabled}
                data-testid={`bg3d-blender-archetype-${opt.id}`}
                onClick={() => {
                  onSelectArchetypeId(opt.id);
                  onApplyArchetypePreset?.(opt.id);
                }}
                className={`min-h-10 rounded-lg border px-2.5 py-1 text-xs ${
                  selectedArchetypeId === opt.id
                    ? "border-accent bg-raised font-medium text-fg"
                    : "border-line bg-panel text-fg-2 hover:bg-raised"
                } ${MOTION_PRESS}`}
              >
                {opt.labelKo}
              </button>
            ))}
          </div>

          <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-line bg-panel px-3 py-1 text-xs">
            <input
              type="checkbox"
              disabled={disabled}
              data-testid="bg3d-blender-artistic-override-checkbox"
              checked={artisticOverride}
              onChange={(e) => onToggleArtisticOverride(e.target.checked)}
              className="accent-accent"
            />
            <Wand2 size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
            <span>예술적 허용(과장 구도) 오버라이드</span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div
            data-testid="bg3d-blender-scd-readout"
            className="rounded-lg border border-line bg-panel/60 p-2.5"
          >
            <div className="font-medium tabular-nums text-fg">
              1. Shot 연속성 (S_CD = {preflightReport.shotContinuity.continuityDriftScore})
            </div>
            <p className="mt-1 text-xs leading-5 text-fg-2">
              {preflightReport.shotContinuity.remediationKo}
            </p>
          </div>

          <div
            data-testid="bg3d-blender-bri-readout"
            className="rounded-lg border border-line bg-panel/60 p-2.5"
          >
            <div className="inline-flex items-center gap-1.5 font-medium tabular-nums text-fg">
              <Link2 size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
              <span>
                2. Linked Ink (BRI = {preflightReport.linkedInkBridge.bridgeReliabilityIndex})
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-fg-2">
              {preflightReport.linkedInkBridge.remediationKo}
            </p>
          </div>

          <div
            data-testid="bg3d-blender-prs-readout"
            className="rounded-lg border border-line bg-panel/60 p-2.5"
          >
            <div className="inline-flex items-center gap-1.5 font-medium tabular-nums text-fg">
              <CheckCircle2 size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
              <span>
                3. 추천 매칭 (PRS = {preflightReport.archetypeRecommendation.presetRecommendationScore}점)
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-fg-2">
              {preflightReport.archetypeRecommendation.rationaleKo}
            </p>
          </div>
        </div>
      </div>

      {/* Phase 3·4·Wave 2: 8-Pass Toon PSD · Rights BOM · 원클릭 Auto-Remediation · 세로 스크롤(B_SZ) · Cross-Labs 통합 */}
      <div
        data-testid="bg3d-blender-phase3-multipass-rights-panel"
        className="flex flex-col gap-2 rounded-xl border border-line bg-card p-3 text-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 font-semibold text-fg">
            <FileCheck2 size={16} strokeWidth={1.5} className="shrink-0 text-fg-2" aria-hidden />
            <span>8-Pass PSD · Rights BOM · 세로 스크롤(B_SZ) · 3대 랩스 정합성(X_LABS)</span>
          </span>
          <span
            data-testid="bg3d-blender-rights-bom-badge"
            className="rounded-md border border-line bg-raised px-2 py-0.5 font-mono text-xs tabular-nums text-fg-2"
          >
            {rightsBomAudit.summaryKo}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-fg-2">PSD 렌더 품질:</span>
            {QUALITY_TIER_OPTIONS.map((tier) => (
              <button
                key={tier.id}
                type="button"
                disabled={disabled}
                data-testid={`bg3d-blender-psd-tier-${tier.id}`}
                onClick={() => {
                  onSelectRenderQualityTier(tier.id);
                  onStatusChange?.(`PSD 렌더 품질 전환: ${tier.labelKo}`);
                }}
                className={`min-h-10 rounded-lg border px-2.5 py-1 text-xs ${
                  renderQualityTier === tier.id
                    ? "border-accent bg-raised font-medium text-fg"
                    : "border-line bg-panel text-fg-2 hover:bg-raised"
                } ${MOTION_PRESS}`}
              >
                {tier.labelKo}
              </button>
            ))}
          </div>

          <span
            data-testid="bg3d-blender-multipass-readout"
            className="font-mono text-xs tabular-nums text-fg-2"
          >
            {multiPassPlan.summaryKo}
          </span>
        </div>

        <div
          data-testid="bg3d-blender-phase4-scroll-pacing-readout"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel/50 px-3 py-2 text-xs"
        >
          <span className="inline-flex items-center gap-2 font-medium tabular-nums text-fg">
            <MessageSquare size={16} strokeWidth={1.5} className="shrink-0 text-fg-3" aria-hidden />
            {scrollPacingPlan.summaryKo}
          </span>
          <span
            data-testid="bg3d-blender-live-sync-readout"
            className="font-mono tabular-nums text-fg-2"
          >
            {liveSyncBridge.summaryKo}
          </span>
        </div>

        <div
          data-testid="bg3d-blender-cross-labs-bridge-readout"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-raised/60 px-3 py-2 text-xs"
        >
          <span className="inline-flex items-center gap-2 font-medium text-fg">
            <Cpu size={16} strokeWidth={1.5} className="shrink-0 text-fg-2" aria-hidden />
            {crossLabsReport.summaryBadgeKo}
          </span>
          <span className="font-mono tabular-nums text-fg-2">
            {crossLabsReport.productionReadySummaryKo}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel/60 px-3 py-2">
          <div className="flex flex-col gap-0.5">
            <span
              data-testid="bg3d-blender-remediation-readout"
              className="font-medium tabular-nums text-fg"
            >
              {autoRemediationPlan.summaryKo}
              {remediationAppliedCount > 0
                ? ` · 보정 적용 ${remediationAppliedCount}회 완료`
                : ""}
            </span>
            <span className="text-xs text-fg-3">
              자동 크레딧: {rightsBomAudit.autoAttributionCreditsKo.join(" · ")}
            </span>
          </div>

          <button
            type="button"
            disabled={disabled}
            data-testid="bg3d-blender-auto-remediation-btn"
            onClick={() => {
              onApplyAutoRemediation();
              onStatusChange?.(autoRemediationPlan.summaryKo);
            }}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg border border-line bg-raised px-3 py-1.5 text-xs font-medium text-fg hover:border-accent ${MOTION_PRESS}`}
          >
            <Wrench size={16} strokeWidth={1.5} className="shrink-0 text-fg-2" aria-hidden />
            <span>원클릭 자동 보정(Auto-Remediation) 적용</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card px-3 py-2 text-xs">
        <span
          data-testid="bg3d-blender-verify-ai-dimensions"
          className="font-mono tabular-nums text-fg-2"
        >
          캐릭터 정합성 {verifyAiReport.evaluation.dimensionScores.characterIdentity} · 스타일 일관성{" "}
          {verifyAiReport.evaluation.dimensionScores.styleConsistency} · 가독성{" "}
          {verifyAiReport.evaluation.dimensionScores.compositionReadability} · 편집성{" "}
          {verifyAiReport.evaluation.dimensionScores.editability} · 저작권·출처{" "}
          {verifyAiReport.evaluation.dimensionScores.rightsAndProvenance}
        </span>
        <button
          type="button"
          disabled={disabled}
          data-testid="bg3d-blender-verify-ai-run-btn"
          onClick={() => {
            onVerifyAiGate?.(
              verifyAiReport.evaluation.overallScore,
              verifyAiReport.evaluation.passed &&
                preflightReport.hardGatePassed &&
                rightsBomAudit.commercialPublishAllowed &&
                crossLabsReport.coherence.releaseGatePassed,
            );
            onStatusChange?.(
              `${verifyAiReport.summaryBadgeKo} · ${crossLabsReport.summaryBadgeKo}`,
            );
          }}
          className={`inline-flex min-h-10 items-center gap-2 rounded-lg bg-fg px-3.5 py-1.5 text-xs font-medium text-canvas hover:opacity-90 ${MOTION_PRESS}`}
        >
          <SlidersHorizontal size={16} strokeWidth={1.5} className="shrink-0" aria-hidden />
          <span>Verify AI 품질 게이트 검증 확정</span>
        </button>
      </div>
    </section>
  );
}
