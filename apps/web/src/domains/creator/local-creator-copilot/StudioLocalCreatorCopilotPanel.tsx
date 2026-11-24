/**
 * 온디바이스 로컬 크리에이터 습관 학습 보조 비서 패널 (Wave 31 Track D: Local Creator Copilot).
 * Calm Atelier 시맨틱 토큰 전용 · 원시 hex/rgb/hsl 0건 · Web Storage 미사용 · 외부 전송 0바이트 · 모든 props 선택형 · KO/EN.
 */

import {
  ArrowRight,
  Brush,
  CheckCircle2,
  Download,
  Layers,
  Palette,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  LOCAL_COPILOT_PRIVACY_CONTRACT,
  buildSampleLocalHabitState,
  executeHabitMacro,
  exportLocalHabitsToJson,
  generateLocalCopilotInsights,
  importLocalHabitsFromJson,
  markSuggestionApplied,
  recordHabitEvent,
  setLocalHabitOptIn,
  wipeLocalHabits,
  wipeLocalHabitsSnapshotInOpfs,
  type LocalCreatorHabitState,
  type MacroExecutionReceipt,
  type NextBrushSuggestion,
  type OpfsStorageManagerLike,
  type RepeatedMacroSuggestion,
  type SignaturePaletteSuggestion,
} from "./local-habit-learner";

export interface StudioLocalCreatorCopilotPanelProps {
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly initialState?: LocalCreatorHabitState;
  readonly opfsStorageManager?: OpfsStorageManagerLike | null;
  readonly onApplyPalette?: (palette: SignaturePaletteSuggestion) => void;
  readonly onApplyBrush?: (suggestion: NextBrushSuggestion) => void;
  readonly onExecuteMacro?: (receipt: MacroExecutionReceipt) => void;
  readonly onStateChange?: (nextState: LocalCreatorHabitState) => void;
  readonly onExportJson?: (jsonText: string) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const BTN_DANGER = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-bad bg-bad-soft px-3 py-2 text-xs font-semibold text-bad transition-colors motion-reduce:transition-none hover:bg-raised ${FOCUS_RING}`;
const BTN_CHIP = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const CHIP_ACTIVE = "border-accent bg-accent-soft text-accent";
const CHIP_IDLE = "border-line bg-canvas text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";

function confidenceBadgeClass(percent: number): string {
  if (percent >= 75) return "border-good bg-good-soft text-good";
  if (percent >= 45) return "border-line bg-warning-soft text-warn";
  return "border-line bg-raised text-fg-2";
}

/** 온디바이스 전용 크리에이터 습관 학습 · 설명 가능한 추천 · 1클릭 매크로 패널. */
export function StudioLocalCreatorCopilotPanel({
  locale,
  className,
  initialState,
  opfsStorageManager,
  onApplyPalette,
  onApplyBrush,
  onExecuteMacro,
  onStateChange,
  onExportJson,
}: StudioLocalCreatorCopilotPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [habitState, setHabitState] = useState<LocalCreatorHabitState>(
    () => initialState ?? buildSampleLocalHabitState(),
  );
  const [selectedBrushId, setSelectedBrushId] = useState<string | null>(
    () => habitState.lastBrushId,
  );
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [paletteApplied, setPaletteApplied] = useState<boolean>(false);
  const [lastMacroReceipt, setLastMacroReceipt] = useState<MacroExecutionReceipt | null>(null);
  const [jsonOpen, setJsonOpen] = useState<boolean>(false);
  const [jsonDraft, setJsonDraft] = useState<string>("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const insights = useMemo(
    () => generateLocalCopilotInsights(habitState, { currentBrushId: selectedBrushId }),
    [habitState, selectedBrushId],
  );

  const knownBrushes = useMemo(
    () => Object.values(habitState.brushCatalog).sort((a, b) => b.totalUses - a.totalUses || a.id.localeCompare(b.id)),
    [habitState.brushCatalog],
  );

  const updateState = (next: LocalCreatorHabitState): void => {
    setHabitState(next);
    onStateChange?.(next);
  };

  const handleToggleOptIn = (): void => {
    const nextEnabled = !habitState.optInEnabled;
    const next = setLocalHabitOptIn(habitState, nextEnabled);
    updateState(next);
    setStatusMessage(
      nextEnabled
        ? pick("로컬 학습 옵트인을 켰습니다. 이후 작업만 이 기기 내부에 기록됩니다.", "Local learning opt-in enabled. Subsequent work stays on this device.")
        : pick("로컬 학습을 일시 중지했습니다. 새 이벤트는 기록되지 않습니다.", "Local learning paused. New events will not be recorded."),
    );
  };

  const handleRecordSampleEvent = (): void => {
    const res = recordHabitEvent(habitState, {
      kind: "panel-created",
      aspectRatio: "9:16",
      anchor: "top-center",
    });
    if (!res.recorded) {
      setStatusMessage(
        pick(
          "옵트인이 꺼져 있어 이벤트를 기록하지 않았습니다. 먼저 로컬 학습을 켜 주세요.",
          "Opt-in is off, so the event was not recorded. Enable local learning first.",
        ),
      );
      return;
    }
    updateState(res.state);
    setStatusMessage(
      pick(
        `로컬 컷 생성 습관 1건을 기록했습니다 (누적 ${res.state.totalRecordedEvents}건 · 외부 전송 0바이트).`,
        `Recorded 1 local panel layout event (total ${res.state.totalRecordedEvents} · 0 bytes sent).`,
      ),
    );
  };

  const handleApplyPalette = (): void => {
    if (insights.signaturePalette.swatches.length === 0) return;
    const next = markSuggestionApplied(habitState);
    updateState(next);
    setPaletteApplied(true);
    onApplyPalette?.(insights.signaturePalette);
    setStatusMessage(
      pick(
        `개인 시그니처 팔레트 ${insights.signaturePalette.swatches.length}색을 스튜디오 스와치에 적용했습니다.`,
        `Applied ${insights.signaturePalette.swatches.length} signature OKLCH swatches to the studio palette.`,
      ),
    );
  };

  const handleApplyBrush = (): void => {
    const rec = insights.nextBrush;
    if (!rec) return;
    const recorded = recordHabitEvent(habitState, {
      kind: "brush-selected",
      brushId: rec.recommendedBrush.id,
      brushLabelKo: rec.recommendedBrush.labelKo,
      brushLabelEn: rec.recommendedBrush.labelEn,
      stage: rec.recommendedBrush.stage,
    });
    const next = markSuggestionApplied(recorded.state);
    updateState(next);
    setSelectedBrushId(rec.recommendedBrush.id);
    onApplyBrush?.(rec);
    setStatusMessage(
      pick(
        `다음 공정 브러시 '${rec.recommendedBrush.labelKo}'로 전환했습니다.`,
        `Switched active brush to '${rec.recommendedBrush.labelEn}'.`,
      ),
    );
  };

  const handleRunMacro = (macro: RepeatedMacroSuggestion): void => {
    const receipt = executeHabitMacro(habitState, macro);
    updateState(receipt.nextState);
    setLastMacroReceipt(receipt);
    onExecuteMacro?.(receipt);
    setStatusMessage(
      pick(
        `매크로 실행 완료: ${receipt.titleKo} (클릭 ${receipt.clicksSaved}회 절감 · 외부 전송 0바이트)`,
        `Macro executed: ${receipt.titleEn} (${receipt.clicksSaved} clicks saved · 0 bytes sent)`,
      ),
    );
  };

  const handleWipeAll = (): void => {
    const wiped = wipeLocalHabits({ keepOptIn: false });
    updateState(wiped);
    setSelectedBrushId(null);
    setPaletteApplied(false);
    setLastMacroReceipt(null);
    setJsonDraft("");
    setJsonError(null);
    if (opfsStorageManager) {
      void wipeLocalHabitsSnapshotInOpfs(opfsStorageManager);
    }
    setStatusMessage(
      pick(
        "로컬 학습 데이터를 모두 초기화했습니다 (관측 0건 · 옵트인 해제 · 외부 전송 0바이트).",
        "Wiped all local habit data (0 observations · opt-in off · 0 bytes sent).",
      ),
    );
  };

  const handleRestoreSample = (): void => {
    const seeded = buildSampleLocalHabitState();
    updateState(seeded);
    setSelectedBrushId(seeded.lastBrushId);
    setPaletteApplied(false);
    setLastMacroReceipt(null);
    setJsonError(null);
    setStatusMessage(
      pick(
        `로컬 작업 샘플 ${seeded.totalRecordedEvents}건을 기기 메모리에 불러왔습니다.`,
        `Loaded ${seeded.totalRecordedEvents} local workflow sample events into device memory.`,
      ),
    );
  };

  const handleExportJson = (): void => {
    const exported = exportLocalHabitsToJson(habitState);
    setJsonDraft(exported);
    setJsonError(null);
    setJsonOpen(true);
    onExportJson?.(exported);
    setStatusMessage(
      pick(
        `로컬 습관 JSON 스냅샷(${exported.length}자)을 생성했습니다.`,
        `Exported local habit JSON snapshot (${exported.length} chars).`,
      ),
    );
  };

  const handleImportJson = (): void => {
    const result = importLocalHabitsFromJson(jsonDraft);
    if (!result.ok || !result.state) {
      const msg = pick(result.errorMessageKo ?? "JSON 가져오기에 실패했습니다.", result.errorMessageEn ?? "Failed to import JSON.");
      setJsonError(msg);
      setStatusMessage(msg);
      return;
    }
    updateState(result.state);
    setSelectedBrushId(result.state.lastBrushId);
    setJsonError(null);
    setStatusMessage(
      pick(
        `로컬 JSON 스냅샷을 복원했습니다 (누적 ${result.state.totalRecordedEvents}건).`,
        `Restored local JSON snapshot (${result.state.totalRecordedEvents} events).`,
      ),
    );
  };

  return (
    <section
      aria-label={pick("로컬 크리에이터 보조 비서", "Local Creator Copilot")}
      className={`flex flex-col gap-4 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3.5">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="inline-flex items-center gap-1.5 text-sm font-bold text-fg">
              <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
              {pick("로컬 크리에이터 보조 비서", "Local Creator Copilot")}
            </h2>
            <span
              data-testid="local-only-privacy-badge"
              className="inline-flex items-center gap-1 rounded-full border border-good bg-good-soft px-2.5 py-0.5 text-[11px] font-bold text-good"
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {pick(LOCAL_COPILOT_PRIVACY_CONTRACT.badgeTextKo, LOCAL_COPILOT_PRIVACY_CONTRACT.badgeTextEn)}
            </span>
          </div>
          <p className="text-xs text-fg-2">
            {pick(
              "색상·브러시 전환·컷 배치·반복 레이어 작업을 기기 안에서만 학습해 근거와 함께 제안합니다.",
              "Learns your colors, brush flow, panel framing, and repeated macros strictly on-device with clear evidence.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="copilot-optin-toggle"
            aria-pressed={habitState.optInEnabled}
            onClick={handleToggleOptIn}
            className={`${BTN_CHIP} ${habitState.optInEnabled ? CHIP_ACTIVE : CHIP_IDLE}`}
          >
            {habitState.optInEnabled
              ? pick("옵트인 학습 켜짐", "Opt-In Learning On")
              : pick("옵트인 학습 꺼짐", "Opt-In Learning Off")}
          </button>
          <button
            type="button"
            data-testid="copilot-wipe-button"
            onClick={handleWipeAll}
            className={BTN_DANGER}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {pick("학습 데이터 초기화", "Reset Local Data")}
          </button>
        </div>
      </header>

      {/* 학습 습관 요약 바 */}
      <div
        aria-label={pick("학습 습관 요약", "Learned Habits Summary")}
        className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="rounded-xl border border-line bg-card p-3 tabular-nums">
          <div className="text-[11px] font-semibold text-fg-3">{pick("로컬 관측 이벤트", "Local Observations")}</div>
          <div data-testid="summary-observation-count" className="mt-1 text-base font-bold text-fg">
            {pick(`${insights.totalObservations}건`, `${insights.totalObservations} events`)}
          </div>
          <div className="mt-0.5 text-[11px] text-fg-2">
            {pick(
              `제안 적용 ${habitState.appliedSuggestionCount}회 · 매크로 ${habitState.executedMacroCount}회`,
              `Applied ${habitState.appliedSuggestionCount} · Macros ${habitState.executedMacroCount}`,
            )}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-card p-3 tabular-nums">
          <div className="text-[11px] font-semibold text-fg-3">{pick("OKLCH 팔레트 군집", "OKLCH Palette Clusters")}</div>
          <div data-testid="summary-palette-count" className="mt-1 text-base font-bold text-fg">
            {pick(`${insights.signaturePalette.swatches.length} / 5색`, `${insights.signaturePalette.swatches.length} / 5 swatches`)}
          </div>
          <div className="mt-0.5 text-[11px] text-fg-2">
            {pick(
              `신뢰도 ${insights.signaturePalette.evidence.confidencePercent}% · 표본 ${insights.signaturePalette.evidence.observationCount}건`,
              `Confidence ${insights.signaturePalette.evidence.confidencePercent}% · ${insights.signaturePalette.evidence.observationCount} samples`,
            )}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-card p-3 tabular-nums">
          <div className="text-[11px] font-semibold text-fg-3">{pick("선호 컷 비율 · 배치", "Preferred Panel Framing")}</div>
          <div data-testid="summary-panel-layout" className="mt-1 text-base font-bold text-fg">
            {insights.panelLayout
              ? `${insights.panelLayout.aspectRatio} · ${pick(insights.panelLayout.anchorLabelKo, insights.panelLayout.anchorLabelEn)}`
              : pick("학습 대기 중", "Waiting for data")}
          </div>
          <div className="mt-0.5 text-[11px] text-fg-2">
            {insights.panelLayout
              ? pick(
                  `신뢰도 ${insights.panelLayout.evidence.confidencePercent}% · ${insights.panelLayout.evidence.observationCount}건 기준`,
                  `Confidence ${insights.panelLayout.evidence.confidencePercent}% · ${insights.panelLayout.evidence.observationCount} panels`,
                )
              : pick("컷 생성 후 자동 요약", "Summarizes after panel creation")}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-card p-3 tabular-nums">
          <div className="text-[11px] font-semibold text-fg-3">{pick("외부 네트워크 전송", "External Transmission")}</div>
          <div data-testid="summary-external-bytes" className="mt-1 text-base font-bold text-good">
            {pick("0바이트 · 0건", "0 B · 0 calls")}
          </div>
          <div className="mt-0.5 text-[11px] text-fg-2">
            {pick("OPFS 스냅샷 · 메모리 전용", "OPFS Snapshot · On-Device")}
          </div>
        </div>
      </div>

      {/* 빠른 작업 기록 / 샘플 복구 도구줄 */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-canvas px-3 py-2 text-xs">
        <span className="text-fg-2">
          {habitState.optInEnabled
            ? pick("옵트인 활성 상태: 스튜디오 작업이 로컬 메모리·OPFS에만 누적됩니다.", "Opt-in active: studio events stay in local memory/OPFS only.")
            : pick("옵트인 비활성 상태: 어떤 작업도 기록하지 않습니다.", "Opt-in inactive: no workflow events are recorded.")}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={handleRecordSampleEvent} className={BTN_OUTLINE}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {pick("컷 작업 1건 기록", "Record 1 Panel Event")}
          </button>
          {insights.totalObservations === 0 ? (
            <button type="button" onClick={handleRestoreSample} className={BTN_PRIMARY}>
              {pick("샘플 습관 불러오기", "Load Sample Habits")}
            </button>
          ) : null}
        </div>
      </div>

      {/* 핵심 능동 제안 3종 */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* ① 개인 시그니처 팔레트 5색 추천 */}
        <article className="flex flex-col justify-between gap-3 rounded-xl border border-line bg-card p-3.5 text-xs">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="inline-flex items-center gap-1.5 font-bold text-fg">
                <Palette className="h-4 w-4 text-accent" aria-hidden="true" />
                {pick("① 개인 시그니처 팔레트 5색", "1. Signature 5-Color Palette")}
              </h3>
              <span
                data-testid="palette-confidence-badge"
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums ${confidenceBadgeClass(insights.signaturePalette.evidence.confidencePercent)}`}
              >
                {pick(
                  `신뢰도 ${insights.signaturePalette.evidence.confidencePercent}%`,
                  `${insights.signaturePalette.evidence.confidencePercent}% conf`,
                )}
              </span>
            </div>
            <p className="text-[11px] text-fg-2">
              {pick(insights.signaturePalette.evidence.rationaleKo, insights.signaturePalette.evidence.rationaleEn)}
            </p>

            {insights.signaturePalette.swatches.length > 0 ? (
              <ul data-testid="signature-palette-list" className="space-y-1.5 tabular-nums">
                {insights.signaturePalette.swatches.map((swatch) => (
                  <li
                    key={swatch.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-2.5 py-1.5"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-6 w-6 shrink-0 rounded-md border border-line-strong"
                        style={{ backgroundColor: swatch.cssOklch }}
                      />
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-fg">{pick(swatch.labelKo, swatch.labelEn)}</div>
                        <div className="truncate text-[10px] text-fg-3">{swatch.cssOklch}</div>
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] font-semibold text-fg-2">
                      {swatch.sharePercent}% · {pick(`${swatch.observationCount}회`, `${swatch.observationCount}x`)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p data-testid="signature-palette-empty" className="rounded-lg border border-line bg-canvas p-3 text-[11px] text-fg-3">
                {pick("로컬 색상 기록이 쌓이면 OKLCH 5색 팔레트를 자동으로 묶어 드립니다.", "Color samples will be clustered into 5 OKLCH swatches locally.")}
              </p>
            )}
          </div>

          <button
            type="button"
            data-testid="apply-palette-button"
            disabled={insights.signaturePalette.swatches.length === 0}
            onClick={handleApplyPalette}
            className={BTN_PRIMARY}
          >
            {paletteApplied ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Palette className="h-3.5 w-3.5" aria-hidden="true" />}
            {paletteApplied ? pick("시그니처 팔레트 적용됨", "Signature Palette Applied") : pick("팔레트 5색 적용", "Apply 5-Color Palette")}
          </button>
        </article>

        {/* ② 다음 공정 브러시 추천 (마르코프 체인) */}
        <article className="flex flex-col justify-between gap-3 rounded-xl border border-line bg-card p-3.5 text-xs">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="inline-flex items-center gap-1.5 font-bold text-fg">
                <Brush className="h-4 w-4 text-accent" aria-hidden="true" />
                {pick("② 다음 공정 브러시 추천", "2. Next-Step Brush Suggestion")}
              </h3>
              {insights.nextBrush ? (
                <span
                  data-testid="brush-confidence-badge"
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums ${confidenceBadgeClass(insights.nextBrush.evidence.confidencePercent)}`}
                >
                  {pick(
                    `신뢰도 ${insights.nextBrush.evidence.confidencePercent}%`,
                    `${insights.nextBrush.evidence.confidencePercent}% conf`,
                  )}
                </span>
              ) : null}
            </div>

            {knownBrushes.length > 0 ? (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-fg-3">{pick("현재 사용 브러시 기준:", "Current active brush:")}</div>
                <div className="flex flex-wrap gap-1.5">
                  {knownBrushes.slice(0, 5).map((brush) => (
                    <button
                      key={brush.id}
                      type="button"
                      aria-pressed={selectedBrushId === brush.id}
                      onClick={() => setSelectedBrushId(brush.id)}
                      className={`${BTN_CHIP} ${selectedBrushId === brush.id ? CHIP_ACTIVE : CHIP_IDLE}`}
                    >
                      {pick(brush.labelKo, brush.labelEn)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {insights.nextBrush ? (
              <div data-testid="next-brush-card" className="space-y-2 rounded-lg border border-line bg-canvas p-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
                  <span>{insights.nextBrush.fromBrush ? pick(insights.nextBrush.fromBrush.labelKo, insights.nextBrush.fromBrush.labelEn) : pick("시작", "Start")}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                  <span className="text-accent">{pick(insights.nextBrush.recommendedBrush.labelKo, insights.nextBrush.recommendedBrush.labelEn)}</span>
                </div>
                <p className="text-[11px] text-fg-2">
                  {pick(insights.nextBrush.evidence.rationaleKo, insights.nextBrush.evidence.rationaleEn)}
                </p>
                <div className="flex flex-wrap gap-1.5 tabular-nums text-[10px] text-fg-3">
                  {insights.nextBrush.candidates.map((cand) => (
                    <span key={cand.brush.id} className="rounded-md border border-line bg-card px-2 py-0.5">
                      {pick(cand.brush.labelKo, cand.brush.labelEn)} · {cand.probabilityPercent}% ({cand.transitionCount})
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p data-testid="next-brush-empty" className="rounded-lg border border-line bg-canvas p-3 text-[11px] text-fg-3">
                {pick("브러시 전환 이력이 쌓이면 마르코프 체인으로 다음 공정 브러시를 예측합니다.", "Brush transitions build a local Markov chain for next-step predictions.")}
              </p>
            )}
          </div>

          <button
            type="button"
            data-testid="apply-brush-button"
            disabled={!insights.nextBrush}
            onClick={handleApplyBrush}
            className={BTN_PRIMARY}
          >
            <Brush className="h-3.5 w-3.5" aria-hidden="true" />
            {insights.nextBrush
              ? pick(`'${insights.nextBrush.recommendedBrush.labelKo}'로 전환`, `Switch to ${insights.nextBrush.recommendedBrush.labelEn}`)
              : pick("추천 브러시 대기 중", "Waiting for Brush Habit")}
          </button>
        </article>

        {/* ③ 반복 컷·레이어 매크로 1클릭 자동화 */}
        <article className="flex flex-col justify-between gap-3 rounded-xl border border-line bg-card p-3.5 text-xs">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="inline-flex items-center gap-1.5 font-bold text-fg">
                <Wand2 className="h-4 w-4 text-accent" aria-hidden="true" />
                {pick("③ 반복 컷·레이어 매크로", "3. Repeated Panel/Layer Macros")}
              </h3>
              <span className="rounded-full border border-line bg-canvas px-2 py-0.5 text-[10px] font-bold tabular-nums text-fg-2">
                {pick(`${insights.macros.length}개 감지`, `${insights.macros.length} detected`)}
              </span>
            </div>

            {insights.macros.length > 0 ? (
              <ul data-testid="macro-suggestion-list" className="space-y-2">
                {insights.macros.slice(0, 2).map((macro) => (
                  <li key={macro.macroId} className="space-y-2 rounded-lg border border-line bg-canvas p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-bold text-fg">{pick(macro.titleKo, macro.titleEn)}</div>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums ${confidenceBadgeClass(macro.evidence.confidencePercent)}`}
                      >
                        {pick(`${macro.occurrences}회 · ${macro.evidence.confidencePercent}%`, `${macro.occurrences}x · ${macro.evidence.confidencePercent}%`)}
                      </span>
                    </div>
                    <p className="text-[11px] text-fg-2">
                      {pick(macro.evidence.rationaleKo, macro.evidence.rationaleEn)}
                    </p>
                    <div className="flex flex-wrap items-center gap-1 text-[10px] text-fg-2">
                      {macro.steps.map((step, sIdx) => (
                        <span key={`${macro.macroId}-${step.id}-${sIdx}`} className="inline-flex items-center gap-1 rounded bg-card px-1.5 py-0.5 border border-line">
                          <Layers className="h-2.5 w-2.5 text-accent" aria-hidden="true" />
                          {pick(step.labelKo, step.labelEn)}
                        </span>
                      ))}
                    </div>
                    {macro.preferredPanelSpec ? (
                      <div className="text-[10px] font-semibold text-accent tabular-nums">
                        {pick(
                          `자동 적용 컷 설정: ${macro.preferredPanelSpec.aspectRatio} · ${macro.preferredPanelSpec.anchorLabelKo}`,
                          `Auto panel spec: ${macro.preferredPanelSpec.aspectRatio} · ${macro.preferredPanelSpec.anchorLabelEn}`,
                        )}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      data-testid={`run-macro-${macro.macroId}`}
                      onClick={() => handleRunMacro(macro)}
                      className={`${BTN_PRIMARY} w-full`}
                    >
                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                      {pick(`1클릭 실행 (클릭 ${macro.estimatedClicksSavedPerRun}회 절감)`, `Run 1-Click (Save ${macro.estimatedClicksSavedPerRun} clicks)`)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p data-testid="macro-list-empty" className="rounded-lg border border-line bg-canvas p-3 text-[11px] text-fg-3">
                {pick("같은 컷·레이어 순서를 2회 이상 반복하면 1클릭 매크로로 자동 제안합니다.", "Repeat a panel/layer action sequence 2+ times to unlock 1-click macros.")}
              </p>
            )}
          </div>

          {lastMacroReceipt ? (
            <div data-testid="macro-execution-receipt" className="rounded-lg border border-good bg-good-soft px-2.5 py-2 text-[11px] font-semibold text-good tabular-nums">
              {pick(
                `최근 실행: ${lastMacroReceipt.titleKo} (${lastMacroReceipt.stepsExecuted.length}단계 완료)`,
                `Last run: ${lastMacroReceipt.titleEn} (${lastMacroReceipt.stepsExecuted.length} steps)`,
              )}
            </div>
          ) : null}
        </article>
      </div>

      {/* 로컬 JSON 내보내기 / 가져오기 백업 영역 */}
      <div className="rounded-xl border border-line bg-card p-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold text-fg">
            {pick("로컬 JSON 백업 · 기기 간 수동 이전 (외부 서버 미사용)", "Local JSON Backup · Manual Transfer (No Server)")}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" data-testid="copilot-export-json-button" onClick={handleExportJson} className={BTN_OUTLINE}>
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              {pick("JSON 내보내기", "Export JSON")}
            </button>
            <button
              type="button"
              data-testid="copilot-toggle-json-panel"
              aria-expanded={jsonOpen}
              onClick={() => setJsonOpen((open) => !open)}
              className={BTN_OUTLINE}
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              {jsonOpen ? pick("가져오기 창 닫기", "Close Import") : pick("JSON 가져오기 열기", "Open JSON Import")}
            </button>
          </div>
        </div>

        {jsonOpen ? (
          <div className="mt-3 space-y-2 border-t border-line pt-3">
            <label htmlFor={`${uid}-json-input`} className="block text-[11px] font-semibold text-fg-2">
              {pick("로컬 습관 JSON 스냅샷 (v1)", "Local Habit JSON Snapshot (v1)")}
            </label>
            <textarea
              id={`${uid}-json-input`}
              data-testid="copilot-json-textarea"
              rows={5}
              value={jsonDraft}
              onChange={(event) => {
                setJsonDraft(event.target.value);
                if (jsonError) setJsonError(null);
              }}
              placeholder={pick("내보낸 로컬 습관 JSON을 붙여넣어 복원하세요.", "Paste exported local habit JSON to restore.")}
              className={`w-full rounded-lg border border-line bg-canvas p-2.5 font-mono text-[11px] text-fg ${FOCUS_RING}`}
            />
            {jsonError ? (
              <p role="alert" data-testid="copilot-json-error" className="text-[11px] font-semibold text-bad">
                {jsonError}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" data-testid="copilot-import-json-button" onClick={handleImportJson} className={BTN_PRIMARY}>
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                {pick("JSON으로 복원", "Restore from JSON")}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {statusMessage ? (
        <div role="status" data-testid="copilot-status-banner" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg">
          {statusMessage}
        </div>
      ) : null}
    </section>
  );
}
