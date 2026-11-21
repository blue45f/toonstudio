import assert from "node:assert/strict";

import { evaluateSlateDdFromJson } from "./evaluate-ip-slate-dd-cli.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

test("evaluateSlateDdFromJson allocates capital across clean titles and excludes CC-BY-NC submissions", () => {
  const input = {
    fundName: "CLI IP 1호 펀드",
    targetSlateBudgetKrw: 10_000_000,
    maxSingleTitleConcentrationPercent: 50,
    submissions: [
      {
        submissionId: "S1",
        seriesTitle: "작품 A",
        episodeCount: 3,
        proposedEpisodeFeeKrw: 2_000_000,
        pack: { rightsBom: [{ assetLabel: "CC0 조명", license: "CC0" }] },
      },
      {
        submissionId: "S2",
        seriesTitle: "작품 B",
        episodeCount: 3,
        proposedEpisodeFeeKrw: 2_000_000,
        pack: { rightsBom: [{ assetLabel: "MIT 식자", license: "MIT" }] },
      },
      {
        submissionId: "S3",
        seriesTitle: "비상업 포함작",
        episodeCount: 3,
        proposedEpisodeFeeKrw: 2_000_000,
        pack: { rightsBom: [{ assetLabel: "NC 소품", license: "CC-BY-NC" }] },
      },
    ],
  };

  const res = evaluateSlateDdFromJson(JSON.stringify(input));
  assert.equal(res.ok, true);
  assert.equal(res.decision, "investable");
  assert.equal(res.rightsBlockedCount, 1);
  assert.equal(res.totalAllocatedCapitalKrw, 10_000_000);
  assert.equal(res.allocations.length, 2);
});
