/**
 * 버전 공유 링크 비밀번호 무차별 대입 방어.
 *
 * 링크(토큰 해시)별로 비밀번호 실패를 세어, 창 안에 한도에 닿으면 창이 끝날 때까지 그 링크의 비밀번호
 * 검증을 막는다. 비밀번호를 시도하려면 링크 토큰을 먼저 알아야 하므로 잠금으로 방해할 수 있는 상대도
 * 링크 보유자로 한정된다. 프로세스 로컬 한도라 인스턴스가 여러 개면 인스턴스별로 적용된다.
 */
export const VERSION_SHARE_PASSWORD_MAX_FAILURES = 10;
export const VERSION_SHARE_PASSWORD_WINDOW_MS = 15 * 60 * 1000;

/** 실패가 기록된(=비밀번호가 걸린 실제 링크) 키만 쌓이므로 정상 운영에서는 이 상한에 닿지 않는다. */
const MAX_TRACKED_LINKS = 2_000;

interface FailureWindow {
  failures: number;
  endsAt: number;
}

export class VersionSharePasswordGuard {
  private readonly windows = new Map<string, FailureWindow>();

  /** 잠겨 있으면 풀릴 때까지 남은 초(올림), 잠겨 있지 않으면 0 이다. */
  lockedForSeconds(linkKey: string, now: number = Date.now()): number {
    const window = this.windows.get(linkKey);
    if (!window) return 0;
    if (window.endsAt <= now) {
      this.windows.delete(linkKey);
      return 0;
    }
    return window.failures >= VERSION_SHARE_PASSWORD_MAX_FAILURES
      ? Math.ceil((window.endsAt - now) / 1000)
      : 0;
  }

  recordFailure(linkKey: string, now: number = Date.now()): void {
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

  /** 올바른 비밀번호로 열렸으면 그 링크의 실패 기록을 지운다. */
  reset(linkKey: string): void {
    this.windows.delete(linkKey);
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
