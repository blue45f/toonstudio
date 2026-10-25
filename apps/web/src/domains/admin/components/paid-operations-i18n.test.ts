/**
 * paid-operations-i18n.test.ts — 유료 운영 토글 문구의 ko/en 키 패리티 고정.
 * admin-rest-status-i18n-r3c14.test.ts의 대응 패리티 단언과 같은 취지다.
 */
import { describe, expect, it } from "vitest";

import { paidOperationsI18n } from "./paid-operations-i18n";

describe("유료 운영 토글 문구 패리티", () => {
  it("ko/en 키 집합이 일치하고 모든 값이 비어 있지 않다", () => {
    const koKeys = Object.keys(paidOperationsI18n.ko).sort();
    const enKeys = Object.keys(paidOperationsI18n.en).sort();
    expect(koKeys).toEqual(enKeys);
    expect(koKeys.length).toBeGreaterThan(0);
    for (const key of koKeys) {
      expect(paidOperationsI18n.ko[key as keyof typeof paidOperationsI18n.ko].trim()).not.toBe("");
      expect(paidOperationsI18n.en[key as keyof typeof paidOperationsI18n.en].trim()).not.toBe("");
    }
  });
});
