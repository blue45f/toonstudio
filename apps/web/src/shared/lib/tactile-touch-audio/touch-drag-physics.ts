/**
 * 모바일 터치 드래그앤드롭 물리 상태 머신 · 자기장 스냅 · 마이크로 햅틱 · 옵트인 Web Audio 촉각 합성기.
 * 순수 TypeScript(브라우저 저장소 직접 호출 0건, 기본 음소거 옵트인, onended .disconnect() 완결).
 */

export type TactileHapticPattern = "tap" | "lift" | "snap" | "confirm";
export type TactileSoundKind = "tap" | "lift" | "snap" | "switch" | "confirm";
export type TouchDragPhase = "idle" | "pending" | "scrolling" | "dragging" | "settling";

export interface TouchPoint { readonly x: number; readonly y: number }
export interface DropTargetRect { readonly id: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly magnetRadiusPx?: number }
export interface MagneticSnapMatch { readonly targetId: string; readonly center: TouchPoint; readonly snappedPoint: TouchPoint; readonly distancePx: number; readonly strength: number }
export interface InertialSnapState { readonly x: number; readonly y: number; readonly vx: number; readonly vy: number; readonly settled: boolean }
export interface TouchPointerSample { readonly pointerId: number; readonly x: number; readonly y: number; readonly timestampMs: number; readonly pointerType?: "touch" | "pen" | "mouse"; readonly contactWidthPx?: number; readonly contactHeightPx?: number }
export interface TouchDragConfig { readonly longPressMs?: number; readonly slopPx?: number; readonly intentAngleDeg?: number; readonly scrollAxis?: "y" | "x"; readonly magnetRadiusPx?: number; readonly palmMaxContactPx?: number; readonly inertiaTimeSec?: number; readonly maxInertiaThrowPx?: number }
export interface TouchDragSnapshot {
  readonly phase: TouchDragPhase; readonly activePointerId: number | null; readonly startPoint: TouchPoint | null;
  readonly currentPoint: TouchPoint | null; readonly renderPoint: TouchPoint | null;
  readonly velocity: { readonly vx: number; readonly vy: number }; readonly activeDropTargetId: string | null;
  readonly rejectedReason: "palm" | "multi-touch" | null; readonly liftReason: "long-press" | "intent-vector" | null;
  readonly lastCue: TactileHapticPattern | null;
}
export interface TouchDropOutcome { readonly state: TouchDragSnapshot; readonly dropTargetId: string | null; readonly projectedPoint: TouchPoint | null; readonly inertialSnap: InertialSnapState | null }
export interface TactileAudioSynthesizer { isEnabled(): boolean; setEnabled(enabled: boolean): void; play(kind: TactileSoundKind, options?: { readonly force?: boolean }): boolean; dispose(): void }

export const TOUCH_DRAG_DEFAULTS = Object.freeze({
  longPressMs: 280, slopPx: 8, intentAngleDeg: 30, magnetRadiusPx: 44, palmMaxContactPx: 48,
  inertiaTimeSec: 0.14, maxInertiaThrowPx: 140, springStiffness: 260, springDamping: 26,
  settlePositionEpsPx: 0.5, settleVelocityEpsPxPerSec: 4,
});

export const TACTILE_HAPTIC_PATTERNS: Readonly<Record<TactileHapticPattern, readonly number[]>> = Object.freeze({
  tap: Object.freeze([8]), lift: Object.freeze([14, 24, 10]), snap: Object.freeze([10, 18, 12]), confirm: Object.freeze([12, 28, 18]),
});

const SOUND_SPECS: Readonly<Record<TactileSoundKind, readonly [OscillatorType, number, number, number, number, number]>> = Object.freeze({
  tap: ["sine", 520, 390, 0.032, 0.045, 1800], lift: ["triangle", 340, 540, 0.055, 0.05, 2100],
  snap: ["triangle", 680, 920, 0.042, 0.052, 2400], switch: ["sine", 460, 640, 0.045, 0.048, 2000],
  confirm: ["sine", 580, 880, 0.072, 0.055, 2600],
});
const clamp = (v: number, lo: number, hi: number): number => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);

export function prefersReducedMotion(): boolean {
  try { return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

export function triggerMicroHaptic(
  pattern: TactileHapticPattern,
  options: { readonly enabled?: boolean; readonly ignoreReducedMotion?: boolean; readonly navigatorLike?: { vibrate?: (p: number | number[]) => boolean } } = {},
): boolean {
  if (options.enabled === false || (!options.ignoreReducedMotion && prefersReducedMotion())) return false;
  const nav = options.navigatorLike ?? (typeof navigator !== "undefined" ? navigator : undefined);
  if (!nav || typeof nav.vibrate !== "function") return false;
  try { return Boolean(nav.vibrate([...TACTILE_HAPTIC_PATTERNS[pattern]])); } catch { return false; }
}

function defaultAudioContext(): AudioContext | null {
  try {
    const Ctor = typeof window !== "undefined" ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext : undefined;
    return typeof Ctor === "function" ? new Ctor() : null;
  } catch { return null; }
}

export function createTactileAudioSynthesizer(options: { readonly enabled?: boolean; readonly ignoreReducedMotion?: boolean; readonly throttleMs?: number; readonly createContext?: () => AudioContext | null } = {}): TactileAudioSynthesizer {
  let enabled = options.enabled ?? false;
  let ctx: AudioContext | null = null;
  let lastPlayedAt = -Infinity;
  const throttleMs = options.throttleMs ?? 35;
  const makeCtx = options.createContext ?? defaultAudioContext;

  return {
    isEnabled: () => enabled,
    setEnabled(next: boolean) { enabled = next; },
    play(kind: TactileSoundKind, playOpts?: { readonly force?: boolean }): boolean {
      if (!(playOpts?.force ?? enabled) || (!options.ignoreReducedMotion && prefersReducedMotion())) return false;
      const nowMs = Date.now();
      if (nowMs - lastPlayedAt < throttleMs) return false;
      ctx ??= makeCtx();
      if (!ctx || ctx.state === "closed") return false;
      if (ctx.state === "suspended" && typeof ctx.resume === "function") void Promise.resolve(ctx.resume()).catch(() => {});
      try {
        const [type, f0, f1, sec, peak, lp] = SOUND_SPECS[kind];
        const t0 = ctx.currentTime;
        const osc = ctx.createOscillator(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(f0, t0);
        osc.frequency.exponentialRampToValueAtTime(f1, t0 + sec);
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(lp, t0);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.linearRampToValueAtTime(peak, t0 + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + sec);
        osc.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
        osc.onended = () => { for (const n of [osc, filter, gain]) { try { n.disconnect(); } catch { /* noop */ } } };
        osc.start(t0); osc.stop(t0 + sec);
        lastPlayedAt = nowMs;
        return true;
      } catch { return false; }
    },
    dispose() {
      const closing = ctx;
      ctx = null;
      if (!closing || closing.state === "closed" || typeof closing.close !== "function") return;
      try { void Promise.resolve(closing.close()).catch(() => {}); } catch { /* noop */ }
    },
  };
}

export function triggerTactileFeedback(
  pattern: TactileHapticPattern,
  options: { readonly hapticsEnabled?: boolean; readonly soundEnabled?: boolean; readonly soundKind?: TactileSoundKind; readonly synthesizer?: TactileAudioSynthesizer; readonly ignoreReducedMotion?: boolean } = {},
): { readonly haptic: boolean; readonly sound: boolean } {
  return {
    haptic: triggerMicroHaptic(pattern, { enabled: options.hapticsEnabled, ignoreReducedMotion: options.ignoreReducedMotion }),
    sound: options.synthesizer ? options.synthesizer.play(options.soundKind ?? pattern, { force: options.soundEnabled }) : false,
  };
}

export function findMagneticDropTarget(point: TouchPoint, targets: readonly DropTargetRect[], defaultMagnetRadiusPx: number = TOUCH_DRAG_DEFAULTS.magnetRadiusPx): MagneticSnapMatch | null {
  let best: (MagneticSnapMatch & { readonly edgeDist: number }) | null = null;
  for (const t of targets) {
    const radius = Math.max(0, t.magnetRadiusPx ?? defaultMagnetRadiusPx);
    const cx = t.x + t.width / 2;
    const cy = t.y + t.height / 2;
    const edgeDist = Math.hypot(point.x - clamp(point.x, t.x, t.x + t.width), point.y - clamp(point.y, t.y, t.y + t.height));
    if (edgeDist > radius) continue;
    const centerDist = Math.hypot(point.x - cx, point.y - cy);
    if (best && (edgeDist > best.edgeDist || (edgeDist === best.edgeDist && centerDist >= best.distancePx))) continue;
    const halfDiag = Math.max(1, Math.hypot(t.width / 2, t.height / 2));
    const strength: number = edgeDist === 0 ? 0.65 + 0.35 * (1 - clamp(centerDist / halfDiag, 0, 1)) : 0.65 * (1 - edgeDist / Math.max(1, radius));
    best = { targetId: t.id, center: { x: cx, y: cy }, snappedPoint: { x: point.x + (cx - point.x) * strength, y: point.y + (cy - point.y) * strength }, distancePx: centerDist, strength, edgeDist };
  }
  return best ? { targetId: best.targetId, center: best.center, snappedPoint: best.snappedPoint, distancePx: best.distancePx, strength: best.strength } : null;
}

export function projectInertialEndPoint(point: TouchPoint, velocity: { readonly vx: number; readonly vy: number }, options: { readonly inertiaTimeSec?: number; readonly maxThrowPx?: number } = {}): TouchPoint {
  const rawDx = velocity.vx * (options.inertiaTimeSec ?? TOUCH_DRAG_DEFAULTS.inertiaTimeSec);
  const rawDy = velocity.vy * (options.inertiaTimeSec ?? TOUCH_DRAG_DEFAULTS.inertiaTimeSec);
  const maxThrow = options.maxThrowPx ?? TOUCH_DRAG_DEFAULTS.maxInertiaThrowPx;
  const dist = Math.hypot(rawDx, rawDy);
  const scale = dist > maxThrow && dist > 0 ? maxThrow / dist : 1;
  return { x: point.x + rawDx * scale, y: point.y + rawDy * scale };
}

export function stepInertialSnap(state: InertialSnapState, target: TouchPoint, dtMs: number, options: { readonly stiffness?: number; readonly damping?: number; readonly reducedMotion?: boolean } = {}): InertialSnapState {
  if (options.reducedMotion) return { x: target.x, y: target.y, vx: 0, vy: 0, settled: true };
  const dt = clamp(dtMs, 0, 50) / 1000;
  if (dt === 0) return state;
  const k = options.stiffness ?? TOUCH_DRAG_DEFAULTS.springStiffness;
  const c = options.damping ?? TOUCH_DRAG_DEFAULTS.springDamping;
  const vx = state.vx + ((target.x - state.x) * k - state.vx * c) * dt;
  const vy = state.vy + ((target.y - state.y) * k - state.vy * c) * dt;
  const x = state.x + vx * dt;
  const y = state.y + vy * dt;
  const settled = Math.hypot(target.x - x, target.y - y) <= TOUCH_DRAG_DEFAULTS.settlePositionEpsPx && Math.hypot(vx, vy) <= TOUCH_DRAG_DEFAULTS.settleVelocityEpsPxPerSec;
  return settled ? { x: target.x, y: target.y, vx: 0, vy: 0, settled: true } : { x, y, vx, vy, settled: false };
}

const IDLE_SNAPSHOT: TouchDragSnapshot = Object.freeze({
  phase: "idle", activePointerId: null, startPoint: null, currentPoint: null, renderPoint: null,
  velocity: Object.freeze({ vx: 0, vy: 0 }), activeDropTargetId: null, rejectedReason: null, liftReason: null, lastCue: null,
});

export function createTouchDragMachine(config: TouchDragConfig = {}) {
  const cfg = { ...TOUCH_DRAG_DEFAULTS, scrollAxis: config.scrollAxis ?? ("y" as const), ...config };
  const activePointers = new Set<number>();
  let downAtMs = 0;
  let lastSampleMs = 0;
  let snap: TouchDragSnapshot = IDLE_SNAPSHOT;

  const enterDrag = (point: TouchPoint, reason: "long-press" | "intent-vector", targets?: readonly DropTargetRect[]): TouchDragSnapshot => {
    const match = targets ? findMagneticDropTarget(point, targets, cfg.magnetRadiusPx) : null;
    return (snap = { ...snap, phase: "dragging", currentPoint: point, renderPoint: match ? match.snappedPoint : point, activeDropTargetId: match?.targetId ?? null, liftReason: reason, rejectedReason: null, lastCue: "lift" });
  };

  return {
    getState: (): TouchDragSnapshot => snap,
    pointerDown(sample: TouchPointerSample): TouchDragSnapshot {
      if ((sample.contactWidthPx ?? 0) > cfg.palmMaxContactPx || (sample.contactHeightPx ?? 0) > cfg.palmMaxContactPx) return (snap = { ...snap, rejectedReason: "palm", lastCue: null });
      if (activePointers.size > 0 && !activePointers.has(sample.pointerId)) {
        activePointers.add(sample.pointerId);
        return (snap = snap.phase === "pending" ? { ...IDLE_SNAPSHOT, rejectedReason: "multi-touch" } : { ...snap, rejectedReason: "multi-touch", lastCue: null });
      }
      activePointers.add(sample.pointerId);
      downAtMs = sample.timestampMs;
      lastSampleMs = sample.timestampMs;
      const origin = { x: sample.x, y: sample.y };
      return (snap = { ...IDLE_SNAPSHOT, phase: "pending", activePointerId: sample.pointerId, startPoint: origin, currentPoint: origin, renderPoint: origin });
    },
    tick(nowMs: number, targets?: readonly DropTargetRect[]): TouchDragSnapshot {
      return snap.phase === "pending" && snap.currentPoint && nowMs - downAtMs >= cfg.longPressMs ? enterDrag(snap.currentPoint, "long-press", targets) : snap;
    },
    pointerMove(sample: TouchPointerSample, targets?: readonly DropTargetRect[]): TouchDragSnapshot {
      if (sample.pointerId !== snap.activePointerId || !snap.startPoint || !snap.currentPoint) return snap;
      const nextPt = { x: sample.x, y: sample.y };
      if (snap.phase === "pending") {
        const dx = nextPt.x - snap.startPoint.x, dy = nextPt.y - snap.startPoint.y;
        if (Math.hypot(dx, dy) <= cfg.slopPx) return sample.timestampMs - downAtMs >= cfg.longPressMs ? enterDrag(nextPt, "long-press", targets) : (snap = { ...snap, currentPoint: nextPt, renderPoint: nextPt, lastCue: null });
        const angleDeg = (cfg.scrollAxis === "y" ? Math.atan2(Math.abs(dx), Math.abs(dy)) : Math.atan2(Math.abs(dy), Math.abs(dx))) * (180 / Math.PI);
        if (angleDeg <= cfg.intentAngleDeg) return (snap = { ...snap, phase: "scrolling", currentPoint: nextPt, renderPoint: nextPt, lastCue: null });
        lastSampleMs = sample.timestampMs;
        return enterDrag(nextPt, "intent-vector", targets);
      }
      if (snap.phase !== "dragging") return snap;
      const dtSec = Math.max(0.001, (sample.timestampMs - lastSampleMs) / 1000);
      const vx = snap.velocity.vx * 0.35 + ((nextPt.x - snap.currentPoint.x) / dtSec) * 0.65;
      const vy = snap.velocity.vy * 0.35 + ((nextPt.y - snap.currentPoint.y) / dtSec) * 0.65;
      lastSampleMs = sample.timestampMs;
      const match = targets ? findMagneticDropTarget(nextPt, targets, cfg.magnetRadiusPx) : null;
      const nextTargetId = match?.targetId ?? null;
      return (snap = { ...snap, currentPoint: nextPt, renderPoint: match ? match.snappedPoint : nextPt, velocity: { vx, vy }, activeDropTargetId: nextTargetId, rejectedReason: null, lastCue: nextTargetId && nextTargetId !== snap.activeDropTargetId ? "snap" : null });
    },
    pointerUp(sample: TouchPointerSample, targets?: readonly DropTargetRect[]): TouchDropOutcome {
      activePointers.delete(sample.pointerId);
      if (sample.pointerId !== snap.activePointerId) return { state: snap, dropTargetId: snap.activeDropTargetId, projectedPoint: null, inertialSnap: null };
      if (snap.phase !== "dragging" || !snap.renderPoint) return { state: (snap = IDLE_SNAPSHOT), dropTargetId: null, projectedPoint: null, inertialSnap: null };
      const projectedPoint = projectInertialEndPoint({ x: sample.x, y: sample.y }, snap.velocity, { inertiaTimeSec: cfg.inertiaTimeSec, maxThrowPx: cfg.maxInertiaThrowPx });
      const match = targets ? findMagneticDropTarget(projectedPoint, targets, cfg.magnetRadiusPx) ?? findMagneticDropTarget({ x: sample.x, y: sample.y }, targets, cfg.magnetRadiusPx) : null;
      const dropTargetId = match?.targetId ?? null;
      const inertialSnap: InertialSnapState = { x: snap.renderPoint.x, y: snap.renderPoint.y, vx: snap.velocity.vx, vy: snap.velocity.vy, settled: false };
      snap = { ...snap, phase: "settling", activePointerId: null, activeDropTargetId: dropTargetId, lastCue: dropTargetId ? "confirm" : "tap" };
      return { state: snap, dropTargetId, projectedPoint, inertialSnap };
    },
    cancel(pointerId?: number): TouchDragSnapshot {
      if (pointerId === undefined) activePointers.clear(); else activePointers.delete(pointerId);
      if (pointerId === undefined || pointerId === snap.activePointerId) snap = IDLE_SNAPSHOT;
      return snap;
    },
  };
}

const TACTILE_SELECTOR = 'button, a[href], summary, [role="button"], [role="tab"], [role="switch"], [data-touch-draggable="true"], [data-tactile-cue]';
const SWITCH_SELECTOR = '[role="tab"], [role="switch"], [aria-pressed], input[type="checkbox"]';

function findInteractiveTarget(target: EventTarget | null): Element | null {
  if (!(target instanceof Element) || target.closest('[data-no-sfx], [data-tactile-handled="true"]')) return null;
  const el = target.closest(TACTILE_SELECTOR);
  return !el || (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true" ? null : el;
}

export function attachPageTactileFeedback(options: { readonly synthesizer: TactileAudioSynthesizer; readonly hapticsEnabled?: boolean; readonly root?: Document | HTMLElement }): () => void {
  const root = options.root ?? (typeof document !== "undefined" ? document : null);
  if (!root) return () => {};
  const onPointerDown = (event: Event) => {
    const pt = (event as { readonly pointerType?: string }).pointerType;
    if (pt !== "touch" && pt !== "pen") return;
    const el = findInteractiveTarget(event.target);
    if (el) triggerMicroHaptic(el.matches(SWITCH_SELECTOR) ? "snap" : "tap", { enabled: options.hapticsEnabled });
  };
  const onClick = (event: Event) => {
    if (!options.synthesizer.isEnabled()) return;
    const el = findInteractiveTarget(event.target);
    if (el) options.synthesizer.play(el.matches('[data-touch-draggable="true"]') ? "snap" : el.matches(SWITCH_SELECTOR) ? "switch" : "tap");
  };
  root.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
  root.addEventListener("click", onClick, { capture: true, passive: true });
  return () => { root.removeEventListener("pointerdown", onPointerDown, { capture: true }); root.removeEventListener("click", onClick, { capture: true }); };
}
