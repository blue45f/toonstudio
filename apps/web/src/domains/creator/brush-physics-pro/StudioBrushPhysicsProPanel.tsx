/**
 * 물리 브러시 질감 엔진 Pro 통합 패널 (Wave 15B Track 2).
 * 5종 심리스 종이 높이장 · 듀얼 브러시 고정/굴림 결 · 수채 모세관 스며들기/웨트 엣지 ·
 * 2.5D 임파스토 광원 각도 · 이종 매체 상호작용 · 3종 필압 커브 · Canvas2D 라이브 스와치 · 실측 오라클.
 * Calm Atelier 시맨틱 토큰 전용 · 480줄 이하 · 모든 props 선택형 · KO/EN 지원.
 */

import { CheckCircle2, Droplets, Eraser, Layers, Paintbrush, RefreshCw, ShieldCheck, Sun } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  auditBrushTextureQuality, renderBrushPhysicsLiveSwatch,
  type BrushPhysicsLiveSwatchConfig, type BrushTextureQualityAuditReport,
} from "./brush-texture-quality-oracle";
import type { CrossMediaInteractionMode } from "./wet-soak-impasto-wax-resist";
import {
  PAPER_PRESETS, PAPER_PRESET_LIST, PRESSURE_CURVE_PRESET_LIST,
  type DualBrushTextureMode, type PaperPresetId, type PressureCurvePresetId,
} from "./world-paper-heightfield";

export interface StudioBrushPhysicsProPanelProps {
  readonly initialPaperPreset?: PaperPresetId;
  readonly initialDualMode?: DualBrushTextureMode;
  readonly initialPressureCurve?: PressureCurvePresetId;
  readonly initialInteractionMode?: CrossMediaInteractionMode;
  readonly initialSoakStrength?: number;
  readonly initialWetEdgeStrength?: number;
  readonly initialImpastoLightAzimuthDeg?: number;
  readonly initialTiltDeg?: number;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onConfigChange?: (config: BrushPhysicsLiveSwatchConfig) => void;
  readonly onAuditComplete?: (report: BrushTextureQualityAuditReport) => void;
}

const SWATCH_W = 240;
const SWATCH_H = 132;
const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const BTN_CHOICE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING}`;
const BTN_ACTIVE = "border-accent bg-accent-soft text-accent";
const BTN_IDLE = "border-line bg-canvas text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";

const DUAL_MODES: readonly { readonly id: DualBrushTextureMode; readonly ko: string; readonly en: string; readonly hintKo: string; readonly hintEn: string }[] = [
  { id: "fixed-world", ko: "종이 고정", en: "Fixed World", hintKo: "연필·크레파스", hintEn: "Pencil / Crayon" },
  { id: "rolling-tip", ko: "붓 굴림", en: "Rolling Tip", hintKo: "파스텔·목탄·붓", hintEn: "Pastel / Bristle" },
];

const INTERACTION_MODES: readonly { readonly id: CrossMediaInteractionMode; readonly ko: string; readonly en: string }[] = [
  { id: "wax-resist", ko: "왁스 레지스트", en: "Wax Resist" },
  { id: "kneaded-eraser", ko: "떡지우개", en: "Kneaded Eraser" },
  { id: "blending-stump", ko: "찰필 문지르기", en: "Blending Stump" },
];

interface PhysicsSliderProps {
  readonly id: string; readonly label: string; readonly valueText: string; readonly valueTestId: string;
  readonly min: number; readonly max: number; readonly step: number; readonly value: number;
  readonly onChange: (value: number) => void;
}

function PhysicsSlider({ id, label, valueText, valueTestId, min, max, step, value, onChange }: PhysicsSliderProps): ReactElement {
  return (
    <div className="space-y-1.5 rounded-xl border border-line bg-card p-3 text-xs">
      <div className="flex items-center justify-between gap-2 text-fg-2">
        <label htmlFor={id} className="font-medium">{label}</label>
        <span data-testid={valueTestId} className="font-bold tabular-nums text-fg">{valueText}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className={`w-full accent-accent ${FOCUS_RING}`} />
    </div>
  );
}

/** 6대 물리 브러시 질감 제어 · 라이브 Canvas2D 스와치 · 실측 품질 오라클 패널. */
export function StudioBrushPhysicsProPanel({
  initialPaperPreset = "cold-press", initialDualMode = "rolling-tip", initialPressureCurve = "standard",
  initialInteractionMode = "wax-resist", initialSoakStrength = 0.68, initialWetEdgeStrength = 0.82,
  initialImpastoLightAzimuthDeg = 315, initialTiltDeg = 54, locale, className, onConfigChange, onAuditComplete,
}: StudioBrushPhysicsProPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [paperPreset, setPaperPreset] = useState<PaperPresetId>(initialPaperPreset);
  const [dualMode, setDualMode] = useState<DualBrushTextureMode>(initialDualMode);
  const [pressureCurve, setPressureCurve] = useState<PressureCurvePresetId>(initialPressureCurve);
  const [interactionMode, setInteractionMode] = useState<CrossMediaInteractionMode>(initialInteractionMode);
  const [soakStrength, setSoakStrength] = useState<number>(initialSoakStrength);
  const [wetEdgeStrength, setWetEdgeStrength] = useState<number>(initialWetEdgeStrength);
  const [impastoLightAzimuthDeg, setImpastoLightAzimuthDeg] = useState<number>(initialImpastoLightAzimuthDeg);
  const [tiltDeg, setTiltDeg] = useState<number>(initialTiltDeg);
  const [auditSeed, setAuditSeed] = useState<number>(1337);
  const [auditNotice, setAuditNotice] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const liveConfig = useMemo<BrushPhysicsLiveSwatchConfig>(
    () => ({ paperPreset, dualMode, pressureCurve, soakStrength, wetEdgeStrength, impastoLightAzimuthDeg, tiltDeg, interactionMode, seed: auditSeed }),
    [auditSeed, dualMode, impastoLightAzimuthDeg, interactionMode, paperPreset, pressureCurve, soakStrength, tiltDeg, wetEdgeStrength],
  );
  const swatch = useMemo(() => renderBrushPhysicsLiveSwatch(liveConfig, SWATCH_W, SWATCH_H), [liveConfig]);
  const oracle = useMemo(
    () => auditBrushTextureQuality({ paperPreset, dualMode, pressureCurve, soakStrength, wetEdgeStrength, impastoLightAzimuthDeg, tiltDeg, seed: auditSeed }),
    [auditSeed, dualMode, impastoLightAzimuthDeg, paperPreset, pressureCurve, soakStrength, tiltDeg, wetEdgeStrength],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ImageData === "undefined") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(swatch.rgba), swatch.width, swatch.height), 0, 0);
  }, [swatch]);

  const emitChange = (partial: Partial<BrushPhysicsLiveSwatchConfig>): void => {
    onConfigChange?.({ ...liveConfig, ...partial });
  };

  const handleRerunAudit = (): void => {
    const nextSeed = auditSeed + 17;
    setAuditSeed(nextSeed);
    const fresh = auditBrushTextureQuality({ paperPreset, dualMode, pressureCurve, soakStrength, wetEdgeStrength, impastoLightAzimuthDeg, tiltDeg, seed: nextSeed });
    setAuditNotice(pick(
      `오라클 재측정 완료 · ${fresh.passed ? "전 항목 합격" : "일부 점검 필요"} (${fresh.score}점 · p95 ${fresh.p95TileMs.toFixed(2)}ms)`,
      `Oracle re-audited · ${fresh.passed ? "All checks passed" : "Attention needed"} (${fresh.score}/100 · p95 ${fresh.p95TileMs.toFixed(2)}ms)`,
    ));
    onAuditComplete?.(fresh);
  };

  const activePaper = PAPER_PRESETS[paperPreset];
  const interactionMetricLabel =
    interactionMode === "wax-resist" ? pick("왁스 발수율", "Wax Rejection")
      : interactionMode === "kneaded-eraser" ? pick("봉우리 우선 리프트", "Peak Lift Bias")
        : pick("골짜기 흑연 채움", "Valley Fill");

  return (
    <section
      aria-label={pick("물리 브러시 질감 엔진 Pro 패널", "Physical Brush Texture Engine Pro Panel")}
      className={`rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] font-semibold text-fg-2">
            <Paintbrush className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("Canvas2D 실시간 물리 질감 · 256×256 더티 타일", "Live Canvas2D Physics · 256×256 Dirty Tiles")}</span>
          </div>
          <h2 className="text-base font-bold text-fg">{pick("물리 브러시 질감 엔진 Pro", "Physical Brush Texture Engine Pro")}</h2>
          <p className="text-xs text-fg-2">
            {pick(
              "2층 심리스 종이 높이장, 듀얼 결 3중 합성, 수채 웨트 엣지, 2.5D 임파스토 조명, 이종 매체 상호작용을 한 번에 조정합니다.",
              "Tune 2-layer paper tooth, triple-multiply dual grain, capillary wet-edges, 2.5D impasto lighting, and cross-media physics.",
            )}
          </p>
        </div>
        <button type="button" onClick={handleRerunAudit} className={BTN_PRIMARY}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{pick("품질 오라클 재측정", "Re-run Quality Oracle")}</span>
        </button>
      </header>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="rounded-xl border border-line bg-card p-3 lg:col-span-5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-fg">{pick("라이브 질감 스와치 프리뷰", "Live Texture Swatch Preview")}</span>
            <span data-testid="active-paper-badge" className="rounded-md border border-line bg-canvas px-2 py-0.5 text-[11px] font-medium text-fg-2">
              {pick(activePaper.labelKo, activePaper.labelEn)}
            </span>
          </div>
          <div className="mt-2 overflow-hidden rounded-lg border border-line bg-canvas">
            <canvas
              ref={canvasRef}
              width={SWATCH_W}
              height={SWATCH_H}
              data-testid="brush-physics-swatch-canvas"
              aria-label={pick("실시간 물리 브러시 질감 스와치 캔버스", "Real-time physical brush texture swatch canvas")}
              className="block h-auto w-full"
            />
          </div>
          <p className="mt-2 text-[11px] text-fg-3">{pick(activePaper.summaryKo, activePaper.summaryEn)}</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
            <div className="rounded-lg border border-line bg-canvas px-2 py-1.5">
              <div className="text-fg-3">{pick("기울기 타원비", "Tilt Aspect")}</div>
              <div data-testid="swatch-tilt-aspect" className="font-bold tabular-nums text-fg">{swatch.tiltEllipseAspect.toFixed(2)}×</div>
            </div>
            <div className="rounded-lg border border-line bg-canvas px-2 py-1.5">
              <div className="text-fg-3">{pick("임파스토 명암폭", "Impasto Relief")}</div>
              <div data-testid="swatch-impasto-range" className="font-bold tabular-nums text-fg">{swatch.impastoLumaRange.toFixed(1)} ΔL</div>
            </div>
            <div className="rounded-lg border border-line bg-canvas px-2 py-1.5">
              <div className="text-fg-3">{pick("스와치 웨트 엣지", "Swatch Wet-Edge")}</div>
              <div data-testid="swatch-wet-edge" className="font-bold tabular-nums text-fg">{swatch.wetEdgeRingRatio.toFixed(3)}×</div>
            </div>
            <div className="rounded-lg border border-line bg-canvas px-2 py-1.5">
              <div className="text-fg-3">{interactionMetricLabel}</div>
              <div data-testid="swatch-interaction-metric" className="font-bold tabular-nums text-fg">
                {interactionMode === "wax-resist" ? `${(swatch.interactionMetricValue * 100).toFixed(1)}%` : `+${swatch.interactionMetricValue.toFixed(2)}`}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 lg:col-span-7">
          <fieldset className="rounded-xl border border-line bg-card p-3">
            <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold text-fg">
              <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>{pick("1. 종이 높이장 프리셋 (5종)", "1. Paper Heightfield Preset (5)")}</span>
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {PAPER_PRESET_LIST.map((preset) => {
                const active = preset.id === paperPreset;
                return (
                  <button key={preset.id} type="button" aria-pressed={active} onClick={() => { setPaperPreset(preset.id); emitChange({ paperPreset: preset.id }); }} className={`${BTN_CHOICE} ${active ? BTN_ACTIVE : BTN_IDLE}`}>
                    <span>{pick(preset.labelKo, preset.labelEn)}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <fieldset className="rounded-xl border border-line bg-card p-3">
              <legend className="px-1 text-xs font-semibold text-fg">{pick("2. 듀얼 브러시 결 모드", "2. Dual Brush Grain Mode")}</legend>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {DUAL_MODES.map((item) => {
                  const active = item.id === dualMode;
                  return (
                    <button key={item.id} type="button" aria-pressed={active} onClick={() => { setDualMode(item.id); emitChange({ dualMode: item.id }); }} className={`${BTN_CHOICE} flex-col gap-0.5 py-1.5 ${active ? BTN_ACTIVE : BTN_IDLE}`}>
                      <span>{pick(item.ko, item.en)}</span>
                      <span className="text-[10px] font-normal text-fg-3">{pick(item.hintKo, item.hintEn)}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="rounded-xl border border-line bg-card p-3">
              <legend className="px-1 text-xs font-semibold text-fg">{pick("3. 필압 커브 프리셋", "3. Pressure Curve Preset")}</legend>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {PRESSURE_CURVE_PRESET_LIST.map((curve) => {
                  const active = curve.id === pressureCurve;
                  return (
                    <button key={curve.id} type="button" aria-pressed={active} onClick={() => { setPressureCurve(curve.id); emitChange({ pressureCurve: curve.id }); }} className={`${BTN_CHOICE} px-2 ${active ? BTN_ACTIVE : BTN_IDLE}`}>
                      <span>{pick(curve.labelKo, curve.labelEn)}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <PhysicsSlider id={`${uid}-soak`} label={pick("4. 수채 모세관 스며들기", "4. Capillary Soak")} valueText={`${Math.round(soakStrength * 100)}%`} valueTestId="soak-strength-value" min={0} max={1} step={0.05} value={soakStrength} onChange={(v) => { setSoakStrength(v); emitChange({ soakStrength: v }); }} />
            <PhysicsSlider id={`${uid}-wet-edge`} label={pick("5. 웨트 엣지 농축 강도", "5. Wet-Edge Backrun")} valueText={`${Math.round(wetEdgeStrength * 100)}%`} valueTestId="wet-edge-strength-value" min={0} max={1} step={0.05} value={wetEdgeStrength} onChange={(v) => { setWetEdgeStrength(v); emitChange({ wetEdgeStrength: v }); }} />
            <PhysicsSlider id={`${uid}-impasto-light`} label={pick("6. 2.5D 임파스토 조명 각도", "6. Impasto Light Azimuth")} valueText={`${Math.round(impastoLightAzimuthDeg)}°`} valueTestId="impasto-azimuth-value" min={0} max={360} step={5} value={impastoLightAzimuthDeg} onChange={(v) => { setImpastoLightAzimuthDeg(v); emitChange({ impastoLightAzimuthDeg: v }); }} />
            <PhysicsSlider id={`${uid}-tilt-deg`} label={pick("7. 스타일러스 기울기 음영", "7. Stylus Tilt Grazing")} valueText={`${Math.round(tiltDeg)}°`} valueTestId="tilt-deg-value" min={0} max={80} step={2} value={tiltDeg} onChange={(v) => { setTiltDeg(v); emitChange({ tiltDeg: v }); }} />
          </div>

          <fieldset className="rounded-xl border border-line bg-card p-3">
            <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold text-fg">
              <Eraser className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>{pick("8. 이종 매체 물리 상호작용", "8. Cross-Media Physics Interaction")}</span>
            </legend>
            <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              {INTERACTION_MODES.map((item) => {
                const active = item.id === interactionMode;
                return (
                  <button key={item.id} type="button" aria-pressed={active} onClick={() => { setInteractionMode(item.id); emitChange({ interactionMode: item.id }); }} className={`${BTN_CHOICE} ${active ? BTN_ACTIVE : BTN_IDLE}`}>
                    <span>{pick(item.ko, item.en)}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-line bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-fg">
            <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
            <span>{pick("실시간 질감 정량 오라클 (6대 기준)", "Live Quantitative Texture Oracle (6 Gates)")}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 text-fg-3">
              <Droplets className="h-3.5 w-3.5" aria-hidden="true" />
              <Sun className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="tabular-nums">{pick(`12종 혼합 브러시 · 평균 ${oracle.avgTileMs.toFixed(2)}ms`, `12 Mixed Brushes · avg ${oracle.avgTileMs.toFixed(2)}ms`)}</span>
            </span>
            <span data-testid="oracle-overall-badge" className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold tabular-nums ${oracle.passed ? "border-good/40 bg-good-soft text-good" : "border-bad/40 bg-bad-soft text-bad"}`}>
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{oracle.passed ? pick("전 항목 합격", "ALL PASS") : pick("점검 필요", "CHECK")} · {oracle.score}%</span>
            </span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {oracle.checks.map((check) => (
            <div key={check.id} data-testid={`oracle-check-${check.id}`} className={`rounded-lg border p-2.5 text-xs ${check.passed ? "border-good/40 bg-good-soft/50" : "border-bad/40 bg-bad-soft/50"}`}>
              <div className="text-[11px] font-medium text-fg-2">{pick(check.labelKo, check.labelEn)}</div>
              <div className={`mt-1 text-sm font-bold tabular-nums ${check.passed ? "text-good" : "text-bad"}`}>
                {check.value.toFixed(check.unit === "ms" ? 2 : 3)}{check.unit}
              </div>
              <div className="mt-0.5 text-[10px] tabular-nums text-fg-3">
                {check.targetText} · {check.passed ? pick("합격", "PASS") : pick("미달", "FAIL")}
              </div>
            </div>
          ))}
        </div>

        {auditNotice && (
          <p role="status" className="mt-2.5 rounded-lg border border-good/40 bg-good-soft px-3 py-1.5 text-xs font-medium text-good">
            {auditNotice}
          </p>
        )}
      </div>
    </section>
  );
}
