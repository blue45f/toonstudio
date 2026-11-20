import assert from "node:assert/strict";
import test from "node:test";

import { simulateEpisodeSettlementFromPackJson } from "./simulate-episode-settlement-cli.mjs";

test("simulateEpisodeSettlementFromPackJson computes exact 1-won payouts and blocks CC-BY-NC packs", () => {
  const cleanPack = {
    schemaVersion: 2,
    id: "rofan-ep1",
    name: "로판 1화 팩",
    rightsBom: [{ assetLabel: "CC0 궁전 조명", license: "CC0" }],
  };

  const pass = simulateEpisodeSettlementFromPackJson(JSON.stringify(cleanPack), {
    episodeFeeKrw: 2_000_000,
    episodeCount: 3,
    platformFeeBps: 500,
  });
  assert.equal(pass.ok, true);
  assert.equal(pass.status, "ready-for-release");
  assert.equal(pass.netDistributableKrw, 1_900_000);
  assert.equal(pass.approvedAdvanceLimitKrw, 6_000_000);
  assert.equal(
    pass.payouts.reduce((sum, p) => sum + p.payoutKrw, 0),
    pass.netDistributableKrw,
  );

  const blockedPack = {
    ...cleanPack,
    rightsBom: [{ assetLabel: "비상업 소품", license: "CC-BY-NC" }],
  };
  const held = simulateEpisodeSettlementFromPackJson(JSON.stringify(blockedPack));
  assert.equal(held.ok, false);
  assert.equal(held.status, "held");
  assert.equal(held.approvedAdvanceLimitKrw, 0);
});
