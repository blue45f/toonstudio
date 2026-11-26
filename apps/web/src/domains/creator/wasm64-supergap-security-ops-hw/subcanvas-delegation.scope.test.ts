import { describe, expect, it } from "vitest";

import {
  SubCanvasDelegationManager,
  type MasterCanvasDocument,
} from "./subcanvas-delegation";

const encode = (value: string) => new TextEncoder().encode(value);

function createDocument(workId: string, episodeId: string): MasterCanvasDocument {
  return {
    workId,
    episodeId,
    cuts: [{
      cutId: "cut-01",
      layers: [{
        layerId: "flatting",
        name: "밑색",
        role: "flatting",
        contentBytes: encode(`${workId}/${episodeId}:원본`),
      }],
    }],
  };
}

describe("서브캔버스 위임의 작품·에피소드 경계", () => {
  it.each([
    ["work-other", "episode-01"],
    ["work-original", "episode-02"],
    ["work-other", "episode-02"],
  ])("동일 컷·레이어 ID를 가진 다른 문서 %s/%s는 변경·정산하지 않는다", async (workId, episodeId) => {
    const manager = new SubCanvasDelegationManager();
    const original = createDocument("work-original", "episode-01");
    const target = createDocument(workId, episodeId);
    const targetSnapshot = structuredClone(target);
    const issued = await manager.createDelegationPackage(original, {
      delegationId: "delegation-scoped-document",
      assistantId: "assistant-fixture",
      assistantDisplayName: "테스트 어시스턴트",
      allowedCutIds: ["cut-01"],
      allowedLayerIdsByCut: { "cut-01": ["flatting"] },
      expiresAtMs: 10_000,
      rates: { hourlyRateKrw: 12_000, perLayerBonusKrw: 1_000 },
      nowMs: 1_000,
    });
    const submission = await manager.createAssistantSubmission(
      issued.encryptedPackage,
      issued.sessionKey32,
      [{
        cutId: "cut-01",
        layerId: "flatting",
        stage: "flatting",
        updatedBytes: encode("완료한 밑색"),
        strokeCount: 12,
        activeMinutes: 15,
        startedAtIso: "2026-11-27T10:00:00.000Z",
        endedAtIso: "2026-11-27T10:15:00.000Z",
      }],
      2_000,
    );

    const rejected = await manager.verifyAndMergeSubmission(
      target, issued.encryptedPackage.delegationId, submission, issued.sessionKey32, 3_000,
    );
    expect(rejected.merged).toBe(false);
    expect(rejected.violations.map(({ code }) => code)).toEqual(["OUT_OF_SCOPE_DOCUMENT"]);
    expect(rejected.mergedDocument).toBe(target);
    expect(target).toEqual(targetSnapshot);
    expect(rejected.settlementBom).toBeNull();

    // 잘못된 대상에 대한 거부가 정당한 원본 문서의 위임까지 소모하지 않는다.
    const accepted = await manager.verifyAndMergeSubmission(
      original, issued.encryptedPackage.delegationId, submission, issued.sessionKey32, 3_000,
    );
    expect(accepted.merged).toBe(true);
    expect(accepted.violations).toEqual([]);
    expect(accepted.mergedDocument.cuts[0]?.layers[0]?.contentBytes).toEqual(encode("완료한 밑색"));
    expect(original.cuts[0]?.layers[0]?.contentBytes).toEqual(encode("work-original/episode-01:원본"));
    expect(accepted.settlementBom).toMatchObject({
      workId: original.workId,
      episodeId: original.episodeId,
      modifiedLayerCount: 1,
      totalSettlementKrw: 4_000,
    });
  });
});
