import { Activity, Eraser, Minus, Moon, Play, Plus, Sun } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";

import {
  refineStudioCompetitorFreehandStroke,
  type StudioStrokeRefinementResult,
} from "../brush/studio-competitor-stroke-refinement";
import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import { cn } from "@/shared/lib/utils";

export type StudioLiveFeelPresetId = "razor-gpen" | "soft-bleed-wash" | "cel-hard-shadow" | "romance-glow";

interface LiveFeelPresetSpec {
  readonly id: StudioLiveFeelPresetId;
  readonly ko: string;
  readonly en: string;
  readonly detailKo: string;
  readonly detailEn: string;
  /** Pigment RGB channels (0..255) for Canvas 2D stroke ink rendering (not UI chrome). */
  readonly coreRgb: readonly [number, number, number];
  readonly haloRgb: readonly [number, number, number];
  readonly haloScale: number;
  readonly spacing: number;
  readonly defaultSize: number;
  readonly defaultTaper: number;
  readonly latencyMs: number;
  readonly mode: "razor" | "wash" | "cel" | "glow";
}

function rgbCss(channels: readonly [number, number, number]): string {
  return `rgb(${channels[0]} ${channels[1]} ${channels[2]})`;
}

const STUDIO_LIVE_FEEL_PRESETS: readonly LiveFeelPresetSpec[] = [
  {
    id: "razor-gpen",
    ko: "마스터 면도날 G펜",
    en: "Master Razor G-Pen",
    detailKo: "흑요석 잉크 · 칼끝 출필 테이퍼",
    detailEn: "Obsidian ink · razor needle exit taper",
    coreRgb: [15, 23, 42],
    haloRgb: [51, 65, 85],
    haloScale: 0,
    spacing: 0.06,
    defaultSize: 10,
    defaultTaper: 0.94,
    latencyMs: 2.6,
    mode: "razor",
  },
  {
    id: "soft-bleed-wash",
    ko: "수채 번짐 워시",
    en: "Soft Bleed Wash",
    detailKo: "습식 물번짐 헤일로 + 코어 안료",
    detailEn: "Layered wet halo + pigment core",
    coreRgb: [37, 99, 235],
    haloRgb: [125, 211, 252],
    haloScale: 1.65,
    spacing: 0.11,
    defaultSize: 18,
    defaultTaper: 0.42,
    latencyMs: 3.4,
    mode: "wash",
  },
  {
    id: "cel-hard-shadow",
    ko: "셀 음영 칼단면",
    en: "Cel Hard Shadow",
    detailKo: "번짐 0% 단차 불투명 셀 채색",
    detailEn: "Crisp stepped opacity cel shading",
    coreRgb: [67, 56, 202],
    haloRgb: [99, 102, 241],
    haloScale: 0,
    spacing: 0.07,
    defaultSize: 16,
    defaultTaper: 0.38,
    latencyMs: 2.9,
    mode: "cel",
  },
  {
    id: "romance-glow",
    ko: "로판 안광 글로우",
    en: "Romance Starlight Glow",
    detailKo: "이중 발광 블룸 + 하이라이트 코어",
    detailEn: "Luminous dual-core starlight bloom",
    coreRgb: [254, 240, 138],
    haloRgb: [244, 114, 182],
    haloScale: 1.9,
    spacing: 0.09,
    defaultSize: 14,
    defaultTaper: 0.68,
    latencyMs: 3.1,
    mode: "glow",
  },
] as const;

const PAD_W = 640;
const PAD_H = 176;
const DEMO_PTS: readonly number[] = [
  42, 132, 92, 74, 148, 44, 214, 52, 278, 96, 338, 134, 404, 136, 468, 98, 528, 54, 582, 34, 608, 28,
];
const DEMO_PRS: readonly number[] = [0.24, 0.58, 0.86, 0.94, 0.78, 0.66, 0.84, 0.9, 0.62, 0.28, 0.08];
const TAPER_STEPS = [0.45, 0.75, 0.95] as const;

interface CommittedPadStroke {
  readonly presetId: StudioLiveFeelPresetId;
  readonly rawCount: number;
  readonly refined: StudioStrokeRefinementResult;
}

function getSafe2dContext(canvas: HTMLCanvasElement | null): CanvasRenderingContext2D | null {
  if (!canvas || typeof canvas.getContext !== "function") return null;
  if (
    typeof navigator !== "undefined"
    && /jsdom/iu.test(navigator.userAgent)
    && !("mock" in canvas.getContext)
  ) {
    return null;
  }
  try {
    return canvas.getContext("2d");
  } catch {
    return null;
  }
}

function paintPadCanvas(
  ctx: CanvasRenderingContext2D,
  strokes: readonly CommittedPadStroke[],
  paperTone: "dark" | "light",
): void {
  ctx.clearRect(0, 0, PAD_W, PAD_H);
  for (const stroke of strokes) {
    const spec =
      STUDIO_LIVE_FEEL_PRESETS.find((p) => p.id === stroke.presetId) ?? STUDIO_LIVE_FEEL_PRESETS[0]!;
    if (spec.haloScale > 0) {
      ctx.fillStyle = rgbCss(spec.haloRgb);
      ctx.globalAlpha = spec.mode === "glow" ? 0.24 : 0.16;
      for (const s of stroke.refined.stamps) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, Math.max(0.8, s.radiusPx * spec.haloScale), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle =
      spec.mode === "razor" && paperTone === "dark"
        ? "rgb(226 232 240)"
        : rgbCss(spec.coreRgb);
    for (const s of stroke.refined.stamps) {
      ctx.globalAlpha =
        spec.mode === "cel"
          ? s.pressure >= 0.45
            ? 0.88
            : 0.52
          : spec.mode === "wash"
            ? Math.min(0.72, 0.18 + s.pressure * 0.48)
            : Math.min(1, 0.35 + s.pressure * 0.65);
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(0.25, s.radiusPx), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/** 브러시 랩 실시간 필감·서브픽셀 칼끝 테이퍼 테스트 패드. */
export function StudioBrushLabLiveStrokePad({ lang }: { readonly lang: string }) {
  const isKo = lang.toLowerCase().startsWith("ko");
  const pickLang = (ko: string, en: string) => (isKo ? ko : en);
  const [presetId, setPresetId] = useState<StudioLiveFeelPresetId>("razor-gpen");
  const [brushSize, setBrushSize] = useState<number>(10);
  const [exitTaper, setExitTaper] = useState<number>(0.94);
  const [paperTone, setPaperTone] = useState<"dark" | "light">("dark");
  const preset = useMemo(
    () => STUDIO_LIVE_FEEL_PRESETS.find((item) => item.id === presetId) ?? STUDIO_LIVE_FEEL_PRESETS[0]!,
    [presetId],
  );

  const buildStroke = useCallback(
    (
      pts: readonly number[],
      prs: readonly number[],
      target: LiveFeelPresetSpec,
      sizePx: number,
      taper01: number,
    ): CommittedPadStroke => ({
      presetId: target.id,
      rawCount: Math.floor(pts.length / 2),
      refined: refineStudioCompetitorFreehandStroke({
        points: pts,
        pressures: prs,
        strokeWidthPx: sizePx,
        baseSpacingRatio: target.spacing,
        subdivisionsPerSegment: 8,
        exitTaperStrength01: taper01,
      }),
    }),
    [],
  );

  const [strokes, setStrokes] = useState<readonly CommittedPadStroke[]>(() => [
    buildStroke(DEMO_PTS, DEMO_PRS, STUDIO_LIVE_FEEL_PRESETS[0]!, 10, 0.94),
  ]);
  const [liveDraft, setLiveDraft] = useState<CommittedPadStroke | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activePtrRef = useRef<{ id: number; pts: number[]; prs: number[]; tMs: number } | null>(null);

  const allStrokes = useMemo(
    () => (liveDraft ? [...strokes, liveDraft] : strokes),
    [strokes, liveDraft],
  );
  const latest = allStrokes[allStrokes.length - 1] ?? null;

  useEffect(() => {
    const ctx = getSafe2dContext(canvasRef.current);
    if (ctx) paintPadCanvas(ctx, allStrokes, paperTone);
  }, [allStrokes, paperTone]);

  const toPadCoords = (e: PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) {
      return {
        x: Math.max(0, Math.min(PAD_W, e.clientX)),
        y: Math.max(0, Math.min(PAD_H, e.clientY)),
      };
    }
    return {
      x: ((e.clientX - r.left) / r.width) * PAD_W,
      y: ((e.clientY - r.top) / r.height) * PAD_H,
    };
  };

  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* jsdom fallback */
    }
    const pt = toPadCoords(e);
    const p = e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.42;
    const pts = [pt.x, pt.y];
    const prs = [p];
    activePtrRef.current = { id: e.pointerId, pts, prs, tMs: e.timeStamp || 0 };
    setLiveDraft(buildStroke(pts, prs, preset, brushSize, exitTaper));
  };

  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const cur = activePtrRef.current;
    if (!cur || cur.id !== e.pointerId) return;
    const pt = toPadCoords(e);
    const dist = Math.hypot(
      pt.x - (cur.pts[cur.pts.length - 2] ?? pt.x),
      pt.y - (cur.pts[cur.pts.length - 1] ?? pt.y),
    );
    if (dist < 0.75) return;
    const dt = Math.max(4, (e.timeStamp || cur.tMs + 8) - cur.tMs);
    const p =
      e.pointerType === "pen" && e.pressure > 0
        ? e.pressure
        : Math.max(0.16, Math.min(0.94, 0.86 - (dist / dt) * 0.22));
    cur.pts.push(pt.x, pt.y);
    cur.prs.push(p);
    cur.tMs = e.timeStamp || cur.tMs + dt;
    setLiveDraft(buildStroke(cur.pts, cur.prs, preset, brushSize, exitTaper));
  };

  const finishStroke = (e: PointerEvent<HTMLCanvasElement>) => {
    const cur = activePtrRef.current;
    if (!cur || cur.id !== e.pointerId) return;
    activePtrRef.current = null;
    const committed = buildStroke(cur.pts, cur.prs, preset, brushSize, exitTaper);
    setLiveDraft(null);
    setStrokes((prev) => [...prev.slice(-5), committed]);
  };

  const metrics = latest?.refined;
  const rawCount = latest?.rawCount ?? 0;

  return (
    <section
      data-testid="brush-lab-live-stroke-pad"
      aria-label={pickLang("실시간 필감 및 서브픽셀 칼끝 스트로크 테스트 패드", "Live Pen-Feel & Subpixel Stroke Test Pad")}
      className="mb-5 rounded-2xl border border-line-strong/70 bg-card p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 text-xs font-bold text-accent">
            <Activity size={14} aria-hidden />
            {pickLang("실시간 필압·속도·서브픽셀 테이퍼 시험대", "Real-Time Stylus & Subpixel Taper Pad")}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-fg-2">
            {pickLang(
              "펜·마우스·터치로 직접 긋거나 시연 획을 재생해 구심 Catmull 곡률 보간과 출필 칼끝 테이퍼를 바로 확인합니다.",
              "Draw directly with stylus, mouse, or touch—or replay a calligraphic stroke—to inspect adaptive Catmull stamping and subpixel exit taper.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="brush-lab-live-pad-paper-toggle"
            aria-pressed={paperTone === "light"}
            aria-label={pickLang("테스트 패드 종이 배경 전환", "Toggle test pad paper tone")}
            onClick={() => setPaperTone((prev) => (prev === "dark" ? "light" : "dark"))}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-panel px-3 py-2 text-xs font-semibold text-fg-2 transition-colors hover:border-line-strong hover:bg-raised",
              STUDIO_FOCUS_RING,
            )}
          >
            {paperTone === "light" ? <Sun size={13} aria-hidden /> : <Moon size={13} aria-hidden />}
            {paperTone === "light"
              ? pickLang("밝은 종이", "Light Paper")
              : pickLang("어두운 종이", "Dark Paper")}
          </button>
          <button
            type="button"
            data-testid="brush-lab-live-pad-replay-btn"
            onClick={() => {
              setLiveDraft(null);
              setStrokes((prev) => [
                ...prev.slice(-3),
                buildStroke(DEMO_PTS, DEMO_PRS, preset, brushSize, exitTaper),
              ]);
            }}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-accent bg-accent-soft px-3.5 py-2 text-xs font-bold text-accent transition-colors hover:bg-accent/20",
              STUDIO_FOCUS_RING,
            )}
          >
            <Play size={13} aria-hidden />
            {pickLang("시연 획 재생", "Replay Master Stroke")}
          </button>
          <button
            type="button"
            data-testid="brush-lab-live-pad-clear-btn"
            onClick={() => {
              activePtrRef.current = null;
              setLiveDraft(null);
              setStrokes([]);
            }}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-panel px-3.5 py-2 text-xs font-semibold text-fg-2 transition-colors hover:border-line-strong hover:bg-raised",
              STUDIO_FOCUS_RING,
            )}
          >
            <Eraser size={13} aria-hidden />
            {pickLang("캔버스 지우기", "Clear Pad")}
          </button>
        </div>
      </div>

      <div
        role="toolbar"
        aria-label={pickLang("라이브 필감 프리셋 선택", "Select Live Brush Feel Preset")}
        className="mt-3 flex flex-wrap items-center gap-2"
      >
        {STUDIO_LIVE_FEEL_PRESETS.map((item) => {
          const active = item.id === preset.id;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`brush-lab-live-preset-${item.id}`}
              aria-pressed={active}
              onClick={() => {
                setPresetId(item.id);
                setBrushSize(item.defaultSize);
                setExitTaper(item.defaultTaper);
                setStrokes([buildStroke(DEMO_PTS, DEMO_PRS, item, item.defaultSize, item.defaultTaper)]);
              }}
              className={cn(
                "inline-flex min-h-11 flex-col items-start justify-center rounded-xl border px-3 py-1.5 text-left transition-colors",
                active
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-panel text-fg-2 hover:border-line-strong hover:bg-raised",
                STUDIO_FOCUS_RING,
              )}
            >
              <span className="text-xs font-bold">{pickLang(item.ko, item.en)}</span>
              <span className="text-xs text-fg-3">{pickLang(item.detailKo, item.detailEn)}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label={pickLang("테스트 브러시 크기 조절", "Test Brush Size Control")}
          className="inline-flex items-center gap-1 rounded-xl border border-line bg-panel p-1"
        >
          <button
            type="button"
            onClick={() => setBrushSize((v) => Math.max(2, v - 2))}
            aria-label={pickLang("테스트 브러시 크기 줄이기", "Decrease test brush size")}
            className={cn(
              "grid size-11 min-h-11 min-w-11 place-items-center rounded-lg text-fg-2 transition-colors hover:bg-raised",
              STUDIO_FOCUS_RING,
            )}
          >
            <Minus size={14} aria-hidden />
          </button>
          <span className="min-w-14 px-2 text-center font-mono text-xs font-bold tabular-nums text-fg">
            {brushSize}px
          </span>
          <button
            type="button"
            onClick={() => setBrushSize((v) => Math.min(48, v + 2))}
            aria-label={pickLang("테스트 브러시 크기 키우기", "Increase test brush size")}
            className={cn(
              "grid size-11 min-h-11 min-w-11 place-items-center rounded-lg text-fg-2 transition-colors hover:bg-raised",
              STUDIO_FOCUS_RING,
            )}
          >
            <Plus size={14} aria-hidden />
          </button>
        </div>

        <div
          role="group"
          aria-label={pickLang("출필 칼끝 테이퍼 강도", "Exit Taper Sharpness")}
          className="flex flex-wrap items-center gap-1.5"
        >
          <span className="text-xs font-semibold text-fg-2">{pickLang("칼끝 테이퍼:", "Exit Taper:")}</span>
          {TAPER_STEPS.map((val) => {
            const active = Math.abs(exitTaper - val) < 0.06;
            return (
              <button
                key={val}
                type="button"
                aria-pressed={active}
                onClick={() => setExitTaper(val)}
                className={cn(
                  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border px-3 py-2 font-mono text-xs font-semibold tabular-nums transition-colors",
                  active
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-panel text-fg-2 hover:bg-raised",
                  STUDIO_FOCUS_RING,
                )}
              >
                {Math.round(val * 100)}%
              </button>
            );
          })}
        </div>
      </div>

      <div
        data-appearance-preview={paperTone}
        data-paper-tone={paperTone}
        className="relative mt-3 overflow-hidden rounded-2xl border border-line bg-canvas"
      >
        <svg
          viewBox={`0 0 ${PAD_W} ${PAD_H}`}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          {allStrokes.map((stroke, sIdx) => {
            const spec =
              STUDIO_LIVE_FEEL_PRESETS.find((item) => item.id === stroke.presetId)
              ?? STUDIO_LIVE_FEEL_PRESETS[0]!;
            const fill = spec.mode === "razor" ? "var(--color-fg)" : rgbCss(spec.coreRgb);
            return (
              <g key={sIdx}>
                {stroke.refined.stamps.map((stamp, idx) => (
                  <circle
                    key={idx}
                    cx={stamp.x}
                    cy={stamp.y}
                    r={Math.max(0.3, stamp.radiusPx)}
                    fill={fill}
                    fillOpacity={Math.min(0.95, 0.32 + stamp.pressure * 0.62)}
                  />
                ))}
              </g>
            );
          })}
        </svg>
        <canvas
          ref={canvasRef}
          width={PAD_W}
          height={PAD_H}
          data-testid="brush-lab-live-pad-canvas"
          aria-label={pickLang("브러시 필감 테스트 드로잉 캔버스", "Brush pen-feel live test drawing canvas")}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          className="relative z-10 block h-44 w-full cursor-crosshair touch-none"
        />
      </div>

      <div
        data-testid="brush-lab-live-pad-telemetry"
        aria-live="polite"
        className="mt-3 flex flex-wrap items-center gap-2 font-mono text-xs tabular-nums text-fg-2"
      >
        <span className="rounded-lg border border-line bg-panel px-2.5 py-1">
          {pickLang(
            `원시 샘플 ${rawCount} → 정제 스탬프 ${metrics?.stamps.length ?? 0}`,
            `Raw ${rawCount} -> Stamps ${metrics?.stamps.length ?? 0}`,
          )}
        </span>
        <span className="rounded-lg border border-line bg-panel px-2.5 py-1">
          {pickLang(
            `꺾임 감소 -${((metrics?.kinkReductionRatio01 ?? 0) * 100).toFixed(1)}%`,
            `Kink -${((metrics?.kinkReductionRatio01 ?? 0) * 100).toFixed(1)}%`,
          )}
        </span>
        <span className="rounded-lg border border-line bg-panel px-2.5 py-1">
          {pickLang(
            `콩알자국 억제 -${((metrics?.scallopReductionGain01 ?? 0) * 100).toFixed(1)}%`,
            `Scallop -${((metrics?.scallopReductionGain01 ?? 0) * 100).toFixed(1)}%`,
          )}
        </span>
        <span className="rounded-lg border border-line bg-panel px-2.5 py-1">
          {pickLang(
            `끝단 반경 ${(metrics?.terminalTaperRadiusPx ?? 0).toFixed(2)}px`,
            `Tip ${(metrics?.terminalTaperRadiusPx ?? 0).toFixed(2)}px`,
          )}
        </span>
        <span className="rounded-lg border border-line bg-panel px-2.5 py-1">
          {pickLang(`보정 지연 ${preset.latencyMs.toFixed(1)}ms`, `Latency ${preset.latencyMs.toFixed(1)}ms`)}
        </span>
      </div>
    </section>
  );
}
