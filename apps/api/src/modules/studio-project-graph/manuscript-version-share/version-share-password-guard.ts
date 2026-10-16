/**
 * 버전 공유 링크 비밀번호 무차별 대입 방어.
 *
 * 링크(토큰 해시)별로 비밀번호 오답을 세어, 창 안에 한도에 닿으면 창이 끝날 때까지 그 링크의 비밀번호
 * 검증을 막는다. 비밀번호를 시도하려면 링크 토큰을 먼저 알아야 하므로 잠금으로 방해할 수 있는 상대도
 * 링크 보유자로 한정된다. 프로세스 로컬 한도라 인스턴스가 여러 개면 인스턴스별로 적용된다.
 *
 * 검증(DB 연결 + scrypt)은 await 를 거치므로 "잠겼는지 확인 → 검증 → 오답 기록" 순서로 쓰면 동시 요청이
 * 모두 확인을 통과해 한도를 우회한다. 그래서 검증 전에 시도를 먼저 선점(admit)한다. 선점은 확인과 증가를
 * 한 번의 동기 구간에서 하므로, 동시 요청이 몇 개든 한도를 넘는 요청은 검증 단계에 도달하지 못한다.
 * 선점한 시도는 판정이 끝나면 반드시 확정(fail)하거나 되돌려야(release) 한다.
 */
export const VERSION_SHARE_PASSWORD_MAX_FAILURES = 10;
export const VERSION_SHARE_PASSWORD_WINDOW_MS = 15 * 60 * 1000;

/**
 * 한도가 확정된 오답이 아니라 아직 판정 중인 시도 때문에 막힌 경우의 재시도 안내(초).
 * 판정 중인 시도는 곧 끝나므로 창 전체(15분)를 안내하지 않는다.
 */
const PENDING_RETRY_AFTER_SECONDS = 1;

/** 오답이 확정된(=비밀번호가 걸린 실제 링크) 키만 쌓이므로 정상 운영에서는 이 상한에 닿지 않는다. */
const MAX_TRACKED_LINKS = 2_000;

interface FailureWindow {
  failures: number;
  endsAt: number;
}

/** 선점한 시도 하나. fail/release 중 먼저 부른 쪽만 효력이 있고 이후 호출은 무시한다. */
export interface VersionSharePasswordAttempt {
  /** 비밀번호 오답으로 확정한다: 선점을 풀고 오답 횟수에 더한다. */
  fail(): void;
  /** 오답이 아니었던 시도(성공·링크 없음·회수·만료·저장소 오류)라 선점만 푼다. */
  release(): void;
}

/**
 * 선점 결과. 거절은 두 가지로 나뉜다: 확정된 오답이 한도에 닿은 "잠금"(창이 끝날 때까지, 최대 15분)과, 확정된 오답은
 * 한도 밑인데 판정 중인 시도가 자리를 채운 "일시 차단"(판정이 끝나는 1초 안팎). 사용자에게 줄 안내와 재시도 가능
 * 시점이 달라서 이유를 구분해 돌려준다.
 */
export type VersionSharePasswordAdmission =
  | { readonly admitted: true; readonly attempt: VersionSharePasswordAttempt }
  | { readonly admitted: false; readonly reason: "locked" | "busy"; readonly retryAfterSeconds: number };

export class VersionSharePasswordGuard {
  /** 링크별 확정된 오답 창. */
  private readonly windows = new Map<string, FailureWindow>();
  /**
   * 선점했지만 아직 판정되지 않은 시도 수. 오답 창과 따로 두는 이유: 없는 토큰으로 보낸 요청도 판정이
   * 끝나기 전까지는 선점하므로, 같은 표에 두면 없는 토큰을 대량으로 보내 오답 창(잠금)을 밀어낼 수 있다.
   * 판정이 끝나면 항목이 지워져 동시 요청 수 이상 쌓이지 않는다.
   */
  private readonly pending = new Map<string, number>();

  /**
   * 비밀번호 검증 전에 시도 하나를 선점한다. 확정된 오답과 판정 중인 시도의 합이 한도에 닿았으면 선점하지
   * 않고 풀릴 때까지 남은 초(올림)를 돌려준다.
   */
  admit(linkKey: string, now: number = Date.now()): VersionSharePasswordAdmission {
    const failures = this.activeFailures(linkKey, now);
    const pending = this.pending.get(linkKey) ?? 0;
    if (failures + pending < VERSION_SHARE_PASSWORD_MAX_FAILURES) {
      this.pending.set(linkKey, pending + 1);
      return { admitted: true, attempt: this.createAttempt(linkKey) };
    }
    const window = this.windows.get(linkKey);
    if (failures >= VERSION_SHARE_PASSWORD_MAX_FAILURES && window) {
      return { admitted: false, reason: "locked", retryAfterSeconds: Math.ceil((window.endsAt - now) / 1000) };
    }
    return { admitted: false, reason: "busy", retryAfterSeconds: PENDING_RETRY_AFTER_SECONDS };
  }

  /** 올바른 비밀번호로 열렸으면 그 링크의 오답 기록을 지운다. */
  reset(linkKey: string): void {
    this.windows.delete(linkKey);
  }

  private createAttempt(linkKey: string): VersionSharePasswordAttempt {
    let settled = false;
    const settle = (): boolean => {
      if (settled) return false;
      settled = true;
      const remaining = (this.pending.get(linkKey) ?? 0) - 1;
      if (remaining > 0) this.pending.set(linkKey, remaining);
      else this.pending.delete(linkKey);
      return true;
    };
    return {
      fail: () => {
        if (settle()) this.recordFailure(linkKey);
      },
      release: () => {
        settle();
      },
    };
  }

  /** 창이 끝났으면 지우고 0, 아니면 창 안의 확정된 오답 수. */
  private activeFailures(linkKey: string, now: number): number {
    const window = this.windows.get(linkKey);
    if (!window) return 0;
    if (window.endsAt <= now) {
      this.windows.delete(linkKey);
      return 0;
    }
    return window.failures;
  }

  private recordFailure(linkKey: string, now: number = Date.now()): void {
    const current = this.windows.get(linkKey);
    if (current && current.endsAt > now) {
      current.failures += 1;
      return;
    }
    this.prune(now);
    this.windows.set(linkKey, {
      failures: 1,
      endsAt: now + VERSION_SHARE_PASSWORD_WINDOW_MS,
    });
  }

  private prune(now: number): void {
    if (this.windows.size < MAX_TRACKED_LINKS) return;
    for (const [key, window] of this.windows) {
      if (window.endsAt <= now) this.windows.delete(key);
    }
    while (this.windows.size >= MAX_TRACKED_LINKS) {
      const oldest = this.windows.keys().next();
      if (oldest.done) break;
      this.windows.delete(oldest.value);
    }
  }
}
