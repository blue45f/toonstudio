import { describe, expect, it } from "vitest";

import { evaluate3dSellerAssetFit, evaluateB2bIpDealReadiness } from "./ip-exchange-fit";

describe("ip-exchange-fit", () => {
  it("B2B IP 딜 준비도와 권리 BOM 차단 상태를 판정한다", () => {
    const ready = evaluateB2bIpDealReadiness({
      id: "ip-1",
      title: "서울 옥상 연대기",
      genre: "현대판타지",
      medium: "animation",
      episodesReady: 24,
      rightsBomCleared: true,
      hasPilotCutPack: true,
      hasStoryBible: true,
      creatorRoyaltyPercent: 15,
      targetMgKrw: 80_000_000,
    });
    expect(ready.status).toBe("deal-ready");
    expect(ready.readinessScore).toBe(100);

    const blocked = evaluateB2bIpDealReadiness({
      id: "ip-2",
      title: "미검증 원고",
      genre: "일상",
      medium: "local-tourism",
      episodesReady: 12,
      rightsBomCleared: false,
      hasPilotCutPack: true,
      hasStoryBible: true,
      creatorRoyaltyPercent: 20,
      targetMgKrw: 20_000_000,
    });
    expect(blocked.status).toBe("blocked");
  });

  it("3D 셀러 배경 리소스의 1m 스냅·토폴로지·Rights BOM 적합도를 계산한다", () => {
    const fit = evaluate3dSellerAssetFit({
      assetId: "asset-skp-1",
      title: "모던 한옥 골목 모듈 세트",
      format: "skp",
      modularSnap1m: true,
      manifoldClean: true,
      commercialBomCleared: true,
      autoRoyaltyPercent: 12,
    });
    expect(fit.fitScore).toBe(100);
    expect(fit.tone).toBe("good");
    expect(fit.notesKo[0]).toContain("OpenSKP");
  });
});
