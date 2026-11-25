/**
 * Wave 46D — 직관적 캔버스 핀 검수(6종 원클릭 도장 · 전후 비교 · 6단계 바통터치) +
 * 5대 외부 툴 오픈 표준 라운드트립 브리지 단독 패널.
 *
 * - 컷 캔버스 핀 보드: 6종 원클릭 검수 도장 선택 · 클릭 좌표 번호 핀 배치 · 1탭 해결 토글 · 전후 비교 슬라이더
 * - 6단계 바통터치 진행 바: 미해결 핀 잔여 시 다음 공정 승계 자동 안내 및 1줄 요약 알림 복사
 * - 5대 외부 툴 포맷 참고 목록: 유료 사유 포맷 우회 없이 `.psd`·`.glb`·JSON·Markdown 손실/보존 매핑표 & 매니페스트 복사
 * - Calm Atelier 시맨틱 토큰 전용 (원시 색 · 광범위 트랜지션 · 기본 빈 객체 props · Web Storage · 과장 아이콘 미사용)
 */

import {
  AlertTriangle, ArrowRight, Box, CheckCheck, CheckCircle2, Clock, Code2, Copy,
  Crosshair, FileText, Layers, MapPin, MessageSquare, Palette, RotateCcw,
  ShieldAlert, ShieldCheck, SlidersHorizontal, Stamp, Trash2,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type MouseEvent, type ReactElement } from "react";

import {
  BATON_STAGE_SPECS, EXTERNAL_BRIDGE_SPECS, REVIEW_STAMP_SPECS, SAMPLE_REVIEW_CUTS,
  addVisualReviewPin, advanceBatonStage, buildExternalBridgeManifest,
  createInitialVisualPinReviewState, cycleReviewPinStatus, evaluateStageGateReadiness,
  getBatonStageSpec, getReviewCutDescriptor, getReviewStampSpec, removeReviewPin,
  resolveAllPinsForCut, rewindBatonStage, selectActiveReviewCut, setBeforeAfterSplitPct,
  summarizeBridgeFidelity, summarizeReviewPins, toggleReviewPinResolved, updateReviewPinComment,
  type BatonStageId, type ExternalBridgeId, type ExternalBridgeManifest, type ReviewLocale,
  type ReviewPinStatus, type ReviewStampId, type RoundtripFidelityStatus, type SemanticTone,
  type StageGateReadinessReport, type StageTransitionResult, type VisualPinReviewState,
} from "./visual-pin-review-engine";

import { MAX_REVIEW_COMMENT, MAX_REVIEW_PINS } from "./visual-pin-input-contract";
import { ReviewOperationStatus } from "./ReviewOperationStatus";
import { useReviewClipboard, useReviewNotification } from "./use-review-notification";

export interface StudioVisualPinReviewPanelProps {
  readonly initialStageId?: BatonStageId;
  readonly initialVariant?: "sample" | "clean";
  readonly initialBridgeId?: ExternalBridgeId;
  readonly locale?: ReviewLocale;
  readonly className?: string;
  readonly onStateChange?: (state: VisualPinReviewState, gate: StageGateReadinessReport) => void | Promise<void>;
  readonly onStageAdvance?: (nextStageId: BatonStageId, state: VisualPinReviewState) => void | Promise<void>;
  readonly onCopyBridgeDigest?: (markdown: string, manifest: ExternalBridgeManifest) => void | Promise<void>;
  readonly onCopyBridgeJson?: (json: string, manifest: ExternalBridgeManifest) => void | Promise<void>;
}

type PinFilterMode = "all" | "unresolved" | "resolved";
type ExportPreviewTab = "markdown" | "json" | "hidden";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;
const ICON_BTN = `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`;
const INPUT_CLS = `min-h-11 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs font-medium text-fg transition-colors motion-reduce:transition-none hover:border-line-strong ${FOCUS_RING}`;

const COMPARE_PRESETS: readonly { readonly pct: number; readonly ko: string; readonly en: string }[] = [
  { pct: 0, ko: "수정 전 0%", en: "Before 0%" },
  { pct: 50, ko: "반반 50%", en: "Split 50%" },
  { pct: 100, ko: "수정 후 100%", en: "After 100%" },
];

function toneBadgeClass(tone: SemanticTone): string {
  if (tone === "bad") return "border-bad bg-bad-soft text-bad";
  if (tone === "warn") return "border-warn bg-warning-soft text-warn";
  if (tone === "cool") return "border-cool bg-info-soft text-cool";
  if (tone === "good") return "border-good bg-good-soft text-good";
  return "border-accent bg-accent-soft text-accent";
}

function tonePinClass(tone: SemanticTone, resolved: boolean): string {
  if (resolved) return "border-good bg-good text-canvas";
  if (tone === "bad") return "border-bad bg-bad text-canvas";
  if (tone === "warn") return "border-warn bg-warn text-canvas";
  if (tone === "cool") return "border-cool bg-cool text-canvas";
  if (tone === "good") return "border-good bg-good text-canvas";
  return "border-accent bg-accent text-on-accent";
}

function fidelityMeta(status: RoundtripFidelityStatus, isEn: boolean): { readonly label: string; readonly cls: string } {
  if (status === "preserved") return { label: isEn ? "Preservation assumption" : "원본 보존 가정", cls: "border-good bg-good-soft text-good" };
  if (status === "approximated") return { label: isEn ? "Approximation assumption" : "근사 변환 가정", cls: "border-warn bg-warning-soft text-warn" };
  return { label: isEn ? "Flattening assumption" : "평탄화 가정", cls: "border-bad bg-bad-soft text-bad" };
}

function pinStatusLabel(status: ReviewPinStatus, isEn: boolean): string {
  if (status === "resolved") return isEn ? "Resolved" : "해결 완료";
  return status === "in-progress" ? (isEn ? "In Progress" : "수정 중") : (isEn ? "Open" : "미해결");
}

function bridgeIcon(bridgeId: ExternalBridgeId): ReactElement {
  if (bridgeId === "blender-glb-camera") return <Box className="h-4 w-4 shrink-0" aria-hidden="true" />;
  if (bridgeId === "figma-tokens-json") return <Palette className="h-4 w-4 shrink-0" aria-hidden="true" />;
  if (bridgeId === "slack-notion-digest") return <MessageSquare className="h-4 w-4 shrink-0" aria-hidden="true" />;
  return <Layers className="h-4 w-4 shrink-0" aria-hidden="true" />;
}

function KpiCard(props: {
  readonly label: string; readonly value: string; readonly subtext: string;
  readonly testId: string; readonly valueTone?: string;
}): ReactElement {
  const { label, value, subtext, testId, valueTone = "text-fg" } = props;
  return (
    <div className="rounded-xl border border-line bg-raised px-3.5 py-3">
      <div className="text-[11px] font-medium text-fg-3 [word-break:keep-all]">{label}</div>
      <div data-testid={testId} className={`mt-1 text-base font-bold tabular-nums [word-break:keep-all] ${valueTone}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-fg-3 tabular-nums [word-break:keep-all]">{subtext}</div>
    </div>
  );
}

function CutComparisonBackdrop(props: { readonly splitPct: number; readonly cutNumber: number; readonly isEn: boolean }): ReactElement {
  const { splitPct, cutNumber, isEn } = props;
  return (
    <div className="pointer-events-none relative h-64 w-full select-none overflow-hidden rounded-xl border border-line-strong bg-canvas sm:h-72">
      {/* 수정 전 (Before) 도안 레이어 */}
      <svg viewBox="0 0 640 360" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <rect x="0" y="0" width="640" height="360" className="fill-panel" />
        <line x1="0" y1="268" x2="640" y2="224" className="stroke-warn" strokeWidth="1.5" strokeDasharray="8 6" />
        <line x1="0" y1="145" x2="640" y2="178" className="stroke-line" strokeWidth="1.2" strokeDasharray="6 6" />
        <rect x="44" y="42" width="186" height="72" rx="22" className="fill-bad-soft stroke-bad" strokeWidth="2" />
        <path d="M210 106 L252 140 L188 114 Z" className="fill-bad-soft stroke-bad" strokeWidth="1.8" />
        <circle cx="318" cy="138" r="56" className="fill-card stroke-fg-3" strokeWidth="2.2" />
        <path d="M242 296 C252 218 384 218 394 296" className="fill-card stroke-fg-3" strokeWidth="2.2" />
        <path d="M294 134 Q306 142 314 134 M326 134 Q338 142 346 134" className="fill-none stroke-bad" strokeWidth="2.4" />
        <path d="M306 164 Q318 160 330 164" className="fill-none stroke-fg-3" strokeWidth="2" />
        <rect x="406" y="198" width="66" height="58" rx="12" className="fill-warning-soft stroke-warn" strokeWidth="2" strokeDasharray="5 4" />
        <text x="18" y="340" className="fill-fg-3 text-[13px] font-semibold">
          {isEn ? `CUT 0${cutNumber} · BEFORE DRAFT` : `컷 0${cutNumber} · 수정 전 원고`}
        </text>
      </svg>

      {/* 수정 후 (After) 보정 레이어 — 전후 비교 슬라이더로 클립 */}
      <div
        data-testid="visual-pin-after-layer"
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${Math.max(0, 100 - splitPct)}% 0 0)` }}
      >
        <svg viewBox="0 0 640 360" className="h-full w-full" aria-hidden="true">
          <rect x="0" y="0" width="640" height="360" className="fill-raised" />
          <line x1="0" y1="240" x2="640" y2="240" className="stroke-good" strokeWidth="1.5" strokeDasharray="6 4" />
          <line x1="0" y1="158" x2="640" y2="158" className="stroke-line-strong" strokeWidth="1" />
          <rect x="26" y="20" width="184" height="62" rx="20" className="fill-info-soft stroke-cool" strokeWidth="2" />
          <path d="M196 80 L234 108 L174 82 Z" className="fill-info-soft stroke-cool" strokeWidth="1.8" />
          <circle cx="318" cy="138" r="56" className="fill-card stroke-fg" strokeWidth="2.6" />
          <path d="M242 296 C252 218 384 218 394 296" className="fill-accent-soft stroke-fg" strokeWidth="2.6" />
          <path d="M292 132 L314 136 M324 136 L346 132" className="fill-none stroke-fg" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M304 162 Q318 172 332 162" className="fill-none stroke-accent" strokeWidth="2.4" strokeLinecap="round" />
          <rect x="410" y="204" width="56" height="46" rx="14" className="fill-good-soft stroke-good" strokeWidth="2.2" />
          <text x="18" y="340" className="fill-good text-[13px] font-semibold">
            {isEn ? `CUT 0${cutNumber} · AFTER REVISION` : `컷 0${cutNumber} · 수정 후 보정본`}
          </text>
        </svg>
      </div>

      {/* 전후 비교 분할선 */}
      <div
        data-testid="visual-pin-compare-divider"
        className="absolute inset-y-0 z-[5] w-0.5 bg-accent transition-[left] motion-reduce:transition-none"
        style={{ left: `${splitPct}%` }}
      >
        <span className="absolute top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-accent bg-card px-2 py-0.5 text-[10px] font-bold text-accent tabular-nums">
          {`${Math.round(splitPct)}%`}
        </span>
      </div>
    </div>
  );
}

/** 직관적 캔버스 핀 검수(원클릭 도장 · 전후 비교 · 6단계 바통터치) + 5대 외부 툴 오픈 라운드트립 브리지 패널. */
export function StudioVisualPinReviewPanel(props: StudioVisualPinReviewPanelProps): ReactElement {
  const {
    initialStageId = "lineart", initialVariant = "sample", initialBridgeId = "csp-psd-layers",
    locale = "ko", className, onStateChange, onStageAdvance, onCopyBridgeDigest, onCopyBridgeJson,
  } = props;

  const uid = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [reviewState, setReviewState] = useState<VisualPinReviewState>(() =>
    createInitialVisualPinReviewState({ variant: initialVariant, currentStageId: initialStageId }),
  );
  const [activeStampId, setActiveStampId] = useState<ReviewStampId>("expression-fix");
  const [quickDrafts, setQuickDrafts] = useState<Readonly<Record<string, string>>>({});
  const quickComment = quickDrafts[reviewState.activeCutId] ?? "";
  const [selectedPinId, setSelectedPinId] = useState<string | null>("pin-1");
  const [pinFilter, setPinFilter] = useState<PinFilterMode>("all");
  const [activeBridgeId, setActiveBridgeId] = useState<ExternalBridgeId>(initialBridgeId);
  const [bridgeScope, setBridgeScope] = useState<"episode" | "active-cut">("episode");
  const [previewTab, setPreviewTab] = useState<ExportPreviewTab>("markdown");
  const [statusBanner, setStatusBanner] = useState<string>("");

  const gate = useMemo<StageGateReadinessReport>(() => evaluateStageGateReadiness(reviewState), [reviewState]);
  const episodeSummary = useMemo(() => summarizeReviewPins(reviewState.pins), [reviewState.pins]);
  const activeCut = useMemo(() => getReviewCutDescriptor(reviewState.activeCutId), [reviewState.activeCutId]);
  const activeCutPins = useMemo(
    () => reviewState.pins.filter((pin) => pin.cutId === reviewState.activeCutId),
    [reviewState.pins, reviewState.activeCutId],
  );
  const filteredPins = useMemo(() => {
    if (pinFilter === "unresolved") return activeCutPins.filter((pin) => pin.status !== "resolved");
    if (pinFilter === "resolved") return activeCutPins.filter((pin) => pin.status === "resolved");
    return activeCutPins;
  }, [activeCutPins, pinFilter]);

  const bridgeManifest = useMemo<ExternalBridgeManifest>(
    () => buildExternalBridgeManifest(activeBridgeId, reviewState, { scope: bridgeScope, locale }),
    [activeBridgeId, reviewState, bridgeScope, locale],
  );

  const statePayload = useMemo(() => ({ state: reviewState, gate }), [reviewState, gate]);
  const stateNotification = useReviewNotification(onStateChange ? ({ state, gate: currentGate }: typeof statePayload) => onStateChange(state, currentGate) : undefined);
  const stageNotification = useReviewNotification(onStageAdvance ? ({ stageId, state }: { stageId: BatonStageId; state: VisualPinReviewState }) => onStageAdvance(stageId, state) : undefined);
  const markdownNotification = useReviewNotification(onCopyBridgeDigest ? ({ text, manifest }: { text: string; manifest: ExternalBridgeManifest }) => onCopyBridgeDigest(text, manifest) : undefined);
  const jsonNotification = useReviewNotification(onCopyBridgeJson ? ({ text, manifest }: { text: string; manifest: ExternalBridgeManifest }) => onCopyBridgeJson(text, manifest) : undefined);
  const clipboard = useReviewClipboard();
  const channels = [stateNotification, stageNotification, markdownNotification, jsonNotification, clipboard];
  const busy = channels.some((channel) => channel.status === "pending");
  const lastState = useRef<typeof statePayload | null>(null);
  const { notify: notifyState } = stateNotification;
  useEffect(() => {
    if (lastState.current !== statePayload) { lastState.current = statePayload; notifyState(statePayload); }
  }, [statePayload, notifyState]);

  const handleCanvasSurfaceClick = (event: MouseEvent<HTMLButtonElement>): void => {
    if (channels.some((channel) => channel.isPending())) return;
    if (reviewState.pins.length >= MAX_REVIEW_PINS) { setStatusBanner(pick("핀은 최대 256개입니다. 댓글 초안은 유지됩니다.", "Up to 256 pins. The comment draft is preserved.")); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const xPct = rect.width > 0 ? ((event.clientX - rect.left) / rect.width) * 100 : 52;
    const yPct = rect.height > 0 ? ((event.clientY - rect.top) / rect.height) * 100 : 46;
    const stamp = getReviewStampSpec(activeStampId);
    const nextPinId = `pin-${reviewState.nextPinNumber}`;
    setReviewState((prev) => addVisualReviewPin(prev, {
      stampId: activeStampId, xPct, yPct, cutId: prev.activeCutId, comment: quickComment === "" ? undefined : quickComment, locale,
    }));
    setSelectedPinId(nextPinId);
    setQuickDrafts((prev) => ({ ...prev, [reviewState.activeCutId]: "" }));
    setStatusBanner(
      pick(
        `${reviewState.nextPinNumber}번 '${stamp.labelKo}' 핀을 (${Math.round(xPct)}%, ${Math.round(yPct)}%)에 꽂았습니다.`,
        `Placed Pin ${reviewState.nextPinNumber} (${stamp.labelEn}) at (${Math.round(xPct)}%, ${Math.round(yPct)}%).`,
      ),
    );
  };

  const handleTogglePinResolved = (pinId: string): void => {
    const target = reviewState.pins.find((p) => p.id === pinId);
    setReviewState((prev) => toggleReviewPinResolved(prev, pinId));
    if (target) {
      const nextResolved = target.status !== "resolved";
      setStatusBanner(
        nextResolved
          ? pick(`${target.pinNumber}번 핀을 해결 완료 처리했습니다.`, `Marked Pin ${target.pinNumber} resolved.`)
          : pick(`${target.pinNumber}번 핀을 미해결로 다시 열었습니다.`, `Reopened Pin ${target.pinNumber}.`),
      );
    }
  };

  const handleCyclePinStatus = (pinId: string): void => {
    setReviewState((prev) => cycleReviewPinStatus(prev, pinId));
  };

  const handleRemovePin = (pinId: string): void => {
    setReviewState((prev) => removeReviewPin(prev, pinId));
    if (selectedPinId === pinId) setSelectedPinId(null);
    setStatusBanner(pick("선택한 핀을 보드에서 제거했습니다.", "Removed selected pin from the canvas."));
  };

  const handleResolveActiveCut = (): void => {
    setReviewState((prev) => resolveAllPinsForCut(prev, prev.activeCutId));
    setStatusBanner(pick(`${activeCut.titleKo}의 미해결 핀을 모두 해결 처리했습니다.`, `Resolved all pins in ${activeCut.titleEn}.`));
  };

  const handleResolveAllEpisode = (): void => {
    setReviewState((prev) => resolveAllPinsForCut(prev));
    setStatusBanner(pick("회차 전체 미해결 핀을 해결 완료했습니다. 다음 공정으로 바통을 넘길 수 있습니다.", "Resolved all episode pins. Next stage handoff is now unlocked."));
  };

  const handleAdvanceStage = (): void => {
    if (channels.some((channel) => channel.isPending())) return;
    let res: StageTransitionResult;
    try { res = advanceBatonStage(reviewState); } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      setStatusBanner(pick("공정 예제 이력 상한에 도달했습니다. 기존 상태는 유지됩니다.", "The example history limit was reached. The current state is preserved."));
      return;
    }
    if (!res.transitioned) {
      setStatusBanner(isEn ? res.gate.autoGuidanceEn : res.gate.autoGuidanceKo);
      return;
    }
    setReviewState(res.state);
    stageNotification.notify({ stageId: res.state.currentStageId, state: res.state });
    setStatusBanner(isEn ? res.notification.oneLineSummaryEn : res.notification.oneLineSummaryKo);
  };

  const handleSelectStage = (stageId: BatonStageId): void => {
    if (channels.some((channel) => channel.isPending())) return;
    let res: StageTransitionResult;
    try { res = rewindBatonStage(reviewState, stageId); } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      setStatusBanner(pick("공정 예제 이력 상한에 도달했습니다. 기존 상태는 유지됩니다.", "The example history limit was reached. The current state is preserved."));
      return;
    }
    if (!res.transitioned) return;
    setReviewState(res.state);
    setStatusBanner(pick(`'${getBatonStageSpec(stageId).shortLabelKo}' 공정 검수 보드로 전환했습니다.`, `Switched review board to ${getBatonStageSpec(stageId).shortLabelEn}.`));
  };

  const handleCopyOneLineAlert = (): void => {
    if (channels.some((channel) => channel.isPending())) return;
    clipboard.notify(isEn ? gate.notification.oneLineSummaryEn : gate.notification.oneLineSummaryKo);
  };
  const handleCopyBridgeMarkdown = (): void => {
    if (channels.some((channel) => channel.isPending())) return;
    markdownNotification.notify({ text: bridgeManifest.markdownDigest, manifest: bridgeManifest });
    clipboard.notify(bridgeManifest.markdownDigest);
    setPreviewTab("markdown");
  };
  const handleCopyBridgeJson = (): void => {
    if (channels.some((channel) => channel.isPending())) return;
    jsonNotification.notify({ text: bridgeManifest.jsonPayload, manifest: bridgeManifest });
    clipboard.notify(bridgeManifest.jsonPayload);
    setPreviewTab("json");
  };

  const handleResetSample = (): void => {
    setReviewState(createInitialVisualPinReviewState({ variant: "sample", currentStageId: initialStageId }));
    setSelectedPinId("pin-1");
    setQuickDrafts({});
    setStatusBanner(pick("샘플 원고 컷과 검수 핀 상태로 초기화했습니다.", "Reset sample cuts and review pins."));
  };

  const activeStamp = getReviewStampSpec(activeStampId);
  const compareSliderId = `${uid}-compare-slider`;
  const quickCommentId = `${uid}-quick-comment`;
  const gateToneClass = gate.gateStatus === "blocked"
    ? "border-bad bg-bad-soft text-bad"
    : gate.gateStatus === "ready"
      ? "border-good bg-good-soft text-good"
      : "border-accent bg-accent-soft text-accent";

  return (
    <section
      data-testid="studio-visual-pin-review-panel"
      aria-label={pick("직관적 캔버스 핀 검수 및 외부 툴 오픈 라운드트립 브리지", "Visual Pin Review & External Tool Open Roundtrip Bridge")}
      className={`space-y-5 rounded-2xl border border-line bg-card p-5 text-fg ${className ?? ""}`}
    >
      {/* 헤더 */}
      <ReviewOperationStatus channel="state" {...stateNotification} pending={busy} isEn={isEn} />
      <ReviewOperationStatus channel="stage" {...stageNotification} pending={busy} isEn={isEn} />
      <ReviewOperationStatus channel="markdown" {...markdownNotification} pending={busy} isEn={isEn} />
      <ReviewOperationStatus channel="json" {...jsonNotification} pending={busy} isEn={isEn} />
      <ReviewOperationStatus channel="clipboard" {...clipboard} pending={busy} isEn={isEn} />
      <fieldset disabled={busy} className="contents">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("1탭 캔버스 핀 검수", "1-Tap Visual Pin Review")}
            </span>
            <span data-testid="visual-pin-open-standard-badge" className="inline-flex items-center gap-1 rounded-full border border-good bg-good-soft px-2.5 py-0.5 text-[11px] font-semibold text-good">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("사유 포맷 우회 없음 · 오픈 표준", "Open Standards Only · No Bypass")}
            </span>
          </div>
          <h2 className="text-lg font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("직관적 캔버스 핀 검수 · 6단계 바통터치 & 외부 툴 라운드트립 브리지", "Visual Pin Review, 6-Stage Baton & External Roundtrip Bridge")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick("합성 SVG 컷과 고정 시각을 사용하는 메모리 검토 예제입니다. 실제 원고 변경·저장·협업 서버·역할 권한·팀 전송은 수행하지 않습니다. 외부 툴 목록은 포맷 참고이며 파일 변환·왕복 호환성을 검증하지 않았습니다. 닫으면 입력이 사라집니다.", "An in-memory review example with synthetic SVG cuts and fixed timestamps. No actual artwork changes, storage, collaboration server, role enforcement or team delivery. Tool entries are format references without verified conversion or roundtrip compatibility. Inputs disappear when closed.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="visual-pin-resolve-cut-btn" onClick={handleResolveActiveCut} className={BTN_SOLID}>
            <CheckCheck className="h-4 w-4 shrink-0" aria-hidden="true" />{pick("현재 컷 일괄 해결", "Resolve Active Cut")}
          </button>
          <button type="button" data-testid="visual-pin-copy-alert-btn" onClick={handleCopyOneLineAlert} className={BTN_OUTLINE}>
            <Copy className="h-4 w-4 shrink-0" aria-hidden="true" />{pick("1줄 알림 복사", "Copy 1-Line Alert")}
          </button>
          <button type="button" data-testid="visual-pin-reset-btn" onClick={handleResetSample} className={BTN_OUTLINE}>
            <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />{pick("샘플 복원", "Reset Sample")}
          </button>
        </div>
      </header>

      {statusBanner ? (
        <div data-testid="visual-pin-status-banner" role="status" aria-live="polite" className="rounded-lg border border-accent bg-accent-soft px-3.5 py-2 text-xs font-medium text-accent [word-break:keep-all]">
          {statusBanner}
        </div>
      ) : null}

      {/* 상단 핵심 KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard testId="visual-pin-stage-kpi" valueTone="text-accent" label={pick("바통터치 현재 공정", "Current Baton Stage")} value={`${isEn ? gate.currentStage.shortLabelEn : gate.currentStage.shortLabelKo} · ${gate.progressPct}%`} subtext={isEn ? `Owner: ${gate.currentStage.ownerRoleEn}` : `담당: ${gate.currentStage.ownerRoleKo}`} />
        <KpiCard testId="visual-pin-unresolved-kpi" valueTone={episodeSummary.blockingUnresolvedCount > 0 ? "text-bad" : "text-good"} label={pick("미해결 차단 핀", "Open Blocking Pins")} value={pick(`${episodeSummary.blockingUnresolvedCount}건`, `${episodeSummary.blockingUnresolvedCount} Open`)} subtext={pick(`미해결 ${episodeSummary.openCount} · 수정중 ${episodeSummary.inProgressCount}`, `Open ${episodeSummary.openCount} · WIP ${episodeSummary.inProgressCount}`)} />
        <KpiCard testId="visual-pin-resolved-kpi" valueTone="text-good" label={pick("해결 완료 · 승인 도장", "Resolved & Approved")} value={pick(`${episodeSummary.resolvedCount} / ${episodeSummary.total}건`, `${episodeSummary.resolvedCount} / ${episodeSummary.total}`)} subtext={pick(`승인 도장 ${episodeSummary.approvedStampCount}건`, `${episodeSummary.approvedStampCount} approval stamp(s)`)} />
        <KpiCard testId="visual-pin-bridge-kpi" valueTone="text-cool" label={pick("선택 포맷 참고 목록", "Active Format Reference")} value={`${isEn ? bridgeManifest.bridge.shortNameEn : bridgeManifest.bridge.shortNameKo} (${bridgeManifest.bridge.fileExtension})`} subtext={pick(`목록의 보존 분류 ${bridgeManifest.fidelitySummary.preservedCount}/${bridgeManifest.fidelitySummary.totalMappings}항목`, `Catalog preservation class ${bridgeManifest.fidelitySummary.preservedCount}/${bridgeManifest.fidelitySummary.totalMappings}`)} />
      </div>

      {/* 1. 6단계 바통터치 진행 바 & 승계 자동 안내 */}
      <div className="space-y-3 rounded-xl border border-line bg-canvas p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold text-fg [word-break:keep-all]">{pick("1. 6단계 바통터치 진행 바", "1. 6-Stage Baton Handoff Rail")}</h3>
            <span className="text-[11px] font-semibold text-fg-3 tabular-nums">{`${reviewState.projectTitle} ${reviewState.episodeLabel}`}</span>
          </div>
          <div className="flex items-center gap-2">
            <div role="progressbar" aria-label={pick("바통터치 공정 진행률", "Baton stage progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={gate.progressPct} className="h-2 w-28 overflow-hidden rounded-full bg-raised">
              <div className="h-full bg-accent transition-[width] motion-reduce:transition-none" style={{ width: `${gate.progressPct}%` }} />
            </div>
            <span className="text-[11px] font-bold text-fg-2 tabular-nums">{`${gate.progressPct}%`}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {BATON_STAGE_SPECS.map((stage) => {
            const isCurrent = stage.id === reviewState.currentStageId;
            const isPassed = stage.order < gate.currentStage.order;
            const stageOpenCount = episodeSummary.unresolvedByStage[stage.id];
            const cls = isCurrent
              ? "border-accent bg-accent-soft text-accent"
              : isPassed
                ? "border-good bg-good-soft text-fg"
                : "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";
            return (
              <button key={stage.id} type="button" data-testid={`visual-pin-stage-${stage.id}`} aria-pressed={isCurrent} onClick={() => handleSelectStage(stage.id)} className={`flex min-h-11 cursor-pointer flex-col items-start justify-between rounded-xl border px-3 py-2 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${cls}`}>
                <span className="flex w-full items-center justify-between gap-1 text-xs font-bold text-fg">
                  <span>{isEn ? stage.shortLabelEn : stage.shortLabelKo}</span>
                  {stageOpenCount > 0 ? <span className="rounded-full border border-bad bg-bad-soft px-1.5 py-0.5 text-[10px] font-bold text-bad tabular-nums">{stageOpenCount}</span> : isPassed ? <CheckCircle2 className="h-3.5 w-3.5 text-good" aria-hidden="true" /> : null}
                </span>
                <span className="text-[10px] text-fg-3">{isEn ? stage.ownerRoleEn : stage.ownerRoleKo}</span>
              </button>
            );
          })}
        </div>

        <div data-testid="visual-pin-gate-banner" className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3.5 py-3 ${gateToneClass}`}>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold [word-break:keep-all]">
              {gate.gateStatus === "blocked" ? <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
              <span>{isEn ? gate.autoGuidanceEn : gate.autoGuidanceKo}</span>
            </div>
            <div data-testid="visual-pin-oneline-alert" className="truncate font-mono text-[11px] opacity-90">
              {isEn ? gate.notification.oneLineSummaryEn : gate.notification.oneLineSummaryKo}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {gate.gateStatus === "blocked" ? (
              <button type="button" data-testid="visual-pin-resolve-all-episode-btn" onClick={handleResolveAllEpisode} className={BTN_OUTLINE}>
                <CheckCheck className="h-4 w-4 shrink-0" aria-hidden="true" />{pick("미해결 핀 전체 해결", "Resolve All Pins")}
              </button>
            ) : null}
            <button type="button" data-testid="visual-pin-advance-btn" disabled={!gate.canAdvance} onClick={handleAdvanceStage} className={BTN_SOLID}>
              <span>{isEn ? gate.notification.actionPromptEn : gate.notification.actionPromptKo}</span>
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. 컷 캔버스 핀 보드(클릭 도장 배치 · 전후 비교 슬라이더) & 번호 핀 카드 */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(310px,0.95fr)]">
        <div className="space-y-3 rounded-xl border border-line bg-canvas p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-fg [word-break:keep-all]">{pick("2. 컷 캔버스 원클릭 도장 핀 보드 & 전후 비교", "2. Cut Pin Board & Before/After Compare")}</h3>
            <div className="flex flex-wrap gap-1.5">
              {SAMPLE_REVIEW_CUTS.map((cut) => {
                const active = cut.id === reviewState.activeCutId;
                const cutOpen = summarizeReviewPins(reviewState.pins, cut.id).blockingUnresolvedCount;
                return (
                  <button key={cut.id} type="button" data-testid={`visual-pin-cut-${cut.id}`} aria-pressed={active} onClick={() => { setReviewState((prev) => selectActiveReviewCut(prev, cut.id)); setSelectedPinId(null); }} className={active ? BTN_ACTIVE : BTN_OUTLINE}>
                    <span>{pick(`${cut.cutNumber}컷`, `Cut ${cut.cutNumber}`)}</span>
                    <span className="tabular-nums opacity-80">{`(${cutOpen})`}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {REVIEW_STAMP_SPECS.map((stamp) => {
              const active = stamp.id === activeStampId;
              return (
                <button key={stamp.id} type="button" data-testid={`visual-pin-stamp-${stamp.id}`} aria-pressed={active} onClick={() => setActiveStampId(stamp.id)} className={`flex min-h-11 cursor-pointer items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-xs font-semibold transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${active ? toneBadgeClass(stamp.tone) : "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg"}`}>
                  <span className="inline-flex items-center gap-1.5"><Stamp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>{isEn ? stamp.labelEn : stamp.labelKo}</span></span>
                  <span className="text-[10px] opacity-75">{isEn ? getBatonStageSpec(stamp.defaultStageId).shortLabelEn : getBatonStageSpec(stamp.defaultStageId).shortLabelKo}</span>
                </button>
              );
            })}
          </div>

          <div className="space-y-1">
            <label htmlFor={quickCommentId} className="flex items-center justify-between text-[11px] font-medium text-fg-3 [word-break:keep-all]">
              <span>{pick(`다음 클릭 핀 댓글 원문 (${activeStamp.labelKo} · 비우면 기본 문구 자동 입력)`, `Next pin comment (${activeStamp.labelEn} · optional)`)}</span>
              <span className="inline-flex items-center gap-1 text-accent"><Crosshair className="h-3 w-3" aria-hidden="true" />{pick("캔버스 클릭으로 즉시 배치", "Click canvas to stamp")}</span>
            </label>
            <textarea id={quickCommentId} rows={2} data-testid="visual-pin-quick-comment" value={quickComment} maxLength={MAX_REVIEW_COMMENT} placeholder={isEn ? activeStamp.defaultCommentEn : activeStamp.defaultCommentKo} onChange={(e) => { const text = e.target.value; setQuickDrafts((prev) => ({ ...prev, [reviewState.activeCutId]: text })); }} className={INPUT_CLS} />
          </div>

          <div data-testid="visual-pin-canvas-board" className="relative">
            <CutComparisonBackdrop splitPct={reviewState.beforeAfterSplitPct} cutNumber={activeCut.cutNumber} isEn={isEn} />
            <button type="button" data-testid="visual-pin-canvas-surface" aria-label={pick(`${activeCut.titleKo} 캔버스에 ${activeStamp.labelKo} 핀 배치`, `Place ${activeStamp.labelEn} pin on ${activeCut.titleEn}`)} onClick={handleCanvasSurfaceClick} className={`absolute inset-0 z-[6] cursor-crosshair rounded-xl bg-transparent ${FOCUS_RING}`} />
            {activeCutPins.map((pin) => {
              const stamp = getReviewStampSpec(pin.stampId);
              const selected = selectedPinId === pin.id;
              return (
                <button key={pin.id} type="button" data-testid={`visual-pin-marker-${pin.id}`} aria-pressed={selected} aria-label={pick(`${pin.pinNumber}번 핀 ${stamp.labelKo} (${pin.xPct}%, ${pin.yPct}%)`, `Pin ${pin.pinNumber} ${stamp.labelEn} (${pin.xPct}%, ${pin.yPct}%)`)} onClick={() => setSelectedPinId(pin.id)} style={{ left: `${pin.xPct}%`, top: `${pin.yPct}%` }} className={`absolute z-10 inline-flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-2 text-xs font-extrabold tabular-nums transition-transform motion-reduce:transition-none ${FOCUS_RING} ${tonePinClass(stamp.tone, pin.status === "resolved")} ${selected ? "scale-110 ring-2 ring-fg" : "hover:scale-105"}`}>
                  {pin.pinNumber}
                </button>
              );
            })}
          </div>

          <div className="space-y-2 rounded-xl border border-line bg-raised p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={compareSliderId} className="inline-flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
                <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>{pick(`전후 비교 슬라이더 (수정 후 ${Math.round(reviewState.beforeAfterSplitPct)}%)`, `Before / After Split (After ${Math.round(reviewState.beforeAfterSplitPct)}%)`)}</span>
              </label>
              <div className="flex flex-wrap gap-1">
                {COMPARE_PRESETS.map((preset) => (
                  <button key={preset.pct} type="button" data-testid={`visual-pin-compare-${preset.pct}`} aria-pressed={Math.round(reviewState.beforeAfterSplitPct) === preset.pct} onClick={() => setReviewState((prev) => setBeforeAfterSplitPct(prev, preset.pct))} className={Math.round(reviewState.beforeAfterSplitPct) === preset.pct ? BTN_ACTIVE : BTN_OUTLINE}>
                    <span className="tabular-nums">{isEn ? preset.en : preset.ko}</span>
                  </button>
                ))}
              </div>
            </div>
            <input id={compareSliderId} type="range" min={0} max={100} step={1} data-testid="visual-pin-compare-slider" value={Math.round(reviewState.beforeAfterSplitPct)} onChange={(e) => setReviewState((prev) => setBeforeAfterSplitPct(prev, Number(e.target.value)))} className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
            <div className="grid gap-1 text-[11px] text-fg-2 sm:grid-cols-2 [word-break:keep-all]">
              <div>{isEn ? activeCut.beforeSummaryEn : activeCut.beforeSummaryKo}</div>
              <div className="text-good">{isEn ? activeCut.afterSummaryEn : activeCut.afterSummaryKo}</div>
            </div>
          </div>
        </div>

        {/* 번호 핀 리스트 & 1탭 해결 토글 */}
        <div data-testid="visual-pin-list" className="space-y-3 rounded-xl border border-line bg-canvas p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-fg tabular-nums [word-break:keep-all]">{pick(`${activeCut.titleKo} 핀 목록 (${activeCutPins.length})`, `${activeCut.titleEn} Pins (${activeCutPins.length})`)}</h3>
            <div className="flex flex-wrap gap-1">
              {(["all", "unresolved", "resolved"] as const).map((mode) => (
                <button key={mode} type="button" data-testid={`visual-pin-filter-${mode}`} aria-pressed={pinFilter === mode} onClick={() => setPinFilter(mode)} className={pinFilter === mode ? BTN_ACTIVE : BTN_OUTLINE}>
                  {mode === "all" ? pick("전체", "All") : mode === "unresolved" ? pick("미해결", "Open") : pick("해결", "Resolved")}
                </button>
              ))}
            </div>
          </div>

          {filteredPins.length === 0 ? (
            <div className="rounded-xl border border-line bg-raised px-3.5 py-6 text-center text-xs text-fg-3 [word-break:keep-all]">
              {pick("표시할 검수 핀이 없습니다. 왼쪽 캔버스를 클릭해 원클릭 도장을 찍어보세요.", "No pins match this filter. Click the cut canvas to drop a stamp pin.")}
            </div>
          ) : (
            <ul className="space-y-2">
              {filteredPins.map((pin) => {
                const stamp = getReviewStampSpec(pin.stampId);
                const stage = getBatonStageSpec(pin.stageId);
                const resolved = pin.status === "resolved";
                const commentInputId = `${uid}-pin-comment-${pin.id}`;
                return (
                  <li key={pin.id} data-testid={`visual-pin-card-${pin.id}`} className={`space-y-2 rounded-xl border p-3 transition-colors motion-reduce:transition-none ${selectedPinId === pin.id ? "border-accent bg-raised" : resolved ? "border-good bg-good-soft" : "border-line bg-card"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-1.5 text-[11px] font-bold tabular-nums ${tonePinClass(stamp.tone, resolved)}`}>{pin.pinNumber}</span>
                        <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold [word-break:keep-all] ${toneBadgeClass(stamp.tone)}`}>{isEn ? stamp.labelEn : stamp.labelKo}</span>
                        <span className="rounded-md border border-line bg-canvas px-1.5 py-0.5 text-[10px] font-semibold text-fg-2">{isEn ? stage.shortLabelEn : stage.shortLabelKo}</span>
                        <span className="text-[10px] text-fg-3 tabular-nums">{`(${pin.xPct}%, ${pin.yPct}%)`}</span>
                      </div>
                      <span data-testid={`visual-pin-status-${pin.id}`} className={`rounded-full border px-2 py-0.5 text-[10px] font-bold [word-break:keep-all] ${resolved ? "border-good bg-good-soft text-good" : pin.status === "in-progress" ? "border-warn bg-warning-soft text-warn" : "border-bad bg-bad-soft text-bad"}`}>
                        {pinStatusLabel(pin.status, isEn)}
                      </span>
                    </div>
                    <div>
                      <label htmlFor={commentInputId} className="sr-only">{pick(`${pin.pinNumber}번 핀 댓글 원문`, `Pin ${pin.pinNumber} comment`)}</label>
                      <textarea id={commentInputId} rows={2} maxLength={MAX_REVIEW_COMMENT} data-testid={`visual-pin-comment-input-${pin.id}`} value={pin.comment} onChange={(e) => setReviewState((prev) => updateReviewPinComment(prev, pin.id, e.target.value, undefined, pin.comment))} className={INPUT_CLS} />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <span className="text-[11px] text-fg-3 [word-break:keep-all]">{pick(`담당: ${pin.assignee}`, `Owner: ${pin.assignee}`)}</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button type="button" data-testid={`visual-pin-resolve-toggle-${pin.id}`} aria-pressed={resolved} onClick={() => handleTogglePinResolved(pin.id)} className={resolved ? BTN_ACTIVE : BTN_SOLID}>
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{resolved ? pick("다시 열기", "Reopen") : pick("1탭 해결", "Resolve")}
                        </button>
                        <button type="button" data-testid={`visual-pin-cycle-status-${pin.id}`} onClick={() => handleCyclePinStatus(pin.id)} className={BTN_OUTLINE}>
                          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("상태 순환", "Cycle")}
                        </button>
                        <button type="button" data-testid={`visual-pin-remove-${pin.id}`} aria-label={pick(`${pin.pinNumber}번 핀 삭제`, `Delete pin ${pin.pinNumber}`)} onClick={() => handleRemovePin(pin.id)} className={`${ICON_BTN} border-line bg-canvas text-fg-3 hover:border-bad hover:text-bad`}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* 3. 외부 툴 포맷 참고 목록 & 손실/보존 매핑표 */}
      <div className="space-y-3 rounded-xl border border-line bg-canvas p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold text-fg [word-break:keep-all]">{pick("3. 외부 툴 포맷 참고 목록", "3. Tool Format Reference Catalog")}</h3>
            <p className="mt-0.5 text-[11px] text-fg-3 [word-break:keep-all]">{pick("정적 포맷 참고 목록입니다. 아래 보존·근사·평탄화는 분류 가정이며 실제 파일 변환·왕복 보존율을 측정한 결과가 아닙니다.", "A static format-reference catalog. Preservation, approximation and flattening are classification assumptions, not measured file conversion or roundtrip fidelity.")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" data-testid="visual-pin-scope-episode" aria-pressed={bridgeScope === "episode"} onClick={() => setBridgeScope("episode")} className={bridgeScope === "episode" ? BTN_ACTIVE : BTN_OUTLINE}>{pick("전체 회차", "Episode")}</button>
            <button type="button" data-testid="visual-pin-scope-cut" aria-pressed={bridgeScope === "active-cut"} onClick={() => setBridgeScope("active-cut")} className={bridgeScope === "active-cut" ? BTN_ACTIVE : BTN_OUTLINE}>{pick("현재 컷만", "Active Cut")}</button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {EXTERNAL_BRIDGE_SPECS.map((bridge) => {
            const active = bridge.id === activeBridgeId;
            const fid = summarizeBridgeFidelity(bridge);
            return (
              <button key={bridge.id} type="button" data-testid={`visual-pin-bridge-${bridge.id}`} aria-pressed={active} onClick={() => setActiveBridgeId(bridge.id)} className={`flex min-h-11 cursor-pointer flex-col items-start justify-between gap-1 rounded-xl border p-3 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${active ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg"}`}>
                <span className="flex w-full items-center justify-between gap-1 text-xs font-bold text-fg">
                  <span className="inline-flex items-center gap-1.5">{bridgeIcon(bridge.id)}{isEn ? bridge.shortNameEn : bridge.shortNameKo}</span>
                  <span className="rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[10px] text-fg-2">{bridge.fileExtension}</span>
                </span>
                <span className="text-[10px] text-fg-3 tabular-nums">{pick(`보존 ${fid.preservedCount} · 근사 ${fid.approximatedCount} · 평탄 ${fid.flattenedCount}`, `Keep ${fid.preservedCount} · Approx ${fid.approximatedCount} · Flat ${fid.flattenedCount}`)}</span>
              </button>
            );
          })}
        </div>

        <div data-testid="visual-pin-bridge-detail" className="space-y-3 rounded-xl border border-line bg-raised p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-fg [word-break:keep-all]">{isEn ? bridgeManifest.bridge.toolNameEn : bridgeManifest.bridge.toolNameKo}</span>
                <span className="rounded-md border border-cool bg-info-soft px-2 py-0.5 font-mono text-[10px] font-semibold text-cool">{bridgeManifest.suggestedFileName}</span>
              </div>
              <p className="text-xs text-fg-2 [word-break:keep-all]">{isEn ? bridgeManifest.bridge.openStandardFormatEn : bridgeManifest.bridge.openStandardFormatKo}</p>
              <p className="inline-flex items-center gap-1 text-[11px] font-medium text-good [word-break:keep-all]">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {isEn ? bridgeManifest.bridge.avoidedProprietaryFormatEn : bridgeManifest.bridge.avoidedProprietaryFormatKo}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" data-testid="visual-pin-copy-md-btn" onClick={handleCopyBridgeMarkdown} className={BTN_SOLID}><FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("요약 Markdown 복사", "Copy Markdown")}</button>
              <button type="button" data-testid="visual-pin-copy-json-btn" onClick={handleCopyBridgeJson} className={BTN_OUTLINE}><Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("매니페스트 JSON 복사", "Copy JSON")}</button>
            </div>
          </div>

          <div data-testid="visual-pin-bridge-mapping-table" className="space-y-1.5">
            {bridgeManifest.bridge.mappings.map((row) => {
              const meta = fidelityMeta(row.status, isEn);
              return (
                <div key={row.id} className="grid gap-2 rounded-lg border border-line bg-card px-3 py-2 text-xs md:grid-cols-[minmax(160px,0.9fr)_86px_minmax(0,1.4fr)] [word-break:keep-all]">
                  <div className="font-bold text-fg">{isEn ? row.featureEn : row.featureKo}</div>
                  <div><span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold ${meta.cls}`}>{row.status === "flattened" ? <AlertTriangle className="mr-1 h-3 w-3 shrink-0" aria-hidden="true" /> : null}{meta.label}</span></div>
                  <div className="space-y-0.5 text-[11px]">
                    <div className="text-fg-2">{isEn ? row.detailEn : row.detailKo}</div>
                    <div className="text-fg-3">{pick(`권장 운용: ${row.workaroundKo}`, `Tip: ${row.workaroundEn}`)}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-fg-2 [word-break:keep-all]">{pick("내보내기 매니페스트 · 슬랙/노션 협업 요약 미리보기", "Export Manifest & Digest Preview")}</span>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" data-testid="visual-pin-preview-tab-markdown" aria-pressed={previewTab === "markdown"} onClick={() => setPreviewTab("markdown")} className={previewTab === "markdown" ? BTN_ACTIVE : BTN_OUTLINE}>Markdown</button>
                <button type="button" data-testid="visual-pin-preview-tab-json" aria-pressed={previewTab === "json"} onClick={() => setPreviewTab("json")} className={previewTab === "json" ? BTN_ACTIVE : BTN_OUTLINE}>JSON</button>
                <button type="button" data-testid="visual-pin-preview-tab-hidden" aria-pressed={previewTab === "hidden"} onClick={() => setPreviewTab("hidden")} className={previewTab === "hidden" ? BTN_ACTIVE : BTN_OUTLINE}>{pick("접기", "Hide")}</button>
              </div>
            </div>
            {previewTab !== "hidden" ? (
              <pre data-testid="visual-pin-export-preview" className="max-h-56 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] leading-relaxed text-fg-2">
                {previewTab === "markdown" ? bridgeManifest.markdownDigest : bridgeManifest.jsonPayload}
              </pre>
            ) : null}
          </div>
        </div>
      </div>
      </fieldset>
    </section>
  );
}
