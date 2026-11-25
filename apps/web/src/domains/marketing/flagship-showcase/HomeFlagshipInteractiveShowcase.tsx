import {
  ArrowRight,
  Brush,
  Eraser,
  PenTool,
  SlidersHorizontal,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";

import { useI18n } from "@/shared/lib/i18n";
import Link from "@/shared/navigation/router-link";

import {
  createWatercolorGrid,
  MINI_CANVAS_HEIGHT,
  MINI_CANVAS_WIDTH,
  paintKubelkaMunkDemo,
  paintMiniBrushSegment,
  resolveMiniCanvasPoint,
  type CanvasPoint,
} from "./flagship-brush-engine";
import { FlagshipComparisonVisual } from "./flagship-comparison-visual";
import {
  COMPARISON_MODES,
  FLAGSHIP_BRUSHES,
  FLAGSHIP_ENGINES,
  type BilingualText,
  type ComparisonModeId,
  type FlagshipBrushId,
  type WatercolorPigmentId,
} from "./flagship-showcase-data";
import { FlagshipWorkflowLauncherPanel } from "./FlagshipWorkflowLauncherPanel";
import { HomeLiveTechProofStrip } from "./HomeLiveTechProofStrip";
import { StudioFeatureAtlasMenu } from "./StudioFeatureAtlasMenu";
import "./flagship-showcase.css";

type WindowWithWebkitAudio = Window & { readonly webkitAudioContext?: typeof AudioContext };

function pick(value: BilingualText, lang: "ko" | "en"): string {
  return lang === "en" ? value.en : value.ko;
}

function capturePointerSafely(el: HTMLElement, pointerId: number): void {
  if (typeof el.setPointerCapture !== "function") return;
  try {
    el.setPointerCapture(pointerId);
  } catch {
    return;
  }
}

/**
 * 홈(`/`) 플래그십 핵심 기능 쇼케이스 및 3초 인터랙티브 체험.
 *
 * ① 3초 미니 물리 브러시 5종 체험 캔버스 + 쿠벨카-문크 광학 혼색 시연
 * ② 3모드 Before / After 인터랙티브 비교 슬라이더
 * ③ ToonStudio 6대 플래그십 엔진 함축 카드 그리드
 * ④ 직군별 1-클릭 런처 + 7단계 제작 타임머신 + BYOT 1분 조합 진단 위젯
 */
export function HomeFlagshipInteractiveShowcase() {
  const storeLang = useI18n((state) => state.lang);
  const lang: "ko" | "en" = storeLang.toLowerCase().startsWith("en") ? "en" : "ko";

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<CanvasPoint | null>(null);
  const watercolorGridRef = useRef<Uint8Array>(createWatercolorGrid());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastAudioMsRef = useRef(0);

  const [activeBrush, setActiveBrush] = useState<FlagshipBrushId>("pencil6b");
  const [watercolorPigment, setWatercolorPigment] = useState<WatercolorPigmentId>("cobalt");
  const [strokeCount, setStrokeCount] = useState(0);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [opticalMixed, setOpticalMixed] = useState(false);
  const [nibSoundOn, setNibSoundOn] = useState(false);

  const compareStageRef = useRef<HTMLDivElement>(null);
  const draggingCompareRef = useRef(false);
  const [compareMode, setCompareMode] = useState<ComparisonModeId>("brush");
  const [splitPercent, setSplitPercent] = useState(52);

  useEffect(() => () => {
    const audio = audioCtxRef.current;
    audioCtxRef.current = null;
    if (audio && audio.state !== "closed") void audio.close().catch(() => false);
  }, []);

  const playTactileCue = useCallback(() => {
    if (!nibSoundOn || typeof window === "undefined") return;
    const nowMs = Date.now();
    if (nowMs - lastAudioMsRef.current < 80) return;
    lastAudioMsRef.current = nowMs;
    const AudioCtor = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!AudioCtor) return;
    try {
      const ctx = audioCtxRef.current ?? new AudioCtor();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") void ctx.resume().catch(() => false);
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(activeBrush === "gpen" ? 840 : 620, now);
      osc.frequency.exponentialRampToValueAtTime(290, now + 0.04);
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(1650, now);
      gain.gain.setValueAtTime(0.025, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.onended = () => {
        osc.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
      osc.start(now);
      osc.stop(now + 0.055);
    } catch {
      return;
    }
  }, [nibSoundOn, activeBrush]);

  const activeBrushSpec = useMemo(
    () => FLAGSHIP_BRUSHES.find((item) => item.id === activeBrush) ?? FLAGSHIP_BRUSHES[0],
    [activeBrush],
  );
  const activeCompareSpec = useMemo(
    () => COMPARISON_MODES.find((item) => item.id === compareMode) ?? COMPARISON_MODES[0],
    [compareMode],
  );

  const handleCanvasDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current = true;
    const pt = resolveMiniCanvasPoint(canvas, event.clientX, event.clientY);
    lastPointRef.current = pt;
    capturePointerSafely(event.currentTarget, event.pointerId);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const { opticalMixTriggered } = paintMiniBrushSegment(
        ctx,
        pt,
        { x: pt.x + 1, y: pt.y + 0.8 },
        { brush: activeBrush, pigment: watercolorPigment, pressure: event.pressure, watercolorGrid: watercolorGridRef.current },
      );
      if (opticalMixTriggered) setOpticalMixed(true);
    }
    setHasDrawn(true);
    setStrokeCount((count) => count + 1);
    playTactileCue();
  };

  const handleCanvasMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !canvasRef.current || !lastPointRef.current) return;
    const next = resolveMiniCanvasPoint(canvasRef.current, event.clientX, event.clientY);
    const ctx = canvasRef.current.getContext("2d");
    if (ctx) {
      const { opticalMixTriggered } = paintMiniBrushSegment(
        ctx,
        lastPointRef.current,
        next,
        { brush: activeBrush, pigment: watercolorPigment, pressure: event.pressure, watercolorGrid: watercolorGridRef.current },
      );
      if (opticalMixTriggered) setOpticalMixed(true);
    }
    lastPointRef.current = next;
    playTactileCue();
  };

  const endCanvasDraw = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const runOpticalMixDemo = () => {
    setActiveBrush("watercolor");
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) paintKubelkaMunkDemo(ctx, watercolorGridRef.current);
    setHasDrawn(true);
    setOpticalMixed(true);
    setStrokeCount((count) => count + 1);
    playTactileCue();
  };

  const clearMiniCanvas = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, MINI_CANVAS_WIDTH, MINI_CANVAS_HEIGHT);
    watercolorGridRef.current = createWatercolorGrid();
    setHasDrawn(false);
    setOpticalMixed(false);
    setStrokeCount(0);
  };

  const updateCompareFromPointer = (clientX: number) => {
    const stage = compareStageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = Math.round(((clientX - rect.left) / rect.width) * 100);
    setSplitPercent(Math.max(5, Math.min(95, pct)));
  };

  const splitStyle = { "--fsh-split": `${splitPercent}%` } as CSSProperties;

  return (
    <section
      className="fsh-root [word-break:keep-all]"
      data-testid="flagship-interactive-showcase"
      aria-labelledby="fsh-main-title"
    >
      <div className="fsh-shell">
        <header className="fsh-header">
          <div className="fsh-header-copy">
            <span className="fsh-eyebrow">
              <Brush size={13} strokeWidth={1.8} aria-hidden="true" />
              {lang === "en" ? "TOONSTUDIO ATELIER HANDS-ON" : "아틀리에 핵심 도구 체험"}
            </span>
            <h2 id="fsh-main-title">
              {lang === "en"
                ? "Try the studio tools before you open a project."
                : "프로젝트를 열기 전에 손끝으로 먼저 그려 보세요"}
            </h2>
            <p>
              {lang === "en"
                ? "Sketch with 5 physical brushes, slide real Before/After comparisons, inspect 6 core engines, and tailor your 7-stage stack right here."
                : "물리 브러시 5종 필기감부터 전후 비교, 6가지 작업 엔진, 내 작업 방식에 맞는 도구 조합까지 여기서 바로 시험해 보세요."}
            </p>
          </div>
          <StudioFeatureAtlasMenu variant="compact" />
        </header>

        {/* ⓪ 최첨단 5대 실측 엔진 증명 스트립 + 인브라우저 벤치마크 + 실물 브러시 갤러리 */}
        <HomeLiveTechProofStrip lang={lang} />

        {/* ① 3초 미니 물리 브러시 체험 캔버스 */}
        <article className="fsh-block" aria-labelledby="fsh-brush-title">
          <div className="fsh-block-head">
            <div className="fsh-block-title">
              <h3 id="fsh-brush-title">
                {lang === "en"
                  ? "3-Second Physical Brush Test — Feel Before Opening"
                  : "미니 캔버스에서 바로 그어 보는 물리 브러시 5종"}
              </h3>
              <p>{pick(activeBrushSpec.feelNote, lang)}</p>
            </div>
            <button
              type="button"
              className="fsh-btn"
              data-testid="flagship-sound-toggle"
              aria-pressed={nibSoundOn}
              onClick={() => setNibSoundOn((prev) => !prev)}
            >
              {nibSoundOn ? <Volume2 size={15} aria-hidden="true" /> : <VolumeX size={15} aria-hidden="true" />}
              <span>
                {nibSoundOn
                  ? (lang === "en" ? "Nib sound on" : "슥삭 필기음 켜짐")
                  : (lang === "en" ? "Nib sound off" : "슥삭 필기음 꺼짐")}
              </span>
            </button>
          </div>

          <div className="fsh-brush-layout">
            <div>
              <div className="fsh-canvas-card">
                <div className="fsh-canvas-meta">
                  <strong>{pick(activeBrushSpec.name, lang)}</strong>
                  <span className="fsh-tabular" data-testid="flagship-stroke-count">
                    {lang === "en" ? `${strokeCount} strokes` : `획 ${strokeCount}회`}
                  </span>
                </div>
                <div className="fsh-canvas-stage">
                  <canvas
                    ref={canvasRef}
                    width={MINI_CANVAS_WIDTH}
                    height={MINI_CANVAS_HEIGHT}
                    data-testid="flagship-brush-canvas"
                    className="fsh-canvas"
                    aria-label={lang === "en" ? "3-second physical brush test canvas" : "3초 물리 브러시 체험 캔버스"}
                    onPointerDown={handleCanvasDown}
                    onPointerMove={handleCanvasMove}
                    onPointerUp={endCanvasDraw}
                    onPointerCancel={endCanvasDraw}
                    onPointerLeave={endCanvasDraw}
                  />
                  <span className="fsh-canvas-hint" data-hidden={hasDrawn ? "true" : "false"} aria-hidden="true">
                    <PenTool size={13} aria-hidden="true" />
                    {lang === "en" ? "Drag with mouse or stylus" : "마우스·펜으로 바로 그어 보세요"}
                  </span>
                </div>
              </div>
              <div className="fsh-status-line" data-mixed={opticalMixed ? "true" : "false"} role="status" aria-live="polite">
                <span className="fsh-status-dot" aria-hidden="true" />
                <span>
                  {opticalMixed
                    ? (lang === "en"
                      ? "Kubelka-Munk optical mix active: Blue + Yellow blended into clean emerald green."
                      : "쿠벨카-문크 광학 혼색 확인: 파랑 + 노랑이 탁한 회색 없이 맑은 초록으로 섞였습니다.")
                    : pick(activeBrushSpec.feelNote, lang)}
                </span>
              </div>
            </div>

            <div className="fsh-brush-controls">
              <div
                className="fsh-brush-list"
                role="group"
                aria-label={lang === "en" ? "Select physical brush preset" : "물리 브러시 5종 선택"}
              >
                {FLAGSHIP_BRUSHES.map((brush) => (
                  <button
                    key={brush.id}
                    type="button"
                    data-testid={`flagship-brush-${brush.id}`}
                    className="fsh-brush-btn"
                    aria-pressed={activeBrush === brush.id}
                    onClick={() => setActiveBrush(brush.id)}
                  >
                    <span>{pick(brush.name, lang)}</span>
                    <span className="fsh-brush-badge">{pick(brush.badge, lang)}</span>
                  </button>
                ))}
              </div>

              {activeBrush === "watercolor" ? (
                <div className="fsh-watercolor-bar" role="group" aria-label={lang === "en" ? "Watercolor optical pigment" : "수채 광학 안료 선택"}>
                  <button
                    type="button"
                    className="fsh-pigment-chip"
                    aria-pressed={watercolorPigment === "cobalt"}
                    onClick={() => setWatercolorPigment("cobalt")}
                  >
                    <span className="fsh-swatch fsh-swatch--cobalt" aria-hidden="true" />
                    <span>{lang === "en" ? "Cobalt Blue" : "코발트 파랑"}</span>
                  </button>
                  <button
                    type="button"
                    className="fsh-pigment-chip"
                    aria-pressed={watercolorPigment === "saffron"}
                    onClick={() => setWatercolorPigment("saffron")}
                  >
                    <span className="fsh-swatch fsh-swatch--saffron" aria-hidden="true" />
                    <span>{lang === "en" ? "Saffron Yellow" : "사프란 노랑"}</span>
                  </button>
                </div>
              ) : null}

              <div className="fsh-action-row">
                <button
                  type="button"
                  data-testid="flagship-km-demo-btn"
                  className="fsh-btn fsh-btn--emerald"
                  onClick={runOpticalMixDemo}
                >
                  <span>{lang === "en" ? "Demo Blue + Yellow = Green" : "파랑+노랑=초록 광학 시연"}</span>
                </button>
                <button
                  type="button"
                  data-testid="flagship-clear-btn"
                  className="fsh-btn"
                  onClick={clearMiniCanvas}
                >
                  <Eraser size={14} aria-hidden="true" />
                  <span>{lang === "en" ? "Clear" : "지우기"}</span>
                </button>
                <Link href="/studio/canvas" className="fsh-btn fsh-btn--primary" data-testid="flagship-continue-canvas">
                  <span>{lang === "en" ? "Continue in Full Canvas" : "전체 캔버스에서 이어 그리기"}</span>
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </article>

        {/* ② 인터랙티브 Before / After 비교 슬라이더 (3모드) */}
        <article className="fsh-block" aria-labelledby="fsh-compare-title">
          <div className="fsh-block-head">
            <div className="fsh-block-title">
              <h3 id="fsh-compare-title">
                {lang === "en" ? "Interactive Before / After Comparison" : "슬라이더를 끌어 바로 비교하는 전후 결과"}
              </h3>
              <p>{pick(activeCompareSpec.takeaway, lang)}</p>
            </div>
            <div
              className="fsh-pill-group"
              role="group"
              aria-label={lang === "en" ? "Comparison mode selector" : "전후 비교 모드 선택"}
            >
              {COMPARISON_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  data-testid={`flagship-compare-mode-${mode.id}`}
                  className="fsh-pill"
                  aria-pressed={compareMode === mode.id}
                  onClick={() => setCompareMode(mode.id)}
                >
                  {pick(mode.label, lang)}
                </button>
              ))}
            </div>
          </div>

          <div
            ref={compareStageRef}
            className="fsh-compare-stage"
            data-testid="flagship-compare-stage"
            data-compare-mode={compareMode}
            style={splitStyle}
            onPointerDown={(event) => {
              draggingCompareRef.current = true;
              capturePointerSafely(event.currentTarget, event.pointerId);
              updateCompareFromPointer(event.clientX);
            }}
            onPointerMove={(event) => {
              if (!draggingCompareRef.current) return;
              updateCompareFromPointer(event.clientX);
            }}
            onPointerUp={() => { draggingCompareRef.current = false; }}
            onPointerCancel={() => { draggingCompareRef.current = false; }}
          >
            <div className="fsh-compare-layer">
              <FlagshipComparisonVisual mode={compareMode} variant="before" />
            </div>
            <div className="fsh-compare-layer fsh-compare-layer--after">
              <FlagshipComparisonVisual mode={compareMode} variant="after" />
            </div>
            <span className="fsh-compare-tag fsh-compare-tag--before">
              {pick(activeCompareSpec.beforeLabel, lang)}
            </span>
            <span className="fsh-compare-tag fsh-compare-tag--after">
              {pick(activeCompareSpec.afterLabel, lang)}
            </span>
            <div className="fsh-compare-divider" aria-hidden="true">
              <span className="fsh-compare-handle">
                <SlidersHorizontal size={14} />
              </span>
            </div>
          </div>

          <div className="fsh-slider-row">
            <label htmlFor="fsh-compare-range">
              {lang === "en" ? "Split position" : "비교 분할 위치"}
            </label>
            <input
              id="fsh-compare-range"
              type="range"
              min={5}
              max={95}
              value={splitPercent}
              data-testid="flagship-compare-slider"
              className="fsh-range"
              aria-label={lang === "en" ? "Before and after comparison split percentage" : "전후 비교 분할 비율 조절"}
              onChange={(event) => setSplitPercent(Number(event.target.value))}
            />
            <span className="fsh-tabular font-semibold" data-testid="flagship-compare-value">
              {splitPercent}%
            </span>
          </div>

          <div className="fsh-compare-captions">
            <div className="fsh-compare-caption">
              <strong>{lang === "en" ? "Before" : "비교 전"} · {pick(activeCompareSpec.beforeLabel, lang)}</strong>
              <span>{pick(activeCompareSpec.beforeDetail, lang)}</span>
            </div>
            <div className="fsh-compare-caption">
              <strong>{lang === "en" ? "After" : "ToonStudio 적용"} · {pick(activeCompareSpec.afterLabel, lang)}</strong>
              <span>{pick(activeCompareSpec.afterDetail, lang)}</span>
            </div>
          </div>
        </article>

        {/* ③ ToonStudio 6대 플래그십 엔진 함축 카드 그리드 */}
        <article className="fsh-block" aria-labelledby="fsh-engines-title">
          <div className="fsh-block-head">
            <div className="fsh-block-title">
              <h3 id="fsh-engines-title">
                {lang === "en" ? "6 Core Engines at a Glance" : "한 작업실에 담긴 6가지 핵심 제작 엔진"}
              </h3>
              <p>
                {lang === "en"
                  ? "Every engine runs together in one workspace — jump straight into any subsystem."
                  : "브러시, 3D 선화, 자동 검수, 외부 툴 연동, 무빙툰까지 원하는 도구를 바로 열어 확인하세요."}
              </p>
            </div>
          </div>
          <ul className="fsh-engines-grid" data-testid="flagship-engines-grid">
            {FLAGSHIP_ENGINES.map((engine) => (
              <li key={engine.id} className="fsh-engine-card">
                <div className="fsh-engine-top">
                  <span className="fsh-engine-num fsh-tabular">{engine.number}</span>
                  <span className="fsh-engine-spec">{pick(engine.specTag, lang)}</span>
                </div>
                <h4>{pick(engine.title, lang)}</h4>
                <p>{pick(engine.summary, lang)}</p>
                <Link href={engine.href} className="fsh-engine-link">
                  <span>{pick(engine.cta, lang)}</span>
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </article>

        {/* ④ 직군별 1-클릭 워크스페이스 런처 + 7단계 제작 타임머신 + BYOT 1분 조합 진단 */}
        <FlagshipWorkflowLauncherPanel lang={lang} />
      </div>
    </section>
  );
}
