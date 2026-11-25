/**
 * Wave 59C — 아틀리에 하드웨어 비주얼 시그니처 라이브 쇼케이스 UI.
 *
 * - 4종 아틀리에 3단 표면 사다리 실시간 전환 + WCAG 2.2 / APCA 대비 감사 표
 * - 인터랙티브 카메라 렌즈형 15° 로터리 다이얼 · 동심원 곡률 슬라이더 · 5종 브러시 그레인 스와치
 * - 순수 시맨틱 SVG 2단 시각화(좌: 3단 표면 사다리 + 동심원 곡률 해부도, 우: 로터리 다이얼 + 85/10/5 균형)
 * - 모든 props 선택적, OKLCH·currentColor 전용, 원시 색상·바이올렛(270~320°) 0%
 */

import {
  CheckCircle2, Code2, Compass, Copy, Disc3, Eye, Gauge, Layers, Palette, RotateCcw, SlidersHorizontal,
} from "lucide-react";
import { useId, useMemo, useRef, useState, type ReactElement } from "react";

import { copyText } from "@/shared/lib/copy-text";

import {
  ATELIER_BRUSH_GRAIN_SWATCHES, ATELIER_SURFACE_THEMES,
  buildAtelierVisualSignatureSnapshot, exportAtelierDesignTokensCss, exportVisualSignatureJson,
  formatOklch, getAtelierSurfaceTheme,
  type AtelierSurfaceThemeId, type AtelierVisualSignatureSnapshot, type BrushGrainSwatchId, type RotaryDialModeId,
} from "./atelier-visual-signature-engine";

export interface StudioAtelierVisualSignaturePanelProps {
  readonly initialThemeId?: AtelierSurfaceThemeId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onThemeChange?: (snapshot: AtelierVisualSignatureSnapshot) => void;
  readonly onExportCss?: (cssText: string, snapshot: AtelierVisualSignatureSnapshot) => void | Promise<void>;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

const CONCENTRIC_PRESETS = [
  { id: "compact", labelKo: "콤팩트 8+8", labelEn: "Compact 8+8", inner: 8, padding: 8 },
  { id: "standard", labelKo: "표준 12+8", labelEn: "Standard 12+8", inner: 12, padding: 8 },
  { id: "atelier", labelKo: "여유 16+16", labelEn: "Atelier 16+16", inner: 16, padding: 16 },
] as const;

const DIAL_MODES: readonly { readonly id: RotaryDialModeId; readonly labelKo: string; readonly labelEn: string }[] = [
  { id: "canvas-rotation", labelKo: "캔버스 회전", labelEn: "Canvas Rotate" },
  { id: "brush-angle", labelKo: "브러시 각도", labelEn: "Brush Angle" },
  { id: "zoom-magnification", labelKo: "줌 배율", labelEn: "Lens Zoom" },
];

const FLICK_VELOCITIES = [
  { id: "still", velocity: 0, labelKo: "정지 0°/s", labelEn: "Still 0°/s" },
  { id: "tick", velocity: 120, labelKo: "가벼운 틱 120°/s", labelEn: "Tick 120°/s" },
  { id: "flick", velocity: 360, labelKo: "빠른 플릭 360°/s", labelEn: "Flick 360°/s" },
] as const;

function getPaletteCss(snapshot: AtelierVisualSignatureSnapshot) {
  const t = snapshot.theme;
  return {
    canvas: formatOklch(t.canvas), panel: formatOklch(t.panel), instrument: formatOklch(t.instrument),
    line: formatOklch(t.line), lineStrong: formatOklch(t.lineStrong), ink: formatOklch(t.ink), inkMuted: formatOklch(t.inkMuted),
    accent: formatOklch(t.accent), accentSoft: formatOklch(t.accent, 0.18), onAccent: formatOklch(t.onAccent),
    focusRing: formatOklch(t.focusRing), good: formatOklch(t.good),
  };
}

/** 좌측 SVG: 3단 표면 사다리(Canvas -> Panel -> Instrument) + 동심원 곡률 해부도. */
function SurfaceLadderConcentricSvg(props: {
  readonly snapshot: AtelierVisualSignatureSnapshot;
  readonly isEn: boolean;
}): ReactElement {
  const { snapshot, isEn } = props;
  const { theme, concentricAudit } = snapshot;
  const c = getPaletteCss(snapshot);
  const outerR = Math.min(34, concentricAudit.outerRadiusPx);
  const padVisual = Math.min(20, Math.max(4, Math.round(concentricAudit.paddingPx * 0.72)));
  const innerR = Math.max(2, outerR - padVisual);
  const ctrlGap = Math.max(4, Math.min(8, concentricAudit.controlGapPx));
  const ctrlR = Math.max(2, innerR - ctrlGap);

  return (
    <svg
      data-testid="atelier-sig-ladder-concentric-svg" data-theme-id={theme.id}
      data-outer-radius={concentricAudit.outerRadiusPx} data-inner-radius={concentricAudit.innerRadiusPx}
      data-padding-px={concentricAudit.paddingPx} data-concentric-error={concentricAudit.errorPx}
      data-violet-free="true" viewBox="0 0 360 248" role="img"
      aria-label={isEn ? `${theme.labelEn} 3-tier surface ladder and concentric curvature anatomy` : `${theme.labelKo} 3단 표면 사다리 및 동심원 곡률 해부도`}
      className="h-64 w-full rounded-xl border border-line-strong bg-canvas text-fg"
    >
      <rect x="0" y="0" width="360" height="248" rx="14" fill={c.panel} />

      <rect x="10" y="10" width="166" height="228" rx="12" fill={c.canvas} stroke={c.line} strokeWidth="1" />
      <text x="20" y="27" fill={c.ink} fontSize="8.6" fontWeight="700">{isEn ? "3-TIER SURFACE LADDER" : "3단 표면 사다리"}</text>
      <text x="20" y="39" fill={c.inkMuted} fontSize="6.9" fontFamily="monospace">{`${theme.polarity.toUpperCase()} · HUE ${theme.accentHueDeg}°`}</text>

      {theme.ladder.map((step, idx) => {
        const y = 50 + idx * 58;
        const inset = idx * 6;
        return (
          <g key={step.tokenName} data-surface-tier={step.tier}>
            <rect
              x={20 + inset} y={y} width={146 - inset * 2} height="48" rx={10 - idx * 2}
              fill={formatOklch(step.color)} stroke={idx === 2 ? c.accent : c.lineStrong} strokeWidth={idx === 2 ? "1.3" : "0.9"}
            />
            <text x={28 + inset} y={y + 17} fill={c.ink} fontSize="7.6" fontWeight="700">{`T${step.tier} · ${isEn ? step.labelEn : step.labelKo}`}</text>
            <text x={28 + inset} y={y + 30} fill={c.inkMuted} fontSize="6.5" fontFamily="monospace">{`L=${step.color.l.toFixed(3)} C=${step.color.c.toFixed(3)}`}</text>
            <text x={28 + inset} y={y + 41} fill={c.accent} fontSize="6.4" fontFamily="monospace">{isEn ? step.roleEn : step.roleKo}</text>
          </g>
        );
      })}

      <rect x="184" y="10" width="166" height="228" rx="12" fill={c.canvas} stroke={c.line} strokeWidth="1" />
      <text x="194" y="27" fill={c.ink} fontSize="8.6" fontWeight="700">{isEn ? "CONCENTRIC ANATOMY" : "동심원 곡률 해부도"}</text>
      <text x="194" y="39" fill={c.accent} fontSize="7" fontFamily="monospace" fontWeight="700">
        {`R${concentricAudit.outerRadiusPx} = R${concentricAudit.innerRadiusPx} + P${concentricAudit.paddingPx}`}
      </text>

      <rect x="198" y="52" width="138" height="118" rx={outerR} fill={c.panel} stroke={c.lineStrong} strokeWidth="1.2" />
      <rect x={198 + padVisual} y={52 + padVisual} width={138 - padVisual * 2} height={118 - padVisual * 2} rx={innerR} fill={c.instrument} stroke={c.accent} strokeWidth="1.3" />
      <rect
        x={198 + padVisual + ctrlGap} y={52 + padVisual + ctrlGap}
        width={Math.max(44, 138 - (padVisual + ctrlGap) * 2)} height={Math.max(36, 118 - (padVisual + ctrlGap) * 2)}
        rx={ctrlR} fill={c.accentSoft} stroke={c.focusRing} strokeWidth="1" strokeDasharray="3 2"
      />
      <circle cx={198 + outerR} cy={52 + outerR} r="2.6" fill={c.accent} />
      <line x1={198 + outerR} y1={52 + outerR} x2={198} y2={52 + outerR} stroke={c.accent} strokeWidth="0.9" strokeDasharray="2 2" />
      <text x="267" y="108" textAnchor="middle" fill={c.ink} fontSize="8.2" fontWeight="700">{isEn ? "ZERO DRIFT" : "동심 오차 0px"}</text>
      <text x="267" y="122" textAnchor="middle" fill={c.accent} fontSize="7.4" fontFamily="monospace" fontWeight="700">
        {`err ${concentricAudit.errorPx}px · ctrl R${concentricAudit.controlRadiusPx}`}
      </text>

      <rect x="196" y="182" width="142" height="44" rx="8" fill={c.instrument} stroke={c.line} strokeWidth="0.9" />
      <text x="205" y="198" fill={c.ink} fontSize="7.4" fontWeight="700">
        {isEn ? `8pt Grid: ${concentricAudit.is8ptRhythmAligned ? "ALIGNED" : "4pt HALF"}` : `8pt 리듬: ${concentricAudit.is8ptRhythmAligned ? "정확 일치" : "4pt 반박"}`}
      </text>
      <text x="205" y="214" fill={c.good} fontSize="7.1" fontFamily="monospace" fontWeight="700">
        {`SCORE ${concentricAudit.geometryScore}/100 · UNIT ${concentricAudit.rhythmUnitPx}px`}
      </text>
    </svg>
  );
}

/** 우측 SVG: 카메라 렌즈형 15° 로터리 다이얼 + 85/10/5 색 면적 균형 도해. */
function RotaryDialBalanceSvg(props: {
  readonly snapshot: AtelierVisualSignatureSnapshot;
  readonly isEn: boolean;
}): ReactElement {
  const { snapshot, isEn } = props;
  const { rotaryDial, concentricAudit, theme } = snapshot;
  const c = getPaletteCss(snapshot);
  const cx = 112;
  const cy = 104;
  const outerR = 72;
  const pointerRad = ((rotaryDial.normalizedAngleDeg - 90) * Math.PI) / 180;
  const pointerX = cx + Math.cos(pointerRad) * 53;
  const pointerY = cy + Math.sin(pointerRad) * 53;
  const bal = concentricAudit.visualBalance;
  const wNeutral = Math.round((bal.neutralSurfacePercent / 100) * 324);
  const wInk = Math.round((bal.inkChromePercent / 100) * 324);
  const wAccent = Math.max(10, 324 - wNeutral - wInk);

  return (
    <svg
      data-testid="atelier-sig-dial-balance-svg" data-theme-id={theme.id} data-dial-mode={rotaryDial.mode}
      data-snapped-angle={rotaryDial.snappedAngleDeg} data-detent-engaged={String(rotaryDial.detentEngaged)}
      data-balance-rule="85-10-5" data-violet-free="true" viewBox="0 0 360 248" role="img"
      aria-label={isEn ? `Camera-lens rotary dial at ${rotaryDial.readoutAngleText} and 85/10/5 color area balance` : `카메라 렌즈 로터리 다이얼 ${rotaryDial.readoutAngleText} 및 85/10/5 색 면적 균형 도해`}
      className="h-64 w-full rounded-xl border border-line-strong bg-canvas text-fg"
    >
      <rect x="0" y="0" width="360" height="248" rx="14" fill={c.panel} />
      <rect x="10" y="10" width="340" height="174" rx="12" fill={c.canvas} stroke={c.line} strokeWidth="1" />
      <circle cx={cx} cy={cy} r={outerR} fill={c.panel} stroke={c.lineStrong} strokeWidth="1.4" />
      <circle cx={cx} cy={cy} r={outerR - 9} fill={c.instrument} stroke={c.line} strokeWidth="0.9" />

      {rotaryDial.tickMarks.map((tick) => {
        const rad = ((tick.angleDeg - 90) * Math.PI) / 180;
        const innerTick = tick.kind === "cardinal" ? outerR - 18 : tick.kind === "major" ? outerR - 14 : outerR - 11;
        const isCurrent = tick.index === rotaryDial.detentIndex;
        return (
          <line
            key={`tick-${tick.index}`}
            x1={cx + Math.cos(rad) * innerTick} y1={cy + Math.sin(rad) * innerTick}
            x2={cx + Math.cos(rad) * (outerR - 3)} y2={cy + Math.sin(rad) * (outerR - 3)}
            stroke={isCurrent ? c.accent : tick.kind === "cardinal" ? c.ink : c.lineStrong}
            strokeWidth={isCurrent ? "2.4" : tick.kind === "cardinal" ? "1.6" : "0.9"}
          />
        );
      })}

      <line x1={cx} y1={cy} x2={pointerX} y2={pointerY} stroke={c.accent} strokeWidth="2.2" strokeLinecap="round" />
      <circle cx={pointerX} cy={pointerY} r="4.2" fill={c.accent} stroke={c.onAccent} strokeWidth="1" />
      <circle cx={cx} cy={cy} r="31" fill={c.canvas} stroke={c.accent} strokeWidth="1.4" />
      <text x={cx} y={cy - 4} textAnchor="middle" fill={c.ink} fontSize="9.8" fontFamily="monospace" fontWeight="700">{rotaryDial.readoutAngleText}</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill={c.accent} fontSize="7.4" fontFamily="monospace" fontWeight="700">{rotaryDial.readoutZoomText}</text>

      <text x="200" y="34" fill={c.ink} fontSize="8.6" fontWeight="700">{isEn ? "ROTARY DETENT INSTRUMENT" : "정밀 로터리 다이얼 계기"}</text>
      <rect x="200" y="44" width="138" height="36" rx="8" fill={c.instrument} stroke={c.line} strokeWidth="0.9" />
      <text x="210" y="59" fill={c.inkMuted} fontSize="6.8" fontFamily="monospace">{isEn ? "SNAP ANGLE · DETENT" : "스냅 각도 · 디텐트"}</text>
      <text x="210" y="73" fill={c.accent} fontSize="9" fontFamily="monospace" fontWeight="700">{`${rotaryDial.readoutAngleText} · #${String(rotaryDial.detentIndex).padStart(2, "0")}/24`}</text>

      <rect x="200" y="88" width="138" height="36" rx="8" fill={c.instrument} stroke={c.line} strokeWidth="0.9" />
      <text x="210" y="103" fill={c.inkMuted} fontSize="6.8" fontFamily="monospace">{isEn ? "INERTIA · HAPTIC PULSE" : "관성 투영 · 틱 강도"}</text>
      <text x="210" y="117" fill={c.ink} fontSize="8.3" fontFamily="monospace" fontWeight="700">{`${rotaryDial.projectedAngleDeg}° · ${Math.round(rotaryDial.hapticPulseStrength * 100)}%`}</text>

      <rect x="200" y="132" width="138" height="38" rx="8" fill={c.panel} stroke={c.lineStrong} strokeWidth="0.9" />
      <circle cx="212" cy="146" r="3.4" fill={rotaryDial.detentEngaged ? c.good : c.inkMuted} />
      <text x="221" y="149" fill={c.ink} fontSize="7.4" fontWeight="700">
        {rotaryDial.detentEngaged
          ? rotaryDial.isCardinal90 ? (isEn ? "90° CARDINAL LOCK" : "90° 기준각 잠금") : (isEn ? "15° DETENT LOCK" : "15° 디텐트 스냅")
          : (isEn ? "FREE CONTINUOUS" : "연속 미세 회전")}
      </text>
      <text x="210" y="162" fill={c.inkMuted} fontSize="6.6" fontFamily="monospace">{`ZOOM ${rotaryDial.readoutZoomText} · STEP ${rotaryDial.detentStepDeg}°`}</text>

      <rect x="10" y="190" width="340" height="48" rx="10" fill={c.canvas} stroke={c.line} strokeWidth="1" />
      <text x="18" y="205" fill={c.ink} fontSize="7.6" fontWeight="700">{isEn ? "85 / 10 / 5 VISUAL MASS RATIO" : "85 / 10 / 5 색 면적 균형"}</text>
      <text x="342" y="205" textAnchor="end" fill={c.good} fontSize="7" fontFamily="monospace" fontWeight="700">{`VIOLET 0% · ${theme.accentNameEn.toUpperCase()}`}</text>
      <rect x="18" y="213" width={wNeutral - 2} height="16" rx="4" fill={c.instrument} stroke={c.lineStrong} strokeWidth="0.8" />
      <rect x={18 + wNeutral} y="213" width={Math.max(10, wInk - 2)} height="16" rx="3" fill={c.inkMuted} />
      <rect x={18 + wNeutral + wInk} y="213" width={wAccent} height="16" rx="3" fill={c.accent} />
      <text x="24" y="224" fill={c.ink} fontSize="6.8" fontFamily="monospace" fontWeight="700">{`85% ${isEn ? "NEUTRAL SURFACE" : "중립 표면"}`}</text>
      <text x={18 + wNeutral + wInk / 2} y="224" textAnchor="middle" fill={c.canvas} fontSize="6.3" fontFamily="monospace" fontWeight="700">10%</text>
      <text x={18 + wNeutral + wInk + wAccent / 2} y="224" textAnchor="middle" fill={c.onAccent} fontSize="6.3" fontFamily="monospace" fontWeight="700">5%</text>
    </svg>
  );
}

/** 아틀리에 하드웨어 비주얼 시그니처 라이브 쇼케이스 패널. */
export function StudioAtelierVisualSignaturePanel(props: StudioAtelierVisualSignaturePanelProps): ReactElement {
  const isEn = props.locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);
  const uid = useId();
  const initialTheme = getAtelierSurfaceTheme(props.initialThemeId ?? "warm-alabaster").id;

  const [themeId, setThemeId] = useState<AtelierSurfaceThemeId>(initialTheme);
  const [innerRadiusPx, setInnerRadiusPx] = useState<number>(12);
  const [paddingPx, setPaddingPx] = useState<number>(8);
  const [rawAngleDeg, setRawAngleDeg] = useState<number>(15);
  const [angularVelocityDegPerSec, setAngularVelocityDegPerSec] = useState<number>(0);
  const [snapEnabled, setSnapEnabled] = useState<boolean>(true);
  const [dialMode, setDialMode] = useState<RotaryDialModeId>("canvas-rotation");
  const [brushSwatchId, setBrushSwatchId] = useState<BrushGrainSwatchId>("hanji-mulberry");
  const [previewFormat, setPreviewFormat] = useState<"css" | "json">("css");
  const [showTokenDrawer, setShowTokenDrawer] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const copyRequest = useRef(0);

  const snapshot = useMemo(
    () => buildAtelierVisualSignatureSnapshot({ themeId, innerRadiusPx, paddingPx, rawAngleDeg, angularVelocityDegPerSec, snapEnabled, dialMode, brushSwatchId }),
    [themeId, innerRadiusPx, paddingPx, rawAngleDeg, angularVelocityDegPerSec, snapEnabled, dialMode, brushSwatchId],
  );
  const cssOutput = useMemo(() => exportAtelierDesignTokensCss(snapshot), [snapshot]);
  const jsonOutput = useMemo(() => exportVisualSignatureJson(snapshot), [snapshot]);

  const emitSnapshot = (
    patch: Partial<{
      themeId: AtelierSurfaceThemeId; innerRadiusPx: number; paddingPx: number; rawAngleDeg: number;
      angularVelocityDegPerSec: number; snapEnabled: boolean; dialMode: RotaryDialModeId; brushSwatchId: BrushGrainSwatchId;
    }>,
  ): AtelierVisualSignatureSnapshot => {
    copyRequest.current += 1;
    const next = buildAtelierVisualSignatureSnapshot({
      themeId: patch.themeId ?? themeId, innerRadiusPx: patch.innerRadiusPx ?? innerRadiusPx, paddingPx: patch.paddingPx ?? paddingPx,
      rawAngleDeg: patch.rawAngleDeg ?? rawAngleDeg, angularVelocityDegPerSec: patch.angularVelocityDegPerSec ?? angularVelocityDegPerSec,
      snapEnabled: patch.snapEnabled ?? snapEnabled, dialMode: patch.dialMode ?? dialMode, brushSwatchId: patch.brushSwatchId ?? brushSwatchId,
    });
    props.onThemeChange?.(next);
    return next;
  };

  const handleSelectTheme = (nextThemeId: AtelierSurfaceThemeId): void => {
    setThemeId(nextThemeId);
    const next = emitSnapshot({ themeId: nextThemeId });
    setStatusMessage(pick(
      `'${next.theme.labelKo}' 미리보기 · 토큰 최저 대비 ${next.contrastAudit.worstWcagRatio}:1 (APCA |Lc| ${next.contrastAudit.worstApcaAbsLc})`,
      `Previewing ${next.theme.labelEn} · Min token contrast ${next.contrastAudit.worstWcagRatio}:1 (APCA |Lc| ${next.contrastAudit.worstApcaAbsLc}).`,
    ));
  };

  const handleDialAngle = (nextAngle: number, velocity: number = angularVelocityDegPerSec): void => {
    const clamped = Math.max(-180, Math.min(180, nextAngle));
    setRawAngleDeg(clamped);
    setAngularVelocityDegPerSec(velocity);
    const next = emitSnapshot({ rawAngleDeg: clamped, angularVelocityDegPerSec: velocity });
    setStatusMessage(pick(
      `로터리 다이얼 ${next.rotaryDial.readoutAngleText} (${next.rotaryDial.readoutZoomText}) · ${next.rotaryDial.detentEngaged ? "15° 디텐트 스냅" : "연속 미세 회전"}`,
      `Rotary dial at ${next.rotaryDial.readoutAngleText} (${next.rotaryDial.readoutZoomText}) · ${next.rotaryDial.detentEngaged ? "15° detent locked" : "free spin"}.`,
    ));
  };

  const handleConcentricChange = (nextInner: number, nextPadding: number): void => {
    setInnerRadiusPx(nextInner);
    setPaddingPx(nextPadding);
    const next = emitSnapshot({ innerRadiusPx: nextInner, paddingPx: nextPadding });
    setStatusMessage(pick(
      `동심원 곡률 R${next.concentricAudit.outerRadiusPx} = R${next.concentricAudit.innerRadiusPx} + P${next.concentricAudit.paddingPx} (오차 ${next.concentricAudit.errorPx}px)`,
      `Concentric radius R${next.concentricAudit.outerRadiusPx} = R${next.concentricAudit.innerRadiusPx} + P${next.concentricAudit.paddingPx} (${next.concentricAudit.errorPx}px drift).`,
    ));
  };

  const handleSelectBrushSwatch = (nextSwatchId: BrushGrainSwatchId): void => {
    setBrushSwatchId(nextSwatchId);
    const next = emitSnapshot({ brushSwatchId: nextSwatchId });
    setStatusMessage(pick(
      `종이 질감 '${next.activeBrushSwatch.labelKo}'(${next.activeBrushSwatch.paperWeightGsm}gsm) 선택`,
      `Selected paper grain '${next.activeBrushSwatch.labelEn}' (${next.activeBrushSwatch.paperWeightGsm}gsm).`,
    ));
  };

  const handleExportCss = async (): Promise<void> => {
    const request = ++copyRequest.current;
    setPreviewFormat("css");
    setShowTokenDrawer(true);
    const copying = copyText(cssOutput);
    let notified = true;
    try { await props.onExportCss?.(cssOutput, snapshot); } catch { notified = false; }
    const copied = await copying;
    if (request !== copyRequest.current) return;
    const baseMsg = copied
      ? pick("OKLCH CSS 디자인 토큰을 복사했습니다.", "Copied OKLCH CSS design tokens.")
      : pick("클립보드 복사가 제한되어 아래 미리보기에서 직접 복사해 주세요.", "Clipboard blocked; copy from the preview below.");
    setStatusMessage(notified ? baseMsg : `${baseMsg} ${pick("내보내기 콜백 전달에 실패했습니다.", "Export callback failed.")}`);
  };

  const handleCopyJson = async (): Promise<void> => {
    const request = ++copyRequest.current;
    setPreviewFormat("json");
    setShowTokenDrawer(true);
    const copied = await copyText(jsonOutput);
    if (request !== copyRequest.current) return;
    setStatusMessage(copied
      ? pick("비주얼 시그니처 JSON 명세를 복사했습니다.", "Copied visual signature JSON spec.")
      : pick("JSON 미리보기를 열었습니다. 직접 선택해 복사해 주세요.", "Opened JSON preview for manual copy."));
  };

  const handleReset = (): void => {
    setThemeId(initialTheme); setInnerRadiusPx(12); setPaddingPx(8); setRawAngleDeg(15);
    setAngularVelocityDegPerSec(0); setSnapEnabled(true); setDialMode("canvas-rotation");
    setBrushSwatchId("hanji-mulberry"); setShowTokenDrawer(false);
    emitSnapshot({ themeId: initialTheme, innerRadiusPx: 12, paddingPx: 8, rawAngleDeg: 15, angularVelocityDegPerSec: 0, snapEnabled: true, dialMode: "canvas-rotation", brushSwatchId: "hanji-mulberry" });
    setStatusMessage(pick("아틀리에 테마·곡률·다이얼 설정을 기본값으로 되돌렸습니다.", "Reset atelier theme, geometry, and dial defaults."));
  };

  return (
    <section
      data-testid="atelier-visual-signature-panel"
      aria-label={pick("아틀리에 비주얼 시그니처 계산 미리보기", "Atelier Hardware Visual Signature Calculation Preview")}
      aria-describedby={`${uid}-scope`}
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg md:p-5 ${props.className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span data-testid="atelier-sig-contrast-badge" className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent tabular-nums [word-break:keep-all]">
              <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {`${snapshot.contrastAudit.contrastStandard} · ${snapshot.contrastAudit.worstWcagRatio}:1 · |Lc| ${snapshot.contrastAudit.worstApcaAbsLc}`}
            </span>
            <span data-testid="atelier-sig-concentric-badge" className="inline-flex items-center gap-1 rounded-full border border-good bg-good-soft px-2.5 py-0.5 text-[11px] font-semibold text-good tabular-nums [word-break:keep-all]">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick(`동심원 오차 ${snapshot.concentricAudit.errorPx}px · 바이올렛 ${snapshot.violetAudit.violetPercent}%`, `Concentric ${snapshot.concentricAudit.errorPx}px · Violet ${snapshot.violetAudit.violetPercent}%`)}
            </span>
          </div>
          <h2 className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("아틀리에 3단 표면 사다리 · 동심원 곡률 · 로터리 다이얼 시그니처", "Atelier 3-Tier Surface Ladder · Concentric Curvature · Rotary Dial Signature")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick("프리셋 색상·곡률·다이얼을 SVG로 미리 보고, OKLCH 토큰의 WCAG 2.2 · APCA 대비를 계산합니다.", "Preview preset colors, geometry and dials in SVG, and calculate WCAG 2.2 and APCA contrast from OKLCH tokens.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="atelier-sig-export-css-btn" onClick={() => void handleExportCss()} className={BTN_SOLID}>
            <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("CSS 토큰 복사", "Copy CSS Tokens")}
          </button>
          <button type="button" data-testid="atelier-sig-export-json-btn" onClick={() => void handleCopyJson()} className={BTN_OUTLINE}>
            <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("JSON 복사", "Copy JSON")}
          </button>
          <button type="button" data-testid="atelier-sig-reset-btn" onClick={handleReset} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("초기화", "Reset")}
          </button>
        </div>
      </header>

      <p id={`${uid}-scope`} data-testid="atelier-sig-scope" className="text-xs text-fg-2 [word-break:keep-all]">
        {pick("패널 안의 계산 미리보기이며 실제 원고·브러시에는 적용되지 않습니다. 눈부심·청색광과 실제 화면 접근성은 측정하지 않습니다. 설정은 임시 상태이므로 패널을 닫기 전 필요한 CSS·JSON을 복사해 주세요.", "This panel previews calculations; it does not apply them to the manuscript or brush. Glare, blue light and rendered accessibility are not measured. Settings are temporary; copy the CSS or JSON before closing the panel.")}
      </p>
      <div role="status" aria-live="polite" data-testid="atelier-sig-status-banner" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
        {statusMessage || pick(`현재 '${snapshot.theme.labelKo}' 미리보기 · 총 ${snapshot.violetAudit.inspectedTokenCount}개 OKLCH 토큰 검사(바이올렛 0건)`, `Previewing '${snapshot.theme.labelEn}' · Inspected ${snapshot.violetAudit.inspectedTokenCount} OKLCH tokens (0 violet).`)}
      </div>

      {/* 4종 아틀리에 테마 실시간 전환 카드 */}
      <div className="space-y-2.5 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <Palette className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("4종 정본 아틀리에 표면 사다리 테마", "4 Canonical Atelier Surface Themes")}
          </h3>
          <span className="font-mono text-[11px] text-fg-3 tabular-nums">{pick(`시그니처 점수 ${snapshot.overallSignatureScore}/100`, `Signature ${snapshot.overallSignatureScore}/100`)}</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label={pick("아틀리에 테마 선택", "Select atelier theme")}>
          {ATELIER_SURFACE_THEMES.map((theme) => {
            const active = theme.id === themeId;
            return (
              <button
                key={theme.id} type="button" data-testid={`atelier-sig-theme-${theme.id}`} aria-pressed={active}
                onClick={() => handleSelectTheme(theme.id)}
                className={`flex min-h-11 flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${active ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"}`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-xs font-bold">{isEn ? theme.labelEn : theme.labelKo}</span>
                  <span className="font-mono text-[10px] font-semibold text-accent tabular-nums">{theme.contrastStandard}</span>
                </div>
                <div className="flex w-full items-center gap-1">
                  {theme.ladder.map((step) => (
                    <span key={step.tokenName} aria-hidden="true" className="h-3.5 flex-1 rounded-sm border border-line" style={{ backgroundColor: formatOklch(step.color) }} />
                  ))}
                  <span aria-hidden="true" className="h-3.5 w-5 rounded-sm border border-line" style={{ backgroundColor: formatOklch(theme.accent) }} />
                </div>
                <span className="text-[11px] text-fg-2">{isEn ? theme.accentNameEn : theme.accentNameKo}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 순수 시맨틱 SVG 2단 시각화 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("3단 표면 사다리 & 동심원 곡률 해부도", "3-Tier Surface Ladder & Concentric Anatomy")}
            </h3>
            <span className="font-mono text-[11px] text-accent tabular-nums">{`R${snapshot.concentricAudit.outerRadiusPx} = R${snapshot.concentricAudit.innerRadiusPx} + P${snapshot.concentricAudit.paddingPx}`}</span>
          </div>
          <SurfaceLadderConcentricSvg snapshot={snapshot} isEn={isEn} />
        </div>
        <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <Disc3 className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("카메라 렌즈 로터리 다이얼 & 85/10/5 균형", "Camera-Lens Rotary Dial & 85/10/5 Balance")}
            </h3>
            <span data-testid="atelier-sig-dial-readout" className="font-mono text-[11px] font-bold text-good tabular-nums">{`${snapshot.rotaryDial.readoutAngleText} · ${snapshot.rotaryDial.readoutZoomText}`}</span>
          </div>
          <RotaryDialBalanceSvg snapshot={snapshot} isEn={isEn} />
        </div>
      </div>

      {/* 로터리 다이얼 + 동심원 곡률 조절 */}
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-line bg-raised p-4 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <Compass className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("인터랙티브 로터리 다이얼(15° 디텐트 · 관성 스냅)", "Interactive Rotary Dial (15° Detent · Inertia Snap)")}
            </span>
            <button
              type="button" data-testid="atelier-sig-snap-toggle" aria-pressed={snapEnabled}
              onClick={() => { const nextSnap = !snapEnabled; setSnapEnabled(nextSnap); emitSnapshot({ snapEnabled: nextSnap }); }}
              className={snapEnabled ? BTN_ACTIVE : BTN_OUTLINE}
            >
              {snapEnabled ? pick("15° 스냅 켜짐", "15° Snap ON") : pick("연속 회전", "Free Spin")}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick("다이얼 모드", "Dial mode")}>
            {DIAL_MODES.map((m) => (
              <button
                key={m.id} type="button" data-testid={`atelier-sig-dial-mode-${m.id}`} aria-pressed={dialMode === m.id}
                onClick={() => { setDialMode(m.id); emitSnapshot({ dialMode: m.id }); }}
                className={dialMode === m.id ? BTN_ACTIVE : BTN_OUTLINE}
              >
                {isEn ? m.labelEn : m.labelKo}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-fg-2">
              <label htmlFor={`${uid}-dial-angle`}>{pick("원시 다이얼 각도 (-180° ~ +180°)", "Raw Dial Angle (-180° to +180°)")}</label>
              <span className="font-mono font-semibold text-fg tabular-nums">{`${rawAngleDeg}° → ${snapshot.rotaryDial.readoutAngleText}`}</span>
            </div>
            <input
              id={`${uid}-dial-angle`} data-testid="atelier-sig-dial-slider" type="range" min={-180} max={180} step={1}
              value={rawAngleDeg} onChange={(e) => handleDialAngle(Number(e.target.value))}
              className="h-2 w-full cursor-pointer accent-accent"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" data-testid="atelier-sig-dial-step-minus" onClick={() => handleDialAngle(rawAngleDeg - 15, 0)} className={BTN_OUTLINE}>-15°</button>
            <button type="button" data-testid="atelier-sig-dial-step-zero" onClick={() => handleDialAngle(0, 0)} className={BTN_OUTLINE}>{pick("0° 원점", "0° Home")}</button>
            <button type="button" data-testid="atelier-sig-dial-step-plus" onClick={() => handleDialAngle(rawAngleDeg + 15, 0)} className={BTN_OUTLINE}>+15°</button>
            {FLICK_VELOCITIES.map((preset) => (
              <button
                key={preset.id} type="button" data-testid={`atelier-sig-flick-${preset.id}`} aria-pressed={angularVelocityDegPerSec === preset.velocity}
                onClick={() => handleDialAngle(rawAngleDeg, preset.velocity)}
                className={angularVelocityDegPerSec === preset.velocity ? BTN_ACTIVE : BTN_OUTLINE}
              >
                {isEn ? preset.labelEn : preset.labelKo}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 lg:col-span-5">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("동심원 곡률 패딩 & 8pt 리듬 조절", "Concentric Radius & 8pt Rhythm Controls")}
          </span>
          <div className="space-y-2 rounded-xl border border-line bg-card p-3">
            <div className="flex items-center justify-between text-[11px]">
              <label htmlFor={`${uid}-inner-radius`} className="text-fg-2">{pick("내부 곡률 R_in", "Inner Radius R_in")}</label>
              <span className="font-mono font-semibold text-fg tabular-nums">{`${innerRadiusPx}px`}</span>
            </div>
            <input id={`${uid}-inner-radius`} data-testid="atelier-sig-inner-radius-slider" type="range" min={4} max={24} step={4} value={innerRadiusPx} onChange={(e) => handleConcentricChange(Number(e.target.value), paddingPx)} className="h-2 w-full cursor-pointer accent-accent" />
            <div className="flex items-center justify-between text-[11px]">
              <label htmlFor={`${uid}-shell-padding`} className="text-fg-2">{pick("외곽 패딩 P", "Shell Padding P")}</label>
              <span className="font-mono font-semibold text-fg tabular-nums">{`${paddingPx}px`}</span>
            </div>
            <input id={`${uid}-shell-padding`} data-testid="atelier-sig-padding-slider" type="range" min={4} max={24} step={4} value={paddingPx} onChange={(e) => handleConcentricChange(innerRadiusPx, Number(e.target.value))} className="h-2 w-full cursor-pointer accent-accent" />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {CONCENTRIC_PRESETS.map((preset) => {
                const isSelected = innerRadiusPx === preset.inner && paddingPx === preset.padding;
                return (
                  <button key={preset.id} type="button" data-testid={`atelier-sig-preset-${preset.id}`} aria-pressed={isSelected} onClick={() => handleConcentricChange(preset.inner, preset.padding)} className={isSelected ? BTN_ACTIVE : BTN_OUTLINE}>
                    {isEn ? preset.labelEn : preset.labelKo}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 브러시 그레인 스와치 스트립 */}
      <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <Gauge className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("한지·원고지 브러시 그레인 스와치 스트립", "Hanji & Paper Brush Grain Swatch Strip")}
          </span>
          <span data-testid="atelier-sig-active-swatch-meta" className="font-mono text-[11px] text-fg-2 tabular-nums">
            {`${isEn ? snapshot.activeBrushSwatch.labelEn : snapshot.activeBrushSwatch.labelKo} · ${snapshot.activeBrushSwatch.paperWeightGsm}gsm · Tooth ${Math.round(snapshot.activeBrushSwatch.toothDensity * 100)}%`}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="group" aria-label={pick("종이 질감 스와치", "Paper grain swatches")}>
          {ATELIER_BRUSH_GRAIN_SWATCHES.map((swatch) => {
            const active = swatch.id === brushSwatchId;
            return (
              <button
                key={swatch.id} type="button" data-testid={`atelier-sig-swatch-${swatch.id}`} aria-pressed={active}
                onClick={() => handleSelectBrushSwatch(swatch.id)}
                className={`flex min-h-11 flex-col items-start gap-1 rounded-xl border p-2.5 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${active ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"}`}
              >
                <span aria-hidden="true" className="h-3 w-full rounded-sm border border-line" style={{ backgroundColor: formatOklch(swatch.baseTone) }} />
                <span className="text-[11px] font-bold">{isEn ? swatch.labelEn : swatch.labelKo}</span>
                <span className="font-mono text-[10px] text-fg-3 tabular-nums">{`${swatch.paperWeightGsm}gsm · ${Math.round(swatch.inkAbsorbency * 100)}%`}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* WCAG 2.2 & APCA 대비 감사 표 */}
      <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-fg [word-break:keep-all]">{pick("WCAG 2.2 상대 휘도 & APCA(Lc) 대비 감사 표", "WCAG 2.2 Luminance & APCA (Lc) Contrast Audit Table")}</h3>
          <span className="font-mono text-[11px] text-good tabular-nums">{snapshot.contrastAudit.allMeetThemeTarget ? pick("전 항목 기준 통과", "All Pairs Pass Target") : pick("일부 기준 미달", "Needs Review")}</span>
        </div>
        <div className="overflow-x-auto">
          <table data-testid="atelier-sig-contrast-table" className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-line text-[11px] text-fg-3">
                <th className="py-1.5 pr-2 font-semibold">{pick("역할", "Role")}</th>
                <th className="py-1.5 px-2 font-semibold">{pick("색상 쌍", "Pair")}</th>
                <th className="py-1.5 px-2 font-semibold">WCAG 2.2</th>
                <th className="py-1.5 px-2 font-semibold">APCA Lc</th>
                <th className="py-1.5 pl-2 text-right font-semibold">{pick("등급", "Grade")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {snapshot.contrastAudit.rows.map((row) => (
                <tr key={row.roleId} data-testid={`atelier-sig-contrast-row-${row.roleId}`}>
                  <td className="py-2 pr-2 font-medium text-fg [word-break:keep-all]">{isEn ? row.labelEn : row.labelKo}</td>
                  <td className="py-2 px-2">
                    <span className="inline-flex items-center gap-1">
                      <span aria-hidden="true" className="h-3.5 w-3.5 rounded-sm border border-line" style={{ backgroundColor: formatOklch(row.foreground) }} />
                      <span aria-hidden="true" className="h-3.5 w-3.5 rounded-sm border border-line" style={{ backgroundColor: formatOklch(row.background) }} />
                    </span>
                  </td>
                  <td className="py-2 px-2 font-mono font-semibold text-fg tabular-nums">{`${row.wcagContrastRatio}:1`}</td>
                  <td className="py-2 px-2 font-mono text-fg-2 tabular-nums">{`${row.apcaLc > 0 ? "+" : ""}${row.apcaLc}`}</td>
                  <td className="py-2 pl-2 text-right">
                    <span className={`inline-flex rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums ${row.grade === "AAA" ? "border-good bg-good-soft text-good" : "border-accent bg-accent-soft text-accent"}`}>
                      {row.grade}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CSS 토큰 / JSON 미리보기 서랍 */}
      <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={pick("토큰 출력 형식", "Token output format")}>
            <button type="button" data-testid="atelier-sig-tab-css" aria-pressed={previewFormat === "css"} onClick={() => { setPreviewFormat("css"); setShowTokenDrawer(true); }} className={previewFormat === "css" ? BTN_ACTIVE : BTN_OUTLINE}>
              {pick("CSS 토큰", "CSS Tokens")}
            </button>
            <button type="button" data-testid="atelier-sig-tab-json" aria-pressed={previewFormat === "json"} onClick={() => { setPreviewFormat("json"); setShowTokenDrawer(true); }} className={previewFormat === "json" ? BTN_ACTIVE : BTN_OUTLINE}>
              {pick("JSON 명세", "JSON Spec")}
            </button>
          </div>
          <button type="button" data-testid="atelier-sig-toggle-drawer-btn" aria-expanded={showTokenDrawer} onClick={() => setShowTokenDrawer((prev) => !prev)} className={showTokenDrawer ? BTN_ACTIVE : BTN_OUTLINE}>
            {showTokenDrawer ? pick("미리보기 접기", "Hide Preview") : pick("토큰 미리보기", "Show Preview")}
          </button>
        </div>
        {showTokenDrawer ? (
          <pre data-testid="atelier-sig-token-preview" data-format={previewFormat} className="max-h-56 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2 tabular-nums">
            {previewFormat === "css" ? cssOutput : jsonOutput}
          </pre>
        ) : null}
      </div>
    </section>
  );
}
