import type { ServerEventMessage } from "../../../../../deploy/cloudflare-realtime/src/protocol";

import type { StudioRealtimeConnectionRequest, StudioRealtimeWorkload } from "./studio-realtime-provider-protocol";

/**
 * Cloudflare 실시간 어댑터의 와이어↔로컬 시퀀스 투영.
 * 어댑터 본체에서 분리한 순수 상태 모듈이며 소켓·타이머에 의존하지 않는다.
 */

const MAX_PROJECTED_EVENTS = 4_096;

export interface ProjectedEventRecord {
  wireSequence: number;
  readonly workload: StudioRealtimeWorkload;
  readonly localSequence: string;
  readonly eventId: string;
  readonly idempotencyKey: string;
  readonly fingerprint: string;
}

export interface ProjectionResult {
  readonly record: ProjectedEventRecord;
  readonly duplicate: boolean;
}

export function canonicalFingerprint(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalFingerprint).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalFingerprint(record[key])}`,
    )
    .join(",")}}`;
}

export function sameSet<Value>(
  left: readonly Value[],
  right: readonly Value[],
): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function projectionLocalKey(
  workload: StudioRealtimeWorkload,
  localSequence: string,
  eventId: string,
): string {
  return `${workload}\u0000${localSequence}\u0000${eventId}`;
}

function projectionWireKey(
  workload: StudioRealtimeWorkload,
  wireSequence: number,
): string {
  return `${workload}\u0000${wireSequence}`;
}

export class StudioCloudflareSequenceProjection {
  private readonly recordByWire = new Map<string, ProjectedEventRecord>();
  private readonly recordByLocal = new Map<string, ProjectedEventRecord>();
  private readonly latestByWorkload = new Map<
    StudioRealtimeWorkload,
    ProjectedEventRecord
  >();
  private readonly nextLocal = new Map<StudioRealtimeWorkload, bigint>();
  private readonly baselineWireByWorkload = new Map<
    StudioRealtimeWorkload,
    number
  >();

  projectEvent(
    event: ServerEventMessage,
    randomId: () => string,
  ): ProjectionResult {
    const fingerprint = canonicalFingerprint(event);
    const key = projectionWireKey(event.channel, event.sequence);
    const existing = this.recordByWire.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new Error("Cloudflare 실시간 재생 이벤트가 기존 순서와 다릅니다.");
      }
      return { record: existing, duplicate: true };
    }
    const record = this.createRecord(
      event.channel,
      event.sequence,
      fingerprint,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
        event.idempotencyKey,
      )
        ? event.idempotencyKey
        : randomId(),
      randomId,
    );
    this.recordByWire.set(key, record);
    this.prune();
    return { record, duplicate: false };
  }

  projectSynthetic(
    workload: StudioRealtimeWorkload,
    wireSequence: number,
    fingerprint: string,
    randomId: () => string,
  ): ProjectedEventRecord {
    const record = this.createRecord(
      workload,
      wireSequence,
      fingerprint,
      randomId(),
      randomId,
    );
    this.prune();
    return record;
  }

  resumeAfter(
    request: StudioRealtimeConnectionRequest,
    workload: StudioRealtimeWorkload,
  ): number {
    const cursor = request.resume.find(
      (candidate) => candidate.workload === workload,
    );
    const baseline = this.baselineWireByWorkload.get(workload) ?? 0;
    if (!cursor) return baseline;
    const record = this.recordByLocal.get(
      projectionLocalKey(workload, cursor.serverSequence, cursor.eventId),
    );
    if (!record) {
      throw new Error("Cloudflare 실시간 재개 위치를 확인할 수 없습니다.");
    }
    return Math.max(record.wireSequence, baseline);
  }

  advanceWireFrontier(
    workload: StudioRealtimeWorkload,
    wireSequence: number,
  ): void {
    this.baselineWireByWorkload.set(
      workload,
      Math.max(
        this.baselineWireByWorkload.get(workload) ?? 0,
        wireSequence,
      ),
    );
    const latest = this.latestByWorkload.get(workload);
    if (latest && wireSequence > latest.wireSequence) {
      latest.wireSequence = wireSequence;
    }
  }

  fork(): StudioCloudflareSequenceProjection {
    const fork = new StudioCloudflareSequenceProjection();
    fork.replaceWith(this);
    return fork;
  }

  replaceWith(source: StudioCloudflareSequenceProjection): void {
    if (source === this) return;
    const clonedRecords = new Map<
      ProjectedEventRecord,
      ProjectedEventRecord
    >();
    const cloneRecord = (
      record: ProjectedEventRecord,
    ): ProjectedEventRecord => {
      const existing = clonedRecords.get(record);
      if (existing) return existing;
      const cloned = { ...record };
      clonedRecords.set(record, cloned);
      return cloned;
    };

    this.recordByWire.clear();
    for (const [key, record] of source.recordByWire) {
      this.recordByWire.set(key, cloneRecord(record));
    }
    this.recordByLocal.clear();
    for (const [key, record] of source.recordByLocal) {
      this.recordByLocal.set(key, cloneRecord(record));
    }
    this.latestByWorkload.clear();
    for (const [workload, record] of source.latestByWorkload) {
      this.latestByWorkload.set(workload, cloneRecord(record));
    }
    this.nextLocal.clear();
    for (const [workload, sequence] of source.nextLocal) {
      this.nextLocal.set(workload, sequence);
    }
    this.baselineWireByWorkload.clear();
    for (const [workload, sequence] of source.baselineWireByWorkload) {
      this.baselineWireByWorkload.set(workload, sequence);
    }
  }

  private createRecord(
    workload: StudioRealtimeWorkload,
    wireSequence: number,
    fingerprint: string,
    idempotencyKey: string,
    randomId: () => string,
  ): ProjectedEventRecord {
    const localSequence = this.nextLocal.get(workload) ?? BigInt(1);
    const record: ProjectedEventRecord = {
      wireSequence,
      workload,
      localSequence: localSequence.toString(),
      eventId: randomId(),
      idempotencyKey,
      fingerprint,
    };
    this.nextLocal.set(workload, localSequence + BigInt(1));
    this.recordByLocal.set(
      projectionLocalKey(workload, record.localSequence, record.eventId),
      record,
    );
    this.latestByWorkload.set(workload, record);
    return record;
  }

  private prune(): void {
    while (this.recordByWire.size > MAX_PROJECTED_EVENTS) {
      const oldestKey = this.recordByWire.keys().next().value;
      if (typeof oldestKey !== "string") break;
      const record = this.recordByWire.get(oldestKey);
      this.recordByWire.delete(oldestKey);
      if (
        record &&
        this.latestByWorkload.get(record.workload) !== record
      ) {
        this.recordByLocal.delete(
          projectionLocalKey(
            record.workload,
            record.localSequence,
            record.eventId,
          ),
        );
      }
    }
    while (this.recordByLocal.size > MAX_PROJECTED_EVENTS) {
      const oldestKey = this.recordByLocal.keys().next().value;
      if (typeof oldestKey !== "string") break;
      const record = this.recordByLocal.get(oldestKey);
      if (
        record &&
        this.latestByWorkload.get(record.workload) === record
      ) {
        this.recordByLocal.delete(oldestKey);
        this.recordByLocal.set(oldestKey, record);
        continue;
      }
      this.recordByLocal.delete(oldestKey);
    }
  }
}
