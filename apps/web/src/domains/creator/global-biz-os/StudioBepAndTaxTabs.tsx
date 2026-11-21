import { Download, Plus, ShieldAlert, Trash2 } from "lucide-react";

import {
  CURRENCY_LIST,
  CURRENCY_SPECS,
  STUDIO_BEP_PRESETS,
  TAX_JURISDICTION_LIST,
  TAX_LEGAL_REVIEW_NOTICE_KO,
  formatCurrencyAmount,
  type CrossBorderRevenueLineInput,
  type CrossBorderSettlementInput,
  type CrossBorderSettlementStatement,
  type SettlementCurrencyCode,
  type StudioBepSimulationInput,
  type StudioBepSimulationResult,
  type TaxJurisdictionCode,
} from "./studio-bep-crossborder-tax-engine";

function parseNumericInput(raw: string, fallback = 0): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface StudioBepTabViewProps {
  readonly bepInput: StudioBepSimulationInput;
  readonly bepResult: StudioBepSimulationResult;
  readonly activePresetId: string;
  readonly onSelectPreset: (presetId: string) => void;
  readonly onChangeInput: (updater: (prev: StudioBepSimulationInput) => StudioBepSimulationInput) => void;
  readonly onChangeProcessUnitCost: (processId: string, unitCostKrw: number) => void;
}

export function StudioBepTabView({
  bepInput,
  bepResult,
  activePresetId,
  onSelectPreset,
  onChangeInput,
  onChangeProcessUnitCost,
}: StudioBepTabViewProps) {
  const milestones = [
    bepResult.episodeSchedule[0],
    bepResult.episodeSchedule[Math.min(9, bepResult.episodeSchedule.length - 1)],
    bepResult.bepEpisode ? bepResult.episodeSchedule[bepResult.bepEpisode - 1] : undefined,
    bepResult.episodeSchedule[bepResult.episodeSchedule.length - 1],
  ].filter(
    (point, idx, arr): point is NonNullable<typeof point> =>
      point !== undefined && arr.findIndex((other) => other?.episode === point.episode) === idx,
  );

  return (
    <div
      id="gbiz-panel-bep"
      role="tabpanel"
      aria-labelledby="gbiz-tab-bep"
      className="gbiz-panel"
      data-testid="gbiz-panel-bep"
    >
      <div className="gbiz-btn-row" role="group" aria-label="스튜디오 원가 프리셋">
        {STUDIO_BEP_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="gbiz-btn"
            data-active={activePresetId === preset.id ? "true" : "false"}
            onClick={() => onSelectPreset(preset.id)}
          >
            <span>{preset.labelKo}</span>
            <span>({preset.summaryKo})</span>
          </button>
        ))}
      </div>

      <div className="gbiz-kpi-grid">
        <div className="gbiz-kpi">
          <span className="gbiz-kpi-label">회차당 제작 원가</span>
          <strong className="gbiz-kpi-value" data-testid="bep-cost-per-episode">
            {formatCurrencyAmount(bepResult.costPerEpisodeKrw, "KRW")}
          </strong>
          <span className="gbiz-kpi-hint">
            컷당 {formatCurrencyAmount(bepResult.costPerCutKrw, "KRW")} · {bepResult.cutsPerEpisode}컷 기준
          </span>
        </div>
        <div className="gbiz-kpi">
          <span className="gbiz-kpi-label">정확 손익분기(BEP) 도달</span>
          <strong
            className="gbiz-kpi-value"
            data-testid="bep-reach-episode"
            data-tone={bepResult.bepEpisode !== null ? "good" : "bad"}
          >
            {bepResult.bepEpisode !== null
              ? `${bepResult.bepEpisode}화 (정밀 ${bepResult.exactBepEpisode ?? bepResult.bepEpisode}화)`
              : "미도달"}
          </strong>
          <span className="gbiz-kpi-hint">
            회차 수익 {formatCurrencyAmount(bepResult.effectiveStudioRevenuePerEpisodeKrw, "KRW")}
          </span>
        </div>
        <div className="gbiz-kpi">
          <span className="gbiz-kpi-label">누적 투자 회수율</span>
          <strong
            className="gbiz-kpi-value"
            data-testid="bep-recovery-rate"
            data-tone={bepResult.cumulativeRecoveryRatePercent >= 100 ? "good" : "warn"}
          >
            {bepResult.cumulativeRecoveryRatePercent}%
          </strong>
          <span className="gbiz-kpi-hint">
            MG 회수율 {bepResult.mgRecoupmentRatePercent}% (
            {bepResult.mgRecoupmentStatus === "recouped"
              ? "회수 완료"
              : bepResult.mgRecoupmentStatus === "unrecouped"
                ? "미회수"
                : "순수 RS"}
            )
          </span>
        </div>
        <div className="gbiz-kpi">
          <span className="gbiz-kpi-label">예상 순이익률 ({bepResult.plannedEpisodes}화)</span>
          <strong
            className="gbiz-kpi-value"
            data-testid="bep-net-margin"
            data-tone={bepResult.expectedNetMarginPercent >= 0 ? "good" : "bad"}
          >
            {bepResult.expectedNetMarginPercent}%
          </strong>
          <span className="gbiz-kpi-hint">
            누적 순이익 {formatCurrencyAmount(bepResult.totalNetProfitKrw, "KRW")}
          </span>
        </div>
      </div>

      <div
        className="gbiz-banner"
        data-tone={bepResult.bepEpisode !== null ? "good" : "warn"}
        data-testid="bep-diagnosis-banner"
      >
        {bepResult.diagnosisKo}
      </div>

      <div className="gbiz-split-layout">
        <div className="gbiz-card">
          <h4 className="gbiz-card-title">연재 규모 · 수익 배분 · 독자 전환 입력</h4>
          <div className="gbiz-field-grid">
            <label className="gbiz-field">
              <span>연재 회차 수</span>
              <input
                type="number"
                min={1}
                max={300}
                className="gbiz-input"
                value={bepInput.plannedEpisodes}
                onChange={(e) =>
                  onChangeInput((prev) => ({
                    ...prev,
                    plannedEpisodes: parseNumericInput(e.target.value, 1),
                  }))
                }
              />
            </label>
            <label className="gbiz-field">
              <span>회차당 컷 수</span>
              <input
                type="number"
                min={10}
                max={240}
                className="gbiz-input"
                value={bepInput.cutsPerEpisode}
                onChange={(e) =>
                  onChangeInput((prev) => ({
                    ...prev,
                    cutsPerEpisode: parseNumericInput(e.target.value, 10),
                  }))
                }
              />
            </label>
            <label className="gbiz-field">
              <span>초기 런칭 선투자비 (KRW)</span>
              <input
                type="number"
                min={0}
                step={500000}
                className="gbiz-input"
                value={bepInput.initialSetupCostKrw}
                onChange={(e) =>
                  onChangeInput((prev) => ({
                    ...prev,
                    initialSetupCostKrw: parseNumericInput(e.target.value, 0),
                  }))
                }
              />
            </label>
            <label className="gbiz-field">
              <span>플랫폼 MG 최소보장/회차 (KRW)</span>
              <input
                type="number"
                min={0}
                step={100000}
                className="gbiz-input"
                value={bepInput.platformMgPerEpisodeKrw}
                onChange={(e) =>
                  onChangeInput((prev) => ({
                    ...prev,
                    platformMgPerEpisodeKrw: parseNumericInput(e.target.value, 0),
                  }))
                }
              />
            </label>
            <label className="gbiz-field">
              <span>플랫폼 RS 배분율 (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                className="gbiz-input"
                value={bepInput.platformRsRatePercent}
                onChange={(e) =>
                  onChangeInput((prev) => ({
                    ...prev,
                    platformRsRatePercent: parseNumericInput(e.target.value, 0),
                  }))
                }
              />
            </label>
            <label className="gbiz-field">
              <span>회차당 평균 열람 독자 수</span>
              <input
                type="number"
                min={0}
                step={1000}
                className="gbiz-input"
                value={bepInput.avgReadersPerEpisode}
                onChange={(e) =>
                  onChangeInput((prev) => ({
                    ...prev,
                    avgReadersPerEpisode: parseNumericInput(e.target.value, 0),
                  }))
                }
              />
            </label>
            <label className="gbiz-field">
              <span>유료 결제 전환율 (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                className="gbiz-input"
                value={bepInput.paidConversionRatePercent}
                onChange={(e) =>
                  onChangeInput((prev) => ({
                    ...prev,
                    paidConversionRatePercent: parseNumericInput(e.target.value, 0),
                  }))
                }
              />
            </label>
            <label className="gbiz-field">
              <span>유료 독자 객단가 (KRW)</span>
              <input
                type="number"
                min={0}
                step={100}
                className="gbiz-input"
                value={bepInput.arpuPerEpisodeKrw}
                onChange={(e) =>
                  onChangeInput((prev) => ({
                    ...prev,
                    arpuPerEpisodeKrw: parseNumericInput(e.target.value, 0),
                  }))
                }
              />
            </label>
          </div>
          <label className="gbiz-checkbox-row">
            <input
              type="checkbox"
              checked={bepInput.mgRecoupmentEnabled}
              onChange={(e) =>
                onChangeInput((prev) => ({ ...prev, mgRecoupmentEnabled: e.target.checked }))
              }
            />
            <span>MG 선인세 회수 구조 적용 (RS가 MG 초과 시 추가 정산)</span>
          </label>
        </div>

        <div className="gbiz-card">
          <h4 className="gbiz-card-title">공정별 외주비 · 어시스턴트 원가 및 마일스톤</h4>
          <div className="gbiz-table-wrap">
            <table className="gbiz-table">
              <thead>
                <tr>
                  <th>공정</th>
                  <th>기준</th>
                  <th>단가(KRW)</th>
                  <th>회차 원가</th>
                </tr>
              </thead>
              <tbody>
                {bepInput.processCosts.map((item) => {
                  const row = bepResult.processBreakdown.find((b) => b.id === item.id);
                  return (
                    <tr key={item.id}>
                      <td>{item.labelKo}</td>
                      <td>{item.pricingMode === "per-cut" ? "컷당" : "회차 정액"}</td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={item.pricingMode === "per-cut" ? 1000 : 50000}
                          aria-label={`${item.labelKo} 단가`}
                          className="gbiz-input"
                          value={item.unitCostKrw}
                          onChange={(e) =>
                            onChangeProcessUnitCost(item.id, parseNumericInput(e.target.value, 0))
                          }
                        />
                      </td>
                      <td>
                        {formatCurrencyAmount(row?.episodeCostKrw ?? 0, "KRW")} ({row?.sharePercent ?? 0}%)
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="gbiz-table-wrap">
            <table className="gbiz-table" aria-label="회차별 손익 마일스톤">
              <thead>
                <tr>
                  <th>회차</th>
                  <th>누적 원가</th>
                  <th>누적 스튜디오 수익</th>
                  <th>회수율</th>
                </tr>
              </thead>
              <tbody>
                {milestones.map((point) => (
                  <tr key={point.episode}>
                    <td>{point.episode}화</td>
                    <td>{formatCurrencyAmount(point.cumulativeCostKrw, "KRW")}</td>
                    <td>{formatCurrencyAmount(point.cumulativeStudioRevenueKrw, "KRW")}</td>
                    <td>
                      <div>{point.cumulativeRecoveryRatePercent}%</div>
                      <div className="gbiz-bar-track">
                        <div
                          className="gbiz-bar-fill"
                          data-tone={point.cumulativeRecoveryRatePercent >= 100 ? "good" : "warn"}
                          style={{ width: `${Math.min(100, point.cumulativeRecoveryRatePercent)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface StudioCrossBorderTaxTabViewProps {
  readonly taxInput: CrossBorderSettlementInput;
  readonly taxStatement: CrossBorderSettlementStatement;
  readonly taxExportFormat: "csv" | "json";
  readonly taxExportText: string;
  readonly newJurisdiction: TaxJurisdictionCode;
  readonly onChangeTaxInput: (
    updater: (prev: CrossBorderSettlementInput) => CrossBorderSettlementInput,
  ) => void;
  readonly onChangeExportFormat: (format: "csv" | "json") => void;
  readonly onChangeNewJurisdiction: (code: TaxJurisdictionCode) => void;
  readonly onAddLine: () => void;
  readonly onUpdateLine: (lineId: string, patch: Partial<CrossBorderRevenueLineInput>) => void;
  readonly onRemoveLine: (lineId: string) => void;
  readonly onDownloadStatement: () => void;
}

export function StudioCrossBorderTaxTabView({
  taxInput,
  taxStatement,
  taxExportFormat,
  taxExportText,
  newJurisdiction,
  onChangeTaxInput,
  onChangeExportFormat,
  onChangeNewJurisdiction,
  onAddLine,
  onUpdateLine,
  onRemoveLine,
  onDownloadStatement,
}: StudioCrossBorderTaxTabViewProps) {
  return (
    <div
      id="gbiz-panel-tax"
      role="tabpanel"
      aria-labelledby="gbiz-tab-tax"
      className="gbiz-panel"
      data-testid="gbiz-panel-tax"
    >
      <div className="gbiz-banner" data-tone="warn" data-testid="tax-legal-notice-badge">
        <div className="gbiz-btn-row">
          <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
          <strong>{TAX_LEGAL_REVIEW_NOTICE_KO}</strong>
        </div>
      </div>

      <div className="gbiz-kpi-grid">
        <div className="gbiz-kpi">
          <span className="gbiz-kpi-label">총 환산 매출 (KRW)</span>
          <strong className="gbiz-kpi-value" data-testid="tax-total-gross">
            {formatCurrencyAmount(taxStatement.totalGrossKrw, "KRW")}
          </strong>
          <span className="gbiz-kpi-hint">{taxStatement.lines.length}개 국가·플랫폼 합산</span>
        </div>
        <div className="gbiz-kpi">
          <span className="gbiz-kpi-label">원천징수 세액</span>
          <strong className="gbiz-kpi-value" data-testid="tax-total-withholding" data-tone="warn">
            {formatCurrencyAmount(taxStatement.totalWithholdingTaxKrw, "KRW")}
          </strong>
          <span className="gbiz-kpi-hint">
            실효 원천징수율 {taxStatement.effectiveWithholdingRatePercent}%
          </span>
        </div>
        <div className="gbiz-kpi">
          <span className="gbiz-kpi-label">
            최종 실수령액 ({CURRENCY_SPECS[taxStatement.payoutCurrency].labelKo})
          </span>
          <strong className="gbiz-kpi-value" data-testid="tax-total-net" data-tone="good">
            {formatCurrencyAmount(taxStatement.totalNetInPayoutCurrency, taxStatement.payoutCurrency)}
          </strong>
          <span className="gbiz-kpi-hint">
            KRW 기준 {formatCurrencyAmount(taxStatement.totalNetKrw, "KRW")}
          </span>
        </div>
        <div className="gbiz-kpi">
          <span className="gbiz-kpi-label">외국납부세액공제 검토 대상</span>
          <strong className="gbiz-kpi-value" data-testid="tax-foreign-credit">
            {formatCurrencyAmount(taxStatement.totalForeignTaxCreditEligibleKrw, "KRW")}
          </strong>
          <span className="gbiz-kpi-hint">
            해외 송금 수수료 {formatCurrencyAmount(taxStatement.totalTransferFeeKrw, "KRW")}
          </span>
        </div>
      </div>

      <div className="gbiz-card">
        <div className="gbiz-field-grid">
          <label className="gbiz-field">
            <span>정산 월</span>
            <input
              type="text"
              className="gbiz-input"
              value={taxInput.settlementPeriod}
              onChange={(e) =>
                onChangeTaxInput((prev) => ({ ...prev, settlementPeriod: e.target.value }))
              }
            />
          </label>
          <label className="gbiz-field">
            <span>최종 수취 정산 통화</span>
            <select
              aria-label="최종 수취 정산 통화"
              className="gbiz-select"
              value={taxInput.payoutCurrency}
              onChange={(e) =>
                onChangeTaxInput((prev) => ({
                  ...prev,
                  payoutCurrency: e.target.value as SettlementCurrencyCode,
                }))
              }
            >
              {CURRENCY_LIST.map((spec) => (
                <option key={spec.code} value={spec.code}>
                  {spec.labelKo} (기준 1{spec.code} = ₩{spec.referenceRateToKrw})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="gbiz-btn-row">
          <select
            aria-label="추가할 국가 선택"
            className="gbiz-select"
            style={{ maxWidth: "240px" }}
            value={newJurisdiction}
            onChange={(e) => onChangeNewJurisdiction(e.target.value as TaxJurisdictionCode)}
          >
            {TAX_JURISDICTION_LIST.map((rule) => (
              <option key={rule.code} value={rule.code}>
                {rule.code} · {rule.countryKo} ({rule.treatyWithholdingRatePercent}%)
              </option>
            ))}
          </select>
          <button
            type="button"
            className="gbiz-btn"
            data-testid="tax-add-line-btn"
            onClick={onAddLine}
          >
            <Plus className="size-4" aria-hidden="true" />
            국가 매출 행 추가
          </button>
        </div>

        <div className="gbiz-table-wrap">
          <table className="gbiz-table" aria-label="국가별 크로스보더 원천징수 정산표">
            <thead>
              <tr>
                <th>국가 · 플랫폼</th>
                <th>통화</th>
                <th>원천 매출</th>
                <th>조세조약 서류</th>
                <th>세율</th>
                <th>원천징수(KRW)</th>
                <th>실수령({taxStatement.payoutCurrency})</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {taxStatement.lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    <strong>{line.jurisdiction}</strong> · {line.platformLabel}
                  </td>
                  <td>{line.sourceCurrency}</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      aria-label={`${line.platformLabel} 원천 매출`}
                      className="gbiz-input"
                      value={line.grossAmountSource}
                      onChange={(e) =>
                        onUpdateLine(line.id, {
                          grossAmountSource: parseNumericInput(e.target.value, 0),
                        })
                      }
                    />
                  </td>
                  <td>
                    {line.jurisdiction === "KR" ? (
                      <span>국내 3.3%</span>
                    ) : (
                      <button
                        type="button"
                        className="gbiz-btn"
                        onClick={() =>
                          onUpdateLine(line.id, {
                            treatyDocumentSubmitted: !line.treatyDocumentSubmitted,
                          })
                        }
                      >
                        {line.treatyDocumentSubmitted ? "제출 완료" : "미제출(법정)"}
                      </button>
                    )}
                  </td>
                  <td>{line.withholdingRatePercent}%</td>
                  <td>{formatCurrencyAmount(line.withholdingTaxKrw, "KRW")}</td>
                  <td>{formatCurrencyAmount(line.netInPayoutCurrency, taxStatement.payoutCurrency)}</td>
                  <td>
                    <button
                      type="button"
                      className="gbiz-btn"
                      aria-label={`${line.platformLabel} 삭제`}
                      onClick={() => onRemoveLine(line.id)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="gbiz-btn-row">
          <button
            type="button"
            className="gbiz-btn"
            data-active={taxExportFormat === "csv" ? "true" : "false"}
            onClick={() => onChangeExportFormat("csv")}
          >
            CSV 명세서 미리보기
          </button>
          <button
            type="button"
            className="gbiz-btn"
            data-active={taxExportFormat === "json" ? "true" : "false"}
            onClick={() => onChangeExportFormat("json")}
          >
            JSON 명세서 미리보기
          </button>
          <button type="button" className="gbiz-btn gbiz-btn-primary" onClick={onDownloadStatement}>
            <Download className="size-4" aria-hidden="true" />
            {taxExportFormat.toUpperCase()} 정산서 내려받기
          </button>
        </div>
        <pre className="gbiz-code-preview" data-testid="tax-statement-export-preview">
          {taxExportText}
        </pre>
      </div>
    </div>
  );
}
