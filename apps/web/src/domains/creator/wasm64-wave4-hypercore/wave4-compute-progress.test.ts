import { describe, expect, it, vi } from "vitest";

import { buildSmartCiSchedulePlan } from "./ci-smart-shard-scheduler";
import {
  ChunkAuthenticatedAssetStreamVerifier,
  encryptAssetIntoAuthenticatedChunks,
  stepSpatialHashParticles,
  type SpatialParticle3D,
} from "./hybrid-compute-shadow-ink-meshlet";

describe("Wave 4 연산 진행과 필수 검사", () => {
  it("요청한 셀 크기보다 충돌 지름이 큰 입자도 한 번만 분리한다", () => {
    const a: SpatialParticle3D = { x: 0.1, y: 0, z: 0, vx: 0, vy: 0, vz: 0, radius: 1, mass: 1 };
    const b: SpatialParticle3D = { ...a, x: 1.6 };
    expect(stepSpatialHashParticles([a, b], 0, 0.5).resolvedCollisions).toBe(1);
    expect(b.x - a.x).toBeCloseTo(2);
  });

  it("저장 오류 후에는 같은 청크를 재시도하고 저장이 끝나야 다음 청크를 승인한다", async () => {
    const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    const { manifest, chunks } = await encryptAssetIntoAuthenticatedChunks({
      assetId: "chapter-cover", assetBytes: new Uint8Array(500), chunkSizeBytes: 256, aesKey,
    });
    const [first, last] = chunks;
    if (!first || !last) throw new Error("검사에 필요한 두 청크가 없습니다.");
    const write = vi.fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("저장 공간 부족"))
      .mockResolvedValue(undefined);
    const verifier = new ChunkAuthenticatedAssetStreamVerifier(manifest, aesKey, { writeVerifiedChunk: write });

    await expect(verifier.ingestChunk(first)).rejects.toThrow("저장 공간 부족");
    expect((await verifier.ingestChunk(last)).accepted).toBe(false);
    const [retry, complete] = await Promise.all([verifier.ingestChunk(first), verifier.ingestChunk(last)]);
    expect(retry).toMatchObject({ accepted: true, streamCompleted: false });
    expect(complete).toMatchObject({ accepted: true, streamCompleted: true });
    expect(write).toHaveBeenCalledTimes(3);
  });

  it("빈 카탈로그에서도 core와 verify를 실제 선택하고 실행 시간을 합산한다", () => {
    const plan = buildSmartCiSchedulePlan({ changedFiles: [], suites: [], workflowCatalog: [] });
    expect([...plan.selectedWorkflows].sort()).toEqual(["core", "verify"]);
    expect(plan.baselineRunnerMinutes).toBe(10);
    expect(plan.scheduledRunnerMinutes).toBe(10);
  });

  it("사용자 지정 필수 게이트의 실행 시간을 보존하고 빠진 게이트만 더한다", () => {
    const plan = buildSmartCiSchedulePlan({
      changedFiles: ["apps/web/src/app.ts"], suites: [],
      workflowCatalog: [
        { id: "verify", mandatory: false, baselineRunnerMinutes: 2, dependsOnPackages: [] },
        { id: "web-studio-unit", mandatory: false, baselineRunnerMinutes: 3, dependsOnPackages: ["apps/web"] },
      ],
    });
    expect([...plan.selectedWorkflows].sort()).toEqual(["core", "verify", "web-studio-unit"]);
    expect(plan.scheduledRunnerMinutes).toBe(9.5);
    expect(plan.skippedWorkflows).toEqual([]);
  });
});
