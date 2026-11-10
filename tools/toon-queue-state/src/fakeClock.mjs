/**
 * 결정론적 가상 시계 (FakeClock)
 * 실제 OS 타이머 대기 없이 가상 타임스탬프 전진만으로 재시도 backoff 및 실행 순서를 검증합니다.
 */

export class FakeClock {
  /**
   * @param {number} [initialMs=1700000000000]
   */
  constructor(initialMs = 1700000000000) {
    this._nowMs = Number(initialMs);
    this._nextTimerId = 1;
    this._timers = [];
  }

  now() {
    return this._nowMs;
  }

  setTimeout(callback, delayMs, meta = {}) {
    const id = this._nextTimerId++;
    const dueAtMs = this._nowMs + Math.max(0, Number(delayMs ?? 0));
    this._timers.push({
      id,
      dueAtMs,
      seq: id,
      callback,
      cancelled: false,
      meta,
    });
    return id;
  }

  clearTimeout(timerId) {
    for (const timer of this._timers) {
      if (timer.id === timerId) {
        timer.cancelled = true;
      }
    }
  }

  pendingTimerCount() {
    return this._timers.filter((t) => !t.cancelled).length;
  }

  advanceBy(deltaMs) {
    if (deltaMs < 0) {
      throw new Error("FakeClock.advanceBy requires non-negative deltaMs");
    }
    return this.advanceTo(this._nowMs + deltaMs);
  }

  advanceTo(targetMs) {
    if (targetMs < this._nowMs) {
      throw new Error("FakeClock.advanceTo cannot move time backwards");
    }

    while (true) {
      let earliest = null;
      for (const timer of this._timers) {
        if (timer.cancelled || timer.dueAtMs > targetMs) {
          continue;
        }
        if (
          !earliest ||
          timer.dueAtMs < earliest.dueAtMs ||
          (timer.dueAtMs === earliest.dueAtMs && timer.seq < earliest.seq)
        ) {
          earliest = timer;
        }
      }

      if (!earliest) {
        break;
      }

      earliest.cancelled = true;
      this._nowMs = earliest.dueAtMs;
      earliest.callback();
    }

    this._nowMs = targetMs;
    return this._nowMs;
  }
}
