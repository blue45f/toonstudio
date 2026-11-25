/**
 * Wave 47B — 대사·감정 기반 캐릭터 표정·입모양·포즈·손 모양 자동 제안 & 1클릭 비파괴 교체 패널.
 *
 * - 한국어 대사 입력, 성격 아키타입 5종, 감정 강도 슬라이더(1~5), 직전 컷 기준 선택
 * - Top-3 추천 카드: SVG 표정·입모양 미니 도해 + VRM 블렌드셰이프 막대 + 미리보기/1클릭 적용/되돌리기
 * - 직전 컷 연속성 배지 + 급격한 표정 점프 시 중간 전환안 1클릭 제안 + JSON 복사
 * - Calm Atelier 시맨틱 토큰 전용(원시 색·광범위 트랜지션·기본 빈 객체 props·Web Storage·장식 아이콘 미사용)
 */

import {
  AlertTriangle, Check, CheckCircle2, Code2, Eye, GitCompare, Hand,
  MessageSquareText, RotateCcw, ShieldCheck, SlidersHorizontal, Smile, Undo2, User,
} from "lucide-react";
import { useEffect, useId, useMemo, useState, type ReactElement } from "react";

import {
  ADVISOR_DIALOGUE_PRESETS, CHARACTER_ARCHETYPES, HAND_GESTURE_PRESETS,
  PREVIOUS_CUT_PRESETS, UPPER_BODY_POSE_PRESETS,
  applyAdvisorProposal, clampIntensity, createAdvisorSessionState,
  exportAdvisorStateJson, getArchetypeMeta, getEmotionMeta, getPreviousCutPreset,
  previewAdvisorProposal, recommendCharacterAdjustments, revertAdvisorProposal,
  updateAdvisorPreviousCut,
  type AdvisorApplyState, type CharacterAdjustmentProposal, type CharacterArchetype,
  type ContinuitySeverity, type EmotionIntensity, type PreviousCutPresetId,
  type VisemeId, type VrmBlendShapeWeights,
} from "./char-expression-pose-engine";

import { MAX_ADVISOR_DIALOGUE, MAX_ADVISOR_HISTORY } from "./advisor-input-contract";
import { AdvisorOperationStatus } from "./AdvisorOperationStatus";
import { FaceExpressionMiniSvg } from "./AdvisorFacePreview";
import { useAdvisorClipboard, useAdvisorNotification } from "./use-advisor-notification";

export interface StudioCharExpressionPoseAdvisorPanelProps {
  readonly initialDialogue?: string;
  readonly initialArchetype?: CharacterArchetype;
  readonly initialIntensity?: EmotionIntensity;
  readonly initialPreviousCutId?: PreviousCutPresetId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onApplyProposal?: (proposal: CharacterAdjustmentProposal, session: AdvisorApplyState) => void | Promise<void>;
  readonly onRevertProposal?: (session: AdvisorApplyState) => void | Promise<void>;
  readonly onExportJson?: (json: string, session: AdvisorApplyState) => void | Promise<void>;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

const INTENSITY_LABELS_KO: Readonly<Record<EmotionIntensity, string>> = {
  1: "미세", 2: "절제", 3: "표준", 4: "강조", 5: "격앙",
};
const INTENSITY_LABELS_EN: Readonly<Record<EmotionIntensity, string>> = {
  1: "Subtle", 2: "Restrained", 3: "Balanced", 4: "Strong", 5: "Intense",
};
const CORE_VRM_CHANNELS = ["happy", "angry", "sad", "surprised", "relaxed", "blink"] as const;

function continuityBadgeClass(severity: ContinuitySeverity): string {
  if (severity === "abrupt-jump") return "border-bad bg-bad-soft text-bad";
  return severity === "notice" ? "border-warn bg-warning-soft text-warn" : "border-good bg-good-soft text-good";
}

function formatSignedDeg(deg: number): string {
  return `${deg > 0 ? "+" : ""}${deg}°`;
}

function BlendShapeBarList(props: {
  readonly blendShapes: VrmBlendShapeWeights;
  readonly viseme: VisemeId;
  readonly testIdPrefix: string;
}): ReactElement {
  const { blendShapes, viseme, testIdPrefix } = props;
  const rows: readonly { readonly key: string; readonly value: number; readonly highlight: boolean }[] = [
    ...CORE_VRM_CHANNELS.map((k) => ({ key: k, value: blendShapes[k], highlight: blendShapes[k] >= 0.4 })),
    viseme === "closed"
      ? { key: "viseme:closed", value: 0, highlight: false }
      : { key: `viseme:${viseme}`, value: blendShapes[viseme], highlight: true },
  ];

  return (
    <div className="space-y-1.5" data-testid={`${testIdPrefix}-bars`}>
      {rows.map((row) => {
        const pct = Math.round(row.value * 100);
        return (
          <div key={row.key} className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-2 text-[11px]">
            <span className={`truncate font-mono ${row.highlight ? "font-semibold text-fg" : "text-fg-3"}`}>{row.key}</span>
            <div className="h-2 overflow-hidden rounded-full bg-canvas ring-1 ring-line">
              <div
                className={`h-full rounded-full transition-colors motion-reduce:transition-none ${row.highlight ? "bg-accent" : "bg-line-strong"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-right font-mono text-fg-2 tabular-nums">{row.value.toFixed(2)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** 대사·감정 기반 캐릭터 표정·입모양·포즈·손 모양 자동 제안 & 1클릭 비파괴 교체 스튜디오 패널. */
export function StudioCharExpressionPoseAdvisorPanel(
  props: StudioCharExpressionPoseAdvisorPanelProps,
): ReactElement {
  const {
    initialDialogue = ADVISOR_DIALOGUE_PRESETS[0]?.dialogue ?? "지금 장난해?! 당장 거기서 멈춰!!",
    initialArchetype = "stoic",
    initialIntensity = 4,
    initialPreviousCutId = "bright-joy",
    locale = "ko",
    className,
    onApplyProposal,
    onRevertProposal,
    onExportJson,
  } = props;

  const uid = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [dialogue, setDialogue] = useState<string>(initialDialogue);
  const [archetype, setArchetype] = useState<CharacterArchetype>(initialArchetype);
  const [intensity, setIntensity] = useState<EmotionIntensity>(clampIntensity(initialIntensity));
  const [previousCutId, setPreviousCutId] = useState<PreviousCutPresetId>(initialPreviousCutId);
  const [session, setSession] = useState<AdvisorApplyState>(() =>
    createAdvisorSessionState(undefined, getPreviousCutPreset(initialPreviousCutId).snapshot),
  );
  const [showJson, setShowJson] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const applyNotification = useAdvisorNotification(onApplyProposal ? ({ proposal, state }: { proposal: CharacterAdjustmentProposal; state: AdvisorApplyState }) => onApplyProposal(proposal, state) : undefined);
  const revertNotification = useAdvisorNotification(onRevertProposal);
  const exportNotification = useAdvisorNotification(onExportJson ? ({ text, state }: { text: string; state: AdvisorApplyState }) => onExportJson(text, state) : undefined);
  const clipboard = useAdvisorClipboard();
  const channels = [applyNotification, revertNotification, exportNotification, clipboard];
  const busy = channels.some((channel) => channel.status === "pending");

  const bundle = useMemo(
    () => recommendCharacterAdjustments({ dialogue, archetype, intensity }, session.previousCut),
    [dialogue, archetype, intensity, session.previousCut],
  );
  const jsonText = useMemo(() => exportAdvisorStateJson({ bundle, session }), [bundle, session]);

  const previewProposal = useMemo<CharacterAdjustmentProposal | null>(() => {
    if (!session.previewingProposalId) return null;
    if (bundle.continuityCheck?.bridgeProposal?.id === session.previewingProposalId) {
      return bundle.continuityCheck.bridgeProposal;
    }
    return bundle.proposals.find((p) => p.id === session.previewingProposalId) ?? null;
  }, [bundle, session.previewingProposalId]);

  useEffect(() => {
    if (session.previewingProposalId && !previewProposal) {
      setSession((prev) => previewAdvisorProposal(prev, null));
    }
  }, [previewProposal, session.previewingProposalId]);

  const activeVisual = previewProposal
    ? {
        label: pick(`미리보기 중 (미적용) · ${previewProposal.titleKo}`, `Previewing (Uncommitted) · ${previewProposal.titleEn}`),
        blendShapes: previewProposal.blendShapes, viseme: previewProposal.viseme,
        eyebrowTiltDeg: previewProposal.eyebrowTiltDeg, eyebrowLift: previewProposal.eyebrowLift,
        gazeYaw: previewProposal.gazeYaw, gazePitch: previewProposal.gazePitch,
        poseId: previewProposal.upperBodyPoseId, handId: previewProposal.handGestureId,
      }
    : {
        label: isEn ? session.current.labelEn : session.current.labelKo,
        blendShapes: session.current.blendShapes, viseme: session.current.viseme,
        eyebrowTiltDeg: session.current.eyebrowTiltDeg, eyebrowLift: session.current.eyebrowLift,
        gazeYaw: session.current.gazeYaw, gazePitch: session.current.gazePitch,
        poseId: session.current.upperBodyPoseId, handId: session.current.handGestureId,
      };

  const handleSelectPreviousCut = (nextId: PreviousCutPresetId): void => {
    const preset = getPreviousCutPreset(nextId);
    setPreviousCutId(nextId);
    setSession((prev) => updateAdvisorPreviousCut(prev, preset.snapshot));
    setStatusMessage(pick(`직전 컷 기준을 '${preset.labelKo}'으로 바꿨습니다.`, `Switched previous cut reference to '${preset.labelEn}'.`));
  };

  const handleLoadScenario = (scenarioId: string): void => {
    const scenario = ADVISOR_DIALOGUE_PRESETS.find((s) => s.id === scenarioId);
    if (!scenario) return;
    setDialogue(scenario.dialogue);
    setArchetype(scenario.archetype);
    setIntensity(scenario.intensity);
    setPreviousCutId(scenario.previousCutId);
    setSession((prev) => updateAdvisorPreviousCut(prev, getPreviousCutPreset(scenario.previousCutId).snapshot));
    setStatusMessage(pick(`'${scenario.labelKo}' 대사 예시를 불러왔습니다. 제안안을 확인 후 적용하세요.`, `Loaded '${scenario.labelEn}' dialogue preset.`));
  };

  const handleTogglePreview = (proposal: CharacterAdjustmentProposal): void => {
    const next = previewAdvisorProposal(session, proposal.id);
    setSession(next);
    setStatusMessage(
      next.previewingProposalId
        ? pick(`'${proposal.titleKo}' 미리보기 중입니다. 아직 원본 컷은 바뀌지 않았습니다.`, `Previewing '${proposal.titleEn}'. Baseline cut remains untouched.`)
        : pick("미리보기를 닫았습니다.", "Closed proposal preview."),
    );
  };

  const handleApply = (proposal: CharacterAdjustmentProposal): void => {
    if (channels.some((channel) => channel.isPending())) return;
    let next: AdvisorApplyState;
    try { next = applyAdvisorProposal(session, proposal); } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      setStatusMessage(pick("예제 이력 상한에 도달했습니다. 현재 상태와 원본은 유지되며 되돌리기는 가능합니다.", "The example history limit was reached. Current state and baseline are preserved; revert remains available."));
      return;
    }
    setSession(next);
    applyNotification.notify({ proposal, state: next });
    setStatusMessage(pick(`메모리 예제에서 선택하여 '${proposal.titleKo}'을 계산 예제에 적용했습니다. 실제 캐릭터·원고는 바꾸지 않습니다.`, `Applied '${proposal.titleEn}' to the in-memory example. No actual character or artwork is changed.`));
  };

  const handleRevert = (): void => {
    if (channels.some((channel) => channel.isPending())) return;
    const next = revertAdvisorProposal(session);
    setSession(next);
    revertNotification.notify(next);
    setStatusMessage(pick("합성 기준 스냅샷으로 메모리 예제를 되돌렸습니다. 실제 원고·저장은 확인하지 않습니다.", "Reverted the in-memory example to its synthetic baseline. Actual artwork and storage are not verified."));
  };

  const handleResetAll = (): void => {
    setDialogue(initialDialogue);
    setArchetype(initialArchetype);
    setIntensity(clampIntensity(initialIntensity));
    setPreviousCutId(initialPreviousCutId);
    setSession(createAdvisorSessionState(undefined, getPreviousCutPreset(initialPreviousCutId).snapshot));
    setStatusMessage(pick("어시스턴트 입력과 적용 상태를 초기값으로 복원했습니다.", "Reset advisor inputs and session state to defaults."));
  };

  const handleCopyJson = (): void => {
    if (channels.some((channel) => channel.isPending())) return;
    exportNotification.notify({ text: jsonText, state: session });
    clipboard.notify(jsonText);
    setShowJson(true);
  };

  const analysis = bundle.analysis;
  const continuity = bundle.continuityCheck;
  const primaryEmotionMeta = getEmotionMeta(analysis.primaryEmotion);
  const secondaryEmotionMeta = getEmotionMeta(analysis.secondaryEmotion);
  const archMeta = getArchetypeMeta(archetype);
  const dialogueInputId = `${uid}-dialogue`;
  const intensitySliderId = `${uid}-intensity`;

  const sessionStateLabel = session.status === "applied"
    ? pick("비파괴 적용됨", "Applied (Revertible)")
    : session.status === "previewing"
      ? pick("미리보기 중", "Previewing")
      : session.status === "reverted"
        ? pick("원본 되돌림 완료", "Reverted to Baseline")
        : pick("원본 유지 중", "Baseline Intact");

  const continuityLabel = continuity
    ? continuity.severity === "abrupt-jump"
      ? pick("표정 점프 감지", "Abrupt Jump")
      : continuity.severity === "notice"
        ? pick("완급 주의", "Shift Notice")
        : pick("자연 연결", "Smooth Cut")
    : pick("기준 없음", "No Reference");

  return (
    <section
      data-testid="studio-char-expression-pose-advisor-panel"
      aria-label={pick("대사·감정 기반 캐릭터 표정·입모양·포즈·손 모양 어시스턴트", "Character Expression & Pose Advisor")}
      className={`space-y-5 rounded-2xl border border-line bg-card p-5 text-fg ${className ?? ""}`}
    >
      <AdvisorOperationStatus channel="apply" {...applyNotification} pending={busy} isEn={isEn} />
      <AdvisorOperationStatus channel="revert" {...revertNotification} pending={busy} isEn={isEn} />
      <AdvisorOperationStatus channel="export" {...exportNotification} pending={busy} isEn={isEn} />
      <AdvisorOperationStatus channel="clipboard" {...clipboard} pending={busy} isEn={isEn} />
      <fieldset disabled={busy} className="contents">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent">
              <Smile className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("표정·포즈 어시스턴트", "Expression & Pose Advisor")}
            </span>
            <span
              data-testid="advisor-approval-badge"
              className="inline-flex items-center gap-1 rounded-full border border-good bg-good-soft px-2.5 py-0.5 text-[11px] font-semibold text-good [word-break:keep-all]"
            >
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("작가 선택 후 메모리 예제 적용", "Author Choice · In-Memory Example")}
            </span>
            <span
              data-testid="advisor-session-status-badge"
              className="inline-flex items-center gap-1 rounded-full border border-line bg-raised px-2.5 py-0.5 text-[11px] font-semibold text-fg-2 tabular-nums"
            >
              {sessionStateLabel}
            </span>
          </div>
          <h2 className="text-lg font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("대사·감정 기반 캐릭터 표정·입모양·포즈·손 모양 제안", "Dialogue-Driven Expression, Viseme, Pose & Hand Advisor")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              "어휘·부호 규칙으로 표정 가중치와 고정 포즈 이름을 제안하는 CPU·SVG 계산 예제입니다. 점수는 규칙 계산값이며 AI 추론 신뢰도나 실측 품질이 아닙니다. 실제 캐릭터·VRM·3D 장면·원고·파일 변환·저장·작가 신원 확인은 수행하지 않습니다. 닫으면 입력이 사라집니다.",
              "A CPU/SVG example using word and punctuation rules to propose weights and fixed pose names. Scores are not AI inference confidence or measured quality. No actual character, VRM, 3D scene, artwork, file conversion, storage, or author identity verification. Inputs disappear when closed.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="advisor-revert-btn"
            disabled={!session.canRevert}
            onClick={handleRevert}
            className={BTN_OUTLINE}
          >
            <Undo2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("원래대로 되돌리기", "Revert to Original")}
          </button>
          <button type="button" data-testid="advisor-copy-json-btn" onClick={handleCopyJson} className={BTN_SOLID}>
            <Code2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("JSON 복사", "Copy JSON")}
          </button>
          <button type="button" data-testid="advisor-reset-btn" onClick={handleResetAll} className={BTN_OUTLINE}>
            <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("초기화", "Reset")}
          </button>
        </div>
      </header>

      {statusMessage ? (
        <div
          data-testid="advisor-status-banner"
          role="status"
          aria-live="polite"
          className="rounded-lg border border-accent bg-accent-soft px-3.5 py-2 text-xs font-medium text-accent [word-break:keep-all]"
        >
          {statusMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 rounded-xl border border-line bg-raised p-4 xl:col-span-7">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={dialogueInputId} className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
                <MessageSquareText className="h-4 w-4 text-accent" aria-hidden="true" />
                {pick("현재 컷 대사 입력", "Current Cut Dialogue")}
              </label>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick("예시 대사 불러오기", "Load example dialogue")}>
                {ADVISOR_DIALOGUE_PRESETS.map((sc) => (
                  <button
                    key={sc.id}
                    type="button"
                    data-testid={`advisor-scenario-${sc.id}`}
                    onClick={() => handleLoadScenario(sc.id)}
                    className={`min-h-11 cursor-pointer rounded-lg border border-line bg-card px-2.5 py-1 text-[11px] font-medium text-fg-2 transition-colors hover:border-line-strong hover:text-fg motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING}`}
                  >
                    {isEn ? sc.labelEn : sc.labelKo}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              id={dialogueInputId}
              data-testid="advisor-dialogue-input" maxLength={MAX_ADVISOR_DIALOGUE}
              rows={2}
              value={dialogue}
              onChange={(e) => setDialogue(e.target.value)}
              placeholder={pick("예: 지금 장난해?! 당장 거기서 멈춰!!", "Enter character dialogue...")}
              className={`min-h-11 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg placeholder:text-fg-3 [word-break:keep-all] ${FOCUS_RING}`}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-fg [word-break:keep-all]">
                <User className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                {pick("캐릭터 성격 아키타입", "Character Archetype")}
              </span>
              <span className="text-[11px] text-fg-3 [word-break:keep-all]">{isEn ? archMeta.summaryEn : archMeta.summaryKo}</span>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label={pick("캐릭터 성격 선택", "Select character archetype")}>
              {CHARACTER_ARCHETYPES.map((arch) => {
                const isSelected = arch.id === archetype;
                return (
                  <button
                    key={arch.id}
                    type="button"
                    data-testid={`advisor-archetype-${arch.id}`}
                    aria-pressed={isSelected}
                    onClick={() => setArchetype(arch.id)}
                    className={isSelected ? BTN_ACTIVE : BTN_OUTLINE}
                  >
                    {isEn ? arch.labelEn : arch.labelKo}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor={intensitySliderId} className="flex items-center gap-1.5 font-semibold text-fg [word-break:keep-all]">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                  {pick("감정 강도 (1~5)", "Emotion Intensity (1–5)")}
                </label>
                <span data-testid="advisor-intensity-readout" className="font-semibold text-fg tabular-nums">
                  {isEn
                    ? `${intensity} / 5 · ${INTENSITY_LABELS_EN[intensity]}`
                    : `${intensity} / 5 · ${INTENSITY_LABELS_KO[intensity]}`}
                </span>
              </div>
              <input
                id={intensitySliderId}
                data-testid="advisor-intensity-slider"
                type="range"
                min={1}
                max={5}
                step={1}
                value={intensity}
                onChange={(e) => setIntensity(clampIntensity(Number(e.target.value)))}
                className="min-h-11 w-full cursor-pointer accent-accent"
              />
              <div className="text-[11px] text-fg-3 tabular-nums [word-break:keep-all]">
                {pick(`문장부호 추정 권장 강도: ${analysis.suggestedIntensity} / 5`, `Punctuation-suggested intensity: ${analysis.suggestedIntensity} / 5`)}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
                <GitCompare className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                {pick("직전 컷 기준 (연속성 검사)", "Previous Cut Reference")}
              </span>
              <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={pick("직전 컷 선택", "Select previous cut")}>
                {PREVIOUS_CUT_PRESETS.map((preset) => {
                  const isSelected = preset.id === previousCutId;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      data-testid={`advisor-prev-cut-${preset.id}`}
                      aria-pressed={isSelected}
                      onClick={() => handleSelectPreviousCut(preset.id)}
                      className={isSelected ? BTN_ACTIVE : BTN_OUTLINE}
                    >
                      {isEn ? preset.labelEn : preset.labelKo}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-line bg-raised p-4 xl:col-span-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-fg [word-break:keep-all]">
              {pick("실시간 대사 분석 · 현재 컷 상태", "Live Analysis & Active Cut State")}
            </h3>
            {continuity ? (
              <span
                data-testid="advisor-continuity-badge"
                data-severity={continuity.severity}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ${continuityBadgeClass(continuity.severity)}`}
              >
                {continuity.severity === "smooth"
                  ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  : <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                {`${continuityLabel} · ${continuity.expressionJumpScore}점`}
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-lg border border-line bg-card px-3 py-2">
              <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("감지 감정 · 규칙 점수", "Detected Emotion")}</div>
              <div data-testid="advisor-detected-emotion" className="mt-0.5 text-sm font-bold text-fg tabular-nums [word-break:keep-all]">
                {`${isEn ? primaryEmotionMeta.labelEn : primaryEmotionMeta.labelKo} (${Math.round(analysis.confidence * 100)}%)`}
              </div>
              <div className="text-[11px] text-fg-2 [word-break:keep-all]">
                {pick(`보조 감정: ${secondaryEmotionMeta.labelKo}`, `Secondary: ${secondaryEmotionMeta.labelEn}`)}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-card px-3 py-2">
              <div className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("입모양 비젬 · 기준 음절", "Viseme & Syllable")}</div>
              <div data-testid="advisor-detected-viseme" className="mt-0.5 font-mono text-sm font-bold text-accent tabular-nums">
                {analysis.visemeSourceSyllable ? `${analysis.viseme} ('${analysis.visemeSourceSyllable}')` : analysis.viseme}
              </div>
              <div className="truncate text-[11px] text-fg-2 [word-break:keep-all]">
                {analysis.detectedSignals.slice(0, 3).join(" · ")}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-line bg-card p-3">
            <FaceExpressionMiniSvg
              testId="advisor-active-face-svg"
              blendShapes={activeVisual.blendShapes}
              viseme={activeVisual.viseme}
              eyebrowTiltDeg={activeVisual.eyebrowTiltDeg}
              eyebrowLift={activeVisual.eyebrowLift}
              gazeYaw={activeVisual.gazeYaw}
              gazePitch={activeVisual.gazePitch}
              ariaLabel={pick("현재 활성 캐릭터 표정 도해", "Active character face diagram")}
            />
            <div className="min-w-0 flex-1 space-y-1 text-xs">
              <div data-testid="advisor-active-cut-label" className="font-semibold text-fg [word-break:keep-all]">
                {activeVisual.label}
              </div>
              <div className="text-[11px] text-fg-2 [word-break:keep-all]">
                {`${pick("상체", "Pose")}: ${isEn ? UPPER_BODY_POSE_PRESETS[activeVisual.poseId].labelEn : UPPER_BODY_POSE_PRESETS[activeVisual.poseId].labelKo}`}
              </div>
              <div className="text-[11px] text-fg-2 [word-break:keep-all]">
                {`${pick("손 모양", "Hand")}: ${isEn ? HAND_GESTURE_PRESETS[activeVisual.handId].labelEn : HAND_GESTURE_PRESETS[activeVisual.handId].labelKo}`}
              </div>
              <div className="font-mono text-[11px] text-fg-3 tabular-nums">
                {`Brow ${formatSignedDeg(activeVisual.eyebrowTiltDeg)} · Gaze (${formatSignedDeg(activeVisual.gazeYaw)}, ${formatSignedDeg(activeVisual.gazePitch)})`}
              </div>
            </div>
          </div>

          {continuity ? (
            <div className="space-y-2 rounded-lg border border-line bg-card p-3">
              <div className="text-xs font-medium text-fg [word-break:keep-all]">
                {isEn ? continuity.summaryEn : continuity.summaryKo}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(isEn ? continuity.jumpFactorsEn : continuity.jumpFactorsKo).map((factor) => (
                  <span key={factor} className="rounded-md border border-line bg-raised px-2 py-0.5 text-[11px] text-fg-2 [word-break:keep-all]">
                    {factor}
                  </span>
                ))}
              </div>
              {continuity.bridgeProposal ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    data-testid="advisor-bridge-preview-btn"
                    aria-pressed={session.previewingProposalId === continuity.bridgeProposal.id}
                    onClick={() => { if (continuity.bridgeProposal) handleTogglePreview(continuity.bridgeProposal); }}
                    className={session.previewingProposalId === continuity.bridgeProposal.id ? BTN_ACTIVE : BTN_OUTLINE}
                  >
                    <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {pick("중간 전환안 미리보기", "Preview Bridge")}
                  </button>
                  <button
                    type="button"
                    data-testid="advisor-bridge-apply-btn"
                    onClick={() => { if (continuity.bridgeProposal) handleApply(continuity.bridgeProposal); }}
                    className={BTN_SOLID}
                  >
                    <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {pick("중간 전환안 1클릭 적용", "1-Click Apply Bridge")}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-fg [word-break:keep-all]">
            {pick("Top-3 비파괴 추천안 (선택 시에만 적용)", "Top-3 Non-Destructive Proposals")}
          </h3>
          <span className="text-[11px] text-fg-3 [word-break:keep-all]">
            {isEn ? analysis.visemeReasonEn : analysis.visemeReasonKo}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {bundle.proposals.map((proposal) => {
            const isPreviewing = session.previewingProposalId === proposal.id;
            const isApplied = session.appliedProposalId === proposal.id;
            const poseMeta = UPPER_BODY_POSE_PRESETS[proposal.upperBodyPoseId];
            const handMeta = HAND_GESTURE_PRESETS[proposal.handGestureId];
            const emoMeta = getEmotionMeta(proposal.emotion);

            return (
              <article
                key={proposal.id}
                data-testid={`advisor-proposal-card-${proposal.rank}`}
                className={`flex flex-col justify-between space-y-3 rounded-xl border p-4 transition-colors motion-reduce:transition-none ${
                  isApplied
                    ? "border-accent bg-accent-soft"
                    : isPreviewing
                      ? "border-line-strong bg-raised"
                      : "border-line bg-raised"
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md border border-accent bg-card px-2 py-0.5 text-[11px] font-bold text-accent tabular-nums">
                          {`TOP ${proposal.rank}`}
                        </span>
                        <span className="rounded-md border border-line bg-card px-2 py-0.5 text-[11px] font-medium text-fg-2">
                          {isEn ? emoMeta.labelEn : emoMeta.labelKo}
                        </span>
                        <span className="rounded-md border border-line bg-card px-2 py-0.5 font-mono text-[11px] text-fg-3">
                          {proposal.viseme}
                        </span>
                      </div>
                      <h4 className="pt-1 text-sm font-bold text-fg [word-break:keep-all]">
                        {isEn ? proposal.titleEn : proposal.titleKo}
                      </h4>
                    </div>
                    <span className="text-xs font-bold text-fg-2 tabular-nums">
                      {`${Math.round(proposal.confidence * 100)}%`}
                    </span>
                  </div>

                  <div className="flex items-start gap-3">
                    <FaceExpressionMiniSvg
                      testId={`advisor-proposal-svg-${proposal.rank}`}
                      blendShapes={proposal.blendShapes}
                      viseme={proposal.viseme}
                      eyebrowTiltDeg={proposal.eyebrowTiltDeg}
                      eyebrowLift={proposal.eyebrowLift}
                      gazeYaw={proposal.gazeYaw}
                      gazePitch={proposal.gazePitch}
                      ariaLabel={`${isEn ? proposal.titleEn : proposal.titleKo} ${pick("표정 미니 도해", "expression mini diagram")}`}
                    />
                    <div className="min-w-0 flex-1 space-y-1.5 text-[11px]">
                      <div className="rounded-lg border border-line bg-card px-2.5 py-1.5">
                        <div className="font-semibold text-fg [word-break:keep-all]">
                          {isEn ? poseMeta.labelEn : poseMeta.labelKo}
                        </div>
                        <div className="truncate font-mono text-[10px] text-fg-3">{proposal.upperBodyPoseId}</div>
                      </div>
                      <div className="rounded-lg border border-line bg-card px-2.5 py-1.5">
                        <div className="flex items-center gap-1 font-semibold text-fg [word-break:keep-all]">
                          <Hand className="h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
                          {isEn ? handMeta.labelEn : handMeta.labelKo}
                        </div>
                        <div className="truncate font-mono text-[10px] text-fg-3">{proposal.handGestureId}</div>
                      </div>
                      <div className="font-mono text-[10px] text-fg-3 tabular-nums">
                        {`Brow ${formatSignedDeg(proposal.eyebrowTiltDeg)} · Gaze (${formatSignedDeg(proposal.gazeYaw)}, ${formatSignedDeg(proposal.gazePitch)})`}
                      </div>
                    </div>
                  </div>

                  <BlendShapeBarList
                    blendShapes={proposal.blendShapes}
                    viseme={proposal.viseme}
                    testIdPrefix={`advisor-proposal-${proposal.rank}`}
                  />

                  <p className="rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
                    {isEn ? proposal.reasonEn : proposal.reasonKo}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <button
                    type="button"
                    data-testid={`advisor-preview-btn-${proposal.rank}`}
                    aria-pressed={isPreviewing}
                    onClick={() => handleTogglePreview(proposal)}
                    className={isPreviewing ? BTN_ACTIVE : BTN_OUTLINE}
                  >
                    <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {pick("미리보기", "Preview")}
                  </button>
                  <button
                    type="button"
                    data-testid={`advisor-apply-btn-${proposal.rank}`} disabled={session.history.length >= MAX_ADVISOR_HISTORY - 1}
                    aria-pressed={isApplied}
                    onClick={() => handleApply(proposal)}
                    className={BTN_SOLID}
                  >
                    <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {isApplied ? pick("적용 중", "Applied") : pick("1클릭 적용", "1-Click Apply")}
                  </button>
                  <button
                    type="button"
                    data-testid={`advisor-card-revert-btn-${proposal.rank}`}
                    disabled={!session.canRevert}
                    onClick={handleRevert}
                    className={BTN_OUTLINE}
                  >
                    <Undo2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {pick("원래대로 되돌리기", "Revert")}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-fg [word-break:keep-all]">
            {pick("VRM 블렌드셰이프 · 포즈 · 연속성 JSON 내보내기", "VRM BlendShapes, Pose & Continuity JSON")}
          </div>
          <button
            type="button"
            data-testid="advisor-toggle-json-btn"
            onClick={() => setShowJson((prev) => !prev)}
            className={BTN_OUTLINE}
          >
            <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {showJson ? pick("JSON 미리보기 숨기기", "Hide JSON Preview") : pick("JSON 미리보기 열기", "Show JSON Preview")}
          </button>
        </div>
        {showJson ? (
          <pre
            data-testid="advisor-json-preview"
            className="max-h-60 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2"
          >
            {jsonText}
          </pre>
        ) : null}
      </div>
      </fieldset>
    </section>
  );
}
