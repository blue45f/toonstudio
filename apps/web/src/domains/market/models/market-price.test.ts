import { describe, expect, it } from "vitest";

import { formatMarketPriceKrw, resolveMarketCardPrice } from "./market-price";

describe("resolveMarketCardPrice (P-4: 카드에 가격 표시)", () => {
  it("무료 운영이면 표준 가격이 있어도 무료다", () => {
    expect(resolveMarketCardPrice({ isPaidMode: false, defaultPriceKrw: 4900 })).toEqual({
      kind: "free",
      label: "무료",
      caption: null,
    });
    expect(resolveMarketCardPrice({ isPaidMode: false })).toEqual({
      kind: "free",
      label: "무료",
      caption: null,
    });
  });

  it("유료 운영이면 표준 가격을 캡션과 함께 표시한다 (확정가로 단정하지 않음)", () => {
    expect(resolveMarketCardPrice({ isPaidMode: true, defaultPriceKrw: 4900 })).toEqual({
      kind: "paid",
      label: "4,900원",
      caption: "표준 가격",
    });
  });

  it("유료 운영인데 가격이 미확정이면 금액을 지어내지 않고 유료라고만 한다", () => {
    for (const bad of [null, undefined, 0, -100, Number.NaN, 4900.5]) {
      expect(resolveMarketCardPrice({ isPaidMode: true, defaultPriceKrw: bad }).kind).toBe(
        "paid-unknown",
      );
      expect(resolveMarketCardPrice({ isPaidMode: true, defaultPriceKrw: bad }).label).toBe("유료");
    }
  });
});

describe("formatMarketPriceKrw", () => {
  it("천 단위 구분과 원 단위를 붙인다", () => {
    expect(formatMarketPriceKrw(4900)).toBe("4,900원");
    expect(formatMarketPriceKrw(1000000)).toBe("1,000,000원");
    expect(formatMarketPriceKrw(0)).toBe("0원");
  });
});
