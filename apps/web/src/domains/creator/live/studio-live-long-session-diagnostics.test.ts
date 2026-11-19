import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_HEARTBEAT_THROTTLE_THRESHOLD_MS,
  STUDIO_LIVE_AUTO_DEGRADE_FRAME_MS_THRESHOLD,
  STUDIO_LIVE_AUTO_DEGRADE_PEER_THRESHOLD,
  STUDIO_ROLLING_SUMMARY_WINDOW_MS,
  StudioAdaptiveSaveScheduler,
  StudioLiveHeartbeatJitterGuard,
  StudioLiveSessionRollingSummary,
  collectStudioLiveLongSessionDiagnostics,
  evaluateStudioLiveAutoDegrade,
  evaluateStudioStorageQuota,
  probeStudioStorageQuota,
  serializeStudioLiveDiagnosticsJson,
} from "./studio-live-long-session-diagnostics";
import { trimStudioLiveWetInkTileSurfacePoolForIdle } from "./studio-live-wet-ink-surface-pool";

import type { StudioWetInkBrushSurface } from "../brush/studio-wet-ink-brush-runtime";

describe("장시간 협업 진단", () => {

  it("collects 6-metric diagnostics JSON and defers autosave during active input under a strict maxWait cap", () => {
    const healthy = collectStudioLiveLongSessionDiagnostics({
      activeInkStrokes: 2,
      settledStrokeCount: 3,
      undoHistoryDepth: 42,
      outboxQueueSize: 0,
      p2pRelayFallbackPeers: 0,
      heapUsedMb: 184.5,
      now: () => 9_000_000,
    });
    expect(healthy.status).toBe("healthy");
    const parsed = JSON.parse(serializeStudioLiveDiagnosticsJson(healthy)) as Record<string, unknown>;
    expect(parsed.undoHistoryDepth).toBe(42);
    expect(parsed.heapUsedMb).toBe(184.5);

    const degraded = collectStudioLiveLongSessionDiagnostics({
      activeInkStrokes: 8,
      outboxQueueSize: 40,
      heapUsedMb: 812,
      now: () => 9_000_000,
    });
    expect(degraded.status).toBe("degraded");

    let now = 1_000;
    const timers: { id: number; run: () => void; dueAt: number }[] = [];
    let nextTimerId = 1;
    const onSave = vi.fn();
    const scheduler = new StudioAdaptiveSaveScheduler({
      idleDelayMs: 1_500,
      maxWaitMs: 10_000,
      onSave,
      now: () => now,
      setTimeout: (fn, delayMs) => {
        const entry = { id: nextTimerId++, run: fn, dueAt: now + delayMs };
        timers.push(entry);
        return entry.id;
      },
      clearTimeout: (handle) => {
        const index = timers.findIndex((entry) => entry.id === handle);
        if (index >= 0) timers.splice(index, 1);
      },
    });

    // Active local drawing defers idle save, but maxWait ceiling guarantees durability.
    scheduler.markLocalInputActive(true);
    scheduler.markDirty();
    expect(scheduler.hasPendingSave).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(0);
    expect(timers).toHaveLength(1);
    expect(timers[0]!.dueAt).toBe(11_000);

    // Trigger maxWait ceiling while user is still drawing continuously.
    now = 11_000;
    timers.shift()!.run();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(scheduler.hasPendingSave).toBe(false);

    // When local input pauses, idle timer fires promptly after idleDelayMs.
    scheduler.markDirty();
    scheduler.markLocalInputActive(false);
    const idleTimer = timers.find((entry) => entry.dueAt === 12_500);
    expect(idleTimer).toBeDefined();
    now = 12_500;
    idleTimer!.run();
    expect(onSave).toHaveBeenCalledTimes(2);
    scheduler.dispose();
  });

  it("auto-degrades remote stroke trails above peer or frame-budget thresholds and restores cleanly", () => {
    const normal = evaluateStudioLiveAutoDegrade({
      peerCount: STUDIO_LIVE_AUTO_DEGRADE_PEER_THRESHOLD,
      avgFrameMs: STUDIO_LIVE_AUTO_DEGRADE_FRAME_MS_THRESHOLD,
      userTrailsPreference: true,
    });
    expect(normal).toEqual({ effectiveShowTrails: true, degraded: false, reason: "none" });

    const crowded = evaluateStudioLiveAutoDegrade({
      peerCount: STUDIO_LIVE_AUTO_DEGRADE_PEER_THRESHOLD + 1,
      avgFrameMs: 8,
      userTrailsPreference: true,
    });
    expect(crowded).toEqual({ effectiveShowTrails: false, degraded: true, reason: "peer-count" });

    const slowFrame = evaluateStudioLiveAutoDegrade({
      peerCount: 2,
      avgFrameMs: STUDIO_LIVE_AUTO_DEGRADE_FRAME_MS_THRESHOLD + 2.5,
      userTrailsPreference: true,
    });
    expect(slowFrame).toEqual({ effectiveShowTrails: false, degraded: true, reason: "frame-budget" });

    const disabled = evaluateStudioLiveAutoDegrade({
      peerCount: 12,
      avgFrameMs: 24,
      autoDegradeEnabled: false,
      userTrailsPreference: true,
    });
    expect(disabled).toEqual({ effectiveShowTrails: true, degraded: false, reason: "none" });
  });

  it("evaluates storage quota thresholds safely and detects background heartbeat throttling without false NTP alarms", async () => {
    expect(evaluateStudioStorageQuota({ usageBytes: 400, quotaBytes: 1_000 }).status).toBe("ok");
    expect(evaluateStudioStorageQuota({ usageBytes: 860, quotaBytes: 1_000 }).status).toBe("warning");
    const critical = evaluateStudioStorageQuota({ usageBytes: 960, quotaBytes: 1_000 });
    expect(critical.status).toBe("critical");

    const probed = await probeStudioStorageQuota(async () => ({ usage: 900 * 1024 * 1024, quota: 1_000 * 1024 * 1024 }));
    expect(probed.status).toBe("warning");
    expect(probed.remainingMb).toBe(100);

    const failedProbe = await probeStudioStorageQuota(async () => {
      throw new Error("StorageManager blocked");
    });
    expect(failedProbe.status).toBe("unknown");

    const guard = new StudioLiveHeartbeatJitterGuard();
    let now = 10_000_000;
    expect(guard.recordTick(now).recommendedAction).toBe("none");
    now += 15_000;
    expect(guard.recordTick(now)).toMatchObject({ throttled: false, recommendedAction: "none" });
    // Backward NTP jump should clamp cleanly without triggering resync.
    now -= 90_000;
    expect(guard.recordTick(now)).toMatchObject({ throttled: false, jitterMs: 0, recommendedAction: "none" });
    // Background tab timer throttle exceeding threshold recommends immediate presence resync.
    now += STUDIO_HEARTBEAT_THROTTLE_THRESHOLD_MS + 15_000;
    expect(guard.recordTick(now)).toMatchObject({
      throttled: true,
      consecutiveThrottledTicks: 1,
      recommendedAction: "resync-presence",
    });
  });

  it("tracks 30-minute rolling QA telemetry and trims excess Wet Ink surfaces during idle soft-recycle", () => {
    const rolling = new StudioLiveSessionRollingSummary(STUDIO_ROLLING_SUMMARY_WINDOW_MS);
    let now = 30_000_000;
    rolling.recordReconnect(now);
    rolling.recordFrame(24, now);
    rolling.recordFrame(8, now);
    rolling.recordHeapSample(120, now);
    now += 10 * 60_000;
    rolling.recordHeapSample(124.5, now);
    const snap = rolling.snapshot(now);
    expect(snap.reconnectCount).toBe(1);
    expect(snap.slowFrameCount).toBe(1);
    expect(snap.heapDeltaMb).toBe(4.5);
    expect(snap.summaryLine).toContain("최근 30분");
    expect(snap.summaryLine).toContain("+4.5MB");

    now += STUDIO_ROLLING_SUMMARY_WINDOW_MS + 1_000;
    const aged = rolling.snapshot(now);
    expect(aged.reconnectCount).toBe(0);
    expect(aged.slowFrameCount).toBe(0);

    const pool = new Map<string, StudioWetInkBrushSurface[]>();
    pool.set(
      "256x256",
      Array.from({ length: 6 }, () => ({ width: 256, height: 256 }) as unknown as StudioWetInkBrushSurface),
    );
    const released = trimStudioLiveWetInkTileSurfacePoolForIdle(pool, 2);
    expect(released).toBe(4);
    expect(pool.get("256x256")).toHaveLength(2);
  });
});
