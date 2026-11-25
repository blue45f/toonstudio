/**
 * Wave 60A — ToonStudio 10대 고유 브랜드 네이밍 정본 및 실시간 감사 제어판.
 *
 * - 10대 고유 포멀 브랜드 정본 카드(ToonCore ~ CalmChrome) 및 아키텍처 5계층 시맨틱 OKLCH SVG 맵
 * - 실시간 파일명·패키지명·심볼명·UI 라벨 브랜드 오염 감사기(즉시 통과/허용 예외/차단 + 원클릭 정본 적용)
 * - 2026-11-26 셸 실측 저장소 스캔 기반 무중단 4단계 레거시 전환 매트릭스 + ADR Markdown / JSON 내보내기
 */

import {
  AlertTriangle, ArrowRight, CheckCircle2, Code2, Copy, FileCheck2, FileText,
  FolderGit2, Layers, RotateCcw, Scale, Search, ShieldAlert, ShieldCheck,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  ALLOWED_EXTERNAL_REFERENCE_SCOPES, BRAND_ARCHITECTURE_LAYERS, BRAND_AUDIT_SAMPLE_PROBES,
  BRAND_REGISTRY_BASELINE_COMMIT, BRAND_REGISTRY_MEASURED_AT, EXTERNAL_NAME_DETECTION_RULES,
  MIGRATION_PHASES, REPOSITORY_SCAN_ROOTS, REPOSITORY_SCAN_SUMMARY, TOONSTUDIO_PROPRIETARY_BRANDS,
  auditProprietaryBrandNaming, exportBrandGovernanceMarkdown, exportBrandRegistryJson,
  filterMigrationEntries, formatOklch, getBrandsByLayer, getProprietaryBrand,
  type AuditInputContext, type BrandAuditVerdict, type BrandNamingAuditResult,
  type BrandRegistryExportPayload, type MigrationPhaseId, type ProprietaryBrandId,
} from "./atelier-brand-registry-engine";

export interface StudioAtelierBrandRegistryPanelProps {
  readonly initialQuery?: string;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onAuditChange?: (result: BrandNamingAuditResult) => void;
  readonly onExportJson?: (json: string, payload: BrandRegistryExportPayload) => void;
}

type ExportPreviewFormat = "markdown" | "json";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

// 탈-바이올렛 OKLCH 시맨틱 SVG 팔레트(휴 28°·42°·58°·78°·158°·175°·196°·212°·228°·242° — 270~320° 0%)
const SVG_PANEL_BG = formatOklch({ l: 0.98, c: 0.004, h: 240 }, 0.04);
const SVG_GRID_STROKE = formatOklch({ l: 0.62, c: 0.014, h: 240 }, 0.28);
const SVG_NODE_BG = formatOklch({ l: 0.97, c: 0.004, h: 240 }, 0.1);
const SVG_GOOD_INK = formatOklch({ l: 0.54, c: 0.14, h: 158 });
const SVG_WARN_INK = formatOklch({ l: 0.6, c: 0.14, h: 78 });
const SVG_BAD_INK = formatOklch({ l: 0.56, c: 0.19, h: 28 });
const SVG_COOL_INK = formatOklch({ l: 0.54, c: 0.13, h: 212 });

const CONTEXT_OPTIONS: readonly { readonly id: AuditInputContext; readonly ko: string; readonly en: string }[] = [
  { id: "auto", ko: "자동 판별", en: "Auto" },
  { id: "file-path", ko: "파일·모듈 경로", en: "File / Path" },
  { id: "symbol-name", ko: "심볼·컴포넌트", en: "Symbol" },
  { id: "ui-label", ko: "UI 제목·라벨", en: "UI Label" },
  { id: "compare-surface", ko: "/compare/studio 표", en: "/compare/studio" },
  { id: "crate-dependency", ko: "Cargo.toml 의존성", en: "Cargo.toml" },
];

const VERDICT_META: Readonly<Record<BrandAuditVerdict, { readonly badgeClass: string; readonly ko: string; readonly en: string }>> = {
  clean: { badgeClass: "border-good bg-good-soft text-good", ko: "고유 정본 통과", en: "Clean Proprietary" },
  "allowed-external-reference": { badgeClass: "border-cool bg-info-soft text-cool", ko: "정당한 외부 참조 예외", en: "Allowed External Ref" },
  "warn-consolidation-target": { badgeClass: "border-warn bg-warning-soft text-warn", ko: "AtelierCast 통합 권고", en: "Consolidate to AtelierCast" },
  "blocked-external-brand": { badgeClass: "border-bad bg-bad-soft text-bad", ko: "외부 명칭 혼입 차단", en: "Blocked External Name" },
};

const DISPOSITION_LABELS: Readonly<Record<string, { readonly ko: string; readonly en: string; readonly tone: string }>> = {
  "migrate-via-facade": { ko: "파사드 무중단 전환", en: "Facade Migration", tone: "border-accent bg-accent-soft text-accent" },
  "consolidate-surface": { ko: "단일 스튜디오 통합", en: "Surface Consolidation", tone: "border-warn bg-warning-soft text-warn" },
  "keep-vendor-exempt": { ko: "벤더 격리 예외 유지", en: "Vendor Exempt", tone: "border-cool bg-info-soft text-cool" },
  "scope-as-interop-codec": { ko: "포맷 코덱 경계 한정", en: "Interop Codec Scope", tone: "border-line-strong bg-raised text-fg-2" },
};

function BrandArchitectureLayerSvg(props: {
  readonly activeBrandId: ProprietaryBrandId | null;
  readonly auditVerdict: BrandAuditVerdict;
  readonly isEn: boolean;
}): ReactElement {
  const { activeBrandId, auditVerdict, isEn } = props;
  const verdictStroke =
    auditVerdict === "clean"
      ? SVG_GOOD_INK
      : auditVerdict === "allowed-external-reference"
        ? SVG_COOL_INK
        : auditVerdict === "warn-consolidation-target"
          ? SVG_WARN_INK
          : SVG_BAD_INK;

  return (
    <svg
      data-testid="brand-architecture-svg"
      data-violet-free="true"
      data-active-brand-id={activeBrandId ?? "all"}
      data-audit-verdict={auditVerdict}
      viewBox="0 0 720 348"
      role="img"
      aria-label={isEn ? "ToonStudio 5-layer proprietary brand architecture map" : "ToonStudio 10대 고유 브랜드 5계층 아키텍처 맵"}
      className="h-80 w-full rounded-xl border border-line-strong bg-canvas text-fg"
    >
      <rect x="0" y="0" width="720" height="348" fill={SVG_PANEL_BG} />
      <text x="18" y="24" fill="currentColor" fontSize="11.5" fontWeight="700">
        {isEn ? "ToonStudio 10 Proprietary Formal Brands · 5-Layer Architecture" : "ToonStudio 10대 고유 포멀 브랜드 · 5계층 아키텍처 정본 맵"}
      </text>
      <text x="702" y="24" textAnchor="end" fill={verdictStroke} fontSize="10" fontWeight="700">
        {isEn ? `BASELINE ${BRAND_REGISTRY_BASELINE_COMMIT}` : `기준 ${BRAND_REGISTRY_BASELINE_COMMIT} · 고정 자료`}
      </text>

      {BRAND_ARCHITECTURE_LAYERS.map((layer, layerIdx) => {
        const y = 38 + layerIdx * 56;
        const layerBrands = getBrandsByLayer(layer.id);
        const layerAccent = formatOklch(layer.accentOklch);
        const layerFill = formatOklch(layer.accentOklch, 0.08);
        const startX = 228;
        const availW = 470;
        const gap = 8;
        const boxW = Math.floor((availW - gap * (layerBrands.length - 1)) / layerBrands.length);

        return (
          <g key={layer.id}>
            <rect x="16" y={y} width="688" height="48" rx="9" fill={layerFill} stroke={SVG_GRID_STROKE} strokeWidth="1" />
            <rect x="16" y={y} width="5" height="48" rx="2.5" fill={layerAccent} />
            <text x="30" y={y + 19} fill="currentColor" fontSize="10" fontWeight="700">
              {isEn ? layer.titleEn : layer.titleKo}
            </text>
            <text x="30" y={y + 35} fill="currentColor" fillOpacity={0.7} fontSize="8.6">
              {isEn ? layer.summaryEn : layer.summaryKo}
            </text>

            {layerBrands.map((brand, bIdx) => {
              const bx = startX + bIdx * (boxW + gap);
              const isSelected = activeBrandId === brand.id;
              const brandStroke = formatOklch(brand.accentOklch);
              const brandFill = isSelected ? formatOklch(brand.accentOklch, 0.22) : SVG_NODE_BG;
              return (
                <g key={brand.id}>
                  <rect
                    x={bx} y={y + 7} width={boxW} height="34" rx="7"
                    fill={brandFill} stroke={brandStroke} strokeWidth={isSelected ? "2.2" : "1.1"}
                  />
                  <text x={bx + 9} y={y + 21} fill="currentColor" fontSize="10" fontWeight="700">
                    {brand.formalName}
                  </text>
                  <text x={bx + 9} y={y + 34} fill="currentColor" fillOpacity={0.72} fontSize="8" fontFamily="monospace">
                    {brand.slug}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}

      <line x1="16" y1="322" x2="704" y2="322" stroke={SVG_GRID_STROKE} strokeWidth="0.9" />
      <text x="18" y="338" fill="currentColor" fillOpacity={0.82} fontSize="9" fontFamily="monospace">
        {`BASELINE ${REPOSITORY_SCAN_SUMMARY.totalScannedDirs} dirs / ${REPOSITORY_SCAN_SUMMARY.totalScannedFiles} files · LEGACY ${REPOSITORY_SCAN_SUMMARY.totalMatchedDirs} dirs / ${REPOSITORY_SCAN_SUMMARY.totalMatchedFiles} files · RULES ${EXTERNAL_NAME_DETECTION_RULES.length}`}
      </text>
      <text x="702" y="338" textAnchor="end" fill={SVG_GOOD_INK} fontSize="9" fontWeight="700">
        {isEn ? "NO FORCED RENAMES · PHASED FACADE PLAN" : "강제 이름변경 금지 · 4단계 파사드 전환"}
      </text>
    </svg>
  );
}

/** ToonStudio 10대 고유 브랜드 정본 및 외부 명칭 혼입 실시간 감사 제어판. */
export function StudioAtelierBrandRegistryPanel(
  props: StudioAtelierBrandRegistryPanelProps,
): ReactElement {
  const initialQuery = props.initialQuery ?? "";
  const isEn = (props.locale ?? "ko") === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const headingId = useId();
  const queryInputId = useId();

  const [query, setQuery] = useState<string>(initialQuery);
  const [context, setContext] = useState<AuditInputContext>("auto");
  const [selectedBrandId, setSelectedBrandId] = useState<ProprietaryBrandId | "all">("all");
  const [selectedPhaseId, setSelectedPhaseId] = useState<MigrationPhaseId | "all">("all");
  const [previewFormat, setPreviewFormat] = useState<ExportPreviewFormat>("markdown");
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const auditResult = useMemo(
    () => auditProprietaryBrandNaming(query, { context }),
    [query, context],
  );

  const filteredMigrationEntries = useMemo(
    () => filterMigrationEntries({ brandId: selectedBrandId, phaseId: selectedPhaseId }),
    [selectedBrandId, selectedPhaseId],
  );

  const exportMarkdown = useMemo(
    () => exportBrandGovernanceMarkdown({ latestAudit: auditResult, selectedBrandId, selectedPhaseId }),
    [auditResult, selectedBrandId, selectedPhaseId],
  );

  const exportJsonBundle = useMemo(
    () => exportBrandRegistryJson({ latestAudit: auditResult, selectedBrandId, selectedPhaseId }),
    [auditResult, selectedBrandId, selectedPhaseId],
  );

  const highlightedBrandId: ProprietaryBrandId | null =
    selectedBrandId !== "all" ? selectedBrandId : auditResult.primaryRecommendedBrandId;

  const updateAuditQuery = (nextQuery: string, nextContext: AuditInputContext, notice?: string): void => {
    setQuery(nextQuery);
    setContext(nextContext);
    const nextResult = auditProprietaryBrandNaming(nextQuery, { context: nextContext });
    props.onAuditChange?.(nextResult);
    if (notice) setStatusMessage(notice);
  };

  const copyTextToClipboard = async (text: string, doneKo: string, doneEn: string): Promise<void> => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setStatusMessage(pick(doneKo, doneEn));
        return;
      }
      setStatusMessage(pick("미리보기 영역에서 내용을 직접 복사하세요.", "Copy the generated content from the preview panel."));
    } catch {
      setStatusMessage(pick("클립보드 접근이 제한되어 미리보기 영역에 원문을 열었습니다.", "Clipboard unavailable; opened the raw export preview."));
    }
  };

  const handleCopyMarkdown = (): void => {
    setPreviewFormat("markdown");
    setShowPreview(true);
    void copyTextToClipboard(exportMarkdown, "브랜드 거버넌스 ADR 마크다운을 복사했습니다.", "Copied brand governance ADR Markdown.");
  };

  const handleCopyJson = (): void => {
    setPreviewFormat("json");
    setShowPreview(true);
    props.onExportJson?.(exportJsonBundle.json, exportJsonBundle.payload);
    void copyTextToClipboard(exportJsonBundle.json, "브랜드 정본 레지스트리 JSON을 복사했습니다.", "Copied brand registry JSON.");
  };

  const handleApplySuggestion = (): void => {
    if (!auditResult.suggestedCanonicalName || auditResult.suggestedCanonicalName === auditResult.normalizedInput) return;
    updateAuditQuery(
      auditResult.suggestedCanonicalName,
      context,
      pick("고유 브랜드 정본 대체안을 적용해 재검사를 완료했습니다.", "Applied proprietary canonical suggestion and re-audited."),
    );
  };

  const handleReset = (): void => {
    setSelectedBrandId("all");
    setSelectedPhaseId("all");
    setShowPreview(false);
    updateAuditQuery(
      initialQuery,
      "auto",
      pick("브랜드 감사 입력과 전환 필터를 초기 상태로 되돌렸습니다.", "Reset brand audit input and migration filters."),
    );
  };

  const verdictMeta = VERDICT_META[auditResult.verdict];
  const canApplySuggestion =
    (auditResult.verdict === "blocked-external-brand" || auditResult.verdict === "warn-consolidation-target") &&
    auditResult.suggestedCanonicalName.length > 0 &&
    auditResult.suggestedCanonicalName !== auditResult.normalizedInput;

  return (
    <section
      data-testid="atelier-brand-registry-panel"
      aria-labelledby={headingId}
      aria-describedby={`${headingId}-scope`}
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg md:p-5 ${props.className ?? ""}`}
    >
      {/* 상단 헤더 */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent [word-break:keep-all]">
              <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("10대 고유 브랜드 정본", "10 Proprietary Brands")}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-card px-2.5 py-0.5 font-mono text-[11px] font-semibold text-fg-2 tabular-nums">
              <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
              {`${BRAND_REGISTRY_MEASURED_AT} · ${BRAND_REGISTRY_BASELINE_COMMIT}`}
            </span>
            <span
              data-testid="brand-header-verdict-badge"
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold [word-break:keep-all] ${verdictMeta.badgeClass}`}
            >
              {auditResult.verdict === "clean" ? (
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : auditResult.verdict === "allowed-external-reference" ? (
                <FileCheck2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : auditResult.verdict === "warn-consolidation-target" ? (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              {isEn ? verdictMeta.en : verdictMeta.ko}
            </span>
          </div>
          <h2 id={headingId} className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("ToonStudio 고유 브랜드 아키텍처 정본 & 외부 명칭 감사", "ToonStudio Proprietary Brand Registry & Naming Audit")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              "입력한 파일명·패키지명·심볼명·UI 제목 문자열을 규칙으로 검사하고 고유 브랜드 대체안과 4단계 전환 계획 자료를 보여 줍니다.",
              "Checks the entered file path, package, symbol or UI label string against naming rules and previews canonical suggestions and a four-phase plan.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="brand-copy-md-btn" onClick={handleCopyMarkdown} className={BTN_SOLID}>
            <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("ADR 마크다운 복사", "Copy ADR Markdown")}
          </button>
          <button type="button" data-testid="brand-copy-json-btn" onClick={handleCopyJson} className={BTN_OUTLINE}>
            <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("JSON 복사", "Copy JSON")}
          </button>
          <button
            type="button"
            data-testid="brand-toggle-preview-btn"
            onClick={() => setShowPreview((prev) => !prev)}
            className={BTN_OUTLINE}
          >
            <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {showPreview ? pick("미리보기 닫기", "Hide Preview") : pick("ADR/JSON 보기", "View ADR/JSON")}
          </button>
          <button type="button" data-testid="brand-reset-btn" onClick={handleReset} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("초기화", "Reset")}
          </button>
        </div>
      </header>
      <p id={`${headingId}-scope`} data-testid="brand-registry-scope" className="text-xs text-fg-2 [word-break:keep-all]">
        {pick(`저장소 수치는 ${BRAND_REGISTRY_MEASURED_AT} · ${BRAND_REGISTRY_BASELINE_COMMIT} 기준의 고정 스냅샷입니다. 현재 저장소를 스캔하거나 파일을 변경하지 않습니다. 입력과 선택은 임시 상태이므로 패널을 닫기 전 필요한 내용을 복사해 주세요.`, `Repository figures are a fixed snapshot from ${BRAND_REGISTRY_MEASURED_AT} · ${BRAND_REGISTRY_BASELINE_COMMIT}. This panel does not scan the current repository or modify files. Input and selections are temporary; copy anything needed before closing the panel.`)}
      </p>

      {/* 실시간 파일명/모듈명/UI 라벨 브랜드 클린 검사기 */}
      <div data-testid="brand-audit-workbench" className="space-y-3 rounded-xl border border-line-strong bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={queryInputId} className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <Search className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("실시간 파일명 · 패키지명 · UI 라벨 브랜드 클린 검사기", "Live Path, Package & UI Label Brand Guard")}
          </label>
          <span className="font-mono text-[11px] text-fg-2 tabular-nums">
            {pick(`규칙 ${EXTERNAL_NAME_DETECTION_RULES.length}종 · 판별 문맥 ${auditResult.resolvedContext}`, `${EXTERNAL_NAME_DETECTION_RULES.length} rules · context ${auditResult.resolvedContext}`)}
          </span>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={queryInputId}
            data-testid="brand-audit-input"
            type="text"
            value={query}
            onChange={(event) => updateAuditQuery(event.target.value, context)}
            placeholder={pick("예: apps/web/src/domains/creator/... 또는 신규 패널 제목 입력", "e.g. apps/web/src/domains/creator/... or panel title")}
            className={`min-h-11 w-full rounded-lg border border-line-strong bg-canvas px-3 py-2 font-mono text-xs text-fg placeholder:text-fg-3 ${FOCUS_RING}`}
          />
          {canApplySuggestion && (
            <button
              type="button"
              data-testid="apply-canonical-suggestion-btn"
              onClick={handleApplySuggestion}
              className={`${BTN_SOLID} shrink-0`}
            >
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("정본 대체안 적용", "Apply Canonical Name")}
            </button>
          )}
        </div>

        {/* 문맥 선택 & 빠른 검증 예시 */}
        <div className="flex flex-wrap items-center gap-1.5">
          {CONTEXT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              data-testid={`audit-context-${opt.id}`}
              aria-pressed={context === opt.id}
              onClick={() => updateAuditQuery(query, opt.id, pick(`감사 문맥을 '${opt.ko}'로 전환했습니다.`, `Switched audit context to ${opt.en}.`))}
              className={context === opt.id ? BTN_ACTIVE : BTN_OUTLINE}
            >
              {isEn ? opt.en : opt.ko}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
          <span className="text-[11px] font-semibold text-fg-2 [word-break:keep-all]">{pick("빠른 시험:", "Quick probes:")}</span>
          {BRAND_AUDIT_SAMPLE_PROBES.map((probe) => (
            <button
              key={probe.id}
              type="button"
              data-testid={`audit-probe-${probe.id}`}
              onClick={() => updateAuditQuery(probe.query, probe.context, pick(`'${probe.labelKo}' 예시를 검사했습니다.`, `Audited '${probe.labelEn}' probe.`))}
              className={BTN_OUTLINE}
            >
              {isEn ? probe.labelEn : probe.labelKo}
            </button>
          ))}
        </div>

        {/* 실시간 판정 결과 배너 */}
        <div
          data-testid="brand-audit-verdict-banner"
          data-verdict={auditResult.verdict}
          className={`space-y-2 rounded-xl border p-3 ${verdictMeta.badgeClass}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold [word-break:keep-all]">{isEn ? verdictMeta.en : verdictMeta.ko}</span>
            <span className="font-mono text-[11px] tabular-nums">
              {auditResult.exemptionReason
                ? `exemption=${auditResult.exemptionReason}`
                : pick(`검출 ${auditResult.findings.length}건`, `${auditResult.findings.length} finding(s)`)}
            </span>
          </div>
          <p className="text-xs text-fg [word-break:keep-all]">{isEn ? auditResult.summaryEn : auditResult.summaryKo}</p>

          {auditResult.suggestedCanonicalName && auditResult.suggestedCanonicalName !== auditResult.normalizedInput && (
            <div data-testid="brand-suggested-canonical" className="flex flex-wrap items-center gap-2 rounded-lg border border-line-strong bg-canvas px-3 py-2 text-xs text-fg">
              <span className="font-semibold text-fg-2 [word-break:keep-all]">{pick("권장 고유 정본:", "Suggested canonical:")}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
              <code className="break-all font-mono font-bold text-accent">{auditResult.suggestedCanonicalName}</code>
            </div>
          )}

          {auditResult.findings.length > 0 && (
            <ul data-testid="brand-audit-findings-list" className="space-y-1.5 pt-1">
              {auditResult.findings.map((finding) => (
                <li
                  key={`${finding.ruleId}-${finding.matchedToken}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-fg [word-break:keep-all]"
                >
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded border border-line-strong bg-raised px-1.5 py-0.5 font-mono text-[10px] font-bold">{finding.ruleId}</span>
                      <code className="font-mono text-[11px] font-semibold">{finding.matchedToken}</code>
                      <ArrowRight className="h-3 w-3 text-fg-3" aria-hidden="true" />
                      <span className="font-bold text-accent">{finding.recommendedBrandName}</span>
                    </div>
                    <p className="text-[11px] text-fg-2">{isEn ? finding.rationaleEn : finding.rationaleKo}</p>
                  </div>
                  <span className="font-mono text-[10px] text-fg-3">{finding.category}</span>
                </li>
              ))}
            </ul>
          )}

          {auditResult.advisoryNotesKo.length > 0 && (
            <ul className="space-y-1 pt-1 text-[11px] text-fg-2 [word-break:keep-all]">
              {(isEn ? auditResult.advisoryNotesEn : auditResult.advisoryNotesKo).map((note) => (
                <li key={note} className="rounded-md border border-line bg-canvas px-2.5 py-1.5">{note}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 순수 시맨틱 OKLCH SVG 5계층 브랜드 아키텍처 맵 */}
      <BrandArchitectureLayerSvg activeBrandId={highlightedBrandId} auditVerdict={auditResult.verdict} isEn={isEn} />

      {/* 10대 고유 포멀 브랜드 엔진 정본 카드 */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <Scale className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("ToonStudio 10대 고유 포멀 브랜드 엔진 정본", "ToonStudio 10 Proprietary Formal Brand Engines")}
          </div>
          {selectedBrandId !== "all" && (
            <button
              type="button"
              data-testid="brand-clear-filter-btn"
              onClick={() => {
                setSelectedBrandId("all");
                setStatusMessage(pick("브랜드 필터를 해제해 전체 10대 정본을 표시합니다.", "Cleared brand filter."));
              }}
              className={BTN_OUTLINE}
            >
              {pick("전체 브랜드 보기", "Show All Brands")}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {TOONSTUDIO_PROPRIETARY_BRANDS.map((brand) => {
            const active = selectedBrandId === brand.id;
            return (
              <button
                key={brand.id}
                type="button"
                data-testid={`brand-card-${brand.id}`}
                aria-pressed={active}
                onClick={() => {
                  const next = active ? "all" : brand.id;
                  setSelectedBrandId(next);
                  setStatusMessage(
                    next === "all"
                      ? pick("전체 브랜드 전환 매트릭스로 되돌렸습니다.", "Showing full migration matrix.")
                      : pick(`${brand.formalName} 정본 기준과 연결된 레거시 전환 항목을 표시합니다.`, `Filtered migration matrix for ${brand.formalName}.`),
                  );
                }}
                className={`flex min-h-11 cursor-pointer flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${active ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"}`}
              >
                <div className="flex w-full items-center justify-between gap-1">
                  <span className="text-xs font-bold">{brand.formalName}</span>
                  <span className="rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] text-fg-2 tabular-nums">
                    {brand.order < 10 ? `0${brand.order}` : `${brand.order}`}
                  </span>
                </div>
                <span className="text-[11px] leading-snug text-fg-2">{isEn ? brand.taglineEn : brand.taglineKo}</span>
                <span className="font-mono text-[10px] text-fg-3">{brand.slug}</span>
                {brand.consolidationNoteKo && (
                  <span className="mt-0.5 rounded border border-warn bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                    {pick("character-lab 통합 타깃", "character-lab consolidation")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2026-11-26 실측 저장소 스캔 요약 (3대 루트) & 정당한 예외 경계 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {REPOSITORY_SCAN_ROOTS.map((root) => (
          <div key={root.id} data-testid={`scan-root-card-${root.id}`} className="space-y-1.5 rounded-xl border border-line bg-card p-3.5 [word-break:keep-all]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-fg">{isEn ? root.labelEn : root.labelKo}</span>
              <code className="font-mono text-[10px] text-accent">{root.rootPath}</code>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-xs tabular-nums">
              <div className="rounded-lg border border-line bg-panel px-2.5 py-1.5">
                <div className="text-[10px] text-fg-3">{pick("기준 스캔 전체", "Baseline Scan")}</div>
                <div className="font-bold text-fg">{`${root.scannedDirs}d / ${root.scannedFiles.toLocaleString("en-US")}f`}</div>
              </div>
              <div className="rounded-lg border border-line bg-panel px-2.5 py-1.5">
                <div className="text-[10px] text-fg-3">{pick("레거시 매칭", "Matched")}</div>
                <div className="font-bold text-warn">{`${root.matchedDirs}d / ${root.matchedFiles}f`}</div>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-fg-2">{isEn ? root.notesEn : root.notesKo}</p>
          </div>
        ))}
      </div>

      {/* 4단계 무중단 레거시 전환 매트릭스 */}
      <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold text-fg [word-break:keep-all]">
              {pick("기준 레거시 경로 4단계 전환 계획", "Baseline Legacy Paths & 4-Phase Plan")}
            </h3>
            <p className="text-[11px] text-fg-2 [word-break:keep-all]">
              {pick(
                `총 ${filteredMigrationEntries.length}개 항목 표시 · 기존 크레이트·파일 강제 이름변경 없이 파사드·별칭·예외 격리로 안전 전환합니다.`,
                `Showing ${filteredMigrationEntries.length} entries · Safe facade, alias, and vendor isolation without forced renames.`,
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              data-testid="phase-filter-all"
              aria-pressed={selectedPhaseId === "all"}
              onClick={() => setSelectedPhaseId("all")}
              className={selectedPhaseId === "all" ? BTN_ACTIVE : BTN_OUTLINE}
            >
              {pick("전체 단계", "All Phases")}
            </button>
            {MIGRATION_PHASES.map((phase) => (
              <button
                key={phase.id}
                type="button"
                data-testid={`phase-filter-${phase.id}`}
                aria-pressed={selectedPhaseId === phase.id}
                onClick={() => setSelectedPhaseId(phase.id)}
                className={selectedPhaseId === phase.id ? BTN_ACTIVE : BTN_OUTLINE}
              >
                {pick(`${phase.order}단계`, `Phase ${phase.order}`)}
              </button>
            ))}
          </div>
        </div>

        <ul data-testid="migration-entries-list" className="space-y-2">
          {filteredMigrationEntries.map((entry) => {
            const brand = getProprietaryBrand(entry.targetBrandId);
            const disp = DISPOSITION_LABELS[entry.disposition];
            return (
              <li
                key={entry.id}
                data-testid={`migration-entry-${entry.id}`}
                className="space-y-1.5 rounded-xl border border-line bg-panel p-3 text-xs [word-break:keep-all]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded border border-line-strong bg-card px-1.5 py-0.5 font-mono text-[10px] font-bold">{entry.id}</span>
                    <span className="font-bold text-accent">{brand.formalName}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${disp.tone}`}>
                      {isEn ? disp.en : disp.ko}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] font-semibold text-fg-2 tabular-nums">
                    {pick(`실측 ${entry.measuredFileCount}파일`, `${entry.measuredFileCount} files`)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                  <code className="break-all text-fg-2">{entry.legacyPath}</code>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                  <code className="break-all font-semibold text-fg">{entry.canonicalTargetPath}</code>
                </div>
                <p className="text-[11px] text-fg-2">{isEn ? entry.strategyEn : entry.strategyKo}</p>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 정당한 외부 참조 예외 경계 요약 */}
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
        {ALLOWED_EXTERNAL_REFERENCE_SCOPES.map((scope) => (
          <div key={scope.reason} data-testid={`allowed-scope-${scope.reason}`} className="space-y-1 rounded-xl border border-line bg-card p-3 text-xs [word-break:keep-all]">
            <div className="font-bold text-fg">{isEn ? scope.titleEn : scope.titleKo}</div>
            <div className="font-mono text-[10px] text-cool">{scope.reason}</div>
            <p className="text-[11px] text-fg-2">{isEn ? scope.policyEn : scope.policyKo}</p>
          </div>
        ))}
      </div>

      {/* ADR Markdown / JSON 미리보기 */}
      {showPreview && (
        <div className="space-y-2 rounded-xl border border-line-strong bg-card p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="preview-tab-markdown"
              aria-pressed={previewFormat === "markdown"}
              onClick={() => setPreviewFormat("markdown")}
              className={previewFormat === "markdown" ? BTN_ACTIVE : BTN_OUTLINE}
            >
              {pick("ADR 마크다운", "ADR Markdown")}
            </button>
            <button
              type="button"
              data-testid="preview-tab-json"
              aria-pressed={previewFormat === "json"}
              onClick={() => setPreviewFormat("json")}
              className={previewFormat === "json" ? BTN_ACTIVE : BTN_OUTLINE}
            >
              {pick("레지스트리 JSON", "Registry JSON")}
            </button>
          </div>
          <pre
            data-testid="brand-export-preview"
            className="max-h-72 overflow-auto rounded-xl border border-line bg-canvas p-3 font-mono text-[11px] leading-relaxed text-fg"
          >
            {previewFormat === "markdown" ? exportMarkdown : exportJsonBundle.json}
          </pre>
        </div>
      )}

      {statusMessage && (
        <p role="status" aria-live="polite" data-testid="brand-status-message" className="text-xs font-medium text-accent [word-break:keep-all]">
          {statusMessage}
        </p>
      )}
    </section>
  );
}
