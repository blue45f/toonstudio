/**
 * Wave 48A — 컷 감정·조명 자동 연출 제안기 (Scene Lighting & Atmosphere Advisor) 스튜디오 패널.
 *
 * - 상단 "작가 승인 후 적용" 배지 + 6대 빠른 장면 프리셋 + 대사/지문 입력 + 6대 시간대 선택
 * - 순수 시맨틱 SVG 3점 조명 탑뷰 & 컷 무드·말풍선 가독성 프리뷰 (oklch / currentColor 전용, 바이올렛 0%)
 * - Top-3 비파괴 조명 제안 카드(미리보기·1클릭 적용·되돌리기) + 키·필·림 미세 슬라이더 + 전 컷 비교 + 3D 릭 JSON 복사
 * - Calm Atelier 토큰 준수(원시 색·광범위 트랜지션·기본 빈 객체 props·스토리지·BigInt·장식 아이콘 0건)
 */

import {
  AlertTriangle, Check, CheckCircle2, CloudRain, Code2, Contrast, Eye,
  GitCompare, Lamp, MessageSquareText, RotateCcw, ShieldCheck, SlidersHorizontal, Sun, Undo2,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";
import { lightingDialogueSnippet } from "./lighting-input-contract";
import { useExampleCopy } from "./use-lighting-copy";
import { useExampleNotification } from "./use-lighting-notification";
import { LightingCopyStatus, LightingInputError, LightingOperationStatus } from "./LightingOperationStatus";

import {
  PREVIOUS_CUT_LIGHTING_PRESETS, SCENE_EMOTIONS, SCENE_LOCATION_PRESETS, SCENE_TIME_OF_DAY_PRESETS,
  applyLightingProposal, auditLightingReadability, compareLightingCuts, createLightingSession,
  exportLightingRigJson, formatOklch, getPreviousCutLightingPreset, getSceneEmotionMeta,
  getSceneLocationPreset, previewLightingProposal, proposeSceneLightingTop3,
  revertLightingProposal, tweakLightingRig, updateLightingPreviousCut,
  type CutShiftSeverity, type LightingRigTweakPatch, type PreviousCutLightingPresetId,
  type ReadabilityGrade, type SceneLightingProposal, type SceneLightingRig,
  type SceneLightingSession, type SceneLocationPresetId, type SceneTimeOfDay,
} from "./scene-lighting-advisor-engine";

export interface StudioSceneLightingAdvisorPanelProps {
  readonly initialDialogue?: string;
  readonly initialScenePreset?: SceneLocationPresetId;
  readonly initialTimeOfDay?: SceneTimeOfDay;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onApply?: (proposal: SceneLightingProposal, session: SceneLightingSession) => void | Promise<void>;
  readonly onRevert?: (session: SceneLightingSession) => void | Promise<void>;
  readonly onExportJson?: (json: string, session: SceneLightingSession) => void | Promise<void>;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

function gradeBadgeClass(grade: ReadabilityGrade): string {
  if (grade === "warning") return "border-bad bg-bad-soft text-bad";
  return grade === "caution" ? "border-warn bg-warning-soft text-warn" : "border-good bg-good-soft text-good";
}

function shiftBadgeClass(severity: CutShiftSeverity): string {
  if (severity === "dramatic-shift") return "border-bad bg-bad-soft text-bad";
  return severity === "notice" ? "border-warn bg-warning-soft text-warn" : "border-good bg-good-soft text-good";
}

function polarTopViewPoint(deg: number, radius: number): { readonly x: number; readonly y: number } {
  const rad = (deg * Math.PI) / 180;
  return {
    x: Math.round((120 + Math.sin(rad) * radius) * 10) / 10,
    y: Math.round((100 + Math.cos(rad) * radius) * 10) / 10,
  };
}

const SVG_INK = formatOklch({ l: 0.16, c: 0.01, h: 240 });
const SVG_PAPER = formatOklch({ l: 0.96, c: 0.008, h: 92 });
const SVG_RIM_TEXT = formatOklch({ l: 0.98, c: 0.005, h: 90 });
const SVG_HUD_BG = formatOklch({ l: 0.14, c: 0.01, h: 240 }, 0.74);

function ThreePointLightingTopViewSvg(props: { readonly rig: SceneLightingRig; readonly isEn: boolean }): ReactElement {
  const { rig, isEn } = props;
  const keyPt = polarTopViewPoint(rig.keyLight.azimuthDeg, 64);
  const fillPt = polarTopViewPoint(rig.fillLight.azimuthDeg, 60);
  const rimPt = polarTopViewPoint(rig.rimLight.angleDeg, 66);
  const keyCss = formatOklch(rig.keyLight.colorOklch);
  const keyBeamCss = formatOklch(rig.keyLight.colorOklch, 0.24);
  const fillCss = formatOklch(rig.fillLight.colorOklch);
  const fillBeamCss = formatOklch(rig.fillLight.colorOklch, 0.16);
  const rimCss = formatOklch(rig.rimLight.pigmentOklch);
  const rimBeamCss = formatOklch(rig.rimLight.pigmentOklch, 0.26);

  return (
    <svg
      data-testid="lighting-topview-svg" data-key-azimuth={rig.keyLight.azimuthDeg}
      data-key-kelvin={rig.keyLight.kelvin} data-rim-hue={rig.rimLight.pigmentOklch.h} data-violet-free="true"
      viewBox="0 0 240 200" className="h-48 w-full rounded-xl border border-line bg-canvas text-fg"
      role="img" aria-label={isEn ? "Three-point lighting top-down rig diagram" : "3점 조명 탑뷰 배치 도해"}
    >
      <circle cx="120" cy="100" r="66" fill="none" stroke="currentColor" strokeOpacity={0.14} strokeDasharray="3 4" />
      <circle cx="120" cy="100" r="36" fill="none" stroke="currentColor" strokeOpacity={0.1} />
      <line x1="120" y1="20" x2="120" y2="178" stroke="currentColor" strokeOpacity={0.12} strokeWidth="1" />
      <line x1="36" y1="100" x2="204" y2="100" stroke="currentColor" strokeOpacity={0.12} strokeWidth="1" />
      <polygon points={`${keyPt.x},${keyPt.y} 106,92 134,108`} fill={keyBeamCss} />
      <polygon points={`${fillPt.x},${fillPt.y} 108,108 132,92`} fill={fillBeamCss} />
      <polygon points={`${rimPt.x},${rimPt.y} 108,94 132,106`} fill={rimBeamCss} />
      <line x1={keyPt.x} y1={keyPt.y} x2="120" y2="100" stroke={keyCss} strokeWidth="1.8" strokeDasharray="4 3" />
      <line x1={fillPt.x} y1={fillPt.y} x2="120" y2="100" stroke={fillCss} strokeWidth="1.4" strokeDasharray="3 3" />
      <line x1={rimPt.x} y1={rimPt.y} x2="120" y2="100" stroke={rimCss} strokeWidth="1.8" strokeDasharray="4 2" />
      <circle cx="120" cy="100" r="14" fill="currentColor" fillOpacity={0.14} stroke="currentColor" strokeWidth="1.8" />
      <path d="M 111 103 Q 120 112 129 103" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <text x="120" y="103" textAnchor="middle" fill="currentColor" fontSize="8" fontWeight="700" fontFamily="monospace">{isEn ? "CHAR" : "인물"}</text>
      <rect x="104" y="174" width="32" height="16" rx="4" fill="currentColor" fillOpacity={0.12} stroke="currentColor" strokeWidth="1.3" />
      <text x="120" y="185" textAnchor="middle" fill="currentColor" fontSize="8" fontWeight="700" fontFamily="monospace">CAM</text>
      <circle cx={keyPt.x} cy={keyPt.y} r="11" fill={keyCss} stroke="currentColor" strokeWidth="1.4" />
      <text x={keyPt.x} y={keyPt.y + 3} textAnchor="middle" fill={SVG_INK} fontSize="8" fontWeight="700" fontFamily="monospace">K</text>
      <circle cx={fillPt.x} cy={fillPt.y} r="9.5" fill={fillCss} stroke="currentColor" strokeWidth="1.3" />
      <text x={fillPt.x} y={fillPt.y + 3} textAnchor="middle" fill={SVG_INK} fontSize="8" fontWeight="700" fontFamily="monospace">F</text>
      <circle cx={rimPt.x} cy={rimPt.y} r="10.5" fill={rimCss} stroke="currentColor" strokeWidth="1.4" />
      <text x={rimPt.x} y={rimPt.y + 3} textAnchor="middle" fill={SVG_RIM_TEXT} fontSize="8" fontWeight="700" fontFamily="monospace">R</text>
      <text x="10" y="16" fill="currentColor" fillOpacity={0.72} fontSize="8.5" fontFamily="monospace">
        {`KEY ${rig.keyLight.kelvin}K · ${rig.keyLight.azimuthDeg}°/${rig.keyLight.elevationDeg}°`}
      </text>
      <text x="10" y="192" fill="currentColor" fillOpacity={0.68} fontSize="8.5" fontFamily="monospace">
        {`FILL ${Math.round(rig.fillLight.fillRatio * 100)}% · RIM ${rig.rimLight.intensity.toFixed(1)}`}
      </text>
    </svg>
  );
}

function CutMoodBackdropPreviewSvg(props: {
  readonly rig: SceneLightingRig; readonly dialogue: string; readonly faceContrastRatio: number;
  readonly bubbleZoneLuminance: number; readonly overallGrade: ReadabilityGrade; readonly isEn: boolean;
}): ReactElement {
  const { rig, dialogue, faceContrastRatio, bubbleZoneLuminance, overallGrade, isEn } = props;
  const gradUid = useId();
  const skyGradId = `${gradUid}-sky`;
  const beamGradId = `${gradUid}-beam`;

  const topBackdrop = formatOklch({ l: Math.min(0.9, rig.atmosphere.backdropOklch.l + 0.08), c: rig.atmosphere.backdropOklch.c, h: rig.atmosphere.backdropOklch.h });
  const bottomBackdrop = formatOklch({ l: Math.max(0.1, rig.atmosphere.backdropOklch.l - 0.12), c: rig.atmosphere.backdropOklch.c, h: rig.atmosphere.backdropOklch.h });
  const keyTint = formatOklch(rig.keyLight.colorOklch, 0.22 + rig.atmosphere.volumetricStrength * 0.28);
  const keyTransparent = formatOklch(rig.keyLight.colorOklch, 0);
  const fogTint = formatOklch(rig.fillLight.colorOklch, rig.atmosphere.fogDensity * 0.35);
  const rimStroke = formatOklch(rig.rimLight.pigmentOklch);
  const litSkin = formatOklch(rig.keyLight.colorOklch, 0.85);
  const shadowSkin = formatOklch({ l: Math.max(0.14, 0.42 - rig.atmosphere.shadowContrastRatio * 0.03), c: 0.03, h: rig.atmosphere.backdropOklch.h });

  const keyFromLeft = rig.keyLight.azimuthDeg <= 0;
  const snippet = lightingDialogueSnippet(dialogue);

  return (
    <svg
      data-testid="lighting-mood-preview-svg" data-face-contrast={faceContrastRatio.toFixed(2)}
      data-bubble-luminance={bubbleZoneLuminance.toFixed(2)} data-readability-grade={overallGrade}
      viewBox="0 0 280 200" className="h-48 w-full rounded-xl border border-line bg-canvas"
      role="img" aria-label={isEn ? "Cut lighting mood and speech bubble readability preview" : "컷 조명 무드 및 말풍선 가독성 프리뷰"}
    >
      <defs>
        <linearGradient id={skyGradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={topBackdrop} />
          <stop offset="100%" stopColor={bottomBackdrop} />
        </linearGradient>
        <linearGradient id={beamGradId} x1={keyFromLeft ? "0%" : "100%"} y1="0%" x2={keyFromLeft ? "88%" : "12%"} y2="100%">
          <stop offset="0%" stopColor={keyTint} />
          <stop offset="100%" stopColor={keyTransparent} />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="280" height="200" rx="10" fill={`url(#${skyGradId})`} />
      <polygon points={keyFromLeft ? "0,0 165,0 245,200 45,200" : "115,0 280,0 235,200 35,200"} fill={`url(#${beamGradId})`} />
      <rect x="0" y="122" width="280" height="78" fill={fogTint} />
      <g>
        <ellipse cx="116" cy="182" rx="54" ry="34" fill={shadowSkin} stroke={rimStroke} strokeWidth={Math.max(1.5, rig.rimLight.intensity * 1.4)} />
        <circle cx="116" cy="116" r="26" fill={shadowSkin} />
        <path d={keyFromLeft ? "M 116 90 A 26 26 0 0 0 116 142 Z" : "M 116 90 A 26 26 0 0 1 116 142 Z"} fill={litSkin} />
        <path d={keyFromLeft ? "M 122 91 A 26 26 0 0 1 139 128" : "M 110 91 A 26 26 0 0 0 93 128"} fill="none" stroke={rimStroke} strokeWidth={Math.max(2, rig.rimLight.intensity * 1.6)} strokeLinecap="round" />
      </g>
      <g>
        <rect x="150" y="18" width="116" height="46" rx="14" fill={SVG_PAPER} stroke={SVG_INK} strokeWidth={bubbleZoneLuminance >= 0.74 ? "2.2" : "1.4"} />
        <polygon points="164,63 152,74 176,63" fill={SVG_PAPER} stroke={SVG_INK} strokeWidth="1.2" />
        <text x="208" y="45" textAnchor="middle" fill={SVG_INK} fontSize="10" fontWeight="700">{snippet}</text>
      </g>
      <rect x="10" y="168" width="154" height="22" rx="6" fill={SVG_HUD_BG} />
      <text x="18" y="182" fill={SVG_RIM_TEXT} fontSize="9" fontFamily="monospace">
        {`FACE ${faceContrastRatio.toFixed(1)}:1 · BG L ${Math.round(bubbleZoneLuminance * 100)}%`}
      </text>
    </svg>
  );
}

function TweakSliderRow(props: {
  readonly id: string; readonly testId: string; readonly label: string; readonly readout: string;
  readonly min: number; readonly max: number; readonly step: number; readonly value: number;
  readonly onChange: (value: number) => void;
}): ReactElement {
  const { id, testId, label, readout, min, max, step, value, onChange } = props;
  return (
    <div className="space-y-0.5">
      <label htmlFor={id} className="flex items-center justify-between gap-2 text-xs font-medium text-fg-2 [word-break:keep-all]">
        <span>{label}</span>
        <span data-testid={`${testId}-readout`} className="font-mono font-bold text-fg tabular-nums">{readout}</span>
      </label>
      <input
        id={id} data-testid={testId} type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-h-11 w-full cursor-pointer accent-accent"
      />
    </div>
  );
}

/** 컷 감정·조명 자동 연출 제안기 스튜디오 패널. */
export function StudioSceneLightingAdvisorPanel(
  props: StudioSceneLightingAdvisorPanelProps,
): ReactElement {
  const initialPreset = getSceneLocationPreset(props.initialScenePreset ?? "rooftop-rain");
  const isEn = props.locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const defaultDialogue = props.initialDialogue ?? (isEn ? initialPreset.defaultDialogueEn : initialPreset.defaultDialogueKo);
  const defaultTimeOfDay = props.initialTimeOfDay ?? initialPreset.defaultTimeOfDay;

  const uid = useId();
  const [scenePresetId, setScenePresetId] = useState<SceneLocationPresetId>(initialPreset.id);
  const [timeOfDay, setTimeOfDay] = useState<SceneTimeOfDay>(defaultTimeOfDay);
  const [dialogue, setDialogue] = useState<string>(defaultDialogue);
  const [previousCutId, setPreviousCutId] = useState<PreviousCutLightingPresetId>("neutral-day");
  const [session, setSession] = useState<SceneLightingSession>(() =>
    createLightingSession(undefined, getPreviousCutLightingPreset("neutral-day").rig),
  );
  const [showJson, setShowJson] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const calculation = useMemo(
    () => {
      try { return { bundle: proposeSceneLightingTop3({ dialogue, timeOfDay, scenePresetId }, session.previousCutRig), error: "" }; }
      catch (error) { return { bundle: null, error: error instanceof Error ? error.message : "조명 예제를 계산할 수 없습니다. 원문은 유지됩니다." }; }
    },
    [dialogue, timeOfDay, scenePresetId, session.previousCutRig],
  );
  const bundle = calculation.bundle;

  const activeRig = session.previewRig ?? session.currentRig;
  const activeReadability = useMemo(() => auditLightingReadability(activeRig), [activeRig]);
  const activeCutComparison = useMemo(
    () => compareLightingCuts(session.previousCutRig, activeRig),
    [session.previousCutRig, activeRig],
  );
  const jsonText = useMemo(() => exportLightingRigJson(session, bundle ?? undefined), [session, bundle]);
  const applyDelivery = useExampleNotification<{ proposal: SceneLightingProposal; session: SceneLightingSession }>(props.onApply ? value => props.onApply?.(value.proposal, value.session) : undefined);
  const revertDelivery = useExampleNotification(props.onRevert);
  const copyDelivery = useExampleCopy<SceneLightingSession, "json">({ json: props.onExportJson });
  const pending = applyDelivery.status === "pending" || revertDelivery.status === "pending" || copyDelivery.state === "pending";
  const isPending = (): boolean => applyDelivery.isPending() || revertDelivery.isPending() || copyDelivery.isPending();

  const handleSelectScenePreset = (nextPresetId: SceneLocationPresetId): void => {
    const meta = getSceneLocationPreset(nextPresetId);
    setScenePresetId(meta.id);
    setTimeOfDay(meta.defaultTimeOfDay);
    setDialogue(isEn ? meta.defaultDialogueEn : meta.defaultDialogueKo);
    setSession((prev) => previewLightingProposal(prev, null));
    setStatusMessage(
      pick(
        `'${meta.labelKo}' 장면 프리셋을 불러왔습니다. 추천 3안을 미리보고 원할 때 적용하세요.`,
        `Loaded '${meta.labelEn}' scene preset. Preview Top-3 rigs before applying.`,
      ),
    );
  };

  const handleSelectTimeOfDay = (nextTime: SceneTimeOfDay): void => {
    setTimeOfDay(nextTime);
    setSession((prev) => previewLightingProposal(prev, null));
  };

  const handleSelectPreviousCut = (nextPrevId: PreviousCutLightingPresetId): void => {
    const preset = getPreviousCutLightingPreset(nextPrevId);
    setPreviousCutId(nextPrevId);
    setSession((prev) => updateLightingPreviousCut(prev, preset.rig));
    setStatusMessage(pick(`비교 기준을 '${preset.labelKo}'으로 전환했습니다.`, `Switched previous cut comparison to '${preset.labelEn}'.`));
  };

  const handlePreview = (proposal: SceneLightingProposal): void => {
    const next = previewLightingProposal(session, proposal);
    setSession(next);
    setStatusMessage(
      next.previewingProposalId
        ? pick(`'${proposal.titleKo}' 미리보기 중입니다. 원본 컷 조명은 유지됩니다.`, `Previewing '${proposal.titleEn}'. Baseline rig stays intact.`)
        : pick("미리보기를 종료했습니다.", "Closed lighting preview."),
    );
  };

  const handleApply = (proposal: SceneLightingProposal): void => {
    if (isPending()) return;
    const next = applyLightingProposal(session, proposal);
    setSession(next);
    applyDelivery.notify({ proposal, session: next });
    setStatusMessage(pick(`'${proposal.titleKo}' 메모리 조명 예제를 선택했습니다.`, `Selected the '${proposal.titleEn}' in-memory lighting example.`));
  };

  const handleRevert = (): void => {
    if (isPending()) return;
    const next = revertLightingProposal(session);
    setSession(next);
    revertDelivery.notify(next);
    setStatusMessage(pick("메모리 예제를 초기 조명으로 되돌렸습니다.", "Reverted the in-memory example to its baseline."));
  };

  const handleTweak = (patch: LightingRigTweakPatch): void => {
    setSession((prev) => tweakLightingRig(prev, patch));
  };

  const handleResetAll = (): void => {
    setScenePresetId(initialPreset.id);
    setTimeOfDay(defaultTimeOfDay);
    setDialogue(defaultDialogue);
    setPreviousCutId("neutral-day");
    setSession(createLightingSession(undefined, getPreviousCutLightingPreset("neutral-day").rig));
    setStatusMessage(pick("입력과 조명 세션을 초기값으로 복원했습니다.", "Reset scene inputs and lighting session to defaults."));
  };

  const handleCopyJson = (): void => {
    if (isPending()) return;
    copyDelivery.copy("json", jsonText, session);
    setShowJson(true);
    setStatusMessage("");
  };

  if (!bundle) return <LightingInputError dialogue={dialogue} onChange={setDialogue} message={calculation.error} isEn={isEn} />;
  const primaryEmo = getSceneEmotionMeta(bundle.analysis.primaryEmotion);
  const secondaryEmo = getSceneEmotionMeta(bundle.analysis.secondaryEmotion);
  const dialogueInputId = `${uid}-dialogue`;

  const sessionStateLabel =
    session.status === "applied"
      ? pick("메모리 예제: 비파괴 적용됨", "In-memory example applied (Revertible)")
      : session.status === "tweaked"
        ? pick("메모리 예제: 미세 조정 적용됨", "In-memory example tweaked (Revertible)")
        : session.status === "previewing"
          ? pick("미리보기 중", "Previewing")
          : session.status === "reverted"
            ? pick("메모리 예제: 원본 되돌림 완료", "In-memory example reverted")
            : pick("원본 유지 중", "Baseline Intact");

  const gradeLabel =
    activeReadability.overallGrade === "pass"
      ? pick("가독성 안정", "Readability Pass")
      : activeReadability.overallGrade === "caution"
        ? pick("가독성 주의", "Readability Caution")
        : pick("대비 보정 권고", "Contrast Warning");

  return (
    <section
      data-testid="studio-scene-lighting-advisor-panel"
      aria-label={pick("컷 감정·조명 자동 연출 제안기", "Scene Lighting & Atmosphere Advisor")}
      className={`space-y-5 rounded-2xl border border-line bg-card p-5 text-fg ${props.className ?? ""}`}
    >
      <p data-testid="lighting-example-scope" className="text-xs text-fg-2">{pick("CPU·메모리 조명 구성 예제입니다. 대사 어휘 규칙과 매개변수로 만든 수치이며 실제 원고의 얼굴·말풍선 픽셀, GPU, 장면 반영·저장, Three.js·Blender 호환성을 확인하지 않습니다.", "CPU and in-memory lighting example using dialogue keywords and parameters. Artwork pixels, GPU rendering, scene changes, storage and Three.js/Blender compatibility are not verified.")}</p>
      <LightingOperationStatus channel="apply" {...applyDelivery} pending={pending} isEn={isEn} />
      <LightingOperationStatus channel="revert" {...revertDelivery} pending={pending} isEn={isEn} />
      <LightingCopyStatus {...copyDelivery} pending={pending} isEn={isEn} />
      <fieldset disabled={pending} className="contents">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent">
              <Sun className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("컷 조명·분위기 제안기", "Scene Lighting Advisor")}
            </span>
            <span
              data-testid="lighting-approval-badge"
              className="inline-flex items-center gap-1 rounded-full border border-good bg-good-soft px-2.5 py-0.5 text-[11px] font-semibold text-good [word-break:keep-all]"
            >
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("작가 승인 후 적용", "Author Approval Required")}
            </span>
            <span
              data-testid="lighting-session-status-badge"
              className="inline-flex items-center gap-1 rounded-full border border-line bg-raised px-2.5 py-0.5 text-[11px] font-semibold text-fg-2 tabular-nums"
            >
              {sessionStateLabel}
            </span>
          </div>
          <h2 className="text-lg font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("컷 감정·조명·분위기 자동 연출 제안기", "Dialogue & Mood Scene Lighting Advisor")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              "대사·지문과 시간대·장소를 분석해 3점 조명과 안개·역광 Top-3 연출안을 제안합니다. 얼굴 대비와 말풍선 명도를 확인한 뒤 원할 때만 비파괴 적용하세요.",
              "Analyzes dialogue, time of day, and setting into Top-3 non-destructive 3-point lighting rigs with face contrast and speech-bubble readability checks.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="lighting-revert-btn" disabled={!session.canRevert} onClick={handleRevert} className={BTN_OUTLINE}>
            <Undo2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("원래대로 되돌리기", "Revert to Original")}
          </button>
          <button type="button" data-testid="lighting-copy-json-btn" onClick={handleCopyJson} className={BTN_SOLID}>
            <Code2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("3D 릭 JSON 복사", "Copy 3D Rig JSON")}
          </button>
          <button type="button" data-testid="lighting-reset-btn" onClick={handleResetAll} className={BTN_OUTLINE}>
            <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("초기화", "Reset")}
          </button>
        </div>
      </header>

      {statusMessage ? (
        <div
          data-testid="lighting-status-banner"
          role="status"
          aria-live="polite"
          className="rounded-lg border border-accent bg-accent-soft px-3.5 py-2 text-xs font-medium text-accent [word-break:keep-all]"
        >
          {statusMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 rounded-xl border border-line bg-raised p-4 xl:col-span-6">
          <div className="space-y-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <Lamp className="h-4 w-4 text-accent" aria-hidden="true" />
              {pick("6대 빠른 장면 프리셋", "6 Quick Scene Presets")}
            </span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label={pick("장면 프리셋 선택", "Select scene preset")}>
              {SCENE_LOCATION_PRESETS.map((preset) => {
                const selected = preset.id === scenePresetId;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`lighting-scene-preset-${preset.id}`}
                    aria-pressed={selected}
                    onClick={() => handleSelectScenePreset(preset.id)}
                    className={selected ? BTN_ACTIVE : BTN_OUTLINE}
                  >
                    {isEn ? preset.labelEn : preset.labelKo}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor={dialogueInputId} className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <MessageSquareText className="h-4 w-4 text-accent" aria-hidden="true" />
              {pick("컷 대사 · 지문 입력", "Cut Dialogue & Stage Direction")}
            </label>
            <textarea
              id={dialogueInputId}
              data-testid="lighting-dialogue-input"
              rows={2}
              value={dialogue}
              onChange={(e) => { setDialogue(e.target.value); setSession(prev => previewLightingProposal(prev, null)); }}
              placeholder={pick("예: (거센 빗줄기) 여기서 끝내자. 더는 물러설 곳 없어.", "Enter dialogue or stage direction...")}
              className={`min-h-11 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg placeholder:text-fg-3 [word-break:keep-all] ${FOCUS_RING}`}
            />
          </div>

          <div className="space-y-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <CloudRain className="h-4 w-4 text-accent" aria-hidden="true" />
              {pick("시간대 · 기상 분위기", "Time of Day & Weather")}
            </span>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3" role="group" aria-label={pick("시간대 선택", "Select time of day")}>
              {SCENE_TIME_OF_DAY_PRESETS.map((t) => {
                const selected = t.id === timeOfDay;
                return (
                  <button
                    key={t.id}
                    type="button"
                    data-testid={`lighting-time-${t.id}`}
                    aria-pressed={selected}
                    onClick={() => handleSelectTimeOfDay(t.id)}
                    className={selected ? BTN_ACTIVE : BTN_OUTLINE}
                  >
                    {isEn ? t.labelEn : t.labelKo}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-fg [word-break:keep-all]">
                {pick("감지된 6대 감정 벡터", "Detected 6-Emotion Vector")}
              </span>
              <span data-testid="lighting-detected-emotion" className="font-bold text-accent tabular-nums [word-break:keep-all]">
                {`${isEn ? primaryEmo.labelEn : primaryEmo.labelKo} (${Math.round(bundle.analysis.confidence * 100)}%) · ${isEn ? secondaryEmo.labelEn : secondaryEmo.labelKo}`}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
              {SCENE_EMOTIONS.map((emo) => {
                const score = bundle.analysis.emotionVector[emo.id];
                const isPrimary = emo.id === bundle.analysis.primaryEmotion;
                return (
                  <div key={emo.id} className="space-y-0.5 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className={isPrimary ? "font-semibold text-fg" : "text-fg-3"}>{isEn ? emo.labelEn : emo.labelKo}</span>
                      <span className="font-mono text-fg-2 tabular-nums">{`${Math.round(score * 100)}%`}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-canvas ring-1 ring-line">
                      <div
                        className={`h-full rounded-full transition-colors motion-reduce:transition-none ${isPrimary ? "bg-accent" : "bg-line-strong"}`}
                        style={{ width: `${Math.min(100, Math.round(score * 180))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-line bg-raised p-4 xl:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-fg [word-break:keep-all]">
                {pick("3점 조명 탑뷰 & 컷 무드 프리뷰", "3-Point Top View & Cut Mood Preview")}
              </h3>
              <div data-testid="lighting-active-rig-label" className="text-[11px] text-fg-2 [word-break:keep-all]">
                {session.previewRig
                  ? pick(`미리보기 중 (미적용) · ${activeRig.labelKo}`, `Previewing (Uncommitted) · ${activeRig.labelEn}`)
                  : isEn ? activeRig.labelEn : activeRig.labelKo}
              </div>
            </div>
            <span
              data-testid="lighting-readability-badge"
              data-grade={activeReadability.overallGrade}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ${gradeBadgeClass(activeReadability.overallGrade)}`}
            >
              {activeReadability.overallGrade === "pass"
                ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                : <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              {gradeLabel}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ThreePointLightingTopViewSvg rig={activeRig} isEn={isEn} />
            <CutMoodBackdropPreviewSvg
              rig={activeRig}
              dialogue={dialogue}
              faceContrastRatio={activeReadability.faceContrastRatio}
              bubbleZoneLuminance={activeReadability.bubbleZoneLuminance}
              overallGrade={activeReadability.overallGrade}
              isEn={isEn}
            />
          </div>

          <div className="space-y-2 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-fg [word-break:keep-all]">
                <Contrast className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                {pick("얼굴 대비 · 말풍선 가독성 점검", "Face Contrast & Speech Bubble Audit")}
              </span>
              <span data-testid="lighting-contrast-metrics" className="font-mono text-[11px] text-fg-2 tabular-nums">
                {`${pick("얼굴", "Face")} ${activeReadability.faceContrastRatio.toFixed(1)}:1 · ${pick("배경 명도", "BG L")} ${Math.round(activeReadability.bubbleZoneLuminance * 100)}%`}
              </span>
            </div>
            <p className="text-[11px] text-fg-2 [word-break:keep-all]">
              {isEn ? activeReadability.recommendedBubbleStyleEn : activeReadability.recommendedBubbleStyleKo}
            </p>
            {(isEn ? activeReadability.warningsEn : activeReadability.warningsKo).map((warning) => (
              <div key={warning} className="rounded-md border border-warn bg-warning-soft px-2.5 py-1.5 text-[11px] font-medium text-warn [word-break:keep-all]">
                {warning}
              </div>
            ))}
          </div>

          <div className="space-y-2 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
                <GitCompare className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                {pick("전 컷 vs 현재 컷 조명 비교", "Previous Cut vs Active Cut")}
              </span>
              <span
                data-testid="lighting-cut-compare-badge"
                data-severity={activeCutComparison.shiftSeverity}
                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${shiftBadgeClass(activeCutComparison.shiftSeverity)}`}
              >
                {`${pick("연속성", "Continuity")} ${activeCutComparison.continuityScore}점`}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="group" aria-label={pick("전 컷 조명 기준 선택", "Select previous cut lighting")}>
              {PREVIOUS_CUT_LIGHTING_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  data-testid={`lighting-prev-cut-${preset.id}`}
                  aria-pressed={preset.id === previousCutId}
                  onClick={() => handleSelectPreviousCut(preset.id)}
                  className={preset.id === previousCutId ? BTN_ACTIVE : BTN_OUTLINE}
                >
                  {isEn ? preset.labelEn : preset.labelKo}
                </button>
              ))}
            </div>
            <p data-testid="lighting-cut-compare-summary" className="text-[11px] text-fg-2 tabular-nums [word-break:keep-all]">
              {isEn ? activeCutComparison.summaryEn : activeCutComparison.summaryKo}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-fg [word-break:keep-all]">
            {pick("Top-3 비파괴 3D 조명 제안 (선택 시에만 적용)", "Top-3 Non-Destructive 3D Lighting Proposals")}
          </h3>
          <span className="text-[11px] text-fg-3 tabular-nums [word-break:keep-all]">
            {pick("바이올렛 슬롭 0% · OKLCH 안료 검증됨", "0% Violet Slop · Verified OKLCH Pigments")}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {bundle.proposals.map((proposal) => {
            const isPreviewing = session.previewingProposalId === proposal.id;
            const isApplied = session.appliedProposalId === proposal.id && !session.isTweaked;
            const { keyLight, fillLight, rimLight, atmosphere } = proposal.rig;

            return (
              <article
                key={proposal.id}
                data-testid={`lighting-proposal-card-${proposal.rank}`}
                className={`flex flex-col justify-between space-y-3 rounded-xl border p-4 transition-colors motion-reduce:transition-none ${
                  isApplied ? "border-accent bg-accent-soft" : isPreviewing ? "border-line-strong bg-raised" : "border-line bg-raised"
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md border border-accent bg-card px-2 py-0.5 text-[11px] font-bold text-accent tabular-nums">
                          {`TOP ${proposal.rank}`}
                        </span>
                        <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${gradeBadgeClass(proposal.readabilityAudit.overallGrade)}`}>
                          {`대비 ${atmosphere.shadowContrastRatio.toFixed(1)}:1`}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-fg [word-break:keep-all]">
                        {isEn ? proposal.titleEn : proposal.titleKo}
                      </h4>
                    </div>
                    <span className="text-xs font-bold text-fg-2 tabular-nums">
                      {`${pick("규칙 점수", "Rule score")} ${Math.round(proposal.confidence * 100)}%`}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg border border-line bg-card px-2.5 py-2">
                      <div className="flex items-center gap-1.5 font-semibold text-fg">
                        <span className="h-2.5 w-2.5 rounded-full border border-line-strong" style={{ backgroundColor: formatOklch(keyLight.colorOklch) }} />
                        {pick("키라이트", "Key Light")}
                      </div>
                      <div className="mt-0.5 font-mono text-fg-2 tabular-nums">
                        {`${keyLight.kelvin}K · ${keyLight.intensity.toFixed(2)}`}
                      </div>
                      <div className="font-mono text-[10px] text-fg-3 tabular-nums">
                        {`Az ${keyLight.azimuthDeg}° · El ${keyLight.elevationDeg}°`}
                      </div>
                    </div>

                    <div className="rounded-lg border border-line bg-card px-2.5 py-2">
                      <div className="flex items-center gap-1.5 font-semibold text-fg">
                        <span className="h-2.5 w-2.5 rounded-full border border-line-strong" style={{ backgroundColor: formatOklch(rimLight.pigmentOklch) }} />
                        {pick("림라이트", "Rim Light")}
                      </div>
                      <div className="mt-0.5 font-mono text-fg-2 tabular-nums">
                        {`${isEn ? rimLight.pigmentNameEn : rimLight.pigmentNameKo} · ${rimLight.intensity.toFixed(2)}`}
                      </div>
                      <div className="font-mono text-[10px] text-fg-3 tabular-nums">
                        {`Ang ${rimLight.angleDeg}° · H ${rimLight.pigmentOklch.h}°`}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-line bg-card px-2.5 py-2 text-center text-[11px] tabular-nums">
                    <div>
                      <div className="text-[10px] text-fg-3">{pick("필 비율", "Fill")}</div>
                      <div className="font-mono font-semibold text-fg">{`${Math.round(fillLight.fillRatio * 100)}%`}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-fg-3">{pick("안개", "Fog")}</div>
                      <div className="font-mono font-semibold text-fg">{`${Math.round(atmosphere.fogDensity * 100)}%`}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-fg-3">{pick("볼류메트릭", "Volumetric")}</div>
                      <div className="font-mono font-semibold text-fg">{`${Math.round(atmosphere.volumetricStrength * 100)}%`}</div>
                    </div>
                  </div>

                  <p className="rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
                    {isEn ? proposal.reasonEn : proposal.reasonKo}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <button type="button" data-testid={`lighting-preview-btn-${proposal.rank}`} aria-pressed={isPreviewing} onClick={() => handlePreview(proposal)} className={isPreviewing ? BTN_ACTIVE : BTN_OUTLINE}>
                    <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {pick("미리보기", "Preview")}
                  </button>
                  <button type="button" data-testid={`lighting-apply-btn-${proposal.rank}`} aria-pressed={isApplied} onClick={() => handleApply(proposal)} className={BTN_SOLID}>
                    <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {isApplied ? pick("적용 중", "Applied") : pick("1클릭 적용", "1-Click Apply")}
                  </button>
                  <button type="button" data-testid={`lighting-card-revert-btn-${proposal.rank}`} disabled={!session.canRevert} onClick={handleRevert} className={BTN_OUTLINE}>
                    <Undo2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {pick("되돌리기", "Revert")}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg [word-break:keep-all]">
            <SlidersHorizontal className="h-4 w-4 text-accent" aria-hidden="true" />
            {pick("키 · 필 · 림 강도 및 색온도(K) 미세 조정", "Key / Fill / Rim Fine-Tuning")}
          </h3>
          <span className="text-[11px] text-fg-3 [word-break:keep-all]">
            {pick("슬라이더 조정도 비파괴 적용되며 원클릭으로 원본 복원됩니다.", "Slider tweaks remain non-destructive and revertible.")}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2 xl:grid-cols-3">
          <TweakSliderRow id={`${uid}-key-int`} testId="lighting-slider-key-intensity" label={pick("키라이트 강도", "Key Intensity")} readout={activeRig.keyLight.intensity.toFixed(2)} min={0.2} max={3.0} step={0.05} value={activeRig.keyLight.intensity} onChange={(v) => handleTweak({ keyIntensity: v })} />
          <TweakSliderRow id={`${uid}-key-k`} testId="lighting-slider-key-kelvin" label={pick("키라이트 색온도 (K)", "Key Color Temp (K)")} readout={`${activeRig.keyLight.kelvin}K`} min={2200} max={9500} step={100} value={activeRig.keyLight.kelvin} onChange={(v) => handleTweak({ keyKelvin: v })} />
          <TweakSliderRow id={`${uid}-fill-ratio`} testId="lighting-slider-fill-ratio" label={pick("필라이트 비율", "Fill Ratio")} readout={`${Math.round(activeRig.fillLight.fillRatio * 100)}%`} min={0.1} max={1.0} step={0.02} value={activeRig.fillLight.fillRatio} onChange={(v) => handleTweak({ fillRatio: v })} />
          <TweakSliderRow id={`${uid}-fill-k`} testId="lighting-slider-fill-kelvin" label={pick("필라이트 색온도 (K)", "Fill Color Temp (K)")} readout={`${activeRig.fillLight.kelvin}K`} min={2400} max={9500} step={100} value={activeRig.fillLight.kelvin} onChange={(v) => handleTweak({ fillKelvin: v })} />
          <TweakSliderRow id={`${uid}-rim-int`} testId="lighting-slider-rim-intensity" label={pick("림라이트 강도", "Rim Intensity")} readout={activeRig.rimLight.intensity.toFixed(2)} min={0} max={2.5} step={0.05} value={activeRig.rimLight.intensity} onChange={(v) => handleTweak({ rimIntensity: v })} />
          <TweakSliderRow id={`${uid}-fog`} testId="lighting-slider-fog-density" label={pick("안개 밀도", "Fog Density")} readout={`${Math.round(activeRig.atmosphere.fogDensity * 100)}%`} min={0} max={1.0} step={0.02} value={activeRig.atmosphere.fogDensity} onChange={(v) => handleTweak({ fogDensity: v })} />
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-fg [word-break:keep-all]">
            {pick("Three.js · Blender 3D 배경 릭 JSON 미리보기", "Three.js & Blender 3D Lighting Rig JSON")}
          </div>
          <button type="button" data-testid="lighting-toggle-json-btn" onClick={() => setShowJson((prev) => !prev)} className={BTN_OUTLINE}>
            <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {showJson ? pick("JSON 미리보기 숨기기", "Hide JSON Preview") : pick("JSON 미리보기 열기", "Show JSON Preview")}
          </button>
        </div>
        {showJson ? (
          <pre data-testid="lighting-json-preview" className="max-h-60 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2">
            {jsonText}
          </pre>
        ) : null}
      </div>
      </fieldset>
    </section>
  );
}
