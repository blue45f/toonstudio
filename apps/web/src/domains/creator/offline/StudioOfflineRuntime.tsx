import { useEffect } from "react";
import { creatorSub2StatusText } from "../status-i18n/studio-creator-sub2-status-i18n-r3c13b";

import {
  decideStudioOfflineAutomaticPreparation,
  publishStudioOfflineAutomation,
  type StudioOfflineAutomationSkipReason,
} from "./studio-offline-automation";
import { startStudioConnectivityRuntime } from "./studio-connectivity";
import {
  inspectStudioOfflineDevice,
  prepareLoadedStudioOfflineResources,
} from "./studio-offline-client";

const INPUT_QUIET_MS = 1_200;

function dataSaverEnabled(): boolean {
  try {
    return Boolean((navigator as Navigator & {
      readonly connection?: { readonly saveData?: boolean };
    }).connection?.saveData);
  } catch {
    return false;
  }
}
function scheduleDuringIdle(operation: () => Promise<void>): () => void {
  let active = true;
  let timer: number | undefined;
  let idle: number | undefined;
  let lastInput = performance.now();
  const pointers = new Set<number>();
  const listeners = new AbortController();
  const options = { capture: true, passive: true, signal: listeners.signal };

  function schedule(delay: number = INPUT_QUIET_MS): void {
    if (!active || timer !== undefined || idle !== undefined || pointers.size > 0) return;
    timer = window.setTimeout(() => {
      timer = undefined;
      if (typeof window.requestIdleCallback === "function") {
        idle = window.requestIdleCallback(tryStart, { timeout: 3_000 });
      } else {
        tryStart();
      }
    }, delay);
  }

  function tryStart(deadline?: IdleDeadline): void {
    idle = undefined;
    if (!active || pointers.size > 0) return;
    const remaining = INPUT_QUIET_MS - (performance.now() - lastInput);
    if (remaining > 0) schedule(remaining);
    else if (deadline && deadline.timeRemaining() <= 0) schedule();
    else {
      cancel();
      void operation();
    }
  }

  function noteInput(): void {
    lastInput = performance.now();
    schedule();
  }
  function hold(event: PointerEvent): void {
    pointers.add(event.pointerId);
  }
  function release(event: PointerEvent): void {
    pointers.delete(event.pointerId);
    noteInput();
  }
  function releaseAll(): void {
    pointers.clear();
    noteInput();
  }
  function cancel(): void {
    active = false;
    window.clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback?.(idle);
    listeners.abort();
  }
  window.addEventListener("pointerdown", hold, options);
  window.addEventListener("pointerup", release, options);
  window.addEventListener("pointercancel", release, options);
  window.addEventListener("blur", releaseAll, { signal: listeners.signal });
  window.addEventListener("keydown", noteInput, options);
  window.addEventListener("wheel", noteInput, options);
  schedule();
  return cancel;
}

function skippedMessage(reason: StudioOfflineAutomationSkipReason): string | null {
  if (reason === "data-saver") {
    return "데이터 절약 모드가 켜져 있어 오프라인 편집 도구의 자동 준비를 건너뛰었습니다.";
  }
  if (reason === "storage-pressure") {
    return "저장 공간이 부족해 오프라인 편집 도구의 자동 준비를 중지했습니다. 프로젝트 파일을 백업하고 공간을 확보해 주세요.";
  }
  return null;
}

/**
 * Keeps Studio app-like without a setup step. It prepares the bounded drawing pack in idle time,
 * retries after reconnection or worker replacement, and never touches manuscript persistence.
 */
export function StudioOfflineRuntime() {
  useEffect(() => {
    let disposed = false;
    let latestInspection = 0;
    let preparationInFlight = false;
    let retryAfterFlight = false;
    let attemptedBuildId: string | null = null;
    let cancelScheduled: (() => void) | null = null;
    const stopConnectivity = startStudioConnectivityRuntime();
    const inspectAndSchedule = async (allowRetry = false): Promise<void> => {
      cancelScheduled?.();
      cancelScheduled = null;
      const inspection = ++latestInspection;
      const device = await inspectStudioOfflineDevice();
      if (disposed || inspection !== latestInspection) return;
      const decision = decideStudioOfflineAutomaticPreparation({
        browserOnline: device.online,
        controlled: device.controlled,
        documentVisible: document.visibilityState !== "hidden",
        offlineReady: device.offlineReady,
        quota: device.quota,
        saveData: dataSaverEnabled(),
        supported: device.supported,
        usage: device.usage,
      });
      if (decision.action === "skip") {
        if (decision.reason === "already-ready") {
          publishStudioOfflineAutomation({
            phase: "ready",
            message: "현재 버전의 필수 편집 도구가 이 기기에 준비되어 있습니다.",
          });
        } else {
          const message = skippedMessage(decision.reason);
          if (message) publishStudioOfflineAutomation({ phase: "skipped", message });
        }
        return;
      }
      const buildId = device.buildId ?? "current";
      if (preparationInFlight) {
        retryAfterFlight ||= allowRetry;
        return;
      }
      if (!allowRetry && attemptedBuildId === buildId) return;
      cancelScheduled = scheduleDuringIdle(async () => {
        cancelScheduled = null;
        if (disposed || preparationInFlight) return;
        attemptedBuildId = buildId;
        preparationInFlight = true;
        publishStudioOfflineAutomation({
          phase: "preparing",
          message: "오프라인에서도 계속 작업할 수 있도록 필수 편집 도구를 자동으로 준비하고 있습니다.",
        });
        try {
          const report = await prepareLoadedStudioOfflineResources();
          if (disposed) return;
          publishStudioOfflineAutomation({
            phase: report.complete ? "ready" : "partial",
            report,
            message: report.complete
              ? `오프라인 앱 준비가 완료됐습니다. 필수 리소스 ${report.cached}개를 이 기기에서 확인했습니다.`
              : `${report.checked}개 중 ${report.cached}개를 준비했습니다. 누락된 도구는 연결 복구 후 다시 확인합니다.`,
          });
        } catch (cause) {
          if (!disposed) {
            publishStudioOfflineAutomation({
              phase: "error",
              message: cause instanceof Error
                ? cause.message
                : creatorSub2StatusText("studio.creatorSub2.status.offline.runtime.prepareFailed", "오프라인 앱 자동 준비에 실패했습니다. 연결이 복구되면 다시 시도합니다."),
            });
          }
        } finally {
          preparationInFlight = false;
          if (!disposed && retryAfterFlight) {
            retryAfterFlight = false;
            attemptedBuildId = null;
            void inspectAndSchedule(true);
          }
        }
      });
    };
    const retry = (): void => {
      attemptedBuildId = null;
      if (preparationInFlight) {
        retryAfterFlight = true;
        return;
      }
      void inspectAndSchedule(true);
    };
    const pause = (): void => {
      latestInspection += 1;
      cancelScheduled?.();
      cancelScheduled = null;
      attemptedBuildId = null;
    };
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "visible") {
        void inspectAndSchedule(false);
      } else {
        pause();
      }
    };

    window.addEventListener("online", retry);
    window.addEventListener("offline", pause);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    let workers: ServiceWorkerContainer | undefined;
    try {
      workers = navigator.serviceWorker;
      workers?.addEventListener("controllerchange", retry);
    } catch {
      // Restricted frames keep the Studio route usable without the optional runtime.
    }
    void inspectAndSchedule(false);

    return () => {
      disposed = true;
      cancelScheduled?.();
      window.removeEventListener("online", retry);
      window.removeEventListener("offline", pause);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      workers?.removeEventListener("controllerchange", retry);
      stopConnectivity();
    };
  }, []);

  return null;
}
