/**
 * Wave 48C — 얼굴 회피 네거티브 스페이스 & 세로 스크롤 읽기 순서 기반
 * 말풍선 꼬리·한글 효과음(SFX) 자리 자동 추천 스튜디오 패널.
 *
 * - 5종 웹툰 컷 구도 프리셋 + 최대 3개 대사·감정 톤 편집 + 여백 안전거리 슬라이더
 * - 실시간 800×1200 SVG 컷 프리뷰(보호 영역 점선, 1→2→3 시선 흐름, 말풍선·꼬리, 회전 한글 SFX, 가림률 0% 배지)
 * - 비파괴 Top-3 추천 카드(미리보기·적용·되돌리기) + JSON/SVG 내보내기
 * - Calm Atelier 시맨틱 토큰 + oklch/currentColor 전용(원시 색·바이올렛 휴·광범위 트랜지션·기본 빈 객체 props·장식 아이콘 미사용)
 */

import {
  Check, Code2, Eye, EyeOff, FileCode2, Grid3x3, Layers,
  MessageSquareText, Plus, RotateCcw, ShieldCheck, SlidersHorizontal,
  Trash2, Undo2, Volume2,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import {
  BALLOON_STYLE_LABELS, CUT_COMPOSITION_PRESETS, DEFAULT_SAFE_MARGIN,
  EMOTION_TONE_META, MAX_DIALOGUE_BALLOONS, MAX_SAFE_MARGIN, MIN_SAFE_MARGIN,
  applyLayoutProposal, clampSafeMargin,
  createPlacementSessionState, exportLayoutProposalJson, exportLayoutProposalSvg,
  getCutPreset, previewLayoutProposal, proposeBalloonSfxLayoutsTop3,
  revertLayoutProposal,
  type BalloonSfxLayoutProposal, type CutPresetId, type DialogueItem,
  type EmotionTone,
  type PlacementSessionState,
  type TailDirection,
} from "./balloon-sfx-placement-engine";

import { CutPlacementPreviewSvg } from "./CutPlacementPreviewSvg";
import { PlacementOperationStatus } from "./PlacementOperationStatus";
import { usePlacementNotification, usePlacementClipboard } from "./use-placement-notification";

export interface StudioBalloonSfxProposerPanelProps {
  readonly initialCutPresetId?: CutPresetId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onApply?: (proposal: BalloonSfxLayoutProposal, session: PlacementSessionState) => void;
  readonly onRevert?: (session: PlacementSessionState) => void;
  readonly onExportJson?: (json: string, session: PlacementSessionState) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

const TAIL_DIR_LABELS: Readonly<Record<TailDirection, { readonly ko: string; readonly en: string }>> = {
  top: { ko: "상단 꼬리", en: "Top tail" },
  bottom: { ko: "하단 꼬리", en: "Bottom tail" },
  left: { ko: "좌측 꼬리", en: "Left tail" },
  right: { ko: "우측 꼬리", en: "Right tail" },
  "top-left": { ko: "좌상 꼬리", en: "Top-left tail" },
  "top-right": { ko: "우상 꼬리", en: "Top-right tail" },
  "bottom-left": { ko: "좌하 꼬리", en: "Bottom-left tail" },
  "bottom-right": { ko: "우하 꼬리", en: "Bottom-right tail" },
};

export function StudioBalloonSfxProposerPanel(
  props: StudioBalloonSfxProposerPanelProps,
): ReactElement {
  const {
    initialCutPresetId = "closeup-monologue",
    locale = "ko",
    className,
    onApply,
    onRevert,
    onExportJson,
  } = props;

  const uid = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const initialPreset = getCutPreset(initialCutPresetId);
  const [presetId, setPresetId] = useState<CutPresetId>(initialPreset.id);
  const [dialogues, setDialogues] = useState<readonly DialogueItem[]>(initialPreset.dialogues);
  const [safeMargin, setSafeMargin] = useState<number>(DEFAULT_SAFE_MARGIN);
  const [showProtectedZones, setShowProtectedZones] = useState<boolean>(true);
  const [showNegativeGrid, setShowNegativeGrid] = useState<boolean>(false);
  const [session, setSession] = useState<PlacementSessionState>(() => createPlacementSessionState());
  const [showJson, setShowJson] = useState<boolean>(false);
  const [showSvg, setShowSvg] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const activePreset = getCutPreset(presetId);

  const bundle = useMemo(
    () => proposeBalloonSfxLayoutsTop3({
      canvasWidth: activePreset.canvasWidth, canvasHeight: activePreset.canvasHeight,
      safeMargin, protectedZones: activePreset.protectedZones, dialogues,
    }),
    [activePreset, safeMargin, dialogues],
  );

  const previewProposal = useMemo<BalloonSfxLayoutProposal | null>(
    () => (session.previewingProposalId ? bundle.proposals.find((p) => p.id === session.previewingProposalId) ?? null : null),
    [bundle.proposals, session.previewingProposalId],
  );

  const [appliedProposal, setAppliedProposal] = useState<BalloonSfxLayoutProposal | null>(null);
  const dialogueSequence = useRef(0);
  const applyNotification = usePlacementNotification(onApply ? (value: { proposal: BalloonSfxLayoutProposal; session: PlacementSessionState }) => onApply(value.proposal, value.session) : undefined);
  const revertNotification = usePlacementNotification(onRevert);
  const exportNotification = usePlacementNotification(onExportJson ? (value: { text: string; session: PlacementSessionState }) => onExportJson(value.text, value.session) : undefined);
  const clipboard = usePlacementClipboard();
  const channels = [applyNotification, revertNotification, exportNotification, clipboard];
  const busy = channels.some((channel) => channel.status === "pending");

  useEffect(() => {
    if (session.previewingProposalId && !previewProposal) {
      setSession((prev) => previewLayoutProposal(prev, null));
    }
  }, [previewProposal, session.previewingProposalId]);

  const activeProposal: BalloonSfxLayoutProposal | null = previewProposal
    ? previewProposal
    : session.status === "applied"
      ? (appliedProposal ?? bundle.proposals[0])
      : session.status === "reverted"
        ? null
        : bundle.proposals[0];

  const displayMode: "suggested" | "previewing" | "applied" | "reverted" = previewProposal
    ? "previewing"
    : session.status === "applied"
      ? "applied"
      : session.status === "reverted"
        ? "reverted"
        : "suggested";

  const activeBalloons = activeProposal ? activeProposal.balloons : session.current.balloons;
  const activeSfx = activeProposal ? activeProposal.sfx : session.current.sfx;
  const activeFaceOcclusionPct = activeProposal ? activeProposal.metrics.faceOcclusionPct : session.current.faceOcclusionPct;
  const activeReadingValid = activeProposal ? activeProposal.metrics.readingOrderValid : session.current.readingOrderValid;
  const activeMarginScore = activeProposal ? activeProposal.metrics.marginBalanceScore : session.current.marginBalanceScore;

  const jsonText = useMemo(
    () => exportLayoutProposalJson({ presetId, safeMargin, protectedZones: activePreset.protectedZones, bundle, session }),
    [presetId, safeMargin, activePreset.protectedZones, bundle, session],
  );

  const svgText = useMemo(
    () => exportLayoutProposalSvg({
      canvasWidth: activePreset.canvasWidth, canvasHeight: activePreset.canvasHeight,
      safeMargin, protectedZones: activePreset.protectedZones, proposal: activeProposal, showProtectedZones,
    }),
    [activePreset, safeMargin, activeProposal, showProtectedZones],
  );

  const handleSelectPreset = (nextId: CutPresetId): void => {
    const preset = getCutPreset(nextId);
    setPresetId(preset.id);
    setDialogues(preset.dialogues);
    setSession(createPlacementSessionState());
    setAppliedProposal(null);
    setStatusMessage(pick(`'${preset.labelKo}' 컷 구도를 불러왔습니다.`, `Loaded '${preset.labelEn}' cut composition.`));
  };

  const handleUpdateDialogueText = (id: string, nextText: string): void => {
    if (nextText.length > 4096) { setStatusMessage(pick("대사 길이 상한을 넘었습니다. 이전 원문을 유지합니다.", "Dialogue length limit exceeded. Previous text is preserved.")); return; }
    setDialogues((prev) => prev.map((d) => (d.id === id ? { ...d, text: nextText } : d)));
  };

  const handleUpdateDialogueEmotion = (id: string, nextEmotion: EmotionTone): void => {
    setDialogues((prev) => prev.map((d) => (d.id === id ? { ...d, emotion: nextEmotion } : d)));
  };

  const handleAddDialogue = (): void => {
    if (dialogues.length >= MAX_DIALOGUE_BALLOONS) return;
    const anchor = dialogues[dialogues.length - 1] ?? activePreset.dialogues[0];
    const ids = new Set(dialogues.map((item) => item.id));
    let nextId: string;
    do { dialogueSequence.current += 1; nextId = `d-custom-${dialogueSequence.current}`; } while (ids.has(nextId));
    const newItem: DialogueItem = {
      id: nextId,
      speakerNameKo: anchor?.speakerNameKo ?? "화자",
      speakerNameEn: anchor?.speakerNameEn ?? "Speaker",
      text: pick("다음 대사를 입력해 주세요.", "Enter the next dialogue line."),
      mouthX: anchor?.mouthX ?? 400,
      mouthY: anchor?.mouthY ?? 640,
      emotion: "normal",
    };
    setDialogues((prev) => [...prev, newItem]);
  };

  const handleRemoveDialogue = (id: string): void => {
    if (dialogues.length <= 1) return;
    setDialogues((prev) => prev.filter((d) => d.id !== id));
  };

  const handleTogglePreview = (proposal: BalloonSfxLayoutProposal): void => {
    const next = previewLayoutProposal(session, proposal.id);
    setSession(next);
    setStatusMessage(
      next.previewingProposalId
        ? pick(`${proposal.rank}안(${proposal.titleKo})을 비파괴 미리보기 중입니다.`, `Previewing #${proposal.rank} (${proposal.titleEn}) non-destructively.`)
        : pick("미리보기를 닫았습니다.", "Closed layout preview."),
    );
  };

  const handleApplyProposal = (proposal: BalloonSfxLayoutProposal): void => {
    if (channels.some((channel) => channel.isPending())) return;
    const next = applyLayoutProposal(session, proposal);
    setAppliedProposal(proposal);
    setSession(next);
    applyNotification.notify({ proposal, session: next });
    setStatusMessage(
      pick(`작가 승인으로 ${proposal.rank}안(${proposal.titleKo})을 적용했습니다. 언제든 원본으로 되돌릴 수 있습니다.`, `Applied #${proposal.rank} (${proposal.titleEn}). Baseline stays restorable.`),
    );
  };

  const handleRevert = (): void => {
    if (channels.some((channel) => channel.isPending())) return;
    const next = revertLayoutProposal(session);
    setAppliedProposal(null);
    setSession(next);
    revertNotification.notify(next);
    setStatusMessage(pick("말풍선·SFX 배치를 원본 컷 상태로 되돌렸습니다.", "Reverted balloon and SFX layout to baseline cut."));
  };

  const handleResetAll = (): void => {
    const resetPreset = getCutPreset(initialCutPresetId);
    setPresetId(resetPreset.id);
    setDialogues(resetPreset.dialogues);
    setSafeMargin(DEFAULT_SAFE_MARGIN);
    setShowProtectedZones(true);
    setShowNegativeGrid(false);
    setSession(createPlacementSessionState());
    setAppliedProposal(null);
    setStatusMessage(pick("컷 구도와 여백 설정을 초기값으로 복원했습니다.", "Reset cut preset and safe margin to defaults."));
  };

  const handleExportJson = (): void => {
    if (channels.some((channel) => channel.isPending())) return;
    exportNotification.notify({ text: jsonText, session });
    clipboard.notify(jsonText);
    setShowJson(true);
    setStatusMessage(pick(`배치안 JSON(${jsonText.length.toLocaleString("ko-KR")}B)을 준비했습니다.`, `Prepared layout JSON (${jsonText.length.toLocaleString("en-US")} B).`));
  };

  const sessionStateLabel = session.status === "applied"
    ? pick("비파괴 적용됨", "Applied (Revertible)")
    : session.status === "previewing"
      ? pick("미리보기 중", "Previewing")
      : session.status === "reverted"
        ? pick("원본 되돌림 완료", "Reverted to Baseline")
        : pick("원본 유지 중", "Baseline Intact");

  const marginSliderId = `${uid}-safe-margin`;
  const occlusionBadgeClass = activeFaceOcclusionPct === 0 ? "border-good bg-good-soft text-good" : "border-bad bg-bad-soft text-bad";

  return (
    <section
      data-testid="studio-balloon-sfx-proposer-panel"
      aria-label={pick("말풍선 꼬리·효과음 자리 자동 추천기", "Smart Balloon & SFX Placement Proposer")}
      className={`space-y-5 rounded-2xl border border-line bg-card p-5 text-fg ${className ?? ""}`}
    >
      <fieldset disabled={busy} className="min-w-0 space-y-5">
      <p data-testid="proposer-example-notice" className="text-xs text-fg-2">{pick("보호 영역 좌표와 합성 SVG의 메모리 배치 예제입니다. PNG·실제 이미지를 분석하지 않으며 원고·파일 변경이나 저장을 수행하지 않습니다. 적용은 화면의 스냅샷만 고정합니다.", "An in-memory placement example using supplied regions and synthetic SVG. No PNG or image analysis, artwork/file changes or storage. Apply only pins this preview snapshot.")}</p>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent [word-break:keep-all]">
              <MessageSquareText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("말풍선·SFX 배치 추천", "Balloon & SFX Placement")}
            </span>
            <span data-testid="proposer-approval-badge" className="inline-flex items-center gap-1 rounded-full border border-good bg-good-soft px-2.5 py-0.5 text-[11px] font-semibold text-good [word-break:keep-all]">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("작가 승인 후 적용", "Author Approval Required")}
            </span>
            <span data-testid="proposer-session-status-badge" className="inline-flex items-center gap-1 rounded-full border border-line bg-raised px-2.5 py-0.5 text-[11px] font-semibold text-fg-2 tabular-nums">
              {sessionStateLabel}
            </span>
          </div>
          <h2 className="text-lg font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("말풍선 꼬리·효과음(SFX) 자리 자동 추천기", "Smart Balloon Tail & Korean SFX Placement Proposer")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              "얼굴·눈·손 보호 영역을 피해 800×1200 세로 컷 여백을 계산하고, 읽기 순서(1→2→3)를 지키는 말풍선·꼬리·한글 SFX 배치 3안을 제안합니다.",
              "Scores 800×1200 vertical-scroll negative space to avoid faces and eyes, proposing 3 non-destructive balloon, tail, and Hangul SFX layouts.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="proposer-revert-btn" disabled={!session.canRevert} onClick={handleRevert} className={BTN_OUTLINE}>
            <Undo2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("되돌리기", "Revert")}
          </button>
          <button type="button" data-testid="proposer-export-json-btn" onClick={handleExportJson} className={BTN_SOLID}>
            <Code2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("JSON 내보내기", "Export JSON")}
          </button>
          <button type="button" data-testid="proposer-toggle-svg-btn" aria-pressed={showSvg} onClick={() => setShowSvg((v) => !v)} className={showSvg ? BTN_ACTIVE : BTN_OUTLINE}>
            <FileCode2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("SVG 코드", "SVG Code")}
          </button>
          <button type="button" data-testid="proposer-reset-btn" onClick={handleResetAll} className={BTN_OUTLINE}>
            <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("초기화", "Reset")}
          </button>
        </div>
      </header>

      {statusMessage ? (
        <div data-testid="proposer-status-banner" role="status" aria-live="polite" className="rounded-lg border border-accent bg-accent-soft px-3.5 py-2 text-xs font-medium text-accent [word-break:keep-all]">
          {statusMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* 좌측: 컷 구도 프리셋 + 대사/감정 편집 + 여백 안전거리 */}
        <div className="space-y-4 rounded-xl border border-line bg-raised p-4 xl:col-span-7">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
                <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                {pick("웹툰 컷 구도 프리셋 (5종)", "Webtoon Cut Presets (5)")}
              </span>
              <span className="text-[11px] text-fg-3 [word-break:keep-all]">{isEn ? activePreset.summaryEn : activePreset.summaryKo}</span>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label={pick("컷 구도 프리셋 선택", "Select cut composition preset")}>
              {CUT_COMPOSITION_PRESETS.map((preset) => (
                <button
                  key={preset.id} type="button" data-testid={`proposer-preset-${preset.id}`}
                  aria-pressed={preset.id === presetId} onClick={() => handleSelectPreset(preset.id)}
                  className={preset.id === presetId ? BTN_ACTIVE : BTN_OUTLINE}
                >
                  {isEn ? preset.labelEn : preset.labelKo}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5 border-t border-line pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-fg [word-break:keep-all]">
                {pick(`대사 및 감정 톤 (최대 ${MAX_DIALOGUE_BALLOONS}개)`, `Dialogue & Emotion Tone (Max ${MAX_DIALOGUE_BALLOONS})`)}
              </span>
              <button type="button" data-testid="proposer-add-dialogue-btn" disabled={dialogues.length >= MAX_DIALOGUE_BALLOONS} onClick={handleAddDialogue} className={BTN_OUTLINE}>
                <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {pick("대사 추가", "Add Line")}
              </button>
            </div>

            <div className="space-y-2">
              {dialogues.map((item, idx) => {
                const inputId = `${uid}-dlg-${item.id}`;
                const toneSelectId = `${uid}-tone-${item.id}`;
                return (
                  <div key={item.id} data-testid={`proposer-dialogue-row-${idx + 1}`} className="grid grid-cols-1 gap-2 rounded-lg border border-line bg-card p-2.5 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <label htmlFor={inputId} className="font-semibold text-fg [word-break:keep-all]">
                          {idx + 1}. {isEn ? item.speakerNameEn : item.speakerNameKo}
                        </label>
                        <span className="font-mono text-fg-3 tabular-nums">
                          {pick("입 좌표", "Mouth")} ({item.mouthX}, {item.mouthY})
                        </span>
                      </div>
                      <input
                        id={inputId} type="text" data-testid={`proposer-dialogue-input-${idx + 1}`}
                        value={item.text} onChange={(e) => handleUpdateDialogueText(item.id, e.target.value)}
                        className={`min-h-11 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-fg [word-break:keep-all] ${FOCUS_RING}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor={toneSelectId} className="block text-[11px] font-semibold text-fg-2 [word-break:keep-all]">
                        {pick("감정 톤", "Tone")}
                      </label>
                      <select
                        id={toneSelectId} data-testid={`proposer-emotion-select-${idx + 1}`}
                        value={item.emotion} onChange={(e) => handleUpdateDialogueEmotion(item.id, e.target.value as EmotionTone)}
                        className={`min-h-11 rounded-lg border border-line bg-canvas px-2.5 py-2 text-xs font-medium text-fg ${FOCUS_RING}`}
                      >
                        {EMOTION_TONE_META.map((tone) => (
                          <option key={tone.id} value={tone.id}>{isEn ? tone.labelEn : tone.labelKo}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button" data-testid={`proposer-remove-dialogue-${idx + 1}`}
                      disabled={dialogues.length <= 1} onClick={() => handleRemoveDialogue(item.id)}
                      aria-label={pick(`${idx + 1}번 대사 삭제`, `Remove dialogue ${idx + 1}`)} className={BTN_OUTLINE}
                    >
                      <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-2 sm:items-center">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor={marginSliderId} className="flex items-center gap-1.5 font-semibold text-fg [word-break:keep-all]">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                  {pick("여백 안전거리", "Safe Margin")}
                </label>
                <span data-testid="proposer-safe-margin-value" className="font-mono font-semibold text-accent tabular-nums">{safeMargin}px</span>
              </div>
              <input
                id={marginSliderId} type="range" data-testid="proposer-safe-margin-slider"
                min={MIN_SAFE_MARGIN} max={MAX_SAFE_MARGIN} step={4} value={safeMargin}
                onChange={(e) => setSafeMargin(clampSafeMargin(Number(e.target.value)))}
                className="min-h-11 w-full cursor-pointer accent-accent"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <button type="button" data-testid="proposer-toggle-zones-btn" aria-pressed={showProtectedZones} onClick={() => setShowProtectedZones((v) => !v)} className={showProtectedZones ? BTN_ACTIVE : BTN_OUTLINE}>
                {showProtectedZones ? <Eye className="h-4 w-4 shrink-0" aria-hidden="true" /> : <EyeOff className="h-4 w-4 shrink-0" aria-hidden="true" />}
                {pick("보호 영역 표시", "Protected Zones")}
              </button>
              <button type="button" data-testid="proposer-toggle-grid-btn" aria-pressed={showNegativeGrid} onClick={() => setShowNegativeGrid((v) => !v)} className={showNegativeGrid ? BTN_ACTIVE : BTN_OUTLINE}>
                <Grid3x3 className="h-4 w-4 shrink-0" aria-hidden="true" />
                {pick("여백 격자", "Space Grid")}
              </button>
            </div>
          </div>
        </div>

        {/* 우측: 실시간 800×1200 SVG 컷 프리뷰 */}
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-line bg-raised p-4 xl:col-span-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-fg [word-break:keep-all]">
              {pick("실시간 800×1200 컷 배치 프리뷰", "Live 800×1200 Cut Placement Preview")}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <span data-testid="proposer-face-occlusion-badge" className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold tabular-nums ${occlusionBadgeClass}`}>
                {pick(`얼굴 가림률 ${activeFaceOcclusionPct}%`, `Face Occlusion ${activeFaceOcclusionPct}%`)}
              </span>
              <span data-testid="proposer-reading-order-badge" className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold [word-break:keep-all] ${activeReadingValid ? "border-good bg-good-soft text-good" : "border-warn bg-warning-soft text-warn"}`}>
                {activeReadingValid ? pick("시선 순서 1→2→3 일관", "Order 1→2→3 Valid") : pick("순서 점검 필요", "Check Order")}
              </span>
            </div>
          </div>

          <CutPlacementPreviewSvg
            canvasWidth={activePreset.canvasWidth} canvasHeight={activePreset.canvasHeight}
            safeMargin={safeMargin} protectedZones={activePreset.protectedZones} dialogues={dialogues}
            balloons={activeBalloons} sfx={activeSfx} grid={bundle.grid}
            showProtectedZones={showProtectedZones} showNegativeGrid={showNegativeGrid} displayMode={displayMode} isEn={isEn}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 py-2 text-[11px] text-fg-2">
            <span className="tabular-nums">
              {pick(`여백 균형 ${activeMarginScore}점 · 열린 여백 ${Math.round(bundle.grid.openCellRatio * 100)}%`, `Margin Balance ${activeMarginScore} · Open Space ${Math.round(bundle.grid.openCellRatio * 100)}%`)}
            </span>
            {activeSfx ? (
              <span data-testid="proposer-active-sfx-badge" className="inline-flex items-center gap-1 font-semibold text-accent tabular-nums">
                <Volume2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                SFX {activeSfx.text} ({activeSfx.rotationDeg}°)
              </span>
            ) : (
              <span className="text-fg-3">{pick("원본 컷(미배치)", "Baseline (Unplaced)")}</span>
            )}
          </div>
        </div>
      </div>

      {/* Top-3 추천 카드 */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-fg [word-break:keep-all]">
            {pick("비파괴 배치 추천 Top-3", "Non-Destructive Top-3 Layout Proposals")}
          </h3>
          <span className="text-[11px] text-fg-3 [word-break:keep-all]">
            {pick("미리보기로 확인한 뒤 원하는 안만 1클릭으로 적용하세요.", "Preview safely, then apply one option with instant revert.")}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {bundle.proposals.map((proposal) => {
            const isPreviewing = session.previewingProposalId === proposal.id;
            const isApplied = session.appliedProposalId === proposal.id && session.status === "applied";
            return (
              <article
                key={proposal.id} data-testid={`proposer-card-${proposal.rank}`}
                className={`flex flex-col justify-between gap-3 rounded-xl border p-4 transition-colors motion-reduce:transition-none ${isApplied ? "border-good bg-card" : isPreviewing ? "border-accent bg-card" : "border-line bg-raised"}`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="inline-flex items-center rounded-md border border-line bg-card px-2 py-0.5 text-[11px] font-bold text-accent tabular-nums">
                        {pick(`${proposal.rank}안`, `Option ${proposal.rank}`)}
                      </span>
                      <h4 className="mt-1 text-sm font-bold text-fg [word-break:keep-all]">{isEn ? proposal.titleEn : proposal.titleKo}</h4>
                    </div>
                    <span className="rounded-lg border border-line bg-card px-2 py-1 text-xs font-bold text-fg tabular-nums">
                      {proposal.metrics.overallScore}{pick("점", "pt")}
                    </span>
                  </div>
                  <p className="text-xs text-fg-2 [word-break:keep-all]">{isEn ? proposal.summaryEn : proposal.summaryKo}</p>

                  <div className="grid grid-cols-3 gap-1.5 text-center text-[11px]">
                    <div className="rounded-lg border border-line bg-card px-2 py-1.5">
                      <div className="text-fg-3 [word-break:keep-all]">{pick("얼굴 가림", "Face Occ.")}</div>
                      <div className={`font-bold tabular-nums ${proposal.metrics.faceOcclusionPct === 0 ? "text-good" : "text-bad"}`}>{proposal.metrics.faceOcclusionPct}%</div>
                    </div>
                    <div className="rounded-lg border border-line bg-card px-2 py-1.5">
                      <div className="text-fg-3 [word-break:keep-all]">{pick("여백 균형", "Balance")}</div>
                      <div className="font-bold text-fg tabular-nums">{proposal.metrics.marginBalanceScore}</div>
                    </div>
                    <div className="rounded-lg border border-line bg-card px-2 py-1.5">
                      <div className="text-fg-3 [word-break:keep-all]">{pick("효과음", "SFX")}</div>
                      <div className="truncate font-bold text-accent tabular-nums">{proposal.sfx.text} {proposal.sfx.rotationDeg}°</div>
                    </div>
                  </div>

                  <ul className="space-y-1 text-[11px] text-fg-2">
                    {proposal.balloons.map((b) => (
                      <li key={b.dialogueId} className="flex items-center justify-between gap-2 rounded-md border border-line bg-card px-2 py-1">
                        <span className="truncate [word-break:keep-all]">
                          {b.order}. {isEn ? BALLOON_STYLE_LABELS[b.style].en : BALLOON_STYLE_LABELS[b.style].ko} · {isEn ? TAIL_DIR_LABELS[b.tailDirection].en : TAIL_DIR_LABELS[b.tailDirection].ko}
                        </span>
                        <span className="shrink-0 font-mono text-fg-3 tabular-nums">{b.mouthDistancePx}px</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <button type="button" data-testid={`proposer-preview-btn-${proposal.rank}`} aria-pressed={isPreviewing} onClick={() => handleTogglePreview(proposal)} className={isPreviewing ? BTN_ACTIVE : BTN_OUTLINE}>
                    <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {isPreviewing ? pick("미리보기 닫기", "Close Preview") : pick("미리보기", "Preview")}
                  </button>
                  <button type="button" data-testid={`proposer-apply-btn-${proposal.rank}`} onClick={() => handleApplyProposal(proposal)} className={BTN_SOLID}>
                    <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {isApplied ? pick("적용됨", "Applied") : pick("적용", "Apply")}
                  </button>
                  {isApplied ? (
                    <button type="button" data-testid={`proposer-card-revert-btn-${proposal.rank}`} onClick={handleRevert} className={BTN_OUTLINE}>
                      <Undo2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {pick("되돌리기", "Revert")}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {showJson ? (
        <div className="space-y-1.5 rounded-xl border border-line bg-raised p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-fg">{pick("레이아웃 JSON 내보내기", "Exported Layout JSON")}</span>
            <button type="button" data-testid="proposer-toggle-json-btn" onClick={() => setShowJson(false)} className={BTN_OUTLINE}>{pick("닫기", "Close")}</button>
          </div>
          <pre data-testid="proposer-json-preview" className="max-h-56 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2">{jsonText}</pre>
        </div>
      ) : null}

      {showSvg ? (
        <div className="space-y-1.5 rounded-xl border border-line bg-raised p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-fg">{pick("800×1200 SVG 마크업", "800×1200 SVG Markup")}</span>
            <button type="button" data-testid="proposer-close-svg-btn" onClick={() => setShowSvg(false)} className={BTN_OUTLINE}>{pick("닫기", "Close")}</button>
          </div>
          <pre data-testid="proposer-svg-preview" className="max-h-56 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2">{svgText}</pre>
        </div>
      ) : null}
      </fieldset>
      <PlacementOperationStatus channel="apply" {...applyNotification} pending={busy} isEn={isEn} />
      <PlacementOperationStatus channel="revert" {...revertNotification} pending={busy} isEn={isEn} />
      <PlacementOperationStatus channel="json" {...exportNotification} pending={busy} isEn={isEn} />
      <PlacementOperationStatus channel="clipboard" {...clipboard} pending={busy} isEn={isEn} />
    </section>
  );
}
