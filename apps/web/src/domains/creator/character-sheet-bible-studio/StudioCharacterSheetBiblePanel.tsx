/**
 * Wave 44D — 상업 연재 캐릭터 설정집 · 의상 변주 · 표정 9궁도 자동 조판 스튜디오 패널.
 *
 * - 캐릭터 프리셋 4인 전환 · 키/등신/굽 보정 슬라이더 + SVG 다인 키 비교·3면도 눈금자
 * - 표정 9궁도 3×3 카드 그리드 선택·편집 (눈썹·눈매·입꼬리·홍조/땀)
 * - 의상 연속성 5슬롯(`uniform`·`casual`·`combat`·`damaged`·`winter`) + 공식 OKLCH 컬러 칩·인쇄 주의·채색 금지 규칙
 * - 누락 항목 완성도 점수(0~100) 점검 및 어시스턴트 배포용 Markdown/JSON 미리보기·복사
 * - Calm Atelier 시맨틱 토큰 전용(원시 색·광범위 트랜지션·기본 빈 객체 props·Web Storage·장식 아이콘 미사용)
 */

import {
  AlertTriangle, BookOpen, CheckCircle2, Code2, Copy, FileText,
  Palette, RotateCcw, Ruler, ShieldAlert, Shirt, Smile, Users,
} from "lucide-react";
import { useEffect, useId, useMemo, useState, type ReactElement } from "react";

import {
  CHARACTER_SHEET_PRESETS, MAX_FOOTWEAR_BONUS_CM, MAX_HEAD_RATIO, MAX_HEIGHT_CM,
  MIN_FOOTWEAR_BONUS_CM, MIN_HEAD_RATIO, MIN_HEIGHT_CM, OUTFIT_SLOT_IDS,
  assessOklchPrintGamut, auditCharacterSheetCompleteness, buildCastHeightEntries,
  compareCastHeights, computeHeightRatioMetrics, createCharacterPreset,
  exportCharacterSheetJson, exportCharacterSheetMarkdown, formatOklchCss, formatOklchSpec,
  updateExpressionGridCell, updateOfficialColorChip, updateOutfitContinuitySlot,
  type CastHeightComparison, type CharacterPresetId, type CharacterSheetBible,
  type CharacterSheetCompletenessAudit, type ExpressionGridCell, type ExpressionSlotId,
  type HeightRatioMetrics, type OutfitSlotId, type PrintGamutRiskLevel,
} from "./character-sheet-bible-engine";

export interface StudioCharacterSheetBiblePanelProps {
  readonly initialPresetId?: CharacterPresetId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onSheetChange?: (sheet: CharacterSheetBible, audit: CharacterSheetCompletenessAudit) => void;
  readonly onExportMarkdown?: (markdown: string, sheet: CharacterSheetBible) => void;
  readonly onExportJson?: (json: string, sheet: CharacterSheetBible) => void;
}

type ExportPreviewMode = "markdown" | "json" | "hidden";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;
const INPUT_BASE = `w-full min-h-11 rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-fg placeholder:text-fg-3 [word-break:keep-all] ${FOCUS_RING}`;

function scoreTone(score: number): string {
  if (score >= 90) return "text-good";
  return score >= 65 ? "text-warn" : "text-bad";
}

function gradeBadgeClass(score: number): string {
  if (score >= 90) return "border-good bg-good-soft text-good";
  return score >= 65 ? "border-warn bg-warning-soft text-warn" : "border-bad bg-bad-soft text-bad";
}

function gamutBadgeClass(level: PrintGamutRiskLevel): string {
  if (level === "clip-risk") return "border-bad bg-bad-soft text-bad";
  return level === "caution" ? "border-warn bg-warning-soft text-warn" : "border-good bg-good-soft text-good";
}

function countFilledExpressionNotes(cell: ExpressionGridCell): number {
  let filled = 0;
  if (cell.eyebrowNote.trim().length >= 2) filled += 1;
  if (cell.eyeNote.trim().length >= 2) filled += 1;
  if (cell.mouthNote.trim().length >= 2) filled += 1;
  if (cell.blushSweatNote.trim().length >= 2) filled += 1;
  return filled;
}

function slotShortLabel(slotId: OutfitSlotId, isEn: boolean): string {
  switch (slotId) {
    case "uniform": return isEn ? "Uniform" : "제복";
    case "casual": return isEn ? "Casual" : "사복";
    case "combat": return isEn ? "Combat" : "전투복";
    case "damaged": return isEn ? "Damaged" : "파손";
    case "winter": return isEn ? "Winter" : "동복";
  }
}

function BibleMetricCard(props: {
  readonly label: string; readonly value: string; readonly subtext: string;
  readonly testId: string; readonly valueTone?: string;
}): ReactElement {
  const { label, value, subtext, testId, valueTone = "text-fg" } = props;
  return (
    <div className="rounded-xl border border-line bg-raised px-3.5 py-2.5">
      <div className="text-[11px] font-medium text-fg-3 [word-break:keep-all]">{label}</div>
      <div data-testid={testId} className={`mt-0.5 text-base font-bold tabular-nums ${valueTone}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-fg-2 tabular-nums [word-break:keep-all]">{subtext}</div>
    </div>
  );
}

function SliderField(props: {
  readonly id: string; readonly testId: string; readonly readoutTestId: string;
  readonly label: string; readonly readout: string; readonly min: number; readonly max: number;
  readonly step: number; readonly value: number; readonly onChange: (val: number) => void;
}): ReactElement {
  const { id, testId, readoutTestId, label, readout, min, max, step, value, onChange } = props;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <label htmlFor={id} className="font-medium text-fg-2 [word-break:keep-all]">{label}</label>
        <span data-testid={readoutTestId} className="font-semibold text-fg tabular-nums">{readout}</span>
      </div>
      <input
        id={id} data-testid={testId} type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-h-11 w-full cursor-pointer accent-accent"
      />
    </div>
  );
}

function LabeledTextInput(props: {
  readonly id: string; readonly testId: string; readonly label: string;
  readonly value: string; readonly onChange: (val: string) => void; readonly labelTone?: string;
}): ReactElement {
  const { id, testId, label, value, onChange, labelTone = "text-fg-2" } = props;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className={`block text-[11px] font-semibold [word-break:keep-all] ${labelTone}`}>{label}</label>
      <input id={id} data-testid={testId} type="text" value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_BASE} />
    </div>
  );
}

function HeightComparisonRulerSvg(props: {
  readonly activeMetrics: HeightRatioMetrics;
  readonly castComparison: CastHeightComparison;
  readonly isEn: boolean;
}): ReactElement {
  const { activeMetrics, castComparison, isEn } = props;
  const width = 560;
  const height = 270;
  const padL = 44;
  const padR = 112;
  const padT = 22;
  const padB = 34;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const maxCm = Math.max(210, Math.ceil((Math.max(activeMetrics.effectiveHeightCm, castComparison.tallestMember?.metrics.effectiveHeightCm ?? 195) + 12) / 20) * 20);
  const cmToY = (cm: number): number => Math.round((padT + (1 - Math.max(0, cm) / maxCm) * innerH) * 10) / 10;
  const floorY = cmToY(0);
  const ticks: number[] = [];
  for (let cm = 0; cm <= maxCm; cm += 20) ticks.push(cm);

  const memberCount = Math.max(1, castComparison.members.length);
  const colStep = innerW / memberCount;

  return (
    <svg
      data-testid="bible-height-ruler-svg"
      data-effective-height-cm={activeMetrics.effectiveHeightCm}
      data-head-ratio={activeMetrics.headRatio}
      data-cast-count={castComparison.members.length}
      viewBox={`0 0 ${width} ${height}`}
      className="h-64 w-full rounded-xl border border-line bg-canvas text-fg"
      role="img"
      aria-label={isEn ? "Cast height comparison and 3-view landmark ruler" : "다인 캐릭터 신장 비교 및 3면도 눈금자"}
    >
      {ticks.map((cm) => {
        const y = cmToY(cm);
        return (
          <g key={cm} className="text-fg-3">
            <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="currentColor" strokeOpacity={cm % 40 === 0 ? 0.28 : 0.14} strokeWidth="1" />
            <text x={padL - 6} y={y + 3} textAnchor="end" fill="currentColor" fontSize="9">{cm}</text>
          </g>
        );
      })}
      <text x={padL - 6} y={13} textAnchor="end" className="text-fg-3" fill="currentColor" fontSize="8.5">cm</text>

      {activeMetrics.landmarks.map((lm) => {
        const y = cmToY(lm.heightFromFloorCm);
        return (
          <g key={lm.id} data-ruler-landmark={lm.id} className="text-accent">
            <line x1={padL} y1={y} x2={width - padR + 6} y2={y} stroke="currentColor" strokeOpacity={0.65} strokeDasharray="4 3" strokeWidth="1.2" />
            <text x={width - padR + 10} y={y + 3} fill="currentColor" fontSize="9" fontWeight="600">
              {isEn ? `${lm.id.toUpperCase()} ${lm.heightFromFloorCm.toFixed(0)}cm` : `${lm.labelKo.split("(")[0]} ${lm.heightFromFloorCm.toFixed(1)}cm`}
            </text>
          </g>
        );
      })}

      {castComparison.members.map((member, idx) => {
        const cx = Math.round((padL + colStep * (idx + 0.5)) * 10) / 10;
        const barW = Math.min(44, Math.max(24, Math.round(colStep * 0.42)));
        const topY = cmToY(member.metrics.effectiveHeightCm);
        const bareTopY = cmToY(member.metrics.bareHeightCm);
        const heelTopY = cmToY(member.metrics.footwearBonusCm);
        const eyeY = cmToY(member.metrics.eyeLevelCm);
        const fillOklch = formatOklchCss(member.accentOklch);
        const deltaLabel = member.isReference
          ? (isEn ? "REF" : "기준")
          : `${member.deltaFromReferenceCm >= 0 ? "+" : ""}${member.deltaFromReferenceCm.toFixed(1)}`;
        return (
          <g key={member.id} data-cast-bar={member.id}>
            <rect
              x={cx - barW * 0.5} y={topY} width={barW} height={Math.max(4, floorY - topY)} rx="5"
              fill={fillOklch} fillOpacity={member.isReference ? 0.34 : 0.18}
              stroke={fillOklch} strokeWidth={member.isReference ? 2 : 1.2}
            />
            {member.metrics.footwearBonusCm > 0 ? (
              <rect
                x={cx - barW * 0.5} y={heelTopY} width={barW} height={Math.max(2, floorY - heelTopY)} rx="2"
                fill={fillOklch} fillOpacity={0.6}
              />
            ) : null}
            <circle cx={cx} cy={eyeY} r="3" fill={fillOklch} />
            <line x1={cx - barW * 0.36} y1={bareTopY} x2={cx + barW * 0.36} y2={bareTopY} stroke="currentColor" strokeOpacity={0.45} strokeWidth="1" />
            <text x={cx} y={topY - 6} textAnchor="middle" fill="currentColor" fontSize="9.5" fontWeight={member.isReference ? "700" : "500"}>
              {member.metrics.effectiveHeightCm.toFixed(1)}
            </text>
            <text x={cx} y={floorY + 13} textAnchor="middle" fill="currentColor" fontSize="9.5" fontWeight={member.isReference ? "700" : "500"}>
              {isEn ? member.nameEn.split(" ")[0] : member.nameKo}
            </text>
            <text x={cx} y={floorY + 25} textAnchor="middle" className={member.isReference ? "text-accent" : "text-fg-3"} fill="currentColor" fontSize="8.5" fontWeight="600">
              {deltaLabel}
            </text>
          </g>
        );
      })}
      <line x1={padL} y1={floorY} x2={width - padR} y2={floorY} className="text-line-strong" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** 상업 연재 캐릭터 설정집 · 의상 변주 · 표정 9궁도 자동 조판 스튜디오 패널. */
export function StudioCharacterSheetBiblePanel(props: StudioCharacterSheetBiblePanelProps): ReactElement {
  const {
    initialPresetId = "taehyun-lead",
    locale = "ko",
    className,
    onSheetChange,
    onExportMarkdown,
    onExportJson,
  } = props;

  const uid = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [presetId, setPresetId] = useState<CharacterPresetId>(initialPresetId);
  const [sheet, setSheet] = useState<CharacterSheetBible>(() => createCharacterPreset(initialPresetId));
  const [selectedExprId, setSelectedExprId] = useState<ExpressionSlotId>("joy");
  const [selectedOutfitId, setSelectedOutfitId] = useState<OutfitSlotId>("uniform");
  const [showAllChips, setShowAllChips] = useState<boolean>(false);
  const [exportMode, setExportMode] = useState<ExportPreviewMode>("markdown");
  const [statusMessage, setStatusMessage] = useState<string>("");

  const heightMetrics = useMemo<HeightRatioMetrics>(
    () => computeHeightRatioMetrics({ heightCm: sheet.heightCm, headRatio: sheet.headRatio, footwearBonusCm: sheet.footwearBonusCm }),
    [sheet.heightCm, sheet.headRatio, sheet.footwearBonusCm],
  );
  const castEntries = useMemo(() => buildCastHeightEntries(sheet), [sheet]);
  const castComparison = useMemo<CastHeightComparison>(
    () => compareCastHeights(castEntries, sheet.id),
    [castEntries, sheet.id],
  );
  const audit = useMemo<CharacterSheetCompletenessAudit>(() => auditCharacterSheetCompleteness(sheet), [sheet]);
  const markdownDoc = useMemo<string>(
    () => exportCharacterSheetMarkdown(sheet, { cast: castEntries, locale }),
    [sheet, castEntries, locale],
  );
  const jsonDoc = useMemo<string>(
    () => exportCharacterSheetJson(sheet, { cast: castEntries, locale }),
    [sheet, castEntries, locale],
  );

  useEffect(() => { onSheetChange?.(sheet, audit); }, [sheet, audit, onSheetChange]);

  const activeExpression = sheet.expressions.find((c) => c.id === selectedExprId) ?? sheet.expressions[0];
  const activeOutfit = sheet.outfits.find((s) => s.id === selectedOutfitId) ?? sheet.outfits[0];
  const visibleColorChips = useMemo(
    () => (showAllChips ? sheet.colorChips : sheet.colorChips.filter((c) => c.slotScope === "base" || c.slotScope === selectedOutfitId)),
    [sheet.colorChips, showAllChips, selectedOutfitId],
  );

  const handleSelectPreset = (nextId: CharacterPresetId): void => {
    const nextSheet = createCharacterPreset(nextId);
    setPresetId(nextId);
    setSheet(nextSheet);
    setSelectedExprId("joy");
    setSelectedOutfitId("uniform");
    setStatusMessage(pick(`${nextSheet.nameKo} (${nextSheet.code}) 설정집 프리셋을 불러왔습니다.`, `Loaded ${nextSheet.nameEn} (${nextSheet.code}) character bible preset.`));
  };

  const handleResetPreset = (): void => {
    const restored = createCharacterPreset(presetId);
    setSheet(restored);
    setStatusMessage(pick(`${restored.nameKo} 설정집을 기본 원형으로 복원했습니다.`, `Restored ${restored.nameEn} bible defaults.`));
  };

  const copySafely = (text: string): void => {
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      void navigator.clipboard.writeText(text).catch(() => undefined);
    }
  };

  const handleCopyMarkdown = (): void => {
    onExportMarkdown?.(markdownDoc, sheet);
    copySafely(markdownDoc);
    setExportMode("markdown");
    setStatusMessage(pick(`어시스턴트 배포용 Markdown 설정집(${markdownDoc.length.toLocaleString("ko-KR")}자)을 복사했습니다.`, `Copied Markdown character bible (${markdownDoc.length.toLocaleString("en-US")} chars).`));
  };

  const handleCopyJson = (): void => {
    onExportJson?.(jsonDoc, sheet);
    copySafely(jsonDoc);
    setExportMode("json");
    setStatusMessage(pick(`설정집 JSON 패키지(${jsonDoc.length.toLocaleString("ko-KR")}B)를 복사했습니다.`, `Copied character bible JSON (${jsonDoc.length.toLocaleString("en-US")} B).`));
  };

  const heightSliderId = `${uid}-height`;
  const ratioSliderId = `${uid}-head-ratio`;
  const footwearSliderId = `${uid}-footwear`;
  const gradeLabel = audit.grade === "production-ready"
    ? pick("배포 가능", "Production Ready")
    : audit.grade === "review-needed"
      ? pick("검수 권장", "Review Needed")
      : pick("초안 보완 필요", "Draft Incomplete");

  return (
    <section
      data-testid="studio-character-sheet-bible-panel"
      aria-label={pick("상업 연재 캐릭터 설정집 · 의상 변주 · 표정 9궁도 스튜디오", "Commercial Character Bible Studio")}
      className={`space-y-5 rounded-2xl border border-line bg-card p-5 text-fg ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent">
              <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("상업 연재 캐릭터 바이블", "Character Bible Studio")}
            </span>
            <span data-testid="bible-grade-badge" className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ${gradeBadgeClass(audit.totalScore)}`}>
              {audit.totalScore >= 90 ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              {`${gradeLabel} · ${audit.totalScore}/100`}
            </span>
          </div>
          <h2 className="text-lg font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("캐릭터 설정집 · 의상 연속성 · 표정 9궁도 자동 조판", "Character Bible, Outfit Continuity & Expression 9-Grid")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              "연재 작가·어시스턴트·해외 스튜디오가 동일한 신장 비례, 표정 지침, 의상 연속성, 공식 OKLCH 채색 금지 규칙을 공유합니다.",
              "Align artists, assistants, and partner studios on height ratios, 9-grid expressions, outfit continuity, and OKLCH color rules.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="bible-copy-markdown-btn" onClick={handleCopyMarkdown} className={BTN_SOLID}>
            <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("Markdown 복사", "Copy Markdown")}
          </button>
          <button type="button" data-testid="bible-copy-json-btn" onClick={handleCopyJson} className={BTN_OUTLINE}>
            <Code2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("JSON 복사", "Copy JSON")}
          </button>
          <button type="button" data-testid="bible-reset-btn" onClick={handleResetPreset} className={BTN_OUTLINE}>
            <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("초기화", "Reset")}
          </button>
        </div>
      </header>

      {statusMessage ? (
        <div data-testid="bible-status-banner" role="status" aria-live="polite" className="rounded-lg border border-accent bg-accent-soft px-3.5 py-2 text-xs font-medium text-accent [word-break:keep-all]">
          {statusMessage}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={pick("캐릭터 프리셋 선택", "Character presets")}>
        {CHARACTER_SHEET_PRESETS.map((preset) => {
          const isSelected = preset.id === presetId;
          return (
            <button
              key={preset.id}
              type="button"
              data-testid={`bible-preset-${preset.id}`}
              aria-pressed={isSelected}
              onClick={() => handleSelectPreset(preset.id as CharacterPresetId)}
              className={isSelected ? BTN_ACTIVE : BTN_OUTLINE}
            >
              <span className="inline-block h-2.5 w-2.5 rounded-full border border-line-strong" style={{ backgroundColor: formatOklchCss(preset.accentOklch) }} aria-hidden="true" />
              <span>{isEn ? `${preset.code} ${preset.nameEn}` : `${preset.code} ${preset.nameKo}`}</span>
              <span className="text-[11px] text-fg-3 tabular-nums">{`${preset.heightCm}cm`}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <BibleMetricCard
          testId="bible-completeness-score" label={pick("설정집 완성도", "Bible Completeness")}
          value={`${audit.totalScore} / 100`}
          subtext={pick(`체크 ${audit.completedChecklistCount}/${audit.totalChecklistCount} · 누락 ${audit.missingItems.length}건`, `${audit.completedChecklistCount}/${audit.totalChecklistCount} checks · ${audit.missingItems.length} missing`)}
          valueTone={scoreTone(audit.totalScore)}
        />
        <BibleMetricCard
          testId="bible-effective-height" label={pick("착화 신장 · 등신비", "Effective Height & Ratio")}
          value={`${heightMetrics.effectiveHeightCm.toFixed(1)} cm`}
          subtext={pick(`맨발 ${heightMetrics.bareHeightCm.toFixed(1)} + 굽 ${heightMetrics.footwearBonusCm.toFixed(1)}cm · ${heightMetrics.headRatio.toFixed(1)}등신`, `Bare ${heightMetrics.bareHeightCm.toFixed(1)} + Heel ${heightMetrics.footwearBonusCm.toFixed(1)}cm · ${heightMetrics.headRatio.toFixed(1)}H`)}
        />
        <BibleMetricCard
          testId="bible-head-unit" label={pick("1두신 · 눈높이 기준", "1 Head Unit · Eye Level")}
          value={`${heightMetrics.headUnitCm.toFixed(1)} cm`}
          subtext={pick(`아이레벨 ${heightMetrics.eyeLevelCm.toFixed(1)} cm · ${sheet.code}`, `Eye level ${heightMetrics.eyeLevelCm.toFixed(1)} cm · ${sheet.code}`)}
        />
        <BibleMetricCard
          testId="bible-cast-span" label={pick("캐스트 최대 신장 편차", "Cast Height Spread")}
          value={`${castComparison.maxHeightSpanCm.toFixed(1)} cm`}
          subtext={
            castComparison.tallestMember && castComparison.shortestMember
              ? pick(`${castComparison.tallestMember.nameKo} ↔ ${castComparison.shortestMember.nameKo}`, `${castComparison.tallestMember.nameEn.split(" ")[0]} vs ${castComparison.shortestMember.nameEn.split(" ")[0]}`)
              : "—"
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-3 rounded-xl border border-line bg-raised p-4 xl:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg [word-break:keep-all]">
              <Ruler className="h-4 w-4 text-accent" aria-hidden="true" />
              {pick("등신비 · 신장 3면도 눈금 계산기", "Turnaround Height & Ratio Calculator")}
            </h3>
            <span className="text-[11px] font-medium text-fg-3 tabular-nums">{`${sheet.nameKo} · ${sheet.ageLabel}`}</span>
          </div>

          <div className="space-y-2.5">
            <SliderField
              id={heightSliderId} testId="bible-height-slider" readoutTestId="bible-height-readout"
              label={pick("맨발 키 (cm)", "Bare Height (cm)")} readout={`${sheet.heightCm.toFixed(1)} cm`}
              min={MIN_HEIGHT_CM} max={MAX_HEIGHT_CM} step={1} value={sheet.heightCm}
              onChange={(heightCm) => setSheet((prev) => ({ ...prev, heightCm }))}
            />
            <SliderField
              id={ratioSliderId} testId="bible-head-ratio-slider" readoutTestId="bible-head-ratio-readout"
              label={pick("등신비 (5.5~8.5 등신)", "Head Ratio (5.5-8.5H)")} readout={`${sheet.headRatio.toFixed(1)} 등신`}
              min={MIN_HEAD_RATIO} max={MAX_HEAD_RATIO} step={0.1} value={sheet.headRatio}
              onChange={(headRatio) => setSheet((prev) => ({ ...prev, headRatio }))}
            />
            <SliderField
              id={footwearSliderId} testId="bible-footwear-slider" readoutTestId="bible-footwear-readout"
              label={pick("굽 / 신발 보정 (cm)", "Footwear / Heel Bonus (cm)")} readout={`+${sheet.footwearBonusCm.toFixed(1)} cm`}
              min={MIN_FOOTWEAR_BONUS_CM} max={MAX_FOOTWEAR_BONUS_CM} step={0.5} value={sheet.footwearBonusCm}
              onChange={(footwearBonusCm) => setSheet((prev) => ({ ...prev, footwearBonusCm }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            {heightMetrics.landmarks.map((lm) => (
              <div key={lm.id} data-testid={`bible-landmark-${lm.id}`} className="rounded-lg border border-line bg-card px-2.5 py-2">
                <div className="text-[11px] font-medium text-fg-3 [word-break:keep-all]">{isEn ? lm.labelEn : lm.labelKo}</div>
                <div className="mt-0.5 text-sm font-bold text-fg tabular-nums">{`${lm.heightFromFloorCm.toFixed(1)} cm`}</div>
                <div className="text-[11px] text-fg-2 tabular-nums">
                  {`${(lm.ratioFromFloor * 100).toFixed(1)}% · ${lm.headUnitsFromCrown.toFixed(1)}H`}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-line bg-raised p-4 xl:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg [word-break:keep-all]">
              <Users className="h-4 w-4 text-accent" aria-hidden="true" />
              {pick("다인 캐스트 키 비교 눈금자 · 투샷 시선 보정", "Cast Height Comparison Ruler & Two-Shot Framing")}
            </h3>
            <span className="text-[11px] text-fg-3 tabular-nums">
              {pick(`평균 ${castComparison.averageEffectiveHeightCm.toFixed(1)} cm`, `Avg ${castComparison.averageEffectiveHeightCm.toFixed(1)} cm`)}
            </span>
          </div>

          <HeightComparisonRulerSvg activeMetrics={heightMetrics} castComparison={castComparison} isEn={isEn} />

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {castComparison.members.map((m) => (
              <div key={m.id} data-testid={`bible-cast-row-${m.id}`} className="rounded-lg border border-line bg-card px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-fg [word-break:keep-all]">{isEn ? m.nameEn : m.nameKo}</span>
                  <span className="font-semibold text-accent tabular-nums">
                    {m.isReference ? pick("기준", "REF") : `${m.deltaFromReferenceCm >= 0 ? "+" : ""}${m.deltaFromReferenceCm.toFixed(1)}cm`}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-fg-2 [word-break:keep-all]">{isEn ? m.framingGuideEn : m.framingGuideKo}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg [word-break:keep-all]">
            <Smile className="h-4 w-4 text-accent" aria-hidden="true" />
            {pick("표정 9궁도 작화 지침 매트릭스", "Expression 9-Grid Drawing Matrix")}
          </h3>
          <span className="text-[11px] text-fg-3 [word-break:keep-all]">
            {pick("카드를 눌러 눈썹·눈매·입꼬리·홍조/땀 노트를 편집하세요.", "Select a cell to edit eyebrow, eye, mouth, and blush/sweat notes.")}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="grid grid-cols-3 gap-2 lg:col-span-7" role="group" aria-label={pick("표정 9궁도 카드", "Expression 9-grid cells")}>
            {sheet.expressions.map((cell) => {
              const isSelected = cell.id === activeExpression?.id;
              const filled = countFilledExpressionNotes(cell);
              return (
                <button
                  key={cell.id}
                  type="button"
                  data-testid={`bible-expr-card-${cell.id}`}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedExprId(cell.id)}
                  className={`flex min-h-24 cursor-pointer flex-col items-start justify-between rounded-xl border p-2.5 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${
                    isSelected ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg hover:border-line-strong hover:bg-panel"
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-1">
                    <span className="text-xs font-bold">{isEn ? cell.labelEn : cell.labelKo}</span>
                    <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${filled === 4 ? "border-good bg-good-soft text-good" : "border-warn bg-warning-soft text-warn"}`}>
                      {`${filled}/4`}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] text-fg-2">{cell.eyeNote || pick("눈매 노트 비어 있음", "Eye note empty")}</p>
                  <span className="mt-1 text-[10px] text-fg-3">{`${cell.gridRow + 1}행 ${cell.gridCol + 1}열`}</span>
                </button>
              );
            })}
          </div>

          {activeExpression ? (
            <div data-testid="bible-expr-editor" className="space-y-2.5 rounded-xl border border-line bg-card p-3.5 lg:col-span-5">
              <div className="flex items-center justify-between gap-2 border-b border-line pb-2">
                <div>
                  <div className="text-sm font-bold text-fg [word-break:keep-all]">
                    {isEn ? `${activeExpression.labelEn} (${activeExpression.labelKo})` : `${activeExpression.labelKo} · ${activeExpression.labelEn}`}
                  </div>
                  <div className="text-[11px] text-fg-3 [word-break:keep-all]">{isEn ? activeExpression.usageContextEn : activeExpression.usageContextKo}</div>
                </div>
                <span className="rounded-md border border-line bg-raised px-2 py-0.5 text-[11px] font-semibold text-fg-2 tabular-nums">
                  {`${countFilledExpressionNotes(activeExpression)}/4`}
                </span>
              </div>

              {(
                [
                  { key: "eyebrowNote", testKey: "eyebrow", labelKo: "눈썹 작화 노트", labelEn: "Eyebrow Note" },
                  { key: "eyeNote", testKey: "eye", labelKo: "눈매 작화 노트", labelEn: "Eye Note" },
                  { key: "mouthNote", testKey: "mouth", labelKo: "입꼬리 작화 노트", labelEn: "Mouth Note" },
                  { key: "blushSweatNote", testKey: "blush", labelKo: "홍조 / 땀 작화 노트", labelEn: "Blush / Sweat Note" },
                ] as const
              ).map((field) => (
                <LabeledTextInput
                  key={field.key} id={`${uid}-expr-${field.testKey}`} testId={`bible-expr-input-${field.testKey}`}
                  label={pick(field.labelKo, field.labelEn)} value={activeExpression[field.key]}
                  onChange={(value) => setSheet((prev) => ({
                    ...prev, expressions: updateExpressionGridCell(prev.expressions, activeExpression.id, { [field.key]: value }),
                  }))}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-3 rounded-xl border border-line bg-raised p-4 xl:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg [word-break:keep-all]">
              <Shirt className="h-4 w-4 text-accent" aria-hidden="true" />
              {pick("의상 연속성 5슬롯 가이드", "Outfit Continuity Slots (5)")}
            </h3>
            <span className="text-[11px] text-fg-3">uniform · casual · combat · damaged · winter</span>
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick("의상 슬롯 선택", "Outfit slots")}>
            {OUTFIT_SLOT_IDS.map((slotId) => {
              const isSelected = slotId === selectedOutfitId;
              return (
                <button
                  key={slotId}
                  type="button"
                  data-testid={`bible-outfit-tab-${slotId}`}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedOutfitId(slotId)}
                  className={isSelected ? BTN_ACTIVE : BTN_OUTLINE}
                >
                  {slotShortLabel(slotId, isEn)}
                </button>
              );
            })}
          </div>

          {activeOutfit ? (
            <div data-testid="bible-outfit-editor" className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
              <div className="text-xs font-bold text-fg [word-break:keep-all]">
                {isEn ? `${activeOutfit.labelEn} [${activeOutfit.id}]` : `${activeOutfit.labelKo} [${activeOutfit.id}]`}
              </div>
              <LabeledTextInput
                id={`${uid}-outfit-silhouette`} testId="bible-outfit-silhouette-input"
                label={pick("실루엣 및 레이어 구성", "Silhouette Summary")} value={activeOutfit.silhouetteSummary}
                onChange={(silhouetteSummary) => setSheet((prev) => ({ ...prev, outfits: updateOutfitContinuitySlot(prev.outfits, activeOutfit.id, { silhouetteSummary }) }))}
              />
              <LabeledTextInput
                id={`${uid}-outfit-accessories`} testId="bible-outfit-accessories-input"
                label={pick("필수 연속성 소품 (쉼표 구분)", "Key Continuity Accessories (comma-separated)")}
                value={activeOutfit.keyAccessories.join(", ")}
                onChange={(raw) => {
                  const keyAccessories = raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
                  setSheet((prev) => ({ ...prev, outfits: updateOutfitContinuitySlot(prev.outfits, activeOutfit.id, { keyAccessories }) }));
                }}
              />
              <LabeledTextInput
                id={`${uid}-outfit-checklist`} testId="bible-outfit-checklist-input"
                label={pick("컷 간 연속성 체크리스트", "Cut-to-Cut Continuity Checklist")} value={activeOutfit.continuityChecklist}
                onChange={(continuityChecklist) => setSheet((prev) => ({ ...prev, outfits: updateOutfitContinuitySlot(prev.outfits, activeOutfit.id, { continuityChecklist }) }))}
              />
              <LabeledTextInput
                id={`${uid}-outfit-weather`} testId="bible-outfit-weather-input"
                label={pick("파손 · 계절 · 조명 보정 규칙", "Damage / Weather / Lighting Rule")} value={activeOutfit.damageOrWeatherRule}
                onChange={(damageOrWeatherRule) => setSheet((prev) => ({ ...prev, outfits: updateOutfitContinuitySlot(prev.outfits, activeOutfit.id, { damageOrWeatherRule }) }))}
              />
            </div>
          ) : null}
        </div>

        <div className="space-y-3 rounded-xl border border-line bg-raised p-4 xl:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg [word-break:keep-all]">
              <Palette className="h-4 w-4 text-accent" aria-hidden="true" />
              {pick("공식 OKLCH 컬러 칩 · 인쇄 주의 · 채색 금지 규칙", "Official OKLCH Color Chips & Do-Not-Color Rules")}
            </h3>
            <button
              type="button"
              data-testid="bible-chip-filter-toggle"
              aria-pressed={showAllChips}
              onClick={() => setShowAllChips((v) => !v)}
              className={showAllChips ? BTN_ACTIVE : BTN_OUTLINE}
            >
              {showAllChips ? pick("전체 칩 표시 중", "Showing All Chips") : pick("기본 + 현재 의상", "Base + Active Outfit")}
            </button>
          </div>

          <div className="space-y-2.5">
            {visibleColorChips.map((chipItem) => {
              const gamut = assessOklchPrintGamut(chipItem.oklch);
              const printId = `${uid}-chip-print-${chipItem.id}`;
              const doNotId = `${uid}-chip-donot-${chipItem.id}`;
              return (
                <div key={chipItem.id} data-testid={`bible-color-chip-${chipItem.id}`} className="space-y-2 rounded-xl border border-line bg-card p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="inline-block h-7 w-7 shrink-0 rounded-lg border border-line-strong"
                        style={{ backgroundColor: formatOklchCss(chipItem.oklch) }}
                        title={formatOklchCss(chipItem.oklch)}
                        aria-hidden="true"
                      />
                      <div>
                        <div className="text-xs font-bold text-fg [word-break:keep-all]">{isEn ? chipItem.partEn : chipItem.partKo}</div>
                        <div className="text-[11px] text-fg-3 tabular-nums">{`${formatOklchSpec(chipItem.oklch)} · ${chipItem.slotScope}`}</div>
                      </div>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold [word-break:keep-all] ${gamutBadgeClass(gamut.level)}`}>
                      {isEn ? gamut.labelEn : gamut.labelKo}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <LabeledTextInput
                      id={printId} testId={`bible-chip-print-${chipItem.id}`}
                      label={pick("인쇄 주의 메모", "Print CMYK Note")} value={chipItem.printCmykNote} labelTone="text-fg-3"
                      onChange={(printCmykNote) => setSheet((prev) => ({ ...prev, colorChips: updateOfficialColorChip(prev.colorChips, chipItem.id, { printCmykNote }) }))}
                    />
                    <LabeledTextInput
                      id={doNotId} testId={`bible-chip-donot-${chipItem.id}`}
                      label={pick("채색 금지 규칙", "Do-Not-Color Rule")} value={chipItem.doNotColorRule} labelTone="text-bad"
                      onChange={(doNotColorRule) => setSheet((prev) => ({ ...prev, colorChips: updateOfficialColorChip(prev.colorChips, chipItem.id, { doNotColorRule }) }))}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div data-testid="bible-global-prohibitions" className="rounded-xl border border-warn bg-warning-soft p-3 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-warn [word-break:keep-all]">
              <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
              {pick("전역 채색 금지 규칙 (어시스턴트·외주 필독)", "Global Do-Not-Color Rules")}
            </div>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] text-fg [word-break:keep-all]">
              {sheet.globalColoringProhibitions.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-3 rounded-xl border border-line bg-raised p-4 xl:col-span-5">
          <h3 className="text-sm font-semibold text-fg [word-break:keep-all]">
            {pick("누락 항목 완성도 점검 (0~100점)", "Completeness Audit Breakdown")}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { key: "identityAndProportion", labelKo: "신원 · 3면도", labelEn: "Identity & Ratio" },
                { key: "expressionGrid", labelKo: "표정 9궁도", labelEn: "Expression 9-Grid" },
                { key: "outfitContinuity", labelKo: "의상 5슬롯", labelEn: "Outfit 5 Slots" },
                { key: "colorAndPrintRules", labelKo: "컬러 · 금지규칙", labelEn: "Colors & Rules" },
              ] as const
            ).map((sec) => {
              const sc = audit.sectionScores[sec.key];
              return (
                <div key={sec.key} className="rounded-lg border border-line bg-card px-3 py-2">
                  <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick(sec.labelKo, sec.labelEn)}</div>
                  <div className="mt-0.5 text-sm font-bold text-fg tabular-nums">{`${sc.earned} / ${sc.max}`}</div>
                </div>
              );
            })}
          </div>

          <div data-testid="bible-missing-items" className="space-y-1.5">
            {audit.missingItems.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-good bg-good-soft px-3 py-2 text-xs font-medium text-good [word-break:keep-all]">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                {pick("누락 항목 0건 — 어시스턴트 배포 준비 완료", "0 missing items — ready for studio handoff")}
              </div>
            ) : (
              audit.missingItems.slice(0, 6).map((issue) => (
                <div
                  key={issue.id}
                  data-testid={`bible-issue-${issue.id}`}
                  className={`rounded-lg border px-3 py-2 text-xs [word-break:keep-all] ${
                    issue.severity === "critical" ? "border-bad bg-bad-soft text-bad" : "border-warn bg-warning-soft text-warn"
                  }`}
                >
                  {isEn ? issue.messageEn : issue.messageKo}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-line bg-raised p-4 xl:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg [word-break:keep-all]">
              <Copy className="h-4 w-4 text-accent" aria-hidden="true" />
              {pick("어시스턴트 배포용 설정집 내보내기 미리보기", "Assistant Handoff Export Preview")}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {(["markdown", "json", "hidden"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  data-testid={`bible-export-tab-${mode}`}
                  aria-pressed={exportMode === mode}
                  onClick={() => setExportMode(mode)}
                  className={exportMode === mode ? BTN_ACTIVE : BTN_OUTLINE}
                >
                  {mode === "markdown" ? "Markdown" : mode === "json" ? "JSON" : pick("숨기기", "Hide")}
                </button>
              ))}
            </div>
          </div>

          {exportMode !== "hidden" ? (
            <pre
              data-testid="bible-export-preview"
              className="max-h-60 overflow-auto rounded-xl border border-line bg-canvas p-3 text-[11px] leading-relaxed text-fg-2 tabular-nums"
            >
              {exportMode === "markdown" ? markdownDoc : jsonDoc}
            </pre>
          ) : null}
        </div>
      </div>
    </section>
  );
}
