import {
  JOB_STATUS,
  EVENT_TYPE,
  REJECT_REASON,
  isTerminalStatus,
  computeBackoffMs,
  cloneStateWith,
  recordIgnoredEvent,
  recordTransition,
  scheduleEligibleJobs,
  deepFreezeClone,
} from "./queueStateCore.mjs";

export function handleTerminalAndConfigEvents(state, event, nowMs, markEventProcessed) {
  switch (event.type) {
    case EVENT_TYPE.SUCCEED: {
      const targetJob = state.jobsById[event.jobId];
      if (!targetJob) {
        const ignoredEvents = recordIgnoredEvent(
          state,
          event,
          REJECT_REASON.JOB_NOT_FOUND,
          nowMs,
        );
        return Object.freeze({
          state: cloneStateWith(state, { nowMs, ignoredEvents }),
          effects: Object.freeze([]),
          outcome: Object.freeze({
            accepted: false,
            deduplicated: false,
            reason: REJECT_REASON.JOB_NOT_FOUND,
          }),
        });
      }

      if (targetJob.status === JOB_STATUS.SUCCEEDED) {
        const reason =
          event.runToken &&
          targetJob.completedRunTokens.includes(event.runToken)
            ? REJECT_REASON.DUPLICATE_COMPLETION
            : REJECT_REASON.ALREADY_TERMINAL;
        const ignoredEvents = recordIgnoredEvent(state, event, reason, nowMs);
        return Object.freeze({
          state: cloneStateWith(state, { nowMs, ignoredEvents }),
          effects: Object.freeze([]),
          outcome: Object.freeze({
            accepted: false,
            deduplicated: reason === REJECT_REASON.DUPLICATE_COMPLETION,
            reason,
            job: targetJob,
          }),
        });
      }

      if (isTerminalStatus(targetJob.status)) {
        const ignoredEvents = recordIgnoredEvent(
          state,
          event,
          REJECT_REASON.ALREADY_TERMINAL,
          nowMs,
        );
        return Object.freeze({
          state: cloneStateWith(state, { nowMs, ignoredEvents }),
          effects: Object.freeze([]),
          outcome: Object.freeze({
            accepted: false,
            deduplicated: false,
            reason: REJECT_REASON.ALREADY_TERMINAL,
            job: targetJob,
          }),
        });
      }

      if (targetJob.status !== JOB_STATUS.RUNNING) {
        const reason =
          event.runToken || typeof event.attempt === "number"
            ? REJECT_REASON.STALE_RUN_TOKEN
            : REJECT_REASON.INVALID_STATE_TRANSITION;
        const ignoredEvents = recordIgnoredEvent(state, event, reason, nowMs);
        return Object.freeze({
          state: cloneStateWith(state, { nowMs, ignoredEvents }),
          effects: Object.freeze([]),
          outcome: Object.freeze({
            accepted: false,
            deduplicated: false,
            reason,
            job: targetJob,
          }),
        });
      }

      if (event.runToken && event.runToken !== targetJob.activeRunToken) {
        const ignoredEvents = recordIgnoredEvent(
          state,
          event,
          REJECT_REASON.STALE_RUN_TOKEN,
          nowMs,
          { expectedRunToken: targetJob.activeRunToken },
        );
        return Object.freeze({
          state: cloneStateWith(state, { nowMs, ignoredEvents }),
          effects: Object.freeze([]),
          outcome: Object.freeze({
            accepted: false,
            deduplicated: false,
            reason: REJECT_REASON.STALE_RUN_TOKEN,
            job: targetJob,
          }),
        });
      }

      if (
        typeof event.attempt === "number" &&
        event.attempt !== targetJob.attempt
      ) {
        const ignoredEvents = recordIgnoredEvent(
          state,
          event,
          REJECT_REASON.STALE_ATTEMPT,
          nowMs,
          { expectedAttempt: targetJob.attempt },
        );
        return Object.freeze({
          state: cloneStateWith(state, { nowMs, ignoredEvents }),
          effects: Object.freeze([]),
          outcome: Object.freeze({
            accepted: false,
            deduplicated: false,
            reason: REJECT_REASON.STALE_ATTEMPT,
            job: targetJob,
          }),
        });
      }

      const completedRunToken = targetJob.activeRunToken;
      const updatedJob = Object.freeze({
        ...targetJob,
        status: JOB_STATUS.SUCCEEDED,
        activeRunToken: null,
        progress: 100,
        updatedAtMs: nowMs,
        completedAtMs: nowMs,
        result: deepFreezeClone(event.result ?? { ok: true }),
        completedRunTokens: Object.freeze([
          ...targetJob.completedRunTokens,
          completedRunToken,
        ]),
      });

      const processedEventIds = markEventProcessed(state.processedEventIds);
      const transitionLog = recordTransition(
        state,
        targetJob.jobId,
        JOB_STATUS.RUNNING,
        JOB_STATUS.SUCCEEDED,
        EVENT_TYPE.SUCCEED,
        nowMs,
        { attempt: targetJob.attempt, runToken: completedRunToken },
      );

      let nextState = cloneStateWith(state, {
        nowMs,
        processedEventIds,
        jobsById: Object.freeze({
          ...state.jobsById,
          [targetJob.jobId]: updatedJob,
        }),
        transitionLog,
      });

      let effects = [];
      if (event.autoDispatch !== false) {
        const scheduled = scheduleEligibleJobs(
          nextState,
          nowMs,
          EVENT_TYPE.SUCCEED,
        );
        nextState = scheduled.state;
        effects = scheduled.effects;
      }

      return Object.freeze({
        state: nextState,
        effects: Object.freeze(effects),
        outcome: Object.freeze({
          accepted: true,
          deduplicated: false,
          reason: REJECT_REASON.NONE,
          job: nextState.jobsById[targetJob.jobId],
        }),
      });
    }

    case EVENT_TYPE.FAIL: {
      const targetJob = state.jobsById[event.jobId];
      if (!targetJob) {
        const ignoredEvents = recordIgnoredEvent(
          state,
          event,
          REJECT_REASON.JOB_NOT_FOUND,
          nowMs,
        );
        return Object.freeze({
          state: cloneStateWith(state, { nowMs, ignoredEvents }),
          effects: Object.freeze([]),
          outcome: Object.freeze({
            accepted: false,
            deduplicated: false,
            reason: REJECT_REASON.JOB_NOT_FOUND,
          }),
        });
      }

      if (isTerminalStatus(targetJob.status)) {
        const ignoredEvents = recordIgnoredEvent(
          state,
          event,
          REJECT_REASON.ALREADY_TERMINAL,
          nowMs,
        );
        return Object.freeze({
          state: cloneStateWith(state, { nowMs, ignoredEvents }),
          effects: Object.freeze([]),
          outcome: Object.freeze({
            accepted: false,
            deduplicated: false,
            reason: REJECT_REASON.ALREADY_TERMINAL,
            job: targetJob,
          }),
        });
      }

      if (targetJob.status !== JOB_STATUS.RUNNING) {
        const reason =
          event.runToken || typeof event.attempt === "number"
            ? REJECT_REASON.STALE_RUN_TOKEN
            : REJECT_REASON.INVALID_STATE_TRANSITION;
        const ignoredEvents = recordIgnoredEvent(state, event, reason, nowMs);
        return Object.freeze({
          state: cloneStateWith(state, { nowMs, ignoredEvents }),
          effects: Object.freeze([]),
          outcome: Object.freeze({
            accepted: false,
            deduplicated: false,
            reason,
            job: targetJob,
          }),
        });
      }

      if (event.runToken && event.runToken !== targetJob.activeRunToken) {
        const ignoredEvents = recordIgnoredEvent(
          state,
          event,
          REJECT_REASON.STALE_RUN_TOKEN,
          nowMs,
          { expectedRunToken: targetJob.activeRunToken },
        );
        return Object.freeze({
          state: cloneStateWith(state, { nowMs, ignoredEvents }),
          effects: Object.freeze([]),
          outcome: Object.freeze({
            accepted: false,
            deduplicated: false,
            reason: REJECT_REASON.STALE_RUN_TOKEN,
            job: targetJob,
          }),
        });
      }

      if (
        typeof event.attempt === "number" &&
        event.attempt !== targetJob.attempt
      ) {
        const ignoredEvents = recordIgnoredEvent(
          state,
          event,
          REJECT_REASON.STALE_ATTEMPT,
          nowMs,
          { expectedAttempt: targetJob.attempt },
        );
        return Object.freeze({
          state: cloneStateWith(state, { nowMs, ignoredEvents }),
          effects: Object.freeze([]),
          outcome: Object.freeze({
            accepted: false,
            deduplicated: false,
            reason: REJECT_REASON.STALE_ATTEMPT,
            job: targetJob,
          }),
        });
      }

      const retryable = event.retryable !== false;
      const canRetry = retryable && targetJob.attempt < targetJob.maxAttempts;
      const errorRecord = Object.freeze({
        code: String(event.errorCode ?? "EXECUTION_ERROR"),
        message: String(event.errorMessage ?? "Job execution failed"),
        retryable,
        attempt: targetJob.attempt,
        runToken: targetJob.activeRunToken,
        atMs: nowMs,
      });

      const processedEventIds = markEventProcessed(state.processedEventIds);

      if (canRetry) {
        const backoffMs = computeBackoffMs(
          targetJob.attempt,
          targetJob.backoffPolicy,
          targetJob.jobId,
        );
        const nextEligibleAtMs = nowMs + backoffMs;
        const retryEntry = Object.freeze({
          ...errorRecord,
          backoffMs,
          nextEligibleAtMs,
        });

        const updatedJob = Object.freeze({
          ...targetJob,
          status: JOB_STATUS.QUEUED,
          activeRunToken: null,
          progress: 0,
          updatedAtMs: nowMs,
          nextEligibleAtMs,
          lastError: errorRecord,
          retryHistory: Object.freeze([...targetJob.retryHistory, retryEntry]),
        });

        const transitionLog = recordTransition(
          state,
          targetJob.jobId,
          JOB_STATUS.RUNNING,
          JOB_STATUS.QUEUED,
          EVENT_TYPE.FAIL,
          nowMs,
          {
            attempt: targetJob.attempt,
            backoffMs,
            nextEligibleAtMs,
            reason: "RETRY_SCHEDULED",
          },
        );

        let nextState = cloneStateWith(state, {
          nowMs,
          processedEventIds,
          jobsById: Object.freeze({
            ...state.jobsById,
            [targetJob.jobId]: updatedJob,
          }),
          transitionLog,
        });

        let effects = [
          Object.freeze({
            type: "SCHEDULE_RETRY_TIMER",
            jobId: targetJob.jobId,
            nextAttempt: targetJob.attempt + 1,
            backoffMs,
            dueAtMs: nextEligibleAtMs,
          }),
        ];

        if (event.autoDispatch !== false) {
          const scheduled = scheduleEligibleJobs(
            nextState,
            nowMs,
            EVENT_TYPE.FAIL,
          );
          nextState = scheduled.state;
          effects = [...effects, ...scheduled.effects];
        }

        return Object.freeze({
          state: nextState,
          effects: Object.freeze(effects),
          outcome: Object.freeze({
            accepted: true,
            deduplicated: false,
            reason: REJECT_REASON.NONE,
            retrying: true,
            backoffMs,
            nextEligibleAtMs,
            job: nextState.jobsById[targetJob.jobId],
          }),
        });
      }

      const failedJob = Object.freeze({
        ...targetJob,
        status: JOB_STATUS.FAILED,
        activeRunToken: null,
        updatedAtMs: nowMs,
        completedAtMs: nowMs,
        lastError: errorRecord,
        retryHistory: Object.freeze([
          ...targetJob.retryHistory,
          Object.freeze({
            ...errorRecord,
            backoffMs: null,
            nextEligibleAtMs: null,
          }),
        ]),
      });

      const transitionLog = recordTransition(
        state,
        targetJob.jobId,
        JOB_STATUS.RUNNING,
        JOB_STATUS.FAILED,
        EVENT_TYPE.FAIL,
        nowMs,
        {
          attempt: targetJob.attempt,
          retryable,
          reason: retryable ? "MAX_RETRIES_EXHAUSTED" : "NON_RETRYABLE_ERROR",
        },
      );

      let nextState = cloneStateWith(state, {
        nowMs,
        processedEventIds,
        jobsById: Object.freeze({
          ...state.jobsById,
          [targetJob.jobId]: failedJob,
        }),
        transitionLog,
      });

      let effects = [];
      if (event.autoDispatch !== false) {
        const scheduled = scheduleEligibleJobs(
          nextState,
          nowMs,
          EVENT_TYPE.FAIL,
        );
        nextState = scheduled.state;
        effects = scheduled.effects;
      }

      return Object.freeze({
        state: nextState,
        effects: Object.freeze(effects),
        outcome: Object.freeze({
          accepted: true,
          deduplicated: false,
          reason: REJECT_REASON.NONE,
          retrying: false,
          job: nextState.jobsById[targetJob.jobId],
        }),
      });
    }

    case EVENT_TYPE.CANCEL: {
      const targetJob = state.jobsById[event.jobId];
      if (!targetJob) {
        const ignoredEvents = recordIgnoredEvent(
          state,
          event,
          REJECT_REASON.JOB_NOT_FOUND,
          nowMs,
        );
        return Object.freeze({
          state: cloneStateWith(state, { nowMs, ignoredEvents }),
          effects: Object.freeze([]),
          outcome: Object.freeze({
            accepted: false,
            deduplicated: false,
            reason: REJECT_REASON.JOB_NOT_FOUND,
          }),
        });
      }

      if (isTerminalStatus(targetJob.status)) {
        const ignoredEvents = recordIgnoredEvent(
          state,
          event,
          REJECT_REASON.ALREADY_TERMINAL,
          nowMs,
        );
        return Object.freeze({
          state: cloneStateWith(state, { nowMs, ignoredEvents }),
          effects: Object.freeze([]),
          outcome: Object.freeze({
            accepted: false,
            deduplicated: false,
            reason: REJECT_REASON.ALREADY_TERMINAL,
            job: targetJob,
          }),
        });
      }

      const previousStatus = targetJob.status;
      const interruptedRunToken = targetJob.activeRunToken;
      const cancelledJob = Object.freeze({
        ...targetJob,
        status: JOB_STATUS.CANCELLED,
        activeRunToken: null,
        updatedAtMs: nowMs,
        completedAtMs: nowMs,
        cancelReason: String(event.reason ?? "USER_CANCELLED"),
      });

      const processedEventIds = markEventProcessed(state.processedEventIds);
      const transitionLog = recordTransition(
        state,
        targetJob.jobId,
        previousStatus,
        JOB_STATUS.CANCELLED,
        EVENT_TYPE.CANCEL,
        nowMs,
        { interruptedRunToken, cancelReason: cancelledJob.cancelReason },
      );

      let nextState = cloneStateWith(state, {
        nowMs,
        processedEventIds,
        jobsById: Object.freeze({
          ...state.jobsById,
          [targetJob.jobId]: cancelledJob,
        }),
        transitionLog,
      });

      let effects = [];
      if (previousStatus === JOB_STATUS.RUNNING && interruptedRunToken) {
        effects.push(
          Object.freeze({
            type: "ABORT_RUNNING_ATTEMPT",
            jobId: targetJob.jobId,
            runToken: interruptedRunToken,
            atMs: nowMs,
          }),
        );
      }

      if (event.autoDispatch !== false) {
        const scheduled = scheduleEligibleJobs(
          nextState,
          nowMs,
          EVENT_TYPE.CANCEL,
        );
        nextState = scheduled.state;
        effects = [...effects, ...scheduled.effects];
      }

      return Object.freeze({
        state: nextState,
        effects: Object.freeze(effects),
        outcome: Object.freeze({
          accepted: true,
          deduplicated: false,
          reason: REJECT_REASON.NONE,
          job: nextState.jobsById[targetJob.jobId],
        }),
      });
    }

    case EVENT_TYPE.SET_CONCURRENCY: {
      const nextLimit = Math.max(
        1,
        Math.floor(Number(event.maxConcurrency ?? 1)),
      );
      const processedEventIds = markEventProcessed(state.processedEventIds);
      let nextState = cloneStateWith(state, {
        nowMs,
        maxConcurrency: nextLimit,
        processedEventIds,
      });

      let effects = [];
      if (event.autoDispatch !== false) {
        const scheduled = scheduleEligibleJobs(
          nextState,
          nowMs,
          EVENT_TYPE.SET_CONCURRENCY,
        );
        nextState = scheduled.state;
        effects = scheduled.effects;
      }

      return Object.freeze({
        state: nextState,
        effects: Object.freeze(effects),
        outcome: Object.freeze({
          accepted: true,
          deduplicated: false,
          reason: REJECT_REASON.NONE,
          maxConcurrency: nextLimit,
        }),
      });
    }

    default: {
      const ignoredEvents = recordIgnoredEvent(
        state,
        event,
        REJECT_REASON.INVALID_ARGUMENT,
        nowMs,
      );
      return Object.freeze({
        state: cloneStateWith(state, { nowMs, ignoredEvents }),
        effects: Object.freeze([]),
        outcome: Object.freeze({
          accepted: false,
          deduplicated: false,
          reason: REJECT_REASON.INVALID_ARGUMENT,
        }),
      });
    }
  }
}
