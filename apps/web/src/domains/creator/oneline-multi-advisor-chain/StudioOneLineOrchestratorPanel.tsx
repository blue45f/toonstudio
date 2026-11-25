/**
 * Wave 49D — 대사 한 줄 → 4대 어시스턴트 원스톱 연출 체인 (One-Line Multi-Advisor Orchestrator) 스튜디오 패널.
 *
 * - 한 줄 대사 입력 + 5종 상황 프리셋 + 통합 연출 세트 3안 원클릭 선택
 * - 4대 슬롯(표정·조명·카메라·말풍선) 독립 조합 + 메모리 예제의 미리보기·선택 반영·기록 원복
 * - 순수 시맨틱 SVG 통합 컷 연출 프리뷰(조명·카메라 3분할·인물/표정·말풍선/SFX 겹침 표시, oklch/currentColor 전용, 바이올렛 0%)
 * - 통합 컷 연출 JSON 및 한글 연출 큐시트 Markdown 미리보기·복사
 */

import {
  AlertTriangle, Camera, Check, CheckCircle2, Code2, Copy, Eye, FileText,
  Layers, MessageSquareText, RotateCcw, ShieldCheck, SlidersHorizontal, Smile, Sun, Undo2,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { HAND_GESTURE_PRESETS, UPPER_BODY_POSE_PRESETS, getEmotionMeta, type VisemeId } from "../char-expression-pose-advisor";
import { formatOklch, type ReadabilityGrade } from "../scene-lighting-atmosphere-advisor";
import { type ContinuityStatus } from "../camera-framing-continuity-coach";
import { DEFAULT_CUT_HEIGHT, DEFAULT_CUT_WIDTH, buildBalloonOutlinePath, type ProtectedZone, type SfxAccentStyle } from "../balloon-sfx-placement-proposer";

import {
  ADVISOR_SLOT_KEYS, ADVISOR_SLOT_META, ONE_LINE_SCENARIO_PRESETS,
  applySingleSlot, applyUnifiedSelection, createOrchestratorSession,
  exportUnifiedSceneBundleJson, exportUnifiedSceneMarkdown, getOneLineScenarioPreset,
  orchestrateOneLineSceneBundles, resolveActiveOrchestratorView, revertAllOrchestratorSlots,
  revertOrchestratorSlot, selectSlotCandidate, selectUnifiedBundle, togglePreviewOrchestrator,
  type AdvisorSlotKey, type OneLineOrchestratorSession, type OneLineScenarioId,
  type ResolvedOrchestratorView, type SlotCandidateIndex, type UnifiedCoherenceGrade,
} from "./oneline-orchestrator-engine";

import { assertChainDialogue } from "./chain-input-contract";
import { useChainClipboard, useChainNotification } from "./use-chain-notification";
import { ChainOperationStatus } from "./ChainOperationStatus";

export interface StudioOneLineOrchestratorPanelProps {
  readonly initialDialogue?: string;
  readonly initialScenarioId?: OneLineScenarioId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onApplyBundle?: (activeView: ResolvedOrchestratorView, session: OneLineOrchestratorSession) => void;
  readonly onExportJson?: (json: string, session: OneLineOrchestratorSession) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

const SVG_INK = formatOklch({ l: 0.16, c: 0.01, h: 240 });
const SVG_PAPER = formatOklch({ l: 0.97, c: 0.008, h: 92 });
const SVG_HUD_BG = formatOklch({ l: 0.15, c: 0.015, h: 240 }, 0.82);
const SVG_HUD_FG = formatOklch({ l: 0.96, c: 0.006, h: 92 });
const SVG_GAZE_TEAL = formatOklch({ l: 0.72, c: 0.14, h: 196 });
const SVG_THIRDS_AMBER = formatOklch({ l: 0.78, c: 0.16, h: 72 });
const SVG_SAFE_GREEN = formatOklch({ l: 0.72, c: 0.15, h: 155 });
const SVG_FACE_GUARD = formatOklch({ l: 0.64, c: 0.16, h: 28 });

const SFX_INK_OKLCH: Readonly<Record<SfxAccentStyle, string>> = {
  impact: formatOklch({ l: 0.56, c: 0.2, h: 26 }),
  pulse: formatOklch({ l: 0.6, c: 0.17, h: 16 }),
  whisper: formatOklch({ l: 0.68, c: 0.12, h: 218 }),
  tension: formatOklch({ l: 0.76, c: 0.14, h: 68 }),
};
const SLOT_CANDIDATE_INDICES: readonly [SlotCandidateIndex, SlotCandidateIndex, SlotCandidateIndex] = [0, 1, 2];

function gradeBadgeClass(grade: UnifiedCoherenceGrade | ReadabilityGrade): string {
  if (grade === "warning") return "border-bad bg-bad-soft text-bad";
  return grade === "caution" ? "border-warn bg-warning-soft text-warn" : "border-good bg-good-soft text-good";
}

function continuityBadgeClass(status: ContinuityStatus): string {
  if (status === "axis-crossed") return "border-bad bg-bad-soft text-bad";
  return status === "warning" ? "border-warn bg-warning-soft text-warn" : "border-good bg-good-soft text-good";
}

function wrapSvgLines(text: string, maxChars: number): readonly string[] {
  const clean = text.trim() || "…";
  if (clean.length <= maxChars) return [clean];
  const lines: string[] = [];
  let cursor = 0;
  while (cursor < clean.length && lines.length < 3) {
    const rest = clean.slice(cursor);
    if (rest.length <= maxChars || lines.length === 2) {
      lines.push(rest.length > maxChars + 2 ? `${rest.slice(0, maxChars)}…` : rest);
      break;
    }
    const spaceIdx = rest.slice(0, maxChars + 1).lastIndexOf(" ");
    const cut = spaceIdx >= Math.floor(maxChars * 0.5) ? spaceIdx : maxChars;
    lines.push(rest.slice(0, cut).trim());
    cursor += cut;
    while (clean[cursor] === " ") cursor += 1;
  }
  return lines;
}

function renderVisemeMouth(viseme: VisemeId, cx: number, mouthY: number, smileBias: number): ReactElement {
  if (viseme === "aa") return <ellipse cx={cx} cy={mouthY} rx={16} ry={12} fill={SVG_INK} fillOpacity={0.28} stroke={SVG_INK} strokeWidth={3} />;
  if (viseme === "ih") return <rect x={cx - 19} y={mouthY - 5} width={38} height={10} rx={5} fill={SVG_PAPER} stroke={SVG_INK} strokeWidth={2.8} />;
  if (viseme === "ou") return <circle cx={cx} cy={mouthY} r={8.5} fill={SVG_INK} fillOpacity={0.28} stroke={SVG_INK} strokeWidth={3} />;
  if (viseme === "ee") return <ellipse cx={cx} cy={mouthY} rx={18} ry={7.5} fill={SVG_PAPER} stroke={SVG_INK} strokeWidth={2.8} />;
  if (viseme === "oh") return <ellipse cx={cx} cy={mouthY} rx={11} ry={13} fill={SVG_INK} fillOpacity={0.28} stroke={SVG_INK} strokeWidth={3} />;
  const ctrlY = Math.round(mouthY + smileBias * 10);
  return <path d={`M ${cx - 17} ${mouthY} Q ${cx} ${ctrlY} ${cx + 17} ${mouthY}`} fill="none" stroke={SVG_INK} strokeWidth={3.2} strokeLinecap="round" />;
}

function UnifiedCutDirectorSvg(props: {
  readonly view: ResolvedOrchestratorView; readonly protectedZones: readonly ProtectedZone[];
  readonly sessionStatus: OneLineOrchestratorSession["status"]; readonly isEn: boolean;
}): ReactElement {
  const { view, protectedZones, sessionStatus, isEn } = props;
  const uid = useId();
  const skyGradId = `${uid}-sky`;
  const beamGradId = `${uid}-beam`;
  const arrowId = `${uid}-gaze-arrow`;

  const expr = view.expression.proposal;
  const light = view.lighting.proposal;
  const cam = view.camera.proposal;
  const bal = view.balloon.proposal;
  const rig = light.rig;

  const topBg = formatOklch({ l: Math.min(0.88, rig.atmosphere.backdropOklch.l + 0.1), c: rig.atmosphere.backdropOklch.c, h: rig.atmosphere.backdropOklch.h });
  const bottomBg = formatOklch({ l: Math.max(0.12, rig.atmosphere.backdropOklch.l - 0.12), c: rig.atmosphere.backdropOklch.c, h: rig.atmosphere.backdropOklch.h });
  const keyCss = formatOklch(rig.keyLight.colorOklch);
  const keyBeamCss = formatOklch(rig.keyLight.colorOklch, 0.24 + rig.atmosphere.volumetricStrength * 0.22);
  const keyClearCss = formatOklch(rig.keyLight.colorOklch, 0);
  const fillCss = formatOklch(rig.fillLight.colorOklch);
  const fogCss = formatOklch(rig.fillLight.colorOklch, rig.atmosphere.fogDensity * 0.34);
  const rimCss = formatOklch(rig.rimLight.pigmentOklch);
  const litFace = formatOklch(rig.keyLight.colorOklch, 0.86);
  const shadowFace = formatOklch({ l: Math.max(0.22, 0.5 - rig.atmosphere.shadowContrastRatio * 0.03), c: 0.03, h: rig.atmosphere.backdropOklch.h });

  const keyFromLeft = rig.keyLight.azimuthDeg <= 0;
  const keyNodeX = keyFromLeft ? 96 : 704;
  const fillNodeX = keyFromLeft ? 704 : 96;
  const rimNodeX = rig.rimLight.angleDeg >= 0 ? 672 : 128;

  const primaryFace = protectedZones.find((z) => z.kind === "face");
  const faceCx = primaryFace ? Math.round(primaryFace.box.x + primaryFace.box.width / 2) : 400;
  const faceCy = primaryFace ? Math.round(primaryFace.box.y + primaryFace.box.height / 2) : 560;
  const faceRx = primaryFace ? Math.round(primaryFace.box.width * 0.42) : 92;
  const faceRy = primaryFace ? Math.round(primaryFace.box.height * 0.44) : 108;

  const browY = Math.round(faceCy - faceRy * 0.28 - expr.eyebrowLift * 10);
  const browDy = Math.round(Math.sin((expr.eyebrowTiltDeg * Math.PI) / 180) * 14);
  const eyeY = Math.round(faceCy - faceRy * 0.08);
  const eyeRy = Math.max(4, Math.round(10 - expr.blendShapes.blink * 6 + expr.blendShapes.surprised * 3));
  const pupilDx = Math.round((expr.gazeYaw / 24) * 7);
  const pupilDy = Math.round((-expr.gazePitch / 18) * 5);
  const mouthY = Math.round(faceCy + faceRy * 0.42);
  const smileBias = expr.blendShapes.happy - expr.blendShapes.sad - expr.blendShapes.angry * 0.6;

  const thirdsX = Math.round(cam.thirdsIntersection.x * DEFAULT_CUT_WIDTH);
  const thirdsY = Math.round(cam.thirdsIntersection.y * DEFAULT_CUT_HEIGHT);
  const gazeX1 = Math.round(cam.gazeVector.fromX * DEFAULT_CUT_WIDTH);
  const gazeY1 = Math.round(cam.gazeVector.fromY * DEFAULT_CUT_HEIGHT);
  const gazeX2 = Math.round(cam.gazeVector.toX * DEFAULT_CUT_WIDTH);
  const gazeY2 = Math.round(cam.gazeVector.toY * DEFAULT_CUT_HEIGHT);

  const emoMeta = getEmotionMeta(expr.emotion);
  const poseMeta = UPPER_BODY_POSE_PRESETS[expr.upperBodyPoseId];
  const handMeta = HAND_GESTURE_PRESETS[expr.handGestureId];
  const bubbleStrokeWidth = light.readabilityAudit.bubbleZoneLuminance >= 0.74 ? 3.2 : 2.4;
  const badgeX = Math.max(24, faceCx - 140);
  const badgeY = Math.min(1040, faceCy + faceRy + 26);

  return (
    <svg
      data-testid="orchestrator-unified-svg"
      data-session-status={sessionStatus}
      data-active-recipe={`${view.activeIndices.expression + 1}-${view.activeIndices.lighting + 1}-${view.activeIndices.camera + 1}-${view.activeIndices.balloon + 1}`}
      data-key-kelvin={rig.keyLight.kelvin}
      data-camera-framing={cam.framingType}
      data-viseme={expr.viseme}
      data-face-occlusion={bal.metrics.faceOcclusionPct}
      data-violet-free={view.coherence.violetSlopFree ? "true" : "false"}
      viewBox={`0 0 ${DEFAULT_CUT_WIDTH} ${DEFAULT_CUT_HEIGHT}`}
      className="mx-auto block aspect-[2/3] w-full max-w-[360px] rounded-xl border border-line bg-canvas text-fg shadow-sm"
      role="img"
      aria-label={isEn ? "Unified 4-advisor cut preview combining lighting, 180-degree framing, expression, and speech balloons" : "표정·조명·카메라 3분할·말풍선·SFX 4대 연출 통합 컷 프리뷰"}
    >
      <defs>
        <linearGradient id={skyGradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={topBg} />
          <stop offset="100%" stopColor={bottomBg} />
        </linearGradient>
        <linearGradient id={beamGradId} x1={keyFromLeft ? "0%" : "100%"} y1="0%" x2={keyFromLeft ? "88%" : "12%"} y2="100%">
          <stop offset="0%" stopColor={keyBeamCss} />
          <stop offset="100%" stopColor={keyClearCss} />
        </linearGradient>
        <marker id={arrowId} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M 0 0 L 8 4 L 0 8 Z" fill={SVG_GAZE_TEAL} />
        </marker>
      </defs>

      {/* Layer 1: 48A 조명 배경 · 광선 · 안개 · 3점 광원 방향 표시 */}
      <rect x={0} y={0} width={DEFAULT_CUT_WIDTH} height={DEFAULT_CUT_HEIGHT} fill={`url(#${skyGradId})`} />
      <polygon points={keyFromLeft ? "0,0 440,0 740,1200 120,1200" : "360,0 800,0 680,1200 60,1200"} fill={`url(#${beamGradId})`} />
      <rect x={0} y={780} width={DEFAULT_CUT_WIDTH} height={420} fill={fogCss} />
      <g data-testid="orchestrator-svg-lighting-layer" aria-hidden="true">
        <line x1={keyNodeX} y1={96} x2={faceCx} y2={faceCy} stroke={keyCss} strokeWidth={3} strokeDasharray="10 8" strokeOpacity={0.7} />
        <line x1={fillNodeX} y1={140} x2={faceCx} y2={faceCy} stroke={fillCss} strokeWidth={2.2} strokeDasharray="7 7" strokeOpacity={0.55} />
        <line x1={rimNodeX} y1={faceCy - 140} x2={faceCx} y2={faceCy} stroke={rimCss} strokeWidth={3} strokeDasharray="6 5" strokeOpacity={0.8} />
        <circle cx={keyNodeX} cy={96} r={24} fill={keyCss} stroke={SVG_INK} strokeWidth={2.5} />
        <text x={keyNodeX} y={102} textAnchor="middle" fill={SVG_INK} fontSize={18} fontWeight={800} fontFamily="monospace">K</text>
        <circle cx={fillNodeX} cy={140} r={19} fill={fillCss} stroke={SVG_INK} strokeWidth={2.2} />
        <text x={fillNodeX} y={146} textAnchor="middle" fill={SVG_INK} fontSize={16} fontWeight={800} fontFamily="monospace">F</text>
        <circle cx={rimNodeX} cy={faceCy - 140} r={20} fill={rimCss} stroke={SVG_PAPER} strokeWidth={2.4} />
        <text x={rimNodeX} y={faceCy - 134} textAnchor="middle" fill={SVG_PAPER} fontSize={16} fontWeight={800} fontFamily="monospace">R</text>
      </g>

      {/* Layer 2: 48B 카메라 3분할 프레임 · 더치 틸트 수평선 · 시선 벡터 */}
      <g data-testid="orchestrator-svg-camera-layer" aria-hidden="true">
        <line x1={267} y1={0} x2={267} y2={DEFAULT_CUT_HEIGHT} stroke={SVG_HUD_FG} strokeOpacity={0.28} strokeDasharray="8 8" strokeWidth={2} />
        <line x1={533} y1={0} x2={533} y2={DEFAULT_CUT_HEIGHT} stroke={SVG_HUD_FG} strokeOpacity={0.28} strokeDasharray="8 8" strokeWidth={2} />
        <line x1={0} y1={400} x2={DEFAULT_CUT_WIDTH} y2={400} stroke={SVG_HUD_FG} strokeOpacity={0.28} strokeDasharray="8 8" strokeWidth={2} />
        <line x1={0} y1={800} x2={DEFAULT_CUT_WIDTH} y2={800} stroke={SVG_HUD_FG} strokeOpacity={0.28} strokeDasharray="8 8" strokeWidth={2} />
        {cam.cameraRig.rollDeg !== 0 ? (
          <line x1={40} y1={600} x2={760} y2={600} transform={`rotate(${cam.cameraRig.rollDeg} 400 600)`} stroke={SVG_THIRDS_AMBER} strokeOpacity={0.55} strokeDasharray="14 8" strokeWidth={2.4} />
        ) : null}
        <circle cx={thirdsX} cy={thirdsY} r={16} fill="none" stroke={SVG_THIRDS_AMBER} strokeWidth={3} />
        <circle cx={thirdsX} cy={thirdsY} r={4.5} fill={SVG_THIRDS_AMBER} />
        <line x1={gazeX1} y1={gazeY1} x2={gazeX2} y2={gazeY2} stroke={SVG_GAZE_TEAL} strokeWidth={4} strokeDasharray="10 6" markerEnd={`url(#${arrowId})`} />
      </g>

      {/* Layer 3: 47B 인물 실루엣 · 표정(눈썹·눈·비젬) · 림라이트 · 얼굴 보호 경계 */}
      <g data-testid="orchestrator-svg-character-layer">
        <path
          d={`M ${faceCx - faceRx - 70} ${faceCy + faceRy + 260} Q ${faceCx} ${faceCy + faceRy - 14} ${faceCx + faceRx + 70} ${faceCy + faceRy + 260} Z`}
          fill={shadowFace} stroke={rimCss} strokeWidth={Math.max(4, rig.rimLight.intensity * 2.8)}
        />
        <ellipse cx={faceCx} cy={faceCy} rx={faceRx} ry={faceRy} fill={shadowFace} />
        <path
          d={keyFromLeft
            ? `M ${faceCx} ${faceCy - faceRy} A ${faceRx} ${faceRy} 0 0 0 ${faceCx} ${faceCy + faceRy} Z`
            : `M ${faceCx} ${faceCy - faceRy} A ${faceRx} ${faceRy} 0 0 1 ${faceCx} ${faceCy + faceRy} Z`}
          fill={litFace}
        />
        <path
          d={keyFromLeft
            ? `M ${faceCx + 12} ${faceCy - faceRy + 4} A ${faceRx} ${faceRy} 0 0 1 ${faceCx + faceRx - 4} ${faceCy + 28}`
            : `M ${faceCx - 12} ${faceCy - faceRy + 4} A ${faceRx} ${faceRy} 0 0 0 ${faceCx - faceRx + 4} ${faceCy + 28}`}
          fill="none" stroke={rimCss} strokeWidth={Math.max(5, rig.rimLight.intensity * 3.4)} strokeLinecap="round"
        />
        <line x1={faceCx - 44} y1={browY - browDy} x2={faceCx - 12} y2={browY + browDy} stroke={SVG_INK} strokeWidth={5} strokeLinecap="round" />
        <line x1={faceCx + 12} y1={browY + browDy} x2={faceCx + 44} y2={browY - browDy} stroke={SVG_INK} strokeWidth={5} strokeLinecap="round" />
        <ellipse cx={faceCx - 28} cy={eyeY} rx={12} ry={eyeRy} fill={SVG_PAPER} stroke={SVG_INK} strokeWidth={2.6} />
        <ellipse cx={faceCx + 28} cy={eyeY} rx={12} ry={eyeRy} fill={SVG_PAPER} stroke={SVG_INK} strokeWidth={2.6} />
        <circle cx={faceCx - 28 + pupilDx} cy={eyeY + pupilDy} r={Math.min(5, eyeRy)} fill={SVG_INK} />
        <circle cx={faceCx + 28 + pupilDx} cy={eyeY + pupilDy} r={Math.min(5, eyeRy)} fill={SVG_INK} />
        {renderVisemeMouth(expr.viseme, faceCx, mouthY, smileBias)}
        {primaryFace ? (
          <rect x={primaryFace.box.x} y={primaryFace.box.y} width={primaryFace.box.width} height={primaryFace.box.height} rx={14} fill="none" stroke={SVG_FACE_GUARD} strokeOpacity={0.55} strokeDasharray="10 7" strokeWidth={2.5} />
        ) : null}
        <rect x={badgeX} y={badgeY} width={280} height={54} rx={12} fill={SVG_HUD_BG} stroke={rimCss} strokeWidth={2} />
        <text x={badgeX + 140} y={badgeY + 23} textAnchor="middle" fill={SVG_HUD_FG} fontSize={15} fontWeight={700}>
          {`${isEn ? emoMeta.labelEn : emoMeta.labelKo} · ${expr.viseme.toUpperCase()}`}
        </text>
        <text x={badgeX + 140} y={badgeY + 43} textAnchor="middle" fill={SVG_THIRDS_AMBER} fontSize={13} fontWeight={600}>
          {`${isEn ? poseMeta.labelEn : poseMeta.labelKo} / ${isEn ? handMeta.labelEn : handMeta.labelKo}`.slice(0, 26)}
        </text>
      </g>

      {/* Layer 4: 48C 말풍선 꼬리 + 대사 + 회전 한글 SFX */}
      <g data-testid="orchestrator-svg-balloon-layer">
        {bal.balloons.map((b) => {
          const lines = wrapSvgLines(b.text, Math.max(8, Math.floor((b.box.width - 36) / 16)));
          const bx = Math.round(b.box.x + b.box.width / 2);
          const startY = Math.round(b.box.y + b.box.height / 2 - ((lines.length - 1) * 22) / 2 + 6);
          return (
            <g key={`${b.dialogueId}-${b.order}`} data-testid={`orchestrator-svg-balloon-${b.order}`}>
              {b.tailStyle === "thought-dots" ? (
                <g>
                  <circle cx={Math.round((b.tailOriginX * 2 + b.tailTipX) / 3)} cy={Math.round((b.tailOriginY * 2 + b.tailTipY) / 3)} r={8.5} fill={SVG_PAPER} stroke={SVG_INK} strokeWidth={2.4} />
                  <circle cx={Math.round((b.tailOriginX + b.tailTipX * 2) / 3)} cy={Math.round((b.tailOriginY + b.tailTipY * 2) / 3)} r={5.2} fill={SVG_PAPER} stroke={SVG_INK} strokeWidth={2.2} />
                </g>
              ) : (
                <polygon points={`${b.tailBaseLeftX},${b.tailBaseLeftY} ${b.tailTipX},${b.tailTipY} ${b.tailBaseRightX},${b.tailBaseRightY}`} fill={SVG_PAPER} stroke={SVG_INK} strokeWidth={bubbleStrokeWidth} strokeLinejoin="round" />
              )}
              <path d={buildBalloonOutlinePath(b.box, b.style)} fill={SVG_PAPER} stroke={SVG_INK} strokeWidth={b.style === "shout-burst" ? 3.4 : bubbleStrokeWidth} strokeDasharray={b.style === "whisper-dashed" ? "8 6" : undefined} />
              <text x={bx} y={startY} textAnchor="middle" fill={SVG_INK} fontSize={17} fontWeight={700}>
                {lines.map((line, idx) => (
                  <tspan key={`${b.order}-l-${idx}`} x={bx} dy={idx === 0 ? 0 : 22}>{line}</tspan>
                ))}
              </text>
            </g>
          );
        })}
        <g data-testid="orchestrator-svg-sfx" transform={`translate(${bal.sfx.centerX}, ${bal.sfx.centerY}) rotate(${bal.sfx.rotationDeg})`}>
          <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fill={SFX_INK_OKLCH[bal.sfx.accentStyle]} stroke={SVG_PAPER} strokeWidth={8} paintOrder="stroke" fontSize={bal.sfx.fontSize} fontWeight={900}>
            {bal.sfx.text}
          </text>
        </g>
      </g>

      {/* Layer 5: 상·하단 컷 디렉팅 HUD */}
      <g>
        <rect x={22} y={18} width={450} height={36} rx={10} fill={SVG_HUD_BG} />
        <text x={36} y={41} fill={SVG_HUD_FG} fontSize={15} fontWeight={700} fontFamily="monospace">
          {`${cam.focalLengthMm}mm · ${isEn ? cam.titleEn : cam.titleKo} · 180° ${cam.continuityAudit.status.toUpperCase()}`}
        </text>
        <rect x={22} y={1132} width={756} height={48} rx={12} fill={SVG_HUD_BG} />
        <text x={38} y={1161} fill={SVG_HUD_FG} fontSize={15} fontWeight={700}>{isEn ? view.recipeLabelEn : view.recipeLabelKo}</text>
        <text x={762} y={1161} textAnchor="end" fill={SVG_SAFE_GREEN} fontSize={15} fontWeight={700} fontFamily="monospace">
          {`OCC ${bal.metrics.faceOcclusionPct}% · ${rig.keyLight.kelvin}K`}
        </text>
      </g>
    </svg>
  );
}

function SlotIcon(props: { readonly slot: AdvisorSlotKey }): ReactElement {
  if (props.slot === "expression") return <Smile className="h-4 w-4 text-accent" aria-hidden="true" />;
  if (props.slot === "lighting") return <Sun className="h-4 w-4 text-accent" aria-hidden="true" />;
  if (props.slot === "camera") return <Camera className="h-4 w-4 text-accent" aria-hidden="true" />;
  return <MessageSquareText className="h-4 w-4 text-accent" aria-hidden="true" />;
}

/** 대사 한 줄 → 4대 어시스턴트 원스톱 연출 체인 스튜디오 패널. */
export function StudioOneLineOrchestratorPanel(props: StudioOneLineOrchestratorPanelProps): ReactElement {
  const { onApplyBundle, onExportJson } = props;
  const isEn = props.locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);
  const initialScenario = getOneLineScenarioPreset(props.initialScenarioId);
  const initialDialogue = props.initialDialogue ?? (isEn ? initialScenario.defaultDialogueEn : initialScenario.defaultDialogueKo);

  const uid = useId();
  const [scenarioId, setScenarioId] = useState<OneLineScenarioId>(initialScenario.id);
  const [dialogue, setDialogue] = useState<string>(initialDialogue);

  const orchestration = useMemo(() => orchestrateOneLineSceneBundles({ dialogue, scenarioId }), [dialogue, scenarioId]);
  const [session, setSession] = useState<OneLineOrchestratorSession>(() =>
    createOrchestratorSession(orchestration.unifiedBundles[0].slotIndices, orchestration.unifiedBundles),
  );
  const [exportTab, setExportTab] = useState<"none" | "json" | "markdown">("none");
  const [statusNotice, setStatusNotice] = useState<string>("");

  const applyNotification = useChainNotification<{ view: ResolvedOrchestratorView; session: OneLineOrchestratorSession }>(
    onApplyBundle ? ({ view, session: next }) => onApplyBundle(view, next) : undefined,
  );
  const exportNotification = useChainNotification<{ text: string; session: OneLineOrchestratorSession }>(
    onExportJson ? ({ text, session: next }) => onExportJson(text, next) : undefined,
  );
  const copyOperation = useChainClipboard();
  const isPending = (): boolean => applyNotification.isPending() || exportNotification.isPending() || copyOperation.isPending();
  const pending = applyNotification.status === "pending" || exportNotification.status === "pending" || copyOperation.status === "pending";

  const activeView = useMemo(() => resolveActiveOrchestratorView(orchestration, session), [orchestration, session]);
  const jsonText = useMemo(() => exportUnifiedSceneBundleJson(orchestration, session), [orchestration, session]);
  const markdownText = useMemo(() => exportUnifiedSceneMarkdown(orchestration, session, isEn ? "en" : "ko"), [orchestration, session, isEn]);

  const handleDialogueChange = (next: string): void => {
    if (isPending()) return;
    try {
      assertChainDialogue(next);
      setDialogue(next);
      setStatusNotice("");
    } catch {
      setStatusNotice(pick("입력 한도를 넘었습니다. 4096자·대사 두 구간 이내로 입력해 주세요. 기존 원문은 유지했습니다.", "Input exceeds the limit. Use up to 4096 characters and two dialogue segments. The previous text was preserved."));
    }
  };

  const handleSelectScenario = (nextId: OneLineScenarioId): void => {
    if (isPending()) return;
    const preset = getOneLineScenarioPreset(nextId);
    const nextDialogue = isEn ? preset.defaultDialogueEn : preset.defaultDialogueKo;
    const nextOrch = orchestrateOneLineSceneBundles({ dialogue: nextDialogue, scenarioId: nextId });
    setScenarioId(nextId);
    setDialogue(nextDialogue);
    setSession(createOrchestratorSession(nextOrch.unifiedBundles[0].slotIndices, nextOrch.unifiedBundles));
    setStatusNotice(pick(`'${preset.labelKo}' 시나리오를 불러와 4대 어시스턴트 통합 3안을 계산했습니다.`, `Loaded '${preset.labelEn}' and generated 3 unified sets.`));
  };

  const handleSelectBundle = (bundleIdx: SlotCandidateIndex): void => {
    if (isPending()) return;
    const target = orchestration.unifiedBundles[bundleIdx];
    setSession(selectUnifiedBundle(session, target));
    setStatusNotice(pick(`${target.titleKo} 미리보기로 전환했습니다. 원하는 항목만 바꿔 조합할 수 있습니다.`, `Previewing ${target.titleEn}. Adjust any slot to mix and match.`));
  };

  const handleMixSlot = (slot: AdvisorSlotKey, index: SlotCandidateIndex): void => {
    if (isPending()) return;
    setSession(selectSlotCandidate(session, slot, index, orchestration.unifiedBundles));
    const meta = ADVISOR_SLOT_META[slot];
    setStatusNotice(pick(`${meta.shortKo} 슬롯을 ${index + 1}안으로 미리보기 교체했습니다.`, `Switched ${meta.shortEn} slot preview to #${index + 1}.`));
  };

  const handleApplyAll = (): void => {
    if (isPending()) return;
    const next = applyUnifiedSelection(session, orchestration);
    const nextView = resolveActiveOrchestratorView(orchestration, next);
    setSession(next);
    applyNotification.notify({ view: nextView, session: next });
    setStatusNotice(pick(`메모리 예제에 4대 연출을 반영했습니다 (${nextView.recipeLabelKo}). 외부 알림 상태는 별도로 확인해 주세요.`, `Updated all 4 in-memory example slots (${nextView.recipeLabelEn}). Check the separate receiver status.`));
  };

  const handleApplySlot = (slot: AdvisorSlotKey): void => {
    if (isPending()) return;
    const next = applySingleSlot(session, slot, orchestration);
    const nextView = resolveActiveOrchestratorView(orchestration, next);
    setSession(next);
    applyNotification.notify({ view: nextView, session: next });
    const meta = ADVISOR_SLOT_META[slot];
    setStatusNotice(pick(`${meta.shortKo} ${next.draftSelection[slot] + 1}안을 메모리 예제에 반영했습니다 (${next.appliedSlotCount}/4).`, `Updated in-memory ${meta.shortEn} #${next.draftSelection[slot] + 1} (${next.appliedSlotCount}/4).`));
  };

  const handleRevertSlot = (slot: AdvisorSlotKey): void => {
    if (isPending()) return;
    const next = revertOrchestratorSlot(session, slot);
    setSession(next);
    const meta = ADVISOR_SLOT_META[slot];
    setStatusNotice(pick(`${meta.shortKo} 메모리 예제 기록만 되돌렸습니다 (남은 적용 ${next.appliedSlotCount}/4).`, `Reverted in-memory ${meta.shortEn} slot (${next.appliedSlotCount}/4 remaining).`));
  };

  const handleRevertAll = (): void => {
    if (isPending()) return;
    setSession(revertAllOrchestratorSlots(session));
    setStatusNotice(pick("메모리 예제의 적용 기록을 모두 되돌렸습니다. 실제 장면 원복은 수행하지 않습니다.", "Cleared all in-memory example application records. No actual scene rollback was performed."));
  };

  const handleCopyExport = (kind: "json" | "markdown"): void => {
    if (isPending()) return;
    const payload = kind === "json" ? jsonText : markdownText;
    setExportTab(kind);
    if (kind === "json") exportNotification.notify({ text: payload, session });
    copyOperation.notify(payload);
    setStatusNotice(kind === "json" ? pick("통합 컷 연출 JSON 패키지를 열었습니다.", "Opened unified scene JSON package.") : pick("한글 연출 큐시트 Markdown을 열었습니다.", "Opened director cue sheet Markdown."));
  };

  function getSessionStatusText(): string {
    switch (session.status) {
      case "applied": return pick("메모리 예제 적용 (4/4)", "In-memory Applied (4/4)");
      case "partial-applied": return pick(`메모리 예제 부분 적용 (${session.appliedSlotCount}/4)`, `In-memory Partial Applied (${session.appliedSlotCount}/4)`);
      case "previewing": return pick("미리보기 (미적용)", "Previewing (Unapplied)");
      case "reverted": return pick("메모리 예제 원본 되돌림", "In-memory Reverted");
      default: return pick("대기 · 메모리 예제", "Idle · In-memory Example");
    }
  }

  const getSlotOptionSummary = (slot: AdvisorSlotKey, idx: SlotCandidateIndex): { readonly title: string; readonly detail: string } => {
    if (slot === "expression") {
      const p = orchestration.expressionBundle.proposals[idx];
      return { title: isEn ? p.titleEn : p.titleKo, detail: `${isEn ? getEmotionMeta(p.emotion).labelEn : getEmotionMeta(p.emotion).labelKo} · ${p.viseme}` };
    }
    if (slot === "lighting") {
      const p = orchestration.lightingBundle.proposals[idx];
      return { title: isEn ? p.titleEn : p.titleKo, detail: `${p.rig.keyLight.kelvin}K · ${isEn ? p.rig.rimLight.pigmentNameEn : p.rig.rimLight.pigmentNameKo}` };
    }
    if (slot === "camera") {
      const p = orchestration.cameraProposals[idx];
      return { title: isEn ? p.titleEn : p.titleKo, detail: `${p.focalLengthMm}mm · ${p.cameraRig.yawDeg}°` };
    }
    const p = orchestration.balloonBundle.proposals[idx];
    return { title: isEn ? p.titleEn : p.titleKo, detail: `SFX "${p.sfx.text}" · ${pick("가림", "Occ")} ${p.metrics.faceOcclusionPct}%` };
  };

  return (
    <section
      data-testid="studio-oneline-orchestrator-panel"
      className={`rounded-2xl border border-line bg-panel p-4 text-fg shadow-sm [word-break:keep-all] ${props.className ?? ""}`}
      aria-label={pick("대사 한 줄 4대 어시스턴트 원스톱 연출 체인", "One-Line Multi-Advisor Director Chain")}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Layers className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-bold tracking-tight text-fg">{pick("대사 한 줄 원스톱 연출 체인", "One-Line Multi-Advisor Orchestrator")}</h2>
            <span data-testid="orchestrator-approval-badge" className="inline-flex items-center gap-1 rounded-full border border-good bg-good-soft px-2.5 py-0.5 text-[11px] font-semibold text-good">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {pick("작가 승인 후 적용", "Author Approval Required")}
            </span>
          </div>
          <p className="text-xs text-fg-2">
            {pick("대사 한 줄과 상황만 고르면 표정(47B)·조명(48A)·카메라(48B)·말풍선(48C) 4대 연출을 통합 3안으로 즉시 조합하고 항목별로 믹스&매치합니다.", "Enter one line of dialogue to chain Expression (47B), Lighting (48A), Camera (48B), and Balloon/SFX (48C) into 3 curated sets with independent mix-and-match.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="orchestrator-session-status-badge"
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums ${
              session.status === "applied" ? "border-good bg-good-soft text-good"
                : session.status === "partial-applied" || session.status === "previewing" ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2"
            }`}
          >
            {getSessionStatusText()}
          </span>
          <span data-testid="orchestrator-coherence-badge" className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums ${gradeBadgeClass(activeView.coherence.grade)}`}>
            {pick("정합성", "Coherence")} {activeView.coherence.overallScore}
          </span>
        </div>
      </header>

      <p data-testid="orchestrator-example-notice" className="mt-3 text-xs text-fg-2">{pick("메모리 예제: 네 엔진의 계산 결과를 조합합니다. 적용·되돌리기는 이 화면의 기록만 바꾸며 실제 장면·권한·파일·서버 저장은 확인하지 않습니다. 외부 콜백은 선택적 결과 알림입니다.", "In-memory example combining four calculation engines. Apply and revert affect this panel only; actual scene changes, permissions, file and server storage are not verified. Optional callbacks notify a result.")}</p>
      <fieldset disabled={pending} className="min-w-0 border-0 p-0">
      <legend className="sr-only">{pick("연출 계산 예제 조작", "Director calculation example controls")}</legend>
      <div className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-fg-2">{pick("1. 상황 프리셋 5종", "1. Quick Scene Presets")}</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label={pick("5대 상황 프리셋", "5 Scene Presets")}>
            {ONE_LINE_SCENARIO_PRESETS.map((preset) => (
              <button
                key={preset.id} type="button" data-testid={`orchestrator-scenario-${preset.id}`}
                aria-pressed={preset.id === scenarioId} onClick={() => handleSelectScenario(preset.id)}
                className={preset.id === scenarioId ? BTN_ACTIVE : BTN_OUTLINE}
              >
                {isEn ? preset.labelEn : preset.labelKo}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${uid}-dialogue`} className="flex items-center justify-between text-xs font-semibold text-fg-2">
            <span>{pick("2. 대사 한 줄 입력 (4대 엔진 실시간 연동)", "2. One-Line Dialogue Input")}</span>
            <span className="font-mono text-[11px] text-fg-3 tabular-nums">{dialogue.trim().length}{pick("자", " chars")}</span>
          </label>
          <input
            id={`${uid}-dialogue`} data-testid="orchestrator-dialogue-input" type="text" value={dialogue}
            onChange={(e) => handleDialogueChange(e.target.value)}
            placeholder={pick("예: 빗소리 때문에 안 들릴지도 모르지만… 사실 오래전부터 좋아했어.", "Enter a single line of dialogue...")}
            className={`min-h-11 w-full rounded-xl border border-line bg-card px-3.5 py-2 text-sm text-fg placeholder:text-fg-3 ${FOCUS_RING}`}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-fg">{pick("3. 원스톱 통합 연출 세트 3안", "3. Curated Unified Director Sets")}</h3>
              <span data-testid="orchestrator-recipe-summary" className="text-[11px] font-semibold text-fg-2 tabular-nums">
                {activeView.isCustomMix
                  ? pick(`커스텀 믹스 · ${activeView.recipeLabelKo}`, `Custom Mix · ${activeView.recipeLabelEn}`)
                  : isEn ? activeView.recipeLabelEn : activeView.recipeLabelKo}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {orchestration.unifiedBundles.map((bundle, idx) => {
                const isSelected = activeView.matchedBundleId === bundle.id;
                return (
                  <button
                    key={bundle.id} type="button" data-testid={`orchestrator-bundle-btn-${bundle.rank}`}
                    aria-pressed={isSelected} onClick={() => handleSelectBundle(idx as SlotCandidateIndex)}
                    className={`flex min-h-11 cursor-pointer flex-col items-start justify-between gap-1.5 rounded-xl border p-3 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${
                      isSelected ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-1.5">
                      <span className="text-xs font-bold">{isEn ? bundle.titleEn : bundle.titleKo}</span>
                      <span className="rounded-md border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums">{bundle.coherence.overallScore}</span>
                    </div>
                    <p className="text-[11px] leading-snug text-fg-2">{isEn ? bundle.summaryEn : bundle.summaryKo}</p>
                    <span className="font-mono text-[10px] text-fg-3 tabular-nums">
                      {`${pick("표", "E")}${bundle.slotIndices.expression + 1} · ${pick("조", "L")}${bundle.slotIndices.lighting + 1} · ${pick("카", "C")}${bundle.slotIndices.camera + 1} · ${pick("말", "B")}${bundle.slotIndices.balloon + 1}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <h3 className="text-xs font-bold text-fg">{pick("4. 4대 슬롯 개별 믹스&매치 (독립 선택 · 항목별 적용/원복)", "4. Independent 4-Slot Mix & Match")}</h3>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {ADVISOR_SLOT_KEYS.map((slot) => {
                const meta = ADVISOR_SLOT_META[slot];
                const draftIdx = session.draftSelection[slot];
                const isSlotApplied = session.applied[slot] !== null;
                const appliedIdx = session.applied[slot]?.index ?? null;
                return (
                  <div key={slot} data-testid={`orchestrator-slot-card-${slot}`} className="space-y-2 rounded-xl border border-line bg-card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <SlotIcon slot={slot} />
                        <span className="text-xs font-bold text-fg">{isEn ? meta.labelEn : meta.labelKo}</span>
                        <span className="rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[10px] text-fg-3">{meta.sourceWave}</span>
                      </div>
                      <span data-testid={`orchestrator-slot-state-${slot}`} className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums ${isSlotApplied ? "border-good bg-good-soft text-good" : "border-line bg-panel text-fg-3"}`}>
                        {isSlotApplied ? pick(`${(appliedIdx ?? 0) + 1}안 적용`, `Applied #${(appliedIdx ?? 0) + 1}`) : pick(`${draftIdx + 1}안 대기`, `Draft #${draftIdx + 1}`)}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={isEn ? `${meta.labelEn} options` : `${meta.labelKo} 선택안`}>
                      {SLOT_CANDIDATE_INDICES.map((candIdx) => {
                        const selected = draftIdx === candIdx;
                        const summary = getSlotOptionSummary(slot, candIdx);
                        return (
                          <button
                            key={candIdx} type="button" data-testid={`orchestrator-mix-${slot}-${candIdx + 1}`}
                            aria-pressed={selected} onClick={() => handleMixSlot(slot, candIdx)}
                            className={`flex min-h-11 cursor-pointer flex-col items-start justify-center rounded-lg border px-2 py-1.5 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${
                              selected ? "border-accent bg-accent-soft text-accent" : "border-line bg-panel text-fg hover:border-line-strong hover:bg-raised"
                            }`}
                          >
                            <span className="text-[11px] font-bold tabular-nums">{pick(`${candIdx + 1}안`, `#${candIdx + 1}`)}</span>
                            <span className="line-clamp-1 text-[10px] text-fg-2">{summary.detail}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <span className="truncate text-[11px] text-fg-2">{getSlotOptionSummary(slot, draftIdx).title}</span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button type="button" data-testid={`orchestrator-slot-apply-${slot}`} onClick={() => handleApplySlot(slot)} className={BTN_OUTLINE}>
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />{pick("적용", "Apply")}
                        </button>
                        <button type="button" data-testid={`orchestrator-slot-revert-${slot}`} disabled={!isSlotApplied} onClick={() => handleRevertSlot(slot)} className={BTN_OUTLINE}>
                          <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />{pick("원복", "Revert")}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card p-3">
            <button type="button" data-testid="orchestrator-apply-all-btn" onClick={handleApplyAll} className={BTN_SOLID}>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />{pick("4대 연출 일괄 적용", "Batch Apply All 4")}
            </button>
            <button type="button" data-testid="orchestrator-preview-toggle-btn" aria-pressed={session.isPreviewing} onClick={() => setSession((prev) => togglePreviewOrchestrator(prev))} className={session.isPreviewing ? BTN_ACTIVE : BTN_OUTLINE}>
              <Eye className="h-4 w-4" aria-hidden="true" />{session.isPreviewing ? pick("미리보기 끄기", "Exit Preview") : pick("미리보기 켜기", "Preview Mix")}
            </button>
            <button type="button" data-testid="orchestrator-revert-all-btn" disabled={!session.canRevertAll} onClick={handleRevertAll} className={BTN_OUTLINE}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />{pick("전체 되돌리기", "Revert All")}
            </button>
            <button type="button" data-testid="orchestrator-export-json-btn" onClick={() => handleCopyExport("json")} className={BTN_OUTLINE}>
              <Code2 className="h-4 w-4" aria-hidden="true" />{pick("JSON 복사", "Copy JSON")}
            </button>
            <button type="button" data-testid="orchestrator-export-md-btn" onClick={() => handleCopyExport("markdown")} className={BTN_OUTLINE}>
              <FileText className="h-4 w-4" aria-hidden="true" />{pick("큐시트 MD 복사", "Copy Cue MD")}
            </button>
            {exportTab !== "none" ? (
              <button type="button" data-testid="orchestrator-close-export-btn" onClick={() => setExportTab("none")} className={BTN_OUTLINE}>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />{pick("미리보기 닫기", "Hide Export")}
              </button>
            ) : null}
          </div>

          <div data-testid="orchestrator-coherence-notes" className="space-y-1.5 rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-fg">
              {activeView.coherence.grade === "optimal"
                ? <CheckCircle2 className="h-4 w-4 text-good" aria-hidden="true" />
                : <AlertTriangle className="h-4 w-4 text-warn" aria-hidden="true" />}
              <span>{pick("4대 어시스턴트 교차 점검", "Cross-Advisor Coherence Check")}</span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums ${continuityBadgeClass(activeView.coherence.cameraContinuity.status)}`}>
                180° {activeView.coherence.cameraContinuity.status}
              </span>
              <span className="rounded-full border border-good bg-good-soft px-2 py-0.5 text-[10px] font-semibold text-good tabular-nums">
                {pick("얼굴 가림률", "Face Occ")} {activeView.coherence.balloonFaceOcclusionPct}%
              </span>
            </div>
            <ul className="space-y-1 text-[11px] leading-relaxed text-fg-2">
              {(isEn ? activeView.coherence.notesEn : activeView.coherence.notesKo).map((note, idx) => (
                <li key={idx}>• {note}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-2.5 lg:col-span-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-fg">{pick("통합 컷 연출 실시간 프리뷰", "Live Unified Cut Preview")}</h3>
            <span className="font-mono text-[11px] text-fg-3 tabular-nums">
              {`${activeView.lighting.proposal.rig.keyLight.kelvin}K · ${activeView.camera.proposal.focalLengthMm}mm`}
            </span>
          </div>
          <UnifiedCutDirectorSvg view={activeView} protectedZones={orchestration.protectedZones} sessionStatus={session.status} isEn={isEn} />
          {statusNotice ? (
            <p role="status" data-testid="orchestrator-status-notice" className="rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg-2">{statusNotice}</p>
          ) : null}
        </div>
      </div>

      </fieldset>
      <div className="mt-3 space-y-2">
        <ChainOperationStatus channel="apply" status={applyNotification.status} retry={applyNotification.retry} pending={pending} isEn={isEn} />
        <ChainOperationStatus channel="json" status={exportNotification.status} retry={exportNotification.retry} pending={pending} isEn={isEn} />
        <ChainOperationStatus channel="clipboard" status={copyOperation.status} retry={copyOperation.retry} pending={pending} isEn={isEn} />
      </div>
      {exportTab !== "none" ? (
        <div className="mt-4 rounded-xl border border-line bg-canvas p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-fg">
              {exportTab === "json" ? pick("통합 컷 연출 JSON 패키지", "Unified Scene Bundle JSON") : pick("한글 연출 큐시트 Markdown", "Director Cue Sheet Markdown")}
            </span>
            <span className="font-mono text-[11px] text-fg-3 tabular-nums">
              {(exportTab === "json" ? jsonText : markdownText).split(/\r?\n/u).length} lines
            </span>
          </div>
          <pre data-testid={exportTab === "json" ? "orchestrator-json-preview" : "orchestrator-markdown-preview"} className="max-h-64 overflow-auto rounded-lg border border-line bg-card p-3 font-mono text-[11px] leading-relaxed text-fg">
            {exportTab === "json" ? jsonText : markdownText}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
