import type { RawSample } from "../../core/types";

/**
 * 입력 단계(RawStage): `InputPipeline`(Sumi 1€) **앞에서** 원시 표본(`RawSample`)을 변환하는 교체 가능한 단계.
 *
 * 구조(그리기 화면 기준):
 *
 *   포인터 캡처 → [압력 시뮬레이션] → RawStage 체인(끈 당김·물리 펜 …, 코너 게이트로 감쌀 수 있다)
 *       → 레인 `addSamples` → StrokePipeline 안의 `InputPipeline`(Sumi 1€ = '기본 경로')
 *
 * Sumi 1€는 단계가 아니다: 레인 안쪽 `StrokePipeline`이 항상 거치는 기본 경로이고, 단계는 그 입력 표본을 미리 바꾼다.
 * 그래서 '끈 당김'·'물리 펜'을 고르면 앱은 1€ 슬라이더를 0(사실상 raw, `stabilizer-map.ts`)으로 두어 두 평활이 겹치지 않게 한다.
 *
 * 계약(모든 단계가 지킨다):
 * - 입력은 시각 비감소 순서다. 한 획은 `down` → `move`* → `up`이며 `down`을 받으면 단계는 스스로 초기화한다.
 * - `predicted`(표시 전용 예측) 표본은 상태를 바꾸지 않고 그대로 통과시킨다.
 * - `apply`는 입력 배열을 바꾸지 않고 새 배열을 돌려준다(표본 객체도 복사본).
 * - `up`을 받은 단계는 그 표본을 즉시 내보내지 않고 **보류해도 된다**. 보류했다면 `flush()`가 획 끝 마무리 표본(따라잡기·정착)과
 *   마지막 `up` 표본을 돌려준다. 어느 쪽이든 `apply`+`flush`의 전체 출력은 `up`으로 끝나고 `up`은 정확히 하나다.
 *   `up`을 받지 못했거나 이미 flush한 단계의 `flush()`는 빈 배열이다.
 * - 출력 시각(`tMs`)은 비감소다. 획 끝 마무리는 시각을 입력 `up`보다 뒤로 늘릴 수 있다(획이 그만큼 길어진다).
 * - 모든 단계는 결정적이다: 같은 입력 열이면 비트 단위로 같은 출력(난수·시계·전역 상태 없음).
 */
export interface RawStage {
  /** 안정된 식별자(영문 kebab-case). 체인은 `a>b` 형태로 합성한다. */
  readonly id: string;
  /** 사용자에게 보이는 한글 이름. */
  readonly label: string;
  /** 표본 배열을 변환한다. 호출 사이의 상태(이전 표본·붓 위치 등)는 단계가 들고 있다. */
  apply(samples: readonly RawSample[]): RawSample[];
  /** 획 끝 마무리 표본(따라잡기·정착)과 마지막 `up` 표본. 보류한 `up`이 없으면 빈 배열. */
  flush(): RawSample[];
  /** 진행 중인 획을 버리고 처음 상태로 돌린다(abortStroke·pointercancel·레인 교체 때 부른다). */
  reset(): void;
}

/** 표본 하나의 얕은 복사에 위치·시각·단계를 덮어쓴 새 표본. 압력·기울기·포인터 종류는 원본을 따른다. */
export function withPosition(
  src: RawSample,
  x: number,
  y: number,
  tMs: number,
  phase: RawSample["phase"],
  over: Partial<RawSample> = {},
): RawSample {
  return { ...src, x, y, tMs, phase, ...over };
}

/** 표본 간격 중앙값 추정에 쓰는 기본 간격(ms): 240 Hz. 표본이 둘 미만일 때의 대체값. */
export const DEFAULT_SAMPLE_INTERVAL_MS = 1000 / 240;

/**
 * 간격으로 치는 최소값(ms). 이보다 짧은 시각 차(같은 프레임에 합쳐진 coalesced 표본·타이머 클램프·코너 게이트가 정점을 끼우며 만든
 * 미세 간격)는 표본 간격이 아니라 시각 잡음이라 무시한다. 무시하지 않으면 중앙값이 0.00025 ms가 되어 획 끝 따라잡기가 24만 표본을 만든다.
 */
export const MIN_SAMPLE_INTERVAL_MS = 0.5;

/**
 * 최근 표본 간격(ms)의 중앙값을 추적한다(고정 길이 원형 버퍼, 결정적). 획 끝 따라잡기의 표본 간격을 정하는 데 쓴다.
 * `MIN_SAMPLE_INTERVAL_MS` 미만의 간격은 기록하지 않는다.
 */
export class IntervalTracker {
  private readonly buf: number[] = [];
  private lastT: number | null = null;

  constructor(private readonly capacity = 32) {}

  reset(): void {
    this.buf.length = 0;
    this.lastT = null;
  }

  push(tMs: number): void {
    if (this.lastT !== null) {
      const d = tMs - this.lastT;
      if (d >= MIN_SAMPLE_INTERVAL_MS) {
        this.buf.push(d);
        if (this.buf.length > this.capacity) this.buf.shift();
      }
    }
    this.lastT = tMs;
  }

  /** 간격 중앙값(ms). 관측이 없으면 240 Hz 간격. */
  medianMs(): number {
    if (this.buf.length === 0) return DEFAULT_SAMPLE_INTERVAL_MS;
    const sorted = [...this.buf].sort((a, b) => a - b);
    return sorted[sorted.length >> 1] ?? DEFAULT_SAMPLE_INTERVAL_MS;
  }
}

/** smoothstep(0..1 가둠). 획 끝 따라잡기가 부드럽게 시작하고 끝나게 한다. */
export function smoothstep01(t: number): number {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return u * u * (3 - 2 * u);
}
