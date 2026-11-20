import assert from "node:assert/strict";
import test from "node:test";

import { verifyIpMarketplaceSettlementJson } from "./verify-ip-marketplace-cli.mjs";

test("verifyIpMarketplaceSettlementJson passes 1-won exact waterfall and rejects mismatch", () => {
  assert.equal(
    verifyIpMarketplaceSettlementJson(
      JSON.stringify({
        totalGrossRevenueKrw: 70_000_000,
        advanceRecoupedKrw: 20_000_000,
        creatorPayoutKrw: 30_000_000,
        studioShareKrw: 20_000_000,
      }),
    ).ok,
    true,
  );
  assert.equal(
    verifyIpMarketplaceSettlementJson(
      JSON.stringify({
        totalGrossRevenueKrw: 70_000_000,
        advanceRecoupedKrw: 20_000_000,
        creatorPayoutKrw: 30_000_000,
        studioShareKrw: 19_999_999,
      }),
    ).ok,
    false,
  );
});
