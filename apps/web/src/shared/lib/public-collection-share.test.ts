import { describe, expect, it } from "vitest";

import {
  FIVE_READ_STATES,
  FIVE_READ_STATE_LABELS,
  buildPublicCollectionShareDescriptor,
} from "./public-collection-share";

describe("public-collection-share (AC-013)", () => {
  it("보류(hiatus)를 포함한 5종 읽기 상태와 한/영 라벨을 제공한다", () => {
    expect(FIVE_READ_STATES).toEqual(["want", "reading", "done", "hiatus", "dropped"]);
    expect(FIVE_READ_STATE_LABELS.hiatus.ko).toBe("잠시 보류");
  });

  it("컬렉션 이름과 ID로부터 결정적인 공개 공유 URL과 OG 메타를 생성한다", () => {
    const share = buildPublicCollectionShareDescriptor({
      id: "col_abc12345",
      name: "밤샘 정주행 명작선",
      curatorName: "지민",
      titleCount: 12,
    });
    expect(share.sharePath).toContain("/collections/");
    expect(share.shareUrl).toMatch(/^https:\/\/www\.toonstudio\.cloud\/collections\//);
    expect(share.ogTitle).toContain("밤샘 정주행 명작선");
    expect(share.ogDescription).toContain("12편");
  });
});
