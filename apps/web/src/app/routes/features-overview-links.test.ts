import { matchRoutes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { FEATURE_OVERVIEW_CATEGORIES } from "@/domains/marketing/features-overview-data";

import { appRoutes } from "./groups/app-routes";

/**
 * `/features` 요약 카탈로그의 모든 항목 링크가 등록된 실제 라우트로
 * 이어지는지 고정한다. hardcoded-link-integrity 가드는 소스 리터럴을
 * 훑는 방식이라, 이 테스트는 카탈로그 데이터 자체를 정본으로 대조한다.
 * (데이터 파일은 domains/marketing 소유라 도메인 테스트에서 app을
 * import할 수 없어, 라우트 대조는 app 레이어인 여기서 한다.)
 */
describe("features overview catalog links", () => {
  it("모든 항목 링크가 등록된 실제 라우트로 연결된다 (404 catch-all 금지)", () => {
    for (const category of FEATURE_OVERVIEW_CATEGORIES) {
      for (const item of category.items) {
        const matched = matchRoutes(appRoutes, item.href)?.at(-1)?.route;
        expect(matched?.id, `${category.id} / ${item.href}`).toBeTruthy();
        expect(matched?.id, `${category.id} / ${item.href}`).not.toBe("not-found");
      }
    }
  });

  it("/features 자체가 공개 라우트로 등록돼 있다", () => {
    const matched = matchRoutes(appRoutes, "/features")?.at(-1)?.route;
    expect(matched?.id).toBe("marketing-features-overview");
  });
});
