/**
 * 웹툰 현업 제작·출고 통합 스튜디오 패널:
 * 1) 캐릭터 턴어라운드·표정·OKLCH 팔레트 자동 추종 도크 & 액션 물리 궤적 이펙트
 * 2) 60컷 연재 마감 워룸 병목 분석 & 어시스턴트 원클릭 배분
 * 3) 배리어프리(WCAG 2.2 AAA) 대본·WebVTT & 팬덤 굿즈 2mm 칼선·CMYK 화이트 백킹
 * Calm Atelier 시맨틱 토큰 전용(raw color 0건 · 명시적 transition 속성만 사용 · 브라우저 스토리지 비의존).
 */

import { Accessibility, Check, Clock, Copy, Download, Layers, Scissors, Sparkles, Users, Zap } from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  DEFAULT_BARRIER_FREE_EPISODE_INPUT, GOODS_PRODUCT_SPECS, buildBarrierFreeEpisodeScript,
  generateGoodsPrintDieCutPackage, type GoodsProductKind,
} from "./barrierfree-and-goods-diecut";
import {
  ACTION_VFX_PRESETS, DEFAULT_CUT_REFERENCE_CONTEXTS, DEFAULT_TRAJECTORY_STROKES,
  analyzeDeadlineWarRoom, autoAssignBottleneckCuts, createDefaultSixtyCutWarRoomInput,
  generateActionTrajectoryVfx, resolveCutCharacterReferenceDock,
  type ActionTrajectoryVfxKind, type CutLightingMood, type CutReferenceContext,
  type ExpressionPresetId, type WarRoomAssignmentPlan,
} from "./reference-dock-action-fx-warroom";

export type ProductionGoodsTab = "reference-fx" | "deadline-warroom" | "barrierfree-goods";
export interface StudioProductionGoodsPanelProps {
  readonly initialTab?: ProductionGoodsTab;
  readonly initialWorkTitle?: string;
  readonly initialEpisodeLabel?: string;
  readonly initialCutContext?: CutReferenceContext;
  readonly initialGoodsKind?: GoodsProductKind;
}

type BarrierFreePreviewMode = "script" | "vtt" | "braille" | "json";
const LIGHTING_MOODS: readonly { readonly id: CutLightingMood; readonly ko: string; readonly en: string }[] = [
  { id: "daylight", ko: "주간 자연광", en: "Daylight" },
  { id: "sunset", ko: "노을 역광", en: "Sunset" },
  { id: "night-cool", ko: "야간 청광", en: "Night Cool" },
  { id: "indoor-warm", ko: "실내 난광", en: "Indoor Warm" },
];
const VFX_KINDS: readonly ActionTrajectoryVfxKind[] = ["sword-arc", "flame-ribbon", "water-splash", "impact-shatter"];
const GOODS_KINDS: readonly GoodsProductKind[] = ["acrylic-stand", "photocard", "keyring", "sticker"];
const BF_MODES: readonly [BarrierFreePreviewMode, string, string][] = [
  ["script", "대본", "Script"], ["vtt", "WebVTT", "WebVTT"], ["braille", "점자 텍스트", "Braille"], ["json", "스크린리더 JSON", "Screen-Reader JSON"],
];

const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BTN_SOLID = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised ${FOCUS_RING} [word-break:keep-all]`;
const INPUT_CLS = `min-h-11 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg placeholder:text-fg-3 ${FOCUS_RING}`;

function downloadTextFile(filename: string, content: string, mimeType: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  URL.revokeObjectURL(url);
}

export function StudioProductionGoodsPanel({
  initialTab = "reference-fx", initialWorkTitle, initialEpisodeLabel, initialCutContext, initialGoodsKind = "acrylic-stand",
}: StudioProductionGoodsPanelProps = {}): ReactElement {
  const uid = useId();
  const isEn = useI18n((state) => state.lang) === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [activeTab, setActiveTab] = useState<ProductionGoodsTab>(initialTab);
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedCutIndex, setSelectedCutIndex] = useState(0);
  const [customTagInput, setCustomTagInput] = useState("");
  const [lightingOverride, setLightingOverride] = useState<CutLightingMood | null>(null);
  const [selectedExpression, setSelectedExpression] = useState<ExpressionPresetId | null>(null);
  const [vfxKind, setVfxKind] = useState<ActionTrajectoryVfxKind>("sword-arc");
  const [strokeIdx, setStrokeIdx] = useState(0);
  const [perspectiveTaper, setPerspectiveTaper] = useState(0.76);
  const [vfxIntensity, setVfxIntensity] = useState(1.1);

  const [warRoomSeed] = useState(() => {
    const base = createDefaultSixtyCutWarRoomInput();
    return initialEpisodeLabel?.trim() ? { ...base, episodeLabel: initialEpisodeLabel.trim() } : base;
  });
  const [deadlineHours, setDeadlineHours] = useState(warRoomSeed.hoursUntilDeadline);
  const [warRoomCuts, setWarRoomCuts] = useState(warRoomSeed.cuts);
  const [assignmentPlan, setAssignmentPlan] = useState<WarRoomAssignmentPlan | null>(null);

  const [bfPreviewMode, setBfPreviewMode] = useState<BarrierFreePreviewMode>("script");
  const [goodsKind, setGoodsKind] = useState<GoodsProductKind>(initialGoodsKind);
  const [goodsTitle, setGoodsTitle] = useState(initialWorkTitle?.trim() || "은월의 기록 — 강서연");
  const [goodsOffsetMm, setGoodsOffsetMm] = useState(2.0);
  const [goodsBleedMm, setGoodsBleedMm] = useState(3.0);

  const activeCutContext = useMemo<CutReferenceContext>(() => {
    const base = selectedCutIndex === 0 && initialCutContext ? initialCutContext : DEFAULT_CUT_REFERENCE_CONTEXTS[selectedCutIndex] ?? DEFAULT_CUT_REFERENCE_CONTEXTS[0];
    const extraTags = customTagInput.split(/[,\s]+/u).map((t) => t.trim()).filter(Boolean);
    return { ...base, tags: [...(base.tags ?? []), ...extraTags], lightingMood: lightingOverride ?? base.lightingMood ?? "daylight", preferredExpression: selectedExpression ?? base.preferredExpression };
  }, [customTagInput, initialCutContext, lightingOverride, selectedCutIndex, selectedExpression]);

  const dockResult = useMemo(() => resolveCutCharacterReferenceDock(activeCutContext), [activeCutContext]);
  const activeChar = dockResult.primaryCharacter;
  const activeExprId = selectedExpression ?? activeChar?.recommendedExpressionId ?? "neutral";
  const activeExprObj = activeChar?.expressions.find((e) => e.id === activeExprId) ?? activeChar?.expressions[0];

  const vfxResult = useMemo(() => generateActionTrajectoryVfx({
    kind: vfxKind, points: (DEFAULT_TRAJECTORY_STROKES[strokeIdx] ?? DEFAULT_TRAJECTORY_STROKES[0]).points,
    perspectiveTaper, intensity: vfxIntensity, seed: 23 + strokeIdx * 7,
  }), [perspectiveTaper, strokeIdx, vfxIntensity, vfxKind]);

  const warRoomInput = useMemo(() => ({ ...warRoomSeed, hoursUntilDeadline: deadlineHours, cuts: warRoomCuts }), [deadlineHours, warRoomCuts, warRoomSeed]);
  const warRoomAnalysis = useMemo(() => analyzeDeadlineWarRoom(warRoomInput), [warRoomInput]);

  const barrierFreePkg = useMemo(() => buildBarrierFreeEpisodeScript({
    ...DEFAULT_BARRIER_FREE_EPISODE_INPUT, workTitleKo: initialWorkTitle?.trim() || DEFAULT_BARRIER_FREE_EPISODE_INPUT.workTitleKo,
  }), [initialWorkTitle]);

  const goodsPkg = useMemo(() => generateGoodsPrintDieCutPackage({
    kind: goodsKind, title: goodsTitle, dpi: 300, dieCutOffsetMm: goodsOffsetMm, whiteTrapShrinkMm: 0.15, bleedMm: goodsBleedMm,
  }), [goodsBleedMm, goodsKind, goodsOffsetMm, goodsTitle]);

  const handleCopy = (text: string, koMsg: string, enMsg: string): void => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).then(() => setStatusMessage(pick(koMsg, enMsg)), () => setStatusMessage(pick(koMsg, enMsg)));
      return;
    }
    setStatusMessage(pick(koMsg, enMsg));
  };

  const handleDownload = (filename: string, content: string, mime: string, koMsg: string, enMsg: string): void => {
    downloadTextFile(filename, content, mime);
    setStatusMessage(pick(koMsg, enMsg));
  };

  const handleAutoAssign = (): void => {
    const plan = autoAssignBottleneckCuts(warRoomInput);
    setAssignmentPlan(plan);
    setWarRoomCuts(plan.updatedCuts);
    setStatusMessage(pick(plan.summaryKo, plan.summaryEn));
  };

  const bfPreviewText = bfPreviewMode === "vtt" ? (isEn ? barrierFreePkg.webVttEn : barrierFreePkg.webVttKo)
    : bfPreviewMode === "braille" ? barrierFreePkg.brailleTextKo
      : bfPreviewMode === "json" ? barrierFreePkg.screenReaderJson
        : isEn ? barrierFreePkg.structuredScriptEn : barrierFreePkg.structuredScriptKo;

  const riskBadgeCls = warRoomAnalysis.deadlineRisk === "critical" ? "bg-bad-soft text-bad" : warRoomAnalysis.deadlineRisk === "tight" ? "bg-warning-soft text-warn" : "bg-good-soft text-good";
  const tabs: readonly { readonly id: ProductionGoodsTab; readonly label: string }[] = [
    { id: "reference-fx", label: pick("캐릭터 레퍼런스 · 액션 이펙트", "Character Dock & Action VFX") },
    { id: "deadline-warroom", label: pick("연재 마감 워룸", "Deadline War-Room") },
    { id: "barrierfree-goods", label: pick("배리어프리 · 굿즈 칼선/화이트잉크", "Barrier-Free & Goods Die-Cut") },
  ];

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-line bg-panel p-5 text-fg [word-break:keep-all]" aria-label={pick("웹툰 현업 제작·굿즈 출고 스튜디오", "Webtoon Production & Goods Studio")}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Layers className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-base font-bold text-fg">{pick("현업 연재 제작 · 굿즈 자동 출고 스튜디오", "Pro Serialization & Goods Print Studio")}</h2>
          </div>
          <p className="text-xs text-fg-2">{pick("컷 연동 캐릭터 시트·물리 궤적 VFX·60컷 마감 워룸·WCAG AAA 배리어프리·300DPI 굿즈 칼선을 로컬에서 처리합니다.", "Sync cut character sheets, action VFX, 60-cut war-room scheduling, WCAG AAA scripts, and 300DPI goods die-cuts locally.")}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-good-soft px-3 py-1 text-xs font-semibold text-good tabular-nums">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> {pick("로컬 결정론 엔진 · 5대 제작 파이프라인", "Deterministic Local · 5 Pipelines")}
        </span>
      </header>

      <div role="tablist" aria-label={pick("제작·출고 스튜디오 탭", "Production studio tabs")} className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button key={tab.id} id={`${uid}-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`${uid}-panel-${tab.id}`} onClick={() => setActiveTab(tab.id)} className={activeTab === tab.id ? BTN_SOLID : BTN_OUTLINE}>{tab.label}</button>
        ))}
      </div>

      {statusMessage ? (
        <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-xs font-semibold text-accent">
          <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>{statusMessage}</span>
        </div>
      ) : null}

      {activeTab === "reference-fx" ? (
        <div id={`${uid}-panel-reference-fx`} role="tabpanel" aria-labelledby={`${uid}-tab-reference-fx`} className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><Users className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-bold text-fg">{pick("캐릭터 턴어라운드 · 표정 · OKLCH 팔레트 자동 추종 도크", "Auto-Follow Character Turnaround, Expressions & OKLCH Dock")}</h3></div>
              <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent tabular-nums">{pick(dockResult.syncSummaryKo, dockResult.syncSummaryEn)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {DEFAULT_CUT_REFERENCE_CONTEXTS.map((ctx, idx) => (
                <button key={ctx.cutId} type="button" aria-pressed={selectedCutIndex === idx} onClick={() => { setSelectedCutIndex(idx); setLightingOverride(null); setSelectedExpression(null); }} className={selectedCutIndex === idx ? BTN_SOLID : BTN_OUTLINE}>
                  <span className="tabular-nums">CUT #{ctx.cutNumber}</span> · {pick(ctx.sceneTitleKo, ctx.sceneTitleEn)}
                </button>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label htmlFor={`${uid}-cut-tags`} className="mb-1 block text-xs font-semibold text-fg-2">{pick("추가 등장인물·감정 태그 (쉼표 구분)", "Extra Character / Mood Tags")}</label>
                <input id={`${uid}-cut-tags`} type="text" value={customTagInput} onChange={(e) => setCustomTagInput(e.target.value)} placeholder={pick("예: 한도윤, 눈물", "e.g. Doyun, tearful")} className={INPUT_CLS} />
              </div>
              <div>
                <span className="mb-1 block text-xs font-semibold text-fg-2">{pick("장면 조명 무드 (OKLCH 스와치 자동 보정)", "Cut Lighting Mood (OKLCH Sync)")}</span>
                <div className="flex flex-wrap gap-1.5">
                  {LIGHTING_MOODS.map((m) => (
                    <button key={m.id} type="button" aria-pressed={dockResult.lightingMood === m.id} onClick={() => setLightingOverride(m.id)} className={dockResult.lightingMood === m.id ? BTN_SOLID : BTN_OUTLINE}>{pick(m.ko, m.en)}</button>
                  ))}
                </div>
              </div>
            </div>
            {activeChar ? (
              <div className="flex flex-col gap-3 border-t border-line pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-fg">{pick(activeChar.character.nameKo, activeChar.character.nameEn)} · {pick(activeChar.character.roleTagKo, activeChar.character.roleTagEn)}</span>
                  <span className="text-fg-2 tabular-nums">{activeChar.character.heightCm}cm · {activeChar.character.headBodyRatio}{pick("등신", " heads")}</span>
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  {activeChar.turnarounds.map((slot) => (
                    <article key={slot.angle} className="rounded-lg border border-line bg-canvas p-2.5 text-xs">
                      <div className="flex items-center justify-between font-bold text-fg">
                        <span>{pick(slot.labelKo, slot.labelEn)}</span>
                        <span className="text-[11px] font-medium text-fg-3 tabular-nums">{pick(`어깨비 ${slot.shoulderRatio}`, `Shoulder ${slot.shoulderRatio}`)}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-fg-2">{pick(slot.silhouetteCueKo, slot.silhouetteCueEn)}</p>
                    </article>
                  ))}
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-fg-2">{pick("6종 표정 프리셋", "6 Expression Presets")}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {activeChar.expressions.map((expr) => (
                      <button key={expr.id} type="button" aria-pressed={activeExprId === expr.id} onClick={() => setSelectedExpression(expr.id)} className={activeExprId === expr.id ? BTN_SOLID : BTN_OUTLINE}>{pick(expr.labelKo, expr.labelEn)}</button>
                    ))}
                  </div>
                  {activeExprObj ? <p className="rounded-lg bg-raised px-3 py-2 text-xs text-fg-2">{pick(activeExprObj.drawingCueKo, activeExprObj.drawingCueEn)}</p> : null}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {activeChar.swatches.map((sw) => (
                    <button key={sw.role} type="button" onClick={() => handleCopy(sw.lightingAdjustedOklch, `${sw.labelKo} OKLCH 값을 복사했습니다.`, `Copied ${sw.labelEn} OKLCH.`)} className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-canvas px-2.5 py-2 text-left transition-colors motion-reduce:transition-none hover:bg-raised ${FOCUS_RING}`}>
                      <span className="h-6 w-6 shrink-0 rounded-md border border-line-strong" style={{ backgroundColor: sw.lightingAdjustedOklch }} aria-hidden="true" />
                      <span className="flex flex-col overflow-hidden text-[11px]"><span className="font-bold text-fg">{pick(sw.labelKo, sw.labelEn)}</span><span className="truncate font-mono text-[10px] text-fg-3 tabular-nums">{sw.lightingAdjustedOklch}</span></span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><Zap className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-bold text-fg">{pick("액션·판타지 1획 물리 궤적 이펙트 생성기", "1-Stroke Action Trajectory VFX Generator")}</h3></div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={BTN_SOLID} onClick={() => handleDownload(`action-vfx-${vfxKind}.svg`, vfxResult.svg, "image/svg+xml;charset=utf-8", `action-vfx-${vfxKind}.svg를 저장했습니다.`, `Saved action-vfx-${vfxKind}.svg.`)}><Download className="h-3.5 w-3.5" aria-hidden="true" /> {pick("VFX SVG 저장", "Export VFX SVG")}</button>
                <button type="button" className={BTN_OUTLINE} onClick={() => handleCopy(vfxResult.svg, "액션 이펙트 SVG 코드를 복사했습니다.", "Copied action VFX SVG.")}><Copy className="h-3.5 w-3.5" aria-hidden="true" /> {pick("SVG 복사", "Copy SVG")}</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {VFX_KINDS.map((kind) => (<button key={kind} type="button" aria-pressed={vfxKind === kind} onClick={() => setVfxKind(kind)} className={vfxKind === kind ? BTN_SOLID : BTN_OUTLINE}>{pick(ACTION_VFX_PRESETS[kind].labelKo, ACTION_VFX_PRESETS[kind].labelEn)}</button>))}
              {DEFAULT_TRAJECTORY_STROKES.map((st, idx) => (<button key={st.id} type="button" aria-pressed={strokeIdx === idx} onClick={() => setStrokeIdx(idx)} className={strokeIdx === idx ? BTN_SOLID : BTN_OUTLINE}>{pick(st.labelKo, st.labelEn)}</button>))}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label htmlFor={`${uid}-taper`} className="flex justify-between text-xs font-semibold text-fg-2"><span>{pick("원근 폭 테이퍼", "Perspective Taper")}</span><span className="text-fg tabular-nums">{Math.round(perspectiveTaper * 100)}%</span></label>
                <input id={`${uid}-taper`} type="range" min={0.1} max={1.0} step={0.05} value={perspectiveTaper} onChange={(e) => setPerspectiveTaper(Number(e.target.value))} className="w-full accent-accent" />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={`${uid}-intensity`} className="flex justify-between text-xs font-semibold text-fg-2"><span>{pick("가속 파편·속도선 밀도", "Debris & Speedline Intensity")}</span><span className="text-fg tabular-nums">{vfxIntensity.toFixed(2)}x</span></label>
                <input id={`${uid}-intensity`} type="range" min={0.4} max={1.8} step={0.1} value={vfxIntensity} onChange={(e) => setVfxIntensity(Number(e.target.value))} className="w-full accent-accent" />
              </div>
            </div>
            <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(vfxResult.svg)}`} alt={pick(`${vfxResult.labelKo} 물리 궤적 이펙트 미리보기`, `${vfxResult.labelEn} trajectory VFX preview`)} className="max-h-52 w-full rounded-lg border border-line bg-canvas object-contain" />
            <div className="flex flex-wrap gap-3 text-[11px] text-fg-2 tabular-nums">
              <span>{pick(`궤적 길이 ${vfxResult.metrics.arcLengthPx}px`, `Arc ${vfxResult.metrics.arcLengthPx}px`)}</span>
              <span>{pick(`최대 폭 ${vfxResult.metrics.peakWidthPx}px`, `Peak ${vfxResult.metrics.peakWidthPx}px`)}</span>
              <span>{pick(`폴리곤 ${vfxResult.metrics.polygonCount}개`, `${vfxResult.metrics.polygonCount} polygons`)}</span>
              <span>{pick(`속도선 ${vfxResult.metrics.speedLineCount}본`, `${vfxResult.metrics.speedLineCount} speedlines`)}</span>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "deadline-warroom" ? (
        <div id={`${uid}-panel-deadline-warroom`} role="tabpanel" aria-labelledby={`${uid}-tab-deadline-warroom`} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card p-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-bold text-fg">{warRoomAnalysis.episodeLabel}</h3>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${riskBadgeCls}`}>{warRoomAnalysis.deadlineRisk === "critical" ? pick("마감 위험", "Critical") : warRoomAnalysis.deadlineRisk === "tight" ? pick("마감 긴박", "Tight") : pick("일정 안정", "On Track")}</span>
              </div>
              <p className="text-xs text-fg-2 tabular-nums">{pick(`전체 ${warRoomAnalysis.totalCuts}컷 공정률 ${warRoomAnalysis.overallProgressPct}% · 잔여 ${warRoomAnalysis.totalRemainingHours}h / 팀 가용 ${warRoomAnalysis.totalTeamAvailableHours}h`, `${warRoomAnalysis.totalCuts} cuts at ${warRoomAnalysis.overallProgressPct}% · ${warRoomAnalysis.totalRemainingHours}h left vs ${warRoomAnalysis.totalTeamAvailableHours}h capacity`)}</p>
            </div>
            <button type="button" className={BTN_SOLID} onClick={handleAutoAssign}><Users className="h-3.5 w-3.5" aria-hidden="true" /> {pick("어시스턴트 병목 원클릭 재배분", "Auto-Assign Bottleneck Cuts")}</button>
          </div>
          <div className="flex flex-col gap-1 rounded-xl border border-line bg-card p-3.5">
            <label htmlFor={`${uid}-deadline-hrs`} className="flex justify-between text-xs font-semibold text-fg-2"><span>{pick("마감 잔여 시간 시뮬레이션", "Hours Until Serialization Deadline")}</span><span className="font-bold text-fg tabular-nums">{deadlineHours}h</span></label>
            <input id={`${uid}-deadline-hrs`} type="range" min={4} max={48} step={1} value={deadlineHours} onChange={(e) => setDeadlineHours(Number(e.target.value))} className="w-full accent-accent" />
          </div>
          <div className="grid gap-2.5 md:grid-cols-5">
            {warRoomAnalysis.stageSummaries.map((st) => {
              const isPrimary = warRoomAnalysis.primaryBottleneckStage?.stageId === st.stageId;
              return (
                <article key={st.stageId} className={`flex flex-col gap-1.5 rounded-xl border p-3 text-xs ${isPrimary ? "border-bad bg-bad-soft" : "border-line bg-card"}`}>
                  <div className="flex items-center justify-between font-bold text-fg"><span>{pick(st.labelKo, st.labelEn)}</span><span className="tabular-nums">{st.completionPct}%</span></div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-accent transition-[width] motion-reduce:transition-none" style={{ width: `${Math.min(100, st.completionPct)}%` }} /></div>
                  <span className="text-[11px] text-fg-2 tabular-nums">{pick(`잔여 ${st.remainingWorkHours}h · 완료 ${st.completedCuts}/${warRoomAnalysis.totalCuts}`, `${st.remainingWorkHours}h left · ${st.completedCuts}/${warRoomAnalysis.totalCuts} done`)}</span>
                  {isPrimary ? <span className="font-bold text-bad">{pick("최우선 병목 공정", "Primary Bottleneck")}</span> : null}
                </article>
              );
            })}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-line bg-card p-3.5">
              <h4 className="mb-2 text-xs font-bold text-fg">{pick(`긴급 지연 컷 상위 5건 (전체 ${warRoomAnalysis.delayedCuts.length}건)`, `Top 5 Urgent Delayed Cuts (${warRoomAnalysis.delayedCuts.length} total)`)}</h4>
              <ul className="flex flex-col gap-1.5 text-xs">
                {warRoomAnalysis.delayedCuts.slice(0, 5).map((cut) => (
                  <li key={cut.cutId} className="flex items-center justify-between rounded-lg bg-canvas px-2.5 py-2 tabular-nums"><span className="font-bold text-fg">{cut.cutId}</span><span className="text-fg-2">{pick(cut.reasonKo, cut.reasonEn)}</span></li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-line bg-card p-3.5">
              <h4 className="mb-2 text-xs font-bold text-fg">{pick("어시스턴트 부하 균등 배분 현황", "Assistant Balanced Workload")}</h4>
              {assignmentPlan ? (
                <div className="flex flex-col gap-2 text-xs">
                  <p className="text-[11px] font-semibold text-good tabular-nums">{pick(assignmentPlan.summaryKo, assignmentPlan.summaryEn)}</p>
                  {assignmentPlan.assistantLoads.map((load) => (
                    <div key={load.assistantId} className="flex flex-col gap-1 rounded-lg bg-canvas p-2 tabular-nums">
                      <div className="flex justify-between font-semibold text-fg"><span>{pick(load.nameKo, load.nameEn)}</span><span>{load.assignedHours}h / {load.availableHours}h ({load.utilizationPct}%)</span></div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full bg-accent transition-[width] motion-reduce:transition-none" style={{ width: `${Math.min(100, load.utilizationPct)}%` }} /></div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-fg-2">{pick("상단 '어시스턴트 병목 원클릭 재배분'을 누르면 전문 공정과 가용 시간 기준으로 60컷 잔여 공정을 균등 배분합니다.", "Click Auto-Assign to balance pending cut-stage tasks across assistants by specialty and capacity.")}</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "barrierfree-goods" ? (
        <div id={`${uid}-panel-barrierfree-goods`} role="tabpanel" aria-labelledby={`${uid}-tab-barrierfree-goods`} className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><Accessibility className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-bold text-fg">{pick("배리어프리(WCAG 2.2 AAA) 자동 Alt-Text · 오디오 디스크립션", "Barrier-Free (WCAG 2.2 AAA) Alt-Text & Audio Description")}</h3></div>
              <span className="rounded-full bg-good-soft px-2.5 py-1 text-[11px] font-bold text-good tabular-nums">{barrierFreePkg.wcagConformance} · {barrierFreePkg.episodeMeta.totalCuts}{pick("컷", " cuts")} · {barrierFreePkg.episodeMeta.estimatedTotalDurationSec}s</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {BF_MODES.map(([mode, ko, en]) => (<button key={mode} type="button" aria-pressed={bfPreviewMode === mode} onClick={() => setBfPreviewMode(mode)} className={bfPreviewMode === mode ? BTN_SOLID : BTN_OUTLINE}>{pick(ko, en)}</button>))}
              <button type="button" className={`ml-auto ${BTN_SOLID}`} onClick={() => handleDownload(`ep${barrierFreePkg.episodeMeta.episodeNumber}-barrier-free.vtt`, isEn ? barrierFreePkg.webVttEn : barrierFreePkg.webVttKo, "text/vtt;charset=utf-8", "배리어프리 WebVTT 파일을 저장했습니다.", "Downloaded barrier-free WebVTT.")}><Download className="h-3.5 w-3.5" aria-hidden="true" /> {pick("WebVTT 저장", "Export VTT")}</button>
              <button type="button" className={BTN_OUTLINE} onClick={() => handleDownload(`ep${barrierFreePkg.episodeMeta.episodeNumber}-barrier-free.json`, barrierFreePkg.screenReaderJson, "application/json;charset=utf-8", "배리어프리 JSON 파일을 저장했습니다.", "Downloaded barrier-free JSON.")}><Download className="h-3.5 w-3.5" aria-hidden="true" /> {pick("JSON 저장", "Export JSON")}</button>
            </div>
            <pre className="max-h-44 overflow-auto rounded-lg border border-line bg-canvas p-3 text-[11px] leading-relaxed text-fg-2"><code>{bfPreviewText}</code></pre>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><Scissors className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-bold text-fg">{pick("팬덤 굿즈 1클릭 칼선(CutContour) & CMYK 화이트 백킹 생성기", "1-Click Fandom Goods CutContour & CMYK SpotWhite Generator")}</h3></div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums ${goodsPkg.validation.passed ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>{goodsPkg.validation.passed ? pick("인쇄 규격 통과 · 300DPI", "Print Spec PASS · 300DPI") : pick("인쇄 규격 점검 필요", "Print Spec Review Needed")}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {GOODS_KINDS.map((kind) => (<button key={kind} type="button" aria-pressed={goodsKind === kind} onClick={() => setGoodsKind(kind)} className={goodsKind === kind ? BTN_SOLID : BTN_OUTLINE}>{pick(GOODS_PRODUCT_SPECS[kind].labelKo, GOODS_PRODUCT_SPECS[kind].labelEn)}</button>))}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label htmlFor={`${uid}-goods-title`} className="mb-1 block text-xs font-semibold text-fg-2">{pick("굿즈 품목명", "Goods Title")}</label>
                <input id={`${uid}-goods-title`} type="text" value={goodsTitle} onChange={(e) => setGoodsTitle(e.target.value)} className={INPUT_CLS} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={`${uid}-goods-offset`} className="flex justify-between text-xs font-semibold text-fg-2"><span>{pick("칼선 여백 (CutContour)", "Die-Cut Offset")}</span><span className="text-fg tabular-nums">{goodsOffsetMm.toFixed(1)}mm ({goodsPkg.dieCutOffsetPx}px)</span></label>
                <input id={`${uid}-goods-offset`} type="range" min={1.0} max={5.0} step={0.5} value={goodsOffsetMm} onChange={(e) => setGoodsOffsetMm(Number(e.target.value))} className="mt-2 w-full accent-accent" />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={`${uid}-goods-bleed`} className="flex justify-between text-xs font-semibold text-fg-2"><span>{pick("도련 여유 (Bleed)", "Bleed Margin")}</span><span className="text-fg tabular-nums">{goodsBleedMm.toFixed(1)}mm ({goodsPkg.bleedPx}px)</span></label>
                <input id={`${uid}-goods-bleed`} type="range" min={1.0} max={5.0} step={0.5} value={goodsBleedMm} onChange={(e) => setGoodsBleedMm(Number(e.target.value))} className="mt-2 w-full accent-accent" />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(goodsPkg.svg)}`} alt={pick(`${goodsPkg.labelKo} 칼선 및 화이트 백킹 벡터 미리보기`, `${goodsPkg.labelEn} CutContour & SpotWhite preview`)} className="max-h-56 w-full rounded-lg border border-line bg-canvas object-contain" />
              <div className="flex flex-col justify-between gap-2 text-xs">
                <ul className="flex flex-col gap-1.5">
                  {goodsPkg.validation.checks.map((chk) => (
                    <li key={chk.id} className="flex items-center justify-between rounded-lg bg-canvas px-2.5 py-1.5 tabular-nums"><span className="font-semibold text-fg">{pick(chk.labelKo, chk.labelEn)}</span><span className={chk.passed ? "font-bold text-good" : "font-bold text-bad"}>{pick(chk.detailKo, chk.detailEn)}</span></li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={BTN_SOLID} onClick={() => handleDownload(goodsPkg.svgFilename, goodsPkg.svg, "image/svg+xml;charset=utf-8", `${goodsPkg.svgFilename} 칼선 SVG를 저장했습니다.`, `Saved ${goodsPkg.svgFilename}.`)}><Download className="h-3.5 w-3.5" aria-hidden="true" /> {pick("CutContour SVG 출고", "Export CutContour SVG")}</button>
                  <button type="button" className={BTN_OUTLINE} onClick={() => handleDownload(goodsPkg.jsonFilename, goodsPkg.printSpecJson, "application/json;charset=utf-8", `${goodsPkg.jsonFilename} 인쇄 규격서를 저장했습니다.`, `Saved ${goodsPkg.jsonFilename}.`)}><Download className="h-3.5 w-3.5" aria-hidden="true" /> {pick("CMYK 규격 JSON", "Export Print Spec JSON")}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
