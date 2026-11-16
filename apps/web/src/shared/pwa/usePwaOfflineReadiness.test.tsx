// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_OFFLINE_PREPARE_MESSAGE,
  STUDIO_OFFLINE_STATUS_MESSAGE,
  isStudioOfflinePreparationBusyReply,
  type StudioOfflinePreparationReport,
} from "@/shared/lib/studio-offline-protocol";

import { usePwaOfflineReadiness } from "./usePwaOfflineReadiness";

function ReadinessProbe() {
  const { readiness, prepare } = usePwaOfflineReadiness();
  return (
    <div>
      <output data-testid="readiness-state">{readiness}</output>
      <button type="button" onClick={() => { void prepare(); }}>준비 실행</button>
    </div>
  );
}

describe("usePwaOfflineReadiness", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/studio/canvas");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  it("정본 StudioOfflinePreparationReport(complete: true)를 성공(ready)으로 인식한다", async () => {
    const postMessage = vi.fn((data: { type?: string }, transfer: Transferable[]) => {
      const port = transfer[0] as MessagePort | undefined;
      if (data.type === STUDIO_OFFLINE_STATUS_MESSAGE) {
        port?.postMessage({ schema: 1, buildId: "b1", ready: false });
        return;
      }
      if (data.type === STUDIO_OFFLINE_PREPARE_MESSAGE) {
        const report: StudioOfflinePreparationReport = {
          schema: 1,
          buildId: "b1",
          checked: 6,
          cached: 6,
          downloadedBytes: 120,
          missing: [],
          complete: true,
        };
        port?.postMessage(report);
      }
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { controller: { postMessage } },
    });

    render(<ReadinessProbe />);
    await waitFor(() => expect(screen.getByTestId("readiness-state").textContent).toBe("partial"));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "준비 실행" }));
    });
    await waitFor(() => expect(screen.getByTestId("readiness-state").textContent).toBe("ready"));
    expect(isStudioOfflinePreparationBusyReply({ ok: false, error: "offline-preparation-busy" })).toBe(true);
    expect(isStudioOfflinePreparationBusyReply({ ok: false, error: "offline-preparation-failed" })).toBe(false);
  });
});
