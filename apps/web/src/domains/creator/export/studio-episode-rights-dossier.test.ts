import { describe, expect, it } from "vitest";

import {
  BUILTIN_STUDIO_WORKFLOW_PACKS,
  type StudioWorkflowPack,
} from "../assistant/studio-workflow-pack";
import { generateWorkflowPackRightsReceipt } from "../assistant/studio-workflow-pack-rights-receipt";

import {
  buildEpisodeRightsDossier,
  formatEpisodeRightsDossierMarkdown,
} from "./studio-episode-rights-dossier";

describe("studio-episode-rights-dossier", () => {
  it("aggregates multiple episode receipts into a deterministic IP due-diligence dossier", () => {
    const cleanPack = BUILTIN_STUDIO_WORKFLOW_PACKS[0];
    const blockedPack: StudioWorkflowPack = {
      ...BUILTIN_STUDIO_WORKFLOW_PACKS[1],
      id: "ep02-blocked",
      name: "2화 비상업 포함 팩",
      rightsBom: [
        { assetLabel: "궁전 복도 파라메트릭 3D 조명 프리셋", license: "CC0" },
        { assetLabel: "외부 비상업 소품", license: "CC-BY-NC" },
      ],
    };

    const ep1Receipt = generateWorkflowPackRightsReceipt(cleanPack, "2026-11-19T10:00:00.000Z");
    const ep2Receipt = generateWorkflowPackRightsReceipt(blockedPack, "2026-11-19T11:00:00.000Z");

    const dossier = buildEpisodeRightsDossier(
      "황녀의 검과 3D 궁전",
      [
        { episodeLabel: "1화", receipt: ep1Receipt },
        { episodeLabel: "2화", receipt: ep2Receipt },
      ],
      "2026-11-19T12:00:00.000Z",
    );

    expect(dossier.totalEpisodes).toBe(2);
    expect(dossier.clearedEpisodes).toBe(1);
    expect(dossier.blockedEpisodes).toBe(1);
    expect(dossier.commercialReadinessPercent).toBe(50);
    expect(dossier.allEpisodesCleared).toBe(false);
    expect(dossier.dossierHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);

    const sharedAsset = dossier.masterAssetLedger.find(
      (a) => a.assetLabel === "궁전 복도 파라메트릭 3D 조명 프리셋",
    );
    expect(sharedAsset?.episodeCount).toBe(2);

    const md = formatEpisodeRightsDossierMarkdown(dossier);
    expect(md).toContain("황녀의 검과 3D 궁전");
    expect(md).toContain("BLOCKED (CC-BY-NC)");
    expect(md).toContain(dossier.dossierHash);
  });
});
