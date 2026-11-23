/**
 * 대형 웹툰 스튜디오 PM 컨베이어 · 난이도 가중치 정산 · 플랫폼 사전 QC 탭 뷰 모음.
 * `StudioLargePmConveyorConsole.tsx` 내부에서 지연·탭 전환 시 렌더링되며 원시 색상을 사용하지 않는다.
 */

import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  CheckCircle2,
  Coins,
  FileCheck2,
  ShieldAlert,
  UserPlus,
} from "lucide-react";

import {
  CUT_DIFFICULTY_TIERS,
  PLATFORM_QC_SPECS,
  type CutDifficultyGradeId,
  type MultiEpisodeConveyorEvaluation,
  type PlatformAgeRatingId,
  type PlatformPreSubmissionInput,
  type PlatformPreSubmissionQcReport,
  type PlatformQcTargetId,
  type ReallocationProposal,
  type SettlementContractorEntry,
  type SettlementTaxMode,
  type WeightedStudioSettlementReport,
} from "./large-studio-pm-conveyor-engine";
import { SMART_DEFAULT_SPRITE_PATHS } from "./smart-defaults-intent-engine";

function formatKrw(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function episodeTone(status: "on-track" | "watch" | "delayed" | "critical"): "good" | "warn" | "bad" {
  if (status === "on-track") return "good";
  if (status === "watch" || status === "delayed") return "warn";
  return "bad";
}

function episodeStatusKo(status: "on-track" | "watch" | "delayed" | "critical"): string {
  switch (status) {
    case "on-track":
      return "정상 가동";
    case "watch":
      return "주의";
    case "delayed":
      return "지연 경보";
    case "critical":
      return "긴급 도미노";
  }
}

export interface PmConveyorRotationTabProps {
  readonly evaluation: MultiEpisodeConveyorEvaluation;
  readonly onAdjustEpisodeWorkHours: (episodeNumber: number, deltaHours: number) => void;
  readonly onApplyReallocation: (proposal: ReallocationProposal) => void;
  readonly onResetConveyor: () => void;
}

export function PmConveyorRotationTabView({
  evaluation,
  onAdjustEpisodeWorkHours,
  onApplyReallocation,
  onResetConveyor,
}: PmConveyorRotationTabProps) {
  const dominoTone =
    evaluation.domino.overallSeverity === "none"
      ? "good"
      : evaluation.domino.overallSeverity === "warning"
        ? "warn"
        : "bad";

  return (
    <div className="ts-pm-card" data-testid="pm-conveyor-tab-panel">
      <div className="ts-pm-card-head">
        <div className="ts-pm-hero-id">
          <img
            src={SMART_DEFAULT_SPRITE_PATHS.layers}
            alt=""
            aria-hidden="true"
            className="ts-pm-sprite-sm"
            width={24}
            height={24}
          />
          <h3 className="ts-pm-card-title">3~4화차 동시 로테이션 컨베이어 보드</h3>
        </div>
        <div className="ts-pm-badge-row">
          <span className="ts-pm-pill" data-tone={dominoTone} data-testid="domino-risk-summary">
            {evaluation.domino.overallSeverity === "none" ? (
              <CheckCircle2 size={14} aria-hidden="true" />
            ) : (
              <ShieldAlert size={14} aria-hidden="true" />
            )}
            {evaluation.domino.headlineKo}
          </span>
          <button type="button" className="ts-pm-btn" onClick={onResetConveyor}>
            기본 로테이션 복원
          </button>
        </div>
      </div>

      <div className="ts-pm-lane-grid">
        {evaluation.episodes.map((ep) => {
          const tone = episodeTone(ep.status);
          return (
            <article
              key={ep.episodeNumber}
              className="ts-pm-lane"
              data-status={ep.status}
              data-testid={`conveyor-episode-${ep.episodeNumber}`}
            >
              <div className="ts-pm-list-row">
                <strong>{ep.episodeTitleKo}</strong>
                <span className="ts-pm-pill" data-tone={tone}>
                  {episodeStatusKo(ep.status)} · D-{ep.publishDDay}
                </span>
              </div>
              <div className="ts-pm-list-row">
                <span>
                  현재 공정: <strong>{ep.stageLabelKo}</strong> ({ep.leadNameKo})
                </span>
                <span className="ts-pm-num">
                  {ep.completedCuts}/{ep.totalCuts}컷 ({ep.progressPercent}%)
                </span>
              </div>
              <div className="ts-pm-meter" aria-hidden="true">
                <div
                  className="ts-pm-meter-fill"
                  data-tone={tone}
                  style={{ width: `${ep.progressPercent}%` }}
                />
              </div>
              <div className="ts-pm-list-row">
                <span className="ts-pm-num">
                  잔여 작업 {ep.remainingWorkHours}h / 가용 {ep.availableWorkHours}h ·{" "}
                  {ep.delayHours > 0 ? `지연 ${ep.delayHours}h` : `여유 +${ep.slackHours}h`}
                </span>
                <span>
                  <ArrowRight size={13} aria-hidden="true" /> {ep.nextStageLabelKo}
                </span>
              </div>
              <div className="ts-pm-badge-row">
                <button
                  type="button"
                  className="ts-pm-btn"
                  onClick={() => onAdjustEpisodeWorkHours(ep.episodeNumber, 6)}
                >
                  Ep.{ep.episodeNumber} +6h 지연 시뮬레이션
                </button>
                <button
                  type="button"
                  className="ts-pm-btn"
                  onClick={() => onAdjustEpisodeWorkHours(ep.episodeNumber, -6)}
                >
                  -6h 단축
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="ts-pm-grid-2">
        <section className="ts-pm-card" aria-label="도미노 마감 지연 조기 경보">
          <div className="ts-pm-card-head">
            <h4 className="ts-pm-card-title">도미노 마감 지연 조기 경보</h4>
            <span className="ts-pm-pill" data-tone={dominoTone}>
              경보 {evaluation.domino.alerts.length}건
            </span>
          </div>
          {evaluation.domino.alerts.length === 0 ? (
            <p className="ts-pm-notice">
              연쇄 마감 지연 경보가 없습니다. 전 화차 인계 버퍼가 안전합니다.
            </p>
          ) : (
            <ul className="ts-pm-list">
              {evaluation.domino.alerts.map((alert) => (
                <li key={alert.alertId} className="ts-pm-list-item">
                  <div className="ts-pm-list-row">
                    <strong>
                      <AlertTriangle size={14} aria-hidden="true" /> Ep.{alert.sourceEpisodeNumber}{" "}
                      {alert.sourceStageLabelKo}
                    </strong>
                    <span
                      className="ts-pm-pill"
                      data-tone={alert.severity === "critical" ? "bad" : "warn"}
                    >
                      연쇄 지연 {alert.cascadedDelayHours}h
                    </span>
                  </div>
                  <span>{alert.deadlineImpactKo}</span>
                  <span>대응: {alert.mitigationKo}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ts-pm-card" aria-label="여유 인력 자동 재배정 제안">
          <div className="ts-pm-card-head">
            <h4 className="ts-pm-card-title">여유 인력 자동 재배정 제안</h4>
            <span className="ts-pm-pill" data-tone="accent">
              가용 유휴 {evaluation.totalSpareStaffHours}h
            </span>
          </div>
          {evaluation.reallocationProposals.length === 0 ? (
            <p className="ts-pm-notice">현재 긴급 재배정이 필요한 병목 화차가 없습니다.</p>
          ) : (
            <ul className="ts-pm-list">
              {evaluation.reallocationProposals.map((proposal) => (
                <li key={proposal.proposalId} className="ts-pm-list-item">
                  <div className="ts-pm-list-row">
                    <strong>{proposal.staffNameKo}</strong>
                    <span className="ts-pm-pill" data-tone="good">
                      Ep.{proposal.targetEpisodeNumber} 지연 -{proposal.recoveredDelayHours}h
                    </span>
                  </div>
                  <span>{proposal.reasonKo}</span>
                  <button
                    type="button"
                    className="ts-pm-btn"
                    data-variant="primary"
                    data-testid={`apply-reallocation-${proposal.proposalId}`}
                    onClick={() => onApplyReallocation(proposal)}
                  >
                    <UserPlus size={15} aria-hidden="true" />
                    Ep.{proposal.targetEpisodeNumber} {proposal.targetStageLabelKo}에 {proposal.allocatedHours}h 재배정 적용
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export interface PmWeightedSettlementTabProps {
  readonly entries: readonly SettlementContractorEntry[];
  readonly report: WeightedStudioSettlementReport;
  readonly onUpdateCutCount: (
    entryId: string,
    grade: CutDifficultyGradeId,
    nextCount: number,
  ) => void;
  readonly onToggleTaxMode: (entryId: string, nextMode: SettlementTaxMode) => void;
}

export function PmWeightedSettlementTabView({
  entries,
  report,
  onUpdateCutCount,
  onToggleTaxMode,
}: PmWeightedSettlementTabProps) {
  return (
    <div className="ts-pm-card" data-testid="pm-settlement-tab-panel">
      <div className="ts-pm-card-head">
        <div className="ts-pm-hero-id">
          <Calculator size={20} aria-hidden="true" />
          <h3 className="ts-pm-card-title">
            컷 난이도 가중치 Rate Card 외주 정산 (프리랜서 3.3% / 사업자 VAT 10% 자동 분리)
          </h3>
        </div>
        <span className="ts-pm-pill" data-tone="accent" data-testid="settlement-grand-cashout">
          <Coins size={14} aria-hidden="true" />
          스튜디오 총 지출 {formatKrw(report.grandTotals.studioTotalCashOutKrw)}
        </span>
      </div>

      <div className="ts-pm-kpi-grid">
        <div className="ts-pm-kpi-card">
          <span className="ts-pm-kpi-label">프리랜서 3.3% 실입금 ({report.freelancerSubtotal.contractorCount}명)</span>
          <strong className="ts-pm-kpi-value" data-testid="settlement-freelancer-net">
            {formatKrw(report.freelancerSubtotal.netPayoutKrw)}
          </strong>
          <span className="ts-pm-kpi-note">
            총원고료 {formatKrw(report.freelancerSubtotal.grossKrw)} · 원천세 {formatKrw(report.freelancerSubtotal.withholdingTaxKrw)}
          </span>
        </div>
        <div className="ts-pm-kpi-card">
          <span className="ts-pm-kpi-label">사업자 세금계산서 합계 ({report.businessSubtotal.contractorCount}곳)</span>
          <strong className="ts-pm-kpi-value" data-testid="settlement-business-total">
            {formatKrw(report.businessSubtotal.invoiceTotalKrw)}
          </strong>
          <span className="ts-pm-kpi-note">
            공급가액 {formatKrw(report.businessSubtotal.supplyKrw)} · VAT 10% {formatKrw(report.businessSubtotal.vatKrw)}
          </span>
        </div>
        <div className="ts-pm-kpi-card">
          <span className="ts-pm-kpi-label">가중 환산 컷 수</span>
          <strong className="ts-pm-kpi-value">{report.grandTotals.weightedCutCount}컷</strong>
          <span className="ts-pm-kpi-note">실제 원고 {report.grandTotals.rawCutCount}컷 기준</span>
        </div>
        <div className="ts-pm-kpi-card">
          <span className="ts-pm-kpi-label">단순 컷 정산 대비 공정 보정</span>
          <strong className="ts-pm-kpi-value">
            {report.grandTotals.totalFairnessDeltaKrw >= 0 ? "+" : ""}
            {formatKrw(report.grandTotals.totalFairnessDeltaKrw)}
          </strong>
          <span className="ts-pm-kpi-note">액션(1.4x)·군중(1.8x) 노력 정당 반영</span>
        </div>
      </div>

      <ul className="ts-pm-list">
        {entries.map((entry, idx) => {
          const line = report.lines[idx];
          if (!line) return null;
          return (
            <li
              key={entry.entryId}
              className="ts-pm-list-item"
              data-testid={`settlement-line-${entry.entryId}`}
            >
              <div className="ts-pm-list-row">
                <strong>
                  {entry.contractorNameKo} · {entry.episodeLabelKo} {line.stageLabelKo} (기준 {formatKrw(entry.baseRatePerCutKrw)}/컷)
                </strong>
                <div className="ts-pm-badge-row">
                  <button
                    type="button"
                    className="ts-pm-chip-btn"
                    aria-pressed={entry.taxMode === "freelancer-3.3"}
                    onClick={() => onToggleTaxMode(entry.entryId, "freelancer-3.3")}
                  >
                    프리랜서 3.3%
                  </button>
                  <button
                    type="button"
                    className="ts-pm-chip-btn"
                    aria-pressed={entry.taxMode === "business-tax-invoice"}
                    onClick={() => onToggleTaxMode(entry.entryId, "business-tax-invoice")}
                  >
                    사업자 세금계산서(10%)
                  </button>
                </div>
              </div>

              <div className="ts-pm-diff-grid">
                {CUT_DIFFICULTY_TIERS.map((tier) => {
                  const currentValue =
                    tier.id === "simple"
                      ? entry.cuts.simple
                      : tier.id === "standard"
                        ? entry.cuts.standard
                        : tier.id === "action-detail"
                          ? entry.cuts.actionDetail
                          : entry.cuts.crowdBg;
                  return (
                    <label key={tier.id} className="ts-pm-field-mini">
                      <span>
                        {tier.labelKo} ({tier.multiplier}x)
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={300}
                        aria-label={`${entry.contractorNameKo} ${tier.labelKo} 컷 수`}
                        className="ts-pm-input"
                        value={currentValue}
                        onChange={(event) =>
                          onUpdateCutCount(
                            entry.entryId,
                            tier.id,
                            Number.parseInt(event.target.value, 10) || 0,
                          )
                        }
                      />
                    </label>
                  );
                })}
              </div>

              <div className="ts-pm-list-row ts-pm-num">
                <span>
                  환산 {line.weightedCutCount}컷 (원고 {line.rawCutCount}컷) · 공급/원고료{" "}
                  <strong>{formatKrw(line.grossAmountKrw)}</strong>
                </span>
                <span>
                  {line.taxMode === "freelancer-3.3"
                    ? `원천세 3.3% -${formatKrw(line.withholdingTaxKrw)} (소득세 ${formatKrw(line.incomeTaxKrw)} + 지방세 ${formatKrw(line.localIncomeTaxKrw)}) → 실입금 ${formatKrw(line.netPayoutKrw)}`
                    : `부가세 10% +${formatKrw(line.vatKrw)} → 세금계산서 합계 ${formatKrw(line.invoiceTotalKrw)}`}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export interface PmPlatformQcTabProps {
  readonly input: PlatformPreSubmissionInput;
  readonly report: PlatformPreSubmissionQcReport;
  readonly onChangeInput: (patch: Partial<PlatformPreSubmissionInput>) => void;
  readonly onSelectPlatform: (platformId: PlatformQcTargetId) => void;
}

const PLATFORM_IDS: readonly PlatformQcTargetId[] = [
  "naver-official",
  "naver-challenge",
  "kakao-page",
  "global-webtoon",
];

const AGE_RATINGS: readonly PlatformAgeRatingId[] = ["all", "12+", "15+", "19+"];

export function PmPlatformQcTabView({
  input,
  report,
  onChangeInput,
  onSelectPlatform,
}: PmPlatformQcTabProps) {
  const verdictTone =
    report.verdict === "ready-to-submit"
      ? "good"
      : report.verdict === "needs-review"
        ? "warn"
        : "bad";

  return (
    <div className="ts-pm-card" data-testid="pm-platform-qc-tab-panel">
      <div className="ts-pm-card-head">
        <div className="ts-pm-hero-id">
          <FileCheck2 size={20} aria-hidden="true" />
          <h3 className="ts-pm-card-title">네이버 · 카카오 · 글로벌 플랫폼 사전 QC · 심의 게이트</h3>
        </div>
        <span className="ts-pm-pill" data-tone={verdictTone} data-testid="platform-qc-verdict">
          {report.verdictLabelKo} · {report.score}점 ({report.passCount}통과 / {report.warnCount}주의 / {report.failCount}차단)
        </span>
      </div>

      <div className="ts-pm-badge-row" role="group" aria-label="출고 대상 플랫폼 선택">
        {PLATFORM_IDS.map((platformId) => (
          <button
            key={platformId}
            type="button"
            className="ts-pm-chip-btn"
            aria-pressed={input.platformId === platformId}
            onClick={() => onSelectPlatform(platformId)}
          >
            {PLATFORM_QC_SPECS[platformId].labelKo}
          </button>
        ))}
      </div>

      <div className="ts-pm-diff-grid">
        <label className="ts-pm-field-mini">
          <span>원고 가로폭 (px)</span>
          <input
            type="number"
            aria-label="원고 가로폭(px)"
            className="ts-pm-input"
            value={input.widthPx}
            onChange={(event) =>
              onChangeInput({ widthPx: Number.parseInt(event.target.value, 10) || 0 })
            }
          />
        </label>
        <label className="ts-pm-field-mini">
          <span>최대 분할 용량 (MB)</span>
          <input
            type="number"
            step={0.1}
            aria-label="최대 분할 용량(MB)"
            className="ts-pm-input"
            value={input.maxSingleSliceMb}
            onChange={(event) =>
              onChangeInput({ maxSingleSliceMb: Number.parseFloat(event.target.value) || 0 })
            }
          />
        </label>
        <label className="ts-pm-field-mini">
          <span>최소 식자 크기 (px)</span>
          <input
            type="number"
            aria-label="최소 식자 크기(px)"
            className="ts-pm-input"
            value={input.minFontSizePx}
            onChange={(event) =>
              onChangeInput({ minFontSizePx: Number.parseInt(event.target.value, 10) || 0 })
            }
          />
        </label>
        <label className="ts-pm-field-mini">
          <span>오탈자 / 말풍선 잘림 (건)</span>
          <input
            type="number"
            min={0}
            aria-label="말풍선 잘림 건수"
            className="ts-pm-input"
            value={input.clippedBalloonCount}
            onChange={(event) =>
              onChangeInput({ clippedBalloonCount: Math.max(0, Number.parseInt(event.target.value, 10) || 0) })
            }
          />
        </label>
      </div>

      <div className="ts-pm-toggle-row">
        <label className="ts-pm-field-mini">
          <span>선언 연령 등급</span>
          <select
            aria-label="선언 연령 등급"
            className="ts-pm-select"
            value={input.declaredAgeRating}
            onChange={(event) =>
              onChangeInput({ declaredAgeRating: event.target.value as PlatformAgeRatingId })
            }
          >
            {AGE_RATINGS.map((rating) => (
              <option key={rating} value={rating}>
                {rating === "all" ? "전체 이용가" : `${rating} 이용가`}
              </option>
            ))}
          </select>
        </label>

        <label className="ts-pm-check-label">
          <input
            type="checkbox"
            checked={input.hasBloodOrGore}
            onChange={(event) => onChangeInput({ hasBloodOrGore: event.target.checked })}
          />
          선혈·유혈 장면 포함
        </label>
        <label className="ts-pm-check-label">
          <input
            type="checkbox"
            checked={input.hasUnlicensedBrandLogo}
            onChange={(event) => onChangeInput({ hasUnlicensedBrandLogo: event.target.checked })}
          />
          미허가 실존 상표 포함
        </label>
        <label className="ts-pm-check-label">
          <input
            type="checkbox"
            checked={input.rightsBomVerified}
            onChange={(event) => onChangeInput({ rightsBomVerified: event.target.checked })}
          />
          Rights BOM 검증 완료
        </label>
      </div>

      <ul className="ts-pm-list">
        {report.checks.map((check) => (
          <li key={check.checkId} className="ts-pm-list-item">
            <div className="ts-pm-list-row">
              <strong>
                [{check.categoryKo}] {check.titleKo}
              </strong>
              <span
                className="ts-pm-pill"
                data-tone={
                  check.status === "pass" ? "good" : check.status === "warn" ? "warn" : "bad"
                }
              >
                {check.status === "pass" ? "통과" : check.status === "warn" ? "주의" : "차단"}
              </span>
            </div>
            <span className="ts-pm-num">
              실측: {check.measuredKo} · 기준: {check.requirementKo}
            </span>
            <span>조치: {check.fixActionKo}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
