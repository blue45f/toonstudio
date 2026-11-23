/**
 * 탭 2(웹 OST 싱크·시사회·히트맵) + 탭 3(인간 작화 증명·포렌식 워터마크·건강 코치) 뷰.
 */

import {
  Activity,
  AlertTriangle,
  Award,
  ExternalLink,
  Fingerprint,
  HeartPulse,
  Music2,
  Sparkles,
  Users,
} from "lucide-react";

import { GLOBAL_OST_PREMIERE_SPRITE_PATHS } from "./character-mention-and-sfx-repaint";
import {
  CUT_EMOTION_LABELS_KO,
  type CutEmotionTag,
  type DynamicOstMixResult,
  type ErgonomicCoachEvaluation,
  type HumanCraftCertificate,
  type PremiereTheaterSession,
  type ScrollDwellHeatmapReport,
  type StealthWatermarkSignature,
  type WatermarkSessionPurpose,
} from "./ost-sync-premiere-and-trust";

const ALL_EMOTION_TAGS: readonly CutEmotionTag[] = [
  "calm",
  "romance",
  "tension",
  "climax",
  "comedy",
];

export interface OstPremiereHeatmapTabPanelProps {
  readonly scrollProgress: number;
  readonly onScrollProgressChange: (value: number) => void;
  readonly emotionOverride: CutEmotionTag | null;
  readonly onEmotionOverrideChange: (emotion: CutEmotionTag | null) => void;
  readonly ostMix: DynamicOstMixResult;
  readonly premiereSession: PremiereTheaterSession;
  readonly heatmapReport: ScrollDwellHeatmapReport;
}

export function OstPremiereHeatmapTabPanel({
  scrollProgress,
  onScrollProgressChange,
  emotionOverride,
  onEmotionOverrideChange,
  ostMix,
  premiereSession,
  heatmapReport,
}: OstPremiereHeatmapTabPanelProps) {
  return (
    <div
      className="ts-gop-stack"
      role="tabpanel"
      aria-label="웹 OST 싱크·시사회·히트맵 탭"
      data-testid="gop-tab-panel-ost-premiere"
    >
      <div className="ts-gop-grid-2">
        <article className="ts-gop-card">
          <div className="ts-gop-card-head">
            <div className="ts-gop-hero-id">
              <img
                src={GLOBAL_OST_PREMIERE_SPRITE_PATHS.discover}
                alt=""
                aria-hidden="true"
                className="ts-gop-sprite-sm"
                width={28}
                height={28}
              />
              <div>
                <h3 className="ts-gop-card-title">웹 OST ↔ 컷 감정 자동 크로스페이드</h3>
                <p className="ts-gop-subtitle">{ostMix.mixSummaryKo}</p>
              </div>
            </div>
            <a
              href={ostMix.audioWorkshopHref}
              className="ts-gop-ost-cta"
              data-testid="gop-ost-panel-cta"
            >
              <Music2 size={15} aria-hidden="true" />
              웹 OST 제작실로 직행
              <ExternalLink size={13} aria-hidden="true" />
            </a>
          </div>

          <label className="ts-gop-label">
            <span className="ts-gop-between">
              <span>독자 스크롤 진행도</span>
              <strong className="ts-gop-num" data-testid="gop-scroll-progress-label">
                {Math.round(scrollProgress * 100)}% · {ostMix.activeCue.cutLabelKo} ({ostMix.masterTempoBpm} BPM)
              </strong>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(scrollProgress * 100)}
              aria-label="독자 스크롤 진행도"
              className="ts-gop-range"
              onChange={(event) => {
                onEmotionOverrideChange(null);
                onScrollProgressChange(Number(event.target.value) / 100);
              }}
            />
          </label>

          <div className="ts-gop-row" role="group" aria-label="컷 감정 태그 즉시 미리듣기">
            <button
              type="button"
              className="ts-gop-chip"
              aria-pressed={emotionOverride === null}
              onClick={() => onEmotionOverrideChange(null)}
            >
              스크롤 자동 싱크
            </button>
            {ALL_EMOTION_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                className="ts-gop-chip"
                aria-pressed={emotionOverride === tag}
                onClick={() => onEmotionOverrideChange(tag)}
              >
                {CUT_EMOTION_LABELS_KO[tag]}
              </button>
            ))}
          </div>

          <div className="ts-gop-stack" data-testid="gop-ost-layer-meters">
            {(
              [
                ["피아노 (Piano)", ostMix.layers.piano, "cool"],
                ["스트링 (Strings)", ostMix.layers.strings, "good"],
                ["퍼커션 (Percussion)", ostMix.layers.percussion, "warn"],
              ] as const
            ).map(([label, volume, tone]) => (
              <div key={label} className="ts-gop-subcard">
                <div className="ts-gop-between">
                  <strong>{label}</strong>
                  <span className="ts-gop-num">{volume}%</span>
                </div>
                <div className="ts-gop-meter-track" aria-hidden="true">
                  <div className="ts-gop-meter-fill" data-tone={tone} style={{ width: `${volume}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="ts-gop-card">
          <div className="ts-gop-card-head">
            <div>
              <h3 className="ts-gop-card-title">라이브 연재 시사회 극장 &amp; 1컷 팬아트 리믹스</h3>
              <p className="ts-gop-subtitle">{premiereSession.premiereReadinessKo}</p>
            </div>
            <span className="ts-gop-pill" data-tone="good">
              <Users size={13} aria-hidden="true" />
              {premiereSession.concurrentViewers.toLocaleString("ko-KR")}명 동시 입장
            </span>
          </div>

          <div className="ts-gop-subcard" data-testid="gop-remix-split-card">
            <div className="ts-gop-between">
              <strong>{premiereSession.remixChallengeSplit.challengeTitleKo}</strong>
              <span className="ts-gop-pill" data-tone="cool">
                합계 {premiereSession.remixChallengeSplit.totalPercentCheck}%
              </span>
            </div>
            <span className="ts-gop-subtitle ts-gop-num">
              {premiereSession.remixChallengeSplit.settlementRuleKo}
            </span>
            <span className="ts-gop-subtitle">
              {premiereSession.remixChallengeSplit.licenseScopeKo}
            </span>
          </div>

          <div className="ts-gop-stack">
            {premiereSession.danmakuQueue.map((item) => (
              <div key={item.id} className="ts-gop-subcard">
                <div className="ts-gop-between">
                  <strong>
                    {item.atCutIndex}컷 · {item.authorLabel}
                  </strong>
                  <span className="ts-gop-pill">{item.atSecond}초 탄막</span>
                </div>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </article>
      </div>

      <article className="ts-gop-card" data-testid="gop-dwell-heatmap-card">
        <div className="ts-gop-card-head">
          <div>
            <h3 className="ts-gop-card-title">독자 스크롤 체류 히트맵 &amp; 이탈 주의 컷 진단</h3>
            <p className="ts-gop-subtitle ts-gop-num">{heatmapReport.summaryKo}</p>
          </div>
          <span className="ts-gop-pill" data-tone={heatmapReport.dropAlertCuts.length > 0 ? "bad" : "good"}>
            <AlertTriangle size={13} aria-hidden="true" />
            이탈 주의 {heatmapReport.dropAlertCuts.length}컷
          </span>
        </div>

        <div className="ts-gop-grid-2">
          {heatmapReport.cuts.map((diag) => {
            const tone =
              diag.severity === "drop-alert"
                ? "bad"
                : diag.severity === "watch"
                  ? "warn"
                  : diag.severity === "peak"
                    ? "good"
                    : "cool";
            return (
              <div key={diag.sample.cutIndex} className="ts-gop-subcard">
                <div className="ts-gop-between">
                  <strong>{diag.sample.cutTitleKo}</strong>
                  <span className="ts-gop-pill" data-tone={tone}>
                    {diag.severityLabelKo} · {diag.sample.avgDwellSeconds}초
                  </span>
                </div>
                <div className="ts-gop-meter-track" aria-hidden="true">
                  <div className="ts-gop-meter-fill" data-tone={tone} style={{ width: `${diag.heatIntensity}%` }} />
                </div>
                <span className="ts-gop-subtitle ts-gop-num">
                  완독 유지 {diag.sample.readerCompletionPercent}% · 이탈 변동 -
                  {diag.sample.dropOffDeltaPercent}% · 재열람 {diag.sample.replayRatePercent}%
                </span>
                <span className="ts-gop-subtitle">{diag.actionHintKo}</span>
              </div>
            );
          })}
        </div>
      </article>
    </div>
  );
}

export interface HumanCraftHealthTabPanelProps {
  readonly handMinutes: number;
  readonly scene3dMinutes: number;
  readonly aiAssistMinutes: number;
  readonly onChangeCraftMinutes: (patch: {
    readonly handMinutes?: number;
    readonly scene3dMinutes?: number;
    readonly aiAssistMinutes?: number;
  }) => void;
  readonly craftCertificate: HumanCraftCertificate;
  readonly watermarkRecipient: string;
  readonly onWatermarkRecipientChange: (value: string) => void;
  readonly watermarkPurpose: WatermarkSessionPurpose;
  readonly onWatermarkPurposeChange: (purpose: WatermarkSessionPurpose) => void;
  readonly watermark: StealthWatermarkSignature;
  readonly continuousDrawingMinutes: number;
  readonly onContinuousDrawingMinutesChange: (value: number) => void;
  readonly pressureStiffness: number;
  readonly onPressureStiffnessChange: (value: number) => void;
  readonly leftHandShortcutActive: boolean;
  readonly onToggleLeftHandShortcut: () => void;
  readonly healthCoach: ErgonomicCoachEvaluation;
}

export function HumanCraftHealthTabPanel({
  handMinutes,
  scene3dMinutes,
  aiAssistMinutes,
  onChangeCraftMinutes,
  craftCertificate,
  watermarkRecipient,
  onWatermarkRecipientChange,
  watermarkPurpose,
  onWatermarkPurposeChange,
  watermark,
  continuousDrawingMinutes,
  onContinuousDrawingMinutesChange,
  pressureStiffness,
  onPressureStiffnessChange,
  leftHandShortcutActive,
  onToggleLeftHandShortcut,
  healthCoach,
}: HumanCraftHealthTabPanelProps) {
  return (
    <div
      className="ts-gop-stack"
      role="tabpanel"
      aria-label="인간 작화 증명·건강 코치 탭"
      data-testid="gop-tab-panel-trust-health"
    >
      <div className="ts-gop-grid-2">
        <article className="ts-gop-card">
          <div className="ts-gop-card-head">
            <div className="ts-gop-hero-id">
              <img
                src={GLOBAL_OST_PREMIERE_SPRITE_PATHS.gpen}
                alt=""
                aria-hidden="true"
                className="ts-gop-sprite-sm"
                width={28}
                height={28}
              />
              <div>
                <h3 className="ts-gop-card-title">인간 작화 증명서 (손그림·3D·AI 투명 집계)</h3>
                <p className="ts-gop-subtitle">{craftCertificate.transparencyStatementKo}</p>
              </div>
            </div>
            <span className="ts-gop-pill" data-tone="good" data-testid="gop-craft-grade">
              <Award size={13} aria-hidden="true" />
              {craftCertificate.gradeBadgeKo}
            </span>
          </div>

          <div className="ts-gop-stacked-bar" aria-hidden="true">
            <div className="ts-gop-stacked-seg" data-kind="hand" style={{ width: `${craftCertificate.handDrawnPercent}%` }} />
            <div className="ts-gop-stacked-seg" data-kind="scene3d" style={{ width: `${craftCertificate.scene3dPercent}%` }} />
            <div className="ts-gop-stacked-seg" data-kind="ai" style={{ width: `${craftCertificate.aiAssistPercent}%` }} />
          </div>

          <div className="ts-gop-row">
            <span className="ts-gop-pill" data-tone="good">손그림 {craftCertificate.handDrawnPercent}%</span>
            <span className="ts-gop-pill" data-tone="cool">3D 배경·포즈 {craftCertificate.scene3dPercent}%</span>
            <span className="ts-gop-pill" data-tone="warn">AI 보조 {craftCertificate.aiAssistPercent}%</span>
          </div>

          <div className="ts-gop-grid-2">
            <label className="ts-gop-label">
              손그림 작업(분)
              <input
                type="number"
                min={0}
                max={2400}
                aria-label="손그림 작업 분"
                className="ts-gop-input ts-gop-num"
                value={handMinutes}
                onChange={(event) => onChangeCraftMinutes({ handMinutes: Number(event.target.value) })}
              />
            </label>
            <label className="ts-gop-label">
              AI 보조 작업(분)
              <input
                type="number"
                min={0}
                max={2400}
                aria-label="AI 보조 작업 분"
                className="ts-gop-input ts-gop-num"
                value={aiAssistMinutes}
                onChange={(event) => onChangeCraftMinutes({ aiAssistMinutes: Number(event.target.value) })}
              />
            </label>
          </div>

          <p className="ts-gop-code" data-testid="gop-craft-cert-id">
            증명서 번호: {craftCertificate.certificateId} · 3D {scene3dMinutes}분 · 지문{" "}
            {craftCertificate.verificationFingerprint}
          </p>

          <div className="ts-gop-subcard">
            <div className="ts-gop-between">
              <strong>
                <Fingerprint size={14} aria-hidden="true" /> 비가시적 포렌식 워터마크
              </strong>
              <span className="ts-gop-pill" data-tone="cool">ΔE {watermark.imperceptibleDeltaE} (육안 비가시)</span>
            </div>
            <label className="ts-gop-label">
              외주 / 미리보기 수신자 식별자
              <input
                type="text"
                aria-label="워터마크 수신자"
                className="ts-gop-input"
                value={watermarkRecipient}
                onChange={(event) => onWatermarkRecipientChange(event.target.value)}
              />
            </label>
            <div className="ts-gop-row" role="group" aria-label="워터마크 전달 용도">
              {(
                [
                  ["outsource-handoff", "외주 전달본"],
                  ["editor-preview", "편집부 미리보기"],
                  ["press-screener", "사전 시사본"],
                ] as const
              ).map(([purpose, label]) => (
                <button
                  key={purpose}
                  type="button"
                  className="ts-gop-chip"
                  aria-pressed={watermarkPurpose === purpose}
                  onClick={() => onWatermarkPurposeChange(purpose)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="ts-gop-code" data-testid="gop-watermark-code">
              {watermark.watermarkCode} · {watermark.traceableMetadataSummaryKo}
            </p>
          </div>
        </article>

        <article className="ts-gop-card" data-testid="gop-health-coach-card">
          <div className="ts-gop-card-head">
            <div>
              <h3 className="ts-gop-card-title">
                <HeartPulse size={15} aria-hidden="true" /> 작가 손목·마감 건강 페이스 코치
              </h3>
              <p className="ts-gop-subtitle">{healthCoach.coachMessageKo}</p>
            </div>
            <span
              className="ts-gop-pill"
              data-tone={
                healthCoach.riskLevel === "break-now"
                  ? "bad"
                  : healthCoach.riskLevel === "caution"
                    ? "warn"
                    : "good"
              }
              data-testid="gop-health-risk-badge"
            >
              <Activity size={13} aria-hidden="true" />
              {healthCoach.riskLabelKo} (피로 {healthCoach.fatigueIndex})
            </span>
          </div>

          <label className="ts-gop-label">
            <span className="ts-gop-between">
              <span>연속 작화 시간</span>
              <strong className="ts-gop-num">{continuousDrawingMinutes}분</strong>
            </span>
            <input
              type="range"
              min={0}
              max={150}
              value={continuousDrawingMinutes}
              aria-label="연속 작화 시간 분"
              className="ts-gop-range"
              onChange={(event) => onContinuousDrawingMinutesChange(Number(event.target.value))}
            />
          </label>

          <label className="ts-gop-label">
            <span className="ts-gop-between">
              <span>필압 경직도</span>
              <strong className="ts-gop-num">{pressureStiffness}/100</strong>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={pressureStiffness}
              aria-label="필압 경직도"
              className="ts-gop-range"
              onChange={(event) => onPressureStiffnessChange(Number(event.target.value))}
            />
          </label>

          <div className="ts-gop-subcard">
            <div className="ts-gop-between">
              <strong>왼손 단축키 · 한손 컨트롤러 분담</strong>
              <button
                type="button"
                className="ts-gop-btn"
                data-variant={leftHandShortcutActive ? "primary" : undefined}
                aria-pressed={leftHandShortcutActive}
                data-testid="gop-lefthand-toggle"
                onClick={onToggleLeftHandShortcut}
              >
                <Sparkles size={14} aria-hidden="true" />
                {leftHandShortcutActive ? "왼손 단축키 활성" : "왼손 단축키 전환"}
              </button>
            </div>
            <span className="ts-gop-subtitle">{healthCoach.leftHandShortcutGuideKo}</span>
          </div>

          <div className="ts-gop-stack" data-testid="gop-stretch-routine-90s">
            {healthCoach.stretchRoutine90s.map((step) => (
              <div key={step.stepNumber} className="ts-gop-subcard">
                <div className="ts-gop-between">
                  <strong>
                    {step.stepNumber}단계 · {step.titleKo}
                  </strong>
                  <span className="ts-gop-pill">{step.durationSec}초</span>
                </div>
                <span className="ts-gop-subtitle">{step.instructionKo}</span>
              </div>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}
