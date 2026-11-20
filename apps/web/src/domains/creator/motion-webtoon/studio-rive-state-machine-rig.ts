/**
 * Rive 클린룸 인터랙티브 State Machine 리깅 엔진 & 스크롤·음성 반응형 모션 웹툰 바인딩.
 *
 * 구성:
 * 1. 타입드 입력: `boolean`, `number`, `trigger` 상태 머신 입력 관리
 * 2. 멀티 레이어 상태 그래프: `entry`, `wildcard`, `animation`, `blend-1d`, `blend-direct`
 * 3. 조건부 전이 평가(우선순위 · Exit Time · 이징 크로스페이드 블렌드 시간 · 트리거 원자 소비)
 * 4. 웹툰 ViewModel 반응형 바인딩: 독자 스크롤 진행률/속도 · 컷 진입 · 포인터 · TTS 음성 진폭(Attack/Release)
 * 5. Linearity Move식 Auto Animate 포즈 A↔B 자동 모핑 유틸
 */

import {
  applyMotionEasing,
  resolveMotionEasing,
  type MotionEasingPresetId,
} from "./motion-webtoon-easing";

export type StateMachineInputDef =
  | { readonly kind: "boolean"; readonly name: string; readonly defaultValue: boolean }
  | {
      readonly kind: "number";
      readonly name: string;
      readonly defaultValue: number;
      readonly min?: number;
      readonly max?: number;
    }
  | { readonly kind: "trigger"; readonly name: string };

export interface ClipPropertyKeyframe {
  readonly timeSeconds: number;
  readonly value: number;
  readonly easingPresetId?: MotionEasingPresetId;
}

export type ClipLoopMode = "one-shot" | "loop" | "ping-pong";

export interface StateMachineAnimationClip {
  readonly id: string;
  readonly name: string;
  readonly durationSeconds: number;
  readonly loopMode: ClipLoopMode;
  readonly speed?: number;
  /** 속성 이름(예: `"param.angleX"`, `"layer.opacity"`) → 키프레임 배열. */
  readonly tracks: Readonly<Record<string, readonly ClipPropertyKeyframe[]>>;
}

export interface Blend1DStop {
  readonly threshold: number;
  readonly clipId: string;
}

export interface BlendDirectEntry {
  readonly inputName: string;
  readonly clipId: string;
  readonly weightScale?: number;
}

export type StateMachineNodeDef =
  | { readonly kind: "entry"; readonly id: string }
  | { readonly kind: "wildcard"; readonly id: string }
  | { readonly kind: "exit"; readonly id: string }
  | { readonly kind: "animation"; readonly id: string; readonly name: string; readonly clipId: string }
  | {
      readonly kind: "blend-1d";
      readonly id: string;
      readonly name: string;
      readonly inputName: string;
      readonly stops: readonly Blend1DStop[];
    }
  | {
      readonly kind: "blend-direct";
      readonly id: string;
      readonly name: string;
      readonly entries: readonly BlendDirectEntry[];
    };

export type NumberCompareOp = "==" | "!=" | "<" | "<=" | ">" | ">=";

export type TransitionCondition =
  | { readonly kind: "boolean"; readonly inputName: string; readonly expected: boolean }
  | {
      readonly kind: "number";
      readonly inputName: string;
      readonly op: NumberCompareOp;
      readonly value: number;
    }
  | { readonly kind: "trigger"; readonly inputName: string };

export interface StateTransitionDef {
  readonly id: string;
  readonly fromStateId: string;
  readonly toStateId: string;
  readonly conditions: readonly TransitionCondition[];
  readonly blendDurationSeconds: number;
  /** 현재 상태의 정규화 재생 시간(`0..1`) 이상일 때만 전이 허용(미지정 시 즉시). */
  readonly exitTimeNormalized?: number;
  readonly easingPresetId?: MotionEasingPresetId;
  readonly priority?: number;
}

export type StateLayerBlendMode = "override" | "additive";

export interface StateMachineLayerDef {
  readonly id: string;
  readonly name: string;
  readonly blendMode: StateLayerBlendMode;
  readonly weight: number;
  readonly entryStateId: string;
  readonly anyStateId?: string;
  readonly states: readonly StateMachineNodeDef[];
  readonly transitions: readonly StateTransitionDef[];
}

export interface RiveStateMachineDefinition {
  readonly id: string;
  readonly name: string;
  readonly inputs: readonly StateMachineInputDef[];
  readonly clips: readonly StateMachineAnimationClip[];
  readonly layers: readonly StateMachineLayerDef[];
}

export interface StateMachineEventRecord {
  readonly kind: "state-enter" | "transition-start" | "transition-complete";
  readonly layerId: string;
  readonly stateId: string;
  readonly transitionId?: string;
  readonly atSeconds: number;
}

export interface WebtoonReactiveSignals {
  readonly scrollProgress: number;
  readonly scrollVelocity?: number;
  readonly cutEntered?: boolean;
  readonly pointerHover?: boolean;
  readonly pointerPressed?: boolean;
  readonly voiceAmplitude01?: number;
  readonly voiceSpeaking?: boolean;
  readonly branchNumbers?: Readonly<Record<string, number>>;
  readonly branchBooleans?: Readonly<Record<string, boolean>>;
}

export type WebtoonSignalBinding =
  | {
      readonly source: "scroll-progress";
      readonly targetInput: string;
      readonly minOut?: number;
      readonly maxOut?: number;
    }
  | {
      readonly source: "scroll-threshold-trigger";
      readonly targetInput: string;
      readonly threshold: number;
    }
  | { readonly source: "cut-enter-trigger"; readonly targetInput: string }
  | { readonly source: "pointer-hover"; readonly targetInput: string }
  | { readonly source: "pointer-tap-trigger"; readonly targetInput: string }
  | {
      readonly source: "voice-amplitude";
      readonly targetInput: string;
      readonly attackSeconds?: number;
      readonly releaseSeconds?: number;
      readonly gain?: number;
    }
  | { readonly source: "voice-speaking"; readonly targetInput: string }
  | { readonly source: "branch-boolean"; readonly key: string; readonly targetInput: string }
  | { readonly source: "branch-number"; readonly key: string; readonly targetInput: string };

interface ActiveTransitionRuntime {
  readonly transitionId: string;
  readonly fromSnapshot: Readonly<Record<string, number>>;
  readonly durationSeconds: number;
  readonly easingPresetId: MotionEasingPresetId;
  elapsedSeconds: number;
}

interface LayerRuntimeState {
  readonly layer: StateMachineLayerDef;
  readonly stateById: Map<string, StateMachineNodeDef>;
  readonly transitionsByFrom: Map<string, StateTransitionDef[]>;
  currentStateId: string;
  stateTimeSeconds: number;
  activeTransition: ActiveTransitionRuntime | null;
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function wrapClipTime(timeSeconds: number, duration: number, mode: ClipLoopMode): number {
  if (duration <= 1e-6) return 0;
  const t = Math.max(0, timeSeconds);
  if (mode === "one-shot") return Math.min(t, duration);
  if (mode === "loop") return t % duration;
  const cycle = t % (duration * 2);
  return cycle <= duration ? cycle : duration * 2 - cycle;
}

/** 애니메이션 클립의 모든 속성 트랙을 지정 시각에서 샘플링한다. */
export function sampleStateMachineClip(
  clip: StateMachineAnimationClip,
  elapsedSeconds: number,
): Record<string, number> {
  const scaled = Math.max(0, elapsedSeconds) * (clip.speed ?? 1);
  const localT = wrapClipTime(scaled, clip.durationSeconds, clip.loopMode);
  const out: Record<string, number> = {};

  for (const [prop, keys] of Object.entries(clip.tracks)) {
    if (keys.length === 0) continue;
    const first = keys[0];
    const last = keys[keys.length - 1];
    if (!first || !last) continue;
    if (localT <= first.timeSeconds) {
      out[prop] = first.value;
      continue;
    }
    if (localT >= last.timeSeconds) {
      out[prop] = last.value;
      continue;
    }
    for (let i = 0; i < keys.length - 1; i += 1) {
      const a = keys[i];
      const b = keys[i + 1];
      if (!a || !b) continue;
      if (localT >= a.timeSeconds && localT <= b.timeSeconds) {
        const span = b.timeSeconds - a.timeSeconds;
        const frac = span > 1e-6 ? (localT - a.timeSeconds) / span : 1;
        const eased = applyMotionEasing(resolveMotionEasing(a.easingPresetId ?? "linear"), frac);
        out[prop] = lerp(a.value, b.value, eased);
        break;
      }
    }
  }
  return out;
}

function compareNumber(actual: number, op: NumberCompareOp, target: number): boolean {
  switch (op) {
    case "==":
      return Math.abs(actual - target) <= 1e-6;
    case "!=":
      return Math.abs(actual - target) > 1e-6;
    case "<":
      return actual < target;
    case "<=":
      return actual <= target;
    case ">":
      return actual > target;
    case ">=":
      return actual >= target;
  }
}

/**
 * Rive 클린룸 State Machine 실행 런타임.
 * 각 `step(dtSeconds)` 호출은 결정론적으로 전이·크로스페이드·멀티레이어 합성을 계산한다.
 */
export class RiveStateMachineRuntime {
  private readonly def: RiveStateMachineDefinition;
  private readonly clipById: Map<string, StateMachineAnimationClip>;
  private readonly inputDefByName: Map<string, StateMachineInputDef>;
  private readonly boolValues = new Map<string, boolean>();
  private readonly numberValues = new Map<string, number>();
  private readonly pendingTriggers = new Set<string>();
  private readonly layerRuntimes: LayerRuntimeState[];
  private readonly events: StateMachineEventRecord[] = [];
  private elapsedSeconds = 0;

  constructor(definition: RiveStateMachineDefinition) {
    this.def = definition;
    this.clipById = new Map(definition.clips.map((c) => [c.id, c]));
    this.inputDefByName = new Map(definition.inputs.map((i) => [i.name, i]));

    for (const input of definition.inputs) {
      if (input.kind === "boolean") {
        this.boolValues.set(input.name, input.defaultValue);
      } else if (input.kind === "number") {
        this.numberValues.set(
          input.name,
          clamp(input.defaultValue, input.min ?? -Infinity, input.max ?? Infinity),
        );
      }
    }

    this.layerRuntimes = definition.layers.map((layer) => {
      const stateById = new Map(layer.states.map((s) => [s.id, s]));
      const transitionsByFrom = new Map<string, StateTransitionDef[]>();
      for (const tr of layer.transitions) {
        const list = transitionsByFrom.get(tr.fromStateId) ?? [];
        list.push(tr);
        transitionsByFrom.set(tr.fromStateId, list);
      }
      for (const list of transitionsByFrom.values()) {
        list.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
      }
      const rt: LayerRuntimeState = {
        layer,
        stateById,
        transitionsByFrom,
        currentStateId: layer.entryStateId,
        stateTimeSeconds: 0,
        activeTransition: null,
      };
      // Entry 노드에서 조건 없는 초기 전이를 즉시 밟아 첫 실행 상태에 진입한다.
      const entryTransitions = transitionsByFrom.get(layer.entryStateId) ?? [];
      const firstUnconditional = entryTransitions.find((tr) => tr.conditions.length === 0);
      if (firstUnconditional && stateById.has(firstUnconditional.toStateId)) {
        rt.currentStateId = firstUnconditional.toStateId;
      }
      return rt;
    });
  }

  setBoolean(name: string, value: boolean): void {
    const def = this.inputDefByName.get(name);
    if (def && def.kind !== "boolean") return;
    this.boolValues.set(name, Boolean(value));
  }

  setNumber(name: string, value: number): void {
    const def = this.inputDefByName.get(name);
    if (def && def.kind !== "number") return;
    const min = def?.kind === "number" ? (def.min ?? -Infinity) : -Infinity;
    const max = def?.kind === "number" ? (def.max ?? Infinity) : Infinity;
    this.numberValues.set(name, clamp(value, min, max));
  }

  fireTrigger(name: string): void {
    const def = this.inputDefByName.get(name);
    if (def && def.kind !== "trigger") return;
    this.pendingTriggers.add(name);
  }

  getBoolean(name: string): boolean {
    return this.boolValues.get(name) ?? false;
  }

  getNumber(name: string): number {
    return this.numberValues.get(name) ?? 0;
  }

  getActiveStateId(layerId: string): string | null {
    const rt = this.layerRuntimes.find((l) => l.layer.id === layerId);
    return rt ? rt.currentStateId : null;
  }

  drainEvents(): readonly StateMachineEventRecord[] {
    if (this.events.length === 0) return [];
    const copy = [...this.events];
    this.events.length = 0;
    return copy;
  }

  private evaluateConditions(conditions: readonly TransitionCondition[]): boolean {
    for (const cond of conditions) {
      if (cond.kind === "boolean") {
        if ((this.boolValues.get(cond.inputName) ?? false) !== cond.expected) return false;
      } else if (cond.kind === "number") {
        const val = this.numberValues.get(cond.inputName) ?? 0;
        if (!compareNumber(val, cond.op, cond.value)) return false;
      } else if (!this.pendingTriggers.has(cond.inputName)) {
        return false;
      }
    }
    return true;
  }

  private sampleNodeValues(node: StateMachineNodeDef | undefined, stateTime: number): Record<string, number> {
    if (!node) return {};
    if (node.kind === "animation") {
      const clip = this.clipById.get(node.clipId);
      return clip ? sampleStateMachineClip(clip, stateTime) : {};
    }
    if (node.kind === "blend-1d") {
      if (node.stops.length === 0) return {};
      const sorted = [...node.stops].sort((a, b) => a.threshold - b.threshold);
      const val = this.numberValues.get(node.inputName) ?? 0;
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      if (!first || !last) return {};
      if (val <= first.threshold) {
        const c = this.clipById.get(first.clipId);
        return c ? sampleStateMachineClip(c, stateTime) : {};
      }
      if (val >= last.threshold) {
        const c = this.clipById.get(last.clipId);
        return c ? sampleStateMachineClip(c, stateTime) : {};
      }
      for (let i = 0; i < sorted.length - 1; i += 1) {
        const s0 = sorted[i];
        const s1 = sorted[i + 1];
        if (!s0 || !s1) continue;
        if (val >= s0.threshold && val <= s1.threshold) {
          const span = s1.threshold - s0.threshold;
          const frac = span > 1e-6 ? (val - s0.threshold) / span : 0;
          const c0 = this.clipById.get(s0.clipId);
          const c1 = this.clipById.get(s1.clipId);
          const v0 = c0 ? sampleStateMachineClip(c0, stateTime) : {};
          const v1 = c1 ? sampleStateMachineClip(c1, stateTime) : {};
          const keys = new Set([...Object.keys(v0), ...Object.keys(v1)]);
          const blended: Record<string, number> = {};
          for (const key of keys) {
            blended[key] = lerp(v0[key] ?? 0, v1[key] ?? 0, frac);
          }
          return blended;
        }
      }
      return {};
    }
    if (node.kind === "blend-direct") {
      const out: Record<string, number> = {};
      for (const entry of node.entries) {
        const weight = (this.numberValues.get(entry.inputName) ?? 0) * (entry.weightScale ?? 1);
        if (Math.abs(weight) <= 1e-6) continue;
        const clip = this.clipById.get(entry.clipId);
        if (!clip) continue;
        const sampled = sampleStateMachineClip(clip, stateTime);
        for (const [k, v] of Object.entries(sampled)) {
          out[k] = (out[k] ?? 0) + v * weight;
        }
      }
      return out;
    }
    return {};
  }

  private getStateDurationSeconds(node: StateMachineNodeDef | undefined): number {
    if (!node || node.kind !== "animation") return 1;
    const clip = this.clipById.get(node.clipId);
    return Math.max(1e-4, clip?.durationSeconds ?? 1);
  }

  private sampleLayerValues(rt: LayerRuntimeState): Record<string, number> {
    const currentVals = this.sampleNodeValues(rt.stateById.get(rt.currentStateId), rt.stateTimeSeconds);
    const activeTr = rt.activeTransition;
    if (!activeTr || activeTr.durationSeconds <= 1e-6) return currentVals;
    const rawT = clamp(activeTr.elapsedSeconds / activeTr.durationSeconds, 0, 1);
    const t = applyMotionEasing(resolveMotionEasing(activeTr.easingPresetId), rawT);
    const keys = new Set([...Object.keys(activeTr.fromSnapshot), ...Object.keys(currentVals)]);
    const merged: Record<string, number> = {};
    for (const k of keys) {
      merged[k] = lerp(activeTr.fromSnapshot[k] ?? 0, currentVals[k] ?? 0, t);
    }
    return merged;
  }

  /** 지정 시간 간격 `dtSeconds`만큼 상태 머신을 진행하고 최종 합성 속성 맵을 반환한다. */
  step(dtSeconds: number): Readonly<Record<string, number>> {
    const dt = clamp(dtSeconds, 0, 1);
    this.elapsedSeconds += dt;
    const consumedTriggers = new Set<string>();

    for (const rt of this.layerRuntimes) {
      rt.stateTimeSeconds += dt;
      if (rt.activeTransition) {
        rt.activeTransition.elapsedSeconds += dt;
        if (rt.activeTransition.elapsedSeconds >= rt.activeTransition.durationSeconds) {
          this.events.push({
            kind: "transition-complete",
            layerId: rt.layer.id,
            stateId: rt.currentStateId,
            transitionId: rt.activeTransition.transitionId,
            atSeconds: this.elapsedSeconds,
          });
          rt.activeTransition = null;
        }
      }

      const currentNode = rt.stateById.get(rt.currentStateId);
      const normalizedTime = rt.stateTimeSeconds / this.getStateDurationSeconds(currentNode);

      const candidates: StateTransitionDef[] = [];
      if (rt.layer.anyStateId) {
        const anyList = rt.transitionsByFrom.get(rt.layer.anyStateId);
        if (anyList) candidates.push(...anyList);
      }
      const ownList = rt.transitionsByFrom.get(rt.currentStateId);
      if (ownList) candidates.push(...ownList);

      let chosen: StateTransitionDef | null = null;
      for (const tr of candidates) {
        if (tr.toStateId === rt.currentStateId && tr.fromStateId === rt.layer.anyStateId) continue;
        if (!rt.stateById.has(tr.toStateId)) continue;
        if (
          tr.exitTimeNormalized !== undefined &&
          tr.fromStateId === rt.currentStateId &&
          normalizedTime < tr.exitTimeNormalized
        ) {
          continue;
        }
        if (this.evaluateConditions(tr.conditions)) {
          chosen = tr;
          break;
        }
      }

      if (chosen) {
        for (const cond of chosen.conditions) {
          if (cond.kind === "trigger") consumedTriggers.add(cond.inputName);
        }
        const fromSnapshot = this.sampleLayerValues(rt);
        rt.currentStateId = chosen.toStateId;
        rt.stateTimeSeconds = 0;
        if (chosen.blendDurationSeconds > 1e-6) {
          rt.activeTransition = {
            transitionId: chosen.id,
            fromSnapshot,
            durationSeconds: chosen.blendDurationSeconds,
            easingPresetId: chosen.easingPresetId ?? "ease-in-out",
            elapsedSeconds: 0,
          };
          this.events.push({
            kind: "transition-start",
            layerId: rt.layer.id,
            stateId: chosen.toStateId,
            transitionId: chosen.id,
            atSeconds: this.elapsedSeconds,
          });
        } else {
          rt.activeTransition = null;
        }
        this.events.push({
          kind: "state-enter",
          layerId: rt.layer.id,
          stateId: chosen.toStateId,
          transitionId: chosen.id,
          atSeconds: this.elapsedSeconds,
        });
      }
    }

    for (const trig of consumedTriggers) {
      this.pendingTriggers.delete(trig);
    }

    const composed: Record<string, number> = {};
    for (const rt of this.layerRuntimes) {
      const layerW = clamp(rt.layer.weight, 0, 1);
      if (layerW <= 1e-6) continue;
      const vals = this.sampleLayerValues(rt);
      for (const [prop, val] of Object.entries(vals)) {
        if (rt.layer.blendMode === "additive") {
          composed[prop] = (composed[prop] ?? 0) + val * layerW;
        } else {
          const prev = composed[prop];
          composed[prop] = prev === undefined ? val * layerW : lerp(prev, val, layerW);
        }
      }
    }
    return composed;
  }

  getDefinition(): RiveStateMachineDefinition {
    return this.def;
  }
}

/**
 * 스크롤·음성·포인터 신호를 Rive State Machine 입력에 연결하는 반응형 ViewModel 어댑터.
 * 에지 트리거(컷 진입, 스크롤 임계 통과, 탭)와 음성 엔벨로프 스무딩 상태를 유지한다.
 */
export class WebtoonReactiveRigBinder {
  private readonly bindings: readonly WebtoonSignalBinding[];
  private prevScrollProgress = 0;
  private prevCutEntered = false;
  private prevPointerPressed = false;
  private readonly smoothedVoiceByInput = new Map<string, number>();

  constructor(bindings: readonly WebtoonSignalBinding[]) {
    this.bindings = [...bindings];
  }

  apply(runtime: RiveStateMachineRuntime, signals: WebtoonReactiveSignals, dtSeconds: number): void {
    const scroll = clamp(signals.scrollProgress, 0, 1);
    const dt = clamp(dtSeconds, 1e-4, 0.5);

    for (const binding of this.bindings) {
      switch (binding.source) {
        case "scroll-progress": {
          const minOut = binding.minOut ?? 0;
          const maxOut = binding.maxOut ?? 1;
          runtime.setNumber(binding.targetInput, lerp(minOut, maxOut, scroll));
          break;
        }
        case "scroll-threshold-trigger": {
          if (this.prevScrollProgress < binding.threshold && scroll >= binding.threshold) {
            runtime.fireTrigger(binding.targetInput);
          }
          break;
        }
        case "cut-enter-trigger": {
          if (!this.prevCutEntered && signals.cutEntered === true) {
            runtime.fireTrigger(binding.targetInput);
          }
          break;
        }
        case "pointer-hover": {
          runtime.setBoolean(binding.targetInput, signals.pointerHover === true);
          break;
        }
        case "pointer-tap-trigger": {
          if (!this.prevPointerPressed && signals.pointerPressed === true) {
            runtime.fireTrigger(binding.targetInput);
          }
          break;
        }
        case "voice-amplitude": {
          const raw = clamp((signals.voiceAmplitude01 ?? 0) * (binding.gain ?? 1), 0, 1);
          const prev = this.smoothedVoiceByInput.get(binding.targetInput) ?? 0;
          const tau =
            raw >= prev
              ? Math.max(1e-3, binding.attackSeconds ?? 0.03)
              : Math.max(1e-3, binding.releaseSeconds ?? 0.12);
          const alpha = 1 - Math.exp(-dt / tau);
          const next = lerp(prev, raw, alpha);
          this.smoothedVoiceByInput.set(binding.targetInput, next);
          runtime.setNumber(binding.targetInput, next);
          break;
        }
        case "voice-speaking": {
          runtime.setBoolean(binding.targetInput, signals.voiceSpeaking === true);
          break;
        }
        case "branch-boolean": {
          const val = signals.branchBooleans?.[binding.key];
          if (val !== undefined) runtime.setBoolean(binding.targetInput, val);
          break;
        }
        case "branch-number": {
          const val = signals.branchNumbers?.[binding.key];
          if (val !== undefined) runtime.setNumber(binding.targetInput, val);
          break;
        }
      }
    }

    this.prevScrollProgress = scroll;
    this.prevCutEntered = signals.cutEntered === true;
    this.prevPointerPressed = signals.pointerPressed === true;
  }
}

/**
 * Linearity Move식 Auto Animate — 두 포즈 스냅샷 사이의 공통 속성을 이징 곡선으로 자동 모핑한다.
 */
export function evaluateAutoAnimatePose(
  poseA: Readonly<Record<string, number>>,
  poseB: Readonly<Record<string, number>>,
  progress01: number,
  easingPresetId: MotionEasingPresetId = "ease-in-out",
): Readonly<Record<string, number>> {
  const t = applyMotionEasing(resolveMotionEasing(easingPresetId), clamp(progress01, 0, 1));
  const keys = new Set([...Object.keys(poseA), ...Object.keys(poseB)]);
  const out: Record<string, number> = {};
  for (const key of keys) {
    out[key] = lerp(poseA[key] ?? 0, poseB[key] ?? 0, t);
  }
  return out;
}
