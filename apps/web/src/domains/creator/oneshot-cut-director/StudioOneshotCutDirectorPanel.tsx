/**
 * Wave 58B — 대사 1줄 + 3획 구도 러프 → 원샷 컷 라이브 연출기 제어판.
 *
 * - 대사 1줄 직접 입력 + 4종 웹툰 대표 씬 + 5종 감정/장르 + 4종 3획 구도 러프 + 5개 비파괴 레이어 개별 ON/OFF 스위치
 * - 순수 시맨틱 SVG 9:16 세로 컷 라이브 연출 프리뷰(3획 가이드·WebGPU 역광·표정/비젬·얼굴 겹침 0% 말풍선/SFX·스크롤 여백)
 * - 모든 props 선택적(`= {}` 기본 props 금지), 원시 색/바이올렛(270~320°) 0%, `min-h-11`, `tabular-nums`, `[word-break:keep-all]`
 */

import {
  ArrowUpDown, Camera, CheckCircle2, Clapperboard, Code2, Compass, Copy,
  Eye, Hand, Layers, MessageSquare, RotateCcw, ShieldCheck, Smile, SunMedium,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  DEFAULT_ONESHOT_LAYERS, NEUTRAL_ROUGH_ONLY_LAYERS, ONESHOT_EMOTION_SPECS,
  ONESHOT_LAYER_SPECS, ONESHOT_SCENE_PRESETS, ROUGH_STROKE_PRESETS,
  composeOneshotCutPlan, exportOneshotCutPlanJson, formatOklch, getOneshotScenePreset,
  type HandFingerId, type OneshotCutInput, type OneshotCutPlan, type OneshotEmotionId,
  type OneshotLayerId, type OneshotLayerToggles, type OneshotScenePresetId, type Rect2D,
  type RoughStrokePresetId,
} from "./oneshot-cut-director-engine";

export interface StudioOneshotCutDirectorPanelProps {
  readonly initialPresetId?: OneshotScenePresetId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onPlanChange?: (plan: OneshotCutPlan) => void;
  readonly onExportJson?: (json: string, plan: OneshotCutPlan) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

const SVG_INK = formatOklch({ l: 0.2, c: 0.02, h: 234 });
const SVG_HUD_BG = formatOklch({ l: 0.19, c: 0.018, h: 228 }, 0.88);
const SVG_HUD_TEXT = formatOklch({ l: 0.97, c: 0.006, h: 86 });
const SVG_ROUGH_STROKE = formatOklch({ l: 0.56, c: 0.12, h: 204 }, 0.72);
const SVG_CAMERA_FRAME = formatOklch({ l: 0.68, c: 0.14, h: 66 }, 0.85);
const SVG_SAFE_BOX = formatOklch({ l: 0.66, c: 0.14, h: 158 }, 0.88);
const SVG_BLUSH = formatOklch({ l: 0.74, c: 0.14, h: 22 }, 0.55);
const SVG_SWEAT = formatOklch({ l: 0.78, c: 0.11, h: 204 }, 0.9);
const SVG_SKIN_LIGHT = formatOklch({ l: 0.93, c: 0.024, h: 64 });
const SVG_SKIN_SHADE = formatOklch({ l: 0.83, c: 0.036, h: 52 });
const SVG_GUTTER_TICK = formatOklch({ l: 0.62, c: 0.06, h: 72 }, 0.75);

const FINGER_META: readonly { readonly id: HandFingerId; readonly ko: string; readonly en: string }[] = [
  { id: "thumb", ko: "엄지", en: "Thumb" },
  { id: "index", ko: "검지", en: "Index" },
  { id: "middle", ko: "중지", en: "Middle" },
  { id: "ring", ko: "약지", en: "Ring" },
  { id: "pinky", ko: "소지", en: "Pinky" },
];

function buildBalloonPolygonPoints(box: Rect2D, shape: OneshotCutPlan["opticalBalloonSfx"]["balloonShape"]): string {
  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.5;
  const rx = box.width * 0.52;
  const ry = box.height * 0.54;
  const spikes = shape === "double-shock-star" ? 16 : 12;
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i += 1) {
    const angle = (i * Math.PI) / spikes;
    const mult = i % 2 === 0 ? 1.04 : 0.86;
    pts.push(`${Math.round((cx + Math.cos(angle) * rx * mult) * 10) / 10},${Math.round((cy + Math.sin(angle) * ry * mult) * 10) / 10}`);
  }
  return pts.join(" ");
}

function LayerIcon(props: { readonly id: OneshotLayerId }): ReactElement {
  switch (props.id) {
    case "camera3d":
      return <Camera className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
    case "webgpuRimLight":
      return <SunMedium className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
    case "charExpressionPose":
      return <Smile className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
    case "opticalBalloonSfx":
      return <MessageSquare className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
    case "scrollGutterRhythm":
      return <ArrowUpDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
}

function OneshotCutPreviewSvg(props: { readonly plan: OneshotCutPlan; readonly isEn: boolean; readonly svgUid: string }): ReactElement {
  const { plan, isEn, svgUid } = props;
  const { camera3d, webgpuRimLight, charExpressionPose, opticalBalloonSfx, scrollGutterRhythm } = plan;
  const { faceSafeBox, subjectBox } = camera3d;
  const gradBgId = `${svgUid}-bg`;
  const gradRimId = `${svgUid}-rim`;

  const faceCx = faceSafeBox.x + faceSafeBox.width * 0.5;
  const faceCy = faceSafeBox.y + faceSafeBox.height * 0.48;
  const headRx = faceSafeBox.width * 0.34;
  const headRy = faceSafeBox.height * 0.37;
  const eyeY = faceCy - headRy * 0.1;
  const eyeSpan = headRx * 0.46;
  const eyeRy = Math.max(1.8, 5.2 * charExpressionPose.eyeAperture01);
  const browTilt = charExpressionPose.browTiltDeg * 0.22;
  const mouthY = faceCy + headRy * 0.46;
  const mouthRx = Math.max(3.5, 11 * charExpressionPose.startViseme.width01);
  const mouthRy = Math.max(1.2, 8.5 * charExpressionPose.startViseme.openHeight01);

  const bBox = opticalBalloonSfx.balloonBox;
  const bCx = bBox.x + bBox.width * 0.5;
  const bCy = bBox.y + bBox.height * 0.5;
  const tailBaseY = opticalBalloonSfx.balloonTailTarget.y >= bCy ? bBox.y + bBox.height - 2 : bBox.y + 2;
  const tailBaseX = Math.min(bBox.x + bBox.width - 18, Math.max(bBox.x + 18, opticalBalloonSfx.balloonTailTarget.x));
  const tailPts = `${tailBaseX - 8},${tailBaseY} ${tailBaseX + 8},${tailBaseY} ${opticalBalloonSfx.balloonTailTarget.x},${opticalBalloonSfx.balloonTailTarget.y}`;

  const handCx = subjectBox.x + subjectBox.width * 0.78;
  const handCy = Math.min(542, subjectBox.y + subjectBox.height * 0.78);
  const handOpenScale = 1 - charExpressionPose.handGrip.gripTension01 * 0.48;

  const sfxBox = opticalBalloonSfx.sfxBox;
  const sfxCx = sfxBox.x + sfxBox.width * 0.5;
  const sfxCy = sfxBox.y + sfxBox.height * 0.58;
  const sfxLabel = isEn ? opticalBalloonSfx.sfxTextEn : opticalBalloonSfx.sfxTextKo;

  return (
    <svg
      data-testid="oneshot-preview-svg" data-emotion={plan.emotion} data-stroke-preset={plan.strokePreset}
      data-active-layers={plan.authorSovereignty.activeLayerCount} data-face-overlap-ratio={opticalBalloonSfx.faceOverlapRatio}
      data-layer-camera3d={String(camera3d.enabled)} data-layer-rimlight={String(webgpuRimLight.enabled)}
      data-layer-expression={String(charExpressionPose.enabled)} data-layer-balloon={String(opticalBalloonSfx.enabled)}
      data-layer-gutter={String(scrollGutterRhythm.enabled)} data-violet-free="true"
      viewBox={`0 0 ${plan.viewBox.width} ${plan.viewBox.height}`} role="img"
      aria-label={isEn ? `9:16 vertical one-shot cut preview: ${plan.emotion}, ${plan.authorSovereignty.activeLayerCount} of 5 layers active, 0% face overlap` : `9:16 세로 원샷 컷 라이브 프리뷰: ${plan.emotion}, 5개 중 ${plan.authorSovereignty.activeLayerCount}개 레이어 활성, 얼굴 겹침 0%`}
      className="mx-auto aspect-[9/16] max-h-[520px] w-full max-w-[300px] rounded-xl border border-line-strong bg-canvas text-fg"
    >
      <defs>
        <linearGradient id={gradBgId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={webgpuRimLight.backdropTopOklch} />
          <stop offset="100%" stopColor={webgpuRimLight.backdropBottomOklch} />
        </linearGradient>
        <radialGradient id={gradRimId} cx="50%" cy="46%" r="54%">
          <stop offset="0%" stopColor={webgpuRimLight.rimLight.oklch} stopOpacity={webgpuRimLight.enabled ? 0.52 : 0} />
          <stop offset="68%" stopColor={webgpuRimLight.keyLight.oklch} stopOpacity={webgpuRimLight.enabled ? 0.16 : 0} />
          <stop offset="100%" stopColor={webgpuRimLight.backdropBottomOklch} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 배경 및 WebGPU 역광 레이어 */}
      <rect x="0" y="0" width="360" height="640" fill={`url(#${gradBgId})`} />
      {webgpuRimLight.enabled ? (
        <g data-testid="oneshot-svg-rimlight-layer">
          <ellipse cx={faceCx} cy={faceCy + 28} rx={subjectBox.width * 0.72} ry={subjectBox.height * 0.56} fill={`url(#${gradRimId})`} />
          <line x1={webgpuRimLight.rimBeamOrigin.x} y1={webgpuRimLight.rimBeamOrigin.y} x2={webgpuRimLight.rimBeamTarget.x} y2={webgpuRimLight.rimBeamTarget.y} stroke={webgpuRimLight.rimLight.oklch} strokeWidth="2.2" strokeDasharray="6 4" opacity="0.82" />
          <circle cx={webgpuRimLight.rimBeamOrigin.x} cy={webgpuRimLight.rimBeamOrigin.y} r="7" fill={webgpuRimLight.rimLight.oklch} stroke={SVG_HUD_TEXT} strokeWidth="1.5" />
        </g>
      ) : null}

      {/* 원본 3획 구도 러프 (작가 주권: 항상 비파괴 보존 표시) */}
      <g data-testid="oneshot-svg-rough-strokes">
        {camera3d.guideStrokes.map((st) => (
          <path key={st.index} d={st.d} fill="none" stroke={SVG_ROUGH_STROKE} strokeWidth={camera3d.enabled ? 1.8 : 2.6} strokeDasharray={st.role === "horizon-axis" ? "6 4" : "none"} opacity={camera3d.enabled ? 0.55 : 0.9} />
        ))}
      </g>

      {/* Layer 1: 3D 카메라 틸트 프레임 · 180° 시선 축 · 얼굴 안전 박스 */}
      {camera3d.enabled ? (
        <g data-testid="oneshot-svg-camera3d-layer">
          <g transform={`rotate(${camera3d.dutchTiltDeg} 180 320)`}>
            <rect x="20" y={scrollGutterRhythm.previewTopBandPx + 8} width="320" height={640 - scrollGutterRhythm.previewTopBandPx - scrollGutterRhythm.previewBottomBandPx - 16} rx="6" fill="none" stroke={SVG_CAMERA_FRAME} strokeWidth="1.4" strokeDasharray="8 5" />
            <line x1="24" y1={camera3d.eyeLineAxis.horizonY} x2="336" y2={camera3d.eyeLineAxis.horizonY} stroke={SVG_CAMERA_FRAME} strokeWidth="1" strokeDasharray="3 4" opacity="0.7" />
          </g>
          <rect x={faceSafeBox.x} y={faceSafeBox.y} width={faceSafeBox.width} height={faceSafeBox.height} rx="8" fill="none" stroke={SVG_SAFE_BOX} strokeWidth="1.5" strokeDasharray="4 3" />
          <text x={faceSafeBox.x + 4} y={faceSafeBox.y - 4} fill={SVG_SAFE_BOX} fontSize="8.5" fontWeight="700">
            {isEn ? "FACE SAFE (0% OVERLAP)" : "얼굴 안전 구역 (겹침 0%)"}
          </text>
        </g>
      ) : null}

      {/* 피사체 캐릭터 실루엣 + Layer 3: 표정·음절 비젬·15관절 손 그립 */}
      <g data-testid="oneshot-svg-character-base">
        <path
          d={`M ${subjectBox.x + 12} ${subjectBox.y + subjectBox.height} Q ${subjectBox.x + subjectBox.width * 0.16} ${faceSafeBox.y + faceSafeBox.height + 16} ${faceCx} ${faceSafeBox.y + faceSafeBox.height + 6} Q ${subjectBox.x + subjectBox.width * 0.84} ${faceSafeBox.y + faceSafeBox.height + 16} ${subjectBox.x + subjectBox.width - 12} ${subjectBox.y + subjectBox.height} Z`}
          fill={webgpuRimLight.characterSilhouetteOklch}
          stroke={webgpuRimLight.enabled ? webgpuRimLight.rimLight.oklch : SVG_INK}
          strokeWidth={webgpuRimLight.enabled ? 2.4 : 1.5}
        />
        <ellipse
          cx={faceCx} cy={faceCy} rx={headRx} ry={headRy}
          fill={webgpuRimLight.enabled ? SVG_SKIN_SHADE : SVG_SKIN_LIGHT}
          stroke={webgpuRimLight.enabled ? webgpuRimLight.rimLight.oklch : SVG_INK}
          strokeWidth={webgpuRimLight.enabled ? 2.6 : 1.8}
        />
        <path
          d={`M ${faceCx - headRx * 1.02} ${faceCy - headRy * 0.12} Q ${faceCx} ${faceCy - headRy * 1.48} ${faceCx + headRx * 1.02} ${faceCy - headRy * 0.12} Q ${faceCx} ${faceCy - headRy * 0.62} ${faceCx - headRx * 1.02} ${faceCy - headRy * 0.12} Z`}
          fill={webgpuRimLight.characterSilhouetteOklch}
        />

        {charExpressionPose.enabled ? (
          <g data-testid="oneshot-svg-expression-layer">
            <line x1={faceCx - eyeSpan - 9} y1={eyeY - 10 - browTilt} x2={faceCx - eyeSpan + 8} y2={eyeY - 10 + browTilt} stroke={SVG_INK} strokeWidth="2.4" strokeLinecap="round" />
            <line x1={faceCx + eyeSpan - 8} y1={eyeY - 10 + browTilt} x2={faceCx + eyeSpan + 9} y2={eyeY - 10 - browTilt} stroke={SVG_INK} strokeWidth="2.4" strokeLinecap="round" />
            <ellipse cx={faceCx - eyeSpan} cy={eyeY} rx="6.5" ry={eyeRy} fill={SVG_HUD_TEXT} stroke={SVG_INK} strokeWidth="1.4" />
            <ellipse cx={faceCx + eyeSpan} cy={eyeY} rx="6.5" ry={eyeRy} fill={SVG_HUD_TEXT} stroke={SVG_INK} strokeWidth="1.4" />
            <circle cx={faceCx - eyeSpan + charExpressionPose.pupilFocusOffset.x} cy={eyeY + charExpressionPose.pupilFocusOffset.y} r={Math.min(3.2, eyeRy * 0.72)} fill={SVG_INK} />
            <circle cx={faceCx + eyeSpan + charExpressionPose.pupilFocusOffset.x} cy={eyeY + charExpressionPose.pupilFocusOffset.y} r={Math.min(3.2, eyeRy * 0.72)} fill={SVG_INK} />
            {charExpressionPose.blushIntensity01 > 0 ? (
              <>
                <ellipse cx={faceCx - eyeSpan - 4} cy={eyeY + 13} rx="8" ry="4" fill={SVG_BLUSH} opacity={charExpressionPose.blushIntensity01} />
                <ellipse cx={faceCx + eyeSpan + 4} cy={eyeY + 13} rx="8" ry="4" fill={SVG_BLUSH} opacity={charExpressionPose.blushIntensity01} />
              </>
            ) : null}
            {charExpressionPose.sweatDrop ? (
              <path d={`M ${faceCx + headRx - 6} ${eyeY - 12} Q ${faceCx + headRx + 2} ${eyeY} ${faceCx + headRx - 6} ${eyeY + 5} Q ${faceCx + headRx - 14} ${eyeY} ${faceCx + headRx - 6} ${eyeY - 12} Z`} fill={SVG_SWEAT} stroke={SVG_INK} strokeWidth="1" />
            ) : null}
            {/* 한글 첫 음절 비젬 기반 실시간 입모양 */}
            <ellipse data-testid="oneshot-svg-viseme-mouth" cx={faceCx} cy={mouthY} rx={mouthRx} ry={mouthRy} fill={SVG_INK} stroke={SVG_HUD_TEXT} strokeWidth="0.9" />
            {/* 15관절 손 그립 미니 실루엣 */}
            <g data-testid="oneshot-svg-hand-rig" transform={`translate(${handCx}, ${handCy})`}>
              <circle cx="0" cy="0" r="13" fill={SVG_SKIN_LIGHT} stroke={SVG_INK} strokeWidth="1.4" />
              {[-14, -7, 0, 7, 14].map((dx, idx) => (
                <line key={dx} x1={dx * 0.6} y1="-8" x2={dx * (0.9 + handOpenScale * 0.5)} y2={-16 - (idx === 2 ? 12 : 8) * handOpenScale} stroke={SVG_INK} strokeWidth="2.6" strokeLinecap="round" />
              ))}
            </g>
          </g>
        ) : (
          <line x1={faceCx - 6} y1={mouthY} x2={faceCx + 6} y2={mouthY} stroke={SVG_INK} strokeWidth="1.6" strokeLinecap="round" opacity="0.65" />
        )}
      </g>

      {/* Layer 4: 얼굴 안전 영역 겹침 0% 광학 말풍선 & SFX */}
      {opticalBalloonSfx.enabled ? (
        <g data-testid="oneshot-svg-balloon-layer">
          <polygon points={tailPts} fill={opticalBalloonSfx.balloonFillOklch} stroke={opticalBalloonSfx.balloonStrokeOklch} strokeWidth="1.8" strokeLinejoin="round" />
          {opticalBalloonSfx.balloonShape === "jagged-burst" || opticalBalloonSfx.balloonShape === "double-shock-star" ? (
            <polygon points={buildBalloonPolygonPoints(bBox, opticalBalloonSfx.balloonShape)} fill={opticalBalloonSfx.balloonFillOklch} stroke={opticalBalloonSfx.balloonStrokeOklch} strokeWidth="2" strokeLinejoin="round" />
          ) : opticalBalloonSfx.balloonShape === "sharp-noir-rect" ? (
            <rect x={bBox.x} y={bBox.y} width={bBox.width} height={bBox.height} rx="4" fill={opticalBalloonSfx.balloonFillOklch} stroke={opticalBalloonSfx.balloonStrokeOklch} strokeWidth="2.2" />
          ) : (
            <rect x={bBox.x} y={bBox.y} width={bBox.width} height={bBox.height} rx={bBox.height * 0.44} fill={opticalBalloonSfx.balloonFillOklch} stroke={opticalBalloonSfx.balloonStrokeOklch} strokeWidth={opticalBalloonSfx.balloonShape === "engraved-crest-oval" ? 2.4 : 1.8} />
          )}
          {opticalBalloonSfx.wrappedLines.map((line, idx) => {
            const lineStartY = bCy - ((opticalBalloonSfx.wrappedLines.length - 1) * 16) / 2 + idx * 16 + 4;
            return (
              <text key={`${idx}-${line}`} x={bCx} y={lineStartY} textAnchor="middle" fill={SVG_INK} fontSize="11.5" fontWeight={opticalBalloonSfx.fontWeight}>
                {line}
              </text>
            );
          })}
          <g transform={`rotate(${opticalBalloonSfx.sfxAngleDeg} ${sfxCx} ${sfxCy})`}>
            <rect x={sfxBox.x} y={sfxBox.y} width={sfxBox.width} height={sfxBox.height} rx="8" fill={SVG_HUD_BG} stroke={opticalBalloonSfx.sfxFillOklch} strokeWidth="1.6" />
            <text x={sfxCx} y={sfxCy + 3} textAnchor="middle" fill={opticalBalloonSfx.sfxFillOklch} fontSize="14.5" fontWeight="800">
              {sfxLabel}
            </text>
          </g>
        </g>
      ) : null}

      {/* Layer 5: 모바일 9:16 세로 스크롤 상하 여백(Gutter) 호흡 밴드 */}
      {scrollGutterRhythm.enabled ? (
        <g data-testid="oneshot-svg-gutter-layer">
          <rect x="0" y="0" width="360" height={scrollGutterRhythm.previewTopBandPx} fill={scrollGutterRhythm.gutterToneOklch} opacity="0.92" />
          <line x1="0" y1={scrollGutterRhythm.previewTopBandPx} x2="360" y2={scrollGutterRhythm.previewTopBandPx} stroke={SVG_GUTTER_TICK} strokeWidth="1.2" strokeDasharray="4 3" />
          <text x="12" y={Math.max(13, scrollGutterRhythm.previewTopBandPx - 6)} fill={SVG_GUTTER_TICK} fontSize="9" fontWeight="700">
            {`TOP GUTTER ${scrollGutterRhythm.topGutterPx}px · CUT ${scrollGutterRhythm.cutHeightPx}px`}
          </text>
          <rect x="0" y={640 - scrollGutterRhythm.previewBottomBandPx} width="360" height={scrollGutterRhythm.previewBottomBandPx} fill={scrollGutterRhythm.gutterToneOklch} opacity="0.92" />
          <line x1="0" y1={640 - scrollGutterRhythm.previewBottomBandPx} x2="360" y2={640 - scrollGutterRhythm.previewBottomBandPx} stroke={SVG_GUTTER_TICK} strokeWidth="1.2" strokeDasharray="4 3" />
          <text x="12" y={640 - Math.max(6, scrollGutterRhythm.previewBottomBandPx * 0.35)} fill={SVG_GUTTER_TICK} fontSize="9" fontWeight="700">
            {`BOTTOM GUTTER ${scrollGutterRhythm.bottomGutterPx}px · ${scrollGutterRhythm.estimatedReadSec}s`}
          </text>
        </g>
      ) : null}

      {/* 하단 HUD 상태 스트립 */}
      <rect x="10" y={640 - scrollGutterRhythm.previewBottomBandPx - 24} width="340" height="20" rx="5" fill={SVG_HUD_BG} />
      <text x="18" y={640 - scrollGutterRhythm.previewBottomBandPx - 11} fill={SVG_HUD_TEXT} fontSize="8.5" fontWeight="700">
        {`${camera3d.focalLengthMm}mm · TILT ${camera3d.dutchTiltDeg}° · RIM ${webgpuRimLight.rimLight.kelvin}K · OVERLAP ${opticalBalloonSfx.faceOverlapRatio}%`}
      </text>
    </svg>
  );
}

/** 대사 1줄 + 3획 구도 러프 → 5레이어 비파괴 원샷 컷 라이브 연출기 제어판. */
export function StudioOneshotCutDirectorPanel(props: StudioOneshotCutDirectorPanelProps): ReactElement {
  const isEn = props.locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);
  const uid = useId();
  const initialPreset = getOneshotScenePreset(props.initialPresetId ?? "rooftop-blade-standoff");

  const [presetId, setPresetId] = useState<OneshotScenePresetId | "custom">(initialPreset.id);
  const [dialogue, setDialogue] = useState<string>(isEn ? initialPreset.dialogueEn : initialPreset.dialogueKo);
  const [emotion, setEmotion] = useState<OneshotEmotionId>(initialPreset.emotion);
  const [strokePreset, setStrokePreset] = useState<RoughStrokePresetId>(initialPreset.strokePreset);
  const [layers, setLayers] = useState<OneshotLayerToggles>(DEFAULT_ONESHOT_LAYERS);
  const [showJsonPreview, setShowJsonPreview] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const plan = useMemo(
    () => composeOneshotCutPlan({ dialogue, emotion, strokePreset, layers, presetId }),
    [dialogue, emotion, strokePreset, layers, presetId],
  );
  const exportedJson = useMemo(() => exportOneshotCutPlanJson(plan), [plan]);

  const notifyPlanChange = (nextInput: OneshotCutInput): void => {
    if (props.onPlanChange) props.onPlanChange(composeOneshotCutPlan(nextInput));
  };

  const handleSelectPreset = (nextPresetId: OneshotScenePresetId): void => {
    const preset = getOneshotScenePreset(nextPresetId);
    const nextDialogue = isEn ? preset.dialogueEn : preset.dialogueKo;
    setPresetId(preset.id);
    setDialogue(nextDialogue);
    setEmotion(preset.emotion);
    setStrokePreset(preset.strokePreset);
    setLayers(DEFAULT_ONESHOT_LAYERS);
    notifyPlanChange({ dialogue: nextDialogue, emotion: preset.emotion, strokePreset: preset.strokePreset, layers: DEFAULT_ONESHOT_LAYERS, presetId: preset.id });
    setStatusMessage(pick(`'${preset.nameKo}' 대표 씬과 5대 연출 레이어를 불러왔습니다.`, `Loaded '${preset.nameEn}' preset with all 5 live layers.`));
  };

  const handleDialogueChange = (nextDialogue: string): void => {
    setDialogue(nextDialogue);
    setPresetId("custom");
    notifyPlanChange({ dialogue: nextDialogue, emotion, strokePreset, layers, presetId: "custom" });
  };

  const handleEmotionChange = (nextEmotion: OneshotEmotionId): void => {
    setEmotion(nextEmotion);
    setPresetId("custom");
    notifyPlanChange({ dialogue, emotion: nextEmotion, strokePreset, layers, presetId: "custom" });
    const spec = ONESHOT_EMOTION_SPECS.find((e) => e.id === nextEmotion);
    if (spec) setStatusMessage(pick(`감정 연출을 '${spec.nameKo}'(${spec.paletteNameKo})로 전환했습니다.`, `Switched emotion lighting to '${spec.nameEn}'.`));
  };

  const handleStrokeChange = (nextStroke: RoughStrokePresetId): void => {
    setStrokePreset(nextStroke);
    setPresetId("custom");
    notifyPlanChange({ dialogue, emotion, strokePreset: nextStroke, layers, presetId: "custom" });
    const spec = ROUGH_STROKE_PRESETS.find((s) => s.id === nextStroke);
    if (spec) setStatusMessage(pick(`3획 구도 러프를 '${spec.nameKo}'로 적용했습니다.`, `Applied 3-stroke rough preset '${spec.nameEn}'.`));
  };

  const handleToggleLayer = (layerId: OneshotLayerId): void => {
    const nextLayers: OneshotLayerToggles = { ...layers, [layerId]: !layers[layerId] };
    setLayers(nextLayers);
    notifyPlanChange({ dialogue, emotion, strokePreset, layers: nextLayers, presetId });
    const spec = ONESHOT_LAYER_SPECS.find((l) => l.id === layerId);
    if (spec) {
      setStatusMessage(
        nextLayers[layerId]
          ? pick(`'${spec.labelKo}' 레이어를 켰습니다.`, `Enabled '${spec.labelEn}' layer.`)
          : pick(`'${spec.labelKo}' 레이어를 비파괴 바이패스했습니다.`, `Bypassed '${spec.labelEn}' non-destructively.`),
      );
    }
  };

  const handleSetAllLayers = (nextLayers: OneshotLayerToggles, msgKo: string, msgEn: string): void => {
    setLayers(nextLayers);
    notifyPlanChange({ dialogue, emotion, strokePreset, layers: nextLayers, presetId });
    setStatusMessage(pick(msgKo, msgEn));
  };

  const handleResetBaseline = (): void => {
    const base = getOneshotScenePreset(props.initialPresetId ?? "rooftop-blade-standoff");
    const baseDialogue = isEn ? base.dialogueEn : base.dialogueKo;
    setPresetId(base.id);
    setDialogue(baseDialogue);
    setEmotion(base.emotion);
    setStrokePreset(base.strokePreset);
    setLayers(DEFAULT_ONESHOT_LAYERS);
    notifyPlanChange({ dialogue: baseDialogue, emotion: base.emotion, strokePreset: base.strokePreset, layers: DEFAULT_ONESHOT_LAYERS, presetId: base.id });
    setStatusMessage(pick("초기 대표 씬과 5대 비파괴 레이어 기준점으로 원복했습니다.", "Restored initial scene preset and 5 non-destructive layers."));
  };

  const handleCopyJson = (): void => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(exportedJson).catch(() => undefined);
    }
    if (props.onExportJson) props.onExportJson(exportedJson, plan);
    setStatusMessage(pick(`JSON 연출 시트(${plan.planDigest})를 복사했습니다.`, `Copied cut director JSON sheet (${plan.planDigest}).`));
  };

  const { camera3d, webgpuRimLight, charExpressionPose, opticalBalloonSfx, scrollGutterRhythm, authorSovereignty } = plan;

  return (
    <section
      data-testid="oneshot-cut-director-panel"
      aria-label={pick("원샷 컷 라이브 연출기", "One-Shot Cut Live Director")}
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg sm:p-5 ${props.className ?? ""}`}
    >
      {/* 상단 헤더 */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3.5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent [word-break:keep-all]">
              <Clapperboard className="h-3.5 w-3.5" aria-hidden="true" />
              {pick("원샷 컷 라이브 연출기", "One-Shot Cut Live Director")}
            </span>
            <span data-testid="oneshot-sovereignty-badge" className="inline-flex items-center gap-1 rounded-full border border-good bg-good-soft px-2.5 py-0.5 text-[11px] font-semibold text-good tabular-nums [word-break:keep-all]">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {pick(`비파괴 ${authorSovereignty.activeLayerCount}/5 · 얼굴 겹침 ${opticalBalloonSfx.faceOverlapRatio}%`, `Non-Destructive ${authorSovereignty.activeLayerCount}/5 · Overlap ${opticalBalloonSfx.faceOverlapRatio}%`)}
            </span>
          </div>
          <h2 className="text-base font-bold text-fg [word-break:keep-all]">
            {pick("대사 1줄 + 3획 구도 러프 → 5대 연출 레이어 즉시 조립", "1-Line Dialogue + 3-Stroke Rough → 5 Live Director Layers")}
          </h2>
          <p className="text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
            {pick("카메라·WebGPU 탈-바이올렛 역광·음절 비젬·15관절 손·얼굴 회피 말풍선·9:16 스크롤 여백을 비파괴 레이어로 동시에 조율합니다.", "Deterministically composes camera, violet-free WebGPU rim light, syllable visemes, 15-joint hand grip, zero-overlap balloons and 9:16 gutters.")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="oneshot-copy-json-btn" onClick={handleCopyJson} className={BTN_SOLID}>
            <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("JSON 시트 복사", "Copy JSON Sheet")}
          </button>
          <button type="button" data-testid="oneshot-reset-btn" onClick={handleResetBaseline} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("초기 원복", "Reset")}
          </button>
        </div>
      </header>

      {/* 4종 웹툰 대표 씬 원클릭 프리셋 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-fg-2 [word-break:keep-all]">{pick("1. 웹툰 대표 씬 프리셋 (4종)", "1. Iconic Webtoon Scene Presets (4)")}</span>
          <span className="font-mono text-[11px] text-fg-3 tabular-nums">{`DIGEST ${plan.planDigest}`}</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {ONESHOT_SCENE_PRESETS.map((preset) => {
            const active = presetId === preset.id;
            return (
              <button key={preset.id} type="button" data-testid={`oneshot-preset-${preset.id}`} aria-pressed={active} onClick={() => handleSelectPreset(preset.id)} className={`${active ? BTN_ACTIVE : BTN_OUTLINE} flex-col items-start justify-center px-3 py-2 text-left`}>
                <span className="text-xs font-bold">{isEn ? preset.nameEn : preset.nameKo}</span>
                <span className="text-[11px] font-normal text-fg-3">{isEn ? preset.genreTagEn : preset.genreTagKo}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 대사 1줄 입력 + 감정 5종 + 3획 구도 4종 */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-raised p-3.5 lg:grid-cols-12">
        <div className="space-y-1.5 lg:col-span-12">
          <label htmlFor={`${uid}-dialogue`} className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-fg [word-break:keep-all]">
            <span>{pick("2. 대사 1줄 직접 입력 (한글·영문 첫/끝 음절 비젬 실시간 연동)", "2. One-Line Dialogue Input (Live Start/End Syllable Visemes)")}</span>
            <span data-testid="oneshot-viseme-readout" className="font-mono text-[11px] text-accent tabular-nums">
              {`${charExpressionPose.startViseme.syllable}[${charExpressionPose.startViseme.code}] → ${charExpressionPose.endViseme.syllable}[${charExpressionPose.endViseme.code}]`}
            </span>
          </label>
          <input id={`${uid}-dialogue`} data-testid="oneshot-dialogue-input" type="text" value={dialogue} onChange={(e) => handleDialogueChange(e.target.value)} placeholder={pick("컷 대사를 한 줄로 입력하세요…", "Enter one line of dialogue…")} className={`min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm text-fg placeholder:text-fg-3 ${FOCUS_RING}`} />
        </div>

        <div className="space-y-1.5 lg:col-span-7">
          <span className="block text-xs font-semibold text-fg-2 [word-break:keep-all]">{pick("3. 감정·장르 톤 (5종)", "3. Emotion & Genre Tone (5)")}</span>
          <div className="flex flex-wrap gap-1.5">
            {ONESHOT_EMOTION_SPECS.map((spec) => (
              <button key={spec.id} type="button" data-testid={`oneshot-emotion-${spec.id}`} aria-pressed={emotion === spec.id} onClick={() => handleEmotionChange(spec.id)} className={emotion === spec.id ? BTN_ACTIVE : BTN_OUTLINE}>
                {isEn ? spec.nameEn : spec.nameKo}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5 lg:col-span-5">
          <span className="block text-xs font-semibold text-fg-2 [word-break:keep-all]">{pick("4. 구도 3획 러프 프리셋 (4종)", "4. 3-Stroke Composition Rough (4)")}</span>
          <div className="grid grid-cols-2 gap-1.5">
            {ROUGH_STROKE_PRESETS.map((spec) => (
              <button key={spec.id} type="button" data-testid={`oneshot-stroke-${spec.id}`} aria-pressed={strokePreset === spec.id} onClick={() => handleStrokeChange(spec.id)} className={strokePreset === spec.id ? BTN_ACTIVE : BTN_OUTLINE}>
                {isEn ? spec.nameEn : spec.nameKo}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 5개 비파괴 레이어 개별 ON/OFF 스위치 + 작가 주권 일괄 제어 */}
      <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("5. 비파괴 5대 연출 레이어 개별 스위치 (작가 주권)", "5. Non-Destructive 5-Layer Switches (Author Sovereignty)")}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" data-testid="oneshot-layers-all-on" onClick={() => handleSetAllLayers(DEFAULT_ONESHOT_LAYERS, "5대 연출 레이어를 모두 켰습니다.", "Enabled all 5 director layers.")} className={authorSovereignty.activeLayerCount === 5 ? BTN_ACTIVE : BTN_OUTLINE}>
              {pick("5레이어 전체 ON", "All 5 ON")}
            </button>
            <button type="button" data-testid="oneshot-layers-rough-only" onClick={() => handleSetAllLayers(NEUTRAL_ROUGH_ONLY_LAYERS, "모든 연출 레이어를 바이패스해 원본 3획 러프만 표시합니다.", "Bypassed all 5 layers to inspect raw 3-stroke rough.")} className={authorSovereignty.activeLayerCount === 0 ? BTN_ACTIVE : BTN_OUTLINE}>
              {pick("원본 3획 러프만", "Raw Rough Only")}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {ONESHOT_LAYER_SPECS.map((layer) => {
            const on = layers[layer.id];
            return (
              <button key={layer.id} type="button" role="switch" aria-checked={on} data-testid={`oneshot-layer-${layer.id}`} onClick={() => handleToggleLayer(layer.id)} className={`${on ? BTN_ACTIVE : BTN_OUTLINE} flex-col items-start justify-between px-3 py-2 text-left`}>
                <span className="flex w-full items-center justify-between gap-1.5">
                  <span className="inline-flex items-center gap-1 font-bold"><LayerIcon id={layer.id} />{isEn ? layer.labelEn : layer.labelKo}</span>
                  <span className="font-mono text-[10px] uppercase tabular-nums">{on ? "ON" : "OFF"}</span>
                </span>
                <span className="mt-0.5 text-[10px] font-normal leading-snug text-fg-3">{isEn ? layer.roleEn : layer.roleKo}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 라이브 9:16 SVG 프리뷰 + 5대 연출 계측 패널 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5 lg:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <Eye className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("9:16 세로 컷 라이브 연출 프리뷰", "9:16 Vertical Cut Live Preview")}
            </h3>
            <span className="font-mono text-[11px] text-fg-3 tabular-nums">{`${plan.viewBox.width}×${plan.viewBox.height}`}</span>
          </div>
          <OneshotCutPreviewSvg plan={plan} isEn={isEn} svgUid={uid} />
        </div>

        <div className="space-y-3 lg:col-span-7">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-card p-3">
              <div className="flex items-center justify-between text-[11px] text-fg-3 [word-break:keep-all]">
                <span className="inline-flex items-center gap-1"><Compass className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{pick("3D 카메라 · 180° 시선 축", "3D Camera · 180° Axis")}</span>
                <span className="font-mono tabular-nums">{camera3d.enabled ? "ON" : "BYPASS"}</span>
              </div>
              <div data-testid="oneshot-metric-camera" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">
                {`${camera3d.focalLengthMm}mm f/${camera3d.depthOfFieldApertureF} · ${camera3d.dutchTiltDeg}°`}
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-fg-3 tabular-nums">
                {`FOV ${camera3d.fovVerticalDeg}° · Pitch ${camera3d.pitchDeg}° · 180° ${pick("위반 0건", "0 Cross")}`}
              </div>
            </div>

            <div className="rounded-xl border border-line bg-card p-3">
              <div className="flex items-center justify-between text-[11px] text-fg-3 [word-break:keep-all]">
                <span className="inline-flex items-center gap-1"><SunMedium className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{pick("WebGPU 역광 · 탈-바이올렛 OKLCH", "WebGPU Rim · Violet-Free OKLCH")}</span>
                <span className="font-mono tabular-nums">{`${webgpuRimLight.webgpuShaderPassCount}P`}</span>
              </div>
              <div data-testid="oneshot-metric-rimlight" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">
                {`${webgpuRimLight.keyLight.kelvin}K / ${webgpuRimLight.rimLight.kelvin}K · ${webgpuRimLight.rimLight.angleDeg}°`}
              </div>
              <div className="mt-0.5 text-[11px] text-fg-3 [word-break:keep-all]">
                {`${isEn ? webgpuRimLight.paletteNameEn : webgpuRimLight.paletteNameKo} · ${isEn ? webgpuRimLight.contrastRatioLabelEn : webgpuRimLight.contrastRatioLabelKo}`}
              </div>
            </div>

            <div className="rounded-xl border border-line bg-card p-3">
              <div className="flex items-center justify-between text-[11px] text-fg-3 [word-break:keep-all]">
                <span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{pick("광학 말풍선 · 얼굴 회피 증명", "Optical Balloon · Face Safe")}</span>
                <span className="font-mono font-bold text-good tabular-nums">{`${opticalBalloonSfx.faceOverlapRatio}%`}</span>
              </div>
              <div data-testid="oneshot-metric-balloon" className="mt-1 font-mono text-sm font-bold text-good tabular-nums">
                {`${pick("겹침", "Overlap")} ${opticalBalloonSfx.faceOverlapAreaPx2}px² · ${pick("이격", "Gap")} ${opticalBalloonSfx.faceClearancePx}px`}
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-fg-3 tabular-nums">
                {`${opticalBalloonSfx.placementSlot} · SFX ${isEn ? opticalBalloonSfx.sfxTextEn : opticalBalloonSfx.sfxTextKo} (${opticalBalloonSfx.sfxFaceOverlapRatio}%)`}
              </div>
            </div>

            <div className="rounded-xl border border-line bg-card p-3">
              <div className="flex items-center justify-between text-[11px] text-fg-3 [word-break:keep-all]">
                <span className="inline-flex items-center gap-1"><ArrowUpDown className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{pick("9:16 세로 스크롤 호흡", "9:16 Scroll Rhythm")}</span>
                <span className="font-mono tabular-nums">{`${scrollGutterRhythm.viewportScreens916}×`}</span>
              </div>
              <div data-testid="oneshot-metric-scroll" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">
                {`${scrollGutterRhythm.cutHeightPx}px · ↑${scrollGutterRhythm.topGutterPx} / ↓${scrollGutterRhythm.bottomGutterPx}`}
              </div>
              <div className="mt-0.5 text-[11px] text-fg-3 [word-break:keep-all]">
                {`${pick("예상 리딩", "Read")} ${scrollGutterRhythm.estimatedReadSec}s · ${isEn ? scrollGutterRhythm.scrollCueEn : scrollGutterRhythm.scrollCueKo}`}
              </div>
            </div>
          </div>

          {/* 표정 · 음절 비젬 · 15관절 손 그립 요약 표 */}
          <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
                <Hand className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                {pick(`표정·비젬 & 15관절 손 그립 (${charExpressionPose.handGrip.nameKo})`, `Expression · Viseme & 15-Joint Grip (${charExpressionPose.handGrip.nameEn})`)}
              </span>
              <span className="font-mono text-[11px] text-fg-3 tabular-nums">
                {`${charExpressionPose.handGrip.jointCount}J · ${pick("평균 굴곡", "Avg Flex")} ${charExpressionPose.handGrip.averageFlexionDeg}°`}
              </span>
            </div>
            <p className="text-[11px] text-fg-2 [word-break:keep-all]">
              {`${isEn ? charExpressionPose.summaryEn : charExpressionPose.summaryKo} · ${pick("입모양", "Viseme")} ${charExpressionPose.startViseme.syllable}(${isEn ? charExpressionPose.startViseme.labelEn : charExpressionPose.startViseme.labelKo}) → ${charExpressionPose.endViseme.syllable}(${isEn ? charExpressionPose.endViseme.labelEn : charExpressionPose.endViseme.labelKo})`}
            </p>
            <div data-testid="oneshot-hand-joints-table" className="grid grid-cols-5 gap-1.5 text-center font-mono text-[10px] tabular-nums">
              {FINGER_META.map((fm) => {
                const fingerJoints = charExpressionPose.handGrip.joints.filter((j) => j.finger === fm.id);
                return (
                  <div key={fm.id} className="rounded-lg border border-line bg-raised px-1.5 py-1.5">
                    <div className="font-sans font-semibold text-fg [word-break:keep-all]">{isEn ? fm.en : fm.ko}</div>
                    <div className="mt-0.5 text-fg-2">{fingerJoints.map((j) => `${j.flexionDeg}°`).join("/")}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 작가 주권 확인 & JSON 연출 시트 드로어 */}
          <div className="space-y-2 rounded-xl border border-line bg-raised p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-fg [word-break:keep-all]">
                <CheckCircle2 className="h-3.5 w-3.5 text-good" aria-hidden="true" />
                {isEn ? authorSovereignty.summaryEn : authorSovereignty.summaryKo}
              </span>
              <button
                type="button"
                data-testid="oneshot-toggle-json-btn"
                aria-expanded={showJsonPreview}
                onClick={() => setShowJsonPreview((prev) => !prev)}
                className={showJsonPreview ? BTN_ACTIVE : BTN_OUTLINE}
              >
                <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {showJsonPreview ? pick("JSON 닫기", "Hide JSON") : pick("JSON 미리보기", "Preview JSON")}
              </button>
            </div>
            {statusMessage ? (
              <p role="status" data-testid="oneshot-status-banner" className="text-[11px] font-medium text-accent [word-break:keep-all]">
                {statusMessage}
              </p>
            ) : null}
            {showJsonPreview ? (
              <pre data-testid="oneshot-json-preview" className="max-h-56 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2 tabular-nums">
                {exportedJson}
              </pre>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
