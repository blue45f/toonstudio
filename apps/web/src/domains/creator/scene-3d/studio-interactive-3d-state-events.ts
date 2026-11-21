/**
 * Spline / Hana 스타일 인터랙티브 3D 상태·스프링 이벤트 머신 (클린룸 구현).
 *
 * - 3D 오브젝트·카메라·조명 엔티티별 Base + 변형 상태(Hover, Click, ScrollKey, CutReveal 등)
 * - 노코드 이벤트 트리거: onPointerHover, onClick(토글/지정/순환), onScrollRatio(연속 보간·임계치),
 *   onCursorLookAt(커서 시선 추적 yaw/pitch 클램프)
 * - 고정 서브스텝 감쇠 스프링 물리(stiffness, damping, mass) + 경량 바닥 충돌 바운스 트리거
 * - prefersReducedMotion 즉시 스냅 지원 및 경량 JSON 직렬화
 */

export const INTERACTIVE_3D_STATE_SCHEMA_VERSION = 1 as const;
const MAX_SPRING_SUBSTEP_SEC = 1 / 120;

export type Interactive3dEntityKind = "object" | "camera" | "light";

export interface Interactive3dTransform {
  readonly position: readonly [number, number, number];
  readonly rotationEuler: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
}

export interface Interactive3dSurfaceParams {
  readonly opacity: number;
  readonly roughness: number;
  readonly metalness: number;
  readonly toonSteps: number;
  readonly matcapId: string;
}

export interface Interactive3dLightParams {
  readonly intensity: number;
  readonly colorTempK: number;
}

export interface Interactive3dStateSnapshot {
  readonly id: string;
  readonly label: string;
  readonly transform: Interactive3dTransform;
  readonly surface?: Partial<Interactive3dSurfaceParams>;
  readonly light?: Partial<Interactive3dLightParams>;
}

export interface SpringPhysicsConfig {
  /** 스프링 강성(N/m, 예: 120..360). */
  readonly stiffness: number;
  /** 감쇠 계수(예: 12..34). */
  readonly damping: number;
  /** 질량(kg, 기본 1.0). */
  readonly mass: number;
  /** 정지 수렴 허용 오차. */
  readonly restEpsilon: number;
  /** 선택적 바닥 충돌 평면 Y 및 반발 계수(0..0.95). */
  readonly bouncePlaneY?: number;
  readonly restitution?: number;
}

export const DEFAULT_SPRING_PHYSICS_CONFIG: Readonly<SpringPhysicsConfig> = Object.freeze({
  stiffness: 180,
  damping: 20,
  mass: 1,
  restEpsilon: 1e-4,
});

export interface Interactive3dEntitySpec {
  readonly id: string;
  readonly kind: Interactive3dEntityKind;
  readonly baseState: Interactive3dStateSnapshot;
  readonly variantStates: readonly Interactive3dStateSnapshot[];
  readonly spring?: Partial<SpringPhysicsConfig>;
}

export type Interactive3dTriggerRule =
  | {
      readonly id: string;
      readonly kind: "onPointerHover";
      readonly entityId: string;
      readonly hoverStateId: string;
      readonly restStateId: string;
    }
  | {
      readonly id: string;
      readonly kind: "onClick";
      readonly entityId: string;
      readonly mode: "toggle" | "set" | "cycle";
      readonly stateIds: readonly string[];
    }
  | {
      readonly id: string;
      readonly kind: "onScrollRatio";
      readonly entityId: string;
      readonly startRatio: number;
      readonly endRatio: number;
      readonly fromStateId: string;
      readonly toStateId: string;
    }
  | {
      readonly id: string;
      readonly kind: "onCursorLookAt";
      readonly entityId: string;
      readonly maxYawRad: number;
      readonly maxPitchRad: number;
      readonly invertY?: boolean;
    };

export interface Interactive3dSceneBlueprint {
  readonly version: typeof INTERACTIVE_3D_STATE_SCHEMA_VERSION;
  readonly entities: readonly Interactive3dEntitySpec[];
  readonly triggers: readonly Interactive3dTriggerRule[];
}

export type Interactive3dEventInput =
  | { readonly type: "pointerEnter"; readonly entityId: string }
  | { readonly type: "pointerLeave"; readonly entityId: string }
  | { readonly type: "click"; readonly entityId: string }
  | { readonly type: "setState"; readonly entityId: string; readonly stateId: string }
  | { readonly type: "scroll"; readonly ratio: number }
  | { readonly type: "cursorMove"; readonly ndcX: number; readonly ndcY: number };

export interface Interactive3dBounceEvent {
  readonly entityId: string;
  readonly impactSpeed: number;
  readonly planeY: number;
  readonly stepTimeSec: number;
}

export interface EvaluatedEntityPose {
  readonly entityId: string;
  readonly activeStateId: string;
  readonly position: readonly [number, number, number];
  readonly rotationEuler: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly opacity: number;
  readonly roughness: number;
  readonly metalness: number;
  readonly toonSteps: number;
  readonly matcapId: string;
  readonly lightIntensity: number;
  readonly colorTempK: number;
  readonly settled: boolean;
}

interface ScalarChannel {
  value: number;
  velocity: number;
  target: number;
}

interface EntityRuntime {
  readonly spec: Interactive3dEntitySpec;
  readonly stateMap: Map<string, Interactive3dStateSnapshot>;
  readonly spring: SpringPhysicsConfig;
  activeStateId: string;
  activeMatcapId: string;
  clickCycleCursor: number;
  readonly pos: [ScalarChannel, ScalarChannel, ScalarChannel];
  readonly rot: [ScalarChannel, ScalarChannel, ScalarChannel];
  readonly scale: [ScalarChannel, ScalarChannel, ScalarChannel];
  readonly opacity: ScalarChannel;
  readonly roughness: ScalarChannel;
  readonly metalness: ScalarChannel;
  readonly toonSteps: ScalarChannel;
  readonly lightIntensity: ScalarChannel;
  readonly colorTempK: ScalarChannel;
  lookAtYawOffset: number;
  lookAtPitchOffset: number;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function makeChannel(v: number): ScalarChannel {
  return { value: v, velocity: 0, target: v };
}

function normalizeSpringConfig(partial?: Partial<SpringPhysicsConfig>): SpringPhysicsConfig {
  const d = DEFAULT_SPRING_PHYSICS_CONFIG;
  return {
    stiffness: Math.max(1, partial?.stiffness ?? d.stiffness),
    damping: Math.max(0.5, partial?.damping ?? d.damping),
    mass: Math.max(0.05, partial?.mass ?? d.mass),
    restEpsilon: Math.max(1e-6, partial?.restEpsilon ?? d.restEpsilon),
    bouncePlaneY: partial?.bouncePlaneY,
    restitution: partial?.restitution !== undefined ? clamp(partial.restitution, 0, 0.95) : undefined,
  };
}

function stepScalarSpring(ch: ScalarChannel, cfg: SpringPhysicsConfig, dt: number): boolean {
  const disp = ch.value - ch.target;
  const accel = (-cfg.stiffness * disp - cfg.damping * ch.velocity) / cfg.mass;
  ch.velocity += accel * dt;
  ch.value += ch.velocity * dt;

  if (Math.abs(ch.value - ch.target) <= cfg.restEpsilon && Math.abs(ch.velocity) <= cfg.restEpsilon * 4) {
    ch.value = ch.target;
    ch.velocity = 0;
    return true;
  }
  return false;
}

function resolveSnapshotValues(
  base: Interactive3dStateSnapshot,
  snap: Interactive3dStateSnapshot,
): {
  readonly pos: readonly [number, number, number];
  readonly rot: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly opacity: number;
  readonly roughness: number;
  readonly metalness: number;
  readonly toonSteps: number;
  readonly matcapId: string;
  readonly lightIntensity: number;
  readonly colorTempK: number;
} {
  return {
    pos: snap.transform.position,
    rot: snap.transform.rotationEuler,
    scale: snap.transform.scale,
    opacity: snap.surface?.opacity ?? base.surface?.opacity ?? 1,
    roughness: snap.surface?.roughness ?? base.surface?.roughness ?? 0.5,
    metalness: snap.surface?.metalness ?? base.surface?.metalness ?? 0,
    toonSteps: snap.surface?.toonSteps ?? base.surface?.toonSteps ?? 3,
    matcapId: snap.surface?.matcapId ?? base.surface?.matcapId ?? "clay-warm",
    lightIntensity: snap.light?.intensity ?? base.light?.intensity ?? 1,
    colorTempK: snap.light?.colorTempK ?? base.light?.colorTempK ?? 5600,
  };
}

/**
 * 인터랙티브 3D 상태·스프링 이벤트 런타임 머신.
 * 순수 결정적 스텝 실행으로 웹툰 리더·에디터·테스트 어디서나 동일하게 동작한다.
 */
export class Interactive3dStateMachine {
  private readonly blueprint: Interactive3dSceneBlueprint;
  private readonly runtimes = new Map<string, EntityRuntime>();
  private readonly bounceHistory: Interactive3dBounceEvent[] = [];
  private elapsedTimeSec = 0;
  private prefersReducedMotion: boolean;
  private scrollRatio = 0;
  private cursorNdcX = 0;
  private cursorNdcY = 0;

  constructor(
    blueprint: Interactive3dSceneBlueprint,
    options: { readonly prefersReducedMotion?: boolean } = {},
  ) {
    this.blueprint = blueprint;
    this.prefersReducedMotion = Boolean(options.prefersReducedMotion);

    for (const spec of blueprint.entities) {
      const stateMap = new Map<string, Interactive3dStateSnapshot>();
      stateMap.set(spec.baseState.id, spec.baseState);
      for (const variant of spec.variantStates) {
        stateMap.set(variant.id, variant);
      }
      const init = resolveSnapshotValues(spec.baseState, spec.baseState);
      this.runtimes.set(spec.id, {
        spec,
        stateMap,
        spring: normalizeSpringConfig(spec.spring),
        activeStateId: spec.baseState.id,
        activeMatcapId: init.matcapId,
        clickCycleCursor: 0,
        pos: [makeChannel(init.pos[0]), makeChannel(init.pos[1]), makeChannel(init.pos[2])],
        rot: [makeChannel(init.rot[0]), makeChannel(init.rot[1]), makeChannel(init.rot[2])],
        scale: [makeChannel(init.scale[0]), makeChannel(init.scale[1]), makeChannel(init.scale[2])],
        opacity: makeChannel(init.opacity),
        roughness: makeChannel(init.roughness),
        metalness: makeChannel(init.metalness),
        toonSteps: makeChannel(init.toonSteps),
        lightIntensity: makeChannel(init.lightIntensity),
        colorTempK: makeChannel(init.colorTempK),
        lookAtYawOffset: 0,
        lookAtPitchOffset: 0,
      });
    }
  }

  setReducedMotion(enabled: boolean): void {
    this.prefersReducedMotion = enabled;
    if (enabled) {
      for (const rt of this.runtimes.values()) {
        this.snapRuntimeToTargets(rt);
      }
    }
  }

  /** 사용자 또는 리더 이벤트(호버, 클릭, 스크롤, 커서 이동)를 상태 머신에 전달한다. */
  dispatchEvent(event: Interactive3dEventInput): void {
    if (event.type === "setState") {
      this.applyTargetState(event.entityId, event.stateId);
      return;
    }

    if (event.type === "pointerEnter" || event.type === "pointerLeave") {
      for (const rule of this.blueprint.triggers) {
        if (rule.kind === "onPointerHover" && rule.entityId === event.entityId) {
          this.applyTargetState(
            rule.entityId,
            event.type === "pointerEnter" ? rule.hoverStateId : rule.restStateId,
          );
        }
      }
      return;
    }

    if (event.type === "click") {
      for (const rule of this.blueprint.triggers) {
        if (rule.kind !== "onClick" || rule.entityId !== event.entityId || rule.stateIds.length === 0) {
          continue;
        }
        const rt = this.runtimes.get(rule.entityId);
        if (!rt) continue;
        if (rule.mode === "set") {
          this.applyTargetState(rule.entityId, rule.stateIds[0]!);
        } else if (rule.mode === "toggle") {
          const first = rule.stateIds[0]!;
          const second = rule.stateIds[1] ?? rt.spec.baseState.id;
          const next = rt.activeStateId === first ? second : first;
          this.applyTargetState(rule.entityId, next);
        } else {
          rt.clickCycleCursor = (rt.clickCycleCursor + 1) % rule.stateIds.length;
          this.applyTargetState(rule.entityId, rule.stateIds[rt.clickCycleCursor]!);
        }
      }
      return;
    }

    if (event.type === "scroll") {
      this.scrollRatio = clamp(event.ratio, 0, 1);
      for (const rule of this.blueprint.triggers) {
        if (rule.kind !== "onScrollRatio") continue;
        const rt = this.runtimes.get(rule.entityId);
        if (!rt) continue;
        const fromSnap = rt.stateMap.get(rule.fromStateId);
        const toSnap = rt.stateMap.get(rule.toStateId);
        if (!fromSnap || !toSnap) continue;
        const span = Math.max(1e-5, rule.endRatio - rule.startRatio);
        const t = clamp((this.scrollRatio - rule.startRatio) / span, 0, 1);
        this.applyBlendedTarget(rt, fromSnap, toSnap, t);
      }
      return;
    }

    if (event.type === "cursorMove") {
      this.cursorNdcX = clamp(event.ndcX, -1, 1);
      this.cursorNdcY = clamp(event.ndcY, -1, 1);
      for (const rule of this.blueprint.triggers) {
        if (rule.kind !== "onCursorLookAt") continue;
        const rt = this.runtimes.get(rule.entityId);
        if (!rt) continue;
        const ySign = rule.invertY ? -1 : 1;
        rt.lookAtYawOffset = this.cursorNdcX * rule.maxYawRad;
        rt.lookAtPitchOffset = this.cursorNdcY * rule.maxPitchRad * ySign;
        const activeSnap = rt.stateMap.get(rt.activeStateId) ?? rt.spec.baseState;
        rt.rot[0].target = activeSnap.transform.rotationEuler[0] + rt.lookAtPitchOffset;
        rt.rot[1].target = activeSnap.transform.rotationEuler[1] + rt.lookAtYawOffset;
        if (this.prefersReducedMotion) this.snapRuntimeToTargets(rt);
      }
    }
  }

  /** 고정 서브스텝 스프링 적분 및 바닥 충돌 바운스를 dtSec만큼 진행한다. */
  step(dtSec: number): readonly Interactive3dBounceEvent[] {
    const safeDt = clamp(dtSec, 0, 0.25);
    if (safeDt <= 0) return [];
    const newBounces: Interactive3dBounceEvent[] = [];

    if (this.prefersReducedMotion) {
      this.elapsedTimeSec += safeDt;
      for (const rt of this.runtimes.values()) {
        this.snapRuntimeToTargets(rt);
      }
      return newBounces;
    }

    const substeps = Math.max(1, Math.ceil(safeDt / MAX_SPRING_SUBSTEP_SEC));
    const h = safeDt / substeps;

    for (let s = 0; s < substeps; s += 1) {
      this.elapsedTimeSec += h;
      for (const rt of this.runtimes.values()) {
        const cfg = rt.spring;
        stepScalarSpring(rt.pos[0], cfg, h);
        stepScalarSpring(rt.pos[1], cfg, h);
        stepScalarSpring(rt.pos[2], cfg, h);

        // 바닥 충돌 & 탄성 바운스 트리거
        if (cfg.bouncePlaneY !== undefined && rt.pos[1].value < cfg.bouncePlaneY) {
          const impactSpeed = Math.abs(rt.pos[1].velocity);
          rt.pos[1].value = cfg.bouncePlaneY;
          const restitution = cfg.restitution ?? 0.55;
          if (rt.pos[1].velocity < -0.05) {
            rt.pos[1].velocity = -rt.pos[1].velocity * restitution;
            const ev: Interactive3dBounceEvent = {
              entityId: rt.spec.id,
              impactSpeed,
              planeY: cfg.bouncePlaneY,
              stepTimeSec: this.elapsedTimeSec,
            };
            newBounces.push(ev);
            this.bounceHistory.push(ev);
          } else {
            rt.pos[1].velocity = 0;
          }
        }

        stepScalarSpring(rt.rot[0], cfg, h);
        stepScalarSpring(rt.rot[1], cfg, h);
        stepScalarSpring(rt.rot[2], cfg, h);
        stepScalarSpring(rt.scale[0], cfg, h);
        stepScalarSpring(rt.scale[1], cfg, h);
        stepScalarSpring(rt.scale[2], cfg, h);
        stepScalarSpring(rt.opacity, cfg, h);
        stepScalarSpring(rt.roughness, cfg, h);
        stepScalarSpring(rt.metalness, cfg, h);
        stepScalarSpring(rt.toonSteps, cfg, h);
        stepScalarSpring(rt.lightIntensity, cfg, h);
        stepScalarSpring(rt.colorTempK, cfg, h);
      }
    }
    return newBounces;
  }

  getEntityPose(entityId: string): EvaluatedEntityPose {
    const rt = this.runtimes.get(entityId);
    if (!rt) {
      throw new Error(`알 수 없는 인터랙티브 3D 엔티티 ID: ${entityId}`);
    }
    const eps = rt.spring.restEpsilon;
    const channels: ScalarChannel[] = [
      ...rt.pos,
      ...rt.rot,
      ...rt.scale,
      rt.opacity,
      rt.roughness,
      rt.metalness,
      rt.toonSteps,
      rt.lightIntensity,
      rt.colorTempK,
    ];
    const settled = channels.every(
      (c) => Math.abs(c.value - c.target) <= eps && Math.abs(c.velocity) <= eps * 4,
    );

    return {
      entityId: rt.spec.id,
      activeStateId: rt.activeStateId,
      position: [rt.pos[0].value, rt.pos[1].value, rt.pos[2].value],
      rotationEuler: [rt.rot[0].value, rt.rot[1].value, rt.rot[2].value],
      scale: [rt.scale[0].value, rt.scale[1].value, rt.scale[2].value],
      opacity: clamp(rt.opacity.value, 0, 1),
      roughness: clamp(rt.roughness.value, 0, 1),
      metalness: clamp(rt.metalness.value, 0, 1),
      toonSteps: Math.max(1, Math.round(rt.toonSteps.value)),
      matcapId: rt.activeMatcapId,
      lightIntensity: Math.max(0, rt.lightIntensity.value),
      colorTempK: clamp(rt.colorTempK.value, 1800, 12000),
      settled,
    };
  }

  getBounceHistory(): readonly Interactive3dBounceEvent[] {
    return this.bounceHistory;
  }

  isAllSettled(): boolean {
    for (const id of this.runtimes.keys()) {
      if (!this.getEntityPose(id).settled) return false;
    }
    return true;
  }

  reset(): void {
    this.elapsedTimeSec = 0;
    this.scrollRatio = 0;
    this.cursorNdcX = 0;
    this.cursorNdcY = 0;
    this.bounceHistory.length = 0;
    for (const rt of this.runtimes.values()) {
      rt.clickCycleCursor = 0;
      rt.lookAtYawOffset = 0;
      rt.lookAtPitchOffset = 0;
      this.applyTargetState(rt.spec.id, rt.spec.baseState.id);
      this.snapRuntimeToTargets(rt);
    }
  }

  private applyTargetState(entityId: string, stateId: string): void {
    const rt = this.runtimes.get(entityId);
    if (!rt) return;
    const snap = rt.stateMap.get(stateId);
    if (!snap) return;
    rt.activeStateId = snap.id;
    const vals = resolveSnapshotValues(rt.spec.baseState, snap);
    rt.activeMatcapId = vals.matcapId;
    rt.pos[0].target = vals.pos[0];
    rt.pos[1].target = vals.pos[1];
    rt.pos[2].target = vals.pos[2];
    rt.rot[0].target = vals.rot[0] + rt.lookAtPitchOffset;
    rt.rot[1].target = vals.rot[1] + rt.lookAtYawOffset;
    rt.rot[2].target = vals.rot[2];
    rt.scale[0].target = vals.scale[0];
    rt.scale[1].target = vals.scale[1];
    rt.scale[2].target = vals.scale[2];
    rt.opacity.target = vals.opacity;
    rt.roughness.target = vals.roughness;
    rt.metalness.target = vals.metalness;
    rt.toonSteps.target = vals.toonSteps;
    rt.lightIntensity.target = vals.lightIntensity;
    rt.colorTempK.target = vals.colorTempK;
    if (this.prefersReducedMotion) this.snapRuntimeToTargets(rt);
  }

  private applyBlendedTarget(
    rt: EntityRuntime,
    fromSnap: Interactive3dStateSnapshot,
    toSnap: Interactive3dStateSnapshot,
    t: number,
  ): void {
    const a = resolveSnapshotValues(rt.spec.baseState, fromSnap);
    const b = resolveSnapshotValues(rt.spec.baseState, toSnap);
    const lerp = (x: number, y: number): number => x + (y - x) * t;
    rt.activeStateId = t >= 0.5 ? toSnap.id : fromSnap.id;
    rt.activeMatcapId = t >= 0.5 ? b.matcapId : a.matcapId;
    for (let i = 0; i < 3; i += 1) {
      rt.pos[i]!.target = lerp(a.pos[i]!, b.pos[i]!);
      rt.scale[i]!.target = lerp(a.scale[i]!, b.scale[i]!);
    }
    rt.rot[0].target = lerp(a.rot[0], b.rot[0]) + rt.lookAtPitchOffset;
    rt.rot[1].target = lerp(a.rot[1], b.rot[1]) + rt.lookAtYawOffset;
    rt.rot[2].target = lerp(a.rot[2], b.rot[2]);
    rt.opacity.target = lerp(a.opacity, b.opacity);
    rt.roughness.target = lerp(a.roughness, b.roughness);
    rt.metalness.target = lerp(a.metalness, b.metalness);
    rt.toonSteps.target = lerp(a.toonSteps, b.toonSteps);
    rt.lightIntensity.target = lerp(a.lightIntensity, b.lightIntensity);
    rt.colorTempK.target = lerp(a.colorTempK, b.colorTempK);
    if (this.prefersReducedMotion) this.snapRuntimeToTargets(rt);
  }

  private snapRuntimeToTargets(rt: EntityRuntime): void {
    const channels: ScalarChannel[] = [
      ...rt.pos,
      ...rt.rot,
      ...rt.scale,
      rt.opacity,
      rt.roughness,
      rt.metalness,
      rt.toonSteps,
      rt.lightIntensity,
      rt.colorTempK,
    ];
    for (const ch of channels) {
      ch.value = ch.target;
      ch.velocity = 0;
    }
  }
}

export function serializeInteractive3dBlueprint(blueprint: Interactive3dSceneBlueprint): string {
  return JSON.stringify(blueprint);
}

export function deserializeInteractive3dBlueprint(json: string): Interactive3dSceneBlueprint {
  const parsed = JSON.parse(json) as Partial<Interactive3dSceneBlueprint>;
  if (
    !parsed ||
    parsed.version !== INTERACTIVE_3D_STATE_SCHEMA_VERSION ||
    !Array.isArray(parsed.entities) ||
    !Array.isArray(parsed.triggers)
  ) {
    throw new Error("유효하지 않은 인터랙티브 3D 블루프린트 JSON 형식입니다.");
  }
  return parsed as Interactive3dSceneBlueprint;
}
