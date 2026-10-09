import {
  CORNER_ANGLE_RAD,
  CornerDetector,
  CornerGuard,
  VERTEX_BACKFILL_MIN_SPEED_PX_PER_MS,
  vertexEmitTimeMs,
} from "../corner-preserve";

import type { RawStage } from "./raw-stage";
import type { RawSample } from "../../core/types";

/**
 * 코너 게이트(메타 단계): 지연형 단계(끈 당김·물리 펜 …)를 감싸 모서리를 살린다.
 *
 * 지연형 단계는 정점에 닿기 전에 방향이 바뀌므로 모서리를 깎는다(SP-C: 끈 당김은 반경만큼, 물리 펜은 지연 × 속도만큼).
 * 게이트는 원시 표본에서 모서리를 감지하면
 *  1. 직전 원시 정점을 **raw 좌표 그대로** 출력 경로에 방출하고(지연된 출력은 진입 변 위에 있으므로 정점으로의 직선 연결은 진입 변과 겹친다),
 *  2. 내부 단계를 그 정점에서 새 획처럼 다시 시작한 뒤(`reset` + 정점을 `down`으로 먹임),
 *  3. 현재 표본을 이어서 내부 단계에 먹인다.
 * 정점 방출 시각은 밀린 거리를 원시 속도로 따라잡는 시간으로 둔다(`vertexEmitTimeMs`: 두 출력 시각 사이 25~75 % 구간).
 *
 * 판정: 회전각 ≥ `cornerAngleRad`(기본 60°) **그리고** 직전 방향 일관성(`CornerDetector`)이고, 추가로 `CornerGuard`를 통과해야 한다:
 * 정점 직전 약 40 ms 창의 순변위 속도 ≥ 0.2 px/ms, 나가는 변 ≥ 위치 잡음 σ의 20배. 가드가 없으면 저속 손떨림이 모서리로 오탐돼
 * 정점 재시작이 지터를 오히려 악화시키고, 한 걸음 순간 속도로만 재면 240 Hz 이상의 잡음 입력(σ 0.25 px)에서도 오탐한다(40획 148회,
 * 끈 100이면 붓이 최대 48 px 튄다). 창 속도·변 길이 가드는 같은 입력과 정수 격자 계단 입력에서 오탐 0이고, 깨끗한 입력(σ ≈ 0)의
 * 모서리는 표본율(120 Hz~1 kHz)에 관계없이 잡는다(`input-robustness.test.ts`).
 * 정점을 끼울 두 출력 시각 사이가 0.5 ms 미만이면(같은 tMs 입력) 재시작하지 않는다(`vertexEmitTimeMs`가 `null`).
 *
 * 결정적 순수 상태기계다. `up`과 마무리(`flush`)는 내부 단계에 위임한다.
 */

export interface CornerGateOptions {
  /** 모서리 회전각 임계(rad, 기본 60°). 판정은 `CornerDetector`가 하며 이 값은 감지기 생성에 쓰인다. */
  cornerAngleRad?: number;
  /** 정점 직전 창 속도 가드(px/ms, 기본 0.2). */
  minSpeedPxPerMs?: number;
}

/** 모서리로 판정한 횟수를 읽을 수 있는 코너 게이트(오탐 점검·테스트용). */
export interface CornerGateStage extends RawStage {
  /** 현재 획에서 모서리로 판정해 재시작한 횟수. */
  readonly corners: number;
}

export function createCornerGateStage(inner: RawStage, opts: CornerGateOptions = {}): CornerGateStage {
  const minSpeed = opts.minSpeedPxPerMs ?? VERTEX_BACKFILL_MIN_SPEED_PX_PER_MS;
  const detector = new CornerDetector({ cornerAngleRad: opts.cornerAngleRad ?? CORNER_ANGLE_RAD });
  const guard = new CornerGuard<RawSample>();
  let lastOutT = Number.NEGATIVE_INFINITY;
  let lastOutPos: { x: number; y: number } | null = null;
  let corners = 0;

  const reset = (): void => {
    detector.reset();
    guard.reset();
    lastOutT = Number.NEGATIVE_INFINITY;
    lastOutPos = null;
    corners = 0;
    inner.reset();
  };

  /** 출력 시각을 비감소로 맞추고 마지막 출력 위치를 기록한다. */
  const emit = (list: readonly RawSample[]): RawSample[] => {
    const out: RawSample[] = [];
    for (const o of list) {
      if (o.source === "predicted") {
        out.push(o);
        continue;
      }
      const t = Math.max(o.tMs, lastOutT);
      lastOutT = t;
      lastOutPos = { x: o.x, y: o.y };
      out.push(t === o.tMs ? o : { ...o, tMs: t });
    }
    return out;
  };

  const apply = (samples: readonly RawSample[]): RawSample[] => {
    const out: RawSample[] = [];
    for (const s of samples) {
      if (s.source === "predicted") {
        for (const r of inner.apply([s])) out.push(r);
        continue;
      }
      if (s.phase === "down") reset();
      const verdict = s.phase === "up" ? null : detector.push(s);
      const anchor = verdict?.isCorner ? verdict.anchor : null;
      // 정점: 앵커~지금 표본 사이의 실제 꺾임점. 표본이 앵커 간격(0.75 px)보다 촘촘하면(저속·고주파 입력) 앵커와 다를 수 있다.
      const v = anchor !== null ? guard.pickVertex(anchor, s) : null;
      // 이 표본이 만든 내부 출력(정점 재방출 + 현재 표본). 표본마다 emit해야 다음 표본의 밀림 계산이 최신 출력 위치를 본다.
      const produced: RawSample[] = [];
      if (v !== null && s.phase === "move" && guard.approve(v, Math.hypot(s.x - v.x, s.y - v.y), minSpeed)) {
        const dtRaw = Math.max(1e-3, s.tMs - v.tMs);
        const rawSpeed = Math.hypot(s.x - v.x, s.y - v.y) / dtRaw;
        const lp = lastOutPos ?? { x: v.x, y: v.y };
        const backlog = Math.hypot(v.x - lp.x, v.y - lp.y);
        const t = vertexEmitTimeMs(Number.isFinite(lastOutT) ? lastOutT : v.tMs, s.tMs, backlog, rawSpeed);
        // t가 null이면 정점을 끼울 시각 구간이 없다(같은 tMs·역행): 재시작하지 않고 내부 단계를 그대로 잇는다.
        if (t !== null) {
          corners += 1;
          inner.reset();
          // 정점에서 내부 단계를 다시 시작한다. 첫 출력은 down이지만 경로 중간이므로 move로 낮춘다.
          for (const r of inner.apply([{ ...v, tMs: t, phase: "down" }])) produced.push({ ...r, phase: "move" });
        }
      }
      for (const r of inner.apply([s])) produced.push(r);
      if (s.phase !== "up") guard.record(s);
      for (const r of emit(produced)) out.push(r);
    }
    return out;
  };

  return {
    id: `corner-gate(${inner.id})`,
    label: `${inner.label} + 코너 게이트`,
    apply,
    flush: () => emit(inner.flush()),
    reset,
    get corners() {
      return corners;
    },
  };
}
