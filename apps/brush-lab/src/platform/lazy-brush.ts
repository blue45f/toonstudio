import type { RawSample } from "../engine/core/types";

/**
 * 끈 당김(lazy-brush, pull-string) 입력 보정. 포인터와 붓 사이에 길이 `radiusPx`의 끈이 있다고 보고,
 * 포인터가 끈 길이 안에 있으면 붓은 움직이지 않고, 끈이 팽팽해지면(거리 > 길이) 붓이 포인터 쪽으로 끌려온다.
 * 결과: 손떨림이 끈 길이 안에서 흡수되고 획이 부드럽게 이어진다(대신 끝점이 포인터보다 약간 늦는다).
 *
 * 개념 출처: lazy-brush (dai-shi/lazy-brush, MIT) 의 "brush가 pointer와 radius 이상 떨어질 때만 당겨진다"는 아이디어.
 * 코드는 가져오지 않았고 이 구현은 수식(거리 > 반경이면 붓 += (포인터 − 붓) · (1 − 반경/거리))을 독자적으로 재구현했다.
 *
 * 순수 상태기계다(시계·난수·DOM 전역 없음). 펜 압력·기울기·시각·단계는 그대로 두고 x, y만 바꾼다.
 * 예측 표본(`source: "predicted"`)은 정본 상태를 바꾸지 않고 통과시킨다.
 */
export interface LazyBrush {
  /** 표본 배열을 변환한다(입력은 바꾸지 않고 복사본을 돌려준다). */
  apply(samples: readonly RawSample[]): RawSample[];
  /** 끈 길이(px)를 바꾼다. 진행 중인 획에도 즉시 적용된다. */
  setRadius(radiusPx: number): void;
  /** 획 상태를 초기화한다. */
  reset(): void;
}

export function createLazyBrush(initialRadiusPx: number): LazyBrush {
  let radius = Math.max(0, initialRadiusPx);
  let brush: { x: number; y: number } | null = null;

  const apply = (samples: readonly RawSample[]): RawSample[] => {
    const out: RawSample[] = [];
    for (const s of samples) {
      if (s.source === "predicted") {
        out.push(s);
        continue;
      }
      if (s.phase === "down" || brush === null) {
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
      out.push({ ...s, x: brush.x, y: brush.y });
      if (s.phase === "up") brush = null;
    }
    return out;
  };

  return {
    apply,
    setRadius: (radiusPx) => {
      radius = Math.max(0, radiusPx);
    },
    reset: () => {
      brush = null;
    },
  };
}
