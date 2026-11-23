/**
 * 컷 간 컬러 스크립트 일관성 감사 + 설정집 고유명사·호칭·존댓말 자동 대조 통합 패널.
 * Calm Atelier 시맨틱 토큰 전용(원시 색상 미사용 · 명시적 전이 속성만 사용 · 모든 props optional · KO/EN 지원).
 */

import { CheckCircle2, Palette, RotateCcw, Sparkles, Type, Wrench } from "lucide-react";
import { useId, useMemo, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  DEFAULT_DIALOGUE_LINES, DEFAULT_PRODUCTION_BIBLE_RULES, SPEECH_REGISTER_LABELS,
  applyBatchBibleTermFixes, auditDialogueAgainstBible,
  type BibleFixHistoryEntry, type BibleQaFinding, type BibleQaFindingKind,
  type DialogueLineInput, type ProductionBibleQaRules,
} from "./bible-term-register-checker";
import {
  CHARACTER_COLOR_SLOT_LABELS, DEFAULT_SCENE_COLOR_BASELINE, DEFAULT_SCENE_CUT_SAMPLES,
  auditSceneColorScriptConsistency, formatOklchCss, restoreAllDriftedSlotsToBaseline,
  restoreCutSlotToBaseline, type ColorSampleAuditStatus, type CutSlotColorSample,
  type OklchColor, type SceneColorScriptBaseline,
} from "./color-script-diff-engine";

export type AutoQaContinuityTab = "color-script" | "bible-qa";

export interface AutoQaContinuityPanelProps {
  readonly initialBaseline?: SceneColorScriptBaseline;
  readonly initialCutSamples?: readonly CutSlotColorSample[];
  readonly initialBibleRules?: ProductionBibleQaRules;
  readonly initialDialogueLines?: readonly DialogueLineInput[];
  readonly initialTab?: AutoQaContinuityTab;
  readonly locale?: "ko" | "en";
  readonly onCutSamplesChange?: (samples: readonly CutSlotColorSample[]) => void;
  readonly onDialogueLinesChange?: (lines: readonly DialogueLineInput[]) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg-2 transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const BTN_ACCENT = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const TAB_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;

const COLOR_STATUS_BADGE: Readonly<Record<ColorSampleAuditStatus, { readonly ko: string; readonly en: string; readonly cls: string }>> = {
  matched: { ko: "정상 일치", en: "Matched", cls: "border-good/40 bg-good-soft text-good" },
  "lighting-exempt": { ko: "조명 예외", en: "Lighting Exempt", cls: "border-cool/40 bg-info-soft text-cool" },
  "color-drift": { ko: "채색 이탈", en: "Color Drift", cls: "border-bad/40 bg-bad-soft text-bad" },
  "unregistered-slot": { ko: "미등록 슬롯", en: "Unregistered", cls: "border-line bg-raised text-fg-3" },
};

const FINDING_BADGE: Readonly<Record<BibleQaFindingKind, { readonly ko: string; readonly en: string; readonly badgeCls: string; readonly markCls: string }>> = {
  "term-mismatch": { ko: "고유명사 오타", en: "Term Mismatch", badgeCls: "border-warn/40 bg-warning-soft text-warn", markCls: "rounded-sm bg-warning-soft px-0.5 font-semibold text-warn underline decoration-warn decoration-wavy underline-offset-4" },
  "address-mismatch": { ko: "호칭 오류", en: "Address Mismatch", badgeCls: "border-bad/40 bg-bad-soft text-bad", markCls: "rounded-sm bg-bad-soft px-0.5 font-semibold text-bad underline decoration-bad decoration-wavy underline-offset-4" },
  "register-violation": { ko: "말투 위반", en: "Register Violation", badgeCls: "border-bad/40 bg-bad-soft text-bad", markCls: "rounded-sm bg-bad-soft px-0.5 font-semibold text-bad underline decoration-bad decoration-dotted underline-offset-4" },
};

function OklchSwatch({ color, label }: { readonly color: OklchColor; readonly label: string }): ReactElement {
  const swatchStyle = { "--qa-swatch": formatOklchCss(color) } as CSSProperties;
  return <span role="img" aria-label={label} style={swatchStyle} className="inline-block h-4 w-4 shrink-0 rounded-full border border-line-strong bg-[var(--qa-swatch)]" />;
}

function formatOklchShort(color: OklchColor): string {
  return `L${color.l.toFixed(2)} C${color.c.toFixed(2)} H${Math.round(color.h)}°`;
}

function renderHighlightedDialogue(text: string, lineFindings: readonly BibleQaFinding[], isEn: boolean): ReactNode {
  if (lineFindings.length === 0) return text;
  const sorted = [...lineFindings].sort((a, b) => a.startIndex - b.startIndex || b.endIndex - a.endIndex);
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const finding of sorted) {
    if (finding.startIndex < cursor || finding.endIndex > text.length || finding.startIndex >= finding.endIndex) continue;
    if (finding.startIndex > cursor) parts.push(text.slice(cursor, finding.startIndex));
    parts.push(
      <mark key={finding.id} data-finding-kind={finding.kind} title={isEn ? finding.messageEn : finding.messageKo} className={FINDING_BADGE[finding.kind].markCls}>
        {text.slice(finding.startIndex, finding.endIndex)}
      </mark>,
    );
    cursor = finding.endIndex;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

/** 장기 연재 웹툰 컬러 스크립트 일관성 감사 & 설정집 대사 검수 통합 패널. */
export function AutoQaContinuityPanel({
  initialBaseline = DEFAULT_SCENE_COLOR_BASELINE,
  initialCutSamples = DEFAULT_SCENE_CUT_SAMPLES,
  initialBibleRules = DEFAULT_PRODUCTION_BIBLE_RULES,
  initialDialogueLines = DEFAULT_DIALOGUE_LINES,
  initialTab = "color-script",
  locale,
  onCutSamplesChange,
  onDialogueLinesChange,
}: AutoQaContinuityPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isEn = (locale ?? storeLang) === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [activeTab, setActiveTab] = useState<AutoQaContinuityTab>(initialTab);
  const [cutSamples, setCutSamples] = useState<readonly CutSlotColorSample[]>(initialCutSamples);
  const [showDriftsOnly, setShowDriftsOnly] = useState(false);
  const [colorNotice, setColorNotice] = useState<string | null>(null);
  const [dialogueLines, setDialogueLines] = useState<readonly DialogueLineInput[]>(initialDialogueLines);
  const [fixHistory, setFixHistory] = useState<readonly BibleFixHistoryEntry[]>([]);
  const [bibleNotice, setBibleNotice] = useState<string | null>(null);

  const colorReport = useMemo(
    () => auditSceneColorScriptConsistency(initialBaseline, cutSamples),
    [initialBaseline, cutSamples],
  );
  const bibleReport = useMemo(
    () => auditDialogueAgainstBible(dialogueLines, initialBibleRules),
    [dialogueLines, initialBibleRules],
  );
  const visibleColorEntries = useMemo(
    () => (showDriftsOnly ? colorReport.entries.filter((e) => e.status === "color-drift") : colorReport.entries),
    [colorReport.entries, showDriftsOnly],
  );
  const findingsByLineId = useMemo(() => {
    const map = new Map<string, BibleQaFinding[]>();
    for (const f of bibleReport.findings) {
      const list = map.get(f.lineId);
      if (list) list.push(f);
      else map.set(f.lineId, [f]);
    }
    return map;
  }, [bibleReport.findings]);

  const updateCutSamples = (next: readonly CutSlotColorSample[], notice: string) => {
    setCutSamples(next);
    setColorNotice(notice);
    onCutSamplesChange?.(next);
  };

  const handleRestoreSingleSlot = (sampleId: string, label: string) => {
    updateCutSamples(
      restoreCutSlotToBaseline(initialBaseline, cutSamples, sampleId),
      pick(`${label} 색상을 씬 기준 팔레트로 복원했습니다.`, `Restored ${label} to the scene baseline color.`),
    );
  };

  const handleRestoreAllDrifts = () => {
    const result = restoreAllDriftedSlotsToBaseline(initialBaseline, cutSamples);
    if (result.restoredCount === 0) return;
    updateCutSamples(
      result.samples,
      pick(
        `채색 이탈 ${result.restoredCount}건을 기준색으로 일괄 복원했습니다(조명 예외 컷 유지).`,
        `Restored ${result.restoredCount} drifted slot(s) to baseline (lighting-exempt cuts preserved).`,
      ),
    );
  };

  const handleToggleLightingOverride = (sampleId: string, currentlyExempt: boolean) => {
    const next = cutSamples.map((sample) =>
      sample.sampleId !== sampleId
        ? sample
        : {
            ...sample,
            lightingOverride: currentlyExempt
              ? null
              : { kind: "backlight" as const, reasonKo: "작가 수동 조명·연출 예외 승인", reasonEn: "Manual lighting/FX exemption approved" },
          },
    );
    updateCutSamples(
      next,
      currentlyExempt
        ? pick("조명 예외를 해제해 다시 채색 감사 대상으로 돌렸습니다.", "Cleared lighting override; re-evaluating color drift.")
        : pick("해당 컷을 의도된 조명·연출 예외로 등록했습니다.", "Marked this cut slot as an intentional lighting exemption."),
    );
  };

  const handleDialogueChange = (lineId: string, nextText: string) => {
    const next = dialogueLines.map((line) => (line.id === lineId ? { ...line, text: nextText } : line));
    setDialogueLines(next);
    onDialogueLinesChange?.(next);
  };

  const handleBatchBibleFix = () => {
    const result = applyBatchBibleTermFixes(dialogueLines, bibleReport.findings);
    if (result.appliedCount === 0) return;
    setDialogueLines(result.lines);
    setFixHistory(result.appliedFixes);
    setBibleNotice(
      pick(
        `${result.touchedLineCount}개 대사에서 고유명사·호칭 ${result.appliedCount}건을 정본으로 치환했습니다.`,
        `Replaced ${result.appliedCount} canon term/address issue(s) across ${result.touchedLineCount} line(s).`,
      ),
    );
    onDialogueLinesChange?.(result.lines);
  };

  const handleSingleBibleFix = (finding: BibleQaFinding) => {
    const result = applyBatchBibleTermFixes(dialogueLines, [finding]);
    if (result.appliedCount === 0) return;
    setDialogueLines(result.lines);
    setFixHistory((prev) => [...result.appliedFixes, ...prev].slice(0, 8));
    setBibleNotice(
      pick(
        `'${finding.matchedText}' → '${finding.suggestedReplacement ?? ""}' 치환 완료`,
        `Replaced '${finding.matchedText}' → '${finding.suggestedReplacement ?? ""}'`,
      ),
    );
    onDialogueLinesChange?.(result.lines);
  };

  const colorTabId = `${uid}-tab-color`;
  const bibleTabId = `${uid}-tab-bible`;
  const colorPanelId = `${uid}-panel-color`;
  const biblePanelId = `${uid}-panel-bible`;

  const colorMetrics = [
    { id: "color-consistency-score", label: pick("일관성 점수", "Consistency"), value: `${colorReport.consistencyScore}%`, cls: "text-fg" },
    { id: "color-drift-count", label: pick("채색 이탈", "Color Drift"), value: String(colorReport.driftCount), cls: colorReport.driftCount > 0 ? "text-bad" : "text-good" },
    { id: "color-exempt-count", label: pick("조명 예외", "Lighting Exempt"), value: String(colorReport.lightingExemptCount), cls: "text-cool" },
    { id: "color-max-delta", label: pick("최대 OKLCH ΔE", "Max OKLCH ΔE"), value: colorReport.maxDeltaE.toFixed(3), cls: "text-fg" },
  ];
  const bibleMetrics = [
    { id: "bible-total-findings", label: pick("총 검출 오류", "Total Findings"), value: String(bibleReport.findingCount), cls: "text-fg" },
    { id: "bible-term-count", label: pick("고유명사 오타", "Term Mismatch"), value: String(bibleReport.termMismatchCount), cls: "text-warn" },
    { id: "bible-address-count", label: pick("호칭 오류", "Address Mismatch"), value: String(bibleReport.addressMismatchCount), cls: "text-bad" },
    { id: "bible-register-count", label: pick("반말/존댓말 위반", "Register Violation"), value: String(bibleReport.registerViolationCount), cls: "text-bad" },
  ];

  return (
    <section
      aria-label={pick("자동 연속성 QA · 컬러 스크립트 및 설정집 대조", "Auto Continuity QA · Color Script & Production Bible")}
      data-testid="auto-qa-continuity-panel"
      className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all]"
    >
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-fg">
            {pick("연재 연속성 자동 QA · 컬러 스크립트 · 설정집 대조", "Continuity Auto-QA · Color Script & Bible Audit")}
          </h2>
          <span className="rounded-full border border-line bg-card px-2.5 py-0.5 text-[0.7rem] text-fg-3">
            {pick("로컬 OKLCH · 즉시 보정", "Local OKLCH · 1-Click Fix")}
          </span>
        </div>
        <p className="text-xs leading-relaxed text-fg-3">
          {pick(
            "같은 씬 안의 채색 이탈(넥타이·머리·눈·의상)과 설정집 고유명사·호칭·반말/존댓말 오류를 실시간 적발합니다.",
            "Detects unintended cut-to-cut OKLCH color drift and Production Bible term, address, and speech-register errors in real time.",
          )}
        </p>
      </header>

      <div role="tablist" aria-label={pick("연속성 감사 도구 탭", "Continuity Audit Tabs")} className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-canvas p-1">
        <button id={colorTabId} type="button" role="tab" aria-selected={activeTab === "color-script"} aria-controls={colorPanelId} data-testid="tab-color-script" onClick={() => setActiveTab("color-script")} className={`${TAB_BASE} ${activeTab === "color-script" ? "bg-accent text-on-accent" : "bg-transparent text-fg-2 hover:bg-raised hover:text-fg"}`}>
          <Palette className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{pick("컷 간 컬러 스크립트 감사", "Color Script Diff Audit")}</span>
          <span className="rounded-full bg-panel/30 px-1.5 py-0.5 text-[0.68rem] tabular-nums">{colorReport.driftCount}</span>
        </button>
        <button id={bibleTabId} type="button" role="tab" aria-selected={activeTab === "bible-qa"} aria-controls={biblePanelId} data-testid="tab-bible-qa" onClick={() => setActiveTab("bible-qa")} className={`${TAB_BASE} ${activeTab === "bible-qa" ? "bg-accent text-on-accent" : "bg-transparent text-fg-2 hover:bg-raised hover:text-fg"}`}>
          <Type className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{pick("설정집 고유명사·존댓말 대조", "Bible Term & Register Audit")}</span>
          <span className="rounded-full bg-panel/30 px-1.5 py-0.5 text-[0.68rem] tabular-nums">{bibleReport.findingCount}</span>
        </button>
      </div>

      {activeTab === "color-script" ? (
        <div id={colorPanelId} role="tabpanel" aria-labelledby={colorTabId} data-testid="panel-color-script" className="flex flex-col gap-3">
          <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-fg">{pick(initialBaseline.sceneTitleKo, initialBaseline.sceneTitleEn)}</h3>
                <p className="text-[0.72rem] text-fg-3">
                  {pick("기준 조명:", "Scene Lighting:")} {pick(initialBaseline.lightingMoodKo, initialBaseline.lightingMoodEn)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" className={BTN_ACCENT} data-testid="restore-all-drifts-btn" disabled={colorReport.driftCount === 0} onClick={handleRestoreAllDrifts}>
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{pick(`이탈 ${colorReport.driftCount}건 기준색 복원`, `Restore ${colorReport.driftCount} Drifted`)}</span>
                </button>
                <button type="button" className={BTN} data-testid="toggle-drifts-only-btn" aria-pressed={showDriftsOnly} onClick={() => setShowDriftsOnly((prev) => !prev)}>
                  {showDriftsOnly ? pick("전체 컷 보기", "Show All Cuts") : pick("이탈 경고만", "Drifts Only")}
                </button>
                <button type="button" className={BTN} data-testid="reset-color-demo-btn" onClick={() => updateCutSamples(initialCutSamples, pick("씬 컷 샘플을 초기 상태로 되돌렸습니다.", "Reset scene cut samples to defaults."))}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{pick("초기화", "Reset")}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-line/70 pt-2.5 sm:grid-cols-4">
              {colorMetrics.map((m) => (
                <div key={m.id} className="rounded-md bg-panel px-2.5 py-2">
                  <span className="text-[0.68rem] text-fg-3">{m.label}</span>
                  <p data-testid={m.id} className={`text-sm font-bold tabular-nums ${m.cls}`}>{m.value}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 border-t border-line/70 pt-2.5">
              <span className="text-[0.7rem] font-semibold text-fg-3">{pick("기준 팔레트:", "Baseline Palette:")}</span>
              {initialBaseline.signatures.map((sig) => (
                <span key={`${sig.characterId}-${sig.slot}`} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-2 py-0.5 text-[0.7rem] text-fg-2">
                  <OklchSwatch color={sig.baselineColor} label={`${sig.characterName} ${pick(sig.itemLabelKo, sig.itemLabelEn)}`} />
                  <span>{sig.characterName} · {pick(sig.itemLabelKo, sig.itemLabelEn)}</span>
                </span>
              ))}
            </div>
          </div>

          {colorNotice ? <p role="status" data-testid="color-audit-status" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2">{colorNotice}</p> : null}

          {visibleColorEntries.length === 0 ? (
            <div data-testid="color-audit-clean-empty" className="flex items-center gap-2 rounded-lg border border-good/40 bg-good-soft p-3 text-xs text-good">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{pick("표시할 채색 이탈 경고가 없습니다. 모든 컷이 기준 팔레트와 일치합니다.", "No color drift warnings to display. All cuts match the scene baseline.")}</span>
            </div>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="color-audit-list">
              {visibleColorEntries.map((entry) => {
                const badge = COLOR_STATUS_BADGE[entry.status];
                const slotLabel = pick(CHARACTER_COLOR_SLOT_LABELS[entry.slot].ko, CHARACTER_COLOR_SLOT_LABELS[entry.slot].en);
                const itemLabel = pick(entry.itemLabelKo, entry.itemLabelEn);
                const cutLabel = pick(entry.cutLabelKo, entry.cutLabelEn);
                return (
                  <li key={entry.sampleId} data-testid={`color-entry-${entry.sampleId}`} data-status={entry.status} className="flex flex-col gap-2 rounded-lg border border-line bg-card p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-raised px-2 py-0.5 font-bold tabular-nums text-fg">{cutLabel}</span>
                        <strong className="text-fg">{entry.characterName}</strong>
                        <span className="text-fg-3">{slotLabel} · {itemLabel}</span>
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${badge.cls}`}>{pick(badge.ko, badge.en)}</span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2">
                      <div className="flex flex-wrap items-center gap-3 text-[0.72rem] tabular-nums text-fg-2">
                        {entry.baselineColor ? (
                          <span className="inline-flex items-center gap-1.5">
                            <OklchSwatch color={entry.baselineColor} label={pick("기준색", "Baseline")} />
                            <span>{pick("기준", "Base")} {formatOklchShort(entry.baselineColor)}</span>
                          </span>
                        ) : null}
                        <span className="text-fg-3" aria-hidden="true">→</span>
                        <span className="inline-flex items-center gap-1.5">
                          <OklchSwatch color={entry.sampledColor} label={pick("컷 채색", "Sampled")} />
                          <span>{pick("컷", "Cut")} {formatOklchShort(entry.sampledColor)}</span>
                        </span>
                        {entry.breakdown ? <span className="font-semibold text-fg">ΔE {entry.breakdown.deltaE.toFixed(3)} · Δh {entry.breakdown.hueDiffDeg.toFixed(1)}°</span> : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {entry.status === "color-drift" ? (
                          <>
                            <button type="button" className={BTN_ACCENT} data-testid={`restore-slot-${entry.sampleId}`} onClick={() => handleRestoreSingleSlot(entry.sampleId, `${cutLabel} ${entry.characterName} ${itemLabel}`)}>
                              <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{pick("기준색 복원", "Restore Baseline")}</span>
                            </button>
                            <button type="button" className={BTN} data-testid={`exempt-slot-${entry.sampleId}`} onClick={() => handleToggleLightingOverride(entry.sampleId, false)}>
                              {pick("조명 예외 처리", "Mark Lighting Exempt")}
                            </button>
                          </>
                        ) : null}
                        {entry.status === "lighting-exempt" ? (
                          <button type="button" className={BTN} data-testid={`clear-exempt-${entry.sampleId}`} onClick={() => handleToggleLightingOverride(entry.sampleId, true)}>
                            {pick("예외 해제", "Clear Exempt")}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {entry.lightingOverride ? (
                      <p className="text-[0.72rem] text-cool">
                        {pick("조명/연출 사유:", "Lighting Override:")} {pick(entry.lightingOverride.reasonKo, entry.lightingOverride.reasonEn)}
                      </p>
                    ) : null}
                    {entry.finding ? <p className="text-[0.72rem] text-bad">{pick(entry.finding.summaryKo, entry.finding.summaryEn)}</p> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {activeTab === "bible-qa" ? (
        <div id={biblePanelId} role="tabpanel" aria-labelledby={bibleTabId} data-testid="panel-bible-qa" className="flex flex-col gap-3">
          <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-fg">{pick(initialBibleRules.titleKo, initialBibleRules.titleEn)}</h3>
                <p className="text-[0.72rem] tabular-nums text-fg-3">
                  {pick(`정본 고유명사 ${initialBibleRules.terms.length}종 · 캐릭터 화법 규칙 ${initialBibleRules.pairRules.length}쌍 적용 중`, `${initialBibleRules.terms.length} canon terms · ${initialBibleRules.pairRules.length} speech-register pairs active`)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" className={BTN_ACCENT} data-testid="batch-bible-fix-btn" disabled={bibleReport.autoFixableCount === 0} onClick={handleBatchBibleFix}>
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{pick(`고유명사·호칭 ${bibleReport.autoFixableCount}건 일괄 치환`, `Batch Replace ${bibleReport.autoFixableCount} Term/Address`)}</span>
                </button>
                <button type="button" className={BTN} data-testid="reset-bible-demo-btn" onClick={() => { setDialogueLines(initialDialogueLines); setFixHistory([]); setBibleNotice(pick("대사 초안을 초기 상태로 되돌렸습니다.", "Reset dialogue draft to defaults.")); onDialogueLinesChange?.(initialDialogueLines); }}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{pick("초기화", "Reset")}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-line/70 pt-2.5 sm:grid-cols-4">
              {bibleMetrics.map((m) => (
                <div key={m.id} className="rounded-md bg-panel px-2.5 py-2">
                  <span className="text-[0.68rem] text-fg-3">{m.label}</span>
                  <p data-testid={m.id} className={`text-sm font-bold tabular-nums ${m.cls}`}>{m.value}</p>
                </div>
              ))}
            </div>
          </div>

          {bibleNotice ? (
            <div role="status" data-testid="bible-fix-status" className="flex flex-col gap-1 rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2">
              <p className="font-semibold text-fg">{bibleNotice}</p>
              {fixHistory.length > 0 ? (
                <p className="text-[0.72rem] tabular-nums text-fg-3">
                  {fixHistory.slice(0, 5).map((item) => `${item.cutNumber}컷 '${item.before}'→'${item.after}'`).join(" · ")}
                </p>
              ) : null}
            </div>
          ) : null}

          <ul className="flex flex-col gap-2.5" data-testid="bible-dialogue-list">
            {dialogueLines.map((line) => {
              const lineFindings = findingsByLineId.get(line.id) ?? [];
              const pairRule = initialBibleRules.pairRules.find((r) => r.speaker === line.speaker && r.listener === line.listener);
              const textareaId = `${uid}-line-${line.id}`;
              return (
                <li key={line.id} data-testid={`dialogue-row-${line.id}`} className="flex flex-col gap-2 rounded-lg border border-line bg-card p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md bg-raised px-2 py-0.5 font-bold tabular-nums text-fg">{pick(`${line.cutNumber}컷`, `Cut ${line.cutNumber}`)}</span>
                      <strong className="text-fg">{line.speaker} → {line.listener}</strong>
                      {pairRule ? (
                        <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-[0.68rem] text-fg-3">
                          {pick(`${SPEECH_REGISTER_LABELS[pairRule.expectedRegister].ko} · 정본 호칭 '${pairRule.canonAddressTitle}'`, `${SPEECH_REGISTER_LABELS[pairRule.expectedRegister].en} · Title '${pairRule.canonAddressTitle}'`)}
                        </span>
                      ) : null}
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold tabular-nums ${lineFindings.length === 0 ? "border-good/40 bg-good-soft text-good" : "border-bad/40 bg-bad-soft text-bad"}`}>
                      {lineFindings.length === 0 ? pick("설정 일치", "Clean") : pick(`오류 ${lineFindings.length}건`, `${lineFindings.length} issue(s)`)}
                    </span>
                  </div>

                  <p data-testid={`dialogue-preview-${line.id}`} className="rounded-md bg-panel px-3 py-2 text-sm leading-relaxed text-fg">
                    {renderHighlightedDialogue(line.text, lineFindings, isEn)}
                  </p>

                  <label htmlFor={textareaId} className="sr-only">
                    {pick(`${line.cutNumber}컷 ${line.speaker} 대사 편집`, `Edit Cut ${line.cutNumber} ${line.speaker} dialogue`)}
                  </label>
                  <textarea id={textareaId} rows={2} data-testid={`dialogue-input-${line.id}`} value={line.text} onChange={(event) => handleDialogueChange(line.id, event.currentTarget.value)} className={`min-h-11 w-full rounded-lg border border-line bg-field px-3 py-2 text-xs text-fg placeholder:text-fg-3 ${FOCUS_RING}`} />

                  {lineFindings.length > 0 ? (
                    <div className="flex flex-col gap-1.5 border-t border-line/60 pt-2">
                      {lineFindings.map((finding) => {
                        const meta = FINDING_BADGE[finding.kind];
                        return (
                          <div key={finding.id} className="flex flex-wrap items-center justify-between gap-2 text-[0.72rem]">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`rounded-full border px-2 py-0.5 text-[0.66rem] font-semibold ${meta.badgeCls}`}>{pick(meta.ko, meta.en)}</span>
                              <span className="text-fg-2">{pick(finding.messageKo, finding.messageEn)}</span>
                            </div>
                            {finding.autoFixable && finding.suggestedReplacement ? (
                              <button type="button" className={BTN} data-testid={`fix-single-${finding.id}`} onClick={() => handleSingleBibleFix(finding)}>
                                {pick(`'${finding.suggestedReplacement}' 치환`, `Replace → '${finding.suggestedReplacement}'`)}
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
