/**
 * Wave 64B — `AtelierVivid` 탈-바이올렛 주얼-톤 아틀리에 생동감·입체 에나멜 UI 쇼케이스 패널.
 *
 * - 5대 창작 컨텍스트 주얼-톤 무드 스위처 + 화방 5원색 안료 스트립(바이올렛 265°~325° 0%)
 * - 인터랙티브 마이크로-시어터 라이브 카드(순수 OKLCH/currentColor SVG: 다층 안료 리본, 포인터 조명 하이라이트,
 *   3종 에나멜 도구 배지[InkRaster · AtelierSolid · AtelierStage], 좌측 기존 플랫 UI vs 우측 AtelierVivid 비교)
 * - 4종 입체 에나멜 버튼 클릭 감각 테스트 존 + 모션 감소 안전 토글 + WCAG 2.2 AA 감사 + CSS/JSON 내보내기
 * - 모든 props 선택적, 원시 색표기 0건, 명시적 transition 속성만 허용, Web Storage 0건
 */

import {
  Box, CheckCircle2, Clapperboard, Code2, Copy, Eye, Layers, MousePointer2,
  Palette, PauseCircle, PenTool, PlayCircle, RotateCcw, ShieldCheck, SlidersHorizontal,
} from "lucide-react";
import { useId, useMemo, useRef, useState, type PointerEvent, type ReactElement } from "react";

import { copyText } from "@/shared/lib/copy-text";

import {
  ATELIER_JEWEL_PIGMENTS, ATELIER_VIVID_PALETTES, MAX_TILT_DEG, TACTILE_BUTTON_VARIANTS,
  buildAtelierVividSnapshot, evaluateTactileButtonSpec, exportAtelierVividCssVariables,
  exportAtelierVividManifestJson, formatOklch, getAtelierVividPalette,
  type AtelierVividPaletteId, type AtelierVividSnapshot, type TactileButtonVariantId,
  type TactileInteractionState,
} from "./atelier-vibrant-engine";

export interface StudioAtelierVibrantUiPanelProps {
  readonly initialPaletteId?: AtelierVividPaletteId;
  readonly initialReducedMotion?: boolean;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onPaletteChange?: (snapshot: AtelierVividSnapshot) => void;
  readonly onExportCss?: (cssText: string, snapshot: AtelierVividSnapshot) => void | Promise<void>;
  readonly onExportJson?: (jsonText: string, snapshot: AtelierVividSnapshot) => void | Promise<void>;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

const POINTER_PROBES = [
  { id: "center", x: 0, y: 0, labelKo: "중앙 0°", labelEn: "Center 0°" },
  { id: "top-left", x: -0.82, y: -0.74, labelKo: "좌상단 시선", labelEn: "Top-Left" },
  { id: "bottom-right", x: 0.88, y: 0.68, labelKo: "우하단 시선", labelEn: "Bottom-Right" },
] as const;

const STATE_OPTIONS: readonly { readonly id: TactileInteractionState; readonly ko: string; readonly en: string }[] = [
  { id: "rest", ko: "기본", en: "Rest" },
  { id: "hover", ko: "호버", en: "Hover" },
  { id: "active", ko: "프레스", en: "Press" },
  { id: "focus", ko: "포커스", en: "Focus" },
];

const BUTTON_COPY: Readonly<Record<TactileButtonVariantId, { readonly ctaKo: string; readonly ctaEn: string }>> = {
  "primary-enamel": { ctaKo: "작품 저장 · 출고", ctaEn: "Save & Export" },
  "secondary-ceramic": { ctaKo: "레이어 스냅샷", ctaEn: "Layer Snapshot" },
  "tool-jewel-badge": { ctaKo: "InkRaster 브러시", ctaEn: "InkRaster Brush" },
  "ghost-ink-pill": { ctaKo: "가이드 보기", ctaEn: "Studio Guide" },
};

function renderVariantIcon(variant: TactileButtonVariantId): ReactElement {
  if (variant === "primary-enamel") return <Palette className="h-3.5 w-3.5" aria-hidden="true" />;
  if (variant === "secondary-ceramic") return <Layers className="h-3.5 w-3.5" aria-hidden="true" />;
  if (variant === "tool-jewel-badge") return <PenTool className="h-3.5 w-3.5" aria-hidden="true" />;
  return <Eye className="h-3.5 w-3.5" aria-hidden="true" />;
}

/** 좌측 비교 SVG: 기존 밋밋한 플랫 UI vs 우측 AtelierVivid 입체·컬러풀 UI 라이브 비교. */
function FlatVsVividComparisonSvg(props: { readonly snapshot: AtelierVividSnapshot; readonly isEn: boolean; readonly uid: string }): ReactElement {
  const { snapshot, isEn, uid } = props;
  const p = snapshot.palette;
  const meshGradId = `${uid}-cmp-mesh`;
  const enamelGradId = `${uid}-cmp-enamel`;
  const flatBase = p.polarity === "dark" ? formatOklch({ l: 0.24, c: 0.004, h: 86 }) : formatOklch({ l: 0.96, c: 0.002, h: 86 });
  const flatCard = p.polarity === "dark" ? formatOklch({ l: 0.29, c: 0.004, h: 86 }) : formatOklch({ l: 0.985, c: 0.002, h: 86 });
  const flatStroke = p.polarity === "dark" ? formatOklch({ l: 0.42, c: 0.004, h: 86 }) : formatOklch({ l: 0.82, c: 0.004, h: 86 });
  const flatInk = p.polarity === "dark" ? formatOklch({ l: 0.72, c: 0.004, h: 86 }) : formatOklch({ l: 0.46, c: 0.004, h: 86 });

  return (
    <svg
      data-testid="atelier-vivid-comparison-svg" data-palette-id={p.id} data-violet-free="true" viewBox="0 0 380 258" role="img"
      aria-label={isEn ? `Flat UI versus AtelierVivid ${p.labelEn} comparison` : `기존 플랫 UI와 AtelierVivid ${p.labelKo} 입체 UI 라이브 비교`}
      className="h-64 w-full rounded-xl border border-line-strong bg-canvas text-fg"
    >
      <defs>
        <radialGradient id={meshGradId} cx="28%" cy="22%" r="78%">
          <stop offset="0%" stopColor={formatOklch(p.meshStops[0].color, 0.34)} />
          <stop offset="55%" stopColor={formatOklch(p.meshStops[1].color, 0.22)} />
          <stop offset="100%" stopColor={formatOklch(p.canvas, 0.96)} />
        </radialGradient>
        <linearGradient id={enamelGradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={formatOklch(p.primary)} />
          <stop offset="100%" stopColor={formatOklch({ l: Math.max(0.24, p.primary.l - 0.07), c: p.primary.c, h: p.primary.h })} />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="380" height="258" rx="14" fill={formatOklch(p.surface)} />

      {/* 좌측: 기존 플랫 UI */}
      <rect x="10" y="10" width="170" height="238" rx="10" fill={flatBase} stroke={flatStroke} strokeWidth="1" />
      <text x="20" y="29" fill={flatInk} fontSize="8.3" fontWeight="700">{isEn ? "BEFORE · FLAT UI" : "기존 · 밋밋한 플랫 UI"}</text>
      <text x="20" y="41" fill={flatInk} fontSize="6.7" fontFamily="monospace">{isEn ? "MONO · NO DEPTH · STATIC" : "단조 · 깊이 없음 · 정적"}</text>
      <rect x="20" y="52" width="150" height="94" rx="6" fill={flatCard} stroke={flatStroke} strokeWidth="1" />
      <rect x="30" y="64" width="76" height="8" rx="2" fill={flatStroke} />
      <rect x="30" y="78" width="124" height="6" rx="2" fill={flatStroke} opacity="0.65" />
      <rect x="30" y="92" width="38" height="24" rx="4" fill={flatBase} stroke={flatStroke} strokeWidth="0.9" />
      <rect x="74" y="92" width="38" height="24" rx="4" fill={flatBase} stroke={flatStroke} strokeWidth="0.9" />
      <rect x="118" y="92" width="38" height="24" rx="4" fill={flatBase} stroke={flatStroke} strokeWidth="0.9" />
      <text x="95" y="135" textAnchor="middle" fill={flatInk} fontSize="6.6" fontFamily="monospace">{isEn ? "LOW VISUAL CUE" : "시선 위계 약함"}</text>
      <rect x="20" y="158" width="150" height="34" rx="6" fill={flatCard} stroke={flatStroke} strokeWidth="1" />
      <text x="95" y="179" textAnchor="middle" fill={flatInk} fontSize="8" fontWeight="600">{isEn ? "Plain Flat Action" : "단조로운 평면 버튼"}</text>
      <rect x="20" y="204" width="150" height="32" rx="6" fill={flatBase} stroke={flatStroke} strokeWidth="0.9" />
      <text x="95" y="223" textAnchor="middle" fill={flatInk} fontSize="6.8" fontFamily="monospace">{isEn ? "0 SPECULAR · 0 PARALLAX" : "광택 0 · 시차 0 · 무표정"}</text>

      {/* 중앙 VS 구분 배지 */}
      <line x1="190" y1="16" x2="190" y2="242" stroke={formatOklch(p.borderStrong)} strokeWidth="1" strokeDasharray="3 3" />
      <circle cx="190" cy="129" r="13" fill={formatOklch(p.elevated)} stroke={formatOklch(p.accent)} strokeWidth="1.4" />
      <text x="190" y="132" textAnchor="middle" fill={formatOklch(p.ink)} fontSize="7.4" fontFamily="monospace" fontWeight="700">VS</text>

      {/* 우측: AtelierVivid 입체 주얼 UI */}
      <rect x="200" y="10" width="170" height="238" rx="12" fill={`url(#${meshGradId})`} stroke={formatOklch(p.borderStrong)} strokeWidth="1.2" />
      <text x="210" y="29" fill={formatOklch(p.ink)} fontSize="8.3" fontWeight="700">{isEn ? "AFTER · ATELIER VIVID" : "개선 · AtelierVivid 입체"}</text>
      <text x="210" y="41" fill={formatOklch(p.primary)} fontSize="6.7" fontFamily="monospace" fontWeight="700">{`JEWEL OKLCH · ${snapshot.contrastAudit.worstWcagRatio}:1 AA`}</text>
      <rect x="210" y="54" width="150" height="94" rx="10" fill={formatOklch(p.ink, 0.14)} transform="translate(0, 3)" />
      <rect x="210" y="52" width="150" height="94" rx="10" fill={formatOklch(p.elevated)} stroke={formatOklch(p.borderStrong)} strokeWidth="1.1" />
      <line x1="218" y1="53.5" x2="352" y2="53.5" stroke={formatOklch(p.specularRim, 0.72)} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M 218 82 Q 258 64 298 78 T 352 72" fill="none" stroke={formatOklch(p.accent, 0.55)} strokeWidth="4.5" strokeLinecap="round" />
      <path d="M 218 90 Q 266 78 308 86 T 352 80" fill="none" stroke={formatOklch(p.highlight, 0.65)} strokeWidth="2.8" strokeLinecap="round" />

      <rect x="219" y="96" width="40" height="26" rx="7" fill={formatOklch(p.primary)} />
      <line x1="224" y1="97.5" x2="254" y2="97.5" stroke={formatOklch(p.specularRim, 0.58)} strokeWidth="1" />
      <text x="239" y="112" textAnchor="middle" fill={formatOklch(p.onPrimary)} fontSize="6.5" fontWeight="700">2D</text>
      <rect x="265" y="96" width="40" height="26" rx="7" fill={formatOklch(p.accent)} />
      <line x1="270" y1="97.5" x2="300" y2="97.5" stroke={formatOklch(p.specularRim, 0.58)} strokeWidth="1" />
      <text x="285" y="112" textAnchor="middle" fill={formatOklch(p.onAccent)} fontSize="6.5" fontWeight="700">3D</text>
      <rect x="311" y="96" width="40" height="26" rx="7" fill={formatOklch(p.secondary)} stroke={formatOklch(p.borderStrong)} strokeWidth="1" />
      <text x="331" y="112" textAnchor="middle" fill={formatOklch(p.onSecondary)} fontSize="6.5" fontWeight="700">STAGE</text>
      <text x="285" y="138" textAnchor="middle" fill={formatOklch(p.inkMuted)} fontSize="6.5" fontFamily="monospace" fontWeight="700">{isEn ? "SPECULAR + JEWEL DEPTH" : "1px 광택 + 주얼 입체감"}</text>

      <rect x="210" y="161" width="150" height="34" rx="10" fill={formatOklch(p.primary, 0.28)} transform="translate(0, 3)" />
      <rect x="210" y="158" width="150" height="34" rx="10" fill={`url(#${enamelGradId})`} stroke={formatOklch(p.borderStrong, 0.5)} strokeWidth="0.9" />
      <line x1="219" y1="159.5" x2="351" y2="159.5" stroke={formatOklch(p.specularRim, 0.6)} strokeWidth="1.2" strokeLinecap="round" />
      <text x="285" y="179" textAnchor="middle" fill={formatOklch(p.onPrimary)} fontSize="8.2" fontWeight="700">{isEn ? "Enamel Jewel CTA" : "에나멜 입체 주 버튼"}</text>
      <rect x="210" y="204" width="150" height="32" rx="8" fill={formatOklch(p.elevated)} stroke={formatOklch(p.primary)} strokeWidth="1" />
      <text x="285" y="223" textAnchor="middle" fill={formatOklch(p.ink)} fontSize="6.8" fontFamily="monospace" fontWeight="700">{`VIOLET 0% · TILT ±${MAX_TILT_DEG}°`}</text>
    </svg>
  );
}

/** 우측 인터랙티브 마이크로-시어터 라이브 SVG: 다층 안료 리본 + 포인터 조명 + 3종 에나멜 도구 배지. */
function MicroTheaterLiveSvg(props: { readonly snapshot: AtelierVividSnapshot; readonly isEn: boolean; readonly uid: string }): ReactElement {
  const { snapshot, isEn, uid } = props;
  const { palette: p, kinematics: k } = snapshot;
  const specGradId = `${uid}-mt-spec`;
  const stageGradId = `${uid}-mt-stage`;
  const [backRibbon, midRibbon, frontRibbon] = k.ribbonFrames;
  const lightCx = Math.round((k.specularShiftXPct / 100) * 420);
  const lightCy = Math.round((k.specularShiftYPct / 100) * 258);

  const toolBadges = [
    { id: "brush", x: 24, code: "INK", title: "InkRaster", subKo: "안료 브러시", subEn: "Pigment Brush", bg: formatOklch(p.primary), fg: formatOklch(p.onPrimary), ring: formatOklch(p.specularRim, 0.56) },
    { id: "solid3d", x: 152, code: "3D", title: "AtelierSolid", subKo: "3D 조형", subEn: "3D Sculpt", bg: formatOklch(p.accent), fg: formatOklch(p.onAccent), ring: formatOklch(p.specularRim, 0.56) },
    { id: "stage", x: 280, code: "STG", title: "AtelierStage", subKo: "가상 작업실", subEn: "Virtual Stage", bg: formatOklch(p.secondary), fg: formatOklch(p.onSecondary), ring: formatOklch(p.borderStrong, 0.8) },
  ] as const;

  return (
    <svg
      data-testid="atelier-vivid-microtheater-svg" data-palette-id={p.id} data-violet-free="true"
      data-tilt-x={k.rotateXDeg} data-tilt-y={k.rotateYDeg} data-reduced-motion={String(k.reducedMotion)}
      viewBox="0 0 420 258" role="img"
      aria-label={isEn ? `Interactive AtelierVivid micro-theater card for ${p.labelEn}` : `${p.labelKo} 인터랙티브 마이크로-시어터 라이브 쇼케이스`}
      className="h-64 w-full rounded-xl"
    >
      <defs>
        <linearGradient id={stageGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={formatOklch(p.elevated)} />
          <stop offset="100%" stopColor={formatOklch(p.canvas)} />
        </linearGradient>
        <radialGradient id={specGradId} cx={`${k.specularShiftXPct}%`} cy={`${k.specularShiftYPct}%`} r="52%">
          <stop offset="0%" stopColor={formatOklch(p.specularRim, k.reducedMotion ? 0.14 : 0.34)} />
          <stop offset="48%" stopColor={formatOklch(p.highlight, k.reducedMotion ? 0.1 : 0.22)} />
          <stop offset="100%" stopColor={formatOklch(p.canvas, 0)} />
        </radialGradient>
      </defs>

      <rect x="0" y="0" width="420" height="258" rx="14" fill={`url(#${stageGradId})`} stroke={formatOklch(p.borderStrong)} strokeWidth="1.2" />

      <g data-ribbon-depth="back" transform={`translate(${backRibbon.offsetXPx} ${backRibbon.offsetYPx + backRibbon.scrollShiftYPx})`}>
        <path d="M -24 166 C 72 82, 180 218, 286 112 C 344 54, 396 106, 446 72" fill="none" stroke={backRibbon.strokeCss} strokeWidth={backRibbon.strokeWidth} strokeLinecap="round" />
      </g>
      <g data-ribbon-depth="mid" transform={`translate(${midRibbon.offsetXPx} ${midRibbon.offsetYPx + midRibbon.scrollShiftYPx})`}>
        <path d="M -18 118 C 94 186, 194 42, 304 128 C 358 170, 404 114, 444 134" fill="none" stroke={midRibbon.strokeCss} strokeWidth={midRibbon.strokeWidth} strokeLinecap="round" />
      </g>
      <g data-ribbon-depth="front" transform={`translate(${frontRibbon.offsetXPx} ${frontRibbon.offsetYPx + frontRibbon.scrollShiftYPx})`}>
        <path d="M 14 78 C 118 32, 212 146, 326 68 C 362 44, 392 66, 412 52" fill="none" stroke={frontRibbon.strokeCss} strokeWidth={frontRibbon.strokeWidth} strokeLinecap="round" />
      </g>

      <rect x="2" y="2" width="416" height="254" rx="12" fill={`url(#${specGradId})`} />
      <circle data-testid="atelier-vivid-specular-orb" cx={lightCx} cy={lightCy} r="24" fill="none" stroke={formatOklch(p.highlight, k.reducedMotion ? 0.2 : 0.6)} strokeWidth="1.2" strokeDasharray="4 3" />
      <circle cx={lightCx} cy={lightCy} r="3.6" fill={formatOklch(p.primary)} />

      {k.inkRipple.active ? (
        <circle data-testid="atelier-vivid-ink-ripple" cx={lightCx} cy={lightCy} r={Math.max(8, Math.round(k.inkRipple.radiusPct * 1.15))} fill="none" stroke={formatOklch(p.accent, k.inkRipple.opacity)} strokeWidth="3" />
      ) : null}

      <line x1="20" y1="3" x2="400" y2="3" stroke={formatOklch(p.specularRim, 0.72)} strokeWidth="1.4" strokeLinecap="round" />
      <rect x="20" y="16" width="380" height="44" rx="10" fill={formatOklch(p.surface, 0.88)} stroke={formatOklch(p.border)} strokeWidth="1" />
      <text x="32" y="34" fill={formatOklch(p.ink)} fontSize="9.6" fontWeight="700">{isEn ? p.labelEn : p.labelKo}</text>
      <text x="32" y="49" fill={formatOklch(p.inkMuted)} fontSize="7.4">{isEn ? p.moodTagEn : p.moodTagKo}</text>
      <text x="388" y="34" textAnchor="end" fill={formatOklch(p.primary)} fontSize="7.8" fontFamily="monospace" fontWeight="700">
        {`TILT ${k.rotateXDeg >= 0 ? "+" : ""}${k.rotateXDeg}° / ${k.rotateYDeg >= 0 ? "+" : ""}${k.rotateYDeg}°`}
      </text>
      <text x="388" y="49" textAnchor="end" fill={formatOklch(p.inkMuted)} fontSize="7" fontFamily="monospace">
        {k.reducedMotion ? "REDUCED MOTION · SNAP 0" : `LIGHT ${k.specularShiftXPct}% · ${k.specularShiftYPct}%`}
      </text>

      {toolBadges.map((badge) => (
        <g key={badge.id} data-enamel-badge={badge.id}>
          <rect x={badge.x} y="168" width="116" height="70" rx="12" fill={formatOklch(p.ink, 0.16)} transform="translate(0, 4)" />
          <rect x={badge.x} y="166" width="116" height="70" rx="12" fill={badge.bg} stroke={badge.ring} strokeWidth="1.1" />
          <line x1={badge.x + 10} y1="168" x2={badge.x + 106} y2="168" stroke={formatOklch(p.specularRim, 0.65)} strokeWidth="1.2" strokeLinecap="round" />
          <circle cx={badge.x + 22} cy="191" r="10" fill={formatOklch(p.specularRim, 0.2)} stroke={badge.fg} strokeWidth="1" />
          <text x={badge.x + 22} y="194" textAnchor="middle" fill={badge.fg} fontSize="7.2" fontFamily="monospace" fontWeight="700">{badge.code}</text>
          <text x={badge.x + 38} y="189" fill={badge.fg} fontSize="8.8" fontWeight="700">{badge.title}</text>
          <text x={badge.x + 38} y="202" fill={badge.fg} fontSize="7.2" opacity="0.9">{isEn ? badge.subEn : badge.subKo}</text>
          <text x={badge.x + 12} y="224" fill={badge.fg} fontSize="6.7" fontFamily="monospace" opacity="0.86">{isEn ? "1px ENAMEL BEVEL · AA" : "1px 광택 베벨 · AA 통과"}</text>
        </g>
      ))}
    </svg>
  );
}

/** `AtelierVivid` 탈-바이올렛 주얼-톤 아틀리에 생동감 UI 패널. */
export function StudioAtelierVibrantUiPanel(props: StudioAtelierVibrantUiPanelProps): ReactElement {
  const isEn = props.locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);
  const uid = useId();
  const defaultPaletteId = getAtelierVividPalette(props.initialPaletteId ?? "pigment-splash").id;
  const defaultReduced = Boolean(props.initialReducedMotion);

  const [paletteId, setPaletteId] = useState<AtelierVividPaletteId>(defaultPaletteId);
  const [reducedMotion, setReducedMotion] = useState<boolean>(defaultReduced);
  const [pointerPos, setPointerPos] = useState<{ readonly x: number; readonly y: number }>({ x: 0.26, y: -0.18 });
  const [scrollProgress, setScrollProgress] = useState<number>(0.35);
  const [rippleActive, setRippleActive] = useState<boolean>(false);
  const [rippleAgeMs, setRippleAgeMs] = useState<number>(0);
  const [inspectedState, setInspectedState] = useState<TactileInteractionState>("rest");
  const [hoveredVariant, setHoveredVariant] = useState<TactileButtonVariantId | null>(null);
  const [pressedVariant, setPressedVariant] = useState<TactileButtonVariantId | null>(null);
  const [pressCounts, setPressCounts] = useState<Readonly<Record<TactileButtonVariantId, number>>>({
    "primary-enamel": 0, "secondary-ceramic": 0, "tool-jewel-badge": 0, "ghost-ink-pill": 0,
  });
  const [previewFormat, setPreviewFormat] = useState<"css" | "json">("css");
  const [showDrawer, setShowDrawer] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const copyRequestId = useRef(0);

  const snapshot = useMemo(
    () => buildAtelierVividSnapshot({ paletteId, buttonState: inspectedState, pointerX: pointerPos.x, pointerY: pointerPos.y, scrollProgress, rippleAgeMs, rippleActive, reducedMotion }),
    [paletteId, inspectedState, pointerPos, scrollProgress, rippleAgeMs, rippleActive, reducedMotion],
  );
  const cssOutput = useMemo(
    () => exportAtelierVividCssVariables(paletteId, { reducedMotion, pointerX: pointerPos.x, pointerY: pointerPos.y, scrollProgress }),
    [paletteId, reducedMotion, pointerPos, scrollProgress],
  );
  const jsonOutput = useMemo(() => exportAtelierVividManifestJson(snapshot), [snapshot]);

  const handleSelectPalette = (nextId: AtelierVividPaletteId) => {
    setPaletteId(nextId);
    const nextSnap = buildAtelierVividSnapshot({ paletteId: nextId, buttonState: inspectedState, pointerX: pointerPos.x, pointerY: pointerPos.y, scrollProgress, rippleAgeMs, rippleActive, reducedMotion });
    setStatusMessage(pick(`${nextSnap.palette.labelKo} 무드 적용 완료 (바이올렛 0% · 최소 대비 ${nextSnap.contrastAudit.worstWcagRatio}:1)`, `Applied ${nextSnap.palette.labelEn} (0% violet · worst contrast ${nextSnap.contrastAudit.worstWcagRatio}:1)`));
    props.onPaletteChange?.(nextSnap);
  };

  const handleToggleReducedMotion = () => {
    setReducedMotion((prev) => {
      const next = !prev;
      if (next) {
        setRippleActive(false);
        setRippleAgeMs(0);
      }
      setStatusMessage(next ? pick("모션 감소 안전 모드 켜짐: 3D 틸트·시차·스프링 스케일 즉시 0으로 고정", "Reduced motion active: tilt, parallax, and spring scale snapped to 0") : pick("역동적 마이크로-시어터 모션 복원: ±4.5° 틸트와 150ms 스프링 프레스 활성", "Vivid micro-theater motion enabled: ±4.5° tilt and 150ms spring press"));
      return next;
    });
  };

  const handleStagePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (reducedMotion) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    setPointerPos({ x: Math.max(-1, Math.min(1, nx)), y: Math.max(-1, Math.min(1, ny)) });
  };

  const handleTriggerRipple = () => {
    if (reducedMotion) {
      setStatusMessage(pick("모션 감소 안전 모드가 켜져 있어 잉크 물결 파동을 생략했습니다.", "Ink ripple skipped while reduced-motion mode is active."));
      return;
    }
    setRippleActive(true);
    setRippleAgeMs(140);
    setStatusMessage(pick("잉크 물결 감쇠 파동(140ms)을 캔버스 조명 지점에 표시했습니다.", "Triggered ink ripple decay wave (140ms) at pointer highlight."));
  };

  const handleCopyExport = async (format: "css" | "json") => {
    setPreviewFormat(format);
    setShowDrawer(true);
    const payload = format === "css" ? cssOutput : jsonOutput;
    const req = ++copyRequestId.current;
    if (format === "css") await props.onExportCss?.(payload, snapshot);
    else await props.onExportJson?.(payload, snapshot);
    const copied = await copyText(payload);
    if (req !== copyRequestId.current) return;
    setStatusMessage(copied ? pick(`${format.toUpperCase()} 토큰 시트를 클립보드에 복사했습니다.`, `Copied ${format.toUpperCase()} tokens to clipboard.`) : pick(`${format.toUpperCase()} 토큰 미리보기를 열었습니다.`, `Opened ${format.toUpperCase()} token preview drawer.`));
  };

  const handleReset = () => {
    setPaletteId(defaultPaletteId);
    setReducedMotion(defaultReduced);
    setPointerPos({ x: 0.26, y: -0.18 });
    setScrollProgress(0.35);
    setRippleActive(false);
    setRippleAgeMs(0);
    setInspectedState("rest");
    setHoveredVariant(null);
    setPressedVariant(null);
    setPressCounts({ "primary-enamel": 0, "secondary-ceramic": 0, "tool-jewel-badge": 0, "ghost-ink-pill": 0 });
    setStatusMessage(pick("AtelierVivid 아틀리에 설정을 기본값으로 되돌렸습니다.", "Reset AtelierVivid settings to defaults."));
  };

  const scrollSliderId = `${uid}-scroll-slider`;

  return (
    <section
      data-testid="atelier-vibrant-ui-panel" data-palette-id={snapshot.palette.id} data-reduced-motion={String(reducedMotion)}
      aria-label={pick("AtelierVivid 탈-바이올렛 주얼-톤 아틀리에 UI 패널", "AtelierVivid Jewel-Tone Atelier Motion UI Panel")}
      className={`space-y-4 rounded-2xl border border-line bg-card p-4 text-fg shadow-sm sm:p-5 ${props.className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3.5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line-strong bg-raised text-accent">
              <Palette className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2 className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
              {pick("AtelierVivid 주얼-톤 생동감 · 입체 에나멜 UI", "AtelierVivid Jewel-Tone & Tactile Enamel UI")}
            </h2>
            <span className="inline-flex items-center gap-1 rounded-md border border-good bg-good-soft px-2 py-0.5 font-mono text-[11px] font-bold text-good tabular-nums">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {`VIOLET 0% · SCORE ${snapshot.craftScore}`}
            </span>
          </div>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick("보라·네온 슬롭(265°~325°)을 배제한 화방 5원색 안료, 실시간 동적 메쉬, 1px 광택 에나멜 버튼과 ±4.5° 안전 마이크로-시어터 엔진입니다.", "Zero-violet (265°–325°) art-store pigments, live dynamic mesh washes, 1px specular enamel controls, and ±4.5° motion-safe micro-theater.")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="atelier-vivid-reduced-motion-toggle" aria-pressed={reducedMotion} onClick={handleToggleReducedMotion} className={reducedMotion ? BTN_ACTIVE : BTN_OUTLINE}>
            {reducedMotion ? <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" /> : <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />}
            {reducedMotion ? pick("모션 감소 켜짐 (0 스냅)", "Reduced Motion: ON") : pick("모션 감소 안전 토글", "Reduced Motion: OFF")}
          </button>
          <button type="button" data-testid="atelier-vivid-copy-css-btn" onClick={() => void handleCopyExport("css")} className={BTN_SOLID}>
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            {pick("CSS 변수 복사", "Copy CSS")}
          </button>
          <button type="button" data-testid="atelier-vivid-copy-json-btn" onClick={() => void handleCopyExport("json")} className={BTN_OUTLINE}>
            <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
            {pick("JSON 매니페스트", "Copy JSON")}
          </button>
          <button type="button" data-testid="atelier-vivid-reset-btn" onClick={handleReset} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {pick("초기화", "Reset")}
          </button>
        </div>
      </header>

      <div role="status" data-testid="atelier-vivid-status-banner" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-raised px-3.5 py-2.5 text-xs [word-break:keep-all]">
        <span className="flex items-center gap-1.5 font-medium text-fg">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-good" aria-hidden="true" />
          {statusMessage || (isEn ? snapshot.palette.craftNoteEn : snapshot.palette.craftNoteKo)}
        </span>
        <span className="font-mono text-[11px] text-fg-2 tabular-nums">{`TOKENS ${snapshot.violetAudit.inspectedCount} · WCAG MIN ${snapshot.contrastAudit.worstWcagRatio}:1`}</span>
      </div>

      {/* 1. 5대 주얼-톤 아틀리에 무드 스위처 + 화방 5원색 안료 */}
      <div className="space-y-2.5 rounded-xl border border-line bg-raised p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-fg [word-break:keep-all]">{pick("1. 5대 창작 컨텍스트 주얼-톤 아틀리에 무드 스위처", "1. Five Creative-Context Jewel-Tone Mood Switcher")}</h3>
          <span className="font-mono text-[11px] text-fg-3 tabular-nums">{pick("화방 5원색 안료 · 158° / 236° / 24° / 76° / 86°", "5 Core Pigments · 158° / 236° / 24° / 76° / 86°")}</span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5" role="group" aria-label={pick("주얼-톤 팔레트 선택", "Select jewel-tone palette")}>
          {ATELIER_VIVID_PALETTES.map((item) => {
            const active = item.id === paletteId;
            const audit = snapshot.allPaletteContrastAudits.find((a) => a.paletteId === item.id);
            return (
              <button
                key={item.id} type="button" data-testid={`atelier-vivid-palette-${item.id}`} aria-pressed={active}
                onClick={() => handleSelectPalette(item.id)}
                className={`flex min-h-11 flex-col items-start gap-1.5 rounded-xl border p-2.5 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${active ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"}`}
              >
                <div className="flex w-full items-center gap-1" aria-hidden="true">
                  <span className="h-3 flex-1 rounded-sm border border-line" style={{ backgroundColor: formatOklch(item.canvas) }} />
                  <span className="h-3 flex-1 rounded-sm border border-line" style={{ backgroundColor: formatOklch(item.primary) }} />
                  <span className="h-3 flex-1 rounded-sm border border-line" style={{ backgroundColor: formatOklch(item.accent) }} />
                  <span className="h-3 flex-1 rounded-sm border border-line" style={{ backgroundColor: formatOklch(item.highlight) }} />
                </div>
                <span className="text-[11px] font-bold leading-snug">{isEn ? item.labelEn : item.labelKo}</span>
                <span className="font-mono text-[10px] text-fg-3 tabular-nums">{`${item.polarity.toUpperCase()} · AA ${audit?.worstWcagRatio ?? 4.5}:1`}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5" data-testid="atelier-vivid-pigment-strip">
          {ATELIER_JEWEL_PIGMENTS.map((pigment) => (
            <div key={pigment.id} className="flex items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5">
              <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full border border-line-strong" style={{ backgroundColor: formatOklch(pigment.swatch) }} />
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold text-fg [word-break:keep-all]">{isEn ? pigment.labelEn : pigment.labelKo}</p>
                <p className="truncate font-mono text-[10px] text-fg-3 tabular-nums">{`HUE ${pigment.hueDeg}°`}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. 플랫 vs AtelierVivid 비교 + 인터랙티브 마이크로-시어터 카드 */}
      <div className="space-y-3 rounded-xl border border-line bg-raised p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <MousePointer2 className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <h3 className="text-xs font-semibold text-fg [word-break:keep-all]">{pick("2. 기존 플랫 UI 비교 & 인터랙티브 마이크로-시어터 카드", "2. Flat UI Comparison & Interactive Micro-Theater Card")}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {POINTER_PROBES.map((probe) => (
              <button key={probe.id} type="button" data-testid={`atelier-vivid-probe-${probe.id}`} onClick={() => setPointerPos({ x: probe.x, y: probe.y })} className={BTN_OUTLINE}>
                {isEn ? probe.labelEn : probe.labelKo}
              </button>
            ))}
            <button type="button" data-testid="atelier-vivid-ripple-btn" onClick={handleTriggerRipple} className={BTN_OUTLINE}>
              <Clapperboard className="h-3.5 w-3.5" aria-hidden="true" />
              {pick("잉크 물결 파동", "Ink Ripple")}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-fg-2 [word-break:keep-all]">{pick("좌측 기존 플랫 UI vs 우측 AtelierVivid 입체 주얼 UI", "Left Flat UI vs Right AtelierVivid Jewel Enamel UI")}</p>
            <FlatVsVividComparisonSvg snapshot={snapshot} isEn={isEn} uid={uid} />
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-fg-2 [word-break:keep-all]">{pick("포인터·스크롤 반응형 마이크로-시어터(최대 ±4.5° 안전 틸트)", "Pointer & Scroll Micro-Theater (±4.5° Safe Tilt)")}</p>
              <span data-testid="atelier-vivid-tilt-readout" className="font-mono text-[11px] text-accent tabular-nums">{`rx ${snapshot.kinematics.rotateXDeg}° · ry ${snapshot.kinematics.rotateYDeg}°`}</span>
            </div>
            <div
              data-testid="atelier-vivid-microtheater-card"
              onPointerMove={handleStagePointerMove} onPointerLeave={() => setPointerPos({ x: 0, y: 0 })} onPointerDown={handleTriggerRipple}
              style={{ backgroundImage: snapshot.kinematics.meshGradientCss, transform: snapshot.kinematics.cardTransformCss, transitionProperty: reducedMotion ? "none" : "transform, box-shadow", transitionDuration: reducedMotion ? "0ms" : "150ms" }}
              className="rounded-xl p-1 motion-reduce:transition-none"
            >
              <MicroTheaterLiveSvg snapshot={snapshot} isEn={isEn} uid={uid} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-card px-3 py-2">
          <label htmlFor={scrollSliderId} className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("스크롤 리본 시차 시뮬레이터", "Scroll Ribbon Parallax")}
          </label>
          <input id={scrollSliderId} data-testid="atelier-vivid-scroll-slider" type="range" min={0} max={100} value={Math.round(scrollProgress * 100)} onChange={(e) => setScrollProgress(Number(e.target.value) / 100)} className="h-2 flex-1 cursor-pointer accent-accent" />
          <span className="font-mono text-xs text-fg-2 tabular-nums">{`${Math.round(scrollProgress * 100)}%`}</span>
        </div>
      </div>

      {/* 3. 4종 입체 에나멜 버튼 클릭 감각 테스트 존 */}
      <div data-testid="atelier-vivid-button-lab" className="space-y-3 rounded-xl border border-line bg-raised p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Box className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <h3 className="text-xs font-semibold text-fg [word-break:keep-all]">{pick("3. 4종 입체 에나멜 버튼 · 도구 배지 클릭 감각 테스트 존", "3. Four Tactile Enamel Button & Badge Playground")}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={pick("버튼 물리 상태 미리보기", "Inspect button physical state")}>
            {STATE_OPTIONS.map((opt) => (
              <button key={opt.id} type="button" data-testid={`atelier-vivid-state-${opt.id}`} aria-pressed={inspectedState === opt.id} onClick={() => setInspectedState(opt.id)} className={inspectedState === opt.id ? BTN_ACTIVE : BTN_OUTLINE}>
                {isEn ? opt.en : opt.ko}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {TACTILE_BUTTON_VARIANTS.map((variant) => {
            const liveState: TactileInteractionState = pressedVariant === variant ? "active" : hoveredVariant === variant ? "hover" : inspectedState;
            const spec = evaluateTactileButtonSpec({ variant, state: liveState, paletteId, reducedMotion });
            const copy = BUTTON_COPY[variant];
            return (
              <div key={variant} data-testid={`atelier-vivid-btn-card-${variant}`} className="flex flex-col justify-between gap-2.5 rounded-xl border border-line bg-card p-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-fg [word-break:keep-all]">{isEn ? spec.labelEn : spec.labelKo}</span>
                    <span className="font-mono text-[10px] font-bold text-good tabular-nums">{`${spec.wcagContrastRatio}:1 AA`}</span>
                  </div>
                  <p className="text-[11px] text-fg-3 [word-break:keep-all]">{isEn ? spec.badgeTagEn : spec.badgeTagKo}</p>
                </div>

                <button
                  type="button" data-testid={`atelier-vivid-tactile-${variant}`}
                  onPointerEnter={() => setHoveredVariant(variant)}
                  onPointerLeave={() => {
                    setHoveredVariant((prev) => (prev === variant ? null : prev));
                    setPressedVariant((prev) => (prev === variant ? null : prev));
                  }}
                  onPointerDown={() => setPressedVariant(variant)}
                  onPointerUp={() => setPressedVariant((prev) => (prev === variant ? null : prev))}
                  onClick={() => {
                    setPressCounts((prev) => ({ ...prev, [variant]: prev[variant] + 1 }));
                    setStatusMessage(pick(`${spec.labelKo} 클릭 응답 확인 (scale ${spec.scale} · ${spec.durationMs}ms · WCAG ${spec.wcagContrastRatio}:1)`, `${spec.labelEn} tactile press verified (scale ${spec.scale} · ${spec.durationMs}ms · WCAG ${spec.wcagContrastRatio}:1)`));
                  }}
                  style={{
                    backgroundColor: formatOklch(spec.backgroundOklch), color: formatOklch(spec.foregroundOklch),
                    borderColor: formatOklch(spec.borderOklch), boxShadow: spec.boxShadowCss, transform: spec.transformCss,
                    transitionProperty: spec.transitionProperty, transitionDuration: `${spec.durationMs}ms`, transitionTimingFunction: spec.springCurve,
                  }}
                  className={`inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING}`}
                >
                  {renderVariantIcon(variant)}
                  <span>{isEn ? copy.ctaEn : copy.ctaKo}</span>
                </button>

                <div className="flex items-center justify-between font-mono text-[10px] text-fg-3 tabular-nums">
                  <span>{`scale ${spec.scale} · ${spec.durationMs}ms`}</span>
                  <span data-testid={`atelier-vivid-press-count-${variant}`}>{`clicks ${pressCounts[variant]}`}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. WCAG 2.2 AA 감사 표 + CSS / JSON 미리보기 서랍 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-fg [word-break:keep-all]">{pick("WCAG 2.2 AA 대비 & 바이올렛 0% 감사", "WCAG 2.2 AA & Zero-Violet Audit")}</h3>
            <span className="font-mono text-[11px] font-bold text-good tabular-nums">{snapshot.contrastAudit.allPassAa ? pick("6/6 조합 AA 통과", "6/6 Pairs AA Pass") : pick("검토 필요", "Needs Review")}</span>
          </div>
          <div className="overflow-x-auto">
            <table data-testid="atelier-vivid-contrast-table" className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-line text-[11px] text-fg-3">
                  <th className="py-1 pr-2 font-semibold">{pick("역할", "Role")}</th>
                  <th className="py-1 px-2 font-semibold">WCAG</th>
                  <th className="py-1 pl-2 text-right font-semibold">{pick("등급", "Grade")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {snapshot.contrastAudit.rows.map((row) => (
                  <tr key={row.roleId} data-testid={`atelier-vivid-contrast-row-${row.roleId}`}>
                    <td className="py-1.5 pr-2 font-medium text-fg [word-break:keep-all]">{isEn ? row.labelEn : row.labelKo}</td>
                    <td className="py-1.5 px-2 font-mono font-semibold text-fg tabular-nums">{`${row.wcagRatio}:1`}</td>
                    <td className="py-1.5 pl-2 text-right">
                      <span className="inline-flex rounded-md border border-good bg-good-soft px-2 py-0.5 font-mono text-[10px] font-bold text-good tabular-nums">{row.grade}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={pick("토큰 출력 형식", "Token export format")}>
              <button type="button" data-testid="atelier-vivid-tab-css" aria-pressed={previewFormat === "css"} onClick={() => { setPreviewFormat("css"); setShowDrawer(true); }} className={previewFormat === "css" ? BTN_ACTIVE : BTN_OUTLINE}>
                {pick("CSS 변수", "CSS Vars")}
              </button>
              <button type="button" data-testid="atelier-vivid-tab-json" aria-pressed={previewFormat === "json"} onClick={() => { setPreviewFormat("json"); setShowDrawer(true); }} className={previewFormat === "json" ? BTN_ACTIVE : BTN_OUTLINE}>
                {pick("JSON 매니페스트", "JSON Manifest")}
              </button>
            </div>
            <button type="button" data-testid="atelier-vivid-toggle-drawer-btn" aria-expanded={showDrawer} onClick={() => setShowDrawer((prev) => !prev)} className={showDrawer ? BTN_ACTIVE : BTN_OUTLINE}>
              {showDrawer ? pick("미리보기 접기", "Hide Preview") : pick("토큰 미리보기", "Show Preview")}
            </button>
          </div>
          {showDrawer ? (
            <pre data-testid="atelier-vivid-export-preview" data-format={previewFormat} className="max-h-52 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2 tabular-nums">
              {previewFormat === "css" ? cssOutput : jsonOutput}
            </pre>
          ) : (
            <p className="rounded-lg border border-line bg-card p-3 text-xs text-fg-2 [word-break:keep-all]">
              {pick("상단 복사 버튼 또는 토큰 미리보기를 누르면 현재 팔레트의 순수 OKLCH CSS 변수와 JSON 매니페스트를 바로 확인할 수 있습니다.", "Select Copy or Show Preview to inspect the pure OKLCH CSS variable sheet and JSON manifest for the active mood.")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
