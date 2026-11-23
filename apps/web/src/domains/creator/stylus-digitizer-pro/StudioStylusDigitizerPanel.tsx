/**
 * 태블릿·디지타이저 7대 하드웨어 통합 제어 & 실시간 텔레메트리 패널:
 * 호버 3D 틸트·배럴롤·뒷면지우개·펜전용 팜리젝션·240Hz 예측·1:1 종횡비 잠금·브러시별 독립 필압 & 햅틱.
 * Calm Atelier 시맨틱 토큰 전용 (원시 색상 0건 · 명시적 transition 속성만 사용 · 브라우저 스토리지 비의존 · KO/EN).
 */

import { Activity, Compass, Eraser, Hand, Maximize2, PenTool, Sliders, Sparkles, Vibrate } from "lucide-react";
import { useId, useMemo, useState, type PointerEvent, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  DEFAULT_BRUSH_PRESSURE_CURVES, DEFAULT_STYLUS_SIDE_BINDINGS, DIGITIZER_TABLET_PRESETS,
  computeHoverNibPreview, createInitialSpringLoadedStylusState, evaluatePerBrushPressureCurve,
  extractAndPredictStylusSamples, mapDigitizerForceProportions, routeMultitouchGesture,
  stepSpringLoadedStylusTool, triggerStylusHapticDetent,
  type StylusNibShape, type StylusSideButtonBindings, type StylusTemporaryTool,
} from "./stylus-digitizer-hardware-engine";

export type DigitizerMonitorPresetId = "qhd-16-9" | "ultrawide-21-9" | "dual-32-9";

export interface StudioStylusDigitizerPanelProps {
  readonly locale?: "ko" | "en";
  readonly initialHoverPreviewEnabled?: boolean; readonly initialBarrelRollEnabled?: boolean;
  readonly initialStylusOnlyDrawLock?: boolean; readonly initialForceProportionsEnabled?: boolean;
  readonly initialPrediction240HzEnabled?: boolean; readonly initialPerBrushPressureEnabled?: boolean;
  readonly initialHapticDetentEnabled?: boolean; readonly initialTabletPresetId?: string;
  readonly initialMonitorPresetId?: DigitizerMonitorPresetId; readonly initialBrushId?: string;
  readonly className?: string;
}

const MONITOR_PRESETS: readonly { readonly id: DigitizerMonitorPresetId; readonly ko: string; readonly en: string; readonly w: number; readonly h: number }[] = [
  { id: "qhd-16-9", ko: "16:9 QHD (2560×1440)", en: "16:9 QHD (2560×1440)", w: 2560, h: 1440 },
  { id: "ultrawide-21-9", ko: "21:9 울트라와이드 (3440×1440)", en: "21:9 Ultrawide (3440×1440)", w: 3440, h: 1440 },
  { id: "dual-32-9", ko: "32:9 듀얼 (5120×1440)", en: "32:9 Dual (5120×1440)", w: 5120, h: 1440 },
];
const NIB_SHAPES: readonly { readonly id: StylusNibShape; readonly ko: string; readonly en: string }[] = [
  { id: "flat-bristle", ko: "납작 붓모", en: "Flat Bristle" },
  { id: "chisel-calligraphy", ko: "캘리 치즐", en: "Chisel Nib" },
  { id: "g-pen", ko: "G펜 닙", en: "G-Pen Nib" },
  { id: "round", ko: "원형 팁", en: "Round Tip" },
];
const SIDE_TOOL_OPTIONS: readonly { readonly id: StylusTemporaryTool; readonly ko: string; readonly en: string }[] = [
  { id: "eyedropper", ko: "스포이드", en: "Eyedropper" },
  { id: "eraser", ko: "지우개", en: "Eraser" },
  { id: "radial-palette", ko: "방사형 팔레트", en: "Radial Palette" },
];
const BRUSH_IDS: readonly string[] = ["g-pen", "pencil-6b", "watercolor-wet", "airbrush", "eraser-hard"];
const TOOL_LABELS: Readonly<Record<string, readonly [string, string]>> = {
  "g-pen": ["G펜", "G-Pen"], eyedropper: ["스포이드", "Eyedropper"],
  eraser: ["지우개", "Eraser"], "radial-palette": ["방사형 팔레트", "Radial Palette"],
};

const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BTN_SOLID = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-canvas px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised ${FOCUS_RING} [word-break:keep-all]`;

export function StudioStylusDigitizerPanel({
  locale, initialHoverPreviewEnabled = true, initialBarrelRollEnabled = true,
  initialStylusOnlyDrawLock = true, initialForceProportionsEnabled = true,
  initialPrediction240HzEnabled = true, initialPerBrushPressureEnabled = true,
  initialHapticDetentEnabled = true, initialTabletPresetId = "wacom-intuos-pro-m",
  initialMonitorPresetId = "ultrawide-21-9", initialBrushId = "g-pen", className = "",
}: StudioStylusDigitizerPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isEn = (locale ?? storeLang) === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [hoverPreviewEnabled, setHoverPreviewEnabled] = useState(initialHoverPreviewEnabled);
  const [barrelRollEnabled, setBarrelRollEnabled] = useState(initialBarrelRollEnabled);
  const [stylusOnlyDrawLock, setStylusOnlyDrawLock] = useState(initialStylusOnlyDrawLock);
  const [forceProportionsEnabled, setForceProportionsEnabled] = useState(initialForceProportionsEnabled);
  const [prediction240HzEnabled, setPrediction240HzEnabled] = useState(initialPrediction240HzEnabled);
  const [perBrushPressureEnabled, setPerBrushPressureEnabled] = useState(initialPerBrushPressureEnabled);
  const [hapticDetentEnabled, setHapticDetentEnabled] = useState(initialHapticDetentEnabled);

  const [nibShape, setNibShape] = useState<StylusNibShape>("flat-bristle");
  const [tiltX, setTiltX] = useState(28);
  const [tiltY, setTiltY] = useState(-16);
  const [twistDeg, setTwistDeg] = useState(42);
  const [hoverMm, setHoverMm] = useState(5.5);

  const [sideBindings, setSideBindings] = useState<StylusSideButtonBindings>(DEFAULT_STYLUS_SIDE_BINDINGS);
  const [stylusToolState, setStylusToolState] = useState(() => createInitialSpringLoadedStylusState("g-pen"));
  const [tabletPresetId, setTabletPresetId] = useState(initialTabletPresetId);
  const [monitorPresetId, setMonitorPresetId] = useState<DigitizerMonitorPresetId>(initialMonitorPresetId);
  const [selectedBrushId, setSelectedBrushId] = useState(initialBrushId);
  const [probePressure, setProbePressure] = useState(0.45);
  const [statusMessage, setStatusMessage] = useState("");
  const [lastHapticAtMs, setLastHapticAtMs] = useState<number | null>(null);

  const hoverPreview = useMemo(() => computeHoverNibPreview({
    x: 90, y: 66, tiltX, tiltY, twist: twistDeg, hoverAltitudeMm: hoverMm,
    isHovering: true, nibShape, baseDiameterPx: 34, barrelRollEnabled,
  }), [barrelRollEnabled, hoverMm, nibShape, tiltX, tiltY, twistDeg]);

  const activeTablet = useMemo(() => DIGITIZER_TABLET_PRESETS.find((t) => t.id === tabletPresetId) ?? DIGITIZER_TABLET_PRESETS[0], [tabletPresetId]);
  const activeMonitor = useMemo(() => MONITOR_PRESETS.find((m) => m.id === monitorPresetId) ?? MONITOR_PRESETS[1], [monitorPresetId]);

  const proportions = useMemo(() => mapDigitizerForceProportions({
    tabletWidthMm: activeTablet.activeWidthMm, tabletHeightMm: activeTablet.activeHeightMm,
    monitorWidthPx: activeMonitor.w, monitorHeightPx: activeMonitor.h,
    rawNormX: 0.5, rawNormY: 0.5, forceProportions: forceProportionsEnabled, alignment: "center",
  }), [activeMonitor, activeTablet, forceProportionsEnabled]);

  const pressureEval = useMemo(
    () => evaluatePerBrushPressureCurve(selectedBrushId, probePressure, DEFAULT_BRUSH_PRESSURE_CURVES, { perBrushEnabled: perBrushPressureEnabled }),
    [perBrushPressureEnabled, probePressure, selectedBrushId],
  );

  const predictionTelemetry = useMemo(() => extractAndPredictStylusSamples({
    x: 164, y: 92, timeStamp: 16.66, pressure: probePressure, tiltX, tiltY, twist: twistDeg,
    getCoalescedEvents: () => [
      { x: 148, y: 86, timeStamp: 4.16, pressure: probePressure, tiltX, tiltY, twist: twistDeg },
      { x: 153, y: 88, timeStamp: 8.33, pressure: probePressure, tiltX, tiltY, twist: twistDeg },
      { x: 159, y: 90, timeStamp: 12.5, pressure: probePressure, tiltX, tiltY, twist: twistDeg },
      { x: 164, y: 92, timeStamp: 16.66, pressure: probePressure, tiltX, tiltY, twist: twistDeg },
    ],
  }, [], { targetHz: 240, enablePrediction: prediction240HzEnabled, frameHorizonMs: 8.33 }), [prediction240HzEnabled, probePressure, tiltX, tiltY, twistDeg]);

  const fireDetent = (kind: "angle-snap" | "squeeze-palette" | "tool-switch" | "slider-detent", ko: string, en: string): void => {
    const now = Date.now();
    const res = triggerStylusHapticDetent(kind, { enabled: hapticDetentEnabled, timestampMs: now, lastTriggeredAtMs: lastHapticAtMs });
    if (res.triggered) setLastHapticAtMs(now);
    setStatusMessage(pick(ko, en));
  };

  const handlePadPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.pointerType !== "pen") return;
    setTiltX(Math.round(e.tiltX)); setTiltY(Math.round(e.tiltY));
    if (typeof e.twist === "number") setTwistDeg(Math.round(e.twist));
    setStylusToolState((prev) => stepSpringLoadedStylusTool(prev, { type: "rear-eraser", pointerType: "pen", buttons: e.buttons, button: e.button }, sideBindings));
  };

  const toggleItems: readonly { readonly id: string; readonly ko: string; readonly en: string; readonly active: boolean; readonly onToggle: () => void }[] = [
    { id: "hover", ko: "호버 3D 프리뷰", en: "3D Hover Preview", active: hoverPreviewEnabled, onToggle: () => setHoverPreviewEnabled((v) => !v) },
    { id: "barrel", ko: "배럴 롤 360°", en: "360° Barrel Roll", active: barrelRollEnabled, onToggle: () => setBarrelRollEnabled((v) => !v) },
    { id: "palm", ko: "펜 전용 팜 리젝션", en: "Stylus-Only Palm Lock", active: stylusOnlyDrawLock, onToggle: () => setStylusOnlyDrawLock((v) => !v) },
    { id: "ratio", ko: "1:1 종횡비 잠금", en: "Force Proportions 1:1", active: forceProportionsEnabled, onToggle: () => setForceProportionsEnabled((v) => !v) },
    { id: "hz240", ko: "240Hz 예측 보간", en: "240Hz 1-Frame Predict", active: prediction240HzEnabled, onToggle: () => setPrediction240HzEnabled((v) => !v) },
    { id: "brush-curve", ko: "브러시별 독립 필압", en: "Per-Brush Pressure", active: perBrushPressureEnabled, onToggle: () => setPerBrushPressureEnabled((v) => !v) },
    { id: "haptic", ko: "햅틱 디텐트", en: "Haptic Detents", active: hapticDetentEnabled, onToggle: () => setHapticDetentEnabled((v) => !v) },
  ];

  const toolLabel = (tool: string): string => (TOOL_LABELS[tool] ? pick(TOOL_LABELS[tool][0], TOOL_LABELS[tool][1]) : tool);
  const curvePathD = pressureEval.curvePreview11.map((pt, i) => `${i === 0 ? "M" : "L"}${(8 + pt.x * 144).toFixed(1)},${(74 - pt.y * 64).toFixed(1)}`).join(" ");
  const activeRectStyle = {
    left: `${(proportions.activeAreaMm.xMm / activeTablet.activeWidthMm) * 100}%`,
    top: `${(proportions.activeAreaMm.yMm / activeTablet.activeHeightMm) * 100}%`,
    width: `${(proportions.activeAreaMm.widthMm / activeTablet.activeWidthMm) * 100}%`,
    height: `${(proportions.activeAreaMm.heightMm / activeTablet.activeHeightMm) * 100}%`,
  };

  return (
    <section aria-label={pick("태블릿·디지타이저 7대 하드웨어 엔진 패널", "Tablet & Stylus Digitizer Hardware Panel")} className={`flex flex-col gap-4 rounded-2xl border border-line bg-panel p-5 text-fg [word-break:keep-all] ${className}`.trim()}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3.5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <PenTool className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-base font-bold text-fg">{pick("태블릿 · 디지타이저 7대 하드웨어 프로 엔진", "Stylus & Digitizer 7-Hardware Pro Engine")}</h2>
          </div>
          <p className="text-xs text-fg-2">{pick("호버 3D 틸트·배럴롤·뒷면지우개·펜전용 팜리젝션·240Hz 예측·1:1 종횡비 잠금·브러시별 독립 필압을 통합 제어합니다.", "Control 3D hover tilt, 360° barrel roll, rear eraser, stylus-only palm lock, 240Hz prediction, 1:1 Force Proportions, and per-brush pressure.")}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-good-soft px-3 py-1 text-xs font-semibold text-good tabular-nums">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />{`${predictionTelemetry.effectiveInputHz}Hz · -${predictionTelemetry.estimatedLatencySavedMs}ms`}
        </span>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label={pick("7대 하드웨어 기능 토글", "7 Hardware Feature Toggles")}>
        {toggleItems.map((item) => (
          <button key={item.id} type="button" aria-pressed={item.active} onClick={item.onToggle} className={item.active ? BTN_SOLID : BTN_OUTLINE}>{pick(item.ko, item.en)}</button>
        ))}
      </div>

      {statusMessage ? (
        <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-xs font-semibold text-accent">
          <Vibrate className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>{statusMessage}</span>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><Compass className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-bold text-fg">{pick("실시간 3D 호버 틸트 · 배럴 롤 윤곽 카드", "Live 3D Hover Tilt & Barrel Roll Card")}</h3></div>
            <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent tabular-nums">
              {hoverPreviewEnabled ? pick(`고도 ${hoverPreview.altitudeDeg}° · 롤 ${hoverPreview.barrelRotationDeg}°`, `Alt ${hoverPreview.altitudeDeg}° · Roll ${hoverPreview.barrelRotationDeg}°`) : pick("호버 꺼짐", "Hover Off")}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {NIB_SHAPES.map((s) => (<button key={s.id} type="button" aria-pressed={nibShape === s.id} onClick={() => setNibShape(s.id)} className={nibShape === s.id ? BTN_SOLID : BTN_OUTLINE}>{pick(s.ko, s.en)}</button>))}
          </div>
          <div onPointerMove={handlePadPointerMove} className="grid items-center gap-3 sm:grid-cols-[180px_1fr]">
            <svg viewBox="0 0 180 132" role="img" aria-label={pick("펜 호버 3D 틸트 윤곽 프리뷰", "Stylus hover 3D tilt nib preview")} className="h-32 w-full rounded-lg border border-line bg-canvas text-accent">
              {hoverPreviewEnabled ? (
                <>
                  <ellipse cx={hoverPreview.shadowEllipse.cx} cy={hoverPreview.shadowEllipse.cy} rx={hoverPreview.shadowEllipse.rx} ry={hoverPreview.shadowEllipse.ry} transform={`rotate(${hoverPreview.shadowEllipse.rotationDeg} ${hoverPreview.shadowEllipse.cx} ${hoverPreview.shadowEllipse.cy})`} fill="currentColor" opacity={hoverPreview.shadowEllipse.opacity} className="text-fg-3" />
                  <path d={hoverPreview.outlinePathD} fill="currentColor" fillOpacity={0.14} stroke="currentColor" strokeWidth={2} opacity={hoverPreview.previewOpacity} />
                  <line x1={hoverPreview.barrelAxisLine.x1} y1={hoverPreview.barrelAxisLine.y1} x2={hoverPreview.barrelAxisLine.x2} y2={hoverPreview.barrelAxisLine.y2} stroke="currentColor" strokeWidth={2} strokeDasharray="3 2" className="text-fg-2" />
                  <circle cx={hoverPreview.center.x} cy={hoverPreview.center.y} r={2.5} fill="currentColor" />
                </>
              ) : (
                <circle cx={90} cy={66} r={14} fill="none" stroke="currentColor" strokeWidth={1.5} strokeDasharray="4 3" className="text-fg-3" />
              )}
            </svg>
            <div className="flex flex-col gap-2 text-xs">
              <label htmlFor={`${uid}-tilt-x`} className="flex justify-between font-semibold text-fg-2"><span>{pick("틸트 X / Y", "Tilt X / Y")}</span><span className="text-fg tabular-nums">{`${tiltX}° / ${tiltY}°`}</span></label>
              <input id={`${uid}-tilt-x`} type="range" min={-60} max={60} step={2} value={tiltX} onChange={(e) => setTiltX(Number(e.target.value))} className="w-full accent-accent" />
              <label htmlFor={`${uid}-twist`} className="flex justify-between font-semibold text-fg-2"><span>{pick("배럴 롤 (Twist 360°)", "Barrel Roll (360° Twist)")}</span><span className="text-fg tabular-nums">{`${twistDeg}°`}</span></label>
              <input id={`${uid}-twist`} type="range" min={0} max={359} step={1} value={twistDeg} onChange={(e) => setTwistDeg(Number(e.target.value))} className="w-full accent-accent" />
              <label htmlFor={`${uid}-hover-mm`} className="flex justify-between font-semibold text-fg-2"><span>{pick("호버 높이", "Hover Height")}</span><span className="text-fg tabular-nums">{`${hoverMm.toFixed(1)}mm`}</span></label>
              <input id={`${uid}-hover-mm`} type="range" min={0} max={14} step={0.5} value={hoverMm} onChange={(e) => setHoverMm(Number(e.target.value))} className="w-full accent-accent" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
            <div className="rounded-lg bg-canvas px-2.5 py-1.5"><span className="block text-fg-3">{pick("방위각", "Azimuth")}</span><strong className="text-fg">{`${hoverPreview.azimuthDeg}°`}</strong></div>
            <div className="rounded-lg bg-canvas px-2.5 py-1.5"><span className="block text-fg-3">{pick("기울기", "Tilt Mag")}</span><strong className="text-fg">{`${hoverPreview.tiltMagnitudeDeg}°`}</strong></div>
            <div className="rounded-lg bg-canvas px-2.5 py-1.5"><span className="block text-fg-3">{pick("윤곽 반경", "Nib Radius")}</span><strong className="text-fg">{`${hoverPreview.majorRadiusPx}×${hoverPreview.minorRadiusPx}px`}</strong></div>
          </div>
        </article>

        <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><Maximize2 className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-bold text-fg">{pick("판 태블릿 1:1 종횡비 잠금 라이브 카드", "Pen Tablet 1:1 Force Proportions Card")}</h3></div>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${proportions.aspectDistortionRatio <= 1.005 ? "bg-good-soft text-good" : "bg-warning-soft text-warn"}`}>
              {pick(`왜곡 ${proportions.aspectDistortionRatio.toFixed(2)}× · 정원 ${proportions.circleRoundnessPct}%`, `Distortion ${proportions.aspectDistortionRatio.toFixed(2)}× · Round ${proportions.circleRoundnessPct}%`)}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {MONITOR_PRESETS.map((m) => (<button key={m.id} type="button" aria-pressed={monitorPresetId === m.id} onClick={() => setMonitorPresetId(m.id)} className={monitorPresetId === m.id ? BTN_SOLID : BTN_OUTLINE}>{pick(m.ko, m.en)}</button>))}
          </div>
          <div className="grid items-center gap-3 sm:grid-cols-[176px_1fr]">
            <div className="relative h-28 w-full overflow-hidden rounded-lg border border-line bg-canvas p-1.5" aria-label={pick("태블릿 유효 영역 도식", "Tablet active mapping diagram")}>
              <div className="absolute rounded border-2 border-accent bg-accent-soft transition-transform motion-reduce:transition-none" style={activeRectStyle} />
              <span className="relative z-10 rounded bg-panel px-1.5 py-0.5 text-[11px] font-semibold text-fg tabular-nums">{`${proportions.activeAreaMm.widthMm}×${proportions.activeAreaMm.heightMm}mm`}</span>
            </div>
            <div className="flex flex-col gap-2 text-xs">
              <label htmlFor={`${uid}-tablet-preset`} className="font-semibold text-fg-2">{pick("판 태블릿 기종", "Digitizer Tablet Model")}</label>
              <select id={`${uid}-tablet-preset`} value={tabletPresetId} onChange={(e) => setTabletPresetId(e.target.value)} className={`min-h-11 rounded-lg border border-line bg-canvas px-2.5 text-xs text-fg ${FOCUS_RING}`}>
                {DIGITIZER_TABLET_PRESETS.map((t) => (<option key={t.id} value={t.id}>{pick(t.labelKo, t.labelEn)}</option>))}
              </select>
              <div className="grid grid-cols-2 gap-1.5 tabular-nums">
                <div className="rounded-lg bg-canvas px-2 py-1.5"><span className="block text-fg-3">{pick("X / Y 밀도", "X / Y Scale")}</span><strong className="text-fg">{`${proportions.pxPerMmX.toFixed(1)} / ${proportions.pxPerMmY.toFixed(1)}`}</strong></div>
                <div className="rounded-lg bg-canvas px-2 py-1.5"><span className="block text-fg-3">{pick("활용 면적", "Active Area")}</span><strong className="text-fg">{`${proportions.activeAreaMm.utilizationPct}%`}</strong></div>
              </div>
            </div>
          </div>
        </article>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><Eraser className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-bold text-fg">{pick("사이드버튼 Spring-Loaded · 뒷면 지우개 · 멀티터치", "Side-Button Spring-Loaded · Rear Eraser · Multitouch")}</h3></div>
            <span data-testid="stylus-active-tool-badge" className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent">
              {pick(`활성 도구: ${toolLabel(stylusToolState.activeTool)}`, `Active: ${toolLabel(stylusToolState.activeTool)}`)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-fg-2">{pick("사이드버튼 1 매핑:", "Side Button 1:")}</span>
            {SIDE_TOOL_OPTIONS.map((opt) => (<button key={opt.id} type="button" aria-pressed={sideBindings["side-primary"] === opt.id} onClick={() => setSideBindings((b) => ({ ...b, "side-primary": opt.id }))} className={sideBindings["side-primary"] === opt.id ? BTN_SOLID : BTN_OUTLINE}>{pick(opt.ko, opt.en)}</button>))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button" className={stylusToolState.isSpringLoadedActive ? BTN_SOLID : BTN_OUTLINE}
              onPointerDown={() => { setStylusToolState((s) => stepSpringLoadedStylusTool(s, { type: "press", trigger: "side-primary", timestampMs: Date.now() }, sideBindings)); fireDetent("tool-switch", "사이드버튼 누르는 동안 임시 도구로 전환했습니다.", "Switched to temporary tool while holding side button."); }}
              onPointerUp={() => { setStylusToolState((s) => stepSpringLoadedStylusTool(s, { type: "release", trigger: "side-primary", timestampMs: Date.now() }, sideBindings)); setStatusMessage(pick("사이드버튼에서 손을 떼어 기본 도구로 즉시 원복했습니다.", "Released side button and reverted to base tool.")); }}
            >{pick("사이드버튼 홀드 테스트", "Hold Side Button")}</button>
            <button
              type="button" aria-pressed={stylusToolState.isRearEraserActive} className={stylusToolState.isRearEraserActive ? BTN_SOLID : BTN_OUTLINE}
              onClick={() => {
                const nextButtons = stylusToolState.isRearEraserActive ? 0 : 32;
                setStylusToolState((s) => stepSpringLoadedStylusTool(s, { type: "rear-eraser", pointerType: "pen", buttons: nextButtons }, sideBindings));
                fireDetent("tool-switch", nextButtons === 32 ? "펜 뒷면 지우개(buttons=32)로 전환했습니다." : "펜 촉 기본 도구로 복귀했습니다.", nextButtons === 32 ? "Switched to pen rear eraser (buttons=32)." : "Returned to pen nib base tool.");
              }}
            >{pick("펜 뒷면 지우개 (buttons=32)", "Pen Rear Eraser (buttons=32)")}</button>
            <button
              type="button" className={BTN_OUTLINE}
              onClick={() => { const g = routeMultitouchGesture({ contacts: [{ id: 1, x: 40, y: 40 }, { id: 2, x: 80, y: 42 }], durationMs: 120, maxTravelPx: 4 }); fireDetent("angle-snap", `${g.labelKo} 라우팅 완료`, `Routed: ${g.labelEn}`); }}
            ><Hand className="h-3.5 w-3.5" aria-hidden="true" /> {pick("2손가락 Undo 테스트", "Test 2-Finger Undo")}</button>
          </div>
        </article>

        <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><Sliders className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-bold text-fg">{pick("브러시별 독립 필압 커브 & 240Hz 예측", "Per-Brush Pressure Curve & 240Hz Prediction")}</h3></div>
            <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2.5 py-0.5 text-xs font-semibold text-fg-2 tabular-nums">
              <Activity className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{`${Math.round(pressureEval.rawPressure * 100)}% → ${Math.round(pressureEval.mappedPressure * 100)}%`}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {BRUSH_IDS.map((id) => {
              const p = DEFAULT_BRUSH_PRESSURE_CURVES[id];
              return (<button key={id} type="button" aria-pressed={selectedBrushId === id} onClick={() => setSelectedBrushId(id)} className={selectedBrushId === id ? BTN_SOLID : BTN_OUTLINE}>{pick(p.labelKo.split(" ")[0], p.labelEn.split(" (")[0])}</button>);
            })}
          </div>
          <div className="grid items-center gap-3 sm:grid-cols-[160px_1fr]">
            <svg viewBox="0 0 160 82" role="img" aria-label={pick("브러시 필압 커브 그래프", "Brush pressure curve graph")} className="h-20 w-full rounded-lg border border-line bg-canvas text-accent">
              <line x1={8} y1={74} x2={152} y2={10} stroke="currentColor" strokeWidth={1} strokeDasharray="3 3" className="text-fg-3" />
              <path d={curvePathD} fill="none" stroke="currentColor" strokeWidth={2.5} />
              <circle cx={8 + pressureEval.rawPressure * 144} cy={74 - pressureEval.mappedPressure * 64} r={4} fill="currentColor" />
            </svg>
            <div className="flex flex-col gap-1.5 text-xs">
              <label htmlFor={`${uid}-probe-p`} className="flex justify-between font-semibold text-fg-2"><span>{pick(pressureEval.profile.labelKo, pressureEval.profile.labelEn)}</span><span className="text-fg tabular-nums">{`${Math.round(probePressure * 100)}%`}</span></label>
              <input id={`${uid}-probe-p`} type="range" min={0.05} max={1} step={0.05} value={probePressure} onChange={(e) => setProbePressure(Number(e.target.value))} className="w-full accent-accent" />
              <p className="text-[11px] text-fg-2 tabular-nums">{pick(`크기 배율 ${pressureEval.effectiveSizeMultiplier.toFixed(2)}× · 불투명도 ${pressureEval.effectiveOpacityMultiplier.toFixed(2)}× · 예측 ${predictionTelemetry.predictedSamples.length}샘플`, `Size ${pressureEval.effectiveSizeMultiplier.toFixed(2)}× · Opacity ${pressureEval.effectiveOpacityMultiplier.toFixed(2)}× · ${predictionTelemetry.predictedSamples.length} pred samples`)}</p>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
