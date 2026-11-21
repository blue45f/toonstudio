import {
  SECONDARY_EXPANSION_SPECS,
  formatKrwMan,
  type SecondaryExpansionId,
  type WebtoonIpValuationInput,
  type WebtoonIpValuationReport,
} from "./interactive-manual-and-ip-valuation-engine";

export interface StudioIpValuationSectionProps {
  readonly report: WebtoonIpValuationReport;
  readonly onUpdateInput: (patch: Partial<WebtoonIpValuationInput>) => void;
  readonly onToggleExpansion: (id: SecondaryExpansionId) => void;
}

/**
 * 웹툰 IP 디지털 자산 시장 가치 시뮬레이터 섹션 (추정치 명시 · 공식 투명 공개 · 상승 레버 Top 3).
 */
export function StudioIpValuationSection({
  report,
  onUpdateInput,
  onToggleExpansion,
}: StudioIpValuationSectionProps) {
  return (
    <section className="ims-section" aria-labelledby="ims-ip-heading">
      <div className="ims-section-head">
        <div>
          <h3 id="ims-ip-heading" className="ims-section-title">
            웹툰 IP 디지털 자산 시장 가치 시뮬레이터 (추정치)
          </h3>
          <p className="ims-section-desc">
            연재 회차·완독률·유료 전환율·글로벌 번역 언어·2차 확장 옵션을 투명한 가중치 공식으로
            계산해 예상 범위와 가치 상승 레버 Top 3를 보여 줍니다.
          </p>
        </div>
      </div>

      <div className="ims-ip-controls">
        <div className="ims-field-box">
          <label htmlFor="ims-ip-episodes" className="ims-range-label">
            <span>연재 회차 수</span>
            <span className="ims-num">{report.sanitizedInput.episodeCount}화</span>
          </label>
          <input
            id="ims-ip-episodes"
            data-testid="ims-ip-episodes"
            className="ims-range"
            type="range"
            min={5}
            max={200}
            step={5}
            value={report.sanitizedInput.episodeCount}
            onChange={(event) => onUpdateInput({ episodeCount: Number(event.target.value) })}
          />
        </div>

        <div className="ims-field-box">
          <label htmlFor="ims-ip-completion" className="ims-range-label">
            <span>평균 완독률</span>
            <span className="ims-num">{report.sanitizedInput.completionRatePercent}%</span>
          </label>
          <input
            id="ims-ip-completion"
            data-testid="ims-ip-completion"
            className="ims-range"
            type="range"
            min={20}
            max={100}
            step={1}
            value={report.sanitizedInput.completionRatePercent}
            onChange={(event) =>
              onUpdateInput({ completionRatePercent: Number(event.target.value) })
            }
          />
        </div>

        <div className="ims-field-box">
          <label htmlFor="ims-ip-conversion" className="ims-range-label">
            <span>유료 전환율</span>
            <span className="ims-num">{report.sanitizedInput.paidConversionRatePercent}%</span>
          </label>
          <input
            id="ims-ip-conversion"
            data-testid="ims-ip-conversion"
            className="ims-range"
            type="range"
            min={1}
            max={25}
            step={0.5}
            value={report.sanitizedInput.paidConversionRatePercent}
            onChange={(event) =>
              onUpdateInput({ paidConversionRatePercent: Number(event.target.value) })
            }
          />
        </div>

        <div className="ims-field-box">
          <label htmlFor="ims-ip-languages" className="ims-range-label">
            <span>글로벌 번역 언어 수</span>
            <span className="ims-num">{report.sanitizedInput.globalLanguageCount}개 언어</span>
          </label>
          <input
            id="ims-ip-languages"
            data-testid="ims-ip-languages"
            className="ims-range"
            type="range"
            min={1}
            max={10}
            step={1}
            value={report.sanitizedInput.globalLanguageCount}
            onChange={(event) =>
              onUpdateInput({ globalLanguageCount: Number(event.target.value) })
            }
          />
        </div>
      </div>

      <div className="ims-btn-row" role="group" aria-label="2차 IP 확장 옵션">
        {SECONDARY_EXPANSION_SPECS.map((spec) => {
          const active = report.sanitizedInput.secondaryExpansions.includes(spec.id);
          return (
            <button
              key={spec.id}
              type="button"
              className={`ims-btn ${active ? "ims-btn-active" : ""}`}
              data-testid={`ims-expansion-${spec.id}`}
              aria-pressed={active}
              onClick={() => onToggleExpansion(spec.id)}
            >
              <span>{spec.label}</span>
              <span className="ims-num">+{Math.round(spec.weightBonus * 100)}%</span>
            </button>
          );
        })}
      </div>

      <div className="ims-valuation-grid">
        <div className="ims-val-card" data-testid="ims-val-conservative">
          <span className="ims-theme-btn-sub">보수 추정치 (×0.72)</span>
          <strong className="ims-val-amount ims-num">
            {formatKrwMan(report.conservativeKrwMan)}
          </strong>
        </div>
        <div className="ims-val-card ims-val-card-primary" data-testid="ims-val-base">
          <span className="ims-theme-btn-sub">기본 추정치 (공식 합산)</span>
          <strong className="ims-val-amount ims-num">{formatKrwMan(report.baseKrwMan)}</strong>
        </div>
        <div className="ims-val-card" data-testid="ims-val-optimistic">
          <span className="ims-theme-btn-sub">낙관 추정치 (×1.38)</span>
          <strong className="ims-val-amount ims-num">
            {formatKrwMan(report.optimisticKrwMan)}
          </strong>
        </div>
      </div>

      <p className="ims-estimate-note ims-num" data-testid="ims-ip-formula-note">
        공식 공개: 회차 기준({formatKrwMan(report.formula.baseEpisodeAssetKrwMan)}) × 완독(
        {report.formula.completionMultiplier}x) × 유료전환(
        {report.formula.paidConversionMultiplier}x) × 글로벌(
        {report.formula.globalLanguageMultiplier}x) × 2차확장(
        {report.formula.secondaryExpansionMultiplier}x). {report.estimateNotice}
      </p>

      <div>
        <h4
          className="ims-section-title"
          style={{ fontSize: "0.9375rem", marginBottom: "0.5rem" }}
        >
          가치 상승 레버 Top 3 (현재 지표 기준 민감도 시뮬레이션)
        </h4>
        <ol className="ims-lever-list" data-testid="ims-ip-top-levers">
          {report.topLevers.map((lever, index) => (
            <li key={lever.id} className="ims-lever-card" data-testid={`ims-lever-${index + 1}`}>
              <div className="ims-recipe-head">
                <strong>
                  {index + 1}. {lever.title}
                </strong>
                <span className="ims-kbd ims-num">
                  +{formatKrwMan(lever.deltaBaseKrwMan)} (+{lever.deltaPercent}%)
                </span>
              </div>
              <p className="ims-section-desc">{lever.actionDetail}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
