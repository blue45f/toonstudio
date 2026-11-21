import { CheckCircle2, Compass, ShieldAlert, SpellCheck } from "lucide-react";

import {
  COMPLIANCE_REGION_POLICIES,
  type AgeRatingTier,
  type AppliedComplianceRemediationResult,
  type CharacterSpeechContract,
  type ComplianceRegion,
  type ContinuityAuditReport,
  type DialogueBalloonAuditInput,
  type KoreanGrammarRegisterReport,
  type RegionalComplianceReport,
} from "./webtoon-ai-qa-continuity-engine";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const REGIONS: readonly ComplianceRegion[] = ["KR", "JP", "SEA", "US"];
const RATINGS: readonly AgeRatingTier[] = ["ALL", "12+", "15+", "19+"];

function ratingLabelKo(rating: AgeRatingTier): string {
  switch (rating) {
    case "ALL":
      return "전체이용가";
    case "12+":
      return "12세 이용가";
    case "15+":
      return "15세 이용가";
    case "19+":
      return "19세 이용가";
  }
}

/**
 * 탭 1: 국가별·연령등급 심의 & 실제 상표권 로고 자동 스캐너
 */
export function RegionalComplianceTabView({
  region,
  rating,
  report,
  patchResult,
  appliedIds,
  onSelectRegion,
  onSelectRating,
  onToggleRemediation,
  onApplyAllRemediations,
}: {
  readonly region: ComplianceRegion;
  readonly rating: AgeRatingTier;
  readonly report: RegionalComplianceReport;
  readonly patchResult: AppliedComplianceRemediationResult;
  readonly appliedIds: readonly string[];
  readonly onSelectRegion: (next: ComplianceRegion) => void;
  readonly onSelectRating: (next: AgeRatingTier) => void;
  readonly onToggleRemediation: (findingId: string) => void;
  readonly onApplyAllRemediations: () => void;
}) {
  const bt = useBilingual("StudioAiQaCompliancePanel");
  const appliedSet = new Set(appliedIds);

  return (
    <section className="qa-panel" data-testid="qa-panel-compliance">
      <div className={patchResult.updatedVerdict === "BLOCKED" ? "qa-card qa-card--blocked" : "qa-card qa-card--pass"}>
        <div className="qa-row-between">
          <div>
            <div className="qa-row">
              <ShieldAlert size={16} aria-hidden />
              <strong>{bt("1. 국가별·연령등급 심의 & 상표권 로고 스캐너", "1. Regional Compliance & Trademark Scanner")}</strong>
              <span
                className="qa-badge"
                data-testid="qa-compliance-verdict"
                data-tone={
                  patchResult.updatedVerdict === "BLOCKED"
                    ? "bad"
                    : patchResult.updatedVerdict === "REVIEW"
                      ? "warn"
                      : "good"
                }
              >
                {patchResult.updatedVerdict}
              </span>
            </div>
            <p className="qa-item-meta">
              {COMPLIANCE_REGION_POLICIES[region].summaryKo} ·{" "}
              {bt("권장 등급", "Recommended")}: <strong>{ratingLabelKo(report.recommendedRatingForRegion)}</strong>
            </p>
          </div>
          <button
            type="button"
            className="qa-btn qa-btn--primary"
            data-testid="qa-compliance-apply-all-btn"
            onClick={onApplyAllRemediations}
          >
            <CheckCircle2 size={15} aria-hidden />
            {bt("1클릭 모자이크·상표 대체 일괄 적용", "Apply all cover & parody layers")}
          </button>
        </div>

        <div className="qa-row" style={{ marginTop: "0.75rem" }}>
          {REGIONS.map((item) => (
            <button
              key={item}
              type="button"
              className="qa-chip"
              aria-pressed={region === item}
              data-testid={`qa-region-${item}`}
              onClick={() => onSelectRegion(item)}
            >
              {item}
            </button>
          ))}
          {RATINGS.map((tier) => (
            <button
              key={tier}
              type="button"
              className="qa-chip"
              aria-pressed={rating === tier}
              data-testid={`qa-rating-${tier}`}
              onClick={() => onSelectRating(tier)}
            >
              {ratingLabelKo(tier)}
            </button>
          ))}
        </div>
      </div>

      <ul className="qa-list" data-testid="qa-compliance-findings">
        {report.findings.map((finding) => {
          const isApplied = appliedSet.has(finding.id);
          return (
            <li key={finding.id} className="qa-item">
              <div className="qa-row-between">
                <div className="qa-row">
                  <span className="qa-badge" data-tone={isApplied ? "good" : finding.severity === "block" ? "bad" : "warn"}>
                    {isApplied ? bt("가림 적용됨", "Covered") : finding.ruleCode}
                  </span>
                  <strong>
                    {finding.cutNumber}컷 · {finding.matchedToken}
                  </strong>
                </div>
                <button
                  type="button"
                  className={isApplied ? "qa-btn qa-btn--good" : "qa-btn"}
                  aria-pressed={isApplied}
                  data-testid={`qa-compliance-toggle-${finding.id}`}
                  onClick={() => onToggleRemediation(finding.id)}
                >
                  {isApplied
                    ? bt("레이어 적용 취소", "Undo layer")
                    : finding.suggestedReplacementText
                      ? bt(`"${finding.suggestedReplacementText}" 대체`, `Replace with "${finding.suggestedReplacementText}"`)
                      : bt("모자이크/가림 레이어 추가", "Add cover layer")}
                </button>
              </div>
              <p className="qa-item-meta">{finding.reasonKo}</p>
              <p className="qa-item-meta">
                {bt("제안 조치", "Suggested fix")}: {finding.remediationLabelKo} ({finding.overlayLayerSpec.layerName})
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * 탭 2: 한국어 맞춤법 + 캐릭터 말투(존댓말/반말) 일관성 교정기
 */
export function GrammarRegisterTabView({
  contracts,
  balloons,
  report,
  appliedBalloonIds,
  onApplyAllFixes,
}: {
  readonly contracts: readonly CharacterSpeechContract[];
  readonly balloons: readonly DialogueBalloonAuditInput[];
  readonly report: KoreanGrammarRegisterReport;
  readonly appliedBalloonIds: readonly string[];
  readonly onApplyAllFixes: () => void;
}) {
  const bt = useBilingual("StudioAiQaCompliancePanel");
  const appliedSet = new Set(appliedBalloonIds);

  return (
    <section className="qa-panel" data-testid="qa-panel-grammar">
      <div className="qa-card">
        <div className="qa-row-between">
          <div>
            <div className="qa-row">
              <SpellCheck size={16} aria-hidden />
              <strong>{bt("2. 한국어 맞춤법 · 캐릭터 말투(존댓말/반말) 교정기", "2. Korean Spelling & Speech Register Auditor")}</strong>
              <span className="qa-badge" data-testid="qa-grammar-score" data-tone={report.consistencyScore >= 90 ? "good" : "warn"}>
                {report.consistencyScore}점
              </span>
            </div>
            <p className="qa-item-meta">
              맞춤법·띄어쓰기 {report.spellingIssues.length}건 · 말투 불일치 {report.registerViolations.length}건 검출 (독백 자동 제외)
            </p>
          </div>
          <button
            type="button"
            className="qa-btn qa-btn--primary"
            data-testid="qa-grammar-apply-all-btn"
            onClick={onApplyAllFixes}
          >
            {bt("교정안 일괄 반영", "Apply all corrections")}
          </button>
        </div>

        <div className="qa-row" style={{ marginTop: "0.625rem" }}>
          {contracts.map((contract) => (
            <span key={`${contract.speakerId}-${contract.listenerId}`} className="qa-badge" data-tone="cool">
              {contract.speakerName} → {contract.listenerName}: {contract.expectedRegister === "honorific" ? "존댓말" : "반말"}
            </span>
          ))}
        </div>
      </div>

      <ul className="qa-list" data-testid="qa-grammar-balloon-list">
        {balloons.map((balloon) => {
          const fixed = report.correctedTextByBalloonId[balloon.balloonId] ?? balloon.text;
          const changed = fixed !== balloon.text;
          const isApplied = appliedSet.has(balloon.balloonId);
          return (
            <li key={balloon.balloonId} className="qa-item">
              <div className="qa-row-between">
                <strong>
                  {balloon.cutNumber}컷 ({balloon.balloonId})
                  {balloon.isMonologue ? ` · ${bt("독백 예외", "Monologue")}` : ""}
                </strong>
                <span className="qa-badge" data-tone={!changed || isApplied ? "good" : "warn"}>
                  {!changed ? bt("정상", "OK") : isApplied ? bt("교정 반영됨", "Applied") : bt("교정 필요", "Needs fix")}
                </span>
              </div>
              <p className="qa-item-meta">원문: {balloon.text}</p>
              {changed ? (
                <p className="qa-item-meta" data-testid={`qa-grammar-fixed-${balloon.balloonId}`}>
                  <strong>교정안:</strong> {fixed}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * 탭 3: 180도 시선 법칙 & 소품·좌우 연속성 검사기
 */
export function ContinuityTabView({
  report,
}: {
  readonly report: ContinuityAuditReport;
}) {
  const bt = useBilingual("StudioAiQaCompliancePanel");

  return (
    <section className="qa-panel" data-testid="qa-panel-continuity">
      <div className={report.verdict === "BLOCKED" ? "qa-card qa-card--blocked" : "qa-card qa-card--pass"}>
        <div className="qa-row-between">
          <div className="qa-row">
            <Compass size={16} aria-hidden />
            <strong>{bt("3. 180도 시선 법칙 & 소품·좌우 연속성 검사", "3. 180° Eyeline & Prop Hand Continuity")}</strong>
            <span
              className="qa-badge"
              data-testid="qa-continuity-verdict"
              data-tone={report.verdict === "BLOCKED" ? "bad" : report.verdict === "WARN" ? "warn" : "good"}
            >
              {report.verdict} · {report.continuityScore}점
            </span>
          </div>
          <span className="qa-item-meta qa-num">
            시선 위반 {report.eyelineIssues.length}건 · 소품 손 전환 {report.propIssues.length}건
          </span>
        </div>
      </div>

      <div className="qa-two-col">
        <div className="qa-card">
          <strong>{bt("180도 시선 축 경보", "180° Eyeline Alerts")}</strong>
          <ul className="qa-list" style={{ marginTop: "0.625rem" }} data-testid="qa-eyeline-issues">
            {report.eyelineIssues.map((issue) => (
              <li key={issue.id} className="qa-item">
                <div className="qa-row">
                  <span className="qa-badge" data-tone={issue.severity === "block" ? "bad" : "warn"}>
                    {issue.cutNumber}컷 · {issue.kind}
                  </span>
                  <strong>{issue.participantsKo}</strong>
                </div>
                <p className="qa-item-meta">{issue.reasonKo}</p>
                <p className="qa-item-meta">조치: {issue.fixSuggestionKo}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="qa-card">
          <strong>{bt("소품 손 위치(오른손↔왼손) 경보", "Prop Hand-Flip Alerts")}</strong>
          <ul className="qa-list" style={{ marginTop: "0.625rem" }} data-testid="qa-prop-issues">
            {report.propIssues.map((issue) => (
              <li key={issue.id} className="qa-item">
                <div className="qa-row">
                  <span className="qa-badge" data-tone={issue.severity === "block" ? "bad" : "warn"}>
                    {issue.previousCutNumber}컷 → {issue.cutNumber}컷
                  </span>
                  <strong>
                    {issue.characterName} · {issue.propName}
                  </strong>
                </div>
                <p className="qa-item-meta">{issue.reasonKo}</p>
                <p className="qa-item-meta">조치: {issue.fixSuggestionKo}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
