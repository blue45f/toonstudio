/**
 * 실시간 필기감 이펙트(Tactile Drawing Feel VFX) 전용 경량 Canvas 2D 오버레이 및 외부 이벤트 브리지.
 *
 * - `pointer-events: none`, `aria-hidden="true"`, `data-studio-nib-vfx-overlay="true"`, 비출력(Non-Export) 보장.
 * - 활성 입자가 0개일 때 `requestAnimationFrame` 루프를 즉시 정지(Idle 0% CPU)하고,
 *   새 포인터 입력이 도착할 때만 재기동한다.
 * - 원시 hex/rgb/hsl 색상 리터럴과 브라우저 영속 저장소를 사용하지 않으며,
 *   Calm Atelier CSS 커스텀 프로퍼티 토큰과 활성 브러시 색만 사용한다.
 */

import { memo, useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";

import {
  NIB_VFX_COLOR_SLOT_ACCENT,
  NIB_VFX_COLOR_SLOT_COOL,
  NIB_VFX_COLOR_SLOT_HIGHLIGHT,
  NIB_VFX_COLOR_SLOT_STROKE,
  NIB_VFX_KIND_CODE,
  NON_EXPORT_OVERLAY_POLICY,
  NibTactileVfxEngine,
  resolveEffectiveNibVfxMode,
  type NibTactileVfxMode,
  type NibVfxPointerSample,
} from "./nib-tactile-vfx-engine";

const TAU = Math.PI * 2;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

interface ResolvedOverlayPalette {
  ink: string;
  accent: string;
  highlight: string;
  cool: string;
  eraser: string;
}

const DEFAULT_OVERLAY_PALETTE: Readonly<ResolvedOverlayPalette> = Object.freeze({
  ink: "CanvasText", accent: "Highlight", highlight: "Canvas", cool: "Highlight", eraser: "GrayText",
});

// 메모리 전용 외부 이벤트·모드 구독 브리지 (브라우저 영속 저장소 미사용)
type NibVfxModeListener = (mode: NibTactileVfxMode) => void;
type NibVfxSampleListener = (sample: NibVfxPointerSample) => void;

let currentBridgeMode: NibTactileVfxMode = "subtle";
const modeListeners = new Set<NibVfxModeListener>();
const sampleListeners = new Set<NibVfxSampleListener>();

// eslint-disable-next-line react-refresh/only-export-components -- 외부 드로잉 루프·툴바와 오버레이를 잇는 공개 브리지 계약
export function getStudioNibVfxMode(): NibTactileVfxMode { return currentBridgeMode; }

// eslint-disable-next-line react-refresh/only-export-components -- 외부 드로잉 루프·툴바와 오버레이를 잇는 공개 브리지 계약
export function setStudioNibVfxMode(mode: NibTactileVfxMode): void {
  if (currentBridgeMode === mode) return;
  currentBridgeMode = mode;
  for (const listener of modeListeners) listener(mode);
}

// eslint-disable-next-line react-refresh/only-export-components -- 외부 드로잉 루프·툴바와 오버레이를 잇는 공개 브리지 계약
export function subscribeStudioNibVfxMode(listener: NibVfxModeListener): () => void {
  modeListeners.add(listener);
  return () => { modeListeners.delete(listener); };
}

// eslint-disable-next-line react-refresh/only-export-components -- 외부 드로잉 루프에서 오버레이로 포인터 샘플을 전달하는 공개 브리지
export function emitStudioNibVfxSample(sample: NibVfxPointerSample): void {
  for (const listener of sampleListeners) listener(sample);
}

// eslint-disable-next-line react-refresh/only-export-components -- 테스트·세션 초기화용 메모리 브리지 리셋 계약
export function resetStudioNibVfxBridge(initialMode: NibTactileVfxMode = "subtle"): void {
  currentBridgeMode = initialMode;
  modeListeners.clear();
  sampleListeners.clear();
}

function readReducedMotionMatch(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try { return window.matchMedia(REDUCED_MOTION_QUERY).matches; } catch { return false; }
}

function resolvePaletteFromElement(el: HTMLElement | null, target: ResolvedOverlayPalette): void {
  target.ink = DEFAULT_OVERLAY_PALETTE.ink;
  target.accent = DEFAULT_OVERLAY_PALETTE.accent;
  target.highlight = DEFAULT_OVERLAY_PALETTE.highlight;
  target.cool = DEFAULT_OVERLAY_PALETTE.cool;
  target.eraser = DEFAULT_OVERLAY_PALETTE.eraser;
  if (!el || typeof window === "undefined" || typeof window.getComputedStyle !== "function") return;
  const styles = window.getComputedStyle(el);
  const readToken = (name: string, fallback: string): string => styles.getPropertyValue(name).trim() || fallback;
  target.ink = readToken("--color-fg", target.ink);
  target.accent = readToken("--color-accent", target.accent);
  target.highlight = readToken("--color-canvas", readToken("--color-on-accent", target.highlight));
  target.cool = readToken("--color-cool", target.accent);
  target.eraser = readToken("--color-fg-3", target.eraser);
}

function resolveSlotColor(
  engine: NibTactileVfxEngine,
  palette: Readonly<ResolvedOverlayPalette>,
  slot: number,
  strokeIdx: number,
): string {
  if (slot === NIB_VFX_COLOR_SLOT_STROKE) return engine.getStrokePaletteEntry(strokeIdx);
  if (slot === NIB_VFX_COLOR_SLOT_ACCENT) return palette.accent;
  if (slot === NIB_VFX_COLOR_SLOT_HIGHLIGHT) return palette.highlight;
  if (slot === NIB_VFX_COLOR_SLOT_COOL) return palette.cool;
  return palette.eraser;
}

function drawNibTactileVfxFrame(
  ctx: CanvasRenderingContext2D,
  engine: NibTactileVfxEngine,
  palette: Readonly<ResolvedOverlayPalette>,
  showNibCursor: boolean,
): void {
  const b = engine.buffers;
  if (engine.activeCount > 0) {
    for (let i = 0; i < engine.capacity; i += 1) {
      if (b.active[i] === 0) continue;
      const life = b.lifeMs[i] > 0 ? b.lifeMs[i] : 1;
      const progress = b.ageMs[i] / life;
      if (progress >= 1) continue;
      const alpha = b.alpha[i] * (1 - progress) * (1 - progress);
      if (alpha <= 0.01) continue;

      const color = resolveSlotColor(engine, palette, b.colorSlot[i], b.strokePaletteIndex[i]);
      const kind = b.kind[i];
      const sub = b.subKind[i];
      const px = b.x[i];
      const py = b.y[i];
      const sz = b.size[i];
      const endSz = b.endSize[i];
      const ang = b.angle[i];

      ctx.save();
      ctx.globalAlpha = alpha;
      if (kind === NIB_VFX_KIND_CODE["dust-fleck"]) {
        ctx.translate(px, py); ctx.rotate(ang);
        ctx.fillStyle = color;
        ctx.fillRect(-sz * 0.6, -sz * 0.45, sz * 1.2, sz * 0.9);
      } else if (kind === NIB_VFX_KIND_CODE["wax-crumb"]) {
        ctx.translate(px, py); ctx.rotate(ang);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(-sz, -sz * 0.55); ctx.lineTo(sz * 0.85, -sz * 0.8);
        ctx.lineTo(sz, sz * 0.65); ctx.lineTo(-sz * 0.65, sz * 0.85);
        ctx.closePath(); ctx.fill();
      } else if (kind === NIB_VFX_KIND_CODE["capillary-soak-ring"]) {
        ctx.beginPath();
        if (sub === 0) {
          const radius = sz + (endSz - sz) * (1 - Math.pow(1 - progress, 3));
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(0.8, 2.2 * (1 - progress * 0.65));
          ctx.arc(px, py, radius, 0, TAU); ctx.stroke();
        } else {
          ctx.fillStyle = color;
          ctx.arc(px, py, sz, 0, TAU); ctx.fill();
        }
      } else if (kind === NIB_VFX_KIND_CODE["impasto-ridge-glint"]) {
        ctx.translate(px, py); ctx.rotate(ang); ctx.beginPath();
        if (sub === 0) {
          ctx.fillStyle = color;
          ctx.ellipse(0, 0, sz * 0.5, Math.max(1, endSz * 0.5), 0, 0, TAU); ctx.fill();
        } else {
          ctx.strokeStyle = color; ctx.lineWidth = 1;
          const half = sz * 0.5;
          const gap = Math.max(1.5, endSz * 0.35);
          ctx.moveTo(-half, -gap); ctx.lineTo(half, -gap);
          ctx.moveTo(-half * 0.85, 0); ctx.lineTo(half * 0.85, 0);
          ctx.moveTo(-half, gap); ctx.lineTo(half, gap);
          ctx.stroke();
        }
      } else if (kind === NIB_VFX_KIND_CODE["ink-snap-trail"]) {
        ctx.translate(px, py); ctx.rotate(ang); ctx.strokeStyle = color; ctx.beginPath();
        if (sub === 0) {
          ctx.lineCap = "round";
          ctx.lineWidth = Math.max(1, endSz * (1 - progress * 0.7));
          ctx.moveTo(0, 0); ctx.lineTo(-sz * (1 - progress * 0.35), 0);
        } else {
          const spark = sz * (1 - progress * 0.5);
          ctx.lineWidth = 1.2;
          ctx.moveTo(-spark, 0); ctx.lineTo(spark, 0);
          ctx.moveTo(0, -spark); ctx.lineTo(0, spark);
        }
        ctx.stroke();
      } else {
        ctx.translate(px, py); ctx.rotate(ang);
        ctx.strokeStyle = color; ctx.lineCap = "round"; ctx.lineWidth = Math.max(1.2, sz * 0.48);
        ctx.beginPath(); ctx.arc(0, 0, sz, 0, 1.55); ctx.stroke();
      }
      ctx.restore();
    }
  }

  const cs = engine.cursorState;
  if (showNibCursor && cs[0] === 1 && engine.effectiveMode !== "off") {
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = palette.highlight; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.ellipse(cs[1], cs[2], cs[3], cs[4], cs[5], 0, TAU); ctx.stroke();
    ctx.strokeStyle = cs[6] === 1 ? palette.accent : palette.ink; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.ellipse(cs[1], cs[2], cs[3], cs[4], cs[5], 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cs[7], cs[8]); ctx.lineTo(cs[9], cs[10]); ctx.stroke();
    ctx.restore();
  }
}

export interface StudioNibTactileVfxOverlayProps {
  readonly width?: number;
  readonly height?: number;
  readonly left?: number;
  readonly top?: number;
  readonly dpr?: number;
  readonly flipX?: boolean;
  readonly mode?: NibTactileVfxMode;
  readonly showNibCursor?: boolean;
  readonly reducedMotionOverride?: boolean;
  readonly className?: string;
  readonly onEngineReady?: (engine: NibTactileVfxEngine | null) => void;
}

/** 라이브 뷰포트 전용 필기감 이펙트 Canvas 2D 오버레이 (비출력 · 유휴 시 rAF 0% CPU). */
export const StudioNibTactileVfxOverlay = memo(function StudioNibTactileVfxOverlay({
  width, height, left, top, dpr, flipX = false, mode: modeProp,
  showNibCursor = true, reducedMotionOverride, className, onEngineReady,
}: StudioNibTactileVfxOverlayProps = {}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<NibTactileVfxEngine | null>(null);
  const onEngineReadyRef = useRef<((engine: NibTactileVfxEngine | null) => void) | undefined>(onEngineReady);
  const paletteRef = useRef<ResolvedOverlayPalette>({ ...DEFAULT_OVERLAY_PALETTE });
  const rafIdRef = useRef<number | null>(null);
  const lastFrameMsRef = useRef<number>(0);
  const sizeRef = useRef<{ w: number; h: number; dpr: number }>({ w: 0, h: 0, dpr: 1 });
  const showCursorRef = useRef<boolean>(showNibCursor);

  const [bridgeMode, setBridgeMode] = useState<NibTactileVfxMode>(() => getStudioNibVfxMode());
  const [systemReducedMotion, setSystemReducedMotion] = useState<boolean>(() => readReducedMotionMatch());

  const requestedMode = modeProp ?? bridgeMode;
  const prefersReducedMotion = reducedMotionOverride ?? systemReducedMotion;
  const effectiveMode = resolveEffectiveNibVfxMode(requestedMode, prefersReducedMotion);

  useEffect(() => { showCursorRef.current = showNibCursor; }, [showNibCursor]);
  useEffect(() => { onEngineReadyRef.current = onEngineReady; }, [onEngineReady]);

  useEffect(() => {
    setBridgeMode(getStudioNibVfxMode());
    return subscribeStudioNibVfxMode(setBridgeMode);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mql = window.matchMedia(REDUCED_MOTION_QUERY);
    setSystemReducedMotion(mql.matches);
    const onChange = (event: MediaQueryListEvent) => setSystemReducedMotion(event.matches);
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    return undefined;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const syncSize = () => {
      const nextW = Math.max(0, Math.round(width ?? canvas.clientWidth ?? 0));
      const nextH = Math.max(0, Math.round(height ?? canvas.clientHeight ?? 0));
      const rawDpr = dpr ?? (typeof window !== "undefined" ? window.devicePixelRatio : 1);
      const nextDpr = Math.min(2, Math.max(1, Number.isFinite(rawDpr) ? rawDpr : 1));
      if (sizeRef.current.w === nextW && sizeRef.current.h === nextH && sizeRef.current.dpr === nextDpr) return;
      sizeRef.current = { w: nextW, h: nextH, dpr: nextDpr };
      canvas.width = Math.max(1, Math.round(nextW * nextDpr));
      canvas.height = Math.max(1, Math.round(nextH * nextDpr));
    };
    syncSize();
    resolvePaletteFromElement(canvas, paletteRef.current);
    if ((width !== undefined && height !== undefined) || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(syncSize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [width, height, dpr]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const engine = engineRef.current ?? new NibTactileVfxEngine();
    engineRef.current = engine;
    onEngineReadyRef.current?.(engine);

    const getCtx = (): CanvasRenderingContext2D | null => {
      const ctx = canvas?.getContext("2d") ?? null;
      if (ctx && typeof ctx.setTransform === "function") {
        const s = sizeRef.current.dpr;
        ctx.setTransform(s, 0, 0, s, 0, 0);
      }
      return ctx;
    };
    const clearCanvas = (): void => {
      const ctx = getCtx();
      if (ctx && canvas) ctx.clearRect(0, 0, sizeRef.current.w || canvas.width, sizeRef.current.h || canvas.height);
    };
    const stopLoop = (): void => {
      if (rafIdRef.current !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      lastFrameMsRef.current = 0;
      if (canvas) canvas.dataset.nibVfxLoopActive = "false";
    };
    const paintFrame = (): void => {
      const ctx = getCtx();
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, sizeRef.current.w || canvas.width, sizeRef.current.h || canvas.height);
      drawNibTactileVfxFrame(ctx, engine, paletteRef.current, showCursorRef.current);
    };
    const tick = (nowMs: number): void => {
      rafIdRef.current = null;
      const prevMs = lastFrameMsRef.current;
      lastFrameMsRef.current = nowMs;
      const dtMs = prevMs > 0 ? Math.max(0, Math.min(64, nowMs - prevMs)) : 16.67;
      const remaining = engine.step(dtMs);
      paintFrame();
      if (remaining > 0 && engine.effectiveMode !== "off" && typeof window !== "undefined") {
        rafIdRef.current = window.requestAnimationFrame(tick);
      } else {
        lastFrameMsRef.current = 0;
        if (canvas) canvas.dataset.nibVfxLoopActive = "false";
      }
    };
    const onSample = (sample: NibVfxPointerSample): void => {
      engine.ingestSample(sample);
      if (engine.effectiveMode === "off") { stopLoop(); clearCanvas(); return; }
      if (engine.activeCount > 0) {
        if (rafIdRef.current === null && typeof window !== "undefined") {
          if (canvas) canvas.dataset.nibVfxLoopActive = "true";
          lastFrameMsRef.current = 0;
          rafIdRef.current = window.requestAnimationFrame(tick);
        }
      } else if (showCursorRef.current) {
        paintFrame();
      }
    };

    sampleListeners.add(onSample);
    return () => {
      sampleListeners.delete(onSample);
      stopLoop();
      engine.clear();
      clearCanvas();
      onEngineReadyRef.current?.(null);
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine) return;
    engine.setMode(requestedMode);
    engine.setPrefersReducedMotion(prefersReducedMotion);
    if (effectiveMode === "off") {
      if (rafIdRef.current !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      lastFrameMsRef.current = 0;
      if (canvas) {
        canvas.dataset.nibVfxLoopActive = "false";
        canvas.getContext("2d")?.clearRect(0, 0, sizeRef.current.w || canvas.width, sizeRef.current.h || canvas.height);
      }
    }
  }, [requestedMode, prefersReducedMotion, effectiveMode]);

  const hasExplicitBox = width !== undefined || height !== undefined || left !== undefined || top !== undefined;
  const style: CSSProperties = {
    pointerEvents: "none",
    ...(left !== undefined ? { left } : undefined),
    ...(top !== undefined ? { top } : undefined),
    ...(width !== undefined ? { width } : undefined),
    ...(height !== undefined ? { height } : undefined),
    ...(flipX ? { transform: "scaleX(-1)" } : undefined),
  };

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-studio-nib-vfx-overlay="true"
      data-nib-vfx-mode={effectiveMode}
      data-nib-vfx-requested-mode={requestedMode}
      data-nib-vfx-reduced-motion={prefersReducedMotion ? "true" : "false"}
      data-nib-vfx-non-export={NON_EXPORT_OVERLAY_POLICY.nonExportOnly ? "true" : "false"}
      data-nib-vfx-loop-active="false"
      className={
        className ??
        (hasExplicitBox
          ? "pointer-events-none absolute z-[15] block select-none"
          : "pointer-events-none absolute inset-0 z-[15] block h-full w-full select-none")
      }
      style={style}
    />
  );
});
