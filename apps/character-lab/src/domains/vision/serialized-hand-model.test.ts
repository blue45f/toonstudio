import { expect, it, vi } from "vitest";

import { serializeHandModel } from "./serialized-hand-model";

import type { HandDetection } from "./vision-ports";

it("사진·연속 입력의 추론을 직렬화하고 dispose 후 대기 호출은 실행하지 않으며 활성 추론 종료 뒤 모델을 한번 닫는다", async () => {
  let resolve!: (hands: readonly HandDetection[]) => void;
  const pending = new Promise<readonly HandDetection[]>((done) => { resolve = done; });
  const detect = vi.fn(() => pending); const dispose = vi.fn();
  const model = serializeHandModel({ key: "handLandmarker", port: { detect }, observedSha256: "ab".repeat(32), pinned: true, bytes: 10, license: "Apache-2.0", delegate: "CPU", dispose });
  const one = model.port.detect({} as ImageData);
  const two = model.port.detect({} as ImageData);
  const rejected = expect(two).rejects.toMatchObject({ code: "vision-model-disposed" });
  await vi.waitFor(() => expect(detect).toHaveBeenCalledTimes(1));
  model.dispose(); model.dispose();
  expect(dispose).not.toHaveBeenCalled();
  resolve([]); await one; await rejected;
  expect(detect).toHaveBeenCalledTimes(1); expect(dispose).toHaveBeenCalledTimes(1);
});
