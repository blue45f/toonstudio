import { Inject, Injectable } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { PostgresAdapter } from "@socket.io/postgres-adapter";

import { STUDIO_LIVE_REQUIRED_NAMESPACES } from "../../realtime/studio-postgres-pubsub";
import { StudioLiveGateway } from "../creator/studio-live.gateway";

import type { StudioLivePostgresListenerStatusProvider } from "../../realtime/studio-postgres-pubsub";

export const HEALTH_RUNTIME_READINESS = Symbol("HEALTH_RUNTIME_READINESS");

export const DEFAULT_CONTAINER_MEMORY_LIMIT_BYTES = 512 * 1024 * 1024;
export const ELEVATED_MEMORY_UTILIZATION_RATIO = 0.7;
export const CRITICAL_MEMORY_UTILIZATION_RATIO = 0.85;

export type ContainerMemoryPressureLevel = "normal" | "elevated" | "critical";

export interface ContainerMemoryPressureSnapshot {
  readonly level: ContainerMemoryPressureLevel;
  readonly rssBytes: number;
  readonly heapUsedBytes: number;
  readonly limitBytes: number;
  readonly utilizationRatio: number;
  readonly shedHeavyBackgroundWork: boolean;
}

export interface HealthRuntimeReadiness {
  isStudioLivePostgresNamespaceReady(): boolean;
  getContainerMemoryPressure?(
    limitBytes?: number,
  ): ContainerMemoryPressureSnapshot;
}

function sanitizeByteCount(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.floor(value);
}

export function evaluateContainerMemoryPressure(
  usage?: Pick<NodeJS.MemoryUsage, "rss" | "heapUsed"> | null,
  limitBytes: number = DEFAULT_CONTAINER_MEMORY_LIMIT_BYTES,
): ContainerMemoryPressureSnapshot {
  const resolvedUsage = usage ?? process.memoryUsage();
  const rssBytes = sanitizeByteCount(resolvedUsage.rss, 0);
  const heapUsedBytes = sanitizeByteCount(resolvedUsage.heapUsed, 0);
  const safeLimitBytes = Math.max(
    1,
    sanitizeByteCount(limitBytes, DEFAULT_CONTAINER_MEMORY_LIMIT_BYTES),
  );
  const effectiveUsedBytes = Math.max(rssBytes, heapUsedBytes);
  const utilizationRatio = Math.min(1, effectiveUsedBytes / safeLimitBytes);
  const level: ContainerMemoryPressureLevel =
    utilizationRatio >= CRITICAL_MEMORY_UTILIZATION_RATIO
      ? "critical"
      : utilizationRatio >= ELEVATED_MEMORY_UTILIZATION_RATIO
        ? "elevated"
        : "normal";

  return {
    level,
    rssBytes,
    heapUsedBytes,
    limitBytes: safeLimitBytes,
    utilizationRatio,
    shedHeavyBackgroundWork: level !== "normal",
  };
}

interface StudioLiveNamespaceLike {
  readonly name: string;
  readonly adapter: unknown;
}

export function isPostgresBackedStudioLiveNamespace(
  namespace: StudioLiveNamespaceLike | null | undefined,
): boolean {
  if (
    namespace?.name !== STUDIO_LIVE_REQUIRED_NAMESPACES[1] ||
    !(namespace.adapter instanceof PostgresAdapter)
  ) {
    return false;
  }
  const statusProvider =
    namespace.adapter as Partial<StudioLivePostgresListenerStatusProvider>;
  if (
    typeof statusProvider.getStudioLivePostgresListenerStatus !==
    "function"
  ) {
    return false;
  }
  try {
    const status =
      statusProvider.getStudioLivePostgresListenerStatus();
    return status === "active" || status === "reconnecting";
  } catch {
    return false;
  }
}

/**
 * The PostgreSQL adapter factory performs the expensive LISTEN/NOTIFY and attachment round-trip
 * preflight before the long-running server starts listening. Runtime readiness additionally
 * consumes the lifecycle-safe listener status, allowing a bounded transient reconnect grace but
 * rejecting stale reconnect loops and closed transports.
 */
@Injectable()
export class NestHealthRuntimeReadiness implements HealthRuntimeReadiness {
  constructor(
    @Inject(ModuleRef)
    private readonly moduleRef: ModuleRef,
  ) {}

  isStudioLivePostgresNamespaceReady(): boolean {
    try {
      const gateway = this.moduleRef.get(StudioLiveGateway, {
        strict: false,
      });
      return isPostgresBackedStudioLiveNamespace(gateway.server);
    } catch {
      return false;
    }
  }

  getContainerMemoryPressure(
    limitBytes: number = DEFAULT_CONTAINER_MEMORY_LIMIT_BYTES,
  ): ContainerMemoryPressureSnapshot {
    return evaluateContainerMemoryPressure(process.memoryUsage(), limitBytes);
  }
}
