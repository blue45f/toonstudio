import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { ArrowRight, Cpu, Eraser, LayoutGrid, Moon, PenTool, Scale, Sparkles, Sun, Sunrise, Volume2, VolumeX } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { formatI18nTemplate, useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

import "./home-wow-showcase.css";

const CANVAS_WIDTH = 560;
const CANVAS_HEIGHT = 320;
const HERO_STAGE_PRIMARY = "/assets/studio/vibrant-sprites/wow-hero-atelier-stage.webp";
const HERO_STAGE_FALLBACK = "/assets/studio/vibrant-sprites/emblem-studio.webp";

type PigmentId = "cobalt" | "saffron" | "vermilion" | "ink";
type LightingId = "sunlit" | "golden" | "bluehour" | "ink";
type ToneKey = PigmentId | "emerald" | "panelLine" | "bubbleFill" | "bubbleInk";
type StatusKind = "idle" | "draw" | "spectral" | "stamp" | "cleared";

interface PigmentSpec { readonly id: PigmentId; readonly ko: string; readonly en: string; readonly width: number; readonly wet: boolean; }
interface LightingSpec { readonly id: LightingId; readonly ko: string; readonly en: string; readonly badgeKo: string; readonly badgeEn: string; readonly icon: typeof Sun; }

const PIGMENT_BY_ID: Readonly<Record<PigmentId, PigmentSpec>> = {
  cobalt: { id: "cobalt", ko: "코발트 블루", en: "Cobalt Blue", width: 13, wet: true },
  saffron: { id: "saffron", ko: "사프란 옐로우", en: "Saffron Yellow", width: 14, wet: true },
  vermilion: { id: "vermilion", ko: "버밀리온 코랄", en: "Vermilion Coral", width: 12, wet: true },
  ink: { id: "ink", ko: "먹선 잉크", en: "Sumi Ink", width: 4.5, wet: false },
};
const PIGMENTS: readonly PigmentSpec[] = [PIGMENT_BY_ID.cobalt, PIGMENT_BY_ID.saffron, PIGMENT_BY_ID.vermilion, PIGMENT_BY_ID.ink];

const LIGHTING_BY_ID: Readonly<Record<LightingId, LightingSpec>> = {
  sunlit: { id: "sunlit", ko: "햇살 아틀리에", en: "Sunlit Atelier", badgeKo: "5600K 자연광", badgeEn: "5600K Daylight", icon: Sun },
  golden: { id: "golden", ko: "노을 골든아워", en: "Sunset Golden Hour", badgeKo: "3200K 노을빛", badgeEn: "3200K Golden", icon: Sunrise },
  bluehour: { id: "bluehour", ko: "블루아워 시네마", en: "Blue Hour Cinema", badgeKo: "8400K 시네마", badgeEn: "8400K Cinema", icon: Moon },
  ink: { id: "ink", ko: "흑백 원고 잉크", en: "Monochrome Ink", badgeKo: "600dpi 원고", badgeEn: "600dpi Print", icon: PenTool },
};
const LIGHTING_PRESETS: readonly LightingSpec[] = [LIGHTING_BY_ID.sunlit, LIGHTING_BY_ID.golden, LIGHTING_BY_ID.bluehour, LIGHTING_BY_ID.ink];

const SPRITE_MEDALLIONS = [
  { src: "/assets/studio/vibrant-sprites/tech-webgpu.webp", ko: "WebGPU 실시간 분광 엔진", en: "WebGPU Live Spectral Engine" },
  { src: "/assets/studio/vibrant-sprites/tool-gpen.webp", ko: "G펜 탄성 필압 선화", en: "Responsive G-Pen Inking" },
  { src: "/assets/studio/vibrant-sprites/tool-watercolor.webp", ko: "감산 수채 안료 혼색", en: "Subtractive Watercolor Mix" },
] as const;

const TONE_SPECS: Readonly<Record<ToneKey, readonly [string, number, number, number]>> = {
  cobalt: ["--wow-pigment-cobalt", 0.52, 0.19, 258],
  saffron: ["--wow-pigment-saffron", 0.81, 0.17, 86],
  vermilion: ["--wow-pigment-vermilion", 0.64, 0.21, 30],
  ink: ["--wow-pigment-ink", 0.2, 0.02, 268],
  emerald: ["--wow-pigment-emerald", 0.62, 0.18, 160],
  panelLine: ["--wow-panel-line", 0.32, 0.03, 265],
  bubbleFill: ["--wow-bubble-fill", 0.99, 0.006, 92],
  bubbleInk: ["--wow-bubble-ink", 0.18, 0.02, 265],
};

const SPECTRAL_CURVES: readonly (readonly [ToneKey, number, number, number, number, number, number, number, number, number, number])[] = [
  ["cobalt", 0.34, 54, 74, 212, 154, 118, 224, 128, 304, 166],
  ["cobalt", 0.82, 28, 86, 204, 160, 128, 228, 134, 294, 164],
  ["saffron", 0.38, 54, 486, 114, 404, 206, 332, 194, 256, 156],
  ["saffron", 0.86, 28, 474, 122, 398, 196, 330, 188, 266, 158],
  ["emerald", 0.42, 46, 212, 162, 252, 112, 312, 208, 348, 154],
  ["emerald", 0.9, 22, 224, 164, 258, 124, 306, 196, 338, 154],
  ["ink", 0.65, 2, 118, 228, 222, 92, 338, 228, 444, 96],
];

type WindowWithWebkitAudio = Window & { readonly webkitAudioContext?: typeof AudioContext };

function resolveTone(host: HTMLElement | null, tone: ToneKey, alpha = 1): string {
  const [cssVar, lightness, chroma, hue] = TONE_SPECS[tone];
  if (alpha === 1 && host && typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
    const computed = window.getComputedStyle(host).getPropertyValue(cssVar).trim();
    if (computed) return computed;
  }
  return alpha < 1 ? `oklch(${lightness} ${chroma} ${hue} / ${alpha})` : `oklch(${lightness} ${chroma} ${hue})`;
}

function resolveCanvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number): { readonly x: number; readonly y: number } {
  const rect = canvas.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return { x: ((clientX - rect.left) / rect.width) * CANVAS_WIDTH, y: ((clientY - rect.top) / rect.height) * CANVAS_HEIGHT };
  }
  return { x: Math.max(0, Math.min(CANVAS_WIDTH, clientX)), y: Math.max(0, Math.min(CANVAS_HEIGHT, clientY)) };
}

function tryCapturePointer(element: HTMLCanvasElement, pointerId: number): boolean {
  if (typeof element.setPointerCapture !== "function") return false;
  try {
    element.setPointerCapture(pointerId);
    return true;
  } catch {
    return false;
  }
}

function drawSpeechBalloon(
  ctx: CanvasRenderingContext2D,
  host: HTMLElement | null,
  cx: number, cy: number, rx: number, ry: number, tailX: number, tailY: number,
  caption: string,
): void {
  ctx.save();
  ctx.fillStyle = resolveTone(host, "bubbleFill");
  ctx.strokeStyle = resolveTone(host, "bubbleInk");
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 10, cy + ry - 3);
  ctx.lineTo(tailX, tailY);
  ctx.lineTo(cx + 8, cy + ry - 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = resolveTone(host, "bubbleInk");
  ctx.font = "700 13px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(caption, cx, cy);
  ctx.restore();
}

function paintFourPanelStamp(ctx: CanvasRenderingContext2D, host: HTMLElement | null, firstCaption: string, secondCaption: string): void {
  const m = 18;
  const g = 12;
  const w = (CANVAS_WIDTH - m * 2 - g) / 2;
  const h = (CANVAS_HEIGHT - m * 2 - g) / 2;
  const panels = [[m, m, "01"], [m + w + g, m, "02"], [m, m + h + g, "03"], [m + w + g, m + h + g, "04"]] as const;

  ctx.save();
  ctx.strokeStyle = resolveTone(host, "panelLine");
  ctx.lineWidth = 2.5;
  ctx.fillStyle = resolveTone(host, "panelLine", 0.72);
  ctx.font = "700 11px sans-serif";
  for (const [x, y, label] of panels) {
    ctx.strokeRect(x, y, w, h);
    ctx.fillText(label, x + 8, y + 16);
  }
  ctx.strokeStyle = resolveTone(host, "cobalt", 0.45);
  ctx.lineWidth = 1.4;
  const p2Right = m + w * 2 + g;
  for (let i = 0; i < 6; i += 1) {
    ctx.beginPath();
    ctx.moveTo(p2Right - 6, m + 10 + i * 20);
    ctx.lineTo(p2Right - 46, m + 24 + i * 16);
    ctx.stroke();
  }
  ctx.restore();
  drawSpeechBalloon(ctx, host, m + w * 0.62, m + h * 0.44, 62, 24, m + w * 0.46, m + h * 0.78, firstCaption);
  drawSpeechBalloon(ctx, host, m + w * 1.5 + g, m + h * 1.46 + g, 64, 24, m + w * 1.32 + g, m + h * 1.82 + g, secondCaption);
}

function paintCanvasStroke(
  ctx: CanvasRenderingContext2D,
  host: HTMLElement | null,
  spec: PigmentSpec,
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
  pressure: number,
): void {
  const strokeWidth = spec.width * (pressure > 0 ? Math.min(1.3, Math.max(0.45, pressure + 0.35)) : 0.85);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const passes: readonly (readonly [number, number])[] = spec.wet ? [[0.28, strokeWidth * 1.65], [0.84, strokeWidth]] : [[0.96, strokeWidth]];
  for (const [alpha, width] of passes) {
    ctx.strokeStyle = resolveTone(host, spec.id, alpha);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  ctx.restore();
}

export function HomeInteractiveWowShowcase() {
  const bi = useBilingualLocalizer("domains.marketing.HomeInteractiveWowShowcase");
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ readonly x: number; readonly y: number } | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastSoundMsRef = useRef(0);

  const [activePigment, setActivePigment] = useState<PigmentId>("cobalt");
  const [activeLighting, setActiveLighting] = useState<LightingId>("sunlit");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [hasArtwork, setHasArtwork] = useState(false);
  const [spectralActive, setSpectralActive] = useState(false);
  const [statusKind, setStatusKind] = useState<StatusKind>("idle");
  const [heroSrc, setHeroSrc] = useState(HERO_STAGE_PRIMARY);

  useEffect(() => () => {
    const audioCtx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (audioCtx && audioCtx.state !== "closed") void audioCtx.close().catch(() => false);
  }, []);

  const playNibScratch = useCallback((cue: "stroke" | "mix" | "stamp") => {
    if (!soundEnabled || typeof window === "undefined") return;
    const nowMs = Date.now();
    if (cue === "stroke" && nowMs - lastSoundMsRef.current < 75) return;
    lastSoundMsRef.current = nowMs;
    const AudioCtor = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!AudioCtor) return;
    try {
      const audioCtx = audioCtxRef.current ?? new AudioCtor();
      audioCtxRef.current = audioCtx;
      if (audioCtx.state === "suspended") void audioCtx.resume().catch(() => false);
      const now = audioCtx.currentTime;
      const oscillator = audioCtx.createOscillator();
      const filter = audioCtx.createBiquadFilter();
      const gain = audioCtx.createGain();
      oscillator.type = cue === "mix" ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(cue === "stamp" ? 420 : cue === "mix" ? 540 : 760, now);
      oscillator.frequency.exponentialRampToValueAtTime(cue === "mix" ? 820 : 280, now + 0.045);
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(cue === "mix" ? 900 : 1850, now);
      gain.gain.setValueAtTime(0.032, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
      oscillator.start(now);
      oscillator.stop(now + 0.06);
    } catch {
      return;
    }
  }, [soundEnabled]);

  const activePigmentSpec = PIGMENT_BY_ID[activePigment];
  const activeLightingSpec = LIGHTING_BY_ID[activeLighting];

  const paintSegment = useCallback((from: { readonly x: number; readonly y: number }, to: { readonly x: number; readonly y: number }, pressure: number) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) paintCanvasStroke(ctx, rootRef.current, activePigmentSpec, from, to, pressure);
  }, [activePigmentSpec]);

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current = true;
    const point = resolveCanvasPoint(canvas, event.clientX, event.clientY);
    lastPointRef.current = point;
    tryCapturePointer(event.currentTarget, event.pointerId);
    paintSegment(point, { x: point.x + 0.6, y: point.y + 0.6 }, event.pressure);
    setHasArtwork(true);
    setStrokeCount((count) => count + 1);
    setStatusKind("draw");
    playNibScratch("stroke");
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !canvasRef.current || !lastPointRef.current) return;
    const next = resolveCanvasPoint(canvasRef.current, event.clientX, event.clientY);
    paintSegment(lastPointRef.current, next, event.pressure);
    lastPointRef.current = next;
    playNibScratch("stroke");
  };

  const endDrawing = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const runSpectralMixDemo = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const [tone, alpha, lineWidth, x0, y0, cx1, cy1, cx2, cy2, x1, y1] of SPECTRAL_CURVES) {
        ctx.strokeStyle = resolveTone(rootRef.current, tone, alpha);
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.bezierCurveTo(cx1, cy1, cx2, cy2, x1, y1);
        ctx.stroke();
      }
      ctx.restore();
    }
    setHasArtwork(true);
    setSpectralActive(true);
    setStrokeCount((count) => count + 1);
    setStatusKind("spectral");
    playNibScratch("mix");
  };

  const stampFourPanelLayout = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) paintFourPanelStamp(ctx, rootRef.current, bi("어, 재밌네!", "Feels real!"), bi("4컷 완성!", "4-cut done!"));
    setHasArtwork(true);
    setStatusKind("stamp");
    playNibScratch("stamp");
  };

  const clearCanvas = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    setHasArtwork(false);
    setSpectralActive(false);
    setStrokeCount(0);
    setStatusKind("cleared");
  };

  const statusText = statusKind === "spectral"
    ? bi("감산 분광 혼색 원리: 일반 RGB는 파랑+노랑이 탁한 회색이 되지만, 분광 안료는 맑은 에메랄드 스월로 섞여요.", "Subtractive spectral mix: unlike flat RGB (muddy gray), cobalt and saffron blend into a luminous emerald swirl.")
    : statusKind === "stamp"
      ? bi("4컷 웹툰 프레임과 말풍선 스탬프를 찍었어요. 빈 칸에 직접 선을 그려 넣어 보세요.", "Stamped a 4-panel webtoon grid with speech balloons. Sketch directly inside any panel.")
      : statusKind === "draw"
        ? formatI18nTemplate(bi("{pigment} 안료로 {count}번째 붓터치를 그렸어요.", "Painted stroke #{count} using {pigment}."), { pigment: bi(activePigmentSpec.ko, activePigmentSpec.en), count: strokeCount })
        : statusKind === "cleared"
          ? bi("캔버스를 깨끗하게 비웠어요. 새 장면을 자유롭게 그려 보세요.", "Canvas cleared. Ready for your next stroke.")
          : bi("마우스·터치·펜으로 캔버스를 문지르거나 ‘파랑+노랑 분광 혼색 시연’을 눌러 보세요.", "Drag across the canvas with mouse, pen, or touch, or click Blue + Yellow Spectral Mix.");

  return (
    <section ref={rootRef} className="home-wow-showcase" data-testid="home-wow-showcase" aria-labelledby="hwow-sandbox-title">
      <span className="hwow-spectrum-rule" aria-hidden="true" />
      <div className="hwow-inner">
        <div className="hwow-head">
          <div className="hwow-copy">
            <div className="hwow-kicker-row">
              <span className="hwow-kicker">
                <Sparkles size={14} strokeWidth={1.8} aria-hidden="true" />
                {bi("설치 0초 · 라이브 분광 샌드박스", "Zero-install · Live Spectral Sandbox")}
              </span>
              <button type="button" className="hwow-sound-toggle" data-testid="hwow-sound-toggle" aria-pressed={soundEnabled} onClick={() => setSoundEnabled((prev) => !prev)}>
                {soundEnabled ? <Volume2 size={15} strokeWidth={1.7} aria-hidden="true" /> : <VolumeX size={15} strokeWidth={1.7} aria-hidden="true" />}
                <span>{soundEnabled ? bi("펜촉 사운드 켜짐", "Nib sound on") : bi("펜촉 사운드 꺼짐", "Nib sound off")}</span>
              </button>
            </div>
            <h2 id="hwow-sandbox-title">{bi("지금 손으로 그려 보는 라이브 아틀리에", "Draw right now in the Live Atelier")}</h2>
            <p>{bi("파랑과 노랑이 맑은 에메랄드로 섞이는 분광 안료, 1클릭 4컷 말풍선, 4종 조명 프리셋을 홈에서 바로 만져 보세요.", "Test subtractive pigments where blue and yellow mix into clear emerald, stamp a 4-panel layout, and switch studio lighting right here.")}</p>
          </div>
          <div className="hwow-hero-visual">
            <span className="hwow-hero-stage-thumb">
              <img src={heroSrc} alt={bi("툰스튜디오 라이브 아틀리에 스테이지 아트워크", "ToonStudio live atelier stage artwork")} width={320} height={200} loading="lazy" decoding="async" onError={() => { if (heroSrc !== HERO_STAGE_FALLBACK) setHeroSrc(HERO_STAGE_FALLBACK); }} />
            </span>
            <div className="hwow-sprite-medallions">
              {SPRITE_MEDALLIONS.map((item) => (
                <div className="hwow-sprite-chip" key={item.src}>
                  <img src={item.src} alt="" width={28} height={28} loading="lazy" decoding="async" aria-hidden="true" />
                  <span>{bi(item.ko, item.en)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="hwow-workspace">
          <div className="hwow-canvas-column">
            <div className="hwow-canvas-frame" data-lighting={activeLighting} data-testid="hwow-preview-frame">
              <div className="hwow-frame-bar">
                <span className="hwow-lighting-badge" data-testid="hwow-lighting-badge">
                  {bi(activeLightingSpec.ko, activeLightingSpec.en)} · {bi(activeLightingSpec.badgeKo, activeLightingSpec.badgeEn)}
                </span>
                <span className="hwow-frame-meta">
                  <span>{bi(activePigmentSpec.ko, activePigmentSpec.en)}</span>
                  <span data-testid="hwow-stroke-count">{formatI18nTemplate(bi("획 {count}회", "{count} strokes"), { count: strokeCount })}</span>
                </span>
              </div>
              <div className="hwow-canvas-stage">
                <canvas ref={canvasRef} className="hwow-canvas" data-testid="hwow-live-canvas" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} aria-label={bi("라이브 분광 미니 캔버스 체험판", "Live spectral mini canvas playground")} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={endDrawing} onPointerCancel={endDrawing} onPointerLeave={endDrawing} />
                <span className="hwow-lighting-glaze" aria-hidden="true" />
                <div className="hwow-canvas-hint" data-hidden={hasArtwork ? "true" : "false"} aria-hidden="true">
                  <span><PenTool size={14} strokeWidth={1.7} />{bi("여기를 마우스나 손가락으로 문질러 보세요", "Drag with mouse, pen, or finger here")}</span>
                </div>
              </div>
            </div>
            <div className="hwow-status-strip" data-spectral-active={spectralActive ? "true" : "false"} role="status" aria-live="polite">
              <span className="hwow-status-dot" aria-hidden="true" />
              <span>{statusText}</span>
            </div>
          </div>

          <div className="hwow-controls-column">
            <div className="hwow-control-block">
              <span className="hwow-block-label">{bi("주얼 아틀리에 안료", "Jewel Atelier Pigments")}</span>
              <div className="hwow-pigment-grid" role="group" aria-label={bi("안료 색상 선택", "Choose pigment swatch")}>
                {PIGMENTS.map((pigment) => (
                  <button key={pigment.id} type="button" className="hwow-pigment-btn" data-pigment={pigment.id} aria-pressed={activePigment === pigment.id} onClick={() => setActivePigment(pigment.id)}>
                    <span className="hwow-swatch-gem" aria-hidden="true" />
                    <span>{bi(pigment.ko, pigment.en)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="hwow-control-block">
              <span className="hwow-block-label">{bi("원클릭 라이브 체험", "One-Click Live Demos")}</span>
              <div className="hwow-demo-actions">
                <button type="button" className="hwow-demo-btn hwow-demo-btn--spectral" data-testid="hwow-spectral-mix-btn" onClick={runSpectralMixDemo}>
                  <span className="hwow-spectral-dots" aria-hidden="true"><i /><i /><i /></span>
                  <span>{bi("파랑+노랑 분광 혼색 시연", "Blue + Yellow Spectral Mix Demo")}</span>
                </button>
                <div className="hwow-demo-secondary-row">
                  <button type="button" className="hwow-demo-btn" data-testid="hwow-stamp-btn" onClick={stampFourPanelLayout}>
                    <LayoutGrid size={15} strokeWidth={1.7} aria-hidden="true" />
                    <span>{bi("1클릭 4컷 말풍선 스탬프", "1-Click 4-Panel Speech Stamp")}</span>
                  </button>
                  <button type="button" className="hwow-demo-btn" data-testid="hwow-clear-btn" onClick={clearCanvas}>
                    <Eraser size={15} strokeWidth={1.7} aria-hidden="true" />
                    <span>{bi("지우기", "Clear")}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="hwow-control-block">
              <span className="hwow-block-label">{bi("조명 · 분위기 프리셋", "Lighting & Mood Presets")}</span>
              <div className="hwow-lighting-grid" role="group" aria-label={bi("조명 프리셋 선택", "Choose lighting preset")}>
                {LIGHTING_PRESETS.map((preset) => {
                  const Icon = preset.icon;
                  return (
                    <button key={preset.id} type="button" className="hwow-lighting-btn" data-lighting-option={preset.id} aria-pressed={activeLighting === preset.id} onClick={() => setActiveLighting(preset.id)}>
                      <Icon size={15} strokeWidth={1.7} aria-hidden="true" />
                      <span>{bi(preset.ko, preset.en)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="hwow-cta-bar">
          <Link href="/studio/new?lane=blank" className="hwow-cta hwow-cta--primary ink-arrow"><span>{bi("이 감각 그대로 무료 캔버스 열기", "Open Free Canvas With This Feel")}</span><ArrowRight size={15} strokeWidth={1.8} aria-hidden="true" /></Link>
          <Link href="/compare/studio" className="hwow-cta hwow-cta--secondary ink-arrow"><Scale size={15} strokeWidth={1.7} aria-hidden="true" /><span>{bi("글로벌 도구 6종 비교", "Compare 6 Global Studio Tools")}</span></Link>
          <Link href="/tech" className="hwow-cta hwow-cta--secondary ink-arrow"><Cpu size={15} strokeWidth={1.7} aria-hidden="true" /><span>{bi("차세대 기술·9-LLM MCP", "Next-Gen Tech & 9-LLM MCP")}</span></Link>
        </div>
      </div>
    </section>
  );
}
