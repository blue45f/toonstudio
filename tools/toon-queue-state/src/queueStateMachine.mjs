import {
  JOB_STATUS,
  TERMINAL_STATUSES,
  EVENT_TYPE,
  REJECT_REASON,
  DEFAULT_BACKOFF_POLICY,
  isTerminalStatus,
  hash32,
  deterministicUnitHash,
  stableFingerprint,
  computeBackoffMs,
  createInitialQueueState,
  cloneStateWith,
  recordIgnoredEvent,
  recordTransition,
  getRunningJobs,
  getEligibleQueuedJobs,
  scheduleEligibleJobs,
  deepFreezeClone,
  getQueueSnapshotSummary,
} from "./queueStateCore.mjs";
import { handleTerminalAndConfigEvents } from "./queueStateTerminalHandlers.mjs";

export {
  JOB_STATUS,
  TERMINAL_STATUSES,
  EVENT_TYPE,
  REJECT_REASON,
  DEFAULT_BACKOFF_POLICY,
  isTerminalStatus,
  hash32,
  deterministicUnitHash,
  stableFingerprint,
  computeBackoffMs,
  createInitialQueueState,
  getRunningJobs,
  getEligibleQueuedJobs,
  deepFreezeClone,
  getQueueSnapshotSummary,
};

export function transitionQueueState(state, event) {
  if (!event || typeof event.type !== "string") {
    return Object.freeze({
      state,
      effects: Object.freeze([]),
      outcome: Object.freeze({
        accepted: false,
        deduplicated: false,
        reason: REJECT_REASON.INVALID_ARGUMENT,
      }),
    });
  }

  const nowMs =
    typeof event.nowMs === "number" && Number.isFinite(event.nowMs)
      ? Math.max(state.nowMs, event.nowMs)
      : state.nowMs;

  // 1. 이벤트 ID 기반 멱등성 검사 (동일 eventId 중복 유입 차단)
  if (event.eventId) {
    if (
      Object.prototype.hasOwnProperty.call(
        state.processedEventIds,
        event.eventId,
      )
    ) {
      const ignoredEvents = recordIgnoredEvent(
        state,
        event,
        REJECT_REASON.DUPLICATE_EVENT_ID,
        nowMs,
      );
      return Object.freeze({
        state: cloneStateWith(state, { nowMs, ignoredEvents }),
        effects: Object.freeze([]),
        outcome: Object.freeze({
          accepted: false,
          deduplicated: true,
          reason: REJECT_REASON.DUPLICATE_EVENT_ID,
        }),
      });
    }
  }

  const markEventProcessed = (nextProcessedMap) => {
    if (!event.eventId) {
      return nextProcessedMap;
    }
    return Object.freeze({
      ...nextProcessedMap,
      [event.eventId]: nowMs,
    });
  };

  switch (event.type) {
    case EVENT_TYPE.ENQUEUE: {
      const jobId = String(event.jobId ?? "").trim();
      if (!jobId) {
        return Object.freeze({
          state: cloneStateWith(state, { nowMs }),
          effects: Object.freeze([]),
          outcome: Object.freeze({
            accepted: false,
            deduplicated: false,
            reason: REJECT_REASON.INVALID_ARGUMENT,
          }),
        });
      }

      const idempotencyKey = event.idempotencyKey
        ? String(event.idempotencyKey).trim()
        : `job:${jobId}`;
      const payload = deepFreezeClone(event.payload ?? {});
      const fingerprint = stableFingerprint(payload);

      const existingJobIdByKey = state.idempotencyIndex[idempotencyKey];
      const existingJob =
        (existingJobIdByKey && state.jobsById[existingJobIdByKey]) ||
        state.jobsById[jobId];

      if (existingJob) {
        if (
          existingJob.payloadFingerprint !== fingerprint ||
          (existingJobIdByKey && existingJobIdByKey !== jobId && event.jobId)
        ) {
          const ignoredEvents = recordIgnoredEvent(
            state,
            event,
            REJECT_REASON.IDEMPOTENCY_PAYLOAD_MISMATCH,
            nowMs,
            { idempotencyKey, existingJobId: existingJob.jobId },
          );
          return Object.freeze({
            state: cloneStateWith(state, { nowMs, ignoredEvents }),
            effects: Object.freeze([]),
            outcome: Object.freeze({
              accepted: false,
              deduplicated: false,
              reason: REJECT_REASON.IDEMPOTENCY_PAYLOAD_MISMATCH,
              job: existingJob,
            }),
          });
        }

        const processedEventIds = markEventProcessed(state.processedEventIds);
        const ignoredEvents = recordIgnoredEvent(
          state,
          event,
          REJECT_REASON.IDEMPOTENT_DUPLICATE,
          nowMs,
          { idempotencyKey, existingJobId: existingJob.jobId },
        );
        return Object.freeze({
          state: cloneStateWith(state, {
            nowMs,
            processedEventIds,
            ignoredEvents,
          }),
          effects: Object.freeze([]),
          outcome: Object.freeze({
            accepted: true,
            deduplicated: true,
            reason: REJECT_REASON.IDEMPOTENT_DUPLICATE,
            job: existingJob,
          }),
        });
      }

      const maxRetries =
        typeof event.maxRetries === "number"
          ? Math.max(0, Math.floor(event.maxRetries))
          : state.defaultMaxRetries;
      const priority =
        typeof event.priority === "number" ? Number(event.priority) : 0;
      const backoffPolicy = event.backoffPolicy
        ? Object.freeze({ ...state.backoffPolicy, ...event.backoffPolicy })
        : state.backoffPolicy;

      const newJob = Object.freeze({
        jobId,
        idempotencyKey,
        payload,
        payloadFingerprint: fingerprint,
        status: JOB_STATUS.QUEUED,
        priority,
        enqueueSeq: state.nextEnqueueSeq,
        attempt: 0,
        maxRetries,
        maxAttempts: maxRetries + 1,
        activeRunToken: null,
        progress: 0,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
        startedAtMs: null,
        completedAtMs: null,
        nextEligibleAtMs: nowMs,
        backoffPolicy,
        result: null,
        lastError: null,
        cancelReason: null,
        retryHistory: Object.freeze([]),
        completedRunTokens: Object.freeze([]),
      });

      const jobsById = Object.freeze({
        ...state.jobsById,
        [jobId]: newJob,
      });
      const jobOrder = Object.freeze([...state.jobOrder, jobId]);
      const idempotencyIndex = Object.freeze({
        ...state.idempotencyIndex,
        [idempotencyKey]: jobId,
      });
      const processedEventIds = markEventProcessed(state.processedEventIds);
      const transitionLog = recordTransition(
        state,
        jobId,
        null,
        JOB_STATUS.QUEUED,
        EVENT_TYPE.ENQUEUE,
        nowMs,
        { idempotencyKey },
      );

      let nextState = cloneStateWith(state, {
        nowMs,
        nextEnqueueSeq: state.nextEnqueueSeq + 1,
        jobsById,
        jobOrder,
        idempotencyIndex,
        processedEventIds,
        transitionLog,
      });

      const autoDispatch = event.autoDispatch !== false;
      let effects = [];
      if (autoDispatch) {
        const scheduled = scheduleEligibleJobs(
          nextState,
          nowMs,
          EVENT_TYPE.ENQUEUE,
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
          job: nextState.jobsById[jobId],
        }),
      });
    }

    case EVENT_TYPE.DISPATCH:
    case EVENT_TYPE.TICK: {
      const processedEventIds = markEventProcessed(state.processedEventIds);
      const baseState = cloneStateWith(state, { nowMs, processedEventIds });

      if (event.type === EVENT_TYPE.DISPATCH && event.jobId) {
        const targetJob = baseState.jobsById[event.jobId];
        if (!targetJob) {
          const ignoredEvents = recordIgnoredEvent(
            baseState,
            event,
            REJECT_REASON.JOB_NOT_FOUND,
            nowMs,
          );
          return Object.freeze({
            state: cloneStateWith(baseState, { ignoredEvents }),
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
            baseState,
            event,
            REJECT_REASON.ALREADY_TERMINAL,
            nowMs,
          );
          return Object.freeze({
            state: cloneStateWith(baseState, { ignoredEvents }),
            effects: Object.freeze([]),
            outcome: Object.freeze({
              accepted: false,
              deduplicated: false,
              reason: REJECT_REASON.ALREADY_TERMINAL,
            }),
          });
        }
        if (targetJob.status !== JOB_STATUS.QUEUED) {
          const ignoredEvents = recordIgnoredEvent(
            baseState,
            event,
            REJECT_REASON.INVALID_STATE_TRANSITION,
            nowMs,
          );
          return Object.freeze({
            state: cloneStateWith(baseState, { ignoredEvents }),
            effects: Object.freeze([]),
            outcome: Object.freeze({
              accepted: false,
              deduplicated: false,
              reason: REJECT_REASON.INVALID_STATE_TRANSITION,
            }),
          });
        }
        if (targetJob.nextEligibleAtMs > nowMs) {
          const ignoredEvents = recordIgnoredEvent(
            baseState,
            event,
            REJECT_REASON.BACKOFF_NOT_ELAPSED,
            nowMs,
          );
          return Object.freeze({
            state: cloneStateWith(baseState, { ignoredEvents }),
            effects: Object.freeze([]),
            outcome: Object.freeze({
              accepted: false,
              deduplicated: false,
              reason: REJECT_REASON.BACKOFF_NOT_ELAPSED,
            }),
          });
        }
        if (getRunningJobs(baseState).length >= baseState.maxConcurrency) {
          const ignoredEvents = recordIgnoredEvent(
            baseState,
            event,
            REJECT_REASON.CONCURRENCY_LIMIT_REACHED,
            nowMs,
          );
          return Object.freeze({
            state: cloneStateWith(baseState, { ignoredEvents }),
            effects: Object.freeze([]),
            outcome: Object.freeze({
              accepted: false,
              deduplicated: false,
              reason: REJECT_REASON.CONCURRENCY_LIMIT_REACHED,
            }),
          });
        }
      }

      const scheduled = scheduleEligibleJobs(baseState, nowMs, event.type);
      return Object.freeze({
        state: scheduled.state,
        effects: Object.freeze(scheduled.effects),
        outcome: Object.freeze({
          accepted: true,
          deduplicated: false,
          reason: REJECT_REASON.NONE,
          dispatchedJobIds: Object.freeze(scheduled.dispatchedJobIds),
        }),
      });
    }

    case EVENT_TYPE.PROGRESS: {
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
          }),
        });
      }
      if (targetJob.status !== JOB_STATUS.RUNNING) {
        const ignoredEvents = recordIgnoredEvent(
          state,
          event,
          REJECT_REASON.STALE_ATTEMPT,
          nowMs,
        );
        return Object.freeze({
          state: cloneStateWith(state, { nowMs, ignoredEvents }),
          effects: Object.freeze([]),
          outcome: Object.freeze({
            accepted: false,
            deduplicated: false,
            reason: REJECT_REASON.STALE_ATTEMPT,
          }),
        });
      }
      if (event.runToken && event.runToken !== targetJob.activeRunToken) {
        const ignoredEvents = recordIgnoredEvent(
          state,
          event,
          REJECT_REASON.STALE_RUN_TOKEN,
          nowMs,
        );
        return Object.freeze({
          state: cloneStateWith(state, { nowMs, ignoredEvents }),
          effects: Object.freeze([]),
          outcome: Object.freeze({
            accepted: false,
            deduplicated: false,
            reason: REJECT_REASON.STALE_RUN_TOKEN,
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
        );
        return Object.freeze({
          state: cloneStateWith(state, { nowMs, ignoredEvents }),
          effects: Object.freeze([]),
          outcome: Object.freeze({
            accepted: false,
            deduplicated: false,
            reason: REJECT_REASON.STALE_ATTEMPT,
          }),
        });
      }

      const clampedProgress = Math.min(
        100,
        Math.max(
          targetJob.progress,
          Number(event.progress ?? targetJob.progress),
        ),
      );
      const updatedJob = Object.freeze({
        ...targetJob,
        progress: clampedProgress,
        updatedAtMs: nowMs,
      });
      const processedEventIds = markEventProcessed(state.processedEventIds);
      return Object.freeze({
        state: cloneStateWith(state, {
          nowMs,
          processedEventIds,
          jobsById: Object.freeze({
            ...state.jobsById,
            [targetJob.jobId]: updatedJob,
          }),
        }),
        effects: Object.freeze([]),
        outcome: Object.freeze({
          accepted: true,
          deduplicated: false,
          reason: REJECT_REASON.NONE,
          job: updatedJob,
        }),
      });
    }

    default:
      return handleTerminalAndConfigEvents(state, event, nowMs, markEventProcessed);
  }
}
