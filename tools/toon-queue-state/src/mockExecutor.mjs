/**
 * 외부 API / 실제 이미지 생성 / 비용 발생이 전혀 없는 결정론적 MockExecutor 및 QueueHarness
 */

import {
  EVENT_TYPE,
  createInitialQueueState,
  transitionQueueState,
  getQueueSnapshotSummary,
} from "./queueStateMachine.mjs";

export class MockExecutor {
  /**
   * @param {import("./fakeClock.mjs").FakeClock} clock
   */
  constructor(clock) {
    this.clock = clock;
    this.scripts = new Map();
    this.executionHistory = [];
    this.abortedRunTokens = [];
    this._inFlightTimersByRunToken = new Map();
  }

  setJobScript(jobId, scriptOrFn) {
    this.scripts.set(jobId, scriptOrFn);
  }

  _resolveBehavior(effect) {
    const script = this.scripts.get(effect.jobId);
    if (typeof script === "function") {
      return script(effect);
    }
    if (Array.isArray(script) && script.length > 0) {
      const idx = Math.min(effect.attempt - 1, script.length - 1);
      return script[idx];
    }
    return {
      durationMs: 100,
      outcome: "succeed",
      result: {
        mockArtifactUri: `mock://toonstudio/panels/${effect.jobId}/attempt-${effect.attempt}.webp`,
        costUsd: 0,
      },
    };
  }

  handleEffects(effects, harness) {
    for (const effect of effects) {
      if (effect.type === "EXECUTE_JOB") {
        this._scheduleExecution(effect, harness);
      } else if (effect.type === "SCHEDULE_RETRY_TIMER") {
        this.clock.setTimeout(
          () => {
            harness.dispatch({
              type: EVENT_TYPE.TICK,
              nowMs: this.clock.now(),
            });
          },
          effect.backoffMs,
          { type: "RETRY_TICK", jobId: effect.jobId },
        );
      } else if (effect.type === "ABORT_RUNNING_ATTEMPT") {
        this.abortedRunTokens.push(effect.runToken);
        const timerInfo = this._inFlightTimersByRunToken.get(effect.runToken);
        if (timerInfo && timerInfo.cancelTimerOnAbort) {
          this.clock.clearTimeout(timerInfo.timerId);
          this._inFlightTimersByRunToken.delete(effect.runToken);
        }
      }
    }
  }

  _scheduleExecution(effect, harness) {
    const behavior = this._resolveBehavior(effect);
    const durationMs = Math.max(0, Number(behavior.durationMs ?? 100));
    const cancelTimerOnAbort = behavior.emitLateAfterCancel ? false : true;

    this.executionHistory.push({
      jobId: effect.jobId,
      attempt: effect.attempt,
      runToken: effect.runToken,
      startedAtMs: this.clock.now(),
      plannedOutcome: behavior.outcome ?? "succeed",
      durationMs,
    });

    if (Array.isArray(behavior.progressSteps)) {
      for (const step of behavior.progressSteps) {
        this.clock.setTimeout(
          () => {
            harness.dispatch({
              type: EVENT_TYPE.PROGRESS,
              jobId: effect.jobId,
              attempt: effect.attempt,
              runToken: effect.runToken,
              progress: step.progress,
              nowMs: this.clock.now(),
            });
          },
          step.atOffsetMs,
          { type: "PROGRESS", jobId: effect.jobId },
        );
      }
    }

    if (behavior.outcome === "hang") {
      return;
    }

    const fireCompletion = () => {
      if (behavior.outcome === "fail") {
        harness.dispatch({
          type: EVENT_TYPE.FAIL,
          jobId: effect.jobId,
          attempt: effect.attempt,
          runToken: effect.runToken,
          errorCode: behavior.errorCode ?? "MOCK_TRANSIENT_ERR",
          errorMessage: behavior.errorMessage ?? "Simulated mock failure",
          retryable: behavior.retryable !== false,
          nowMs: this.clock.now(),
        });
      } else {
        harness.dispatch({
          type: EVENT_TYPE.SUCCEED,
          jobId: effect.jobId,
          attempt: effect.attempt,
          runToken: effect.runToken,
          result: behavior.result ?? {
            mockArtifactUri: `mock://toonstudio/panels/${effect.jobId}/attempt-${effect.attempt}.webp`,
            costUsd: 0,
          },
          nowMs: this.clock.now(),
        });
      }
    };

    const timerId = this.clock.setTimeout(fireCompletion, durationMs, {
      type: "COMPLETE_ATTEMPT",
      jobId: effect.jobId,
      runToken: effect.runToken,
    });

    this._inFlightTimersByRunToken.set(effect.runToken, {
      timerId,
      cancelTimerOnAbort,
    });

    if (typeof behavior.duplicateCompleteAfterMs === "number") {
      this.clock.setTimeout(
        fireCompletion,
        durationMs + behavior.duplicateCompleteAfterMs,
        {
          type: "DUPLICATE_COMPLETE_ATTEMPT",
          jobId: effect.jobId,
          runToken: effect.runToken,
        },
      );
    }
  }
}

export class QueueHarness {
  constructor(options = {}) {
    this.clock = options.clock;
    this.executor = options.executor ?? new MockExecutor(this.clock);
    this.state = createInitialQueueState({
      maxConcurrency: options.maxConcurrency ?? 2,
      defaultMaxRetries: options.defaultMaxRetries ?? 3,
      backoffPolicy: options.backoffPolicy,
      initialNowMs: this.clock.now(),
    });
  }

  dispatch(event) {
    const enrichedEvent = {
      nowMs: this.clock.now(),
      ...event,
    };
    const transitionResult = transitionQueueState(this.state, enrichedEvent);
    this.state = transitionResult.state;
    if (transitionResult.effects.length > 0) {
      this.executor.handleEffects(transitionResult.effects, this);
    }
    return transitionResult;
  }

  getJob(jobId) {
    return this.state.jobsById[jobId] ?? null;
  }

  getSummary() {
    return getQueueSnapshotSummary(this.state);
  }
}
