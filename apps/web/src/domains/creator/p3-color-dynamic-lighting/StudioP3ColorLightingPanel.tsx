/**
 * Wave 40B — Display-P3 광색역 컬러 매니지먼트 · CMYK 소프트프루핑 · 실시간 동적 조명 스튜디오 패널.
 *
 * - 3탭 인터랙티브 워크벤치(Display-P3 게멋 매핑 / CMYK 소프트프루핑·말풍선 대비 / 실시간 동적 다중 조명).
 * - Calm Atelier 시맨틱 토큰 전용 (원시 색상 표기 0건 · Web Storage 0건 · props 기본 객체 대입 미사용).
 */

import {
  CheckCircle2,
  Cpu,
  Layers,
  Palette,
  Printer,
  ShieldAlert,
  SlidersHorizontal,
  Sun,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  createDemoCharacterSurfaceBuffers,
  DYNAMIC_LIGHTING_PRESETS,
  DYNAMIC_STUDIO_LIGHTING_WGSL,
  getLightingPresetById,
  kelvinToRgb,
  MAX_DYNAMIC_LIGHTS,
  MAX_KELVIN,
  MIN_KELVIN,
  renderDynamicLitBuffer,
  validateWgslLightingContract,
  type CinematicLightingPresetId,
  type DynamicLightingSceneConfig,
  type DynamicLightKind,
  type DynamicLightSource,
} from "./dynamic-studio-lighting-engine";
import {
  DEMO_BALLOON_CONTRAST_PRESETS,
  DEMO_P3_WEBTOON_SWATCHES,
  displayP3ToXyzD65,
  evaluateBalloonContrast,
  PRINT_PROFILES,
  softMapP3ToSrgb,
  softProofToCmyk,
  xyzD65ToDisplayP3,
  xyzD65ToOklab,
  type PrintProfileId,
  type RgbTuple,
} from "./p3-color-gamut-engine";

export type P3ColorLightingTabId = "gamut" | "softproof" | "lighting";

export interface StudioP3ColorLightingPanelProps {
  readonly initialTab?: P3ColorLightingTabId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onLightingPresetChange?: (presetId: CinematicLightingPresetId) => void;
  readonly onSoftProofProfileChange?: (profileId: PrintProfileId) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised ${FOCUS_RING}`;
const BTN_ACTIVE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs font-semibold text-accent transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const TAB_BASE = `inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;

function getLightKindLabel(kind: DynamicLightKind, isEn: boolean): string {
  switch (kind) {
    case "sun-directional":
      return isEn ? "Sun Directional" : "태양 방향광";
    case "point-lamp":
      return isEn ? "Point Lamp" : "포인트 램프";
    case "rim-backlight":
      return isEn ? "Rim Backlight" : "역광 림라이트";
    case "ambient-bounce":
      return isEn ? "Ambient Bounce" : "환경 바운스";
  }
}

interface SliderControlProps {
  readonly id: string;
  readonly testId: string;
  readonly label: string;
  readonly readout: string;
  readonly readoutTestId?: string;
  readonly swatchCss?: string;
  readonly toneClass?: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly onChange: (next: number) => void;
}

function SliderControl(p: SliderControlProps): ReactElement {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <label htmlFor={p.id} className="font-semibold text-fg">
          {p.label}
        </label>
        <span
          data-testid={p.readoutTestId}
          className={`inline-flex items-center gap-1.5 font-bold tabular-nums ${p.toneClass ?? "text-accent"}`}
        >
          {p.swatchCss ? (
            <span
              className="h-3 w-3 rounded-full border border-line"
              style={{ backgroundColor: p.swatchCss }}
            />
          ) : null}
          {p.readout}
        </span>
      </div>
      <input
        id={p.id}
        data-testid={p.testId}
        type="range"
        min={p.min}
        max={p.max}
        step={p.step}
        value={p.value}
        onChange={(e) => p.onChange(Number(e.target.value))}
        className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
      />
    </div>
  );
}

/** Wave 40B Display-P3 · CMYK 소프트프루핑 · 실시간 다중 동적 조명 3탭 스튜디오 워크벤치. */
export function StudioP3ColorLightingPanel(
  props: StudioP3ColorLightingPanelProps,
): ReactElement {
  const {
    initialTab = "gamut",
    locale = "ko",
    className,
    onLightingPresetChange,
    onSoftProofProfileChange,
  } = props;
  const uid = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [activeTab, setActiveTab] = useState<P3ColorLightingTabId>(initialTab);
  const [selectedSwatchId, setSelectedSwatchId] = useState<string>(DEMO_P3_WEBTOON_SWATCHES[0]!.id);
  const [p3Color, setP3Color] = useState<RgbTuple>(DEMO_P3_WEBTOON_SWATCHES[0]!.p3);
  const [kneeRatio, setKneeRatio] = useState<number>(0.8);

  const [printProfileId, setPrintProfileId] = useState<PrintProfileId>("JapanColor2001");
  const [gcrStrength, setGcrStrength] = useState<number>(PRINT_PROFILES.JapanColor2001.defaultGcr);
  const [balloonPresetId, setBalloonPresetId] = useState<string>(DEMO_BALLOON_CONTRAST_PRESETS[0]!.id);
  const [balloonFgScale, setBalloonFgScale] = useState<number>(1.0);

  const [sceneConfig, setSceneConfig] = useState<DynamicLightingSceneConfig>(
    () => getLightingPresetById("seoul-golden-sunset").config,
  );
  const [selectedLightId, setSelectedLightId] = useState<string>(
    () => getLightingPresetById("seoul-golden-sunset").config.lights[0]!.id,
  );

  const demoSurface = useMemo(() => createDemoCharacterSurfaceBuffers(48, 36), []);
  const wgslCheck = useMemo(() => validateWgslLightingContract(DYNAMIC_STUDIO_LIGHTING_WGSL), []);

  const gamutResult = useMemo(() => softMapP3ToSrgb(p3Color, { kneeRatio }), [p3Color, kneeRatio]);
  const xyzD65 = useMemo(() => displayP3ToXyzD65(gamutResult.inputP3), [gamutResult.inputP3]);
  const oklab = useMemo(() => xyzD65ToOklab(xyzD65), [xyzD65]);
  const roundtripError = useMemo(() => {
    const r = xyzD65ToDisplayP3(xyzD65);
    return Math.max(
      Math.abs(r.r - gamutResult.inputP3.r),
      Math.abs(r.g - gamutResult.inputP3.g),
      Math.abs(r.b - gamutResult.inputP3.b),
    );
  }, [gamutResult.inputP3, xyzD65]);

  const softProof = useMemo(
    () => softProofToCmyk(gamutResult.inputP3, "display-p3", printProfileId, { gcrStrength }),
    [gamutResult.inputP3, printProfileId, gcrStrength],
  );
  const activeBalloonPreset = useMemo(
    () => DEMO_BALLOON_CONTRAST_PRESETS.find((x) => x.id === balloonPresetId) ?? DEMO_BALLOON_CONTRAST_PRESETS[0]!,
    [balloonPresetId],
  );
  const balloonContrast = useMemo(() => {
    const fg: RgbTuple = {
      r: Math.min(1, activeBalloonPreset.foregroundP3.r * balloonFgScale),
      g: Math.min(1, activeBalloonPreset.foregroundP3.g * balloonFgScale),
      b: Math.min(1, activeBalloonPreset.foregroundP3.b * balloonFgScale),
    };
    return evaluateBalloonContrast(fg, activeBalloonPreset.backgroundP3, "display-p3");
  }, [activeBalloonPreset, balloonFgScale]);

  const activeLight: DynamicLightSource = useMemo(
    () => sceneConfig.lights.find((l) => l.id === selectedLightId) ?? sceneConfig.lights[0]!,
    [sceneConfig.lights, selectedLightId],
  );
  const activeLightKelvinColor = useMemo(() => kelvinToRgb(activeLight.kelvin), [activeLight.kelvin]);
  const relightResult = useMemo(
    () => renderDynamicLitBuffer(demoSurface, sceneConfig),
    [demoSurface, sceneConfig],
  );

  const handleSelectSwatch = (swatchId: string, nextP3: RgbTuple): void => {
    setSelectedSwatchId(swatchId);
    setP3Color(nextP3);
  };

  const handleSelectPrintProfile = (nextProfile: PrintProfileId): void => {
    setPrintProfileId(nextProfile);
    setGcrStrength(PRINT_PROFILES[nextProfile].defaultGcr);
    onSoftProofProfileChange?.(nextProfile);
  };

  const handleSelectLightingPreset = (presetId: CinematicLightingPresetId): void => {
    const preset = getLightingPresetById(presetId);
    setSceneConfig(preset.config);
    setSelectedLightId(preset.config.lights[0]!.id);
    onLightingPresetChange?.(presetId);
  };

  const updateSelectedLight = (patch: Partial<DynamicLightSource>): void => {
    setSceneConfig((prev) => ({
      ...prev,
      lights: prev.lights.map((l) => (l.id === activeLight.id ? { ...l, ...patch } : l)),
    }));
  };

  const toggleLightEnabled = (lightId: string): void => {
    setSceneConfig((prev) => ({
      ...prev,
      lights: prev.lights.map((l) => (l.id === lightId ? { ...l, enabled: !l.enabled } : l)),
    }));
  };

  const tabs: readonly { readonly id: P3ColorLightingTabId; readonly label: string; readonly icon: ReactElement }[] = [
    { id: "gamut", label: pick("Display-P3 광색역 · 게멋 매핑", "Display-P3 Gamut"), icon: <Palette className="h-3.5 w-3.5" aria-hidden="true" /> },
    { id: "softproof", label: pick("CMYK 소프트프루핑 · 대비 검사", "CMYK Proof & Contrast"), icon: <Printer className="h-3.5 w-3.5" aria-hidden="true" /> },
    { id: "lighting", label: pick("실시간 동적 다중 조명 프리뷰", "Dynamic Studio Lighting"), icon: <Sun className="h-3.5 w-3.5" aria-hidden="true" /> },
  ];

  const tacBadgeTone =
    softProof.tac.level === "safe"
      ? "border-good/40 bg-good-soft text-good"
      : softProof.tac.level === "warning"
        ? "border-warn/40 bg-warning-soft text-warn"
        : "border-bad/40 bg-bad-soft text-bad";

  const contrastBadgeTone =
    balloonContrast.balloonGrade === "excellent-body" || balloonContrast.balloonGrade === "pass-balloon"
      ? "border-good/40 bg-good-soft text-good"
      : balloonContrast.balloonGrade === "large-sfx-only"
        ? "border-warn/40 bg-warning-soft text-warn"
        : "border-bad/40 bg-bad-soft text-bad";

  return (
    <section
      data-testid="p3-color-lighting-panel"
      aria-label={pick("Display-P3 광색역 컬러 매니지먼트 · CMYK 소프트프루핑 · 실시간 동적 조명 스튜디오 패널", "Display-P3 Color Management, CMYK Soft-Proofing & Dynamic Studio Lighting Panel")}
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] font-semibold text-fg-2">
            <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("Wave 40B · Display-P3 · CMYK · 실시간 4광원 리라이팅", "Wave 40B · Display-P3 · CMYK · 4-Light Relighting")}</span>
          </div>
          <h2 className="text-base font-bold text-fg">
            {pick("광색역 컬러 매니지먼트 · 인쇄 소프트프루핑 · 동적 조명 엔진", "Wide-Gamut Color Management · CMYK Proofing · Dynamic Lighting")}
          </h2>
        </div>
        <div className="rounded-lg border border-good/40 bg-good-soft px-2.5 py-1.5 text-xs font-semibold text-good tabular-nums">
          {pick(`D65 행렬 오차 < 1e-4 · 최대 ${MAX_DYNAMIC_LIGHTS}광원`, `D65 Matrix < 1e-4 · Up to ${MAX_DYNAMIC_LIGHTS} Lights`)}
        </div>
      </header>

      <div role="tablist" aria-label={pick("컬러 및 조명 워크벤치 탭", "Color & Lighting Workbench Tabs")} className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`${uid}-tab-${tab.id}`}
              data-testid={`p3-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${uid}-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`${TAB_BASE} ${
                selected
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg"
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === "gamut" && (
        <div id={`${uid}-panel-gamut`} role="tabpanel" aria-labelledby={`${uid}-tab-gamut`} className="space-y-4">
          <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-fg">
                {pick("웹툰 Display-P3 광색역 기준 스와치 (6종)", "Webtoon Display-P3 Reference Swatches")}
              </h3>
              <span
                data-testid="gamut-status-badge"
                className={`rounded-md border px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                  gamutResult.inSrgbGamut
                    ? "border-good/40 bg-good-soft text-good"
                    : "border-warn/40 bg-warning-soft text-warn"
                }`}
              >
                {gamutResult.inSrgbGamut
                  ? pick("sRGB 범위 내 (무손실)", "In sRGB Gamut")
                  : pick(`P3 광색역 채도 압축 · ΔH ${gamutResult.hueShiftDeg.toFixed(2)}°`, `P3 Soft-Mapped · ΔH ${gamutResult.hueShiftDeg.toFixed(2)}°`)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {DEMO_P3_WEBTOON_SWATCHES.map((swatch) => {
                const isSelected = swatch.id === selectedSwatchId;
                const preview = softMapP3ToSrgb(swatch.p3);
                return (
                  <button
                    key={swatch.id}
                    data-testid={`p3-swatch-${swatch.id}`}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => handleSelectSwatch(swatch.id, swatch.p3)}
                    className={`${isSelected ? BTN_ACTIVE : BTN_OUTLINE} justify-start px-2.5`}
                  >
                    <span className="h-4 w-4 shrink-0 rounded-full border border-line" style={{ backgroundColor: preview.mappedSrgbOklchCss }} />
                    <span className="truncate">{isEn ? swatch.labelEn : swatch.labelKo}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-3 border-t border-line pt-3 lg:grid-cols-2">
              <div className="space-y-2.5">
                {(["r", "g", "b"] as const).map((ch) => (
                  <SliderControl
                    key={ch}
                    id={`${uid}-p3-${ch}`}
                    testId={`p3-slider-${ch}`}
                    label={`Display-P3 ${ch.toUpperCase()}`}
                    readout={p3Color[ch].toFixed(2)}
                    min={0}
                    max={1}
                    step={0.01}
                    value={p3Color[ch]}
                    onChange={(next) => setP3Color((prev) => ({ ...prev, [ch]: next }))}
                  />
                ))}
                <div className="border-t border-line pt-2">
                  <SliderControl
                    id={`${uid}-knee-ratio`}
                    testId="p3-knee-slider"
                    label={pick("Soft-Knee 채도 압축 시작점", "Soft-Knee Chroma Roll-off")}
                    readout={`${Math.round(kneeRatio * 100)}%`}
                    toneClass="text-cool"
                    min={0.5}
                    max={0.98}
                    step={0.02}
                    value={kneeRatio}
                    onChange={setKneeRatio}
                  />
                </div>
              </div>

              <div className="space-y-2.5 rounded-xl border border-line bg-canvas p-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1.5 rounded-lg border border-line bg-panel p-2.5">
                    <div data-testid="p3-origin-preview" className="h-14 w-full rounded-md border border-line" style={{ backgroundColor: gamutResult.p3Css }} />
                    <div className="text-[11px] font-semibold text-fg">{pick("원본 Display-P3", "Source Display-P3")}</div>
                    <div className="text-[10px] text-fg-3 tabular-nums">
                      L {gamutResult.originalOklch.L.toFixed(3)} · C {gamutResult.originalOklch.C.toFixed(3)} · H {gamutResult.originalOklch.h.toFixed(1)}°
                    </div>
                  </div>
                  <div className="space-y-1.5 rounded-lg border border-line bg-panel p-2.5">
                    <div data-testid="p3-mapped-preview" className="h-14 w-full rounded-md border border-line" style={{ backgroundColor: gamutResult.mappedSrgbOklchCss }} />
                    <div className="text-[11px] font-semibold text-fg">{pick("색상 보존 sRGB 매핑", "Hue-Preserving sRGB")}</div>
                    <div className="text-[10px] text-fg-3 tabular-nums">
                      L {gamutResult.mappedOklch.L.toFixed(3)} · C {gamutResult.mappedOklch.C.toFixed(3)} · H {gamutResult.mappedOklch.h.toFixed(1)}°
                    </div>
                  </div>
                </div>
                <div data-testid="p3-matrix-readout" className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-fg-2 tabular-nums">
                  <div>CIE XYZ(D65): <strong className="text-fg">{xyzD65.x.toFixed(3)}, {xyzD65.y.toFixed(3)}, {xyzD65.z.toFixed(3)}</strong></div>
                  <div>OKLab: <strong className="text-fg">{oklab.L.toFixed(3)}, {oklab.a.toFixed(3)}, {oklab.b.toFixed(3)}</strong></div>
                  <div>{pick("채도 유지율", "Chroma Kept")}: <strong className="text-fg">{(gamutResult.chromaCompressionRatio * 100).toFixed(1)}%</strong></div>
                  <div>{pick("왕복 행렬 오차", "Roundtrip Err")}: <strong className="text-good">{roundtripError.toExponential(1)}</strong></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "softproof" && (
        <div id={`${uid}-panel-softproof`} role="tabpanel" aria-labelledby={`${uid}-tab-softproof`} className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg">
                <Printer className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>{pick("단행본 CMYK 소프트프루핑 · TAC 경고", "CMYK Soft-Proof & TAC Guard")}</span>
              </h3>
              <span data-testid="cmyk-tac-badge" className={`rounded-md border px-2 py-0.5 text-[11px] font-bold tabular-nums ${tacBadgeTone}`}>
                TAC {softProof.tac.totalInkPercent.toFixed(1)}% / {softProof.tac.limitPercent}%
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(["JapanColor2001", "FOGRA39"] as const).map((pid) => (
                <button
                  key={pid}
                  data-testid={`cmyk-profile-${pid}`}
                  type="button"
                  aria-pressed={printProfileId === pid}
                  onClick={() => handleSelectPrintProfile(pid)}
                  className={printProfileId === pid ? BTN_ACTIVE : BTN_OUTLINE}
                >
                  <span>{pid}</span>
                  <span className="tabular-nums text-[10px] opacity-80">{PRINT_PROFILES[pid].tacLimitPercent}%</span>
                </button>
              ))}
            </div>

            <SliderControl
              id={`${uid}-gcr-slider`}
              testId="cmyk-gcr-slider"
              label={pick("GCR 회색 성분 치환(총잉크량 제어)", "GCR Black Generation")}
              readout={`${Math.round(gcrStrength * 100)}%`}
              min={0}
              max={1}
              step={0.05}
              value={gcrStrength}
              onChange={setGcrStrength}
            />

            <div className="grid grid-cols-2 gap-2.5 rounded-lg border border-line bg-canvas p-2.5">
              <div className="space-y-1">
                <div className="h-12 rounded-md border border-line" style={{ backgroundColor: softProof.referenceOklchCss }} />
                <div className="text-[11px] font-medium text-fg-2">{pick("화면 원본 (디지털)", "Screen Original")}</div>
              </div>
              <div className="space-y-1">
                <div data-testid="cmyk-proof-swatch" className="h-12 rounded-md border border-line" style={{ backgroundColor: softProof.proofedOklchCss }} />
                <div className="text-[11px] font-medium text-fg-2">{pick(`${printProfileId} 인쇄 시뮬`, `${printProfileId} Paper Proof`)}</div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center text-xs tabular-nums">
              {([["C", softProof.cmykPercent.c], ["M", softProof.cmykPercent.m], ["Y", softProof.cmykPercent.y], ["K", softProof.cmykPercent.k]] as const).map(([label, val]) => (
                <div key={label} className="rounded-lg border border-line bg-canvas p-2">
                  <div className="text-[10px] font-semibold text-fg-3">{label}</div>
                  <div className="mt-0.5 font-bold text-fg">{val.toFixed(1)}%</div>
                </div>
              ))}
            </div>

            <p data-testid="cmyk-tac-message" className={`flex items-start gap-1.5 rounded-lg border p-2.5 text-xs ${tacBadgeTone}`}>
              {softProof.tac.level === "safe" ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              <span>{isEn ? softProof.tac.messageEn : softProof.tac.messageKo}</span>
            </p>
          </div>

          <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-fg">
                <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>{pick("말풍선 텍스트 WCAG 2.1 · APCA 대비 검사기", "Balloon WCAG 2.1 & APCA Checker")}</span>
              </h3>
              <span data-testid="balloon-contrast-grade" className={`rounded-md border px-2 py-0.5 text-[11px] font-bold tabular-nums ${contrastBadgeTone}`}>
                {balloonContrast.wcagRatio.toFixed(2)}:1 · Lc {balloonContrast.apcaLc.toFixed(1)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {DEMO_BALLOON_CONTRAST_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  data-testid={`balloon-preset-${preset.id}`}
                  type="button"
                  aria-pressed={preset.id === activeBalloonPreset.id}
                  onClick={() => {
                    setBalloonPresetId(preset.id);
                    setBalloonFgScale(1.0);
                  }}
                  className={preset.id === activeBalloonPreset.id ? BTN_ACTIVE : BTN_OUTLINE}
                >
                  <span className="truncate">{isEn ? preset.labelEn : preset.labelKo}</span>
                </button>
              ))}
            </div>

            <div
              data-testid="balloon-sample-preview"
              className="rounded-xl border border-line p-4 text-center text-sm font-bold"
              style={{ backgroundColor: balloonContrast.backgroundOklchCss, color: balloonContrast.foregroundOklchCss }}
            >
              {isEn ? activeBalloonPreset.sampleLineEn : activeBalloonPreset.sampleLineKo}
            </div>

            <SliderControl
              id={`${uid}-balloon-fg-scale`}
              testId="balloon-fg-slider"
              label={pick("글자 명도 스케일 미세 조정", "Dialogue Text Brightness Scale")}
              readout={`${Math.round(balloonFgScale * 100)}%`}
              min={0.2}
              max={1.4}
              step={0.05}
              value={balloonFgScale}
              onChange={setBalloonFgScale}
            />

            <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-semibold tabular-nums">
              <div className={`rounded-lg border p-2 ${balloonContrast.wcagAALarge ? "border-good/40 bg-good-soft text-good" : "border-bad/40 bg-bad-soft text-bad"}`}>
                AA Large {balloonContrast.wcagAALarge ? "PASS" : "FAIL"}
              </div>
              <div className={`rounded-lg border p-2 ${balloonContrast.wcagAANormal ? "border-good/40 bg-good-soft text-good" : "border-bad/40 bg-bad-soft text-bad"}`}>
                AA Body {balloonContrast.wcagAANormal ? "PASS" : "FAIL"}
              </div>
              <div className={`rounded-lg border p-2 ${balloonContrast.wcagAAA ? "border-good/40 bg-good-soft text-good" : "border-line bg-canvas text-fg-2"}`}>
                AAA {balloonContrast.wcagAAA ? "PASS" : "WAIT"}
              </div>
            </div>
            <p data-testid="balloon-contrast-guidance" className="text-xs text-fg-2">
              {isEn ? balloonContrast.guidanceEn : balloonContrast.guidanceKo}
            </p>
          </div>
        </div>
      )}

      {activeTab === "lighting" && (
        <div id={`${uid}-panel-lighting`} role="tabpanel" aria-labelledby={`${uid}-tab-lighting`} className="space-y-4">
          <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-fg">{pick("시네마틱 웹툰 조명 프리셋 (5종)", "Cinematic Webtoon Lighting Presets")}</h3>
              <span data-testid="lighting-active-count" className="rounded-md border border-good/40 bg-good-soft px-2 py-0.5 text-[11px] font-bold text-good tabular-nums">
                {pick(`활성 광원 ${relightResult.metrics.activeLightCount}/${MAX_DYNAMIC_LIGHTS}`, `Active Lights ${relightResult.metrics.activeLightCount}/${MAX_DYNAMIC_LIGHTS}`)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {DYNAMIC_LIGHTING_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  data-testid={`lighting-preset-${preset.id}`}
                  type="button"
                  aria-pressed={preset.id === sceneConfig.presetId}
                  onClick={() => handleSelectLightingPreset(preset.id)}
                  className={preset.id === sceneConfig.presetId ? BTN_ACTIVE : BTN_OUTLINE}
                >
                  <span className="truncate">{isEn ? preset.nameEn : preset.nameKo}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
              <div className="grid grid-cols-2 gap-2">
                {sceneConfig.lights.map((light) => {
                  const isFocused = light.id === activeLight.id;
                  const kColor = kelvinToRgb(light.kelvin);
                  return (
                    <div key={light.id} className={`flex items-center justify-between gap-1.5 rounded-lg border p-2 ${isFocused ? "border-accent bg-accent-soft" : "border-line bg-canvas"}`}>
                      <button
                        data-testid={`light-select-${light.id}`}
                        type="button"
                        onClick={() => setSelectedLightId(light.id)}
                        className={`flex min-h-11 flex-1 cursor-pointer items-center gap-2 text-left text-xs font-semibold text-fg ${FOCUS_RING}`}
                      >
                        <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-line" style={{ backgroundColor: kColor.oklchCss }} />
                        <span className="min-w-0 truncate">
                          <span className="block truncate">{isEn ? light.labelEn : light.labelKo}</span>
                          <span className="block text-[10px] font-normal text-fg-3 tabular-nums">
                            {getLightKindLabel(light.kind, isEn)} · {light.kelvin}K
                          </span>
                        </span>
                      </button>
                      <button
                        data-testid={`light-toggle-${light.id}`}
                        type="button"
                        aria-pressed={light.enabled}
                        onClick={() => toggleLightEnabled(light.id)}
                        className={`min-h-11 min-w-11 cursor-pointer rounded-md border px-2 text-[11px] font-bold transition-colors motion-reduce:transition-none ${FOCUS_RING} ${
                          light.enabled ? "border-good/40 bg-good-soft text-good" : "border-line bg-panel text-fg-3"
                        }`}
                      >
                        {light.enabled ? "ON" : "OFF"}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2.5 border-t border-line pt-3">
                <SliderControl
                  id={`${uid}-light-kelvin`}
                  testId="light-kelvin-slider"
                  readoutTestId="active-light-kelvin-readout"
                  label={pick("선택 광원 색온도 (Planckian K)", "Selected Light Kelvin")}
                  readout={`${activeLight.kelvin}K`}
                  swatchCss={activeLightKelvinColor.oklchCss}
                  min={MIN_KELVIN}
                  max={MAX_KELVIN}
                  step={100}
                  value={activeLight.kelvin}
                  onChange={(kelvin) => updateSelectedLight({ kelvin })}
                />
                <div className="grid grid-cols-2 gap-3">
                  <SliderControl
                    id={`${uid}-light-intensity`}
                    testId="light-intensity-slider"
                    label={pick("광원 세기", "Intensity")}
                    readout={activeLight.intensity.toFixed(2)}
                    toneClass="text-fg"
                    min={0}
                    max={2.5}
                    step={0.05}
                    value={activeLight.intensity}
                    onChange={(intensity) => updateSelectedLight({ intensity })}
                  />
                  <SliderControl
                    id={`${uid}-light-volumetric`}
                    testId="light-volumetric-slider"
                    label={pick("빛줄기(God-Ray)", "God-Ray Cone")}
                    readout={`${Math.round(activeLight.volumetricStrength * 100)}%`}
                    toneClass="text-cool"
                    min={0}
                    max={1}
                    step={0.05}
                    value={activeLight.volumetricStrength}
                    onChange={(volumetricStrength) => updateSelectedLight({ volumetricStrength })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 border-t border-line pt-2.5">
                  <SliderControl
                    id={`${uid}-sss-strength`}
                    testId="lighting-sss-slider"
                    label={pick("피부 SSS 볼 산란", "Skin SSS Cheek Tint")}
                    readout={`${Math.round(sceneConfig.sssStrength * 100)}%`}
                    min={0}
                    max={1.5}
                    step={0.05}
                    value={sceneConfig.sssStrength}
                    onChange={(sssStrength) => setSceneConfig((prev) => ({ ...prev, sssStrength }))}
                  />
                  <SliderControl
                    id={`${uid}-exposure-slider`}
                    testId="lighting-exposure-slider"
                    label={pick("ACES 노출", "ACES Exposure")}
                    readout={`${sceneConfig.exposure.toFixed(2)} EV`}
                    toneClass="text-fg"
                    min={0.6}
                    max={1.8}
                    step={0.05}
                    value={sceneConfig.exposure}
                    onChange={(exposure) => setSceneConfig((prev) => ({ ...prev, exposure }))}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-fg">{pick("2D 노멀맵·깊이버퍼 실시간 리라이트 프리뷰", "Live 2D Normal + Depth Relit Preview")}</span>
                <span className="text-[11px] font-semibold text-fg-2 tabular-nums">{relightResult.width}×{relightResult.height} RGBA</span>
              </div>
              <div
                data-testid="lighting-preview-mosaic"
                role="img"
                aria-label={pick("실시간 다중 동적 조명 리라이팅 프리뷰", "Real-time multi-light studio relighting preview")}
                className="grid overflow-hidden rounded-lg border border-line bg-canvas"
                style={{ gridTemplateColumns: `repeat(${relightResult.previewMosaic.cols}, minmax(0, 1fr))` }}
              >
                {relightResult.previewMosaic.cells.map((oklchCss, index) => (
                  <div key={index} className="aspect-square w-full" style={{ backgroundColor: oklchCss }} />
                ))}
              </div>
              <div data-testid="lighting-metrics-readout" className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-canvas p-2.5 text-[11px] text-fg-2 tabular-nums">
                <div>{pick("평균 휘도", "Avg Luma")}: <strong className="text-fg">{(relightResult.metrics.averageLuminance * 100).toFixed(1)}%</strong></div>
                <div>{pick("림라이트 비율", "Rim Coverage")}: <strong className="text-fg">{(relightResult.metrics.rimCoverageRatio * 100).toFixed(1)}%</strong></div>
                <div>{pick("SSS 피부 픽셀", "SSS Pixels")}: <strong className="text-accent">{relightResult.metrics.sssAffectedPixels}px</strong></div>
                <div>{pick("빛줄기 에너지", "God-Ray Energy")}: <strong className="text-cool">{(relightResult.metrics.volumetricEnergy * 100).toFixed(1)}</strong></div>
              </div>
              <details className="rounded-lg border border-line bg-canvas p-2.5">
                <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-fg">
                  <Cpu className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                  <span>{pick(`WebGPU WGSL 컴퓨트 셰이더 (${wgslCheck.lineCount}줄 · ${wgslCheck.valid ? "검증 통과" : "점검"})`, `WebGPU WGSL Compute Shader (${wgslCheck.lineCount} lines · ${wgslCheck.valid ? "Verified" : "Check"})`)}</span>
                </summary>
                <pre data-testid="wgsl-shader-preview" className="mt-2 max-h-40 overflow-auto rounded-md border border-line bg-panel p-2 text-[10px] text-fg-2 tabular-nums">
                  {DYNAMIC_STUDIO_LIGHTING_WGSL}
                </pre>
              </details>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
