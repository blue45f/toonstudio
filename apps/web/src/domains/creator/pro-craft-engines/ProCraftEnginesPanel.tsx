import { Download, Lightbulb, PenTool, Printer, RefreshCw, Sparkles } from "lucide-react";
import { useMemo, useState, type PointerEvent } from "react";

import { useI18n } from "@/shared/lib/i18n";

import { extract3dLightingRigFrom2dCut } from "./cut-to-3d-lighting-matcher";
import { generateDieCutSvgFromAlpha, runCmykPrintPreflight } from "./goods-print-cutline-preflight";
import {
  calibratePersonalStylusProfile,
  evaluatePressureCurve,
  simulateNibWearAndInkDepletion,
  type StylusCalibrationSample,
} from "./stylus-pressure-calibrator";
import "./pro-craft-engines.css";

type CraftSubTab = "lighting" | "cutline" | "stylus";
type LightingScenePreset = "sunset" | "moonlight" | "neon-alley";
type GoodsSubjectPreset = "mascot-badge" | "sword-charm";

function buildDemoCutRgba(preset: LightingScenePreset): Uint8ClampedArray {
  const w = 64;
  const h = 64;
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (preset === "sunset") {
        const k = Math.max(0, 1 - Math.hypot(x / w, y / h));
        buf[idx] = Math.round(32 + k * 223);
        buf[idx + 1] = Math.round(30 + k * 165);
        buf[idx + 2] = Math.round(72 + k * 54);
      } else if (preset === "moonlight") {
        const k = Math.max(0, 1 - Math.hypot((w - x) / w, y / h));
        buf[idx] = Math.round(18 + k * 125);
        buf[idx + 1] = Math.round(28 + k * 168);
        buf[idx + 2] = Math.round(52 + k * 198);
      } else {
        const isEdge = x < 8 || x > w - 9 || y < 8 || y > h - 9;
        buf[idx] = isEdge ? 245 : 22;
        buf[idx + 1] = isEdge ? 38 : 26;
        buf[idx + 2] = isEdge ? 210 : 48;
      }
      buf[idx + 3] = 255;
    }
  }
  return buf;
}

function buildDemoGoodsRgba(preset: GoodsSubjectPreset, vividNeon: boolean): Uint8ClampedArray {
  const w = 80;
  const h = 80;
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inside =
        preset === "mascot-badge"
          ? Math.hypot(x - 40, y - 44) <= 17 ||
            Math.hypot(x - 28, y - 26) <= 8 ||
            Math.hypot(x - 52, y - 26) <= 8
          : Math.abs(x - 40) <= 6 && y >= 18 && y <= 64 || (Math.abs(y - 50) <= 4 && Math.abs(x - 40) <= 18);
      if (!inside) continue;
      const idx = (y * w + x) * 4;
      buf[idx] = vividNeon ? 15 : 196;
      buf[idx + 1] = vividNeon ? 248 : 112;
      buf[idx + 2] = vividNeon ? 42 : 94;
      buf[idx + 3] = 255;
    }
  }
  return buf;
}

const DEFAULT_SAMPLES: readonly StylusCalibrationSample[] = Array.from({ length: 18 }, (_, i) => ({
  x: 16 + i * 14,
  y: 44 + Math.sin(i * 0.45) * 14,
  pressure: 0.2 + (i / 17) * 0.62,
  tiltX: 22,
  tiltY: 14,
  timestampMs: i * 16,
}));

export function ProCraftEnginesPanel() {
  const lang = useI18n((state) => state.lang);
  const isEn = lang === "en";

  const [tab, setTab] = useState<CraftSubTab>("lighting");
  const [lightingScene, setLightingScene] = useState<LightingScenePreset>("sunset");
  const [goodsSubject, setGoodsSubject] = useState<GoodsSubjectPreset>("mascot-badge");
  const [cutlineOffsetPx, setCutlineOffsetPx] = useState(6);
  const [vividNeonTest, setVividNeonTest] = useState(false);
  const [bookPages, setBookPages] = useState(224);

  const [samples, setSamples] = useState<readonly StylusCalibrationSample[]>(DEFAULT_SAMPLES);
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokeMeters, setStrokeMeters] = useState(14);
  const [dipMeters, setDipMeters] = useState(0.9);
  const [nibMedia, setNibMedia] = useState<"dip-pen" | "oriental-brush" | "graphite-pencil">("oriental-brush");

  const lightingRig = useMemo(
    () => extract3dLightingRigFrom2dCut(buildDemoCutRgba(lightingScene), 64, 64),
    [lightingScene],
  );

  const goodsRgba = useMemo(
    () => buildDemoGoodsRgba(goodsSubject, vividNeonTest),
    [goodsSubject, vividNeonTest],
  );

  const cutline = useMemo(
    () =>
      generateDieCutSvgFromAlpha(goodsRgba, 80, 80, {
        offsetPx: cutlineOffsetPx,
        includeKeyringEyelet: true,
        eyeletRadiusPx: 6,
      }),
    [goodsRgba, cutlineOffsetPx],
  );

  const printReport = useMemo(
    () =>
      runCmykPrintPreflight({
        rgba: goodsRgba,
        pixelWidth: 2480,
        pixelHeight: 3508,
        physicalWidthMm: 210,
        physicalHeightMm: 297,
        bookPageCount: bookPages,
      }),
    [goodsRgba, bookPages],
  );

  const stylusProfile = useMemo(() => calibratePersonalStylusProfile(samples), [samples]);
  const nibWear = useMemo(
    () => simulateNibWearAndInkDepletion(strokeMeters, dipMeters, nibMedia),
    [strokeMeters, dipMeters, nibMedia],
  );

  const handlePadPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pressure = e.pressure > 0 && e.pressure < 1 ? e.pressure : 0.48;
    setIsDrawing(true);
    setSamples([
      {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        pressure,
        tiltX: e.tiltX || 20,
        tiltY: e.tiltY || 12,
        timestampMs: Date.now(),
      },
    ]);
  };

  const handlePadPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!isDrawing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const syntheticPressure = e.pressure > 0 && e.pressure < 1 ? e.pressure : Math.min(0.95, 0.18 + (x / Math.max(1, rect.width)) * 0.72);
    setSamples((prev) => [
      ...prev.slice(-96),
      {
        x,
        y,
        pressure: syntheticPressure,
        tiltX: e.tiltX || 20,
        tiltY: e.tiltY || 12,
        timestampMs: Date.now(),
      },
    ]);
  };

  const handleDownloadCutlineSvg = () => {
    if (!cutline.svgPathD || typeof window === "undefined") return;
    const eyeletXml = cutline.eyeletCenter
      ? `<circle cx="${cutline.eyeletCenter.x}" cy="${cutline.eyeletCenter.y}" r="${cutline.eyeletRadiusPx}" fill="none" stroke="magenta" stroke-width="0.6" />`
      : "";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 120 120"><path d="${cutline.svgPathD}" fill="none" stroke="magenta" stroke-width="0.8" />${eyeletXml}</svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `toonstudio-${goodsSubject}-cutline.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const curvePathD = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const y = evaluatePressureCurve(t, stylusProfile.cubicBezierCurve, stylusProfile.deadzoneMin);
      pts.push(`${i === 0 ? "M" : "L"} ${(12 + t * 136).toFixed(1)} ${(92 - y * 78).toFixed(1)}`);
    }
    return pts.join(" ");
  }, [stylusProfile]);

  return (
    <section
      className="pro-craft-panel"
      aria-label={isEn ? "Pro Craft Production Engines" : "프로 작화·굿즈·필압 실전 엔진"}
      data-testid="pro-craft-engines-panel"
    >
      <header className="pro-craft-header">
        <div>
          <h3 className="pro-craft-title">
            {isEn
              ? "2D->3D Auto Lighting · Goods Cutline/CMYK · Personal Stylus Calibration"
              : "2D→3D 자동 라이팅 · 굿즈 칼선/CMYK · 개인 필압 캘리브레이션"}
          </h3>
          <p className="pro-craft-subtitle">
            {isEn
              ? "Clean-room mathematical production engines computed locally in your browser."
              : "브라우저 로컬에서 즉시 연산되는 실전 3점 조명 추정·인쇄 칼선·필압 보정 엔진입니다."}
          </p>
        </div>
        <span className="pro-craft-badge">
          <Sparkles size={14} aria-hidden="true" />
          {isEn ? "Local Math Engine" : "로컬 연산 엔진"}
        </span>
      </header>

      <div role="tablist" className="pro-craft-tabs">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "lighting"}
          className="pro-craft-tab"
          onClick={() => setTab("lighting")}
        >
          <Lightbulb size={15} aria-hidden="true" />
          <span>{isEn ? "2D->3D Lighting Sync" : "2D→3D 자동 라이팅"}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "cutline"}
          className="pro-craft-tab"
          onClick={() => setTab("cutline")}
        >
          <Printer size={15} aria-hidden="true" />
          <span>{isEn ? "Goods Cutline & CMYK" : "굿즈 칼선 · CMYK · 책등"}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "stylus"}
          className="pro-craft-tab"
          onClick={() => setTab("stylus")}
        >
          <PenTool size={15} aria-hidden="true" />
          <span>{isEn ? "Stylus & Nib Wear" : "10초 필압 · 펜촉 마모"}</span>
        </button>
      </div>

      {tab === "lighting" ? (
        <div className="pro-craft-grid" data-testid="pro-craft-lighting-tab">
          <div className="pro-craft-card">
            <div className="pro-craft-row">
              {(["sunset", "moonlight", "neon-alley"] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="pro-craft-chip"
                  data-active={lightingScene === preset}
                  onClick={() => setLightingScene(preset)}
                >
                  {preset === "sunset"
                    ? isEn
                      ? "Golden Sunset Cut"
                      : "노을 역광 컷"
                    : preset === "moonlight"
                      ? isEn
                        ? "Cool Moonlight Cut"
                        : "새벽 달빛 컷"
                      : isEn
                        ? "Neon Rim Cut"
                        : "네온 골목 컷"}
                </button>
              ))}
            </div>
            <dl className="pro-craft-metrics">
              <div>
                <dt>{isEn ? "Detected Mood" : "추정 조명 분위기"}</dt>
                <dd>{isEn ? lightingRig.moodLabelEn : lightingRig.moodLabelKo}</dd>
              </div>
              <div>
                <dt>{isEn ? "Key Color Temp" : "주광 색온도"}</dt>
                <dd>{lightingRig.keyTemperatureKelvin} K</dd>
              </div>
              <div>
                <dt>{isEn ? "Key Direction" : "주광 각도 (방위·고도)"}</dt>
                <dd>
                  {lightingRig.keyLight.azimuthDeg}° / {lightingRig.keyLight.elevationDeg}°
                </dd>
              </div>
              <div>
                <dt>{isEn ? "Key / Fill / Rim" : "주광 / 보조광 / 림라이트"}</dt>
                <dd>
                  {lightingRig.keyLight.intensity} / {lightingRig.fillLight.intensity} / {lightingRig.rimLight.intensity}
                </dd>
              </div>
              <div>
                <dt>{isEn ? "Toon Shadow Ramp" : "툰 셰이더 음영 단계"}</dt>
                <dd>{lightingRig.shadowRampThresholds.join(" · ")}</dd>
              </div>
              <div>
                <dt>{isEn ? "Contrast Ratio" : "명암비"}</dt>
                <dd>{lightingRig.contrastRatio}:1</dd>
              </div>
            </dl>
          </div>
        </div>
      ) : null}

      {tab === "cutline" ? (
        <div className="pro-craft-grid" data-testid="pro-craft-cutline-tab">
          <div className="pro-craft-card">
            <div className="pro-craft-row">
              <button
                type="button"
                className="pro-craft-chip"
                data-active={goodsSubject === "mascot-badge"}
                onClick={() => setGoodsSubject("mascot-badge")}
              >
                {isEn ? "Character Acrylic Keyring" : "캐릭터 아크릴 키링"}
              </button>
              <button
                type="button"
                className="pro-craft-chip"
                data-active={goodsSubject === "sword-charm"}
                onClick={() => setGoodsSubject("sword-charm")}
              >
                {isEn ? "Weapon Die-Cut Sticker" : "무기 다이컷 스티커"}
              </button>
              <button
                type="button"
                className="pro-craft-chip"
                data-active={vividNeonTest}
                onClick={() => setVividNeonTest((v) => !v)}
              >
                {isEn ? "Simulate Neon CMYK Warning" : "형광 RGB 색역 이탈 시험"}
              </button>
            </div>

            <div className="pro-craft-stage">
              <svg viewBox="-16 -18 112 114" className="pro-craft-svg" role="img" aria-label={isEn ? "Die-cut vector preview" : "칼선 벡터 미리보기"}>
                {cutline.svgPathD ? <path d={cutline.svgPathD} className="pro-craft-cutline-path" /> : null}
                {cutline.eyeletCenter ? (
                  <circle
                    cx={cutline.eyeletCenter.x}
                    cy={cutline.eyeletCenter.y}
                    r={cutline.eyeletRadiusPx}
                    className="pro-craft-cutline-eyelet"
                  />
                ) : null}
                <circle cx="40" cy="44" r="15" className="pro-craft-subject-fill" />
              </svg>
              <div className="pro-craft-controls">
                <label className="pro-craft-slider">
                  <span>{isEn ? `Cutline Offset (${cutlineOffsetPx}px)` : `칼선 여백 오프셋 (${cutlineOffsetPx}px)`}</span>
                  <input
                    type="range"
                    min={2}
                    max={14}
                    value={cutlineOffsetPx}
                    onChange={(e) => setCutlineOffsetPx(Number(e.target.value))}
                  />
                </label>
                <label className="pro-craft-slider">
                  <span>{isEn ? `Book Pages (${bookPages}p -> Spine ${printReport.spineWidthMm}mm)` : `단행본 분량 (${bookPages}쪽 → 책등 ${printReport.spineWidthMm}mm)`}</span>
                  <input
                    type="range"
                    min={64}
                    max={480}
                    step={16}
                    value={bookPages}
                    onChange={(e) => setBookPages(Number(e.target.value))}
                  />
                </label>
                <div className="pro-craft-status-row">
                  <span>
                    {isEn ? "DPI:" : "인쇄 해상도:"} {printReport.effectiveDpiX} DPI ({printReport.dpiPass ? "OK" : "LOW"}) ·{" "}
                    {isEn ? "Bleed:" : "3mm 도련:"} {printReport.bleedPixelsRequired}px ·{" "}
                    {isEn ? "CMYK Risk:" : "CMYK 위험도:"} {printReport.outOfGamutRisk}
                  </span>
                </div>
                <button type="button" className="pro-craft-primary-btn" onClick={handleDownloadCutlineSvg}>
                  <Download size={15} aria-hidden="true" />
                  <span>{isEn ? "Export Vector Cutline (.svg)" : "인쇄용 벡터 칼선 (.svg) 다운로드"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "stylus" ? (
        <div className="pro-craft-grid" data-testid="pro-craft-stylus-tab">
          <div className="pro-craft-card">
            <div className="pro-craft-stage">
              <svg
                viewBox="0 0 260 110"
                className="pro-craft-pad"
                onPointerDown={handlePadPointerDown}
                onPointerMove={handlePadPointerMove}
                onPointerUp={() => setIsDrawing(false)}
                onPointerLeave={() => setIsDrawing(false)}
                role="img"
                aria-label={isEn ? "Stylus calibration test pad" : "필압 캘리브레이션 시필 패드"}
              >
                <path d={curvePathD} className="pro-craft-curve-line" />
                {samples.map((pt, idx) => (
                  <circle
                    key={`${pt.timestampMs}-${idx}`}
                    cx={Math.max(6, Math.min(254, pt.x))}
                    cy={Math.max(6, Math.min(104, pt.y))}
                    r={1.5 + pt.pressure * 3}
                    className="pro-craft-sample-dot"
                  />
                ))}
              </svg>
              <div className="pro-craft-controls">
                <p className="pro-craft-archetype">
                  {isEn ? stylusProfile.archetypeLabelEn : stylusProfile.archetypeLabelKo}
                </p>
                <p className="pro-craft-meta">
                  {isEn
                    ? `One-Euro Stabilizer ${stylusProfile.recommendedOneEuro.stabilizerStrengthPct}% (minCutoff ${stylusProfile.recommendedOneEuro.minCutoff}) · Tremor ${stylusProfile.tremorRmsPx}px`
                    : `손떨림 보정 ${stylusProfile.recommendedOneEuro.stabilizerStrengthPct}% (minCutoff ${stylusProfile.recommendedOneEuro.minCutoff}) · 떨림 ${stylusProfile.tremorRmsPx}px`}
                </p>
                <div className="pro-craft-row">
                  {(["dip-pen", "oriental-brush", "graphite-pencil"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className="pro-craft-chip"
                      data-active={nibMedia === m}
                      onClick={() => setNibMedia(m)}
                    >
                      {m === "dip-pen"
                        ? isEn
                          ? "Dip Pen"
                          : "딥펜"
                        : m === "oriental-brush"
                          ? isEn
                            ? "Ink Brush"
                            : "먹붓"
                          : isEn
                            ? "Graphite"
                            : "흑연 연필"}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="pro-craft-chip"
                    onClick={() => {
                      setSamples(DEFAULT_SAMPLES);
                      setStrokeMeters(14);
                      setDipMeters(0.9);
                    }}
                  >
                    <RefreshCw size={13} aria-hidden="true" />
                    <span>{isEn ? "Reset" : "초기화"}</span>
                  </button>
                </div>
                <label className="pro-craft-slider">
                  <span>
                    {isEn
                      ? `Nib Wear (${strokeMeters}m -> Sharpness ${Math.round(nibWear.nibSharpness * 100)}%)`
                      : `누적 필기 (${strokeMeters}m → 펜촉 선명도 ${Math.round(nibWear.nibSharpness * 100)}%)`}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={120}
                    value={strokeMeters}
                    onChange={(e) => setStrokeMeters(Number(e.target.value))}
                  />
                </label>
                <label className="pro-craft-slider">
                  <span>
                    {isEn
                      ? `Ink Since Dip (${dipMeters.toFixed(1)}m -> Remaining ${Math.round(nibWear.inkLoadRemaining * 100)}%)`
                      : `먹물 충전 후 거리 (${dipMeters.toFixed(1)}m → 잔량 ${Math.round(nibWear.inkLoadRemaining * 100)}%)`}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    step={0.1}
                    value={dipMeters}
                    onChange={(e) => setDipMeters(Number(e.target.value))}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
