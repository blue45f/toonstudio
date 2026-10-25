import { describe, expect, it } from "vitest";

import {
  getAdminAdvancedCopy,
  getAdminRevenueCopy,
  getAdminShellCopy,
} from "./admin-copy";

describe("admin console bilingual copy dictionaries", () => {
  it("resolves Korean and English advanced copy with matching top-level sections", () => {
    const ko = getAdminAdvancedCopy("ko-KR");
    const en = getAdminAdvancedCopy("en-US");
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort());
    expect(ko.dashboard.actionCenterTitle).toBe("운영 액션 센터");
    expect(en.dashboard.actionCenterTitle).toBe("Operations action center");
  });

  it("resolves shell and revenue copy for Korean and non-Korean locales", () => {
    expect(getAdminShellCopy("ko").breadcrumbRoot).toBe("관리자");
    expect(getAdminShellCopy("en").breadcrumbRoot).toBe("Admin");
    expect(getAdminRevenueCopy("ko-KR").markPaid).toBe("지급 완료 처리");
    expect(getAdminRevenueCopy("ja-JP").markPaid).toBe("Mark paid");
  });
});
