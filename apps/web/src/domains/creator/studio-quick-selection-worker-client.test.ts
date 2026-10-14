import { describe, expect, it, vi } from "vitest";

import { quickSelectionRegionFromRaster } from "./studio-quick-selection";
import {
  runStudioQuickSelectionWorker,
  type StudioQuickSelectionWorkerLike,
} from "./studio-quick-selection-worker-client";
import type {
  StudioQuickSelectionWorkerResponseMessage,
  StudioQuickSelectionWorkerRunMessage,
} from "./studio-quick-selection-worker-protocol";

function request() {
  const w = 4;
  const h = 2;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let index = 0; index < w * h; index += 1) {
    data[index * 4] = 200;
    data[index * 4 + 1] = 40;
    data[index * 4 + 2] = 40;
    data[index * 4 + 3] = 255;
  }
  return { data, w, h, seeds: [{ x: 1, y: 1, radius: 1 }], tolerance: 0.18 };
}

class ControlledWorker implements StudioQuickSelectionWorkerLike {
  onmessage: StudioQuickSelectionWorkerLike["onmessage"] = null;
  onerror: StudioQuickSelectionWorkerLike["onerror"] = null;
  message: StudioQuickSelectionWorkerRunMessage | null = null;
  terminateCount = 0;

  postMessage(message: StudioQuickSelectionWorkerRunMessage): void {
    this.message = message;
  }

  terminate(): void {
    this.terminateCount += 1;
  }

  ready(): void {
    this.onmessage?.({
      data: { type: "studio-quick-selection/ready", version: 1 },
    } as MessageEvent<StudioQuickSelectionWorkerResponseMessage>);
  }

  succeed(): void {
    const req = this.message!.request;
    const { region, selectedCount, bounds } = quickSelectionRegionFromRaster(
      { width: req.w, height: req.h, data: req.data },
      req.seeds,
      { tolerance: req.tolerance },
    );
    this.onmessage?.({
      data: { type: "studio-quick-selection/success", version: 1, region, selectedCount, bounds },
    } as MessageEvent<StudioQuickSelectionWorkerResponseMessage>);
  }
}

describe("runStudioQuickSelectionWorker", () => {
  it("runs direct only when it was explicitly selected before work", async () => {
    const input = request();
    const factory = vi.fn(() => null);
    const expected = quickSelectionRegionFromRaster(
      { width: input.w, height: input.h, data: input.data },
      input.seeds,
      { tolerance: input.tolerance },
    );

    await expect(runStudioQuickSelectionWorker(input, {
      executionMode: "direct",
      workerFactory: factory,
    })).resolves.toEqual({ execution: "direct", ...expected });
    expect(factory).not.toHaveBeenCalled();
  });

  it("posts the request only after the worker ready handshake and resolves with the region", async () => {
    const worker = new ControlledWorker();
    const promise = runStudioQuickSelectionWorker(request(), {
      workerFactory: () => worker,
    });
    expect(worker.message).toBeNull();
    worker.ready();
    expect(worker.message?.type).toBe("studio-quick-selection/run");
    expect(worker.message?.request.seeds).toEqual([{ x: 1, y: 1, radius: 1 }]);
    worker.succeed();
    const result = await promise;
    expect(result.execution).toBe("worker");
    expect(result.selectedCount).toBe(8);
    expect(result.region.outer.length).toBeGreaterThanOrEqual(4);
    expect(worker.terminateCount).toBe(1);
  });

  it("rejects as unavailable when the factory returns null in worker mode", async () => {
    await expect(runStudioQuickSelectionWorker(request(), {
      workerFactory: () => null,
    })).rejects.toMatchObject({ name: "StudioQuickSelectionWorkerUnavailableError" });
  });
});
