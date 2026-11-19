import { describe, expect, it } from "vitest";

import {
  GOODS_SKU_CATALOG,
  MULTI_FORMAT_DISTRIBUTION_SPECS,
  compileSourceTextToPilot3Cut,
  evaluateOfflineQrGoodsKit,
} from "./studio-multiformat-ip-kit";

describe("studio-multiformat-ip-kit", () => {
  it("원천 텍스트를 3컷 파일럿 콘티로 구조화하고 45자 말풍선 호흡을 점검한다", () => {
    expect(MULTI_FORMAT_DISTRIBUTION_SPECS.length).toBe(6);
    const shortPlan = compileSourceTextToPilot3Cut(
      "바다 마을 전설",
      "오래된 등대 불빛이 갑자기 꺼졌다. 소년은 바닷가에서 낡은 나침반을 주웠다. 나침반 바늘이 바다 밑을 가리켰다.",
    );
    expect(shortPlan.cuts).toHaveLength(3);
    expect(shortPlan.pacingPass).toBe(true);
    expect(shortPlan.cuts[0].dialogueLineKo).toContain("등대");

    const longPlan = compileSourceTextToPilot3Cut(
      "긴 대사 테스트",
      "이 문장은 웹툰 모바일 375px 말풍선 권장 최대 글자 수인 사십오자를 훨씬 넘겨서 호흡 경고가 반드시 발생해야 하는 긴 예시 문장입니다.",
    );
    expect(longPlan.pacingPass).toBe(false);
    expect(longPlan.cuts[0].overBalloonLimit).toBe(true);
  });

  it("오프라인 QR 굿즈 BOM 단가·마진·권리 차단 조건을 정확히 계산한다", () => {
    expect(GOODS_SKU_CATALOG.length).toBe(4);
    const ready = evaluateOfflineQrGoodsKit({
      skuId: "emotion-checkin-kit",
      quantity: 200,
      unitPriceKrw: 18_000,
      includeQrStampCard: true,
      rightsBomCleared: true,
    });
    expect(ready.printReady).toBe(true);
    expect(ready.marginPercent).toBeGreaterThan(70);
    expect(ready.qrFlowSummaryKo).toContain("QR 스캔");

    const blocked = evaluateOfflineQrGoodsKit({
      skuId: "acrylic-keyring",
      quantity: 50,
      unitPriceKrw: 8_000,
      includeQrStampCard: false,
      rightsBomCleared: false,
    });
    expect(blocked.printReady).toBe(false);
    expect(blocked.blockersKo[0]).toContain("권리 BOM");
  });
});
