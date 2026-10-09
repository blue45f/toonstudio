import { lazyRadiusPxFromPct } from "../stabilizer-map";

import { IntervalTracker, smoothstep01, withPosition } from "./raw-stage";

import type { RawStage } from "./raw-stage";
import type { RawSample } from "../../core/types";

/**
 * 끈 당김(lazy-brush, pull-string) 입력 단계. 포인터와 붓 사이에 길이 `radiusPx`의 끈이 있다고 보고,
 * 포인터가 끈 길이 안에 있으면 붓은 움직이지 않고, 끈이 팽팽해지면(거리 > 길이) 붓이 포인터 쪽으로 끌려온다.
 * 결과: 손떨림이 끈 길이 안에서 흡수되고 획이 부드럽게 이어진다.
 *
 * 개념 출처: lazy-brush (dai-shi/lazy-brush, MIT)의 "brush가 pointer와 radius 이상 떨어질 때만 당겨진다"는 아이디어.
 * 코드는 가져오지 않았고 수식(거리 > 반경이면 붓 += (포인터 − 붓) · (1 − 반경/거리))을 독자적으로 재구현했다.
 *
 * 알려진 대가(SP-C 실측)와 이 단계의 대응:
 * - 반경만큼 **모서리를 깎는다**: 붓이 정점에 닿기 전에 방향이 바뀐다 → `createCornerGateStage`로 감싸 쓴다.
 * - 획이 포인터보다 **반경만큼 모자라게 끝난다**(길이가 줄어든다) → `flush()`가 붓을 포인터 `up` 위치까지 끌어다 놓는
 *   **획 끝 따라잡기(catch-up)** 표본을 낸다. 끄면(`catchUp: false`) 끝점이 반경만큼 짧다(비교 측정용으로만 둔다).
 *
 * 순수 상태기계다(시계·난수·DOM 전역 없음). 압력·기울기·단계는 그대로 두고 x, y(와 따라잡기 표본의 시각)만 바꾼다.
 */

export interface LazyBrushStageOptions {
  /** 끈 길이(px). 0이면 포인터를 그대로 따라간다. 음수·비유한 값은 0으로 본다. */
  radiusPx: number;
  /** 획 끝 따라잡기 사용 여부(기본 true). */
  catchUp?: boolean;
  /** 따라잡기에 쓰는 시간(ms, 기본 60). 표본 간격 중앙값으로 나눠 표본 수를 정한다. */
  catchUpMs?: number;
}

/** 끈 길이를 바꿀 수 있는 끈 당김 단계(진행 중인 획에도 즉시 적용된다). */
export interface LazyBrushStage extends RawStage {
  setRadius(radiusPx: number): void;
  setCatchUp(enabled: boolean): void;
}

/** 이 거리(px) 안이면 따라잡기가 필요 없다고 보고 `up` 표본 하나만 낸다. */
const CATCH_UP_EPS_PX = 0.05;
const DEFAULT_CATCH_UP_MS = 60;
/**
 * 획 끝 따라잡기 표본 수 상한. 표본 수는 round(따라잡기 시간 / 간격 중앙값)이라 간격이 극히 짧으면 수만 개가 되어 한 프레임 예산을 넘기는
 * 데다(획이 버려진다) 호출자의 배열 스프레드가 던졌다. 64개는 240 Hz에서 267 ms, 1 kHz에서 64 ms 분량이라 정상 입력은 상한에 닿지 않는다.
 * 상한에 닿으면 표본 수 대신 간격을 늘려(`catchUpMs / 64`) 따라잡기 총 시간은 유지한다.
 */
export const LAZY_CATCH_UP_MAX_STEPS = 64;

function sanitizeRadius(radiusPx: number): number {
  return Number.isFinite(radiusPx) && radiusPx > 0 ? radiusPx : 0;
}

export function createLazyBrushStage(opts: LazyBrushStageOptions): LazyBrushStage {
  let radius = sanitizeRadius(opts.radiusPx);
  let catchUp = opts.catchUp ?? true;
  const catchUpMs = opts.catchUpMs ?? DEFAULT_CATCH_UP_MS;
  let brush: { x: number; y: number } | null = null;
  let lastOut: RawSample | null = null;
  let heldUp: RawSample | null = null;
  const intervals = new IntervalTracker();

  const reset = (): void => {
    brush = null;
    lastOut = null;
    heldUp = null;
    intervals.reset();
  };

  const apply = (samples: readonly RawSample[]): RawSample[] => {
    const out: RawSample[] = [];
    for (const s of samples) {
      if (s.source === "predicted") {
        out.push({ ...s });
        continue;
      }
      if (s.phase === "down") reset();
      if (brush === null) {
        // 획을 시작하는 곳에 붓을 놓는다(끈은 처음엔 늘어져 있다).
        brush = { x: s.x, y: s.y };
      } else if (radius > 0) {
        const dx = s.x - brush.x;
        const dy = s.y - brush.y;
        const dist = Math.hypot(dx, dy);
        if (dist > radius) {
          const pull = 1 - radius / dist;
          brush = { x: brush.x + dx * pull, y: brush.y + dy * pull };
        }
      } else {
        brush = { x: s.x, y: s.y };
      }
      intervals.push(s.tMs);
      if (s.phase === "up") {
        // 끈이 있고 따라잡기를 켰으면 up을 보류하고 flush()가 마무리한다. 아니면 붓 위치로 바로 낸다.
        if (catchUp && radius > 0) {
          heldUp = s;
        } else {
          out.push(withPosition(s, brush.x, brush.y, s.tMs, "up"));
          reset();
        }
        continue;
      }
      const o = withPosition(s, brush.x, brush.y, s.tMs, s.phase);
      out.push(o);
      lastOut = o;
    }
    return out;
  };

  const flush = (): RawSample[] => {
    const up = heldUp;
    if (!up) return [];
    const from = brush ?? { x: up.x, y: up.y };
    const t0 = lastOut ? Math.max(lastOut.tMs, 0) : up.tMs;
    const dist = Math.hypot(up.x - from.x, up.y - from.y);
    const out: RawSample[] = [];
    if (dist <= CATCH_UP_EPS_PX) {
      out.push(withPosition(up, up.x, up.y, Math.max(t0, up.tMs), "up"));
    } else {
      const span = Number.isFinite(catchUpMs) && catchUpMs > 0 ? catchUpMs : DEFAULT_CATCH_UP_MS;
      const wanted = Math.max(2, Math.round(span / intervals.medianMs()));
      const steps = Math.min(wanted, LAZY_CATCH_UP_MAX_STEPS);
      const dt = wanted > LAZY_CATCH_UP_MAX_STEPS ? span / LAZY_CATCH_UP_MAX_STEPS : intervals.medianMs();
      for (let i = 1; i <= steps; i += 1) {
        const w = smoothstep01(i / steps);
        const isLast = i === steps;
        out.push(
          withPosition(
            up,
            isLast ? up.x : from.x + (up.x - from.x) * w,
            isLast ? up.y : from.y + (up.y - from.y) * w,
            t0 + dt * i,
            isLast ? "up" : "move",
          ),
        );
      }
    }
    reset();
    return out;
  };

  return {
    id: "lazy-brush",
    label: "끈 당김(lazy-brush)",
    apply,
    flush,
    reset,
    setRadius: (radiusPx) => {
      radius = sanitizeRadius(radiusPx);
    },
    setCatchUp: (enabled) => {
      catchUp = enabled;
    },
  };
}

/** 슬라이더(0..100, 로그 매핑 `lazyRadiusPxFromPct`)로 만드는 끈 당김 단계. */
export function createLazyBrushStageFromPct(pct: number, catchUp = true): LazyBrushStage {
  return createLazyBrushStage({ radiusPx: lazyRadiusPxFromPct(pct), catchUp });
}
