import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowRight, Compass, Cpu, Eraser, LayoutGrid, Moon, MoveHorizontal, Palette, PenTool, Scale, Sun, Sunrise, Volume2, VolumeX } from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { formatI18nTemplate, useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

import {
  buildPigmentMoodStyle,
  clampCurtainPercent,
  DEFAULT_CURTAIN_PERCENT,
  DEFAULT_HOME_PIGMENT_MOOD,
  DEFAULT_STUDIO_TAILOR_MODE,
  HOME_PIGMENT_MOODS,
  PIPELINE_CURTAIN_STAGES,
  resolveCurtainStage,
  resolveHomePigmentMood,
  resolveStudioTailorMode,
  stepCurtainPercent,
  STUDIO_TAILOR_MODES,
  type HomePigmentMoodId,
  type StudioTailorModeId,
} from "./home-live-staging-engine";
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
  cobalt: ["--wow-pigment-cobalt", 0.56, 0.16, 245],
  saffron: ["--wow-pigment-saffron", 0.79, 0.16, 72],
  vermilion: ["--wow-pigment-vermilion", 0.65, 0.19, 28],
  ink: ["--wow-pigment-ink", 0.2, 0.012, 65],
  emerald: ["--wow-pigment-emerald", 0.64, 0.16, 158],
  panelLine: ["--wow-panel-line", 0.3, 0.015, 65],
  bubbleFill: ["--wow-bubble-fill", 0.988, 0.005, 85],
  bubbleInk: ["--wow-bubble-ink", 0.18, 0.012, 65],
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

function resolveCurtainPointerPercent(element: HTMLElement, clientX: number): number {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 ? clampCurtainPercent(((clientX - rect.left) / rect.width) * 100) : clampCurtainPercent(clientX);
}

function tryCapturePointer(element: Element, pointerId: number): boolean {
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
  const svgPrefix = useId();
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const curtainStageRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const curtainPointerId = useRef<number | null>(null);
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
  const [curtainPercent, setCurtainPercent] = useState<number>(DEFAULT_CURTAIN_PERCENT);
  const [activeMood, setActiveMood] = useState<HomePigmentMoodId>(DEFAULT_HOME_PIGMENT_MOOD);
  const [activeTailorMode, setActiveTailorMode] = useState<StudioTailorModeId>(DEFAULT_STUDIO_TAILOR_MODE);

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
  const curtain = resolveCurtainStage(curtainPercent);
  const activeMoodSpec = resolveHomePigmentMood(activeMood);
  const activeTailorSpec = resolveStudioTailorMode(activeTailorMode);
  const rootMoodStyle = buildPigmentMoodStyle(activeMood) as CSSProperties;
  const skyGradId = `${svgPrefix}-sky`;
  const rimGradId = `${svgPrefix}-rim`;

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

  const handleCurtainPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const stage = curtainStageRef.current;
    if (!stage || event.button !== 0 || curtainPointerId.current !== null) return;
    curtainPointerId.current = event.pointerId;
    tryCapturePointer(stage, event.pointerId);
    setCurtainPercent(resolveCurtainPointerPercent(stage, event.clientX));
  };

  const handleCurtainPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const stage = curtainStageRef.current;
    if (!stage || curtainPointerId.current !== event.pointerId) return;
    setCurtainPercent(resolveCurtainPointerPercent(stage, event.clientX));
  };

  const endCurtainDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (curtainPointerId.current === event.pointerId) curtainPointerId.current = null;
  };

  const handleCurtainKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = stepCurtainPercent(curtainPercent, event.key, event.shiftKey);
    if (next === null) return;
    event.preventDefault();
    setCurtainPercent(next);
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
    ? bi("분광 혼색 예시입니다. 코발트와 사프란 사이에 에메랄드 색이 이어지는 붓길을 그렸어요.", "Spectral mixing example: the painted swirls show emerald between cobalt and saffron.")
    : statusKind === "stamp"
      ? bi("4컷 웹툰 프레임과 말풍선 스탬프를 찍었어요. 빈 칸에 직접 선을 그려 넣어 보세요.", "Stamped a 4-panel webtoon grid with speech balloons. Sketch directly inside any panel.")
      : statusKind === "draw"
        ? formatI18nTemplate(bi("{pigment} 안료로 {count}번째 붓터치를 그렸어요.", "Painted stroke #{count} using {pigment}."), { pigment: bi(activePigmentSpec.ko, activePigmentSpec.en), count: strokeCount })
        : statusKind === "cleared"
          ? bi("캔버스를 깨끗하게 비웠어요. 새 장면을 자유롭게 그려 보세요.", "Canvas cleared. Ready for your next stroke.")
          : bi("마우스·터치·펜으로 캔버스를 문지르거나 ‘파랑+노랑 분광 혼색 시연’을 눌러 보세요.", "Drag across the canvas with mouse, pen, or touch, or click Blue + Yellow Spectral Mix.");

  const curtainValueText = formatI18nTemplate(
    bi("{percent}% · {step}단계 {stage}", "{percent}% · Step {step} {stage}"),
    { percent: curtain.percent, step: curtain.stage.stepCode, stage: bi(curtain.stage.titleKo, curtain.stage.titleEn) },
  );

  return (
    <section
      ref={rootRef}
      className="home-wow-showcase"
      style={rootMoodStyle}
      data-testid="home-wow-showcase"
      data-editorial-palette="spectrum-zero-violet"
      data-active-mood={activeMood}
      data-curtain-stage={curtain.stage.id}
      data-tailor-mode={activeTailorMode}
      aria-labelledby="hwow-sandbox-title"
    >
      <span className="hwow-spectrum-rule" aria-hidden="true" />
      <div className="hwow-inner">
        <div className="hwow-head">
          <div className="hwow-copy">
            <div className="hwow-kicker-row">
              <span className="hwow-kicker"><Palette size={14} strokeWidth={1.8} aria-hidden="true" />{bi("설치 0초 · 라이브 분광 샌드박스", "Zero-install · Live Spectral Sandbox")}</span>
              <button type="button" className="hwow-sound-toggle min-h-11" data-testid="hwow-sound-toggle" aria-pressed={soundEnabled} onClick={() => setSoundEnabled((prev) => !prev)}>
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

        {/* 5대 탈-바이올렛 도메인 안료 라이브 스위처 */}
        <div className="hwow-mood-bar" data-testid="hwow-pigment-mood-bar">
          <div className="hwow-mood-head">
            <span className="hwow-block-label">{bi("5대 도메인 안료 라이브 스위처", "5-Domain Live Pigment Switcher")}</span>
            <p className="hwow-mood-note" data-testid="hwow-mood-note">
              <strong>{bi(activeMoodSpec.nameKo, activeMoodSpec.nameEn)}</strong>{" · "}{bi(activeMoodSpec.noteKo, activeMoodSpec.noteEn)}
            </p>
          </div>
          <div className="hwow-mood-row">
            <div className="hwow-mood-swatches" role="group" aria-label={bi("5대 도메인 안료 선택", "Choose 5 domain pigments")}>
              {HOME_PIGMENT_MOODS.map((mood) => (
                <button key={mood.id} type="button" className="hwow-mood-btn min-h-11" data-mood={mood.id} aria-pressed={activeMood === mood.id} onClick={() => setActiveMood(mood.id)}>
                  <span className="hwow-mood-dot" aria-hidden="true" />
                  <span className="hwow-mood-label"><strong>{bi(mood.domainKo, mood.domainEn)}</strong><small>{bi(mood.nameKo, mood.nameEn)}</small></span>
                </button>
              ))}
            </div>
            <Link href={activeMoodSpec.ctaHref} className="hwow-mood-cta ink-arrow min-h-11" data-testid="hwow-mood-cta">
              <span>{bi(activeMoodSpec.ctaLabelKo, activeMoodSpec.ctaLabelEn)}</span><ArrowRight size={15} strokeWidth={1.8} aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* 4단계 라인→완성 인터랙티브 드래그 커튼 */}
        <div className="hwow-curtain-panel" data-testid="hwow-curtain-panel">
          <div className="hwow-curtain-head">
            <div className="hwow-curtain-meta">
              <span className="hwow-curtain-step-pill" data-testid="hwow-curtain-stage-badge">
                <span>{curtain.stage.stepCode}</span><span>{bi(curtain.stage.titleKo, curtain.stage.titleEn)}</span><span className="hwow-curtain-pct">{curtain.percent}%</span>
              </span>
              <p className="hwow-curtain-desc" data-testid="hwow-curtain-stage-desc">{bi(curtain.stage.summaryKo, curtain.stage.summaryEn)}</p>
            </div>
            <Link href={curtain.stage.routeHref} className="hwow-curtain-route ink-arrow min-h-11" data-testid="hwow-curtain-route-link">
              <span>{bi(curtain.stage.routeLabelKo, curtain.stage.routeLabelEn)}</span><ArrowRight size={14} strokeWidth={1.8} aria-hidden="true" />
            </Link>
          </div>

          <div
            ref={curtainStageRef}
            className="hwow-curtain-stage"
            data-testid="hwow-curtain-stage"
            onPointerDown={handleCurtainPointerDown}
            onPointerMove={handleCurtainPointerMove}
            onPointerUp={endCurtainDrag}
            onPointerCancel={endCurtainDrag}
            onLostPointerCapture={endCurtainDrag}
            onPointerLeave={(event) => {
              if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) endCurtainDrag(event);
            }}
          >
            <svg className="hwow-curtain-svg" viewBox="0 0 640 280" aria-hidden="true">
              <rect className="hwow-svg-paper" width="640" height="280" />
              <g className="hwow-svg-rough-grid">
                <line x1="0" y1="204" x2="640" y2="204" /><line x1="320" y1="204" x2="40" y2="24" /><line x1="320" y1="204" x2="600" y2="28" />
                <line x1="320" y1="204" x2="0" y2="262" /><line x1="320" y1="204" x2="640" y2="262" /><rect x="24" y="18" width="592" height="244" rx="8" />
              </g>
              <g className="hwow-svg-rough-sketch">
                <rect x="54" y="114" width="62" height="90" /><rect x="128" y="88" width="76" height="116" /><rect x="446" y="76" width="68" height="128" /><rect x="524" y="106" width="58" height="98" />
                <circle cx="294" cy="112" r="26" /><path d="M 244 252 Q 258 156 294 142 Q 332 152 356 252" />
                <path d="M 304 146 Q 368 134 422 158 Q 378 176 312 164" /><path d="M 42 224 L 598 224" />
              </g>
            </svg>

            <div className="hwow-curtain-wipe" data-testid="hwow-curtain-wipe" style={{ clipPath: `inset(0 ${100 - curtain.percent}% 0 0)` }}>
              <svg className="hwow-curtain-svg" viewBox="0 0 640 280" aria-hidden="true">
                <defs>
                  <linearGradient id={skyGradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" className="hwow-stop-sky-top" /><stop offset="68%" className="hwow-stop-sky-mid" /><stop offset="100%" className="hwow-stop-sky-low" />
                  </linearGradient>
                  <linearGradient id={rimGradId} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" className="hwow-stop-rim-a" /><stop offset="100%" className="hwow-stop-rim-b" />
                  </linearGradient>
                </defs>
                <rect className="hwow-svg-paper" width="640" height="280" />
                <g className="hwow-svg-color" data-curtain-layer="color" style={{ opacity: curtain.colorLayerOpacity }}>
                  <rect x="24" y="18" width="592" height="244" rx="8" fill={`url(#${skyGradId})`} />
                  <ellipse cx="478" cy="84" rx="112" ry="54" className="hwow-svg-wash-sun" /><ellipse cx="144" cy="96" rx="118" ry="52" className="hwow-svg-wash-sky" />
                  <rect x="54" y="114" width="62" height="90" className="hwow-svg-city-far" /><rect x="128" y="88" width="76" height="116" className="hwow-svg-city-mid" />
                  <rect x="446" y="76" width="68" height="128" className="hwow-svg-city-mid" /><rect x="524" y="106" width="58" height="98" className="hwow-svg-city-far" />
                  <rect x="24" y="204" width="592" height="58" className="hwow-svg-rooftop" />
                  <path d="M 244 258 Q 258 156 294 142 Q 332 152 356 258 Z" className="hwow-svg-coat" />
                  <circle cx="294" cy="112" r="25" className="hwow-svg-portrait" /><path d="M 304 144 Q 372 132 426 156 Q 382 178 308 164 Z" className="hwow-svg-scarf" />
                </g>
                <g className="hwow-svg-ink" data-curtain-layer="ink" style={{ opacity: curtain.inkLayerOpacity }}>
                  <rect x="24" y="18" width="592" height="244" rx="8" />
                  <path d="M 54 204 V 114 H 116 V 204 M 128 204 V 88 H 204 V 204 M 446 204 V 76 H 514 V 204 M 524 204 V 106 H 582 V 204" />
                  <path d="M 24 204 H 616 M 24 224 H 616" />
                  <path d="M 268 106 Q 272 78 302 82 Q 326 88 320 116 Q 314 138 292 138 Q 268 136 268 106 Z" />
                  <path d="M 266 102 Q 284 74 316 84 Q 329 94 326 112" /><path d="M 244 258 Q 258 156 294 142 Q 332 152 356 258" />
                  <path d="M 302 144 Q 372 132 426 156 Q 382 178 308 164 Z" /><path d="M 468 42 L 586 58 M 486 60 L 598 72 M 506 78 L 604 88" className="hwow-svg-speedline" />
                </g>
                <g className="hwow-svg-finish" data-curtain-layer="finish" style={{ opacity: curtain.finishLayerOpacity }}>
                  <polygon points="366,18 616,18 524,262 246,262" fill={`url(#${rimGradId})`} />
                  <path d="M 304 144 Q 372 132 426 156" className="hwow-svg-rim-stroke" />
                  <ellipse cx="470" cy="116" rx="92" ry="30" className="hwow-svg-balloon-fill" /><polygon points="416,138 390,158 438,144" className="hwow-svg-balloon-fill" />
                  <text x="470" y="120" textAnchor="middle" className="hwow-svg-balloon-text">{bi("이 장면, 바로 그려 볼까!", "Ready to ink this beat!")}</text>
                  <text x="92" y="64" className="hwow-svg-sfx-text">{bi("사각—", "SWISH—")}</text>
                </g>
              </svg>
            </div>

            <span className="hwow-curtain-badge hwow-curtain-badge--left" aria-hidden="true">{bi(curtain.stage.titleKo, curtain.stage.titleEn)}</span>
            <span className="hwow-curtain-badge hwow-curtain-badge--right" aria-hidden="true">{bi("러프 콘티", "Rough Draft")}</span>
            <div className="hwow-curtain-divider" style={{ left: `${curtain.percent}%` }}>
              <div
                role="slider"
                tabIndex={0}
                className="hwow-curtain-handle min-h-11"
                data-testid="hwow-curtain-slider"
                aria-label={bi("라인에서 완성까지 비교 커튼", "Line to finish comparison curtain")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={curtain.percent}
                aria-valuetext={curtainValueText}
                onKeyDown={handleCurtainKeyDown}
              >
                <MoveHorizontal size={16} strokeWidth={2} aria-hidden="true" />
              </div>
            </div>
          </div>

          <div className="hwow-curtain-steps" role="group" aria-label={bi("라인에서 완성까지 4단계 선택", "Select 4 line-to-finish stages")}>
            {PIPELINE_CURTAIN_STAGES.map((stage) => (
              <button key={stage.id} type="button" className="hwow-curtain-step-btn min-h-11" data-stage-option={stage.id} aria-pressed={curtain.stage.id === stage.id} onClick={() => setCurtainPercent(stage.snapPercent)}>
                <span className="hwow-step-code">{stage.stepCode}</span>
                <span className="hwow-step-copy"><strong>{bi(stage.titleKo, stage.titleEn)}</strong><small>{stage.rangeLabel}</small></span>
              </button>
            ))}
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
              <span className="hwow-status-dot" aria-hidden="true" /><span>{statusText}</span>
            </div>
          </div>

          <div className="hwow-controls-column">
            <div className="hwow-control-block">
              <span className="hwow-block-label">{bi("주얼 아틀리에 안료", "Jewel Atelier Pigments")}</span>
              <div className="hwow-pigment-grid" role="group" aria-label={bi("안료 색상 선택", "Choose pigment swatch")}>
                {PIGMENTS.map((pigment) => (
                  <button key={pigment.id} type="button" className="hwow-pigment-btn min-h-11" data-pigment={pigment.id} aria-pressed={activePigment === pigment.id} onClick={() => setActivePigment(pigment.id)}>
                    <span className="hwow-swatch-gem" aria-hidden="true" /><span>{bi(pigment.ko, pigment.en)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="hwow-control-block">
              <span className="hwow-block-label">{bi("원클릭 라이브 체험", "One-Click Live Demos")}</span>
              <div className="hwow-demo-actions">
                <button type="button" className="hwow-demo-btn hwow-demo-btn--spectral min-h-11" data-testid="hwow-spectral-mix-btn" onClick={runSpectralMixDemo}>
                  <span className="hwow-spectral-dots" aria-hidden="true"><i /><i /><i /></span>
                  <span>{bi("파랑+노랑 분광 혼색 시연", "Blue + Yellow Spectral Mix Demo")}</span>
                </button>
                <div className="hwow-demo-secondary-row">
                  <button type="button" className="hwow-demo-btn min-h-11" data-testid="hwow-stamp-btn" onClick={stampFourPanelLayout}>
                    <LayoutGrid size={15} strokeWidth={1.7} aria-hidden="true" /><span>{bi("1클릭 4컷 말풍선 스탬프", "1-Click 4-Panel Speech Stamp")}</span>
                  </button>
                  <button type="button" className="hwow-demo-btn min-h-11" data-testid="hwow-clear-btn" onClick={clearCanvas}>
                    <Eraser size={15} strokeWidth={1.7} aria-hidden="true" /><span>{bi("지우기", "Clear")}</span>
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
                    <button key={preset.id} type="button" className="hwow-lighting-btn min-h-11" data-lighting-option={preset.id} aria-pressed={activeLighting === preset.id} onClick={() => setActiveLighting(preset.id)}>
                      <Icon size={15} strokeWidth={1.7} aria-hidden="true" /><span>{bi(preset.ko, preset.en)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* 첫 방문자 3버튼 맞춤 작업실 필터 */}
        <div className="hwow-tailor-panel" data-testid="hwow-tailor-panel">
          <div className="hwow-tailor-head">
            <div className="hwow-tailor-copy">
              <span className="hwow-block-label hwow-tailor-kicker"><Compass size={14} strokeWidth={1.7} aria-hidden="true" />{bi("첫 방문자 맞춤 작업실 필터", "First-Visit Studio Tailor")}</span>
              <p className="hwow-tailor-tagline" data-testid="hwow-tailor-tagline">{bi(activeTailorSpec.taglineKo, activeTailorSpec.taglineEn)}</p>
            </div>
            <div className="hwow-tailor-modes" role="group" aria-label={bi("작업 방식 맞춤 필터", "Filter studio by workflow")}>
              {STUDIO_TAILOR_MODES.map((mode) => (
                <button key={mode.id} type="button" className="hwow-tailor-btn min-h-11" data-tailor-option={mode.id} aria-pressed={activeTailorMode === mode.id} onClick={() => setActiveTailorMode(mode.id)}>
                  {bi(mode.labelKo, mode.labelEn)}
                </button>
              ))}
            </div>
          </div>
          <div className="hwow-tailor-grid" data-testid="hwow-tailor-grid">
            {activeTailorSpec.tools.map((tool) => (
              <Link key={tool.id} href={tool.href} className="hwow-tailor-card ink-arrow min-h-11" data-tailor-domain={tool.domain} data-testid={`hwow-tailor-card-${tool.id}`}>
                <span className="hwow-tailor-shortcut">{bi(tool.shortcutKo, tool.shortcutEn)}</span>
                <strong className="hwow-tailor-title">{bi(tool.titleKo, tool.titleEn)}</strong>
                <span className="hwow-tailor-detail">{bi(tool.detailKo, tool.detailEn)}</span>
                <span className="hwow-tailor-go" aria-hidden="true"><ArrowRight size={14} strokeWidth={1.8} /></span>
              </Link>
            ))}
          </div>
        </div>

        <div className="hwow-cta-bar">
          <Link href="/studio/new?lane=blank" className="hwow-cta hwow-cta--primary ink-arrow min-h-11"><span>{bi("이 감각 그대로 무료 캔버스 열기", "Open Free Canvas With This Feel")}</span><ArrowRight size={15} strokeWidth={1.8} aria-hidden="true" /></Link>
          <Link href="/compare/studio" className="hwow-cta hwow-cta--secondary ink-arrow min-h-11"><Scale size={15} strokeWidth={1.7} aria-hidden="true" /><span>{bi("글로벌 도구 6종 비교", "Compare 6 Global Studio Tools")}</span></Link>
          <Link href="/tech" className="hwow-cta hwow-cta--secondary ink-arrow min-h-11"><Cpu size={15} strokeWidth={1.7} aria-hidden="true" /><span>{bi("차세대 기술·9-LLM MCP", "Next-Gen Tech & 9-LLM MCP")}</span></Link>
        </div>
      </div>
    </section>
  );
}
