/**
 * 스트로크 세션: pointerdown ~ pointerup 사이의 dab을 한 레이어에 스탬프하고
 * 타일 스냅샷을 공유해 **1 스트로크 = 1 undo 토큰**으로 끝낸다.
 * SHAPER 호환 브러시/지우개 모드(`toolMode`) 및 좌우 대칭 그리기(`symmetry`)를 함께 지원한다.
 */
import { applyUndoToken, createTileSnapshotSet, eraseDab, mirrorDabHorizontal, stampDab, toUndoToken } from "./paint-layer";
import { pressureBrush } from "./paint-pressure";
import { interpolateDabs } from "./uv-stroke";

import type { BrushDab, BrushSettings, PaintUndoToken } from "../contracts";
import type { MutablePaintLayer } from "./paint-layer";
import type { PaintPressureMode } from "./paint-pressure";

export type PaintToolMode = "brush" | "eraser";

export function isPaintToolMode(value: string): value is PaintToolMode {
  return value === "brush" || value === "eraser";
}

export interface StrokeSessionOptions {
  readonly wrap?: boolean;
  readonly pressureMode?: PaintPressureMode;
  readonly toolMode?: PaintToolMode;
  readonly symmetry?: boolean;
}

export interface StrokeSession {
  readonly layer: MutablePaintLayer;
  readonly brush: BrushSettings;
  /** 스탬프한 dab 수 */
  readonly dabCount: number;
  readonly ended: boolean;
  /** 첫 dab을 즉시 스탬프한다. */
  begin(dab: BrushDab): void;
  /** 마지막 입력점에서 새 입력점까지 보간해 스탬프하고 스탬프한 dab 수를 돌려준다. */
  extend(dab: BrushDab): number;
  /** 스트로크를 닫고 병합된 undo 토큰 하나를 돌려준다(두 번 호출하면 throw). */
  end(): PaintUndoToken;
}

export function createStrokeSession(layer: MutablePaintLayer, brush: BrushSettings, options: StrokeSessionOptions = {}): StrokeSession {
  const wrap = options.wrap ?? true;
  const pressureMode = options.pressureMode ?? "constant";
  const toolMode = options.toolMode ?? "brush";
  const symmetry = options.symmetry ?? false;
  const snapshots = createTileSnapshotSet(layer);
  let last: BrushDab | null = null;
  let carry = 0;
  let dabCount = 0;
  let ended = false;
  const dabs: BrushDab[] = [];

  const applySingle = (targetDab: BrushDab, nextBrush: BrushSettings): void => {
    const effectiveDab = { ...targetDab, pressure: pressureMode === "fake" ? 1 : targetDab.pressure };
    if (toolMode === "eraser") {
      eraseDab(layer, effectiveDab, nextBrush, { wrap, snapshots });
    } else {
      stampDab(layer, effectiveDab, nextBrush, { wrap, snapshots });
    }
  };

  const stamp = (dab: BrushDab, finalProgress?: number): void => {
    const mode = pressureMode === "fake" && finalProgress === undefined ? "constant" : pressureMode;
    const nextBrush = pressureBrush(brush, mode, dab.pressure, finalProgress);
    if (nextBrush.radiusPx <= 1e-6) return;
    applySingle(dab, nextBrush);
    if (symmetry && Math.abs(dab.u - 0.5) * layer.width >= 0.5) {
      applySingle(mirrorDabHorizontal(dab, wrap), nextBrush);
    }
  };

  const assertOpen = (): void => {
    if (ended) throw new Error("끝난 스트로크 세션에는 dab을 추가할 수 없습니다.");
  };

  return {
    layer,
    brush,
    get dabCount() {
      return dabCount;
    },
    get ended() {
      return ended;
    },
    begin(dab) {
      assertOpen();
      if (last) throw new Error("begin은 스트로크당 한 번만 호출합니다.");
      if (pressureMode === "fake") dabs.push(dab);
      stamp(dab);
      dabCount += 1;
      last = dab;
      carry = 0;
    },
    extend(dab) {
      assertOpen();
      if (!last) {
        this.begin(dab);
        return 1;
      }
      const result = interpolateDabs(last, dab, brush, layer, { wrap, carry });
      for (const next of result.dabs) {
        if (pressureMode === "fake") dabs.push(next);
        stamp(next);
      }
      dabCount += result.dabs.length;
      carry = result.carry;
      last = dab;
      return result.dabs.length;
    },
    end() {
      if (ended) throw new Error("스트로크 세션은 한 번만 끝낼 수 있습니다.");
      ended = true;
      if (pressureMode === "fake" && dabs.length > 2) {
        // 경로 끝을 알게 된 시점에 미리보기를 복원한 뒤 실제 sin 두께로 다시 찍는다.
        applyUndoToken(layer, toUndoToken(snapshots));
        dabs.forEach((dab, index) => stamp(dab, index / (dabs.length - 1)));
      }
      return toUndoToken(snapshots);
    },
  };
}
