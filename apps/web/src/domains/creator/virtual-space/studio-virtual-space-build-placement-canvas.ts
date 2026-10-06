/**
 * 빌드 모드 직접 배치 캔버스 컨트롤러 (VS 120 웨이브 4 B 후속).
 *
 * 페이지가 브리지에 세션을 열면(beginBuildPlacement) 이 컨트롤러가 캔버스
 * 입력의 주인이 된다: 포인터 이동으로 고스트를 조준하고, 찍으면 판정
 * (studioBuildPlacementVerdict)에 따라 확정 이벤트나 거부 이벤트를 페이지로
 * 보낸다. 우클릭·Esc는 취소다. 배치 중이 아닐 때는 어떤 입력도 가로채지
 * 않으므로 기존 이동·상호작용 동작은 그대로다.
 *
 * 키보드만으로도 끝낼 수 있다: 방향키·WASD로 고스트를 격자 단위로 옮기고
 * (누르고 있으면 반복 이동), Enter·Space로 확정, R로 회전, Esc로 취소한다.
 * 아바타 이동 입력 억제는 캔버스 본체가 이 컨트롤러의 active를 보고 맡는다.
 *
 * 확정은 연속 배치를 유지한다(같은 가구를 이어서 놓을 수 있다). 방금 확정한
 * 지점은 페이지 상태가 돌아오기 전에도 세션 점유 목록에 쌓아 이중 배치를 막는다.
 */
import type * as Phaser from "phaser";

import {
  studioBuildPlacementGhostFrame,
  studioBuildPlacementVerdict,
  type StudioBuildPlacementEvent,
  type StudioBuildPlacementVerdict,
} from "./studio-virtual-space-build-placement";
import {
  StudioBuildPlacementGhostRenderer,
  type StudioBuildGhostBadgeColors,
} from "./studio-virtual-space-build-ghost-renderer";
import {
  studioBuildCatalogEntryById,
  type StudioBuildPlacementRequest,
} from "./studio-virtual-space-build-mode";
import type { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

/** 키보드 조준 1칸(px) — 배치 격자와 같다. */
const NUDGE_STEP = 16;
/** 키를 누르고 있을 때 반복 이동이 시작되는 지연(ms). */
const NUDGE_REPEAT_DELAY_MS = 300;
/** 반복 이동 간격(ms). */
const NUDGE_REPEAT_INTERVAL_MS = 90;
/** 거부 직후 흔들림 버스트 길이(ms). */
const REJECT_BURST_MS = 320;
/** R 회전이 도는 각도 단계. 배치 요청의 회전 타입과 같은 집합이다. */
const ROTATION_STEPS = [0, 90, 180, 270] as const;

const NUDGE_KEYS: readonly { readonly codes: readonly string[]; readonly dx: number; readonly dy: number }[] = Object.freeze([
  { codes: ["ArrowLeft", "KeyA"], dx: -NUDGE_STEP, dy: 0 },
  { codes: ["ArrowRight", "KeyD"], dx: NUDGE_STEP, dy: 0 },
  { codes: ["ArrowUp", "KeyW"], dx: 0, dy: -NUDGE_STEP },
  { codes: ["ArrowDown", "KeyS"], dx: 0, dy: NUDGE_STEP },
]);

export interface StudioBuildPlacementCanvasHooks {
  readonly bridge: StudioVirtualSpaceEngineBridge;
  /** 캔버스 본체가 유지하는 눌린 키 집합(방향키·WASD 조준용). */
  readonly heldKeys: ReadonlySet<string>;
  readonly badgeColors: StudioBuildGhostBadgeColors;
  /** 꾸미기가 반영된 내비게이션 월드. */
  readonly getWorld: () => StudioVirtualSpaceWorldManifest;
  /** 이미 놓인 지점(배치 디스크립터 + 꾸미기 배치). */
  readonly getOccupiedPoints: () => readonly StudioVirtualSpacePoint[];
  readonly getPlacedCount: () => number;
  readonly getSelfPoint: () => StudioVirtualSpacePoint;
  readonly isInputBlocked: () => boolean;
  readonly reducedMotion: () => boolean;
  readonly translate: (ko: string, en: string) => string;
  readonly emit: (event: StudioBuildPlacementEvent) => void;
  /** 세션이 시작될 때(아바타 이동 비우기 등 캔버스 쪽 정리). */
  readonly onSessionStart?: () => void;
}

interface NudgeKeyState {
  pressedAt: number;
  lastStepAt: number;
}

export class StudioBuildPlacementCanvasController {
  private readonly renderer: StudioBuildPlacementGhostRenderer;
  private readonly canvasElement: HTMLCanvasElement | null;
  private entryId: string | null = null;
  /** 캔버스에서 취소한 세션 — 페이지가 세션을 닫기 전까지 다시 열지 않는다. */
  private suppressedEntryId: string | null = null;
  private ghostPoint: StudioVirtualSpacePoint = { x: 0, y: 0 };
  private rotationIndex = 0;
  private verdictSignature: string | null = null;
  private readonly sessionPlacedPoints: StudioVirtualSpacePoint[] = [];
  private readonly nudgeStates = new Map<string, NudgeKeyState>();
  private rejectedAt: number | null = null;
  private lastTime = 0;
  private destroyed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly hooks: StudioBuildPlacementCanvasHooks,
  ) {
    this.renderer = new StudioBuildPlacementGhostRenderer(scene, hooks.badgeColors, hooks.translate);
    this.canvasElement = scene.game.canvas;
    scene.input.on("pointermove", this.onPointerMove);
    this.canvasElement?.addEventListener("keydown", this.onCanvasKeyDown);
    this.canvasElement?.addEventListener("contextmenu", this.onContextMenu);
  }

  /** 배치 세션이 켜져 있는가. 캔버스 본체가 아바타 입력 억제 판단에 쓴다. */
  get active(): boolean {
    return this.entryId !== null;
  }

  /** 프레임마다 캔버스 본체가 부른다. */
  update(time: number, input: { readonly canvasFocused: boolean }): void {
    if (this.destroyed) return;
    this.lastTime = Number.isFinite(time) ? time : 0;
    this.syncSession();
    if (!this.entryId) return;
    if (input.canvasFocused) this.processNudges(this.lastTime);
    const verdict = this.evaluate();
    if (!verdict) return;
    const frame = studioBuildPlacementGhostFrame({
      entryId: this.entryId,
      ok: verdict.ok,
      now: this.lastTime,
      reducedMotion: this.hooks.reducedMotion(),
    });
    this.renderer.show({
      point: verdict.point,
      rotation: ROTATION_STEPS[this.rotationIndex] ?? 0,
      frame,
      burstShakeX: this.rejectBurstShake(this.lastTime),
    });
  }

  /**
   * 캔버스 pointerdown의 첫 줄에서 부른다. 배치 중이면 입력을 소비하고
   * true를 돌려준다(좌클릭·터치=확정 시도, 우클릭=취소). 배치 중이 아니면
   * false — 기존 이동 처리가 그대로 이어진다.
   */
  consumePointerDown(pointer: Phaser.Input.Pointer): boolean {
    if (!this.entryId) return false;
    if (this.hooks.isInputBlocked()) return true;
    if (pointer.rightButtonDown()) {
      this.cancelSession();
      return true;
    }
    if (!pointer.leftButtonDown() && !pointer.wasTouch) return true;
    this.ghostPoint = { x: pointer.worldX, y: pointer.worldY };
    const verdict = this.evaluate();
    if (!verdict) return true;
    if (verdict.ok) this.confirmCurrent(verdict);
    else this.rejectCurrent(verdict);
    return true;
  }

  /** Esc 처리. 배치 중이었으면 취소하고 true를 돌려준다. */
  handleEscape(): boolean {
    if (!this.entryId) return false;
    this.cancelSession();
    return true;
  }

  destroy(): void {
    this.destroyed = true;
    this.scene.input.off("pointermove", this.onPointerMove);
    this.canvasElement?.removeEventListener("keydown", this.onCanvasKeyDown);
    this.canvasElement?.removeEventListener("contextmenu", this.onContextMenu);
    this.renderer.destroy();
  }

  private readonly onPointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (!this.entryId || this.hooks.isInputBlocked()) return;
    this.ghostPoint = { x: pointer.worldX, y: pointer.worldY };
    this.evaluate();
  };

  private readonly onCanvasKeyDown = (event: KeyboardEvent): void => {
    if (!this.entryId || event.repeat) return;
    if (event.code === "KeyR") {
      this.rotationIndex = (this.rotationIndex + 1) % ROTATION_STEPS.length;
      return;
    }
    if (event.code !== "Enter" && event.code !== "Space" && event.code !== "NumpadEnter") return;
    if (this.hooks.isInputBlocked()) return;
    event.preventDefault();
    const verdict = this.evaluate();
    if (!verdict) return;
    if (verdict.ok) this.confirmCurrent(verdict);
    else this.rejectCurrent(verdict);
  };

  private readonly onContextMenu = (event: Event): void => {
    if (this.entryId) event.preventDefault();
  };

  private syncSession(): void {
    const wanted = this.hooks.bridge.getBuildPlacementEntryId();
    if (!wanted) {
      // 페이지가 세션을 닫으면 캔버스 쪽 취소 억제도 함께 풀린다.
      this.suppressedEntryId = null;
      if (this.entryId) this.endSession();
      return;
    }
    if (wanted === this.entryId) return;
    if (wanted === this.suppressedEntryId) {
      // 캔버스에서 취소한 세션 — 페이지가 닫기 전까지는 다시 열지 않는다.
      if (this.entryId) this.endSession();
      return;
    }
    this.startSession(wanted);
  }

  private startSession(entryId: string): void {
    this.entryId = entryId;
    const self = this.hooks.getSelfPoint();
    this.ghostPoint = { x: self.x, y: self.y + NUDGE_STEP * 3 };
    this.rotationIndex = 0;
    this.sessionPlacedPoints.length = 0;
    this.nudgeStates.clear();
    this.rejectedAt = null;
    this.verdictSignature = null;
    this.hooks.onSessionStart?.();
  }

  private endSession(): void {
    this.entryId = null;
    this.verdictSignature = null;
    this.renderer.hide();
  }

  private cancelSession(): void {
    this.suppressedEntryId = this.entryId;
    this.hooks.emit(Object.freeze({ type: "cancelled" as const }));
    this.endSession();
  }

  /** 현재 고스트 지점의 판정을 계산한다. 판정 서명이 바뀔 때만 페이지로 알린다. */
  private evaluate(): StudioBuildPlacementVerdict | null {
    const entryId = this.entryId;
    if (!entryId) return null;
    const occupied = [...this.hooks.getOccupiedPoints(), ...this.sessionPlacedPoints];
    const placedCount = this.hooks.getPlacedCount() + this.sessionPlacedPoints.length;
    const verdict = studioBuildPlacementVerdict({
      world: this.hooks.getWorld(),
      entryId,
      point: this.ghostPoint,
      occupied,
      placedCount,
    });
    this.ghostPoint = verdict.point;
    const signature = `${entryId}|${verdict.point.x},${verdict.point.y}|${verdict.ok}|${verdict.reason ?? ""}|${placedCount}`;
    if (signature !== this.verdictSignature) {
      this.verdictSignature = signature;
      this.hooks.emit(Object.freeze({ type: "verdict" as const, verdict }));
    }
    return verdict;
  }

  private confirmCurrent(verdict: StudioBuildPlacementVerdict): void {
    const entryId = this.entryId;
    const entry = entryId ? studioBuildCatalogEntryById(entryId) : null;
    // decor 항목은 배치 요청이 될 수 없다(판정에서 이미 invalid로 걸러진다).
    if (!entryId || !entry || entry.category === "decor") return;
    const request: StudioBuildPlacementRequest = Object.freeze({
      entryId,
      category: entry.category,
      refId: entry.refId,
      point: verdict.point,
      rotation: ROTATION_STEPS[this.rotationIndex] ?? 0,
    });
    this.sessionPlacedPoints.push(verdict.point);
    this.rejectedAt = null;
    this.hooks.emit(Object.freeze({ type: "confirm" as const, request }));
    this.evaluate();
  }

  private rejectCurrent(verdict: StudioBuildPlacementVerdict): void {
    this.rejectedAt = this.lastTime;
    this.hooks.emit(Object.freeze({
      type: "rejected" as const,
      reason: verdict.reason ?? "invalid",
    }));
  }

  private processNudges(now: number): void {
    for (const nudge of NUDGE_KEYS) {
      const code = nudge.codes.find((candidate) => this.hooks.heldKeys.has(candidate));
      if (!code) {
        for (const candidate of nudge.codes) this.nudgeStates.delete(candidate);
        continue;
      }
      const state = this.nudgeStates.get(code);
      if (!state) {
        this.stepGhost(nudge.dx, nudge.dy);
        this.nudgeStates.set(code, { pressedAt: now, lastStepAt: now });
      } else if (now - state.pressedAt >= NUDGE_REPEAT_DELAY_MS && now - state.lastStepAt >= NUDGE_REPEAT_INTERVAL_MS) {
        this.stepGhost(nudge.dx, nudge.dy);
        state.lastStepAt = now;
      }
    }
  }

  private stepGhost(dx: number, dy: number): void {
    this.ghostPoint = { x: this.ghostPoint.x + dx, y: this.ghostPoint.y + dy };
    this.evaluate();
  }

  private rejectBurstShake(now: number): number {
    if (this.rejectedAt === null || this.hooks.reducedMotion()) return 0;
    const elapsed = now - this.rejectedAt;
    if (elapsed < 0 || elapsed > REJECT_BURST_MS) return 0;
    return Math.sin(elapsed / 28) * 3 * (1 - elapsed / REJECT_BURST_MS);
  }
}

/** 캔버스 본체가 만드는 진입점 — 컨트롤러 생성만 노출한다. */
export function createStudioBuildPlacementCanvasController(
  scene: Phaser.Scene,
  hooks: StudioBuildPlacementCanvasHooks,
): StudioBuildPlacementCanvasController {
  return new StudioBuildPlacementCanvasController(scene, hooks);
}
