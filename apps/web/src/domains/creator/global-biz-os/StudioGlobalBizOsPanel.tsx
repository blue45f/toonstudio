import { Calculator, Clapperboard, Globe2, Scale, Sparkles } from "lucide-react";
import { useState } from "react";

import { StudioBepTabView, StudioCrossBorderTaxTabView } from "./StudioBepAndTaxTabs";
import {
  StudioFandomIpTabView,
  StudioStoryboardOmnibusTabView,
} from "./StudioFandomAndStoryboardTabs";
import {
  DEFAULT_FANDOM_LEDGER_SEED,
  DEFAULT_WEBNOVEL_SAMPLE,
  FANDOM_LICENSE_TIERS,
  buildOmnibusVirtualStudioPreset,
  createFandomLicenseLedgerEntry,
  directNovelToStoryboard,
  dispatchOmnibusStudioPreset,
  exportFandomLedgerCsv,
  rebalanceFandomSplitShares,
  validateFandomSplitInvariant,
  type DirectedStoryboardShot,
  type FandomLicenseLedgerEntry,
  type FandomLicenseTierId,
  type FandomRevenueSplitShares,
  type OmnibusVirtualStudioPresetPayload,
  type StoryboardDirectorStyle,
} from "./fandom-ip-storyboard-omnibus-engine";
import "./global-biz-os.css";
import {
  DEFAULT_CROSS_BORDER_INPUT,
  DEFAULT_STUDIO_BEP_INPUT,
  STUDIO_BEP_PRESETS,
  TAX_JURISDICTION_RULES,
  calculateCrossBorderSettlement,
  exportCrossBorderStatementCsv,
  exportCrossBorderStatementJson,
  simulateStudioBep,
  type CrossBorderRevenueLineInput,
  type CrossBorderSettlementInput,
  type StudioBepSimulationInput,
  type TaxJurisdictionCode,
} from "./studio-bep-crossborder-tax-engine";

export type GlobalBizOsTabId = "bep" | "tax" | "fandom" | "storyboard";

export interface StudioGlobalBizOsPanelProps {
  readonly initialTab?: GlobalBizOsTabId;
}

function triggerTextDownload(filename: string, content: string, mimeType: string): void {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return;
  }
  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(objectUrl);
}

const TAB_ITEMS: readonly { readonly id: GlobalBizOsTabId; readonly labelKo: string }[] = [
  { id: "bep", labelKo: "원가 · 손익(BEP)" },
  { id: "tax", labelKo: "글로벌 세무 · 정산" },
  { id: "fandom", labelKo: "팬덤 IP 수익 쉐어" },
  { id: "storyboard", labelKo: "소설→스토리보드 · 옴니버스" },
];

export function StudioGlobalBizOsPanel({ initialTab = "bep" }: StudioGlobalBizOsPanelProps) {
  const [activeTab, setActiveTab] = useState<GlobalBizOsTabId>(initialTab);

  const [bepInput, setBepInput] = useState<StudioBepSimulationInput>(DEFAULT_STUDIO_BEP_INPUT);
  const [activePresetId, setActivePresetId] = useState<string>(
    STUDIO_BEP_PRESETS[0]?.id ?? "mid-studio-6",
  );

  const [taxInput, setTaxInput] = useState<CrossBorderSettlementInput>(DEFAULT_CROSS_BORDER_INPUT);
  const [taxExportFormat, setTaxExportFormat] = useState<"csv" | "json">("csv");
  const [newJurisdiction, setNewJurisdiction] = useState<TaxJurisdictionCode>("VN");

  const [fandomTierId, setFandomTierId] = useState<FandomLicenseTierId>(
    "approved-small-batch-goods",
  );
  const [derivativeProjectTitle, setDerivativeProjectTitle] = useState("밤우편 에디션 엽서 세트");
  const [derivativeCreatorName, setDerivativeCreatorName] = useState("스튜디오 별빛");
  const [fandomUnitsSold, setFandomUnitsSold] = useState(200);
  const [fandomGrossSalesKrw, setFandomGrossSalesKrw] = useState(3_000_000);
  const [fandomProductionDeductionKrw, setFandomProductionDeductionKrw] = useState(600_000);
  const [fandomShares, setFandomShares] = useState<FandomRevenueSplitShares>(
    FANDOM_LICENSE_TIERS["approved-small-batch-goods"].defaultShares,
  );
  const [fandomEntries, setFandomEntries] = useState<readonly FandomLicenseLedgerEntry[]>(
    DEFAULT_FANDOM_LEDGER_SEED,
  );
  const [fandomStatusBanner, setFandomStatusBanner] = useState<string | null>(null);
  const [showFandomCsvPreview, setShowFandomCsvPreview] = useState(false);

  const [episodeLabel, setEpisodeLabel] = useState("12화 · 비 내리는 새벽");
  const [directorStyle, setDirectorStyle] = useState<StoryboardDirectorStyle>("cinematic-drama");
  const [novelText, setNovelText] = useState(DEFAULT_WEBNOVEL_SAMPLE);
  const [syncSequence, setSyncSequence] = useState(0);
  const [syncedPreset, setSyncedPreset] = useState<OmnibusVirtualStudioPresetPayload | null>(null);

  const bepResult = simulateStudioBep(bepInput);
  const taxStatement = calculateCrossBorderSettlement(taxInput);
  const taxExportText =
    taxExportFormat === "csv"
      ? exportCrossBorderStatementCsv(taxStatement)
      : exportCrossBorderStatementJson(taxStatement);

  const fandomInvariant = validateFandomSplitInvariant(fandomShares);
  const fandomPreviewEntry = createFandomLicenseLedgerEntry({
    workTitle: bepInput.seriesTitle,
    derivativeProjectTitle,
    derivativeCreatorName,
    tierId: fandomTierId,
    unitsSold: fandomUnitsSold,
    grossSalesKrw: fandomGrossSalesKrw,
    productionCostDeductionKrw: fandomProductionDeductionKrw,
    shares: fandomShares,
    recordedDate: "2026-10-24",
  });
  const fandomCsvText = exportFandomLedgerCsv(fandomEntries);

  const storyboardPlan = directNovelToStoryboard({
    episodeLabel,
    novelText,
    directorStyle,
  });

  function handleSelectPreset(presetId: string): void {
    const preset = STUDIO_BEP_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setActivePresetId(preset.id);
    setBepInput(preset.input);
  }

  function handleProcessUnitCostChange(processId: string, unitCostKrw: number): void {
    setBepInput((prev) => ({
      ...prev,
      processCosts: prev.processCosts.map((item) =>
        item.id === processId ? { ...item, unitCostKrw } : item,
      ),
    }));
  }

  function handleAddTaxLine(): void {
    const rule = TAX_JURISDICTION_RULES[newJurisdiction];
    const defaultGross =
      rule.defaultCurrency === "KRW"
        ? 5_000_000
        : rule.defaultCurrency === "VND"
          ? 45_000_000
          : rule.defaultCurrency === "IDR"
            ? 30_000_000
            : 2_500;
    const nextLine: CrossBorderRevenueLineInput = {
      id: `line-${newJurisdiction.toLowerCase()}-${taxInput.lines.length + 1}`,
      platformLabel: `${rule.countryKo} 글로벌 플랫폼`,
      jurisdiction: rule.code,
      sourceCurrency: rule.defaultCurrency,
      grossAmountSource: defaultGross,
      treatyDocumentSubmitted: true,
    };
    setTaxInput((prev) => ({ ...prev, lines: [...prev.lines, nextLine] }));
  }

  function handleUpdateTaxLine(
    lineId: string,
    patch: Partial<CrossBorderRevenueLineInput>,
  ): void {
    setTaxInput((prev) => ({
      ...prev,
      lines: prev.lines.map((line) => (line.id === lineId ? { ...line, ...patch } : line)),
    }));
  }

  function handleRemoveTaxLine(lineId: string): void {
    setTaxInput((prev) => ({
      ...prev,
      lines: prev.lines.filter((line) => line.id !== lineId),
    }));
  }

  function handleSelectFandomTier(tierId: FandomLicenseTierId): void {
    setFandomTierId(tierId);
    setFandomShares(FANDOM_LICENSE_TIERS[tierId].defaultShares);
    setFandomStatusBanner(null);
    if (tierId === "non-commercial-fanart") {
      setFandomUnitsSold(0);
      setFandomGrossSalesKrw(0);
      setFandomProductionDeductionKrw(0);
    }
  }

  function handleRegisterFandomEntry(): void {
    const entry = fandomPreviewEntry;
    if (
      entry.status === "blocked-split-invariant" ||
      entry.status === "blocked-non-commercial-policy"
    ) {
      setFandomStatusBanner(entry.statusMessageKo);
      return;
    }
    setFandomEntries((prev) => [entry, ...prev]);
    setFandomStatusBanner(`${entry.ledgerCode} 등록 완료 — ${entry.statusMessageKo}`);
  }

  function handleSyncShotToOmnibus(shot: DirectedStoryboardShot): void {
    const nextSeq = syncSequence + 1;
    const payload = buildOmnibusVirtualStudioPreset({
      episodeLabel: storyboardPlan.episodeLabel,
      directorStyle: storyboardPlan.directorStyle,
      shot,
      syncSequence: nextSeq,
    });
    dispatchOmnibusStudioPreset(payload);
    setSyncSequence(nextSeq);
    setSyncedPreset(payload);
  }

  return (
    <section
      className="gbiz-shell"
      data-testid="studio-global-biz-os-panel"
      aria-label="스튜디오 제작경영 · 글로벌 세무 · 팬덤 IP · 스토리보드 디렉터"
    >
      <header className="gbiz-header">
        <div>
          <h3 className="gbiz-title">
            스튜디오 제작경영 · 글로벌 정산 · IP 수익 쉐어 · 스토리보드 디렉터
          </h3>
          <p className="gbiz-subtitle">
            외부 과금 없는 ₩0 결정론 엔진으로 회차별 손익분기(BEP), 7개국 원천징수 정산서, 팬덤 2차 창작 100% 분배 원장, 웹소설→가상 스튜디오 촬영 프리셋을 한곳에서 점검합니다.
          </p>
        </div>
        <span className="gbiz-zero-badge">
          <Sparkles className="size-3.5" aria-hidden="true" />
          ₩0 로컬 결정론 엔진
        </span>
      </header>

      <div className="gbiz-tablist" role="tablist" aria-label="스튜디오 경영 및 연출 도구">
        {TAB_ITEMS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`gbiz-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`gbiz-panel-${tab.id}`}
            data-testid={`gbiz-tab-${tab.id}`}
            className="gbiz-tab"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.id === "bep" ? <Calculator className="size-4" aria-hidden="true" /> : null}
            {tab.id === "tax" ? <Globe2 className="size-4" aria-hidden="true" /> : null}
            {tab.id === "fandom" ? <Scale className="size-4" aria-hidden="true" /> : null}
            {tab.id === "storyboard" ? <Clapperboard className="size-4" aria-hidden="true" /> : null}
            <span>{tab.labelKo}</span>
          </button>
        ))}
      </div>

      {activeTab === "bep" ? (
        <StudioBepTabView
          bepInput={bepInput}
          bepResult={bepResult}
          activePresetId={activePresetId}
          onSelectPreset={handleSelectPreset}
          onChangeInput={setBepInput}
          onChangeProcessUnitCost={handleProcessUnitCostChange}
        />
      ) : null}

      {activeTab === "tax" ? (
        <StudioCrossBorderTaxTabView
          taxInput={taxInput}
          taxStatement={taxStatement}
          taxExportFormat={taxExportFormat}
          taxExportText={taxExportText}
          newJurisdiction={newJurisdiction}
          onChangeTaxInput={setTaxInput}
          onChangeExportFormat={setTaxExportFormat}
          onChangeNewJurisdiction={setNewJurisdiction}
          onAddLine={handleAddTaxLine}
          onUpdateLine={handleUpdateTaxLine}
          onRemoveLine={handleRemoveTaxLine}
          onDownloadStatement={() =>
            triggerTextDownload(
              `crossborder-settlement-${taxStatement.settlementPeriod}.${taxExportFormat}`,
              taxExportText,
              taxExportFormat === "csv"
                ? "text/csv;charset=utf-8"
                : "application/json;charset=utf-8",
            )
          }
        />
      ) : null}

      {activeTab === "fandom" ? (
        <StudioFandomIpTabView
          fandomTierId={fandomTierId}
          derivativeProjectTitle={derivativeProjectTitle}
          derivativeCreatorName={derivativeCreatorName}
          fandomUnitsSold={fandomUnitsSold}
          fandomGrossSalesKrw={fandomGrossSalesKrw}
          fandomShares={fandomShares}
          fandomInvariant={fandomInvariant}
          fandomPreviewEntry={fandomPreviewEntry}
          fandomEntries={fandomEntries}
          fandomStatusBanner={fandomStatusBanner}
          showFandomCsvPreview={showFandomCsvPreview}
          fandomCsvText={fandomCsvText}
          onSelectTier={handleSelectFandomTier}
          onChangeProjectTitle={setDerivativeProjectTitle}
          onChangeCreatorName={setDerivativeCreatorName}
          onChangeUnitsSold={setFandomUnitsSold}
          onChangeGrossSales={setFandomGrossSalesKrw}
          onChangeShares={setFandomShares}
          onRebalanceShares={() => setFandomShares((prev) => rebalanceFandomSplitShares(prev))}
          onRegisterEntry={handleRegisterFandomEntry}
          onToggleCsvPreview={() => setShowFandomCsvPreview((prev) => !prev)}
        />
      ) : null}

      {activeTab === "storyboard" ? (
        <StudioStoryboardOmnibusTabView
          episodeLabel={episodeLabel}
          directorStyle={directorStyle}
          novelText={novelText}
          storyboardPlan={storyboardPlan}
          syncedPreset={syncedPreset}
          onChangeEpisodeLabel={setEpisodeLabel}
          onChangeDirectorStyle={setDirectorStyle}
          onChangeNovelText={setNovelText}
          onSyncShot={handleSyncShotToOmnibus}
        />
      ) : null}
    </section>
  );
}

export default StudioGlobalBizOsPanel;
