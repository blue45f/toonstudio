// Screen Wake Lock — 긴 열람·작화 세션에서 화면이 꺼지지 않게 붙잡는 얇은 래퍼.
//
// 지원: Chrome/Edge 84+, Safari 16.4+, Firefox 126+(부분). 미지원이거나 권한·정책으로
// 거부되면 조용히 null을 돌려준다 — 실험 기능이라 대체 동작을 만들지 않는다.
// 센티넬은 탭이 숨겨지면 브라우저가 자동 해제하므로, 재획득은 호출자(훅)가
// visibilitychange에 맞춰 담당한다.

interface WakeLockSentinelLike {
  readonly released: boolean;
  release(): Promise<void>;
}

interface WakeLockLike {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
}

type NavigatorLike = Record<string, unknown>;

function wakeLockApi(): WakeLockLike | null {
  try {
    if (typeof navigator === "undefined") return null;
    const candidate = (navigator as unknown as NavigatorLike)["wakeLock"] as
      | Partial<WakeLockLike>
      | undefined;
    if (!candidate || typeof candidate.request !== "function") return null;
    return candidate as WakeLockLike;
  } catch {
    // navigator 접근 자체가 막힌 환경 — 미지원과 동일하게 취급한다.
    return null;
  }
}

export function isScreenWakeLockSupported(): boolean {
  return wakeLockApi() !== null;
}

export interface ScreenWakeLockLease {
  /** 붙잡고 있는 동안 true. 브라우저가 자동 해제한 뒤에도 값은 그대로일 수 있어, 최종 확인은 isActive()로 한다. */
  isActive(): boolean;
  release(): Promise<void>;
}

/**
 * 화면 유지 락을 획득한다. 미지원·거부·실패 시 null (던지지 않는다).
 * 반환된 lease는 반드시 release()로 정리한다.
 */
export async function acquireScreenWakeLock(): Promise<ScreenWakeLockLease | null> {
  const api = wakeLockApi();
  if (!api) return null;
  try {
    const sentinel = await api.request("screen");
    let releasedByUs = false;
    return {
      isActive() {
        return !releasedByUs && !sentinel.released;
      },
      async release() {
        if (releasedByUs) return;
        releasedByUs = true;
        try {
          await sentinel.release();
        } catch {
          // 이미 해제된 센티넬의 재해제는 의미가 없다 — 정리 실패로 전파하지 않는다.
        }
      },
    };
  } catch {
    // 거부(문서 비활성·정책)는 실패가 아니라 "이 환경에서는 안 됨"이다.
    return null;
  }
}
