export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type BackoffStrategy = "exponential" | "linear" | "fixed";

export interface BackoffPolicy {
  readonly strategy: BackoffStrategy;
  readonly baseDelayMs: number;
  readonly factor: number;
  readonly maxDelayMs: number;
  readonly jitterRatio: number;
}

export interface RetryHistoryEntry {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly attempt: number;
  readonly runToken: string | null;
  readonly atMs: number;
  readonly backoffMs: number | null;
  readonly nextEligibleAtMs: number | null;
}

export interface QueueJob<TPayload = Record<string, unknown>, TResult = unknown> {
  readonly jobId: string;
  readonly idempotencyKey: string;
  readonly payload: Readonly<TPayload>;
  readonly payloadFingerprint: string;
  readonly status: JobStatus;
  readonly priority: number;
  readonly enqueueSeq: number;
  readonly attempt: number;
  readonly maxRetries: number;
  readonly maxAttempts: number;
  readonly activeRunToken: string | null;
  readonly progress: number;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly startedAtMs: number | null;
  readonly completedAtMs: number | null;
  readonly nextEligibleAtMs: number;
  readonly backoffPolicy: BackoffPolicy;
  readonly result: TResult | null;
  readonly lastError: RetryHistoryEntry | null;
  readonly cancelReason: string | null;
  readonly retryHistory: ReadonlyArray<RetryHistoryEntry>;
  readonly completedRunTokens: ReadonlyArray<string>;
}

export interface QueueState {
  readonly nowMs: number;
  readonly maxConcurrency: number;
  readonly defaultMaxRetries: number;
  readonly backoffPolicy: BackoffPolicy;
  readonly nextEnqueueSeq: number;
  readonly nextDispatchSeq: number;
  readonly jobsById: Readonly<Record<string, QueueJob>>;
  readonly jobOrder: ReadonlyArray<string>;
  readonly idempotencyIndex: Readonly<Record<string, string>>;
  readonly processedEventIds: Readonly<Record<string, number>>;
  readonly ignoredEvents: ReadonlyArray<Record<string, unknown>>;
  readonly transitionLog: ReadonlyArray<Record<string, unknown>>;
}

export declare function isTerminalStatus(status: string): boolean;
export declare function computeBackoffMs(
  failedAttemptNumber: number,
  policyInput?: Partial<BackoffPolicy>,
  jitterSeed?: string,
): number;
export declare function createInitialQueueState(options?: {
  maxConcurrency?: number;
  defaultMaxRetries?: number;
  backoffPolicy?: Partial<BackoffPolicy>;
  initialNowMs?: number;
}): QueueState;
export declare function transitionQueueState(
  state: QueueState,
  event: Record<string, unknown>,
): {
  readonly state: QueueState;
  readonly effects: ReadonlyArray<Record<string, unknown>>;
  readonly outcome: Readonly<Record<string, unknown>>;
};
